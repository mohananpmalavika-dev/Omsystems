/**
 * Integration Connectors Index
 * 
 * Central registry for all available connectors.
 * Import and register all connector implementations.
 */

import { connectorRegistry } from '../connector-registry.js';

// Identity & Access Management
import { LDAPConnector } from './ldap-connector.js';
import { AzureADConnector } from './azure-ad-connector.js';
import { SAMLConnector } from './saml-connector.js';
import { OktaConnector } from './okta-connector.js';

// ITSM
import { ServiceNowConnector } from './servicenow-connector.js';
import { JiraConnector } from './jira-connector.js';

// Messaging
import { TeamsConnector } from './teams-connector.js';
import { SlackConnector } from './slack-connector.js';
import { WhatsAppConnector } from './whatsapp-connector.js';

// SIEM & Monitoring
import { SplunkConnector } from './splunk-connector.js';
import { SyslogConnector } from './syslog-connector.js';

// Industrial
import { MQTTConnector } from './mqtt-connector.js';

/**
 * Register all available connectors
 */
export function registerAllConnectors(): void {
  // Identity & Access Management
  connectorRegistry.register(new LDAPConnector());
  connectorRegistry.register(new AzureADConnector());
  connectorRegistry.register(new SAMLConnector());
  connectorRegistry.register(new OktaConnector());

  // ITSM
  connectorRegistry.register(new ServiceNowConnector());
  connectorRegistry.register(new JiraConnector());

  // Messaging
  connectorRegistry.register(new TeamsConnector());
  connectorRegistry.register(new SlackConnector());
  connectorRegistry.register(new WhatsAppConnector());

  // SIEM & Monitoring
  connectorRegistry.register(new SplunkConnector());
  connectorRegistry.register(new SyslogConnector());

  // Industrial
  connectorRegistry.register(new MQTTConnector());
}

/**
 * Get connector metadata for marketplace
 */
export function getConnectorMetadata() {
  const connectors = connectorRegistry.getAllConnectors();
  
  return connectors.map(connector => ({
    type: connector.type,
    category: connector.category,
    name: connector.name,
    description: connector.description,
    version: connector.version,
    configSchema: connector.getConfigSchema()
  }));
}

// Auto-register on import
registerAllConnectors();
