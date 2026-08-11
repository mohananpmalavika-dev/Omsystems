# Enterprise Authentication Implementation Guide

## Overview

This document describes the production-complete enterprise authentication system that replaces the dangerous TODOs in `src/routes/auth-enterprise.routes.ts`.

**Critical Fix**: The previous implementation had JWT generation, user provisioning, and authorization logic scattered across route handlers and connectors. This implementation centralizes all authentication concerns through a single, secure service layer.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     External Identity World                      │
│                                                                  │
│     Azure AD / Entra ID     SAML IdP          LDAP / AD         │
│              │                  │                  │             │
└──────────────┼──────────────────┼──────────────────┼─────────────┘
               │                  │                  │
               ▼                  ▼                  ▼
         ┌──────────────────────────────────────────────┐
         │         Identity Adapters (Verification)      │
         │  • AzureADAdapter  • SAMLAdapter  • LDAPAdapter │
         │  • Token/assertion verification               │
         │  • Signature validation                       │
         │  • Claims normalization                       │
         └─────────────────┬────────────────────────────┘
                           │
                           ▼
              VerifiedExternalIdentity
                           │
                           ▼
         ┌─────────────────────────────────────┐
         │    EnterpriseLoginService           │
         │    (Central Orchestration)          │
         └─────────────────┬───────────────────┘
                           │
         ┌─────────────────┴───────────────────┐
         │                                     │
         ▼                                     ▼
   IdentityLinkService              IdentityProvisioningService
   (external → local)               (JIT user creation)
         │                                     │
         └─────────────────┬───────────────────┘
                           │
                           ▼
                  RoleMappingService
                  (groups → roles)
                           │
                           ▼
                  PrincipalService
                  (permissions resolution)
                           │
                           ▼
                   SessionService
                   (JWT + refresh tokens)
                           │
                           ▼
                   Application Session
```

---

## Key Principles

### 1. **Single Responsibility Separation**

| Component | Responsibility | Does NOT Do |
|-----------|---------------|-------------|
| **Adapter** | Verify external identity | Create users, assign roles, issue JWTs |
| **IdentityLinkService** | Map external → local identity | Provision users, check roles |
| **ProvisioningService** | Create/update users | Map roles, create sessions |
| **RoleMappingService** | Map external groups → local roles | Provision users, issue tokens |
| **PrincipalService** | Resolve effective permissions | Create sessions, verify identity |
| **SessionService** | Issue JWT + refresh tokens | Authenticate, authorize |
| **EnterpriseLoginService** | Coordinate the complete flow | Implement any business logic itself |

### 2. **Immutable Identity Linking**

**The canonical identity key is:**
```
(tenantId, providerId, externalSubject)
```

**NOT email**, which can:
- Change
- Be reassigned
- Differ between providers
- Be unverified

### 3. **Default to No Privilege**

When external groups don't map to roles:
- **Don't** default to admin
- **Don't** silently grant "USER" role
- **Either**: Deny login (`requireMappedRole: true`)
- **Or**: Grant explicit default role with minimal permissions

### 4. **Fail Closed**

Incomplete adapters, missing configuration, or errors must result in:
- `PROVIDER_UNAVAILABLE` or `PROVIDER_MISCONFIGURED`
- **Never** `authenticated: true` by default

---

## File Structure

```
src/identity/
├── domain/
│   ├── verified-external-identity.ts    # Normalized external identity
│   ├── authenticated-principal.ts       # Resolved local principal
│   ├── identity-provider.ts             # Provider configuration types
│   ├── auth-errors.ts                   # 40+ typed error codes
│   └── index.ts
├── services/
│   ├── session.service.ts               # JWT + refresh token management
│   ├── identity-link.service.ts         # External → local mapping
│   ├── identity-provisioning.service.ts # JIT user creation
│   ├── role-mapping.service.ts          # Group → role mapping
│   ├── principal.service.ts             # Permission resolution
│   ├── enterprise-login.service.ts      # Central orchestration
│   └── index.ts
├── adapters/
│   ├── identity-adapter.ts              # Adapter interface
│   ├── azure-ad.adapter.ts              # Azure AD / Entra ID
│   ├── ldap.adapter.ts                  # LDAP (to be implemented)
│   ├── saml.adapter.ts                  # SAML (to be implemented)
│   └── index.ts
└── routes/
    └── auth-enterprise.routes.ts        # Refactored routes (to be done)

migrations/
└── 002_enterprise_identity_infrastructure.sql
```

---

## Database Schema

### Core Tables

**`identity_providers`** - Provider configurations
- JSONB fields for flexibility (configuration, provisioning, authorization, security)
- One row per tenant-provider combination

**`enterprise_identity_links`** - Immutable identity mapping
- Unique constraint: `(tenant_id, provider_id, external_subject)`
- Links external subject to local `user_id`
- Tracks authentication history

**`enterprise_role_mappings`** - Group-to-role mappings
- Maps external group identifiers to local role IDs
- Priority-based (higher wins)
- Tenant-scoped

**`auth_sessions`** - Application sessions
- Stores refresh token hash (SHA-256)
- Tracks authentication method and provider
- MFA flag and authentication timestamp
- Automatic cleanup of expired sessions

**`auth_transactions`** - Temporary OAuth/SAML state
- Stores state, nonce, PKCE verifier (hashed)
- Prevents replay attacks
- Expires in minutes

**`saml_assertions`** - SAML replay prevention
- Tracks assertion IDs
- Expires based on assertion lifetime

**`audit_events`** - Comprehensive audit trail
- All authentication events
- Success and failure tracking
- IP address, user agent, metadata

---

## Authentication Flow

### Example: Azure AD Login

```typescript
// 1. User clicks "Login with Azure AD"
GET /auth/enterprise/azure/:providerId/login

// 2. Route initiates OIDC flow
const authUrl = adapter.initiateLogin(provider, state, nonce);
// Redirects to Azure AD

// 3. User authenticates at Azure AD
// Azure redirects back with authorization code

// 4. Callback handler
GET /auth/enterprise/azure/:providerId/callback?code=...&state=...

// Route calls EnterpriseLoginService:
const result = await enterpriseLoginService.completeAuthentication({
  tenantId,
  providerId,
  identity: verifiedIdentity, // from adapter
  context: { ipAddress, userAgent }
});

// 5. EnterpriseLoginService orchestrates:
//    a. Check provider is enabled
//    b. Validate authentication policy (MFA, age, etc.)
//    c. Resolve or provision user (IdentityProvisioningService)
//    d. Map groups to roles (RoleMappingService)
//    e. Resolve principal with permissions (PrincipalService)
//    f. Create session (SessionService)
//    g. Record audit event

// 6. Return session tokens to client
{
  accessToken: "eyJhbGc...",  // JWT, 15 minutes
  refreshToken: "...",         // Opaque, 30 days
  expiresIn: 900,
  tokenType: "Bearer"
}
```

---

## Key Services

### SessionService

**Responsibility**: The ONLY place that generates JWTs and refresh tokens.

```typescript
// Create session
const session = await sessionService.create(principal, context);
// Returns: { accessToken, refreshToken, expiresIn, ... }

// Refresh session
const newSession = await sessionService.refresh(refreshToken, principal, context);

// Revoke session
await sessionService.revoke(sessionId, 'User logout');

// Revoke all sessions for a user
await sessionService.revokeAllForUser(userId, 'Password changed');

// Revoke all sessions authenticated via a provider
await sessionService.revokeAllForProvider(providerId, 'Provider disabled');
```

**Access Token (JWT) Claims**:
```json
{
  "sub": "user-id",
  "sid": "session-id",
  "tid": "tenant-id",
  "iat": 1234567890,
  "exp": 1234568790,
  "iss": "sentinel-grid",
  "aud": "sentinel-grid-api"
}
```

**Refresh Token**: Opaque, high-entropy, stored as SHA-256 hash.

### IdentityLinkService

**Responsibility**: Manage the immutable link between external identity and local user.

```typescript
// Find existing link
const link = await identityLinks.findByExternalIdentity(
  tenantId,
  providerId,
  externalSubject
);

// Create new link
const link = await identityLinks.create({
  tenantId,
  providerId,
  providerType: 'AZURE_AD',
  userId: localUserId,
  externalSubject: 'oid-from-azure',
  externalEmail: 'user@company.com',
  externalUsername: 'user@company.com'
});

// Record authentication
await identityLinks.recordAuthentication(link.id);
```

### IdentityProvisioningService

**Responsibility**: Just-In-Time user provisioning with policy enforcement.

```typescript
const provisioned = await provisioning.resolveOrProvision(
  tenantId,
  provider,
  externalIdentity
);
// Returns: { userId, membershipId, identityLinkId, wasCreated, wasUpdated }
```

**Provisioning Modes**:
- `JIT`: Create users on first login
- `PREPROVISIONED_ONLY`: Only allow pre-created users
- `DISABLED`: No JIT provisioning

**Domain Validation**: Only allows JIT provisioning for configured email domains.

### RoleMappingService

**Responsibility**: Map external groups to local roles.

```typescript
const roles = await roleMapping.resolveRoles(
  tenantId,
  providerId,
  externalIdentity,
  {
    defaultRoleId: provider.authorization.defaultRoleId,
    requireMappedRole: provider.authorization.requireMappedRole
  }
);
// Returns: { roleIds, roleNames, mappedGroups, unmappedGroups }
```

**Default Behavior**: If no groups map to roles and `requireMappedRole: true`, throws `NO_ROLE_MAPPING` error.

### PrincipalService

**Responsibility**: Resolve authenticated user with effective permissions.

```typescript
const principal = await principalService.resolve(
  userId,
  tenantId,
  authContext,
  {
    requireActive: true,
    requireActiveMembership: true,
    includePermissions: true
  }
);
// Returns: AuthenticatedPrincipal with roles, permissions, account status
```

### EnterpriseLoginService

**Responsibility**: Coordinate the complete authentication flow.

```typescript
const result = await enterpriseLoginService.completeAuthentication({
  tenantId,
  providerId,
  identity: verifiedExternalIdentity,
  context: { ipAddress, userAgent }
});
// Returns: { session, principal, userWasCreated, identityLinkId }
```

This is the ONLY service that routes should call for enterprise authentication.

---

## Error Handling

### Typed Errors (40+ codes)

All errors extend `EnterpriseAuthError` with specific codes:

```typescript
// Credential errors
INVALID_CREDENTIALS
INVALID_TOKEN
EXPIRED_TOKEN
INVALID_SIGNATURE

// Provider errors
PROVIDER_NOT_FOUND
PROVIDER_DISABLED
PROVIDER_UNAVAILABLE
PROVIDER_MISCONFIGURED

// Identity errors
IDENTITY_NOT_LINKED
IDENTITY_CONFLICT
DUPLICATE_IDENTITY

// Provisioning errors
PROVISIONING_DISABLED
DOMAIN_NOT_ALLOWED

// Account errors
ACCOUNT_DISABLED
ACCOUNT_LOCKED
MEMBERSHIP_DISABLED

// Authorization errors
NO_ROLE_MAPPING
INSUFFICIENT_PERMISSIONS

// Policy errors
MFA_REQUIRED
AUTHENTICATION_TOO_OLD
PHISHING_RESISTANT_REQUIRED

// Protocol errors
NONCE_MISMATCH
STATE_MISMATCH
ISSUER_MISMATCH
ASSERTION_REPLAY

// LDAP errors
LDAP_CONNECTION_FAILED
LDAP_BIND_FAILED
LDAP_USER_NOT_FOUND
```

### Safe Error Responses

Errors automatically convert to safe external responses:

```typescript
error.toSafeResponse()
// Returns: { error: "AUTHENTICATION_FAILED", message: "..." }
// Hides internal details like "PROVIDER_MISCONFIGURED"
```

---

## Security Features

### 1. **Refresh Token Rotation**

Every token refresh generates a new refresh token, invalidating the old one.

### 2. **Session Revocation**

Sessions can be revoked:
- Individually (logout)
- Per user (all sessions)
- Per provider (when provider is disabled)
- Per membership (when membership is suspended)

### 3. **SAML Replay Prevention**

Assertion IDs are tracked in `saml_assertions` table with unique constraint.

### 4. **OIDC Nonce Validation**

ID tokens must contain expected nonce from auth transaction.

### 5. **PKCE Support**

Code verifier stored encrypted in `auth_transactions`.

### 6. **MFA Detection**

Azure AD `amr` claim is parsed to detect MFA usage.

### 7. **Authentication Age Enforcement**

Policies can require recent authentication for sensitive operations.

### 8. **IP Allowlisting**

Providers can restrict authentication to specific IP ranges.

### 9. **Concurrent Session Limits**

Maximum concurrent sessions per user can be enforced.

### 10. **Comprehensive Audit Trail**

All authentication events are logged to `audit_events`.

---

## Configuration Example

### Identity Provider Configuration

```typescript
{
  id: "azure-ad-prod",
  tenantId: "company-tenant",
  configuration: {
    type: "AZURE_AD",
    enabled: true,
    name: "Corporate Azure AD",
    tenantId: "your-azure-tenant-id",
    clientId: "your-client-id",
    clientSecretRef: "azure-ad-client-secret", // Reference to secret store
    redirectUri: "https://your-app.com/auth/azure/callback",
    scopes: ["openid", "profile", "email"],
    useV2Endpoint: true,
    includeGroupsInToken: true,
    cloudInstance: "public"
  },
  provisioning: {
    mode: "JIT",
    allowedDomains: ["company.com", "subsidiary.com"],
    defaultRoleId: null,
    syncAttributesOnLogin: true,
    syncedAttributes: ["displayName", "givenName", "familyName"]
  },
  authorization: {
    requireMappedRole: true,
    defaultRoleId: null,
    maxConcurrentSessions: 5,
    allowedIpRanges: []
  },
  security: {
    requireMfa: true,
    maxAuthenticationAge: 3600,
    minAssuranceLevel: "MEDIUM",
    requirePhishingResistant: false,
    sessionTimeout: 28800,
    idleTimeout: 3600
  }
}
```

### Role Mapping Configuration

```typescript
// Map Azure AD groups to local roles
[
  {
    tenantId: "company-tenant",
    providerId: "azure-ad-prod",
    externalGroup: "Sentinel-Admins",
    roleId: "system-admin-role-id",
    priority: 100,
    enabled: true
  },
  {
    tenantId: "company-tenant",
    providerId: "azure-ad-prod",
    externalGroup: "Security-Operators",
    roleId: "security-operator-role-id",
    priority: 50,
    enabled: true
  },
  {
    tenantId: "company-tenant",
    providerId: "azure-ad-prod",
    externalGroup: "Branch-Managers",
    roleId: "branch-operator-role-id",
    priority: 30,
    enabled: true
  }
]
```

---

## Deployment Steps

### 1. **Run Database Migration**

```bash
psql -d your_database -f migrations/002_enterprise_identity_infrastructure.sql
```

### 2. **Configure Environment Variables**

```bash
# JWT Configuration
JWT_SECRET="your-256-bit-secret-minimum-32-chars"
JWT_ISSUER="your-app-name"
JWT_AUDIENCE="your-app-api"

# Session Configuration
ACCESS_TOKEN_LIFETIME=900       # 15 minutes
REFRESH_TOKEN_LIFETIME=2592000  # 30 days
```

### 3. **Initialize Services**

```typescript
import { Pool } from 'pg';
import { EnterpriseLoginService } from './identity/services/index.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const enterpriseLoginService = new EnterpriseLoginService(pool, {
  jwtSecret: process.env.JWT_SECRET!,
  accessTokenLifetime: parseInt(process.env.ACCESS_TOKEN_LIFETIME || '900'),
  refreshTokenLifetime: parseInt(process.env.REFRESH_TOKEN_LIFETIME || '2592000')
});
```

### 4. **Refactor Routes**

**BEFORE** (with dangerous TODOs):
```typescript
app.post('/v1/auth/saml/callback', async (request, reply) => {
  const { profile, tenantId } = await samlProvider.handleCallback(...);
  
  // TODO: Create or update user in database  ⚠️ DANGEROUS
  
  const token = generateToken({...});  // ⚠️ DANGEROUS
  
  return reply.redirect(`/dashboard?token=${token}`);
});
```

**AFTER** (using services):
```typescript
app.post('/v1/auth/saml/callback', async (request, reply) => {
  try {
    // Adapter verifies SAML assertion
    const identity = await samlAdapter.authenticate({
      provider,
      request: { samlResponse: request.body.SAMLResponse }
    });
    
    // EnterpriseLoginService handles everything
    const result = await enterpriseLoginService.completeAuthentication({
      tenantId: request.tenant.id,
      providerId: request.params.providerId,
      identity,
      context: {
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      }
    });
    
    // Return session tokens
    return reply.send({
      accessToken: result.session.accessToken,
      refreshToken: result.session.refreshToken,
      expiresIn: result.session.expiresIn,
      tokenType: result.session.tokenType
    });
    
  } catch (error) {
    if (error instanceof EnterpriseAuthError) {
      await enterpriseLoginService.recordAuthenticationFailure(
        tenantId,
        providerId,
        error,
        context
      );
      
      return reply.code(401).send(error.toSafeResponse());
    }
    
    throw error;
  }
});
```

### 5. **Add Admin Middleware**

Replace `// TODO: Add admin authentication check` with:

```typescript
import { requirePermission } from '../middleware/permissions.js';

app.post(
  '/v1/auth/enterprise/providers',
  requirePermission('IDENTITY_PROVIDER_MANAGE'),
  createProviderHandler
);
```

---

## Testing Checklist

### Unit Tests

- [ ] SessionService: token generation, refresh rotation, revocation
- [ ] IdentityLinkService: conflict detection, transaction safety
- [ ] ProvisioningService: JIT creation, domain validation, auto-linking
- [ ] RoleMappingService: priority resolution, default-deny
- [ ] PrincipalService: permission resolution, status checks
- [ ] AzureADAdapter: token verification, claim normalization, MFA detection

### Integration Tests

- [ ] Complete authentication flow (Azure AD)
- [ ] JIT provisioning with new user
- [ ] JIT provisioning with existing user (auto-link)
- [ ] Role mapping with multiple groups
- [ ] Role mapping with no mapped groups (`requireMappedRole: true`)
- [ ] Session refresh and rotation
- [ ] Session revocation
- [ ] Provider disablement (revoke all sessions)
- [ ] MFA requirement enforcement
- [ ] Domain restriction enforcement
- [ ] Concurrent session limit enforcement

### Security Tests

- [ ] SAML assertion replay rejected
- [ ] OIDC nonce mismatch rejected
- [ ] State parameter validation
- [ ] Expired token rejected
- [ ] Wrong issuer rejected
- [ ] Wrong audience rejected
- [ ] Revoked session rejected
- [ ] Disabled provider rejected
- [ ] Disabled user rejected
- [ ] Suspended membership rejected

---

## Monitoring & Alerting

### Key Metrics

```typescript
// Authentication success rate
COUNT(audit_events WHERE event_type = 'ENTERPRISE_LOGIN_SUCCESS') /
COUNT(audit_events WHERE event_type LIKE 'ENTERPRISE_LOGIN_%')

// Authentication latency
AVG(session_creation_time) by provider

// JIT provisioning rate
COUNT(users WHERE created_via = 'JIT') / COUNT(auth_sessions WHERE is_first_login = true)

// Role mapping failures
COUNT(audit_events WHERE event_type = 'ROLE_MAPPING_FAILED')

// Session token usage
COUNT(auth_sessions WHERE revoked_at IS NULL) by authentication_method
```

### Alerts

- Authentication failure rate > 10% for 5 minutes
- Provider unavailable for 1 minute
- Role mapping failure rate > 5%
- JIT provisioning failure rate > 1%
- Unusual MFA bypass attempts
- High session revocation rate

---

## Maintenance

### Regular Tasks

**Daily**:
- Monitor authentication failure rates
- Check provider health status

**Weekly**:
- Review audit logs for anomalies
- Check dormant identity links (not used in 90+ days)
- Verify role mapping coverage

**Monthly**:
- Review and update role mappings
- Audit active sessions
- Clean up orphaned identity links
- Review provider configurations

### Cleanup Jobs

Run cleanup functions periodically:

```sql
-- Clean up expired sessions and transactions (runs every hour automatically)
SELECT cleanup_expired_auth_records();

-- Clean up orphaned identity links (manual, careful!)
DELETE FROM enterprise_identity_links
WHERE user_id IN (
  SELECT id FROM users WHERE status = 'DELETED' AND updated_at < now() - interval '90 days'
);
```

---

## Next Steps

1. **Implement LDAP Adapter** with proper bind authentication, LDAP filter escaping, TLS validation
2. **Implement SAML Adapter** with XML signature validation, assertion replay detection, InResponseTo correlation
3. **Refactor remaining routes** to use `EnterpriseLoginService`
4. **Add authentication middleware** with JWT validation and permission checks
5. **Implement admin management UI** for providers and role mappings
6. **Add monitoring dashboards** for authentication metrics
7. **Implement SCIM provisioning** for lifecycle management independent of login
8. **Add step-up authentication** for sensitive operations
9. **Implement device trust** and conditional access policies

---

## Support

For questions or issues:
- Review error codes in `src/identity/domain/auth-errors.ts`
- Check audit events in `audit_events` table
- Review provider health with `healthCheck()` method
- Validate configuration with `validateConfiguration()` method

---

## License

[Your license here]
