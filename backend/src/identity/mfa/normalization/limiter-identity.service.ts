/**
 * Limiter Identity Service
 * 
 * Generates consistent, secure identifiers for rate limiting.
 * 
 * SECURITY:
 * - Uses HMAC to prevent PII exposure in Redis
 * - Makes identifiers non-reversible
 * - Consistent hashing prevents enumeration
 * - Phone numbers have limited search space, so HMAC protects against rainbow tables
 */

import { createHmac } from 'crypto';
import { PhoneNormalizer } from './phone-normalizer.js';
import { IpResolver } from './ip-resolver.js';

export interface LimiterIdentityConfig {
  /** Secret key for HMAC (should be different from other app secrets) */
  hmacSecret: string;
}

export class LimiterIdentityService {
  private readonly phoneNormalizer: PhoneNormalizer;

  constructor(
    private readonly config: LimiterIdentityConfig,
    private readonly ipResolver: IpResolver
  ) {
    this.phoneNormalizer = new PhoneNormalizer();

    if (!config.hmacSecret || config.hmacSecret.length < 32) {
      throw new Error('HMAC secret must be at least 32 characters');
    }
  }

  /**
   * Generate rate limiter key for generation operations
   */
  generateGenerationKey(
    dimension: 'user' | 'phone' | 'phone-daily' | 'email' | 'email-daily' | 'ip' | 'tenant-ip' | 'device' | 'session',
    tenantId: string,
    userId?: string,
    destination?: string,
    ip?: string,
    deviceId?: string,
    sessionId?: string
  ): string {
    const prefix = 'mfa:gen';

    switch (dimension) {
      case 'user':
        if (!userId) throw new Error('userId required for user dimension');
        return `${prefix}:user:${this.hashTenantUser(tenantId, userId)}:15m`;

      case 'phone':
        if (!destination) throw new Error('destination required for phone dimension');
        return `${prefix}:phone:${this.hashDestination(destination)}:15m`;

      case 'phone-daily':
        if (!destination) throw new Error('destination required for phone-daily dimension');
        return `${prefix}:phone:${this.hashDestination(destination)}:1d`;

      case 'email':
        if (!destination) throw new Error('destination required for email dimension');
        return `${prefix}:email:${this.hashDestination(destination)}:15m`;

      case 'email-daily':
        if (!destination) throw new Error('destination required for email-daily dimension');
        return `${prefix}:email:${this.hashDestination(destination)}:1d`;

      case 'ip':
        if (!ip) throw new Error('ip required for ip dimension');
        return `${prefix}:ip:${this.hashIp(ip)}:15m`;

      case 'tenant-ip':
        if (!ip) throw new Error('ip required for tenant-ip dimension');
        return `${prefix}:tenant-ip:${this.hashTenantIp(tenantId, ip)}:15m`;

      case 'device':
        if (!deviceId) throw new Error('deviceId required for device dimension');
        return `${prefix}:device:${this.hashDevice(deviceId)}:30m`;

      case 'session':
        if (!sessionId) throw new Error('sessionId required for session dimension');
        return `${prefix}:session:${this.hashSession(sessionId)}:15m`;

      default:
        throw new Error(`Unknown dimension: ${dimension}`);
    }
  }

  /**
   * Generate rate limiter key for verification operations
   */
  generateVerificationKey(
    dimension: 'challenge' | 'user' | 'ip' | 'session',
    tenantId: string,
    challengeId?: string,
    userId?: string,
    ip?: string,
    sessionId?: string
  ): string {
    const prefix = 'mfa:verify';

    switch (dimension) {
      case 'challenge':
        if (!challengeId) throw new Error('challengeId required for challenge dimension');
        // Challenge ID is already a UUID, no need to hash
        return `${prefix}:challenge:${challengeId}`;

      case 'user':
        if (!userId) throw new Error('userId required for user dimension');
        return `${prefix}:user:${this.hashTenantUser(tenantId, userId)}:30m`;

      case 'ip':
        if (!ip) throw new Error('ip required for ip dimension');
        return `${prefix}:ip:${this.hashIp(ip)}:30m`;

      case 'session':
        if (!sessionId) throw new Error('sessionId required for session dimension');
        return `${prefix}:session:${this.hashSession(sessionId)}:30m`;

      default:
        throw new Error(`Unknown dimension: ${dimension}`);
    }
  }

  /**
   * Generate lockout key
   */
  generateLockoutKey(
    type: 'user' | 'phone' | 'ip' | 'device',
    tenantId: string,
    identifier: string
  ): string {
    const prefix = 'mfa:lock';

    switch (type) {
      case 'user':
        return `${prefix}:user:${this.hashTenantUser(tenantId, identifier)}`;

      case 'phone':
        return `${prefix}:phone:${this.hashDestination(identifier)}`;

      case 'ip':
        return `${prefix}:ip:${this.hashIp(identifier)}`;

      case 'device':
        return `${prefix}:device:${this.hashDevice(identifier)}`;

      default:
        throw new Error(`Unknown lockout type: ${type}`);
    }
  }

  /**
   * Generate resend cooldown key
   */
  generateResendCooldownKey(
    tenantId: string,
    userId: string,
    method: 'SMS' | 'EMAIL'
  ): string {
    return `mfa:resend:${this.hashTenantUser(tenantId, userId)}:${method.toLowerCase()}`;
  }

  /**
   * Hash tenant + user ID
   */
  private hashTenantUser(tenantId: string, userId: string): string {
    return this.hmac(`tenant:${tenantId}:user:${userId}`);
  }

  /**
   * Hash destination (phone or email)
   */
  hashDestination(destination: string): string {
    // Normalize phone numbers before hashing
    if (destination.match(/^\+?\d+$/)) {
      const normalized = this.phoneNormalizer.normalize(destination);
      if (normalized) {
        return this.hmac(`phone:${normalized}`);
      }
    }

    // Email - normalize to lowercase
    if (destination.includes('@')) {
      return this.hmac(`email:${destination.toLowerCase().trim()}`);
    }

    // Fallback - hash as-is
    return this.hmac(`destination:${destination}`);
  }

  /**
   * Hash IP address
   */
  private hashIp(ip: string): string {
    const normalized = this.ipResolver.normalizeIp(ip);
    return this.hmac(`ip:${normalized}`);
  }

  /**
   * Hash tenant + IP
   */
  private hashTenantIp(tenantId: string, ip: string): string {
    const normalized = this.ipResolver.normalizeIp(ip);
    return this.hmac(`tenant:${tenantId}:ip:${normalized}`);
  }

  /**
   * Hash device ID
   */
  private hashDevice(deviceId: string): string {
    return this.hmac(`device:${deviceId}`);
  }

  /**
   * Hash session ID
   */
  private hashSession(sessionId: string): string {
    return this.hmac(`session:${sessionId}`);
  }

  /**
   * HMAC-SHA256 hash
   */
  private hmac(data: string): string {
    return createHmac('sha256', this.config.hmacSecret)
      .update(data)
      .digest('hex');
  }

  /**
   * Normalize phone number (exposed for other services)
   */
  normalizePhone(phone: string): string | null {
    return this.phoneNormalizer.normalize(phone);
  }

  /**
   * Normalize IP (exposed for other services)
   */
  normalizeIp(ip: string): string {
    return this.ipResolver.normalizeIp(ip);
  }

  /**
   * Mask phone for logging
   */
  maskPhone(phone: string): string {
    return this.phoneNormalizer.mask(phone);
  }

  /**
   * Mask IP for logging
   */
  maskIp(ip: string): string {
    return this.ipResolver.mask(ip);
  }
}
