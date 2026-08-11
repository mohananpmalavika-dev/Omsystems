/**
 * Rate Limit Store Interface
 * 
 * Abstraction for rate limit storage backends.
 * Primary implementation uses Redis for distributed atomic counters.
 */

import { RateLimiterResult } from '../mfa-rate-limit.types.js';

/**
 * Rate limit store operations
 */
export interface IRateLimitStore {
  /**
   * Check and increment counter atomically (fixed window)
   * 
   * @param key - Unique rate limit key
   * @param limit - Maximum allowed operations
   * @param windowSeconds - Time window in seconds
   * @returns Rate limit result with current count and reset time
   */
  checkAndIncrement(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<RateLimiterResult>;

  /**
   * Check and increment counter atomically (sliding window)
   * 
   * Uses sorted sets to track individual timestamps for more accurate limiting.
   * More expensive but prevents boundary exploits.
   * 
   * @param key - Unique rate limit key
   * @param limit - Maximum allowed operations
   * @param windowSeconds - Time window in seconds
   * @returns Rate limit result with current count and reset time
   */
  checkAndIncrementSliding(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<RateLimiterResult>;

  /**
   * Get current counter value without incrementing
   * 
   * @param key - Rate limit key
   * @returns Current count and TTL information
   */
  get(key: string): Promise<{
    count: number;
    ttl: number;
    resetAt: Date;
  } | null>;

  /**
   * Set a lockout key with expiration
   * 
   * @param key - Lockout key
   * @param durationSeconds - Lock duration
   * @param metadata - Optional metadata to store
   */
  setLockout(
    key: string,
    durationSeconds: number,
    metadata?: Record<string, any>
  ): Promise<void>;

  /**
   * Check if lockout key exists
   * 
   * @param key - Lockout key
   * @returns Lockout info if exists
   */
  getLockout(key: string): Promise<{
    exists: true;
    ttl: number;
    expiresAt: Date;
    metadata?: Record<string, any>;
  } | {
    exists: false;
  }>;

  /**
   * Remove lockout key (manual unlock)
   * 
   * @param key - Lockout key
   */
  removeLockout(key: string): Promise<void>;

  /**
   * Delete a counter key
   * 
   * @param key - Rate limit key
   */
  delete(key: string): Promise<void>;

  /**
   * Reset multiple counters matching pattern
   * Used after successful verification to clear transient state
   * 
   * @param pattern - Key pattern (e.g., "mfa:verify:session:*")
   */
  deletePattern(pattern: string): Promise<number>;

  /**
   * Health check
   */
  isHealthy(): Promise<boolean>;

  /**
   * Close connections
   */
  close(): Promise<void>;
}
