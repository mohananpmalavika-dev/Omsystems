/**
 * Notification Repository
 * Data access layer for notification system
 */

import type { Pool } from 'pg';
import type {
  NotificationPolicy,
  NotificationPolicyVersion,
  RecipientGroup,
  RecipientMember,
  NotificationOutbox,
  NotificationDelivery,
  EscalationJob,
  NotificationTemplate,
  ProviderConfig,
  NotificationAuditLog,
  CreateNotificationPolicyInput,
  UpdateNotificationPolicyInput,
  CreateRecipientGroupInput,
  UpdateRecipientGroupInput,
  CreateNotificationOutboxInput,
  CreateAuditLogInput,
  ListNotificationsQuery,
  ListDeliveriesQuery,
  PaginatedResult,
  NotificationStats,
} from '../domain/notification.types.js';
import { logger } from '../../utils/logger.js';

export class NotificationRepository {
  constructor(private pool: Pool) {}

  // =====================================================
  // NOTIFICATION POLICIES
  // =====================================================

  async createPolicy(input: CreateNotificationPolicyInput): Promise<NotificationPolicy> {
    const result = await this.pool.query(
      `INSERT INTO notification_policies (
        tenant_id, name, description, status, scope_type,
        scope_region_ids, scope_branch_ids, scope_device_ids, scope_alert_types,
        p1_rule, p2_rule, p3_rule, p4_rule, p5_rule,
        quiet_hours_enabled, quiet_hours_start, quiet_hours_end, quiet_hours_timezone, quiet_hours_bypass_severities,
        rate_limit_per_minute, rate_limit_per_recipient_per_minute,
        p1_escalation, p2_escalation, p3_escalation, p4_escalation, p5_escalation,
        created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27
      ) RETURNING *`,
      [
        input.tenantId,
        input.name,
        input.description,
        'DRAFT',
        input.scope?.type || 'TENANT',
        input.scope?.regionIds || [],
        input.scope?.branchIds || [],
        input.scope?.deviceIds || [],
        input.scope?.alertTypes || [],
        JSON.stringify(input.p1Rule),
        JSON.stringify(input.p2Rule),
        JSON.stringify(input.p3Rule),
        JSON.stringify(input.p4Rule),
        JSON.stringify(input.p5Rule),
        input.quietHours?.enabled || false,
        input.quietHours?.start,
        input.quietHours?.end,
        input.quietHours?.timezone,
        input.quietHours?.bypassSeverities || ['P1'],
        input.rateLimits?.perMinute || 120,
        input.rateLimits?.perRecipientPerMinute || 10,
        JSON.stringify(input.p1Escalation),
        JSON.stringify(input.p2Escalation),
        JSON.stringify(input.p3Escalation),
        JSON.stringify(input.p4Escalation),
        JSON.stringify(input.p5Escalation),
        null, // created_by - will be set by service layer
      ]
    );

    return this.mapRowToPolicy(result.rows[0]);
  }

  async getPolicy(id: string): Promise<NotificationPolicy | null> {
    const result = await this.pool.query(
      'SELECT * FROM notification_policies WHERE id = $1',
      [id]
    );

    return result.rows[0] ? this.mapRowToPolicy(result.rows[0]) : null;
  }

  async getTenantPolicies(tenantId: string, status?: string): Promise<NotificationPolicy[]> {
    const query = status
      ? 'SELECT * FROM notification_policies WHERE tenant_id = $1 AND status = $2 ORDER BY created_at DESC'
      : 'SELECT * FROM notification_policies WHERE tenant_id = $1 ORDER BY created_at DESC';

    const params = status ? [tenantId, status] : [tenantId];
    const result = await this.pool.query(query, params);

    return result.rows.map(row => this.mapRowToPolicy(row));
  }

  async updatePolicy(id: string, input: UpdateNotificationPolicyInput): Promise<NotificationPolicy> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(input.name);
    }

    if (input.description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(input.description);
    }

    if (input.scope !== undefined) {
      updates.push(`scope_type = $${paramCount++}`);
      values.push(input.scope.type);
      updates.push(`scope_region_ids = $${paramCount++}`);
      values.push(input.scope.regionIds || []);
      updates.push(`scope_branch_ids = $${paramCount++}`);
      values.push(input.scope.branchIds || []);
    }

    if (input.p1Rule !== undefined) {
      updates.push(`p1_rule = $${paramCount++}`);
      values.push(JSON.stringify(input.p1Rule));
    }

    if (input.quietHours !== undefined) {
      updates.push(`quiet_hours_enabled = $${paramCount++}`);
      values.push(input.quietHours.enabled);
      updates.push(`quiet_hours_start = $${paramCount++}`);
      values.push(input.quietHours.start);
      updates.push(`quiet_hours_end = $${paramCount++}`);
      values.push(input.quietHours.end);
      updates.push(`quiet_hours_timezone = $${paramCount++}`);
      values.push(input.quietHours.timezone);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await this.pool.query(
      `UPDATE notification_policies SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    return this.mapRowToPolicy(result.rows[0]);
  }

  async publishPolicy(id: string, publishedBy: string): Promise<NotificationPolicy> {
    const result = await this.pool.query(
      `UPDATE notification_policies 
       SET status = 'PUBLISHED', published_by = $2, published_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, publishedBy]
    );

    return this.mapRowToPolicy(result.rows[0]);
  }

  // =====================================================
  // RECIPIENT GROUPS
  // =====================================================

  async createRecipientGroup(input: CreateRecipientGroupInput): Promise<RecipientGroup> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Create group
      const groupResult = await client.query(
        `INSERT INTO notification_recipient_groups (
          tenant_id, name, description, scope_type,
          scope_region_ids, scope_branch_ids, scope_alert_types
        ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          input.tenantId,
          input.name,
          input.description,
          input.scopeType || 'TENANT',
          input.scopeRegionIds || [],
          input.scopeBranchIds || [],
          input.scopeAlertTypes || [],
        ]
      );

      const group = groupResult.rows[0];

      // Create members
      if (input.members && input.members.length > 0) {
        for (const member of input.members) {
          await client.query(
            `INSERT INTO notification_recipient_members (
              group_id, user_id, display_name, email, phone, voice_number,
              preferred_language, enabled
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              group.id,
              member.userId,
              member.displayName,
              member.email,
              member.phone,
              member.voiceNumber,
              member.preferredLanguage || 'en',
              member.enabled !== false,
            ]
          );
        }
      }

      await client.query('COMMIT');

      return this.getRecipientGroup(group.id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getRecipientGroup(id: string): Promise<RecipientGroup> {
    const groupResult = await this.pool.query(
      'SELECT * FROM notification_recipient_groups WHERE id = $1',
      [id]
    );

    if (!groupResult.rows[0]) {
      throw new Error('Recipient group not found');
    }

    const membersResult = await this.pool.query(
      'SELECT * FROM notification_recipient_members WHERE group_id = $1 ORDER BY display_name',
      [id]
    );

    const group = this.mapRowToRecipientGroup(groupResult.rows[0]);
    group.members = membersResult.rows.map(row => this.mapRowToRecipientMember(row));

    return group;
  }

  async getRecipientGroups(ids: string[]): Promise<RecipientGroup[]> {
    if (ids.length === 0) {
      return [];
    }

    const groups = await Promise.all(ids.map(id => this.getRecipientGroup(id)));
    return groups;
  }

  async getTenantRecipientGroups(tenantId: string): Promise<RecipientGroup[]> {
    const result = await this.pool.query(
      'SELECT * FROM notification_recipient_groups WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name',
      [tenantId]
    );

    return result.rows.map(row => this.mapRowToRecipientGroup(row));
  }

  // =====================================================
  // NOTIFICATION OUTBOX
  // =====================================================

  async createOutboxEntry(input: CreateNotificationOutboxInput): Promise<NotificationOutbox> {
    const dedupKey = this.generateDedupKey(
      input.tenantId,
      input.incidentId,
      input.policyId,
      input.escalationStep || 0,
      input.channel,
      input.recipientDestination
    );

    const result = await this.pool.query(
      `INSERT INTO notification_outbox (
        tenant_id, incident_id, alert_id, policy_id, escalation_step,
        channel, recipient_id, recipient_display_name, recipient_destination,
        template_key, subject, body, variables, scheduled_at, dedup_key, provider_name
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      ) RETURNING *`,
      [
        input.tenantId,
        input.incidentId,
        input.alertId,
        input.policyId,
        input.escalationStep || 0,
        input.channel,
        input.recipientId,
        input.recipientDisplayName,
        input.recipientDestination,
        input.templateKey,
        input.subject,
        input.body,
        JSON.stringify(input.variables || {}),
        input.scheduledAt || new Date(),
        dedupKey,
        input.providerName,
      ]
    );

    return this.mapRowToOutbox(result.rows[0]);
  }

  async fetchPendingNotifications(limit: number): Promise<NotificationOutbox[]> {
    const result = await this.pool.query(
      `SELECT * FROM notification_outbox 
       WHERE status = 'PENDING' 
         AND available_at <= NOW()
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map(row => this.mapRowToOutbox(row));
  }

  async markAsProcessing(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE notification_outbox 
       SET status = 'PROCESSING', processing_started_at = NOW()
       WHERE id = $1`,
      [id]
    );
  }

  async updateOutboxStatus(id: string, updates: Partial<NotificationOutbox>): Promise<void> {
    const sets: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updates.status) {
      sets.push(`status = $${paramCount++}`);
      values.push(updates.status);
    }

    if (updates.attemptCount !== undefined) {
      sets.push(`attempt_count = $${paramCount++}`);
      values.push(updates.attemptCount);
    }

    if (updates.providerMessageId) {
      sets.push(`provider_message_id = $${paramCount++}`);
      values.push(updates.providerMessageId);
    }

    if (updates.lastErrorCode) {
      sets.push(`last_error_code = $${paramCount++}`);
      values.push(updates.lastErrorCode);
    }

    if (updates.lastErrorMessage) {
      sets.push(`last_error_message = $${paramCount++}`);
      values.push(updates.lastErrorMessage);
    }

    if (updates.errorHistory) {
      sets.push(`error_history = $${paramCount++}`);
      values.push(JSON.stringify(updates.errorHistory));
    }

    if (updates.availableAt) {
      sets.push(`available_at = $${paramCount++}`);
      values.push(updates.availableAt);
    }

    if (updates.processedAt) {
      sets.push(`processed_at = $${paramCount++}`);
      values.push(updates.processedAt);
    }

    if (updates.failedAt) {
      sets.push(`failed_at = $${paramCount++}`);
      values.push(updates.failedAt);
    }

    values.push(id);

    await this.pool.query(
      `UPDATE notification_outbox SET ${sets.join(', ')} WHERE id = $${paramCount}`,
      values
    );
  }

  async findStuckNotifications(timeoutMs: number): Promise<NotificationOutbox[]> {
    const timeoutDate = new Date(Date.now() - timeoutMs);

    const result = await this.pool.query(
      `SELECT * FROM notification_outbox 
       WHERE status = 'PROCESSING' 
         AND processing_started_at < $1`,
      [timeoutDate]
    );

    return result.rows.map(row => this.mapRowToOutbox(row));
  }

  async cancelPendingNotifications(incidentId: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE notification_outbox 
       SET status = 'CANCELLED', cancelled_at = NOW()
       WHERE incident_id = $1 
         AND status IN ('PENDING', 'RETRYING')`,
      [incidentId]
    );

    return result.rowCount || 0;
  }

  // =====================================================
  // NOTIFICATION DELIVERIES
  // =====================================================

  async createDelivery(delivery: Partial<NotificationDelivery>): Promise<NotificationDelivery> {
    const result = await this.pool.query(
      `INSERT INTO notification_deliveries (
        tenant_id, outbox_id, incident_id, channel,
        recipient_id, recipient_display_name, recipient_destination_masked,
        provider_name, provider_message_id, status, attempt_number,
        sent_at, delivered_at, failed_at, error_code, error_message, latency_ms
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      ) RETURNING *`,
      [
        delivery.tenantId,
        delivery.outboxId,
        delivery.incidentId,
        delivery.channel,
        delivery.recipientId,
        delivery.recipientDisplayName,
        delivery.recipientDestinationMasked,
        delivery.providerName,
        delivery.providerMessageId,
        delivery.status,
        delivery.attemptNumber,
        delivery.sentAt,
        delivery.deliveredAt,
        delivery.failedAt,
        delivery.errorCode,
        delivery.errorMessage,
        delivery.latencyMs,
      ]
    );

    return this.mapRowToDelivery(result.rows[0]);
  }

  async getIncidentDeliveries(incidentId: string): Promise<NotificationDelivery[]> {
    const result = await this.pool.query(
      `SELECT * FROM notification_deliveries 
       WHERE incident_id = $1 
       ORDER BY created_at ASC`,
      [incidentId]
    );

    return result.rows.map(row => this.mapRowToDelivery(row));
  }

  // =====================================================
  // ESCALATION JOBS
  // =====================================================

  async createEscalationJob(job: Partial<EscalationJob>): Promise<EscalationJob> {
    const result = await this.pool.query(
      `INSERT INTO notification_escalation_jobs (
        tenant_id, incident_id, policy_id, severity,
        current_step, total_steps, status, next_escalation_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        job.tenantId,
        job.incidentId,
        job.policyId,
        job.severity,
        job.currentStep,
        job.totalSteps,
        job.status,
        job.nextEscalationAt,
      ]
    );

    return this.mapRowToEscalationJob(result.rows[0]);
  }

  async findDueEscalationJobs(): Promise<EscalationJob[]> {
    const result = await this.pool.query(
      `SELECT * FROM notification_escalation_jobs 
       WHERE status = 'ACTIVE' 
         AND next_escalation_at <= NOW()
       ORDER BY next_escalation_at ASC`
    );

    return result.rows.map(row => this.mapRowToEscalationJob(row));
  }

  async findActiveEscalationJobs(incidentId: string): Promise<EscalationJob[]> {
    const result = await this.pool.query(
      `SELECT * FROM notification_escalation_jobs 
       WHERE incident_id = $1 AND status = 'ACTIVE'`,
      [incidentId]
    );

    return result.rows.map(row => this.mapRowToEscalationJob(row));
  }

  async updateEscalationJob(id: string, updates: Partial<EscalationJob>): Promise<void> {
    const sets: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        sets.push(`${this.camelToSnake(key)} = $${paramCount++}`);
        values.push(value);
      }
    });

    values.push(id);

    await this.pool.query(
      `UPDATE notification_escalation_jobs SET ${sets.join(', ')} WHERE id = $${paramCount}`,
      values
    );
  }

  // =====================================================
  // AUDIT LOG
  // =====================================================

  async createAuditLog(input: CreateAuditLogInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO notification_audit_log (
        tenant_id, actor_id, actor_role, action, resource_type, resource_id,
        previous_value, new_value, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        input.tenantId,
        input.actorId,
        input.actorRole,
        input.action,
        input.resourceType,
        input.resourceId,
        JSON.stringify(input.previousValue),
        JSON.stringify(input.newValue),
        input.ipAddress,
        input.userAgent,
      ]
    );
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  private generateDedupKey(
    tenantId: string,
    incidentId: string | undefined,
    policyId: string | undefined,
    escalationStep: number,
    channel: string,
    recipientDestination: string
  ): string {
    return [
      tenantId,
      incidentId || 'null',
      policyId || 'null',
      escalationStep,
      channel,
      recipientDestination,
    ].join(':');
  }

  private mapRowToPolicy(row: any): NotificationPolicy {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      description: row.description,
      version: row.version,
      status: row.status,
      scope: {
        type: row.scope_type,
        regionIds: row.scope_region_ids,
        branchIds: row.scope_branch_ids,
        deviceIds: row.scope_device_ids,
        alertTypes: row.scope_alert_types,
      },
      p1Rule: row.p1_rule,
      p2Rule: row.p2_rule,
      p3Rule: row.p3_rule,
      p4Rule: row.p4_rule,
      p5Rule: row.p5_rule,
      quietHours: row.quiet_hours_enabled ? {
        enabled: row.quiet_hours_enabled,
        start: row.quiet_hours_start,
        end: row.quiet_hours_end,
        timezone: row.quiet_hours_timezone,
        bypassSeverities: row.quiet_hours_bypass_severities,
      } : undefined,
      rateLimits: {
        perMinute: row.rate_limit_per_minute,
        perRecipientPerMinute: row.rate_limit_per_recipient_per_minute,
      },
      p1Escalation: row.p1_escalation,
      p2Escalation: row.p2_escalation,
      p3Escalation: row.p3_escalation,
      p4Escalation: row.p4_escalation,
      p5Escalation: row.p5_escalation,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      approvedBy: row.approved_by,
      publishedBy: row.published_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      approvedAt: row.approved_at,
      publishedAt: row.published_at,
    };
  }

  private mapRowToRecipientGroup(row: any): RecipientGroup {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      description: row.description,
      scopeType: row.scope_type,
      scopeRegionIds: row.scope_region_ids,
      scopeBranchIds: row.scope_branch_ids,
      scopeAlertTypes: row.scope_alert_types,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }

  private mapRowToRecipientMember(row: any): RecipientMember {
    return {
      id: row.id,
      groupId: row.group_id,
      userId: row.user_id,
      displayName: row.display_name,
      email: row.email,
      phone: row.phone,
      voiceNumber: row.voice_number,
      preferredLanguage: row.preferred_language,
      enabled: row.enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapRowToOutbox(row: any): NotificationOutbox {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      incidentId: row.incident_id,
      alertId: row.alert_id,
      policyId: row.policy_id,
      escalationStep: row.escalation_step,
      channel: row.channel,
      recipientId: row.recipient_id,
      recipientDisplayName: row.recipient_display_name,
      recipientDestination: row.recipient_destination,
      recipientDestinationMasked: row.recipient_destination_masked,
      templateKey: row.template_key,
      subject: row.subject,
      body: row.body,
      variables: row.variables,
      status: row.status,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      availableAt: row.available_at,
      scheduledAt: row.scheduled_at,
      providerName: row.provider_name,
      providerMessageId: row.provider_message_id,
      dedupKey: row.dedup_key,
      createdAt: row.created_at,
      processingStartedAt: row.processing_started_at,
      processedAt: row.processed_at,
      deliveredAt: row.delivered_at,
      failedAt: row.failed_at,
      cancelledAt: row.cancelled_at,
      lastErrorCode: row.last_error_code,
      lastErrorMessage: row.last_error_message,
      errorHistory: row.error_history || [],
    };
  }

  private mapRowToDelivery(row: any): NotificationDelivery {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      outboxId: row.outbox_id,
      incidentId: row.incident_id,
      channel: row.channel,
      recipientId: row.recipient_id,
      recipientDisplayName: row.recipient_display_name,
      recipientDestinationMasked: row.recipient_destination_masked,
      providerName: row.provider_name,
      providerMessageId: row.provider_message_id,
      status: row.status,
      attemptNumber: row.attempt_number,
      sentAt: row.sent_at,
      deliveredAt: row.delivered_at,
      failedAt: row.failed_at,
      acknowledgedAt: row.acknowledged_at,
      acknowledgedBy: row.acknowledged_by,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      latencyMs: row.latency_ms,
      createdAt: row.created_at,
    };
  }

  private mapRowToEscalationJob(row: any): EscalationJob {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      incidentId: row.incident_id,
      policyId: row.policy_id,
      severity: row.severity,
      currentStep: row.current_step,
      totalSteps: row.total_steps,
      status: row.status,
      nextEscalationAt: row.next_escalation_at,
      acknowledgedAt: row.acknowledged_at,
      acknowledgedBy: row.acknowledged_by,
      cancelledAt: row.cancelled_at,
      cancelledReason: row.cancelled_reason,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
}
