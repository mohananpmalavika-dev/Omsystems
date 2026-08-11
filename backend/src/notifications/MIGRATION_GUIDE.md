# Notification System Migration Guide

Complete guide for migrating from the disconnected notification implementations to the unified system.

## Overview

### Before Migration

**Two disconnected implementations:**

1. **Analytics Engine** → Calls non-existent endpoints:
   - `POST /internal/email` ❌
   - `POST /internal/sms` ❌
   - `POST /internal/push` ❌

2. **Backend** → Writes to queues with no consumers:
   - `email_queue` table ❌
   - `sms_queue` table ❌
   - No worker to process them ❌

### After Migration

**One unified system:**

```
Analytics/Backend Services
        ↓
NotificationService.enqueue()
        ↓
notification_deliveries (outbox)
        ↓
Workers (SKIP LOCKED)
        ↓
Providers (SMTP, In-App, Webhook, etc.)
```

## Migration Steps

### Step 1: Database Migration

Run the schema migration:

```bash
psql -d sentinel_db -U sentinel_user -f backend/database/migrations/090_create_notification_system.sql
```

This creates:
- `notifications` table
- `notification_deliveries` table
- `notification_delivery_attempts` table
- `user_push_devices` table
- `notification_policies` table
- `notification_preferences` table
- All necessary indexes and functions

**Verify:**

```sql
-- Check tables exist
\dt notification*

-- Check views
\dv v_notification*

-- Check functions
\df reset_stuck_notification_deliveries
```

### Step 2: Install Dependencies

```bash
cd backend
npm install nodemailer @types/nodemailer
```

### Step 3: Update Backend Application Bootstrap

**File: `backend/src/server.ts` or `backend/src/index.ts`**

```typescript
import { Pool } from 'pg';
import fastify from 'fastify';
import {
  NotificationService,
  NotificationRepository,
  NotificationWorkerRunner,
  ProviderRegistry,
  SmtpEmailProvider,
  InAppProvider,
  WebhookProvider,
  registerInternalNotificationsRoute
} from './notifications/index.js';

// Initialize database pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000
});

// Setup notification system
const repository = new NotificationRepository(pool);
const notificationService = new NotificationService(repository);

// Register providers
const providers = new ProviderRegistry();

// SMTP Email Provider
providers.register(
  new SmtpEmailProvider({
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    } : undefined,
    from: process.env.SMTP_FROM || 'noreply@sentinel.local'
  })
);

// In-App Provider
providers.register(new InAppProvider(pool));

// Webhook Provider
providers.register(
  new WebhookProvider({
    userAgent: 'Sentinel-Notifications/1.0',
    signatureSecret: process.env.WEBHOOK_SECRET
  })
);

// Start workers
const workerRunner = new NotificationWorkerRunner(pool, providers, {
  workerCount: parseInt(process.env.NOTIFICATION_WORKERS || '2'),
  batchSize: parseInt(process.env.NOTIFICATION_BATCH_SIZE || '50'),
  pollIntervalMs: parseInt(process.env.NOTIFICATION_POLL_MS || '1000'),
  lockTimeoutMinutes: 5,
  recoveryIntervalMs: 60000
});

workerRunner.start();

// Register Fastify routes
const app = fastify();

await registerInternalNotificationsRoute(app, notificationService);

// Your other routes...

// Export for use in other services
export { notificationService, pool };

await app.listen({ port: 3000, host: '0.0.0.0' });
console.log('Server running on http://localhost:3000');
```

### Step 4: Update Environment Variables

Add to `.env`:

```bash
# SMTP Configuration
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=notifications@example.com
SMTP_PASSWORD=your_smtp_password
SMTP_FROM="Sentinel Alerts <noreply@sentinel.local>"

# Webhook Configuration
WEBHOOK_SECRET=your_webhook_signature_secret

# Worker Configuration
NOTIFICATION_WORKERS=2
NOTIFICATION_BATCH_SIZE=50
NOTIFICATION_POLL_MS=1000

# Internal API Security
INTERNAL_API_KEY=your_internal_api_key
```

### Step 5: Migrate Backend Services

**Before:**

```typescript
// backend/src/services/prediction-notification.service.ts
await this.pool.query(
  `INSERT INTO email_queue (recipient, subject, body, priority) 
   VALUES ($1, $2, $3, 'high')`,
  [email, subject, body]
);

await this.pool.query(
  `INSERT INTO sms_queue (phone_number, message, priority) 
   VALUES ($1, $2, 'high')`,
  [phone, message]
);
```

**After:**

```typescript
// Import the service
import { notificationService } from '../server.js';

// Use unified notification service
await notificationService.enqueue({
  tenantId: 'tenant_123',
  type: 'prediction_alert',
  channels: ['email', 'sms'],
  recipient: {
    userId: 'user_456',
    email: 'user@example.com',
    phone: '+1234567890'
  },
  subject: 'Critical Prediction Alert',
  title: 'HDD Failure Predicted',
  body: 'HDD failure predicted in 24 hours...',
  priority: 'critical',
  metadata: {
    predictionId: 'pred_123',
    severity: 'critical'
  },
  idempotencyKey: `prediction:pred_123:user_456`
});
```

**With Transactional Outbox (Recommended):**

```typescript
const client = await pool.connect();

try {
  await client.query('BEGIN');

  // Save domain event
  const result = await client.query(
    'INSERT INTO predictions (...) VALUES (...) RETURNING id',
    [...]
  );
  const predictionId = result.rows[0].id;

  // Enqueue notification in same transaction
  await notificationService.enqueue(
    {
      tenantId: 'tenant_123',
      type: 'prediction_alert',
      channels: ['email', 'sms'],
      recipient: { userId: 'user_456' },
      title: 'Critical Alert',
      body: 'HDD failure predicted...',
      idempotencyKey: `prediction:${predictionId}`
    },
    { transaction: client }
  );

  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

### Step 6: Migrate Analytics Engine

**Before:**

```typescript
// analytics-engine/src/notification-engine.ts
await fetch(`${backendUrl}/internal/email`, {
  method: 'POST',
  body: JSON.stringify({ to: email, subject, body })
});

await fetch(`${backendUrl}/internal/sms`, {
  method: 'POST',
  body: JSON.stringify({ to: phone, message })
});
```

**After:**

```typescript
// Use unified endpoint
await fetch(`${backendUrl}/internal/notifications`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Analytics-Engine-Key': sharedKey
  },
  body: JSON.stringify({
    tenantId: 'tenant_123',
    type: 'intrusion_detected',
    channels: ['email', 'push', 'in_app'],
    recipient: {
      userId: 'operator_456'
    },
    title: 'Intrusion Detected',
    body: 'Camera 14 detected unauthorized entry',
    metadata: {
      cameraId: 'cam_14',
      detectionId: 'det_789',
      severity: 'P1'
    },
    idempotencyKey: `detection:det_789:user:operator_456`
  })
});
```

**Or use the new unified class:**

```typescript
import { UnifiedNotificationEngine } from './notification-engine-unified.js';

const notificationEngine = new UnifiedNotificationEngine({
  controlPlaneUrl: process.env.BACKEND_URL,
  sharedKey: process.env.INTERNAL_API_KEY
});

await notificationEngine.sendNotification(
  {
    alertId: 'det_789',
    tenantId: 'tenant_123',
    title: 'Intrusion Detected',
    description: 'Unauthorized entry detected',
    severity: 'P1',
    cameraId: 'cam_14',
    cameraName: 'Main Entrance',
    branchName: 'HQ Building',
    timestamp: new Date().toISOString()
  },
  [
    { type: 'in-app', recipient: 'operator_456' },
    { type: 'email', recipient: 'security@example.com' },
    { type: 'push', recipient: 'push_token_xyz' }
  ]
);
```

### Step 7: Verify Migration

**Check workers are running:**

```bash
# Look for log messages
tail -f logs/app.log | grep "Notification worker"

# Expected output:
# Notification worker started { workerId: 'worker-1-12345', ... }
# Notification worker started { workerId: 'worker-2-12345', ... }
```

**Check provider health:**

```bash
curl -X GET http://localhost:3000/health/notifications
```

**Send test notification:**

```bash
curl -X POST http://localhost:3000/internal/notifications \
  -H "Content-Type: application/json" \
  -H "X-Analytics-Engine-Key: your_key" \
  -d '{
    "tenantId": "tenant_test",
    "type": "test_notification",
    "channels": ["email"],
    "recipient": {
      "email": "test@example.com"
    },
    "title": "Test Notification",
    "body": "This is a test of the unified notification system"
  }'
```

**Monitor queue:**

```sql
-- Check pending deliveries
SELECT 
  channel,
  status,
  COUNT(*) as count
FROM notification_deliveries
GROUP BY channel, status;

-- Check recent deliveries
SELECT *
FROM notification_deliveries
ORDER BY created_at DESC
LIMIT 10;

-- Check delivery attempts
SELECT 
  nd.id,
  nd.channel,
  nd.destination,
  nd.status,
  nd.attempt_count,
  nda.error_message
FROM notification_deliveries nd
LEFT JOIN notification_delivery_attempts nda 
  ON nda.delivery_id = nd.id
WHERE nd.created_at >= NOW() - INTERVAL '1 hour'
ORDER BY nd.created_at DESC;
```

### Step 8: Clean Up Old Code

**After verifying the new system works:**

1. **Check old queues are empty:**

```sql
SELECT COUNT(*) FROM email_queue;
SELECT COUNT(*) FROM sms_queue;
```

2. **Rename old tables (don't drop immediately):**

```sql
ALTER TABLE email_queue RENAME TO email_queue_deprecated;
ALTER TABLE sms_queue RENAME TO sms_queue_deprecated;
```

3. **Remove old notification code:**

```typescript
// Delete these deprecated methods:
// - sendInAppNotification()
// - sendEmailNotification()
// - sendSmsNotification()

// Keep them commented for 1-2 releases, then remove completely
```

4. **After 30 days, drop deprecated tables:**

```sql
DROP TABLE email_queue_deprecated;
DROP TABLE sms_queue_deprecated;
```

## Rollback Plan

If you need to rollback:

1. **Stop workers:**

```typescript
workerRunner.stop();
```

2. **Revert code changes** (use git)

3. **Old system continues working** (if you didn't drop tables)

4. **New notifications won't be lost** (they're in `notification_deliveries`)

5. **Manually process stuck notifications** if needed

## Testing Checklist

- [ ] Database migration completed successfully
- [ ] Workers start without errors
- [ ] SMTP provider sends test email
- [ ] In-app notifications appear in database
- [ ] Webhooks reach destination
- [ ] Retry logic works (test with invalid email)
- [ ] Idempotency prevents duplicates
- [ ] Worker recovery resets stuck jobs
- [ ] Analytics engine can enqueue via API
- [ ] Backend services use transactional outbox
- [ ] All old `email_queue` writes removed
- [ ] All old `sms_queue` writes removed
- [ ] Monitoring/metrics working

## Troubleshooting

### Workers not processing

```sql
-- Check for stuck jobs
SELECT * FROM notification_deliveries
WHERE status = 'processing'
  AND locked_at < NOW() - INTERVAL '10 minutes';

-- Manually reset
SELECT reset_stuck_notification_deliveries(5);
```

### Emails not sending

1. Check SMTP configuration in logs
2. Verify SMTP credentials
3. Test SMTP connection manually:

```bash
npm install -g smtp-test-server
smtp-test-server --port 2525
```

4. Check delivery attempts:

```sql
SELECT * FROM notification_delivery_attempts
WHERE delivery_id = 'your-delivery-id'
ORDER BY attempt_number DESC;
```

### High retry rate

```sql
-- Find common errors
SELECT 
  last_error_code,
  COUNT(*) as count
FROM notification_deliveries
WHERE status = 'failed'
GROUP BY last_error_code
ORDER BY count DESC;
```

### Performance issues

```sql
-- Check queue depth
SELECT * FROM v_notification_queue_depth;

-- Find slow deliveries
SELECT 
  channel,
  AVG(duration_ms) as avg_ms,
  MAX(duration_ms) as max_ms
FROM notification_delivery_attempts
WHERE started_at >= NOW() - INTERVAL '1 hour'
GROUP BY channel;
```

## Support

For issues during migration:

1. Check logs: `tail -f logs/app.log`
2. Check database views: `SELECT * FROM v_notification_failures;`
3. Review README.md in `backend/src/notifications/`
4. Check delivery attempts for specific notification
