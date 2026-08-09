/**
 * Distributed Events Configuration
 * Initialize Redis-based event bus for horizontal scaling
 */

import { initializeDistributedEventBus, getDistributedEventBus } from '../services/distributed-event-bus.service';

export async function initializeDistributedEvents(): Promise<void> {
  const enabled = process.env.DISTRIBUTED_EVENTS === 'true';
  
  if (!enabled) {
    console.log('[DistributedEvents] Running in single-server mode (DISTRIBUTED_EVENTS=false)');
    return;
  }

  console.log('[DistributedEvents] Initializing distributed event bus...');

  try {
    const eventBus = initializeDistributedEventBus();
    await eventBus.connect();

    // Health check
    const healthy = await eventBus.healthCheck();
    if (!healthy) {
      throw new Error('Event bus health check failed');
    }

    console.log('[DistributedEvents] ✓ Distributed event bus ready');
    console.log('[DistributedEvents] Stats:', eventBus.getStats());

    // Setup graceful shutdown
    setupGracefulShutdown(eventBus);
  } catch (error) {
    console.error('[DistributedEvents] Failed to initialize:', error);
    console.warn('[DistributedEvents] Falling back to single-server mode');
    process.env.DISTRIBUTED_EVENTS = 'false';
  }
}

function setupGracefulShutdown(eventBus: any) {
  const shutdown = async (signal: string) => {
    console.log(`[DistributedEvents] Received ${signal}, shutting down...`);
    try {
      await eventBus.disconnect();
      console.log('[DistributedEvents] ✓ Disconnected cleanly');
    } catch (error) {
      console.error('[DistributedEvents] Error during shutdown:', error);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Middleware to check distributed events health
 */
export async function checkDistributedEventsHealth(): Promise<{
  status: 'healthy' | 'degraded' | 'disabled';
  message: string;
  stats?: any;
}> {
  const enabled = process.env.DISTRIBUTED_EVENTS === 'true';

  if (!enabled) {
    return {
      status: 'disabled',
      message: 'Distributed events are disabled (single-server mode)',
    };
  }

  try {
    const eventBus = getDistributedEventBus();
    const healthy = await eventBus.healthCheck();

    if (healthy) {
      return {
        status: 'healthy',
        message: 'Distributed event bus is operational',
        stats: eventBus.getStats(),
      };
    } else {
      return {
        status: 'degraded',
        message: 'Distributed event bus health check failed',
        stats: eventBus.getStats(),
      };
    }
  } catch (error) {
    return {
      status: 'degraded',
      message: `Distributed event bus error: ${error}`,
    };
  }
}
