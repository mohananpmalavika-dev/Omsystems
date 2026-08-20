/**
 * SMTP Email Provider
 * Handles email notifications via SMTP
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { BaseNotificationProvider } from './base-provider.adapter.js';
import type {
  ProviderConfig,
  NotificationMessage,
  DeliveryResult,
  SMTPConfig,
} from '../domain/notification.types.js';
import { logger } from '../../utils/logger.js';

export class SMTPEmailProvider extends BaseNotificationProvider {
  private transporter?: Transporter;
  private fromAddress?: string;
  private fromName?: string;

  constructor(providerKey: string = 'smtp-default') {
    super(providerKey, 'SMTP', 'email');
  }

  protected async doInitialize(config: ProviderConfig): Promise<void> {
    const smtpConfig = config.config as SMTPConfig;

    if (!smtpConfig.host || !smtpConfig.port) {
      throw new Error('SMTP host and port are required');
    }

    this.transporter = nodemailer.createTransporter({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure ?? (smtpConfig.port === 465),
      auth: smtpConfig.username && smtpConfig.password ? {
        user: smtpConfig.username,
        pass: smtpConfig.password,
      } : undefined,
      tls: {
        rejectUnauthorized: true,
      },
    });

    this.fromAddress = smtpConfig.fromAddress;
    this.fromName = smtpConfig.fromName || 'KryptonVision Alerts';

    // Verify connection
    try {
      await this.transporter.verify();
      logger.info('SMTP connection verified', { host: smtpConfig.host });
    } catch (error) {
      logger.error('SMTP connection failed', {
        host: smtpConfig.host,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
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

    // Validate email format
    if (!this.isValidEmail(message.recipientDestination)) {
      return {
        accepted: false,
        status: 'FAILED',
        failureCode: 'INVALID_EMAIL',
        failureReason: 'Invalid email address format',
        isPermanentFailure: true,
        timestamp: new Date(),
      };
    }

    if (!this.transporter || !this.fromAddress) {
      throw new Error('SMTP provider not properly initialized');
    }

    try {
      const info = await this.transporter.sendMail({
        from: this.fromName 
          ? `"${this.fromName}" <${this.fromAddress}>`
          : this.fromAddress,
        to: message.recipientDestination,
        subject: message.subject || 'KryptonVision Notification',
        text: message.body,
        html: this.convertToHTML(message.body),
        headers: {
          'X-Priority': '1',
          'X-MSMail-Priority': 'High',
          'Importance': 'high',
        },
      });

      return {
        accepted: true,
        providerMessageId: info.messageId,
        status: 'SENT',
        timestamp: new Date(),
      };
    } catch (error) {
      throw error;
    }
  }

  protected async doHealthCheck(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      logger.warn('SMTP health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Validate email address format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Convert plain text to simple HTML
   */
  private convertToHTML(text: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background-color: #dc2626;
      color: white;
      padding: 15px;
      border-radius: 5px 5px 0 0;
    }
    .content {
      background-color: #f9fafb;
      padding: 20px;
      border: 1px solid #e5e7eb;
      border-top: none;
      border-radius: 0 0 5px 5px;
    }
    .footer {
      margin-top: 20px;
      padding-top: 15px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
      text-align: center;
    }
    pre {
      white-space: pre-wrap;
      word-wrap: break-word;
    }
  </style>
</head>
<body>
  <div class="header">
    <h2 style="margin: 0;">KryptonVision Alert</h2>
  </div>
  <div class="content">
    <pre>${text}</pre>
  </div>
  <div class="footer">
    <p>This is an automated notification from KryptonVision.<br>
    Please do not reply to this email.</p>
  </div>
</body>
</html>
    `.trim();
  }
}
