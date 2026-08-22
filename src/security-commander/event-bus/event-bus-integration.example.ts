/**
 * Event Bus Integration Example
 * Shows how to set up real-time event ingestion
 */

import { EventBusService } from './event-bus.service';
import { EventIngestionService } from '../services/event-ingestion.service';
import { NormalizerRegistry } from '../normalizers/normalizer.registry';
import { EventRepository } from '../repositories/event.repository';
import { IncidentRepository } from '../repositories/incident.repository';
import { AnomalyDetectionEngine } from '../anomaly/anomaly-detection.engine';
import { CorrelationEngine } from '../correlation/correlation.engine';
import { Pool } from 'pg';

/**
 * Example: Set up event bus with Security Commander
 */
async function setupEventBus() {
  // 1. Initialize database pool
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'security_commander',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  // 2. Initialize repositories
  const eventRepository = new EventRepository(pool);
  const incidentRepository = new IncidentRepository(pool);

  // 3. Initialize engines
  const anomalyEngine = new AnomalyDetectionEngine(eventRepository);
  const correlationEngine = new CorrelationEngine(
    eventRepository,
    incidentRepository
  );

  // 4. Initialize normalizer registry
  const normalizerRegistry = new NormalizerRegistry();

  // 5. Initialize event ingestion service
  const eventIngestionService = new EventIngestionService(
    eventRepository,
    anomalyEngine,
    correlationEngine,
    normalizerRegistry
  );

  // 6. Initialize and start event bus
  const eventBus = new EventBusService({
    natsServers: [process.env.NATS_URL || 'nats://localhost:4222'],
    eventIngestionService,
    normalizerRegistry,
  });

  await eventBus.start();
  console.log('Event bus started successfully');

  // 7. Set up graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down event bus...');
    await eventBus.stop();
    await pool.end();
    process.exit(0);
  });

  return eventBus;
}

/**
 * Example: Publish test event to NATS
 */
async function publishTestEvent() {
  const { NatsClient } = await import('./nats-client');
  
  const client = new NatsClient(['nats://localhost:4222']);
  await client.connect();

  // Publish camera offline event
  await client.publish('security.camera.offline', {
    cameraId: 'camera_lobby_main',
    eventType: 'camera_offline',
    timestamp: new Date(),
    severity: 75,
    description: 'Camera went offline',
    metadata: {
      location: 'Main Lobby',
      zone: 'entrance',
    },
  });

  console.log('Test event published');
  await client.disconnect();
}

/**
 * Example: Subscribe to investigation events
 */
async function subscribeToInvestigations() {
  const { NatsClient } = await import('./nats-client');
  
  const client = new NatsClient(['nats://localhost:4222']);
  await client.connect();

  await client.subscribe(
    { subject: 'commander.investigation.created' },
    async (message) => {
      console.log('Investigation created:', message.data);
      // Could trigger notifications, webhooks, etc.
    }
  );

  console.log('Subscribed to investigation events');
}

/**
 * Example: Full application setup
 */
async function main() {
  try {
    // Start event bus
    const eventBus = await setupEventBus();

    // Subscribe to investigation events for notifications
    await subscribeToInvestigations();

    // Simulate publishing test events
    setTimeout(async () => {
      await publishTestEvent();
    }, 5000);

    console.log('Security Commander event bus running...');
    console.log('Statistics:', eventBus.getStats());

    // Keep process alive
    setInterval(() => {
      console.log('Event bus stats:', eventBus.getStats());
    }, 60000); // Log stats every minute

  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

// Export for use in other modules
export {
  setupEventBus,
  publishTestEvent,
  subscribeToInvestigations,
};

// Run if executed directly
if (require.main === module) {
  main();
}
