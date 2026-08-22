/**
 * Notification Service
 * 
 * Main entry point for enqueueing notifications
 * Implements transactional outbox pattern
 */

import { PoolClient } from 'pg';
import {
  NotificationRequest,
  NotificationResult,
  NotificationChannel,
  EnqueueOptions,
  INotificationService,
  Notification,
  NotificationDelivery,
  ResolvedRecipient
} from './notification.types.js';
import { NotificationRepository } from './notification.repository.js';
import { ValidationError } from './notification.errors.js';
import { logger } from '../utils/logger.js';

export class NotificationService implements INotificationService {
  constructor(
    private readonly repository: NotificationRepository
  ) {}

  /**
   * Enqueue notification for delivery
   * 
   * This is the main producer-facing interface.
   * Accepts notification request and durably persists it for worker processing.
   * 
   * Supports transactional outbox: pass a transaction to make notification
   * persistence atomic with domain event persistence.
   */
  async enqueue(
    request: NotificationRequest,
    options?: EnqueueOptions
  ): Promise<NotificationResult> {
    // Validate request
    this.validateRequest(request);

    const tx = options?.transaction as PoolClient | undefined;

    try {
      // Create logical notification
      const notification = await this.repository.createNotification(
        {
          tenantId: request.tenantId,
          type: request.type,
          sourceType: request.source?.type,
          sourceId: request.source?.id,
          title: request.title || request.subject || 'Notification',
          body: request.body,
          metadata: request.metadata || {}
        },
        tx
      );

      // Resolve recipient to actual destinations
      const resolved = await this.resolveRecipient(request);

      // Create delivery jobs for each channel
      const deliveryIds: string[] = [];
      
      for (const channel of request.channels) {
        const destinations = this.getDestinationsForChannel(channel, resolved);
        
        for (const destination of destinations) {
          const delivery = await this.repository.createDelivery(
            {
              notificationId: notification.id,
              tenantId: request.tenantId,
              channel,
              destination,
              subject: request.subject,
              title: request.title,
              body: request.body,
              templateId: request.templateId,
              templateData: request.templateData,
              metadata: request.metadata || {},
              priority: request.priority || 'normal',
              status: 'pending',
              idempotencyKey: request.idempotencyKey,
              maxAttempts: this.getMaxAttempts(channel),
              nextAttemptAt: new Date()
            },
            tx
          );

          deliveryIds.push(delivery.id);
        }
      }

      logger.info('Notification enqueued', {
        notificationId: notification.id,
        tenantId: request.tenantId,
        type: request.type,
        channels: request.channels,
        deliveries: deliveryIds.length
      });

      return {
        notificationId: notification.id,
        deliveryIds,
        status: 'queued'
      };
    } catch (error) {
      logger.error('Failed to enqueue notification', {
        error,
        tenantId: request.tenantId,
        type: request.type
      });
      throw error;
    }
  }

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
      return false; // Can only cancel pending deliveries
    }

    await this.repository.updateDeliveryStatus(
      deliveryId,
      'cancelled',
      {}
    );

    logger.info('Delivery cancelled', {
      deliveryId,
      tenantId
    });

    return true;
  }

  // =====================================================
  // Private Helper Methods
  // =====================================================

  private validateRequest(request: NotificationRequest): void {
    if (!request.tenantId) {
      throw new ValidationError('tenantId is required');
    }

    if (!request.type) {
      throw new ValidationError('type is required');
    }

    if (!request.channels || request.channels.length === 0) {
      throw new ValidationError('At least one channel is required');
    }

    if (!request.body) {
      throw new ValidationError('body is required');
    }

    if (!request.recipient) {
      throw new ValidationError('recipient is required');
    }

    // Validate at least one recipient identifier
    const { userId, email, phone, pushToken, webhookUrl } = request.recipient;
    if (!userId && !email && !phone && !pushToken && !webhookUrl) {
      throw new ValidationError(
        'recipient must have at least one of: userId, email, phone, pushToken, or webhookUrl'
      );
    }

    // Validate channels match recipient capabilities
    for (const channel of request.channels) {
      switch (channel) {
        case 'email':
          if (!userId && !email) {
            throw new ValidationError('email channel requires userId or email');
          }
          break;
        case 'sms':
          if (!userId && !phone) {
            throw new ValidationError('sms channel requires userId or phone');
          }
          break;
        case 'push':
          if (!userId && !pushToken) {
            throw new ValidationError('push channel requires userId or pushToken');
          }
          break;
        case 'webhook':
          if (!webhookUrl) {
            throw new ValidationError('webhook channel requires webhookUrl');
          }
          break;
        case 'in_app':
          if (!userId) {
            throw new ValidationError('in_app channel requires userId');
          }
          break;
      }
    }
  }

  /**
   * Resolve recipient specification to actual contact information
   * 
   * This is simplified for now - a full implementation would:
   * - Query user table for email/phone when only userId provided
   * - Look up push devices from user_push_devices
   * - Apply notification preferences
   * - Handle notification groups/roles
   */
  private async resolveRecipient(
    request: NotificationRequest
  ): Promise<ResolvedRecipient> {
    const { recipient } = request;

    // Pass through direct addresses if supplied
    const resolved: ResolvedRecipient = {
      userId: recipient.userId,
      email: recipient.email,
      phone: recipient.phone,
      pushTokens: recipient.pushToken ? [recipient.pushToken] : [],
      webhookUrl: recipient.webhookUrl
    };

    // When userId provided, perform authoritative profile and verified endpoint lookup
    if (recipient.userId) {
      const { userDirectoryService } = await import("../../src/notifications/application/user-directory.service.js");
      const profile = await userDirectoryService.getNotificationProfile(request.tenantId, recipient.userId);
      if (profile) {
        if (!resolved.email && profile.email?.verified && profile.email.enabled) {
          resolved.email = profile.email.value;
        }
        if (!resolved.phone && profile.phone?.verified && profile.phone.enabled) {
          resolved.phone = profile.phone.value;
        }
        if (resolved.pushTokens.length === 0 && profile.pushDevices.length > 0) {
          resolved.pushTokens = profile.pushDevices.filter((d) => d.verified && d.enabled).map((d) => d.value);
        }
      }
    }

    return resolved;
  }

  /**
   * Extract destinations for a specific channel
   */
  private getDestinationsForChannel(
    channel: NotificationChannel,
    resolved: ResolvedRecipient
  ): string[] {
    switch (channel) {
      case 'email':
        return resolved.email ? [resolved.email] : [];
      
      case 'sms':
        return resolved.phone ? [resolved.phone] : [];
      
      case 'push':
        return resolved.pushTokens;
      
      case 'webhook':
        return resolved.webhookUrl ? [resolved.webhookUrl] : [];
      
      case 'in_app':
        return resolved.userId ? [resolved.userId] : [];
      
      default:
        return [];
    }
  }

  /**
   * Get maximum retry attempts for channel
   */
  private getMaxAttempts(channel: NotificationChannel): number {
    switch (channel) {
      case 'email':
        return 5;
      case 'sms':
        return 3; // SMS is expensive
      case 'push':
        return 3;
      case 'webhook':
        return 5;
      case 'in_app':
        return 1; // In-app rarely fails
      default:
        return 3;
    }
  }
}
