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
  defaultRecipients?: string[];
  apiKey?: string;
  awsRegion?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
}

export interface SmsConfig {
  provider: 'twilio' | 'sns' | 'custom';
  from: string;
  defaultRecipients?: string[];
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

  async resolveRecipients(input: {
    tenantId: string;
    notificationType: string;
    severity?: string;
    branchId?: string;
    assetId?: string;
  }): Promise<{ email: string[]; sms: string[]; webhook?: string[] }> {
    return {
      email: this.config.email?.defaultRecipients ?? [],
      sms: this.config.sms?.defaultRecipients ?? [],
      webhook: [],
    };
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
    const apiKey = this.config.email?.apiKey;
    if (!apiKey) {
      throw new Error('SendGrid API key not configured');
    }
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: message.to.map((email) => ({ email })),
          cc: message.cc?.map((email) => ({ email })),
          bcc: message.bcc?.map((email) => ({ email })),
        }],
        from: { email: this.config.email!.from },
        subject: message.subject,
        content: [
          { type: 'text/plain', value: message.body },
          ...(message.html ? [{ type: 'text/html', value: message.html }] : []),
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`SendGrid delivery failed with HTTP ${response.status}`);
  }

  private async sendEmailViaSES(message: EmailMessage): Promise<void> {
    const email = this.config.email;
    if (!email?.awsRegion) throw new Error('AWS SES region not configured');
    const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');
    const client = new SESClient({ region: email.awsRegion });
    await client.send(new SendEmailCommand({
      Source: email.from,
      Destination: { ToAddresses: message.to, CcAddresses: message.cc, BccAddresses: message.bcc },
      Message: {
        Subject: { Data: message.subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: message.body, Charset: 'UTF-8' },
          ...(message.html ? { Html: { Data: message.html, Charset: 'UTF-8' } } : {}),
        },
      },
    }));
  }

  private async sendEmailViaSMTP(message: EmailMessage): Promise<void> {
    const smtpConfig = this.config.email;
    if (!smtpConfig?.smtpHost) {
      throw new Error('SMTP configuration incomplete');
    }
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtpConfig.smtpHost,
      port: smtpConfig.smtpPort ?? 587,
      secure: (smtpConfig.smtpPort ?? 587) === 465,
      ...(smtpConfig.smtpUser && smtpConfig.smtpPassword
        ? { auth: { user: smtpConfig.smtpUser, pass: smtpConfig.smtpPassword } }
        : {}),
    });
    await transporter.sendMail({
      from: smtpConfig.from,
      to: message.to,
      cc: message.cc,
      bcc: message.bcc,
      subject: message.subject,
      text: message.body,
      html: message.html,
    });
  }

  // ============================================================================
  // SMS Provider Implementations
  // ============================================================================

  private async sendSmsViaTwilio(message: SmsMessage): Promise<void> {
    const smsConfig = this.config.sms;
    if (!smsConfig?.accountSid || !smsConfig?.authToken) {
      throw new Error('Twilio configuration incomplete');
    }
    const authorization = Buffer.from(`${smsConfig.accountSid}:${smsConfig.authToken}`).toString('base64');
    for (const recipient of message.to) {
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(smsConfig.accountSid)}/Messages.json`, {
        method: 'POST',
        headers: {
          authorization: `Basic ${authorization}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: recipient, From: smsConfig.from, Body: message.body }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Twilio delivery failed with HTTP ${response.status}`);
    }
  }

  private async sendSmsViaSNS(message: SmsMessage): Promise<void> {
    const smsConfig = this.config.sms;
    if (!smsConfig?.awsRegion) {
      throw new Error('AWS SNS configuration incomplete');
    }
    const { SNSClient, PublishCommand } = await import('@aws-sdk/client-sns');
    const client = new SNSClient({ region: smsConfig.awsRegion });
    await Promise.all(message.to.map((recipient) =>
      client.send(new PublishCommand({ Message: message.body, PhoneNumber: recipient })),
    ));
  }

  private async sendSmsViaCustom(message: SmsMessage): Promise<void> {
    const smsConfig = this.config.sms;
    if (!smsConfig?.apiUrl || !smsConfig?.apiKey) {
      throw new Error('Custom SMS gateway configuration incomplete');
    }
    for (const recipient of message.to) {
      const response = await fetch(smsConfig.apiUrl, {
        method: 'POST',
        headers: { authorization: `Bearer ${smsConfig.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ to: recipient, from: smsConfig.from, message: message.body }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Custom SMS gateway failed with HTTP ${response.status}`);
    }
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
    const severityEmoji: Record<string, string> = {
      critical: '🔴',
      warning: '⚠️',
      info: 'ℹ️',
    };
    
    const emoji = severityEmoji[alert.severity] || '•';

    const subject = `${emoji} [${alert.severity.toUpperCase()}] ${alert.title}`;

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
