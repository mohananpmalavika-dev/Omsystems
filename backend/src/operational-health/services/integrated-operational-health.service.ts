/**
 * Integrated Operational Health Service
 * 
 * This service integrates the existing operational health service
 * with the new canonical branch health model and rule-based evaluation.
 * 
 * It aggregates data from existing services and applies health rules
 * to produce the canonical BranchOperationalHealth model.
 */

import { Pool } from 'pg';
import { BranchHealthEvaluatorService } from './branch-health-evaluator.service';
import { BranchHealthRepository } from '../repositories/branch-health.repository';
import {
  BranchOperationalHealth,
  BranchMosaicItem,
  BranchHealthFilter,
  OperationalDashboardSummary,
  BranchHealthChangedEvent,
  CameraHealthSummary,
  RecorderHealthSummary,
  StorageHealthSummary,
  RetentionHealthSummary,
  NetworkHealthSummary,
  UPSHealthSummary,
  AlertHealthSummary,
  HealthState,
  ConnectivityState,
} from '../types/operational-health.types';

export class IntegratedOperationalHealthService {
  private evaluator: BranchHealthEvaluatorService;
  private repository: BranchHealthRepository;

  constructor(private pool: Pool) {
    this.evaluator = new BranchHealthEvaluatorService();
    this.repository = new BranchHealthRepository(pool);
  }

  /**
   * Get current operational health for a single branch
   * First checks cache, if missing computes and caches it
   */
  async getBranchHealth(
    tenantId: string,
    branchId: string
  ): Promise<BranchOperationalHealth | null> {
    // Try cache first
    let health = await this.repository.getCurrentHealth(tenantId, branchId);

    if (!health || this.isCacheStale(health)) {
      // Compute fresh health
      health = await this.computeBranchHealth(tenantId, branchId);
      
      if (health) {
        // Update cache
        await this.repository.upsertCurrentHealth(tenantId, health);
      }
    }

    return health;
  }

  /**
   * Get operational health for all branches with filtering
   */
  async getAllBranchesHealth(
    tenantId: string,
    filter?: BranchHealthFilter
  ): Promise<BranchOperationalHealth[]> {
    return this.repository.getAllCurrentHealth(tenantId, filter);
  }

  /**
   * Get lightweight mosaic items for dashboard (optimized query)
   */
  async getBranchMosaicItems(
    tenantId: string,
    filter?: BranchHealthFilter
  ): Promise<BranchMosaicItem[]> {
    return this.repository.getMosaicItems(tenantId, filter);
  }

  /**
   * Get dashboard summary KPIs
   */
  async getDashboardSummary(tenantId: string): Promise<OperationalDashboardSummary> {
    return this.repository.getDashboardSummary(tenantId);
  }

  /**
   * Refresh health for a specific branch (compute and cache)
   */
  async refreshBranchHealth(
    tenantId: string,
    branchId: string
  ): Promise<BranchOperationalHealth> {
    const health = await this.computeBranchHealth(tenantId, branchId);
    
    if (!health) {
      throw new Error(`Branch ${branchId} not found`);
    }

    // Get previous state for change detection
    const previousHealth = await this.repository.getCurrentHealth(tenantId, branchId);

    // Update cache
    await this.repository.upsertCurrentHealth(tenantId, health);

    // Detect and record state changes
    if (previousHealth) {
      await this.handleHealthChange(tenantId, previousHealth, health);
    }

    return health;
  }

  /**
   * Refresh health for all branches (batch operation)
   */
  async refreshAllBranchesHealth(tenantId: string): Promise<{
    processed: number;
    updated: number;
    errors: number;
  }> {
    // Get all branches
    const branchesQuery = `
      SELECT id, code, name, region_id
      FROM branches
      WHERE tenant_id = $1
      ORDER BY name
    `;

    const result = await this.pool.query(branchesQuery, [tenantId]);
    const branches = result.rows;

    let processed = 0;
    let updated = 0;
    let errors = 0;

    // Process in batches to avoid overwhelming the database
    const batchSize = 10;
    for (let i = 0; i < branches.length; i += batchSize) {
      const batch = branches.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (branch) => {
          try {
            await this.refreshBranchHealth(tenantId, branch.id);
            updated++;
          } catch (error) {
            console.error(`Failed to refresh health for branch ${branch.code}:`, error);
            errors++;
          } finally {
            processed++;
          }
        })
      );
    }

    return { processed, updated, errors };
  }

  /**
   * Compute branch operational health from component data
   * This is the core aggregation and evaluation logic
   */
  private async computeBranchHealth(
    tenantId: string,
    branchId: string
  ): Promise<BranchOperationalHealth | null> {
    // Get branch info
    const branchQuery = `
      SELECT b.*, r.name as region_name
      FROM branches b
      LEFT JOIN regions r ON r.id = b.region_id
      WHERE b.id = $1 AND b.tenant_id = $2
    `;

    const branchResult = await this.pool.query(branchQuery, [branchId, tenantId]);
    
    if (branchResult.rows.length === 0) {
      return null;
    }

    const branch = branchResult.rows[0];

    // Aggregate component health in parallel
    const [
      cameras,
      recorders,
      storage,
      retention,
      network,
      ups,
      alerts,
    ] = await Promise.all([
      this.getCameraHealth(branchId),
      this.getRecorderHealth(branchId),
      this.getStorageHealth(branchId),
      this.getRetentionHealth(tenantId, branchId),
      this.getNetworkHealth(branchId),
      this.getUPSHealth(branchId),
      this.getAlertHealth(branchId),
    ]);

    // Get last telemetry time
    const lastTelemetryAt = await this.getLastTelemetryTime(branchId);

    // Evaluate overall health using rule engine
    const evaluation = this.evaluator.evaluateBranchHealth({
      cameras,
      recorders,
      storage,
      retention,
      network,
      ups,
      alerts,
      lastTelemetryAt,
    });

    // Determine telemetry freshness
    const telemetryFreshness = this.evaluator.determineTelemetryFreshness(lastTelemetryAt);

    // Get primary reason for display
    const primaryReason = this.evaluator.getPrimaryReason(evaluation.reasons);

    // Build complete BranchOperationalHealth object
    const health: BranchOperationalHealth = {
      branchId: branch.id,
      branchCode: branch.code,
      branchName: branch.name,
      regionId: branch.region_id,
      regionName: branch.region_name,
      overallState: evaluation.overallState,
      healthScore: evaluation.healthScore,
      reasonCodes: evaluation.reasonCodes,
      reasons: evaluation.reasons,
      cameras,
      recorders,
      storage,
      retention,
      network,
      ups,
      alerts,
      telemetryFreshness,
      lastTelemetryAt,
      observedAt: new Date(),
      updatedAt: new Date(),
    };

    return health;
  }

  /**
   * Get camera health summary for a branch
   */
  private async getCameraHealth(branchId: string): Promise<CameraHealthSummary> {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE online_status = 'online') as online,
        COUNT(*) FILTER (WHERE online_status = 'offline') as offline,
        COUNT(*) FILTER (WHERE recording_status = 'recording') as recording,
        COUNT(*) FILTER (WHERE recording_status != 'recording') as not_recording
      FROM cameras
      WHERE branch_id = $1
    `;

    const result = await this.pool.query(query, [branchId]);
    const row = result.rows[0];

    const total = parseInt(row.total) || 0;
    const online = parseInt(row.online) || 0;
    const offline = parseInt(row.offline) || 0;
    const recording = parseInt(row.recording) || 0;
    const notRecording = parseInt(row.not_recording) || 0;

    // Determine camera state
    let state: HealthState = 'HEALTHY';
    if (total === 0) {
      state = 'UNKNOWN';
    } else if (online === 0) {
      state = 'CRITICAL';
    } else if (online / total < 0.5) {
      state = 'CRITICAL';
    } else if (offline > 0) {
      state = 'WARNING';
    }

    return {
      total,
      online,
      offline,
      recording,
      notRecording,
      state,
    };
  }

  /**
   * Get recorder health summary for a branch
   */
  private async getRecorderHealth(branchId: string): Promise<RecorderHealthSummary> {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'online') as online,
        COUNT(*) FILTER (WHERE status = 'offline') as offline,
        MAX(recorder_type) as recorder_type,
        MAX(uptime_seconds) as uptime_seconds
      FROM recorders
      WHERE branch_id = $1
    `;

    const result = await this.pool.query(query, [branchId]);
    const row = result.rows[0];

    const total = parseInt(row.total) || 0;
    const online = parseInt(row.online) || 0;
    const offline = parseInt(row.offline) || 0;

    // Determine recorder state
    let state: HealthState = 'HEALTHY';
    if (total === 0) {
      state = 'UNKNOWN';
    } else if (online === 0) {
      state = 'CRITICAL';
    } else if (offline > 0) {
      state = 'WARNING';
    }

    return {
      total,
      online,
      offline,
      state,
      type: row.recorder_type,
      uptime: parseInt(row.uptime_seconds) || undefined,
    };
  }

  /**
   * Get storage health summary for a branch
   */
  private async getStorageHealth(branchId: string): Promise<StorageHealthSummary> {
    const query = `
      SELECT 
        COUNT(*) as total_disks,
        COUNT(*) FILTER (WHERE smart_status = 'healthy') as healthy_disks,
        COUNT(*) FILTER (WHERE smart_status IN ('failed', 'failure_predicted')) as failed_disks,
        COUNT(*) FILTER (WHERE smart_status = 'warning') as warning_disks,
        SUM(capacity_bytes) as total_capacity,
        SUM(used_bytes) as used_capacity
      FROM disk_health
      WHERE branch_id = $1
    `;

    const result = await this.pool.query(query, [branchId]);
    const row = result.rows[0];

    const totalDisks = parseInt(row.total_disks) || 0;
    const healthyDisks = parseInt(row.healthy_disks) || 0;
    const failedDisks = parseInt(row.failed_disks) || 0;
    const warningDisks = parseInt(row.warning_disks) || 0;

    const totalCapacity = row.total_capacity ? parseFloat(row.total_capacity) / (1024 ** 3) : 0;
    const usedCapacity = row.used_capacity ? parseFloat(row.used_capacity) / (1024 ** 3) : 0;
    const availableCapacity = totalCapacity - usedCapacity;
    const usagePercent = totalCapacity > 0 ? (usedCapacity / totalCapacity) * 100 : 0;

    // Determine storage state
    let state: HealthState = 'HEALTHY';
    if (totalDisks === 0) {
      state = 'UNKNOWN';
    } else if (failedDisks > 0) {
      state = 'CRITICAL';
    } else if (usagePercent > 95) {
      state = 'CRITICAL';
    } else if (warningDisks > 0 || usagePercent > 85) {
      state = 'WARNING';
    }

    return {
      state,
      disks: {
        total: totalDisks,
        healthy: healthyDisks,
        failed: failedDisks,
        warning: warningDisks,
      },
      capacity: totalCapacity > 0 ? {
        totalGB: totalCapacity,
        usedGB: usedCapacity,
        availableGB: availableCapacity,
        usagePercent,
      } : undefined,
    };
  }

  /**
   * Get retention health summary for a branch
   */
  private async getRetentionHealth(
    tenantId: string,
    branchId: string
  ): Promise<RetentionHealthSummary> {
    // Get retention policy
    const policyQuery = `
      SELECT retention_days_required
      FROM retention_policies
      WHERE tenant_id = $1 AND (branch_id = $2 OR branch_id IS NULL)
      ORDER BY branch_id NULLS LAST
      LIMIT 1
    `;

    const policyResult = await this.pool.query(policyQuery, [tenantId, branchId]);
    const requiredDays = policyResult.rows[0]?.retention_days_required || 90;

    // Get actual retention from storage status
    const retentionQuery = `
      SELECT 
        retention_days_available,
        last_verified_at,
        confidence_score
      FROM storage_status
      WHERE branch_id = $1
      ORDER BY last_updated DESC
      LIMIT 1
    `;

    const retentionResult = await this.pool.query(retentionQuery, [branchId]);
    
    if (retentionResult.rows.length === 0) {
      return {
        requiredDays,
        actualDays: null,
        gapDays: null,
        state: 'UNKNOWN',
        confidence: 0,
        observedAt: null,
      };
    }

    const row = retentionResult.rows[0];
    const actualDays = row.retention_days_available;
    const gapDays = actualDays != null ? requiredDays - actualDays : null;
    const confidence = parseFloat(row.confidence_score) || 0.8;

    let state: 'COMPLIANT' | 'BELOW_POLICY' | 'UNKNOWN' = 'UNKNOWN';
    
    if (actualDays == null || confidence < 0.3) {
      state = 'UNKNOWN';
    } else if (actualDays < requiredDays) {
      state = 'BELOW_POLICY';
    } else {
      state = 'COMPLIANT';
    }

    return {
      requiredDays,
      actualDays,
      gapDays,
      state,
      confidence,
      observedAt: row.last_verified_at,
    };
  }

  /**
   * Get network health summary for a branch
   */
  private async getNetworkHealth(branchId: string): Promise<NetworkHealthSummary> {
    const query = `
      SELECT 
        wan_status,
        vpn_status,
        failover_status,
        last_wan_disconnect
      FROM network_health
      WHERE branch_id = $1
      ORDER BY last_updated DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [branchId]);

    // Check edge agent connectivity
    const agentQuery = `
      SELECT status, last_heartbeat
      FROM edge_agents
      WHERE branch_id = $1
      ORDER BY last_heartbeat DESC
      LIMIT 1
    `;

    const agentResult = await this.pool.query(agentQuery, [branchId]);

    let internetState: ConnectivityState = 'UNKNOWN';
    let primaryLink: ConnectivityState = 'UNKNOWN';
    let failoverLink: ConnectivityState | undefined;
    let edgeAgentConnected = false;
    let lastSeenAt: Date | undefined;

    if (result.rows.length > 0) {
      const row = result.rows[0];
      
      // Map WAN status to internet state
      if (row.wan_status === 'connected') {
        if (row.failover_status === 'active') {
          internetState = 'FAILOVER';
        } else {
          internetState = 'ONLINE';
        }
      } else if (row.wan_status === 'degraded') {
        internetState = 'DEGRADED';
      } else {
        internetState = 'OFFLINE';
      }

      primaryLink = row.wan_status === 'connected' ? 'ONLINE' : 'OFFLINE';
      
      if (row.failover_status) {
        failoverLink = row.failover_status === 'active' ? 'ONLINE' : 'OFFLINE';
      }
    }

    if (agentResult.rows.length > 0) {
      const agent = agentResult.rows[0];
      edgeAgentConnected = agent.status === 'online';
      lastSeenAt = agent.last_heartbeat;

      // If edge agent is offline, internet is effectively offline
      if (!edgeAgentConnected) {
        internetState = 'OFFLINE';
      }
    }

    return {
      internetState,
      primaryLink,
      failoverLink,
      edgeAgentConnected,
      lastSeenAt,
    };
  }

  /**
   * Get UPS health summary for a branch
   */
  private async getUPSHealth(branchId: string): Promise<UPSHealthSummary> {
    const query = `
      SELECT 
        ups_status,
        utility_power_available,
        running_on_battery,
        battery_percent,
        last_check
      FROM ups_health
      WHERE branch_id = $1
      ORDER BY last_check DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [branchId]);

    if (result.rows.length === 0) {
      return {
        state: 'UNKNOWN',
        online: false,
        onBattery: false,
      };
    }

    const row = result.rows[0];
    const online = row.ups_status === 'online';
    const onBattery = row.running_on_battery;
    const batteryPercent = parseFloat(row.battery_percent);

    let state: HealthState = 'HEALTHY';
    
    if (row.ups_status === 'offline' || row.ups_status === 'unknown') {
      state = 'UNKNOWN';
    } else if (!row.utility_power_available && batteryPercent < 30) {
      state = 'CRITICAL';
    } else if (onBattery) {
      state = 'WARNING';
    }

    return {
      state,
      online,
      batteryPercent: batteryPercent || undefined,
      onBattery,
      lastSeenAt: row.last_check,
    };
  }

  /**
   * Get alert health summary for a branch
   */
  private async getAlertHealth(branchId: string): Promise<AlertHealthSummary> {
    const query = `
      SELECT 
        COUNT(*) FILTER (WHERE severity = 'critical' AND status = 'active') as p1_count,
        COUNT(*) FILTER (WHERE severity = 'warning' AND status = 'active') as p2_count,
        COUNT(*) FILTER (WHERE severity = 'info' AND status = 'active') as p3_count,
        COUNT(*) FILTER (WHERE status IN ('active', 'acknowledged')) as unacknowledged_count
      FROM operational_alerts
      WHERE branch_id = $1
    `;

    const result = await this.pool.query(query, [branchId]);
    const row = result.rows[0];

    return {
      p1Count: parseInt(row.p1_count) || 0,
      p2Count: parseInt(row.p2_count) || 0,
      p3Count: parseInt(row.p3_count) || 0,
      unacknowledgedCount: parseInt(row.unacknowledged_count) || 0,
    };
  }

  /**
   * Get last telemetry time for a branch
   */
  private async getLastTelemetryTime(branchId: string): Promise<Date | null> {
    const query = `
      SELECT last_heartbeat
      FROM edge_agents
      WHERE branch_id = $1
      ORDER BY last_heartbeat DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [branchId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].last_heartbeat;
  }

  /**
   * Handle health state change (record history and create events)
   */
  private async handleHealthChange(
    tenantId: string,
    previous: BranchOperationalHealth,
    current: BranchOperationalHealth
  ): Promise<void> {
    // Check if state or score changed significantly
    const stateChanged = previous.overallState !== current.overallState;
    const scoreChanged = Math.abs(previous.healthScore - current.healthScore) >= 5;

    if (!stateChanged && !scoreChanged) {
      return; // No significant change
    }

    // Create health change event
    const event: BranchHealthChangedEvent = {
      tenantId,
      branchId: current.branchId,
      branchCode: current.branchCode,
      branchName: current.branchName,
      previousState: previous.overallState,
      newState: current.overallState,
      previousScore: previous.healthScore,
      newScore: current.healthScore,
      reasonCodes: current.reasonCodes,
      reasons: current.reasons,
      changedAt: new Date(),
    };

    // Record in history
    await this.repository.recordHealthTransition(tenantId, event);

    // Create event for real-time notifications
    await this.repository.createHealthChangeEvent(tenantId, event);
  }

  /**
   * Check if cached health is stale (>30 seconds old)
   */
  private isCacheStale(health: BranchOperationalHealth): boolean {
    const ageMs = Date.now() - health.updatedAt.getTime();
    return ageMs > 30_000; // 30 seconds
  }
}
