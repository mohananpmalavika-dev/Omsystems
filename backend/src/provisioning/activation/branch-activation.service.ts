/**
 * Branch Activation Service
 * Guarded activation with health gate enforcement
 */

import { Pool } from 'pg';
import { BranchActivationResult } from '../models/provisioning-result';
import { ProvisioningContext } from '../models/provisioning-context';
import { BranchActivationBlockedError } from '../models/provisioning-job';
import { HealthPolicyService } from '../health/health-policy.service';

export class BranchActivationService {
  constructor(
    private pool: Pool,
    private policyService: HealthPolicyService
  ) {}

  /**
   * Activate branch with health gate enforcement
   */
  async activate(context: ProvisioningContext): Promise<BranchActivationResult> {
    // Step 1: Verify health check has been completed
    const health = context.health?.data;

    if (!health) {
      throw new Error(
        'Health check must be completed before branch activation'
      );
    }

    // Step 2: Check activation gates
    const gateResult = this.policyService.checkActivationGates(
      health,
      context.config.health
    );

    if (!gateResult.canActivate) {
      throw new BranchActivationBlockedError(
        context.branchId,
        health.blockingIssues.map(issue => ({
          code: issue.code,
          message: issue.message,
          component: issue.component,
        }))
      );
    }

    // Step 3: Activate branch atomically
    const result = await this.activateAtomically(context, health.score);

    // Step 4: Publish activation event
    await this.publishActivationEvent(context);

    // Step 5: Initialize branch services
    await this.initializeBranchServices(context);

    return result;
  }

  /**
   * Activate branch atomically in database
   */
  private async activateAtomically(
    context: ProvisioningContext,
    healthScore: number
  ): Promise<BranchActivationResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const activatedAt = new Date();

      // Update branch status
      const branchQuery = `
        UPDATE branches
        SET 
          status = 'active',
          activated_at = $1,
          health_score = $2,
          updated_at = $1
        WHERE id = $3 AND status != 'active'
        RETURNING id
      `;

      const branchResult = await client.query(branchQuery, [
        activatedAt,
        healthScore,
        context.branchId,
      ]);

      if (branchResult.rows.length === 0) {
        throw new Error('Branch is already active or does not exist');
      }

      // Record activation metadata
      const metadataQuery = `
        INSERT INTO branch_activation_metadata (
          branch_id,
          provisioning_job_id,
          activated_at,
          health_score,
          network_config,
          camera_count,
          storage_capacity_bytes,
          retention_days
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;

      await client.query(metadataQuery, [
        context.branchId,
        context.jobId,
        activatedAt,
        healthScore,
        JSON.stringify(context.network?.data || {}),
        context.cameras?.data?.totalImported || 0,
        context.storage?.data?.totalBytes || 0,
        context.storage?.data?.retentionDays || 0,
      ]);

      // Enable recording for all cameras
      const enableRecordingQuery = `
        UPDATE cameras
        SET 
          recording_enabled = true,
          status = 'active',
          updated_at = $1
        WHERE branch_id = $2 AND status != 'active'
      `;

      await client.query(enableRecordingQuery, [
        activatedAt,
        context.branchId,
      ]);

      await client.query('COMMIT');

      // Collect active services
      const activeServices = this.determineActiveServices(context);

      return {
        activated: true,
        activatedAt,
        healthScore,
        activeServices,
        configurationApplied: true,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Publish activation event for other services
   */
  private async publishActivationEvent(context: ProvisioningContext): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Insert event into events table (if exists)
      const eventQuery = `
        INSERT INTO system_events (
          event_type,
          entity_type,
          entity_id,
          tenant_id,
          data,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `;

      await client.query(eventQuery, [
        'branch_activated',
        'branch',
        context.branchId,
        context.tenantId,
        JSON.stringify({
          jobId: context.jobId,
          cameraCount: context.cameras?.data?.totalImported || 0,
          healthScore: context.health?.data?.score || 0,
        }),
      ]);
    } catch (error) {
      // Event publishing is non-critical
      console.warn('Failed to publish activation event:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Initialize branch services post-activation
   */
  private async initializeBranchServices(
    context: ProvisioningContext
  ): Promise<void> {
    const services: string[] = [];

    try {
      // Initialize recording service
      if (context.recording?.data && context.recording.data.totalPassed > 0) {
        await this.initializeRecordingService(context);
        services.push('recording');
      }

      // Initialize analytics service (if cameras are active)
      if (context.cameras?.data && context.cameras.data.totalImported > 0) {
        await this.initializeAnalyticsService(context);
        services.push('analytics');
      }

      // Initialize health monitoring
      await this.initializeHealthMonitoring(context);
      services.push('health-monitoring');

      console.log(`Initialized services for branch ${context.branchId}:`, services);
    } catch (error) {
      // Service initialization failures are non-critical
      console.warn('Failed to initialize some branch services:', error);
    }
  }

  /**
   * Initialize recording service
   */
  private async initializeRecordingService(
    context: ProvisioningContext
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Create recording schedules for all cameras
      const scheduleQuery = `
        INSERT INTO recording_schedules (
          camera_id,
          branch_id,
          schedule_type,
          enabled,
          created_at
        )
        SELECT 
          id,
          branch_id,
          'continuous',
          true,
          NOW()
        FROM cameras
        WHERE branch_id = $1 
          AND recording_enabled = true
          AND NOT EXISTS (
            SELECT 1 FROM recording_schedules 
            WHERE camera_id = cameras.id
          )
      `;

      await client.query(scheduleQuery, [context.branchId]);
    } finally {
      client.release();
    }
  }

  /**
   * Initialize analytics service
   */
  private async initializeAnalyticsService(
    context: ProvisioningContext
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Enable default analytics rules for cameras
      const analyticsQuery = `
        INSERT INTO camera_analytics_config (
          camera_id,
          branch_id,
          rules_enabled,
          motion_detection,
          object_detection,
          created_at
        )
        SELECT 
          id,
          branch_id,
          true,
          true,
          true,
          NOW()
        FROM cameras
        WHERE branch_id = $1 
          AND status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM camera_analytics_config 
            WHERE camera_id = cameras.id
          )
      `;

      await client.query(analyticsQuery, [context.branchId]);
    } finally {
      client.release();
    }
  }

  /**
   * Initialize health monitoring
   */
  private async initializeHealthMonitoring(
    context: ProvisioningContext
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Create initial health check schedule
      const healthQuery = `
        INSERT INTO branch_health_checks (
          branch_id,
          check_type,
          schedule_cron,
          enabled,
          created_at
        ) VALUES 
          ($1, 'network', '*/15 * * * *', true, NOW()),
          ($1, 'cameras', '*/5 * * * *', true, NOW()),
          ($1, 'storage', '*/30 * * * *', true, NOW()),
          ($1, 'recording', '*/10 * * * *', true, NOW())
        ON CONFLICT (branch_id, check_type) DO NOTHING
      `;

      await client.query(healthQuery, [context.branchId]);
    } finally {
      client.release();
    }
  }

  /**
   * Determine which services should be active
   */
  private determineActiveServices(context: ProvisioningContext): string[] {
    const services: string[] = [];

    // Core services always active
    services.push('monitoring', 'alerts');

    // Conditional services based on provisioning results
    if (context.cameras?.data && context.cameras.data.totalImported > 0) {
      services.push('camera-management', 'live-view');
    }

    if (context.recording?.data && context.recording.data.totalPassed > 0) {
      services.push('recording', 'playback');
    }

    if (context.storage?.data && context.storage.data.writeVerified) {
      services.push('storage-management');
    }

    if (context.network?.data && context.network.data.gatewayReachable) {
      services.push('remote-access');
    }

    return services;
  }

  /**
   * Deactivate branch (for rollback scenarios)
   */
  async deactivate(
    branchId: string,
    reason: string
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Update branch status
      await client.query(
        `UPDATE branches 
         SET status = 'inactive', 
             deactivated_at = NOW(),
             deactivation_reason = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [reason, branchId]
      );

      // Disable recording
      await client.query(
        `UPDATE cameras 
         SET recording_enabled = false, updated_at = NOW()
         WHERE branch_id = $1`,
        [branchId]
      );

      // Record deactivation event
      await client.query(
        `INSERT INTO system_events (
          event_type, entity_type, entity_id, data, created_at
        ) VALUES ($1, $2, $3, $4, NOW())`,
        [
          'branch_deactivated',
          'branch',
          branchId,
          JSON.stringify({ reason }),
        ]
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
   * Check if branch can be safely activated
   */
  async canActivate(branchId: string): Promise<{
    canActivate: boolean;
    reasons: string[];
  }> {
    const query = `
      SELECT 
        b.status,
        b.health_score,
        COUNT(c.id) as camera_count,
        COUNT(c.id) FILTER (WHERE c.recording_enabled = true) as recording_cameras
      FROM branches b
      LEFT JOIN cameras c ON c.branch_id = b.id AND c.status = 'active'
      WHERE b.id = $1
      GROUP BY b.id, b.status, b.health_score
    `;

    const result = await this.pool.query(query, [branchId]);

    if (result.rows.length === 0) {
      return {
        canActivate: false,
        reasons: ['Branch not found'],
      };
    }

    const branch = result.rows[0];
    const reasons: string[] = [];

    if (branch.status === 'active') {
      reasons.push('Branch is already active');
    }

    if (branch.camera_count === 0) {
      reasons.push('No cameras configured');
    }

    return {
      canActivate: reasons.length === 0,
      reasons,
    };
  }
}
