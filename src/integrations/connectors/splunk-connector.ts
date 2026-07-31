/**
 * Splunk Connector
 * 
 * Features:
 * - HTTP Event Collector (HEC) integration
 * - Structured event logging
 * - Custom sourcetypes
 * - Index routing
 * - CEF/JSON formats
 */

import { BaseConnector } from './base-connector.js';
import type { IntegrationEvent, IntegrationResponse, IntegrationConfigSchema, SIEMEvent } from '../types.js';

export class SplunkConnector extends BaseConnector {
  readonly type = 'splunk' as const;
  readonly category = 'siem' as const;
  readonly name = 'Splunk';
  readonly description = 'Forward security events to Splunk SIEM for correlation and analysis';
  readonly version = '1.0.0';

  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      const hecUrl = this.getConfig<string>('hecUrl');
      const hecToken = this.getCredential<string>('hecToken');

      const response = await this.httpRequest(`${hecUrl}/services/collector/health`, {
        headers: { 'Authorization': `Splunk ${hecToken}` }
      });

      return { success: true, message: 'Successfully connected to Splunk HEC' };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Connection failed' };
    }
  }

  async handleEvent(event: IntegrationEvent): Promise<IntegrationResponse> {
    try {
      const siemEvent = this.convertToSIEMEvent(event);
      await this.sendToSplunk(siemEvent);
      return this.createSuccessResponse(event);
    } catch (error) {
      return this.createErrorResponse(event, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  getConfigSchema(): IntegrationConfigSchema {
    return {
      fields: [
        {
          name: 'hecUrl',
          label: 'HEC URL',
          type: 'url',
          required: true,
          placeholder: 'https://splunk.example.com:8088',
          description: 'Splunk HTTP Event Collector URL'
        },
        {
          name: 'hecToken',
          label: 'HEC Token',
          type: 'secret',
          required: true,
          description: 'HTTP Event Collector authentication token'
        },
        {
          name: 'index',
          label: 'Index',
          type: 'string',
          required: false,
          default: 'sentinel',
          description: 'Splunk index name'
        },
        {
          name: 'sourcetype',
          label: 'Source Type',
          type: 'string',
          required: false,
          default: 'sentinel:grid:event',
          description: 'Splunk sourcetype'
        },
        {
          name: 'verifyCertificate',
          label: 'Verify SSL Certificate',
          type: 'boolean',
          required: false,
          default: true
        }
      ],
      secrets: ['hecToken'],
      requiredFields: ['hecUrl', 'hecToken']
    };
  }

  private async sendToSplunk(siemEvent: SIEMEvent): Promise<void> {
    const hecUrl = this.getConfig<string>('hecUrl');
    const hecToken = this.getCredential<string>('hecToken');
    const index = this.getConfig('index', 'sentinel');
    const sourcetype = this.getConfig('sourcetype', 'sentinel:grid:event');

    const splunkEvent = {
      time: Math.floor(siemEvent.timestamp.getTime() / 1000),
      host: 'sentinel-grid',
      source: siemEvent.source,
      sourcetype,
      index,
      event: {
        eventType: siemEvent.eventType,
        severity: siemEvent.severity,
        category: siemEvent.category,
        sourceIp: siemEvent.sourceIp,
        userId: siemEvent.userId,
        username: siemEvent.username,
        resourceId: siemEvent.resourceId,
        resourceType: siemEvent.resourceType,
        action: siemEvent.action,
        outcome: siemEvent.outcome,
        message: siemEvent.message,
        details: siemEvent.details
      }
    };

    await this.httpRequest(`${hecUrl}/services/collector/event`, {
      method: 'POST',
      headers: {
        'Authorization': `Splunk ${hecToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(splunkEvent)
    });
  }

  private convertToSIEMEvent(event: IntegrationEvent): SIEMEvent {
    const severityMap: Record<string, 'critical' | 'high' | 'medium' | 'low' | 'info'> = {
      critical: 'critical',
      high: 'high',
      medium: 'medium',
      low: 'low',
      info: 'info'
    };

    return {
      timestamp: event.timestamp,
      eventType: event.eventType,
      severity: severityMap[event.payload.severity] || 'info',
      category: this.getCategoryFromEventType(event.eventType),
      source: event.sourceSystem,
      sourceIp: event.sourceIp,
      userId: event.userId,
      username: event.payload.username,
      resourceId: event.cameraId || event.branchId || event.alertId,
      resourceType: event.cameraId ? 'camera' : event.branchId ? 'branch' : 'system',
      action: this.getActionFromEventType(event.eventType),
      outcome: event.payload.outcome || 'success',
      message: event.payload.description || event.payload.title || event.eventType,
      details: event.payload
    };
  }

  private getCategoryFromEventType(eventType: string): string {
    if (eventType.startsWith('user.')) return 'authentication';
    if (eventType.startsWith('alert.')) return 'security';
    if (eventType.startsWith('infrastructure.') || eventType.includes('offline') || eventType.includes('failure')) return 'infrastructure';
    if (eventType.startsWith('evidence.')) return 'compliance';
    return 'system';
  }

  private getActionFromEventType(eventType: string): string {
    const parts = eventType.split('.');
    return parts[parts.length - 1] || 'unknown';
  }
}
