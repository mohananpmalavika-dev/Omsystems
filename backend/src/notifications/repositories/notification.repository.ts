/**
 * Notification Repository
 * 
 * Database operations for the notification system using PostgreSQL.
 * Implements the transactional outbox pattern with SKIP LOCKED for worker coordination.
 */

import { Pool, PoolClient } from 'pg';
import {
  Notification,
  NotificationDelivery,
  NotificationDeliveryAttempt,
  NotificationJob,
  NotificationPolicy,
  NotificationPreferences,
  UserPushDevice,
  INotificationRepository,
  NotificationStatus
} from '../notification.types.js';
import { logger } from '../../utils/logger.js';

export class NotificationRepository implements INotificationRepository {
  constructor(private pool: Pool) {}

  // =====================================================
  // Notification Operations
  // =====================================================

  async createNotification(
    notification: Omit<Notification, 'id' | 'createdAt'>,
    tx?: PoolClient
  ): Promise<Notification> {
    const client = tx || this.pool;
    
    const result = await client.query(
      `INSERT INTO notifications (
        tenant_id,
        type,
        source_type,
        source_id,
        title,
        body,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        notification.tenantId,
        notification.type,
        notification.sourceType,
        notification.sourceId,
        notification.title,
        notification.body,
        JSON.stringify(notification.metadata || {})
      ]
    );

    return this.mapNotification(result.rows[0]);
  }

  async findNotification(
    id: string,
    tenantId: string
  ): Promise<Notification | null> {
    const result = await this.pool.query(
      `SELECT * FROM notifications
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    return result.rows[0] ? this.mapNotification(result.rows[0]) : null;
  }

  // =====================================================
  // Delivery Operations
  // =====================================================

  async createDelivery(
    delivery: Omit<NotificationDelivery, 'id' | 'createdAt' | 'attemptCount'>,
    tx?: PoolClient
  ): Promise<NotificationDelivery> {
    const client = tx || this.pool;
    
    try {
      const result = await client.query(
        `INSERT INTO notification_deliveries (
          notification_id,
          tenant_id,
          channel,
          destination,
          subject,
          title,
          body,
          template_id,
          template_data,
          metadata,
          priority,
          status,
          idempotency_key,
          max_attempts,
          next_attempt_at,
          provider
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
          delivery.notificationId,
          delivery.tenantId,
          delivery.channel,
          delivery.destination,
          delivery.subject,
          delivery.title,
          delivery.body,
          delivery.templateId,
          delivery.templateData ? JSON.stringify(delivery.templateData) : null,
          JSON.stringify(delivery.metadata || {}),
          delivery.priority || 'normal',
          delivery.status || 'pending',
          delivery.idempotencyKey,
          delivery.maxAttempts || 5,
          delivery.nextAttemptAt || new Date(),
          delivery.provider
        ]
      );

      return this.mapDelivery(result.rows[0]);
    } catch (error: any) {
      // Check for idempotency key violation
      if (error.code === '23505' && error.constraint === 'idx_deliveries_idempotency') {
        // Fetch and return existing delivery
        const existing = await client.query(
          `SELECT * FROM notification_deliveries
           WHERE tenant_id = $1 AND idempotency_key = $2 AND channel = $3`,
          [delivery.tenantId, delivery.idempotencyKey, delivery.channel]
        );
        
        if (existing.rows[0]) {
          logger.debug('Idempotency key matched, returning existing delivery', {
            idempotencyKey: delivery.idempotencyKey,
            deliveryId: existing.rows[0].id
          });
          return this.mapDelivery(existing.rows[0]);
        }
      }
      
      throw error;
    }
  }

  async findDelivery(
    id: string,
    tenantId: string
  ): Promise<NotificationDelivery | null> {
    const result = await this.pool.query(
      `SELECT * FROM notification_deliveries
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    return result.rows[0] ? this.mapDelivery(result.rows[0]) : null;
  }

  async findDeliveriesByNotification(
    notificationId: string,
    tenantId: string
  ): Promise<NotificationDelivery[]> {
    const result = await this.pool.query(
      `SELECT * FROM notification_deliveries
       WHERE notification_id = $1 AND tenant_id = $2
       ORDER BY created_at ASC`,
      [notificationId, tenantId]
    );

    return result.rows.map(row => this.mapDelivery(row));
  }

  async updateDeliveryStatus(
    id: string,
    status: NotificationStatus,
    updates: Partial<NotificationDelivery>
  ): Promise<void> {
    const fields: string[] = ['status = $2'];
    const values: any[] = [id, status];
    let paramIndex = 3;

    // Build dynamic update query
    if (updates.providerMessageId !== undefined) {
      fields.push(`provider_message_id = $${paramIndex++}`);
      values.push(updates.providerMessageId);
    }
    if (updates.lastError !== undefined) {
      fields.push(`last_error = $${paramIndex++}`);
      values.push(updates.lastError);
    }
    if (updates.lastErrorCode !== undefined) {
      fields.push(`last_error_code = $${paramIndex++}`);
      values.push(updates.lastErrorCode);
    }
    if (updates.lockedAt !== undefined) {
      fields.push(`locked_at = $${paramIndex++}`);
      values.push(updates.lockedAt);
    }
    if (updates.lockedBy !== undefined) {
      fields.push(`locked_by = $${paramIndex++}`);
      values.push(updates.lockedBy);
    }
    if (updates.nextAttemptAt !== undefined) {
      fields.push(`next_attempt_at = $${paramIndex++}`);
      values.push(updates.nextAttemptAt);
    }

    // Timestamp fields based on status
    switch (status) {
      case 'processing':
        fields.push(`processing_at = NOW()`);
        break;
      case 'accepted':
      case 'delivered':
        fields.push(`sent_at = NOW()`);
        if (status === 'delivered') {
          fields.push(`delivered_at = NOW()`);
        }
        break;
      case 'failed':
        fields.push(`failed_at = NOW()`);
        break;
    }

    await this.pool.query(
      `UPDATE notification_deliveries
       SET ${fields.join(', ')}
       WHERE id = $1`,
      values
    );
  }

  async incrementAttemptCount(
    id: string,
    nextAttemptAt: Date
  ): Promise<void> {
    await this.pool.query(
      `UPDATE notification_deliveries
       SET 
         attempt_count = attempt_count + 1,
         next_attempt_at = $2,
         status = 'retry_wait',
         locked_at = NULL,
         locked_by = NULL
       WHERE id = $1`,
      [id, nextAttemptAt]
    );
  }

  // =====================================================
  // Worker Job Claiming (SKIP LOCKED Pattern)
  // =====================================================

  async claimPendingDeliveries(
    workerId: string,
    batchSize: number
  ): Promise<NotificationJob[]> {
    // Use a transaction to claim jobs atomically
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Find and lock pending/retry jobs using SKIP LOCKED
      const deliveryResult = await client.query(
        `SELECT nd.*, n.type as notification_type, n.title as notification_title
         FROM notification_deliveries nd
         JOIN notifications n ON n.id = nd.notification_id
         WHERE 
           nd.status IN ('pending', 'retry_wait')
           AND nd.next_attempt_at <= NOW()
           AND nd.attempt_count < nd.max_attempts
         ORDER BY 
           nd.priority DESC,
           nd.created_at ASC
         LIMIT $1
         FOR UPDATE OF nd SKIP LOCKED`,
        [batchSize]
      );

      if (deliveryResult.rows.length === 0) {
        await client.query('COMMIT');
        return [];
      }

      // Update claimed jobs to processing status
      const deliveryIds = deliveryResult.rows.map(r => r.id);
      await client.query(
        `UPDATE notification_deliveries
         SET 
           status = 'processing',
           locked_at = NOW(),
           locked_by = $1,
           processing_at = NOW()
         WHERE id = ANY($2)`,
        [workerId, deliveryIds]
      );

      await client.query('COMMIT');

      // Map to job objects
      return deliveryResult.rows.map(row => ({
        delivery: this.mapDelivery(row),
        notification: {
          id: row.notification_id,
          tenantId: row.tenant_id,
          type: row.notification_type,
          sourceType: row.source_type,
          sourceId: row.source_id,
          title: row.notification_title,
          body: row.body,
          metadata: row.metadata || {},
          createdAt: row.created_at
        }
      }));
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error claiming deliveries', { error, workerId });
      throw error;
    } finally {
      client.release();
    }
  }

  async resetStuckDeliveries(timeoutMinutes: number): Promise<number> {
    const result = await this.pool.query(
      `UPDATE notification_deliveries
       SET 
         status = 'pending',
         locked_at = NULL,
         locked_by = NULL,
         next_attempt_at = NOW()
       WHERE 
         status = 'processing'
         AND locked_at < NOW() - INTERVAL '${timeoutMinutes} minutes'
       RETURNING id`,
      []
    );

    const count = result.rowCount || 0;
    
    if (count > 0) {
      logger.warn('Reset stuck deliveries', { count, timeoutMinutes });
    }

    return count;
  }

  // =====================================================
  // Delivery Attempt Operations
  // =====================================================

  async createDeliveryAttempt(
    attempt: Omit<NotificationDeliveryAttempt, 'id'>,
    tx?: PoolClient
  ): Promise<NotificationDeliveryAttempt> {
    const client = tx || this.pool;
    
    const result = await client.query(
      `INSERT INTO notification_delivery_attempts (
        delivery_id,
        attempt_number,
        provider,
        started_at,
        completed_at,
        success,
        response_code,
        provider_message_id,
        error_code,
        error_message,
        duration_ms,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        attempt.deliveryId,
        attempt.attemptNumber,
        attempt.provider,
        attempt.startedAt,
        attempt.completedAt,
        attempt.success,
        attempt.responseCode,
        attempt.providerMessageId,
        attempt.errorCode,
        attempt.errorMessage,
        attempt.durationMs,
        JSON.stringify(attempt.metadata || {})
      ]
    );

    return this.mapDeliveryAttempt(result.rows[0]);
  }

  async getDeliveryAttempts(deliveryId: string): Promise<NotificationDeliveryAttempt[]> {
    const result = await this.pool.query(
      `SELECT * FROM notification_delivery_attempts
       WHERE delivery_id = $1
       ORDER BY attempt_number ASC`,
      [deliveryId]
    );

    return result.rows.map(row => this.mapDeliveryAttempt(row));
  }

  // =====================================================
  // Push Device Operations
  // =====================================================

  async getUserPushDevices(
    userId: string,
    tenantId: string
  ): Promise<UserPushDevice[]> {
    const result = await this.pool.query(
      `SELECT * FROM user_push_devices
       WHERE user_id = $1 AND tenant_id = $2 AND active = true
       ORDER BY last_seen_at DESC`,
      [userId, tenantId]
    );

    return result.rows.map(row => this.mapPushDevice(row));
  }

  async registerPushDevice(
    device: Omit<UserPushDevice, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<UserPushDevice> {
    // Upsert: update if token exists, insert if not
    const result = await this.pool.query(
      `INSERT INTO user_push_devices (
        tenant_id,
        user_id,
        platform,
        push_token,
        active,
        last_seen_at,
        device_info
      ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)
      ON CONFLICT (push_token) WHERE active = true
      DO UPDATE SET
        last_seen_at = NOW(),
        device_info = EXCLUDED.device_info,
        updated_at = NOW()
      RETURNING *`,
      [
        device.tenantId,
        device.userId,
        device.platform,
        device.pushToken,
        device.active,
        JSON.stringify(device.deviceInfo || {})
      ]
    );

    return this.mapPushDevice(result.rows[0]);
  }

  async deactivatePushDevice(token: string): Promise<void> {
    await this.pool.query(
      `UPDATE user_push_devices
       SET active = false, updated_at = NOW()
       WHERE push_token = $1`,
      [token]
    );
  }

  async updatePushDeviceLastSeen(token: string): Promise<void> {
    await this.pool.query(
      `UPDATE user_push_devices
       SET last_seen_at = NOW(), updated_at = NOW()
       WHERE push_token = $1`,
      [token]
    );
  }

  // =====================================================
  // Preferences Operations
  // =====================================================

  async getUserPreferences(
    userId: string,
    tenantId: string
  ): Promise<NotificationPreferences | null> {
    const result = await this.pool.query(
      `SELECT * FROM notification_preferences
       WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );

    return result.rows[0] ? this.mapPreferences(result.rows[0]) : null;
  }

  async createUserPreferences(
    preferences: Omit<NotificationPreferences, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<NotificationPreferences> {
    const result = await this.pool.query(
      `INSERT INTO notification_preferences (
        tenant_id,
        user_id,
        email_enabled,
        sms_enabled,
        push_enabled,
        event_filters,
        quiet_hours_enabled,
        quiet_hours_start,
        quiet_hours_end
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        preferences.tenantId,
        preferences.userId,
        preferences.emailEnabled,
        preferences.smsEnabled,
        preferences.pushEnabled,
        JSON.stringify(preferences.eventFilters || {}),
        preferences.quietHoursEnabled,
        preferences.quietHoursStart,
        preferences.quietHoursEnd
      ]
    );

    return this.mapPreferences(result.rows[0]);
  }

  async updateUserPreferences(
    userId: string,
    tenantId: string,
    updates: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.emailEnabled !== undefined) {
      fields.push(`email_enabled = $${paramIndex++}`);
      values.push(updates.emailEnabled);
    }
    if (updates.smsEnabled !== undefined) {
      fields.push(`sms_enabled = $${paramIndex++}`);
      values.push(updates.smsEnabled);
    }
    if (updates.pushEnabled !== undefined) {
      fields.push(`push_enabled = $${paramIndex++}`);
      values.push(updates.pushEnabled);
    }
    if (updates.eventFilters !== undefined) {
      fields.push(`event_filters = $${paramIndex++}`);
      values.push(JSON.stringify(updates.eventFilters));
    }
    if (updates.quietHoursEnabled !== undefined) {
      fields.push(`quiet_hours_enabled = $${paramIndex++}`);
      values.push(updates.quietHoursEnabled);
    }
    if (updates.quietHoursStart !== undefined) {
      fields.push(`quiet_hours_start = $${paramIndex++}`);
      values.push(updates.quietHoursStart);
    }
    if (updates.quietHoursEnd !== undefined) {
      fields.push(`quiet_hours_end = $${paramIndex++}`);
      values.push(updates.quietHoursEnd);
    }

    fields.push(`updated_at = NOW()`);
    values.push(userId, tenantId);

    const result = await this.pool.query(
      `UPDATE notification_preferences
       SET ${fields.join(', ')}
       WHERE user_id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    if (!result.rows[0]) {
      throw new Error('Preferences not found');
    }

    return this.mapPreferences(result.rows[0]);
  }

  // =====================================================
  // Policy Operations
  // =====================================================

  async getTenantPolicies(tenantId: string): Promise<NotificationPolicy[]> {
    const result = await this.pool.query(
      `SELECT * FROM notification_policies
       WHERE tenant_id = $1 AND enabled = true
       ORDER BY event_type ASC`,
      [tenantId]
    );

    return result.rows.map(row => this.mapPolicy(row));
  }

  async getPolicyByEventType(
    tenantId: string,
    eventType: string
  ): Promise<NotificationPolicy | null> {
    const result = await this.pool.query(
      `SELECT * FROM notification_policies
       WHERE tenant_id = $1 AND event_type = $2 AND enabled = true`,
      [tenantId, eventType]
    );

    return result.rows[0] ? this.mapPolicy(result.rows[0]) : null;
  }

  async createPolicy(
    policy: Omit<NotificationPolicy, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<NotificationPolicy> {
    const result = await this.pool.query(
      `INSERT INTO notification_policies (
        tenant_id,
        event_type,
        enabled,
        minimum_severity,
        channels,
        cooldown_seconds,
        escalation_rules
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        policy.tenantId,
        policy.eventType,
        policy.enabled,
        policy.minimumSeverity,
        JSON.stringify(policy.channels),
        policy.cooldownSeconds || 0,
        policy.escalationRules ? JSON.stringify(policy.escalationRules) : null
      ]
    );

    return this.mapPolicy(result.rows[0]);
  }

  // =====================================================
  // Monitoring Queries
  // =====================================================

  async getQueueDepth(tenantId?: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM v_notification_queue_depth
       ${tenantId ? 'WHERE tenant_id = $1' : ''}
       ORDER BY count DESC`,
      tenantId ? [tenantId] : []
    );

    return result.rows;
  }

  async getDeliveryStats24h(tenantId?: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM v_notification_delivery_stats_24h
       ${tenantId ? 'WHERE tenant_id = $1' : ''}
       ORDER BY total DESC`,
      tenantId ? [tenantId] : []
    );

    return result.rows;
  }

  async getFailedDeliveries(tenantId: string, limit: number = 100): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM v_notification_failures
       WHERE tenant_id = $1
       LIMIT $2`,
      [tenantId, limit]
    );

    return result.rows;
  }

  // =====================================================
  // Mapping Functions
  // =====================================================

  private mapNotification(row: any): Notification {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      type: row.type,
      sourceType: row.source_type,
      sourceId: row.source_id,
      title: row.title,
      body: row.body,
      metadata: row.metadata || {},
      createdAt: row.created_at
    };
  }

  private mapDelivery(row: any): NotificationDelivery {
    return {
      id: row.id,
      notificationId: row.notification_id,
      tenantId: row.tenant_id,
      channel: row.channel,
      destination: row.destination,
      subject: row.subject,
      title: row.title,
      body: row.body,
      templateId: row.template_id,
      templateData: row.template_data || undefined,
      metadata: row.metadata || {},
      priority: row.priority,
      status: row.status,
      idempotencyKey: row.idempotency_key,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      nextAttemptAt: row.next_attempt_at,
      lockedAt: row.locked_at,
      lockedBy: row.locked_by,
      provider: row.provider,
      providerMessageId: row.provider_message_id,
      lastError: row.last_error,
      lastErrorCode: row.last_error_code,
      createdAt: row.created_at,
      processingAt: row.processing_at,
      sentAt: row.sent_at,
      deliveredAt: row.delivered_at,
      failedAt: row.failed_at
    };
  }

  private mapDeliveryAttempt(row: any): NotificationDeliveryAttempt {
    return {
      id: row.id,
      deliveryId: row.delivery_id,
      attemptNumber: row.attempt_number,
      provider: row.provider,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      success: row.success,
      responseCode: row.response_code,
      providerMessageId: row.provider_message_id,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      durationMs: row.duration_ms,
      metadata: row.metadata || {}
    };
  }

  private mapPushDevice(row: any): UserPushDevice {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      platform: row.platform,
      pushToken: row.push_token,
      active: row.active,
      lastSeenAt: row.last_seen_at,
      deviceInfo: row.device_info || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapPreferences(row: any): NotificationPreferences {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      emailEnabled: row.email_enabled,
      smsEnabled: row.sms_enabled,
      pushEnabled: row.push_enabled,
      eventFilters: row.event_filters || {},
      quietHoursEnabled: row.quiet_hours_enabled,
      quietHoursStart: row.quiet_hours_start,
      quietHoursEnd: row.quiet_hours_end,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapPolicy(row: any): NotificationPolicy {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      eventType: row.event_type,
      enabled: row.enabled,
      minimumSeverity: row.minimum_severity,
      channels: row.channels || [],
      cooldownSeconds: row.cooldown_seconds || 0,
      escalationRules: row.escalation_rules,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
