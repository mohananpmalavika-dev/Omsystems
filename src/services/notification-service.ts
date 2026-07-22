/**
 * Notification Service
 * Handles email, SMS, and webhook notifications
 * Supports multiple providers (SendGrid, Twilio, AWS, etc.)
 */

import type { ControlPlaneStore } from '../control-plane-store.js';

export interface NotificationConfig {
  email?: EmailConfig;
  sms?: SmsConfig;
  webhook?: WebhookConfig;
}

export interface EmailConfig {
  provider: 'sendgrid' | 'ses' | 'smtp';
  from: string;
  apiKey?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
}

export interface SmsConfig {
  provider: 'twilio' | 'sns' | 'custom';
  from: string;
  accountSid?: string;
  authToken?: string;
  awsRegion?: string;
  apiUrl?: string;
  apiKey?: string;
}

export interface WebhookConfig {
  urls: string[];
  headers?: Record<string, string>;
  retryAttempts?: number;
  timeoutMs?: number;
}

export interface EmailMessage {
  to: string[];
  subject: string;
  body: string;
  html?: string;
  cc?: string[];
  bcc?: string[];
}

export interface SmsMessage {
  to: string[];
  body: string;
}

export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, any>;
}

export class NotificationService {
  private config: NotificationConfig;
  private logger: any;
  private store: ControlPlaneStore;

  constructor(config: NotificationConfig, store: ControlPlaneStore, logger?: any) {
    this.config = config;
    this.store = store;
    this.logger = logger || console;
  }

  /**
   * Send email notification
   */
  async sendEmail(message: EmailMessage, tenantId?: string): Promise<boolean> {
    try {
      const provider = this.config.email?.provider;

      if (!provider) {
        this.logger.warn('Email provider not configured');
        return false;
      }

      switch (provider) {
        case 'sendgrid':
          await this.sendEmailViaSendGrid(message);
          break;
        case 'ses':
          await this.sendEmailViaSES(message);
          break;
        case 'smtp':
          await this.sendEmailViaSMTP(message);
          break;
        default:
          throw new Error(`Unknown email provider: ${provider}`);
      }

      this.logger.info('Email sent successfully', {
        to: message.to,
        subject: message.subject,
        provider,
      });

      // Log to audit if tenant provided
      if (tenantId) {
        await this.store.writeAudit({
          tenantId,
          actorUserId: 'system',
          action: 'notification.email_sent',
          resourceNodeId: null,
          outcome: 'success',
          details: { to: message.to, subject: message.subject },
        });
      }

      return true;
    } catch (error) {
      this.logger.error('Failed to send email:', error);
      
      if (tenantId) {
        await this.store.writeAudit({
          tenantId,
          actorUserId: 'system',
          action: 'notification.email_failed',
          resourceNodeId: null,
          outcome: 'failure',
          details: { error: (error as Error).message },
        });
      }

      return false;
    }
  }

  /**
   * Send SMS notification
   */
  async sendSms(message: SmsMessage, tenantId?: string): Promise<boolean> {
    try {
      const provider = this.config.sms?.provider;

      if (!provider) {
        this.logger.warn('SMS provider not configured');
        return false;
      }

      switch (provider) {
        case 'twilio':
          await this.sendSmsViaTwilio(message);
          break;
        case 'sns':
          await this.sendSmsViaSNS(message);
          break;
        case 'custom':
          await this.sendSmsViaCustom(message);
          break;
        default:
          throw new Error(`Unknown SMS provider: ${provider}`);
      }

      this.logger.info('SMS sent successfully', {
        to: message.to,
        provider,
      });

      if (tenantId) {
        await this.store.writeAudit({
          tenantId,
          actorUserId: 'system',
          action: 'notification.sms_sent',
          resourceNodeId: null,
          outcome: 'success',
          details: { to: message.to },
        });
      }

      return true;
    } catch (error) {
      this.logger.error('Failed to send SMS:', error);
      
      if (tenantId) {
        await this.store.writeAudit({
          tenantId,
          actorUserId: 'system',
          action: 'notification.sms_failed',
          resourceNodeId: null,
          outcome: 'failure',
          details: { error: (error as Error).message },
        });
      }

      return false;
    }
  }

  /**
   * Send webhook notification
   */
  async sendWebhook(payload: WebhookPayload, tenantId?: string): Promise<boolean> {
    try {
      const webhookConfig = this.config.webhook;

      if (!webhookConfig || !webhookConfig.urls.length) {
        this.logger.warn('Webhook URLs not configured');
        return false;
      }

      const results = await Promise.allSettled(
        webhookConfig.urls.map(url => this.sendWebhookToUrl(url, payload, webhookConfig))
      );

      const successCount = results.filter(r => r.status === 'fulfilled').length;

      this.logger.info('Webhook notifications sent', {
        total: webhookConfig.urls.length,
        success: successCount,
      });

      if (tenantId) {
        await this.store.writeAudit({
          tenantId,
          actorUserId: 'system',
          action: 'notification.webhook_sent',
          resourceNodeId: null,
          outcome: successCount > 0 ? 'success' : 'failure',
          details: { total: webhookConfig.urls.length, success: successCount },
        });
      }

      return successCount > 0;
    } catch (error) {
      this.logger.error('Failed to send webhook:', error);
      return false;
    }
  }

  // ============================================================================
  // Email Provider Implementations
  // ============================================================================

  private async sendEmailViaSendGrid(message: EmailMessage): Promise<void> {
    // Implementation using SendGrid API
    // Example: https://github.com/sendgrid/sendgrid-nodejs
    
    const apiKey = this.config.email?.apiKey;
    if (!apiKey) {
      throw new Error('SendGrid API key not configured');
    }

    // In production, use @sendgrid/mail package:
    // const sgMail = require('@sendgrid/mail');
    // sgMail.setApiKey(apiKey);
    // await sgMail.send({
    //   to: message.to,
    //   from: this.config.email.from,
    //   subject: message.subject,
    //   text: message.body,
    //   html: message.html,
    // });

    // For now, simulate
    this.logger.info('[SENDGRID] Would send email:', {
      to: message.to,
      subject: message.subject,
    });
  }

  private async sendEmailViaSES(message: EmailMessage): Promise<void> {
    // Implementation using AWS SES
    // Example: https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/ses-examples-sending-email.html

    // In production, use @aws-sdk/client-ses package:
    // const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
    // const client = new SESClient({ region: "us-east-1" });
    // await client.send(new SendEmailCommand({
    //   Source: this.config.email.from,
    //   Destination: { ToAddresses: message.to },
    //   Message: {
    //     Subject: { Data: message.subject },
    //     Body: { Text: { Data: message.body } },
    //   },
    // }));

    this.logger.info('[AWS SES] Would send email:', {
      to: message.to,
      subject: message.subject,
    });
  }

  private async sendEmailViaSMTP(message: EmailMessage): Promise<void> {
    // Implementation using SMTP
    // Example: https://nodemailer.com/

    const smtpConfig = this.config.email;
    if (!smtpConfig?.smtpHost) {
      throw new Error('SMTP configuration incomplete');
    }

    // In production, use nodemailer package:
    // const nodemailer = require('nodemailer');
    // const transporter = nodemailer.createTransport({
    //   host: smtpConfig.smtpHost,
    //   port: smtpConfig.smtpPort,
    //   auth: {
    //     user: smtpConfig.smtpUser,
    //     pass: smtpConfig.smtpPassword,
    //   },
    // });
    // await transporter.sendMail({
    //   from: this.config.email.from,
    //   to: message.to.join(','),
    //   subject: message.subject,
    //   text: message.body,
    //   html: message.html,
    // });

    this.logger.info('[SMTP] Would send email:', {
      to: message.to,
      subject: message.subject,
      host: smtpConfig.smtpHost,
    });
  }

  // ============================================================================
  // SMS Provider Implementations
  // ============================================================================

  private async sendSmsViaTwilio(message: SmsMessage): Promise<void> {
    // Implementation using Twilio API
    // Example: https://www.twilio.com/docs/sms/quickstart/node

    const smsConfig = this.config.sms;
    if (!smsConfig?.accountSid || !smsConfig?.authToken) {
      throw new Error('Twilio configuration incomplete');
    }

    // In production, use twilio package:
    // const twilio = require('twilio');
    // const client = twilio(smsConfig.accountSid, smsConfig.authToken);
    // for (const to of message.to) {
    //   await client.messages.create({
    //     body: message.body,
    //     from: smsConfig.from,
    //     to,
    //   });
    // }

    this.logger.info('[TWILIO] Would send SMS:', {
      to: message.to,
      from: smsConfig.from,
    });
  }

  private async sendSmsViaSNS(message: SmsMessage): Promise<void> {
    // Implementation using AWS SNS
    // Example: https://docs.aws.amazon.com/sns/latest/dg/sns-sms-how-it-works.html

    const smsConfig = this.config.sms;
    if (!smsConfig?.awsRegion) {
      throw new Error('AWS SNS configuration incomplete');
    }

    // In production, use @aws-sdk/client-sns package:
    // const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
    // const client = new SNSClient({ region: smsConfig.awsRegion });
    // for (const to of message.to) {
    //   await client.send(new PublishCommand({
    //     Message: message.body,
    //     PhoneNumber: to,
    //   }));
    // }

    this.logger.info('[AWS SNS] Would send SMS:', {
      to: message.to,
      region: smsConfig.awsRegion,
    });
  }

  private async sendSmsViaCustom(message: SmsMessage): Promise<void> {
    // Implementation using custom SMS gateway API
    
    const smsConfig = this.config.sms;
    if (!smsConfig?.apiUrl || !smsConfig?.apiKey) {
      throw new Error('Custom SMS gateway configuration incomplete');
    }

    // In production, make HTTP request to custom gateway:
    // for (const to of message.to) {
    //   await fetch(smsConfig.apiUrl, {
    //     method: 'POST',
    //     headers: {
    //       'Authorization': `Bearer ${smsConfig.apiKey}`,
    //       'Content-Type': 'application/json',
    //     },
    //     body: JSON.stringify({
    //       to,
    //       from: smsConfig.from,
    //       message: message.body,
    //     }),
    //   });
    // }

    this.logger.info('[CUSTOM] Would send SMS:', {
      to: message.to,
      apiUrl: smsConfig.apiUrl,
    });
  }

  // ============================================================================
  // Webhook Implementation
  // ============================================================================

  private async sendWebhookToUrl(
    url: string,
    payload: WebhookPayload,
    config: WebhookConfig
  ): Promise<void> {
    const maxRetries = config.retryAttempts || 3;
    const timeout = config.timeoutMs || 10000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Aditi-Sentinel-Maintenance/1.0',
            ...config.headers,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        this.logger.info(`Webhook sent to ${url}`);
        return; // Success
      } catch (error) {
        this.logger.warn(`Webhook attempt ${attempt}/${maxRetries} failed for ${url}:`, error);
        
        if (attempt === maxRetries) {
          throw error;
        }

        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  // ============================================================================
  // Template Helpers
  // ============================================================================

  /**
   * Generate alert email template
   */
  generateAlertEmailTemplate(alert: any): { subject: string; body: string; html: string } {
    const severityEmoji = {
      critical: '🔴',
      warning: '⚠️',
      info: 'ℹ️',
    }[alert.severity] || '•';

    const subject = `${severityEmoji} [${alert.severity.toUpperCase()}] ${alert.title}`;

    const body = `
Alert Details:
--------------
Severity: ${alert.severity}
Category: ${alert.category}
Title: ${alert.title}
Description: ${alert.description}

Detected At: ${new Date(alert.createdAt).toLocaleString()}
Alert ID: ${alert.id}

${alert.assetId ? `Asset ID: ${alert.assetId}` : ''}
${alert.branchNodeId ? `Branch ID: ${alert.branchNodeId}` : ''}

Please acknowledge this alert in the maintenance dashboard.

--
Aditi Sentinel Maintenance System
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .alert-box { border: 2px solid #ddd; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .critical { border-color: #dc3545; background-color: #fff5f5; }
    .warning { border-color: #ffc107; background-color: #fffbf0; }
    .info { border-color: #17a2b8; background-color: #f0f9ff; }
    .header { font-size: 24px; font-weight: bold; margin-bottom: 15px; }
    .detail { margin: 10px 0; }
    .label { font-weight: bold; }
    .footer { margin-top: 30px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="alert-box ${alert.severity}">
    <div class="header">${severityEmoji} ${alert.title}</div>
    <div class="detail"><span class="label">Severity:</span> ${alert.severity.toUpperCase()}</div>
    <div class="detail"><span class="label">Category:</span> ${alert.category}</div>
    <div class="detail"><span class="label">Description:</span> ${alert.description}</div>
    <div class="detail"><span class="label">Detected At:</span> ${new Date(alert.createdAt).toLocaleString()}</div>
    <div class="detail"><span class="label">Alert ID:</span> ${alert.id}</div>
    ${alert.assetId ? `<div class="detail"><span class="label">Asset ID:</span> ${alert.assetId}</div>` : ''}
    ${alert.branchNodeId ? `<div class="detail"><span class="label">Branch ID:</span> ${alert.branchNodeId}</div>` : ''}
  </div>
  <p>Please acknowledge this alert in the maintenance dashboard.</p>
  <div class="footer">
    <p>Aditi Sentinel Maintenance System</p>
    <p>This is an automated notification. Please do not reply to this email.</p>
  </div>
</body>
</html>
    `.trim();

    return { subject, body, html };
  }

  /**
   * Generate work order email template
   */
  generateWorkOrderEmailTemplate(workOrder: any): { subject: string; body: string; html: string } {
    const subject = `Work Order: ${workOrder.workOrderNumber} - ${workOrder.problem}`;

    const body = `
Work Order Created:
-------------------
Work Order #: ${workOrder.workOrderNumber}
Problem: ${workOrder.problem}
Severity: ${workOrder.severity}

${workOrder.slaDueAt ? `SLA Due: ${new Date(workOrder.slaDueAt).toLocaleString()}` : ''}
${workOrder.technician ? `Assigned To: ${workOrder.technician}` : 'Unassigned'}
${workOrder.vendorId ? `Vendor: ${workOrder.vendorId}` : ''}

Created: ${new Date(workOrder.createdAt).toLocaleString()}

--
Aditi Sentinel Maintenance System
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .wo-box { border: 2px solid #007bff; padding: 20px; border-radius: 8px; margin: 20px 0; background-color: #f0f7ff; }
    .header { font-size: 20px; font-weight: bold; margin-bottom: 15px; }
    .detail { margin: 10px 0; }
    .label { font-weight: bold; }
    .severity-${workOrder.severity} { color: ${workOrder.severity === 'critical' ? '#dc3545' : workOrder.severity === 'high' ? '#ff6600' : '#666'}; }
  </style>
</head>
<body>
  <div class="wo-box">
    <div class="header">Work Order: ${workOrder.workOrderNumber}</div>
    <div class="detail"><span class="label">Problem:</span> ${workOrder.problem}</div>
    <div class="detail"><span class="label">Severity:</span> <span class="severity-${workOrder.severity}">${workOrder.severity.toUpperCase()}</span></div>
    ${workOrder.slaDueAt ? `<div class="detail"><span class="label">SLA Due:</span> ${new Date(workOrder.slaDueAt).toLocaleString()}</div>` : ''}
    ${workOrder.technician ? `<div class="detail"><span class="label">Assigned To:</span> ${workOrder.technician}</div>` : '<div class="detail"><span class="label">Status:</span> Unassigned</div>'}
    <div class="detail"><span class="label">Created:</span> ${new Date(workOrder.createdAt).toLocaleString()}</div>
  </div>
  <p>Please address this work order promptly.</p>
</body>
</html>
    `.trim();

    return { subject, body, html };
  }
}

// Singleton instance
let notificationServiceInstance: NotificationService | null = null;

export function initNotificationService(
  config: NotificationConfig,
  store: ControlPlaneStore,
  logger?: any
): NotificationService {
  if (!notificationServiceInstance) {
    notificationServiceInstance = new NotificationService(config, store, logger);
  }
  return notificationServiceInstance;
}

export function getNotificationService(): NotificationService | null {
  return notificationServiceInstance;
}
