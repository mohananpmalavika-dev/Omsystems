# Service Authentication Setup Guide

Step-by-step guide to deploy the service authentication boundary.

## Prerequisites

- PostgreSQL 12+
- Node.js 18+
- OpenSSL (for key generation)

## Step 1: Generate JWT Keys

### For Production (RS256 - Recommended)

```bash
# Generate RSA key pair
openssl genrsa -out service-jwt-private.pem 4096
openssl rsa -in service-jwt-private.pem -pubout -out service-jwt-public.pem

# Base64 encode for environment variables
cat service-jwt-public.pem | base64 -w 0 > service-jwt-public.b64
cat service-jwt-private.pem | base64 -w 0 > service-jwt-private.b64

# Store private key in secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
# Never commit private keys to source control
```

### For Development (HS256 - Simpler)

```bash
# Generate shared secret
openssl rand -base64 32 > service-jwt-secret.txt

# Use same secret for signing and verification
```

## Step 2: Configure Backend

Create `.env` or set environment variables:

```bash
# Production (RS256)
SERVICE_JWT_ISSUER=sentinel-workload-identity
SERVICE_JWT_AUDIENCE=sentinel-backend
SERVICE_JWT_ALGORITHM=RS256
SERVICE_JWT_PUBLIC_KEY=$(cat service-jwt-public.b64)
SERVICE_JWT_CLOCK_TOLERANCE=30
SERVICE_JWT_MAX_LIFETIME=600

# Development (HS256)
SERVICE_JWT_ISSUER=sentinel-workload-identity
SERVICE_JWT_AUDIENCE=sentinel-backend
SERVICE_JWT_ALGORITHM=HS256
SERVICE_JWT_SECRET=$(cat service-jwt-secret.txt)
SERVICE_JWT_CLOCK_TOLERANCE=30
SERVICE_JWT_MAX_LIFETIME=600

# Security Features
SERVICE_REPLAY_PROTECTION_ENABLED=true
SERVICE_REPLAY_CACHE_TTL=900
SERVICE_MTLS_REQUIRED=false
```

## Step 3: Run Database Migrations

```bash
# Connect to database
export DATABASE_URL="postgresql://user:pass@localhost:5432/sentinel"

# Run migrations
psql $DATABASE_URL -f backend/migrations/0XX_create_service_notification_idempotency.sql
psql $DATABASE_URL -f backend/migrations/0XX_create_service_auth_audit.sql
psql $DATABASE_URL -f backend/migrations/0XX_create_service_credentials.sql

# Verify tables created
psql $DATABASE_URL -c "\dt service_*"
```

## Step 4: Configure Analytics Engine

### Install Dependencies

```bash
cd analytics-engine
npm install jsonwebtoken
```

### Create JWT Signing Module

```typescript
// analytics-engine/src/auth/service-jwt.ts

import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';

const PRIVATE_KEY = process.env.SERVICE_JWT_PRIVATE_KEY_PATH
  ? readFileSync(process.env.SERVICE_JWT_PRIVATE_KEY_PATH, 'utf8')
  : Buffer.from(process.env.SERVICE_JWT_PRIVATE_KEY_B64 || '', 'base64').toString('utf8');

const ISSUER = process.env.SERVICE_JWT_ISSUER || 'sentinel-workload-identity';
const AUDIENCE = process.env.SERVICE_JWT_AUDIENCE || 'sentinel-backend';
const ALGORITHM = process.env.SERVICE_JWT_ALGORITHM || 'RS256';

export function generateServiceToken(): string {
  const now = Math.floor(Date.now() / 1000);
  
  const claims = {
    iss: ISSUER,
    sub: 'analytics-engine',
    aud: AUDIENCE,
    scope: ['notifications:create'],
    iat: now,
    exp: now + 300, // 5 minutes
    jti: generateJti(),
    cid: process.env.SERVICE_CREDENTIAL_ID || 'analytics-prod-2026-08',
  };

  return jwt.sign(claims, PRIVATE_KEY, { algorithm: ALGORITHM as any });
}

function generateJti(): string {
  // Use UUID v4 or similar
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}
```

### Update Notification Client

```typescript
// analytics-engine/src/notifications/client.ts

import { generateServiceToken } from '../auth/service-jwt.js';

export async function sendNotification(notification: {
  tenantId: string;
  purpose: string;
  eventId: string;
  templateId: string;
  recipientRefs: string[];
  data: Record<string, unknown>;
}) {
  // Generate fresh token for each request
  const token = generateServiceToken();
  
  const response = await fetch(`${process.env.BACKEND_URL}/internal/notifications`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...notification,
      idempotencyKey: `${notification.purpose}-${notification.eventId}`,
      occurredAt: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Notification failed: ${error.code} - ${error.message}`);
  }

  return response.json();
}
```

### Configure Analytics Engine

```bash
# analytics-engine/.env

# JWT Configuration
SERVICE_JWT_ISSUER=sentinel-workload-identity
SERVICE_JWT_AUDIENCE=sentinel-backend
SERVICE_JWT_ALGORITHM=RS256
SERVICE_JWT_PRIVATE_KEY_B64=<base64-encoded-private-key>
SERVICE_CREDENTIAL_ID=analytics-prod-2026-08

# Backend URL
BACKEND_URL=https://backend.sentinel.com
```

## Step 5: Test the Integration

### 1. Start Backend

```bash
cd backend
npm run dev
```

### 2. Generate Test Token

```bash
node -e "
const jwt = require('jsonwebtoken');
const fs = require('fs');

const privateKey = fs.readFileSync('service-jwt-private.pem', 'utf8');

const token = jwt.sign({
  iss: 'sentinel-workload-identity',
  sub: 'analytics-engine',
  aud: 'sentinel-backend',
  scope: ['notifications:create'],
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 300,
  jti: 'test-jti-123',
  cid: 'test-cred',
}, privateKey, { algorithm: 'RS256' });

console.log('Token:', token);
"
```

### 3. Test Request

```bash
# Replace $TOKEN with generated token
curl -X POST http://localhost:3000/internal/notifications \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "tenant-123",
    "purpose": "ALERT_ESCALATION",
    "eventId": "alert-456",
    "templateId": "critical-alert",
    "recipientRefs": ["user-789"],
    "data": {
      "alertName": "Camera Offline",
      "cameraName": "Entrance 3"
    },
    "idempotencyKey": "test-alert-456",
    "occurredAt": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }'
```

### Expected Response (202)

```json
{
  "notificationId": "notif-abc-123",
  "duplicate": false,
  "status": "accepted",
  "acceptedAt": "2026-08-11T10:30:00Z"
}
```

## Step 6: Verify Security Controls

### Test Authentication Failure

```bash
# No token
curl -X POST http://localhost:3000/internal/notifications \
  -H "Content-Type: application/json" \
  -d '{...}'

# Expected: 401 Unauthorized
```

### Test Authorization Failure

```bash
# Token without notifications:create capability
# Expected: 403 Forbidden
```

### Test Replay Attack

```bash
# Use same token twice
# Expected: 401 REPLAY_DETECTED (if enabled)
```

### Test Rate Limiting

```bash
# Send 101 requests rapidly (exceeds 100/min limit)
for i in {1..101}; do
  curl -X POST ... &
done

# Expected: 429 Too Many Requests after 100
```

### Test Idempotency

```bash
# Send same request twice (same idempotency key, same payload)
curl -X POST ... -d '{...}'
curl -X POST ... -d '{...}'

# Expected: Second returns duplicate=true with same notificationId
```

## Step 7: Monitor & Audit

### Query Authentication Events

```sql
-- Successful authentications last hour
SELECT timestamp, service_id, tenant_id
FROM service_auth_audit
WHERE action = 'AUTHENTICATION_SUCCESS'
  AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC;

-- Failed authentications
SELECT timestamp, service_id, reason
FROM service_auth_audit
WHERE action = 'AUTHENTICATION_FAILED'
  AND timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;
```

### Query Rate Limit Events

```sql
-- Rate limit violations
SELECT timestamp, service_id, tenant_id, metadata
FROM service_auth_audit
WHERE action = 'RATE_LIMIT_EXCEEDED'
  AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC;
```

### Monitor Idempotency

```sql
-- Idempotency usage by service
SELECT 
  caller_service,
  COUNT(*) as total_requests,
  COUNT(DISTINCT tenant_id) as unique_tenants
FROM service_notification_idempotency
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY caller_service;
```

## Step 8: Production Deployment Checklist

- [ ] Use RS256 or ES256 (never HS256 in production)
- [ ] Store private keys in secrets manager (never in source)
- [ ] Enable mTLS between services
- [ ] Configure rate limits based on actual usage
- [ ] Set up monitoring and alerting
- [ ] Configure log aggregation (SIEM)
- [ ] Enable audit log retention (90+ days)
- [ ] Document key rotation procedure
- [ ] Test disaster recovery (key compromise scenario)
- [ ] Configure automated backups
- [ ] Set up health checks
- [ ] Enable distributed tracing (request IDs)
- [ ] Review and adjust token expiry times
- [ ] Configure replay protection with Redis (multi-instance)
- [ ] Set up automated vulnerability scanning

## Troubleshooting

### "Token signature verification failed"

1. Check algorithm matches (RS256 vs HS256)
2. Verify public key is correctly loaded
3. Ensure no whitespace/encoding issues in keys

### "Service lacks capability"

1. Check JWT scope claim includes required capability
2. Verify service policy in `service-authorization.service.ts`

### "Rate limit exceeded"

1. Check current usage: `SELECT COUNT(*) FROM service_auth_audit WHERE...`
2. Adjust limits in service policy if legitimate
3. Investigate if anomalous (potential attack)

### "Idempotency conflict"

1. Client sent same key with different payload
2. Check request hash generation is consistent
3. Verify client isn't modifying retry requests

## Key Rotation Procedure

### Step 1: Generate New Key Pair

```bash
openssl genrsa -out service-jwt-private-v2.pem 4096
openssl rsa -in service-jwt-private-v2.pem -pubout -out service-jwt-public-v2.pem
```

### Step 2: Update Backend Config

```bash
# Add new public key to config
# Keep old key temporarily for validation
```

### Step 3: Deploy Backend

Backend now accepts tokens signed with either old or new key.

### Step 4: Update Analytics Engine

Deploy new private key to analytics engine.

### Step 5: Verify

Monitor for authentication failures. Should be zero.

### Step 6: Remove Old Key

After 24 hours (or 2x max token lifetime), remove old public key from backend.

## Support

For issues or questions:
- Check logs: `backend/logs/service-auth.log`
- Review audit table: `service_auth_audit`
- Contact platform team: security@sentinel.com
