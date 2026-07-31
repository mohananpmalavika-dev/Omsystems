/**
 * Infrastructure Health Scoring Engine
 * Unified health scoring across all infrastructure domains
 * Provides single health score per branch aggregating: power, network, compute, storage, cooling, security, surveillance
 */

import { Pool } from 'pg';
import { InfrastructureHealthScore, HealthStatus } from '../types/infrastructure.types';

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
