# 🚀 Quick Start Guide - Unified Notification System

Get the notification system up and running in 15 minutes.

## Prerequisites

- PostgreSQL 12+ running
- Node.js 18+ installed
- SMTP server available (or use development mode with mocks)

## Step 1: Database Setup (2 minutes)

```bash
# Run the migration
psql -d your_database_name -U your_user -f backend/database/migrations/090_create_notification_system.sql

# Verify tables created
psql -d your_database_name -c "\dt notification*"

# Expected output:
# notifications
# notification_deliveries
# notification_delivery_attempts
# notification_policies
# notification_preferences
# user_push_devices
# notification_worker_health
```

## Step 2: Install Dependencies (1 minute)

```bash
cd backend
npm install nodemailer @types/nodemailer
```

## Step 3: Configure Environment (2 minutes)

Create or update `.env` file:

```bash
# Database (if not already configured)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sentinel
DB_USER=sentinel_user
DB_PASSWORD=your_password

# SMTP Email (required for production, optional for dev)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM="Sentinel Alerts <noreply@sentinel.local>"

# Webhook (optional)
WEBHOOK_SECRET=generate-random-secret-here

# Worker Configuration (optional, has defaults)
NOTIFICATION_WORKERS=2
NOTIFICATION_BATCH_SIZE=50
NOTIFICATION_POLL_MS=1000

# Internal API (optional)
INTERNAL_API_KEY=your-internal-api-key
```

**Development Mode:** If you don't have SMTP, the system will use mock providers automatically.

## Step 4: Add to Application Bootstrap (5 minutes)

**Option A: Quick Setup (Recommended for testing)**

Add to your main server file (e.g., `backend/src/server.ts`):

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
  MockProvider,
  registerInternalNotificationsRoute
} from './notifications/index.js';

// Your existing pool
const pool = new Pool({ /* your config */ });

// Setup notification system
const repository = new NotificationRepository(pool);
const notificationService = new NotificationService(repository);

const providers = new ProviderRegistry();

// Production: Real providers
if (process.env.NODE_ENV === 'production' && process.env.SMTP_HOST) {
  providers.register(new SmtpEmailProvider({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD!
    } : undefined,
    from: process.env.SMTP_FROM || 'noreply@sentinel.local'
  }));
  console.log('✓ SMTP provider registered');
} else {
  // Development: Mock providers
  providers.register(new MockProvider('email'));
  console.log('✓ Mock email provider (dev mode)');
}

providers.register(new InAppProvider(pool));
providers.register(new WebhookProvider({
  userAgent: 'Sentinel/1.0',
  signatureSecret: process.env.WEBHOOK_SECRET
}));

// Start workers
const workerRunner = new NotificationWorkerRunner(pool, providers, {
  workerCount: parseInt(process.env.NOTIFICATION_WORKERS || '2'),
  batchSize: 50,
  pollIntervalMs: 1000,
  lockTimeoutMinutes: 5,
  recoveryIntervalMs: 60000
});

workerRunner.start();
console.log('✓ Notification workers started');

// Register routes
const app = fastify();
await registerInternalNotificationsRoute(app, notificationService);
console.log('✓ Notification routes registered');

// Export for use in other services
export { notificationService, pool };

// Your other app setup...
await app.listen({ port: 3000 });
```

**Option B: Use Complete Example**

See `backend/src/notifications/SETUP_EXAMPLE.ts` for production-ready setup with all features.

## Step 5: Test the System (5 minutes)

### Test 1: Health Check

```bash
curl http://localhost:3000/health/notifications
```

Expected response:
```json
{
  "providers": {
    "email": true,
    "in_app": true,
    "webhook": true
  },
  "channels": ["email", "in_app", "webhook"]
}
```

### Test 2: Send Test Notification

```bash
curl -X POST http://localhost:3000/internal/notifications \
  -H "Content-Type: application/json" \
  -H "X-Analytics-Engine-Key: your-key" \
  -d '{
    "tenantId": "test_tenant",
    "type": "test_notification",
    "channels": ["email", "in_app"],
    "recipient": {
      "email": "your-email@example.com",
      "userId": "test_user"
    },
    "title": "Test Notification",
    "body": "If you receive this, the system is working!",
    "priority": "normal"
  }'
```

Expected response:
```json
{
  "notificationId": "uuid-here",
  "deliveryIds": ["uuid-1", "uuid-2"],
  "status": "queued"
}
```

### Test 3: Check Queue & Workers

```bash
# Check if notification was processed
psql -d your_database -c "
  SELECT 
    channel, 
    status, 
    COUNT(*) 
  FROM notification_deliveries 
  GROUP BY channel, status;
"

# Should show:
# channel  | status    | count
# ---------+-----------+-------
# email    | accepted  | 1
# in_app   | delivered | 1
```

### Test 4: View Worker Metrics

```bash
curl http://localhost:3000/metrics/notifications
```

Expected response:
```json
[
  {
    "workerId": "worker-1",
    "metrics": {
      "jobsProcessed": 2,
      "jobsSucceeded": 2,
      "jobsFailed": 0,
      "averageProcessingTimeMs": 234.5
    }
  }
]
```

## Step 6: Update Existing Code (Variable)

### Backend Services

Replace this:
```typescript
await pool.query('INSERT INTO email_queue ...');
await pool.query('INSERT INTO sms_queue ...');
```

With this:
```typescript
import { notificationService } from './server.js';

await notificationService.enqueue({
  tenantId: 'tenant_123',
  type: 'alert_type',
  channels: ['email', 'sms'],
  recipient: { userId: 'user_456' },
  title: 'Alert Title',
  body: 'Alert message...',
  idempotencyKey: `alert:${alertId}`
});
```

### Analytics Engine

Replace this:
```typescript
await fetch(`${backendUrl}/internal/email`, {...});
await fetch(`${backendUrl}/internal/sms`, {...});
```

With this:
```typescript
await fetch(`${backendUrl}/internal/notifications`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Analytics-Engine-Key': sharedKey
  },
  body: JSON.stringify({
    tenantId, type, channels,
    recipient, title, body
  })
});
```

## Common Issues & Solutions

### Issue: "Workers not processing jobs"

**Check:**
```sql
-- Are there pending jobs?
SELECT COUNT(*) FROM notification_deliveries WHERE status = 'pending';

-- Are workers running?
SELECT * FROM notification_worker_health ORDER BY last_heartbeat DESC;

-- Reset stuck jobs manually
SELECT reset_stuck_notification_deliveries(5);
```

### Issue: "Email not being sent"

**Check:**
1. SMTP configuration in .env
2. Provider health: `curl http://localhost:3000/health/notifications`
3. Delivery attempts:
```sql
SELECT * FROM notification_delivery_attempts 
WHERE delivery_id = 'your-delivery-id'
ORDER BY attempt_number;
```

### Issue: "High memory usage"

**Solution:** Reduce batch size and worker count:
```bash
NOTIFICATION_WORKERS=1
NOTIFICATION_BATCH_SIZE=25
```

### Issue: "Queue backing up"

**Check queue depth:**
```sql
SELECT * FROM v_notification_queue_depth;
```

**Solutions:**
- Add more workers: `NOTIFICATION_WORKERS=4`
- Check provider health
- Look for failing deliveries clogging the queue

## Development Tips

### Use Mock Providers

```typescript
// No SMTP needed for development
providers.register(new MockProvider('email'));
providers.register(new MockProvider('sms'));
```

### Check Logs

```bash
# Watch notification logs
tail -f logs/app.log | grep Notification

# Filter by type
tail -f logs/app.log | grep "Notification.*enqueued"
tail -f logs/app.log | grep "Notification.*failed"
```

### Query Helpers

```sql
-- Recent notifications
SELECT * FROM notifications 
ORDER BY created_at DESC 
LIMIT 10;

-- Delivery status
SELECT 
  n.type,
  nd.channel,
  nd.status,
  nd.created_at
FROM notifications n
JOIN notification_deliveries nd ON nd.notification_id = n.id
ORDER BY nd.created_at DESC
LIMIT 20;

-- Failed deliveries
SELECT * FROM v_notification_failures LIMIT 10;

-- Queue depth
SELECT * FROM v_notification_queue_depth;
```

## Next Steps

Once basic system is working:

1. **Read full documentation:** `backend/src/notifications/README.md`
2. **Configure policies:** Setup cooldowns and routing rules
3. **Add SMS/Push:** When ready, add Twilio/FCM providers
4. **Setup monitoring:** Configure Prometheus/Grafana dashboards
5. **Load test:** Verify performance under expected load

## Production Checklist

Before going to production:

- [ ] Database migration completed
- [ ] SMTP credentials configured and tested
- [ ] Environment variables secured
- [ ] Workers configured (at least 2)
- [ ] Health checks passing
- [ ] Monitoring/alerting configured
- [ ] Logs properly configured
- [ ] Backup & recovery tested
- [ ] Load tested (if high volume)
- [ ] Old queue tables deprecated

## Getting Help

1. **Check documentation:** All files in `backend/src/notifications/`
2. **View examples:** `SETUP_EXAMPLE.ts` and `README.md`
3. **Migration guide:** `MIGRATION_GUIDE.md` for detailed steps
4. **Health endpoint:** `GET /health/notifications` for diagnostics

## Success Indicators

System is working correctly when:

✅ Health check returns all green
✅ Workers processing jobs (check metrics)
✅ Test emails arriving
✅ No errors in logs
✅ Queue depth staying low (<100)
✅ Delivery success rate >95%

---

**Congratulations! Your notification system is ready. 🎉**

For production deployment, see `MIGRATION_GUIDE.md` for complete instructions.
