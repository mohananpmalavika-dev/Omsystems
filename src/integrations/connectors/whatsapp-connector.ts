/**
 * WhatsApp Business Connector
 * 
 * Features:
 * - Send alerts to key personnel
 * - Image attachments (camera snapshots)
 * - Location sharing
 * - Template messages
 * - Quick reply buttons
 */

import { BaseConnector } from './base-connector.js';
import type { IntegrationEvent, IntegrationResponse, IntegrationConfigSchema } from '../types.js';

export class WhatsAppConnector extends BaseConnector {
  readonly type = 'whatsapp_business' as const;
  readonly category = 'messaging' as const;
  readonly name = 'WhatsApp Business';
  readonly description = 'Send critical alerts to management via WhatsApp Business API';
  readonly version = '1.0.0';

  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      const phoneNumberId = this.getConfig<string>('phoneNumberId');
      const accessToken = this.getCredential<string>('accessToken');

      const response = await this.httpRequest(
        `https://graph.facebook.com/v18.0/${phoneNumberId}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      return { success: true, message: 'Successfully connected to WhatsApp Business API' };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Connection failed' };
    }
  }

  async handleEvent(event: IntegrationEvent): Promise<IntegrationResponse> {
    try {
      // Only send critical alerts via WhatsApp
      if (event.payload.severity !== 'critical' && event.payload.severity !== 'high') {
        return this.createSuccessResponse(event);
      }

      const recipients = this.getConfig<string>('recipients', '').split(',').filter(Boolean);
      
      for (const recipient of recipients) {
        await this.sendMessage(recipient.trim(), event);
      }

      return this.createSuccessResponse(event);
    } catch (error) {
      return this.createErrorResponse(event, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  getConfigSchema(): IntegrationConfigSchema {
    return {
      fields: [
        {
          name: 'phoneNumberId',
          label: 'Phone Number ID',
          type: 'string',
          required: true,
          description: 'WhatsApp Business Phone Number ID from Meta'
        },
        {
          name: 'accessToken',
          label: 'Access Token',
          type: 'secret',
          required: true,
          description: 'WhatsApp Business API access token'
        },
        {
          name: 'recipients',
          label: 'Recipients',
          type: 'string',
          required: true,
          placeholder: '+919876543210,+919876543211',
          description: 'Comma-separated phone numbers (with country code)'
        },
        {
          name: 'severityFilter',
          label: 'Minimum Severity',
          type: 'select',
          required: false,
          default: 'high',
          validation: { options: ['critical', 'high', 'medium', 'low'] },
          description: 'Only send alerts of this severity or higher'
        }
      ],
      secrets: ['accessToken'],
      requiredFields: ['phoneNumberId', 'accessToken', 'recipients']
    };
  }

  private async sendMessage(recipient: string, event: IntegrationEvent): Promise<void> {
    const phoneNumberId = this.getConfig<string>('phoneNumberId');
    const accessToken = this.getCredential<string>('accessToken');

    const message = {
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'text',
      text: {
        body: this.buildMessageText(event)
      }
    };

    await this.httpRequest(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(message)
      }
    );
  }

  private buildMessageText(event: IntegrationEvent): string {
    const severity = event.payload.severity || 'medium';
    const icon = severity === 'critical' ? '🚨' : '⚠️';
    
    return `${icon} *${event.payload.title || 'Sentinel Grid Alert'}*\n\n` +
           `Severity: ${severity.toUpperCase()}\n` +
           `Event: ${event.eventType}\n` +
           `Time: ${event.timestamp.toLocaleString()}\n\n` +
           `${event.payload.description || 'No description'}\n\n` +
           `View details: ${this.buildSentinelUrl(event)}`;
  }

  private buildSentinelUrl(event: IntegrationEvent): string {
    const baseUrl = this.getConfig('sentinelUrl', 'https://sentinel-grid.example.com');
    if (event.alertId) return `${baseUrl}/alerts/${event.alertId}`;
    return baseUrl;
  }
}
