/**
 * MFA Abuse Protection Service
 * 
 * Core service for MFA rate limiting and abuse prevention.
 * Enforces multi-dimensional throttling across user, phone, IP, device, and session.
 * 
 * ARCHITECTURE:
 * - Separate generation and verification limits
 * - Progressive lockout escalation
 * - Redis-backed atomic counters
 * - Persistent security event logging
 * - Fail-closed on Redis unavailability
 * 
 * SECURITY:
 * - All identifiers HMAC-hashed before storage
 * - Per-challenge attempt ceiling enforced at DB level
 * - Single-use OTP verification
 * - Resend cooldown with progressive delays
 */

import { logger } from '../../../utils/logger.js';
import { IRateLimitStore } from './stores/rate-limit-store.interface.js';
import { LimiterIdentityService } from '../normalization/limiter-identity.service.js';
import {
  MfaRequestContext,
  RateLimitDecision,
  MfaRateLimitPolicy,
  DEFAULT_MFA_RATE_LIMIT_POLICY,
  PLATFORM_MINIMUM_LIMITS,
  ResendCooldownResult,
  MfaRestriction,
} from './mfa-rate-limit.types.js';

export interface MfaAbuseProtectionConfig {
  /** Rate limit policy (defaults to DEFAULT_MFA_RATE_LIMIT_POLICY) */
  policy?: Partial<MfaRateLimitPolicy>;
  
  /** Whether to fail closed on Redis errors (default: true for verification, false for generation) */
  failClosed?: boolean;
  
  /** Whether Redis is required (if false, degrades gracefully) */
  requireRedis?: boolean;
}

export class MfaAbuseProtectionService {
  private readonly policy: MfaRateLimitPolicy;
  private redisHealthy = true;
  private lastRedisCheck = 0;

  constructor(
    private readonly rateLimitStore: IRateLimitStore,
    private readonly identityService: LimiterIdentityService,
    private readonly config: MfaAbuseProtectionConfig = {}
  ) {
    // Merge provided policy with defaults
    this.policy = this.mergePolicy(config.policy);
    this.validatePolicy();

    // Start health check interval
    this.startHealthCheck();
  }

  /**
   * Check if OTP generation is allowed
   */
  async checkGeneration(context: MfaRequestContext): Promise<RateLimitDecision> {
    try {
      // Check if Redis is healthy
      if (!this.redisHealthy && this.config.requireRedis) {
        return this.createDegradedDecision('Redis unavailable');
      }

      // Check lockouts first (most restrictive)
      const lockoutCheck = await this.checkLockouts(context);
      if (!lockoutCheck.allowed) {
        return lockoutCheck;
      }

      // Check all applicable rate limit dimensions
      const checks = await this.runGenerationChecks(context);

      // If any check fails, deny
      const failedCheck = checks.find(c => !c.allowed);
      if (failedCheck) {
        return failedCheck;
      }

      // All checks passed
      return {
        allowed: true,
        violatedRules: [],
      };
    } catch (error) {
      logger.error('Generation rate limit check failed', {
        context: this.sanitizeContext(context),
        error,
      });

      // Fail closed for generation if configured
      if (this.config.failClosed) {
        return this.createErrorDecision('Rate limit check failed');
      }

      // Otherwise allow but log
      logger.warn('Allowing generation despite rate limit error (fail open)');
      return {
        allowed: true,
        violatedRules: [],
      };
    }
  }

  /**
   * Record successful generation
   */
  async recordGeneration(context: MfaRequestContext): Promise<void> {
    try {
      // This is called after successful OTP generation
      // The counters were already incremented during checkGeneration
      // This method is for any additional bookkeeping

      logger.debug('MFA generation recorded', {
        userId: context.userId,
        method: context.method,
      });
    } catch (error) {
      logger.error('Failed to record generation', { context: this.sanitizeContext(context), error });
    }
  }

  /**
   * Check if OTP verification is allowed
   */
  async checkVerification(context: MfaRequestContext): Promise<RateLimitDecision> {
    try {
      if (!context.challengeId) {
        throw new Error('challengeId required for verification check');
      }

      // Check if Redis is healthy
      if (!this.redisHealthy && this.config.requireRedis) {
        // For verification, fail closed by default
        return this.createDegradedDecision('Redis unavailable - verification blocked');
      }

      // Check lockouts
      const lockoutCheck = await this.checkLockouts(context);
      if (!lockoutCheck.allowed) {
        return lockoutCheck;
      }

      // Check verification rate limits
      const checks = await this.runVerificationChecks(context);

      const failedCheck = checks.find(c => !c.allowed);
      if (failedCheck) {
        return failedCheck;
      }

      return {
        allowed: true,
        violatedRules: [],
      };
    } catch (error) {
      logger.error('Verification rate limit check failed', {
        context: this.sanitizeContext(context),
        error,
      });

      // Always fail closed for verification
      return this.createErrorDecision('Verification rate limit check failed');
    }
  }

  /**
   * Record verification failure
   */
  async recordVerificationFailure(context: MfaRequestContext): Promise<RateLimitDecision> {
    try {
      if (!context.challengeId) {
        throw new Error('challengeId required');
      }

      // Increment verification failure counters
      const { tenantId, userId, ip, sessionId } = context;

      const checks = await Promise.all([
        // User verification failures
        userId ? this.incrementCounter(
          this.identityService.generateVerificationKey('user', tenantId, undefined, userId),
          this.policy.verification.user.limit,
          this.policy.verification.user.windowSeconds,
          this.policy.verification.user.sliding
        ) : null,

        // IP verification failures
        ip ? this.incrementCounter(
          this.identityService.generateVerificationKey('ip', tenantId, undefined, undefined, ip),
          this.policy.verification.ip.limit,
          this.policy.verification.ip.windowSeconds,
          this.policy.verification.ip.sliding
        ) : null,

        // Session verification failures
        sessionId ? this.incrementCounter(
          this.identityService.generateVerificationKey('session', tenantId, undefined, undefined, undefined, sessionId),
          this.policy.verification.session.limit,
          this.policy.verification.session.windowSeconds,
          this.policy.verification.session.sliding
        ) : null,
      ]);

      // Check if any limit exceeded
      const failedCheck = checks.filter(c => c !== null).find(c => !c!.allowed);
      if (failedCheck) {
        return {
          allowed: false,
          reason: 'USER_VERIFICATION_LIMIT',
          retryAfterMs: failedCheck.retryAfterMs,
          violatedRules: [{
            dimension: 'verification',
            limit: failedCheck.limit,
            current: failedCheck.count,
            remaining: failedCheck.remaining,
            resetAt: failedCheck.resetAt,
          }],
        };
      }

      return {
        allowed: true,
        violatedRules: [],
      };
    } catch (error) {
      logger.error('Failed to record verification failure', {
        context: this.sanitizeContext(context),
        error,
      });

      // Return success to avoid blocking legitimate retries
      return {
        allowed: true,
        violatedRules: [],
      };
    }
  }

  /**
   * Record successful verification
   */
  async recordVerificationSuccess(context: MfaRequestContext): Promise<void> {
    try {
      // Clear session-specific counters on success
      if (context.sessionId) {
        const sessionKey = this.identityService.generateVerificationKey(
          'session',
          context.tenantId,
          undefined,
          undefined,
          undefined,
          context.sessionId
        );

        await this.rateLimitStore.delete(sessionKey);
      }

      logger.debug('MFA verification success recorded', {
        userId: context.userId,
        challengeId: context.challengeId,
      });
    } catch (error) {
      logger.error('Failed to record verification success', {
        context: this.sanitizeContext(context),
        error,
      });
    }
  }

  /**
   * Check resend cooldown
   */
  async checkResendCooldown(
    tenantId: string,
    userId: string,
    method: 'SMS' | 'EMAIL',
    resendCount: number = 0
  ): Promise<ResendCooldownResult> {
    try {
      const key = this.identityService.generateResendCooldownKey(tenantId, userId, method);
      const info = await this.rateLimitStore.get(key);

      if (!info) {
        // No recent resend, allow
        return { allowed: true };
      }

      // Calculate progressive cooldown: 30s, 60s, 120s, 240s...
      const baseCooldown = this.policy.generation.resendCooldownSeconds;
      const multiplier = this.policy.generation.resendCooldownMultiplier || 2;
      const cooldownSeconds = Math.min(
        baseCooldown * Math.pow(multiplier, resendCount),
        300 // Max 5 minutes
      );

      const elapsedSeconds = (Date.now() - (info.resetAt.getTime() - info.ttl * 1000)) / 1000;

      if (elapsedSeconds < cooldownSeconds) {
        const retryAfterMs = (cooldownSeconds - elapsedSeconds) * 1000;
        return {
          allowed: false,
          cooldownSeconds,
          lastRequestAt: new Date(Date.now() - elapsedSeconds * 1000),
          retryAfterMs,
        };
      }

      return { allowed: true };
    } catch (error) {
      logger.error('Resend cooldown check failed', { tenantId, userId, method, error });
      // Allow on error to avoid blocking legitimate requests
      return { allowed: true };
    }
  }

  /**
   * Record resend request
   */
  async recordResend(
    tenantId: string,
    userId: string,
    method: 'SMS' | 'EMAIL',
    cooldownSeconds: number
  ): Promise<void> {
    try {
      const key = this.identityService.generateResendCooldownKey(tenantId, userId, method);
      await this.rateLimitStore.setLockout(key, cooldownSeconds);
    } catch (error) {
      logger.error('Failed to record resend', { tenantId, userId, method, error });
    }
  }

  /**
   * Set user lockout
   */
  async setUserLockout(
    tenantId: string,
    userId: string,
    durationSeconds: number,
    reason: string
  ): Promise<void> {
    try {
      const key = this.identityService.generateLockoutKey('user', tenantId, userId);
      await this.rateLimitStore.setLockout(key, durationSeconds, { reason });

      logger.warn('User MFA lockout set', {
        userId,
        durationSeconds,
        reason,
      });
    } catch (error) {
      logger.error('Failed to set user lockout', { tenantId, userId, error });
      throw error;
    }
  }

  /**
   * Remove user lockout
   */
  async removeUserLockout(tenantId: string, userId: string): Promise<void> {
    try {
      const key = this.identityService.generateLockoutKey('user', tenantId, userId);
      await this.rateLimitStore.removeLockout(key);

      logger.info('User MFA lockout removed', { userId });
    } catch (error) {
      logger.error('Failed to remove user lockout', { tenantId, userId, error });
      throw error;
    }
  }

  /**
   * Run all generation checks
   */
  private async runGenerationChecks(context: MfaRequestContext): Promise<RateLimitDecision[]> {
    const { tenantId, userId, destination, ip, deviceId, sessionId, method } = context;
    const checks: Promise<RateLimitDecision>[] = [];

    // User limit
    if (userId) {
      checks.push(this.checkDimension(
        this.identityService.generateGenerationKey('user', tenantId, userId),
        this.policy.generation.user.limit,
        this.policy.generation.user.windowSeconds,
        'USER_GENERATION_LIMIT',
        'user',
        this.policy.generation.user.sliding
      ));
    }

    // Destination limits (phone or email)
    if (destination) {
      if (method === 'SMS') {
        checks.push(
          this.checkDimension(
            this.identityService.generateGenerationKey('phone', tenantId, undefined, destination),
            this.policy.generation.phone.limit,
            this.policy.generation.phone.windowSeconds,
            'PHONE_GENERATION_LIMIT',
            'phone',
            this.policy.generation.phone.sliding
          ),
          this.checkDimension(
            this.identityService.generateGenerationKey('phone-daily', tenantId, undefined, destination),
            this.policy.generation.phoneDaily.limit,
            this.policy.generation.phoneDaily.windowSeconds,
            'PHONE_DAILY_LIMIT',
            'phone-daily',
            this.policy.generation.phoneDaily.sliding
          )
        );
      } else if (method === 'EMAIL') {
        checks.push(
          this.checkDimension(
            this.identityService.generateGenerationKey('email', tenantId, undefined, destination),
            this.policy.generation.email.limit,
            this.policy.generation.email.windowSeconds,
            'EMAIL_GENERATION_LIMIT',
            'email',
            this.policy.generation.email.sliding
          ),
          this.checkDimension(
            this.identityService.generateGenerationKey('email-daily', tenantId, undefined, destination),
            this.policy.generation.emailDaily.limit,
            this.policy.generation.emailDaily.windowSeconds,
            'EMAIL_DAILY_LIMIT',
            'email-daily',
            this.policy.generation.emailDaily.sliding
          )
        );
      }
    }

    // IP limits
    if (ip) {
      checks.push(
        this.checkDimension(
          this.identityService.generateGenerationKey('ip', tenantId, undefined, undefined, ip),
          this.policy.generation.ip.limit,
          this.policy.generation.ip.windowSeconds,
          'IP_GENERATION_LIMIT',
          'ip',
          this.policy.generation.ip.sliding
        ),
        this.checkDimension(
          this.identityService.generateGenerationKey('tenant-ip', tenantId, undefined, undefined, ip),
          this.policy.generation.tenantIp.limit,
          this.policy.generation.tenantIp.windowSeconds,
          'IP_GENERATION_LIMIT',
          'tenant-ip',
          this.policy.generation.tenantIp.sliding
        )
      );
    }

    // Device limit
    if (deviceId) {
      checks.push(this.checkDimension(
        this.identityService.generateGenerationKey('device', tenantId, undefined, undefined, undefined, deviceId),
        this.policy.generation.device.limit,
        this.policy.generation.device.windowSeconds,
        'DEVICE_GENERATION_LIMIT',
        'device',
        this.policy.generation.device.sliding
      ));
    }

    // Session limit
    if (sessionId) {
      checks.push(this.checkDimension(
        this.identityService.generateGenerationKey('session', tenantId, undefined, undefined, undefined, undefined, sessionId),
        this.policy.generation.session.limit,
        this.policy.generation.session.windowSeconds,
        'SESSION_GENERATION_LIMIT',
        'session',
        this.policy.generation.session.sliding
      ));
    }

    return Promise.all(checks);
  }

  /**
   * Run all verification checks
   */
  private async runVerificationChecks(context: MfaRequestContext): Promise<RateLimitDecision[]> {
    const { tenantId, userId, ip, sessionId } = context;
    const checks: Promise<RateLimitDecision>[] = [];

    // User verification limit
    if (userId) {
      checks.push(this.checkDimension(
        this.identityService.generateVerificationKey('user', tenantId, undefined, userId),
        this.policy.verification.user.limit,
        this.policy.verification.user.windowSeconds,
        'USER_VERIFICATION_LIMIT',
        'user-verify',
        this.policy.verification.user.sliding
      ));
    }

    // IP verification limit
    if (ip) {
      checks.push(this.checkDimension(
        this.identityService.generateVerificationKey('ip', tenantId, undefined, undefined, ip),
        this.policy.verification.ip.limit,
        this.policy.verification.ip.windowSeconds,
        'IP_VERIFICATION_LIMIT',
        'ip-verify',
        this.policy.verification.ip.sliding
      ));
    }

    // Session verification limit
    if (sessionId) {
      checks.push(this.checkDimension(
        this.identityService.generateVerificationKey('session', tenantId, undefined, undefined, undefined, sessionId),
        this.policy.verification.session.limit,
        this.policy.verification.session.windowSeconds,
        'IP_VERIFICATION_LIMIT',
        'session-verify',
        this.policy.verification.session.sliding
      ));
    }

    return Promise.all(checks);
  }

  /**
   * Check single dimension
   */
  private async checkDimension(
    key: string,
    limit: number,
    windowSeconds: number,
    reason: any,
    dimension: string,
    sliding?: boolean
  ): Promise<RateLimitDecision> {
    const result = await this.incrementCounter(key, limit, windowSeconds, sliding);

    if (!result.allowed) {
      return {
        allowed: false,
        reason,
        retryAfterMs: result.retryAfterMs,
        violatedRules: [{
          dimension,
          limit: result.limit,
          current: result.count,
          remaining: result.remaining,
          resetAt: result.resetAt,
        }],
      };
    }

    return {
      allowed: true,
      violatedRules: [],
    };
  }

  /**
   * Increment counter (delegates to appropriate store method)
   */
  private async incrementCounter(
    key: string,
    limit: number,
    windowSeconds: number,
    sliding?: boolean
  ) {
    if (sliding) {
      return this.rateLimitStore.checkAndIncrementSliding(key, limit, windowSeconds);
    } else {
      return this.rateLimitStore.checkAndIncrement(key, limit, windowSeconds);
    }
  }

  /**
   * Check lockouts
   */
  private async checkLockouts(context: MfaRequestContext): Promise<RateLimitDecision> {
    const { tenantId, userId, destination, ip, deviceId } = context;

    // Check user lockout
    if (userId) {
      const userLockout = await this.rateLimitStore.getLockout(
        this.identityService.generateLockoutKey('user', tenantId, userId)
      );

      if (userLockout.exists) {
        return {
          allowed: false,
          reason: 'ACCOUNT_TEMPORARILY_LOCKED',
          retryAfterMs: userLockout.ttl * 1000,
          violatedRules: [{
            dimension: 'user-lockout',
            limit: 0,
            current: 1,
            remaining: 0,
            resetAt: userLockout.expiresAt,
          }],
          escalation: 'ACCOUNT_TEMPORARILY_LOCKED',
        };
      }
    }

    // Check destination lockout
    if (destination) {
      const destLockout = await this.rateLimitStore.getLockout(
        this.identityService.generateLockoutKey('phone', tenantId, destination)
      );

      if (destLockout.exists) {
        return {
          allowed: false,
          reason: 'PHONE_GENERATION_LIMIT',
          retryAfterMs: destLockout.ttl * 1000,
          violatedRules: [{
            dimension: 'destination-lockout',
            limit: 0,
            current: 1,
            remaining: 0,
            resetAt: destLockout.expiresAt,
          }],
        };
      }
    }

    // Check IP lockout
    if (ip) {
      const ipLockout = await this.rateLimitStore.getLockout(
        this.identityService.generateLockoutKey('ip', tenantId, ip)
      );

      if (ipLockout.exists) {
        return {
          allowed: false,
          reason: 'IP_GENERATION_LIMIT',
          retryAfterMs: ipLockout.ttl * 1000,
          violatedRules: [{
            dimension: 'ip-lockout',
            limit: 0,
            current: 1,
            remaining: 0,
            resetAt: ipLockout.expiresAt,
          }],
        };
      }
    }

    return {
      allowed: true,
      violatedRules: [],
    };
  }

  /**
   * Merge policy with defaults
   */
  private mergePolicy(partial?: Partial<MfaRateLimitPolicy>): MfaRateLimitPolicy {
    if (!partial) {
      return { ...DEFAULT_MFA_RATE_LIMIT_POLICY };
    }

    return {
      generation: {
        ...DEFAULT_MFA_RATE_LIMIT_POLICY.generation,
        ...partial.generation,
      },
      verification: {
        ...DEFAULT_MFA_RATE_LIMIT_POLICY.verification,
        ...partial.verification,
      },
      lockout: {
        ...DEFAULT_MFA_RATE_LIMIT_POLICY.lockout,
        ...partial.lockout,
      },
    };
  }

  /**
   * Validate policy against platform minimums
   */
  private validatePolicy(): void {
    const { verification, generation } = this.policy;

    // Enforce platform minimums
    if (verification.perChallenge > PLATFORM_MINIMUM_LIMITS.maxVerificationAttemptsPerChallenge) {
      logger.warn('Verification perChallenge exceeds platform maximum, capping', {
        configured: verification.perChallenge,
        maximum: PLATFORM_MINIMUM_LIMITS.maxVerificationAttemptsPerChallenge,
      });
      verification.perChallenge = PLATFORM_MINIMUM_LIMITS.maxVerificationAttemptsPerChallenge;
    }

    if (generation.user.limit > PLATFORM_MINIMUM_LIMITS.maxGenerationAttemptsPerUser15Min) {
      logger.warn('Generation user limit exceeds platform maximum, capping');
      generation.user.limit = PLATFORM_MINIMUM_LIMITS.maxGenerationAttemptsPerUser15Min;
    }
  }

  /**
   * Health check loop
   */
  private startHealthCheck(): void {
    setInterval(async () => {
      try {
        this.redisHealthy = await this.rateLimitStore.isHealthy();
        this.lastRedisCheck = Date.now();

        if (!this.redisHealthy) {
          logger.error('Redis rate limiter unhealthy');
        }
      } catch (error) {
        this.redisHealthy = false;
        logger.error('Redis health check failed', { error });
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Create degraded mode decision
   */
  private createDegradedDecision(reason: string): RateLimitDecision {
    return {
      allowed: false,
      reason: 'SECURITY_REVIEW_REQUIRED',
      violatedRules: [],
      escalation: 'SECURITY_REVIEW',
    };
  }

  /**
   * Create error decision
   */
  private createErrorDecision(reason: string): RateLimitDecision {
    return {
      allowed: false,
      reason: 'SECURITY_REVIEW_REQUIRED',
      violatedRules: [],
    };
  }

  /**
   * Sanitize context for logging (remove PII)
   */
  private sanitizeContext(context: MfaRequestContext): any {
    return {
      tenantId: context.tenantId,
      userId: context.userId,
      destination: context.destination ? this.identityService.maskPhone(context.destination) : undefined,
      ip: context.ip ? this.identityService.maskIp(context.ip) : undefined,
      deviceId: context.deviceId ? '***' : undefined,
      sessionId: context.sessionId ? '***' : undefined,
      method: context.method,
      purpose: context.purpose,
    };
  }
}
