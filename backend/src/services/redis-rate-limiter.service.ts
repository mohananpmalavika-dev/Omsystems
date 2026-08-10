/**
 * Redis-based Rate Limiter
 * 
 * Replaces in-memory rate limiting with distributed Redis implementation.
 * This enables:
 * - Multi-instance deployments
 * - Consistent rate limiting across all control plane nodes
 * - Automatic cleanup via Redis TTL
 * - No memory leaks from orphaned entries
 */

import { Redis } from 'ioredis';

export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  resetAt: Date;
  retryAfterSeconds?: number;
}

export interface RateLimiterConfig {
  maxAttempts: number;
  windowMs: number;
  keyPrefix?: string;
}

export class RedisRateLimiter {
  private readonly redis: Redis;
  private readonly config: Required<RateLimiterConfig>;

  constructor(redis: Redis, config: RateLimiterConfig) {
    this.redis = redis;
    this.config = {
      keyPrefix: 'ratelimit',
      ...config,
    };
  }

  /**
   * Check and increment rate limit for an identifier
   */
  async check(identifier: string): Promise<RateLimitResult> {
    const key = `${this.config.keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const windowEnd = now;

    try {
      // Use Redis sorted set with timestamps as scores
      // This allows us to automatically expire old attempts
      const multi = this.redis.multi();

      // Remove attempts outside the current window
      multi.zremrangebyscore(key, 0, windowStart);

      // Count attempts in current window
      multi.zcard(key);

      // Add current attempt
      multi.zadd(key, now, `${now}`);

      // Set expiry on key (window + 1 minute buffer)
      multi.expire(key, Math.ceil(this.config.windowMs / 1000) + 60);

      const results = await multi.exec();

      if (!results) {
        throw new Error('Redis transaction failed');
      }

      // results[1] is the ZCARD result (count before adding current attempt)
      const countResult = results[1];
      if (!countResult || countResult[0]) {
        throw new Error('Failed to get count from Redis');
      }

      const currentCount = (countResult[1] as number) + 1; // +1 for the attempt we just added
      const allowed = currentCount <= this.config.maxAttempts;
      const remainingAttempts = Math.max(0, this.config.maxAttempts - currentCount);

      const resetAt = new Date(now + this.config.windowMs);
      const retryAfterSeconds = allowed ? undefined : Math.ceil(this.config.windowMs / 1000);

      return {
        allowed,
        remainingAttempts,
        resetAt,
        retryAfterSeconds,
      };
    } catch (error) {
      console.error('[RedisRateLimiter] Error checking rate limit:', error);
      
      // FAIL OPEN: If Redis is unavailable, allow the request
      // This prevents Redis outages from blocking all traffic
      // TODO: Add circuit breaker to detect persistent Redis failures
      return {
        allowed: true,
        remainingAttempts: this.config.maxAttempts,
        resetAt: new Date(now + this.config.windowMs),
      };
    }
  }

  /**
   * Reset rate limit for an identifier
   */
  async reset(identifier: string): Promise<void> {
    const key = `${this.config.keyPrefix}:${identifier}`;
    
    try {
      await this.redis.del(key);
    } catch (error) {
      console.error('[RedisRateLimiter] Error resetting rate limit:', error);
      // Fail silently - reset is not critical
    }
  }

  /**
   * Get current rate limit status without incrementing
   */
  async status(identifier: string): Promise<RateLimitResult> {
    const key = `${this.config.keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    try {
      const multi = this.redis.multi();

      // Remove expired attempts
      multi.zremrangebyscore(key, 0, windowStart);

      // Count current attempts
      multi.zcard(key);

      const results = await multi.exec();

      if (!results) {
        throw new Error('Redis transaction failed');
      }

      const countResult = results[1];
      if (!countResult || countResult[0]) {
        throw new Error('Failed to get count from Redis');
      }

      const currentCount = countResult[1] as number;
      const allowed = currentCount < this.config.maxAttempts;
      const remainingAttempts = Math.max(0, this.config.maxAttempts - currentCount);

      const resetAt = new Date(now + this.config.windowMs);
      const retryAfterSeconds = allowed ? undefined : Math.ceil(this.config.windowMs / 1000);

      return {
        allowed,
        remainingAttempts,
        resetAt,
        retryAfterSeconds,
      };
    } catch (error) {
      console.error('[RedisRateLimiter] Error getting rate limit status:', error);
      
      return {
        allowed: true,
        remainingAttempts: this.config.maxAttempts,
        resetAt: new Date(now + this.config.windowMs),
      };
    }
  }

  /**
   * Create a Fastify middleware from this rate limiter
   */
  middleware(options?: {
    keyExtractor?: (request: any) => string;
    skipIf?: (request: any) => boolean;
  }) {
    const keyExtractor = options?.keyExtractor ?? ((request: any) => {
      const forwarded = request.headers['x-forwarded-for'];
      return typeof forwarded === 'string'
        ? forwarded.split(',')[0]!.trim()
        : request.ip;
    });

    const skipIf = options?.skipIf ?? (() => false);

    return async (request: any, reply: any) => {
      if (skipIf(request)) {
        return;
      }

      const identifier = keyExtractor(request);
      const result = await this.check(identifier);

      if (!result.allowed) {
        return reply.code(429).send({
          error: 'too_many_requests',
          message: 'Too many requests. Please try again later.',
          retryAfter: result.retryAfterSeconds,
        });
      }

      // Add rate limit headers
      reply.header('X-RateLimit-Limit', this.config.maxAttempts.toString());
      reply.header('X-RateLimit-Remaining', result.remainingAttempts.toString());
      reply.header('X-RateLimit-Reset', result.resetAt.toISOString());
    };
  }
}

/**
 * Create login-specific rate limiter
 */
export function createLoginRateLimiter(redis: Redis): RedisRateLimiter {
  return new RedisRateLimiter(redis, {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    keyPrefix: 'ratelimit:login',
  });
}

/**
 * Create API rate limiter
 */
export function createApiRateLimiter(redis: Redis): RedisRateLimiter {
  return new RedisRateLimiter(redis, {
    maxAttempts: 1000,
    windowMs: 60 * 1000, // 1 minute
    keyPrefix: 'ratelimit:api',
  });
}

/**
 * Create alert creation rate limiter (prevent alert floods)
 */
export function createAlertRateLimiter(redis: Redis): RedisRateLimiter {
  return new RedisRateLimiter(redis, {
    maxAttempts: 100,
    windowMs: 60 * 1000, // 1 minute
    keyPrefix: 'ratelimit:alerts',
  });
}
