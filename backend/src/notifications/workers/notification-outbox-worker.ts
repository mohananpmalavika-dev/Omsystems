/**
 * Notification Outbox Worker
 * 
 * Processes notifications from the transactional outbox with:
 * - Exponential backoff retry
 * - Dead-letter queue handling
 * - Provider failover
 * - Deduplication
 */

import type {
  NotificationOutbox,
  NotificationDelivery,
  NotificationStatus,
  DeliveryStatus,
  NotificationProvider,
  NotificationChannel,
} from '../domain/notification.types.js';
import { providerFactory } from '../adapters/provider-factory.js';
import { logger } from '../../utils/logger.js';

interface OutboxWorkerConfig {
  batchSize: number;
  pollIntervalMs: number;
  maxAttempts: number;
  processingTimeoutMs: number;
  exponentialBackoffBase: number; // seconds
}

interface ProcessingResult {
  outboxId: string;
  success: boolean;
  status: NotificationStatus;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  isPermanentFailure?: boolean;
  latencyMs: number;
}

export class NotificationOutboxWorker {
  private running: boolean = false;
  private processingCount: number = 0;
  private repository: any; // Will be injected

  constructor(
    private config: OutboxWorkerConfig,
    repository: any
  ) {
    this.repository = repository;
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn('Notification worker already running');
      return;
    }

    this.running = true;
    logger.info('Notification outbox worker started', {
      batchSize: this.config.batchSize,
      pollIntervalMs: this.config.pollIntervalMs,
    });

    this.processLoop();
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    this.running = false;
    logger.info('Notification outbox worker stopped');

    // Wait for current processing to complete
    while (this.processingCount > 0) {
      await this.sleep(100);
    }
  }

  /**
   * Main processing loop
   */
  private async processLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.processBatch();
      } catch (error) {
        logger.error('Error in notification worker loop', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      await this.sleep(this.config.pollIntervalMs);
    }
  }

  /**
   * Process a batch of notifications
   */
  private async processBatch(): Promise<void> {
    // Find stuck processing notifications (timeout recovery)
    await this.recoverStuckNotifications();

    // Fetch pending notifications
    const notifications = await this.repository.fetchPendingNotifications(
      this.config.batchSize
    );

    if (notifications.length === 0) {
      return;
    }

    logger.debug('Processing notification batch', {
      count: notifications.length,
    });

    // Process notifications in parallel
    const results = await Promise.allSettled(
      notifications.map(notification => this.processNotification(notification))
    );

    // Log results
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    logger.info('Batch processing completed', {
      total: notifications.length,
      successful,
      failed,
    });
  }

  /**
   * Process a single notification
   */
  private async processNotification(
    notification: NotificationOutbox
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    this.processingCount++;

    try {
      // Mark as processing
      await this.repository.markAsProcessing(notification.id);

      // Get provider for channel
      const provider = this.getProviderForChannel(
        notification.channel,
        notification.providerName
      );

      if (!provider) {
        throw new Error(`No provider available for channel: ${notification.channel}`);
      }

      // Send notification
      const result = await provider.send({
        recipientDestination: notification.recipientDestination,
        subject: notification.subject,
        body: notification.body,
        metadata: {
          notificationId: notification.id,
          incidentId: notification.incidentId,
          alertId: notification.alertId,
          severity: notification.variables?.severity,
          requireAcknowledgement: notification.variables?.incident?.requireAcknowledgement,
        },
      });

      const latencyMs = Date.now() - startTime;

      // Handle result
      if (result.accepted) {
        await this.handleSuccess(notification, result.providerMessageId, provider.providerKey, latencyMs);

        return {
          outboxId: notification.id,
          success: true,
          status: result.status === 'DELIVERED' ? 'DELIVERED' : 'SENT',
          providerMessageId: result.providerMessageId,
          latencyMs,
        };
      } else {
        await this.handleFailure(
          notification,
          result.failureCode || 'SEND_FAILED',
          result.failureReason || 'Unknown error',
          result.isPermanentFailure || false
        );

        return {
          outboxId: notification.id,
          success: false,
          status: result.isPermanentFailure ? 'FAILED' : 'RETRYING',
          errorCode: result.failureCode,
          errorMessage: result.failureReason,
          isPermanentFailure: result.isPermanentFailure,
          latencyMs,
        };
      }
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.handleFailure(
        notification,
        'WORKER_ERROR',
        errorMessage,
        false
      );

      return {
        outboxId: notification.id,
        success: false,
        status: 'RETRYING',
        errorCode: 'WORKER_ERROR',
        errorMessage,
        latencyMs,
      };
    } finally {
      this.processingCount--;
    }
  }

  /**
   * Handle successful notification delivery
   */
  private async handleSuccess(
    notification: NotificationOutbox,
    providerMessageId: string | undefined,
    providerKey: string,
    latencyMs: number
  ): Promise<void> {
    // Update outbox
    await this.repository.updateOutboxStatus(notification.id, {
      status: 'SENT',
      providerMessageId,
      providerName: providerKey,
      processedAt: new Date(),
    });

    // Create delivery record
    await this.repository.createDelivery({
      tenantId: notification.tenantId,
      outboxId: notification.id,
      incidentId: notification.incidentId,
      channel: notification.channel,
      recipientId: notification.recipientId,
      recipientDisplayName: notification.recipientDisplayName,
      recipientDestinationMasked: notification.recipientDestinationMasked,
      providerName: providerKey,
      providerMessageId,
      status: 'SENT',
      attemptNumber: notification.attemptCount + 1,
      sentAt: new Date(),
      latencyMs,
    });

    logger.info('Notification sent successfully', {
      outboxId: notification.id,
      channel: notification.channel,
      recipient: notification.recipientDestinationMasked,
      latencyMs,
    });
  }

  /**
   * Handle notification failure
   */
  private async handleFailure(
    notification: NotificationOutbox,
    errorCode: string,
    errorMessage: string,
    isPermanent: boolean
  ): Promise<void> {
    const attemptCount = notification.attemptCount + 1;
    const maxAttempts = notification.maxAttempts || this.config.maxAttempts;

    // Determine next status
    let status: NotificationStatus;
    let availableAt: Date | undefined;

    if (isPermanent) {
      // Permanent failure, don't retry
      status = 'FAILED';
    } else if (attemptCount >= maxAttempts) {
      // Max attempts reached, move to dead letter
      status = 'DEAD_LETTER';
    } else {
      // Retry with exponential backoff
      status = 'RETRYING';
      const backoffSeconds = this.calculateBackoff(attemptCount);
      availableAt = new Date(Date.now() + backoffSeconds * 1000);
    }

    // Update error history
    const errorHistory = [
      ...(notification.errorHistory || []),
      {
        attemptNumber: attemptCount,
        errorCode,
        errorMessage,
        timestamp: new Date(),
        isPermanent,
      },
    ];

    // Update outbox
    await this.repository.updateOutboxStatus(notification.id, {
      status,
      attemptCount,
      lastErrorCode: errorCode,
      lastErrorMessage: errorMessage,
      errorHistory,
      availableAt,
      failedAt: status === 'FAILED' || status === 'DEAD_LETTER' ? new Date() : undefined,
    });

    // Create delivery record for failed attempt
    await this.repository.createDelivery({
      tenantId: notification.tenantId,
      outboxId: notification.id,
      incidentId: notification.incidentId,
      channel: notification.channel,
      recipientId: notification.recipientId,
      recipientDisplayName: notification.recipientDisplayName,
      recipientDestinationMasked: notification.recipientDestinationMasked,
      status: 'FAILED',
      attemptNumber: attemptCount,
      failedAt: new Date(),
      errorCode,
      errorMessage,
    });

    logger.warn('Notification delivery failed', {
      outboxId: notification.id,
      channel: notification.channel,
      recipient: notification.recipientDestinationMasked,
      errorCode,
      attemptCount,
      maxAttempts,
      status,
      nextRetryIn: availableAt ? `${Math.round((availableAt.getTime() - Date.now()) / 1000)}s` : 'N/A',
    });
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoff(attemptCount: number): number {
    const base = this.config.exponentialBackoffBase;
    
    // Exponential: 5s, 15s, 60s, 5min, 15min
    const backoffSeconds = [
      base,                    // 5s
      base * 3,                // 15s
      base * 12,               // 60s
      base * 60,               // 5min
      base * 180,              // 15min
    ];

    const index = Math.min(attemptCount - 1, backoffSeconds.length - 1);
    return backoffSeconds[index];
  }

  /**
   * Get provider for channel with failover
   */
  private getProviderForChannel(
    channel: NotificationChannel,
    preferredProvider?: string
  ): NotificationProvider | undefined {
    // Try preferred provider first
    if (preferredProvider) {
      const provider = providerFactory.getProvider(preferredProvider);
      if (provider) {
        return provider;
      }
    }

    // Fall back to default provider for channel
    return providerFactory.getDefaultProvider(channel);
  }

  /**
   * Recover notifications stuck in PROCESSING state
   */
  private async recoverStuckNotifications(): Promise<void> {
    const timeoutMs = this.config.processingTimeoutMs;
    const stuckNotifications = await this.repository.findStuckNotifications(timeoutMs);

    if (stuckNotifications.length > 0) {
      logger.warn('Recovering stuck notifications', {
        count: stuckNotifications.length,
      });

      for (const notification of stuckNotifications) {
        await this.repository.updateOutboxStatus(notification.id, {
          status: 'RETRYING',
          processingStartedAt: null,
        });
      }
    }
  }

  /**
   * Cancel notifications for an incident
   * Called when incident is acknowledged
   */
  async cancelNotificationsForIncident(incidentId: string): Promise<number> {
    const cancelled = await this.repository.cancelPendingNotifications(incidentId);
    
    logger.info('Cancelled pending notifications for incident', {
      incidentId,
      count: cancelled,
    });

    return cancelled;
  }

  /**
   * Get worker statistics
   */
  getStats() {
    return {
      running: this.running,
      processingCount: this.processingCount,
      config: this.config,
    };
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Default configuration
export const DEFAULT_WORKER_CONFIG: OutboxWorkerConfig = {
  batchSize: 100,
  pollIntervalMs: 1000,
  maxAttempts: 5,
  processingTimeoutMs: 5 * 60 * 1000, // 5 minutes
  exponentialBackoffBase: 5, // 5 seconds
};
