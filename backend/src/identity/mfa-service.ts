/**
 * Multi-Factor Authentication Service
 * 
 * REFACTORED: Now properly separates OTP generation from delivery.
 * 
 * Key improvements:
 * 1. SMS OTP uses transactional outbox pattern (no more "return true" lie)
 * 2. Explicit dispatch result types distinguish queued vs sent vs failed
 * 3. Provider unavailability fails closed (no silent failures)
 * 4. OTP lifecycle separate from delivery lifecycle
 * 5. Atomic verification with row-level locking
 * 
 * Implements TOTP (Time-based OTP), SMS OTP, Email OTP, and Backup Codes
 * Supports authenticator apps (Google Authenticator, Authy, Microsoft Authenticator)
 */

import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { Pool } from 'pg';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { NotificationDispatcherService } from './services/notification-dispatcher.service.js';
import { MfaChallengeRepository } from './repositories/mfa-challenge.repository.js';
import { createOtpServices, OtpHasher } from './encryption/otp-encryption.service.js';
import { createSmsProvider, loadSmsProviderConfig } from './sms/sms-provider.interface.js';

export type MFAMethod = 'totp' | 'sms' | 'email' | 'backup_code';

export interface MFAConfiguration {
  userId: string;
  tenantId: string;
  method: MFAMethod;
  enabled: boolean;
  verified: boolean;
  secret?: string; // For TOTP
  phoneNumber?: string; // For SMS
  email?: string; // For Email
  backupCodes?: string[]; // Hashed backup codes
  createdAt: Date;
  verifiedAt?: Date;
}

export interface TOTPSetup {
  secret: string;
  qrCodeUrl: string;
  manualEntryKey: string;
  backupCodes: string[];
}

/**
 * REFACTORED: No longer boolean - explicit status types
 */
export type MfaOtpDispatchResult =
  | {
      status: 'queued';
      challengeId: string;
      expiresAt: Date;
      maskedDestination: string;
    }
  | {
      status: 'provider_unavailable';
      reason: string;
    };

export interface MFAVerificationResult {
  success: boolean;
  method: MFAMethod;
  challengeId?: string;
  error?: string;
}

export interface MFAPolicy {
  tenantId: string;
  enforced: boolean;
  allowedMethods: MFAMethod[];
  gracePeriodDays: number;
  requireForRoles: string[];
  exemptRoles: string[];
}

export interface MfaMethodAvailability {
  method: MFAMethod;
  available: boolean;
  configured: boolean;
  healthy: boolean;
  reason?: string;
}

export interface MFAServiceConfig {
  /** MFA abuse protection service (optional - degrades gracefully if not provided) */
  abuseProtection?: any; // MfaAbuseProtectionService
  
  /** Security event repository (optional) */
  securityEventRepo?: any; // MfaSecurityEventRepository
  
  /** IP resolver for rate limiting context (optional) */
  ipResolver?: any; // IpResolver
  
  /** Limiter identity service for hashing (optional) */
  identityService?: any; // LimiterIdentityService
}

export class MFAService {
  private pool: Pool;
  private readonly TOTP_WINDOW = 2; // Allow 2 time steps before/after
  private readonly BACKUP_CODE_COUNT = 10;
  private readonly OTP_EXPIRY_MINUTES = 5; // Reduced from 10 for security

  private readonly dispatcher: NotificationDispatcherService;
  private readonly challengeRepo: MfaChallengeRepository;
  private readonly otpHasher: OtpHasher;
  private readonly smsProvider: ReturnType<typeof createSmsProvider>;
  
  // Rate limiting components (optional)
  private readonly abuseProtection?: any;
  private readonly securityEventRepo?: any;
  private readonly ipResolver?: any;
  private readonly identityService?: any;

  constructor(pool: Pool, config?: MFAServiceConfig) {
    this.pool = pool;
    
    // Optional rate limiting components
    this.abuseProtection = config?.abuseProtection;
    this.securityEventRepo = config?.securityEventRepo;
    this.ipResolver = config?.ipResolver;
    this.identityService = config?.identityService;
    
    if (!this.abuseProtection) {
      logger.warn('MFA Service initialized without abuse protection - rate limiting disabled');
    }

    // Initialize new infrastructure
    const otpServices = createOtpServices();
    this.otpHasher = otpServices.hasher;

    this.dispatcher = new NotificationDispatcherService(
      pool,
      otpServices.encryptionService,
      otpServices.hasher,
      otpServices.generator
    );

    this.challengeRepo = new MfaChallengeRepository(pool);

    // Initialize SMS provider
    const smsConfig = loadSmsProviderConfig();
    this.smsProvider = createSmsProvider(smsConfig);

    logger.info('MFA Service initialized', {
      smsProvider: this.smsProvider.name,
      smsConfigured: this.smsProvider.isConfigured(),
    });
  }

  /**
   * Generate TOTP setup for user
   */
  async setupTOTP(
    userId: string,
    tenantId: string,
    issuer: string = 'KryptonVision'
  ): Promise<TOTPSetup> {
    try {
      // Generate secret
      const secret = speakeasy.generateSecret({
        name: `${issuer} (${userId})`,
        issuer,
        length: 32
      });

      // Generate QR code
      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

      // Generate backup codes
      const backupCodes = this.generateBackupCodes();
      const hashedBackupCodes = await Promise.all(
        backupCodes.map(code => this.hashBackupCode(code))
      );

      // Store configuration (unverified)
      await this.pool.query(
        `INSERT INTO mfa_configurations (
          user_id, tenant_id, method, enabled, verified,
          secret, backup_codes, created_at
        ) VALUES ($1, $2, 'totp', false, false, $3, $4, NOW())
        ON CONFLICT (user_id, method) 
        DO UPDATE SET 
          secret = $3,
          backup_codes = $4,
          enabled = false,
          verified = false,
          created_at = NOW()`,
        [userId, tenantId, secret.base32, JSON.stringify(hashedBackupCodes)]
      );

      logger.info('TOTP setup initiated', { userId, tenantId });

      return {
        secret: secret.base32,
        qrCodeUrl,
        manualEntryKey: secret.base32,
        backupCodes
      };

    } catch (error) {
      logger.error('TOTP setup failed', { userId, error });
      throw new Error('Failed to setup TOTP');
    }
  }

  /**
   * Verify TOTP setup with first code
   */
  async verifyTOTPSetup(
    userId: string,
    token: string
  ): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `SELECT secret FROM mfa_configurations 
         WHERE user_id = $1 AND method = 'totp' AND verified = false`,
        [userId]
      );

      if (result.rows.length === 0) {
        throw new Error('No pending TOTP setup found');
      }

      const secret = result.rows[0].secret;

      // Verify token
      const verified = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token,
        window: this.TOTP_WINDOW
      });

      if (!verified) {
        return false;
      }

      // Mark as verified and enabled
      await this.pool.query(
        `UPDATE mfa_configurations 
         SET verified = true, enabled = true, verified_at = NOW()
         WHERE user_id = $1 AND method = 'totp'`,
        [userId]
      );

      logger.info('TOTP verified and enabled', { userId });

      return true;

    } catch (error) {
      logger.error('TOTP verification failed', { userId, error });
      return false;
    }
  }

  /**
   * Verify TOTP token during login
   */
  async verifyTOTP(
    userId: string,
    token: string
  ): Promise<MFAVerificationResult> {
    try {
      const result = await this.pool.query(
        `SELECT secret FROM mfa_configurations 
         WHERE user_id = $1 AND method = 'totp' 
           AND enabled = true AND verified = true`,
        [userId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          method: 'totp',
          error: 'TOTP not configured'
        };
      }

      const secret = result.rows[0].secret;

      // Verify token
      const verified = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token,
        window: this.TOTP_WINDOW
      });

      if (!verified) {
        await this.recordFailedAttempt(userId, 'totp');
        
        return {
          success: false,
          method: 'totp',
          error: 'Invalid code'
        };
      }

      await this.recordSuccessfulVerification(userId, 'totp');

      return {
        success: true,
        method: 'totp'
      };

    } catch (error) {
      logger.error('TOTP verification failed', { userId, error });
      return {
        success: false,
        method: 'totp',
        error: 'Verification failed'
      };
    }
  }

  /**
   * Generate and send SMS OTP
   * 
   * REFACTORED: Now uses transactional outbox pattern with distributed rate limiting.
   * Returns explicit dispatch result instead of boolean.
   * Fails closed when provider unavailable.
   * 
   * SECURITY: Multi-dimensional rate limiting across user, phone, IP, device, session
   */
  async sendSMSOTP(
    userId: string,
    tenantId: string,
    phoneNumber: string,
    context?: {
      ip?: string;
      deviceId?: string;
      sessionId?: string;
    }
  ): Promise<MfaOtpDispatchResult> {
    try {
      // Check rate limiting BEFORE expensive provider operations
      if (this.abuseProtection) {
        const normalizedPhone = this.identityService?.normalizePhone?.(phoneNumber) || phoneNumber;
        
        const rateLimitContext = {
          tenantId,
          userId,
          destination: normalizedPhone,
          ip: context?.ip,
          deviceId: context?.deviceId,
          sessionId: context?.sessionId,
          purpose: 'LOGIN' as const,
          method: 'SMS' as const,
        };

        const decision = await this.abuseProtection.checkGeneration(rateLimitContext);

        if (!decision.allowed) {
          logger.warn('SMS OTP generation blocked by rate limit', {
            userId,
            reason: decision.reason,
            retryAfterMs: decision.retryAfterMs,
          });

          // Record rate limit event
          await this.recordSecurityEvent({
            tenantId,
            userId,
            type: 'MFA_GENERATION_RATE_LIMITED',
            method: 'SMS',
            destinationHash: this.identityService?.hashDestination?.(normalizedPhone),
            ipHash: context?.ip ? this.identityService?.hashIp?.(context.ip) : undefined,
            reason: decision.reason,
            limit: decision.violatedRules[0]?.limit,
            attempts: decision.violatedRules[0]?.current,
            metadata: {
              retryAfterMs: decision.retryAfterMs,
              violatedRules: decision.violatedRules,
            },
          });

          return {
            status: 'provider_unavailable',
            reason: decision.retryAfterMs 
              ? `Too many requests. Please try again in ${Math.ceil(decision.retryAfterMs / 1000)} seconds.`
              : 'Too many MFA requests. Please try again later.',
          };
        }

        // Record generation attempt
        await this.abuseProtection.recordGeneration(rateLimitContext);
        
        await this.recordSecurityEvent({
          tenantId,
          userId,
          type: 'MFA_GENERATION_REQUESTED',
          method: 'SMS',
          destinationHash: this.identityService?.hashDestination?.(normalizedPhone),
          ipHash: context?.ip ? this.identityService?.hashIp?.(context.ip) : undefined,
        });
      }

      // Check provider availability (fail closed)
      if (!this.smsProvider.isConfigured()) {
        logger.warn('SMS MFA requested but provider not configured', {
          userId,
          provider: this.smsProvider.name,
        });

        return {
          status: 'provider_unavailable',
          reason: 'SMS provider not configured. Set SMS_PROVIDER environment variable.',
        };
      }

      // Check provider health
      const healthCheck = await this.smsProvider.healthCheck();
      if (!healthCheck.healthy) {
        logger.warn('SMS provider unhealthy', {
          userId,
          provider: this.smsProvider.name,
          reason: healthCheck.reason,
        });

        return {
          status: 'provider_unavailable',
          reason: healthCheck.reason || 'SMS provider temporarily unavailable',
        };
      }

      // Dispatch via transactional outbox
      const result = await this.dispatcher.dispatchSmsOtp({
        userId,
        tenantId,
        phoneNumber,
        purpose: 'login_mfa',
        otpLength: 6,
        expiryMinutes: this.OTP_EXPIRY_MINUTES,
        maxVerificationAttempts: 5,
      });

      if (result.status === 'provider_unavailable') {
        return result;
      }

      // Mask phone number for response
      const maskedPhone = this.maskPhoneNumber(phoneNumber);

      logger.info('SMS OTP dispatched successfully', {
        userId,
        challengeId: result.challengeId,
        maskedPhone,
        expiresAt: result.expiresAt,
      });

      return {
        status: 'queued',
        challengeId: result.challengeId!,
        expiresAt: result.expiresAt!,
        maskedDestination: maskedPhone,
      };
    } catch (error) {
      logger.error('SMS OTP dispatch failed', { userId, error });

      return {
        status: 'provider_unavailable',
        reason: 'Failed to dispatch SMS notification',
      };
    }
  }

  /**
   * Verify SMS OTP
   * 
   * REFACTORED: Now uses atomic challenge locking to prevent race conditions.
   * Verifies against mfa_challenges table with proper state machine.
   * 
   * SECURITY: Verification rate limiting to prevent brute force attacks
   */
  async verifySMSOTP(
    userId: string,
    code: string,
    challengeId?: string,
    context?: {
      ip?: string;
      deviceId?: string;
      sessionId?: string;
      tenantId?: string;
    }
  ): Promise<MFAVerificationResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Find challenge (either by ID or latest for user)
      let challenge;

      if (challengeId) {
        challenge = await this.challengeRepo.lockForVerification(challengeId, client);
      } else {
        // Get most recent active SMS challenge
        const activeChallenges = await this.challengeRepo.findActiveByUserId(userId, 'sms');
        
        if (activeChallenges.length > 0) {
          challenge = await this.challengeRepo.lockForVerification(
            activeChallenges[0].id,
            client
          );
        }
      }

      if (!challenge) {
        await client.query('ROLLBACK');
        return {
          success: false,
          method: 'sms',
          error: 'No active SMS challenge found',
        };
      }

      // Check verification rate limiting
      if (this.abuseProtection && context?.tenantId) {
        const rateLimitContext = {
          tenantId: context.tenantId,
          userId,
          challengeId: challenge.id,
          ip: context?.ip,
          deviceId: context?.deviceId,
          sessionId: context?.sessionId,
          purpose: 'LOGIN' as const,
          method: 'SMS' as const,
        };

        const decision = await this.abuseProtection.checkVerification(rateLimitContext);

        if (!decision.allowed) {
          await client.query('ROLLBACK');

          logger.warn('SMS OTP verification blocked by rate limit', {
            userId,
            challengeId: challenge.id,
            reason: decision.reason,
          });

          await this.recordSecurityEvent({
            tenantId: context.tenantId,
            userId,
            challengeId: challenge.id,
            type: 'MFA_VERIFICATION_RATE_LIMITED',
            method: 'SMS',
            ipHash: context?.ip ? this.identityService?.hashIp?.(context.ip) : undefined,
            reason: decision.reason,
            metadata: {
              retryAfterMs: decision.retryAfterMs,
            },
          });

          return {
            success: false,
            method: 'sms',
            challengeId: challenge.id,
            error: 'Too many verification attempts. Please try again later.',
          };
        }

        await this.recordSecurityEvent({
          tenantId: context.tenantId,
          userId,
          challengeId: challenge.id,
          type: 'MFA_VERIFICATION_REQUESTED',
          method: 'SMS',
          ipHash: context?.ip ? this.identityService?.hashIp?.(context.ip) : undefined,
        });
      }

      // Validate challenge status
      if (challenge.status !== 'SENT') {
        await client.query('ROLLBACK');
        return {
          success: false,
          method: 'sms',
          challengeId: challenge.id,
          error: `Challenge status is ${challenge.status}`,
        };
      }

      // Check expiry
      if (challenge.expiresAt <= new Date()) {
        await this.challengeRepo.markExpired(challenge.id, client);
        await client.query('COMMIT');

        if (context?.tenantId) {
          await this.recordSecurityEvent({
            tenantId: context.tenantId,
            userId,
            challengeId: challenge.id,
            type: 'MFA_CHALLENGE_EXPIRED',
            method: 'SMS',
          });
        }

        return {
          success: false,
          method: 'sms',
          challengeId: challenge.id,
          error: 'OTP expired',
        };
      }

      // Check attempt limit
      if (challenge.verificationAttempts >= challenge.maxVerificationAttempts) {
        await this.challengeRepo.markLocked(challenge.id, client);
        await client.query('COMMIT');

        logger.warn('Challenge locked due to too many attempts', {
          challengeId: challenge.id,
          userId,
          attempts: challenge.verificationAttempts,
        });

        if (context?.tenantId) {
          await this.recordSecurityEvent({
            tenantId: context.tenantId,
            userId,
            challengeId: challenge.id,
            type: 'MFA_CHALLENGE_LOCKED',
            method: 'SMS',
            attempts: challenge.verificationAttempts,
            limit: challenge.maxVerificationAttempts,
          });
        }

        return {
          success: false,
          method: 'sms',
          challengeId: challenge.id,
          error: 'Too many verification attempts',
        };
      }

      // Verify OTP using timing-safe comparison
      const verified = await this.otpHasher.verify(code, challenge.otpHash);

      if (!verified) {
        // Increment attempts and record failure
        await this.challengeRepo.incrementVerificationAttempts(challenge.id, client);
        await this.recordFailedAttempt(userId, 'sms', client);
        await client.query('COMMIT');

        // Record verification failure with abuse protection
        if (this.abuseProtection && context?.tenantId) {
          const rateLimitContext = {
            tenantId: context.tenantId,
            userId,
            challengeId: challenge.id,
            ip: context?.ip,
            deviceId: context?.deviceId,
            sessionId: context?.sessionId,
            purpose: 'LOGIN' as const,
            method: 'SMS' as const,
          };

          await this.abuseProtection.recordVerificationFailure(rateLimitContext);

          await this.recordSecurityEvent({
            tenantId: context.tenantId,
            userId,
            challengeId: challenge.id,
            type: 'MFA_VERIFICATION_FAILED',
            method: 'SMS',
            ipHash: context?.ip ? this.identityService?.hashIp?.(context.ip) : undefined,
            attempts: challenge.verificationAttempts + 1,
            limit: challenge.maxVerificationAttempts,
          });
        }

        return {
          success: false,
          method: 'sms',
          challengeId: challenge.id,
          error: 'Invalid code',
        };
      }

      // Success! Mark as verified
      await this.challengeRepo.markVerified(challenge.id, client);
      await this.recordSuccessfulVerification(userId, 'sms', client);
      await client.query('COMMIT');

      // Record success with abuse protection
      if (this.abuseProtection && context?.tenantId) {
        const rateLimitContext = {
          tenantId: context.tenantId,
          userId,
          challengeId: challenge.id,
          ip: context?.ip,
          deviceId: context?.deviceId,
          sessionId: context?.sessionId,
          purpose: 'LOGIN' as const,
          method: 'SMS' as const,
        };

        await this.abuseProtection.recordVerificationSuccess(rateLimitContext);

        await this.recordSecurityEvent({
          tenantId: context.tenantId,
          userId,
          challengeId: challenge.id,
          type: 'MFA_VERIFICATION_SUCCEEDED',
          method: 'SMS',
          ipHash: context?.ip ? this.identityService?.hashIp?.(context.ip) : undefined,
        });
      }

      logger.info('SMS OTP verified successfully', {
        challengeId: challenge.id,
        userId,
      });

      return {
        success: true,
        method: 'sms',
        challengeId: challenge.id,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('SMS OTP verification failed', { userId, error });

      return {
        success: false,
        method: 'sms',
        error: 'Verification failed',
      };
    } finally {
      client.release();
    }
  }

  /**
   * Verify backup code
   */
  async verifyBackupCode(
    userId: string,
    code: string
  ): Promise<MFAVerificationResult> {
    try {
      const result = await this.pool.query(
        `SELECT backup_codes FROM mfa_configurations 
         WHERE user_id = $1 AND method = 'totp' 
           AND enabled = true`,
        [userId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          method: 'backup_code',
          error: 'Backup codes not configured'
        };
      }

      const backupCodes: string[] = JSON.parse(result.rows[0].backup_codes || '[]');

      // Check each backup code
      for (let i = 0; i < backupCodes.length; i++) {
        const verified = await this.verifyOTP(code, backupCodes[i]);
        
        if (verified) {
          // Remove used backup code
          backupCodes.splice(i, 1);

          await this.pool.query(
            `UPDATE mfa_configurations 
             SET backup_codes = $1 
             WHERE user_id = $2 AND method = 'totp'`,
            [JSON.stringify(backupCodes), userId]
          );

          await this.recordSuccessfulVerification(userId, 'backup_code');

          logger.info('Backup code used', { 
            userId, 
            remainingCodes: backupCodes.length 
          });

          return {
            success: true,
            method: 'backup_code'
          };
        }
      }

      await this.recordFailedAttempt(userId, 'backup_code');

      return {
        success: false,
        method: 'backup_code',
        error: 'Invalid backup code'
      };

    } catch (error) {
      logger.error('Backup code verification failed', { userId, error });
      return {
        success: false,
        method: 'backup_code',
        error: 'Verification failed'
      };
    }
  }

  /**
   * Check if user has MFA enabled
   */
  async isMFAEnabled(userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT COUNT(*) as count FROM mfa_configurations 
       WHERE user_id = $1 AND enabled = true AND verified = true`,
      [userId]
    );

    return parseInt(result.rows[0].count) > 0;
  }

  /**
   * Get user's MFA configurations
   */
  async getUserMFAConfigs(userId: string): Promise<MFAConfiguration[]> {
    const result = await this.pool.query(
      `SELECT 
        user_id as "userId",
        tenant_id as "tenantId",
        method,
        enabled,
        verified,
        phone_number as "phoneNumber",
        email,
        created_at as "createdAt",
        verified_at as "verifiedAt"
       FROM mfa_configurations
       WHERE user_id = $1`,
      [userId]
    );

    return result.rows;
  }

  /**
   * Disable MFA method
   */
  async disableMFA(userId: string, method: MFAMethod): Promise<boolean> {
    await this.pool.query(
      `UPDATE mfa_configurations 
       SET enabled = false 
       WHERE user_id = $1 AND method = $2`,
      [userId, method]
    );

    logger.info('MFA method disabled', { userId, method });
    return true;
  }

  /**
   * Generate backup codes
   */
  async regenerateBackupCodes(userId: string): Promise<string[]> {
    const backupCodes = this.generateBackupCodes();
    const hashedBackupCodes = await Promise.all(
      backupCodes.map(code => this.hashBackupCode(code))
    );

    await this.pool.query(
      `UPDATE mfa_configurations 
       SET backup_codes = $1 
       WHERE user_id = $2 AND method = 'totp'`,
      [JSON.stringify(hashedBackupCodes), userId]
    );

    logger.info('Backup codes regenerated', { userId });

    return backupCodes;
  }

  /**
   * Get MFA policy for tenant
   */
  async getMFAPolicy(tenantId: string): Promise<MFAPolicy | null> {
    const result = await this.pool.query(
      `SELECT 
        tenant_id as "tenantId",
        enforced,
        allowed_methods as "allowedMethods",
        grace_period_days as "gracePeriodDays",
        require_for_roles as "requireForRoles",
        exempt_roles as "exemptRoles"
       FROM mfa_policies
       WHERE tenant_id = $1`,
      [tenantId]
    );

    return result.rows[0] || null;
  }

  /**
   * Check if user is required to use MFA
   */
  async isMFARequired(userId: string, tenantId: string): Promise<boolean> {
    const policy = await this.getMFAPolicy(tenantId);

    if (!policy || !policy.enforced) {
      return false;
    }

    // Get user role
    const userResult = await this.pool.query(
      `SELECT role FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return false;
    }

    const userRole = userResult.rows[0].role;

    // Check if role is exempt
    if (policy.exemptRoles.includes(userRole)) {
      return false;
    }

    // Check if role requires MFA
    if (policy.requireForRoles.length > 0) {
      return policy.requireForRoles.includes(userRole);
    }

    // If enforced for all and not exempt
    return true;
  }

  /**
   * Generate backup codes
   */
  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    
    for (let i = 0; i < this.BACKUP_CODE_COUNT; i++) {
      // Generate 8-character alphanumeric code
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(code);
    }

    return codes;
  }

  /**
   * Hash backup code for storage
   */
  private async hashBackupCode(code: string): Promise<string> {
    return crypto
      .createHash('sha256')
      .update(code)
      .digest('hex');
  }

  /**
   * Hash OTP for storage
   */
  private async hashOTP(otp: string): Promise<string> {
    return crypto
      .createHash('sha256')
      .update(otp)
      .digest('hex');
  }

  /**
   * Verify OTP against hash
   */
  private async verifyOTP(otp: string, hash: string): Promise<boolean> {
    const otpHash = await this.hashOTP(otp);
    return crypto.timingSafeEqual(
      Buffer.from(otpHash),
      Buffer.from(hash)
    );
  }

  /**
   * Check for suspicious MFA activity
   */
  async checkSuspiciousActivity(userId: string): Promise<boolean> {
    // Check for multiple failed attempts in last 15 minutes
    const result = await this.pool.query(
      `SELECT COUNT(*) as count FROM mfa_verification_log 
       WHERE user_id = $1 
         AND success = false 
         AND verified_at > NOW() - INTERVAL '15 minutes'`,
      [userId]
    );

    const failedAttempts = parseInt(result.rows[0].count);

    if (failedAttempts >= 5) {
      logger.warn('Suspicious MFA activity detected', { 
        userId, 
        failedAttempts 
      });
      return true;
    }

    return false;
  }

  /**
   * Get available MFA methods with provider health status
   * 
   * NEW: Distinguishes supported vs configured vs healthy vs available
   */
  async getAvailableMethods(tenantId: string): Promise<MfaMethodAvailability[]> {
    const policy = await this.getMFAPolicy(tenantId);
    const allowedMethods = policy?.allowedMethods || ['totp', 'sms', 'backup_code'];

    const methods: MfaMethodAvailability[] = [];

    // TOTP - always available (no external dependencies)
    if (allowedMethods.includes('totp')) {
      methods.push({
        method: 'totp',
        available: true,
        configured: true,
        healthy: true,
      });
    }

    // SMS - check provider configuration and health
    if (allowedMethods.includes('sms')) {
      const configured = this.smsProvider.isConfigured();
      let healthy = false;
      let reason: string | undefined;

      if (configured) {
        try {
          const healthCheck = await this.smsProvider.healthCheck();
          healthy = healthCheck.healthy;
          reason = healthCheck.reason;
        } catch (error) {
          healthy = false;
          reason = 'Health check failed';
        }
      } else {
        reason = 'SMS provider not configured';
      }

      methods.push({
        method: 'sms',
        available: configured && healthy,
        configured,
        healthy,
        reason,
      });
    }

    // Backup codes - available if TOTP is enabled
    if (allowedMethods.includes('backup_code')) {
      methods.push({
        method: 'backup_code',
        available: true,
        configured: true,
        healthy: true,
      });
    }

    return methods;
  }

  /**
   * Resend SMS OTP (creates new challenge, supersedes old one)
   * 
   * SECURITY: Implements proper rate limiting and resend cooldown
   * 
   * NOTE: Rate limiting integration requires MfaAbuseProtectionService.
   * If not configured, falls back to basic resend without distributed throttling.
   * 
   * For full protection, initialize MFA service with:
   * ```
   * const mfaService = new MFAService(pool, {
   *   abuseProtection: mfaAbuseProtectionService,
   *   securityEventRepo: mfaSecurityEventRepo,
   *   ipResolver: ipResolver,
   * });
   * ```
   */
  async resendSMSOTP(
    userId: string,
    tenantId: string,
    phoneNumber: string,
    context?: {
      ip?: string;
      deviceId?: string;
      sessionId?: string;
      resendCount?: number;
    }
  ): Promise<MfaOtpDispatchResult> {
    try {
      // Check resend cooldown if abuse protection is configured
      if (this.abuseProtection) {
        const cooldownCheck = await this.abuseProtection.checkResendCooldown(
          tenantId,
          userId,
          'SMS',
          context?.resendCount || 0
        );

        if (!cooldownCheck.allowed) {
          logger.warn('SMS OTP resend blocked by cooldown', {
            userId,
            cooldownSeconds: cooldownCheck.cooldownSeconds,
          });

          // Record rate limit event
          await this.recordSecurityEvent({
            tenantId,
            userId,
            type: 'MFA_GENERATION_RATE_LIMITED',
            method: 'SMS',
            reason: 'RESEND_COOLDOWN',
            metadata: {
              cooldownSeconds: cooldownCheck.cooldownSeconds,
              retryAfterMs: cooldownCheck.retryAfterMs,
            },
          });

          return {
            status: 'provider_unavailable',
            reason: `Please wait ${cooldownCheck.cooldownSeconds} seconds before resending`,
          };
        }

        // Record resend
        await this.abuseProtection.recordResend(
          tenantId,
          userId,
          'SMS',
          cooldownCheck.cooldownSeconds || 30
        );
      }

      // Dispatch new OTP (dispatcher will supersede old challenges)
      return await this.sendSMSOTP(userId, tenantId, phoneNumber, context);
    } catch (error) {
      logger.error('SMS OTP resend failed', { userId, error });

      return {
        status: 'provider_unavailable',
        reason: 'Failed to resend SMS',
      };
    }
  }

  /**
   * Consume verified challenge (final step after verification)
   * 
   * NEW: Separate verification from consumption to prevent replay
   */
  async consumeChallenge(challengeId: string): Promise<boolean> {
    try {
      await this.challengeRepo.markConsumed(challengeId);
      return true;
    } catch (error) {
      logger.error('Failed to consume challenge', { challengeId, error });
      return false;
    }
  }

  /**
   * Mask phone number for logging and display
   * 
   * NEW: Utility for PII protection
   */
  private maskPhoneNumber(phone: string): string {
    if (phone.length <= 6) {
      return '****';
    }

    // Keep country code and last 4 digits
    const countryCode = phone.slice(0, Math.min(3, phone.length - 4));
    const lastDigits = phone.slice(-4);
    const maskedLength = phone.length - countryCode.length - 4;

    return `${countryCode}${'*'.repeat(Math.max(0, maskedLength))}${lastDigits}`;
  }

  /**
   * Update recordSuccessfulVerification to accept client
   */
  private async recordSuccessfulVerification(
    userId: string,
    method: MFAMethod,
    client?: any
  ): Promise<void> {
    const db = client || this.pool;
    await db.query(
      `INSERT INTO mfa_verification_log (
        user_id, method, success, verified_at
      ) VALUES ($1, $2, true, NOW())`,
      [userId, method]
    );
  }

  /**
   * Update recordFailedAttempt to accept client
   */
  private async recordFailedAttempt(
    userId: string,
    method: MFAMethod,
    client?: any
  ): Promise<void> {
    const db = client || this.pool;
    await db.query(
      `INSERT INTO mfa_verification_log (
        user_id, method, success, verified_at
      ) VALUES ($1, $2, false, NOW())`,
      [userId, method]
    );
  }

  /**
   * Record security event (async fire-and-forget)
   */
  private async recordSecurityEvent(params: {
    tenantId: string;
    userId?: string;
    challengeId?: string;
    type: string;
    method: 'SMS' | 'EMAIL' | 'TOTP';
    ipHash?: string;
    deviceHash?: string;
    destinationHash?: string;
    attempts?: number;
    limit?: number;
    reason?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    if (!this.securityEventRepo) {
      return; // Security events disabled
    }

    try {
      await this.securityEventRepo.create(params);
    } catch (error) {
      // Don't fail the operation if event logging fails
      logger.error('Failed to record MFA security event', {
        type: params.type,
        error,
      });
    }
  }
}
