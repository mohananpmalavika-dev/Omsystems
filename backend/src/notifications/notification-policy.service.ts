/**
 * Notification Policy Service
 * 
 * Implements tenant-level policies for notification routing:
 * - Event type → channel mapping
 * - Cooldown/suppression
 * - Severity filtering
 * - Future: escalation rules
 */

import { Pool } from 'pg';
import {
  NotificationRequest,
  NotificationChannel,
  PolicyEvaluationResult,
  IPolicyEngine
} from './notification.types.js';
import { NotificationRepository } from './notification.repository.js';
import { logger } from '../utils/logger.js';

export class NotificationPolicyService implements IPolicyEngine {
  constructor(
    private readonly pool: Pool,
    private readonly repository: NotificationRepository
  ) {}

  /**
   * Evaluate notification request against tenant policies
   * 
   * Returns:
   * - shouldSend: whether notification should be sent
   * - channels: which channels to use (may be modified by policy)
   * - reason: why notification was suppressed (if applicable)
   * - cooldownUntil: when notification can be sent again
   */
  async evaluate(
    request: NotificationRequest
  ): Promise<PolicyEvaluationResult> {
    try {
      // Get tenant policies
      const policies = await this.repository.getTenantPolicies(
        request.tenantId
      );

      // Find matching policy for event type
      const matchingPolicy = policies.find(
        p => p.eventType === request.type
      );

      if (!matchingPolicy) {
        // No policy defined, allow with requested channels
        return {
          shouldSend: true,
          channels: request.channels
        };
      }

      // Check cooldown
      const cooldownCheck = await this.checkCooldown(
        request,
        matchingPolicy.cooldownSeconds
      );

      if (!cooldownCheck.canSend) {
        return {
          shouldSend: false,
          channels: [],
          reason: 'cooldown_active',
          cooldownUntil: cooldownCheck.cooldownUntil
        };
      }

      // Apply policy channels (override request if policy is more restrictive)
      const policyChannels = matchingPolicy.channels as NotificationChannel[];
      const allowedChannels = request.channels.filter(ch =>
        policyChannels.includes(ch)
      );

      if (allowedChannels.length === 0) {
        return {
          shouldSend: false,
          channels: [],
          reason: 'no_channels_allowed_by_policy'
        };
      }

      return {
        shouldSend: true,
        channels: allowedChannels
      };
    } catch (error) {
      logger.error('Policy evaluation failed', {
        tenantId: request.tenantId,
        type: request.type,
        error
      });

      // On error, fail open (allow notification)
      return {
        shouldSend: true,
        channels: request.channels
      };
    }
  }

  /**
   * Check if notification is within cooldown period
   */
  private async checkCooldown(
    request: NotificationRequest,
    cooldownSeconds: number
  ): Promise<{
    canSend: boolean;
    cooldownUntil?: Date;
  }> {
    if (cooldownSeconds === 0) {
      return { canSend: true };
    }

    try {
      // Build cooldown key based on notification type and context
      const cooldownKey = this.buildCooldownKey(request);

      // Check for recent notifications with same key
      const result = await this.pool.query(
        `SELECT MAX(created_at) as last_sent
        FROM notifications
        WHERE tenant_id = $1
          AND type = $2
          AND metadata->>'cooldown_key' = $3
          AND created_at > NOW() - ($4 || ' seconds')::INTERVAL`,
        [
          request.tenantId,
          request.type,
          cooldownKey,
          cooldownSeconds
        ]
      );

      if (result.rows.length > 0 && result.rows[0].last_sent) {
        const lastSent = new Date(result.rows[0].last_sent);
        const cooldownUntil = new Date(
          lastSent.getTime() + cooldownSeconds * 1000
        );

        if (cooldownUntil > new Date()) {
          logger.debug('Notification suppressed by cooldown', {
            tenantId: request.tenantId,
            type: request.type,
            cooldownKey,
            cooldownUntil
          });

          return {
            canSend: false,
            cooldownUntil
          };
        }
      }

      return { canSend: true };
    } catch (error) {
      logger.error('Cooldown check failed', {
        tenantId: request.tenantId,
        type: request.type,
        error
      });

      // On error, allow notification
      return { canSend: true };
    }
  }

  /**
   * Build cooldown key from notification context
   * 
   * This determines what makes notifications "the same" for cooldown purposes.
   * For example:
   * - camera_offline: tenant + camera_id
   * - intrusion_detected: tenant + camera_id
   * - prediction_alert: tenant + branch_id
   */
  private buildCooldownKey(request: NotificationRequest): string {
    const parts: string[] = [request.tenantId, request.type];

    // Add context-specific identifiers from metadata
    const metadata = request.metadata || {};

    // Common identifiers
    if (metadata.cameraId) {
      parts.push(`camera:${metadata.cameraId}`);
    }
    if (metadata.branchId) {
      parts.push(`branch:${metadata.branchId}`);
    }
    if (metadata.deviceId) {
      parts.push(`device:${metadata.deviceId}`);
    }

    return parts.join(':');
  }

  /**
   * Create default policies for a tenant
   */
  async createDefaultPolicies(tenantId: string): Promise<void> {
    const defaultPolicies = [
      // Critical alerts: all channels, no cooldown
      {
        eventType: 'fire_detected',
        channels: ['email', 'sms', 'push', 'in_app'],
        cooldownSeconds: 0
      },
      {
        eventType: 'intrusion_detected',
        channels: ['email', 'push', 'in_app'],
        cooldownSeconds: 300 // 5 minutes
      },

      // System events: moderate frequency
      {
        eventType: 'camera_offline',
        channels: ['push', 'in_app'],
        cooldownSeconds: 900 // 15 minutes
      },
      {
        eventType: 'recording_stopped',
        channels: ['email', 'in_app'],
        cooldownSeconds: 600 // 10 minutes
      },

      // Predictive alerts: email + in-app
      {
        eventType: 'prediction_alert',
        channels: ['email', 'in_app'],
        cooldownSeconds: 3600 // 1 hour
      },

      // Low-priority events: in-app only
      {
        eventType: 'storage_warning',
        channels: ['in_app'],
        cooldownSeconds: 3600 // 1 hour
      }
    ];

    try {
      for (const policy of defaultPolicies) {
        await this.pool.query(
          `INSERT INTO notification_policies (
            tenant_id,
            event_type,
            enabled,
            channels,
            cooldown_seconds
          ) VALUES ($1, $2, true, $3, $4)
          ON CONFLICT (tenant_id, event_type) DO NOTHING`,
          [
            tenantId,
            policy.eventType,
            JSON.stringify(policy.channels),
            policy.cooldownSeconds
          ]
        );
      }

      logger.info('Default notification policies created', {
        tenantId,
        policyCount: defaultPolicies.length
      });
    } catch (error) {
      logger.error('Failed to create default policies', {
        tenantId,
        error
      });
      throw error;
    }
  }
}
