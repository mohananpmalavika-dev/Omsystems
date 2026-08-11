/**
 * Redis Rate Limit Store
 * 
 * Distributed atomic rate limiting using Redis.
 * Uses Lua scripts to ensure race-free counter operations across multiple application instances.
 * 
 * SECURITY:
 * - All operations are atomic via Lua scripts
 * - TTL is set on first increment to prevent orphaned keys
 * - Sliding windows prevent boundary exploits
 * - No PII stored in keys (uses HMAC hashes)
 */

import Redis from 'ioredis';
import { logger } from '../../../../utils/logger.js';
import { IRateLimitStore } from './rate-limit-store.interface.js';
import { RateLimiterResult } from '../mfa-rate-limit.types.js';

/**
 * Fixed-window rate limiter Lua script
 * 
 * KEYS[1] = rate limit key
 * ARGV[1] = limit
 * ARGV[2] = window in milliseconds
 * 
 * Returns: {allowed (0|1), current, ttl_ms}
 */
const FIXED_WINDOW_SCRIPT = `
local current = redis.call("INCR", KEYS[1])

if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[2])
end

local ttl = redis.call("PTTL", KEYS[1])
if ttl == -1 then
  -- Key exists but has no TTL (shouldn't happen, but defensive)
  redis.call("PEXPIRE", KEYS[1], ARGV[2])
  ttl = tonumber(ARGV[2])
end

local limit = tonumber(ARGV[1])

if current > limit then
  return {0, current, ttl}
end

return {1, current, ttl}
`;

/**
 * Sliding-window rate limiter Lua script
 * 
 * Uses sorted set with timestamps to track individual requests.
 * More accurate but slightly more expensive than fixed window.
 * 
 * KEYS[1] = sorted set key
 * ARGV[1] = limit
 * ARGV[2] = window in seconds
 * ARGV[3] = current timestamp (seconds)
 * ARGV[4] = unique request ID
 * 
 * Returns: {allowed (0|1), current, oldest_timestamp}
 */
const SLIDING_WINDOW_SCRIPT = `
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cutoff = now - window

-- Remove expired entries
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", cutoff)

-- Count current entries
local current = redis.call("ZCARD", KEYS[1])
local limit = tonumber(ARGV[1])

-- Check if limit exceeded
if current >= limit then
  -- Get oldest timestamp for retry calculation
  local oldest = redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")
  local oldestTs = oldest[2] or now
  return {0, current, oldestTs}
end

-- Add new entry
redis.call("ZADD", KEYS[1], now, ARGV[4])

-- Set expiration (window + 60s buffer)
redis.call("EXPIRE", KEYS[1], window + 60)

-- Get oldest timestamp
local oldest = redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")
local oldestTs = oldest[2] or now

return {1, current + 1, oldestTs}
`;

/**
 * Redis-backed rate limit store
 */
export class RedisRateLimitStore implements IRateLimitStore {
  private fixedWindowSha: string | null = null;
  private slidingWindowSha: string | null = null;
  private scriptsLoaded = false;

  constructor(private readonly redis: Redis) {
    this.loadScripts().catch(err => {
      logger.error('Failed to load Redis rate limit scripts', { error: err });
    });
  }

  /**
   * Load Lua scripts into Redis
   */
  private async loadScripts(): Promise<void> {
    try {
      this.fixedWindowSha = await this.redis.script('LOAD', FIXED_WINDOW_SCRIPT);
      this.slidingWindowSha = await this.redis.script('LOAD', SLIDING_WINDOW_SCRIPT);
      this.scriptsLoaded = true;

      logger.info('Redis rate limit scripts loaded', {
        fixedWindowSha: this.fixedWindowSha,
        slidingWindowSha: this.slidingWindowSha,
      });
    } catch (error) {
      logger.error('Failed to load Redis rate limit scripts', { error });
      throw error;
    }
  }

  /**
   * Ensure scripts are loaded
   */
  private async ensureScriptsLoaded(): Promise<void> {
    if (!this.scriptsLoaded) {
      await this.loadScripts();
    }
  }

  /**
   * Check and increment (fixed window)
   */
  async checkAndIncrement(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<RateLimiterResult> {
    await this.ensureScriptsLoaded();

    try {
      const windowMs = windowSeconds * 1000;

      // Execute Lua script atomically
      const result = await this.redis.evalsha(
        this.fixedWindowSha!,
        1,
        key,
        limit.toString(),
        windowMs.toString()
      ) as [number, number, number];

      const [allowed, current, ttlMs] = result;

      const resetAt = new Date(Date.now() + ttlMs);
      const remaining = Math.max(0, limit - current);
      const retryAfterMs = allowed === 0 ? ttlMs : undefined;

      return {
        allowed: allowed === 1,
        count: current,
        limit,
        remaining,
        resetAt,
        retryAfterMs,
      };
    } catch (error) {
      logger.error('Redis rate limit check failed', { key, error });
      
      // SECURITY: Fail closed - deny on Redis error for security-critical operations
      // The caller should handle this based on operation criticality
      throw new RateLimitStoreError('Rate limit check failed', { cause: error });
    }
  }

  /**
   * Check and increment (sliding window)
   */
  async checkAndIncrementSliding(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<RateLimiterResult> {
    await this.ensureScriptsLoaded();

    try {
      const now = Math.floor(Date.now() / 1000);
      const requestId = `${now}-${Math.random().toString(36).substr(2, 9)}`;

      // Execute Lua script atomically
      const result = await this.redis.evalsha(
        this.slidingWindowSha!,
        1,
        key,
        limit.toString(),
        windowSeconds.toString(),
        now.toString(),
        requestId
      ) as [number, number, number];

      const [allowed, current, oldestTs] = result;

      // Calculate when the oldest request will expire
      const oldestExpiresAt = new Date((oldestTs + windowSeconds) * 1000);
      const remaining = Math.max(0, limit - current);
      const retryAfterMs = allowed === 0 
        ? Math.max(0, oldestExpiresAt.getTime() - Date.now())
        : undefined;

      return {
        allowed: allowed === 1,
        count: current,
        limit,
        remaining,
        resetAt: oldestExpiresAt,
        retryAfterMs,
      };
    } catch (error) {
      logger.error('Redis sliding rate limit check failed', { key, error });
      throw new RateLimitStoreError('Sliding rate limit check failed', { cause: error });
    }
  }

  /**
   * Get current counter value
   */
  async get(key: string): Promise<{
    count: number;
    ttl: number;
    resetAt: Date;
  } | null> {
    try {
      const [count, ttl] = await Promise.all([
        this.redis.get(key),
        this.redis.pttl(key),
      ]);

      if (!count || ttl < 0) {
        return null;
      }

      return {
        count: parseInt(count, 10),
        ttl: ttl / 1000,
        resetAt: new Date(Date.now() + ttl),
      };
    } catch (error) {
      logger.error('Failed to get rate limit counter', { key, error });
      return null;
    }
  }

  /**
   * Set a lockout key
   */
  async setLockout(
    key: string,
    durationSeconds: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const value = metadata ? JSON.stringify(metadata) : '1';
      await this.redis.setex(key, durationSeconds, value);

      logger.info('Lockout set', {
        key: this.sanitizeKeyForLog(key),
        durationSeconds,
      });
    } catch (error) {
      logger.error('Failed to set lockout', { key, error });
      throw new RateLimitStoreError('Failed to set lockout', { cause: error });
    }
  }

  /**
   * Check lockout status
   */
  async getLockout(key: string): Promise<{
    exists: true;
    ttl: number;
    expiresAt: Date;
    metadata?: Record<string, any>;
  } | {
    exists: false;
  }> {
    try {
      const [value, ttl] = await Promise.all([
        this.redis.get(key),
        this.redis.ttl(key),
      ]);

      if (!value || ttl < 0) {
        return { exists: false };
      }

      let metadata: Record<string, any> | undefined;
      try {
        if (value !== '1') {
          metadata = JSON.parse(value);
        }
      } catch {
        // Not JSON, ignore
      }

      return {
        exists: true,
        ttl,
        expiresAt: new Date(Date.now() + ttl * 1000),
        metadata,
      };
    } catch (error) {
      logger.error('Failed to get lockout status', { key, error });
      return { exists: false };
    }
  }

  /**
   * Remove lockout
   */
  async removeLockout(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      logger.info('Lockout removed', { key: this.sanitizeKeyForLog(key) });
    } catch (error) {
      logger.error('Failed to remove lockout', { key, error });
      throw new RateLimitStoreError('Failed to remove lockout', { cause: error });
    }
  }

  /**
   * Delete counter
   */
  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      logger.error('Failed to delete rate limit key', { key, error });
      throw new RateLimitStoreError('Failed to delete key', { cause: error });
    }
  }

  /**
   * Delete keys matching pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      let cursor = '0';
      let deletedCount = 0;

      do {
        // SCAN to avoid blocking Redis
        const [newCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100
        );

        cursor = newCursor;

        if (keys.length > 0) {
          const deleted = await this.redis.del(...keys);
          deletedCount += deleted;
        }
      } while (cursor !== '0');

      if (deletedCount > 0) {
        logger.debug('Deleted rate limit keys', { pattern, count: deletedCount });
      }

      return deletedCount;
    } catch (error) {
      logger.error('Failed to delete keys by pattern', { pattern, error });
      throw new RateLimitStoreError('Failed to delete pattern', { cause: error });
    }
  }

  /**
   * Health check
   */
  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed', { error });
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    try {
      await this.redis.quit();
      logger.info('Redis rate limit store closed');
    } catch (error) {
      logger.error('Failed to close Redis connection', { error });
    }
  }

  /**
   * Sanitize key for logging (remove PII hashes)
   */
  private sanitizeKeyForLog(key: string): string {
    // Replace hash values with placeholders
    return key.replace(/:[a-f0-9]{40,}/g, ':***');
  }
}

/**
 * Rate limit store error
 */
export class RateLimitStoreError extends Error {
  constructor(message: string, options?: { cause?: any }) {
    super(message);
    this.name = 'RateLimitStoreError';
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}
