/**
 * Notification Worker Runner
 * 
 * Initializes and manages notification workers
 * Handles graceful shutdown and worker recovery
 */

import { Pool } from 'pg';
import { NotificationWorker } from './notification-worker.js';
import { NotificationRepository } from './notification.repository.js';
import { ProviderRegistry } from './provider-registry.js';
import { WorkerConfig } from './notification.types.js';
import { logger } from '../utils/logger.js';

export class NotificationWorkerRunner {
  private workers: NotificationWorker[] = [];
  private recoveryTimer?: NodeJS.Timeout;
  private repository: NotificationRepository;

  constructor(
    private readonly pool: Pool,
    private readonly providers: ProviderRegistry,
    private readonly config: {
      workerCount: number;
      batchSize: number;
      pollIntervalMs: number;
      lockTimeoutMinutes: number;
      recoveryIntervalMs: number;
    }
  ) {
    this.repository = new NotificationRepository(pool);
  }

  /**
   * Start all workers
   */
  start(): void {
    logger.info('Starting notification workers', {
      workerCount: this.config.workerCount,
      batchSize: this.config.batchSize,
      pollIntervalMs: this.config.pollIntervalMs
    });

    // Create and start workers
    for (let i = 0; i < this.config.workerCount; i++) {
      const workerId = `worker-${i + 1}-${process.pid}`;
      
      const workerConfig: WorkerConfig = {
        workerId,
        batchSize: this.config.batchSize,
        pollIntervalMs: this.config.pollIntervalMs,
        lockTimeoutMinutes: this.config.lockTimeoutMinutes
      };

      const worker = new NotificationWorker(
        workerConfig,
        this.repository,
        this.providers
      );

      worker.start();
      this.workers.push(worker);
    }

    // Start recovery process
    this.startRecovery();

    // Handle graceful shutdown
    this.setupShutdownHandlers();

    logger.info('Notification workers started', {
      workerCount: this.workers.length
    });
  }

  /**
   * Stop all workers
   */
  stop(): void {
    logger.info('Stopping notification workers');

    // Stop recovery
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
      this.recoveryTimer = undefined;
    }

    // Stop all workers
    for (const worker of this.workers) {
      worker.stop();
    }

    this.workers = [];

    logger.info('Notification workers stopped');
  }

  /**
   * Get metrics from all workers
   */
  getMetrics() {
    return this.workers.map((worker, index) => ({
      workerId: `worker-${index + 1}`,
      metrics: worker.getMetrics()
    }));
  }

  /**
   * Start recovery process for stuck deliveries
   */
  private startRecovery(): void {
    this.recoveryTimer = setInterval(
      async () => {
        try {
          const recovered = await this.repository.resetStuckDeliveries(
            this.config.lockTimeoutMinutes
          );

          if (recovered > 0) {
            logger.warn('Recovered stuck deliveries', {
              count: recovered,
              lockTimeoutMinutes: this.config.lockTimeoutMinutes
            });
          }
        } catch (error) {
          logger.error('Recovery process failed', { error });
        }
      },
      this.config.recoveryIntervalMs
    );

    logger.info('Worker recovery process started', {
      intervalMs: this.config.recoveryIntervalMs,
      lockTimeoutMinutes: this.config.lockTimeoutMinutes
    });
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = (signal: string) => {
      logger.info('Received shutdown signal', { signal });
      this.stop();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}
