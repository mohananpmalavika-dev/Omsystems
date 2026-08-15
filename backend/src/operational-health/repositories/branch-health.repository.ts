/**
 * Branch Operational Health Repository
 * 
 * Data access layer for branch operational health caching.
 * Handles CRUD operations for current health state, historical transitions,
 * and change events.
 */

import { Pool } from 'pg';
import {
  BranchOperationalHealth,
  BranchMosaicItem,
  BranchHealthFilter,
  OperationalDashboardSummary,
  BranchHealthChangedEvent,
  HealthState,
  ConnectivityState,
  RetentionState,
} from '../types/operational-health.types';

export class BranchHealthRepository {
  constructor(private pool: Pool) {}

  /**
   * Upsert current branch operational health state
   */
  async upsertCurrentHealth(
    tenantId: string,
    health: BranchOperationalHealth
  ): Promise<void> {
    const query = `
      INSERT INTO branch_operational_health_current (
        tenant_id, branch_id, branch_code, branch_name, region_id, region_name,
        overall_state, health_score, reason_codes,
        cameras_total, cameras_online, cameras_offline, cameras_recording, cameras_not_recording, camera_state,
        recorders_total, recorders_online, recorders_offline, recorder_state, recorder_type, recorder_uptime_seconds,
        storage_state, storage_disks_total, storage_disks_healthy, storage_disks_failed, storage_disks_warning,
        storage_capacity_total_gb, storage_capacity_used_gb, storage_capacity_available_gb, storage_capacity_usage_percent,
        retention_required_days, retention_actual_days, retention_gap_days, retention_state, retention_confidence, retention_observed_at,
        internet_state, primary_link_state, failover_link_state, edge_agent_connected, edge_agent_last_seen_at,
        ups_state, ups_online, ups_battery_percent, ups_on_battery, ups_last_seen_at,
        alerts_p1_count, alerts_p2_count, alerts_p3_count, alerts_unacknowledged_count,
        telemetry_freshness, last_telemetry_at, primary_reason,
        health_reasons, component_details,
        observed_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21,
        $22, $23, $24, $25, $26,
        $27, $28, $29, $30,
        $31, $32, $33, $34, $35, $36,
        $37, $38, $39, $40, $41,
        $42, $43, $44, $45, $46,
        $47, $48, $49, $50,
        $51, $52, $53,
        $54, $55,
        $56, $57
      )
      ON CONFLICT (tenant_id, branch_id)
      DO UPDATE SET
        branch_code = EXCLUDED.branch_code,
        branch_name = EXCLUDED.branch_name,
        region_id = EXCLUDED.region_id,
        region_name = EXCLUDED.region_name,
        overall_state = EXCLUDED.overall_state,
        health_score = EXCLUDED.health_score,
        reason_codes = EXCLUDED.reason_codes,
        cameras_total = EXCLUDED.cameras_total,
        cameras_online = EXCLUDED.cameras_online,
        cameras_offline = EXCLUDED.cameras_offline,
        cameras_recording = EXCLUDED.cameras_recording,
        cameras_not_recording = EXCLUDED.cameras_not_recording,
        camera_state = EXCLUDED.camera_state,
        recorders_total = EXCLUDED.recorders_total,
        recorders_online = EXCLUDED.recorders_online,
        recorders_offline = EXCLUDED.recorders_offline,
        recorder_state = EXCLUDED.recorder_state,
        recorder_type = EXCLUDED.recorder_type,
        recorder_uptime_seconds = EXCLUDED.recorder_uptime_seconds,
        storage_state = EXCLUDED.storage_state,
        storage_disks_total = EXCLUDED.storage_disks_total,
        storage_disks_healthy = EXCLUDED.storage_disks_healthy,
        storage_disks_failed = EXCLUDED.storage_disks_failed,
        storage_disks_warning = EXCLUDED.storage_disks_warning,
        storage_capacity_total_gb = EXCLUDED.storage_capacity_total_gb,
        storage_capacity_used_gb = EXCLUDED.storage_capacity_used_gb,
        storage_capacity_available_gb = EXCLUDED.storage_capacity_available_gb,
        storage_capacity_usage_percent = EXCLUDED.storage_capacity_usage_percent,
        retention_required_days = EXCLUDED.retention_required_days,
        retention_actual_days = EXCLUDED.retention_actual_days,
        retention_gap_days = EXCLUDED.retention_gap_days,
        retention_state = EXCLUDED.retention_state,
        retention_confidence = EXCLUDED.retention_confidence,
        retention_observed_at = EXCLUDED.retention_observed_at,
        internet_state = EXCLUDED.internet_state,
        primary_link_state = EXCLUDED.primary_link_state,
        failover_link_state = EXCLUDED.failover_link_state,
        edge_agent_connected = EXCLUDED.edge_agent_connected,
        edge_agent_last_seen_at = EXCLUDED.edge_agent_last_seen_at,
        ups_state = EXCLUDED.ups_state,
        ups_online = EXCLUDED.ups_online,
        ups_battery_percent = EXCLUDED.ups_battery_percent,
        ups_on_battery = EXCLUDED.ups_on_battery,
        ups_last_seen_at = EXCLUDED.ups_last_seen_at,
        alerts_p1_count = EXCLUDED.alerts_p1_count,
        alerts_p2_count = EXCLUDED.alerts_p2_count,
        alerts_p3_count = EXCLUDED.alerts_p3_count,
        alerts_unacknowledged_count = EXCLUDED.alerts_unacknowledged_count,
        telemetry_freshness = EXCLUDED.telemetry_freshness,
        last_telemetry_at = EXCLUDED.last_telemetry_at,
        primary_reason = EXCLUDED.primary_reason,
        health_reasons = EXCLUDED.health_reasons,
        component_details = EXCLUDED.component_details,
        observed_at = EXCLUDED.observed_at,
        updated_at = EXCLUDED.updated_at
    `;

    const values = [
      tenantId,
      health.branchId,
      health.branchCode,
      health.branchName,
      health.regionId || null,
      health.regionName || null,
      health.overallState,
      health.healthScore,
      health.reasonCodes,
      health.cameras.total,
      health.cameras.online,
      health.cameras.offline,
      health.cameras.recording,
      health.cameras.notRecording,
      health.cameras.state,
      health.recorders.total,
      health.recorders.online,
      health.recorders.offline,
      health.recorders.state,
      health.recorders.type || null,
      health.recorders.uptime || null,
      health.storage.state,
      health.storage.disks.total,
      health.storage.disks.healthy,
      health.storage.disks.failed,
      health.storage.disks.warning,
      health.storage.capacity?.totalGB || null,
      health.storage.capacity?.usedGB || null,
      health.storage.capacity?.availableGB || null,
      health.storage.capacity?.usagePercent || null,
      health.retention.requiredDays,
      health.retention.actualDays,
      health.retention.gapDays,
      health.retention.state,
      health.retention.confidence,
      health.retention.observedAt,
      health.network.internetState,
      health.network.primaryLink || null,
      health.network.failoverLink || null,
      health.network.edgeAgentConnected,
      health.network.lastSeenAt || null,
      health.ups.state,
      health.ups.online,
      health.ups.batteryPercent || null,
      health.ups.onBattery,
      health.ups.lastSeenAt || null,
      health.alerts.p1Count,
      health.alerts.p2Count,
      health.alerts.p3Count,
      health.alerts.unacknowledgedCount,
      health.telemetryFreshness,
      health.lastTelemetryAt,
      health.reasons.length > 0 ? health.reasons[0].message : null,
      JSON.stringify(health.reasons),
      null, // component_details - optional extended data
      health.observedAt,
      health.updatedAt,
    ];

    await this.pool.query(query, values);
  }

  /**
   * Get current health for a single branch
   */
  async getCurrentHealth(
    tenantId: string,
    branchId: string
  ): Promise<BranchOperationalHealth | null> {
    const query = `
      SELECT * FROM branch_operational_health_current
      WHERE tenant_id = $1 AND branch_id = $2
    `;

    const result = await this.pool.query(query, [tenantId, branchId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToHealth(result.rows[0]);
  }

  /**
   * Get current health for all branches (with optional filtering)
   */
  async getAllCurrentHealth(
    tenantId: string,
    filter?: BranchHealthFilter
  ): Promise<BranchOperationalHealth[]> {
    const { query, values } = this.buildFilteredQuery(tenantId, filter);

    const result = await this.pool.query(query, values);
    return result.rows.map(row => this.mapRowToHealth(row));
  }

  /**
   * Get lightweight mosaic items for all branches (fast query)
   */
  async getMosaicItems(
    tenantId: string,
    filter?: BranchHealthFilter
  ): Promise<BranchMosaicItem[]> {
    const { query, values } = this.buildMosaicQuery(tenantId, filter);

    const result = await this.pool.query(query, values);
    return result.rows.map(row => this.mapRowToMosaicItem(row));
  }

  /**
   * Get dashboard summary (aggregated KPIs)
   */
  async getDashboardSummary(tenantId: string): Promise<OperationalDashboardSummary> {
    const query = `
      SELECT
        COUNT(*) as branches_total,
        COUNT(*) FILTER (WHERE overall_state = 'HEALTHY') as branches_healthy,
        COUNT(*) FILTER (WHERE overall_state = 'WARNING') as branches_warning,
        COUNT(*) FILTER (WHERE overall_state = 'CRITICAL') as branches_critical,
        COUNT(*) FILTER (WHERE overall_state = 'UNKNOWN') as branches_unknown,
        
        SUM(cameras_total) as cameras_total,
        SUM(cameras_online) as cameras_online,
        SUM(cameras_offline) as cameras_offline,
        SUM(cameras_recording) as cameras_recording,
        SUM(cameras_not_recording) as cameras_not_recording,
        
        SUM(recorders_total) as recorders_total,
        SUM(recorders_online) as recorders_online,
        SUM(recorders_offline) as recorders_offline,
        
        COUNT(*) FILTER (WHERE storage_state = 'HEALTHY') as storage_healthy,
        COUNT(*) FILTER (WHERE storage_state = 'WARNING') as storage_warning,
        COUNT(*) FILTER (WHERE storage_state = 'CRITICAL') as storage_critical,
        
        COUNT(*) FILTER (WHERE retention_state = 'COMPLIANT') as retention_compliant,
        COUNT(*) FILTER (WHERE retention_state = 'BELOW_POLICY') as retention_violating,
        
        COUNT(*) FILTER (WHERE internet_state = 'ONLINE') as network_online,
        COUNT(*) FILTER (WHERE internet_state = 'DEGRADED') as network_degraded,
        COUNT(*) FILTER (WHERE internet_state = 'FAILOVER') as network_failover,
        COUNT(*) FILTER (WHERE internet_state = 'OFFLINE') as network_offline,
        
        SUM(alerts_p1_count) as alerts_p1,
        SUM(alerts_p2_count) as alerts_p2,
        SUM(alerts_p3_count) as alerts_p3
      FROM branch_operational_health_current
      WHERE tenant_id = $1
    `;

    const result = await this.pool.query(query, [tenantId]);
    const row = result.rows[0];

    return {
      generatedAt: new Date(),
      branches: {
        total: parseInt(row.branches_total) || 0,
        healthy: parseInt(row.branches_healthy) || 0,
        warning: parseInt(row.branches_warning) || 0,
        critical: parseInt(row.branches_critical) || 0,
        unknown: parseInt(row.branches_unknown) || 0,
      },
      cameras: {
        total: parseInt(row.cameras_total) || 0,
        online: parseInt(row.cameras_online) || 0,
        offline: parseInt(row.cameras_offline) || 0,
        recording: parseInt(row.cameras_recording) || 0,
        notRecording: parseInt(row.cameras_not_recording) || 0,
      },
      recorders: {
        total: parseInt(row.recorders_total) || 0,
        online: parseInt(row.recorders_online) || 0,
        offline: parseInt(row.recorders_offline) || 0,
      },
      storage: {
        healthy: parseInt(row.storage_healthy) || 0,
        warning: parseInt(row.storage_warning) || 0,
        critical: parseInt(row.storage_critical) || 0,
      },
      retention: {
        compliantBranches: parseInt(row.retention_compliant) || 0,
        violatingBranches: parseInt(row.retention_violating) || 0,
      },
      network: {
        online: parseInt(row.network_online) || 0,
        degraded: parseInt(row.network_degraded) || 0,
        failover: parseInt(row.network_failover) || 0,
        offline: parseInt(row.network_offline) || 0,
      },
      alerts: {
        p1: parseInt(row.alerts_p1) || 0,
        p2: parseInt(row.alerts_p2) || 0,
        p3: parseInt(row.alerts_p3) || 0,
      },
    };
  }

  /**
   * Record health state transition in history
   */
  async recordHealthTransition(
    tenantId: string,
    event: BranchHealthChangedEvent
  ): Promise<void> {
    const query = `
      INSERT INTO branch_operational_health_history (
        tenant_id, branch_id, branch_code, branch_name,
        previous_state, new_state, previous_score, new_score,
        reason_codes, health_reasons,
        transition_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;

    const values = [
      tenantId,
      event.branchId,
      event.branchCode,
      event.branchName,
      event.previousState,
      event.newState,
      event.previousScore,
      event.newScore,
      event.reasonCodes,
      JSON.stringify(event.reasons),
      event.changedAt,
    ];

    await this.pool.query(query, values);
  }

  /**
   * Create health change event for real-time notifications
   */
  async createHealthChangeEvent(
    tenantId: string,
    event: BranchHealthChangedEvent
  ): Promise<string> {
    const eventType = this.determineEventType(event);
    const scoreDelta = event.newScore - event.previousScore;

    const query = `
      INSERT INTO branch_health_change_events (
        tenant_id, branch_id, branch_code, branch_name,
        event_type, previous_state, new_state,
        previous_score, new_score, score_delta,
        current_reason_codes, event_data, occurred_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `;

    const values = [
      tenantId,
      event.branchId,
      event.branchCode,
      event.branchName,
      eventType,
      event.previousState,
      event.newState,
      event.previousScore,
      event.newScore,
      scoreDelta,
      event.reasonCodes,
      JSON.stringify(event),
      event.changedAt,
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0].id;
  }

  /**
   * Get unpublished health change events for notification processing
   */
  async getUnpublishedEvents(limit: number = 100): Promise<any[]> {
    const query = `
      SELECT * FROM branch_health_change_events
      WHERE NOT published
      ORDER BY created_at ASC
      LIMIT $1
    `;

    const result = await this.pool.query(query, [limit]);
    return result.rows;
  }

  /**
   * Mark event as published
   */
  async markEventPublished(eventId: string): Promise<void> {
    const query = `
      UPDATE branch_health_change_events
      SET published = true, published_at = NOW()
      WHERE id = $1
    `;

    await this.pool.query(query, [eventId]);
  }

  /**
   * Build filtered query for health retrieval
   */
  private buildFilteredQuery(
    tenantId: string,
    filter?: BranchHealthFilter
  ): { query: string; values: any[] } {
    const conditions: string[] = ['tenant_id = $1'];
    const values: any[] = [tenantId];
    let paramIndex = 2;

    if (filter?.states && filter.states.length > 0) {
      conditions.push(`overall_state = ANY($${paramIndex})`);
      values.push(filter.states);
      paramIndex++;
    }

    if (filter?.internetStates && filter.internetStates.length > 0) {
      conditions.push(`internet_state = ANY($${paramIndex})`);
      values.push(filter.internetStates);
      paramIndex++;
    }

    if (filter?.recorderStates && filter.recorderStates.length > 0) {
      conditions.push(`recorder_state = ANY($${paramIndex})`);
      values.push(filter.recorderStates);
      paramIndex++;
    }

    if (filter?.storageStates && filter.storageStates.length > 0) {
      conditions.push(`storage_state = ANY($${paramIndex})`);
      values.push(filter.storageStates);
      paramIndex++;
    }

    if (filter?.retentionViolation === true) {
      conditions.push(`retention_state = 'BELOW_POLICY'`);
    }

    if (filter?.recordingProblem === true) {
      conditions.push(`cameras_recording < cameras_total`);
    }

    if (filter?.cameraOffline === true) {
      conditions.push(`cameras_offline > 0`);
    }

    if (filter?.p1Only === true) {
      conditions.push(`alerts_p1_count > 0`);
    }

    if (filter?.regionIds && filter.regionIds.length > 0) {
      conditions.push(`region_id = ANY($${paramIndex})`);
      values.push(filter.regionIds);
      paramIndex++;
    }

    if (filter?.reasonCodes && filter.reasonCodes.length > 0) {
      conditions.push(`reason_codes && $${paramIndex}`);
      values.push(filter.reasonCodes);
      paramIndex++;
    }

    if (filter?.search) {
      conditions.push(`(
        branch_code ILIKE $${paramIndex} OR 
        branch_name ILIKE $${paramIndex}
      )`);
      values.push(`%${filter.search}%`);
      paramIndex++;
    }

    const query = `
      SELECT * FROM branch_operational_health_current
      WHERE ${conditions.join(' AND ')}
      ORDER BY overall_state DESC, health_score ASC, branch_name ASC
    `;

    return { query, values };
  }

  /**
   * Build optimized mosaic query (only fields needed for display)
   */
  private buildMosaicQuery(
    tenantId: string,
    filter?: BranchHealthFilter
  ): { query: string; values: any[] } {
    const { query: fullQuery, values } = this.buildFilteredQuery(tenantId, filter);
    
    // Replace SELECT * with specific lightweight fields
    const mosaicQuery = fullQuery.replace(
      'SELECT * FROM',
      `SELECT 
        branch_id, branch_code, branch_name, region_name,
        overall_state, health_score, reason_codes, primary_reason,
        cameras_online, cameras_total, cameras_recording,
        recorder_state, storage_state,
        retention_actual_days, retention_required_days, retention_state,
        internet_state, alerts_p1_count,
        telemetry_freshness, last_telemetry_at
      FROM`
    );

    return { query: mosaicQuery, values };
  }

  /**
   * Map database row to BranchOperationalHealth object
   */
  private mapRowToHealth(row: any): BranchOperationalHealth {
    return {
      branchId: row.branch_id,
      branchCode: row.branch_code,
      branchName: row.branch_name,
      regionId: row.region_id,
      regionName: row.region_name,
      overallState: row.overall_state as HealthState,
      healthScore: row.health_score,
      reasonCodes: row.reason_codes || [],
      reasons: row.health_reasons ? JSON.parse(row.health_reasons) : [],
      cameras: {
        total: row.cameras_total,
        online: row.cameras_online,
        offline: row.cameras_offline,
        recording: row.cameras_recording,
        notRecording: row.cameras_not_recording,
        state: row.camera_state as HealthState,
      },
      recorders: {
        total: row.recorders_total,
        online: row.recorders_online,
        offline: row.recorders_offline,
        state: row.recorder_state as HealthState,
        type: row.recorder_type,
        uptime: row.recorder_uptime_seconds,
      },
      storage: {
        state: row.storage_state as HealthState,
        disks: {
          total: row.storage_disks_total || 0,
          healthy: row.storage_disks_healthy || 0,
          failed: row.storage_disks_failed || 0,
          warning: row.storage_disks_warning || 0,
        },
        capacity: row.storage_capacity_total_gb ? {
          totalGB: parseFloat(row.storage_capacity_total_gb),
          usedGB: parseFloat(row.storage_capacity_used_gb),
          availableGB: parseFloat(row.storage_capacity_available_gb),
          usagePercent: parseFloat(row.storage_capacity_usage_percent),
        } : undefined,
      },
      retention: {
        requiredDays: row.retention_required_days,
        actualDays: row.retention_actual_days,
        gapDays: row.retention_gap_days,
        state: row.retention_state as RetentionState,
        confidence: parseFloat(row.retention_confidence) || 0,
        observedAt: row.retention_observed_at,
      },
      network: {
        internetState: row.internet_state as ConnectivityState,
        primaryLink: row.primary_link_state as ConnectivityState,
        failoverLink: row.failover_link_state as ConnectivityState,
        edgeAgentConnected: row.edge_agent_connected,
        lastSeenAt: row.edge_agent_last_seen_at,
      },
      ups: {
        state: row.ups_state as HealthState,
        online: row.ups_online,
        batteryPercent: row.ups_battery_percent,
        onBattery: row.ups_on_battery,
        lastSeenAt: row.ups_last_seen_at,
      },
      alerts: {
        p1Count: row.alerts_p1_count,
        p2Count: row.alerts_p2_count,
        p3Count: row.alerts_p3_count,
        unacknowledgedCount: row.alerts_unacknowledged_count,
      },
      telemetryFreshness: row.telemetry_freshness,
      lastTelemetryAt: row.last_telemetry_at,
      observedAt: row.observed_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Map database row to lightweight BranchMosaicItem
   */
  private mapRowToMosaicItem(row: any): BranchMosaicItem {
    return {
      branchId: row.branch_id,
      branchCode: row.branch_code,
      branchName: row.branch_name,
      regionName: row.region_name,
      state: row.overall_state as HealthState,
      score: row.health_score,
      camerasOnline: row.cameras_online,
      camerasTotal: row.cameras_total,
      camerasRecording: row.cameras_recording,
      recorderState: row.recorder_state as HealthState,
      storageState: row.storage_state as HealthState,
      retentionDays: row.retention_actual_days,
      retentionRequiredDays: row.retention_required_days,
      retentionState: row.retention_state as RetentionState,
      internetState: row.internet_state as ConnectivityState,
      p1Alerts: row.alerts_p1_count,
      primaryReason: row.primary_reason,
      reasonCodes: row.reason_codes || [],
      telemetryFreshness: row.telemetry_freshness,
      lastSeenAt: row.last_telemetry_at,
    };
  }

  /**
   * Determine event type from health change
   */
  private determineEventType(event: BranchHealthChangedEvent): string {
    if (event.previousState !== event.newState) {
      if (event.newState === 'CRITICAL') return 'CRITICAL_ENTERED';
      if (event.previousState === 'CRITICAL') return 'CRITICAL_CLEARED';
      if (event.newState === 'WARNING') return 'WARNING_ENTERED';
      if (event.previousState === 'WARNING') return 'WARNING_CLEARED';
      return 'STATE_CHANGED';
    }

    const scoreDelta = event.newScore - event.previousScore;
    if (scoreDelta < -10) return 'SCORE_DEGRADED';
    if (scoreDelta > 10) return 'SCORE_IMPROVED';

    return 'STATE_CHANGED';
  }
}
