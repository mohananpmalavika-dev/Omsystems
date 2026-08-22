/**
 * Dashboard WebSocket Provider
 * Sends real-time notifications to dashboard via WebSocket
 */

import { BaseNotificationProvider } from './base-provider.adapter.js';
import type {
  ProviderConfig,
  NotificationMessage,
  DeliveryResult,
} from '../domain/notification.types.js';
import { logger } from '../../utils/logger.js';

export class DashboardWebSocketProvider extends BaseNotificationProvider {
  private wsConnections: Map<string, any> = new Map();

  constructor(providerKey: string = 'dashboard-websocket-default') {
    super(providerKey, 'WEBSOCKET', 'dashboard');
  }

  protected async doInitialize(config: ProviderConfig): Promise<void> {
    // WebSocket connections are managed by the main server
    // This provider just needs to know how to publish messages
    logger.info('Dashboard WebSocket provider initialized');
  }

  protected async doSend(message: NotificationMessage): Promise<DeliveryResult> {
    const validation = this.validateMessage(message);
    if (!validation.valid) {
      return {
        accepted: false,
        status: 'FAILED',
        failureCode: 'VALIDATION_ERROR',
        failureReason: validation.error,
        isPermanentFailure: true,
        timestamp: new Date(),
      };
    }

    try {
      // The recipient destination for dashboard notifications is the userId
      const userId = message.recipientDestination;

      // Build notification payload
      const notification = {
        type: 'INCIDENT_NOTIFICATION',
        id: message.metadata?.notificationId || `notif_${Date.now()}`,
        severity: message.metadata?.severity || 'P3',
        title: message.subject || 'Alert',
        message: message.body,
        incidentId: message.metadata?.incidentId,
        alertId: message.metadata?.alertId,
        branchId: message.metadata?.branchId,
        cameraId: message.metadata?.cameraId,
        timestamp: new Date().toISOString(),
        requireAcknowledgement: message.metadata?.requireAcknowledgement || false,
      };

      // In production, this would publish to Redis/EventBus
      // which the WebSocket server subscribes to
      await this.publishToEventBus(userId, notification);

      logger.info('Dashboard notification published', {
        userId,
        notificationId: notification.id,
      });

      return {
        accepted: true,
        providerMessageId: notification.id,
        status: 'DELIVERED', // Dashboard notifications are instant
        timestamp: new Date(),
      };
    } catch (error) {
      throw error;
    }
  }

  protected async doHealthCheck(): Promise<boolean> {
    // Dashboard notifications depend on WebSocket infrastructure
    // Health check would verify EventBus/Redis connectivity
    return true;
  }

  /**
   * Publish notification to event bus for WebSocket delivery
   * In production, this would use Redis Pub/Sub or similar
   */
  private async publishToEventBus(userId: string, notification: any): Promise<void> {
    // TODO: Integrate with actual event bus (Redis Pub/Sub, RabbitMQ, etc.)
    // For now, we'll log the notification
    logger.debug('Publishing to event bus', {
      channel: `user:${userId}:notifications`,
      notification,
    });

    // Example Redis integration:
    // await redis.publish(`user:${userId}:notifications`, JSON.stringify(notification));
  }

  /**
   * Register WebSocket connection for a user
   */
  registerConnection(userId: string, connection: any): void {
    this.wsConnections.set(userId, connection);
    logger.debug('WebSocket connection registered', { userId });
  }

  /**
   * Unregister WebSocket connection
   */
  unregisterConnection(userId: string): void {
    this.wsConnections.delete(userId);
    logger.debug('WebSocket connection unregistered', { userId });
  }

  /**
   * Send notification directly via WebSocket (bypass event bus)
   * Useful for testing or single-server deployments
   */
  async sendDirect(userId: string, notification: any): Promise<boolean> {
    const connection = this.wsConnections.get(userId);
    
    if (!connection || !connection.send) {
      logger.warn('No WebSocket connection for user', { userId });
      return false;
    }

    try {
      connection.send(JSON.stringify(notification));
      return true;
    } catch (error) {
      logger.error('Failed to send WebSocket message', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}
