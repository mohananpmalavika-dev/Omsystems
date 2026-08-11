/**
 * Notification Worker
 * 
 * Processes notification_outbox messages and delivers via SMS/Email providers.
 * 
 * Key features:
 * 1. Exponential backoff with OTP expiry awareness
 * 2. Clears sensitive payload (encrypted OTP) after delivery
 * 3. Updates challenge status to track delivery state
 * 4. Handles provider errors with retryable/non-retryable classification
 * 5. Coordinates with multiple workers via FOR UPDATE SKIP LOCKED
 */

import { Pool } from 'pg';
import { logger } from '../../utils/logger.js';
import { NotificationOutboxRepository } from '../repositories/notification-outbox.repository.js';
import { MfaChallengeRepository } from '../repositories/mfa-challenge.repository.js';
import { OtpEncryptionService, createOtpServices } from '../encryption/otp-encryption.service.js';
import { createSmsProvider, loadSmsProviderConfig, SmsProvider } from '../sms/sms-provider.interface.js';

export interface NotificationWorkerConfig {
  /** Polling interval in milliseconds */
  pollIntervalMs: number;

  /** Batch size for processing */
  batchSize: number;

  /** Exponential backoff base (seconds) */
  backoffBase: number;

  /** Maximum backoff delay (seconds) */
  maxBackoffSeconds: number;

  /** Whether to run continuously or process once */
  continuous: boolean;
}

export class NotificationWorker {
  private readonly pool: Pool;
  private readonly outboxRepo: NotificationOutboxRepository;
  private readonly challengeRepo: MfaChallengeRepository;
  private readonly otpEncryption: OtpEncryptionService;
  private readonly smsProvider: SmsProvider;
  private readonly config: NotificationWorkerConfig;

  private running = false;
  private pollTimeout?: NodeJS.Timeout;

  constructor(pool: Pool, config?: Partial<NotificationWorkerConfig>) {
    this.pool = pool;
    this.outboxRepo = new NotificationOutboxRepository(pool);
    this.challengeRepo = new MfaChallengeRepository(pool);

    // Initialize OTP services
    const otpServices = createOtpServices();
    this.otpEncryption = otpServices.encryptionService;

    // Initialize SMS provider
    const smsConfig = loadSmsProviderConfig();
    this.smsProvider = createSmsProvider(smsConfig);

    // Default configuration
    this.config = {
      pollIntervalMs: config?.pollIntervalMs || 1000, // 1 second
      batchSize: config?.batchSize || 10,
      backoffBase: config?.backoffBase || 10, // 10 seconds base
      maxBackoffSeconds: config?.maxBackoffSeconds || 300, // 5 minutes max
      continuous: config?.continuous !== undefined ? config.continuous : true,
    };

    logger.info('Notification worker initialized', {
      smsProvider: this.smsProvider.name,
      config: this.config,
    });
  }

  /**
   * Start worker (continuous processing)
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn('Notification worker already running');
      return;
    }

    this.running = true;
    logger.info('Notification worker started');

    await this.poll();
  }

  /**
   * Stop worker
   */
  async stop(): Promise<void> {
    this.running = false;

    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = undefined;
    }

    logger.info('Notification worker stopped');
  }

  /**
   * Process pending messages once (for testing or cron jobs)
   */
  async processOnce(): Promise<number> {
    return this.processBatch();
  }

  /**
   * Polling loop
   */
  private async poll(): Promise<void> {
    if (!this.running) {
      return;
    }

    try {
      const processedCount = await this.processBatch();

      // Adjust poll interval based on activity
      const nextPollMs = processedCount > 0
        ? Math.min(this.config.pollIntervalMs, 100) // Fast poll if active
        : this.config.pollIntervalMs;

      if (this.config.continuous && this.running) {
        this.pollTimeout = setTimeout(() => this.poll(), nextPollMs);
      }
    } catch (error) {
      logger.error('Error in notification worker poll', { error });

      // Back off on error
      if (this.config.continuous && this.running) {
        this.pollTimeout = setTimeout(() => this.poll(), this.config.pollIntervalMs * 5);
      }
    }
  }

  /**
   * Process a batch of pending messages
   */
  private async processBatch(): Promise<number> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get pending messages with FOR UPDATE SKIP LOCKED
      const messages = await this.outboxRepo.getPendingMessages(
        this.config.batchSize,
        client
      );

      if (messages.length === 0) {
        await client.query('COMMIT');
        return 0;
      }

      // Mark as processing
      for (const message of messages) {
        await this.outboxRepo.markProcessing(message.id, client);
      }

      await client.query('COMMIT');

      // Process each message independently
      const results = await Promise.allSettled(
        messages.map(message => this.processMessage(message.id))
      );

      const successCount = results.filter(r => r.status === 'fulfilled').length;

      logger.debug('Processed message batch', {
        total: messages.length,
        successful: successCount,
        failed: messages.length - successCount,
      });

      return messages.length;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error processing message batch', { error });
      return 0;
    } finally {
      client.release();
    }
  }

  /**
   * Process individual message
   */
  private async processMessage(messageId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get message
      const message = await this.outboxRepo.findById(messageId, client);

      if (!message) {
        logger.warn('Message not found', { messageId });
        await client.query('ROLLBACK');
        return;
      }

      // Check expiry
      if (message.expiresAt && message.expiresAt <= new Date()) {
        await this.outboxRepo.markExpired(messageId, client);

        // Mark challenge as expired too
        if (message.payload.challengeId) {
          await this.challengeRepo.markExpired(message.payload.challengeId, client);
        }

        await client.query('COMMIT');
        logger.info('Message expired', { messageId });
        return;
      }

      // Route by channel
      if (message.channel === 'sms') {
        await this.processSmsMessage(message, client);
      } else {
        logger.warn('Unsupported channel', {
          messageId,
          channel: message.channel,
        });
        await this.outboxRepo.markFailed(
          messageId,
          'UNSUPPORTED_CHANNEL',
          `Channel ${message.channel} not supported`,
          false,
          0,
          client
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error processing message', { messageId, error });

      // Mark as failed with retry
      try {
        await this.outboxRepo.markFailed(
          messageId,
          'PROCESSING_ERROR',
          error instanceof Error ? error.message : 'Unknown error',
          true,
          this.calculateBackoff(1),
        );
      } catch (markError) {
        logger.error('Failed to mark message as failed', { messageId, markError });
      }
    } finally {
      client.release();
    }
  }

  /**
   * Process SMS message
   */
  private async processSmsMessage(
    message: any,
    client: any
  ): Promise<void> {
    const challengeId = message.payload.challengeId;

    // Get challenge
    const challenge = await this.challengeRepo.findById(challengeId, client);

    if (!challenge) {
      await this.outboxRepo.markFailed(
        message.id,
        'CHALLENGE_NOT_FOUND',
        'MFA challenge not found',
        false,
        0,
        client
      );
      return;
    }

    // Check if challenge expired
    if (challenge.expiresAt <= new Date()) {
      await this.challengeRepo.markExpired(challengeId, client);
      await this.outboxRepo.markExpired(message.id, client);
      return;
    }

    // Check if enough time to retry before expiry
    const backoffSeconds = this.calculateBackoff(message.attemptCount);
    const timeUntilExpiry = challenge.expiresAt.getTime() - Date.now();

    if (backoffSeconds * 1000 >= timeUntilExpiry) {
      logger.warn('OTP would expire before retry', {
        messageId: message.id,
        challengeId,
        backoffSeconds,
        timeUntilExpiry: timeUntilExpiry / 1000,
      });

      await this.challengeRepo.markDeliveryFailed(
        challengeId,
        'OTP_WOULD_EXPIRE',
        'OTP would expire before retry',
        client
      );

      await this.outboxRepo.markFailed(
        message.id,
        'OTP_WOULD_EXPIRE',
        'OTP would expire before retry',
        false,
        0,
        client
      );

      return;
    }

    // Decrypt OTP for delivery
    let otp: string;

    try {
      otp = await this.otpEncryption.decrypt(message.payload.encryptedOtp);
    } catch (error) {
      logger.error('Failed to decrypt OTP', {
        messageId: message.id,
        challengeId,
        error,
      });

      await this.challengeRepo.markDeliveryFailed(
        challengeId,
        'DECRYPTION_FAILED',
        'Failed to decrypt OTP',
        client
      );

      await this.outboxRepo.markFailed(
        message.id,
        'DECRYPTION_FAILED',
        'Failed to decrypt OTP',
        false,
        0,
        client
      );

      return;
    }

    // Render message body
    const expiryMinutes = message.payload.expiryMinutes || 5;
    const messageBody = this.renderSmsTemplate(otp, expiryMinutes);

    // Mark challenge as sending
    await this.challengeRepo.updateStatus(challengeId, 'SENDING', client);

    // Send via SMS provider
    const sendResult = await this.smsProvider.send({
      to: message.recipient,
      body: messageBody,
      idempotencyKey: message.idempotencyKey,
    });

    if (!sendResult.accepted) {
      // Delivery failed
      await this.challengeRepo.markDeliveryFailed(
        challengeId,
        sendResult.errorCode || 'UNKNOWN',
        sendResult.errorMessage || 'SMS delivery failed',
        client
      );

      await this.outboxRepo.markFailed(
        message.id,
        sendResult.errorCode || 'UNKNOWN',
        sendResult.errorMessage || 'SMS delivery failed',
        sendResult.retryable || false,
        this.calculateBackoff(message.attemptCount + 1),
        client
      );

      return;
    }

    // Success! Mark as sent
    await this.challengeRepo.markSent(
      challengeId,
      this.smsProvider.name,
      sendResult.providerMessageId || '',
      client
    );

    await this.outboxRepo.markSent(
      message.id,
      this.smsProvider.name,
      sendResult.providerMessageId || '',
      client
    );

    // Clear sensitive payload
    await this.outboxRepo.clearSensitivePayload(message.id, client);
    await this.challengeRepo.clearOtpCiphertext(challengeId, client);

    logger.info('SMS delivered successfully', {
      messageId: message.id,
      challengeId,
      provider: this.smsProvider.name,
      providerMessageId: sendResult.providerMessageId,
      latencyMs: sendResult.latencyMs,
    });
  }

  /**
   * Render SMS template
   */
  private renderSmsTemplate(otp: string, expiryMinutes: number): string {
    return `Your verification code is ${otp}. It expires in ${expiryMinutes} minutes. Do not share this code with anyone.`;
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoff(attemptCount: number): number {
    // Exponential: base * 2^(attempt-1)
    // Attempt 1: 10s, 2: 20s, 3: 40s, 4: 80s, 5: 160s
    const delay = this.config.backoffBase * Math.pow(2, attemptCount - 1);

    // Cap at max
    return Math.min(delay, this.config.maxBackoffSeconds);
  }

  /**
   * Maintenance: Mark expired messages
   */
  async markExpiredMessages(): Promise<number> {
    return this.outboxRepo.markExpiredMessages();
  }

  /**
   * Maintenance: Reset stuck messages
   */
  async resetStuckMessages(stuckThresholdMinutes: number = 10): Promise<number> {
    return this.outboxRepo.resetStuckMessages(stuckThresholdMinutes);
  }

  /**
   * Maintenance: Mark expired challenges
   */
  async markExpiredChallenges(): Promise<number> {
    return this.challengeRepo.markExpiredChallenges();
  }
}

/**
 * Standalone worker entry point
 */
export async function startNotificationWorker(
  pool: Pool,
  config?: Partial<NotificationWorkerConfig>
): Promise<NotificationWorker> {
  const worker = new NotificationWorker(pool, config);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, stopping notification worker...');
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, stopping notification worker...');
    await worker.stop();
    process.exit(0);
  });

  await worker.start();

  return worker;
}
