/**
 * Notification Repository
 * 
 * Handles all database operations for the notification system
 * with proper tenant isolation and transaction support
 */

import { Pool, PoolClient } from 'pg';
import {
  Notification,
  NotificationDelivery,
  NotificationDeliveryAttempt,
  NotificationJob,
  UserPushDevice,
  NotificationPreferences,
  NotificationPolicy,
  INotificationRepository,
  NotificationStatus
} from './notification.types.js';
import { NotFoundError } from './notification.errors.js';

export class NotificationRepository implements INotificationRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Get database client (either from pool or from transaction)
   */
  private getClient(tx?: unknown): Pool | PoolClient {
    return (tx as PoolClient) || this.pool;
  }

  // =====================================================
  // Notification Operations
  // =====================================================

  async createNotification(
    notification: Omit<Notification, 'id' | 'createdAt'>,
    tx?: unknown
  ): Promise<Notification> {
    const client = this.getClient(tx);
    
    const result = await client.query<Notification>(
      `INSERT INTO notifications (
        tenant_id,
        type,
        source_type,
        source_id,
        title,
        body,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING 
        id,
        tenant_id as "tenantId",
        type,
        source_type as "sourceType",
        source_id as "sourceId",
        title,
        body,
        metadata,
        created_at as "createdAt"`,
      [
        notification.tenantId,
        notification.type,
        notification.sourceType || null,
        notification.sourceId || null,
        notification.title,
        notification.body,
        JSON.stringify(notification.metadata)
      ]
    );

    return result.rows[0];
  }

  async findNotification(
    id: string,
    tenantId: string
  ): Promise<Notification | null> {
    const result = await this.pool.query<Notification>(
      `SELECT 
        id,
        tenant_id as "tenantId",
        type,
        source_type as "sourceType",
        source_id as "sourceId",
        title,
        body,
        metadata,
        created_at as "createdAt"
      FROM notifications
      WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    return result.rows[0] || null;
  }

  // =====================================================
  // Delivery Operations
  // =====================================================

  async createDelivery(
    delivery: Omit<NotificationDelivery, 'id' | 'createdAt' | 'attemptCount'>,
    tx?: unknown
  ): Promise<NotificationDelivery> {
    const client = this.getClient(tx);
    
    const result = await client.query<NotificationDelivery>(
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
        next_attempt_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (tenant_id, idempotency_key, channel) 
        WHERE idempotency_key IS NOT NULL
      DO UPDATE SET
        next_attempt_at = EXCLUDED.next_attempt_at
      RETURNING 
        id,
        notification_id as "notificationId",
        tenant_id as "tenantId",
        channel,
        destination,
        subject,
        title,
        body,
        template_id as "templateId",
        template_data as "templateData",
        metadata,
        priority,
        status,
        idempotency_key as "idempotencyKey",
        attempt_count as "attemptCount",
        max_attempts as "maxAttempts",
        next_attempt_at as "nextAttemptAt",
        locked_at as "lockedAt",
        locked_by as "lockedBy",
        provider,
        provider_message_id as "providerMessageId",
        last_error as "lastError",
        last_error_code as "lastErrorCode",
        created_at as "createdAt",
        processing_at as "processingAt",
        sent_at as "sentAt",
        delivered_at as "deliveredAt",
        failed_at as "failedAt"`,
      [
        delivery.notificationId,
        delivery.tenantId,
        delivery.channel,
        delivery.destination,
        delivery.subject || null,
        delivery.title || null,
        delivery.body,
        delivery.templateId || null,
        delivery.templateData ? JSON.stringify(delivery.templateData) : null,
        JSON.stringify(delivery.metadata),
        delivery.priority,
        delivery.status,
        delivery.idempotencyKey || null,
        delivery.maxAttempts,
        delivery.nextAttemptAt
      ]
    );

    return result.rows[0];
  }

  async findDelivery(
    id: string,
    tenantId: string
  ): Promise<NotificationDelivery | null> {
    const result = await this.pool.query<NotificationDelivery>(
      `SELECT 
        id,
        notification_id as "notificationId",
        tenant_id as "tenantId",
        channel,
        destination,
        subject,
        title,
        body,
        template_id as "templateId",
        template_data as "templateData",
        metadata,
        priority,
        status,
        idempotency_key as "idempotencyKey",
        attempt_count as "attemptCount",
        max_attempts as "maxAttempts",
        next_attempt_at as "nextAttemptAt",
        locked_at as "lockedAt",
        locked_by as "lockedBy",
        provider,
        provider_message_id as "providerMessageId",
        last_error as "lastError",
        last_error_code as "lastErrorCode",
        created_at as "createdAt",
        processing_at as "processingAt",
        sent_at as "sentAt",
        delivered_at as "deliveredAt",
        failed_at as "failedAt"
      FROM notification_deliveries
      WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    return result.rows[0] || null;
  }

  async findDeliveriesByNotification(
    notificationId: string,
    tenantId: string
  ): Promise<NotificationDelivery[]> {
    const result = await this.pool.query<NotificationDelivery>(
      `SELECT 
        id,
        notification_id as "notificationId",
        tenant_id as "tenantId",
        channel,
        destination,
        subject,
        title,
        body,
        template_id as "templateId",
        template_data as "templateData",
        metadata,
        priority,
        status,
        idempotency_key as "idempotencyKey",
        attempt_count as "attemptCount",
        max_attempts as "maxAttempts",
        next_attempt_at as "nextAttemptAt",
        locked_at as "lockedAt",
        locked_by as "lockedBy",
        provider,
        provider_message_id as "providerMessageId",
        last_error as "lastError",
        last_error_code as "lastErrorCode",
        created_at as "createdAt",
        processing_at as "processingAt",
        sent_at as "sentAt",
        delivered_at as "deliveredAt",
        failed_at as "failedAt"
      FROM notification_deliveries
      WHERE notification_id = $1 AND tenant_id = $2
      ORDER BY created_at DESC`,
      [notificationId, tenantId]
    );

    return result.rows;
  }

  /**
   * Claim pending deliveries using SKIP LOCKED pattern
   * This allows multiple workers to safely process jobs concurrently
   */
  async claimPendingDeliveries(
    workerId: string,
    batchSize: number
  ): Promise<NotificationJob[]> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Find and lock pending jobs
      const deliveries = await client.query<NotificationDelivery>(
        `SELECT 
          id,
          notification_id as "notificationId",
          tenant_id as "tenantId",
          channel,
          destination,
          subject,
          title,
          body,
          template_id as "templateId",
          template_data as "templateData",
          metadata,
          priority,
          status,
          idempotency_key as "idempotencyKey",
          attempt_count as "attemptCount",
          max_attempts as "maxAttempts",
          next_attempt_at as "nextAttemptAt",
          locked_at as "lockedAt",
          locked_by as "lockedBy",
          provider,
          provider_message_id as "providerMessageId",
          last_error as "lastError",
          last_error_code as "lastErrorCode",
          created_at as "createdAt",
          processing_at as "processingAt",
          sent_at as "sentAt",
          delivered_at as "deliveredAt",
          failed_at as "failedAt"
        FROM notification_deliveries
        WHERE (status = 'pending' OR status = 'retry_wait')
          AND next_attempt_at <= NOW()
        ORDER BY 
          priority DESC,
          created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $1`,
        [batchSize]
      );

      if (deliveries.rows.length === 0) {
        await client.query('COMMIT');
        return [];
      }

      const deliveryIds = deliveries.rows.map(d => d.id);

      // Mark as processing and lock
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

      // Fetch corresponding notifications
      const notificationIds = [...new Set(deliveries.rows.map(d => d.notificationId))];
      
      const notifications = await client.query<Notification>(
        `SELECT 
          id,
          tenant_id as "tenantId",
          type,
          source_type as "sourceType",
          source_id as "sourceId",
          title,
          body,
          metadata,
          created_at as "createdAt"
        FROM notifications
        WHERE id = ANY($1)`,
        [notificationIds]
      );

      await client.query('COMMIT');

      // Build notification lookup map
      const notificationMap = new Map<string, Notification>();
      notifications.rows.forEach(n => notificationMap.set(n.id, n));

      // Combine into jobs
      return deliveries.rows.map(delivery => ({
        delivery,
        notification: notificationMap.get(delivery.notificationId)!
      }));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateDeliveryStatus(
    id: string,
    status: NotificationStatus,
    updates: Partial<NotificationDelivery>
  ): Promise<void> {
    const fields: string[] = ['status = $2'];
    const values: unknown[] = [id, status];
    let paramIndex = 3;

    // Build dynamic update query
    if (updates.provider !== undefined) {
      fields.push(`provider = $${paramIndex++}`);
      values.push(updates.provider);
    }
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
    if (updates.sentAt !== undefined) {
      fields.push(`sent_at = $${paramIndex++}`);
      values.push(updates.sentAt);
    }
    if (updates.deliveredAt !== undefined) {
      fields.push(`delivered_at = $${paramIndex++}`);
      values.push(updates.deliveredAt);
    }
    if (updates.failedAt !== undefined) {
      fields.push(`failed_at = $${paramIndex++}`);
      values.push(updates.failedAt);
    }
    if (updates.nextAttemptAt !== undefined) {
      fields.push(`next_attempt_at = $${paramIndex++}`);
      values.push(updates.nextAttemptAt);
    }

    // Always clear lock when updating status
    fields.push('locked_at = NULL', 'locked_by = NULL');

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

  async resetStuckDeliveries(
    timeoutMinutes: number
  ): Promise<number> {
    const result = await this.pool.query(
      `UPDATE notification_deliveries
      SET 
        status = 'pending',
        locked_at = NULL,
        locked_by = NULL,
        next_attempt_at = NOW()
      WHERE 
        status = 'processing'
        AND locked_at < NOW() - ($1 || ' minutes')::INTERVAL
      RETURNING id`,
      [timeoutMinutes]
    );

    return result.rowCount || 0;
  }

  // =====================================================
  // Delivery Attempt Operations
  // =====================================================

  async createDeliveryAttempt(
    attempt: Omit<NotificationDeliveryAttempt, 'id'>,
    tx?: unknown
  ): Promise<NotificationDeliveryAttempt> {
    const client = this.getClient(tx);
    
    const result = await client.query<NotificationDeliveryAttempt>(
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
      RETURNING 
        id,
        delivery_id as "deliveryId",
        attempt_number as "attemptNumber",
        provider,
        started_at as "startedAt",
        completed_at as "completedAt",
        success,
        response_code as "responseCode",
        provider_message_id as "providerMessageId",
        error_code as "errorCode",
        error_message as "errorMessage",
        duration_ms as "durationMs",
        metadata`,
      [
        attempt.deliveryId,
        attempt.attemptNumber,
        attempt.provider || null,
        attempt.startedAt,
        attempt.completedAt || null,
        attempt.success,
        attempt.responseCode || null,
        attempt.providerMessageId || null,
        attempt.errorCode || null,
        attempt.errorMessage || null,
        attempt.durationMs || null,
        JSON.stringify(attempt.metadata)
      ]
    );

    return result.rows[0];
  }

  // =====================================================
  // Push Device Operations
  // =====================================================

  async getUserPushDevices(
    userId: string,
    tenantId: string
  ): Promise<UserPushDevice[]> {
    const result = await this.pool.query<UserPushDevice>(
      `SELECT 
        id,
        tenant_id as "tenantId",
        user_id as "userId",
        platform,
        push_token as "pushToken",
        active,
        last_seen_at as "lastSeenAt",
        device_info as "deviceInfo",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM user_push_devices
      WHERE user_id = $1 AND tenant_id = $2 AND active = true
      ORDER BY last_seen_at DESC NULLS LAST`,
      [userId, tenantId]
    );

    return result.rows;
  }

  async deactivatePushDevice(token: string): Promise<void> {
    await this.pool.query(
      `UPDATE user_push_devices
      SET active = false
      WHERE push_token = $1`,
      [token]
    );
  }

  // =====================================================
  // User Preferences
  // =====================================================

  async getUserPreferences(
    userId: string,
    tenantId: string
  ): Promise<NotificationPreferences | null> {
    const result = await this.pool.query<NotificationPreferences>(
      `SELECT 
        id,
        tenant_id as "tenantId",
        user_id as "userId",
        email_enabled as "emailEnabled",
        sms_enabled as "smsEnabled",
        push_enabled as "pushEnabled",
        event_filters as "eventFilters",
        quiet_hours_enabled as "quietHoursEnabled",
        quiet_hours_start as "quietHoursStart",
        quiet_hours_end as "quietHoursEnd",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM notification_preferences
      WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );

    return result.rows[0] || null;
  }

  // =====================================================
  // Tenant Policies
  // =====================================================

  async getTenantPolicies(
    tenantId: string
  ): Promise<NotificationPolicy[]> {
    const result = await this.pool.query<NotificationPolicy>(
      `SELECT 
        id,
        tenant_id as "tenantId",
        event_type as "eventType",
        enabled,
        minimum_severity as "minimumSeverity",
        channels,
        cooldown_seconds as "cooldownSeconds",
        escalation_rules as "escalationRules",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM notification_policies
      WHERE tenant_id = $1 AND enabled = true
      ORDER BY event_type`,
      [tenantId]
    );

    return result.rows;
  }
}
