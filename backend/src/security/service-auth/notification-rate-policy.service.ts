/**
 * Notification Rate Policy Service
 * 
 * Implements multi-dimensional rate limiting for service-to-service notifications.
 * Enforces limits by service, tenant, purpose, and recipient count.
 */

import {
  ServiceId,
  NotificationPurpose,
  RateLimitContext,
  RateLimitResult,
  RateLimitBucket,
  INotificationRatePolicyService,
  RateLimitExceededError,
  ServiceNotificationPolicy,
} from './service-auth.types.js';
import { logger } from '../../utils/logger.js';

/**
 * Rate limit window duration (1 minute)
 */
const WINDOW_DURATION_MS = 60 * 1000;

/**
 * In-Memory Rate Limiter
 * 
 * Uses sliding window counters with per-dimension buckets.
 * 
 * For production multi-instance deployments, use:
 * - Redis with sliding window counters
 * - Rate limiting gateway (Kong, Tyk, etc.)
 * - Distributed rate limiter (token bucket in Redis)
 */
export class NotificationRatePolicyService implements INotificationRatePolicyService {
  private readonly buckets: Map<string, RateLimitBucket>;
  private readonly policies: Map<ServiceId, ServiceNotificationPolicy>;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(policies: ServiceNotificationPolicy[]) {
    this.buckets = new Map();
    this.policies = new Map();

    // Index policies by service ID
    for (const policy of policies) {
      this.policies.set(policy.serviceId, policy);
    }

    // Start background cleanup
    this.startCleanup();

    logger.info('Rate policy service initialized', {
      servicesConfigured: this.policies.size,
      implementation: 'in-memory',
    });
  }

  /**
   * Check rate limits before processing notification
   * 
   * Checks all applicable limits:
   * 1. Per-tenant-per-minute
   * 2. Per-purpose-per-minute
   * 3. Recipients-per-tenant-per-minute
   * 4. Max-recipients-per-request
   * 
   * Throws RateLimitExceededError if any limit is exceeded.
   */
  async check(context: RateLimitContext): Promise<void> {
    const { serviceId, tenantId, purpose, recipientCount } = context;

    const policy = this.policies.get(serviceId);
    if (!policy) {
      throw new Error(`No rate policy configured for service: ${serviceId}`);
    }

    // Check 1: Max recipients per request
    if (recipientCount > policy.rateLimits.maxRecipientsPerRequest) {
      throw new RateLimitExceededError(
        `Request exceeds maximum recipients per request: ${recipientCount} > ${policy.rateLimits.maxRecipientsPerRequest}`,
        'request',
        recipientCount,
        policy.rateLimits.maxRecipientsPerRequest,
        new Date() // No reset time for per-request limit
      );
    }

    // Check 2: Per-tenant-per-minute
    const tenantResult = await this.checkLimit(
      `${serviceId}:tenant:${tenantId}`,
      policy.rateLimits.perTenantPerMinute
    );

    if (!tenantResult.allowed) {
      throw new RateLimitExceededError(
        `Rate limit exceeded for tenant: ${tenantResult.currentCount}/${tenantResult.limit} requests per minute`,
        'tenant',
        tenantResult.currentCount!,
        tenantResult.limit!,
        tenantResult.resetsAt!
      );
    }

    // Check 3: Per-purpose-per-minute
    const purposeResult = await this.checkLimit(
      `${serviceId}:purpose:${purpose}`,
      policy.rateLimits.perPurposePerMinute
    );

    if (!purposeResult.allowed) {
      throw new RateLimitExceededError(
        `Rate limit exceeded for purpose ${purpose}: ${purposeResult.currentCount}/${purposeResult.limit} requests per minute`,
        'purpose',
        purposeResult.currentCount!,
        purposeResult.limit!,
        purposeResult.resetsAt!
      );
    }

    // Check 4: Recipients-per-tenant-per-minute
    const recipientsResult = await this.checkLimit(
      `${serviceId}:recipients:${tenantId}`,
      policy.rateLimits.recipientsPerTenantPerMinute,
      recipientCount
    );

    if (!recipientsResult.allowed) {
      throw new RateLimitExceededError(
        `Rate limit exceeded for recipient count: ${recipientsResult.currentCount}/${recipientsResult.limit} recipients per minute`,
        'recipients',
        recipientsResult.currentCount!,
        recipientsResult.limit!,
        recipientsResult.resetsAt!
      );
    }

    logger.debug('Rate limit checks passed', {
      serviceId,
      tenantId,
      purpose,
      recipientCount,
    });
  }

  /**
   * Increment rate limit counters after accepting notification
   */
  async increment(context: RateLimitContext): Promise<void> {
    const { serviceId, tenantId, purpose, recipientCount } = context;

    // Increment all applicable counters
    await this.incrementCounter(`${serviceId}:tenant:${tenantId}`, 1);
    await this.incrementCounter(`${serviceId}:purpose:${purpose}`, 1);
    await this.incrementCounter(`${serviceId}:recipients:${tenantId}`, recipientCount);

    logger.debug('Rate limit counters incremented', {
      serviceId,
      tenantId,
      purpose,
      recipientCount,
    });
  }

  /**
   * Get current rate limit status
   */
  async getStatus(context: RateLimitContext): Promise<RateLimitResult> {
    const { serviceId, tenantId } = context;

    const policy = this.policies.get(serviceId);
    if (!policy) {
      return {
        allowed: false,
        limitType: 'tenant',
      };
    }

    const result = await this.checkLimit(
      `${serviceId}:tenant:${tenantId}`,
      policy.rateLimits.perTenantPerMinute
    );

    return result;
  }

  /**
   * Get all bucket stats (for monitoring)
   */
  getBucketStats(): {
    totalBuckets: number;
    activeBuckets: number;
    expiredBuckets: number;
  } {
    const now = new Date();
    let active = 0;
    let expired = 0;

    for (const bucket of this.buckets.values()) {
      if (bucket.windowEnd > now) {
        active++;
      } else {
        expired++;
      }
    }

    return {
      totalBuckets: this.buckets.size,
      activeBuckets: active,
      expiredBuckets: expired,
    };
  }

  /**
   * Clear all buckets (for testing)
   */
  clear(): void {
    this.buckets.clear();
    logger.debug('Rate limit buckets cleared');
  }

  /**
   * Destroy service and cleanup resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.buckets.clear();
    logger.info('Rate policy service destroyed');
  }

  // =====================================================
  // Private Helper Methods
  // =====================================================

  /**
   * Check if limit allows additional count
   */
  private async checkLimit(
    key: string,
    limit: number,
    count: number = 1
  ): Promise<RateLimitResult> {
    const bucket = this.getOrCreateBucket(key);
    const now = new Date();

    // If bucket window has expired, reset it
    if (bucket.windowEnd < now) {
      bucket.count = 0;
      bucket.windowStart = now;
      bucket.windowEnd = new Date(now.getTime() + WINDOW_DURATION_MS);
    }

    const newCount = bucket.count + count;

    if (newCount > limit) {
      return {
        allowed: false,
        limitType: 'tenant', // Caller should override this
        currentCount: bucket.count,
        limit,
        resetsAt: bucket.windowEnd,
      };
    }

    return {
      allowed: true,
      currentCount: bucket.count,
      limit,
      resetsAt: bucket.windowEnd,
    };
  }

  /**
   * Increment counter
   */
  private async incrementCounter(key: string, count: number = 1): Promise<void> {
    const bucket = this.getOrCreateBucket(key);
    const now = new Date();

    // If bucket window has expired, reset it
    if (bucket.windowEnd < now) {
      bucket.count = 0;
      bucket.windowStart = now;
      bucket.windowEnd = new Date(now.getTime() + WINDOW_DURATION_MS);
    }

    bucket.count += count;
  }

  /**
   * Get or create rate limit bucket
   */
  private getOrCreateBucket(key: string): RateLimitBucket {
    let bucket = this.buckets.get(key);

    if (!bucket) {
      const now = new Date();
      bucket = {
        key,
        count: 0,
        windowStart: now,
        windowEnd: new Date(now.getTime() + WINDOW_DURATION_MS),
      };
      this.buckets.set(key, bucket);
    }

    return bucket;
  }

  /**
   * Clean up expired buckets
   */
  private cleanupExpired(): number {
    const now = new Date();
    let removed = 0;

    for (const [key, bucket] of this.buckets.entries()) {
      // Remove buckets that expired more than 1 minute ago
      if (bucket.windowEnd < new Date(now.getTime() - WINDOW_DURATION_MS)) {
        this.buckets.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug('Cleaned up expired rate limit buckets', {
        removed,
        remaining: this.buckets.size,
      });
    }

    return removed;
  }

  /**
   * Start background cleanup timer
   */
  private startCleanup(): void {
    // Run cleanup every 2 minutes
    const cleanupIntervalMs = 2 * 60 * 1000;

    this.cleanupTimer = setInterval(() => {
      try {
        this.cleanupExpired();
      } catch (error) {
        logger.error('Error during rate limit cleanup', { error });
      }
    }, cleanupIntervalMs);

    // Don't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }

    logger.debug('Rate limit cleanup timer started', {
      intervalMs: cleanupIntervalMs,
    });
  }
}

/**
 * Redis-based Rate Limiter (Production Implementation)
 * 
 * Uses Redis sorted sets for sliding window rate limiting.
 */
export class RedisRatePolicyService implements INotificationRatePolicyService {
  private readonly redis: any;
  private readonly policies: Map<ServiceId, ServiceNotificationPolicy>;
  private readonly keyPrefix: string;

  constructor(redis: any, policies: ServiceNotificationPolicy[], keyPrefix: string = 'ratelimit:') {
    this.redis = redis;
    this.policies = new Map();
    this.keyPrefix = keyPrefix;

    for (const policy of policies) {
      this.policies.set(policy.serviceId, policy);
    }

    logger.info('Redis rate policy service initialized', {
      servicesConfigured: this.policies.size,
      keyPrefix,
    });
  }

  async check(context: RateLimitContext): Promise<void> {
    const { serviceId, tenantId, purpose, recipientCount } = context;

    const policy = this.policies.get(serviceId);
    if (!policy) {
      throw new Error(`No rate policy configured for service: ${serviceId}`);
    }

    // Check max recipients per request
    if (recipientCount > policy.rateLimits.maxRecipientsPerRequest) {
      throw new RateLimitExceededError(
        `Request exceeds maximum recipients: ${recipientCount} > ${policy.rateLimits.maxRecipientsPerRequest}`,
        'request',
        recipientCount,
        policy.rateLimits.maxRecipientsPerRequest,
        new Date()
      );
    }

    // Check other limits using Redis
    await this.checkRedisLimit(
      `${serviceId}:tenant:${tenantId}`,
      policy.rateLimits.perTenantPerMinute,
      'tenant'
    );

    await this.checkRedisLimit(
      `${serviceId}:purpose:${purpose}`,
      policy.rateLimits.perPurposePerMinute,
      'purpose'
    );

    await this.checkRedisLimit(
      `${serviceId}:recipients:${tenantId}`,
      policy.rateLimits.recipientsPerTenantPerMinute,
      'recipients',
      recipientCount
    );
  }

  async increment(context: RateLimitContext): Promise<void> {
    const { serviceId, tenantId, purpose, recipientCount } = context;
    const now = Date.now();

    // Use pipeline for atomic operations
    const pipeline = this.redis.pipeline();

    // Increment counters
    const keys = [
      `${this.keyPrefix}${serviceId}:tenant:${tenantId}`,
      `${this.keyPrefix}${serviceId}:purpose:${purpose}`,
      `${this.keyPrefix}${serviceId}:recipients:${tenantId}`,
    ];

    for (const key of keys) {
      const count = key.includes('recipients') ? recipientCount : 1;
      
      // Add to sorted set with current timestamp as score
      pipeline.zadd(key, now, `${now}:${Math.random()}`);
      
      // Remove entries older than window
      pipeline.zremrangebyscore(key, 0, now - WINDOW_DURATION_MS);
      
      // Set expiration
      pipeline.expire(key, 120); // 2 minutes TTL
    }

    await pipeline.exec();
  }

  async getStatus(context: RateLimitContext): Promise<RateLimitResult> {
    const { serviceId, tenantId } = context;

    const policy = this.policies.get(serviceId);
    if (!policy) {
      return { allowed: false };
    }

    return this.getRedisLimitStatus(
      `${serviceId}:tenant:${tenantId}`,
      policy.rateLimits.perTenantPerMinute
    );
  }

  private async checkRedisLimit(
    key: string,
    limit: number,
    limitType: string,
    count: number = 1
  ): Promise<void> {
    const fullKey = `${this.keyPrefix}${key}`;
    const now = Date.now();
    const windowStart = now - WINDOW_DURATION_MS;

    // Count entries in current window
    const currentCount = await this.redis.zcount(fullKey, windowStart, now);

    if (currentCount + count > limit) {
      throw new RateLimitExceededError(
        `Rate limit exceeded for ${limitType}`,
        limitType,
        currentCount,
        limit,
        new Date(Math.ceil(now / WINDOW_DURATION_MS) * WINDOW_DURATION_MS)
      );
    }
  }

  private async getRedisLimitStatus(key: string, limit: number): Promise<RateLimitResult> {
    const fullKey = `${this.keyPrefix}${key}`;
    const now = Date.now();
    const windowStart = now - WINDOW_DURATION_MS;

    const currentCount = await this.redis.zcount(fullKey, windowStart, now);

    return {
      allowed: currentCount < limit,
      currentCount,
      limit,
      resetsAt: new Date(Math.ceil(now / WINDOW_DURATION_MS) * WINDOW_DURATION_MS),
    };
  }
}

/**
 * Factory function for creating NotificationRatePolicyService
 */
export function createNotificationRatePolicyService(
  policies: ServiceNotificationPolicy[],
  redis?: any
): INotificationRatePolicyService {
  if (redis) {
    return new RedisRatePolicyService(redis, policies);
  }

  return new NotificationRatePolicyService(policies);
}
