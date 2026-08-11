/**
 * Prediction Notification Service
 * 
 * Sends alerts for critical predictions through multiple channels
 * using the unified notification system.
 * 
 * Implements smart aggregation to prevent alert fatigue.
 * 
 * MIGRATED: Now uses NotificationService instead of email_queue/sms_queue
 */

import { Pool } from 'pg';
import { NotificationService } from '../notifications/index.js';
import { NotificationChannel as UnifiedChannel } from '../notifications/notification.types.js';
import { logger } from '../utils/logger.js';

interface NotificationChannel {
  inApp: boolean;
  email: boolean;
  sms: boolean;
  webhook: boolean;
}

interface PredictionAlert {
  predictionId: string;
  tenantId: string;
  branchName: string;
  deviceId: string;
  predictionType: string;
  probability: number;
  riskClassification: string;
  expectedFailureFrom: Date;
  hoursUntilFailure: number;
  recommendedAction: string;
  impact: {
    cameras?: number;
    recordingAtRisk: boolean;
    complianceAtRisk: boolean;
  };
}

export class PredictionNotificationService {
  constructor(
    private pool: Pool,
    private notificationService: NotificationService
  ) {}

  /**
   * Process new predictions and send alerts
   */
  async processNewPredictions(tenantId: string): Promise<void> {
    try {
      // Get unnotified critical predictions
      const predictions = await this.pool.query(
        `SELECT 
          fp.id,
          fp.tenant_id,
          fp.device_id,
          fp.prediction_type,
          fp.probability,
          fp.risk_classification,
          fp.expected_failure_from,
          fp.recommended_action,
          fp.predicted_impact,
          rn.name as branch_name,
          EXTRACT(EPOCH FROM (fp.expected_failure_from - NOW())) / 3600 as hours_until_failure
        FROM failure_predictions fp
        LEFT JOIN resource_nodes rn ON rn.id = fp.branch_node_id
        WHERE fp.tenant_id = $1
          AND fp.status = 'active'
          AND fp.risk_classification IN ('critical_risk', 'imminent_failure')
          AND fp.predicted_at >= NOW() - INTERVAL '10 minutes'
          AND NOT EXISTS (
            SELECT 1 FROM prediction_notifications pn 
            WHERE pn.prediction_id = fp.id
          )`,
        [tenantId]
      );

      if (predictions.rows.length === 0) {
        return; // No new critical predictions
      }

      // Group predictions by branch to aggregate
      const byBranch = this.groupPredictionsByBranch(predictions.rows);

      // Send notifications for each branch
      for (const [branchName, preds] of byBranch.entries()) {
        await this.sendBranchAlert(tenantId, branchName, preds);
      }

      logger.info('Prediction notifications sent', {
        tenantId,
        predictions: predictions.rows.length
      });
    } catch (error) {
      logger.error('Error processing prediction notifications', { error, tenantId });
    }
  }

  /**
   * Send aggregated alert for a branch
   * 
   * MIGRATED: Uses unified notification system with proper transactional outbox pattern
   */
  private async sendBranchAlert(
    tenantId: string,
    branchName: string,
    predictions: PredictionAlert[]
  ): Promise<void> {
    try {
      // Get notification preferences
      const channels = await this.getNotificationChannels(tenantId);

      // Get recipients
      const recipients = await this.getAlertRecipients(tenantId);

      if (recipients.length === 0) {
        logger.warn('No alert recipients configured', { tenantId });
        return;
      }

      // Determine alert severity
      const hasImminent = predictions.some(p => p.riskClassification === 'imminent_failure');
      const severity = hasImminent ? 'imminent' : 'critical';
      const priority = hasImminent ? 'critical' : 'high';

      // Build notification content
      const subject = this.buildSubject(branchName, predictions, severity);
      const body = this.buildNotificationBody(branchName, predictions);
      const smsBody = this.buildSmsMessage(branchName, predictions);

      // Convert channels to unified format
      const enabledChannels: UnifiedChannel[] = [];
      if (channels.inApp) enabledChannels.push('in_app');
      if (channels.email) enabledChannels.push('email');
      if (channels.sms && severity === 'imminent') enabledChannels.push('sms');
      // Webhook support can be added here if needed

      if (enabledChannels.length === 0) {
        logger.warn('No notification channels enabled', { tenantId });
        return;
      }

      // Send through unified notification system for each recipient
      for (const recipient of recipients) {
        try {
          // Use unified notification service
          const result = await this.notificationService.enqueue({
            tenantId,
            type: 'prediction_alert',
            channels: enabledChannels,
            recipient: {
              userId: recipient.userId,
              email: recipient.email,
              phone: recipient.phone
            },
            subject,
            title: subject,
            body: enabledChannels.includes('sms') ? smsBody : body,
            priority,
            metadata: {
              predictionIds: predictions.map(p => p.predictionId),
              branchName,
              severity,
              predictionCount: predictions.length,
              hasImminent
            },
            idempotencyKey: `prediction-alert:${branchName}:${recipient.userId}:${predictions[0].predictionId}`,
            source: {
              type: 'prediction',
              id: predictions[0].predictionId
            }
          });

          logger.debug('Prediction alert enqueued', {
            notificationId: result.notificationId,
            tenantId,
            userId: recipient.userId,
            channels: enabledChannels,
            deliveries: result.deliveryIds.length
          });
        } catch (error) {
          logger.error('Failed to enqueue prediction alert', {
            error,
            tenantId,
            userId: recipient.userId,
            branchName
          });
        }
      }

      // Record notification sent
      for (const prediction of predictions) {
        await this.recordNotificationSent(prediction.predictionId, channels);
      }
    } catch (error) {
      logger.error('Error sending branch alert', { error, branchName });
    }
  }

  // DEPRECATED: These methods are no longer used
  // The unified notification system handles delivery directly

  /**
   * @deprecated Use NotificationService instead
   */
  private async sendInAppNotification(
    userId: string,
    title: string,
    body: string,
    predictions: PredictionAlert[]
  ): Promise<void> {
    // Kept for backward compatibility during migration
    logger.warn('sendInAppNotification is deprecated, use NotificationService');
  }

  /**
   * @deprecated Use NotificationService instead
   */
  private async sendEmailNotification(
    email: string,
    subject: string,
    body: string
  ): Promise<void> {
    // Kept for backward compatibility during migration
    logger.warn('sendEmailNotification is deprecated, use NotificationService');
  }

  /**
   * @deprecated Use NotificationService instead
   */
  private async sendSmsNotification(phone: string, message: string): Promise<void> {
    // Kept for backward compatibility during migration
    logger.warn('sendSmsNotification is deprecated, use NotificationService');
  }

  /**
   * Get notification channels enabled for tenant
   */
  private async getNotificationChannels(tenantId: string): Promise<NotificationChannel> {
    try {
      const result = await this.pool.query(
        `SELECT 
          notification_settings
        FROM tenants
        WHERE id = $1`,
        [tenantId]
      );

      const settings = result.rows[0]?.notification_settings || {};
      return {
        inApp: settings.inApp !== false,
        email: settings.email !== false,
        sms: settings.sms === true,
        webhook: settings.webhook === true
      };
    } catch (error) {
      // Default to in-app only if query fails
      return { inApp: true, email: false, sms: false, webhook: false };
    }
  }

  /**
   * Get recipients for alerts
   */
  private async getAlertRecipients(tenantId: string): Promise<Array<{
    userId: string;
    email?: string;
    phone?: string;
  }>> {
    try {
      const result = await this.pool.query(
        `SELECT 
          u.id as user_id,
          u.email,
          u.phone
        FROM users u
        WHERE u.tenant_id = $1
          AND u.deleted_at IS NULL
          AND u.role IN ('admin', 'manager')
          AND u.notification_preferences->>'predictions' != 'disabled'`,
        [tenantId]
      );

      return result.rows.map(r => ({
        userId: r.user_id,
        email: r.email,
        phone: r.phone
      }));
    } catch (error) {
      logger.error('Error getting alert recipients', { error, tenantId });
      return [];
    }
  }

  /**
   * Group predictions by branch
   */
  private groupPredictionsByBranch(
    predictions: any[]
  ): Map<string, PredictionAlert[]> {
    const grouped = new Map<string, PredictionAlert[]>();

    for (const pred of predictions) {
      const branchName = pred.branch_name || 'Unknown Branch';
      if (!grouped.has(branchName)) {
        grouped.set(branchName, []);
      }

      grouped.get(branchName)!.push({
        predictionId: pred.id,
        tenantId: pred.tenant_id,
        branchName,
        deviceId: pred.device_id,
        predictionType: pred.prediction_type,
        probability: pred.probability,
        riskClassification: pred.risk_classification,
        expectedFailureFrom: pred.expected_failure_from,
        hoursUntilFailure: pred.hours_until_failure,
        recommendedAction: pred.recommended_action,
        impact: pred.predicted_impact
      });
    }

    return grouped;
  }

  /**
   * Build notification subject
   */
  private buildSubject(
    branchName: string,
    predictions: PredictionAlert[],
    severity: string
  ): string {
    if (severity === 'imminent') {
      return `🚨 URGENT: Imminent Failure Predicted - ${branchName}`;
    }
    return `⚠️ Critical: ${predictions.length} Failure${predictions.length > 1 ? 's' : ''} Predicted - ${branchName}`;
  }

  /**
   * Build notification body
   */
  private buildNotificationBody(
    branchName: string,
    predictions: PredictionAlert[]
  ): string {
    let body = `Sentinel Grid Predictive Alert\n\n`;
    body += `Branch: ${branchName}\n`;
    body += `Critical Predictions: ${predictions.length}\n\n`;

    for (const pred of predictions.slice(0, 5)) {
      body += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      body += `${this.formatPredictionType(pred.predictionType)}\n`;
      body += `Device: ${pred.deviceId}\n`;
      body += `Probability: ${Math.round(pred.probability * 100)}%\n`;
      body += `Failure Window: ${this.formatTimeWindow(pred.hoursUntilFailure)}\n`;
      
      if (pred.impact.cameras) {
        body += `Impact: ${pred.impact.cameras} cameras affected\n`;
      }
      if (pred.impact.complianceAtRisk) {
        body += `⚠️ Compliance Risk Detected\n`;
      }
      
      body += `Action: ${pred.recommendedAction}\n\n`;
    }

    if (predictions.length > 5) {
      body += `... and ${predictions.length - 5} more predictions\n\n`;
    }

    body += `View details in Sentinel Grid dashboard.\n`;
    return body;
  }

  /**
   * Build SMS message (shorter version)
   */
  private buildSmsMessage(branchName: string, predictions: PredictionAlert[]): string {
    const pred = predictions[0]; // Most critical
    return `URGENT: ${this.formatPredictionType(pred.predictionType)} predicted at ${branchName}. ` +
           `${Math.round(pred.probability * 100)}% probability in ${this.formatTimeWindow(pred.hoursUntilFailure)}. ` +
           `Action: ${pred.recommendedAction}`;
  }

  /**
   * Record notification sent
   */
  private async recordNotificationSent(
    predictionId: string,
    channels: NotificationChannel
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO prediction_notifications (
          prediction_id,
          sent_at,
          channels,
          created_at
        ) VALUES ($1, NOW(), $2, NOW())`,
        [predictionId, JSON.stringify(channels)]
      );
    } catch (error) {
      logger.error('Error recording notification', { error, predictionId });
    }
  }

  // Helper methods
  private formatPredictionType(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  private formatTimeWindow(hours: number): string {
    if (hours < 1) return 'within 1 hour';
    if (hours < 24) return `${Math.round(hours)} hours`;
    const days = Math.round(hours / 24);
    return `${days} day${days > 1 ? 's' : ''}`;
  }
}

/**
 * Initialize notification processing job (runs every 10 minutes)
 * 
 * MIGRATED: Now requires NotificationService to be passed
 */
export function initializeNotificationJob(
  pool: Pool,
  notificationService: NotificationService
): NodeJS.Timeout {
  const predictionNotificationService = new PredictionNotificationService(
    pool,
    notificationService
  );

  const interval = setInterval(async () => {
    try {
      const tenants = await pool.query(`SELECT id FROM tenants WHERE deleted_at IS NULL`);
      for (const tenant of tenants.rows) {
        await predictionNotificationService.processNewPredictions(tenant.id);
      }
    } catch (error) {
      logger.error('Error in notification job', { error });
    }
  }, 10 * 60 * 1000);

  logger.info('Prediction notification job initialized (runs every 10 minutes)');
  return interval;
}
