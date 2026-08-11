/**
 * MFA Challenge Repository
 * 
 * Manages MFA challenge lifecycle with proper state machine transitions.
 * Uses row-level locking (SELECT FOR UPDATE) for atomic verification.
 * 
 * State machine:
 * CREATED → QUEUED → SENDING → SENT → VERIFIED → CONSUMED
 * 
 * Failure paths:
 * SENDING → DELIVERY_FAILED
 * CREATED → PROVIDER_UNAVAILABLE
 * SENT → EXPIRED
 * SENT → LOCKED (too many attempts)
 * VERIFIED → SUPERSEDED (when resending)
 */

import { Pool, PoolClient } from 'pg';
import { logger } from '../../utils/logger.js';

export type ChallengeStatus =
  | 'CREATED'
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'VERIFIED'
  | 'CONSUMED'
  | 'EXPIRED'
  | 'LOCKED'
  | 'DELIVERY_FAILED'
  | 'PROVIDER_UNAVAILABLE'
  | 'SUPERSEDED';

export type ChallengeMethod = 'sms' | 'email' | 'totp';

export type ChallengePurpose =
  | 'login_mfa'
  | 'setup_verification'
  | 'password_reset'
  | 'sensitive_operation';

export interface MfaChallenge {
  id: string;
  tenantId: string;
  userId: string;
  method: ChallengeMethod;
  purpose: ChallengePurpose;
  destinationHash: string;
  otpHash: string;
  otpCiphertext: string | null;
  status: ChallengeStatus;
  verificationAttempts: number;
  maxVerificationAttempts: number;
  sendAttempts: number;
  maxSendAttempts: number;
  expiresAt: Date;
  verifiedAt: Date | null;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  provider: string | null;
  providerMessageId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

export interface CreateChallengeParams {
  id?: string;
  tenantId: string;
  userId: string;
  method: ChallengeMethod;
  purpose: ChallengePurpose;
  destinationHash: string;
  otpHash: string;
  otpCiphertext: string;
  status: ChallengeStatus;
  expiresAt: Date;
  maxVerificationAttempts?: number;
  maxSendAttempts?: number;
}

export interface ChallengeVerificationResult {
  valid: boolean;
  challenge?: MfaChallenge;
  reason?: 'not_found' | 'invalid_status' | 'expired' | 'locked' | 'invalid_code';
}

export class MfaChallengeRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Create new MFA challenge
   */
  async create(
    params: CreateChallengeParams,
    client?: PoolClient
  ): Promise<MfaChallenge> {
    const db = client || this.pool;

    const result = await db.query(
      `INSERT INTO mfa_challenges (
        id, tenant_id, user_id, method, purpose,
        destination_hash, otp_hash, otp_ciphertext,
        status, expires_at,
        max_verification_attempts, max_send_attempts
      ) VALUES (
        COALESCE($1, gen_random_uuid()), $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10,
        $11, $12
      ) RETURNING *`,
      [
        params.id,
        params.tenantId,
        params.userId,
        params.method,
        params.purpose,
        params.destinationHash,
        params.otpHash,
        params.otpCiphertext,
        params.status,
        params.expiresAt,
        params.maxVerificationAttempts || 5,
        params.maxSendAttempts || 3,
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Find challenge by ID
   */
  async findById(
    challengeId: string,
    client?: PoolClient
  ): Promise<MfaChallenge | null> {
    const db = client || this.pool;

    const result = await db.query(
      `SELECT * FROM mfa_challenges WHERE id = $1`,
      [challengeId]
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Lock challenge for verification (SELECT FOR UPDATE)
   * 
   * CRITICAL: This prevents race conditions during concurrent verification attempts.
   * Must be called within a transaction.
   */
  async lockForVerification(
    challengeId: string,
    client: PoolClient
  ): Promise<MfaChallenge | null> {
    const result = await client.query(
      `SELECT * FROM mfa_challenges 
       WHERE id = $1 
       FOR UPDATE`,
      [challengeId]
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Get active challenges for user
   */
  async findActiveByUserId(
    userId: string,
    method?: ChallengeMethod
  ): Promise<MfaChallenge[]> {
    const query = method
      ? `SELECT * FROM mfa_challenges 
         WHERE user_id = $1 AND method = $2
           AND status IN ('SENT', 'QUEUED', 'SENDING')
           AND expires_at > NOW()
         ORDER BY created_at DESC`
      : `SELECT * FROM mfa_challenges 
         WHERE user_id = $1
           AND status IN ('SENT', 'QUEUED', 'SENDING')
           AND expires_at > NOW()
         ORDER BY created_at DESC`;

    const params = method ? [userId, method] : [userId];
    const result = await this.pool.query(query, params);

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Update challenge status
   */
  async updateStatus(
    challengeId: string,
    status: ChallengeStatus,
    client?: PoolClient
  ): Promise<void> {
    const db = client || this.pool;

    await db.query(
      `UPDATE mfa_challenges 
       SET status = $1, updated_at = NOW()
       WHERE id = $2`,
      [status, challengeId]
    );
  }

  /**
   * Mark challenge as sent (after successful delivery)
   */
  async markSent(
    challengeId: string,
    provider: string,
    providerMessageId: string,
    client?: PoolClient
  ): Promise<void> {
    const db = client || this.pool;

    await db.query(
      `UPDATE mfa_challenges 
       SET status = 'SENT',
           provider = $2,
           provider_message_id = $3,
           send_attempts = send_attempts + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [challengeId, provider, providerMessageId]
    );

    logger.info('MFA challenge marked as sent', {
      challengeId,
      provider,
      providerMessageId,
    });
  }

  /**
   * Mark challenge as delivery failed
   */
  async markDeliveryFailed(
    challengeId: string,
    errorCode: string,
    errorMessage: string,
    client?: PoolClient
  ): Promise<void> {
    const db = client || this.pool;

    await db.query(
      `UPDATE mfa_challenges 
       SET status = 'DELIVERY_FAILED',
           last_error_code = $2,
           last_error_message = $3,
           send_attempts = send_attempts + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [challengeId, errorCode, errorMessage]
    );

    logger.warn('MFA challenge delivery failed', {
      challengeId,
      errorCode,
      errorMessage,
    });
  }

  /**
   * Increment verification attempts
   */
  async incrementVerificationAttempts(
    challengeId: string,
    client?: PoolClient
  ): Promise<void> {
    const db = client || this.pool;

    await db.query(
      `UPDATE mfa_challenges 
       SET verification_attempts = verification_attempts + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [challengeId]
    );
  }

  /**
   * Mark challenge as verified
   */
  async markVerified(
    challengeId: string,
    client?: PoolClient
  ): Promise<void> {
    const db = client || this.pool;

    await db.query(
      `UPDATE mfa_challenges 
       SET status = 'VERIFIED',
           verified_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [challengeId]
    );

    logger.info('MFA challenge verified', { challengeId });
  }

  /**
   * Mark challenge as consumed (after successful authentication)
   */
  async markConsumed(
    challengeId: string,
    client?: PoolClient
  ): Promise<void> {
    const db = client || this.pool;

    await db.query(
      `UPDATE mfa_challenges 
       SET status = 'CONSUMED',
           consumed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [challengeId]
    );

    logger.info('MFA challenge consumed', { challengeId });
  }

  /**
   * Mark challenge as expired
   */
  async markExpired(
    challengeId: string,
    client?: PoolClient
  ): Promise<void> {
    const db = client || this.pool;

    await db.query(
      `UPDATE mfa_challenges 
       SET status = 'EXPIRED',
           updated_at = NOW()
       WHERE id = $1`,
      [challengeId]
    );
  }

  /**
   * Mark challenge as locked (too many attempts)
   */
  async markLocked(
    challengeId: string,
    client?: PoolClient
  ): Promise<void> {
    const db = client || this.pool;

    await db.query(
      `UPDATE mfa_challenges 
       SET status = 'LOCKED',
           updated_at = NOW()
       WHERE id = $1`,
      [challengeId]
    );

    logger.warn('MFA challenge locked due to too many attempts', {
      challengeId,
    });
  }

  /**
   * Mark challenge as superseded (when resending)
   */
  async markSuperseded(
    challengeId: string,
    client?: PoolClient
  ): Promise<void> {
    const db = client || this.pool;

    await db.query(
      `UPDATE mfa_challenges 
       SET status = 'SUPERSEDED',
           updated_at = NOW()
       WHERE id = $1`,
      [challengeId]
    );
  }

  /**
   * Clear OTP ciphertext after successful delivery
   * SECURITY: This ensures encrypted OTP is only stored while needed for delivery
   */
  async clearOtpCiphertext(
    challengeId: string,
    client?: PoolClient
  ): Promise<void> {
    const db = client || this.pool;

    await db.query(
      `UPDATE mfa_challenges 
       SET otp_ciphertext = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [challengeId]
    );

    logger.debug('OTP ciphertext cleared', { challengeId });
  }

  /**
   * Supersede all active challenges for user/method (when resending)
   */
  async supersedActiveForUser(
    userId: string,
    method: ChallengeMethod,
    client?: PoolClient
  ): Promise<number> {
    const db = client || this.pool;

    const result = await db.query(
      `UPDATE mfa_challenges 
       SET status = 'SUPERSEDED',
           updated_at = NOW()
       WHERE user_id = $1 
         AND method = $2
         AND status IN ('SENT', 'QUEUED', 'SENDING')
         AND expires_at > NOW()`,
      [userId, method]
    );

    const supersededCount = result.rowCount || 0;

    if (supersededCount > 0) {
      logger.info('Superseded active challenges for resend', {
        userId,
        method,
        count: supersededCount,
      });
    }

    return supersededCount;
  }

  /**
   * Clean up expired challenges (background job)
   */
  async markExpiredChallenges(): Promise<number> {
    const result = await this.pool.query(
      `UPDATE mfa_challenges 
       SET status = 'EXPIRED',
           updated_at = NOW()
       WHERE status IN ('SENT', 'QUEUED', 'SENDING')
         AND expires_at <= NOW()`
    );

    const expiredCount = result.rowCount || 0;

    if (expiredCount > 0) {
      logger.info('Marked expired challenges', { count: expiredCount });
    }

    return expiredCount;
  }

  /**
   * Get challenges requiring cleanup (old consumed/expired/failed)
   */
  async findForCleanup(daysOld: number = 30): Promise<string[]> {
    const result = await this.pool.query(
      `SELECT id FROM mfa_challenges 
       WHERE created_at < NOW() - INTERVAL '${daysOld} days'
         AND status IN ('CONSUMED', 'EXPIRED', 'LOCKED', 'DELIVERY_FAILED')
         AND otp_ciphertext IS NULL`
    );

    return result.rows.map(row => row.id);
  }

  /**
   * Delete old challenges (cleanup job)
   */
  async deleteOldChallenges(daysOld: number = 30): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM mfa_challenges 
       WHERE created_at < NOW() - INTERVAL '${daysOld} days'
         AND status IN ('CONSUMED', 'EXPIRED', 'LOCKED', 'DELIVERY_FAILED')
         AND otp_ciphertext IS NULL`
    );

    const deletedCount = result.rowCount || 0;

    if (deletedCount > 0) {
      logger.info('Deleted old MFA challenges', { count: deletedCount });
    }

    return deletedCount;
  }

  /**
   * Map database row to MfaChallenge
   */
  private mapRow(row: any): MfaChallenge {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      method: row.method,
      purpose: row.purpose,
      destinationHash: row.destination_hash,
      otpHash: row.otp_hash,
      otpCiphertext: row.otp_ciphertext,
      status: row.status,
      verificationAttempts: row.verification_attempts,
      maxVerificationAttempts: row.max_verification_attempts,
      sendAttempts: row.send_attempts,
      maxSendAttempts: row.max_send_attempts,
      expiresAt: new Date(row.expires_at),
      verifiedAt: row.verified_at ? new Date(row.verified_at) : null,
      consumedAt: row.consumed_at ? new Date(row.consumed_at) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      provider: row.provider,
      providerMessageId: row.provider_message_id,
      lastErrorCode: row.last_error_code,
      lastErrorMessage: row.last_error_message,
    };
  }
}
