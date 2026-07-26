/**
 * Branch Health Scoring Service
 * Comprehensive health scoring system for multi-branch operations
 * Aggregates metrics from cameras, network, storage, recording, power, and edge agents
 */

import { Pool } from 'pg';

export interface ComponentHealth {
  score: number; // 0-100
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  weight: number; // Percentage weight in overall score
  metrics: Record<string, any>;
  issues: string[];
}

export interface BranchHealthScore {
  branchId: string;
  branchName: string;
  branchCode: string;
  overallScore: number;
  overallStatus: 'healthy' | 'warning' | 'critical' | 'unknown';
  components: {
    camera: ComponentHealth;
    recording: ComponentHealth;
    storage: ComponentHealth;
    network: ComponentHealth;
    power: ComponentHealth;
    edgeAgent: ComponentHealth;
  };
  calculatedAt: Date;
  trendsLast24h: {
    avgScore: number;
    minScore: number;
    trend: 'improving' | 'stable' | 'degrading';
  };
}

export class BranchHealthScoringService {
  // Configurable component weights (must sum to 100)
  private readonly DEFAULT_WEIGHTS = {
    camera: 25,
    recording: 25,
    storage: 15,
    network: 15,
    power: 10,
    edgeAgent: 10
  };

  constructor(private pool: Pool) {}

  /**
   * Calculate comprehensive health score for a branch
   */
  async calculateBranchHealth(
    tenantId: string,
    branchId: string,
    customWeights?: Partial<typeof this.DEFAULT_WEIGHTS>
  ): Promise<BranchHealthScore> {
    const weights = { ...this.DEFAULT_WEIGHTS, ...customWeights };

    // Calculate each component health in parallel
    const [
      cameraHealth,
      recordingHealth,
      storageHealth,
      networkHealth,
      powerHealth,
      edgeAgentHealth,
      branchInfo,
      trends
    ] = await Promise.all([
      this.calculateCameraHealth(tenantId, branchId),
      this.calculateRecordingHealth(tenantId, branchId),
      this.calculateStorageHealth(tenantId, branchId),
      this.calculateNetworkHealth(tenantId, branchId),
      this.calculatePowerHealth(tenantId, branchId),
      this.calculateEdgeAgentHealth(tenantId, branchId),
      this.getBranchInfo(tenantId, branchId),
      this.getHealthTrends(tenantId, branchId)
    ]);

    // Apply weights to component scores
    const components = {
      camera: { ...cameraHealth, weight: weights.camera },
      recording: { ...recordingHealth, weight: weights.recording },
      storage: { ...storageHealth, weight: weights.storage },
      network: { ...networkHealth, weight: weights.network },
      power: { ...powerHealth, weight: weights.power },
      edgeAgent: { ...edgeAgentHealth, weight: weights.edgeAgent }
    };

    // Calculate weighted overall score
    const overallScore = Math.round(
      (cameraHealth.score * weights.camera +
        recordingHealth.score * weights.recording +
        storageHealth.score * weights.storage +
        networkHealth.score * weights.network +
        powerHealth.score * weights.power +
        edgeAgentHealth.score * weights.edgeAgent) / 100
    );

    // Determine overall status
    const overallStatus = this.determineStatus(overallScore, components);

    const healthScore: BranchHealthScore = {
      branchId,
      branchName: branchInfo.name,
      branchCode: branchInfo.code,
      overallScore,
      overallStatus,
      components,
      calculatedAt: new Date(),
      trendsLast24h: trends
    };

    // Persist the score
    await this.persistHealthScore(tenantId, healthScore);

    return healthScore;
  }

  /**
   * Calculate camera component health
   * Enhanced with quality metrics from camera_health_history
   */
  private async calculateCameraHealth(
    tenantId: string,
    branchId: string
  ): Promise<ComponentHealth> {
    const query = `
      SELECT 
        COUNT(DISTINCT c.id) as total,
        COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'online') as online,
        COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'offline') as offline,
        COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'warning') as warning,
        COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'degraded') as degraded,
        -- Latest health metrics from camera_health_history
        AVG(latest.current_fps) as avg_fps,
        AVG(latest.packet_loss) as avg_packet_loss,
        AVG(latest.latency_ms) as avg_latency,
        AVG(latest.current_bitrate) as avg_bitrate,
        COUNT(DISTINCT c.id) FILTER (WHERE latest.video_loss = true) as video_loss_count,
        COUNT(DISTINCT c.id) FILTER (WHERE latest.image_frozen = true) as frozen_count,
        COUNT(DISTINCT c.id) FILTER (WHERE latest.black_screen = true) as black_screen_count,
        -- Expected values from camera profiles
        AVG((c.profiles->0->>'frameRate')::float) as avg_expected_fps,
        -- 24-hour uptime from camera_uptime function
        AVG(uptime.uptime_percentage) as avg_uptime_24h
      FROM cameras c
      LEFT JOIN LATERAL (
        SELECT *
        FROM camera_health_history
        WHERE camera_id = c.id
        ORDER BY timestamp DESC
        LIMIT 1
      ) latest ON true
      LEFT JOIN LATERAL (
        SELECT uptime_percentage
        FROM calculate_camera_uptime(c.id, 24)
      ) uptime ON true
      WHERE c.branch_node_id = $1::uuid
    `;

    const result = await this.pool.query(query, [branchId]);
    const row = result.rows[0];

    const total = parseInt(row.total) || 0;
    if (total === 0) {
      return { score: 0, status: 'unknown', weight: 0, metrics: {}, issues: ['No cameras'] };
    }

    const online = parseInt(row.online) || 0;
    const offline = parseInt(row.offline) || 0;
    const warning = parseInt(row.warning) || 0;
    const degraded = parseInt(row.degraded) || 0;
    const videoLossCount = parseInt(row.video_loss_count) || 0;
    const frozenCount = parseInt(row.frozen_count) || 0;
    const blackScreenCount = parseInt(row.black_screen_count) || 0;

    const avgFps = parseFloat(row.avg_fps) || 0;
    const avgExpectedFps = parseFloat(row.avg_expected_fps) || 25;
    const avgPacketLoss = parseFloat(row.avg_packet_loss) || 0;
    const avgLatency = parseFloat(row.avg_latency) || 0;
    const avgBitrate = parseFloat(row.avg_bitrate) || 0;
    const avgUptime24h = parseFloat(row.avg_uptime_24h) || 0;

    // Calculate availability score (0-40 points)
    // Use 24-hour uptime for more accurate measurement
    const availabilityScore = avgUptime24h > 0 ? (avgUptime24h / 100) * 40 : (online / total) * 40;

    // Calculate performance score based on FPS achievement (0-30 points)
    const fpsAchievement = avgExpectedFps > 0 ? (avgFps / avgExpectedFps) : 0;
    const performanceScore = Math.min(fpsAchievement * 30, 30);

    // Calculate quality score (0-30 points)
    // Packet loss: 0% = 15pts, 10% = 0pts
    const packetLossScore = Math.max(0, (1 - avgPacketLoss / 10) * 15);
    // Latency: 0ms = 15pts, 500ms = 0pts
    const latencyScore = Math.max(0, (1 - avgLatency / 500) * 15);
    const qualityScore = packetLossScore + latencyScore;

    // Deduct points for stream health issues
    let penaltyScore = 0;
    if (videoLossCount > 0) penaltyScore += (videoLossCount / total) * 10;
    if (frozenCount > 0) penaltyScore += (frozenCount / total) * 5;
    if (blackScreenCount > 0) penaltyScore += (blackScreenCount / total) * 5;

    const score = Math.max(0, Math.round(availabilityScore + performanceScore + qualityScore - penaltyScore));
    const status = this.scoreToStatus(score);

    const issues: string[] = [];
    if (offline > 0) issues.push(`${offline} cameras offline`);
    if (degraded > 0) issues.push(`${degraded} cameras degraded`);
    if (warning > 0) issues.push(`${warning} cameras with warnings`);
    if (videoLossCount > 0) issues.push(`${videoLossCount} cameras with video loss`);
    if (frozenCount > 0) issues.push(`${frozenCount} cameras with frozen streams`);
    if (blackScreenCount > 0) issues.push(`${blackScreenCount} cameras with black screens`);
    if (avgPacketLoss > 5) issues.push(`High packet loss: ${avgPacketLoss.toFixed(1)}%`);
    if (avgLatency > 200) issues.push(`High latency: ${avgLatency.toFixed(0)}ms`);
    if (avgFps < avgExpectedFps * 0.8) issues.push(`Low FPS: ${avgFps.toFixed(1)}/${avgExpectedFps.toFixed(0)}`);

    return {
      score,
      status,
      weight: 0,
      metrics: {
        total,
        online,
        offline,
        warning,
        degraded,
        availability: (online / total) * 100,
        uptime24h: avgUptime24h,
        avgFps,
        avgExpectedFps,
        fpsAchievement: fpsAchievement * 100,
        avgPacketLoss,
        avgLatency,
        avgBitrate,
        videoLossCount,
        frozenCount,
        blackScreenCount,
        healthIssues: videoLossCount + frozenCount + blackScreenCount,
      },
      issues
    };
  }

  /**
   * Calculate recording component health
   */
  private async calculateRecordingHealth(
    tenantId: string,
    branchId: string
  ): Promise<ComponentHealth> {
    const query = `
      SELECT 
        COUNT(*) as total_cameras,
        COUNT(*) FILTER (WHERE rs.recording_status = 'recording') as recording,
        COUNT(*) FILTER (WHERE rs.recording_status = 'stopped') as stopped,
        COUNT(*) FILTER (WHERE rs.gap_count > 0) as with_gaps,
        AVG(rs.availability_percentage) as avg_availability,
        SUM(rs.gap_duration_seconds) as total_gap_seconds,
        AVG(EXTRACT(EPOCH FROM (NOW() - rs.last_segment_time))) as avg_segment_delay
      FROM cameras c
      LEFT JOIN LATERAL (
        SELECT recording_status, gap_count, availability_percentage,
               gap_duration_seconds, last_segment_time
        FROM recording_status_daily
        WHERE camera_id = c.id
          AND summary_date = CURRENT_DATE
        ORDER BY summary_date DESC
        LIMIT 1
      ) rs ON true
      WHERE c.branch_id = $1
        AND c.status = 'active'
    `;

    const result = await this.pool.query(query, [branchId]);
    const row = result.rows[0];

    const total = parseInt(row.total_cameras) || 0;
    if (total === 0) {
      return { score: 0, status: 'unknown', weight: 0, metrics: {}, issues: ['No cameras'] };
    }

    const recording = parseInt(row.recording) || 0;
    const stopped = parseInt(row.stopped) || 0;
    const withGaps = parseInt(row.with_gaps) || 0;
    const avgAvailability = parseFloat(row.avg_availability) || 0;
    const totalGapSeconds = parseFloat(row.total_gap_seconds) || 0;
    const avgSegmentDelay = parseFloat(row.avg_segment_delay) || 0;

    // Calculate recording active score (0-50 points)
    const activeScore = (recording / total) * 50;

    // Calculate availability score (0-35 points)
    const availabilityScore = (avgAvailability / 100) * 35;

    // Calculate continuity score (0-15 points)
    const gapPenalty = Math.min(withGaps / total * 100, 100);
    const continuityScore = (1 - gapPenalty / 100) * 15;

    const score = Math.round(activeScore + availabilityScore + continuityScore);
    const status = this.scoreToStatus(score);

    const issues: string[] = [];
    if (stopped > 0) issues.push(`${stopped} cameras not recording`);
    if (withGaps > 0) issues.push(`${withGaps} cameras with recording gaps`);
    if (totalGapSeconds > 3600) {
      issues.push(`Total gaps: ${(totalGapSeconds / 3600).toFixed(1)}h`);
    }
    if (avgSegmentDelay > 300) {
      issues.push(`Recording delay: ${(avgSegmentDelay / 60).toFixed(0)}min`);
    }

    return {
      score,
      status,
      weight: 0,
      metrics: {
        total,
        recording,
        stopped,
        withGaps,
        avgAvailability,
        totalGapHours: totalGapSeconds / 3600,
        avgSegmentDelayMin: avgSegmentDelay / 60
      },
      issues
    };
  }

  /**
   * Calculate storage component health
   */
  private async calculateStorageHealth(
    tenantId: string,
    branchId: string
  ): Promise<ComponentHealth> {
    const query = `
      SELECT 
        SUM(total_capacity_bytes) as total_capacity,
        SUM(used_capacity_bytes) as used_capacity,
        SUM(available_capacity_bytes) as available_capacity,
        AVG(usage_percent) as avg_usage_percent,
        AVG(retention_days_available) as avg_retention_days,
        AVG(write_latency_ms) as avg_write_latency,
        COUNT(*) FILTER (WHERE raid_status = 'degraded') as degraded_arrays,
        COUNT(*) FILTER (WHERE mount_status = 'unmounted') as unmounted_volumes,
        COUNT(DISTINCT dh.id) FILTER (WHERE dh.smart_status IN ('failed', 'failure_predicted')) as failing_disks
      FROM storage_status ss
      LEFT JOIN disk_health dh ON dh.branch_id = ss.branch_id
      WHERE ss.branch_id = $1
      GROUP BY ss.branch_id
    `;

    const result = await this.pool.query(query, [branchId]);
    
    if (result.rows.length === 0) {
      return { score: 0, status: 'unknown', weight: 0, metrics: {}, issues: ['No storage data'] };
    }

    const row = result.rows[0];
    const avgUsage = parseFloat(row.avg_usage_percent) || 0;
    const avgRetention = parseFloat(row.avg_retention_days) || 0;
    const avgLatency = parseFloat(row.avg_write_latency) || 0;
    const degradedArrays = parseInt(row.degraded_arrays) || 0;
    const unmounted = parseInt(row.unmounted_volumes) || 0;
    const failingDisks = parseInt(row.failing_disks) || 0;

    // Calculate capacity score (0-40 points)
    let capacityScore = 40;
    if (avgUsage > 90) capacityScore = 0;
    else if (avgUsage > 80) capacityScore = 10;
    else if (avgUsage > 70) capacityScore = 25;

    // Calculate retention score (0-30 points)
    let retentionScore = 30;
    if (avgRetention < 7) retentionScore = 0;
    else if (avgRetention < 14) retentionScore = 15;
    else if (avgRetention < 30) retentionScore = 25;

    // Calculate performance score (0-20 points)
    const latencyScore = Math.max(0, (1 - avgLatency / 100) * 20);

    // Calculate reliability score (0-10 points)
    let reliabilityScore = 10;
    if (failingDisks > 0) reliabilityScore = 0;
    else if (degradedArrays > 0) reliabilityScore = 5;
    else if (unmounted > 0) reliabilityScore = 7;

    const score = Math.round(capacityScore + retentionScore + latencyScore + reliabilityScore);
    const status = this.scoreToStatus(score);

    const issues: string[] = [];
    if (avgUsage > 80) issues.push(`Storage ${avgUsage.toFixed(0)}% full`);
    if (avgRetention < 14) issues.push(`Only ${avgRetention.toFixed(0)} days retention`);
    if (degradedArrays > 0) issues.push(`${degradedArrays} degraded RAID arrays`);
    if (failingDisks > 0) issues.push(`${failingDisks} disks failing`);
    if (unmounted > 0) issues.push(`${unmounted} unmounted volumes`);
    if (avgLatency > 50) issues.push(`High write latency: ${avgLatency.toFixed(0)}ms`);

    return {
      score,
      status,
      weight: 0,
      metrics: {
        usagePercent: avgUsage,
        retentionDays: avgRetention,
        writeLatencyMs: avgLatency,
        degradedArrays,
        unmountedVolumes: unmounted,
        failingDisks
      },
      issues
    };
  }

  /**
   * Calculate network component health
   */
  private async calculateNetworkHealth(
    tenantId: string,
    branchId: string
  ): Promise<ComponentHealth> {
    const query = `
      SELECT 
        latency_ms,
        jitter_ms,
        packet_loss_percent,
        bandwidth_usage_percent,
        wan_status,
        vpn_status,
        last_wan_disconnect,
        EXTRACT(EPOCH FROM (NOW() - last_check)) as seconds_since_check
      FROM network_health
      WHERE branch_id = $1
      ORDER BY last_check DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [branchId]);
    
    if (result.rows.length === 0) {
      return { score: 0, status: 'unknown', weight: 0, metrics: {}, issues: ['No network data'] };
    }

    const row = result.rows[0];
    const latency = parseFloat(row.latency_ms) || 0;
    const jitter = parseFloat(row.jitter_ms) || 0;
    const packetLoss = parseFloat(row.packet_loss_percent) || 0;
    const bandwidthUsage = parseFloat(row.bandwidth_usage_percent) || 0;
    const wanStatus = row.wan_status;
    const vpnStatus = row.vpn_status;
    const secondsSinceCheck = parseFloat(row.seconds_since_check) || 0;

    // Calculate connectivity score (0-40 points)
    let connectivityScore = 40;
    if (wanStatus === 'disconnected') connectivityScore = 0;
    else if (vpnStatus === 'disconnected') connectivityScore = 20;
    else if (secondsSinceCheck > 600) connectivityScore = 30;

    // Calculate latency score (0-30 points)
    const latencyScore = Math.max(0, (1 - latency / 200) * 30);

    // Calculate quality score (0-20 points)
    const packetLossScore = Math.max(0, (1 - packetLoss / 5) * 10);
    const jitterScore = Math.max(0, (1 - jitter / 50) * 10);
    const qualityScore = packetLossScore + jitterScore;

    // Calculate capacity score (0-10 points)
    const capacityScore = Math.max(0, (1 - bandwidthUsage / 100) * 10);

    const score = Math.round(connectivityScore + latencyScore + qualityScore + capacityScore);
    const status = this.scoreToStatus(score);

    const issues: string[] = [];
    if (wanStatus === 'disconnected') issues.push('WAN disconnected');
    if (vpnStatus === 'disconnected') issues.push('VPN disconnected');
    if (latency > 150) issues.push(`High latency: ${latency.toFixed(0)}ms`);
    if (packetLoss > 2) issues.push(`Packet loss: ${packetLoss.toFixed(1)}%`);
    if (jitter > 30) issues.push(`High jitter: ${jitter.toFixed(0)}ms`);
    if (bandwidthUsage > 85) issues.push(`Bandwidth ${bandwidthUsage.toFixed(0)}% utilized`);

    return {
      score,
      status,
      weight: 0,
      metrics: {
        latency,
        jitter,
        packetLoss,
        bandwidthUsage,
        wanStatus,
        vpnStatus
      },
      issues
    };
  }

  /**
   * Calculate power/UPS component health
   */
  private async calculatePowerHealth(
    tenantId: string,
    branchId: string
  ): Promise<ComponentHealth> {
    const query = `
      SELECT 
        COUNT(*) as total_ups,
        COUNT(*) FILTER (WHERE ups_status = 'online') as online,
        COUNT(*) FILTER (WHERE ups_status = 'offline') as offline,
        COUNT(*) FILTER (WHERE running_on_battery = true) as on_battery,
        AVG(battery_percent) as avg_battery_percent,
        AVG(estimated_runtime_minutes) as avg_runtime_minutes,
        AVG(load_percent) as avg_load_percent,
        COUNT(*) FILTER (WHERE battery_age_months > 36) as aging_batteries
      FROM ups_health
      WHERE branch_id = $1
    `;

    const result = await this.pool.query(query, [branchId]);
    const row = result.rows[0];

    const total = parseInt(row.total_ups) || 0;
    if (total === 0) {
      return { score: 50, status: 'warning', weight: 0, metrics: {}, issues: ['No UPS monitoring'] };
    }

    const online = parseInt(row.online) || 0;
    const offline = parseInt(row.offline) || 0;
    const onBattery = parseInt(row.on_battery) || 0;
    const avgBattery = parseFloat(row.avg_battery_percent) || 0;
    const avgRuntime = parseFloat(row.avg_runtime_minutes) || 0;
    const avgLoad = parseFloat(row.avg_load_percent) || 0;
    const agingBatteries = parseInt(row.aging_batteries) || 0;

    // Calculate availability score (0-40 points)
    const availabilityScore = (online / total) * 40;

    // Calculate battery health score (0-30 points)
    let batteryScore = 30;
    if (avgBattery < 50) batteryScore = 0;
    else if (avgBattery < 70) batteryScore = 15;
    else if (avgBattery < 90) batteryScore = 25;

    // Calculate runtime score (0-20 points)
    let runtimeScore = 20;
    if (avgRuntime < 10) runtimeScore = 0;
    else if (avgRuntime < 20) runtimeScore = 10;
    else if (avgRuntime < 30) runtimeScore = 15;

    // Calculate load score (0-10 points)
    const loadScore = Math.max(0, (1 - avgLoad / 100) * 10);

    let score = Math.round(availabilityScore + batteryScore + runtimeScore + loadScore);

    // Critical penalties
    if (onBattery > 0) score = Math.min(score, 40);
    if (offline > 0) score = Math.min(score, 30);

    const status = this.scoreToStatus(score);

    const issues: string[] = [];
    if (offline > 0) issues.push(`${offline} UPS offline`);
    if (onBattery > 0) issues.push(`${onBattery} UPS on battery power`);
    if (avgBattery < 70) issues.push(`Low battery: ${avgBattery.toFixed(0)}%`);
    if (avgRuntime < 20) issues.push(`Low runtime: ${avgRuntime.toFixed(0)}min`);
    if (agingBatteries > 0) issues.push(`${agingBatteries} aging batteries (>3 years)`);
    if (avgLoad > 80) issues.push(`High load: ${avgLoad.toFixed(0)}%`);

    return {
      score,
      status,
      weight: 0,
      metrics: {
        total,
        online,
        offline,
        onBattery,
        avgBatteryPercent: avgBattery,
        avgRuntimeMinutes: avgRuntime,
        avgLoadPercent: avgLoad,
        agingBatteries
      },
      issues
    };
  }

  /**
   * Calculate edge agent component health
   */
  private async calculateEdgeAgentHealth(
    tenantId: string,
    branchId: string
  ): Promise<ComponentHealth> {
    const query = `
      SELECT 
        status,
        version,
        cpu_usage,
        memory_usage,
        disk_usage,
        uptime_seconds,
        pending_uploads,
        last_heartbeat,
        last_config_sync,
        EXTRACT(EPOCH FROM (NOW() - last_heartbeat)) as seconds_since_heartbeat
      FROM edge_agents
      WHERE branch_id = $1
      LIMIT 1
    `;

    const result = await this.pool.query(query, [branchId]);
    
    if (result.rows.length === 0) {
      return { score: 0, status: 'critical', weight: 0, metrics: {}, issues: ['No edge agent'] };
    }

    const row = result.rows[0];
    const agentStatus = row.status;
    const cpuUsage = parseFloat(row.cpu_usage) || 0;
    const memoryUsage = parseFloat(row.memory_usage) || 0;
    const diskUsage = parseFloat(row.disk_usage) || 0;
    const uptimeSeconds = parseInt(row.uptime_seconds) || 0;
    const pendingUploads = parseInt(row.pending_uploads) || 0;
    const secondsSinceHeartbeat = parseFloat(row.seconds_since_heartbeat) || 0;
    const lastConfigSync = row.last_config_sync;

    // Calculate connectivity score (0-40 points)
    let connectivityScore = 40;
    if (agentStatus === 'offline') connectivityScore = 0;
    else if (secondsSinceHeartbeat > 300) connectivityScore = 10;
    else if (secondsSinceHeartbeat > 120) connectivityScore = 30;

    // Calculate resource health score (0-30 points)
    const cpuScore = Math.max(0, (1 - cpuUsage / 100) * 10);
    const memoryScore = Math.max(0, (1 - memoryUsage / 100) * 10);
    const diskScore = Math.max(0, (1 - diskUsage / 100) * 10);
    const resourceScore = cpuScore + memoryScore + diskScore;

    // Calculate operational score (0-20 points)
    let operationalScore = 20;
    if (pendingUploads > 1000) operationalScore = 5;
    else if (pendingUploads > 500) operationalScore = 10;
    else if (pendingUploads > 100) operationalScore = 15;

    // Calculate stability score (0-10 points)
    const uptimeHours = uptimeSeconds / 3600;
    let stabilityScore = 10;
    if (uptimeHours < 1) stabilityScore = 0;
    else if (uptimeHours < 24) stabilityScore = 5;
    else if (uptimeHours < 168) stabilityScore = 8;

    const score = Math.round(connectivityScore + resourceScore + operationalScore + stabilityScore);
    const status = this.scoreToStatus(score);

    const issues: string[] = [];
    if (agentStatus === 'offline') issues.push('Edge agent offline');
    else if (secondsSinceHeartbeat > 120) {
      issues.push(`No heartbeat for ${(secondsSinceHeartbeat / 60).toFixed(0)}min`);
    }
    if (cpuUsage > 85) issues.push(`High CPU: ${cpuUsage.toFixed(0)}%`);
    if (memoryUsage > 85) issues.push(`High memory: ${memoryUsage.toFixed(0)}%`);
    if (diskUsage > 85) issues.push(`High disk: ${diskUsage.toFixed(0)}%`);
    if (pendingUploads > 100) issues.push(`${pendingUploads} pending uploads`);
    if (uptimeHours < 24) issues.push(`Recently restarted (${uptimeHours.toFixed(1)}h uptime)`);

    return {
      score,
      status,
      weight: 0,
      metrics: {
        status: agentStatus,
        cpuUsage,
        memoryUsage,
        diskUsage,
        uptimeHours,
        pendingUploads,
        secondsSinceHeartbeat
      },
      issues
    };
  }

  /**
   * Get branch basic info
   */
  private async getBranchInfo(tenantId: string, branchId: string) {
    const query = `
      SELECT name, code
      FROM branches
      WHERE id = $1 AND tenant_id = $2
    `;
    const result = await this.pool.query(query, [branchId, tenantId]);
    return result.rows[0] || { name: 'Unknown', code: 'UNK' };
  }

  /**
   * Get 24-hour health trends
   */
  private async getHealthTrends(tenantId: string, branchId: string) {
    const query = `
      SELECT 
        AVG(overall_score) as avg_score,
        MIN(overall_score) as min_score,
        MAX(overall_score) as max_score,
        STDDEV(overall_score) as score_stddev
      FROM branch_health_scores
      WHERE branch_id = $1
        AND calculated_at >= NOW() - INTERVAL '24 hours'
    `;

    const result = await this.pool.query(query, [branchId]);
    const row = result.rows[0];

    const avgScore = parseFloat(row.avg_score) || 0;
    const minScore = parseFloat(row.min_score) || 0;
    const maxScore = parseFloat(row.max_score) || 0;
    const stddev = parseFloat(row.score_stddev) || 0;

    // Determine trend
    let trend: 'improving' | 'stable' | 'degrading' = 'stable';
    if (stddev > 10) {
      // Get recent vs earlier scores
      const trendQuery = `
        WITH recent AS (
          SELECT AVG(overall_score) as score
          FROM branch_health_scores
          WHERE branch_id = $1
            AND calculated_at >= NOW() - INTERVAL '6 hours'
        ),
        earlier AS (
          SELECT AVG(overall_score) as score
          FROM branch_health_scores
          WHERE branch_id = $1
            AND calculated_at >= NOW() - INTERVAL '24 hours'
            AND calculated_at < NOW() - INTERVAL '6 hours'
        )
        SELECT recent.score - earlier.score as score_change
        FROM recent, earlier
      `;
      const trendResult = await this.pool.query(trendQuery, [branchId]);
      if (trendResult.rows.length > 0) {
        const change = parseFloat(trendResult.rows[0].score_change) || 0;
        if (change > 5) trend = 'improving';
        else if (change < -5) trend = 'degrading';
      }
    }

    return {
      avgScore: Math.round(avgScore),
      minScore: Math.round(minScore),
      trend
    };
  }

  /**
   * Determine overall status based on score and component statuses
   */
  private determineStatus(
    overallScore: number,
    components: Record<string, ComponentHealth>
  ): 'healthy' | 'warning' | 'critical' | 'unknown' {
    // Any critical component makes overall critical
    const hasCritical = Object.values(components).some(c => c.status === 'critical');
    if (hasCritical || overallScore < 60) {
      return 'critical';
    }

    // Multiple warnings or score below 80 makes overall warning
    const warningCount = Object.values(components).filter(c => c.status === 'warning').length;
    if (warningCount >= 2 || overallScore < 80) {
      return 'warning';
    }

    return 'healthy';
  }

  /**
   * Convert numeric score to status
   */
  private scoreToStatus(score: number): 'healthy' | 'warning' | 'critical' | 'unknown' {
    if (score >= 80) return 'healthy';
    if (score >= 60) return 'warning';
    if (score > 0) return 'critical';
    return 'unknown';
  }

  /**
   * Persist health score to database
   */
  private async persistHealthScore(tenantId: string, healthScore: BranchHealthScore) {
    const query = `
      INSERT INTO branch_health_scores (
        tenant_id, branch_id, overall_score, overall_status,
        camera_score, camera_status,
        recording_score, recording_status,
        storage_score, storage_status,
        network_score, network_status,
        power_score, power_status,
        edge_agent_score, edge_agent_status,
        calculated_at, component_details_json
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18
      )
    `;

    await this.pool.query(query, [
      tenantId,
      healthScore.branchId,
      healthScore.overallScore,
      healthScore.overallStatus,
      healthScore.components.camera.score,
      healthScore.components.camera.status,
      healthScore.components.recording.score,
      healthScore.components.recording.status,
      healthScore.components.storage.score,
      healthScore.components.storage.status,
      healthScore.components.network.score,
      healthScore.components.network.status,
      healthScore.components.power.score,
      healthScore.components.power.status,
      healthScore.components.edgeAgent.score,
      healthScore.components.edgeAgent.status,
      healthScore.calculatedAt,
      JSON.stringify({
        camera: healthScore.components.camera,
        recording: healthScore.components.recording,
        storage: healthScore.components.storage,
        network: healthScore.components.network,
        power: healthScore.components.power,
        edgeAgent: healthScore.components.edgeAgent
      })
    ]);

    // Update branch health_status and health_score
    await this.pool.query(
      `UPDATE branches 
       SET health_status = $1, 
           health_score = $2, 
           last_health_check = $3
       WHERE id = $4`,
      [healthScore.overallStatus, healthScore.overallScore, healthScore.calculatedAt, healthScore.branchId]
    );
  }

  /**
   * Calculate health scores for all branches in tenant
   */
  async calculateAllBranchesHealth(tenantId: string): Promise<BranchHealthScore[]> {
    // Get all active branches
    const branchesQuery = `
      SELECT id
      FROM branches
      WHERE tenant_id = $1
        AND status = 'active'
      ORDER BY name
    `;

    const result = await this.pool.query(branchesQuery, [tenantId]);
    const branchIds = result.rows.map(row => row.id);

    // Calculate health for each branch in parallel (in batches to avoid overwhelming the system)
    const batchSize = 10;
    const allScores: BranchHealthScore[] = [];

    for (let i = 0; i < branchIds.length; i += batchSize) {
      const batch = branchIds.slice(i, i + batchSize);
      const batchScores = await Promise.all(
        batch.map(branchId => this.calculateBranchHealth(tenantId, branchId))
      );
      allScores.push(...batchScores);
    }

    return allScores;
  }

  /**
   * Get latest health score for a branch
   */
  async getLatestBranchHealth(tenantId: string, branchId: string): Promise<BranchHealthScore | null> {
    const query = `
      SELECT 
        bhs.*,
        b.name as branch_name,
        b.code as branch_code
      FROM branch_health_scores bhs
      JOIN branches b ON b.id = bhs.branch_id
      WHERE bhs.branch_id = $1
        AND bhs.tenant_id = $2
      ORDER BY bhs.calculated_at DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [branchId, tenantId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const details = row.component_details_json || {};

    return {
      branchId: row.branch_id,
      branchName: row.branch_name,
      branchCode: row.branch_code,
      overallScore: row.overall_score,
      overallStatus: row.overall_status,
      components: {
        camera: details.camera || { score: row.camera_score, status: row.camera_status, weight: 25, metrics: {}, issues: [] },
        recording: details.recording || { score: row.recording_score, status: row.recording_status, weight: 25, metrics: {}, issues: [] },
        storage: details.storage || { score: row.storage_score, status: row.storage_status, weight: 15, metrics: {}, issues: [] },
        network: details.network || { score: row.network_score, status: row.network_status, weight: 15, metrics: {}, issues: [] },
        power: details.power || { score: row.power_score, status: row.power_status, weight: 10, metrics: {}, issues: [] },
        edgeAgent: details.edgeAgent || { score: row.edge_agent_score, status: row.edge_agent_status, weight: 10, metrics: {}, issues: [] }
      },
      calculatedAt: row.calculated_at,
      trendsLast24h: { avgScore: 0, minScore: 0, trend: 'stable' }
    };
  }
}
