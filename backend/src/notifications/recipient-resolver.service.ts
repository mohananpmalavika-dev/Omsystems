/**
 * Recipient Resolver Service
 * 
 * Resolves notification recipients from userId to actual contact information
 * Handles user lookup, push device resolution, and preference application
 */

import { Pool } from 'pg';
import {
  NotificationRecipient,
  ResolvedRecipient,
  IRecipientResolver,
  NotificationChannel
} from './notification.types.js';
import { NotificationRepository } from './notification.repository.js';
import { logger } from '../utils/logger.js';

export class RecipientResolverService implements IRecipientResolver {
  constructor(
    private readonly pool: Pool,
    private readonly repository: NotificationRepository
  ) {}

  /**
   * Resolve recipient specification to actual contact information
   * 
   * This handles:
   * - User lookup when only userId provided
   * - Push device enumeration
   * - Notification preference filtering
   * - Multi-device fanout
   */
  async resolve(
    recipient: NotificationRecipient,
    tenantId: string
  ): Promise<ResolvedRecipient> {
    const resolved: ResolvedRecipient = {
      userId: recipient.userId,
      email: recipient.email,
      phone: recipient.phone,
      pushTokens: recipient.pushToken ? [recipient.pushToken] : [],
      webhookUrl: recipient.webhookUrl
    };

    // If userId provided, look up contact information
    if (recipient.userId && !recipient.email && !recipient.phone) {
      try {
        const userInfo = await this.getUserContactInfo(
          recipient.userId,
          tenantId
        );

        if (userInfo) {
          resolved.email = resolved.email || userInfo.email;
          resolved.phone = resolved.phone || userInfo.phone;
        }
      } catch (error) {
        logger.error('Failed to resolve user contact info', {
          userId: recipient.userId,
          tenantId,
          error
        });
      }
    }

    // If userId provided and no pushToken, look up all devices
    if (recipient.userId && !recipient.pushToken) {
      try {
        const devices = await this.repository.getUserPushDevices(
          recipient.userId,
          tenantId
        );

        resolved.pushTokens = devices.map(d => d.pushToken);
      } catch (error) {
        logger.error('Failed to resolve push devices', {
          userId: recipient.userId,
          tenantId,
          error
        });
      }
    }

    return resolved;
  }

  /**
   * Get user contact information from database
   */
  private async getUserContactInfo(
    userId: string,
    tenantId: string
  ): Promise<{ email?: string; phone?: string } | null> {
    try {
      const result = await this.pool.query(
        `SELECT email, phone
        FROM users
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [userId, tenantId]
      );

      if (result.rows.length === 0) {
        logger.warn('User not found for recipient resolution', {
          userId,
          tenantId
        });
        return null;
      }

      return {
        email: result.rows[0].email,
        phone: result.rows[0].phone
      };
    } catch (error) {
      logger.error('Database error resolving user', {
        userId,
        tenantId,
        error
      });
      throw error;
    }
  }

  /**
   * Apply user notification preferences
   * Filters channels based on user settings
   */
  async applyPreferences(
    userId: string,
    tenantId: string,
    channels: NotificationChannel[]
  ): Promise<NotificationChannel[]> {
    try {
      const prefs = await this.repository.getUserPreferences(
        userId,
        tenantId
      );

      if (!prefs) {
        // No preferences set, allow all channels
        return channels;
      }

      // Check quiet hours
      if (prefs.quietHoursEnabled && this.isInQuietHours(prefs)) {
        logger.debug('User in quiet hours, filtering channels', {
          userId,
          tenantId
        });
        
        // During quiet hours, only allow critical in-app notifications
        return channels.filter(ch => ch === 'in_app');
      }

      // Filter by channel preferences
      const filtered = channels.filter(channel => {
        switch (channel) {
          case 'email':
            return prefs.emailEnabled;
          case 'sms':
            return prefs.smsEnabled;
          case 'push':
            return prefs.pushEnabled;
          case 'in_app':
            return true; // Always allow in-app
          case 'webhook':
            return true; // Webhooks bypass user preferences
          default:
            return false;
        }
      });

      if (filtered.length < channels.length) {
        logger.debug('Filtered channels by user preferences', {
          userId,
          tenantId,
          original: channels,
          filtered
        });
      }

      return filtered;
    } catch (error) {
      logger.error('Failed to apply preferences', {
        userId,
        tenantId,
        error
      });

      // On error, allow all channels (fail open)
      return channels;
    }
  }

  /**
   * Check if current time is in quiet hours
   */
  private isInQuietHours(prefs: {
    quietHoursStart?: string;
    quietHoursEnd?: string;
  }): boolean {
    if (!prefs.quietHoursStart || !prefs.quietHoursEnd) {
      return false;
    }

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    // Parse time strings (HH:MM format)
    const [startHour, startMin] = prefs.quietHoursStart.split(':').map(Number);
    const [endHour, endMin] = prefs.quietHoursEnd.split(':').map(Number);

    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    // Handle overnight quiet hours (e.g., 22:00 to 08:00)
    if (startTime > endTime) {
      return currentTime >= startTime || currentTime < endTime;
    }

    return currentTime >= startTime && currentTime < endTime;
  }
}
