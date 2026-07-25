/**
 * Operational Health Service
 * Core service for monitoring system health across all components
 */

import { Pool } from 'pg';

export interface HealthStatus {
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  score: number;
  lastUpdated: Date;
}

export interface UserScope {
  branchIds?: string[];
  regionIds?: string[];
}

export class OperationalHealthService {
  constructor(private pool: Pool) {}

  /**
   * Get top-level health summary
   */
  async getHealthSummary(tenantId: string, userScope?: UserScope) {
    const branchFilter = this.buildBranchFilter(userScope);
    
    const query = `
      WITH branch_stats AS (
        SELECT 
          COUNT(*) as total_branches,
          COUNT(*) FILTER (WHERE health_status = 'healthy') as healthy_branches,
          COUNT(*) FILTER (WHERE health_status = 'warning') as warning_branches,
          COUNT(*) FILTER (WHERE health_status = 'critical') as critical_branches
        FROM branches
        WHERE tenant_id = $1 ${branchFilter.clause}
      ),
      camera_stats AS (
        SELECT 
          COUNT(*) as total_cameras,
          COUNT(*) FILTER (WHERE online_status = 'online') as cameras_online,
          COUNT(*) FILTER (WHERE online_status = 'offline') as cameras_offline,
          COUNT(*) FILTER (WHERE recording_status = 'recording') as cameras_recording,
          COUNT(*) FILTER (WHERE recording_status != 'recording') as recording_failures
        FROM cameras c
        JOIN branches b ON b.id = c.branch_id
        WHERE b.tenant_id = $1 ${branchFilter.clause.replace('branches.', 'b.')}
      ),
      alert_stats AS (
        SELECT 
          COUNT(*) FILTER (WHERE severity = 'critical' AND status = 'active') as critical_alerts
        FROM operational_alerts
        WHERE tenant_id = $1 ${branchFilter.alertClause}
      ),
      edge_agent_stats AS (
        SELECT 
          COUNT(*) FILTER (WHERE status = 'offline') as agents_offline
        FROM edge_agents ea
        JOIN branches b ON b.id = ea.branch_id
        WHERE b.tenant_id = $1 ${branchFilter.clause.replace('branches.', 'b.')}
      )
      SELECT 
        bs.*,
        cs.*,
        al.critical_alerts,
        ea.agents_offline
      FROM branch_stats bs
      CROSS JOIN camera_stats cs
      CROSS JOIN alert_stats al
      CROSS JOIN edge_agent_stats ea
    `;

    const result = await this.pool.query(query, [tenantId, ...branchFilter.params]);
    const row = result.rows[0];

    return {
      totalBranches: parseInt(row.total_branches) || 0,
      healthyBranches: parseInt(row.healthy_branches) || 0,
      warningBranches: parseInt(row.warning_branches) || 0,
      criticalBranches: parseInt(row.critical_branches) || 0,
      totalCameras: parseInt(row.total_cameras) || 0,
      camerasOnline: parseInt(row.cameras_online) || 0,
      camerasOffline: parseInt(row.cameras_offline) || 0,
      camerasRecording: parseInt(row.cameras_recording) || 0,
      recordingFailures: parseInt(row.recording_failures) || 0,
      activeCriticalAlerts: parseInt(row.critical_alerts) || 0,
      edgeAgentsOffline: parseInt(row.agents_offline) || 0,
      timestamp: new Date()
    };
  }

  /**
   * Get health status for all branches
   */
  async getBranchesHealth(
    tenantId: string,
    filters: { status?: string; region?: string; limit: number; offset: number },
    userScope?: UserScope
  ) {
    const branchFilter = this.buildBranchFilter(userScope);
    const conditions = ['b.tenant_id = $1'];
    const params: any[] = [tenantId, ...branchFilter.params];
    let paramIndex = params.length + 1;

    if (filters.status) {
      conditions.push(`b.health_status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters.region) {
      conditions.push(`b.region = $${paramIndex++}`);
      params.push(filters.region);
    }

    if (branchFilter.clause) {
      conditions.push(branchFilter.clause.replace('branches.', 'b.'));
    }

    const query = `
      SELECT 
        b.id,
        b.name,
        b.code,
        b.region,
        b.health_status,
        b.health_score,
        b.last_health_check,
        COUNT(c.id) as total_cameras,
        COUNT(c.id) FILTER (WHERE c.online_status = 'online') as online_cameras,
        COUNT(c.id) FILTER (WHERE c.recording_status = 'recording') as recording_cameras,
        COUNT(DISTINCT oa.id) FILTER (WHERE oa.severity = 'critical' AND oa.status = 'active') as critical_alerts,
        ea.status as edge_agent_status,
        ea.last_heartbeat as edge_agent_heartbeat
      FROM branches b
      LEFT JOIN cameras c ON c.branch_id = b.id
      LEFT JOIN operational_alerts oa ON oa.branch_id = b.id
      LEFT JOIN edge_agents ea ON ea.branch_id = b.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY b.id, b.name, b.code, b.region, b.health_status, b.health_score, 
               b.last_health_check, ea.status, ea.last_heartbeat
      ORDER BY 
        CASE b.health_status
          WHEN 'critical' THEN 1
          WHEN 'warning' THEN 2
          WHEN 'healthy' THEN 3
          ELSE 4
        END,
        b.name
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(filters.limit, filters.offset);
    const result = await this.pool.query(query, params);

    return {
      branches: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        code: row.code,
        region: row.region,
        healthStatus: row.health_status,
        healthScore: parseFloat(row.health_score) || 0,
        lastHealthCheck: row.last_health_check,
        totalCameras: parseInt(row.total_cameras) || 0,
        onlineCameras: parseInt(row.online_cameras) || 0,
        recordingCameras: parseInt(row.recording_cameras) || 0,
        criticalAlerts: parseInt(row.critical_alerts) || 0,
        edgeAgentStatus: row.edge_agent_status,
        edgeAgentHeartbeat: row.edge_agent_heartbeat
      })),
      total: result.rowCount || 0
    };
  }

  /**
   * Get detailed health metrics for a specific branch
   */
  async getBranchHealthDetail(tenantId: string, branchId: string, userScope?: UserScope) {
    const branchFilter = this.buildBranchFilter(userScope);
    
    // Get branch basic info
    const branchQuery = `
      SELECT 
        b.*,
        ea.id as edge_agent_id,
        ea.status as edge_agent_status,
        ea.version as edge_agent_version,
        ea.cpu_usage,
        ea.memory_usage,
        ea.disk_usage,
        ea.last_heartbeat,
        ea.uptime_seconds
      FROM branches b
      LEFT JOIN edge_agents ea ON ea.branch_id = b.id
      WHERE b.id = $1 AND b.tenant_id = $2 ${branchFilter.clause}
    `;

    const branchResult = await this.pool.query(branchQuery, [branchId, tenantId, ...branchFilter.params]);
    
    if (branchResult.rows.length === 0) {
      return null;
    }

    const branch = branchResult.rows[0];

    // Get component health scores
    const componentQuery = `
      SELECT 
        component_type,
        health_score,
        status,
        last_updated
      FROM component_health_scores
      WHERE branch_id = $1
      ORDER BY last_updated DESC
    `;

    const componentResult = await this.pool.query(componentQuery, [branchId]);
    
    const components: Record<string, any> = {};
    componentResult.rows.forEach(row => {
      components[row.component_type] = {
        score: parseFloat(row.health_score) || 0,
        status: row.status,
        lastUpdated: row.last_updated
      };
    });

    return {
      id: branch.id,
      name: branch.name,
      code: branch.code,
      region: branch.region,
      healthStatus: branch.health_status,
      healthScore: parseFloat(branch.health_score) || 0,
      lastHealthCheck: branch.last_health_check,
      components: {
        camera: components.camera || { score: 0, status: 'unknown' },
        recording: components.recording || { score: 0, status: 'unknown' },
        storage: components.storage || { score: 0, status: 'unknown' },
        network: components.network || { score: 0, status: 'unknown' },
        ups: components.ups || { score: 0, status: 'unknown' },
        edgeAgent: components.edge_agent || { score: 0, status: 'unknown' }
      },
      edgeAgent: {
        id: branch.edge_agent_id,
        status: branch.edge_agent_status,
        version: branch.edge_agent_version,
        cpuUsage: parseFloat(branch.cpu_usage) || 0,
        memoryUsage: parseFloat(branch.memory_usage) || 0,
        diskUsage: parseFloat(branch.disk_usage) || 0,
        lastHeartbeat: branch.last_heartbeat,
        uptimeSeconds: parseInt(branch.uptime_seconds) || 0
      }
    };
  }

  /**
   * Get camera health metrics
   */
  async getCamerasHealth(
    tenantId: string,
    filters: { status?: string; branchId?: string; recordingStatus?: string; limit: number; offset: number },
    userScope?: UserScope
  ) {
    const branchFilter = this.buildBranchFilter(userScope);
    const conditions = ['b.tenant_id = $1'];
    const params: any[] = [tenantId, ...branchFilter.params];
    let paramIndex = params.length + 1;

    if (filters.status) {
      conditions.push(`c.online_status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters.branchId) {
      conditions.push(`c.branch_id = $${paramIndex++}`);
      params.push(filters.branchId);
    }

    if (filters.recordingStatus) {
      conditions.push(`c.recording_status = $${paramIndex++}`);
      params.push(filters.recordingStatus);
    }

    if (branchFilter.clause) {
      conditions.push(branchFilter.clause.replace('branches.', 'b.'));
    }

    const query = `
      SELECT 
        c.id,
        c.name,
        c.rtsp_url,
        c.online_status,
        c.recording_status,
        c.last_heartbeat,
        c.current_fps,
        c.expected_fps,
        c.current_bitrate,
        c.latency_ms,
        c.packet_loss_percent,
        c.health_score,
        b.id as branch_id,
        b.name as branch_name,
        ch.onvif_available,
        ch.stream_available,
        ch.video_loss,
        ch.tampering_detected,
        ch.image_frozen
      FROM cameras c
      JOIN branches b ON b.id = c.branch_id
      LEFT JOIN camera_health ch ON ch.camera_id = c.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY c.health_score ASC, c.name
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(filters.limit, filters.offset);
    const result = await this.pool.query(query, params);

    return {
      cameras: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        rtspUrl: row.rtsp_url,
        onlineStatus: row.online_status,
        recordingStatus: row.recording_status,
        lastHeartbeat: row.last_heartbeat,
        currentFps: parseFloat(row.current_fps) || 0,
        expectedFps: parseFloat(row.expected_fps) || 0,
        currentBitrate: parseFloat(row.current_bitrate) || 0,
        latencyMs: parseFloat(row.latency_ms) || 0,
        packetLoss: parseFloat(row.packet_loss_percent) || 0,
        healthScore: parseFloat(row.health_score) || 0,
        branchId: row.branch_id,
        branchName: row.branch_name,
        onvifAvailable: row.onvif_available,
        streamAvailable: row.stream_available,
        videoLoss: row.video_loss,
        tamperingDetected: row.tampering_detected,
        imageFrozen: row.image_frozen
      })),
      total: result.rowCount || 0
    };
  }

  /**
   * Get recording health metrics
   */
  async getRecordingHealth(tenantId: string, branchId?: string, userScope?: UserScope) {
    const branchFilter = this.buildBranchFilter(userScope);
    const conditions = ['b.tenant_id = $1'];
    const params: any[] = [tenantId, ...branchFilter.params];
    let paramIndex = params.length + 1;

    if (branchId) {
      conditions.push(`b.id = $${paramIndex++}`);
      params.push(branchId);
    }

    if (branchFilter.clause) {
      conditions.push(branchFilter.clause.replace('branches.', 'b.'));
    }

    const query = `
      SELECT 
        COUNT(*) as total_recordings,
        COUNT(*) FILTER (WHERE rs.status = 'recording') as active_recordings,
        COUNT(*) FILTER (WHERE rs.status = 'gap') as recording_gaps,
        COUNT(*) FILTER (WHERE rs.status = 'failed') as failed_recordings,
        AVG(rs.segment_interval_seconds) as avg_segment_interval,
        SUM(CASE 
          WHEN rs.last_segment_time < NOW() - INTERVAL '5 minutes' 
          THEN EXTRACT(EPOCH FROM (NOW() - rs.last_segment_time))
          ELSE 0 
        END) as total_gap_seconds
      FROM recording_status rs
      JOIN cameras c ON c.id = rs.camera_id
      JOIN branches b ON b.id = c.branch_id
      WHERE ${conditions.join(' AND ')}
    `;

    const result = await this.pool.query(query, params);
    const row = result.rows[0];

    return {
      totalRecordings: parseInt(row.total_recordings) || 0,
      activeRecordings: parseInt(row.active_recordings) || 0,
      recordingGaps: parseInt(row.recording_gaps) || 0,
      failedRecordings: parseInt(row.failed_recordings) || 0,
      avgSegmentInterval: parseFloat(row.avg_segment_interval) || 0,
      totalGapSeconds: parseFloat(row.total_gap_seconds) || 0
    };
  }

  /**
   * Get storage health metrics
   */
  async getStorageHealth(tenantId: string, branchId?: string, userScope?: UserScope) {
    const branchFilter = this.buildBranchFilter(userScope);
    const conditions = ['b.tenant_id = $1'];
    const params: any[] = [tenantId, ...branchFilter.params];
    let paramIndex = params.length + 1;

    if (branchId) {
      conditions.push(`b.id = $${paramIndex++}`);
      params.push(branchId);
    }

    if (branchFilter.clause) {
      conditions.push(branchFilter.clause.replace('branches.', 'b.'));
    }

    const query = `
      SELECT 
        SUM(ss.total_capacity_bytes) as total_capacity,
        SUM(ss.used_capacity_bytes) as used_capacity,
        SUM(ss.available_capacity_bytes) as available_capacity,
        AVG(ss.usage_percent) as avg_usage_percent,
        AVG(ss.retention_days_available) as avg_retention_days,
        AVG(ss.write_latency_ms) as avg_write_latency,
        COUNT(*) FILTER (WHERE ss.raid_status = 'degraded') as degraded_arrays,
        COUNT(*) FILTER (WHERE ss.mount_status = 'unmounted') as unmounted_volumes
      FROM storage_status ss
      JOIN branches b ON b.id = ss.branch_id
      WHERE ${conditions.join(' AND ')}
    `;

    const result = await this.pool.query(query, params);
    const row = result.rows[0];

    return {
      totalCapacity: row.total_capacity ? row.total_capacity.toString() : '0',
      usedCapacity: row.used_capacity ? row.used_capacity.toString() : '0',
      availableCapacity: row.available_capacity ? row.available_capacity.toString() : '0',
      avgUsagePercent: parseFloat(row.avg_usage_percent) || 0,
      avgRetentionDays: parseFloat(row.avg_retention_days) || 0,
      avgWriteLatency: parseFloat(row.avg_write_latency) || 0,
      degradedArrays: parseInt(row.degraded_arrays) || 0,
      unmountedVolumes: parseInt(row.unmounted_volumes) || 0
    };
  }

  /**
   * Get disk health with SMART metrics
   */
  async getDisksHealth(
    tenantId: string,
    filters: { branchId?: string; status?: string },
    userScope?: UserScope
  ) {
    const branchFilter = this.buildBranchFilter(userScope);
    const conditions = ['b.tenant_id = $1'];
    const params: any[] = [tenantId, ...branchFilter.params];
    let paramIndex = params.length + 1;

    if (filters.branchId) {
      conditions.push(`dh.branch_id = $${paramIndex++}`);
      params.push(filters.branchId);
    }

    if (filters.status) {
      conditions.push(`dh.smart_status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (branchFilter.clause) {
      conditions.push(branchFilter.clause.replace('branches.', 'b.'));
    }

    const query = `
      SELECT 
        dh.*,
        b.name as branch_name,
        b.code as branch_code
      FROM disk_health dh
      JOIN branches b ON b.id = dh.branch_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY 
        CASE dh.smart_status
          WHEN 'failed' THEN 1
          WHEN 'failure_predicted' THEN 2
          WHEN 'warning' THEN 3
          WHEN 'healthy' THEN 4
          ELSE 5
        END,
        dh.temperature_celsius DESC
      LIMIT 100
    `;

    const result = await this.pool.query(query, params);

    return result.rows.map(row => ({
      id: row.id,
      branchId: row.branch_id,
      branchName: row.branch_name,
      branchCode: row.branch_code,
      devicePath: row.device_path,
      serialNumber: row.serial_number,
      model: row.model,
      smartStatus: row.smart_status,
      temperature: parseFloat(row.temperature_celsius) || 0,
      powerOnHours: parseInt(row.power_on_hours) || 0,
      reallocatedSectors: parseInt(row.reallocated_sectors) || 0,
      pendingSectors: parseInt(row.pending_sectors) || 0,
      uncorrectableSectors: parseInt(row.uncorrectable_sectors) || 0,
      failureProbability: parseFloat(row.failure_probability_percent) || 0,
      lastCheck: row.last_check
    }));
  }

  /**
   * Get network health metrics
   */
  async getNetworkHealth(tenantId: string, branchId?: string, userScope?: UserScope) {
    const branchFilter = this.buildBranchFilter(userScope);
    const conditions = ['b.tenant_id = $1'];
    const params: any[] = [tenantId, ...branchFilter.params];
    let paramIndex = params.length + 1;

    if (branchId) {
      conditions.push(`b.id = $${paramIndex++}`);
      params.push(branchId);
    }

    if (branchFilter.clause) {
      conditions.push(branchFilter.clause.replace('branches.', 'b.'));
    }

    const query = `
      SELECT 
        AVG(nh.latency_ms) as avg_latency,
        AVG(nh.jitter_ms) as avg_jitter,
        AVG(nh.packet_loss_percent) as avg_packet_loss,
        AVG(nh.bandwidth_usage_percent) as avg_bandwidth_usage,
        COUNT(*) FILTER (WHERE nh.wan_status = 'disconnected') as wan_disconnected,
        COUNT(*) FILTER (WHERE nh.vpn_status = 'disconnected') as vpn_disconnected,
        MAX(nh.last_wan_disconnect) as last_wan_disconnect
      FROM network_health nh
      JOIN branches b ON b.id = nh.branch_id
      WHERE ${conditions.join(' AND ')}
    `;

    const result = await this.pool.query(query, params);
    const row = result.rows[0];

    return {
      avgLatency: parseFloat(row.avg_latency) || 0,
      avgJitter: parseFloat(row.avg_jitter) || 0,
      avgPacketLoss: parseFloat(row.avg_packet_loss) || 0,
      avgBandwidthUsage: parseFloat(row.avg_bandwidth_usage) || 0,
      wanDisconnected: parseInt(row.wan_disconnected) || 0,
      vpnDisconnected: parseInt(row.vpn_disconnected) || 0,
      lastWanDisconnect: row.last_wan_disconnect
    };
  }

  /**
   * Get UPS health metrics
   */
  async getUPSHealth(
    tenantId: string,
    filters: { branchId?: string; status?: string },
    userScope?: UserScope
  ) {
    const branchFilter = this.buildBranchFilter(userScope);
    const conditions = ['b.tenant_id = $1'];
    const params: any[] = [tenantId, ...branchFilter.params];
    let paramIndex = params.length + 1;

    if (filters.branchId) {
      conditions.push(`uh.branch_id = $${paramIndex++}`);
      params.push(filters.branchId);
    }

    if (filters.status) {
      conditions.push(`uh.ups_status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (branchFilter.clause) {
      conditions.push(branchFilter.clause.replace('branches.', 'b.'));
    }

    const query = `
      SELECT 
        uh.*,
        b.name as branch_name,
        b.code as branch_code
      FROM ups_health uh
      JOIN branches b ON b.id = uh.branch_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY 
        CASE 
          WHEN uh.utility_power_available = false THEN 1
          WHEN uh.battery_percent < 30 THEN 2
          WHEN uh.ups_status = 'offline' THEN 3
          ELSE 4
        END,
        uh.battery_percent ASC
      LIMIT 100
    `;

    const result = await this.pool.query(query, params);

    return result.rows.map(row => ({
      id: row.id,
      branchId: row.branch_id,
      branchName: row.branch_name,
      branchCode: row.branch_code,
      upsStatus: row.ups_status,
      utilityPowerAvailable: row.utility_power_available,
      runningOnBattery: row.running_on_battery,
      batteryPercent: parseFloat(row.battery_percent) || 0,
      estimatedRuntimeMinutes: parseInt(row.estimated_runtime_minutes) || 0,
      loadPercent: parseFloat(row.load_percent) || 0,
      inputVoltage: parseFloat(row.input_voltage) || 0,
      outputVoltage: parseFloat(row.output_voltage) || 0,
      batteryAgeMonths: parseInt(row.battery_age_months) || 0,
      lastSelfTest: row.last_self_test,
      lastCheck: row.last_check
    }));
  }

  /**
   * Get edge agent health metrics
   */
  async getEdgeAgentsHealth(
    tenantId: string,
    filters: { branchId?: string; status?: string },
    userScope?: UserScope
  ) {
    const branchFilter = this.buildBranchFilter(userScope);
    const conditions = ['b.tenant_id = $1'];
    const params: any[] = [tenantId, ...branchFilter.params];
    let paramIndex = params.length + 1;

    if (filters.branchId) {
      conditions.push(`ea.branch_id = $${paramIndex++}`);
      params.push(filters.branchId);
    }

    if (filters.status) {
      conditions.push(`ea.status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (branchFilter.clause) {
      conditions.push(branchFilter.clause.replace('branches.', 'b.'));
    }

    const query = `
      SELECT 
        ea.*,
        b.name as branch_name,
        b.code as branch_code,
        COUNT(c.id) as connected_cameras,
        COUNT(c.id) FILTER (WHERE c.recording_status = 'recording') as recording_cameras,
        COUNT(DISTINCT rj.id) FILTER (WHERE rj.status = 'failed') as failed_recording_jobs
      FROM edge_agents ea
      JOIN branches b ON b.id = ea.branch_id
      LEFT JOIN cameras c ON c.branch_id = ea.branch_id
      LEFT JOIN recording_jobs rj ON rj.camera_id = c.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY ea.id, b.name, b.code
      ORDER BY 
        CASE ea.status
          WHEN 'offline' THEN 1
          WHEN 'warning' THEN 2
          WHEN 'online' THEN 3
          ELSE 4
        END,
        ea.cpu_usage DESC
      LIMIT 100
    `;

    const result = await this.pool.query(query, params);

    return result.rows.map(row => ({
      id: row.id,
      branchId: row.branch_id,
      branchName: row.branch_name,
      branchCode: row.branch_code,
      status: row.status,
      version: row.version,
      lastHeartbeat: row.last_heartbeat,
      cpuUsage: parseFloat(row.cpu_usage) || 0,
      memoryUsage: parseFloat(row.memory_usage) || 0,
      diskUsage: parseFloat(row.disk_usage) || 0,
      uptimeSeconds: parseInt(row.uptime_seconds) || 0,
      connectedCameras: parseInt(row.connected_cameras) || 0,
      recordingCameras: parseInt(row.recording_cameras) || 0,
      failedRecordingJobs: parseInt(row.failed_recording_jobs) || 0,
      pendingUploads: parseInt(row.pending_uploads) || 0,
      lastConfigSync: row.last_config_sync
    }));
  }

  /**
   * Get historical health trends
   */
  async getHealthTrends(
    tenantId: string,
    filters: {
      branchId?: string;
      component?: string;
      startDate?: string;
      endDate?: string;
      interval: 'hour' | 'day' | 'week';
    },
    userScope?: UserScope
  ) {
    const branchFilter = this.buildBranchFilter(userScope);
    const conditions = ['tenant_id = $1'];
    const params: any[] = [tenantId, ...branchFilter.params];
    let paramIndex = params.length + 1;

    if (filters.branchId) {
      conditions.push(`branch_id = $${paramIndex++}`);
      params.push(filters.branchId);
    }

    if (filters.component) {
      conditions.push(`component_type = $${paramIndex++}`);
      params.push(filters.component);
    }

    if (filters.startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(filters.endDate);
    }

    const intervalMap = {
      hour: '1 hour',
      day: '1 day',
      week: '1 week'
    };

    const query = `
      SELECT 
        date_trunc($${paramIndex}, timestamp) as time_bucket,
        component_type,
        AVG(health_score) as avg_score,
        MIN(health_score) as min_score,
        MAX(health_score) as max_score,
        COUNT(*) FILTER (WHERE status = 'critical') as critical_count
      FROM health_metrics_history
      WHERE ${conditions.join(' AND ')}
      GROUP BY time_bucket, component_type
      ORDER BY time_bucket DESC
      LIMIT 500
    `;

    params.push(intervalMap[filters.interval]);
    const result = await this.pool.query(query, params);

    return result.rows.map(row => ({
      timestamp: row.time_bucket,
      component: row.component_type,
      avgScore: parseFloat(row.avg_score) || 0,
      minScore: parseFloat(row.min_score) || 0,
      maxScore: parseFloat(row.max_score) || 0,
      criticalCount: parseInt(row.critical_count) || 0
    }));
  }

  /**
   * Get operational alerts
   */
  async getOperationalAlerts(
    tenantId: string,
    filters: {
      severity?: string;
      status?: string;
      branchId?: string;
      component?: string;
      limit: number;
      offset: number;
    },
    userScope?: UserScope
  ) {
    const branchFilter = this.buildBranchFilter(userScope);
    const conditions = ['oa.tenant_id = $1'];
    const params: any[] = [tenantId, ...branchFilter.params];
    let paramIndex = params.length + 1;

    if (filters.severity) {
      conditions.push(`oa.severity = $${paramIndex++}`);
      params.push(filters.severity);
    }

    if (filters.status) {
      conditions.push(`oa.status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters.branchId) {
      conditions.push(`oa.branch_id = $${paramIndex++}`);
      params.push(filters.branchId);
    }

    if (filters.component) {
      conditions.push(`oa.component_type = $${paramIndex++}`);
      params.push(filters.component);
    }

    if (branchFilter.alertClause) {
      conditions.push(branchFilter.alertClause);
    }

    const query = `
      SELECT 
        oa.*,
        b.name as branch_name,
        b.code as branch_code,
        u1.name as acknowledged_by_name,
        u2.name as assigned_to_name,
        u3.name as resolved_by_name
      FROM operational_alerts oa
      LEFT JOIN branches b ON b.id = oa.branch_id
      LEFT JOIN users u1 ON u1.id = oa.acknowledged_by
      LEFT JOIN users u2 ON u2.id = oa.assigned_to
      LEFT JOIN users u3 ON u3.id = oa.resolved_by
      WHERE ${conditions.join(' AND ')}
      ORDER BY 
        CASE oa.severity
          WHEN 'critical' THEN 1
          WHEN 'warning' THEN 2
          WHEN 'info' THEN 3
          ELSE 4
        END,
        oa.detected_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(filters.limit, filters.offset);
    const result = await this.pool.query(query, params);

    return {
      alerts: result.rows.map(row => ({
        id: row.id,
        severity: row.severity,
        status: row.status,
        componentType: row.component_type,
        deviceId: row.device_id,
        title: row.title,
        description: row.description,
        impact: row.impact,
        recommendedAction: row.recommended_action,
        branchId: row.branch_id,
        branchName: row.branch_name,
        branchCode: row.branch_code,
        detectedAt: row.detected_at,
        acknowledgedAt: row.acknowledged_at,
        acknowledgedBy: row.acknowledged_by,
        acknowledgedByName: row.acknowledged_by_name,
        assignedAt: row.assigned_at,
        assignedTo: row.assigned_to,
        assignedToName: row.assigned_to_name,
        resolvedAt: row.resolved_at,
        resolvedBy: row.resolved_by,
        resolvedByName: row.resolved_by_name,
        resolution: row.resolution,
        slaDeadline: row.sla_deadline,
        workOrderId: row.work_order_id
      })),
      total: result.rowCount || 0
    };
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, userId: string) {
    const query = `
      UPDATE operational_alerts
      SET 
        status = 'acknowledged',
        acknowledged_at = NOW(),
        acknowledged_by = $2
      WHERE id = $1 AND status = 'active'
      RETURNING id
    `;

    await this.pool.query(query, [alertId, userId]);
  }

  /**
   * Assign an alert to a technician
   */
  async assignAlert(alertId: string, assigneeId: string, assignedBy: string) {
    const query = `
      UPDATE operational_alerts
      SET 
        status = 'assigned',
        assigned_at = NOW(),
        assigned_to = $2,
        assigned_by = $3
      WHERE id = $1
      RETURNING id
    `;

    await this.pool.query(query, [alertId, assigneeId, assignedBy]);
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, userId: string, resolution: string, notes?: string) {
    const query = `
      UPDATE operational_alerts
      SET 
        status = 'resolved',
        resolved_at = NOW(),
        resolved_by = $2,
        resolution = $3,
        resolution_notes = $4
      WHERE id = $1
      RETURNING id
    `;

    await this.pool.query(query, [alertId, userId, resolution, notes]);
  }

  /**
   * Create work order from alert
   */
  async createWorkOrderFromAlert(
    alertId: string,
    createdBy: string,
    options: { priority?: string; assigneeId?: string; notes?: string }
  ): Promise<string> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get alert details
      const alertQuery = `
        SELECT oa.*, b.name as branch_name
        FROM operational_alerts oa
        LEFT JOIN branches b ON b.id = oa.branch_id
        WHERE oa.id = $1
      `;
      const alertResult = await client.query(alertQuery, [alertId]);
      
      if (alertResult.rows.length === 0) {
        throw new Error('Alert not found');
      }

      const alert = alertResult.rows[0];

      // Create work order
      const workOrderQuery = `
        INSERT INTO work_orders (
          tenant_id, branch_id, title, description, priority,
          assigned_to, created_by, source_type, source_id, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'alert', $8, 'pending')
        RETURNING id
      `;

      const workOrderResult = await client.query(workOrderQuery, [
        alert.tenant_id,
        alert.branch_id,
        `Alert: ${alert.title}`,
        alert.description + (options.notes ? `\n\nNotes: ${options.notes}` : ''),
        options.priority || 'medium',
        options.assigneeId,
        createdBy,
        alertId
      ]);

      const workOrderId = workOrderResult.rows[0].id;

      // Link work order to alert
      await client.query(
        `UPDATE operational_alerts SET work_order_id = $1 WHERE id = $2`,
        [workOrderId, alertId]
      );

      await client.query('COMMIT');

      return workOrderId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Build branch filter from user scope
   */
  private buildBranchFilter(userScope?: UserScope): { 
    clause: string; 
    params: any[];
    alertClause: string;
  } {
    if (!userScope || (!userScope.branchIds && !userScope.regionIds)) {
      return { clause: '', params: [], alertClause: '' };
    }

    const params: any[] = [];
    const conditions: string[] = [];
    let paramIndex = 2; // Start from 2 since tenantId is always $1

    if (userScope.branchIds && userScope.branchIds.length > 0) {
      conditions.push(`branches.id = ANY($${paramIndex})`);
      params.push(userScope.branchIds);
      paramIndex++;
    }

    if (userScope.regionIds && userScope.regionIds.length > 0) {
      conditions.push(`branches.region = ANY($${paramIndex})`);
      params.push(userScope.regionIds);
      paramIndex++;
    }

    const clause = conditions.length > 0 ? ` AND (${conditions.join(' OR ')})` : '';
    const alertClause = clause.replace(/branches\./g, 'oa.branch_id IN (SELECT id FROM branches WHERE ');

    return { clause, params, alertClause };
  }
}
