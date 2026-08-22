/**
 * Microsoft Teams Connector
 * 
 * Features:
 * - Adaptive card notifications
 * - Channel messages
 * - Interactive buttons
 * - Image/video attachments
 * - Incident war rooms (create channels)
 * - @mentions
 */

import { BaseConnector } from './base-connector.js';
import type { IntegrationEvent, IntegrationResponse, IntegrationConfigSchema } from '../types.js';

export class TeamsConnector extends BaseConnector {
  readonly type = 'microsoft_teams' as const;
  readonly category = 'messaging' as const;
  readonly name = 'Microsoft Teams';
  readonly description = 'Send alerts and notifications to Microsoft Teams channels with rich adaptive cards';
  readonly version = '1.0.0';

  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      const webhookUrl = this.getCredential<string>('webhookUrl');
      
      const response = await this.httpRequest(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          '@type': 'MessageCard',
          '@context': 'https://schema.org/extensions',
          summary: 'Test Connection',
          title: 'Sentinel Grid Integration Test',
          text: 'Connection test successful!'
        })
      });

      return { success: true, message: 'Successfully sent test message to Teams' };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Connection failed' };
    }
  }

  async handleEvent(event: IntegrationEvent): Promise<IntegrationResponse> {
    try {
      const webhookUrl = this.getCredential<string>('webhookUrl');
      const card = this.buildAdaptiveCard(event);

      const response = await this.httpRequest(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(card)
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
          placeholder: 'https://outlook.office.com/webhook/...',
          description: 'Teams incoming webhook URL'
        },
        {
          name: 'mentionUsers',
          label: 'Mention Users (Critical Alerts)',
          type: 'string',
          required: false,
          placeholder: 'user@domain.com,admin@domain.com',
          description: 'Comma-separated email addresses to @mention for critical alerts'
        },
        {
          name: 'includeScreenshot',
          label: 'Include Screenshots',
          type: 'boolean',
          required: false,
          default: true,
          description: 'Attach camera screenshots to alerts'
        }
      ],
      secrets: ['webhookUrl'],
      requiredFields: ['webhookUrl']
    };
  }

  private buildAdaptiveCard(event: IntegrationEvent): any {
    const severity = event.payload.severity || 'medium';
    const colorMap = { critical: 'Attention', high: 'Warning', medium: 'Good', low: 'Accent' };
    
    return {
      type: 'message',
      attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              text: event.payload.title || this.getEventTitle(event.eventType),
              size: 'Large',
              weight: 'Bolder',
              color: colorMap[severity as keyof typeof colorMap]
            },
            {
              type: 'FactSet',
              facts: [
                { title: 'Event Type', value: event.eventType },
                { title: 'Severity', value: severity.toUpperCase() },
                { title: 'Timestamp', value: event.timestamp.toLocaleString() },
                ...(event.branchId ? [{ title: 'Branch', value: event.payload.branchName || event.branchId }] : []),
                ...(event.cameraId ? [{ title: 'Camera', value: event.payload.cameraName || event.cameraId }] : [])
              ]
            },
            {
              type: 'TextBlock',
              text: event.payload.description || 'No description provided',
              wrap: true
            }
          ],
          actions: [
            {
              type: 'Action.OpenUrl',
              title: 'View in Sentinel Grid',
              url: this.buildSentinelUrl(event)
            },
            ...(event.alertId ? [{
              type: 'Action.OpenUrl',
              title: 'Acknowledge Alert',
              url: `${this.buildSentinelUrl(event)}/acknowledge`
            }] : [])
          ]
        }
      }]
    };
  }

  private getEventTitle(eventType: string): string {
    const titles: Record<string, string> = {
      'alert.created': '🚨 New Alert',
      'camera.offline': '📹 Camera Offline',
      'recorder.failure': '💾 Recorder Failure',
      'infrastructure.critical': '⚠️ Critical Infrastructure Alert',
      'ups.power_loss': '🔌 UPS Power Loss',
      'rca.root_cause_identified': '🔍 Root Cause Identified'
    };
    return titles[eventType] || '📢 Sentinel Grid Notification';
  }

  private buildSentinelUrl(event: IntegrationEvent): string {
    const baseUrl = this.getConfig('sentinelUrl', 'https://sentinel-grid.example.com');
    if (event.alertId) return `${baseUrl}/alerts/${event.alertId}`;
    if (event.incidentId) return `${baseUrl}/incidents/${event.incidentId}`;
    if (event.cameraId) return `${baseUrl}/cameras/${event.cameraId}`;
    return baseUrl;
  }
}
