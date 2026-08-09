/**
 * Distributed Events Integration Test
 * 
 * Tests Redis pub/sub for horizontal scaling
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeDistributedEventBus, getDistributedEventBus } from '../src/services/distributed-event-bus.service';

describe('Distributed Event Bus', () => {
  let eventBus: any;

  beforeAll(async () => {
    // Only run tests if Redis is configured
    if (process.env.DISTRIBUTED_EVENTS !== 'true') {
      console.log('⏭️  Skipping distributed events tests (DISTRIBUTED_EVENTS=false)');
      return;
    }

    // Initialize event bus
    eventBus = initializeDistributedEventBus({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '1', 10), // Use DB 1 for tests
      },
      namespace: 'oms-test',
    });

    await eventBus.connect();
  });

  afterAll(async () => {
    if (eventBus) {
      await eventBus.disconnect();
    }
  });

  it('should connect to Redis successfully', async () => {
    if (process.env.DISTRIBUTED_EVENTS !== 'true') {
      return;
    }

    const healthy = await eventBus.healthCheck();
    expect(healthy).toBe(true);
  });

  it('should publish and receive events', async () => {
    if (process.env.DISTRIBUTED_EVENTS !== 'true') {
      return;
    }

    const testData = { message: 'Hello from distributed test', timestamp: Date.now() };
    let received = false;

    // Subscribe to test channel
    await eventBus.subscribe('test:channel', (data: any) => {
      expect(data).toEqual(testData);
      received = true;
    });

    // Publish event
    await eventBus.publish('test:channel', testData);

    // Wait for event propagation (Redis pub/sub is fast but not instant)
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(received).toBe(true);
  });

  it('should handle pattern subscriptions', async () => {
    if (process.env.DISTRIBUTED_EVENTS !== 'true') {
      return;
    }

    const testData = { alert: 'Fire detected', severity: 'critical' };
    let receivedChannel: string | null = null;
    let receivedData: any = null;

    // Subscribe to pattern
    await eventBus.subscribePattern('alert:*', (channel: string, data: any) => {
      receivedChannel = channel;
      receivedData = data;
    });

    // Publish to specific alert channel
    await eventBus.publish('alert:fire', testData);

    // Wait for propagation
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(receivedChannel).toBe('alert:fire');
    expect(receivedData).toEqual(testData);
  });

  it('should provide stats', () => {
    if (process.env.DISTRIBUTED_EVENTS !== 'true') {
      return;
    }

    const stats = eventBus.getStats();
    
    expect(stats).toHaveProperty('serverId');
    expect(stats).toHaveProperty('subscribedChannels');
    expect(stats).toHaveProperty('publisherStatus');
    expect(stats).toHaveProperty('subscriberStatus');
    expect(stats.publisherStatus).toBe('ready');
    expect(stats.subscriberStatus).toBe('ready');
  });

  it('should handle multiple subscribers to same channel', async () => {
    if (process.env.DISTRIBUTED_EVENTS !== 'true') {
      return;
    }

    const testData = { event: 'multi-subscriber-test' };
    const received: number[] = [];

    // Multiple subscribers
    await eventBus.subscribe('multi:test', (data: any) => {
      received.push(1);
    });

    await eventBus.subscribe('multi:test', (data: any) => {
      received.push(2);
    });

    // Publish once
    await eventBus.publish('multi:test', testData);

    // Wait for propagation
    await new Promise(resolve => setTimeout(resolve, 100));

    // Both subscribers should receive
    expect(received).toContain(1);
    expect(received).toContain(2);
  });

  it('should unsubscribe correctly', async () => {
    if (process.env.DISTRIBUTED_EVENTS !== 'true') {
      return;
    }

    const testData = { event: 'unsubscribe-test' };
    let received = false;

    // Subscribe
    await eventBus.subscribe('unsub:test', (data: any) => {
      received = true;
    });

    // Unsubscribe
    await eventBus.unsubscribe('unsub:test');

    // Publish after unsubscribe
    await eventBus.publish('unsub:test', testData);

    // Wait
    await new Promise(resolve => setTimeout(resolve, 100));

    // Should NOT receive
    expect(received).toBe(false);
  });
});

describe('Distributed Event Bus - Multi-Instance Simulation', () => {
  it('should simulate event flow across multiple servers', async () => {
    if (process.env.DISTRIBUTED_EVENTS !== 'true') {
      console.log('⏭️  Skipping multi-instance test (DISTRIBUTED_EVENTS=false)');
      return;
    }

    // Simulate Server A
    const serverA = initializeDistributedEventBus({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
        db: 1,
      },
      namespace: 'oms-test-multi',
    });

    // Simulate Server B
    const serverB = initializeDistributedEventBus({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
        db: 1,
      },
      namespace: 'oms-test-multi',
    });

    try {
      await serverA.connect();
      await serverB.connect();

      const alertData = {
        type: 'camera_offline',
        cameraId: 'cam-123',
        message: 'Camera went offline',
      };

      let serverBReceived = false;

      // Server B subscribes to alerts
      await serverB.subscribe('alert:triggered', (data: any) => {
        expect(data).toEqual(alertData);
        serverBReceived = true;
      });

      // Server A publishes alert
      await serverA.publish('alert:triggered', alertData);

      // Wait for cross-server propagation
      await new Promise(resolve => setTimeout(resolve, 200));

      // Server B should receive event from Server A
      expect(serverBReceived).toBe(true);

    } finally {
      await serverA.disconnect();
      await serverB.disconnect();
    }
  });
});
