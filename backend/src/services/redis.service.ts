/**
 * Redis Service - Unified Interface
 * 
 * Provides all Redis-based distributed services:
 * - Rate limiting
 * - Distributed locks
 * - Alert deduplication
 * - Ephemeral state
 * - Worker coordination
 * 
 * This replaces in-memory implementations and enables:
 * - Multi-instance deployments
 * - Horizontal scaling
 * - Consistent state across control plane nodes
 */

import { Redis } from 'ioredis';
import { RedisClientService, initializeRedisFromEnv } from './redis-client.service.js';
import { RedisRateLimiter, createLoginRateLimiter, createApiRateLimiter, createAlertRateLimiter } from './redis-rate-limiter.service.js';
import { RedisLockService, getRedisLockService } from './redis-lock.service.js';
import { RedisAlertDeduplicationService, getAlertDeduplicationService } from './redis-alert-deduplication.service.js';

export interface RedisServiceConfig {
  enabled: boolean;
  url?: string;
  fallbackToMemory?: boolean; // Fallback to in-memory if Redis unavailable
}

export class RedisService {
  private readonly clientService: RedisClientService;
  private client: Redis | null = null;
  
  // Services
  private _rateLimiters: {
    login: RedisRateLimiter | null;
    api: RedisRateLimiter | null;
    alerts: RedisRateLimiter | null;
  } = {
    login: null,
    api: null,
    alerts: null,
  };
  
  private _lockService: RedisLockService | null = null;
  private _deduplicationService: RedisAlertDeduplicationService | null = null;
  
  private initialized: boolean = false;
  private available: boolean = false;

  constructor(clientService: RedisClientService) {
    this.clientService = clientService;
  }

  /**
   * Initialize all Redis services
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log('[RedisService] Initializing...');

    try {
      // Connect to Redis
      await this.clientService.connect();
      this.client = this.clientService.getClient();
      this.available = true;

      // Initialize services
      this._rateLimiters.login = createLoginRateLimiter(this.client);
      this._rateLimiters.api = createApiRateLimiter(this.client);
      this._rateLimiters.alerts = createAlertRateLimiter(this.client);
      this._lockService = getRedisLockService(this.client);
      this._deduplicationService = getAlertDeduplicationService(this.client);

      this.initialized = true;
      console.log('[RedisService] ✅ Initialized successfully');
    } catch (error) {
      console.error('[RedisService] ❌ Initialization failed:', error);
      this.available = false;
      
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }
      
      console.warn('[RedisService] ⚠️  Running in degraded mode (in-memory fallback)');
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.available && this.initialized;
  }

  /**
   * Get Redis client
   */
  getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis client not available. Call initialize() first.');
    }
    return this.client;
  }

  /**
   * Get rate limiters
   */
  getRateLimiters() {
    if (!this.isAvailable()) {
      throw new Error('Redis services not available');
    }
    
    return {
      login: this._rateLimiters.login!,
      api: this._rateLimiters.api!,
      alerts: this._rateLimiters.alerts!,
    };
  }

  /**
   * Get lock service
   */
  getLockService(): RedisLockService {
    if (!this.isAvailable()) {
      throw new Error('Redis services not available');
    }
    return this._lockService!;
  }

  /**
   * Get deduplication service
   */
  getDeduplicationService(): RedisAlertDeduplicationService {
    if (!this.isAvailable()) {
      throw new Error('Redis services not available');
    }
    return this._deduplicationService!;
  }

  /**
   * Get service health
   */
  async getHealth() {
    const redisHealth = await this.clientService.getHealth();
    
    return {
      redis: redisHealth,
      services: {
        rateLimiting: this._rateLimiters.login !== null,
        distributedLocks: this._lockService !== null,
        alertDeduplication: this._deduplicationService !== null,
      },
      available: this.available,
      initialized: this.initialized,
    };
  }

  /**
   * Shutdown
   */
  async shutdown(): Promise<void> {
    console.log('[RedisService] Shutting down...');
    
    if (this._lockService) {
      this._lockService.cleanup();
    }
    
    await this.clientService.disconnect();
    
    this.initialized = false;
    this.available = false;
    
    console.log('[RedisService] Shutdown complete');
  }

  /**
   * Ephemeral state helpers
   */

  /**
   * Set ephemeral key with TTL
   */
  async setEphemeral(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (!this.isAvailable()) return;
    await this.client!.set(key, value, 'EX', ttlSeconds);
  }

  /**
   * Get ephemeral key
   */
  async getEphemeral(key: string): Promise<string | null> {
    if (!this.isAvailable()) return null;
    return await this.client!.get(key);
  }

  /**
   * Delete ephemeral key
   */
  async deleteEphemeral(key: string): Promise<void> {
    if (!this.isAvailable()) return;
    await this.client!.del(key);
  }

  /**
   * Worker coordination helpers
   */

  /**
   * Register worker
   */
  async registerWorker(workerId: string, metadata: Record<string, any>, ttlSeconds: number = 60): Promise<void> {
    if (!this.isAvailable()) return;
    
    const key = `worker:${workerId}`;
    await this.client!.set(
      key,
      JSON.stringify({
        ...metadata,
        registeredAt: Date.now(),
      }),
      'EX',
      ttlSeconds,
    );
  }

  /**
   * Heartbeat worker
   */
  async heartbeatWorker(workerId: string, ttlSeconds: number = 60): Promise<void> {
    if (!this.isAvailable()) return;
    
    const key = `worker:${workerId}`;
    await this.client!.expire(key, ttlSeconds);
  }

  /**
   * Get active workers
   */
  async getActiveWorkers(): Promise<Array<{ id: string; metadata: Record<string, any> }>> {
    if (!this.isAvailable()) return [];
    
    const pattern = 'worker:*';
    let cursor = '0';
    const workers: Array<{ id: string; metadata: Record<string, any> }> = [];

    do {
      const [nextCursor, keys] = await this.client!.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;

      for (const key of keys) {
        const value = await this.client!.get(key);
        if (value) {
          workers.push({
            id: key.replace('worker:', ''),
            metadata: JSON.parse(value),
          });
        }
      }
    } while (cursor !== '0');

    return workers;
  }

  /**
   * Unregister worker
   */
  async unregisterWorker(workerId: string): Promise<void> {
    if (!this.isAvailable()) return;
    
    const key = `worker:${workerId}`;
    await this.client!.del(key);
  }

  /**
   * Pub/Sub helpers
   */

  /**
   * Publish message
   */
  async publish(channel: string, message: string): Promise<void> {
    if (!this.isAvailable()) return;
    await this.client!.publish(channel, message);
  }

  /**
   * Subscribe to channel
   */
  async subscribe(channel: string, handler: (message: string) => void): Promise<void> {
    if (!this.isAvailable()) return;
    
    const subscriber = await this.clientService.getSubscriber();
    await subscriber.subscribe(channel);
    
    subscriber.on('message', (ch, msg) => {
      if (ch === channel) {
        handler(msg);
      }
    });
  }
}

/**
 * Singleton instance
 */
let instance: RedisService | null = null;

export async function getRedisService(): Promise<RedisService> {
  if (!instance) {
    const clientService = await initializeRedisFromEnv();
    instance = new RedisService(clientService);
    await instance.initialize();
  }
  return instance;
}

/**
 * Initialize Redis service (call on app startup)
 */
export async function initializeRedisService(): Promise<RedisService> {
  console.log('[RedisService] Starting initialization...');
  
  try {
    const service = await getRedisService();
    
    const health = await service.getHealth();
    console.log('[RedisService] Health check:', {
      available: health.available,
      initialized: health.initialized,
      latency: health.redis.latencyMs,
    });
    
    return service;
  } catch (error) {
    console.error('[RedisService] Initialization error:', error);
    
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Redis is required in production mode');
    }
    
    // In development, continue without Redis
    console.warn('[RedisService] ⚠️  Continuing without Redis (development only)');
    throw error;
  }
}

/**
 * Shutdown Redis service (call on app shutdown)
 */
export async function shutdownRedisService(): Promise<void> {
  if (instance) {
    await instance.shutdown();
    instance = null;
  }
}
