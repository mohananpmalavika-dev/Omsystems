/**
 * Enterprise Integration Hub - Type Definitions
 * 
 * Provides a vendor-neutral, plugin-based architecture for integrating
 * with external systems including IAM, ITSM, messaging, SIEM, and industrial protocols.
 */

export type IntegrationCategory = 
  | 'identity'
  | 'itsm'
  | 'messaging'
  | 'siem'
  | 'monitoring'
  | 'industrial'
  | 'enterprise_app'
  | 'webhook';

export type IntegrationType =
  // Identity & Access Management
  | 'active_directory'
  | 'ldap'
  | 'azure_ad'
  | 'okta'
  | 'saml'
  | 'oauth2'
  | 'openid_connect'
  // ITSM
  | 'servicenow'
  | 'jira'
  // Messaging
  | 'microsoft_teams'
  | 'slack'
  | 'whatsapp_business'
  | 'telegram'
  // SIEM
  | 'splunk'
  | 'qradar'
  | 'microsoft_sentinel'
  | 'elastic_security'
  // Monitoring
  | 'syslog'
  | 'snmp'
  // Industrial
  | 'mqtt'
  | 'bacnet'
  | 'modbus'
  | 'opcua'
  // Enterprise Apps
  | 'sap'
  | 'oracle'
  // Generic
  | 'webhook';

export type IntegrationStatus = 'active' | 'inactive' | 'error' | 'testing';

export type IntegrationEventType =
  // Authentication events
  | 'user.login'
  | 'user.logout'
  | 'user.failed_login'
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  // Alert events
  | 'alert.created'
  | 'alert.acknowledged'
  | 'alert.escalated'
  | 'alert.resolved'
  | 'alert.closed'
  // Infrastructure events
  | 'camera.offline'
  | 'camera.online'
  | 'recorder.failure'
  | 'switch.down'
  | 'ups.power_loss'
  | 'infrastructure.critical'
  // Incident events
  | 'incident.created'
  | 'incident.updated'
  | 'incident.resolved'
  // Compliance events
  | 'evidence.exported'
  | 'evidence.accessed'
  | 'policy.changed'
  | 'configuration.changed'
  // RCA events
  | 'rca.investigation_started'
  | 'rca.root_cause_identified'
  | 'rca.correlation_found';

export interface IntegrationConfig {
  id: string;
  tenantId: string;
  name: string;
  type: IntegrationType;
  category: IntegrationCategory;
  status: IntegrationStatus;
  enabled: boolean;
  
  // Configuration
  config: Record<string, any>;
  credentials: Record<string, any>;
  
  // Event subscription
  subscribedEvents: IntegrationEventType[];
  
  // Retry and error handling
  retryConfig?: {
    maxRetries: number;
    retryDelayMs: number;
    backoffMultiplier: number;
  };
  
  // Rate limiting
  rateLimitConfig?: {
    maxRequestsPerMinute: number;
    burstSize: number;
  };
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  lastSuccessAt?: Date;
  lastErrorAt?: Date;
  lastError?: string;
}

export interface IntegrationEvent {
  id: string;
  tenantId: string;
  eventType: IntegrationEventType;
  timestamp: Date;
  
  // Event data
  payload: Record<string, any>;
  
  // Context
  userId?: string;
  cameraId?: string;
  branchId?: string;
  alertId?: string;
  incidentId?: string;
  
  // Source
  sourceSystem: string;
  sourceIp?: string;
}

export interface IntegrationResponse {
  success: boolean;
  integrationId: string;
  eventId: string;
  timestamp: Date;
  externalId?: string; // ID in external system (ticket number, message ID, etc.)
  externalUrl?: string; // Link to external resource
  response?: any;
  error?: string;
  retryCount?: number;
}

export interface IntegrationConnector {
  readonly type: IntegrationType;
  readonly category: IntegrationCategory;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  
  // Lifecycle methods
  initialize(config: IntegrationConfig): Promise<void>;
  destroy(): Promise<void>;
  
  // Health check
  testConnection(): Promise<{ success: boolean; message: string; details?: any }>;
  
  // Event handling
  handleEvent(event: IntegrationEvent): Promise<IntegrationResponse>;
  
  // Configuration schema
  getConfigSchema(): IntegrationConfigSchema;
}

export interface IntegrationConfigSchema {
  fields: IntegrationConfigField[];
  secrets: string[]; // Field names that should be encrypted
  requiredFields: string[];
  documentation?: string;
}

export interface IntegrationConfigField {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'url' | 'email' | 'secret' | 'select' | 'multiselect' | 'json';
  required: boolean;
  default?: any;
  placeholder?: string;
  description?: string;
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    options?: string[];
  };
}

export interface IAMSyncResult {
  usersCreated: number;
  usersUpdated: number;
  usersDisabled: number;
  groupsMapped: number;
  errors: string[];
  syncDuration: number;
}

export interface IAMUser {
  externalId: string;
  username: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  title?: string;
  manager?: string;
  groups: string[];
  active: boolean;
}

export interface TicketCreationRequest {
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  assignedTo?: string;
  tags?: string[];
  customFields?: Record<string, any>;
  attachments?: {
    filename: string;
    contentType: string;
    data: Buffer;
  }[];
}

export interface TicketCreationResponse {
  ticketId: string;
  ticketUrl: string;
  ticketNumber: string;
}

export interface MessageRequest {
  channel: string;
  text: string;
  attachments?: {
    title?: string;
    text?: string;
    imageUrl?: string;
    color?: string;
    fields?: { title: string; value: string; short?: boolean }[];
  }[];
  buttons?: {
    text: string;
    url?: string;
    action?: string;
    value?: string;
  }[];
}

export interface SIEMEvent {
  timestamp: Date;
  eventType: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  source: string;
  sourceIp?: string;
  userId?: string;
  username?: string;
  resourceId?: string;
  resourceType?: string;
  action: string;
  outcome: 'success' | 'failure';
  message: string;
  details: Record<string, any>;
}

export interface IndustrialDataPoint {
  timestamp: Date;
  deviceId: string;
  metric: string;
  value: number | string | boolean;
  unit?: string;
  quality?: 'good' | 'uncertain' | 'bad';
}

export interface WebhookDelivery {
  id: string;
  integrationId: string;
  eventId: string;
  url: string;
  method: 'POST' | 'PUT' | 'PATCH';
  headers: Record<string, string>;
  payload: any;
  status: 'pending' | 'sent' | 'failed' | 'retrying';
  httpStatus?: number;
  response?: any;
  error?: string;
  attempts: number;
  createdAt: Date;
  sentAt?: Date;
}
