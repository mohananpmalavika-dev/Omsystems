/**
 * Internal Notification Service
 * 
 * Orchestrates secure notification submission from authenticated services.
 * Implements the complete security boundary with:
 * - Authentication validation
 * - Authorization checks
 * - Replay protection
 * - Idempotency enforcement
 * - Rate limiting
 * - Transactional outbox pattern
 */

import { Pool, PoolClient } from 'pg';
import {
  ServicePrincipal,
  InternalNotificationCommand,
  InternalNotificationResult,
  NotificationPurpose,
  IServiceAuthorizationService,
  IReplayProtectionService,
  INotificationIdempotencyService,
  INotificationRatePolicyService,
} from './service-auth.types.js';
import { NotificationService } from '../../notifications/notification.service.js';
import { NotificationRequest } from '../../notifications/notification.types.js';
import { computeRequestHash } from './notification-idempotency.service.js';
import { logger } from '../../utils/logger.js';

/**
 * Internal Notification Service
 * 
 * This is the secure entry point for service-to-service notifications.
 * All security controls are enforced here before delegating to NotificationService.
 */
export class InternalNotificationService {
  constructor(
    private readonly authorization: IServiceAuthorizationService,
    private readonly replayProtection: IReplayProtectionService,
    private readonly idempotency: INotificationIdempotencyService,
    private readonly ratePolicy: INotificationRatePolicyService,
    private readonly notificationService: NotificationService,
    private readonly pool: Pool
  ) {}

  /**
   * Submit notification from authenticated service
   * 
   * Security boundary:
   * 1. Validate principal capabilities
   * 2. Authorize action for tenant
   * 3. Validate notification purpose
   * 4. Check replay protection
   * 5. Check rate limits
   * 6. Check idempotency
   * 7. Create notification (transactional)
   * 8. Record idempotency
   * 9. Increment rate counters
   * 
   * Returns 202 Accepted with notification ID
   */
  async submit(input: {
    principal: ServicePrincipal;
    command: InternalNotificationCommand;
  }): Promise<InternalNotificationResult> {
    const { principal, command } = input;
    const startTime = Date.now();

    logger.info('Internal notification request received', {
      serviceId: principal.serviceId,
      tenantId: command.tenantId,
      purpose: command.purpose,
      eventId: command.eventId,
      recipientCount: command.recipientRefs.length,
      idempotencyKey: command.idempotencyKey,
    });

    try {
      // Step 1: Validate command
      this.validateCommand(command);

      // Step 2: Authorization - check capability
      this.authorization.requireCapability(principal, 'notifications:create');

      // Step 3: Authorization - check tenant
      const canActForTenant = await this.authorization.canActForTenant(
        principal,
        command.tenantId
      );

      if (!canActForTenant) {
        throw new Error(
          `Service ${principal.serviceId} not authorized for tenant ${command.tenantId}`
        );
      }

      // Step 4: Authorization - check notification purpose
      const canSendPurpose = this.authorization.canSendNotificationPurpose(
        principal.serviceId,
        command.purpose
      );

      if (!canSendPurpose) {
        throw new Error(
          `Service ${principal.serviceId} not allowed to send ${command.purpose} notifications`
        );
      }

      // Step 5: Replay protection
      await this.replayProtection.consume(principal);

      // Step 6: Compute request hash for idempotency
      const requestHash = computeRequestHash({
        tenantId: command.tenantId,
        purpose: command.purpose,
        eventId: command.eventId,
        templateId: command.templateId,
        recipientRefs: command.recipientRefs,
        data: command.data,
      });

      // Step 7: Check idempotency
      const idempotencyCheck = await this.idempotency.check(
        command.tenantId,
        principal.serviceId,
        command.idempotencyKey,
        requestHash
      );

      if (idempotencyCheck.isDuplicate) {
        if (idempotencyCheck.isConflict) {
          throw new Error(
            `Idempotency conflict: same key with different request content`
          );
        }

        // Return existing notification
        logger.info('Duplicate notification request (idempotency)', {
          serviceId: principal.serviceId,
          tenantId: command.tenantId,
          idempotencyKey: command.idempotencyKey,
          existingNotificationId: idempotencyCheck.notificationId,
        });

        return {
          notificationId: idempotencyCheck.notificationId!,
          duplicate: true,
          status: 'accepted',
          acceptedAt: new Date(),
        };
      }

      // Step 8: Rate limiting
      await this.ratePolicy.check({
        serviceId: principal.serviceId,
        tenantId: command.tenantId,
        purpose: command.purpose,
        recipientCount: command.recipientRefs.length,
      });

      // Step 9: Create notification (transactional)
      const notificationId = await this.createNotificationTransactional(
        principal,
        command,
        requestHash
      );

      // Step 10: Increment rate counters (after successful creation)
      await this.ratePolicy.increment({
        serviceId: principal.serviceId,
        tenantId: command.tenantId,
        purpose: command.purpose,
        recipientCount: command.recipientRefs.length,
      });

      const durationMs = Date.now() - startTime;

      logger.info('Internal notification accepted', {
        serviceId: principal.serviceId,
        tenantId: command.tenantId,
        purpose: command.purpose,
        notificationId,
        durationMs,
      });

      return {
        notificationId,
        duplicate: false,
        status: 'accepted',
        acceptedAt: new Date(),
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      logger.error('Internal notification rejected', {
        serviceId: principal.serviceId,
        tenantId: command.tenantId,
        purpose: command.purpose,
        error: error instanceof Error ? error.message : String(error),
        durationMs,
      });

      throw error;
    }
  }

  // =====================================================
  // Private Helper Methods
  // =====================================================

  /**
   * Validate command structure and required fields
   */
  private validateCommand(command: InternalNotificationCommand): void {
    if (!command.tenantId) {
      throw new Error('tenantId is required');
    }

    if (!command.purpose) {
      throw new Error('purpose is required');
    }

    if (!command.eventId) {
      throw new Error('eventId is required');
    }

    if (!command.templateId) {
      throw new Error('templateId is required');
    }

    if (!command.recipientRefs || command.recipientRefs.length === 0) {
      throw new Error('recipientRefs is required and must not be empty');
    }

    if (!command.data) {
      throw new Error('data is required');
    }

    if (!command.idempotencyKey) {
      throw new Error('idempotencyKey is required');
    }

    if (!command.occurredAt) {
      throw new Error('occurredAt is required');
    }

    // Validate occurredAt is not too old or in future
    const occurredAt = new Date(command.occurredAt);
    const now = new Date();
    const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours
    const maxFutureMs = 5 * 60 * 1000; // 5 minutes (clock skew)

    if (occurredAt < new Date(now.getTime() - maxAgeMs)) {
      throw new Error(`occurredAt is too old: ${command.occurredAt}`);
    }

    if (occurredAt > new Date(now.getTime() + maxFutureMs)) {
      throw new Error(`occurredAt is in the future: ${command.occurredAt}`);
    }

    // Validate notification purpose enum
    if (!Object.values(NotificationPurpose).includes(command.purpose)) {
      throw new Error(`Invalid notification purpose: ${command.purpose}`);
    }
  }

  /**
   * Create notification within database transaction
   * 
   * Transaction includes:
   * 1. Notification record
   * 2. Delivery records (outbox)
   * 3. Idempotency record
   * 
   * This ensures atomicity: either all succeed or all fail.
   */
  private async createNotificationTransactional(
    principal: ServicePrincipal,
    command: InternalNotificationCommand,
    requestHash: string
  ): Promise<string> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Resolve recipients server-side
      // In production, this should:
      // - Query recipient_refs table
      // - Resolve roles/groups
      // - Load user preferences
      // - Determine channels
      const resolvedRecipients = await this.resolveRecipients(
        command.recipientRefs,
        command.tenantId,
        client
      );

      // Build NotificationRequest for existing service
      const notificationRequest: NotificationRequest = {
        tenantId: command.tenantId,
        type: `service.${command.purpose.toLowerCase()}`,
        channels: resolvedRecipients.channels,
        recipient: resolvedRecipients.recipient,
        subject: command.data.subject as string | undefined,
        title: command.data.title as string | undefined,
        body: command.data.body as string || 'Notification',
        templateId: command.templateId,
        templateData: command.data,
        metadata: {
          ...command.metadata,
          purpose: command.purpose,
          eventId: command.eventId,
          serviceId: principal.serviceId,
          occurredAt: command.occurredAt,
        },
        priority: this.mapPurposeToPriority(command.purpose),
        idempotencyKey: command.idempotencyKey,
        source: {
          type: 'service',
          id: principal.serviceId,
        },
      };

      // Create notification via existing service
      const result = await this.notificationService.enqueue(
        notificationRequest,
        { transaction: client }
      );

      // Record idempotency
      await this.idempotency.record(
        command.tenantId,
        principal.serviceId,
        command.idempotencyKey,
        requestHash,
        result.notificationId,
        86400, // 24 hour TTL
        client
      );

      await client.query('COMMIT');

      logger.debug('Notification transaction committed', {
        notificationId: result.notificationId,
        deliveries: result.deliveryIds.length,
      });

      return result.notificationId;
    } catch (error) {
      await client.query('ROLLBACK');

      logger.error('Notification transaction rolled back', {
        error,
        serviceId: principal.serviceId,
        tenantId: command.tenantId,
      });

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Resolve recipient references to actual recipients
   * 
   * Production implementation should:
   * - Query notification_recipient_refs table
   * - Resolve roles (e.g., "branch-security-team")
   * - Resolve groups
   * - Load user preferences
   * - Determine appropriate channels
   * - Filter by user consent/preferences
   */
  private async resolveRecipients(
    recipientRefs: string[],
    tenantId: string,
    client: PoolClient
  ): Promise<{
    recipient: {
      userId?: string;
      email?: string;
      phone?: string;
    };
    channels: ('email' | 'sms' | 'push' | 'webhook' | 'in_app')[];
  }> {
    // Simplified implementation
    // In production, query recipient_refs table:
    //
    // SELECT recipient_type, recipient_value, channels
    // FROM notification_recipient_refs
    // WHERE tenant_id = $1 AND ref_id = ANY($2)
    //
    // Then resolve users, groups, roles accordingly

    // For now, assume first ref is a user ID
    const firstRef = recipientRefs[0];

    // TODO: Query user table for actual email/phone
    // const userQuery = `
    //   SELECT id, email, phone
    //   FROM users
    //   WHERE tenant_id = $1 AND id = $2
    // `;
    // const userResult = await client.query(userQuery, [tenantId, firstRef]);

    // Placeholder implementation
    return {
      recipient: {
        userId: firstRef,
        // email: would come from user query
        // phone: would come from user query
      },
      channels: ['in_app', 'email'], // Default channels
    };
  }

  /**
   * Map notification purpose to priority
   */
  private mapPurposeToPriority(
    purpose: NotificationPurpose
  ): 'low' | 'normal' | 'high' | 'critical' {
    switch (purpose) {
      case NotificationPurpose.ALERT_ESCALATION:
      case NotificationPurpose.SECURITY_EVENT:
        return 'critical';

      case NotificationPurpose.INCIDENT_CREATED:
      case NotificationPurpose.DEVICE_OFFLINE:
      case NotificationPurpose.RECORDING_FAILURE:
      case NotificationPurpose.COMPLIANCE_VIOLATION:
      case NotificationPurpose.HEALTH_CHECK_FAILED:
        return 'high';

      case NotificationPurpose.USER_ACTION_REQUIRED:
        return 'normal';

      case NotificationPurpose.SYSTEM_MAINTENANCE:
        return 'low';

      default:
        return 'normal';
    }
  }
}

/**
 * Factory function for creating InternalNotificationService
 */
export function createInternalNotificationService(
  authorization: IServiceAuthorizationService,
  replayProtection: IReplayProtectionService,
  idempotency: INotificationIdempotencyService,
  ratePolicy: INotificationRatePolicyService,
  notificationService: NotificationService,
  pool: Pool
): InternalNotificationService {
  return new InternalNotificationService(
    authorization,
    replayProtection,
    idempotency,
    ratePolicy,
    notificationService,
    pool
  );
}
