/**
 * Multi-Factor Authentication Service
 * Implements TOTP (Time-based OTP), SMS OTP, Email OTP, and Backup Codes
 * Supports authenticator apps (Google Authenticator, Authy, Microsoft Authenticator)
 */

import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { Pool } from 'pg';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';

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

export interface MFAVerificationResult {
  success: boolean;
  method: MFAMethod;
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

export class MFAService {
  private pool: Pool;
  private readonly TOTP_WINDOW = 2; // Allow 2 time steps before/after
  private readonly BACKUP_CODE_COUNT = 10;
  private readonly OTP_EXPIRY_MINUTES = 10;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Generate TOTP setup for user
   */
  async setupTOTP(
    userId: string,
    tenantId: string,
    issuer: string = 'Sentinel Grid'
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
   */
  async sendSMSOTP(
    userId: string,
    tenantId: string,
    phoneNumber: string
  ): Promise<boolean> {
    try {
      // Generate 6-digit OTP
      const otp = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

      // Hash OTP for storage
      const hashedOTP = await this.hashOTP(otp);

      // Store OTP
      await this.pool.query(
        `INSERT INTO mfa_otp_codes (
          user_id, tenant_id, method, code_hash, 
          phone_number, expires_at, created_at
        ) VALUES ($1, $2, 'sms', $3, $4, $5, NOW())`,
        [userId, tenantId, hashedOTP, phoneNumber, expiresAt]
      );

      // TODO: Integrate with SMS provider (Twilio, MSG91, etc.)
      // For now, log the OTP (remove in production)
      logger.info('SMS OTP generated', { 
        userId, 
        phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
        otp: process.env.NODE_ENV === 'development' ? otp : '[REDACTED]'
      });

      return true;

    } catch (error) {
      logger.error('SMS OTP generation failed', { userId, error });
      return false;
    }
  }

  /**
   * Verify SMS OTP
   */
  async verifySMSOTP(
    userId: string,
    code: string
  ): Promise<MFAVerificationResult> {
    try {
      const result = await this.pool.query(
        `SELECT id, code_hash, expires_at, used 
         FROM mfa_otp_codes 
         WHERE user_id = $1 AND method = 'sms'
           AND used = false
         ORDER BY created_at DESC 
         LIMIT 1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          method: 'sms',
          error: 'No OTP found'
        };
      }

      const record = result.rows[0];

      // Check expiry
      if (new Date(record.expires_at) < new Date()) {
        return {
          success: false,
          method: 'sms',
          error: 'OTP expired'
        };
      }

      // Verify OTP
      const verified = await this.verifyOTP(code, record.code_hash);

      if (!verified) {
        await this.recordFailedAttempt(userId, 'sms');
        
        return {
          success: false,
          method: 'sms',
          error: 'Invalid code'
        };
      }

      // Mark as used
      await this.pool.query(
        `UPDATE mfa_otp_codes SET used = true WHERE id = $1`,
        [record.id]
      );

      await this.recordSuccessfulVerification(userId, 'sms');

      return {
        success: true,
        method: 'sms'
      };

    } catch (error) {
      logger.error('SMS OTP verification failed', { userId, error });
      return {
        success: false,
        method: 'sms',
        error: 'Verification failed'
      };
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
   * Record successful MFA verification
   */
  private async recordSuccessfulVerification(
    userId: string,
    method: MFAMethod
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO mfa_verification_log (
        user_id, method, success, verified_at
      ) VALUES ($1, $2, true, NOW())`,
      [userId, method]
    );
  }

  /**
   * Record failed MFA attempt
   */
  private async recordFailedAttempt(
    userId: string,
    method: MFAMethod
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO mfa_verification_log (
        user_id, method, success, verified_at
      ) VALUES ($1, $2, false, NOW())`,
      [userId, method]
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
}
