/**
 * Infrastructure Health Scoring Engine
 * Unified health scoring across all infrastructure domains
 * Provides single health score per branch aggregating: power, network, compute, storage, cooling, security, surveillance
 */

import { Pool } from 'pg';
import { InfrastructureHealthScore, HealthStatus } from '../../types/infrastructure.types.js';

export interface DomainHealthScore {
  score: number;
  status: HealthStatus;
  componentCount: number;
  healthyComponents: number;
  warningComponents: number;
  criticalComponents: number;
  details: Record<string, any>;
}

export interface BranchHealthSummary {
  branchId: string;
  branchName: string;
  overallScore: number;
  overallStatus: HealthStatus;
  domains: {
    power: DomainHealthScore;
    network: DomainHealthScore;
    compute: DomainHealthScore;
    storage: DomainHealthScore;
    cooling: DomainHealthScore;
    security: DomainHealthScore;
    surveillance: DomainHealthScore;
  };
  criticalIssues: number;
  warningIssues: number;
  predictedFailures: number;
  lastUpdated: Date;
}

/**
 * Domain weights for overall score calculation
 */
const DOMAIN_WEIGHTS = {
  power: 0.20,        // 20% - Power is critical
  network: 0.25,      // 25% - Network is foundation
  compute: 0.15,      // 15% - Compute is important
  storage: 0.15,      // 15% - Storage is important
  cooling: 0.10,      // 10% - Cooling affects all
  security: 0.10,     // 10% - Security is essential
  surveillance: 0.05  // 5%  - Surveillance (already well monitored)
};

export class InfrastructureHealthScoringService {
  constructor(private pool: Pool) {}

  /**
   * Calculate comprehensive health score for a branch
   */
  async calculateBranchHealth(
    tenantId: string, 
    branchId: string
  ): Promise<BranchHealthSummary> {
    // Get branch name
    const branchInfo = await this.getBranchInfo(tenantId, branchId);

    // Calculate domain scores in parallel
    const [
      powerScore,
      networkScore,
      computeScore,
      storageScore,
      coolingScore,
      securityScore,
      surveillanceScore
    ] = await Promise.all([
      this.calculatePowerDomainScore(tenantId, branchId),
      this.calculateNetworkDomainScore(tenantId, branchId),
      this.calculateComputeDomainScore(tenantId, branchId),
      this.calculateStorageDomainScore(tenantId, branchId),
      this.calculateCoolingDomainScore(tenantId, branchId),
      this.calculateSecurityDomainScore(tenantId, branchId),
      this.calculateSurveillanceDomainScore(tenantId, branchId)
    ]);

    // Calculate overall score (weighted average)
    const overallScore = Math.round(
      powerScore.score * DOMAIN_WEIGHTS.power +
      networkScore.score * DOMAIN_WEIGHTS.network +
      computeScore.score * DOMAIN_WEIGHTS.compute +
      storageScore.score * DOMAIN_WEIGHTS.storage +
      coolingScore.score * DOMAIN_WEIGHTS.cooling +
      securityScore.score * DOMAIN_WEIGHTS.security +
      surveillanceScore.score * DOMAIN_WEIGHTS.surveillance
    );

    const overallStatus = this.determineHealthStatus(overallScore);

    // Count issues across all domains
    const criticalIssues = 
      powerScore.criticalComponents +
      networkScore.criticalComponents +
      computeScore.criticalComponents +
      storageScore.criticalComponents +
      coolingScore.criticalComponents +
      securityScore.criticalComponents +
      surveillanceScore.criticalComponents;

    const warningIssues = 
      powerScore.warningComponents +
      networkScore.warningComponents +
      computeScore.warningComponents +
      storageScore.warningComponents +
      coolingScore.warningComponents +
      securityScore.warningComponents +
      surveillanceScore.warningComponents;

    // Get predicted failures
    const predictedFailures = await this.getPredictedFailuresCount(tenantId, branchId);

    const summary: BranchHealthSummary = {
      branchId,
      branchName: branchInfo.name,
      overallScore,
      overallStatus,
      domains: {
        power: powerScore,
        network: networkScore,
        compute: computeScore,
        storage: storageScore,
        cooling: coolingScore,
        security: securityScore,
        surveillance: surveillanceScore
      },
      criticalIssues,
      warningIssues,
      predictedFailures,
      lastUpdated: new Date()
    };

    // Store in database
    await this.storeHealthScore(tenantId, summary);

    return summary;
  }

  /**
   * Calculate Power Domain Health Score
   * Includes: UPS, Generator, Power Quality
   */
  private async calculatePowerDomainScore(
    tenantId: string, 
    branchId: string
  ): Promise<DomainHealthScore> {
    const query = `
      WITH ups_scores AS (
        SELECT 
          uhm.health_score,
          uhm.health_status,
          uhm.running_on_battery,
          uhm.battery_health_percent
        FROM ups_devices ud
        LEFT JOIN LATERAL (
          SELECT health_score, health_status, running_on_battery, battery_health_percent
          FROM ups_health_metrics
          WHERE ups_id = ud.id
          ORDER BY observed_at DESC
          LIMIT 1
        ) uhm ON true
        WHERE ud.tenant_id = $1 AND ud.branch_id = $2
      ),
      generator_scores AS (
        SELECT 
          ghm.health_score,
          ghm.health_status
        FROM generators g
        LEFT JOIN LATERAL (
          SELECT health_score, health_status
          FROM generator_health_metrics
          WHERE generator_id = g.id
          ORDER BY observed_at DESC
          LIMIT 1
        ) ghm ON true
        WHERE g.tenant_id = $1 AND g.branch_id = $2
      ),
      power_scores AS (
        SELECT 
          pm.health_score,
          pm.health_status
        FROM power_metrics pm
        WHERE pm.tenant_id = $1 AND pm.branch_id = $2
        ORDER BY pm.observed_at DESC
        LIMIT 1
      )
      SELECT
        COALESCE(AVG(ups_scores.health_score), 0) as ups_avg_score,
        COUNT(*) FILTER (WHERE ups_scores.health_status = 'critical') as ups_critical,
        COUNT(*) FILTER (WHERE ups_scores.health_status = 'warning') as ups_warning,
        COUNT(*) FILTER (WHERE ups_scores.health_status = 'healthy') as ups_healthy,
        COUNT(*) FILTER (WHERE ups_scores.running_on_battery = true) as ups_on_battery,
        COALESCE(AVG(generator_scores.health_score), 0) as gen_avg_score,
        COUNT(*) FILTER (WHERE generator_scores.health_status = 'critical') as gen_critical,
        COUNT(*) FILTER (WHERE generator_scores.health_status = 'warning') as gen_warning,
        COALESCE(power_scores.health_score, 0) as power_quality_score
      FROM ups_scores
      FULL OUTER JOIN generator_scores ON true
      FULL OUTER JOIN power_scores ON true
    `;

    const result = await this.pool.query(query, [tenantId, branchId]);
    const row = result.rows[0] || {};

    // Calculate weighted power domain score
    const upsScore = parseFloat(row.ups_avg_score) || 0;
    const genScore = parseFloat(row.gen_avg_score) || 0;
    const powerQualityScore = parseFloat(row.power_quality_score) || 0;

    // UPS on battery is critical - reduce score significantly
    const onBatteryPenalty = (parseInt(row.ups_on_battery) || 0) * 30;

    const domainScore = Math.max(0, Math.round(
      (upsScore * 0.5 + genScore * 0.3 + powerQualityScore * 0.2) - onBatteryPenalty
    ));

    const criticalCount = 
      (parseInt(row.ups_critical) || 0) + 
      (parseInt(row.gen_critical) || 0);
    const warningCount = 
      (parseInt(row.ups_warning) || 0) + 
      (parseInt(row.gen_warning) || 0);
    const healthyCount = parseInt(row.ups_healthy) || 0;
    const totalCount = criticalCount + warningCount + healthyCount;

    return {
      score: domainScore,
      status: this.determineHealthStatus(domainScore),
      componentCount: totalCount,
      healthyComponents: healthyCount,
      warningComponents: warningCount,
      criticalComponents: criticalCount,
      details: {
        upsScore,
        generatorScore: genScore,
        powerQualityScore,
        upsOnBattery: parseInt(row.ups_on_battery) || 0
      }
    };
  }

  /**
   * Calculate Network Domain Health Score
   * Includes: Switches, Firewalls, Network Links, VPN, SD-WAN
   */
  private async calculateNetworkDomainScore(
    tenantId: string, 
    branchId: string
  ): Promise<DomainHealthScore> {
    const query = `
      WITH switch_scores AS (
        SELECT 
          shm.health_score,
          shm.health_status
        FROM network_switches ns
        LEFT JOIN LATERAL (
          SELECT health_score, health_status
          FROM switch_health_metrics
          WHERE switch_id = ns.id
          ORDER BY observed_at DESC
          LIMIT 1
        ) shm ON true
        WHERE ns.tenant_id = $1 AND ns.branch_id = $2
      ),
      firewall_scores AS (
        SELECT 
          fhm.health_score,
          fhm.health_status
        FROM firewalls f
        LEFT JOIN LATERAL (
          SELECT health_score, health_status
          FROM firewall_health_metrics
          WHERE firewall_id = f.id
          ORDER BY observed_at DESC
          LIMIT 1
        ) fhm ON true
        WHERE f.tenant_id = $1 AND f.branch_id = $2
      ),
      link_scores AS (
        SELECT 
          nlm.health_score,
          nlm.health_status
        FROM network_links nl
        LEFT JOIN LATERAL (
          SELECT health_score, health_status
          FROM network_link_metrics
          WHERE link_id = nl.id
          ORDER BY observed_at DESC
          LIMIT 1
        ) nlm ON true
        WHERE nl.tenant_id = $1 AND nl.branch_id = $2
      )
      SELECT
        COALESCE(AVG(switch_scores.health_score), 0) as switch_avg_score,
        COUNT(*) FILTER (WHERE switch_scores.health_status = 'critical') as switch_critical,
        COUNT(*) FILTER (WHERE switch_scores.health_status = 'warning') as switch_warning,
        COUNT(*) FILTER (WHERE switch_scores.health_status = 'healthy') as switch_healthy,
        COALESCE(AVG(firewall_scores.health_score), 0) as firewall_avg_score,
        COUNT(*) FILTER (WHERE firewall_scores.health_status = 'critical') as firewall_critical,
        COUNT(*) FILTER (WHERE firewall_scores.health_status = 'warning') as firewall_warning,
        COUNT(*) FILTER (WHERE firewall_scores.health_status = 'healthy') as firewall_healthy,
        COALESCE(AVG(link_scores.health_score), 0) as link_avg_score,
        COUNT(*) FILTER (WHERE link_scores.health_status = 'critical') as link_critical,
        COUNT(*) FILTER (WHERE link_scores.health_status = 'warning') as link_warning,
        COUNT(*) FILTER (WHERE link_scores.health_status = 'healthy') as link_healthy
      FROM switch_scores
      FULL OUTER JOIN firewall_scores ON true
      FULL OUTER JOIN link_scores ON true
    `;

    const result = await this.pool.query(query, [tenantId, branchId]);
    const row = result.rows[0] || {};

    const switchScore = parseFloat(row.switch_avg_score) || 0;
    const firewallScore = parseFloat(row.firewall_avg_score) || 0;
    const linkScore = parseFloat(row.link_avg_score) || 0;

    // Weighted network domain score
    const domainScore = Math.round(
      switchScore * 0.4 + 
      firewallScore * 0.35 + 
      linkScore * 0.25
    );

    const criticalCount = 
      (parseInt(row.switch_critical) || 0) + 
      (parseInt(row.firewall_critical) || 0) + 
      (parseInt(row.link_critical) || 0);
    const warningCount = 
      (parseInt(row.switch_warning) || 0) + 
      (parseInt(row.firewall_warning) || 0) + 
      (parseInt(row.link_warning) || 0);
    const healthyCount = 
      (parseInt(row.switch_healthy) || 0) + 
      (parseInt(row.firewall_healthy) || 0) + 
      (parseInt(row.link_healthy) || 0);

    return {
      score: domainScore,
      status: this.determineHealthStatus(domainScore),
      componentCount: criticalCount + warningCount + healthyCount,
      healthyComponents: healthyCount,
      warningComponents: warningCount,
      criticalComponents: criticalCount,
      details: {
        switchScore,
        firewallScore,
        linkScore
      }
    };
  }

  /**
   * Calculate Compute Domain Health Score
   * Includes: CPU, GPU, Memory
   */
  private async calculateComputeDomainScore(
    tenantId: string, 
    branchId: string
  ): Promise<DomainHealthScore> {
    const query = `
      WITH cpu_scores AS (
        SELECT 
          cm.health_score,
          cm.health_status,
          cm.thermal_throttling
        FROM hardware_devices hd
        LEFT JOIN LATERAL (
          SELECT health_score, health_status, thermal_throttling
          FROM cpu_metrics
          WHERE device_id = hd.id
          ORDER BY observed_at DESC
          LIMIT 1
        ) cm ON true
        WHERE hd.tenant_id = $1 AND hd.branch_id = $2
      ),
      gpu_scores AS (
        SELECT 
          gm.health_score,
          gm.health_status,
          gm.thermal_throttling
        FROM hardware_devices hd
        LEFT JOIN LATERAL (
          SELECT health_score, health_status, thermal_throttling
          FROM gpu_metrics
          WHERE device_id = hd.id
          ORDER BY observed_at DESC
          LIMIT 1
        ) gm ON true
        WHERE hd.tenant_id = $1 AND hd.branch_id = $2
      )
      SELECT
        COALESCE(AVG(cpu_scores.health_score), 0) as cpu_avg_score,
        COUNT(*) FILTER (WHERE cpu_scores.health_status = 'critical') as cpu_critical,
        COUNT(*) FILTER (WHERE cpu_scores.health_status = 'warning') as cpu_warning,
        COUNT(*) FILTER (WHERE cpu_scores.health_status = 'healthy') as cpu_healthy,
        COUNT(*) FILTER (WHERE cpu_scores.thermal_throttling = true) as cpu_throttling,
        COALESCE(AVG(gpu_scores.health_score), 0) as gpu_avg_score,
        COUNT(*) FILTER (WHERE gpu_scores.health_status = 'critical') as gpu_critical,
        COUNT(*) FILTER (WHERE gpu_scores.health_status = 'warning') as gpu_warning,
        COUNT(*) FILTER (WHERE gpu_scores.health_status = 'healthy') as gpu_healthy,
        COUNT(*) FILTER (WHERE gpu_scores.thermal_throttling = true) as gpu_throttling
      FROM cpu_scores
      FULL OUTER JOIN gpu_scores ON true
    `;

    const result = await this.pool.query(query, [tenantId, branchId]);
    const row = result.rows[0] || {};

    const cpuScore = parseFloat(row.cpu_avg_score) || 0;
    const gpuScore = parseFloat(row.gpu_avg_score) || 0;

    // Thermal throttling significantly impacts compute performance
    const throttlingPenalty = 
      ((parseInt(row.cpu_throttling) || 0) + (parseInt(row.gpu_throttling) || 0)) * 15;

    const domainScore = Math.max(0, Math.round(
      (cpuScore * 0.5 + gpuScore * 0.5) - throttlingPenalty
    ));

    const criticalCount = 
      (parseInt(row.cpu_critical) || 0) + 
      (parseInt(row.gpu_critical) || 0);
    const warningCount = 
      (parseInt(row.cpu_warning) || 0) + 
      (parseInt(row.gpu_warning) || 0);
    const healthyCount = 
      (parseInt(row.cpu_healthy) || 0) + 
      (parseInt(row.gpu_healthy) || 0);

    return {
      score: domainScore,
      status: this.determineHealthStatus(domainScore),
      componentCount: criticalCount + warningCount + healthyCount,
      healthyComponents: healthyCount,
      warningComponents: warningCount,
      criticalComponents: criticalCount,
      details: {
        cpuScore,
        gpuScore,
        throttlingCount: (parseInt(row.cpu_throttling) || 0) + (parseInt(row.gpu_throttling) || 0)
      }
    };
  }

  /**
   * Calculate Storage Domain Health Score
   * Includes: Disk Health, RAID Status, Storage Capacity
   */
  private async calculateStorageDomainScore(
    tenantId: string, 
    branchId: string
  ): Promise<DomainHealthScore> {
    const query = `
      WITH disk_scores AS (
        SELECT 
          CASE 
            WHEN smart_status = 'healthy' THEN 100
            WHEN smart_status = 'warning' THEN 70
            WHEN smart_status = 'failure_predicted' THEN 40
            WHEN smart_status = 'failed' THEN 0
            ELSE 50
          END as health_score,
          smart_status as health_status
        FROM disk_health
        WHERE tenant_id = $1 AND branch_id = $2
      ),
      storage_scores AS (
        SELECT 
          CASE 
            WHEN usage_percent < 80 THEN 100
            WHEN usage_percent < 90 THEN 80
            WHEN usage_percent < 95 THEN 60
            ELSE 40
          END as health_score,
          CASE 
            WHEN usage_percent < 80 THEN 'healthy'
            WHEN usage_percent < 90 THEN 'warning'
            ELSE 'critical'
          END as health_status,
          raid_status
        FROM storage_status
        WHERE tenant_id = $1 AND branch_id = $2
        ORDER BY last_check_at DESC
        LIMIT 1
      )
      SELECT
        COALESCE(AVG(disk_scores.health_score), 0) as disk_avg_score,
        COUNT(*) FILTER (WHERE disk_scores.health_status = 'failed') as disk_critical,
        COUNT(*) FILTER (WHERE disk_scores.health_status = 'failure_predicted') as disk_predicted,
        COUNT(*) FILTER (WHERE disk_scores.health_status = 'warning') as disk_warning,
        COUNT(*) FILTER (WHERE disk_scores.health_status = 'healthy') as disk_healthy,
        COALESCE(storage_scores.health_score, 0) as storage_score,
        storage_scores.raid_status
      FROM disk_scores
      FULL OUTER JOIN storage_scores ON true
    `;

    const result = await this.pool.query(query, [tenantId, branchId]);
    const row = result.rows[0] || {};

    const diskScore = parseFloat(row.disk_avg_score) || 0;
    const storageScore = parseFloat(row.storage_score) || 0;

    // RAID degraded is critical
    const raidPenalty = row.raid_status === 'degraded' ? 25 : 0;

    const domainScore = Math.max(0, Math.round(
      (diskScore * 0.6 + storageScore * 0.4) - raidPenalty
    ));

    const criticalCount = parseInt(row.disk_critical) || 0;
    const warningCount = 
      (parseInt(row.disk_warning) || 0) + 
      (parseInt(row.disk_predicted) || 0);
    const healthyCount = parseInt(row.disk_healthy) || 0;

    return {
      score: domainScore,
      status: this.determineHealthStatus(domainScore),
      componentCount: criticalCount + warningCount + healthyCount,
      healthyComponents: healthyCount,
      warningComponents: warningCount,
      criticalComponents: criticalCount,
      details: {
        diskScore,
        storageScore,
        raidStatus: row.raid_status
      }
    };
  }

  /**
   * Calculate Cooling Domain Health Score
   * Includes: Temperature, Fan Status
   */
  private async calculateCoolingDomainScore(
    tenantId: string, 
    branchId: string
  ): Promise<DomainHealthScore> {
    const query = `
      WITH temp_metrics AS (
        SELECT 
          CASE 
            WHEN temperature_celsius < 25 THEN 100
            WHEN temperature_celsius < 30 THEN 90
            WHEN temperature_celsius < 35 THEN 70
            WHEN temperature_celsius < 40 THEN 50
            ELSE 30
          END as health_score,
          CASE 
            WHEN temperature_celsius < 30 THEN 'healthy'
            WHEN temperature_celsius < 35 THEN 'warning'
            ELSE 'critical'
          END as health_status,
          fan_status
        FROM switch_health_metrics
        WHERE tenant_id = $1
        ORDER BY observed_at DESC
        LIMIT 10
      )
      SELECT
        COALESCE(AVG(health_score), 100) as avg_temp_score,
        COUNT(*) FILTER (WHERE health_status = 'critical') as temp_critical,
        COUNT(*) FILTER (WHERE health_status = 'warning') as temp_warning,
        COUNT(*) FILTER (WHERE health_status = 'healthy') as temp_healthy,
        COUNT(*) FILTER (WHERE fan_status = 'failed') as fan_failures
      FROM temp_metrics
    `;

    const result = await this.pool.query(query, [tenantId]);
    const row = result.rows[0] || {};

    const tempScore = parseFloat(row.avg_temp_score) || 100;
    const fanFailures = parseInt(row.fan_failures) || 0;

    const domainScore = Math.max(0, Math.round(tempScore - (fanFailures * 20)));

    return {
      score: domainScore,
      status: this.determineHealthStatus(domainScore),
      componentCount: (parseInt(row.temp_critical) || 0) + 
                     (parseInt(row.temp_warning) || 0) + 
                     (parseInt(row.temp_healthy) || 0),
      healthyComponents: parseInt(row.temp_healthy) || 0,
      warningComponents: parseInt(row.temp_warning) || 0,
      criticalComponents: parseInt(row.temp_critical) || 0,
      details: {
        temperatureScore: tempScore,
        fanFailures
      }
    };
  }

  /**
   * Calculate Security Domain Health Score
   * Includes: Firewall Status, IPS, AV
   */
  private async calculateSecurityDomainScore(
    tenantId: string, 
    branchId: string
  ): Promise<DomainHealthScore> {
    const query = `
      SELECT 
        COALESCE(AVG(fhm.health_score), 0) as firewall_avg_score,
        COUNT(*) FILTER (WHERE fhm.health_status = 'critical') as firewall_critical,
        COUNT(*) FILTER (WHERE fhm.health_status = 'warning') as firewall_warning,
        COUNT(*) FILTER (WHERE fhm.health_status = 'healthy') as firewall_healthy,
        COUNT(*) FILTER (WHERE fhm.ips_status = 'disabled') as ips_disabled,
        COUNT(*) FILTER (WHERE fhm.av_status = 'disabled' OR fhm.av_status = 'outdated') as av_issues
      FROM firewalls f
      LEFT JOIN LATERAL (
        SELECT health_score, health_status, ips_status, av_status
        FROM firewall_health_metrics
        WHERE firewall_id = f.id
        ORDER BY observed_at DESC
        LIMIT 1
      ) fhm ON true
      WHERE f.tenant_id = $1 AND f.branch_id = $2
    `;

    const result = await this.pool.query(query, [tenantId, branchId]);
    const row = result.rows[0] || {};

    const firewallScore = parseFloat(row.firewall_avg_score) || 0;
    const ipsDisabled = parseInt(row.ips_disabled) || 0;
    const avIssues = parseInt(row.av_issues) || 0;

    // Security services disabled is critical
    const securityPenalty = (ipsDisabled * 25) + (avIssues * 15);

    const domainScore = Math.max(0, Math.round(firewallScore - securityPenalty));

    return {
      score: domainScore,
      status: this.determineHealthStatus(domainScore),
      componentCount: (parseInt(row.firewall_critical) || 0) + 
                     (parseInt(row.firewall_warning) || 0) + 
                     (parseInt(row.firewall_healthy) || 0),
      healthyComponents: parseInt(row.firewall_healthy) || 0,
      warningComponents: parseInt(row.firewall_warning) || 0,
      criticalComponents: parseInt(row.firewall_critical) || 0,
      details: {
        firewallScore,
        ipsDisabled,
        avIssues
      }
    };
  }

  /**
   * Calculate Surveillance Domain Health Score
   * Includes: Camera Health, Recorder Health
   */
  private async calculateSurveillanceDomainScore(
    tenantId: string, 
    branchId: string
  ): Promise<DomainHealthScore> {
    const query = `
      SELECT 
        COUNT(*) as total_cameras,
        COUNT(*) FILTER (WHERE online_status = 'online') as cameras_online,
        COUNT(*) FILTER (WHERE recording_status = 'recording') as cameras_recording,
        AVG(health_score) as avg_health_score
      FROM cameras
      WHERE tenant_id = $1 AND branch_id = $2
    `;

    const result = await this.pool.query(query, [tenantId, branchId]);
    const row = result.rows[0] || {};

    const totalCameras = parseInt(row.total_cameras) || 0;
    const camerasOnline = parseInt(row.cameras_online) || 0;
    const camerasRecording = parseInt(row.cameras_recording) || 0;
    const avgHealthScore = parseFloat(row.avg_health_score) || 0;

    // Calculate based on availability and recording status
    const onlinePercent = totalCameras > 0 ? (camerasOnline / totalCameras) * 100 : 100;
    const recordingPercent = totalCameras > 0 ? (camerasRecording / totalCameras) * 100 : 100;

    const domainScore = Math.round((avgHealthScore * 0.5) + (onlinePercent * 0.3) + (recordingPercent * 0.2));

    const healthyCount = Math.floor(totalCameras * 0.9); // Estimate
    const warningCount = totalCameras - camerasOnline - (totalCameras - camerasOnline > 5 ? 5 : 0);
    const criticalCount = totalCameras - camerasOnline;

    return {
      score: domainScore,
      status: this.determineHealthStatus(domainScore),
      componentCount: totalCameras,
      healthyComponents: camerasOnline,
      warningComponents: Math.max(0, warningCount),
      criticalComponents: Math.max(0, criticalCount),
      details: {
        totalCameras,
        camerasOnline,
        camerasRecording,
        avgHealthScore
      }
    };
  }

  /**
   * Get count of predicted failures for branch
   */
  private async getPredictedFailuresCount(
    tenantId: string, 
    branchId: string
  ): Promise<number> {
    const query = `
      SELECT COUNT(*) as count
      FROM (
        -- UPS batteries needing replacement
        SELECT 1 FROM ups_health_metrics uhm
        JOIN ups_devices ud ON ud.id = uhm.ups_id
        WHERE ud.tenant_id = $1 AND ud.branch_id = $2
          AND (uhm.battery_replacement_indicator = true 
               OR uhm.predicted_replacement_days < 90)
          AND uhm.observed_at > NOW() - INTERVAL '1 hour'
        
        UNION ALL
        
        -- Disks with predicted failure
        SELECT 1 FROM disk_health dh
        WHERE dh.tenant_id = $1 AND dh.branch_id = $2
          AND dh.smart_status = 'failure_predicted'
        
        UNION ALL
        
        -- Generators needing maintenance
        SELECT 1 FROM generator_health_metrics ghm
        JOIN generators g ON g.id = ghm.generator_id
        WHERE g.tenant_id = $1 AND g.branch_id = $2
          AND ghm.maintenance_due = true
          AND ghm.observed_at > NOW() - INTERVAL '1 hour'
      ) predicted_failures
    `;

    const result = await this.pool.query(query, [tenantId, branchId]);
    return parseInt(result.rows[0]?.count) || 0;
  }

  /**
   * Store health score in database
   */
  private async storeHealthScore(
    tenantId: string,
    summary: BranchHealthSummary
  ): Promise<void> {
    const query = `
      INSERT INTO infrastructure_health_scores (
        tenant_id, branch_id, observed_at,
        overall_score, overall_status,
        power_score, power_status,
        network_score, network_status,
        compute_score, compute_status,
        storage_score, storage_status,
        cooling_score, cooling_status,
        security_score, security_status,
        surveillance_score, surveillance_status,
        component_details, critical_issues, warning_issues, predicted_failures
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
      )
    `;

    await this.pool.query(query, [
      tenantId,
      summary.branchId,
      summary.lastUpdated,
      summary.overallScore,
      summary.overallStatus,
      summary.domains.power.score,
      summary.domains.power.status,
      summary.domains.network.score,
      summary.domains.network.status,
      summary.domains.compute.score,
      summary.domains.compute.status,
      summary.domains.storage.score,
      summary.domains.storage.status,
      summary.domains.cooling.score,
      summary.domains.cooling.status,
      summary.domains.security.score,
      summary.domains.security.status,
      summary.domains.surveillance.score,
      summary.domains.surveillance.status,
      JSON.stringify(summary.domains),
      summary.criticalIssues,
      summary.warningIssues,
      summary.predictedFailures
    ]);
  }

  /**
   * Get branch information
   */
  private async getBranchInfo(
    tenantId: string,
    branchId: string
  ): Promise<{ name: string }> {
    const query = `
      SELECT name
      FROM resource_nodes
      WHERE id = $1 AND tenant_id = $2 AND type = 'branch'
    `;

    const result = await this.pool.query(query, [branchId, tenantId]);
    return result.rows[0] || { name: 'Unknown Branch' };
  }

  /**
   * Determine health status from score
   */
  private determineHealthStatus(score: number): HealthStatus {
    if (score >= 90) return 'healthy';
    if (score >= 70) return 'warning';
    if (score >= 0) return 'critical';
    return 'unknown';
  }

  /**
   * Calculate health scores for all branches in tenant
   */
  async calculateTenantHealth(tenantId: string): Promise<BranchHealthSummary[]> {
    // Get all branches
    const branchesQuery = `
      SELECT id, name
      FROM resource_nodes
      WHERE tenant_id = $1 AND type = 'branch'
      ORDER BY name
    `;

    const branches = await this.pool.query(branchesQuery, [tenantId]);

    // Calculate health for each branch in parallel
    const healthSummaries = await Promise.all(
      branches.rows.map(branch =>
        this.calculateBranchHealth(tenantId, branch.id)
      )
    );

    return healthSummaries;
  }

  /**
   * Get health trend for a branch over time
   */
  async getBranchHealthTrend(
    tenantId: string,
    branchId: string,
    startDate: Date,
    endDate: Date,
    interval: 'hour' | 'day' = 'hour'
  ): Promise<Array<{
    timestamp: Date;
    overallScore: number;
    powerScore: number;
    networkScore: number;
    computeScore: number;
    storageScore: number;
  }>> {
    const intervalMap = {
      hour: '1 hour',
      day: '1 day'
    };

    const query = `
      SELECT 
        date_trunc($1, observed_at) as timestamp,
        AVG(overall_score) as overall_score,
        AVG(power_score) as power_score,
        AVG(network_score) as network_score,
        AVG(compute_score) as compute_score,
        AVG(storage_score) as storage_score
      FROM infrastructure_health_scores
      WHERE tenant_id = $2 
        AND branch_id = $3
        AND observed_at >= $4 
        AND observed_at <= $5
      GROUP BY date_trunc($1, observed_at)
      ORDER BY timestamp ASC
      LIMIT 500
    `;

    const result = await this.pool.query(query, [
      intervalMap[interval],
      tenantId,
      branchId,
      startDate,
      endDate
    ]);

    return result.rows.map(row => ({
      timestamp: row.timestamp,
      overallScore: Math.round(parseFloat(row.overall_score)),
      powerScore: Math.round(parseFloat(row.power_score)),
      networkScore: Math.round(parseFloat(row.network_score)),
      computeScore: Math.round(parseFloat(row.compute_score)),
      storageScore: Math.round(parseFloat(row.storage_score))
    }));
  }

  /**
   * Get tenant-wide health summary
   */
  async getTenantHealthSummary(tenantId: string): Promise<{
    totalBranches: number;
    healthyBranches: number;
    warningBranches: number;
    criticalBranches: number;
    averageScore: number;
    totalCriticalIssues: number;
    totalWarningIssues: number;
    totalPredictedFailures: number;
  }> {
    const query = `
      SELECT 
        COUNT(DISTINCT branch_id) as total_branches,
        COUNT(DISTINCT branch_id) FILTER (WHERE overall_status = 'healthy') as healthy_branches,
        COUNT(DISTINCT branch_id) FILTER (WHERE overall_status = 'warning') as warning_branches,
        COUNT(DISTINCT branch_id) FILTER (WHERE overall_status = 'critical') as critical_branches,
        AVG(overall_score) as average_score,
        SUM(critical_issues) as total_critical_issues,
        SUM(warning_issues) as total_warning_issues,
        SUM(predicted_failures) as total_predicted_failures
      FROM (
        SELECT DISTINCT ON (branch_id)
          branch_id,
          overall_status,
          overall_score,
          critical_issues,
          warning_issues,
          predicted_failures
        FROM infrastructure_health_scores
        WHERE tenant_id = $1
        ORDER BY branch_id, observed_at DESC
      ) latest_scores
    `;

    const result = await this.pool.query(query, [tenantId]);
    const row = result.rows[0] || {};

    return {
      totalBranches: parseInt(row.total_branches) || 0,
      healthyBranches: parseInt(row.healthy_branches) || 0,
      warningBranches: parseInt(row.warning_branches) || 0,
      criticalBranches: parseInt(row.critical_branches) || 0,
      averageScore: Math.round(parseFloat(row.average_score) || 0),
      totalCriticalIssues: parseInt(row.total_critical_issues) || 0,
      totalWarningIssues: parseInt(row.total_warning_issues) || 0,
      totalPredictedFailures: parseInt(row.total_predicted_failures) || 0
    };
  }
}
