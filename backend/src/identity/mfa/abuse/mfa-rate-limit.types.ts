/**
 * MFA Rate Limiting Types
 * 
 * Type definitions for MFA abuse protection and rate limiting.
 * Supports multi-dimensional throttling across user, phone, IP, device, and session.
 */

/**
 * MFA request context for rate limiting
 */
export interface MfaRequestContext {
  tenantId: string;
  userId: string;
  
  /** Normalized phone number (E.164 format) or email */
  destination?: string;
  
  /** Trusted client IP (resolved from proxy headers) */
  ip?: string;
  
  /** Server-issued device identifier */
  deviceId?: string;
  
  /** Server session identifier */
  sessionId?: string;
  
  /** Challenge ID for verification operations */
  challengeId?: string;
  
  /** Purpose of the MFA operation */
  purpose: 'LOGIN' | 'STEP_UP' | 'RECOVERY' | 'SETUP' | 'SENSITIVE_OP';
  
  /** MFA method being used */
  method: 'SMS' | 'EMAIL' | 'TOTP';
}

/**
 * Rate limit decision result
 */
export interface RateLimitDecision {
  /** Whether the operation is allowed */
  allowed: boolean;
  
  /** Reason for denial (if not allowed) */
  reason?: MfaRateLimitReason;
  
  /** Milliseconds until retry is allowed */
  retryAfterMs?: number;
  
  /** Which rate limit rules were violated */
  violatedRules: Array<{
    dimension: string;
    limit: number;
    current: number;
    remaining: number;
    resetAt: Date;
  }>;
  
  /** Escalation level if lockout applies */
  escalation?: MfaRestriction;
}

/**
 * Rate limit reason codes
 */
export type MfaRateLimitReason =
  | 'USER_GENERATION_LIMIT'
  | 'PHONE_GENERATION_LIMIT'
  | 'PHONE_DAILY_LIMIT'
  | 'EMAIL_GENERATION_LIMIT'
  | 'EMAIL_DAILY_LIMIT'
  | 'IP_GENERATION_LIMIT'
  | 'DEVICE_GENERATION_LIMIT'
  | 'SESSION_GENERATION_LIMIT'
  | 'RESEND_COOLDOWN'
  | 'USER_VERIFICATION_LIMIT'
  | 'IP_VERIFICATION_LIMIT'
  | 'CHALLENGE_LOCKED'
  | 'ACCOUNT_TEMPORARILY_LOCKED'
  | 'SECURITY_REVIEW_REQUIRED';

/**
 * MFA restriction levels (progressive escalation)
 */
export type MfaRestriction =
  | 'NONE'
  | 'CHALLENGE_LOCKED'
  | 'SHORT_COOLDOWN'
  | 'GENERATION_BLOCKED'
  | 'ACCOUNT_TEMPORARILY_LOCKED'
  | 'SECURITY_REVIEW';

/**
 * Rate limit rule configuration
 */
export interface RateLimitRule {
  /** Max number of operations allowed */
  limit: number;
  
  /** Time window in seconds */
  windowSeconds: number;
  
  /** Whether to use sliding window (vs fixed) */
  sliding?: boolean;
}

/**
 * MFA rate limit policy (configurable per tenant)
 */
export interface MfaRateLimitPolicy {
  generation: {
    /** Per user generation limits */
    user: RateLimitRule;
    
    /** Per phone number generation limits */
    phone: RateLimitRule;
    
    /** Per phone number daily limit */
    phoneDaily: RateLimitRule;
    
    /** Per email generation limits */
    email: RateLimitRule;
    
    /** Per email daily limit */
    emailDaily: RateLimitRule;
    
    /** Per IP generation limits */
    ip: RateLimitRule;
    
    /** Per tenant+IP generation limits */
    tenantIp: RateLimitRule;
    
    /** Per device generation limits */
    device: RateLimitRule;
    
    /** Per session generation limits */
    session: RateLimitRule;
    
    /** Minimum seconds between resend requests */
    resendCooldownSeconds: number;
    
    /** Progressive resend cooldown multiplier */
    resendCooldownMultiplier?: number;
  };
  
  verification: {
    /** Max verification attempts per challenge (redundant with challenge.maxAttempts) */
    perChallenge: number;
    
    /** Per user verification limits */
    user: RateLimitRule;
    
    /** Per IP verification limits */
    ip: RateLimitRule;
    
    /** Per session verification limits */
    session: RateLimitRule;
  };
  
  lockout: {
    /** Failed challenges before short cooldown */
    shortCooldownThreshold: number;
    
    /** Short cooldown duration (seconds) */
    shortCooldownSeconds: number;
    
    /** Failed challenges before generation block */
    generationBlockThreshold: number;
    
    /** Generation block duration (seconds) */
    generationBlockSeconds: number;
    
    /** Failed challenges before account lock */
    accountLockThreshold: number;
    
    /** Account lock duration (seconds) */
    accountLockSeconds: number;
  };
}

/**
 * Default MFA rate limit policy
 * 
 * These values provide baseline security while allowing legitimate usage.
 * Tenants can override these with stricter values.
 */
export const DEFAULT_MFA_RATE_LIMIT_POLICY: MfaRateLimitPolicy = {
  generation: {
    user: {
      limit: 5,
      windowSeconds: 15 * 60, // 15 minutes
      sliding: false,
    },
    
    phone: {
      limit: 5,
      windowSeconds: 15 * 60, // 15 minutes
      sliding: false,
    },
    
    phoneDaily: {
      limit: 20,
      windowSeconds: 24 * 60 * 60, // 24 hours
      sliding: false,
    },
    
    email: {
      limit: 5,
      windowSeconds: 15 * 60, // 15 minutes
      sliding: false,
    },
    
    emailDaily: {
      limit: 20,
      windowSeconds: 24 * 60 * 60, // 24 hours
      sliding: false,
    },
    
    ip: {
      limit: 30,
      windowSeconds: 15 * 60, // 15 minutes
      sliding: false,
    },
    
    tenantIp: {
      limit: 50,
      windowSeconds: 15 * 60, // 15 minutes
      sliding: false,
    },
    
    device: {
      limit: 10,
      windowSeconds: 30 * 60, // 30 minutes
      sliding: false,
    },
    
    session: {
      limit: 5,
      windowSeconds: 15 * 60, // 15 minutes
      sliding: false,
    },
    
    resendCooldownSeconds: 30,
    resendCooldownMultiplier: 2, // Progressive: 30s, 60s, 120s...
  },
  
  verification: {
    perChallenge: 5, // Also enforced at challenge level
    
    user: {
      limit: 20,
      windowSeconds: 30 * 60, // 30 minutes
      sliding: true, // Use sliding window for security
    },
    
    ip: {
      limit: 100,
      windowSeconds: 30 * 60, // 30 minutes
      sliding: true,
    },
    
    session: {
      limit: 10,
      windowSeconds: 30 * 60, // 30 minutes
      sliding: false,
    },
  },
  
  lockout: {
    shortCooldownThreshold: 3,
    shortCooldownSeconds: 60,
    
    generationBlockThreshold: 5,
    generationBlockSeconds: 5 * 60, // 5 minutes
    
    accountLockThreshold: 10,
    accountLockSeconds: 30 * 60, // 30 minutes
  },
} as const;

/**
 * Platform minimum security limits
 * Tenants cannot configure limits weaker than these
 */
export const PLATFORM_MINIMUM_LIMITS = {
  maxVerificationAttemptsPerChallenge: 10,
  maxGenerationAttemptsPerUser15Min: 10,
  maxVerificationAttemptsPerUser30Min: 50,
  maxVerificationAttemptsPerIp30Min: 200,
} as const;

/**
 * MFA security event type
 */
export type MfaSecurityEventType =
  | 'MFA_GENERATION_REQUESTED'
  | 'MFA_GENERATION_RATE_LIMITED'
  | 'MFA_GENERATION_SUCCEEDED'
  | 'MFA_GENERATION_FAILED'
  | 'MFA_DELIVERY_SUCCEEDED'
  | 'MFA_DELIVERY_FAILED'
  | 'MFA_VERIFICATION_REQUESTED'
  | 'MFA_VERIFICATION_SUCCEEDED'
  | 'MFA_VERIFICATION_FAILED'
  | 'MFA_VERIFICATION_RATE_LIMITED'
  | 'MFA_CHALLENGE_LOCKED'
  | 'MFA_CHALLENGE_EXPIRED'
  | 'MFA_CHALLENGE_SUPERSEDED'
  | 'MFA_USER_TEMPORARILY_LOCKED'
  | 'MFA_IP_BLOCKED'
  | 'MFA_LOCKOUT_RELEASED'
  | 'MFA_SECURITY_REVIEW_TRIGGERED';

/**
 * MFA security event (persistent audit record)
 */
export interface MfaSecurityEvent {
  id: string;
  tenantId: string;
  userId?: string;
  challengeId?: string;
  
  type: MfaSecurityEventType;
  method: 'SMS' | 'EMAIL' | 'TOTP';
  
  /** HMAC-hashed identifiers (not raw PII) */
  ipHash?: string;
  deviceHash?: string;
  destinationHash?: string;
  
  attempts?: number;
  limit?: number;
  reason?: string;
  
  metadata: Record<string, any>;
  
  createdAt: Date;
}

/**
 * Rate limiter result (internal)
 */
export interface RateLimiterResult {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterMs?: number;
}

/**
 * Resend cooldown check result
 */
export interface ResendCooldownResult {
  allowed: boolean;
  cooldownSeconds?: number;
  lastRequestAt?: Date;
  retryAfterMs?: number;
}
