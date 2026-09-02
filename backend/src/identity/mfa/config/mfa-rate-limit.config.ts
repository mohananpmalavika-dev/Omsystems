/**
 * MFA Rate Limiting Configuration
 * 
 * Centralized configuration for MFA abuse protection.
 * Loads from environment variables with sensible defaults.
 */

import { MfaRateLimitPolicy } from '../abuse/mfa-rate-limit.types.js';

export interface MfaRateLimitConfig {
  /** Redis connection URL */
  redisUrl: string;
  
  /** HMAC secret for hashing identifiers (min 32 chars) */
  hmacSecret: string;
  
  /** Trusted proxy IPs for X-Forwarded-For resolution */
  trustedProxies: string[];
  
  /** Rate limit policy overrides */
  policy?: Partial<MfaRateLimitPolicy>;
  
  /** Whether to require Redis (fail closed if unavailable) */
  requireRedis?: boolean;
  
  /** Whether to fail closed on errors */
  failClosed?: boolean;
}

/**
 * Load MFA rate limiting configuration from environment
 */
export function loadMfaRateLimitConfig(): MfaRateLimitConfig {
  // Redis configuration
  const rawRedisUrl = process.env.MFA_REDIS_URL || process.env.REDIS_URL;
  if (!rawRedisUrl && process.env.NODE_ENV === 'production') {
    throw new Error('MFA_REDIS_URL or REDIS_URL is required in production');
  }
  const redisUrl = rawRedisUrl || 'redis://localhost:6379';

  
  // HMAC secret for identifier hashing
  const hmacSecret = process.env.MFA_HMAC_SECRET || process.env.RATE_LIMIT_SECRET;
  if (!hmacSecret || hmacSecret.length < 32) {
    throw new Error(
      'MFA_HMAC_SECRET environment variable must be set and at least 32 characters. ' +
      'Generate with: openssl rand -hex 32'
    );
  }
  
  // Trusted proxies for IP resolution
  const trustedProxies = process.env.TRUSTED_PROXIES
    ? process.env.TRUSTED_PROXIES.split(',').map(ip => ip.trim())
    : ['127.0.0.1', '::1']; // Default to localhost only
  
  // Optional policy overrides
  const policy = loadPolicyOverrides();
  
  // Operational flags
  const requireRedis = process.env.MFA_REQUIRE_REDIS === 'true';
  const failClosed = process.env.MFA_FAIL_CLOSED !== 'false'; // Default true
  
  return {
    redisUrl,
    hmacSecret,
    trustedProxies,
    policy,
    requireRedis,
    failClosed,
  };
}

/**
 * Load policy overrides from environment
 */
function loadPolicyOverrides(): Partial<MfaRateLimitPolicy> | undefined {
  const overrides: any = {};
  let hasOverrides = false;
  
  // Generation limits
  if (process.env.MFA_LIMIT_USER_GENERATION) {
    overrides.generation = overrides.generation || {};
    overrides.generation.user = {
      limit: parseInt(process.env.MFA_LIMIT_USER_GENERATION, 10),
      windowSeconds: 15 * 60,
    };
    hasOverrides = true;
  }
  
  if (process.env.MFA_LIMIT_PHONE_GENERATION) {
    overrides.generation = overrides.generation || {};
    overrides.generation.phone = {
      limit: parseInt(process.env.MFA_LIMIT_PHONE_GENERATION, 10),
      windowSeconds: 15 * 60,
    };
    hasOverrides = true;
  }
  
  if (process.env.MFA_LIMIT_PHONE_DAILY) {
    overrides.generation = overrides.generation || {};
    overrides.generation.phoneDaily = {
      limit: parseInt(process.env.MFA_LIMIT_PHONE_DAILY, 10),
      windowSeconds: 24 * 60 * 60,
    };
    hasOverrides = true;
  }
  
  if (process.env.MFA_LIMIT_IP_GENERATION) {
    overrides.generation = overrides.generation || {};
    overrides.generation.ip = {
      limit: parseInt(process.env.MFA_LIMIT_IP_GENERATION, 10),
      windowSeconds: 15 * 60,
    };
    hasOverrides = true;
  }
  
  // Verification limits
  if (process.env.MFA_LIMIT_USER_VERIFICATION) {
    overrides.verification = overrides.verification || {};
    overrides.verification.user = {
      limit: parseInt(process.env.MFA_LIMIT_USER_VERIFICATION, 10),
      windowSeconds: 30 * 60,
      sliding: true,
    };
    hasOverrides = true;
  }
  
  if (process.env.MFA_LIMIT_CHALLENGE_ATTEMPTS) {
    overrides.verification = overrides.verification || {};
    overrides.verification.perChallenge = parseInt(process.env.MFA_LIMIT_CHALLENGE_ATTEMPTS, 10);
    hasOverrides = true;
  }
  
  // Lockout settings
  if (process.env.MFA_LOCKOUT_ACCOUNT_THRESHOLD) {
    overrides.lockout = overrides.lockout || {};
    overrides.lockout.accountLockThreshold = parseInt(process.env.MFA_LOCKOUT_ACCOUNT_THRESHOLD, 10);
    hasOverrides = true;
  }
  
  if (process.env.MFA_LOCKOUT_ACCOUNT_DURATION) {
    overrides.lockout = overrides.lockout || {};
    overrides.lockout.accountLockSeconds = parseInt(process.env.MFA_LOCKOUT_ACCOUNT_DURATION, 10);
    hasOverrides = true;
  }
  
  // Resend cooldown
  if (process.env.MFA_RESEND_COOLDOWN) {
    overrides.generation = overrides.generation || {};
    overrides.generation.resendCooldownSeconds = parseInt(process.env.MFA_RESEND_COOLDOWN, 10);
    hasOverrides = true;
  }
  
  return hasOverrides ? overrides : undefined;
}

/**
 * Validate configuration
 */
export function validateMfaRateLimitConfig(config: MfaRateLimitConfig): void {
  if (!config.redisUrl) {
    throw new Error('Redis URL is required for MFA rate limiting');
  }
  
  if (!config.hmacSecret || config.hmacSecret.length < 32) {
    throw new Error('HMAC secret must be at least 32 characters');
  }
  
  if (!config.trustedProxies || config.trustedProxies.length === 0) {
    throw new Error('At least one trusted proxy must be configured');
  }
  
  // Validate policy overrides if present
  if (config.policy) {
    if (config.policy.verification?.perChallenge) {
      if (config.policy.verification.perChallenge < 3 || config.policy.verification.perChallenge > 10) {
        throw new Error('Challenge attempts must be between 3 and 10');
      }
    }
    
    if (config.policy.generation?.user?.limit) {
      if (config.policy.generation.user.limit < 1 || config.policy.generation.user.limit > 20) {
        throw new Error('User generation limit must be between 1 and 20');
      }
    }
  }
}

/**
 * Get environment-specific configuration
 */
export function getMfaRateLimitConfigForEnv(env: 'development' | 'test' | 'production'): Partial<MfaRateLimitConfig> {
  switch (env) {
    case 'development':
      return {
        requireRedis: false, // Degrade gracefully in dev
        failClosed: false, // Fail open in dev
        trustedProxies: ['127.0.0.1', '::1', '10.0.0.0/8'], // Local dev IPs
      };
      
    case 'test':
      return {
        requireRedis: false, // Use mock in tests
        failClosed: false,
        trustedProxies: ['127.0.0.1'],
      };
      
    case 'production':
      return {
        requireRedis: true, // Require Redis in prod
        failClosed: true, // Fail closed for security
        // trustedProxies must be explicitly configured
      };
      
    default:
      return {};
  }
}
