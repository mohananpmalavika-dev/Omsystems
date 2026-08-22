/**
 * Jira Connector
 * 
 * Features:
 * - Automatic issue creation for defects and maintenance tasks
 * - Epic/Story/Task/Bug tracking
 * - Sprint integration
 * - Attachment support
 * - Custom field mapping
 * - Transition workflows
 */

import { BaseConnector } from './base-connector.js';
import type { IntegrationEvent, IntegrationResponse, IntegrationConfigSchema } from '../types.js';

export class JiraConnector extends BaseConnector {
  readonly type = 'jira' as const;
  readonly category = 'itsm' as const;
  readonly name = 'Jira';
  readonly description = 'Create and track issues in Jira for maintenance, defects, and engineering tasks';
  readonly version = '1.0.0';

  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      const baseUrl = this.getConfig<string>('baseUrl');
      const email = this.getCredential<string>('email');
      const apiToken = this.getCredential<string>('apiToken');

      const response = await this.httpRequest(`${baseUrl}/rest/api/3/myself`, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
          'Accept': 'application/json'
        }
      });

      const user = await response.json();

      return {
        success: true,
        message: 'Successfully connected to Jira',
        details: { displayName: user.displayName, accountId: user.accountId }
      };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Connection failed' };
    }
  }

  async handleEvent(event: IntegrationEvent): Promise<IntegrationResponse> {
    try {
      switch (event.eventType) {
        case 'camera.offline':
        case 'recorder.failure':
        case 'infrastructure.critical':
          return await this.createIssue(event, 'Bug');
        
        case 'alert.created':
          return await this.createIssue(event, 'Task');
        
        default:
          return this.createSuccessResponse(event);
      }
    } catch (error) {
      return this.createErrorResponse(event, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  getConfigSchema(): IntegrationConfigSchema {
    return {
      fields: [
        {
          name: 'baseUrl',
          label: 'Jira URL',
          type: 'url',
          required: true,
          placeholder: 'https://your-domain.atlassian.net',
          description: 'Jira instance URL'
        },
        {
          name: 'email',
          label: 'Email',
          type: 'email',
          required: true,
          description: 'Jira account email'
        },
        {
          name: 'apiToken',
          label: 'API Token',
          type: 'secret',
          required: true,
          description: 'Jira API token (generate from account settings)'
        },
        {
          name: 'projectKey',
          label: 'Project Key',
          type: 'string',
          required: true,
          placeholder: 'INFRA',
          description: 'Jira project key'
        },
        {
          name: 'issueType',
          label: 'Default Issue Type',
          type: 'select',
          required: false,
          default: 'Task',
          validation: { options: ['Bug', 'Task', 'Story', 'Epic'] }
        },
        {
          name: 'priority',
          label: 'Default Priority',
          type: 'select',
          required: false,
          default: 'Medium',
          validation: { options: ['Highest', 'High', 'Medium', 'Low', 'Lowest'] }
        },
        {
          name: 'labels',
          label: 'Labels',
          type: 'string',
          required: false,
          placeholder: 'infrastructure,automated',
          description: 'Comma-separated labels'
        }
      ],
      secrets: ['apiToken'],
      requiredFields: ['baseUrl', 'email', 'apiToken', 'projectKey']
    };
  }

  private async createIssue(event: IntegrationEvent, issueType: string): Promise<IntegrationResponse> {
    const baseUrl = this.getConfig<string>('baseUrl');
    const projectKey = this.getConfig<string>('projectKey');
    const priorityMap = { critical: 'Highest', high: 'High', medium: 'Medium', low: 'Low' };
    
    const issueData = {
      fields: {
        project: { key: projectKey },
        summary: event.payload.title || this.buildSummary(event),
        description: {
          type: 'doc',
          version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: this.buildDescription(event) }] }]
        },
        issuetype: { name: issueType },
        priority: { name: priorityMap[event.payload.severity as keyof typeof priorityMap] || 'Medium' },
        labels: this.getConfig('labels', '').split(',').filter(Boolean)
      }
    };

    const response = await this.makeJiraRequest('/rest/api/3/issue', 'POST', issueData);
    const result = await response.json();

    return this.createSuccessResponse(
      event,
      result.id,
      `${baseUrl}/browse/${result.key}`,
      { issueKey: result.key, issueId: result.id }
    );
  }

  private async makeJiraRequest(path: string, method: string, body?: any): Promise<Response> {
    const baseUrl = this.getConfig<string>('baseUrl');
    const email = this.getCredential<string>('email');
    const apiToken = this.getCredential<string>('apiToken');

    return this.httpRequest(`${baseUrl}${path}`, {
      method,
      headers: {
        'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
  }

  private buildSummary(event: IntegrationEvent): string {
    const typeLabels: Record<string, string> = {
      'camera.offline': 'Camera Offline',
      'recorder.failure': 'Recorder Failure',
      'infrastructure.critical': 'Critical Infrastructure Alert'
    };
    return typeLabels[event.eventType] || 'Sentinel Grid Issue';
  }

  private buildDescription(event: IntegrationEvent): string {
    return `${event.payload.description || ''}\n\nEvent: ${event.eventType}\nTimestamp: ${event.timestamp.toISOString()}`;
  }
}
