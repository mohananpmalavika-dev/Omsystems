/**
 * In-App Notification Provider
 * 
 * Writes notifications to database for display in app
 */

import { Pool } from 'pg';
import {
  NotificationProvider,
  DeliveryRequest,
  DeliveryResult
} from '../notification.types.js';
import { DeliveryError } from '../notification.errors.js';
import { logger } from '../../utils/logger.js';

export class InAppProvider implements NotificationProvider {
  readonly channel = 'in_app' as const;
  readonly name = 'in-app';

  constructor(private readonly pool: Pool) {}

  async send(request: DeliveryRequest): Promise<DeliveryResult> {
    try {
      const userId = request.destination;

      const result = await this.pool.query(
        `INSERT INTO notifications (
          user_id,
          title,
          message,
          type,
          priority,
          metadata,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id`,
        [
          userId,
          request.title || 'Notification',
          request.body,
          request.metadata?.type || 'system',
          this.mapPriority(request.metadata?.priority as string),
          JSON.stringify(request.metadata || {})
        ]
      );

      const notificationId = result.rows[0].id;

      logger.debug('In-app notification created', {
        deliveryId: request.id,
        userId,
        notificationId
      });

      return {
        providerMessageId: notificationId,
        status: 'delivered', // In-app is immediately visible
        metadata: {
          notificationId
        }
      };
    } catch (error) {
      logger.error('In-app notification failed', {
        deliveryId: request.id,
        userId: request.destination,
        error
      });

      throw new DeliveryError(
        `In-app notification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        true, // Retryable
        'IN_APP_ERROR'
      );
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch (error) {
      logger.error('In-app provider health check failed', { error });
      return false;
    }
  }

  private mapPriority(priority?: string): string {
    if (!priority) return 'normal';
    
    const map: Record<string, string> = {
      critical: 'high',
      high: 'high',
      normal: 'normal',
      low: 'low'
    };

    return map[priority] || 'normal';
  }
}
