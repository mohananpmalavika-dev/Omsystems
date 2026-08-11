# SMS MFA Implementation - Production Ready

## Executive Summary

The SMS MFA system has been refactored from **"OTP generation pretending to be SMS MFA"** into a **production-ready, auditable authentication subsystem**.

### Critical Fix Implemented

**Before:**
```typescript
async sendSMSOTP(...): Promise<boolean> {
  // Generate OTP
  // TODO: Integrate with SMS provider
  logger.info('OTP:', otp); // 🚨 Security issue
  return true; // 🚨 False success
}
```

**After:**
```typescript
async sendSMSOTP(...): Promise<MfaOtpDispatchResult> {
  // Check provider availability (fail closed)
  if (!this.smsProvider.isConfigured()) {
    return { status: 'provider_unavailable', reason: '...' };
  }
  
  // Transactional outbox pattern
  await database.transaction(async trx => {
    await challengeRepo.create({...}, trx);
    await outboxRepo.enqueue({...}, trx);
  });
  
  return { status: 'queued', challengeId, expiresAt };
}
```

### Key Improvements

1. ✅ **Explicit dispatch results** - No more boolean lies
2. ✅ **Fail closed** - Provider unavailability returns error, not success
3. ✅ **Transactional outbox** - OTP + delivery message created atomically
4. ✅ **Separate lifecycles** - OTP generation ≠ delivery ≠ verification
5. ✅ **Atomic verification** - Row-level locking prevents race conditions
6. ✅ **Encrypted storage** - OTP ciphertext for delivery, cleared after send
7. ✅ **State machine** - CREATED → QUEUED → SENDING → SENT → VERIFIED → CONSUMED
8. ✅ **Exponential backoff** - OTP expiry aware retry logic
9. ✅ **Rate limiting** - Multi-dimensional abuse prevention
10. ✅ **Observability** - Metrics, health checks, Prometheus export

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        MFA Service                          │
│  (High-level API for login/setup/verification)             │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│               NotificationDispatcherService                 │
│  (Orchestrates transactional challenge + outbox creation)  │
└────────┬────────────────────────────────┬───────────────────┘
         │                                │
         ▼                                ▼
┌────────────────────┐         ┌────────────────────────┐
│ MfaChallengeRepo   │         │ NotificationOutboxRepo │
│                    │         │                        │
│ • Row-level lock   │         │ • FOR UPDATE SKIP LOCK │
│ • State machine    │         │ • Idempotency          │
│ • Supersede logic  │         │ • Retry scheduling     │
└────────────────────┘         └────────┬───────────────┘
                                        │
                                        ▼
                              ┌─────────────────────┐
                              │ NotificationWorker  │
                              │                     │
                              │ • Polling           │
                              │ • Exponential       │
                              │   backoff           │
                              │ • OTP expiry check  │
                              └──────┬──────────────┘
                                     │
                                     ▼
                            ┌────────────────────┐
                            │    SmsProvider     │
                            │                    │
                            │ • MSG91            │
                            │ • Twilio           │
                            │ • AWS SNS          │
                            │ • Console (dev)    │
                            │ • Disabled (safe)  │
                            └────────────────────┘
```

---

## Components

### 1. Database Schema

**File:** `backend/migrations/20260811_mfa_challenges_outbox.sql`

#### mfa_challenges
Proper challenge lifecycle tracking:
- **State machine:** CREATED → QUEUED → SENDING → SENT → VERIFIED → CONSUMED
- **Failure paths:** DELIVERY_FAILED, EXPIRED, LOCKED, PROVIDER_UNAVAILABLE, SUPERSEDED
- **Security:** Stores `otp_hash` (verification) and `otp_ciphertext` (delivery, temporary)
- **Tracking:** Attempts, provider, message ID, errors

#### notification_outbox
Transactional outbox for reliable delivery:
- **Idempotency:** Unique key prevents duplicates
- **Retry logic:** Exponential backoff scheduling via `next_attempt_at`
- **Worker coordination:** FOR UPDATE SKIP LOCKED prevents contention
- **Cleanup:** Sensitive payload cleared after delivery

#### mfa_rate_limits
Abuse prevention:
- **Granular limits:** Per user, destination, IP, tenant
- **Sliding windows:** Configurable duration
- **Operations:** send, verify, resend

#### mfa_provider_health
Provider monitoring:
- **Health tracking:** Success/failure rates
- **Latency:** Average response times
- **Consecutive failures:** Circuit breaker support

### 2. SMS Provider Abstraction

**Files:** `backend/src/identity/sms/`

Vendor-agnostic interface with implementations:

- **MSG91** - Indian DLT-compliant gateway
- **Twilio** - Global SMS delivery
- **AWS SNS** - AWS-integrated messaging
- **Console** - Development logging (explicit SMS_PROVIDER=console)
- **Disabled** - Fail-closed default

All providers normalize errors to standard codes:
- `INVALID_NUMBER`, `DESTINATION_BLOCKED`, `AUTHENTICATION_FAILED` (non-retryable)
- `RATE_LIMITED`, `PROVIDER_TIMEOUT`, `NETWORK_ERROR` (retryable)

### 3. OTP Encryption

**File:** `backend/src/identity/encryption/otp-encryption.service.ts`

- **Algorithm:** AES-256-GCM
- **Unique IV:** Per encryption
- **Authenticated encryption:** Integrity + confidentiality
- **Lifecycle:** Encrypted for delivery → Cleared after send
- **Hashing:** SHA-256 with timing-safe comparison

### 4. Repositories

**MfaChallengeRepository:**
- Row-level locking: `SELECT FOR UPDATE`
- State transitions with validation
- Supersede logic for resends
- Cleanup methods

**NotificationOutboxRepository:**
- Transactional enqueue
- Worker-safe polling: `FOR UPDATE SKIP LOCKED`
- Retry scheduling with backoff
- Sensitive payload clearing

### 5. Notification Worker

**File:** `backend/src/identity/workers/notification-worker.ts`

**Features:**
- Continuous polling with adaptive intervals
- Batch processing (configurable size)
- Exponential backoff: 10s → 20s → 40s → 80s → 160s (capped at 5min)
- OTP expiry awareness: Aborts retry if OTP would expire
- Decrypts OTP from outbox payload
- Updates challenge status: QUEUED → SENDING → SENT
- Clears sensitive data after delivery
- Handles provider errors with retry classification

**Usage:**
```typescript
import { startNotificationWorker } from './workers/notification-worker.js';

const worker = await startNotificationWorker(pool, {
  pollIntervalMs: 1000,
  batchSize: 10,
  backoffBase: 10,
  maxBackoffSeconds: 300,
  continuous: true,
});
```

### 6. Rate Limiting

**File:** `backend/src/identity/services/mfa-rate-limiter.service.ts`

**Default Limits:**
- **Send:** 5 per 10min/user, 10 per hour/destination
- **Verify:** 10 per 10min/user, 20 per hour/destination
- **Resend:** 3 per 10min/user, 5 per hour/destination

**Usage:**
```typescript
const result = await rateLimiter.checkAllLimits({
  userId,
  destination: phoneNumber,
  ipAddress: req.ip,
  tenantId,
  operation: 'send',
});

if (!result.allowed) {
  return res.status(429).json({
    error: 'Rate limit exceeded',
    retryAfterSeconds: result.retryAfterSeconds,
  });
}
```

### 7. Observability

**Files:**
- `backend/src/identity/services/mfa-metrics.service.ts`
- `backend/src/identity/routes/mfa-health.routes.ts`

**Health Endpoints:**
- `GET /api/mfa/health` - Overall system health
- `GET /api/mfa/health/providers` - SMS provider status
- `GET /api/mfa/health/queue` - Queue depth and age
- `GET /api/mfa/metrics` - JSON metrics
- `GET /api/mfa/metrics/prometheus` - Prometheus format
- `GET /api/mfa/health/diagnostics` - Detailed diagnostics

**Metrics Tracked:**
- Challenge creation, delivery, verification rates
- Success/failure rates by method and provider
- Latency distributions (P50, P95, P99)
- Rate limit violations
- Provider health and response times
- Queue depth and message age

---

## Configuration

### Environment Variables

```bash
# OTP Encryption Key (REQUIRED)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
OTP_ENCRYPTION_KEY=your_64_character_hex_key_here

# SMS Provider Selection (REQUIRED)
SMS_PROVIDER=msg91  # Options: msg91, twilio, sns, console, disabled

# MSG91 Configuration
MSG91_AUTH_KEY=your_msg91_auth_key
MSG91_SENDER_ID=SGALRT
MSG91_ROUTE=4  # 4 = Transactional
MSG91_DLT_TEMPLATE_ID=your_dlt_template_id  # For Indian telecom

# Twilio Configuration
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+1234567890

# AWS SNS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
SNS_SENDER_ID=YourBrand

# Worker Configuration
SMS_MAX_RETRIES=3
SMS_TIMEOUT_MS=10000

# Development Only
SMS_CONSOLE_SHOW_BODY=false  # Set to true to see SMS content in console
```

### Database Migration

```bash
# Run migration
psql -d your_database -f backend/migrations/20260811_mfa_challenges_outbox.sql

# Or via your migration tool
npm run migrate
```

### Starting the Worker

```typescript
// Option 1: Integrated with main server
import { startNotificationWorker } from './identity/workers/notification-worker.js';

await startNotificationWorker(pool);

// Option 2: Separate worker process
// workers/notification-worker-standalone.ts
import { Pool } from 'pg';
import { startNotificationWorker } from '../identity/workers/notification-worker.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

startNotificationWorker(pool);
```

### Docker Compose Example

```yaml
services:
  api:
    build: .
    environment:
      - OTP_ENCRYPTION_KEY=${OTP_ENCRYPTION_KEY}
      - SMS_PROVIDER=msg91
      - MSG91_AUTH_KEY=${MSG91_AUTH_KEY}
    depends_on:
      - postgres

  notification-worker:
    build: .
    command: node dist/workers/notification-worker-standalone.js
    environment:
      - OTP_ENCRYPTION_KEY=${OTP_ENCRYPTION_KEY}
      - SMS_PROVIDER=msg91
      - MSG91_AUTH_KEY=${MSG91_AUTH_KEY}
    depends_on:
      - postgres

  postgres:
    image: postgres:15
    volumes:
      - ./migrations:/docker-entrypoint-initdb.d
```

---

## Usage Examples

### 1. Send SMS OTP

```typescript
import { MFAService } from './identity/mfa-service.js';

const mfaService = new MFAService(pool);

const result = await mfaService.sendSMSOTP(
  userId,
  tenantId,
  '+919876543210'
);

if (result.status === 'provider_unavailable') {
  return res.status(503).json({
    error: 'SMS service temporarily unavailable',
    reason: result.reason,
  });
}

// Success - OTP queued for delivery
res.json({
  challengeId: result.challengeId,
  maskedDestination: result.maskedDestination, // +91****3210
  expiresAt: result.expiresAt,
});
```

### 2. Verify SMS OTP

```typescript
const verification = await mfaService.verifySMSOTP(
  userId,
  submittedCode,
  challengeId // Optional
);

if (!verification.success) {
  return res.status(401).json({
    error: 'Invalid verification code',
    details: verification.error,
  });
}

// Success - consume challenge to prevent replay
await mfaService.consumeChallenge(verification.challengeId!);

// Complete authentication
await completeLogin(userId);
```

### 3. Resend OTP

```typescript
const result = await mfaService.resendSMSOTP(
  userId,
  tenantId,
  '+919876543210'
);

if (result.status === 'provider_unavailable') {
  return res.status(503).json({ error: result.reason });
}

res.json({
  challengeId: result.challengeId,
  expiresAt: result.expiresAt,
});
```

### 4. Check Available Methods

```typescript
const methods = await mfaService.getAvailableMethods(tenantId);

res.json({
  methods: methods.map(m => ({
    method: m.method,
    available: m.available,
    reason: m.reason,
  })),
});

// Example response:
// {
//   "methods": [
//     { "method": "totp", "available": true },
//     { "method": "sms", "available": false, "reason": "SMS provider not configured" }
//   ]
// }
```

---

## Security Considerations

### 1. OTP Storage

✅ **Do:**
- Store `otp_hash` for verification (one-way SHA-256)
- Store `otp_ciphertext` temporarily for delivery (AES-256-GCM)
- Clear `otp_ciphertext` after successful delivery

❌ **Don't:**
- Store plaintext OTP
- Log OTP in production (even masked)
- Reuse OTP across challenges

### 2. Phone Number Privacy

✅ **Do:**
- Store `destination_hash` for correlation
- Mask phone numbers in responses: `+91****3210`
- Hash phone numbers in rate limit keys

❌ **Don't:**
- Return full phone numbers in API responses
- Log raw phone numbers (use masked versions)

### 3. Rate Limiting

✅ **Do:**
- Enforce multi-dimensional limits (user, destination, IP, tenant)
- Use sliding windows
- Fail open on rate limit check errors (allow operation)

❌ **Don't:**
- Allow unlimited send attempts
- Use simple per-user limits only
- Block legitimate users on system errors

### 4. Error Messages

✅ **Do:**
- Use generic messages for unauthenticated flows
- Log detailed errors internally
- Provide specific errors for authenticated users

❌ **Don't:**
- Reveal "No user with this phone" (account enumeration)
- Expose provider-specific errors externally
- Leak timing information

---

## Monitoring

### Key Metrics to Watch

1. **Delivery Success Rate**
   - Target: >95%
   - Alert: <90%

2. **Queue Depth**
   - Target: <100
   - Alert: >1000

3. **Delivery Latency P95**
   - Target: <30s
   - Alert: >60s

4. **Verification Success Rate**
   - Target: >80% (first attempt)
   - Alert: <60%

5. **Provider Health**
   - Alert: Consecutive failures >5

### Dashboard Queries

```sql
-- Delivery success rate (last hour)
SELECT 
  COUNT(*) FILTER (WHERE status = 'sent') * 100.0 / COUNT(*) as success_rate
FROM notification_outbox
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND channel = 'sms';

-- Average delivery time
SELECT 
  AVG(EXTRACT(EPOCH FROM (sent_at - created_at))) as avg_delivery_seconds
FROM notification_outbox
WHERE sent_at IS NOT NULL
  AND created_at > NOW() - INTERVAL '1 hour';

-- Challenges by status
SELECT status, COUNT(*) as count
FROM mfa_challenges
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY status;
```

---

## Testing

### Development Testing

```bash
# Use console provider to see SMS without sending
export SMS_PROVIDER=console
export SMS_CONSOLE_SHOW_BODY=true
export OTP_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

npm run dev
```

### Integration Testing

```typescript
describe('SMS MFA', () => {
  it('should fail closed when provider unavailable', async () => {
    process.env.SMS_PROVIDER = 'disabled';
    
    const result = await mfaService.sendSMSOTP(userId, tenantId, phone);
    
    expect(result.status).toBe('provider_unavailable');
    expect(result.reason).toContain('not configured');
  });

  it('should create challenge and outbox atomically', async () => {
    const result = await mfaService.sendSMSOTP(userId, tenantId, phone);
    
    expect(result.status).toBe('queued');
    
    const challenge = await challengeRepo.findById(result.challengeId);
    expect(challenge.status).toBe('QUEUED');
    
    const outbox = await outboxRepo.findByIdempotencyKey(
      `mfa:${result.challengeId}:initial`
    );
    expect(outbox.status).toBe('pending');
  });

  it('should verify OTP atomically', async () => {
    // Send OTP
    const dispatch = await mfaService.sendSMSOTP(userId, tenantId, phone);
    
    // Simulate worker delivery
    await worker.processOnce();
    
    // Verify with correct code
    const verification = await mfaService.verifySMSOTP(
      userId,
      correctOtp,
      dispatch.challengeId
    );
    
    expect(verification.success).toBe(true);
    
    const challenge = await challengeRepo.findById(dispatch.challengeId);
    expect(challenge.status).toBe('VERIFIED');
  });
});
```

---

## Troubleshooting

### Issue: OTPs not being delivered

**Check:**
1. SMS provider configuration: `GET /api/mfa/health/providers`
2. Queue depth: `GET /api/mfa/health/queue`
3. Worker status: Check logs for worker errors
4. Provider health: Check consecutive failures

**Fix:**
```bash
# Check provider health
curl http://localhost:3000/api/mfa/health/providers

# Reset stuck messages
curl -X POST http://localhost:3000/api/mfa/health/maintenance/cleanup

# Restart worker
pm2 restart notification-worker
```

### Issue: High rate limit violations

**Check:**
1. Rate limit stats: `GET /api/mfa/health/diagnostics`
2. Recent activity patterns

**Fix:**
```typescript
// Adjust rate limits
const rateLimiter = new MfaRateLimiterService(pool, {
  send: {
    user: { maxAttempts: 10, windowSeconds: 600 },
  },
});

// Or reset limits for specific user
await rateLimiter.resetLimits('user', userId, 'send');
```

### Issue: Challenges stuck in SENDING

**Cause:** Worker crash or provider timeout

**Fix:**
```sql
-- Manual recovery
UPDATE mfa_challenges
SET status = 'QUEUED'
WHERE status = 'SENDING'
  AND updated_at < NOW() - INTERVAL '5 minutes';

-- Or use maintenance endpoint
curl -X POST http://localhost:3000/api/mfa/health/maintenance/cleanup
```

---

## Migration from Old System

If you have existing `mfa_otp_codes` table:

1. The migration script automatically migrates recent records (last 7 days)
2. Old records are preserved for audit
3. New system uses `mfa_challenges` table

**Coexistence period:**
- Both systems can run simultaneously
- Route new requests to new MFA service
- Old challenges use old verification path
- Gradually migrate users to new system

---

## Production Checklist

- [ ] Generate and secure `OTP_ENCRYPTION_KEY`
- [ ] Configure SMS provider (MSG91/Twilio/SNS)
- [ ] Run database migration
- [ ] Start notification worker (separate process or integrated)
- [ ] Configure rate limits for your threat model
- [ ] Set up monitoring dashboards
- [ ] Configure Prometheus scraping
- [ ] Test provider failover
- [ ] Document SMS templates for compliance
- [ ] Set up alerting for key metrics
- [ ] Review and test backup/recovery procedures

---

## Summary

This implementation transforms SMS MFA from an incomplete prototype into a production-ready system with:

✅ **Reliability:** Transactional outbox prevents data loss  
✅ **Security:** Encrypted storage, timing-safe comparison, fail-closed design  
✅ **Scalability:** Worker-based delivery, multi-worker support  
✅ **Observability:** Comprehensive metrics and health checks  
✅ **Resilience:** Exponential backoff, retry logic, rate limiting  
✅ **Auditability:** Full state machine tracking, audit logs  

The system now properly separates **OTP generation** from **delivery** from **verification**, with explicit result types at each stage. No more silent failures or "return true" lies.
