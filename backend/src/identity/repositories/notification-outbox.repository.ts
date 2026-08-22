/**
 * Notification Outbox Repository
 * 
 * Implements transactional outbox pattern for reliable message delivery.
 * Messages are inserted in the same transaction as business logic,
 * then processed asynchronously by a worker.
 * 
 * Supports SMS, email, push notifications, and webhooks.
 */

import { Pool, PoolClient } from 'pg';
import { logger } from '../../utils/logger.js';

export type OutboxChannel = 'sms' | 'email' | 'push' | 'webhook';

export type OutboxStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'expired' | 'cancelled';

export interface NotificationOutboxMessage {
  id: string;
  tenantId: string | null;
  channel: OutboxChannel;
  template: string;
  recipient: string;
  payload: Record<string, any>;
  metadata: Record<string, any>;
  idempotencyKey: string;
  status: OutboxStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  provider: string | null;
  providerMessageId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  retryable: boolean;
  createdAt: Date;
  sentAt: Date | null;
  expiresAt: Date | null;
  sensitivePayloadCleared: boolean;
}

export interface EnqueueMessageParams {
  tenantId?: string;
  channel: OutboxChannel;
  template: string;
  recipient: string;
  payload: Record<string, any>;
  metadata?: Record<string, any>;
  idempotencyKey: string;
  maxAttempts?: number;
  expiresAt?: Date;
}

export class NotificationOutboxRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Enqueue message for delivery
   * Should be called within a transaction to ensure consistency
   */
  async enqueue(
    params: EnqueueMessageParams,
    client?: PoolClient
  ): Promise<NotificationOutboxMessage> {
    const db = client || this.pool;

    try {
      const result = await db.query(
        `INSERT INTO notification_outbox (
          tenant_id, channel, template, recipient,
          payload, metadata, idempotency_key,
          max_attempts, expires_at,
          status, next_attempt_at
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7,
          $8, $9,
          'pending', NOW()
        ) RETURNING *`,
        [
          params.tenantId || null,
          params.channel,
          params.template,
          params.recipient,
          JSON.stringify(params.payload),
          JSON.stringify(params.metadata || {}),
          params.idempotencyKey,
          params.maxAttempts || 5,
          params.expiresAt || null,
        ]
      );

      const message = this.mapRow(result.rows[0]);

      logger.info('Message enqueued in notification outbox', {
        messageId: message.id,
        channel: message.channel,
        template: message.template,
        idempotencyKey: message.idempotencyKey,
      });

      return message;
    } catch (error: any) {
      // Handle duplicate idempotency key
      if (error.code === '23505') {
        logger.warn('Duplicate idempotency key, returning existing message', {
          idempotencyKey: params.idempotencyKey,
        });

        // Return existing message
        const existing = await db.query(
          `SELECT * FROM notification_outbox WHERE idempotency_key = $1`,
          [params.idempotencyKey]
        );

        return this.mapRow(existing.rows[0]);
      }

      throw error;
    }
  }

  /**
   * Get pending messages ready for processing
   * Uses FOR UPDATE SKIP LOCKED to avoid contention between workers
   */
  async getPendingMessages(
    limit: number = 100,
    client?: PoolClient
  ): Promise<NotificationOutboxMessage[]> {
    const db = client || this.pool;

    const result = await db.query(
      `SELECT * FROM notification_outbox
       WHERE status = 'pending'
         AND next_attempt_at <= NOW()
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY next_attempt_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Mark message as processing
   */
  async markProcessing(
    messageId: string,
    client?: PoolClient
  ): Promise<void> {
    const db = client || this.pool;

    await db.query(
      `UPDATE notification_outbox
       SET status = 'processing',
           attempt_count = attempt_count + 1
       WHERE id = $1`,
      [messageId]
    );
  }

  /**
   * Mark message as sent
   */
  async markSent(
    messageId: string,
    provider: string,
    providerMessageId: string,
    client?: PoolClient
  ): Promise<void> {
    const db = client || this.pool;

    await db.query(
      `UPDATE notification_outbox
       SET status = 'sent',
           provider = $2,
           provider_message_id = $3,
           sent_at = NOW()
       WHERE id = $1`,
      [messageId, provider, providerMessageId]
    );

    logger.info('Notification sent successfully', {
      messageId,
      provider,
      providerMessageId,
    });
  }

  /**
   * Mark message as failed and schedule retry
   */
  async markFailed(
    messageId: string,
    errorCode: string,
    errorMessage: string,
    retryable: boolean,
    retryDelaySeconds: number = 60,
    client?: PoolClient
  ): Promise<void> {
    const db = client || this.pool;

    // Get current attempt count
    const current = await db.query(
      `SELECT attempt_count, max_attempts FROM notification_outbox WHERE id = $1`,
      [messageId]
    );

    if (current.rows.length === 0) {
      return;
    }

    const { attempt_count, max_attempts } = current.rows[0];

    // Determine if we should retry
    const shouldRetry = retryable && attempt_count < max_attempts;
    const newStatus = shouldRetry ? 'pending' : 'failed';
    const nextAttemptAt = shouldRetry
      ? new Date(Date.now() + retryDelaySeconds * 1000)
      : null;

    await db.query(
      `UPDATE notification_outbox
       SET status = $2,
           last_error_code = $3,
           last_error_message = $4,
           retryable = $5,
           next_attempt_at = COALESCE($6, next_attempt_at)
       WHERE id = $1`,
      [messageId, newStatus, errorCode, errorMessage, retryable, nextAttemptAt]
    );

    if (shouldRetry) {
      logger.warn('Notification failed, will retry', {
        messageId,
        errorCode,
        attemptCount: attempt_count,
        maxAttempts: max_attempts,
        retryDelaySeconds,
      });
    } else {
      logger.error('Notification permanently failed', {
        messageId,
        errorCode,
        errorMessage,
        attemptCount: attempt_count,
      });
    }
  }

  /**
   * Clear sensitive payload (e.g., encrypted OTP after delivery)
   */
  async clearSensitivePayload(
    messageId: string,
    client?: PoolClient
  ): Promise<void> {
    const db = client || this.pool;

    await db.query(
      `UPDATE notification_outbox
       SET payload = '{}'::jsonb,
           sensitive_payload_cleared = true
       WHERE id = $1`,
      [messageId]
    );

    logger.debug('Sensitive payload cleared from outbox', { messageId });
  }

  /**
   * Mark message as expired
   */
  async markExpired(
    messageId: string,
    client?: PoolClient
  ): Promise<void> {
    const db = client || this.pool;

    await db.query(
      `UPDATE notification_outbox
       SET status = 'expired'
       WHERE id = $1`,
      [messageId]
    );

    logger.info('Notification message expired', { messageId });
  }

  /**
   * Mark message as cancelled
   */
  async markCancelled(
    messageId: string,
    client?: PoolClient
  ): Promise<void> {
    const db = client || this.pool;

    await db.query(
      `UPDATE notification_outbox
       SET status = 'cancelled'
       WHERE id = $1`,
      [messageId]
    );
  }

  /**
   * Cancel pending messages by idempotency key prefix (for superseding)
   */
  async cancelByIdempotencyPrefix(
    prefix: string,
    client?: PoolClient
  ): Promise<number> {
    const db = client || this.pool;

    const result = await db.query(
      `UPDATE notification_outbox
       SET status = 'cancelled'
       WHERE idempotency_key LIKE $1
         AND status = 'pending'`,
      [`${prefix}%`]
    );

    const cancelledCount = result.rowCount || 0;

    if (cancelledCount > 0) {
      logger.info('Cancelled pending notifications', {
        prefix,
        count: cancelledCount,
      });
    }

    return cancelledCount;
  }

  /**
   * Get message by ID
   */
  async findById(
    messageId: string,
    client?: PoolClient
  ): Promise<NotificationOutboxMessage | null> {
    const db = client || this.pool;

    const result = await db.query(
      `SELECT * FROM notification_outbox WHERE id = $1`,
      [messageId]
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Get message by idempotency key
   */
  async findByIdempotencyKey(
    idempotencyKey: string,
    client?: PoolClient
  ): Promise<NotificationOutboxMessage | null> {
    const db = client || this.pool;

    const result = await db.query(
      `SELECT * FROM notification_outbox WHERE idempotency_key = $1`,
      [idempotencyKey]
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Mark expired messages (background job)
   */
  async markExpiredMessages(): Promise<number> {
    const result = await this.pool.query(
      `UPDATE notification_outbox
       SET status = 'expired'
       WHERE status IN ('pending', 'processing')
         AND expires_at IS NOT NULL
         AND expires_at <= NOW()`
    );

    const expiredCount = result.rowCount || 0;

    if (expiredCount > 0) {
      logger.info('Marked expired notification messages', {
        count: expiredCount,
      });
    }

    return expiredCount;
  }

  /**
   * Reset stuck processing messages (background job)
   * Messages stuck in 'processing' for too long are reset to 'pending'
   */
  async resetStuckMessages(stuckThresholdMinutes: number = 10): Promise<number> {
    const result = await this.pool.query(
      `UPDATE notification_outbox
       SET status = 'pending',
           next_attempt_at = NOW()
       WHERE status = 'processing'
         AND attempt_count < max_attempts
         AND (
           SELECT updated_at FROM notification_outbox n2 
           WHERE n2.id = notification_outbox.id
         ) < NOW() - INTERVAL '${stuckThresholdMinutes} minutes'`
    );

    const resetCount = result.rowCount || 0;

    if (resetCount > 0) {
      logger.warn('Reset stuck processing messages', {
        count: resetCount,
        stuckThresholdMinutes,
      });
    }

    return resetCount;
  }

  /**
   * Delete old messages (cleanup job)
   */
  async deleteOldMessages(daysOld: number = 7): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM notification_outbox
       WHERE created_at < NOW() - INTERVAL '${daysOld} days'
         AND status IN ('sent', 'failed', 'expired', 'cancelled')
         AND sensitive_payload_cleared = true`
    );

    const deletedCount = result.rowCount || 0;

    if (deletedCount > 0) {
      logger.info('Deleted old notification messages', {
        count: deletedCount,
        daysOld,
      });
    }

    return deletedCount;
  }

  /**
   * Get statistics by channel and status
   */
  async getStats(since?: Date): Promise<Record<string, any>> {
    const sinceClause = since
      ? `WHERE created_at >= $1`
      : '';

    const params = since ? [since] : [];

    const result = await this.pool.query(
      `SELECT 
         channel,
         status,
         COUNT(*) as count,
         AVG(attempt_count) as avg_attempts
       FROM notification_outbox
       ${sinceClause}
       GROUP BY channel, status
       ORDER BY channel, status`,
      params
    );

    return result.rows.reduce((acc, row) => {
      const key = `${row.channel}_${row.status}`;
      acc[key] = {
        count: parseInt(row.count),
        avgAttempts: parseFloat(row.avg_attempts),
      };
      return acc;
    }, {} as Record<string, any>);
  }

  /**
   * Map database row to NotificationOutboxMessage
   */
  private mapRow(row: any): NotificationOutboxMessage {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      channel: row.channel,
      template: row.template,
      recipient: row.recipient,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      idempotencyKey: row.idempotency_key,
      status: row.status,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      nextAttemptAt: new Date(row.next_attempt_at),
      provider: row.provider,
      providerMessageId: row.provider_message_id,
      lastErrorCode: row.last_error_code,
      lastErrorMessage: row.last_error_message,
      retryable: row.retryable,
      createdAt: new Date(row.created_at),
      sentAt: row.sent_at ? new Date(row.sent_at) : null,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      sensitivePayloadCleared: row.sensitive_payload_cleared,
    };
  }
}
