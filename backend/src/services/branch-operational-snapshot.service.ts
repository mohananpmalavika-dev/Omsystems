/**
 * Branch Operational Snapshot Service
 * 
 * Unified service that provides a complete operational health snapshot for a branch.
 * This is the single source of truth for the Branch Command Center UI.
 * 
 * Architecture:
 * - Aggregates data from cameras, recorders, storage, network, retention, alerts
 * - Applies health evaluation rules to determine overall state
 * - Caches results for 30 seconds to reduce database load
 * - Provides normalized, frontend-ready data models
 */

import { Pool } from 'pg';
import {
  BranchOperationalSnapshot,
  CameraHealthSummary,
  CameraOperationalStatus,
  CameraOperationalState,
  RecorderHealthSummary,
  RecorderStatus,
  RecorderState,
  StorageHealthSummary,
  StorageState,
  DiskStatus,
  BranchRetentionSummary,
  RetentionState,
  BranchConnectivityStatus,
  ConnectivityState,
  LinkHealth,
  UPSHealthStatus,
  AlertSummary,
  BranchHealthReason,
  HealthState,
  TelemetryFreshness,
  BranchOperationalEvent,
} from '../types/branch-operational-snapshot.types';

export class BranchOperationalSnapshotService {
  private cache = new Map<string, { snapshot: BranchOperationalSnapshot; cachedAt: Date }>();
  private readonly CACHE_TTL_MS = 30_000; // 30 seconds

  constructor(private pool: Pool) {}

  /**
   * Get complete operational snapshot for a branch
   */
  async getBranchSnapshot(
    tenantId: string,
    branchId: string,
    forceRefresh = false
  ): Promise<BranchOperationalSnapshot | null> {
    const cacheKey = `${tenantId}:${branchId}`;

    // Check cache unless force refresh
    if (!forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt.getTime() < this.CACHE_TTL_MS) {
        return cached.snapshot;
      }
    }

    // Compute fresh snapshot
    const snapshot = await this.computeSnapshot(tenantId, branchId);

    if (snapshot) {
      // Update cache
      this.cache.set(cacheKey, {
        snapshot,
        cachedAt: new Date(),
      });
    }

    return snapshot;
  }

  /**
   * Get detailed camera list with operational status
   */
  async getBranchCameras(
    tenantId: string,
    branchId: string,
    filter?: 'all' | 'online' | 'offline' | 'recording' | 'not-recording' | 'problem'
  ): Promise<{ cameras: CameraOperationalStatus[]; summary: CameraHealthSummary }> {
    // Get all cameras with their health data
    let filterClause = '';
    switch (filter) {
      case 'online':
        filterClause = "AND c.online_status = 'online'";
        break;
      case 'offline':
        filterClause = "AND c.online_status = 'offline'";
        break;
      case 'recording':
        filterClause = "AND c.recording_status = 'recording'";
        break;
      case 'not-recording':
        filterClause = "AND c.recording_status != 'recording'";
        break;
      case 'problem':
        filterClause = `AND (
          c.online_status = 'offline' 
          OR c.recording_status != 'recording'
          OR ch.video_loss = true
          OR ch.tampering_detected = true
          OR ch.image_frozen = true
        )`;
        break;
    }

    const query = `
      SELECT 
        c.id,
        c.name,
        c.channel_number,
        c.online_status,
        c.recording_status,
        c.last_heartbeat,
        c.current_fps,
        c.expected_fps,
        c.latency_ms,
        c.health_score,
        c.ptz_supported,
        c.audio_supported,
        ch.stream_available,
        ch.video_loss,
        ch.tampering_detected,
        ch.image_frozen,
        ch.black_screen,
        rs.last_segment_time,
        rs.gap_seconds,
        rt.retention_days_available,
        rt.retention_state
      FROM cameras c
      LEFT JOIN camera_health ch ON ch.camera_id = c.id
      LEFT JOIN recording_status rs ON rs.camera_id = c.id
      LEFT JOIN (
        SELECT 
          camera_id,
          retention_days_available,
          CASE 
            WHEN retention_days_available >= rp.retention_days_required THEN 'COMPLIANT'
            WHEN retention_days_available >= rp.retention_days_required * 0.9 THEN 'WARNING'
            WHEN retention_days_available < rp.retention_days_required THEN 'VIOLATION'
            ELSE 'UNKNOWN'
          END as retention_state
        FROM camera_retention cr
        CROSS JOIN (
          SELECT retention_days_required 
          FROM retention_policies 
          WHERE tenant_id = $1 
          ORDER BY branch_id NULLS LAST 
          LIMIT 1
        ) rp
      ) rt ON rt.camera_id = c.id
      WHERE c.branch_id = $2
      ${filterClause}
      ORDER BY c.channel_number, c.name
    `;

    const result = await this.pool.query(query, [tenantId, branchId]);

    const cameras: CameraOperationalStatus[] = result.rows.map((row) => {
      const state = this.determineCameraState(row);

      return {
        id: row.id,
        name: row.name,
        channelNumber: row.channel_number,
        state,
        healthScore: parseFloat(row.health_score) || 0,
        onlineStatus: row.online_status,
        streamAvailable: row.stream_available || false,
        recordingStatus: row.recording_status,
        lastRecordingAt: row.last_segment_time,
        recordingGapSeconds: row.gap_seconds,
        retentionDays: row.retention_days_available,
        retentionState: row.retention_state,
        currentFps: row.current_fps,
        expectedFps: row.expected_fps,
        latencyMs: row.latency_ms,
        videoLoss: row.video_loss || false,
        tamperingDetected: row.tampering_detected || false,
        imageFrozen: row.image_frozen || false,
        blackScreen: row.black_screen || false,
        ptzSupported: row.ptz_supported || false,
        audioSupported: row.audio_supported || false,
        lastHeartbeat: row.last_heartbeat,
        observedAt: new Date(),
      };
    });

    // Compute summary
    const summary = this.computeCameraSummary(cameras);

    return { cameras, summary };
  }

  /**
   * Get recent operational events for a branch
   */
  async getBranchEvents(
    branchId: string,
    options: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
      severity?: 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';
      type?: BranchOperationalEvent['type'];
    } = {}
  ): Promise<{ events: BranchOperationalEvent[]; total: number }> {
    const conditions = ['branch_id = $1'];
    const params: any[] = [branchId];
    let paramIndex = 2;

    if (options.startDate) {
      conditions.push(`occurred_at >= $${paramIndex++}`);
      params.push(options.startDate);
    }

    if (options.endDate) {
      conditions.push(`occurred_at <= $${paramIndex++}`);
      params.push(options.endDate);
    }

    if (options.severity) {
      conditions.push(`severity = $${paramIndex++}`);
      params.push(options.severity);
    }

    if (options.type) {
      conditions.push(`event_type = $${paramIndex++}`);
      params.push(options.type);
    }

    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const query = `
      SELECT 
        id,
        branch_id,
        event_type,
        severity,
        title,
        description,
        camera_id,
        camera_name,
        recorder_id,
        alert_id,
        occurred_at,
        metadata
      FROM branch_operational_events
      WHERE ${conditions.join(' AND ')}
      ORDER BY occurred_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await this.pool.query(query, params);

    const events: BranchOperationalEvent[] = result.rows.map((row) => ({
      id: row.id,
      branchId: row.branch_id,
      type: row.event_type,
      severity: row.severity,
      title: row.title,
      description: row.description,
      cameraId: row.camera_id,
      cameraName: row.camera_name,
      recorderId: row.recorder_id,
      alertId: row.alert_id,
      occurredAt: row.occurred_at,
      metadata: row.metadata,
    }));

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM branch_operational_events
      WHERE ${conditions.join(' AND ')}
    `;

    const countResult = await this.pool.query(countQuery, params.slice(0, paramIndex - 2));
    const total = parseInt(countResult.rows[0]?.total) || 0;

    return { events, total };
  }

  /**
   * Record a new operational event
   */
  async recordEvent(event: Omit<BranchOperationalEvent, 'id' | 'occurredAt'>): Promise<void> {
    const query = `
      INSERT INTO branch_operational_events (
        id, branch_id, event_type, severity, title, description,
        camera_id, camera_name, recorder_id, alert_id, occurred_at, metadata
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10
      )
    `;

    await this.pool.query(query, [
      event.branchId,
      event.type,
      event.severity,
      event.title,
      event.description,
      event.cameraId,
      event.cameraName,
      event.recorderId,
      event.alertId,
      event.metadata ? JSON.stringify(event.metadata) : null,
    ]);
  }

  /**
   * Compute complete operational snapshot (internal)
   */
  private async computeSnapshot(
    tenantId: string,
    branchId: string
  ): Promise<BranchOperationalSnapshot | null> {
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

    // Aggregate all component health in parallel
    const [
      cameraData,
      recorders,
      storage,
      retention,
      network,
      ups,
      alerts,
      lastTelemetry,
    ] = await Promise.all([
      this.getBranchCameras(tenantId, branchId),
      this.getRecorderHealth(branchId),
      this.getStorageHealth(branchId),
      this.getRetentionHealth(tenantId, branchId),
      this.getNetworkHealth(branchId),
      this.getUPSHealth(branchId),
      this.getAlertSummary(branchId),
      this.getLastTelemetryTime(branchId),
    ]);

    // Determine telemetry freshness
    const telemetryFreshness = this.determineTelemetryFreshness(lastTelemetry);

    // Evaluate overall health and determine reasons
    const evaluation = this.evaluateOverallHealth({
      cameras: cameraData.summary,
      recorders,
      storage,
      retention,
      network,
      alerts,
      telemetryFreshness,
    });

    // Build complete snapshot
    const snapshot: BranchOperationalSnapshot = {
      branchId: branch.id,
      branchCode: branch.code,
      branchName: branch.name,
      regionId: branch.region_id,
      regionName: branch.region_name,
      overallState: evaluation.state,
      healthScore: evaluation.score,
      reasonCodes: evaluation.reasons.map((r) => r.code),
      reasons: evaluation.reasons,
      primaryReason: evaluation.reasons[0], // Most severe reason
      cameras: cameraData.summary,
      recorders,
      storage,
      retention,
      network,
      ups,
      alerts,
      telemetryFreshness,
      lastTelemetryAt: lastTelemetry,
      observedAt: new Date(),
      computedAt: new Date(),
    };

    return snapshot;
  }

  /**
   * Determine camera operational state from raw data
   */
  private determineCameraState(camera: any): CameraOperationalState {
    if (camera.online_status === 'offline') return 'OFFLINE';
    if (camera.online_status === 'unknown') return 'UNKNOWN';

    // Camera is online
    if (!camera.stream_available) return 'STREAM_LOSS';
    if (camera.recording_status !== 'recording') return 'NO_RECORD';
    if (camera.recording_status === 'recording') return 'LIVE';

    return 'ONLINE';
  }

  /**
   * Compute camera summary from camera list
   */
  private computeCameraSummary(cameras: CameraOperationalStatus[]): CameraHealthSummary {
    const total = cameras.length;
    const online = cameras.filter((c) => c.onlineStatus === 'online').length;
    const offline = cameras.filter((c) => c.onlineStatus === 'offline').length;
    const recording = cameras.filter((c) => c.recordingStatus === 'recording').length;
    const notRecording = total - recording;
    const streamLoss = cameras.filter((c) => c.state === 'STREAM_LOSS').length;
    const videoLoss = cameras.filter((c) => c.videoLoss).length;

    const healthyCount = cameras.filter((c) => c.healthScore >= 80).length;
    const warningCount = cameras.filter((c) => c.healthScore >= 50 && c.healthScore < 80).length;
    const criticalCount = cameras.filter((c) => c.healthScore < 50).length;

    // Determine overall camera state
    let state: HealthState = 'HEALTHY';
    if (total === 0) {
      state = 'UNKNOWN';
    } else if (criticalCount > total * 0.5 || offline === total) {
      state = 'CRITICAL';
    } else if (criticalCount > 0 || warningCount > total * 0.3) {
      state = 'WARNING';
    }

    return {
      total,
      online,
      offline,
      recording,
      notRecording,
      streamLoss,
      videoLoss,
      healthyCount,
      warningCount,
      criticalCount,
      state,
    };
  }

  /**
   * Get recorder health for branch
   */
  private async getRecorderHealth(branchId: string): Promise<RecorderHealthSummary> {
    const query = `
      SELECT 
        id,
        name,
        recorder_type,
        status,
        last_heartbeat,
        uptime_seconds,
        total_channels,
        active_channels,
        recording_channels,
        cpu_usage,
        memory_usage,
        firmware_version
      FROM recorders
      WHERE branch_id = $1
      ORDER BY name
    `;

    const result = await this.pool.query(query, [branchId]);

    const recorders: RecorderStatus[] = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.recorder_type,
      state: this.mapRecorderState(row.status),
      online: row.status === 'online',
      lastHeartbeat: row.last_heartbeat,
      uptimeSeconds: row.uptime_seconds,
      totalChannels: row.total_channels || 0,
      activeChannels: row.active_channels || 0,
      recordingChannels: row.recording_channels || 0,
      cpuUsage: row.cpu_usage,
      memoryUsage: row.memory_usage,
      firmwareVersion: row.firmware_version,
      observedAt: new Date(),
    }));

    const total = recorders.length;
    const online = recorders.filter((r) => r.online).length;
    const offline = recorders.filter((r) => r.state === 'OFFLINE').length;
    const degraded = recorders.filter((r) => r.state === 'DEGRADED').length;

    let state: HealthState = 'HEALTHY';
    if (total === 0) {
      state = 'UNKNOWN';
    } else if (online === 0) {
      state = 'CRITICAL';
    } else if (degraded > 0 || offline > 0) {
      state = 'WARNING';
    }

    return { total, online, offline, degraded, state, recorders };
  }

  /**
   * Get storage health for branch
   */
  private async getStorageHealth(branchId: string): Promise<StorageHealthSummary> {
    const query = `
      SELECT 
        dh.id,
        dh.device_path,
        dh.serial_number,
        dh.model,
        dh.smart_status,
        dh.temperature_celsius,
        dh.power_on_hours,
        dh.reallocated_sectors,
        dh.pending_sectors,
        dh.uncorrectable_sectors,
        dh.failure_probability_percent,
        dh.capacity_bytes,
        dh.used_bytes,
        dh.last_check,
        ss.total_capacity_bytes,
        ss.used_capacity_bytes,
        ss.raid_status
      FROM disk_health dh
      LEFT JOIN storage_status ss ON ss.branch_id = dh.branch_id
      WHERE dh.branch_id = $1
      ORDER BY 
        CASE dh.smart_status
          WHEN 'failed' THEN 1
          WHEN 'failure_predicted' THEN 2
          WHEN 'warning' THEN 3
          ELSE 4
        END
    `;

    const result = await this.pool.query(query, [branchId]);

    const disks: DiskStatus[] = result.rows.map((row) => ({
      id: row.id,
      devicePath: row.device_path,
      serialNumber: row.serial_number,
      model: row.model,
      smartStatus: row.smart_status,
      temperature: row.temperature_celsius,
      powerOnHours: row.power_on_hours,
      reallocatedSectors: row.reallocated_sectors || 0,
      pendingSectors: row.pending_sectors || 0,
      uncorrectableSectors: row.uncorrectable_sectors || 0,
      failureProbability: row.failure_probability_percent,
      capacityGB: row.capacity_bytes ? row.capacity_bytes / (1024 ** 3) : undefined,
      usedGB: row.used_bytes ? row.used_bytes / (1024 ** 3) : undefined,
      lastCheck: row.last_check,
    }));

    const total = disks.length;
    const healthy = disks.filter((d) => d.smartStatus === 'healthy').length;
    const warning = disks.filter((d) => d.smartStatus === 'warning').length;
    const failed = disks.filter((d) => d.smartStatus === 'failed' || d.smartStatus === 'failure_predicted').length;
    const unknown = disks.filter((d) => d.smartStatus === 'unknown').length;

    // Get aggregate capacity
    let capacity;
    if (result.rows.length > 0 && result.rows[0].total_capacity_bytes) {
      const totalGB = result.rows[0].total_capacity_bytes / (1024 ** 3);
      const usedGB = (result.rows[0].used_capacity_bytes || 0) / (1024 ** 3);
      const availableGB = totalGB - usedGB;
      const usagePercent = (usedGB / totalGB) * 100;

      capacity = { totalGB, usedGB, availableGB, usagePercent };
    }

    // Determine state
    let state: StorageState = 'HEALTHY';
    if (total === 0) {
      state = 'UNKNOWN';
    } else if (failed > 0) {
      state = 'CRITICAL';
    } else if (warning > 0 || (capacity && capacity.usagePercent > 85)) {
      state = 'WARNING';
    }

    const criticalDisks = disks.filter((d) => 
      d.smartStatus === 'failed' || d.smartStatus === 'failure_predicted'
    );

    return {
      state,
      disks: { total, healthy, warning, failed, unknown },
      capacity,
      criticalDisks,
      raidStatus: result.rows[0]?.raid_status,
      observedAt: new Date(),
    };
  }

  /**
   * Get retention health for branch
   */
  private async getRetentionHealth(
    tenantId: string,
    branchId: string
  ): Promise<BranchRetentionSummary> {
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

    // Get per-camera retention
    const retentionQuery = `
      SELECT 
        cr.camera_id,
        c.name as camera_name,
        cr.retention_days_available,
        cr.confidence_score,
        cr.last_verified_at
      FROM camera_retention cr
      JOIN cameras c ON c.id = cr.camera_id
      WHERE c.branch_id = $1 AND cr.retention_days_available IS NOT NULL
      ORDER BY cr.retention_days_available ASC
    `;

    const retentionResult = await this.pool.query(retentionQuery, [branchId]);

    if (retentionResult.rows.length === 0) {
      return {
        requiredDays,
        compliantChannels: 0,
        warningChannels: 0,
        violatingChannels: 0,
        unknownChannels: 0,
        state: 'UNKNOWN',
        confidence: 0,
      };
    }

    const retentionData = retentionResult.rows;
    const allDays = retentionData.map((r) => r.retention_days_available);
    const minimumVerifiedDays = Math.min(...allDays);
    const medianVerifiedDays = allDays[Math.floor(allDays.length / 2)];

    const compliantChannels = retentionData.filter((r) => r.retention_days_available >= requiredDays).length;
    const warningChannels = retentionData.filter(
      (r) => r.retention_days_available >= requiredDays * 0.9 && r.retention_days_available < requiredDays
    ).length;
    const violatingChannels = retentionData.filter((r) => r.retention_days_available < requiredDays * 0.9).length;

    // Total cameras in branch
    const totalQuery = 'SELECT COUNT(*) FROM cameras WHERE branch_id = $1';
    const totalResult = await this.pool.query(totalQuery, [branchId]);
    const totalCameras = parseInt(totalResult.rows[0].count);
    const unknownChannels = totalCameras - retentionData.length;

    // Determine state
    let state: RetentionState = 'COMPLIANT';
    if (violatingChannels > 0) {
      state = 'VIOLATION';
    } else if (warningChannels > 0 || unknownChannels > 0) {
      state = 'WARNING';
    } else if (compliantChannels === 0) {
      state = 'UNKNOWN';
    }

    // Get affected cameras for violations/warnings
    const affectedCameras = retentionData
      .filter((r) => r.retention_days_available < requiredDays)
      .map((r) => ({
        cameraId: r.camera_id,
        cameraName: r.camera_name,
        actualDays: r.retention_days_available,
        gapDays: requiredDays - r.retention_days_available,
        severity: (r.retention_days_available < requiredDays * 0.9 ? 'CRITICAL' : 'WARNING') as 'CRITICAL' | 'WARNING',
      }));

    const avgConfidence = retentionData.reduce((sum, r) => sum + (r.confidence_score || 0.8), 0) / retentionData.length;

    return {
      requiredDays,
      minimumVerifiedDays,
      medianVerifiedDays,
      compliantChannels,
      warningChannels,
      violatingChannels,
      unknownChannels,
      state,
      confidence: avgConfidence,
      affectedCameras,
      observedAt: retentionData[0]?.last_verified_at,
    };
  }

  /**
   * Get network health for branch
   */
  private async getNetworkHealth(branchId: string): Promise<BranchConnectivityStatus> {
    const query = `
      SELECT 
        wan_status,
        secondary_wan_status,
        failover_active,
        latency_ms,
        packet_loss_percent,
        vpn_connected,
        vpn_established_at,
        gateway_ip,
        gateway_reachable,
        last_wan_disconnect,
        last_wan_reconnect,
        last_updated
      FROM network_health
      WHERE branch_id = $1
      ORDER BY last_updated DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [branchId]);

    // Get edge agent status
    const agentQuery = `
      SELECT status, version, last_heartbeat
      FROM edge_agents
      WHERE branch_id = $1
      ORDER BY last_heartbeat DESC
      LIMIT 1
    `;

    const agentResult = await this.pool.query(agentQuery, [branchId]);

    let state: ConnectivityState = 'UNKNOWN';
    const primaryWan: LinkHealth = { state: 'UNKNOWN' };
    let secondaryWan: LinkHealth | undefined;
    let gateway;
    let vpn;
    let edgeAgent;
    let lastOutage;

    if (result.rows.length > 0) {
      const row = result.rows[0];

      // Determine overall state
      if (row.failover_active) {
        state = 'FAILOVER';
      } else if (row.wan_status === 'connected') {
        state = 'ONLINE';
      } else if (row.wan_status === 'degraded') {
        state = 'DEGRADED';
      } else {
        state = 'OFFLINE';
      }

      primaryWan.state = row.wan_status === 'connected' ? 'ONLINE' : 'OFFLINE';
      primaryWan.latencyMs = row.latency_ms;
      primaryWan.packetLossPct = row.packet_loss_percent;

      if (row.secondary_wan_status) {
        secondaryWan = {
          state: row.secondary_wan_status === 'connected' ? 'ONLINE' : 'OFFLINE',
        };
      }

      gateway = {
        reachable: row.gateway_reachable || false,
        ipAddress: row.gateway_ip,
        lastSeenAt: row.last_updated,
      };

      vpn = {
        connected: row.vpn_connected || false,
        lastEstablishedAt: row.vpn_established_at,
      };

      if (row.last_wan_disconnect && row.last_wan_reconnect) {
        const start = new Date(row.last_wan_disconnect);
        const end = new Date(row.last_wan_reconnect);
        lastOutage = {
          startedAt: start,
          endedAt: end,
          durationSeconds: Math.floor((end.getTime() - start.getTime()) / 1000),
        };
      }
    }

    if (agentResult.rows.length > 0) {
      const agent = agentResult.rows[0];
      edgeAgent = {
        connected: agent.status === 'online',
        version: agent.version,
        lastHeartbeat: agent.last_heartbeat,
      };

      // If edge agent offline, mark internet as offline
      if (!edgeAgent.connected) {
        state = 'OFFLINE';
      }
    }

    return {
      state,
      primaryWan,
      secondaryWan,
      gateway,
      vpn,
      edgeAgent,
      latencyMs: primaryWan.latencyMs,
      packetLossPct: primaryWan.packetLossPct,
      lastOutage,
      observedAt: new Date(),
    };
  }

  /**
   * Get UPS health for branch
   */
  private async getUPSHealth(branchId: string): Promise<UPSHealthStatus | undefined> {
    const query = `
      SELECT 
        ups_status,
        utility_power_available,
        running_on_battery,
        battery_percent,
        estimated_runtime_minutes,
        load_percent,
        input_voltage,
        output_voltage,
        battery_age_months,
        last_self_test,
        last_check
      FROM ups_health
      WHERE branch_id = $1
      ORDER BY last_check DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [branchId]);

    if (result.rows.length === 0) {
      return undefined;
    }

    const row = result.rows[0];
    const online = row.ups_status === 'online';
    const onBattery = row.running_on_battery || false;
    const batteryPercent = row.battery_percent;

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
      utilityPowerAvailable: row.utility_power_available,
      onBattery,
      batteryPercent,
      estimatedRuntimeMinutes: row.estimated_runtime_minutes,
      loadPercent: row.load_percent,
      inputVoltage: row.input_voltage,
      outputVoltage: row.output_voltage,
      batteryAgeMonths: row.battery_age_months,
      lastSelfTest: row.last_self_test,
      observedAt: row.last_check,
    };
  }

  /**
   * Get alert summary for branch
   */
  private async getAlertSummary(branchId: string): Promise<AlertSummary> {
    const query = `
      SELECT 
        COUNT(*) FILTER (WHERE severity = 'critical' AND status = 'active') as p1_count,
        COUNT(*) FILTER (WHERE severity = 'warning' AND status = 'active') as p2_count,
        COUNT(*) FILTER (WHERE severity = 'info' AND status = 'active') as p3_count,
        COUNT(*) FILTER (WHERE status = 'active') as unacknowledged_count,
        COUNT(*) FILTER (WHERE status IN ('active', 'acknowledged')) as active_count
      FROM operational_alerts
      WHERE branch_id = $1
    `;

    const result = await this.pool.query(query, [branchId]);
    const row = result.rows[0];

    // Get recent critical alerts
    const recentQuery = `
      SELECT id, title, component_type, device_id, detected_at
      FROM operational_alerts
      WHERE branch_id = $1 AND severity = 'critical' AND status = 'active'
      ORDER BY detected_at DESC
      LIMIT 5
    `;

    const recentResult = await this.pool.query(recentQuery, [branchId]);

    return {
      p1Count: parseInt(row.p1_count) || 0,
      p2Count: parseInt(row.p2_count) || 0,
      p3Count: parseInt(row.p3_count) || 0,
      unacknowledgedCount: parseInt(row.unacknowledged_count) || 0,
      activeCount: parseInt(row.active_count) || 0,
      recentCritical: recentResult.rows.map((r) => ({
        id: r.id,
        title: r.title,
        componentType: r.component_type,
        deviceId: r.device_id,
        detectedAt: r.detected_at,
      })),
    };
  }

  /**
   * Get last telemetry timestamp for branch
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
    return result.rows[0]?.last_heartbeat || null;
  }

  /**
   * Determine telemetry freshness
   */
  private determineTelemetryFreshness(lastTelemetry: Date | null): TelemetryFreshness {
    if (!lastTelemetry) return 'OUTDATED';

    const ageMs = Date.now() - lastTelemetry.getTime();

    if (ageMs < 30_000) return 'CURRENT';
    if (ageMs < 120_000) return 'RECENT';
    if (ageMs < 600_000) return 'STALE';
    return 'OUTDATED';
  }

  /**
   * Map recorder status to recorder state
   */
  private mapRecorderState(status: string): RecorderState {
    switch (status) {
      case 'online':
        return 'ONLINE';
      case 'degraded':
        return 'DEGRADED';
      case 'offline':
        return 'OFFLINE';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Evaluate overall branch health from component states
   */
  private evaluateOverallHealth(components: {
    cameras: CameraHealthSummary;
    recorders: RecorderHealthSummary;
    storage: StorageHealthSummary;
    retention: BranchRetentionSummary;
    network: BranchConnectivityStatus;
    alerts: AlertSummary;
    telemetryFreshness: TelemetryFreshness;
  }): { state: HealthState; score: number; reasons: BranchHealthReason[] } {
    const reasons: BranchHealthReason[] = [];
    let score = 100;

    // Check telemetry freshness first
    if (components.telemetryFreshness === 'OUTDATED') {
      reasons.push({
        code: 'TELEMETRY_OUTDATED',
        severity: 'CRITICAL',
        component: 'NETWORK',
        message: 'No telemetry received for more than 10 minutes',
        impactLevel: 'HIGH',
        impactDescription: 'Cannot verify operational state',
      });
      score -= 50;
    }

    // Check cameras
    if (components.cameras.state === 'CRITICAL') {
      if (components.cameras.offline === components.cameras.total) {
        reasons.push({
          code: 'ALL_CAMERAS_OFFLINE',
          severity: 'CRITICAL',
          component: 'CAMERA',
          message: `All ${components.cameras.total} cameras offline`,
          impactLevel: 'HIGH',
          impactDescription: 'Complete surveillance loss',
        });
        score -= 30;
      } else if (components.cameras.offline > 0) {
        reasons.push({
          code: 'CAMERAS_OFFLINE',
          severity: 'CRITICAL',
          component: 'CAMERA',
          message: `${components.cameras.offline} of ${components.cameras.total} cameras offline`,
          impactLevel: 'MEDIUM',
        });
        score -= 20;
      }

      if (components.cameras.notRecording > components.cameras.total * 0.5) {
        reasons.push({
          code: 'RECORDING_FAILURE',
          severity: 'CRITICAL',
          component: 'CAMERA',
          message: `${components.cameras.notRecording} cameras not recording`,
          impactLevel: 'HIGH',
          impactDescription: 'Evidence collection compromised',
        });
        score -= 20;
      }
    } else if (components.cameras.state === 'WARNING') {
      score -= 10;
    }

    // Check storage
    if (components.storage.state === 'CRITICAL') {
      if (components.storage.disks.failed > 0) {
        reasons.push({
          code: 'DISK_FAILURE',
          severity: 'CRITICAL',
          component: 'STORAGE',
          message: `${components.storage.disks.failed} disk(s) failed or failing`,
          impactLevel: 'HIGH',
          impactDescription: 'Recording and retention at risk',
        });
        score -= 25;
      }

      if (components.storage.capacity && components.storage.capacity.usagePercent > 95) {
        reasons.push({
          code: 'STORAGE_FULL',
          severity: 'CRITICAL',
          component: 'STORAGE',
          message: `Storage ${components.storage.capacity.usagePercent.toFixed(1)}% full`,
          impactLevel: 'HIGH',
          impactDescription: 'Recording may stop soon',
        });
        score -= 20;
      }
    } else if (components.storage.state === 'WARNING') {
      score -= 10;
    }

    // Check retention
    if (components.retention.state === 'VIOLATION') {
      reasons.push({
        code: 'RETENTION_VIOLATION',
        severity: 'CRITICAL',
        component: 'RETENTION',
        message: `Retention ${components.retention.minimumVerifiedDays || 0} days / required ${components.retention.requiredDays}`,
        affectedCameras: components.retention.affectedCameras?.map((c) => c.cameraId),
        impactLevel: 'HIGH',
        impactDescription: 'Compliance violation',
      });
      score -= 15;
    } else if (components.retention.state === 'WARNING') {
      score -= 5;
    }

    // Check network
    if (components.network.state === 'OFFLINE') {
      reasons.push({
        code: 'NETWORK_OFFLINE',
        severity: 'CRITICAL',
        component: 'NETWORK',
        message: 'Internet connectivity lost',
        impactLevel: 'HIGH',
        impactDescription: 'Cannot access branch remotely',
      });
      score -= 20;
    } else if (components.network.state === 'FAILOVER') {
      reasons.push({
        code: 'NETWORK_FAILOVER',
        severity: 'WARNING',
        component: 'NETWORK',
        message: 'Running on backup internet connection',
        impactLevel: 'LOW',
      });
      score -= 5;
    }

    // Check recorders
    if (components.recorders.state === 'CRITICAL') {
      reasons.push({
        code: 'RECORDER_OFFLINE',
        severity: 'CRITICAL',
        component: 'RECORDER',
        message: `${components.recorders.offline} of ${components.recorders.total} recorders offline`,
        impactLevel: 'HIGH',
      });
      score -= 20;
    }

    // Check alerts
    if (components.alerts.p1Count > 0) {
      reasons.push({
        code: 'CRITICAL_ALERTS',
        severity: 'CRITICAL',
        component: 'ALERT',
        message: `${components.alerts.p1Count} critical alert(s) active`,
        impactLevel: 'MEDIUM',
      });
      score -= Math.min(components.alerts.p1Count * 5, 15);
    }

    // Determine overall state
    let state: HealthState = 'HEALTHY';
    if (score < 50) {
      state = 'CRITICAL';
    } else if (score < 80) {
      state = 'WARNING';
    }

    // Sort reasons by severity
    reasons.sort((a, b) => {
      const severityOrder = { CRITICAL: 0, WARNING: 1, INFO: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    return { state, score: Math.max(0, score), reasons };
  }

  /**
   * Clear cache for a specific branch
   */
  clearCache(tenantId: string, branchId: string): void {
    const cacheKey = `${tenantId}:${branchId}`;
    this.cache.delete(cacheKey);
  }

  /**
   * Clear all cache
   */
  clearAllCache(): void {
    this.cache.clear();
  }
}
