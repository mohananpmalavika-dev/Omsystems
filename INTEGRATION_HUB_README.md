# Sentinel Grid - Enterprise Integration Hub

## Overview

The Enterprise Integration Hub provides a vendor-neutral, plugin-based architecture for connecting Sentinel Grid with external enterprise systems. It enables seamless integration with identity providers, ITSM platforms, messaging services, SIEM systems, and industrial protocols.

## Architecture

```
                    Sentinel Grid
                          │
                 Integration Hub
                          │
         ┌────────────────┼────────────────┐
         │                │                │
    Connectors      Event Router    Plugin Registry
         │                │                │
    ┌────┴────┐      ┌────┴────┐      ┌────┴────┐
    │         │      │         │      │         │
Identity   ITSM   Messaging  SIEM   Industrial
```

### Key Components

1. **Integration Manager** - Event routing, retry logic, queue processing
2. **Connector Registry** - Plugin discovery and lifecycle management
3. **Base Connector** - Abstract class with rate limiting and HTTP helpers
4. **Event System** - Pub/sub architecture for integration triggers

## Available Integrations

### Identity & Access Management (IAM)

#### 1. Active Directory / LDAP
- **Features**: User authentication, group sync, role mapping
- **Use Case**: On-premises identity management
- **Configuration**:
  ```json
  {
    "url": "ldap://ldap.example.com:389",
    "baseDN": "dc=example,dc=com",
    "bindDN": "cn=admin,dc=example,dc=com",
    "bindPassword": "***",
    "userSearchBase": "ou=users,dc=example,dc=com",
    "roleMapping": {
      "cn=admins,ou=groups": "global_admin",
      "cn=operators,ou=groups": "branch_operator"
    }
  }
  ```

#### 2. Azure Active Directory (Microsoft Entra ID)
- **Features**: OAuth 2.0/OIDC, Graph API, conditional access, MFA
- **Use Case**: Cloud-first organizations using Microsoft 365
- **Configuration**:
  ```json
  {
    "tenantId": "00000000-0000-0000-0000-000000000000",
    "clientId": "00000000-0000-0000-0000-000000000000",
    "clientSecret": "***",
    "syncGroups": true,
    "roleMapping": {
      "Sentinel-Admins": "global_admin",
      "Sentinel-Operators": "branch_operator"
    }
  }
  ```

#### 3. SAML 2.0
- **Features**: Generic SSO, attribute mapping, single logout
- **Supported IdPs**: Okta, OneLogin, Auth0, Ping Identity, ADFS
- **Configuration**:
  ```json
  {
    "idpEntityId": "https://idp.example.com/metadata",
    "idpSsoUrl": "https://idp.example.com/sso",
    "idpCertificate": "-----BEGIN CERTIFICATE-----...",
    "spEntityId": "https://sentinel-grid.example.com/saml/metadata",
    "spAcsUrl": "https://sentinel-grid.example.com/saml/acs",
    "attributeMapping": {
      "email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
      "groups": "http://schemas.xmlsoap.org/claims/Group"
    }
  }
  ```

#### 4. Okta
- **Features**: OAuth 2.0, user/group sync, MFA enforcement
- **Configuration**:
  ```json
  {
    "domain": "your-domain.okta.com",
    "apiToken": "***",
    "clientId": "***",
    "clientSecret": "***"
  }
  ```

### IT Service Management (ITSM)

#### 1. ServiceNow
- **Features**: Auto-incident creation, SLA tracking, two-way sync, RCA integration
- **Use Case**: Enterprise incident management
- **Event Mapping**:
  - `camera.offline` → ServiceNow Incident
  - `recorder.failure` → ServiceNow Incident
  - `infrastructure.critical` → P1 Incident
  - `rca.root_cause_identified` → Work Notes update

- **Configuration**:
  ```json
  {
    "instanceUrl": "https://yourinstance.service-now.com",
    "username": "sentinel_api",
    "password": "***",
    "assignmentGroup": "Infrastructure Team",
    "category": "Infrastructure",
    "priority": "medium",
    "autoResolve": true,
    "fieldMapping": {
      "branchName": "u_branch",
      "cameraSerial": "u_camera_serial"
    }
  }
  ```

#### 2. Jira
- **Features**: Issue creation, epic/story/task tracking, sprint integration
- **Use Case**: Engineering and maintenance task tracking
- **Configuration**:
  ```json
  {
    "baseUrl": "https://yourcompany.atlassian.net",
    "email": "sentinel@example.com",
    "apiToken": "***",
    "projectKey": "INFRA",
    "issueType": "Task",
    "labels": ["infrastructure", "automated"]
  }
  ```

### Messaging & Collaboration

#### 1. Microsoft Teams
- **Features**: Adaptive cards, channel messages, interactive buttons, @mentions
- **Use Case**: Real-time alerting for operations teams
- **Configuration**:
  ```json
  {
    "webhookUrl": "https://outlook.office.com/webhook/...",
    "mentionUsers": "admin@example.com,ops@example.com",
    "includeScreenshot": true
  }
  ```

#### 2. Slack
- **Features**: Block Kit messages, thread replies, file uploads, buttons
- **Use Case**: DevOps and NOC alerts
- **Configuration**:
  ```json
  {
    "webhookUrl": "https://hooks.slack.com/services/...",
    "channel": "#infrastructure-alerts",
    "mentionChannel": true
  }
  ```

#### 3. WhatsApp Business
- **Features**: Critical alerts to management, location sharing, images
- **Use Case**: Executive notifications, field technician alerts
- **Configuration**:
  ```json
  {
    "phoneNumberId": "1234567890",
    "accessToken": "***",
    "recipients": "+919876543210,+919876543211",
    "severityFilter": "high"
  }
  ```

### SIEM & Security

#### 1. Splunk
- **Features**: HTTP Event Collector (HEC), structured logging, CEF/JSON
- **Use Case**: Security event correlation and compliance
- **Configuration**:
  ```json
  {
    "hecUrl": "https://splunk.example.com:8088",
    "hecToken": "***",
    "index": "sentinel",
    "sourcetype": "sentinel:grid:event"
  }
  ```

#### 2. Syslog
- **Features**: RFC 5424/3164, UDP/TCP/TLS, facility/severity mapping
- **Use Case**: Central logging infrastructure
- **Configuration**:
  ```json
  {
    "host": "syslog.example.com",
    "port": 514,
    "protocol": "udp",
    "format": "rfc5424",
    "facility": "local0"
  }
  ```

### Industrial Protocols

#### 1. MQTT
- **Features**: Pub/sub messaging, QoS levels, retained messages
- **Use Case**: IoT device integration, sensor data
- **Configuration**:
  ```json
  {
    "brokerUrl": "mqtt://broker.example.com:1883",
    "username": "sentinel",
    "password": "***",
    "topicPrefix": "sentinel",
    "qos": 1
  }
  ```

## Event Types

### Authentication Events
- `user.login` - User successfully logged in
- `user.logout` - User logged out
- `user.failed_login` - Failed login attempt
- `user.created` - New user created
- `user.updated` - User information updated
- `user.deleted` - User account deleted

### Alert Events
- `alert.created` - New alert generated
- `alert.acknowledged` - Alert acknowledged by operator
- `alert.escalated` - Alert escalated to higher priority
- `alert.resolved` - Alert marked as resolved
- `alert.closed` - Alert closed

### Infrastructure Events
- `camera.offline` - Camera lost connection
- `camera.online` - Camera reconnected
- `recorder.failure` - Recording server failed
- `switch.down` - Network switch failure
- `ups.power_loss` - UPS on battery power
- `infrastructure.critical` - Critical infrastructure issue

### RCA Events
- `rca.investigation_started` - Root cause analysis started
- `rca.root_cause_identified` - Root cause determined
- `rca.correlation_found` - Infrastructure correlation found

## API Reference

### List Available Connectors
```
GET /v1/integrations/connectors
```

**Response:**
```json
{
  "data": [
    {
      "type": "azure_ad",
      "category": "identity",
      "name": "Azure Active Directory",
      "description": "Connect to Microsoft Entra ID...",
      "version": "1.0.0",
      "configSchema": { ... }
    }
  ]
}
```

### Create Integration
```
POST /v1/integrations
```

**Request:**
```json
{
  "name": "Production Azure AD",
  "type": "azure_ad",
  "category": "identity",
  "config": {
    "tenantId": "...",
    "clientId": "...",
    "syncGroups": true
  },
  "credentials": {
    "clientSecret": "***"
  },
  "subscribedEvents": [
    "user.login",
    "user.created",
    "user.updated"
  ]
}
```

### Test Integration
```
POST /v1/integrations/:id/test
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully connected to Azure AD",
  "details": {
    "tenantId": "...",
    "organizationName": "Example Corp"
  }
}
```

### Enable Integration
```
POST /v1/integrations/:id/enable
```

### Get Integration Health
```
GET /v1/integrations/health
```

**Response:**
```json
{
  "data": [
    {
      "id": "...",
      "name": "Production Azure AD",
      "type": "azure_ad",
      "health_status": "healthy",
      "events_24h": 1250,
      "successful_24h": 1248,
      "failed_24h": 2,
      "success_rate_24h": 99.84
    }
  ]
}
```

## Best Practices

### Security
1. **Encrypt Credentials**: All credentials stored in `credentials` field are encrypted at rest
2. **Use Service Accounts**: Create dedicated service accounts for integrations
3. **Rotate Keys**: Regularly rotate API tokens and secrets
4. **Least Privilege**: Grant minimum required permissions
5. **Audit Logging**: All integration changes are logged in `integration_audit_log`

### Reliability
1. **Retry Logic**: Configure appropriate retry settings for each integration
2. **Rate Limiting**: Respect external API rate limits
3. **Circuit Breakers**: Failed integrations are temporarily disabled
4. **Health Monitoring**: Monitor integration health via `/v1/integrations/health`
5. **Event Queuing**: Events are queued if integration is temporarily unavailable

### Performance
1. **Async Processing**: Events are processed asynchronously
2. **Batch Operations**: Group related events where supported
3. **Connection Pooling**: Reuse connections for efficiency
4. **Caching**: Cache frequently accessed data (e.g., group memberships)

## Deployment Guide

### 1. Database Migration
```bash
npm run migrate
```

### 2. Environment Variables
```env
# Optional: External service URLs
AZURE_AD_TENANT_ID=your-tenant-id
SERVICENOW_INSTANCE=yourinstance.service-now.com
SPLUNK_HEC_URL=https://splunk.example.com:8088
```

### 3. Register Connectors
Connectors are auto-registered on application startup via `registerAllConnectors()`.

### 4. Configure Integrations
Use the API or admin UI to create and configure integrations.

### 5. Test Connectivity
```bash
curl -X POST https://api.example.com/v1/integrations/:id/test \
  -H "Authorization: Bearer $TOKEN"
```

### 6. Enable Integration
```bash
curl -X POST https://api.example.com/v1/integrations/:id/enable \
  -H "Authorization: Bearer $TOKEN"
```

## Monitoring

### Health Checks
```sql
-- View integration health
SELECT * FROM vw_integration_health
WHERE tenant_id = 'your-tenant-id';

-- Check recent failures
SELECT * FROM integration_responses
WHERE success = false
  AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC;
```

### Metrics
- Event processing rate
- Success/failure rates
- Average response time
- Queue depth
- Error distribution

## Troubleshooting

### Integration Not Working

1. **Check Status**:
   ```
   GET /v1/integrations/:id
   ```

2. **View Logs**:
   ```
   GET /v1/integrations/:id/events
   ```

3. **Test Connection**:
   ```
   POST /v1/integrations/:id/test
   ```

4. **Check Credentials**: Ensure credentials haven't expired

5. **Review Subscriptions**: Verify event type subscriptions

### Common Issues

#### Issue: "Authentication Failed"
- **Solution**: Verify credentials, check for expired tokens

#### Issue: "Rate Limit Exceeded"
- **Solution**: Adjust `rateLimitConfig` settings

#### Issue: "Connection Timeout"
- **Solution**: Check network connectivity, firewall rules

#### Issue: "Events Not Triggering"
- **Solution**: Verify event type subscription, check integration is enabled

## Extending the Integration Hub

### Creating a Custom Connector

```typescript
import { BaseConnector } from './base-connector.js';
import type { 
  IntegrationEvent, 
  IntegrationResponse, 
  IntegrationConfigSchema 
} from '../types.js';

export class CustomConnector extends BaseConnector {
  readonly type = 'custom_system' as const;
  readonly category = 'itsm' as const;
  readonly name = 'Custom System';
  readonly description = 'Connect to custom system';
  readonly version = '1.0.0';

  async testConnection(): Promise<{ 
    success: boolean; 
    message: string; 
    details?: any 
  }> {
    // Test connection logic
    return { success: true, message: 'Connected successfully' };
  }

  async handleEvent(event: IntegrationEvent): Promise<IntegrationResponse> {
    // Event handling logic
    return this.createSuccessResponse(event);
  }

  getConfigSchema(): IntegrationConfigSchema {
    return {
      fields: [
        {
          name: 'apiUrl',
          label: 'API URL',
          type: 'url',
          required: true
        },
        {
          name: 'apiKey',
          label: 'API Key',
          type: 'secret',
          required: true
        }
      ],
      secrets: ['apiKey'],
      requiredFields: ['apiUrl', 'apiKey']
    };
  }
}
```

### Register Custom Connector
```typescript
// In src/integrations/connectors/index.ts
import { CustomConnector } from './custom-connector.js';

export function registerAllConnectors(): void {
  // ... existing connectors
  connectorRegistry.register(new CustomConnector());
}
```

## Support

For issues, feature requests, or questions:
- GitHub Issues: https://github.com/sentinel-grid/integrations
- Documentation: https://docs.sentinel-grid.com/integrations
- Support: support@sentinel-grid.com

## License

Copyright © 2026 Sentinel Grid. All rights reserved.
