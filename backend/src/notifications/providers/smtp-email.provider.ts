/**
 * SMTP Email Provider
 * 
 * Sends emails via SMTP using nodemailer
 * Supports standard SMTP servers (no vendor lock-in)
 */

import nodemailer, { Transporter } from 'nodemailer';
import {
  NotificationProvider,
  DeliveryRequest,
  DeliveryResult,
  SmtpConfig
} from '../notification.types.js';
import { classifySmtpError } from '../notification.errors.js';
import { logger } from '../../utils/logger.js';

export class SmtpEmailProvider implements NotificationProvider {
  readonly channel = 'email' as const;
  readonly name = 'smtp';

  private transporter: Transporter;
  private fromAddress: string;

  constructor(config: SmtpConfig) {
    this.fromAddress = config.from;
    
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth
        ? {
            user: config.auth.user,
            pass: config.auth.pass
          }
        : undefined
    });

    logger.info('SMTP email provider initialized', {
      host: config.host,
      port: config.port,
      secure: config.secure,
      from: this.fromAddress
    });
  }

  async send(request: DeliveryRequest): Promise<DeliveryResult> {
    try {
      const subject = request.subject || request.title || 'Sentinel Alert';
      
      // Build email
      const mailOptions = {
        from: this.fromAddress,
        to: request.destination,
        subject,
        text: request.body,
        html: this.formatHtmlBody(request)
      };

      const info = await this.transporter.sendMail(mailOptions);

      logger.debug('Email sent via SMTP', {
        deliveryId: request.id,
        to: request.destination,
        messageId: info.messageId
      });

      return {
        providerMessageId: info.messageId,
        status: 'accepted',
        metadata: {
          response: info.response
        }
      };
    } catch (error) {
      logger.error('SMTP email send failed', {
        deliveryId: request.id,
        to: request.destination,
        error
      });

      // Throw classified error for proper retry handling
      throw classifySmtpError(error);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      logger.error('SMTP health check failed', { error });
      return false;
    }
  }

  /**
   * Format email body as HTML
   * Basic implementation - should be enhanced with templates
   */
  private formatHtmlBody(request: DeliveryRequest): string {
    const severity = request.metadata?.severity || 'normal';
    const severityColor = this.getSeverityColor(severity as string);

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      background: ${severityColor};
      color: white;
      padding: 20px;
      text-align: center;
    }
    .header h2 {
      margin: 0;
      font-size: 20px;
    }
    .content {
      padding: 30px;
    }
    .details {
      background: #f9f9f9;
      border-left: 4px solid ${severityColor};
      padding: 15px;
      margin: 20px 0;
    }
    .footer {
      background: #f5f5f5;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #666;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background: ${severityColor};
      color: white;
      text-decoration: none;
      border-radius: 4px;
      margin: 10px 5px;
    }
    .metadata {
      font-size: 12px;
      color: #666;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>${request.title || 'Sentinel Alert'}</h2>
    </div>
    <div class="content">
      <div class="details">
        ${this.escapeHtml(request.body)}
      </div>
      ${this.renderMetadata(request.metadata)}
    </div>
    <div class="footer">
      <p>This is an automated notification from Sentinel Video Analytics</p>
      <p>Tenant: ${request.tenantId}</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  private renderMetadata(metadata?: Record<string, unknown>): string {
    if (!metadata || Object.keys(metadata).length === 0) {
      return '';
    }

    const items: string[] = [];

    if (metadata.cameraId) {
      items.push(`<p><strong>Camera:</strong> ${this.escapeHtml(String(metadata.cameraId))}</p>`);
    }
    if (metadata.branchName) {
      items.push(`<p><strong>Branch:</strong> ${this.escapeHtml(String(metadata.branchName))}</p>`);
    }
    if (metadata.timestamp) {
      items.push(`<p><strong>Time:</strong> ${this.escapeHtml(String(metadata.timestamp))}</p>`);
    }

    if (items.length === 0) {
      return '';
    }

    return `<div class="metadata">${items.join('')}</div>`;
  }

  private getSeverityColor(severity: string): string {
    const colors: Record<string, string> = {
      critical: '#dc3545',
      high: '#fd7e14',
      normal: '#007bff',
      low: '#17a2b8',
      P1: '#dc3545',
      P2: '#fd7e14',
      P3: '#ffc107',
      P4: '#17a2b8',
      P5: '#6c757d'
    };
    return colors[severity] || '#007bff';
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}
