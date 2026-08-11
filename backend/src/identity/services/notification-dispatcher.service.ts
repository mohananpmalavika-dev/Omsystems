/**
 * Notification Dispatcher Service
 * 
 * Coordinates transactional enqueuing of notifications.
 * Ensures MFA challenges and notification messages are created atomically.
 * 
 * This is the high-level service that MfaService uses to dispatch notifications.
 */

import { Pool, PoolClient } from 'pg';
import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { NotificationOutboxRepository, EnqueueMessageParams } from '../repositories/notification-outbox.repository.js';
import { MfaChallengeRepository, CreateChallengeParams } from '../repositories/mfa-challenge.repository.js';
import { OtpEncryptionService, OtpHasher, OtpGenerator } from '../encryption/otp-encryption.service.js';

export interface DispatchSmsOtpParams {
  userId: string;
  tenantId: string;
  phoneNumber: string;
  purpose: 'login_mfa' | 'setup_verification' | 'password_reset' | 'sensitive_operation';
  otpLength?: number;
  expiryMinutes?: number;
  maxVerificationAttempts?: number;
}

export interface DispatchResult {
  status: 'queued' | 'provider_unavailable';
  challengeId?: string;
  expiresAt?: Date;
  reason?: string;
}

export class NotificationDispatcherService {
  private readonly outboxRepo: NotificationOutboxRepository;
  private readonly challengeRepo: MfaChallengeRepository;
  private readonly otpEncryption: OtpEncryptionService;
  private readonly otpHasher: OtpHasher;
  private readonly otpGenerator: OtpGenerator;

  constructor(
    private readonly pool: Pool,
    otpEncryption: OtpEncryptionService,
    otpHasher: OtpHasher,
    otpGenerator: OtpGenerator
  ) {
    this.outboxRepo = new NotificationOutboxRepository(pool);
    this.challengeRepo = new MfaChallengeRepository(pool);
    this.otpEncryption = otpEncryption;
    this.otpHasher = otpHasher;
    this.otpGenerator = otpGenerator;
  }

  /**
   * Dispatch SMS OTP with transactional outbox pattern
   * 
   * CRITICAL: This creates both challenge and outbox message in a single transaction.
   * Either both succeed or both fail - no inconsistent state.
   */
  async dispatchSmsOtp(params: DispatchSmsOtpParams): Promise<DispatchResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Generate OTP
      const otp = this.otpGenerator.generate(params.otpLength || 6);
      const otpHash = await this.otpHasher.hash(otp);
      const otpCiphertext = await this.otpEncryption.encryptForStorage(otp);
      const destinationHash = await this.otpHasher.hashDestination(params.phoneNumber);

      // Calculate expiry
      const expiryMinutes = params.expiryMinutes || 5;
      const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

      // Generate challenge ID
      const challengeId = crypto.randomUUID();

      // Supersede any active challenges for this user/method
      await this.challengeRepo.supersedActiveForUser(
        params.userId,
        'sms',
        client
      );

      // Create MFA challenge
      const challengeParams: CreateChallengeParams = {
        id: challengeId,
        tenantId: params.tenantId,
        userId: params.userId,
        method: 'sms',
        purpose: params.purpose,
        destinationHash,
        otpHash,
        otpCiphertext,
        status: 'QUEUED',
        expiresAt,
        maxVerificationAttempts: params.maxVerificationAttempts || 5,
        maxSendAttempts: 3,
      };

      await this.challengeRepo.create(challengeParams, client);

      // Enqueue notification in outbox
      const outboxParams: EnqueueMessageParams = {
        tenantId: params.tenantId,
        channel: 'sms',
        template: 'mfa_otp',
        recipient: params.phoneNumber,
        payload: {
          challengeId,
          encryptedOtp: JSON.parse(otpCiphertext), // Store as structured data
          expiryMinutes,
        },
        metadata: {
          userId: params.userId,
          purpose: params.purpose,
        },
        idempotencyKey: `mfa:${challengeId}:initial`,
        maxAttempts: 3,
        expiresAt,
      };

      await this.outboxRepo.enqueue(outboxParams, client);

      await client.query('COMMIT');

      logger.info('SMS OTP dispatched successfully', {
        challengeId,
        userId: params.userId,
        purpose: params.purpose,
        expiresAt,
      });

      return {
        status: 'queued',
        challengeId,
        expiresAt,
      };
    } catch (error) {
      await client.query('ROLLBACK');

      logger.error('Failed to dispatch SMS OTP', {
        error,
        userId: params.userId,
        purpose: params.purpose,
      });

      // Don't expose internal error details
      return {
        status: 'provider_unavailable',
        reason: 'Failed to enqueue SMS notification',
      };
    } finally {
      client.release();
    }
  }

  /**
   * Resend SMS OTP (creates new challenge and supersedes old one)
   */
  async resendSmsOtp(
    originalChallengeId: string,
    params: Omit<DispatchSmsOtpParams, 'userId' | 'tenantId' | 'purpose'>
  ): Promise<DispatchResult> {
    // Get original challenge to extract user/tenant/purpose
    const originalChallenge = await this.challengeRepo.findById(originalChallengeId);

    if (!originalChallenge) {
      return {
        status: 'provider_unavailable',
        reason: 'Original challenge not found',
      };
    }

    // Dispatch new OTP
    return this.dispatchSmsOtp({
      userId: originalChallenge.userId,
      tenantId: originalChallenge.tenantId,
      phoneNumber: params.phoneNumber,
      purpose: originalChallenge.purpose,
      otpLength: params.otpLength,
      expiryMinutes: params.expiryMinutes,
      maxVerificationAttempts: params.maxVerificationAttempts,
    });
  }

  /**
   * Check if SMS provider is available
   * This should check provider health before attempting dispatch
   */
  async isSmsAvailable(): Promise<boolean> {
    // TODO: Implement provider health check
    // For now, assume available if OTP_ENCRYPTION_KEY is configured
    return !!process.env.OTP_ENCRYPTION_KEY;
  }

  /**
   * Get active challenges for user
   */
  async getActiveChallenges(userId: string, method: 'sms' | 'email' = 'sms') {
    return this.challengeRepo.findActiveByUserId(userId, method);
  }

  /**
   * Cancel pending notifications for a challenge
   */
  async cancelChallengeNotifications(challengeId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Mark challenge as cancelled
      await this.challengeRepo.updateStatus(challengeId, 'SUPERSEDED', client);

      // Cancel pending outbox messages
      await this.outboxRepo.cancelByIdempotencyPrefix(`mfa:${challengeId}:`, client);

      await client.query('COMMIT');

      logger.info('Challenge notifications cancelled', { challengeId });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to cancel challenge notifications', {
        error,
        challengeId,
      });
      throw error;
    } finally {
      client.release();
    }
  }
}
