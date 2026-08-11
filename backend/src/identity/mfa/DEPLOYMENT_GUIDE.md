# MFA Rate Limiting Deployment Guide

Complete guide for deploying the MFA distributed rate limiting system.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Database Setup](#database-setup)
5. [Application Integration](#application-integration)
6. [Testing](#testing)
7. [Monitoring](#monitoring)
8. [Troubleshooting](#troubleshooting)
9. [Security Checklist](#security-checklist)

## Prerequisites

### Infrastructure Requirements

- **Redis**: Version 5.0+ (for Lua scripting support)
  - Recommended: Redis 6.2+ or Redis 7.0+
  - Memory: 1GB minimum (scales with traffic)
  - Persistence: Not required (transient rate limit data)
  
- **PostgreSQL**: Version 12+ (for security events and restrictions)
  - Storage: ~500MB per 1M events
  - Consider read replicas for analytics
  
- **Node.js**: Version 16+ (for libphonenumber-js)

### Dependencies

Add to `package.json`:

```json
{
  "dependencies": {
    "ioredis": "^5.3.0",
    "libphonenumber-js": "^1.10.0"
  }
}
```

Install:

```bash
npm install ioredis libphonenumber-js
```

## Installation

### 1. Copy Source Files

Ensure these directories are in place:

```
backend/src/identity/mfa/
├── abuse/
│   ├── mfa-abuse-protection.service.ts
│   ├── mfa-lockout-policy.service.ts
│   ├── mfa-rate-limit.types.ts
│   └── stores/
│       ├── rate-limit-store.interface.ts
│       └── redis-rate-limit.store.ts
├── normalization/
│   ├── phone-normalizer.ts
│   ├── ip-resolver.ts
│   └── limiter-identity.service.ts
├── repositories/
│   └── mfa-security-event.repository.ts
└── config/
    ├── mfa-rate-limit.config.ts
    └── mfa-rate-limit.factory.ts
```

### 2. Database Migrations

```bash
# Apply migrations
psql -U your_user -d your_database -f backend/migrations/20240115_mfa_security_events.sql
psql -U your_user -d your_database -f backend/migrations/20240115_mfa_restrictions.sql

# Verify tables created
psql -U your_user -d your_database -c "\dt mfa_*"
```

Expected output:
```
                    List of relations
 Schema |          Name          | Type  |    Owner
--------+------------------------+-------+-------------
 public | mfa_security_events    | table | your_user
 public | mfa_restrictions       | table | your_user
```

## Configuration

### 1. Environment Variables

Copy the example file:

```bash
cp backend/.env.mfa-rate-limiting.example backend/.env.mfa-rate-limiting
```

### 2. Generate HMAC Secret

```bash
# Generate 256-bit secret
openssl rand -hex 32
```

Add to `.env`:

```env
MFA_HMAC_SECRET=<generated-secret-here>
```

### 3. Configure Trusted Proxies

#### AWS ALB/ELB

```env
TRUSTED_PROXIES=10.0.0.0/8,172.16.0.0/12
```

#### Cloudflare

Get current IPs from: https://www.cloudflare.com/ips/

```env
TRUSTED_PROXIES=173.245.48.0/20,103.21.244.0/22,103.22.200.0/22,...
```

#### NGINX/Docker

```env
TRUSTED_PROXIES=172.18.0.1,172.19.0.1
```

### 4. Redis Configuration

#### Local Development

```env
MFA_REDIS_URL=redis://localhost:6379/0
MFA_REQUIRE_REDIS=false
```

#### Production with Auth

```env
MFA_REDIS_URL=redis://:your-password@redis-host:6379/0
MFA_REQUIRE_REDIS=true
```

#### Production with TLS

```env
MFA_REDIS_URL=rediss://:your-password@redis-host:6380/0
```

## Application Integration

### 1. Initialize Services

```typescript
// backend/src/server.ts or bootstrap file

import { createMfaRateLimitServices } from './identity/mfa/config/mfa-rate-limit.factory.js';
import { MFAService } from './identity/mfa-service.js';

// Initialize rate limiting services
const mfaRateLimitServices = await createMfaRateLimitServices(pool);

// Create MFA service with rate limiting
const mfaService = new MFAService(pool, {
  abuseProtection: mfaRateLimitServices.abuseProtection,
  securityEventRepo: mfaRateLimitServices.securityEventRepo,
  ipResolver: mfaRateLimitServices.ipResolver,
  identityService: mfaRateLimitServices.identityService,
});

// Store globally or in app context
app.locals.mfaService = mfaService;
app.locals.mfaRateLimitServices = mfaRateLimitServices;
```

### 2. Optional Initialization (Graceful Degradation)

For development or staging where Redis might not always be available:

```typescript
import { createMfaRateLimitServicesOptional } from './identity/mfa/config/mfa-rate-limit.factory.js';

const mfaRateLimitServices = await createMfaRateLimitServicesOptional(pool);

const mfaService = new MFAService(pool, 
  mfaRateLimitServices ? {
    abuseProtection: mfaRateLimitServices.abuseProtection,
    securityEventRepo: mfaRateLimitServices.securityEventRepo,
    ipResolver: mfaRateLimitServices.ipResolver,
    identityService: mfaRateLimitServices.identityService,
  } : undefined
);
```

### 3. Update MFA Routes

```typescript
// backend/src/routes/mfa.routes.ts

router.post('/mfa/sms/send', async (req, res) => {
  const { userId, tenantId, phoneNumber } = req.body;
  
  // Extract context for rate limiting
  const context = {
    ip: req.app.locals.mfaRateLimitServices?.ipResolver.resolve(req),
    deviceId: req.session?.deviceId,
    sessionId: req.session?.id,
  };
  
  const result = await req.app.locals.mfaService.sendSMSOTP(
    userId,
    tenantId,
    phoneNumber,
    context
  );
  
  if (result.status === 'provider_unavailable') {
    return res.status(429).json({
      error: 'too_many_requests',
      message: result.reason,
    });
  }
  
  res.json(result);
});

router.post('/mfa/sms/verify', async (req, res) => {
  const { userId, code, challengeId } = req.body;
  
  // Extract context
  const context = {
    tenantId: req.user?.tenantId,
    ip: req.app.locals.mfaRateLimitServices?.ipResolver.resolve(req),
    deviceId: req.session?.deviceId,
    sessionId: req.session?.id,
  };
  
  const result = await req.app.locals.mfaService.verifySMSOTP(
    userId,
    code,
    challengeId,
    context
  );
  
  if (!result.success && result.error?.includes('Too many')) {
    return res.status(429).json({
      error: 'too_many_attempts',
      message: result.error,
    });
  }
  
  res.json(result);
});
```

### 4. Add Health Check Endpoint

```typescript
// backend/src/routes/health.routes.ts

import { checkMfaRateLimitHealth } from '../identity/mfa/config/mfa-rate-limit.factory.js';

router.get('/health/mfa-rate-limiting', async (req, res) => {
  if (!req.app.locals.mfaRateLimitServices) {
    return res.status(503).json({
      healthy: false,
      message: 'MFA rate limiting not configured',
    });
  }
  
  const health = await checkMfaRateLimitHealth(
    req.app.locals.mfaRateLimitServices
  );
  
  if (!health.healthy) {
    return res.status(503).json(health);
  }
  
  res.json(health);
});
```

### 5. Graceful Shutdown

```typescript
// backend/src/server.ts

import { shutdownMfaRateLimitServices } from './identity/mfa/config/mfa-rate-limit.factory.js';

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  // Close MFA rate limiting
  if (app.locals.mfaRateLimitServices) {
    await shutdownMfaRateLimitServices(app.locals.mfaRateLimitServices);
  }
  
  // Close other connections...
  process.exit(0);
});
```

## Testing

### 1. Unit Tests

```typescript
// backend/src/identity/mfa/__tests__/rate-limiting.test.ts

import { RedisRateLimitStore } from '../abuse/stores/redis-rate-limit.store.js';
import Redis from 'ioredis';

describe('MFA Rate Limiting', () => {
  let redis: Redis;
  let store: RedisRateLimitStore;
  
  beforeAll(async () => {
    redis = new Redis(process.env.TEST_REDIS_URL || 'redis://localhost:6379/15');
    store = new RedisRateLimitStore(redis);
  });
  
  afterAll(async () => {
    await redis.flushdb();
    await redis.quit();
  });
  
  it('should allow requests within limit', async () => {
    const result = await store.checkAndIncrement('test:key', 5, 60);
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(1);
  });
  
  it('should deny requests exceeding limit', async () => {
    const key = 'test:limit';
    
    // Use up the limit
    for (let i = 0; i < 5; i++) {
      await store.checkAndIncrement(key, 5, 60);
    }
    
    // Next request should be denied
    const result = await store.checkAndIncrement(key, 5, 60);
    expect(result.allowed).toBe(false);
    expect(result.count).toBe(6);
  });
});
```

### 2. Integration Tests

```bash
# Test OTP generation rate limiting
curl -X POST http://localhost:3000/mfa/sms/send \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user", "tenantId": "test-tenant", "phoneNumber": "+1234567890"}'

# Repeat 6 times - should get 429 on 6th request
```

### 3. Load Testing

```bash
# Install k6
brew install k6  # macOS
# or download from https://k6.io/

# Run load test
k6 run backend/src/identity/mfa/__tests__/load-test.js
```

## Monitoring

### 1. Redis Metrics

```bash
# Redis memory usage
redis-cli info memory | grep used_memory_human

# Rate limit keys count
redis-cli --scan --pattern "mfa:*" | wc -l

# Monitor commands in real-time
redis-cli monitor
```

### 2. Database Queries

```sql
-- Rate limit events per hour
SELECT 
  date_trunc('hour', created_at) as hour,
  type,
  COUNT(*) as count
FROM mfa_security_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour, type
ORDER BY hour DESC, count DESC;

-- Top users by failures
SELECT 
  user_id,
  COUNT(*) as failures
FROM mfa_security_events
WHERE type = 'MFA_VERIFICATION_FAILED'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY user_id
ORDER BY failures DESC
LIMIT 20;

-- Active lockouts
SELECT * FROM mfa_restrictions
WHERE expires_at IS NULL OR expires_at > NOW();
```

### 3. Application Logs

Add structured logging:

```typescript
logger.info('MFA rate limit check', {
  userId,
  allowed: decision.allowed,
  reason: decision.reason,
  retryAfterMs: decision.retryAfterMs,
});
```

### 4. Metrics Export

Integrate with Prometheus/Datadog:

```typescript
// Pseudocode
metricsClient.increment('mfa.generation.attempt');
metricsClient.increment('mfa.generation.rate_limited');
metricsClient.increment('mfa.verification.success');
metricsClient.increment('mfa.verification.failed');
metricsClient.gauge('mfa.active_lockouts', lockoutCount);
```

## Troubleshooting

### Issue: "HMAC secret must be at least 32 characters"

**Cause:** MFA_HMAC_SECRET not set or too short.

**Solution:**
```bash
openssl rand -hex 32 > .hmac-secret
export MFA_HMAC_SECRET=$(cat .hmac-secret)
```

### Issue: Rate limiting not working

**Check:**
1. Redis connection: `redis-cli ping`
2. Environment variables loaded: `echo $MFA_REDIS_URL`
3. Services initialized: Check startup logs
4. Context passed to MFA methods: Verify IP, deviceId, sessionId

### Issue: All requests blocked

**Cause:** Rate limits too strict or Redis keys not expiring.

**Solution:**
```bash
# Check key TTL
redis-cli TTL mfa:gen:user:HASH

# Manual unlock user
redis-cli DEL "mfa:lock:user:HASH"

# Or via API
curl -X DELETE http://localhost:3000/admin/mfa/lockouts/USER_ID
```

### Issue: IP spoofing / rate limits bypassed

**Cause:** Incorrect TRUSTED_PROXIES configuration.

**Solution:**
1. Identify your actual proxy IPs
2. Update TRUSTED_PROXIES
3. Restart application
4. Test with: `curl -H "X-Forwarded-For: 1.2.3.4" ...`

## Security Checklist

Before going to production:

- [ ] MFA_HMAC_SECRET is at least 32 characters
- [ ] MFA_HMAC_SECRET stored in secrets manager (not .env file)
- [ ] TRUSTED_PROXIES only lists actual proxies
- [ ] Redis has AUTH enabled (password in URL)
- [ ] Redis uses TLS (rediss://) in production
- [ ] Redis network access restricted to backend only
- [ ] MFA_REQUIRE_REDIS=true in production
- [ ] MFA_FAIL_CLOSED=true in production
- [ ] Database migrations applied
- [ ] Indexes created on mfa_security_events
- [ ] Monitoring alerts configured
- [ ] Data retention policy implemented
- [ ] Incident response plan documented
- [ ] Load testing completed
- [ ] Security review conducted

## Next Steps

1. Set up monitoring dashboards
2. Configure alerting for:
   - High rate limit denials
   - Redis connection failures
   - Unusual lockout patterns
3. Document incident response procedures
4. Schedule quarterly HMAC secret rotation
5. Review and tune rate limit policies based on usage

## Support

For issues or questions:
- Check application logs
- Review Redis and database metrics
- Consult this guide and inline code comments
- Review MFA security events table for patterns
