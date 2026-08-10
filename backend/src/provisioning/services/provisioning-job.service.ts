/**
 * Provisioning Job Service
 * Manages persistent provisioning job state with recovery support
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  ProvisioningJob,
  ProvisioningJobStep,
  ProvisioningJobStatus,
  ProvisioningStepStatus,
  CreateProvisioningJobRequest,
  UpdateProvisioningJobRequest,
  UpdateStepRequest,
  PROVISIONING_STEPS,
  ProvisioningStepDefinition,
} from '../models/provisioning-job';
import { ProvisioningContext } from '../models/provisioning-context';

export class ProvisioningJobService {
  constructor(private pool: Pool) {}

  /**
   * Create a new provisioning job
   */
  async createJob(request: CreateProvisioningJobRequest): Promise<ProvisioningJob> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const jobId = uuidv4();
      const now = new Date();

      // Create main job record
      const jobQuery = `
        INSERT INTO provisioning_jobs (
          id, branch_id, tenant_id, organization_id,
          status, current_step, progress_percent,
          config, context,
          created_at, updated_at,
          retry_count, max_retries,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `;

      const jobResult = await client.query(jobQuery, [
        jobId,
        request.branchId,
        request.tenantId,
        request.organizationId || null,
        'queued',
        null,
        0,
        JSON.stringify(request.config),
        '{}',
        now,
        now,
        0,
        3,
        request.createdBy || null,
      ]);

      // Create step records
      const steps: ProvisioningJobStep[] = [];
      for (const stepDef of PROVISIONING_STEPS) {
        const step = await this.createStep(client, jobId, stepDef);
        steps.push(step);
      }

      await client.query('COMMIT');

      return this.mapRowToJob(jobResult.rows[0], steps);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<ProvisioningJob | null> {
    const query = `
      SELECT j.*, 
        json_agg(
          json_build_object(
            'id', s.id,
            'jobId', s.job_id,
            'name', s.name,
            'displayName', s.display_name,
            'status', s.status,
            'startedAt', s.started_at,
            'completedAt', s.completed_at,
            'durationMs', s.duration_ms,
            'attempt', s.attempt,
            'maxAttempts', s.max_attempts,
            'result', s.result,
            'error', s.error,
            'progressPercent', s.progress_percent,
            'metadata', s.metadata
          ) ORDER BY s.step_order
        ) as steps
      FROM provisioning_jobs j
      LEFT JOIN provisioning_job_steps s ON s.job_id = j.id
      WHERE j.id = $1
      GROUP BY j.id
    `;

    const result = await this.pool.query(query, [jobId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return this.mapRowToJob(row, row.steps);
  }

  /**
   * Get job by branch ID
   */
  async getJobByBranchId(branchId: string): Promise<ProvisioningJob | null> {
    const query = `
      SELECT j.*, 
        json_agg(
          json_build_object(
            'id', s.id,
            'jobId', s.job_id,
            'name', s.name,
            'displayName', s.display_name,
            'status', s.status,
            'startedAt', s.started_at,
            'completedAt', s.completed_at,
            'durationMs', s.duration_ms,
            'attempt', s.attempt,
            'maxAttempts', s.max_attempts,
            'result', s.result,
            'error', s.error,
            'progressPercent', s.progress_percent,
            'metadata', s.metadata
          ) ORDER BY s.step_order
        ) as steps
      FROM provisioning_jobs j
      LEFT JOIN provisioning_job_steps s ON s.job_id = j.id
      WHERE j.branch_id = $1
      GROUP BY j.id
      ORDER BY j.created_at DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [branchId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return this.mapRowToJob(row, row.steps);
  }

  /**
   * Update job status
   */
  async updateJob(jobId: string, update: UpdateProvisioningJobRequest): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (update.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(update.status);
    }

    if (update.currentStep !== undefined) {
      fields.push(`current_step = $${paramCount++}`);
      values.push(update.currentStep);
    }

    if (update.progressPercent !== undefined) {
      fields.push(`progress_percent = $${paramCount++}`);
      values.push(update.progressPercent);
    }

    if (update.context !== undefined) {
      fields.push(`context = $${paramCount++}`);
      values.push(JSON.stringify(update.context));
    }

    if (update.errorCode !== undefined) {
      fields.push(`error_code = $${paramCount++}`);
      values.push(update.errorCode);
    }

    if (update.errorMessage !== undefined) {
      fields.push(`error_message = $${paramCount++}`);
      values.push(update.errorMessage);
    }

    fields.push(`updated_at = $${paramCount++}`);
    values.push(new Date());

    values.push(jobId);

    const query = `
      UPDATE provisioning_jobs
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
    `;

    await this.pool.query(query, values);
  }

  /**
   * Start a step
   */
  async startStep(jobId: string, stepName: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const now = new Date();

      // Update step status
      await client.query(
        `UPDATE provisioning_job_steps
         SET status = 'running', started_at = $1, attempt = attempt + 1
         WHERE job_id = $2 AND name = $3`,
        [now, jobId, stepName]
      );

      // Get step info
      const stepResult = await client.query(
        `SELECT display_name FROM provisioning_job_steps WHERE job_id = $1 AND name = $2`,
        [jobId, stepName]
      );

      const displayName = stepResult.rows[0]?.display_name || stepName;

      // Update job
      await client.query(
        `UPDATE provisioning_jobs
         SET current_step = $1, status = $2, updated_at = $3
         WHERE id = $4`,
        [displayName, this.getJobStatusFromStep(stepName), now, jobId]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Complete a step
   */
  async completeStep(
    jobId: string,
    stepName: string,
    update: UpdateStepRequest
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const now = new Date();

      // Get step start time for duration calculation
      const stepResult = await client.query(
        `SELECT started_at FROM provisioning_job_steps WHERE job_id = $1 AND name = $2`,
        [jobId, stepName]
      );

      const startedAt = stepResult.rows[0]?.started_at;
      const durationMs = startedAt ? now.getTime() - new Date(startedAt).getTime() : 0;

      // Update step
      const updateQuery = `
        UPDATE provisioning_job_steps
        SET status = $1,
            completed_at = $2,
            duration_ms = $3,
            result = $4,
            error = $5,
            progress_percent = $6,
            metadata = $7
        WHERE job_id = $8 AND name = $9
      `;

      await client.query(updateQuery, [
        update.status,
        now,
        durationMs,
        update.result ? JSON.stringify(update.result) : null,
        update.error ? JSON.stringify(update.error) : null,
        update.progressPercent || 100,
        update.metadata ? JSON.stringify(update.metadata) : null,
        jobId,
        stepName,
      ]);

      // Calculate overall progress
      const progressResult = await client.query(
        `SELECT 
          COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / COUNT(*) as progress
         FROM provisioning_job_steps
         WHERE job_id = $1`,
        [jobId]
      );

      const overallProgress = Math.round(progressResult.rows[0].progress || 0);

      // Update job
      await client.query(
        `UPDATE provisioning_jobs
         SET progress_percent = $1, updated_at = $2
         WHERE id = $3`,
        [overallProgress, now, jobId]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Save provisioning context
   */
  async saveContext(jobId: string, context: ProvisioningContext): Promise<void> {
    const query = `
      UPDATE provisioning_jobs
      SET context = $1, updated_at = $2
      WHERE id = $3
    `;

    await this.pool.query(query, [
      JSON.stringify(context),
      new Date(),
      jobId,
    ]);
  }

  /**
   * Load provisioning context
   */
  async loadContext(jobId: string): Promise<ProvisioningContext | null> {
    const query = `
      SELECT context FROM provisioning_jobs WHERE id = $1
    `;

    const result = await this.pool.query(query, [jobId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].context as ProvisioningContext;
  }

  /**
   * Mark job as failed
   */
  async fail(jobId: string, error: Error): Promise<void> {
    await this.updateJob(jobId, {
      status: 'failed',
      errorCode: error.name,
      errorMessage: error.message,
    });

    const query = `
      UPDATE provisioning_jobs
      SET completed_at = $1
      WHERE id = $2
    `;

    await this.pool.query(query, [new Date(), jobId]);
  }

  /**
   * Mark job as blocked
   */
  async block(
    jobId: string,
    blockingIssues: Array<{ code: string; message: string; component: string }>
  ): Promise<void> {
    await this.updateJob(jobId, {
      status: 'blocked',
      errorCode: 'ACTIVATION_BLOCKED',
      errorMessage: `Activation blocked: ${blockingIssues.map(i => i.message).join(', ')}`,
    });
  }

  /**
   * Mark job as complete
   */
  async complete(jobId: string): Promise<void> {
    const query = `
      UPDATE provisioning_jobs
      SET status = 'active', completed_at = $1, updated_at = $1
      WHERE id = $2
    `;

    await this.pool.query(query, [new Date(), jobId]);
  }

  /**
   * Find interrupted jobs (for recovery on startup)
   */
  async findInterruptedJobs(): Promise<ProvisioningJob[]> {
    const query = `
      SELECT j.*, 
        json_agg(
          json_build_object(
            'id', s.id,
            'jobId', s.job_id,
            'name', s.name,
            'displayName', s.display_name,
            'status', s.status,
            'startedAt', s.started_at,
            'completedAt', s.completed_at,
            'durationMs', s.duration_ms,
            'attempt', s.attempt,
            'maxAttempts', s.max_attempts,
            'result', s.result,
            'error', s.error,
            'progressPercent', s.progress_percent,
            'metadata', s.metadata
          ) ORDER BY s.step_order
        ) as steps
      FROM provisioning_jobs j
      LEFT JOIN provisioning_job_steps s ON s.job_id = j.id
      WHERE j.status NOT IN ('active', 'failed', 'blocked')
        AND j.retry_count < j.max_retries
        AND j.created_at > NOW() - INTERVAL '24 hours'
      GROUP BY j.id
      ORDER BY j.created_at ASC
    `;

    const result = await this.pool.query(query);
    
    return result.rows.map(row => this.mapRowToJob(row, row.steps));
  }

  /**
   * Increment retry count
   */
  async incrementRetry(jobId: string): Promise<void> {
    const query = `
      UPDATE provisioning_jobs
      SET retry_count = retry_count + 1, updated_at = $1
      WHERE id = $2
    `;

    await this.pool.query(query, [new Date(), jobId]);
  }

  /**
   * Create a step record
   */
  private async createStep(
    client: PoolClient,
    jobId: string,
    stepDef: ProvisioningStepDefinition
  ): Promise<ProvisioningJobStep> {
    const stepId = uuidv4();

    const query = `
      INSERT INTO provisioning_job_steps (
        id, job_id, name, display_name, status,
        step_order, attempt, max_attempts, progress_percent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await client.query(query, [
      stepId,
      jobId,
      stepDef.name,
      stepDef.displayName,
      'pending',
      stepDef.order,
      0,
      stepDef.maxAttempts,
      0,
    ]);

    return this.mapRowToStep(result.rows[0]);
  }

  /**
   * Map database row to job
   */
  private mapRowToJob(row: any, steps: any[]): ProvisioningJob {
    return {
      id: row.id,
      branchId: row.branch_id,
      tenantId: row.tenant_id,
      organizationId: row.organization_id,
      status: row.status,
      currentStep: row.current_step,
      progressPercent: row.progress_percent,
      config: row.config,
      context: row.context,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      updatedAt: row.updated_at,
      steps: steps.map(s => this.mapRowToStep(s)),
      errorCode: row.error_code,
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      createdBy: row.created_by,
    };
  }

  /**
   * Map database row to step
   */
  private mapRowToStep(row: any): ProvisioningJobStep {
    return {
      id: row.id,
      jobId: row.jobId || row.job_id,
      name: row.name,
      displayName: row.displayName || row.display_name,
      status: row.status,
      startedAt: row.startedAt || row.started_at,
      completedAt: row.completedAt || row.completed_at,
      durationMs: row.durationMs || row.duration_ms,
      attempt: row.attempt,
      maxAttempts: row.maxAttempts || row.max_attempts,
      result: row.result,
      error: row.error,
      progressPercent: row.progressPercent || row.progress_percent,
      metadata: row.metadata,
    };
  }

  /**
   * Get job status from step name
   */
  private getJobStatusFromStep(stepName: string): ProvisioningJobStatus {
    const statusMap: Record<string, ProvisioningJobStatus> = {
      network_inspection: 'network_inspection',
      network_configuration: 'network_configuration',
      network_verification: 'network_verification',
      camera_discovery: 'camera_discovery',
      camera_authentication: 'camera_authentication',
      camera_import: 'camera_import',
      camera_stream_verification: 'camera_stream_verification',
      storage_discovery: 'storage_discovery',
      storage_sizing: 'storage_sizing',
      storage_configuration: 'storage_configuration',
      storage_verification: 'storage_verification',
      recording_verification: 'recording_verification',
      health_check: 'health_check',
      activation: 'activating',
    };

    return statusMap[stepName] || 'queued';
  }
}
