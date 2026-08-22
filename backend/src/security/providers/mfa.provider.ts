/**
 * MFA Provider
 * Multi-Factor Authentication with TOTP, SMS, and backup codes
 */

import {
  IMFAProvider,
  ProviderContext,
  MFAVerificationResult,
  MFAMethod,
  TOTPSecret,
  BackupCode,
  SecurityVerdict
} from './types';
import crypto from 'crypto';

interface MFAEnrollment {
  userId: string;
  method: MFAMethod;
  enabled: boolean;
  enrolledAt: Date;
  lastUsedAt?: Date;
}

interface MFAVerification {
  userId: string;
  sessionId: string;
  method: MFAMethod;
  verifiedAt: Date;
  expiresAt: Date;
}

export class MFAProvider implements IMFAProvider {
  readonly name = 'MFAProvider';
  readonly version = '1.0.0';

  private totpSecrets: Map<string, TOTPSecret> = new Map();
  private backupCodes: Map<string, BackupCode[]> = new Map();
  private enrollments: Map<string, MFAEnrollment[]> = new Map();
  private verifications: Map<string, MFAVerification> = new Map();

  private readonly MFA_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes
  private readonly TOTP_WINDOW = 1; // Allow 1 step before/after current time
  private readonly BACKUP_CODE_COUNT = 10;

  /**
   * Verify MFA status for access request
   */
  async verify(context: ProviderContext): Promise<MFAVerificationResult> {
    const startTime = Date.now();
    let score = 0;
    const evidence: Record<string, any> = {};
    const reasons: string[] = [];

    // 1. Check if MFA is enabled for user
    const enrolledMethods = this.enrollments.get(context.userId) || [];
    const mfaEnabled = enrolledMethods.some(e => e.enabled);
    evidence.mfaEnabled = mfaEnabled;
    evidence.enrolledMethods = enrolledMethods.map(e => e.method);

    if (!mfaEnabled) {
      score += 40;
      reasons.push('MFA is not enabled for this user');
    }

    // 2. Check if MFA has been verified for this session
    const verification = this.verifications.get(context.sessionId);
    const mfaVerified = verification !== undefined && verification.expiresAt > new Date();
    evidence.mfaVerified = mfaVerified;

    if (mfaEnabled && !mfaVerified) {
      score += 60;
      reasons.push('MFA verification required but not completed');
    }

    // 3. Check time since last MFA verification
    let lastMFATime: Date | undefined;
    let timeSinceMFA: number | undefined;

    if (verification) {
      lastMFATime = verification.verifiedAt;
      timeSinceMFA = Date.now() - lastMFATime.getTime();
      evidence.lastMFATime = lastMFATime;
      evidence.timeSinceMFAMinutes = Math.round(timeSinceMFA / 60000);

      // If MFA verification is old, increase risk
      if (timeSinceMFA > 60 * 60 * 1000) { // 1 hour
        score += 20;
        reasons.push('MFA verification is over 1 hour old');
      } else if (timeSinceMFA > 30 * 60 * 1000) { // 30 minutes
        score += 10;
        reasons.push('MFA verification is over 30 minutes old');
      }
    }

    // 4. Check for backup codes usage
    const userBackupCodes = this.backupCodes.get(context.userId) || [];
    const remainingBackupCodes = userBackupCodes.filter(c => !c.used).length;
    evidence.backupCodesRemaining = remainingBackupCodes;

    if (mfaEnabled && remainingBackupCodes === 0) {
      score += 15;
      reasons.push('No backup codes remaining');
    } else if (mfaEnabled && remainingBackupCodes <= 3) {
      score += 5;
      reasons.push(`Only ${remainingBackupCodes} backup codes remaining`);
    }

    // 5. Check last used method
    let mfaMethod: MFAMethod | undefined;
    if (verification) {
      mfaMethod = verification.method;
      evidence.lastMethod = mfaMethod;

      // TOTP is more secure than SMS
      if (mfaMethod === MFAMethod.SMS || mfaMethod === MFAMethod.EMAIL) {
        score += 10;
        reasons.push('Using less secure MFA method (SMS/Email)');
      }
    }

    // 6. Check enrollment recency
    const recentEnrollments = enrolledMethods.filter(
      e => Date.now() - e.enrolledAt.getTime() < 24 * 60 * 60 * 1000
    );
    if (recentEnrollments.length > 0) {
      score += 5;
      reasons.push('Recent MFA enrollment detected');
    }

    // Determine verdict
    let verdict: SecurityVerdict;
    let confidence = 0.95;
    const requiredActions: string[] = [];

    if (!mfaEnabled) {
      verdict = SecurityVerdict.CHALLENGE;
      requiredActions.push('ENROLL_MFA');
      confidence = 0.9;
    } else if (!mfaVerified) {
      verdict = SecurityVerdict.CHALLENGE;
      requiredActions.push('VERIFY_MFA');
      confidence = 1.0;
    } else if (score >= 40) {
      verdict = SecurityVerdict.REVIEW;
      confidence = 0.85;
    } else if (score >= 20) {
      verdict = SecurityVerdict.ALLOW;
      confidence = 0.9;
    } else {
      verdict = SecurityVerdict.ALLOW;
      confidence = 0.95;
    }

    if (remainingBackupCodes <= 3 && remainingBackupCodes > 0) {
      requiredActions.push('REGENERATE_BACKUP_CODES');
    }

    evidence.processingTimeMs = Date.now() - startTime;

    return {
      verdict,
      score: Math.min(score, 100),
      confidence,
      reason: reasons.length > 0 ? reasons.join('; ') : 'MFA verification passed',
      evidence,
      mfaEnabled,
      mfaVerified,
      mfaMethod,
      lastMFATime,
      backupCodesRemaining: mfaEnabled ? remainingBackupCodes : undefined,
      requiredActions: requiredActions.length > 0 ? requiredActions : undefined
    };
  }

  /**
   * Enroll user in MFA
   */
  async enrollMFA(userId: string, method: MFAMethod): Promise<{ secret?: string; backupCodes?: string[] }> {
    const result: { secret?: string; backupCodes?: string[] } = {};

    // Get or create enrollments
    const enrollments = this.enrollments.get(userId) || [];

    // Check if already enrolled in this method
    const existing = enrollments.find(e => e.method === method);
    if (existing) {
      existing.enabled = true;
      existing.enrolledAt = new Date();
    } else {
      enrollments.push({
        userId,
        method,
        enabled: true,
        enrolledAt: new Date()
      });
      this.enrollments.set(userId, enrollments);
    }

    // Generate secrets/codes based on method
    switch (method) {
      case MFAMethod.TOTP:
        result.secret = await this.generateTOTPSecret(userId);
        result.backupCodes = await this.generateBackupCodes(userId);
        break;

      case MFAMethod.SMS:
      case MFAMethod.EMAIL:
        result.backupCodes = await this.generateBackupCodes(userId);
        break;

      case MFAMethod.HARDWARE_TOKEN:
      case MFAMethod.BIOMETRIC:
        // These require external setup
        break;
    }

    console.log(`✓ User ${userId} enrolled in MFA method: ${method}`);

    return result;
  }

  /**
   * Verify TOTP token
   */
  async verifyTOTP(userId: string, token: string): Promise<boolean> {
    const secret = this.totpSecrets.get(userId);

    if (!secret) {
      return false;
    }

    // Get current time window
    const now = Math.floor(Date.now() / 1000);
    const counter = Math.floor(now / secret.period);

    // Check current window and adjacent windows
    for (let i = -this.TOTP_WINDOW; i <= this.TOTP_WINDOW; i++) {
      const testCounter = counter + i;
      const expectedToken = this.generateTOTPToken(secret.secret, testCounter, secret.digits, secret.algorithm);

      if (token === expectedToken) {
        // Update last used
        secret.lastUsedAt = new Date();
        
        // Update enrollment
        const enrollments = this.enrollments.get(userId) || [];
        const totpEnrollment = enrollments.find(e => e.method === MFAMethod.TOTP);
        if (totpEnrollment) {
          totpEnrollment.lastUsedAt = new Date();
        }

        return true;
      }
    }

    return false;
  }

  /**
   * Verify backup code
   */
  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    const userBackupCodes = this.backupCodes.get(userId) || [];
    const codeHash = this.hashBackupCode(code);

    const backupCode = userBackupCodes.find(c => c.codeHash === codeHash && !c.used);

    if (!backupCode) {
      return false;
    }

    // Mark code as used
    backupCode.used = true;
    backupCode.usedAt = new Date();

    console.log(`⚠️ Backup code used by user ${userId}. Remaining: ${userBackupCodes.filter(c => !c.used).length}`);

    return true;
  }

  /**
   * Generate backup codes
   */
  async generateBackupCodes(userId: string): Promise<string[]> {
    const codes: string[] = [];
    const backupCodes: BackupCode[] = [];

    for (let i = 0; i < this.BACKUP_CODE_COUNT; i++) {
      const code = this.generateBackupCode();
      codes.push(code);

      backupCodes.push({
        userId,
        codeHash: this.hashBackupCode(code),
        used: false,
        createdAt: new Date()
      });
    }

    // Replace existing backup codes
    this.backupCodes.set(userId, backupCodes);

    console.log(`✓ Generated ${this.BACKUP_CODE_COUNT} backup codes for user ${userId}`);

    return codes;
  }

  /**
   * Record MFA verification for session
   */
  async recordVerification(
    userId: string,
    sessionId: string,
    method: MFAMethod,
    durationMs: number = 8 * 60 * 60 * 1000 // 8 hours default
  ): Promise<void> {
    const verification: MFAVerification = {
      userId,
      sessionId,
      method,
      verifiedAt: new Date(),
      expiresAt: new Date(Date.now() + durationMs)
    };

    this.verifications.set(sessionId, verification);

    console.log(`✓ MFA verified for session ${sessionId} using ${method}`);
  }

  /**
   * Check if MFA is verified for session
   */
  async isVerified(sessionId: string): Promise<boolean> {
    const verification = this.verifications.get(sessionId);

    if (!verification) {
      return false;
    }

    return verification.expiresAt > new Date();
  }

  /**
   * Invalidate MFA verification
   */
  async invalidateVerification(sessionId: string): Promise<void> {
    this.verifications.delete(sessionId);
  }

  /**
   * Disable MFA for user
   */
  async disableMFA(userId: string, method?: MFAMethod): Promise<void> {
    const enrollments = this.enrollments.get(userId) || [];

    if (method) {
      // Disable specific method
      const enrollment = enrollments.find(e => e.method === method);
      if (enrollment) {
        enrollment.enabled = false;
      }
    } else {
      // Disable all methods
      enrollments.forEach(e => e.enabled = false);
      
      // Clear TOTP secret
      this.totpSecrets.delete(userId);
      
      // Clear backup codes
      this.backupCodes.delete(userId);
    }

    console.log(`⚠️ MFA disabled for user ${userId}${method ? ` (method: ${method})` : ''}`);
  }

  /**
   * Get user's MFA status
   */
  async getMFAStatus(userId: string): Promise<{
    enabled: boolean;
    methods: MFAMethod[];
    backupCodesRemaining: number;
  }> {
    const enrollments = this.enrollments.get(userId) || [];
    const enabledEnrollments = enrollments.filter(e => e.enabled);
    const backupCodes = this.backupCodes.get(userId) || [];

    return {
      enabled: enabledEnrollments.length > 0,
      methods: enabledEnrollments.map(e => e.method),
      backupCodesRemaining: backupCodes.filter(c => !c.used).length
    };
  }

  /**
   * Send MFA challenge (SMS/Email)
   */
  async sendChallenge(userId: string, method: MFAMethod): Promise<string> {
    // Generate a challenge code
    const code = crypto.randomInt(100000, 999999).toString();
    
    // In production, send via SMS/Email service
    console.log(`📱 MFA challenge sent to user ${userId} via ${method}: ${code}`);

    // Store challenge temporarily (in production, use Redis with TTL)
    // For now, we'll just return the code for verification
    return code;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    // Clean up expired verifications
    await this.cleanupExpiredVerifications();
    
    return true;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async generateTOTPSecret(userId: string): Promise<string> {
    const secret = crypto.randomBytes(20).toString('base32');

    const totpSecret: TOTPSecret = {
      userId,
      secret,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      createdAt: new Date()
    };

    this.totpSecrets.set(userId, totpSecret);

    return secret;
  }

  private generateTOTPToken(
    secret: string,
    counter: number,
    digits: number,
    algorithm: 'SHA1' | 'SHA256' | 'SHA512'
  ): string {
    // Convert secret from base32 to buffer
    const secretBuffer = Buffer.from(secret, 'base32');

    // Convert counter to 8-byte buffer
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));

    // Generate HMAC
    const hmacAlgorithm = algorithm.toLowerCase().replace('sha', 'sha');
    const hmac = crypto.createHmac(hmacAlgorithm, secretBuffer);
    hmac.update(counterBuffer);
    const hmacResult = hmac.digest();

    // Dynamic truncation
    const offset = hmacResult[hmacResult.length - 1] & 0x0f;
    const code = (
      ((hmacResult[offset] & 0x7f) << 24) |
      ((hmacResult[offset + 1] & 0xff) << 16) |
      ((hmacResult[offset + 2] & 0xff) << 8) |
      (hmacResult[offset + 3] & 0xff)
    );

    // Generate token
    const token = (code % Math.pow(10, digits)).toString().padStart(digits, '0');

    return token;
  }

  private generateBackupCode(): string {
    // Generate format: XXXX-XXXX-XXXX
    const segments = [];
    for (let i = 0; i < 3; i++) {
      const segment = crypto.randomInt(0, 10000).toString().padStart(4, '0');
      segments.push(segment);
    }
    return segments.join('-');
  }

  private hashBackupCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  private async cleanupExpiredVerifications(): Promise<void> {
    const now = new Date();
    const expiredSessions: string[] = [];

    for (const [sessionId, verification] of this.verifications.entries()) {
      if (verification.expiresAt <= now) {
        expiredSessions.push(sessionId);
      }
    }

    expiredSessions.forEach(sessionId => this.verifications.delete(sessionId));

    if (expiredSessions.length > 0) {
      console.log(`🧹 Cleaned up ${expiredSessions.length} expired MFA verifications`);
    }
  }

  /**
   * Get TOTP provisioning URI for QR code generation
   */
  getProvisioningURI(userId: string, issuer: string = 'OmSystems'): string | null {
    const secret = this.totpSecrets.get(userId);

    if (!secret) {
      return null;
    }

    const label = encodeURIComponent(`${issuer}:${userId}`);
    const params = new URLSearchParams({
      secret: secret.secret,
      issuer: issuer,
      algorithm: secret.algorithm,
      digits: secret.digits.toString(),
      period: secret.period.toString()
    });

    return `otpauth://totp/${label}?${params.toString()}`;
  }

  /**
   * Get MFA statistics
   */
  async getMFAStats(): Promise<{
    totalEnrolled: number;
    byMethod: Record<MFAMethod, number>;
    activeVerifications: number;
  }> {
    const stats = {
      totalEnrolled: 0,
      byMethod: {
        [MFAMethod.TOTP]: 0,
        [MFAMethod.SMS]: 0,
        [MFAMethod.EMAIL]: 0,
        [MFAMethod.BACKUP_CODE]: 0,
        [MFAMethod.HARDWARE_TOKEN]: 0,
        [MFAMethod.BIOMETRIC]: 0
      },
      activeVerifications: 0
    };

    // Count enrollments
    for (const enrollments of this.enrollments.values()) {
      const enabled = enrollments.filter(e => e.enabled);
      if (enabled.length > 0) {
        stats.totalEnrolled++;
        enabled.forEach(e => stats.byMethod[e.method]++);
      }
    }

    // Count active verifications
    const now = new Date();
    for (const verification of this.verifications.values()) {
      if (verification.expiresAt > now) {
        stats.activeVerifications++;
      }
    }

    return stats;
  }
}
