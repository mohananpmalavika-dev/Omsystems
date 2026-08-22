# Service Authentication & Authorization

Zero-trust service-to-service authentication boundary for internal APIs.

## Overview

This module implements a comprehensive security boundary for service-to-service communication, replacing the insecure TODO at `internal-notifications.route.ts:104` with production-grade authentication and authorization.

### Security Controls

- ✅ **JWT Authentication** - Asymmetric signature verification with issuer/audience validation
- ✅ **Capability-based Authorization** - Fine-grained permission model
- ✅ **Tenant Isolation** - Services can only act for authorized tenants
- ✅ **Purpose Restrictions** - Notification types are scoped per service
- ✅ **Replay Protection** - JTI-based token replay prevention
- ✅ **Idempotency Enforcement** - Database-backed deduplication
- ✅ **Rate Limiting** - Multi-dimensional (tenant, purpose, recipients)
- ✅ **Audit Logging** - Comprehensive security event tracking
- ✅ **Transactional Outbox** - Atomic notification creation

## Architecture

```
Analytics Engine
      │
      │ mTLS (future)
      │ + Service JWT
      ▼
┌─────────────────────────────────────┐
│  ServiceAuthService                 │
│  - JWT signature verification       │
│  - Issuer/audience validation       │
│  - Expiry checks                    │
│  - Workload identity extraction     │
└──────────────┬──────────────────────┘
               ▼
      ServicePrincipal
               │
               ▼
┌─────────────────────────────────────┐
│  ServiceAuthorizationService        │
│  - Capability checks                │
│  - Tenant authorization             │
│  - Purpose validation               │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│  ReplayProtectionService            │
│  - JTI uniqueness check             │
│  - Time-bounded cache               │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│  NotificationIdempotencyService     │
│  - Request hash comparison          │
│  - Conflict detection               │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│  NotificationRatePolicyService      │
│  - Per-tenant limits                │
│  - Per-purpose limits               │
│  - Per-recipient limits             │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│  InternalNotificationService        │
│  - Transactional notification       │
│  - Outbox pattern                   │
└──────────────┬──────────────────────┘
               ▼
      NotificationService
               │
               ▼
         Database + Outbox
```

## Configuration

### Environment Variables

```bash
# JWT Configuration
SERVICE_JWT_ISSUER=sentinel-workload-identity
SERVICE_JWT_AUDIENCE=sentinel-backend
SERVICE_JWT_PUBLIC_KEY=<base64-encoded-public-key>  # For RS256/ES256
SERVICE_JWT_SECRET=<secret>                          # For HS256 (dev only)
SERVICE_JWT_ALGORITHM=RS256                          # RS256, ES256, HS256
SERVICE_JWT_CLOCK_TOLERANCE=30                       # seconds
SERVICE_JWT_MAX_LIFETIME=600                         # 10 minutes

# Security Features
SERVICE_REPLAY_PROTECTION_ENABLED=true
SERVICE_REPLAY_CACHE_TTL=900                         # 15 minutes
SERVICE_MTLS_REQUIRED=false                          # Enable for production
SERVICE_VERIFY_IDENTITY_MATCH=false                  # Verify mTLS + JWT match
```

### Database Setup

Run migrations in order:

```bash
psql -f backend/migrations/0XX_create_service_notification_idempotency.sql
psql -f backend/migrations/0XX_create_service_auth_audit.sql
psql -f backend/migrations/0XX_create_service_credentials.sql  # Phase 1 only
```

## Usage

### 1. Initialize Services

```typescript
import { Pool } from 'pg';
import {
  createServiceAuthService,
  createServiceAuthorizationService,
  createReplayProtectionService,
  createNotificationIdempotencyService,
  createNotificationRatePolicyService,
  createInternalNotificationService,
  createServiceAuthMiddleware,
  createCapabilityMiddleware,
} from './security/service-auth/index.js';

const pool = new Pool(/* config */);

// Core services
const authService = createServiceAuthService();
const authzService = createServiceAuthorizationService();
const replayService = createReplayProtectionService();
const idempotencyService = createNotificationIdempotencyService(pool);

// Get policies from authorization service
const policies = authzService.getAllPolicies();
const ratePolicyService = createNotificationRatePolicyService(policies);

// Internal notification service
const internalNotificationService = createInternalNotificationService(
  authzService,
  replayService,
  idempotencyService,
  ratePolicyService,
  notificationService,
  pool
);

// Middleware
const requireServiceAuth = createServiceAuthMiddleware(authService);
const requireNotificationCapability = createCapabilityMiddleware('notifications:create');
```

### 2. Register Route

```typescript
import { registerInternalNotificationsRoute } from './notifications/routes/internal-notifications.route.js';

await registerInternalNotificationsRoute(
  fastify,
  notificationService,
  internalNotificationService,
  requireServiceAuth,
  requireNotificationCapability
);
```

### 3. Client Usage (Analytics Engine)

```typescript
import jwt from 'jsonwebtoken';

// Generate service JWT
const token = jwt.sign(
  {
    iss: 'sentinel-workload-identity',
    sub: 'analytics-engine',
    aud: 'sentinel-backend',
    scope: ['notifications:create'],
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,  // 5 minutes
    jti: generateUniqueId(),
    cid: 'analytics-prod-2026-08',
  },
  privateKey,
  { algorithm: 'RS256' }
);

// Make request
const response = await fetch('https://backend/internal/notifications', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    tenantId: 'tenant-123',
    purpose: 'ALERT_ESCALATION',
    eventId: 'alert-456',
    templateId: 'critical-camera-alert',
    recipientRefs: ['branch-security-team'],
    data: {
      alertName: 'Camera Offline',
      cameraName: 'Entrance 3',
      severity: 'critical',
    },
    idempotencyKey: `alert-456-${Date.now()}`,
    occurredAt: new Date().toISOString(),
  }),
});

// Handle response
if (response.status === 202) {
  const { notificationId, duplicate } = await response.json();
  console.log('Notification accepted:', notificationId);
} else if (response.status === 429) {
  const { limitType, resetsAt } = await response.json();
  console.error('Rate limit exceeded:', limitType, resetsAt);
}
```

## Service Policies

Define what each service can do in `service-authorization.service.ts`:

```typescript
const SERVICE_NOTIFICATION_POLICIES = {
  'analytics-engine': {
    allowedPurposes: [
      NotificationPurpose.ALERT_ESCALATION,
      NotificationPurpose.INCIDENT_CREATED,
      NotificationPurpose.SECURITY_EVENT,
    ],
    crossTenantAllowed: false,
    rateLimits: {
      perTenantPerMinute: 100,
      perPurposePerMinute: 50,
      recipientsPerTenantPerMinute: 200,
      maxRecipientsPerRequest: 20,
    },
  },
  // ... other services
};
```

## Error Handling

The API returns specific status codes and error structures:

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "code": "TOKEN_EXPIRED",
  "message": "JWT token has expired"
}
```

### 403 Forbidden
```json
{
  "error": "Forbidden",
  "code": "MISSING_CAPABILITY",
  "message": "Service lacks required capability: notifications:create"
}
```

### 409 Conflict (Idempotency)
```json
{
  "error": "Conflict",
  "code": "IDEMPOTENCY_CONFLICT",
  "message": "Same idempotency key with different request"
}
```

### 429 Too Many Requests
```json
{
  "error": "Too Many Requests",
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Rate limit exceeded for tenant",
  "limitType": "tenant",
  "limit": 100,
  "resetsAt": "2026-08-11T10:15:00Z"
}
```

## Security Best Practices

### JWT Generation

1. **Use asymmetric algorithms** (RS256, ES256) in production
2. **Keep tokens short-lived** (5-10 minutes maximum)
3. **Use unique JTI** for every token (prevents replay)
4. **Rotate signing keys** regularly (90 days)
5. **Store private keys** in KMS/HSM, not source code

### Idempotency Keys

1. **Format**: `{eventType}-{eventId}` (e.g., `alert-456`)
2. **Scope**: Unique per tenant + service + notification
3. **TTL**: 24 hours (configurable)
4. **Consistency**: Same key = same request hash

### Rate Limiting

Monitor and adjust limits based on actual usage:

```sql
-- Find services hitting rate limits
SELECT service_id, COUNT(*) as denials
FROM service_auth_audit
WHERE action = 'RATE_LIMIT_EXCEEDED'
  AND timestamp > NOW() - INTERVAL '1 hour'
GROUP BY service_id;
```

### Monitoring

Key metrics to track:

- Authentication success/failure rates
- Authorization denials by service
- Rate limit hits by dimension
- Idempotency conflicts
- Replay detection events
- Average notification processing time

## Migration Path

### Phase 1: Secret-based Auth (Immediate)

Use `service_credentials` table with rotated secrets:

```typescript
// Generate credential
const credentialId = 'analytics-key-v5';
const secret = generateSecureRandom(32); // 256 bits
const hash = await bcrypt.hash(secret, 12);

await pool.query(`
  INSERT INTO service_credentials (
    service_id, credential_id, secret_hash, capabilities
  ) VALUES ($1, $2, $3, $4)
`, ['analytics-engine', credentialId, hash, ['notifications:create']]);

// Client uses: Authorization: Service analytics-key-v5:${secret}
```

### Phase 2: JWT with Symmetric Keys (Development)

Use HS256 with shared secret (easier for development).

### Phase 3: JWT with Asymmetric Keys (Production)

Use RS256/ES256 with public/private key pairs.

### Phase 4: mTLS + JWT (Maximum Security)

Combine transport-level (mTLS) and application-level (JWT) identity.

## Testing

Run integration tests:

```bash
npm test -- service-auth.integration.test.ts
```

Test coverage includes:
- ✅ Valid JWT accepted
- ✅ Invalid signature rejected
- ✅ Expired token rejected
- ✅ Wrong issuer/audience rejected
- ✅ Missing capability rejected
- ✅ Disallowed purpose rejected
- ✅ Replay attack prevented
- ✅ Idempotency enforced
- ✅ Rate limits enforced

## Troubleshooting

### "Unknown service ID"

Add service to `ServiceId` type in `service-auth.types.ts`:

```typescript
export type ServiceId =
  | 'analytics-engine'
  | 'recording-service'
  | 'your-new-service';  // Add here
```

### "Service lacks capability"

Update JWT scope or service capabilities in policy.

### "Rate limit exceeded"

Check current usage and adjust limits in policy configuration.

### "Idempotency conflict"

Same key with different request content. Client should:
1. Use consistent idempotency keys
2. Not retry with modified payload
3. Query existing notification if conflict occurs

## Future Enhancements

- [ ] mTLS certificate validation
- [ ] Redis-backed replay protection (for multi-instance)
- [ ] Redis-backed rate limiting (for multi-instance)
- [ ] Service mesh integration (Istio, Linkerd)
- [ ] SPIFFE workload identity
- [ ] Dynamic policy updates (database-backed)
- [ ] Anomaly detection (ML-based)
- [ ] Real-time alerting (excessive denials)

## References

- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [OAuth 2.0 Token Exchange](https://datatracker.ietf.org/doc/html/rfc8693)
- [SPIFFE Workload Identity](https://spiffe.io/)
- [Zero Trust Architecture](https://csrc.nist.gov/publications/detail/sp/800-207/final)
