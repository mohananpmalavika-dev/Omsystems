/**
 * Replay Protection Service
 * 
 * Prevents JWT replay attacks by tracking consumed JWT IDs (jti).
 * Uses time-bounded cache with automatic expiration.
 */

import {
  ServicePrincipal,
  ServiceId,
  ReplayCheckResult,
  IReplayProtectionService,
  ReplayDetectedError,
} from './service-auth.types.js';
import { logger } from '../../utils/logger.js';

/**
 * In-memory replay cache entry
 */
interface ReplayCacheEntry {
  serviceId: ServiceId;
  jti: string;
  consumedAt: Date;
  expiresAt: Date;
}

/**
 * Replay Protection Service (In-Memory Implementation)
 * 
 * This implementation uses an in-memory Map for simplicity.
 * 
 * For production multi-instance deployments, use:
 * - Redis with SET NX EX pattern
 * - DynamoDB with conditional writes
 * - PostgreSQL with advisory locks
 * - Distributed cache (Memcached, etc.)
 * 
 * The key requirement is atomic check-and-set across all backend instances.
 */
export class ReplayProtectionService implements IReplayProtectionService {
  private readonly cache: Map<string, ReplayCacheEntry>;
  private readonly ttlSeconds: number;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(ttlSeconds: number = 900) { // 15 minutes default
    this.cache = new Map();
    this.ttlSeconds = ttlSeconds;
    
    // Start background cleanup
    this.startCleanup();
    
    logger.info('Replay protection service initialized', {
      ttlSeconds,
      implementation: 'in-memory',
    });
  }

  /**
   * Check and consume JWT ID
   * 
   * Atomically checks if JTI has been used and marks it as consumed.
   * Throws ReplayDetectedError if JTI was previously consumed.
   */
  async consume(principal: ServicePrincipal): Promise<void> {
    const { serviceId, jti, expiresAt } = principal;

    // Check if already consumed
    const checkResult = await this.isReplayed(serviceId, jti);
    
    if (checkResult.isReplay) {
      logger.warn('JWT replay detected', {
        serviceId,
        jti,
        previousUseAt: checkResult.previousUseAt,
      });

      throw new ReplayDetectedError(
        `JWT has been used before at ${checkResult.previousUseAt?.toISOString()}`,
        jti,
        checkResult.previousUseAt!
      );
    }

    // Record as consumed
    await this.record(serviceId, jti, expiresAt);

    logger.debug('JWT consumed successfully', {
      serviceId,
      jti,
      expiresAt,
    });
  }

  /**
   * Check if JTI has been used
   */
  async isReplayed(serviceId: ServiceId, jti: string): Promise<ReplayCheckResult> {
    const key = this.buildCacheKey(serviceId, jti);
    const entry = this.cache.get(key);

    if (!entry) {
      return {
        isReplay: false,
      };
    }

    // Check if entry is expired
    if (entry.expiresAt < new Date()) {
      // Clean up expired entry
      this.cache.delete(key);
      
      return {
        isReplay: false,
      };
    }

    return {
      isReplay: true,
      previousUseAt: entry.consumedAt,
    };
  }

  /**
   * Record JTI as consumed
   */
  async record(serviceId: ServiceId, jti: string, expiresAt: Date): Promise<void> {
    const key = this.buildCacheKey(serviceId, jti);
    
    const entry: ReplayCacheEntry = {
      serviceId,
      jti,
      consumedAt: new Date(),
      expiresAt,
    };

    this.cache.set(key, entry);

    logger.debug('JWT recorded in replay cache', {
      serviceId,
      jti,
      expiresAt,
      cacheSize: this.cache.size,
    });
  }

  /**
   * Get current cache size (for monitoring)
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Clear expired entries (for manual cleanup)
   */
  cleanupExpired(): number {
    const now = new Date();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug('Cleaned up expired replay cache entries', {
        removed,
        remaining: this.cache.size,
      });
    }

    return removed;
  }

  /**
   * Clear all entries (for testing)
   */
  clear(): void {
    this.cache.clear();
    logger.debug('Replay cache cleared');
  }

  /**
   * Stop background cleanup
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.cache.clear();
    logger.info('Replay protection service destroyed');
  }

  // =====================================================
  // Private Helper Methods
  // =====================================================

  private buildCacheKey(serviceId: ServiceId, jti: string): string {
    return `${serviceId}:${jti}`;
  }

  private startCleanup(): void {
    // Run cleanup every 5 minutes
    const cleanupIntervalMs = 5 * 60 * 1000;

    this.cleanupTimer = setInterval(() => {
      try {
        this.cleanupExpired();
      } catch (error) {
        logger.error('Error during replay cache cleanup', { error });
      }
    }, cleanupIntervalMs);

    // Don't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }

    logger.debug('Replay cache cleanup timer started', {
      intervalMs: cleanupIntervalMs,
    });
  }
}

/**
 * Redis-based Replay Protection Service (Production Implementation)
 * 
 * Use this implementation in production for distributed deployments.
 * Requires Redis client.
 */
export class RedisReplayProtectionService implements IReplayProtectionService {
  private readonly redis: any; // Redis client type
  private readonly ttlSeconds: number;
  private readonly keyPrefix: string;

  constructor(redis: any, ttlSeconds: number = 900, keyPrefix: string = 'replay:') {
    this.redis = redis;
    this.ttlSeconds = ttlSeconds;
    this.keyPrefix = keyPrefix;

    logger.info('Redis replay protection service initialized', {
      ttlSeconds,
      keyPrefix,
    });
  }

  async consume(principal: ServicePrincipal): Promise<void> {
    const { serviceId, jti, expiresAt } = principal;
    const key = this.buildKey(serviceId, jti);

    // Use SET NX (set if not exists) with expiration
    // This is atomic - only succeeds if key doesn't exist
    const result = await this.redis.set(
      key,
      JSON.stringify({
        serviceId,
        jti,
        consumedAt: new Date().toISOString(),
      }),
      'NX', // Only set if not exists
      'EX', // Set expiration
      this.ttlSeconds
    );

    if (result === null) {
      // Key already exists - replay detected
      const previousData = await this.redis.get(key);
      const parsed = previousData ? JSON.parse(previousData) : {};

      logger.warn('JWT replay detected (Redis)', {
        serviceId,
        jti,
        previousUseAt: parsed.consumedAt,
      });

      throw new ReplayDetectedError(
        `JWT has been used before at ${parsed.consumedAt}`,
        jti,
        new Date(parsed.consumedAt)
      );
    }

    logger.debug('JWT consumed successfully (Redis)', {
      serviceId,
      jti,
      expiresAt,
    });
  }

  async isReplayed(serviceId: ServiceId, jti: string): Promise<ReplayCheckResult> {
    const key = this.buildKey(serviceId, jti);
    const exists = await this.redis.exists(key);

    if (!exists) {
      return {
        isReplay: false,
      };
    }

    const data = await this.redis.get(key);
    const parsed = data ? JSON.parse(data) : {};

    return {
      isReplay: true,
      previousUseAt: new Date(parsed.consumedAt),
    };
  }

  async record(serviceId: ServiceId, jti: string, expiresAt: Date): Promise<void> {
    const key = this.buildKey(serviceId, jti);

    await this.redis.set(
      key,
      JSON.stringify({
        serviceId,
        jti,
        consumedAt: new Date().toISOString(),
      }),
      'EX',
      this.ttlSeconds
    );

    logger.debug('JWT recorded in replay cache (Redis)', {
      serviceId,
      jti,
      expiresAt,
    });
  }

  private buildKey(serviceId: ServiceId, jti: string): string {
    return `${this.keyPrefix}${serviceId}:${jti}`;
  }
}

/**
 * Factory function for creating ReplayProtectionService
 */
export function createReplayProtectionService(
  ttlSeconds?: number,
  redis?: any
): IReplayProtectionService {
  if (redis) {
    return new RedisReplayProtectionService(redis, ttlSeconds);
  }

  return new ReplayProtectionService(ttlSeconds);
}
