/**
 * Provisioning Worker
 * Background worker for async provisioning execution
 */

import { Pool } from 'pg';
import { ZeroTouchOrchestrator } from '../zero-touch-orchestrator.service';
import { ProvisioningJobService } from '../services/provisioning-job.service';

export interface ProvisioningWorkerConfig {
  pollInterval: number; // milliseconds
  maxConcurrent: number;
  retryDelay: number; // milliseconds
}

const DEFAULT_CONFIG: ProvisioningWorkerConfig = {
  pollInterval: 5000, // 5 seconds
  maxConcurrent: 3,
  retryDelay: 60000, // 1 minute
};

export class ProvisioningWorker {
  private orchestrator: ZeroTouchOrchestrator;
  private jobService: ProvisioningJobService;
  private config: ProvisioningWorkerConfig;
  private running: boolean = false;
  private activeJobs: Set<string> = new Set();
  private pollTimer?: NodeJS.Timeout;

  constructor(
    private pool: Pool,
    config?: Partial<ProvisioningWorkerConfig>
  ) {
    this.orchestrator = new ZeroTouchOrchestrator(pool);
    this.jobService = new ProvisioningJobService(pool);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log('Provisioning worker is already running');
      return;
    }

    this.running = true;
    console.log('Starting provisioning worker...');

    // Recover interrupted jobs on startup
    await this.recoverInterruptedJobs();

    // Start polling loop
    this.scheduleNextPoll();
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    console.log('Stopping provisioning worker...');
    this.running = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }

    // Wait for active jobs to complete
    while (this.activeJobs.size > 0) {
      console.log(`Waiting for ${this.activeJobs.size} active jobs to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('Provisioning worker stopped');
  }

  /**
   * Process jobs from queue
   */
  private async processJobs(): Promise<void> {
    if (!this.running) {
      return;
    }

    try {
      // Check if we can process more jobs
      if (this.activeJobs.size >= this.config.maxConcurrent) {
        return;
      }

      // Find queued jobs
      const query = `
        SELECT id, branch_id, tenant_id, config, created_by
        FROM provisioning_jobs
        WHERE status = 'queued'
          AND retry_count < max_retries
        ORDER BY created_at ASC
        LIMIT $1
      `;

      const availableSlots = this.config.maxConcurrent - this.activeJobs.size;
      const result = await this.pool.query(query, [availableSlots]);

      for (const row of result.rows) {
        if (!this.running) break;

        const jobId = row.id;
        this.activeJobs.add(jobId);

        // Process job in background
        this.processJob(
          jobId,
          row.branch_id,
          row.tenant_id,
          row.config,
          row.created_by
        ).catch(error => {
          console.error(`Error processing job ${jobId}:`, error);
        }).finally(() => {
          this.activeJobs.delete(jobId);
        });
      }
    } catch (error) {
      console.error('Error in processJobs:', error);
    }
  }

  /**
   * Process a single provisioning job
   */
  private async processJob(
    jobId: string,
    branchId: string,
    tenantId: string,
    config: any,
    requestedBy?: string
  ): Promise<void> {
    console.log(`Processing provisioning job ${jobId} for branch ${branchId}`);

    try {
      // Update job status to in progress
      await this.jobService.updateJob(jobId, {
        status: 'network_inspection',
      });

      // Execute provisioning
      const context = await this.orchestrator.execute(
        branchId,
        tenantId,
        config,
        requestedBy
      );

      console.log(
        `Provisioning job ${jobId} completed successfully. Health score: ${context.health?.data?.score || 0}`
      );
    } catch (error) {
      console.error(`Provisioning job ${jobId} failed:`, error.message);

      // Check if job should be retried
      const job = await this.jobService.getJob(jobId);
      if (job && job.retryCount < job.maxRetries) {
        console.log(
          `Job ${jobId} will be retried (attempt ${job.retryCount + 1}/${job.maxRetries})`
        );

        // Schedule retry
        setTimeout(() => {
          this.jobService.updateJob(jobId, { status: 'queued' });
        }, this.config.retryDelay);
      }
    }
  }

  /**
   * Recover interrupted jobs on startup
   */
  private async recoverInterruptedJobs(): Promise<void> {
    console.log('Recovering interrupted provisioning jobs...');

    try {
      const interruptedJobs = await this.jobService.findInterruptedJobs();

      console.log(`Found ${interruptedJobs.length} interrupted jobs`);

      for (const job of interruptedJobs) {
        try {
          console.log(`Recovering job ${job.id} for branch ${job.branchId}`);

          // Reset to queued status for retry
          await this.jobService.updateJob(job.id, {
            status: 'queued',
          });
        } catch (error) {
          console.error(`Failed to recover job ${job.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error recovering interrupted jobs:', error);
    }
  }

  /**
   * Schedule next poll
   */
  private scheduleNextPoll(): void {
    if (!this.running) {
      return;
    }

    this.pollTimer = setTimeout(async () => {
      await this.processJobs();
      this.scheduleNextPoll();
    }, this.config.pollInterval);
  }

  /**
   * Get worker status
   */
  getStatus(): {
    running: boolean;
    activeJobs: number;
    maxConcurrent: number;
  } {
    return {
      running: this.running,
      activeJobs: this.activeJobs.size,
      maxConcurrent: this.config.maxConcurrent,
    };
  }
}
