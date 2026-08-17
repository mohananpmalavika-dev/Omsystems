# Notification System Deployment Guide

## Quick Start (15 Minutes)

### Step 1: Database Setup (5 min)

```bash
# Run the migration
psql $DATABASE_URL -f backend/migrations/020_notification_infrastructure.sql

# Verify tables created
psql $DATABASE_URL -c "\dt notification*"
```

Expected output: 11 tables created

### Step 2: Environment Configuration (3 min)

Add to `.env`:

```bash
# SMTP Email Provider
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=alerts@yourdomain.com
SMTP_PASSWORD=your_app_password
SMTP_FROM=alerts@yourdomain.com
SMTP_FROM_NAME=Sentinel Grid Alerts

# SMS Gateway (Generic HTTP)
SMS_GATEWAY_URL=https://api.smsprovider.com/send
SMS_GATEWAY_API_KEY=your_api_key
SMS_SENDER_ID=SENTINEL

# OR Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxx
TWILIO_AUTH_TOKEN=your_token
TWILIO_FROM_NUMBER=+1234567890

# Workers
NOTIFICATION_WORKER_ENABLED=true
NOTIFICATION_WORKER_BATCH_SIZE=100
ESCALATION_WORKER_ENABLED=true
```

### Step 3: Install Dependencies (2 min)

```bash
cd backend
npm install nodemailer
npm install @types/nodemailer --save-dev
```

### Step 4: Start Workers (2 min)

Add to your server startup (`backend/src/server.ts`):

```typescript
import { NotificationOutboxWorker, DEFAULT_WORKER_CONFIG } from './notifications/workers/notification-outbox-worker.js';
import { EscalationEngine } from './notifications/services/escalation-engine.service.js';
import { NotificationRepository } from './notifications/repositories/notification.repository.js';
import { providerFactory } from './notifications/adapters/provider-factory.js';

// Initialize notification system
const notificationRepo = new NotificationRepository(pool);
const notificationWorker = new NotificationOutboxWorker(
  DEFAULT_WORKER_CONFIG,
  notificationRepo
);

// Load and initialize providers
const providerConfigs = await notificationRepo.getProviderConfigs();
await providerFactory.loadProviders(providerConfigs);

// Start workers
if (process.env.NOTIFICATION_WORKER_ENABLED === 'true') {
  await notificationWorker.start();
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await notificationWorker.stop();
});
```

### Step 5: Register Routes (3 min)

Add to your route registration:

```typescript
import { notificationPolicyRoutes } from './routes/notification-policy.routes.js';

// Register notification routes
await app.register(notificationPolicyRoutes);
```

### Step 6: Create Initial Setup

#### Via API:

```bash
# 1. Create a recipient group
curl -X POST http://localhost:3000/v1/notification-recipient-groups \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SOC Team",
    "description": "Security Operations Center",
    "members": [
      {
        "displayName": "John Doe",
        "email": "john@company.com",
        "phone": "+919876543210",
        "enabled": true
      }
    ]
  }'

# 2. Create a notification policy
curl -X POST http://localhost:3000/v1/notification-policies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Default Policy",
    "p1Rule": {
      "channels": ["dashboard", "email", "sms"],
      "recipientGroupIds": ["<group-id-from-step-1>"],
      "requireAcknowledgement": true
    }
  }'

# 3. Publish the policy
curl -X POST http://localhost:3000/v1/notification-policies/<policy-id>/publish
```

---

## Production Deployment

### 1. Provider Configuration

#### SMTP Setup (Gmail Example)

```bash
# Enable "App Passwords" in Gmail
# https://myaccount.google.com/apppasswords

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=app_password_here
SMTP_FROM=your-email@gmail.com
```

#### SMS Gateway Setup

For production SMS, integrate with:
- **Twilio:** Most popular, 160+ countries
- **AWS SNS:** Good for AWS infrastructure
- **Custom Gateway:** Your enterprise SMS provider

```typescript
// Create provider config in database
INSERT INTO notification_provider_configs (
  provider_key, provider_type, channel, config, enabled, is_default
) VALUES (
  'twilio-sms',
  'TWILIO',
  'sms',
  '{"accountSid": "ACxxx", "authToken": "***", "fromNumber": "+1234567890"}',
  true,
  true
);
```

### 2. Worker Deployment

#### Option A: Single Server
Workers run in the same process as the API server (already configured above).

#### Option B: Separate Worker Process

```typescript
// workers/notification-worker.ts
import { NotificationOutboxWorker } from '../notifications/workers/notification-outbox-worker.js';
import { pool } from '../database.js';

const worker = new NotificationOutboxWorker(
  {
    batchSize: 100,
    pollIntervalMs: 1000,
    maxAttempts: 5,
    processingTimeoutMs: 300000,
    exponentialBackoffBase: 5,
  },
  new NotificationRepository(pool)
);

await worker.start();

// Keep process alive
process.on('SIGTERM', async () => {
  console.log('Shutting down notification worker...');
  await worker.stop();
  process.exit(0);
});
```

Run with PM2:
```bash
pm2 start workers/notification-worker.ts --name notification-worker
```

### 3. Monitoring Setup

#### Health Checks

```typescript
// Add to your /health endpoint
app.get('/health/notifications', async (req, res) => {
  const stats = {
    worker: notificationWorker.getStats(),
    providers: await providerFactory.checkAllProviders(),
    queueDepth: await notificationRepo.getQueueDepth(),
    deadLetterCount: await notificationRepo.getDeadLetterCount(),
  };

  const healthy = 
    stats.worker.running &&
    stats.queueDepth < 1000 &&
    stats.deadLetterCount < 10;

  res.status(healthy ? 200 : 503).json(stats);
});
```

#### Alerts

Set up alerts for:
```yaml
- name: notification_queue_depth
  condition: notification_outbox.status = 'PENDING' > 1000
  severity: warning

- name: notification_dead_letter
  condition: notification_outbox.status = 'DEAD_LETTER' > 10
  severity: critical

- name: provider_unhealthy
  condition: notification_provider_configs.health_status = 'UNHEALTHY'
  severity: warning

- name: escalation_breach
  condition: escalation_job.current_step >= total_steps AND status = 'ACTIVE'
  severity: critical
```

### 4. Database Indexes (Already in Migration)

Verify indexes exist:
```sql
-- Check critical indexes
SELECT schemaname, tablename, indexname 
FROM pg_indexes 
WHERE tablename LIKE 'notification%'
ORDER BY tablename, indexname;
```

Key indexes:
- `notification_outbox(status, available_at)` - Worker queries
- `notification_outbox(dedup_key)` - Uniqueness
- `notification_escalation_jobs(status, next_escalation_at)` - Escalation processing

### 5. Backup Strategy

```sql
-- Backup notification configuration
pg_dump -h localhost -U postgres \
  -t notification_policies \
  -t notification_policy_versions \
  -t notification_recipient_groups \
  -t notification_recipient_members \
  -t notification_templates \
  -t notification_provider_configs \
  --data-only \
  sentinel_db > notification_config_backup.sql
```

---

## Testing Your Deployment

### 1. Test Email

```bash
curl -X POST http://localhost:3000/v1/notification-policies/test \
  -H "Content-Type: application/json" \
  -d '{
    "severity": "P2",
    "channels": ["email"],
    "recipientGroupIds": ["<your-group-id>"],
    "customMessage": "Test email notification from Sentinel Grid"
  }'
```

### 2. Test SMS

```bash
curl -X POST http://localhost:3000/v1/notification-policies/test \
  -H "Content-Type: application/json" \
  -d '{
    "severity": "P2",
    "channels": ["sms"],
    "recipientGroupIds": ["<your-group-id>"],
    "customMessage": "Test SMS from Sentinel Grid"
  }'
```

### 3. Test Escalation

```typescript
// Create a test incident
const incident = await incidentRepo.create({
  tenantId: 'test-tenant',
  severity: 'P1',
  alertType: 'VAULT_INTRUSION',
  branchId: 'branch-1',
  title: 'Test Escalation',
});

// Verify notifications created in outbox
const notifications = await notificationRepo.getIncidentNotifications(incident.id);
console.log(`Created ${notifications.length} notifications`);

// Verify escalation job created
const escalation = await escalationEngine.getEscalationStatus(incident.id);
console.log('Escalation:', escalation);

// Wait for first step to process
await new Promise(resolve => setTimeout(resolve, 5000));

// Check delivery history
const deliveries = await notificationRepo.getIncidentDeliveries(incident.id);
console.log('Deliveries:', deliveries);
```

### 4. Test Quiet Hours

```typescript
// Create policy with quiet hours
const policy = await notificationRepo.createPolicy({
  tenantId: 'test-tenant',
  name: 'Test Quiet Hours',
  quietHours: {
    enabled: true,
    start: '22:00',
    end: '06:00',
    timezone: 'Asia/Kolkata',
    bypassSeverities: ['P1'],
  },
  // ... other config
});

// Test during quiet hours (should only send dashboard for P2+)
// Test with P1 (should bypass quiet hours)
```

---

## Common Issues & Solutions

### Issue: Emails Not Sending

**Check:**
```sql
SELECT status, last_error_code, last_error_message, count(*) 
FROM notification_outbox 
WHERE channel = 'email' 
GROUP BY status, last_error_code, last_error_message;
```

**Common causes:**
- Invalid SMTP credentials → Update `.env`
- Firewall blocking port 587 → Check network
- Gmail blocking → Use App Password
- Rate limiting → Check provider limits

### Issue: SMS Failing

**Check provider logs:**
```sql
SELECT recipient_destination_masked, error_code, error_message
FROM notification_deliveries
WHERE channel = 'sms' AND status = 'FAILED'
ORDER BY created_at DESC
LIMIT 10;
```

**Common causes:**
- Invalid E.164 format → Should be `+[country][number]`
- Insufficient credits → Check SMS provider account
- Invalid sender ID → Some countries require pre-registration

### Issue: Escalation Not Progressing

**Check job status:**
```sql
SELECT * FROM notification_escalation_jobs
WHERE status = 'ACTIVE'
ORDER BY next_escalation_at;
```

**Verify:**
- Escalation worker is running
- `next_escalation_at` timestamp is in the past
- Policy has escalation steps configured

### Issue: Dead Letters Accumulating

**Query dead letters:**
```sql
SELECT 
  channel,
  last_error_code,
  count(*) as count
FROM notification_outbox
WHERE status = 'DEAD_LETTER'
GROUP BY channel, last_error_code
ORDER BY count DESC;
```

**Actions:**
1. Fix root cause (invalid recipients, provider config)
2. Manually retry if transient issue:
```sql
UPDATE notification_outbox 
SET status = 'PENDING', 
    attempt_count = 0,
    available_at = NOW()
WHERE status = 'DEAD_LETTER'
  AND last_error_code = 'NETWORK_ERROR';
```

---

## Performance Tuning

### Worker Configuration

For high-volume deployments:

```typescript
{
  batchSize: 500,           // Increase for throughput
  pollIntervalMs: 500,      // Decrease for lower latency
  maxAttempts: 3,           // Decrease for faster dead-letter
  processingTimeoutMs: 180000, // 3 minutes
  exponentialBackoffBase: 3,   // Faster retry
}
```

### Database Optimization

```sql
-- Partition outbox table by month (for high volume)
CREATE TABLE notification_outbox_2026_08 PARTITION OF notification_outbox
FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

-- Add more indexes for specific queries
CREATE INDEX idx_outbox_tenant_status 
ON notification_outbox(tenant_id, status, created_at);
```

### Horizontal Scaling

Run multiple worker instances:
```bash
pm2 start workers/notification-worker.ts -i 4 --name notification-worker
```

Workers coordinate via database (no shared state needed).

---

## Security Hardening

### 1. Encrypt Provider Credentials

```typescript
// Store credentials encrypted
import { encrypt } from './crypto';

const encryptedToken = encrypt(smtpPassword, process.env.ENCRYPTION_KEY);

await pool.query(
  'UPDATE notification_provider_configs SET credentials_ref = $1 WHERE id = $2',
  [encryptedToken, providerId]
);
```

### 2. Rate Limit API Endpoints

```typescript
import rateLimit from '@fastify/rate-limit';

app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  allowList: ['127.0.0.1'],
});
```

### 3. RBAC Permissions

```typescript
const PERMISSIONS = {
  'notification.policy.view': ['admin', 'security_manager'],
  'notification.policy.create': ['admin', 'security_manager'],
  'notification.policy.publish': ['admin'],
  'notification.recipient.manage': ['admin', 'security_manager'],
  'notification.test.send': ['admin', 'security_manager', 'security_operator'],
};
```

---

## Maintenance

### Weekly Tasks
- [ ] Review dead-letter queue
- [ ] Check provider health status
- [ ] Review escalation breach incidents
- [ ] Audit policy changes

### Monthly Tasks
- [ ] Clean old audit logs (> 90 days)
- [ ] Archive completed escalation jobs
- [ ] Review notification statistics
- [ ] Update templates if needed

### Quarterly Tasks
- [ ] Review and optimize database indexes
- [ ] Test disaster recovery procedure
- [ ] Update provider configurations
- [ ] Review and adjust rate limits

---

## Support & Documentation

- **Implementation Guide:** `NOTIFICATION_SYSTEM_IMPLEMENTATION.md`
- **API Documentation:** Swagger/OpenAPI at `/api-docs`
- **Database Schema:** `backend/migrations/020_notification_infrastructure.sql`
- **Example Configurations:** `backend/src/notifications/examples/`

For issues or questions:
1. Check logs in `notification_outbox` and `notification_audit_log`
2. Review provider health in `notification_provider_configs`
3. Check worker status via `/health/notifications` endpoint
4. Contact system administrator

---

**Deployment Status Checklist:**

- [ ] Database migration completed
- [ ] Environment variables configured
- [ ] Workers started and running
- [ ] Providers configured and tested
- [ ] Recipient groups created
- [ ] Notification policy published
- [ ] Test notifications successful
- [ ] Monitoring and alerts configured
- [ ] Documentation reviewed
- [ ] Team trained on system

**You're ready for production! 🚀**
