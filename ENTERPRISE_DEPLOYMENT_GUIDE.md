# Enterprise Deployment Guide

## Overview

This guide covers deploying the OmSystems Sentinel Grid platform with enterprise-grade identity, security, operations, and resilience features.

---

## Prerequisites

### Infrastructure Requirements

- **Database**: PostgreSQL 14+ with pgcrypto and ltree extensions
- **Cache**: Redis 6+ (Sentinel/Cluster recommended for HA)
- **Message Queue** (optional): NATS with JetStream for multi-instance deployments
- **Object Storage** (optional): S3-compatible storage for evidence archiving
- **SIEM**: Splunk, QRadar, ArcSight, or Azure Sentinel for security event aggregation

### Identity Provider Requirements

Choose at least one:

- **SAML 2.0**: Azure AD, Okta, Auth0, OneLogin
- **OIDC**: Azure AD, Auth0, Okta, Google, Keycloak
- **LDAP/AD**: Active Directory, OpenLDAP, FreeIPA

---

## Installation Steps

### 1. Install Dependencies

```bash
npm install
```

This installs:
- `@node-saml/passport-saml` - SAML 2.0 authentication
- `openid-client` - OpenID Connect authentication
- `ldapjs` - LDAP/Active Directory authentication
- `speakeasy` - TOTP for MFA
- `qrcode` - QR code generation for TOTP
- `fast-xml-parser` - XML parsing for SAML metadata

### 2. Run Database Migrations

```bash
npm run migrate
```

This creates:
- Identity tables (SAML/OIDC/LDAP sessions, MFA configs, user groups)
- Operations tables (escalation policies, duty rosters, SLA tracking)
- Security audit tables

### 3. Configure Environment Variables

Copy `.env.example` to `.env` and configure:

#### Core Configuration

```env
HOST=0.0.0.0
PORT=8080
DATABASE_URL=postgresql://user:password@localhost:5432/sentinel
REDIS_URL=redis://localhost:6379
```

#### Identity - SAML

```env
# Enable SAML authentication
SAML_ENABLED=true

# Identity Provider Configuration
SAML_IDP_ENTITY_ID=https://sts.windows.net/{tenant-id}/
SAML_IDP_SSO_URL=https://login.microsoftonline.com/{tenant-id}/saml2
SAML_IDP_CERTIFICATE="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"

# Or fetch from metadata URL
SAML_IDP_METADATA_URL=https://login.microsoftonline.com/{tenant-id}/federationmetadata/2007-06/federationmetadata.xml

# Service Provider Configuration
SAML_SP_ENTITY_ID=https://sentinel.example.com
SAML_SP_CALLBACK_URL=https://sentinel.example.com/auth/saml/callback
SAML_SP_SLO_CALLBACK_URL=https://sentinel.example.com/auth/saml/logout/callback

# Attribute Mapping (adjust based on your IdP)
SAML_ATTR_EMAIL=http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress
SAML_ATTR_DISPLAY_NAME=http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name
SAML_ATTR_FIRST_NAME=http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname
SAML_ATTR_LAST_NAME=http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname
SAML_ATTR_GROUPS=http://schemas.microsoft.com/ws/2008/06/identity/claims/groups
```

#### Identity - OIDC

```env
# Enable OIDC authentication
OIDC_ENABLED=true

# Provider Configuration
OIDC_ISSUER=https://login.microsoftonline.com/{tenant-id}/v2.0
OIDC_CLIENT_ID=your-application-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=https://sentinel.example.com/auth/oidc/callback
OIDC_POST_LOGOUT_REDIRECT_URI=https://sentinel.example.com

# Scopes
OIDC_SCOPES=openid,profile,email,groups

# PKCE (recommended)
OIDC_USE_PKCE=true

# Attribute Mapping
OIDC_ATTR_USER_ID=sub
OIDC_ATTR_EMAIL=email
OIDC_ATTR_DISPLAY_NAME=name
OIDC_ATTR_FIRST_NAME=given_name
OIDC_ATTR_LAST_NAME=family_name
OIDC_ATTR_GROUPS=groups
```

#### Identity - LDAP/Active Directory

```env
# Enable LDAP authentication
LDAP_ENABLED=true

# Server Configuration
LDAP_URL=ldaps://ad.example.com:636
LDAP_BIND_DN=CN=ServiceAccount,OU=ServiceAccounts,DC=example,DC=com
LDAP_BIND_PASSWORD=your-service-account-password

# Search Configuration
LDAP_BASE_DN=DC=example,DC=com
LDAP_USER_SEARCH_BASE=OU=Users,DC=example,DC=com
LDAP_USER_SEARCH_FILTER=(sAMAccountName={{username}})
LDAP_USERNAME_ATTRIBUTE=sAMAccountName

# Attribute Mapping
LDAP_ATTR_EMAIL=mail
LDAP_ATTR_DISPLAY_NAME=displayName
LDAP_ATTR_FIRST_NAME=givenName
LDAP_ATTR_LAST_NAME=sn
LDAP_ATTR_MEMBER_OF=memberOf

# Connection Pool
LDAP_POOL_SIZE=5
LDAP_CONNECT_TIMEOUT=5000
```

#### MFA Configuration

```env
# Enable MFA
MFA_ENABLED=true
MFA_ENFORCED=false # Set true to require MFA for all users
MFA_ALLOWED_METHODS=totp,sms,email
MFA_GRACE_PERIOD_DAYS=7

# MFA Issuer Name (shown in authenticator apps)
MFA_ISSUER=Sentinel Grid

# SMS Provider (Twilio, MSG91, etc.)
MFA_SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_SMS_FROM_NUMBER=+1234567890

# Email Provider (for email OTP)
MFA_EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

#### SIEM Export

```env
# Enable SIEM export
SIEM_ENABLED=true
SIEM_FORMAT=cef # cef, syslog, splunk-hec, qradar-lef, azure-sentinel

# Syslog/CEF Configuration
SIEM_SYSLOG_HOST=siem.example.com
SIEM_SYSLOG_PORT=514
SIEM_SYSLOG_PROTOCOL=tcp # udp, tcp, tls
SIEM_SYSLOG_FACILITY=16 # local0 (RFC5424)

# Splunk HEC Configuration
# SIEM_SPLUNK_URL=https://splunk.example.com:8088/services/collector
# SIEM_SPLUNK_TOKEN=your-hec-token
# SIEM_SPLUNK_INDEX=sentinel
# SIEM_SPLUNK_SOURCETYPE=sentinel:security

# Azure Sentinel Configuration
# SIEM_AZURE_WORKSPACE_ID=your-workspace-id
# SIEM_AZURE_SHARED_KEY=your-shared-key
# SIEM_AZURE_LOG_TYPE=SentinelGrid

# Filtering
SIEM_MIN_SEVERITY=3 # Only export events with severity >= 3
SIEM_EVENT_TYPES=authentication,authorization,audit,security

# Batching
SIEM_BATCH_SIZE=100
SIEM_BATCH_INTERVAL_MS=5000
```

#### Operations

```env
# Escalation Engine
ESCALATION_ENABLED=true

# Duty Roster
DUTY_ROSTER_ENABLED=true

# SLA Tracking
SLA_TRACKING_ENABLED=true

# Maintenance Windows
MAINTENANCE_WINDOWS_ENABLED=true
```

---

## Identity Provider Setup

### Azure AD (SAML)

1. **Register Enterprise Application**:
   - Go to Azure Portal → Azure AD → Enterprise Applications
   - New Application → Create your own application
   - Name: "Sentinel Grid"
   - Select "Integrate any other application you don't find in the gallery"

2. **Configure SAML**:
   - Single sign-on → SAML
   - Basic SAML Configuration:
     - Identifier (Entity ID): `https://sentinel.example.com`
     - Reply URL: `https://sentinel.example.com/auth/saml/callback`
     - Sign on URL: `https://sentinel.example.com`
   
3. **Configure Claims**:
   - Add group claim
   - Map additional attributes (first name, last name)

4. **Download Certificate**:
   - Download Base64 certificate
   - Copy to `SAML_IDP_CERTIFICATE` in `.env`

5. **Get Metadata URL**:
   - Copy "App Federation Metadata Url"
   - Set as `SAML_IDP_METADATA_URL`

### Azure AD (OIDC)

1. **Register Application**:
   - Azure Portal → Azure AD → App registrations
   - New registration
   - Name: "Sentinel Grid"
   - Redirect URI: `https://sentinel.example.com/auth/oidc/callback`

2. **Create Client Secret**:
   - Certificates & secrets → New client secret
   - Copy value to `OIDC_CLIENT_SECRET`

3. **Configure API Permissions**:
   - API permissions → Add permission
   - Microsoft Graph:
     - `openid`
     - `profile`
     - `email`
     - `User.Read`
     - `GroupMember.Read.All` (if syncing groups)

4. **Enable ID Token**:
   - Authentication → ID tokens checkbox

5. **Copy Configuration**:
   - Overview → Copy Application (client) ID to `OIDC_CLIENT_ID`
   - Copy Directory (tenant) ID to OIDC_ISSUER: `https://login.microsoftonline.com/{tenant-id}/v2.0`

### Active Directory (LDAP)

1. **Create Service Account**:
   ```
   CN=SentinelService,OU=ServiceAccounts,DC=example,DC=com
   ```

2. **Grant Permissions**:
   - Read access to Users and Groups OUs
   - No write permissions needed

3. **Test Connection**:
   ```bash
   ldapsearch -x -H ldaps://ad.example.com:636 \
     -D "CN=SentinelService,OU=ServiceAccounts,DC=example,DC=com" \
     -W -b "DC=example,DC=com" "(sAMAccountName=testuser)"
   ```

---

## SIEM Integration

### Splunk

1. **Enable HTTP Event Collector**:
   - Settings → Data inputs → HTTP Event Collector
   - Global Settings → Enable

2. **Create HEC Token**:
   - New Token
   - Name: "Sentinel Grid"
   - Source type: `sentinel:security`
   - Select index

3. **Configure Sentinel**:
   ```env
   SIEM_FORMAT=splunk-hec
   SIEM_SPLUNK_URL=https://splunk.example.com:8088/services/collector
   SIEM_SPLUNK_TOKEN=your-token
   ```

### QRadar

1. **Configure Syslog Source**:
   - Log Sources → Add Log Source
   - Protocol: Syslog
   - Log Source Type: Sentinel Grid

2. **Configure Sentinel**:
   ```env
   SIEM_FORMAT=qradar-lef
   SIEM_SYSLOG_HOST=qradar.example.com
   SIEM_SYSLOG_PORT=514
   SIEM_SYSLOG_PROTOCOL=tcp
   ```

### Azure Sentinel

1. **Get Workspace Credentials**:
   - Azure Portal → Log Analytics workspaces
   - Agents → Log Analytics agent instructions
   - Copy Workspace ID and Primary Key

2. **Configure Sentinel**:
   ```env
   SIEM_FORMAT=azure-sentinel
   SIEM_AZURE_WORKSPACE_ID=your-workspace-id
   SIEM_AZURE_SHARED_KEY=your-shared-key
   SIEM_AZURE_LOG_TYPE=SentinelGrid
   ```

---

## Operations Setup

### 1. Create Escalation Policies

```typescript
// Example P1 escalation policy
{
  "tenantId": "tenant-uuid",
  "name": "P1 Critical Escalation",
  "severity": "P1",
  "levels": [
    {
      "level": 1,
      "delayMinutes": 0,
      "requireAcknowledgment": true,
      "notifyAll": false,
      "targets": [
        { "type": "on-call-roster", "id": "primary-roster-uuid", "name": "Primary On-Call" }
      ]
    },
    {
      "level": 2,
      "delayMinutes": 15,
      "requireAcknowledgment": true,
      "notifyAll": true,
      "targets": [
        { "type": "group", "id": "managers-group-uuid", "name": "Managers" }
      ]
    },
    {
      "level": 3,
      "delayMinutes": 30,
      "requireAcknowledgment": true,
      "notifyAll": true,
      "targets": [
        { "type": "user", "id": "director-uuid", "name": "Security Director" }
      ]
    }
  ],
  "enabled": true
}
```

### 2. Create Duty Rosters

```typescript
// Example 24x7 rotating roster
{
  "tenantId": "tenant-uuid",
  "name": "Security Operations - 24x7",
  "type": "rotating",
  "timezone": "Asia/Kolkata",
  "members": [
    { "userId": "user1-uuid", "username": "operator1", "email": "op1@example.com", "order": 1, "primary": true, "active": true },
    { "userId": "user2-uuid", "username": "operator2", "email": "op2@example.com", "order": 2, "primary": false, "active": true },
    { "userId": "user3-uuid", "username": "operator3", "email": "op3@example.com", "order": 3, "primary": false, "active": true }
  ],
  "schedule": {
    "type": "daily",
    "shiftDurationHours": 8,
    "startDate": "2026-08-10T00:00:00Z"
  },
  "handoffNotificationMinutes": 30,
  "enabled": true
}
```

### 3. Create SLA Policies

```typescript
// Example SLA policies
[
  {
    "tenantId": "tenant-uuid",
    "name": "P1 Critical SLA",
    "severity": "P1",
    "acknowledgmentMinutes": 5,
    "resolutionHours": 1,
    "businessHoursOnly": false,
    "enabled": true
  },
  {
    "tenantId": "tenant-uuid",
    "name": "P2 High SLA",
    "severity": "P2",
    "acknowledgmentMinutes": 15,
    "resolutionHours": 4,
    "businessHoursOnly": false,
    "enabled": true
  },
  {
    "tenantId": "tenant-uuid",
    "name": "P3 Medium SLA",
    "severity": "P3",
    "acknowledgmentMinutes": 60,
    "resolutionHours": 24,
    "businessHoursOnly": true,
    "enabled": true
  }
]
```

---

## High Availability Deployment

### Redis Sentinel (Recommended for HA)

```yaml
# docker-compose.yml
version: '3.8'
services:
  redis-master:
    image: redis:7-alpine
    command: redis-server --requirepass your-password

  redis-replica:
    image: redis:7-alpine
    command: redis-server --slaveof redis-master 6379 --requirepass your-password

  redis-sentinel:
    image: redis:7-alpine
    command: redis-sentinel /etc/redis/sentinel.conf
    volumes:
      - ./sentinel.conf:/etc/redis/sentinel.conf
```

```conf
# sentinel.conf
sentinel monitor mymaster redis-master 6379 2
sentinel auth-pass mymaster your-password
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 10000
```

Update `.env`:
```env
REDIS_URL=redis-sentinel://redis-sentinel:26379/mymaster
REDIS_SENTINELS=redis-sentinel1:26379,redis-sentinel2:26379,redis-sentinel3:26379
REDIS_PASSWORD=your-password
```

---

## Security Checklist

- [ ] Change all default passwords and secrets
- [ ] Enable HTTPS with valid certificates
- [ ] Configure firewall rules (restrict database, Redis access)
- [ ] Enable MFA for all administrative users
- [ ] Configure SIEM export
- [ ] Set up automated backups
- [ ] Enable audit logging
- [ ] Configure certificate rotation
- [ ] Set up intrusion detection
- [ ] Review and harden default roles/permissions

---

## Monitoring & Alerts

### Health Endpoints

- `/health` - Overall health status
- `/health/database` - Database connectivity
- `/health/redis` - Redis connectivity
- `/health/identity` - Identity provider status

### Metrics to Monitor

- Authentication success/failure rates
- MFA enrollment percentage
- Escalation response times
- SLA breach rates
- SIEM export failures
- Session activity
- API response times

---

## Troubleshooting

### SAML Issues

**Problem**: "Invalid SAML response"
- Check certificate matches IdP
- Verify callback URL is correct
- Check system clock synchronization

**Problem**: "User not found"
- Verify attribute mapping configuration
- Check user exists in IdP
- Review SAML assertion attributes

### OIDC Issues

**Problem**: "Invalid ID token"
- Verify client ID and secret
- Check issuer URL
- Ensure PKCE is configured correctly

**Problem**: "Token refresh failed"
- Check refresh token is being stored
- Verify token hasn't expired
- Check OIDC provider settings

### LDAP Issues

**Problem**: "Bind failed"
- Verify service account credentials
- Check LDAP URL and port
- Test with ldapsearch command

**Problem**: "User search failed"
- Verify search base DN
- Check search filter syntax
- Ensure service account has read permissions

### MFA Issues

**Problem**: "TOTP code invalid"
- Check system time synchronization
- Verify secret is stored correctly
- Check TOTP window setting

**Problem**: "SMS not received"
- Verify SMS provider credentials
- Check phone number format
- Review SMS provider logs

---

## Support

For issues or questions:
- Review `ENTERPRISE_FEATURES_IMPLEMENTATION.md` for feature details
- Check individual source files for API documentation
- Review database migrations for schema details

**Implementation Status**: ✅ Production Ready (Identity, Security, Operations)
