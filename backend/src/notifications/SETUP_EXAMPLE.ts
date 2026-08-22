/**
 * Complete Notification System Setup Example
 * 
 * This file demonstrates how to initialize and configure
 * the unified notification system in your application.
 */

import { Pool } from 'pg';
import fastify, { FastifyInstance } from 'fastify';
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
} from './index.js';

// =====================================================
// Step 1: Initialize Database Connection
// =====================================================

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'sentinel',
  user: process.env.DB_USER || 'sentinel_user',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// Test connection
pool.on('error', (err) => {
  console.error('Unexpected database error', err);
  process.exit(-1);
});

// =====================================================
// Step 2: Setup Provider Registry
// =====================================================

const providers = new ProviderRegistry();

// Production Mode: Use real providers
if (process.env.NODE_ENV === 'production') {
  // SMTP Email Provider
  if (process.env.SMTP_HOST) {
    providers.register(
      new SmtpEmailProvider({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD!
        } : undefined,
        from: process.env.SMTP_FROM || 'noreply@sentinel.local'
      })
    );
    console.log('✓ SMTP email provider registered');
  } else {
    console.warn('⚠ SMTP not configured, email notifications disabled');
  }

  // In-App Provider (always enabled)
  providers.register(new InAppProvider(pool));
  console.log('✓ In-app provider registered');

  // Webhook Provider
  if (process.env.WEBHOOK_SECRET) {
    providers.register(
      new WebhookProvider({
        userAgent: 'Sentinel-Notifications/1.0',
        signatureSecret: process.env.WEBHOOK_SECRET
      })
    );
    console.log('✓ Webhook provider registered');
  } else {
    console.warn('⚠ Webhook secret not configured');
  }

  // TODO: Add SMS provider when configured
  // if (process.env.TWILIO_ACCOUNT_SID) {
  //   providers.register(
  //     new TwilioSmsProvider({
  //       accountSid: process.env.TWILIO_ACCOUNT_SID,
  //       authToken: process.env.TWILIO_AUTH_TOKEN!,
  //       fromNumber: process.env.TWILIO_FROM_NUMBER!
  //     })
  //   );
  //   console.log('✓ Twilio SMS provider registered');
  // }

  // TODO: Add push provider when configured
  // if (process.env.FCM_CREDENTIALS) {
  //   providers.register(
  //     new FcmPushProvider({
  //       credentials: JSON.parse(process.env.FCM_CREDENTIALS)
  //     })
  //   );
  //   console.log('✓ FCM push provider registered');
  // }
} else {
  // Development/Test Mode: Use mock providers
  console.log('🧪 Running in development mode, using mock providers');
  
  providers.register(new MockProvider('email', 'mock-email'));
  providers.register(new MockProvider('sms', 'mock-sms'));
  providers.register(new MockProvider('push', 'mock-push'));
  providers.register(new InAppProvider(pool)); // Real in-app even in dev
  providers.register(
    new WebhookProvider({
      userAgent: 'Sentinel-Notifications-Dev/1.0'
    })
  );
}

// =====================================================
// Step 3: Create Notification Service
// =====================================================

const repository = new NotificationRepository(pool);
const notificationService = new NotificationService(repository);

console.log('✓ Notification service initialized');

// =====================================================
// Step 4: Start Notification Workers
// =====================================================

const workerRunner = new NotificationWorkerRunner(pool, providers, {
  workerCount: parseInt(process.env.NOTIFICATION_WORKERS || '2'),
  batchSize: parseInt(process.env.NOTIFICATION_BATCH_SIZE || '50'),
  pollIntervalMs: parseInt(process.env.NOTIFICATION_POLL_MS || '1000'),
  lockTimeoutMinutes: 5,
  recoveryIntervalMs: 60000 // 1 minute
});

workerRunner.start();

console.log('✓ Notification workers started');

// =====================================================
// Step 5: Setup Fastify Application
// =====================================================

async function setupServer(): Promise<FastifyInstance> {
  const app = fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info'
    }
  });

  // Register notification routes
  await registerInternalNotificationsRoute(app, notificationService);

  // Health check endpoint
  app.get('/health', async () => {
    const providerHealth = await providers.healthCheck();
    const workerMetrics = workerRunner.getMetrics();

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      providers: Object.fromEntries(providerHealth),
      workers: workerMetrics
    };
  });

  // Provider health check endpoint
  app.get('/health/notifications', async () => {
    const health = await providers.healthCheck();
    
    return {
      providers: Object.fromEntries(health),
      channels: providers.getChannels()
    };
  });

  // Worker metrics endpoint
  app.get('/metrics/notifications', async () => {
    return workerRunner.getMetrics();
  });

  return app;
}

// =====================================================
// Step 6: Application Lifecycle
// =====================================================

async function start() {
  try {
    const app = await setupServer();

    const port = parseInt(process.env.PORT || '3000');
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });

    console.log(`
╔═══════════════════════════════════════════════════╗
║  Sentinel Notification System                     ║
║  Server running on http://${host}:${port}        ║
║  Providers: ${providers.getChannels().join(', ')}              ║
║  Workers: ${workerRunner.getMetrics().length}                                 ║
╚═══════════════════════════════════════════════════╝
    `);
  } catch (error) {
    console.error('Failed to start server', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  workerRunner.stop();
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  workerRunner.stop();
  await pool.end();
  process.exit(0);
});

// Start the application
if (require.main === module) {
  start();
}

// =====================================================
// Export for use in other modules
// =====================================================

export {
  notificationService,
  repository,
  workerRunner,
  providers,
  pool
};

// =====================================================
// Usage Examples
// =====================================================

/**
 * Example 1: Simple notification
 */
export async function example1_SimpleNotification() {
  await notificationService.enqueue({
    tenantId: 'tenant_123',
    type: 'test_notification',
    channels: ['email'],
    recipient: {
      email: 'test@example.com'
    },
    title: 'Test Notification',
    body: 'This is a test notification'
  });
}

/**
 * Example 2: Multi-channel notification with idempotency
 */
export async function example2_MultiChannel() {
  await notificationService.enqueue({
    tenantId: 'tenant_123',
    type: 'intrusion_detected',
    channels: ['email', 'push', 'in_app'],
    recipient: {
      userId: 'operator_456'
    },
    subject: 'Security Alert',
    title: 'Intrusion Detected',
    body: 'Unauthorized entry detected at Main Entrance',
    priority: 'critical',
    metadata: {
      cameraId: 'cam_14',
      detectionId: 'det_789',
      severity: 'P1'
    },
    idempotencyKey: 'detection:det_789:user:operator_456'
  });
}

/**
 * Example 3: Transactional outbox pattern
 */
export async function example3_TransactionalOutbox() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Save domain event
    const result = await client.query(
      `INSERT INTO predictions (
        tenant_id, device_id, prediction_type, probability
      ) VALUES ($1, $2, $3, $4) RETURNING id`,
      ['tenant_123', 'device_456', 'hdd_failure', 0.95]
    );

    const predictionId = result.rows[0].id;

    // Enqueue notification in same transaction
    await notificationService.enqueue(
      {
        tenantId: 'tenant_123',
        type: 'prediction_alert',
        channels: ['email', 'sms'],
        recipient: {
          userId: 'admin_789'
        },
        title: 'Critical Prediction',
        body: 'HDD failure predicted with 95% probability',
        priority: 'critical',
        metadata: {
          predictionId,
          probability: 0.95
        },
        idempotencyKey: `prediction:${predictionId}`
      },
      { transaction: client }
    );

    await client.query('COMMIT');

    console.log('Prediction and notification saved atomically');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transaction failed, rolled back', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Example 4: Check notification status
 */
export async function example4_CheckStatus(notificationId: string) {
  const notification = await notificationService.getNotification(
    notificationId,
    'tenant_123'
  );

  const deliveries = await notificationService.getDeliveries(
    notificationId,
    'tenant_123'
  );

  console.log('Notification:', notification);
  console.log('Deliveries:', deliveries);

  for (const delivery of deliveries) {
    console.log(`${delivery.channel}: ${delivery.status}`);
  }
}

/**
 * Example 5: Cancel pending delivery
 */
export async function example5_CancelDelivery(deliveryId: string) {
  const cancelled = await notificationService.cancelDelivery(
    deliveryId,
    'tenant_123'
  );

  console.log('Cancelled:', cancelled);
}
