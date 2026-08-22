/**
 * MFA Rate Limiter Service
 * 
 * Prevents abuse of MFA operations with granular rate limits:
 * - Per user (prevent credential stuffing)
 * - Per destination (prevent enumeration/harassment)
 * - Per IP address (prevent distributed attacks)
 * - Per tenant (prevent resource exhaustion)
 * 
 * Uses mfa_rate_limits table with sliding window counters.
 */

import { Pool, PoolClient } from 'pg';
import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

export type RateLimitType = 'user' | 'destination' | 'ip_address' | 'tenant';
export type RateLimitOperation = 'send' | 'verify' | 'resend';

export interface RateLimitConfig {
  /** Maximum attempts within window */
  maxAttempts: number;

  /** Window duration in seconds */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds?: number;
}

/**
 * Default rate limit configurations
 */
const DEFAULT_LIMITS: Record<RateLimitOperation, Record<RateLimitType, RateLimitConfig>> = {
  send: {
    user: { maxAttempts: 5, windowSeconds: 600 }, // 5 per 10 min per user
    destination: { maxAttempts: 10, windowSeconds: 3600 }, // 10 per hour per phone
    ip_address: { maxAttempts: 20, windowSeconds: 3600 }, // 20 per hour per IP
    tenant: { maxAttempts: 1000, windowSeconds: 3600 }, // 1000 per hour per tenant
  },
  verify: {
    user: { maxAttempts: 10, windowSeconds: 600 }, // 10 per 10 min per user
    destination: { maxAttempts: 20, windowSeconds: 3600 }, // 20 per hour per phone
    ip_address: { maxAttempts: 50, windowSeconds: 3600 }, // 50 per hour per IP
    tenant: { maxAttempts: 5000, windowSeconds: 3600 }, // 5000 per hour per tenant
  },
  resend: {
    user: { maxAttempts: 3, windowSeconds: 600 }, // 3 per 10 min per user
    destination: { maxAttempts: 5, windowSeconds: 3600 }, // 5 per hour per phone
    ip_address: { maxAttempts: 10, windowSeconds: 3600 }, // 10 per hour per IP
    tenant: { maxAttempts: 500, windowSeconds: 3600 }, // 500 per hour per tenant
  },
};

export class MfaRateLimiterService {
  constructor(
    private readonly pool: Pool,
    private readonly customLimits?: Partial<typeof DEFAULT_LIMITS>
  ) {}

  /**
   * Check rate limit for user operation
   */
  async checkUserLimit(
    userId: string,
    operation: RateLimitOperation
  ): Promise<RateLimitResult> {
    return this.checkLimit('user', userId, operation);
  }

  /**
   * Check rate limit for destination (phone/email)
   */
  async checkDestinationLimit(
    destination: string,
    operation: RateLimitOperation
  ): Promise<RateLimitResult> {
    // Hash destination to avoid storing PII
    const destinationHash = this.hashKey(destination);
    return this.checkLimit('destination', destinationHash, operation);
  }

  /**
   * Check rate limit for IP address
   */
  async checkIpLimit(
    ipAddress: string,
    operation: RateLimitOperation
  ): Promise<RateLimitResult> {
    // Hash IP for privacy
    const ipHash = this.hashKey(ipAddress);
    return this.checkLimit('ip_address', ipHash, operation);
  }

  /**
   * Check rate limit for tenant
   */
  async checkTenantLimit(
    tenantId: string,
    operation: RateLimitOperation
  ): Promise<RateLimitResult> {
    return this.checkLimit('tenant', tenantId, operation);
  }

  /**
   * Check all rate limits for an operation
   * Returns first violation or success if all pass
   */
  async checkAllLimits(params: {
    userId?: string;
    destination?: string;
    ipAddress?: string;
    tenantId?: string;
    operation: RateLimitOperation;
  }): Promise<RateLimitResult> {
    const checks: Promise<RateLimitResult>[] = [];

    if (params.userId) {
      checks.push(this.checkUserLimit(params.userId, params.operation));
    }

    if (params.destination) {
      checks.push(this.checkDestinationLimit(params.destination, params.operation));
    }

    if (params.ipAddress) {
      checks.push(this.checkIpLimit(params.ipAddress, params.operation));
    }

    if (params.tenantId) {
      checks.push(this.checkTenantLimit(params.tenantId, params.operation));
    }

    const results = await Promise.all(checks);

    // Return first violation
    const violation = results.find(r => !r.allowed);
    if (violation) {
      return violation;
    }

    // All passed - return the most restrictive remaining count
    const minRemaining = Math.min(...results.map(r => r.remaining));
    const maxResetAt = new Date(Math.max(...results.map(r => r.resetAt.getTime())));

    return {
      allowed: true,
      remaining: minRemaining,
      resetAt: maxResetAt,
    };
  }

  /**
   * Core rate limit check
   */
  private async checkLimit(
    limitType: RateLimitType,
    limitKey: string,
    operation: RateLimitOperation
  ): Promise<RateLimitResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get rate limit config
      const config = this.getConfig(operation, limitType);
      const windowStart = new Date(Date.now() - config.windowSeconds * 1000);
      const expiresAt = new Date(Date.now() + config.windowSeconds * 1000);

      // Check existing rate limit record
      const existing = await client.query(
        `SELECT attempt_count, window_start, expires_at
         FROM mfa_rate_limits
         WHERE limit_type = $1
           AND limit_key = $2
           AND operation = $3
           AND expires_at > NOW()
         FOR UPDATE`,
        [limitType, limitKey, operation]
      );

      let attemptCount = 0;
      let resetAt = expiresAt;

      if (existing.rows.length > 0) {
        const record = existing.rows[0];
        attemptCount = record.attempt_count;
        resetAt = new Date(record.expires_at);

        // Check if we're still within the window
        if (attemptCount >= config.maxAttempts) {
          await client.query('COMMIT');

          const retryAfterSeconds = Math.ceil(
            (resetAt.getTime() - Date.now()) / 1000
          );

          logger.warn('Rate limit exceeded', {
            limitType,
            operation,
            attemptCount,
            maxAttempts: config.maxAttempts,
            retryAfterSeconds,
          });

          return {
            allowed: false,
            remaining: 0,
            resetAt,
            retryAfterSeconds,
          };
        }

        // Increment counter
        await client.query(
          `UPDATE mfa_rate_limits
           SET attempt_count = attempt_count + 1
           WHERE limit_type = $1
             AND limit_key = $2
             AND operation = $3
             AND expires_at > NOW()`,
          [limitType, limitKey, operation]
        );

        attemptCount += 1;
      } else {
        // Create new rate limit record
        await client.query(
          `INSERT INTO mfa_rate_limits (
            limit_type, limit_key, operation,
            attempt_count, window_start, window_duration_seconds,
            expires_at
          ) VALUES ($1, $2, $3, 1, $4, $5, $6)`,
          [
            limitType,
            limitKey,
            operation,
            windowStart,
            config.windowSeconds,
            expiresAt,
          ]
        );

        attemptCount = 1;
      }

      await client.query('COMMIT');

      const remaining = Math.max(0, config.maxAttempts - attemptCount);

      return {
        allowed: true,
        remaining,
        resetAt,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Rate limit check failed', { limitType, operation, error });

      // Fail open on error (allow the operation)
      return {
        allowed: true,
        remaining: 1,
        resetAt: new Date(Date.now() + 600000), // 10 min
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get rate limit configuration
   */
  private getConfig(
    operation: RateLimitOperation,
    limitType: RateLimitType
  ): RateLimitConfig {
    if (this.customLimits?.[operation]?.[limitType]) {
      return this.customLimits[operation]![limitType]!;
    }

    return DEFAULT_LIMITS[operation][limitType];
  }

  /**
   * Hash key for privacy (destinations, IPs)
   */
  private hashKey(key: string): string {
    return crypto
      .createHash('sha256')
      .update(key.toLowerCase().trim())
      .digest('hex');
  }

  /**
   * Clean up expired rate limit records
   */
  async cleanupExpired(): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM mfa_rate_limits WHERE expires_at < NOW()`
    );

    const deletedCount = result.rowCount || 0;

    if (deletedCount > 0) {
      logger.info('Cleaned up expired rate limit records', {
        count: deletedCount,
      });
    }

    return deletedCount;
  }

  /**
   * Reset rate limits for a specific key (admin operation)
   */
  async resetLimits(
    limitType: RateLimitType,
    limitKey: string,
    operation?: RateLimitOperation
  ): Promise<void> {
    if (operation) {
      await this.pool.query(
        `DELETE FROM mfa_rate_limits
         WHERE limit_type = $1 AND limit_key = $2 AND operation = $3`,
        [limitType, limitKey, operation]
      );
    } else {
      await this.pool.query(
        `DELETE FROM mfa_rate_limits
         WHERE limit_type = $1 AND limit_key = $2`,
        [limitType, limitKey]
      );
    }

    logger.info('Rate limits reset', { limitType, operation });
  }

  /**
   * Get current rate limit status for diagnostics
   */
  async getStatus(
    limitType: RateLimitType,
    limitKey: string,
    operation: RateLimitOperation
  ): Promise<{
    attemptCount: number;
    maxAttempts: number;
    windowSeconds: number;
    expiresAt: Date;
  } | null> {
    const result = await this.pool.query(
      `SELECT attempt_count, window_duration_seconds, expires_at
       FROM mfa_rate_limits
       WHERE limit_type = $1
         AND limit_key = $2
         AND operation = $3
         AND expires_at > NOW()`,
      [limitType, limitKey, operation]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const record = result.rows[0];
    const config = this.getConfig(operation, limitType);

    return {
      attemptCount: record.attempt_count,
      maxAttempts: config.maxAttempts,
      windowSeconds: record.window_duration_seconds,
      expiresAt: new Date(record.expires_at),
    };
  }
}

/**
 * Utility functions for phone number masking
 */
export class PhoneMaskingUtil {
  /**
   * Mask phone number for display
   * Examples:
   *   +919876543210 → +91****3210
   *   +12025551234 → +1****1234
   */
  static maskPhone(phone: string): string {
    if (!phone || phone.length <= 6) {
      return '****';
    }

    // Remove any formatting
    const cleaned = phone.replace(/[^\d+]/g, '');

    // Keep country code (+ and first 1-3 digits) and last 4
    const countryCodeMatch = cleaned.match(/^(\+\d{1,3})/);
    const countryCode = countryCodeMatch ? countryCodeMatch[1] : cleaned.slice(0, 2);
    const lastDigits = cleaned.slice(-4);
    const maskedLength = cleaned.length - countryCode.length - 4;

    if (maskedLength <= 0) {
      return cleaned;
    }

    return `${countryCode}${'*'.repeat(maskedLength)}${lastDigits}`;
  }

  /**
   * Mask email for display
   * Examples:
   *   user@example.com → u***@example.com
   *   verylongemail@domain.org → ver***@domain.org
   */
  static maskEmail(email: string): string {
    if (!email || !email.includes('@')) {
      return '***@***.***';
    }

    const [local, domain] = email.split('@');

    if (local.length <= 3) {
      return `${local[0]}***@${domain}`;
    }

    return `${local.slice(0, 3)}***@${domain}`;
  }

  /**
   * Validate E.164 phone number format
   */
  static isValidE164(phone: string): boolean {
    return /^\+[1-9]\d{1,14}$/.test(phone);
  }

  /**
   * Normalize phone number to E.164 format (basic)
   * This is a simple implementation - production should use libphonenumber
   */
  static normalizePhone(phone: string, defaultCountryCode: string = '91'): string {
    // Remove all non-digit characters except +
    let cleaned = phone.replace(/[^\d+]/g, '');

    // If starts with +, assume already E.164
    if (cleaned.startsWith('+')) {
      return cleaned;
    }

    // If starts with 0, remove it (common in many countries)
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.slice(1);
    }

    // Add country code
    return `+${defaultCountryCode}${cleaned}`;
  }
}
