/**
 * Distributed Events Health Check Routes
 * Monitor Redis pub/sub status for horizontal scaling
 */

import type { FastifyInstance } from 'fastify';
import { checkDistributedEventsHealth } from '../config/distributed-events.config';
import { getDistributedEventBus } from '../services/distributed-event-bus.service';

export default async function distributedEventsHealthRoutes(app: FastifyInstance) {
  
  /**
   * GET /health/distributed-events
   * Check if distributed event bus is operational
   */
  app.get('/health/distributed-events', async (request, reply) => {
    const health = await checkDistributedEventsHealth();
    
    const statusCode = health.status === 'healthy' ? 200 : 
                       health.status === 'degraded' ? 503 : 200;
    
    reply.code(statusCode).send(health);
  });

  /**
   * GET /health/distributed-events/stats
   * Get detailed event bus statistics
   */
  app.get('/health/distributed-events/stats', async (request, reply) => {
    const enabled = process.env.DISTRIBUTED_EVENTS === 'true';

    if (!enabled) {
      return reply.send({
        enabled: false,
        message: 'Distributed events are disabled (single-server mode)',
      });
    }

    try {
      const eventBus = getDistributedEventBus();
      const stats = eventBus.getStats();
      const healthy = await eventBus.healthCheck();

      return reply.send({
        enabled: true,
        healthy,
        ...stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return reply.code(503).send({
        enabled: true,
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /health/distributed-events/test
   * Test event publishing and receiving
   */
  app.post('/health/distributed-events/test', async (request, reply) => {
    const enabled = process.env.DISTRIBUTED_EVENTS === 'true';

    if (!enabled) {
      return reply.code(400).send({
        success: false,
        message: 'Distributed events are disabled',
      });
    }

    try {
      const eventBus = getDistributedEventBus();
      
      const testData = {
        test: true,
        timestamp: Date.now(),
        serverId: process.env.SERVER_ID || `server-${process.pid}`,
        message: 'Health check test event',
      };

      let received = false;
      let receivedData: any = null;

      // Subscribe to test channel
      const handler = (data: any) => {
        received = true;
        receivedData = data;
      };

      await eventBus.subscribe('health:test', handler);

      // Publish test event
      await eventBus.publish('health:test', testData);

      // Wait for event propagation
      await new Promise(resolve => setTimeout(resolve, 100));

      // Cleanup
      await eventBus.unsubscribe('health:test');

      if (received) {
        return reply.send({
          success: true,
          message: 'Event published and received successfully',
          publishedData: testData,
          receivedData,
          latencyMs: receivedData ? Date.now() - receivedData.timestamp : null,
        });
      } else {
        return reply.code(503).send({
          success: false,
          message: 'Event was published but not received',
          publishedData: testData,
        });
      }
    } catch (error) {
      return reply.code(500).send({
        success: false,
        message: 'Test failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}
