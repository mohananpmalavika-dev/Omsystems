/**
 * Unified Event Bus
 * Provides a single abstraction layer for both in-memory and distributed (Redis) event buses
 * Enables seamless switching via environment variable
 */

import { EventEmitter } from 'events';

/**
 * DistributedEventBus interface to avoid importing from backend during build
 */
interface DistributedEventBus {
  publish(channel: string, data: any): Promise<void>;
  subscribe(channel: string, handler: (data: any) => void): Promise<void>;
  subscribePattern(pattern: string, handler: (channel: string, data: any) => void): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
  healthCheck(): Promise<boolean>;
  disconnect(): Promise<void>;
}

export interface IEventBus {
  publish(event: string, data: any): Promise<void>;
  subscribe(event: string, handler: (data: any) => void): Promise<() => void>;
  subscribePattern(pattern: string, handler: (channel: string, data: any) => void): Promise<void>;
  unsubscribe(event: string): Promise<void>;
  healthCheck(): Promise<boolean>;
  disconnect(): Promise<void>;
}

/**
 * In-Memory Event Bus (single instance only)
 */
export class InMemoryEventBus extends EventEmitter implements IEventBus {
  async publish(event: string, data: any): Promise<void> {
    this.emit(event, data);
  }

  async subscribe(event: string, handler: (data: any) => void): Promise<() => void> {
    this.on(event, handler);
    return () => {
      this.off(event, handler);
    };
  }

  async subscribePattern(pattern: string, handler: (channel: string, data: any) => void): Promise<void> {
    // In-memory doesn't support true patterns, so we subscribe to exact matches
    // This is a limitation of the in-memory implementation
    this.on(pattern, (data) => handler(pattern, data));
  }

  async unsubscribe(event: string): Promise<void> {
    this.removeAllListeners(event);
  }

  async healthCheck(): Promise<boolean> {
    return true; // In-memory is always healthy
  }

  async disconnect(): Promise<void> {
    this.removeAllListeners();
  }
}

/**
 * Redis Distributed Event Bus Wrapper
 */
export class RedisEventBusWrapper implements IEventBus {
  constructor(private distributedBus: DistributedEventBus) {}

  async publish(event: string, data: any): Promise<void> {
    await this.distributedBus.publish(event, data);
  }

  async subscribe(event: string, handler: (data: any) => void): Promise<() => void> {
    await this.distributedBus.subscribe(event, handler);
    return async () => {
      await this.distributedBus.unsubscribe(event);
    };
  }

  async subscribePattern(pattern: string, handler: (channel: string, data: any) => void): Promise<void> {
    await this.distributedBus.subscribePattern(pattern, handler);
  }

  async unsubscribe(event: string): Promise<void> {
    await this.distributedBus.unsubscribe(event);
  }

  async healthCheck(): Promise<boolean> {
    return await this.distributedBus.healthCheck();
  }

  async disconnect(): Promise<void> {
    await this.distributedBus.disconnect();
  }
}

/**
 * Event Bus Factory
 * Creates the appropriate event bus based on configuration
 */
export class EventBusFactory {
  private static instance: IEventBus | null = null;
  private static mode: 'memory' | 'redis' | null = null;

  /**
   * Initialize event bus
   */
  static async initialize(config?: {
    mode?: 'memory' | 'redis';
    redis?: {
      host?: string;
      port?: number;
      password?: string;
      db?: number;
      url?: string;
    };
    namespace?: string;
  }): Promise<IEventBus> {
    if (this.instance) {
      return this.instance;
    }

    // Determine mode from config or environment
    const mode = config?.mode || process.env.EVENT_BUS_MODE || 'memory';
    this.mode = mode as 'memory' | 'redis';

    console.log(`[EventBusFactory] Initializing ${this.mode} event bus`);

    if (this.mode === 'redis') {
      // Initialize Redis-based distributed event bus
      const redisConfig = {
        redis: {
          host: config?.redis?.host || process.env.REDIS_HOST || 'localhost',
          port: config?.redis?.port || parseInt(process.env.REDIS_PORT || '6379', 10),
          password: config?.redis?.password || process.env.REDIS_PASSWORD,
          db: config?.redis?.db || parseInt(process.env.REDIS_DB || '0', 10),
          url: config?.redis?.url || process.env.REDIS_URL,
        },
        namespace: config?.namespace || process.env.EVENT_BUS_NAMESPACE || 'sentinel',
      };

      const { initializeDistributedEventBus } = await import('../../backend/src/services/distributed-event-bus.service.js');
      const distributedBus = initializeDistributedEventBus(redisConfig);
      await distributedBus.connect();

      this.instance = new RedisEventBusWrapper(distributedBus);
      console.log('[EventBusFactory] Redis event bus initialized and connected');
    } else {
      // In-memory event bus
      this.instance = new InMemoryEventBus();
      console.log('[EventBusFactory] In-memory event bus initialized');
      console.warn('[EventBusFactory] WARNING: In-memory mode does not support multi-instance deployments');
    }

    return this.instance;
  }

  /**
   * Get initialized event bus instance
   */
  static getInstance(): IEventBus {
    if (!this.instance) {
      throw new Error('EventBus not initialized. Call EventBusFactory.initialize() first.');
    }
    return this.instance;
  }

  /**
   * Get current mode
   */
  static getMode(): 'memory' | 'redis' | null {
    return this.mode;
  }

  /**
   * Reset (for testing)
   */
  static async reset(): Promise<void> {
    if (this.instance) {
      await this.instance.disconnect();
      this.instance = null;
      this.mode = null;
    }
  }

  /**
   * Check if Redis mode is active
   */
  static isDistributed(): boolean {
    return this.mode === 'redis';
  }
}

/**
 * Convenience function to get event bus
 */
export async function getEventBus(): Promise<IEventBus> {
  try {
    return EventBusFactory.getInstance();
  } catch {
    // Auto-initialize with defaults if not initialized
    return await EventBusFactory.initialize();
  }
}

/**
 * Type-safe event publishing helper
 */
export async function publishEvent<T = any>(event: string, data: T): Promise<void> {
  const bus = await getEventBus();
  await bus.publish(event, data);
}

/**
 * Type-safe event subscription helper
 */
export async function subscribeToEvent<T = any>(
  event: string,
  handler: (data: T) => void | Promise<void>
): Promise<() => void> {
  const bus = await getEventBus();
  return await bus.subscribe(event, handler as any);
}

/**
 * Health check helper
 */
export async function checkEventBusHealth(): Promise<{
  healthy: boolean;
  mode: 'memory' | 'redis' | 'unknown';
  message: string;
}> {
  try {
    const bus = EventBusFactory.getInstance();
    const healthy = await bus.healthCheck();
    const mode = EventBusFactory.getMode() || 'unknown';

    return {
      healthy,
      mode,
      message: healthy 
        ? `Event bus (${mode}) is healthy`
        : `Event bus (${mode}) is unhealthy`,
    };
  } catch (error) {
    return {
      healthy: false,
      mode: 'unknown',
      message: error instanceof Error ? error.message : 'Event bus not initialized',
    };
  }
}

export const unifiedEventBus: IEventBus = new InMemoryEventBus();
