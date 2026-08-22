/**
 * Redis Distributed Lock Service
 * 
 * Implements distributed locks using Redis for multi-instance coordination.
 * Use cases:
 * - Preventing duplicate alert processing
 * - Coordinating report generation
 * - Serializing camera configuration changes
 * - Worker job deduplication
 * 
 * Based on Redlock algorithm with automatic lock extension.
 */

import { Redis } from 'ioredis';
import { randomBytes } from 'node:crypto';

export interface LockOptions {
  /**
   * Lock TTL in milliseconds
   */
  ttlMs: number;

  /**
   * Maximum time to wait for lock acquisition (0 = don't wait)
   */
  waitMs?: number;

  /**
   * Retry interval when waiting for lock
   */
  retryIntervalMs?: number;

  /**
   * Auto-extend lock before it expires
   */
  autoExtend?: boolean;

  /**
   * Extension interval (should be less than ttlMs)
   */
  extendIntervalMs?: number;
}

export interface Lock {
  /**
   * Lock key
   */
  key: string;

  /**
   * Lock value (unique identifier)
   */
  value: string;

  /**
   * Lock expiration time
   */
  expiresAt: Date;

  /**
   * Extend lock TTL
   */
  extend(ttlMs: number): Promise<boolean>;

  /**
   * Release lock
   */
  release(): Promise<boolean>;

  /**
   * Check if lock is still held
   */
  isHeld(): Promise<boolean>;
}

export class RedisLockService {
  private readonly redis: Redis;
  private readonly keyPrefix: string;
  private readonly autoExtendTimers = new Map<string, NodeJS.Timeout>();

  constructor(redis: Redis, keyPrefix: string = 'lock') {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
  }

  /**
   * Acquire a distributed lock
   */
  async acquire(
    lockName: string,
    options: LockOptions,
  ): Promise<Lock | null> {
    const key = `${this.keyPrefix}:${lockName}`;
    const value = randomBytes(16).toString('hex');
    const startTime = Date.now();
    const waitMs = options.waitMs ?? 0;
    const retryIntervalMs = options.retryIntervalMs ?? 100;

    while (true) {
      // Try to acquire lock
      const acquired = await this.tryAcquire(key, value, options.ttlMs);

      if (acquired) {
        const expiresAt = new Date(Date.now() + options.ttlMs);
        const lock = this.createLock(key, value, expiresAt);

        // Setup auto-extension if requested
        if (options.autoExtend) {
          this.setupAutoExtend(lock, options);
        }

        return lock;
      }

      // Check if we should wait
      const elapsed = Date.now() - startTime;
      if (waitMs === 0 || elapsed >= waitMs) {
        return null; // Could not acquire lock
      }

      // Wait before retrying
      await this.sleep(Math.min(retryIntervalMs, waitMs - elapsed));
    }
  }

  /**
   * Try to acquire lock (single attempt)
   */
  private async tryAcquire(
    key: string,
    value: string,
    ttlMs: number,
  ): Promise<boolean> {
    try {
      // SET NX (only if not exists) with PX (milliseconds TTL)
      const result = await this.redis.set(key, value, 'PX', ttlMs, 'NX');
      return result === 'OK';
    } catch (error) {
      console.error('[RedisLockService] Error acquiring lock:', error);
      return false;
    }
  }

  /**
   * Create lock object
   */
  private createLock(key: string, value: string, expiresAt: Date): Lock {
    const self = this;

    return {
      key,
      value,
      expiresAt,

      async extend(ttlMs: number): Promise<boolean> {
        return await self.extendLock(key, value, ttlMs);
      },

      async release(): Promise<boolean> {
        self.cancelAutoExtend(key);
        return await self.releaseLock(key, value);
      },

      async isHeld(): Promise<boolean> {
        return await self.isLockHeld(key, value);
      },
    };
  }

  /**
   * Extend lock TTL (only if still held)
   */
  private async extendLock(
    key: string,
    value: string,
    ttlMs: number,
  ): Promise<boolean> {
    try {
      // Lua script to atomically check value and extend TTL
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("pexpire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;

      const result = await this.redis.eval(script, 1, key, value, ttlMs);
      return result === 1;
    } catch (error) {
      console.error('[RedisLockService] Error extending lock:', error);
      return false;
    }
  }

  /**
   * Release lock (only if still held)
   */
  private async releaseLock(key: string, value: string): Promise<boolean> {
    try {
      // Lua script to atomically check value and delete
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await this.redis.eval(script, 1, key, value);
      return result === 1;
    } catch (error) {
      console.error('[RedisLockService] Error releasing lock:', error);
      return false;
    }
  }

  /**
   * Check if lock is still held
   */
  private async isLockHeld(key: string, value: string): Promise<boolean> {
    try {
      const current = await this.redis.get(key);
      return current === value;
    } catch (error) {
      console.error('[RedisLockService] Error checking lock:', error);
      return false;
    }
  }

  /**
   * Setup automatic lock extension
   */
  private setupAutoExtend(lock: Lock, options: LockOptions): void {
    const extendIntervalMs = options.extendIntervalMs ?? Math.floor(options.ttlMs / 2);

    const timer = setInterval(async () => {
      const extended = await lock.extend(options.ttlMs);
      
      if (!extended) {
        console.warn(`[RedisLockService] Failed to extend lock: ${lock.key}`);
        this.cancelAutoExtend(lock.key);
      } else {
        lock.expiresAt = new Date(Date.now() + options.ttlMs);
      }
    }, extendIntervalMs);

    // Don't prevent process exit
    timer.unref();

    this.autoExtendTimers.set(lock.key, timer);
  }

  /**
   * Cancel automatic lock extension
   */
  private cancelAutoExtend(key: string): void {
    const timer = this.autoExtendTimers.get(key);
    if (timer) {
      clearInterval(timer);
      this.autoExtendTimers.delete(key);
    }
  }

  /**
   * Execute function with lock
   */
  async withLock<T>(
    lockName: string,
    options: LockOptions,
    fn: () => Promise<T>,
  ): Promise<T | null> {
    const lock = await this.acquire(lockName, options);

    if (!lock) {
      console.warn(`[RedisLockService] Failed to acquire lock: ${lockName}`);
      return null;
    }

    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup all auto-extend timers
   */
  cleanup(): void {
    for (const timer of this.autoExtendTimers.values()) {
      clearInterval(timer);
    }
    this.autoExtendTimers.clear();
  }
}

/**
 * Create singleton instance
 */
let instance: RedisLockService | null = null;

export function getRedisLockService(redis: Redis): RedisLockService {
  if (!instance) {
    instance = new RedisLockService(redis);
  }
  return instance;
}

/**
 * Common lock patterns
 */

export async function withAlertProcessingLock<T>(
  redis: Redis,
  alertId: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  const lockService = getRedisLockService(redis);
  return await lockService.withLock(
    `alert:${alertId}`,
    { ttlMs: 30000, waitMs: 5000 }, // 30s lock, 5s wait
    fn,
  );
}

export async function withReportGenerationLock<T>(
  redis: Redis,
  reportId: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  const lockService = getRedisLockService(redis);
  return await lockService.withLock(
    `report:${reportId}`,
    { ttlMs: 300000, waitMs: 10000, autoExtend: true }, // 5min lock with auto-extend, 10s wait
    fn,
  );
}

export async function withCameraConfigLock<T>(
  redis: Redis,
  cameraId: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  const lockService = getRedisLockService(redis);
  return await lockService.withLock(
    `camera:config:${cameraId}`,
    { ttlMs: 10000, waitMs: 3000 }, // 10s lock, 3s wait
    fn,
  );
}
