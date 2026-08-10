/**
 * Telemetry Cache
 * 
 * Provides caching for telemetry results to avoid redundant collection.
 */

import { SecurityTelemetryResult } from '../contracts/telemetry-result';

/**
 * Cache entry with expiration
 */
interface CacheEntry<T> {
  result: SecurityTelemetryResult<T>;
  expiresAt: number;
}

/**
 * Simple in-memory cache for telemetry results
 */
export class TelemetryCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  
  /**
   * Get cached result if available and not expired
   */
  get<T>(key: string): SecurityTelemetryResult<T> | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    
    if (!entry) {
      return null;
    }
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.result;
  }
  
  /**
   * Store result in cache with TTL
   */
  set<T>(key: string, result: SecurityTelemetryResult<T>, ttlMs: number): void {
    this.cache.set(key, {
      result,
      expiresAt: Date.now() + ttlMs,
    });
  }
  
  /**
   * Clear specific key
   */
  delete(key: string): void {
    this.cache.delete(key);
  }
  
  /**
   * Clear all cached data
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * Remove expired entries
   */
  prune(): void {
    const now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
  
  /**
   * Get cache statistics
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

/**
 * Create a cache key from context
 */
export function createCacheKey(
  collectorId: string,
  context: {
    tenantId: string;
    siteId?: string;
    deviceId?: string;
    recorderId?: string;
    cameraId?: string;
  }
): string {
  const parts = [
    collectorId,
    context.tenantId,
    context.siteId,
    context.deviceId,
    context.recorderId,
    context.cameraId,
  ].filter(Boolean);
  
  return parts.join(':');
}
