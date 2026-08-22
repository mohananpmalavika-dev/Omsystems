# Unified Notification System

Complete notification delivery system with durable outbox pattern, retry logic, and provider abstraction.

## Architecture

```
Producer (Analytics/Backend)
          │
          ▼
  NotificationService.enqueue()
          │
          ▼
  notification_deliveries (outbox)
          │
          ▼
  Notification Workers (SKIP LOCKED)
          │
          ├── SMTP Email Provider
          ├── In-App Provider
          ├── Webhook Provider
          ├── (Future: Twilio SMS)
          └── (Future: FCM Push)
          │
          ▼
  delivery_attempts (audit trail)
```

## Features

- ✅ **Durable Outbox Pattern**: Atomic persistence with domain events
- ✅ **SKIP LOCKED Workers**: Safe concurrent processing
- ✅ **Retry with Backoff**: Exponential backoff with jitter
- ✅ **Error Classification**: Smart retry vs. permanent failure
- ✅ **Idempotency**: Duplicate prevention via idempotency keys
- ✅ **Provider Abstraction**: Swap providers without code changes
- ✅ **Audit Trail**: Complete delivery attempt history
- ✅ **Tenant Isolation**: All queries scoped to tenant
- ✅ **Worker Recovery**: Auto-recover stuck deliveries
- ✅ **SSRF Protection**: Webhook URL validation

## Quick Start

### 1. Run Database Migration

```bash
psql -d sentinel -f backend/database/migrations/090_create_notification_system.sql
```

### 2. Initialize in Application

```typescript
import { Pool } from 'pg';
import {
  NotificationService,
  NotificationRepository,
  NotificationWorkerRunner,
  ProviderRegistry,
  SmtpEmailProvider,
  InAppProvider,
  WebhookProvider
} from './notifications';

// Create repository
const pool = new Pool({ /* your config */ });
const repository = new NotificationRepository(pool);

// Setup providers
const providers = new ProviderRegistry();

providers.register(
  new SmtpEmailProvider({
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    } : undefined,
    from: process.env.SMTP_FROM || 'noreply@sentinel.local'
  })
);

providers.register(new InAppProvider(pool));

providers.register(
  new WebhookProvider({
    userAgent: 'Sentinel-Notifications/1.0',
    signatureSecret: process.env.WEBHOOK_SECRET
  })
);

// Create service
const notificationService = new NotificationService(repository);

// Start workers
const workerRunner = new NotificationWorkerRunner(pool, providers, {
  workerCount: 2,
  batchSize: 50,
  pollIntervalMs: 1000,
  lockTimeoutMinutes: 5,
  recoveryIntervalMs: 60000
});

workerRunner.start();
```

### 3. Register API Route

```typescript
import fastify from 'fastify';
import { registerInternalNotificationsRoute } from './notifications';

const app = fastify();

await registerInternalNotificationsRoute(app, notificationService);

await app.listen({ port: 3000 });
```

## Usage Examples

### From Backend (Transactional Outbox)

```typescript
import { Pool } from 'pg';

const pool = new Pool();

// Use transaction for atomicity
await pool.query('BEGIN');

try {
  // Save domain event
  const result = await pool.query(
    'INSERT INTO predictions (...) VALUES (...) RETURNING id',
    [...]
  );
  const predictionId = result.rows[0].id;

  // Enqueue notification in same transaction
  await notificationService.enqueue(
    {
      tenantId: 'tenant_123',
      type: 'prediction_alert',
      channels: ['email', 'in_app'],
      recipient: { userId: 'user_456' },
      title: 'Critical Prediction Alert',
      body: 'HDD failure predicted in next 24 hours',
      metadata: {
        predictionId,
        severity: 'critical'
      },
      idempotencyKey: `prediction:${predictionId}`
    },
    { transaction: pool } // Pass transaction
  );

  await pool.query('COMMIT');
} catch (error) {
  await pool.query('ROLLBACK');
  throw error;
}
```

### From Analytics Engine (HTTP API)

```typescript
// analytics-engine/src/notification-engine.ts

async function sendNotification(notification: NotificationPayload) {
  const response = await fetch(
    `${backendUrl}/internal/notifications`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Analytics-Engine-Key': sharedKey
      },
      body: JSON.stringify({
        tenantId: notification.tenantId,
        type: 'intrusion_detected',
        channels: ['email', 'push', 'in_app'],
        recipient: {
          userId: notification.operatorId
        },
        title: notification.title,
        body: notification.description,
        metadata: {
          cameraId: notification.cameraId,
          detectionId: notification.alertId,
          severity: notification.severity
        },
        idempotencyKey: `detection:${notification.alertId}:user:${notification.operatorId}`
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Notification API returned ${response.status}`);
  }

  const result = await response.json();
  
  // Result: { notificationId, deliveryIds, status: 'queued' }
  return result;
}
```

### Simple Usage (No Transaction)

```typescript
await notificationService.enqueue({
  tenantId: 'tenant_123',
  type: 'camera_offline',
  channels: ['email'],
  recipient: {
    email: 'admin@example.com'
  },
  title: 'Camera Offline',
  body: 'Camera 14 has been offline for 10 minutes',
  priority: 'high'
});
```

## Configuration

### Environment Variables

```bash
# SMTP Email
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=notifications@example.com
SMTP_PASSWORD=secret
SMTP_FROM="Sentinel Alerts <noreply@sentinel.com>"

# Webhook
WEBHOOK_SECRET=your-signature-secret

# Worker
NOTIFICATION_WORKER_COUNT=2
NOTIFICATION_BATCH_SIZE=50
NOTIFICATION_POLL_INTERVAL_MS=1000
```

## Provider Implementations

### Current Providers

- **SMTP Email**: Production-ready, uses nodemailer
- **In-App**: Writes to notifications table
- **Webhook**: HTTP POST with HMAC signatures
- **Mock**: Testing/development provider

### Adding New Providers

```typescript
import { NotificationProvider, DeliveryRequest, DeliveryResult } from './notification.types';

export class TwilioSmsProvider implements NotificationProvider {
  readonly channel = 'sms' as const;
  readonly name = 'twilio';

  constructor(
    private accountSid: string,
    private authToken: string,
    private fromNumber: string
  ) {}

  async send(request: DeliveryRequest): Promise<DeliveryResult> {
    // Implement Twilio API call
    const response = await this.twilioClient.messages.create({
      to: request.destination,
      from: this.fromNumber,
      body: request.body
    });

    return {
      providerMessageId: response.sid,
      status: 'accepted'
    };
  }

  async healthCheck(): Promise<boolean> {
    // Check Twilio credentials
    return true;
  }
}

// Register provider
providers.register(new TwilioSmsProvider(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
  process.env.TWILIO_FROM_NUMBER!
));
```

## Monitoring

### Worker Metrics

```typescript
const metrics = workerRunner.getMetrics();

// metrics = [
//   {
//     workerId: 'worker-1',
//     metrics: {
//       jobsProcessed: 1234,
//       jobsSucceeded: 1180,
//       jobsFailed: 54,
//       averageProcessingTimeMs: 234,
//       lastProcessedAt: Date
//     }
//   }
// ]
```

### Provider Health

```typescript
const health = await providers.healthCheck();

// health = Map {
//   'email' => true,
//   'in_app' => true,
//   'webhook' => true,
//   'sms' => false
// }
```

### Database Views

```sql
-- Queue depth by channel
SELECT * FROM v_notification_queue_depth;

-- Delivery stats (last 24h)
SELECT * FROM v_notification_delivery_stats_24h;

-- Failed deliveries
SELECT * FROM v_notification_failures;
```

## Migration from Old System

### Phase 1: Deploy New System

1. Run database migration
2. Deploy notification service and workers
3. Register providers
4. Do NOT remove old code yet

### Phase 2: Migrate Backend

Replace this:

```typescript
await db.query('INSERT INTO email_queue ...');
await db.query('INSERT INTO sms_queue ...');
```

With this:

```typescript
await notificationService.enqueue({
  tenantId,
  type: 'prediction_alert',
  channels: ['email', 'sms'],
  recipient: { userId },
  ...
});
```

### Phase 3: Migrate Analytics Engine

Replace this:

```typescript
await fetch(`${backendUrl}/internal/email`, { ... });
await fetch(`${backendUrl}/internal/sms`, { ... });
```

With this:

```typescript
await fetch(`${backendUrl}/internal/notifications`, {
  method: 'POST',
  body: JSON.stringify({ ... })
});
```

### Phase 4: Cleanup

1. Verify old queues are empty
2. Remove old `email_queue`, `sms_queue` tables
3. Remove old `/internal/email`, `/internal/sms` routes (if they existed)

## Troubleshooting

### Deliveries Stuck in Processing

```sql
-- Manual recovery
SELECT reset_stuck_notification_deliveries(5);
```

### Check Delivery History

```sql
SELECT *
FROM notification_delivery_attempts
WHERE delivery_id = '<delivery-id>'
ORDER BY attempt_number;
```

### Retry Failed Delivery

```sql
UPDATE notification_deliveries
SET 
  status = 'pending',
  next_attempt_at = NOW(),
  attempt_count = 0
WHERE id = '<delivery-id>';
```

## Security Considerations

1. **Tenant Isolation**: All queries include tenant_id
2. **SSRF Protection**: Webhooks block private IPs
3. **Signature Verification**: Webhooks include HMAC signatures
4. **Secret Management**: Passwords stored in env, not database
5. **Rate Limiting**: Consider adding per-tenant limits

## Performance

- **SKIP LOCKED**: Multiple workers without conflicts
- **Batch Processing**: 50 jobs per worker poll
- **Connection Pooling**: Shared pg pool
- **Concurrent Delivery**: Promise.all for parallel execution
- **Index Optimization**: Proper indexes on pending/retry queries

## Future Enhancements

- [ ] Twilio SMS provider
- [ ] Firebase Cloud Messaging (FCM) provider
- [ ] Notification templates with variable substitution
- [ ] Recipient resolver (userId → email/phone lookup)
- [ ] Policy engine (event type → channels/recipients)
- [ ] Cooldown/suppression logic
- [ ] Alert escalation
- [ ] Delivery receipts (Twilio webhooks, FCM callbacks)
- [ ] Admin UI for failed deliveries
- [ ] Prometheus metrics export

## License

Part of Sentinel Video Analytics System
