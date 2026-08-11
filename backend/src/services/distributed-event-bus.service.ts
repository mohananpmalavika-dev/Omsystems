/**
 * Distributed Event Bus Service
 * Redis-based pub/sub for horizontal scaling across multiple control plane instances
 * 
 * Replaces in-memory EventEmitter to enable SSE across load-balanced servers
 * for 500+ branch deployment
 */

import { EventEmitter } from 'events';
import { createClient, RedisClientType } from 'redis';

interface EventBusConfig {
  redis: {
    url?: string;
    host?: string;
    port?: number;
    password?: string;
    db?: number;
  };
  namespace?: string;
}

interface DistributedEvent {
  channel: string;
  data: any;
  timestamp: number;
  serverId: string;
}

export class DistributedEventBus extends EventEmitter {
  private publisher: RedisClientType;
  private subscriber: RedisClientType;
  private namespace: string;
  private serverId: string;
  private subscribedChannels = new Set<string>();
  private isConnected = false;

  constructor(config: EventBusConfig) {
    super();
    this.namespace = config.namespace || 'oms';
    this.serverId = process.env.SERVER_ID || `server-${process.pid}`;

    // Build Redis connection options
    const redisUrl = config.redis.url || `redis://${config.redis.host || 'localhost'}:${config.redis.port || 6379}`;
    
    const clientOptions = {
      url: redisUrl,
      password: config.redis.password,
      database: config.redis.db || 0,
      socket: {
        reconnectStrategy: (retries: number) => {
          const delay = Math.min(retries * 50, 2000);
          return delay;
        },
      },
    };

    // Create separate connections for pub and sub
    this.publisher = createClient(clientOptions);
    this.subscriber = this.publisher.duplicate();

    this.setupErrorHandling();
  }

  async connect(): Promise<void> {
    await this.publisher.connect();
    await this.subscriber.connect();
    this.isConnected = true;
    this.setupSubscriber();
    console.log(`[DistributedEventBus] Connected to Redis (server: ${this.serverId})`);
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
    await this.publisher.quit();
    await this.subscriber.quit();
    console.log(`[DistributedEventBus] Disconnected from Redis`);
  }

  /**
   * Publish event to distributed bus
   */
  async publish(channel: string, data: any): Promise<void> {
    const qualifiedChannel = this.qualifyChannel(channel);
    
    const event: DistributedEvent = {
      channel,
      data,
      timestamp: Date.now(),
      serverId: this.serverId,
    };

    const payload = JSON.stringify(event);
    await this.publisher.publish(qualifiedChannel, payload);
  }

  /**
   * Subscribe to channel across all servers
   */
  async subscribe(channel: string, handler: (data: any) => void): Promise<void> {
    const qualifiedChannel = this.qualifyChannel(channel);

    if (!this.subscribedChannels.has(qualifiedChannel)) {
      await this.subscriber.subscribe(qualifiedChannel, (payload: string) => {
        // Inline handler will be set up in setupSubscriber
      });
      this.subscribedChannels.add(qualifiedChannel);
    }

    // Register local handler
    this.on(channel, handler);
  }

  /**
   * Subscribe to pattern (e.g., "floor:*", "alert:*")
   */
  async subscribePattern(pattern: string, handler: (channel: string, data: any) => void): Promise<void> {
    const qualifiedPattern = this.qualifyChannel(pattern);
    await this.subscriber.pSubscribe(qualifiedPattern, (payload: string) => {
      // Inline handler will be set up in setupSubscriber
    });

    // Store pattern subscription
    this.on(`pattern:${pattern}`, handler);
  }

  /**
   * Unsubscribe from channel
   */
  async unsubscribe(channel: string): Promise<void> {
    const qualifiedChannel = this.qualifyChannel(channel);
    
    if (this.subscribedChannels.has(qualifiedChannel)) {
      await this.subscriber.unsubscribe(qualifiedChannel);
      this.subscribedChannels.delete(qualifiedChannel);
    }

    this.removeAllListeners(channel);
  }

  /**
   * Check if event bus is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      // Ping Redis
      const result = await this.publisher.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('[DistributedEventBus] Health check failed:', error);
      return false;
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      serverId: this.serverId,
      subscribedChannels: Array.from(this.subscribedChannels),
      publisherStatus: this.publisher.isOpen ? 'ready' : 'closed',
      subscriberStatus: this.subscriber.isOpen ? 'ready' : 'closed',
      listenerCount: this.eventNames().length,
    };
  }

  private setupSubscriber(): void {
    // Handle regular channel messages
    this.subscriber.on('message', (qualifiedChannel: string, payload: string) => {
      try {
        const event: DistributedEvent = JSON.parse(payload);
        
        // Don't process events from ourselves (optional - remove if you want local echo)
        // if (event.serverId === this.serverId) {
        //   return;
        // }

        const channel = this.unqualifyChannel(qualifiedChannel);
        
        // Emit to local handlers
        this.emit(channel, event.data);
      } catch (error) {
        console.error('[DistributedEventBus] Error processing message:', error);
      }
    });

    // Handle pattern messages
    this.subscriber.on('pmessage', (pattern: string, qualifiedChannel: string, payload: string) => {
      try {
        const event: DistributedEvent = JSON.parse(payload);
        const channel = this.unqualifyChannel(qualifiedChannel);
        const basePattern = this.unqualifyChannel(pattern);

        // Emit to pattern handlers
        this.emit(`pattern:${basePattern}`, channel, event.data);
      } catch (error) {
        console.error('[DistributedEventBus] Error processing pattern message:', error);
      }
    });
  }

  private setupErrorHandling(): void {
    this.publisher.on('error', (error) => {
      console.error('[DistributedEventBus] Publisher error:', error);
    });

    this.subscriber.on('error', (error) => {
      console.error('[DistributedEventBus] Subscriber error:', error);
    });

    this.publisher.on('reconnecting', () => {
      console.warn('[DistributedEventBus] Publisher reconnecting...');
    });

    this.subscriber.on('reconnecting', () => {
      console.warn('[DistributedEventBus] Subscriber reconnecting...');
    });

    this.publisher.on('ready', () => {
      console.log('[DistributedEventBus] Publisher ready');
    });

    this.subscriber.on('ready', () => {
      console.log('[DistributedEventBus] Subscriber ready');
    });
  }

  private qualifyChannel(channel: string): string {
    return `${this.namespace}:${channel}`;
  }

  private unqualifyChannel(qualifiedChannel: string): string {
    return qualifiedChannel.replace(`${this.namespace}:`, '');
  }
}

/**
 * Singleton instance
 */
let eventBusInstance: DistributedEventBus | null = null;

export function initializeDistributedEventBus(config?: EventBusConfig): DistributedEventBus {
  if (eventBusInstance) {
    return eventBusInstance;
  }

  const redisConfig: EventBusConfig = config || {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
    },
    namespace: process.env.EVENT_BUS_NAMESPACE || 'oms',
  };

  eventBusInstance = new DistributedEventBus(redisConfig);
  return eventBusInstance;
}

export function getDistributedEventBus(): DistributedEventBus {
  if (!eventBusInstance) {
    throw new Error('DistributedEventBus not initialized. Call initializeDistributedEventBus() first.');
  }
  return eventBusInstance;
}

export default {
  initialize: initializeDistributedEventBus,
  getInstance: getDistributedEventBus,
};
