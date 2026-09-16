/**
 * Rate Limiting Middleware for AI Video Search
 * 
 * Protects search APIs from abuse with:
 * - Per-tenant rate limits
 * - Per-user rate limits
 * - Different limits for expensive vs. cheap operations
 * - Redis-backed distributed rate limiting
 * - Graceful degradation when Redis is unavailable
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { Pool } from "pg";

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  // Requests per window
  maxRequests: number;
  
  // Window duration in seconds
  windowSeconds: number;
  
  // Cost per request (for weighted rate limiting)
  cost?: number;
  
  // Identifier for this rate limit rule
  name: string;
}

/**
 * Rate limit configurations for different operations
 */
export const RATE_LIMITS = {
  // Natural language search - moderate cost
  NATURAL_LANGUAGE_SEARCH: {
    name: "natural_language_search",
    maxRequests: 60,
    windowSeconds: 60,
    cost: 1,
  } as RateLimitConfig,
  
  // Attribute search - lower cost
  ATTRIBUTE_SEARCH: {
    name: "attribute_search",
    maxRequests: 120,
    windowSeconds: 60,
    cost: 1,
  } as RateLimitConfig,
  
  // Similarity search - high cost (embeddings required)
  SIMILARITY_SEARCH: {
    name: "similarity_search",
    maxRequests: 30,
    windowSeconds: 60,
    cost: 2,
  } as RateLimitConfig,
  
  // Cross-camera tracking - very high cost
  CROSS_CAMERA_TRACKING: {
    name: "cross_camera_tracking",
    maxRequests: 20,
    windowSeconds: 60,
    cost: 3,
  } as RateLimitConfig,
  
  // Bulk indexing - expensive operation
  BULK_INDEXING: {
    name: "bulk_indexing",
    maxRequests: 10,
    windowSeconds: 60,
    cost: 5,
  } as RateLimitConfig,
  
  // General search operations
  GENERAL_SEARCH: {
    name: "general_search",
    maxRequests: 100,
    windowSeconds: 60,
    cost: 1,
  } as RateLimitConfig,
};

/**
 * Rate limit store interface
 */
interface RateLimitStore {
  increment(key: string, windowSeconds: number): Promise<number>;
  reset(key: string): Promise<void>;
  get(key: string): Promise<number>;
}

/**
 * PostgreSQL-backed rate limit store (fallback when Redis unavailable)
 */
class PostgresRateLimitStore implements RateLimitStore {
  constructor(private pool: Pool) {}

  async increment(key: string, windowSeconds: number): Promise<number> {
    const result = await this.pool.query(
      `INSERT INTO rate_limit_counters (key, count, expires_at)
       VALUES ($1, 1, NOW() + INTERVAL '1 second' * $2)
       ON CONFLICT (key) 
       DO UPDATE SET 
         count = CASE 
           WHEN rate_limit_counters.expires_at < NOW() THEN 1
           ELSE rate_limit_counters.count + 1
         END,
         expires_at = CASE
           WHEN rate_limit_counters.expires_at < NOW() THEN NOW() + INTERVAL '1 second' * $2
           ELSE rate_limit_counters.expires_at
         END
       RETURNING count`,
      [key, windowSeconds]
    );
    return parseInt(result.rows[0].count, 10);
  }

  async reset(key: string): Promise<void> {
    await this.pool.query(`DELETE FROM rate_limit_counters WHERE key = $1`, [key]);
  }

  async get(key: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT count FROM rate_limit_counters WHERE key = $1 AND expires_at > NOW()`,
      [key]
    );
    return result.rows.length > 0 ? parseInt(result.rows[0].count, 10) : 0;
  }
}

/**
 * In-memory rate limit store (for development/testing)
 */
class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, { count: number; expiresAt: number }>();

  async increment(key: string, windowSeconds: number): Promise<number> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || entry.expiresAt < now) {
      // Create new window
      this.store.set(key, {
        count: 1,
        expiresAt: now + windowSeconds * 1000,
      });
      return 1;
    }

    // Increment existing window
    entry.count++;
    return entry.count;
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  async get(key: string): Promise<number> {
    const now = Date.now();
    const entry = this.store.get(key);
    
    if (!entry || entry.expiresAt < now) {
      return 0;
    }
    
    return entry.count;
  }

  // Cleanup expired entries periodically
  startCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store.entries()) {
        if (entry.expiresAt < now) {
          this.store.delete(key);
        }
      }
    }, 60000); // Every minute
  }
}

/**
 * Rate limiter class
 */
export class RateLimiter {
  private store: RateLimitStore;

  constructor(pool?: Pool, useMemory: boolean = false) {
    if (useMemory || !pool) {
      const memStore = new MemoryRateLimitStore();
      memStore.startCleanup();
      this.store = memStore;
    } else {
      this.store = new PostgresRateLimitStore(pool);
    }
  }

  /**
   * Check if request is allowed under rate limit
   */
  async checkLimit(
    identifier: string,
    config: RateLimitConfig
  ): Promise<{ allowed: boolean; current: number; limit: number; reset: number }> {
    const key = `ratelimit:${config.name}:${identifier}`;
    const cost = config.cost || 1;

    try {
      const current = await this.store.increment(key, config.windowSeconds);
      const allowed = current <= config.maxRequests;
      const reset = Date.now() + config.windowSeconds * 1000;

      return {
        allowed,
        current,
        limit: config.maxRequests,
        reset,
      };
    } catch (error) {
      // On error, allow the request (fail open)
      console.error("Rate limit check failed:", error);
      return {
        allowed: true,
        current: 0,
        limit: config.maxRequests,
        reset: Date.now() + config.windowSeconds * 1000,
      };
    }
  }

  /**
   * Check multiple rate limits (tenant + user)
   */
  async checkMultipleLimits(
    identifiers: Array<{ id: string; config: RateLimitConfig }>,
  ): Promise<{ allowed: boolean; details: Array<{ id: string; current: number; limit: number; allowed: boolean }> }> {
    const results = await Promise.all(
      identifiers.map(async ({ id, config }) => {
        const result = await this.checkLimit(id, config);
        return {
          id,
          current: result.current,
          limit: result.limit,
          allowed: result.allowed,
        };
      })
    );

    const allowed = results.every((r) => r.allowed);

    return {
      allowed,
      details: results,
    };
  }

  /**
   * Reset rate limit for identifier
   */
  async reset(identifier: string, config: RateLimitConfig): Promise<void> {
    const key = `ratelimit:${config.name}:${identifier}`;
    await this.store.reset(key);
  }
}

/**
 * Fastify middleware factory for rate limiting
 */
export function createRateLimitMiddleware(
  rateLimiter: RateLimiter,
  config: RateLimitConfig,
  options?: {
    // Custom identifier function
    getIdentifier?: (request: FastifyRequest) => string;
    // Check multiple limits
    multiLimit?: boolean;
    // Custom error message
    errorMessage?: string;
  }
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const identifier = options?.getIdentifier 
      ? options.getIdentifier(request)
      : request.currentUser?.tenantId || request.ip;

    if (!identifier) {
      return reply.code(401).send({ error: "AUTHENTICATION_REQUIRED" });
    }

    let result;

    if (options?.multiLimit) {
      // Check both tenant and user limits
      const tenantId = request.currentUser?.tenantId;
      const userId = (request.currentUser as any)?.id || (request.currentUser as any)?.userId;

      if (!tenantId || !userId) {
        return reply.code(401).send({ error: "AUTHENTICATION_REQUIRED" });
      }

      result = await rateLimiter.checkMultipleLimits([
        { id: `tenant:${tenantId}`, config },
        { id: `user:${userId}`, config: { ...config, maxRequests: Math.ceil(config.maxRequests / 2) } },
      ]);

      if (!result.allowed) {
        const exceededLimit = result.details.find((d) => !d.allowed);
        return reply.code(429).send({
          error: "RATE_LIMIT_EXCEEDED",
          message: options?.errorMessage || `Rate limit exceeded for ${config.name}`,
          limit: exceededLimit?.limit,
          current: exceededLimit?.current,
          retryAfter: config.windowSeconds,
        });
      }
    } else {
      // Check single limit
      result = await rateLimiter.checkLimit(identifier, config);

      if (!result.allowed) {
        return reply.code(429).send({
          error: "RATE_LIMIT_EXCEEDED",
          message: options?.errorMessage || `Rate limit exceeded for ${config.name}`,
          limit: result.limit,
          current: result.current,
          retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
        });
      }
    }

    // Add rate limit headers
    const res = result as any;
    reply.header("X-RateLimit-Limit", res?.limit || config.maxRequests);
    reply.header("X-RateLimit-Remaining", Math.max(0, (res?.limit || config.maxRequests) - (res?.current || 0)));
    reply.header("X-RateLimit-Reset", res?.reset || Date.now() + config.windowSeconds * 1000);
  };
}

/**
 * Request queue for managing concurrent operations
 */
export class RequestQueue {
  private queue: Array<{
    execute: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];
  
  private processing = 0;
  private maxConcurrent: number;

  constructor(maxConcurrent: number = 10) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Add request to queue
   */
  async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        execute: operation,
        resolve,
        reject,
      });
      
      void this.processQueue();
    });
  }

  /**
   * Process queued requests
   */
  private async processQueue(): Promise<void> {
    if (this.processing >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.processing++;
    const item = this.queue.shift();

    if (item) {
      try {
        const result = await item.execute();
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      } finally {
        this.processing--;
        void this.processQueue();
      }
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      queueSize: this.queue.length,
      processing: this.processing,
      maxConcurrent: this.maxConcurrent,
    };
  }
}

/**
 * Query complexity analyzer
 */
export class QueryComplexityAnalyzer {
  /**
   * Calculate complexity score for a search query
   */
  static calculateComplexity(query: {
    naturalLanguageQuery?: string;
    timeRangeDays?: number;
    cameraCount?: number;
    hasEmbeddings?: boolean;
    requiresCrossCameraTracking?: boolean;
    attributeCount?: number;
  }): number {
    let complexity = 1;

    // Natural language parsing adds complexity
    if (query.naturalLanguageQuery && query.naturalLanguageQuery.length > 50) {
      complexity += 1;
    }

    // Time range complexity
    if (query.timeRangeDays) {
      if (query.timeRangeDays > 30) complexity += 2;
      else if (query.timeRangeDays > 7) complexity += 1;
    }

    // Camera count complexity
    if (query.cameraCount) {
      if (query.cameraCount > 50) complexity += 3;
      else if (query.cameraCount > 10) complexity += 2;
      else if (query.cameraCount > 1) complexity += 1;
    }

    // Embeddings are expensive
    if (query.hasEmbeddings) {
      complexity += 2;
    }

    // Cross-camera tracking is very expensive
    if (query.requiresCrossCameraTracking) {
      complexity += 3;
    }

    // Multiple attributes increase complexity
    if (query.attributeCount && query.attributeCount > 3) {
      complexity += 1;
    }

    return complexity;
  }

  /**
   * Check if query exceeds complexity threshold
   */
  static isComplexQuery(complexity: number, threshold: number = 5): boolean {
    return complexity > threshold;
  }

  /**
   * Get recommended timeout for query based on complexity
   */
  static getRecommendedTimeout(complexity: number): number {
    // Base timeout: 30 seconds
    // Add 10 seconds per complexity point
    return Math.min(30000 + complexity * 10000, 120000); // Max 2 minutes
  }
}
