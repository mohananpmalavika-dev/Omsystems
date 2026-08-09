/**
 * Event Bus Implementation
 * Provides pub/sub messaging backbone for distributed services
 */

import { randomUUID } from 'crypto';
import { createClient, RedisClientType } from 'redis';
import type {
  BaseEvent,
  EventType,
  EventHandler,
  SubscriptionOptions,
  PublishOptions,
} from './event-types.js';

export interface EventBusConfig {
  redisUrl?: string;
  serviceName: string;
  enablePersistence?: boolean;
  defaultRetries?: number;
  enableDeadLetterQueue?: boolean;
}

interface Subscription {
  eventType: EventType | string;
  handler: EventHandler;
  options: SubscriptionOptions;
}

/**
 * Event Bus - Redis-backed pub/sub with persistence
 */
export class EventBus {
  private client: RedisClientType | null = null;
  private subscriber: RedisClientType | null = null;
  private subscriptions: Map<string, Subscription[]> = new Map();
  private config: EventBusConfig;
  private isConnected = false;

  constructor(config: EventBusConfig) {
    this.config = {
      enablePersistence: true,
      defaultRetries: 3,
      enableDeadLetterQueue: true,
      ...config,
    };
  }

  /**
   * Initialize and connect to Redis
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    if (!this.config.redisUrl) {
      console.warn('[EventBus] No Redis URL provided, using in-memory event bus');
      this.isConnected = true;
      return;
    }

    try {
      // Create main client for publishing and storage
      this.client = createClient({ url: this.config.redisUrl });
      this.client.on('error', (err) => console.error('[EventBus] Redis client error:', err));
      await this.client.connect();

      // Create separate subscriber client (Redis requirement)
      this.subscriber = createClient({ url: this.config.redisUrl });
      this.subscriber.on('error', (err) => console.error('[EventBus] Redis subscriber error:', err));
      await this.subscriber.connect();

      this.isConnected = true;
      console.log(`[EventBus] Connected for service: ${this.config.serviceName}`);

      // Restore subscriptions after reconnection
      await this.restoreSubscriptions();
    } catch (error) {
      console.error('[EventBus] Failed to connect to Redis:', error);
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
    this.isConnected = false;
    console.log('[EventBus] Disconnected');
  }

  /**
   * Publish an event
   */
  async publish(
    eventType: EventType | string,
    payload: BaseEvent['payload'],
    context: {
      tenantId: string;
      branchId?: string;
      deviceId?: string;
      userId?: string;
      correlationId?: string;
      causationId?: string;
    },
    options?: PublishOptions
  ): Promise<string> {
    const event: BaseEvent = {
      eventId: randomUUID(),
      eventType: eventType as string,
      schemaVersion: 1,
      tenantId: context.tenantId,
      branchId: context.branchId,
      deviceId: context.deviceId,
      timestamp: new Date().toISOString(),
      source: this.config.serviceName,
      correlationId: options?.correlationId || context.correlationId || randomUUID(),
      causationId: options?.causationId || context.causationId,
      userId: context.userId,
      payload,
    };

    console.log(`[EventBus] Publishing event: ${eventType}`, {
      eventId: event.eventId,
      correlationId: event.correlationId,
    });

    // Persist event if enabled
    if (this.config.enablePersistence && this.client) {
      await this.persistEvent(event);
    }

    // Publish to Redis channel
    if (this.client) {
      const channel = this.getChannel(eventType);
      await this.client.publish(channel, JSON.stringify(event));

      // Also publish to wildcard channels for pattern matching
      const parts = eventType.split('.');
      for (let i = 1; i < parts.length; i++) {
        const wildcardChannel = parts.slice(0, i).join('.') + '.*';
        await this.client.publish(wildcardChannel, JSON.stringify(event));
      }
    } else {
      // In-memory fallback
      await this.handleInMemoryPublish(event);
    }

    return event.eventId;
  }

  /**
   * Subscribe to event types
   */
  async subscribe(
    eventType: EventType | string,
    handler: EventHandler,
    options: SubscriptionOptions = {}
  ): Promise<void> {
    const subscription: Subscription = {
      eventType,
      handler,
      options,
    };

    // Store subscription
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, []);
    }
    this.subscriptions.get(eventType)!.push(subscription);

    // Subscribe to Redis channel if connected
    if (this.subscriber) {
      const channel = this.getChannel(eventType);
      await this.subscriber.subscribe(channel, async (message) => {
        await this.handleMessage(message, subscription);
      });

      console.log(`[EventBus] Subscribed to: ${eventType}`);
    }
  }

  /**
   * Subscribe to pattern (e.g., "sentinel.camera.*")
   */
  async subscribePattern(
    pattern: string,
    handler: EventHandler,
    options: SubscriptionOptions = {}
  ): Promise<void> {
    const subscription: Subscription = {
      eventType: pattern,
      handler,
      options,
    };

    // Store subscription
    if (!this.subscriptions.has(pattern)) {
      this.subscriptions.set(pattern, []);
    }
    this.subscriptions.get(pattern)!.push(subscription);

    // Subscribe to Redis pattern if connected
    if (this.subscriber) {
      const channel = this.getChannel(pattern);
      await this.subscriber.pSubscribe(channel, async (message) => {
        await this.handleMessage(message, subscription);
      });

      console.log(`[EventBus] Subscribed to pattern: ${pattern}`);
    }
  }

  /**
   * Unsubscribe from event type
   */
  async unsubscribe(eventType: EventType | string): Promise<void> {
    this.subscriptions.delete(eventType);

    if (this.subscriber) {
      const channel = this.getChannel(eventType as string);
      await this.subscriber.unsubscribe(channel);
      console.log(`[EventBus] Unsubscribed from: ${eventType}`);
    }
  }

  /**
   * Get event history for a tenant/device
   */
  async getEventHistory(
    filters: {
      tenantId: string;
      eventTypes?: EventType[];
      branchId?: string;
      deviceId?: string;
      startTime?: Date;
      endTime?: Date;
      limit?: number;
    }
  ): Promise<BaseEvent[]> {
    if (!this.client) {
      return [];
    }

    const key = this.getEventHistoryKey(filters.tenantId);
    const events = await this.client.lRange(key, 0, filters.limit || 100);

    return events
      .map((e) => JSON.parse(e) as BaseEvent)
      .filter((event) => {
        if (filters.eventTypes && !filters.eventTypes.includes(event.eventType as EventType)) {
          return false;
        }
        if (filters.branchId && event.branchId !== filters.branchId) {
          return false;
        }
        if (filters.deviceId && event.deviceId !== filters.deviceId) {
          return false;
        }
        if (filters.startTime && new Date(event.timestamp) < filters.startTime) {
          return false;
        }
        if (filters.endTime && new Date(event.timestamp) > filters.endTime) {
          return false;
        }
        return true;
      });
  }

  /**
   * Get event by ID
   */
  async getEvent(eventId: string, tenantId: string): Promise<BaseEvent | null> {
    if (!this.client) {
      return null;
    }

    const key = this.getEventKey(tenantId, eventId);
    const data = await this.client.get(key);
    return data && typeof data === 'string' ? JSON.parse(data) : null;
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(message: string, subscription: Subscription): Promise<void> {
    try {
      const event = JSON.parse(message) as BaseEvent;

      // Apply filters
      if (subscription.options.tenantId && event.tenantId !== subscription.options.tenantId) {
        return;
      }
      if (subscription.options.branchId && event.branchId !== subscription.options.branchId) {
        return;
      }
      if (subscription.options.deviceId && event.deviceId !== subscription.options.deviceId) {
        return;
      }

      console.log(`[EventBus] Processing event: ${event.eventType}`, {
        eventId: event.eventId,
        handler: subscription.handler.name || 'anonymous',
      });

      // Execute handler with retry logic
      await this.executeHandler(event, subscription);
    } catch (error) {
      console.error('[EventBus] Error handling message:', error);
    }
  }

  /**
   * Execute handler with retry logic
   */
  private async executeHandler(event: BaseEvent, subscription: Subscription): Promise<void> {
    const maxRetries = subscription.options.maxRetries || this.config.defaultRetries || 3;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        await subscription.handler(event as any);
        return; // Success
      } catch (error) {
        attempt++;
        console.error(
          `[EventBus] Handler failed (attempt ${attempt}/${maxRetries + 1}):`,
          error
        );

        if (attempt > maxRetries) {
          // Move to dead letter queue if enabled
          if (subscription.options.deadLetterQueue !== false && this.config.enableDeadLetterQueue) {
            await this.moveToDeadLetterQueue(event, subscription, error as Error);
          }
          throw error;
        }

        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 100));
      }
    }
  }

  /**
   * Persist event to Redis
   */
  private async persistEvent(event: BaseEvent): Promise<void> {
    if (!this.client) {
      return;
    }

    // Store in tenant-specific event history
    const historyKey = this.getEventHistoryKey(event.tenantId);
    await this.client.lPush(historyKey, JSON.stringify(event));
    await this.client.lTrim(historyKey, 0, 9999); // Keep last 10k events
    await this.client.expire(historyKey, 86400 * 7); // 7 days

    // Store individual event with TTL
    const eventKey = this.getEventKey(event.tenantId, event.eventId);
    await this.client.setEx(eventKey, 86400 * 7, JSON.stringify(event)); // 7 days
  }

  /**
   * Move failed event to dead letter queue
   */
  private async moveToDeadLetterQueue(
    event: BaseEvent,
    subscription: Subscription,
    error: Error
  ): Promise<void> {
    if (!this.client) {
      return;
    }

    const dlqKey = `sentinel:dlq:${event.tenantId}`;
    const dlqEntry = {
      event,
      subscription: {
        eventType: subscription.eventType,
        options: subscription.options,
      },
      error: {
        message: error.message,
        stack: error.stack,
      },
      failedAt: new Date().toISOString(),
    };

    await this.client.lPush(dlqKey, JSON.stringify(dlqEntry));
    await this.client.lTrim(dlqKey, 0, 999); // Keep last 1000 failed events
    await this.client.expire(dlqKey, 86400 * 30); // 30 days

    console.error(`[EventBus] Event moved to DLQ: ${event.eventId}`);
  }

  /**
   * In-memory publish fallback
   */
  private async handleInMemoryPublish(event: BaseEvent): Promise<void> {
    // Find matching subscriptions
    for (const [pattern, subs] of this.subscriptions.entries()) {
      if (this.matchesPattern(event.eventType, pattern)) {
        for (const sub of subs) {
          await this.handleMessage(JSON.stringify(event), sub);
        }
      }
    }
  }

  /**
   * Check if event type matches pattern
   */
  private matchesPattern(eventType: string, pattern: string): boolean {
    if (eventType === pattern) {
      return true;
    }
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(eventType);
  }

  /**
   * Restore subscriptions after reconnection
   */
  private async restoreSubscriptions(): Promise<void> {
    for (const [eventType, subs] of this.subscriptions.entries()) {
      if (eventType.includes('*')) {
        for (const sub of subs) {
          await this.subscribePattern(eventType, sub.handler, sub.options);
        }
      } else {
        for (const sub of subs) {
          await this.subscribe(eventType as EventType, sub.handler, sub.options);
        }
      }
    }
  }

  /**
   * Helper methods for Redis keys
   */
  private getChannel(eventType: string): string {
    return `sentinel:events:${eventType}`;
  }

  private getEventHistoryKey(tenantId: string): string {
    return `sentinel:events:history:${tenantId}`;
  }

  private getEventKey(tenantId: string, eventId: string): string {
    return `sentinel:events:${tenantId}:${eventId}`;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ connected: boolean; subscriptions: number }> {
    const connected = this.isConnected && (!this.client || (await this.client.ping()) === 'PONG');
    return {
      connected,
      subscriptions: Array.from(this.subscriptions.values()).reduce((sum, subs) => sum + subs.length, 0),
    };
  }
}

/**
 * Singleton instance
 */
let eventBusInstance: EventBus | null = null;

export function getEventBus(config?: EventBusConfig): EventBus {
  if (!eventBusInstance) {
    const effectiveConfig: EventBusConfig = config ?? {
      serviceName: "sentinel-in-memory",
      enablePersistence: false,
    };
    eventBusInstance = new EventBus(effectiveConfig);
  }
  return eventBusInstance;
}

export function resetEventBus(): void {
  eventBusInstance = null;
}
