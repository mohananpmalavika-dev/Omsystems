/**
 * Notification Worker
 * 
 * Processes notification deliveries from the outbox
 * Implements retry logic with exponential backoff
 */

import {
  NotificationJob,
  WorkerConfig,
  WorkerMetrics
} from './notification.types.js';
import { NotificationRepository } from './notification.repository.js';
import { ProviderRegistry } from './provider-registry.js';
import {
  DeliveryError,
  calculateRetryDelay,
  getRetryAfterDelay,
  createDeliveryError
} from './notification.errors.js';
import { logger } from '../utils/logger.js';

export class NotificationWorker {
  private running = false;
  private pollTimer?: NodeJS.Timeout;
  private metrics: WorkerMetrics = {
    jobsProcessed: 0,
    jobsSucceeded: 0,
    jobsFailed: 0,
    averageProcessingTimeMs: 0
  };
  private processingTimes: number[] = [];

  constructor(
    private readonly config: WorkerConfig,
    private readonly repository: NotificationRepository,
    private readonly providers: ProviderRegistry
  ) {}

  /**
   * Start worker processing loop
   */
  start(): void {
    if (this.running) {
      logger.warn('Worker already running', { workerId: this.config.workerId });
      return;
    }

    this.running = true;
    
    logger.info('Notification worker started', {
      workerId: this.config.workerId,
      batchSize: this.config.batchSize,
      pollIntervalMs: this.config.pollIntervalMs
    });

    // Start polling
    this.poll();
  }

  /**
   * Stop worker gracefully
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }

    logger.info('Notification worker stopped', {
      workerId: this.config.workerId,
      metrics: this.metrics
    });
  }

  /**
   * Get worker metrics
   */
  getMetrics(): WorkerMetrics {
    return {
      ...this.metrics,
      lastProcessedAt: this.metrics.lastProcessedAt
        ? new Date(this.metrics.lastProcessedAt)
        : undefined
    };
  }

  /**
   * Main polling loop
   */
  private poll(): void {
    if (!this.running) {
      return;
    }

    // Process batch immediately
    this.processBatch()
      .catch(error => {
        logger.error('Worker batch processing failed', {
          workerId: this.config.workerId,
          error
        });
      })
      .finally(() => {
        // Schedule next poll
        if (this.running) {
          this.pollTimer = setTimeout(
            () => this.poll(),
            this.config.pollIntervalMs
          );
        }
      });
  }

  /**
   * Process a batch of jobs
   */
  private async processBatch(): Promise<void> {
    try {
      // Claim jobs using SKIP LOCKED
      const jobs = await this.repository.claimPendingDeliveries(
        this.config.workerId,
        this.config.batchSize
      );

      if (jobs.length === 0) {
        return; // No work to do
      }

      logger.debug('Processing batch', {
        workerId: this.config.workerId,
        jobCount: jobs.length
      });

      // Process jobs concurrently
      await Promise.all(
        jobs.map(job => this.processJob(job))
      );
    } catch (error) {
      logger.error('Failed to claim jobs', {
        workerId: this.config.workerId,
        error
      });
    }
  }

  /**
   * Process single delivery job
   */
  private async processJob(job: NotificationJob): Promise<void> {
    const startTime = Date.now();
    const { delivery, notification } = job;

    try {
      // Get provider for channel
      const provider = this.providers.get(delivery.channel);
      
      if (!provider) {
        throw new Error(`No provider registered for channel: ${delivery.channel}`);
      }

      // Record attempt start
      const attemptNumber = delivery.attemptCount + 1;
      const attemptStartTime = new Date();

      logger.debug('Processing delivery', {
        deliveryId: delivery.id,
        channel: delivery.channel,
        provider: provider.name,
        attemptNumber,
        destination: this.maskDestination(delivery.destination, delivery.channel)
      });

      try {
        // Call provider
        const result = await provider.send({
          id: delivery.id,
          tenantId: delivery.tenantId,
          destination: delivery.destination,
          subject: delivery.subject,
          title: delivery.title,
          body: delivery.body,
          metadata: delivery.metadata
        });

        // Success - update delivery
        const endTime = new Date();
        const durationMs = endTime.getTime() - attemptStartTime.getTime();

        await this.repository.updateDeliveryStatus(
          delivery.id,
          result.status === 'delivered' ? 'delivered' : 'accepted',
          {
            provider: provider.name,
            providerMessageId: result.providerMessageId,
            sentAt: endTime,
            deliveredAt: result.status === 'delivered' ? endTime : undefined
          }
        );

        // Record successful attempt
        await this.repository.createDeliveryAttempt({
          deliveryId: delivery.id,
          attemptNumber,
          provider: provider.name,
          startedAt: attemptStartTime,
          completedAt: endTime,
          success: true,
          providerMessageId: result.providerMessageId,
          durationMs,
          metadata: result.metadata || {}
        });

        logger.info('Delivery succeeded', {
          deliveryId: delivery.id,
          notificationId: notification.id,
          channel: delivery.channel,
          attemptNumber,
          status: result.status,
          durationMs
        });

        this.metrics.jobsSucceeded++;
      } catch (error) {
        // Delivery failed
        await this.handleDeliveryFailure(
          delivery,
          provider.name,
          attemptNumber,
          attemptStartTime,
          error
        );
      }

      // Update metrics
      const processingTime = Date.now() - startTime;
      this.processingTimes.push(processingTime);
      if (this.processingTimes.length > 100) {
        this.processingTimes.shift();
      }
      
      this.metrics.jobsProcessed++;
      this.metrics.averageProcessingTimeMs =
        this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
      this.metrics.lastProcessedAt = new Date();
    } catch (error) {
      logger.error('Job processing failed', {
        deliveryId: delivery.id,
        notificationId: notification.id,
        error
      });
    }
  }

  /**
   * Handle delivery failure with retry logic
   */
  private async handleDeliveryFailure(
    delivery: any,
    providerName: string,
    attemptNumber: number,
    attemptStartTime: Date,
    error: unknown
  ): Promise<void> {
    const endTime = new Date();
    const durationMs = endTime.getTime() - attemptStartTime.getTime();

    // Classify error
    const deliveryError = error instanceof DeliveryError
      ? error
      : createDeliveryError(delivery.channel, error);

    // Record attempt
    await this.repository.createDeliveryAttempt({
      deliveryId: delivery.id,
      attemptNumber,
      provider: providerName,
      startedAt: attemptStartTime,
      completedAt: endTime,
      success: false,
      errorCode: deliveryError.code,
      errorMessage: deliveryError.message,
      durationMs,
      metadata: deliveryError.metadata || {}
    });

    // Decide: retry or fail
    const shouldRetry =
      deliveryError.retryable &&
      attemptNumber < delivery.maxAttempts;

    if (shouldRetry) {
      // Schedule retry
      const retryDelayMs = getRetryAfterDelay(error) || calculateRetryDelay(attemptNumber);
      const nextAttemptAt = new Date(Date.now() + retryDelayMs);

      await this.repository.incrementAttemptCount(
        delivery.id,
        nextAttemptAt
      );

      logger.warn('Delivery failed, will retry', {
        deliveryId: delivery.id,
        channel: delivery.channel,
        attemptNumber,
        maxAttempts: delivery.maxAttempts,
        error: deliveryError.message,
        retryable: deliveryError.retryable,
        nextAttemptAt,
        retryDelayMs
      });
    } else {
      // Permanent failure
      await this.repository.updateDeliveryStatus(
        delivery.id,
        'failed',
        {
          lastError: deliveryError.message,
          lastErrorCode: deliveryError.code,
          failedAt: endTime
        }
      );

      logger.error('Delivery permanently failed', {
        deliveryId: delivery.id,
        channel: delivery.channel,
        attemptNumber,
        maxAttempts: delivery.maxAttempts,
        error: deliveryError.message,
        code: deliveryError.code,
        retryable: deliveryError.retryable
      });

      this.metrics.jobsFailed++;
    }
  }

  /**
   * Mask sensitive destination info in logs
   */
  private maskDestination(destination: string, channel: string): string {
    switch (channel) {
      case 'email':
        // Show first char and domain: a***@example.com
        const [local, domain] = destination.split('@');
        if (domain) {
          return `${local[0]}***@${domain}`;
        }
        return '***';

      case 'sms':
        // Show last 4 digits: ***1234
        if (destination.length > 4) {
          return `***${destination.slice(-4)}`;
        }
        return '***';

      case 'webhook':
        // Show protocol and domain: https://example.com/***
        try {
          const url = new URL(destination);
          return `${url.protocol}//${url.host}/***`;
        } catch {
          return '***';
        }

      default:
        return '***';
    }
  }
}
