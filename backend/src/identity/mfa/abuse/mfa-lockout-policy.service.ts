/**
 * MFA Lockout Policy Service
 * 
 * Implements progressive lockout escalation based on failure patterns.
 * Prevents account takeover while minimizing denial-of-service exposure.
 * 
 * ESCALATION LEVELS:
 * 1. NONE - Normal operation
 * 2. SHORT_COOLDOWN - 60s delay after 3 failures
 * 3. GENERATION_BLOCKED - 5min block after 5 failures
 * 4. ACCOUNT_TEMPORARILY_LOCKED - 30min lock after 10 failures
 * 5. SECURITY_REVIEW - Manual intervention required
 * 
 * SECURITY:
 * - Multi-signal decision (not just failure count)
 * - IP-based vs account-based differentiation
 * - Time-windowed failure counting
 * - Automatic unlock after timeout
 */

import { logger } from '../../../utils/logger.js';
import { MfaSecurityEventRepository } from '../repositories/mfa-security-event.repository.js';
import { MfaAbuseProtectionService } from './mfa-abuse-protection.service.js';
import {
  MfaRestriction,
  MfaRateLimitPolicy,
  DEFAULT_MFA_RATE_LIMIT_POLICY,
} from './mfa-rate-limit.types.js';

export interface LockoutDecision {
  shouldLock: boolean;
  level: MfaRestriction;
  durationSeconds?: number;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface LockoutContext {
  tenantId: string;
  userId: string;
  
  /** Recent verification failure count */
  recentFailures: number;
  
  /** Failed challenges in time window */
  failedChallenges: number;
  
  /** Rate limit events in time window */
  rateLimitEvents: number;
  
  /** IP reputation score (if available) */
  ipReputation?: 'trusted' | 'neutral' | 'suspicious';
  
  /** Device familiarity */
  deviceFamiliar?: boolean;
  
  /** Recent successful auth */
  recentSuccessfulAuth?: boolean;
}

export class MfaLockoutPolicyService {
  private readonly policy: MfaRateLimitPolicy;

  constructor(
    private readonly securityEventRepo: MfaSecurityEventRepository,
    private readonly abuseProtection: MfaAbuseProtectionService,
    policy?: Partial<MfaRateLimitPolicy>
  ) {
    this.policy = {
      ...DEFAULT_MFA_RATE_LIMIT_POLICY,
      ...policy,
    };
  }

  /**
   * Evaluate lockout decision based on failure patterns
   */
  async evaluateLockout(context: LockoutContext): Promise<LockoutDecision> {
    try {
      const { tenantId, userId, recentFailures, failedChallenges, rateLimitEvents } = context;

      // Get additional context from security events
      const failureCount = await this.securityEventRepo.getVerificationFailureCount(
        tenantId,
        userId,
        30 // last 30 minutes
      );

      const rateLimitCount = (await this.securityEventRepo.getRateLimitEvents(
        tenantId,
        userId,
        60 // last 60 minutes
      )).length;

      // Calculate total abuse score
      const abuseScore = this.calculateAbuseScore({
        recentFailures,
        failedChallenges,
        rateLimitEvents: rateLimitCount,
        failureCount,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        countryCode: context.countryCode,
      });

      logger.debug('Lockout evaluation', {
        userId,
        abuseScore,
        recentFailures,
        failedChallenges,
        rateLimitEvents: rateLimitCount,
        failureCount,
      });

      // Determine escalation level
      const decision = this.determineEscalation(abuseScore, context);

      return decision;
    } catch (error) {
      logger.error('Lockout evaluation failed', {
        userId: context.userId,
        error,
      });

      // Fail open for lockout decisions to avoid false positives
      return {
        shouldLock: false,
        level: 'NONE',
      };
    }
  }

  /**
   * Calculate abuse score from multiple signals
   */
  private calculateAbuseScore(signals: {
    recentFailures: number;
    failedChallenges: number;
    rateLimitEvents: number;
    failureCount: number;
    ipReputation?: 'trusted' | 'neutral' | 'suspicious';
    deviceFamiliar?: boolean;
    recentSuccessfulAuth?: boolean;
  }): number {
    let score = 0;

    // Recent verification failures (weight: 2)
    score += signals.recentFailures * 2;

    // Failed challenges (weight: 3)
    score += signals.failedChallenges * 3;

    // Rate limit events (weight: 1.5)
    score += signals.rateLimitEvents * 1.5;

    // Total failure count (weight: 1)
    score += signals.failureCount * 1;

    // IP reputation modifier
    if (signals.ipReputation === 'suspicious') {
      score *= 1.5;
    } else if (signals.ipReputation === 'trusted') {
      score *= 0.7;
    }

    // Device familiarity modifier
    if (signals.deviceFamiliar === false) {
      score *= 1.3;
    }

    // Recent successful auth modifier (reduces score)
    if (signals.recentSuccessfulAuth) {
      score *= 0.6;
    }

    return Math.round(score);
  }

  /**
   * Determine escalation level based on abuse score
   */
  private determineEscalation(
    abuseScore: number,
    context: LockoutContext
  ): LockoutDecision {
    const { lockout } = this.policy;

    // Level 5: SECURITY_REVIEW (score >= 50 or extreme patterns)
    if (abuseScore >= 50 || context.rateLimitEvents >= 10) {
      return {
        shouldLock: true,
        level: 'SECURITY_REVIEW',
        reason: 'Severe abuse detected - manual review required',
        metadata: {
          abuseScore,
          requiresManualReview: true,
        },
      };
    }

    // Level 4: ACCOUNT_TEMPORARILY_LOCKED (score >= 30 or threshold reached)
    if (
      abuseScore >= 30 ||
      context.failedChallenges >= lockout.accountLockThreshold
    ) {
      return {
        shouldLock: true,
        level: 'ACCOUNT_TEMPORARILY_LOCKED',
        durationSeconds: lockout.accountLockSeconds,
        reason: 'Too many failed MFA attempts',
        metadata: {
          abuseScore,
          failedChallenges: context.failedChallenges,
        },
      };
    }

    // Level 3: GENERATION_BLOCKED (score >= 15 or threshold reached)
    if (
      abuseScore >= 15 ||
      context.failedChallenges >= lockout.generationBlockThreshold
    ) {
      return {
        shouldLock: true,
        level: 'GENERATION_BLOCKED',
        durationSeconds: lockout.generationBlockSeconds,
        reason: 'Multiple failed verification attempts',
        metadata: {
          abuseScore,
          failedChallenges: context.failedChallenges,
        },
      };
    }

    // Level 2: SHORT_COOLDOWN (score >= 8 or threshold reached)
    if (
      abuseScore >= 8 ||
      context.recentFailures >= lockout.shortCooldownThreshold
    ) {
      return {
        shouldLock: true,
        level: 'SHORT_COOLDOWN',
        durationSeconds: lockout.shortCooldownSeconds,
        reason: 'Recent verification failures',
        metadata: {
          abuseScore,
          recentFailures: context.recentFailures,
        },
      };
    }

    // Level 1: NONE (no escalation)
    return {
      shouldLock: false,
      level: 'NONE',
    };
  }

  /**
   * Apply lockout decision
   */
  async applyLockout(
    tenantId: string,
    userId: string,
    decision: LockoutDecision
  ): Promise<void> {
    if (!decision.shouldLock) {
      return;
    }

    try {
      switch (decision.level) {
        case 'SHORT_COOLDOWN':
        case 'GENERATION_BLOCKED':
        case 'ACCOUNT_TEMPORARILY_LOCKED':
          await this.abuseProtection.setUserLockout(
            tenantId,
            userId,
            decision.durationSeconds!,
            decision.reason || 'Lockout applied'
          );

          logger.warn('MFA lockout applied', {
            userId,
            level: decision.level,
            durationSeconds: decision.durationSeconds,
            reason: decision.reason,
          });
          break;

        case 'SECURITY_REVIEW':
          // Set indefinite lock (requires manual unlock)
          await this.abuseProtection.setUserLockout(
            tenantId,
            userId,
            7 * 24 * 60 * 60, // 7 days (effectively indefinite)
            'SECURITY_REVIEW: ' + decision.reason
          );

          logger.error('MFA security review triggered', {
            userId,
            reason: decision.reason,
            metadata: decision.metadata,
          });
          break;

        default:
          break;
      }
    } catch (error) {
      logger.error('Failed to apply lockout', {
        userId,
        level: decision.level,
        error,
      });
      throw error;
    }
  }

  /**
   * Check if user should be locked out after verification failure
   */
  async checkPostVerificationLockout(
    tenantId: string,
    userId: string,
    challengeId: string
  ): Promise<LockoutDecision> {
    try {
      // Get recent failure count
      const recentFailures = await this.securityEventRepo.getVerificationFailureCount(
        tenantId,
        userId,
        15 // last 15 minutes
      );

      // Get failed challenges count
      const events = await this.securityEventRepo.findByFilters({
        tenantId,
        userId,
        type: 'MFA_CHALLENGE_LOCKED',
        fromDate: new Date(Date.now() - 30 * 60 * 1000), // last 30 minutes
        limit: 20,
      });

      const failedChallenges = events.length;

      // Get rate limit events
      const rateLimitEvents = await this.securityEventRepo.getRateLimitEvents(
        tenantId,
        userId,
        60 // last 60 minutes
      );

      const context: LockoutContext = {
        tenantId,
        userId,
        recentFailures,
        failedChallenges,
        rateLimitEvents: rateLimitEvents.length,
      };

      const decision = await this.evaluateLockout(context);

      // Auto-apply lockout if needed
      if (decision.shouldLock) {
        await this.applyLockout(tenantId, userId, decision);
      }

      return decision;
    } catch (error) {
      logger.error('Post-verification lockout check failed', {
        userId,
        challengeId,
        error,
      });

      return {
        shouldLock: false,
        level: 'NONE',
      };
    }
  }

  /**
   * Manually unlock user
   */
  async unlockUser(
    tenantId: string,
    userId: string,
    reason: string,
    unlockedBy?: string
  ): Promise<void> {
    try {
      await this.abuseProtection.removeUserLockout(tenantId, userId);

      logger.info('MFA lockout manually removed', {
        userId,
        reason,
        unlockedBy,
      });

      // Record security event
      await this.securityEventRepo.create({
        tenantId,
        userId,
        type: 'MFA_LOCKOUT_RELEASED',
        method: 'SMS', // Generic
        reason,
        metadata: {
          unlockedBy,
          manual: true,
        },
      });
    } catch (error) {
      logger.error('Failed to unlock user', {
        userId,
        error,
      });
      throw error;
    }
  }

  /**
   * Get current lockout status for user
   */
  async getLockoutStatus(
    tenantId: string,
    userId: string
  ): Promise<{
    locked: boolean;
    level?: MfaRestriction;
    expiresAt?: Date;
    reason?: string;
  }> {
    try {
      // This would query the lockout key from Redis via abuse protection
      // For now, we return basic status
      // The actual implementation would check Redis lockout keys

      return {
        locked: false,
      };
    } catch (error) {
      logger.error('Failed to get lockout status', {
        userId,
        error,
      });

      return {
        locked: false,
      };
    }
  }

  /**
   * Get lockout statistics for dashboard
   */
  async getLockoutStatistics(
    tenantId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<{
    totalLockouts: number;
    shortCooldowns: number;
    generationBlocks: number;
    accountLocks: number;
    securityReviews: number;
    averageDuration: number;
  }> {
    try {
      const events = await this.securityEventRepo.findByFilters({
        tenantId,
        type: 'MFA_USER_TEMPORARILY_LOCKED',
        fromDate,
        toDate,
        limit: 1000,
      });

      const lockoutsByLevel = {
        SHORT_COOLDOWN: 0,
        GENERATION_BLOCKED: 0,
        ACCOUNT_TEMPORARILY_LOCKED: 0,
        SECURITY_REVIEW: 0,
      };

      let totalDuration = 0;

      for (const event of events) {
        const level = event.metadata?.level as MfaRestriction | undefined;
        if (level && level in lockoutsByLevel) {
          lockoutsByLevel[level as keyof typeof lockoutsByLevel]++;
        }

        const duration = event.metadata?.durationSeconds as number | undefined;
        if (duration) {
          totalDuration += duration;
        }
      }

      return {
        totalLockouts: events.length,
        shortCooldowns: lockoutsByLevel.SHORT_COOLDOWN,
        generationBlocks: lockoutsByLevel.GENERATION_BLOCKED,
        accountLocks: lockoutsByLevel.ACCOUNT_TEMPORARILY_LOCKED,
        securityReviews: lockoutsByLevel.SECURITY_REVIEW,
        averageDuration: events.length > 0 ? totalDuration / events.length : 0,
      };
    } catch (error) {
      logger.error('Failed to get lockout statistics', {
        tenantId,
        error,
      });

      return {
        totalLockouts: 0,
        shortCooldowns: 0,
        generationBlocks: 0,
        accountLocks: 0,
        securityReviews: 0,
        averageDuration: 0,
      };
    }
  }
}
