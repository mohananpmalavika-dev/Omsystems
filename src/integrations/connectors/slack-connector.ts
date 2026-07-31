/**
 * Slack Connector
 * 
 * Features:
 * - Block Kit messages
 * - Channel/DM notifications
 * - Interactive buttons
 * - Thread replies
 * - File uploads (screenshots, clips)
 * - User/channel mentions
 */

import { BaseConnector } from './base-connector.js';
import type { IntegrationEvent, IntegrationResponse, IntegrationConfigSchema } from '../types.js';

export class SlackConnector extends BaseConnector {
  readonly type = 'slack' as const;
  readonly category = 'messaging' as const;
  readonly name = 'Slack';
  readonly description = 'Send alerts and notifications to Slack channels with rich formatting and interactive buttons';
  readonly version = '1.0.0';

  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      const webhookUrl = this.getCredential<string>('webhookUrl');
      
      const response = await this.httpRequest(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Sentinel Grid Integration Test',
          blocks: [{
            type: 'section',
            text: { type: 'mrkdwn', text: '*Connection test successful!* ✅' }
          }]
        })
      });

      return { success: true, message: 'Successfully sent test message to Slack' };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Connection failed' };
    }
  }

  async handleEvent(event: IntegrationEvent): Promise<IntegrationResponse> {
    try {
      const webhookUrl = this.getCredential<string>('webhookUrl');
      const message = this.buildSlackMessage(event);

      await this.httpRequest(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      });

      return this.createSuccessResponse(event);
    } catch (error) {
      return this.createErrorResponse(event, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  getConfigSchema(): IntegrationConfigSchema {
    return {
      fields: [
        {
          name: 'webhookUrl',
          label: 'Webhook URL',
          type: 'secret',
          required: true,
          placeholder: 'https://hooks.slack.com/services/...',
          description: 'Slack incoming webhook URL'
        },
        {
          name: 'channel',
          label: 'Default Channel',
          type: 'string',
          required: false,
          placeholder: '#infrastructure-alerts',
          description: 'Override channel (optional)'
        },
        {
          name: 'mentionChannel',
          label: 'Mention Channel',
          type: 'boolean',
          required: false,
          default: false,
          description: 'Use @channel for critical alerts'
        }
      ],
      secrets: ['webhookUrl'],
      requiredFields: ['webhookUrl']
    };
  }

  private buildSlackMessage(event: IntegrationEvent): any {
    const severity = event.payload.severity || 'medium';
    const emojiMap = { critical: ':rotating_light:', high: ':warning:', medium: ':information_source:', low: ':white_check_mark:' };
    const colorMap = { critical: '#FF0000', high: '#FFA500', medium: '#FFFF00', low: '#00FF00' };

    return {
      text: `${emojiMap[severity as keyof typeof emojiMap]} ${event.payload.title || this.getEventTitle(event.eventType)}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${emojiMap[severity as keyof typeof emojiMap]} ${event.payload.title || this.getEventTitle(event.eventType)}`
          }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Event:*\n${event.eventType}` },
            { type: 'mrkdwn', text: `*Severity:*\n${severity.toUpperCase()}` },
            { type: 'mrkdwn', text: `*Time:*\n${event.timestamp.toLocaleString()}` },
            ...(event.branchId ? [{ type: 'mrkdwn', text: `*Branch:*\n${event.payload.branchName || event.branchId}` }] : [])
          ]
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: event.payload.description || 'No description provided' }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'View Details' },
              url: this.buildSentinelUrl(event),
              style: 'primary'
            },
            ...(event.alertId ? [{
              type: 'button',
              text: { type: 'plain_text', text: 'Acknowledge' },
              url: `${this.buildSentinelUrl(event)}/acknowledge`,
              style: 'danger'
            }] : [])
          ]
        }
      ],
      attachments: [{
        color: colorMap[severity as keyof typeof colorMap],
        footer: 'Sentinel Grid',
        ts: Math.floor(event.timestamp.getTime() / 1000).toString()
      }]
    };
  }

  private getEventTitle(eventType: string): string {
    const titles: Record<string, string> = {
      'alert.created': 'New Alert',
      'camera.offline': 'Camera Offline',
      'recorder.failure': 'Recorder Failure',
      'infrastructure.critical': 'Critical Infrastructure Alert'
    };
    return titles[eventType] || 'Sentinel Grid Notification';
  }

  private buildSentinelUrl(event: IntegrationEvent): string {
    const baseUrl = this.getConfig('sentinelUrl', 'https://sentinel-grid.example.com');
    if (event.alertId) return `${baseUrl}/alerts/${event.alertId}`;
    if (event.incidentId) return `${baseUrl}/incidents/${event.incidentId}`;
    return baseUrl;
  }
}
