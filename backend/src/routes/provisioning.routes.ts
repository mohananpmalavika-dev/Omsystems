/**
 * Provisioning API Routes
 * REST endpoints for zero-touch provisioning management
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { ZeroTouchOrchestrator } from '../provisioning/zero-touch-orchestrator.service';
import { ProvisioningJobService } from '../provisioning/services/provisioning-job.service';
import { BranchProvisioningConfig } from '../provisioning/models/provisioning-context';

export function createProvisioningRoutes(pool: Pool): Router {
  const router = Router();
  const orchestrator = new ZeroTouchOrchestrator(pool);
  const jobService = new ProvisioningJobService(pool);

  /**
   * POST /api/provisioning/branches/:branchId/provision
   * Start provisioning for a branch
   */
  router.post(
    '/branches/:branchId/provision',
    async (req: Request, res: Response) => {
      try {
        const { branchId } = req.params;
        const { config } = req.body as {
          config?: Partial<BranchProvisioningConfig>;
        };

        // Get branch details
        const branchQuery = `
          SELECT tenant_id, name, status 
          FROM branches 
          WHERE id = $1
        `;
        const branchResult = await pool.query(branchQuery, [branchId]);

        if (branchResult.rows.length === 0) {
          return res.status(404).json({
            error: 'Branch not found',
            code: 'BRANCH_NOT_FOUND',
          });
        }

        const branch = branchResult.rows[0];

        if (branch.status === 'active') {
          return res.status(400).json({
            error: 'Branch is already active',
            code: 'BRANCH_ALREADY_ACTIVE',
          });
        }

        // Check if provisioning is already in progress
        const existingJob = await jobService.getJobByBranchId(branchId);
        if (
          existingJob &&
          !['active', 'failed', 'blocked'].includes(existingJob.status)
        ) {
          return res.status(409).json({
            error: 'Provisioning already in progress',
            code: 'PROVISIONING_IN_PROGRESS',
            jobId: existingJob.id,
          });
        }

        // Create job (will be picked up by worker)
        const job = await jobService.createJob({
          branchId,
          tenantId: branch.tenant_id,
          config: config || {},
          createdBy: req.user?.id,
        });

        res.status(202).json({
          message: 'Provisioning started',
          jobId: job.id,
          branchId,
          status: job.status,
        });
      } catch (error) {
        console.error('Error starting provisioning:', error);
        res.status(500).json({
          error: 'Failed to start provisioning',
          code: 'PROVISIONING_START_FAILED',
          details: error.message,
        });
      }
    }
  );

  /**
   * GET /api/provisioning/jobs/:jobId
   * Get provisioning job status
   */
  router.get('/jobs/:jobId', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;

      const job = await jobService.getJob(jobId);

      if (!job) {
        return res.status(404).json({
          error: 'Job not found',
          code: 'JOB_NOT_FOUND',
        });
      }

      const context = await jobService.loadContext(jobId);

      res.json({
        job: {
          id: job.id,
          branchId: job.branchId,
          status: job.status,
          currentStep: job.currentStep,
          progressPercent: job.progressPercent,
          createdAt: job.createdAt,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          errorCode: job.errorCode,
          errorMessage: job.errorMessage,
          retryCount: job.retryCount,
          steps: job.steps.map(step => ({
            name: step.name,
            displayName: step.displayName,
            status: step.status,
            startedAt: step.startedAt,
            completedAt: step.completedAt,
            durationMs: step.durationMs,
            progressPercent: step.progressPercent,
            error: step.error,
          })),
        },
        context: context
          ? {
              network: context.network?.data,
              cameras: context.cameras?.data
                ? {
                    totalDiscovered: context.cameras.data.totalDiscovered,
                    totalImported: context.cameras.data.totalImported,
                    successRate: context.cameras.data.successRate,
                  }
                : null,
              storage: context.storage?.data
                ? {
                    totalBytes: context.storage.data.totalBytes,
                    availableBytes: context.storage.data.availableBytes,
                    retentionDays: context.storage.data.retentionDays,
                    retentionAchievable:
                      context.storage.data.retentionAchievable,
                  }
                : null,
              recording: context.recording?.data
                ? {
                    totalTested: context.recording.data.totalTested,
                    totalPassed: context.recording.data.totalPassed,
                    successRate: context.recording.data.successRate,
                  }
                : null,
              health: context.health?.data
                ? {
                    healthy: context.health.data.healthy,
                    score: context.health.data.score,
                    blockingIssues: context.health.data.blockingIssues,
                    warnings: context.health.data.warnings.slice(0, 5),
                  }
                : null,
            }
          : null,
      });
    } catch (error) {
      console.error('Error getting job status:', error);
      res.status(500).json({
        error: 'Failed to get job status',
        code: 'JOB_STATUS_FAILED',
        details: error.message,
      });
    }
  });

  /**
   * GET /api/provisioning/branches/:branchId/status
   * Get provisioning status for a branch
   */
  router.get(
    '/branches/:branchId/status',
    async (req: Request, res: Response) => {
      try {
        const { branchId } = req.params;

        const job = await jobService.getJobByBranchId(branchId);

        if (!job) {
          return res.status(404).json({
            error: 'No provisioning job found for branch',
            code: 'NO_JOB_FOUND',
          });
        }

        // Redirect to job endpoint
        return res.json({
          jobId: job.id,
          status: job.status,
          progressPercent: job.progressPercent,
        });
      } catch (error) {
        console.error('Error getting branch status:', error);
        res.status(500).json({
          error: 'Failed to get branch status',
          code: 'BRANCH_STATUS_FAILED',
          details: error.message,
        });
      }
    }
  );

  /**
   * POST /api/provisioning/jobs/:jobId/retry
   * Retry a failed provisioning job
   */
  router.post('/jobs/:jobId/retry', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;

      const job = await jobService.getJob(jobId);

      if (!job) {
        return res.status(404).json({
          error: 'Job not found',
          code: 'JOB_NOT_FOUND',
        });
      }

      if (job.status !== 'failed' && job.status !== 'blocked') {
        return res.status(400).json({
          error: 'Job is not in a retryable state',
          code: 'JOB_NOT_RETRYABLE',
          currentStatus: job.status,
        });
      }

      if (job.retryCount >= job.maxRetries) {
        return res.status(400).json({
          error: 'Maximum retry attempts reached',
          code: 'MAX_RETRIES_REACHED',
          retryCount: job.retryCount,
          maxRetries: job.maxRetries,
        });
      }

      // Increment retry and reset to queued
      await jobService.incrementRetry(jobId);
      await jobService.updateJob(jobId, {
        status: 'queued',
        errorCode: undefined,
        errorMessage: undefined,
      });

      res.json({
        message: 'Job queued for retry',
        jobId,
        retryCount: job.retryCount + 1,
      });
    } catch (error) {
      console.error('Error retrying job:', error);
      res.status(500).json({
        error: 'Failed to retry job',
        code: 'JOB_RETRY_FAILED',
        details: error.message,
      });
    }
  });

  /**
   * POST /api/provisioning/jobs/:jobId/cancel
   * Cancel a running provisioning job
   */
  router.post('/jobs/:jobId/cancel', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const { reason } = req.body;

      const job = await jobService.getJob(jobId);

      if (!job) {
        return res.status(404).json({
          error: 'Job not found',
          code: 'JOB_NOT_FOUND',
        });
      }

      if (['active', 'failed', 'blocked'].includes(job.status)) {
        return res.status(400).json({
          error: 'Job cannot be cancelled',
          code: 'JOB_NOT_CANCELLABLE',
          currentStatus: job.status,
        });
      }

      await orchestrator.cancel(jobId, reason || 'Cancelled by user');

      res.json({
        message: 'Job cancelled',
        jobId,
      });
    } catch (error) {
      console.error('Error cancelling job:', error);
      res.status(500).json({
        error: 'Failed to cancel job',
        code: 'JOB_CANCEL_FAILED',
        details: error.message,
      });
    }
  });

  /**
   * GET /api/provisioning/jobs/:jobId/health
   * Get detailed health report for a job
   */
  router.get('/jobs/:jobId/health', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;

      const context = await jobService.loadContext(jobId);

      if (!context || !context.health?.data) {
        return res.status(404).json({
          error: 'Health data not available',
          code: 'HEALTH_DATA_NOT_FOUND',
        });
      }

      res.json({
        health: context.health.data,
      });
    } catch (error) {
      console.error('Error getting health report:', error);
      res.status(500).json({
        error: 'Failed to get health report',
        code: 'HEALTH_REPORT_FAILED',
        details: error.message,
      });
    }
  });

  /**
   * GET /api/provisioning/branches/:branchId/cameras
   * Get discovered cameras for a branch
   */
  router.get(
    '/branches/:branchId/cameras',
    async (req: Request, res: Response) => {
      try {
        const { branchId } = req.params;

        const query = `
          SELECT 
            id, name, ip_address, vendor, model, serial_number,
            status, discovery_source, onvif_endpoint,
            recording_enabled, stream_url, discovered_at
          FROM cameras
          WHERE branch_id = $1
          ORDER BY discovered_at DESC
        `;

        const result = await pool.query(query, [branchId]);

        res.json({
          cameras: result.rows,
          total: result.rows.length,
        });
      } catch (error) {
        console.error('Error getting cameras:', error);
        res.status(500).json({
          error: 'Failed to get cameras',
          code: 'GET_CAMERAS_FAILED',
          details: error.message,
        });
      }
    }
  );

  return router;
}
