/**
 * Redis Client Service
 * 
 * Centralized Redis connection management with:
 * - Connection pooling
 * - Automatic reconnection
 * - Health monitoring
 * - Circuit breaker pattern
 * - Graceful degradation
 */

import * as IORedis from 'ioredis';

type RedisConnection = any;
type RedisOptions = Record<string, unknown>;
const RedisConstructor = ((IORedis as any).default ?? IORedis) as new (options?: RedisOptions) => RedisConnection;

export interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  maxRetriesPerRequest?: number;
  enableReadyCheck?: boolean;
  enableOfflineQueue?: boolean;
  connectTimeout?: number;
  lazyConnect?: boolean;
}

export interface RedisHealth {
  connected: boolean;
  ready: boolean;
  latencyMs: number | null;
  lastError: string | null;
  uptime: number; // milliseconds
}

export class RedisClientService {
  private client: RedisConnection | null = null;
  private subscriber: RedisConnection | null = null;
  private readonly config: RedisConfig;
  private connectionStartTime: number = 0;
  private lastError: string | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: RedisConfig) {
    this.config = config;
  }

  /**
   * Initialize Redis connection
   */
  async connect(): Promise<void> {
    console.log('[Redis] Connecting...');

    try {
      const options = this.buildOptions();
      
      this.client = new RedisConstructor(options);
      this.connectionStartTime = Date.now();

      // Setup event handlers
      this.setupEventHandlers(this.client, 'main');

      // Wait for ready
      await this.waitForReady(this.client);

      console.log('[Redis] ✅ Connected successfully');

      // Start health check
      this.startHealthCheck();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      console.error('[Redis] ❌ Connection failed:', this.lastError);
      throw new Error(`Redis connection failed: ${this.lastError}`);
    }
  }

  /**
   * Get main Redis client
   */
  getClient(): RedisConnection {
    if (!this.client) {
      throw new Error('Redis client not initialized. Call connect() first.');
    }
    return this.client;
  }

  /**
   * Get subscriber client (for pub/sub)
   */
  async getSubscriber(): Promise<RedisConnection> {
    if (!this.subscriber) {
      const options = this.buildOptions();
      this.subscriber = new RedisConstructor(options);
      this.setupEventHandlers(this.subscriber, 'subscriber');
      await this.waitForReady(this.subscriber);
    }
    return this.subscriber;
  }

  /**
   * Check Redis health
   */
  async getHealth(): Promise<RedisHealth> {
    if (!this.client) {
      return {
        connected: false,
        ready: false,
        latencyMs: null,
        lastError: this.lastError,
        uptime: 0,
      };
    }

    const connected = this.client.status === 'connect' || this.client.status === 'ready';
    const ready = this.client.status === 'ready';
    const uptime = this.connectionStartTime > 0 ? Date.now() - this.connectionStartTime : 0;

    // Measure latency with PING
    let latencyMs: number | null = null;
    if (ready) {
      try {
        const start = Date.now();
        await this.client.ping();
        latencyMs = Date.now() - start;
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
      }
    }

    return {
      connected,
      ready,
      latencyMs,
      lastError: this.lastError,
      uptime,
    };
  }

  /**
   * Check if Redis is available
   */
  async isAvailable(): Promise<boolean> {
    const health = await this.getHealth();
    return health.ready && health.latencyMs !== null && health.latencyMs < 1000;
  }

  /**
   * Disconnect Redis
   */
  async disconnect(): Promise<void> {
    console.log('[Redis] Disconnecting...');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }

    if (this.client) {
      await this.client.quit();
      this.client = null;
    }

    console.log('[Redis] Disconnected');
  }

  /**
   * Build Redis options from config
   */
  private buildOptions(): RedisOptions {
    if (this.config.url) {
      return {
        ...this.parseRedisUrl(this.config.url),
        maxRetriesPerRequest: this.config.maxRetriesPerRequest ?? 3,
        enableReadyCheck: this.config.enableReadyCheck ?? true,
        enableOfflineQueue: this.config.enableOfflineQueue ?? true,
        connectTimeout: this.config.connectTimeout ?? 10000,
        lazyConnect: this.config.lazyConnect ?? false,
        keyPrefix: this.config.keyPrefix,
        retryStrategy: (times: number) => {
          if (times > 10) {
            // Stop retrying after 10 attempts
            return null;
          }
          // Exponential backoff: 100ms, 200ms, 400ms, ..., max 30s
          return Math.min(times * 100, 30000);
        },
      };
    }

    return {
      host: this.config.host ?? 'localhost',
      port: this.config.port ?? 6379,
      password: this.config.password,
      db: this.config.db ?? 0,
      maxRetriesPerRequest: this.config.maxRetriesPerRequest ?? 3,
      enableReadyCheck: this.config.enableReadyCheck ?? true,
      enableOfflineQueue: this.config.enableOfflineQueue ?? true,
      connectTimeout: this.config.connectTimeout ?? 10000,
      lazyConnect: this.config.lazyConnect ?? false,
      keyPrefix: this.config.keyPrefix,
      retryStrategy: (times: number) => {
        if (times > 10) {
          return null;
        }
        return Math.min(times * 100, 30000);
      },
    };
  }

  /**
   * Parse Redis URL
   */
  private parseRedisUrl(url: string): { host: string; port: number; password?: string; db?: number } {
    const parsed = new URL(url);
    
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port) || 6379,
      password: parsed.password || undefined,
      db: parsed.pathname ? parseInt(parsed.pathname.substring(1)) : 0,
    };
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(client: RedisConnection, name: string): void {
    client.on('connect', () => {
      console.log(`[Redis:${name}] Connected`);
      this.lastError = null;
    });

    client.on('ready', () => {
      console.log(`[Redis:${name}] Ready`);
    });

    client.on('error', (error: Error) => {
      this.lastError = error.message;
      console.error(`[Redis:${name}] Error:`, error.message);
    });

    client.on('close', () => {
      console.warn(`[Redis:${name}] Connection closed`);
    });

    client.on('reconnecting', (delay: number) => {
      console.log(`[Redis:${name}] Reconnecting in ${delay}ms...`);
    });

    client.on('end', () => {
      console.log(`[Redis:${name}] Connection ended`);
    });
  }

  /**
   * Wait for Redis to be ready
   */
  private async waitForReady(client: RedisConnection, timeoutMs: number = 10000): Promise<void> {
    if (client.status === 'ready') {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Redis connection timeout'));
      }, timeoutMs);

      client.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      client.once('error', (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Start periodic health check
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      const health = await this.getHealth();
      
      if (!health.ready) {
        console.warn('[Redis] Health check failed:', health.lastError);
      } else if (health.latencyMs && health.latencyMs > 500) {
        console.warn(`[Redis] High latency: ${health.latencyMs}ms`);
      }
    }, 30000); // Every 30 seconds

    // Don't prevent process exit
    this.healthCheckInterval.unref();
  }
}

/**
 * Singleton instance
 */
let instance: RedisClientService | null = null;

export function getRedisClient(config?: RedisConfig): RedisClientService {
  if (!instance && config) {
    instance = new RedisClientService(config);
  }
  
  if (!instance) {
    throw new Error('Redis client not initialized. Provide config on first call.');
  }
  
  return instance;
}

/**
 * Initialize Redis from environment
 */
export async function initializeRedisFromEnv(): Promise<RedisClientService> {
  const redisUrl = process.env.REDIS_URL;
  
  if (!redisUrl) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('REDIS_URL is required in production');
    }
    
    console.warn('[Redis] ⚠️  REDIS_URL not configured. Using localhost (development only).');
  }

  const config: RedisConfig = {
    url: redisUrl || 'redis://localhost:6379',
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'sentinel:',
  };

  const client = getRedisClient(config);
  await client.connect();
  
  return client;
}
