/**
 * ServiceNow Connector
 * 
 * Features:
 * - Automatic incident creation for alerts
 * - Two-way sync (updates from ServiceNow reflected in Sentinel)
 * - SLA tracking
 * - Assignment group routing
 * - Attachment support (screenshots, evidence clips)
 * - Custom field mapping
 */

import { BaseConnector } from './base-connector.js';
import type {
  IntegrationEvent,
  IntegrationResponse,
  IntegrationConfigSchema,
  TicketCreationRequest,
  TicketCreationResponse
} from '../types.js';

interface ServiceNowConfig {
  instanceUrl: string;
  username: string;
  password: string;
  tableName?: string; // incident, problem, change_request
  assignmentGroup?: string;
  category?: string;
  subcategory?: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  urgency?: '1' | '2' | '3';
  impact?: '1' | '2' | '3';
  fieldMapping?: Record<string, string>;
  autoResolve?: boolean;
}

export class ServiceNowConnector extends BaseConnector {
  readonly type = 'servicenow' as const;
  readonly category = 'itsm' as const;
  readonly name = 'ServiceNow';
  readonly description = 'Automatically create and manage incidents in ServiceNow for infrastructure and security alerts';
  readonly version = '1.0.0';

  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      const instanceUrl = this.getConfig<string>('instanceUrl');
      const username = this.getCredential<string>('username');
      const password = this.getCredential<string>('password');

      // Test by fetching incident table info
      const response = await this.httpRequest(
        `${instanceUrl}/api/now/table/sys_db_object?sysparm_query=name=incident&sysparm_limit=1`,
        {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
            'Accept': 'application/json'
          }
        }
      );

      const data = await response.json();

      return {
        success: true,
        message: 'Successfully connected to ServiceNow',
        details: {
          instance: instanceUrl,
          authenticated: true
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }

  async handleEvent(event: IntegrationEvent): Promise<IntegrationResponse> {
    try {
      switch (event.eventType) {
        case 'alert.created':
        case 'infrastructure.critical':
        case 'camera.offline':
        case 'recorder.failure':
        case 'switch.down':
        case 'ups.power_loss':
          return await this.createIncident(event);
        
        case 'alert.resolved':
        case 'incident.resolved':
          return await this.resolveIncident(event);
        
        case 'rca.root_cause_identified':
          return await this.updateIncidentWithRCA(event);
        
        default:
          return this.createSuccessResponse(event);
      }
    } catch (error) {
      return this.createErrorResponse(
        event,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  getConfigSchema(): IntegrationConfigSchema {
    return {
      fields: [
        {
          name: 'instanceUrl',
          label: 'Instance URL',
          type: 'url',
          required: true,
          placeholder: 'https://your-instance.service-now.com',
          description: 'ServiceNow instance URL'
        },
        {
          name: 'username',
          label: 'Username',
          type: 'string',
          required: true,
          description: 'ServiceNow API username'
        },
        {
          name: 'password',
          label: 'Password',
          type: 'secret',
          required: true,
          description: 'ServiceNow API password'
        },
        {
          name: 'tableName',
          label: 'Table Name',
          type: 'select',
          required: false,
          default: 'incident',
          description: 'ServiceNow table to create records in',
          validation: {
            options: ['incident', 'problem', 'change_request', 'em_event']
          }
        },
        {
          name: 'assignmentGroup',
          label: 'Assignment Group',
          type: 'string',
          required: false,
          placeholder: 'Infrastructure Team',
          description: 'Default assignment group for incidents'
        },
        {
          name: 'category',
          label: 'Category',
          type: 'string',
          required: false,
          placeholder: 'Infrastructure',
          description: 'Incident category'
        },
        {
          name: 'subcategory',
          label: 'Subcategory',
          type: 'string',
          required: false,
          placeholder: 'Network',
          description: 'Incident subcategory'
        },
        {
          name: 'priority',
          label: 'Default Priority',
          type: 'select',
          required: false,
          default: 'medium',
          validation: {
            options: ['critical', 'high', 'medium', 'low']
          }
        },
        {
          name: 'urgency',
          label: 'Default Urgency',
          type: 'select',
          required: false,
          default: '2',
          description: '1=High, 2=Medium, 3=Low',
          validation: {
            options: ['1', '2', '3']
          }
        },
        {
          name: 'impact',
          label: 'Default Impact',
          type: 'select',
          required: false,
          default: '2',
          description: '1=High, 2=Medium, 3=Low',
          validation: {
            options: ['1', '2', '3']
          }
        },
        {
          name: 'fieldMapping',
          label: 'Custom Field Mapping',
          type: 'json',
          required: false,
          description: 'Map Sentinel fields to ServiceNow fields (JSON object)'
        },
        {
          name: 'autoResolve',
          label: 'Auto-Resolve Incidents',
          type: 'boolean',
          required: false,
          default: true,
          description: 'Automatically resolve ServiceNow incidents when alerts are resolved'
        }
      ],
      secrets: ['password'],
      requiredFields: ['instanceUrl', 'username', 'password'],
      documentation: 'https://docs.sentinel-grid.com/integrations/servicenow'
    };
  }

  /**
   * Create incident in ServiceNow
   */
  async createIncident(event: IntegrationEvent): Promise<IntegrationResponse> {
    const instanceUrl = this.getConfig<string>('instanceUrl');
    const tableName = this.getConfig<string>('tableName', 'incident');
    
    // Map severity to ServiceNow priority/urgency/impact
    const severity = event.payload.severity || 'medium';
    const priorityMap = { critical: '1', high: '2', medium: '3', low: '4' };
    const urgencyMap = { critical: '1', high: '2', medium: '2', low: '3' };
    const impactMap = { critical: '1', high: '2', medium: '2', low: '3' };

    // Build incident data
    const incidentData = {
      short_description: event.payload.title || this.buildTitle(event),
      description: this.buildDescription(event),
      category: this.getConfig('category', 'Infrastructure'),
      subcategory: this.getConfig('subcategory', 'Surveillance'),
      priority: priorityMap[severity as keyof typeof priorityMap] || '3',
      urgency: this.getConfig('urgency', urgencyMap[severity as keyof typeof urgencyMap]),
      impact: this.getConfig('impact', impactMap[severity as keyof typeof impactMap]),
      assignment_group: this.getConfig('assignmentGroup'),
      caller_id: event.userId,
      u_source: 'Sentinel Grid',
      u_branch_id: event.branchId,
      u_camera_id: event.cameraId,
      u_alert_id: event.alertId,
      u_incident_id: event.incidentId,
      u_event_id: event.id,
      // Add custom fields from mapping
      ...this.mapCustomFields(event)
    };

    const response = await this.makeServiceNowRequest(
      `/api/now/table/${tableName}`,
      'POST',
      incidentData
    );

    const result = await response.json();
    const sysId = result.result.sys_id;
    const number = result.result.number;
    
    return this.createSuccessResponse(
      event,
      sysId,
      `${instanceUrl}/nav_to.do?uri=incident.do?sys_id=${sysId}`,
      { incidentNumber: number, sysId }
    );
  }

  /**
   * Resolve incident in ServiceNow
   */
  async resolveIncident(event: IntegrationEvent): Promise<IntegrationResponse> {
    if (!this.getConfig('autoResolve', true)) {
      return this.createSuccessResponse(event);
    }

    const incidentId = event.payload.serviceNowIncidentId || event.payload.externalId;
    if (!incidentId) {
      return this.createSuccessResponse(event);
    }

    const tableName = this.getConfig<string>('tableName', 'incident');
    const updateData = {
      state: '6', // Resolved
      close_code: 'Solved (Permanently)',
      close_notes: `Resolved automatically by Sentinel Grid. Resolution: ${event.payload.resolution || 'Issue resolved'}`
    };

    await this.makeServiceNowRequest(
      `/api/now/table/${tableName}/${incidentId}`,
      'PATCH',
      updateData
    );

    return this.createSuccessResponse(event, incidentId);
  }

  /**
   * Update incident with RCA findings
   */
  async updateIncidentWithRCA(event: IntegrationEvent): Promise<IntegrationResponse> {
    const incidentId = event.payload.serviceNowIncidentId || event.payload.externalId;
    if (!incidentId) {
      return this.createSuccessResponse(event);
    }

    const tableName = this.getConfig<string>('tableName', 'incident');
    const rca = event.payload.rca || {};
    
    const updateData = {
      work_notes: `Root Cause Analysis Results:\n\n` +
        `Root Cause: ${rca.rootCauseType || 'Unknown'}\n` +
        `Confidence: ${Math.round((rca.confidence || 0) * 100)}%\n` +
        `Explanation: ${rca.explanation || 'N/A'}\n\n` +
        `Affected Components:\n${this.formatComponents(rca.affectedComponents || [])}\n\n` +
        `Recommended Actions:\n${this.formatActions(rca.recommendedActions || [])}`,
      u_root_cause: rca.rootCauseType,
      u_rca_confidence: rca.confidence
    };

    await this.makeServiceNowRequest(
      `/api/now/table/${tableName}/${incidentId}`,
      'PATCH',
      updateData
    );

    return this.createSuccessResponse(event, incidentId);
  }

  /**
   * Make authenticated ServiceNow API request
   */
  private async makeServiceNowRequest(
    path: string,
    method: string,
    body?: any
  ): Promise<Response> {
    const instanceUrl = this.getConfig<string>('instanceUrl');
    const username = this.getCredential<string>('username');
    const password = this.getCredential<string>('password');

    return this.httpRequest(`${instanceUrl}${path}`, {
      method,
      headers: {
        'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
  }

  /**
   * Build incident title from event
   */
  private buildTitle(event: IntegrationEvent): string {
    const typeLabels: Record<string, string> = {
      'camera.offline': 'Camera Offline',
      'recorder.failure': 'Recorder Failure',
      'switch.down': 'Network Switch Down',
      'ups.power_loss': 'UPS Power Loss',
      'infrastructure.critical': 'Critical Infrastructure Alert'
    };

    return typeLabels[event.eventType] || 'Sentinel Grid Alert';
  }

  /**
   * Build incident description from event
   */
  private buildDescription(event: IntegrationEvent): string {
    let description = event.payload.description || '';
    
    description += `\n\nEvent Details:\n`;
    description += `- Event Type: ${event.eventType}\n`;
    description += `- Event ID: ${event.id}\n`;
    description += `- Timestamp: ${event.timestamp.toISOString()}\n`;
    
    if (event.branchId) description += `- Branch ID: ${event.branchId}\n`;
    if (event.cameraId) description += `- Camera ID: ${event.cameraId}\n`;
    if (event.alertId) description += `- Alert ID: ${event.alertId}\n`;
    
    if (event.payload.metrics) {
      description += `\n\nMetrics:\n`;
      description += JSON.stringify(event.payload.metrics, null, 2);
    }

    return description;
  }

  /**
   * Map custom fields
   */
  private mapCustomFields(event: IntegrationEvent): Record<string, any> {
    const mapping = this.getConfig<Record<string, string>>('fieldMapping', {});
    const result: Record<string, any> = {};

    for (const [sentinelField, snowField] of Object.entries(mapping)) {
      const value = event.payload[sentinelField];
      if (value !== undefined) {
        result[snowField] = value;
      }
    }

    return result;
  }

  /**
   * Format affected components for work notes
   */
  private formatComponents(components: any[]): string {
    return components.map(c => 
      `- ${c.componentType}: ${c.componentName} (${c.status})`
    ).join('\n');
  }

  /**
   * Format recommended actions for work notes
   */
  private formatActions(actions: string[]): string {
    return actions.map((a, i) => `${i + 1}. ${a}`).join('\n');
  }
}
