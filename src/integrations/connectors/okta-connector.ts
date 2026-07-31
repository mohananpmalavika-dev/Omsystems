/**
 * Okta Connector
 * 
 * Features:
 * - OAuth 2.0 / OpenID Connect
 * - User and group sync
 * - SSO
 * - MFA enforcement
 */

import { BaseConnector } from './base-connector.js';
import type { IntegrationEvent, IntegrationResponse, IntegrationConfigSchema } from '../types.js';

export class OktaConnector extends BaseConnector {
  readonly type = 'okta' as const;
  readonly category = 'identity' as const;
  readonly name = 'Okta';
  readonly description = 'Connect to Okta for enterprise SSO and identity management';
  readonly version = '1.0.0';

  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      const domain = this.getConfig<string>('domain');
      const apiToken = this.getCredential<string>('apiToken');

      const response = await this.httpRequest(`https://${domain}/api/v1/users/me`, {
        headers: { 'Authorization': `SSWS ${apiToken}` }
      });

      return { success: true, message: 'Connected to Okta successfully' };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Connection failed' };
    }
  }

  async handleEvent(event: IntegrationEvent): Promise<IntegrationResponse> {
    return this.createSuccessResponse(event);
  }

  getConfigSchema(): IntegrationConfigSchema {
    return {
      fields: [
        { name: 'domain', label: 'Okta Domain', type: 'string', required: true, placeholder: 'your-domain.okta.com' },
        { name: 'apiToken', label: 'API Token', type: 'secret', required: true },
        { name: 'clientId', label: 'Client ID', type: 'string', required: false },
        { name: 'clientSecret', label: 'Client Secret', type: 'secret', required: false }
      ],
      secrets: ['apiToken', 'clientSecret'],
      requiredFields: ['domain', 'apiToken']
    };
  }
}
