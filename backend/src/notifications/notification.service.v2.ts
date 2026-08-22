/**
 * Notification Service V2
 * 
 * Refactored notification service with complete recipient resolution.
 * Orchestrates RecipientResolver, EndpointResolver, and RecipientPolicyService.
 * 
 * Replaces the TODO implementations in notification.service.ts
 */

import { PoolClient } from 'pg';
import { logger } from '../utils/logger.js';
import { NotificationRepository } from './notification.repository.js';
import { RecipientResolver } from './recipient/recipient-resolver.service.js';
import { EndpointResolver } from './recipient/endpoint-resolver.service.js';
import { RecipientPolicyService } from './recipient/recipient-policy.service.js';
import {
  RecipientSelector,
  RecipientResolutionContext,
  NotificationPurpose,
  NotificationSeverity,
} from './recipient/recipient.types.js';
import {
  DeliveryEndpoint,
} from './recipient/endpoint.types.js';
import {
  NotificationChannel,
  NotificationResult,
  INotificationService,
  Notification,
  NotificationDelivery,
} from './notification.types.js';
import { ValidationError } from './notification.errors.js';

/**
 * Enhanced notification request with new recipient selectors
 */
export interface NotificationRequestV2 {
  /** Tenant ID for isolation */
  tenantId: string;
  
  /** Notification type for policies and templates */
  type: string;
  
  /** Notification purpose (for authorization) */
  purpose: NotificationPurpose;
  
  /** Notification severity */
  severity: NotificationSeverity;
  
  /** Channels to send through */
  channels: NotificationChannel[];
  
  /** Recipient selectors (replaces simple recipient object) */
  recipients: RecipientSelector[];
  
  /** Email subject (optional, can come from template) */
  subject?: string;
  
  /** Title for push/in-app */
  title?: string;
  
  /** Main message body */
  body: string;
  
  /** Template ID if using templates */
  templateId?: string;
  
  /** Data for template rendering */
  templateData?: Record<string, unknown>;
  
  /** Additional context */
  metadata?: Record<string, unknown>;
  
  /** Priority level */
  priority?: 'low' | 'normal' | 'high' | 'critical';
  
  /** Idempotency key to prevent duplicates */
  idempotencyKey?: string;
  
  /** Source tracking */
  source?: {
    type: string;
    id: string;
  };
  
  /** Optional branch context */
  branchId?: string;
  
  /** Optional incident context */
  incidentId?: string;
  
  /** Optional alert context */
  alertId?: string;
}

/**
 * Enqueue options
 */
export interface EnqueueOptions {
  /** Database transaction to use (for transactional outbox) */
  transaction?: PoolClient;
  
  /** Skip authorization checks (internal use only) */
  skipAuthorization?: boolean;
  
  /** Skip preference filtering (emergency situations) */
  skipPreferences?: boolean;
}

/**
 * Enhanced notification result with resolution details
 */
export interface NotificationResultV2 extends NotificationResult {
  /** Resolution metadata */
  resolution: {
    principalsResolved: number;
    endpointsResolved: number;
    principalFailures: number;
    endpointWarnings: number;
  };
}

/**
 * NotificationServiceV2 - Complete implementation with recipient resolution
 */
export class NotificationServiceV2 implements INotificationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly recipientResolver: RecipientResolver,
    private readonly endpointResolver: EndpointResolver,
    private readonly recipientPolicy: RecipientPolicyService,
  ) {}

  /**
   * Enqueue notification for delivery
   * 
   * Complete implementation with:
   * - Authorization of recipient selectors
   * - Tenant-scoped recipient resolution
   * - Endpoint verification and filtering
   * - Preference-based filtering
   * - Transactional outbox pattern
   */
  async enqueue(
    request: NotificationRequestV2,
    options?: EnqueueOptions
  ): Promise<NotificationResultV2> {
    const startTime = Date.now();
    
    // Validate request
    this.validateRequest(request);

    const tx = options?.transaction;

    try {
      // Step 1: Authorize recipient selectors
      if (!options?.skipAuthorization) {
        const authResult = await this.recipientPolicy.authorize({
          context: {
            tenantId: request.tenantId,
            notificationType: request.type,
            purpose: request.purpose,
            severity: request.severity,
          },
          selectors: request.recipients,
        });

        if (!authResult.allowed) {
          throw new ValidationError(
            `Recipient authorization failed: ${authResult.deniedSelectors
              .map(d => d.reason)
              .join(', ')}`
          );
        }
      }

      // Step 2: Resolve recipients to principals
      const resolutionContext: RecipientResolutionContext = {
        tenantId: request.tenantId,
        notificationType: request.type,
        branchId: request.branchId,
        incidentId: request.incidentId,
        alertId: request.alertId,
        requestedChannels: request.channels,
        now: new Date(),
        severity: request.severity,
      };

      const principalResult = await this.recipientResolver.resolve(
        request.recipients,
        resolutionContext
      );

      logger.info('Principal resolution complete', {
        tenantId: request.tenantId,
        state: principalResult.state,
        principalsResolved: principalResult.principals.length,
        failures: principalResult.failures.length,
      });

      // Check if we have any principals
      if (principalResult.principals.length === 0) {
        throw new ValidationError(
          `No recipients could be resolved. Failures: ${principalResult.failures
            .map(f => `${f.code}: ${f.message}`)
            .join('; ')}`
        );
      }

      // Step 3: Resolve principals to delivery endpoints
      const endpointResult = await this.endpointResolver.resolve(
        principalResult.principals,
        resolutionContext
      );

      logger.info('Endpoint resolution complete', {
        tenantId: request.tenantId,
        endpointsResolved: endpointResult.endpoints.length,
        warnings: endpointResult.warnings.length,
      });

      // Step 4: Filter endpoints by user preferences (unless skipped)
      let finalEndpoints = endpointResult.endpoints;
      
      if (!options?.skipPreferences) {
        const filteredByUser: DeliveryEndpoint[] = [];
        
        // Group endpoints by user for efficient preference filtering
        const endpointsByUser = this.groupEndpointsByUser(finalEndpoints);
        
        for (const [userId, userEndpoints] of endpointsByUser) {
          if (!userId) {
            // External endpoints (no user ID) - include as-is
            filteredByUser.push(...userEndpoints);
            continue;
          }

          const filtered = await this.recipientPolicy.filterEndpoints({
            tenantId: request.tenantId,
            userId,
            notificationType: request.type,
            severity: request.severity,
            purpose: request.purpose,
            endpoints: userEndpoints,
          });

          filteredByUser.push(...filtered);
        }
        
        finalEndpoints = filteredByUser;
      }

      // Check if we have any endpoints after filtering
      if (finalEndpoints.length === 0) {
        logger.warn('No endpoints available after preference filtering', {
          tenantId: request.tenantId,
          notificationType: request.type,
          originalEndpoints: endpointResult.endpoints.length,
        });

        throw new ValidationError(
          'No delivery endpoints available after preference filtering'
        );
      }

      // Step 5: Create logical notification record
      const notification = await this.repository.createNotification(
        {
          tenantId: request.tenantId,
          type: request.type,
          sourceType: request.source?.type,
          sourceId: request.source?.id,
          title: request.title || request.subject || 'Notification',
          body: request.body,
          metadata: {
            ...request.metadata,
            purpose: request.purpose,
            severity: request.severity,
            resolutionMetadata: {
              principalsResolved: principalResult.principals.length,
              endpointsResolved: endpointResult.endpoints.length,
              principalFailures: principalResult.failures.length,
              endpointWarnings: endpointResult.warnings.length,
            },
          },
        },
        tx
      );

      // Step 6: Create delivery jobs for each endpoint
      const deliveryIds: string[] = [];
      const endpointsByChannel = this.groupEndpointsByChannel(finalEndpoints);

      for (const channel of request.channels) {
        const channelEndpoints = endpointsByChannel.get(channel) || [];
        
        for (const endpoint of channelEndpoints) {
          const delivery = await this.repository.createDelivery(
            {
              notificationId: notification.id,
              tenantId: request.tenantId,
              channel,
              destination: endpoint.address,
              subject: request.subject,
              title: request.title,
              body: request.body,
              templateId: request.templateId,
              templateData: request.templateData,
              metadata: {
                ...request.metadata,
                endpointId: endpoint.id,
                principalId: endpoint.principalId,
                verified: endpoint.verification.state === 'VERIFIED',
                provenance: endpoint.provenance,
              },
              priority: request.priority || 'normal',
              status: 'pending',
              idempotencyKey: request.idempotencyKey,
              maxAttempts: this.getMaxAttempts(channel),
              nextAttemptAt: new Date(),
            },
            tx
          );

          deliveryIds.push(delivery.id);
        }
      }

      const durationMs = Date.now() - startTime;

      logger.info('Notification enqueued successfully', {
        notificationId: notification.id,
        tenantId: request.tenantId,
        type: request.type,
        channels: request.channels,
        deliveries: deliveryIds.length,
        durationMs,
      });

      return {
        notificationId: notification.id,
        deliveryIds,
        status: 'queued',
        resolution: {
          principalsResolved: principalResult.principals.length,
          endpointsResolved: endpointResult.endpoints.length,
          principalFailures: principalResult.failures.length,
          endpointWarnings: endpointResult.warnings.length,
        },
      };
    } catch (error) {
      logger.error('Failed to enqueue notification', {
        error,
        tenantId: request.tenantId,
        type: request.type,
      });
      throw error;
    }
  }

  // =====================================================
  // Existing NotificationService interface methods
  // =====================================================

  async getNotification(
    notificationId: string,
    tenantId: string
  ): Promise<Notification | null> {
    return this.repository.findNotification(notificationId, tenantId);
  }

  async getDeliveryStatus(
    deliveryId: string,
    tenantId: string
  ): Promise<NotificationDelivery | null> {
    return this.repository.findDelivery(deliveryId, tenantId);
  }

  async getDeliveries(
    notificationId: string,
    tenantId: string
  ): Promise<NotificationDelivery[]> {
    return this.repository.findDeliveriesByNotification(notificationId, tenantId);
  }

  async cancelDelivery(
    deliveryId: string,
    tenantId: string
  ): Promise<boolean> {
    const delivery = await this.repository.findDelivery(deliveryId, tenantId);
    
    if (!delivery) {
      return false;
    }

    if (delivery.status !== 'pending' && delivery.status !== 'retry_wait') {
      return false;
    }

    await this.repository.updateDeliveryStatus(
      deliveryId,
      'cancelled',
      {}
    );

    logger.info('Delivery cancelled', {
      deliveryId,
      tenantId,
    });

    return true;
  }

  // =====================================================
  // Private Helper Methods
  // =====================================================

  private validateRequest(request: NotificationRequestV2): void {
    if (!request.tenantId) {
      throw new ValidationError('tenantId is required');
    }

    if (!request.type) {
      throw new ValidationError('type is required');
    }

    if (!request.purpose) {
      throw new ValidationError('purpose is required');
    }

    if (!request.severity) {
      throw new ValidationError('severity is required');
    }

    if (!request.channels || request.channels.length === 0) {
      throw new ValidationError('At least one channel is required');
    }

    if (!request.body) {
      throw new ValidationError('body is required');
    }

    if (!request.recipients || request.recipients.length === 0) {
      throw new ValidationError('At least one recipient selector is required');
    }
  }

  private groupEndpointsByUser(
    endpoints: DeliveryEndpoint[]
  ): Map<string | undefined, DeliveryEndpoint[]> {
    const map = new Map<string | undefined, DeliveryEndpoint[]>();

    for (const endpoint of endpoints) {
      const userId = endpoint.principalId;
      const existing = map.get(userId) || [];
      existing.push(endpoint);
      map.set(userId, existing);
    }

    return map;
  }

  private groupEndpointsByChannel(
    endpoints: DeliveryEndpoint[]
  ): Map<string, DeliveryEndpoint[]> {
    const map = new Map<string, DeliveryEndpoint[]>();

    for (const endpoint of endpoints) {
      const channel = endpoint.channel;
      const existing = map.get(channel) || [];
      existing.push(endpoint);
      map.set(channel, existing);
    }

    return map;
  }

  private getMaxAttempts(channel: string): number {
    switch (channel) {
      case 'EMAIL':
        return 5;
      case 'SMS':
        return 3;
      case 'PUSH':
        return 3;
      case 'WEBHOOK':
        return 5;
      case 'IN_APP':
        return 1;
      default:
        return 3;
    }
  }
}
