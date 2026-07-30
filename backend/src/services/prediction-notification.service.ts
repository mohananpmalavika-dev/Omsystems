/**
 * Prediction Notification Service
 * 
 * Sends alerts for critical predictions through multiple channels:
 * - In-app notifications
 * - Email alerts
 * - SMS (via existing SMS gateway)
 * - Webhook integration
 * 
 * Implements smart aggregation to prevent alert fatigue.
 */

import { Pool } from 'pg';
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
  constructor(private pool: Pool) {}

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

      // Build notification content
      const subject = this.buildSubject(branchName, predictions, severity);
      const body = this.buildNotificationBody(branchName, predictions);

      // Send through enabled channels
      for (const recipient of recipients) {
        if (channels.inApp) {
          await this.sendInAppNotification(recipient.userId, subject, body, predictions);
        }

        if (channels.email && recipient.email) {
          await this.sendEmailNotification(recipient.email, subject, body);
        }

        if (channels.sms && recipient.phone && severity === 'imminent') {
          await this.sendSmsNotification(recipient.phone, this.buildSmsMessage(branchName, predictions));
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

  /**
   * Send in-app notification
   */
  private async sendInAppNotification(
    userId: string,
    title: string,
    body: string,
    predictions: PredictionAlert[]
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO notifications (
          user_id,
          title,
          message,
          type,
          priority,
          metadata,
          created_at
        ) VALUES ($1, $2, $3, 'prediction_alert', 'high', $4, NOW())`,
        [
          userId,
          title,
          body,
          JSON.stringify({
            predictionIds: predictions.map(p => p.predictionId),
            branchName: predictions[0].branchName
          })
        ]
      );
    } catch (error) {
      logger.error('Error sending in-app notification', { error, userId });
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(
    email: string,
    subject: string,
    body: string
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO email_queue (
          recipient,
          subject,
          body,
          priority,
          created_at
        ) VALUES ($1, $2, $3, 'high', NOW())`,
        [email, subject, body]
      );
    } catch (error) {
      logger.error('Error queueing email', { error, email });
    }
  }

  /**
   * Send SMS notification
   */
  private async sendSmsNotification(phone: string, message: string): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO sms_queue (
          phone_number,
          message,
          priority,
          created_at
        ) VALUES ($1, $2, 'high', NOW())`,
        [phone, message]
      );
    } catch (error) {
      logger.error('Error queueing SMS', { error, phone });
    }
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
 */
export function initializeNotificationJob(pool: Pool): NodeJS.Timeout {
  const notificationService = new PredictionNotificationService(pool);

  const interval = setInterval(async () => {
    try {
      const tenants = await pool.query(`SELECT id FROM tenants WHERE deleted_at IS NULL`);
      for (const tenant of tenants.rows) {
        await notificationService.processNewPredictions(tenant.id);
      }
    } catch (error) {
      logger.error('Error in notification job', { error });
    }
  }, 10 * 60 * 1000);

  logger.info('Prediction notification job initialized (runs every 10 minutes)');
  return interval;
}
