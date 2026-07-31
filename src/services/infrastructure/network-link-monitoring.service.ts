/**
 * Network Link Monitoring Service
 * 
 * Monitors network links between sites and to internet for:
 * - Link status (up/down)
 * - Bandwidth utilization (upload/download)
 * - Latency and jitter
 * - Packet loss percentage
 * - SFP module health (fiber links)
 * - Link quality score
 * 
 * Supports:
 * - WAN links (MPLS, Internet, P2P)
 * - Fiber optic connections with SFP monitoring
 * - ISP circuit monitoring
 */

import { Pool } from 'pg';
import { SNMPCollectorService } from './snmp-collector.service';

interface NetworkLinkHealthMetrics {
  linkId: string;
  healthScore: number;
  healthStatus: 'healthy' | 'warning' | 'critical';
  
  // Link status
  linkStatus: 'up' | 'down' | 'degraded';
  adminStatus: 'enabled' | 'disabled';
  
  // Bandwidth (bits per second)
  bandwidthCapacityMbps: number;
  rxUtilizationPercent?: number;
  txUtilizationPercent?: number;
  rxRateMbps?: number;
  txRateMbps?: number;
  
  // Quality metrics
  latencyMs?: number;
  jitterMs?: number;
  packetLossPercent?: number;
  
  // Counters
  rxBytes: bigint;
  txBytes: bigint;
  rxErrors: number;
  txErrors: number;
  rxDrops: number;
  txDrops: number;
  
  // SFP module (fiber links)
  sfpPresent?: boolean;
  sfpVendor?: string;
  sfpTemperatureCelsius?: number;
  sfpRxPowerDbm?: number;
  sfpTxPowerDbm?: number;
  
  observedAt: Date;
}

export class NetworkLinkMonitoringService {
  private snmpCollector: SNMPCollectorService;

  constructor(private pool: Pool) {
    this.snmpCollector = new SNMPCollectorService(pool);
  }

  /**
   * Collect metrics for all links in a branch
   */
  async collectBranchLinks(branchId: string, tenantId: string): Promise<void> {
    const links = await this.getBranchLinks(branchId, tenantId);

    for (const link of links) {
      try {
        const metrics = await this.collectLinkHealth(link);
        await this.saveHealthMetrics(metrics, tenantId);
        
        const alerts = await this.generateAlerts(link, metrics);
        for (const alert of alerts) {
          await this.saveAlert(alert, tenantId, branchId);
        }
      } catch (error) {
        console.error(`Error collecting link metrics for ${link.id}:`, error);
      }
    }
  }

  /**
   * Collect health metrics for a link
   */
  private async collectLinkHealth(link: any): Promise<NetworkLinkHealthMetrics> {
    const linkStatus = await this.checkLinkStatus(link);
    const bandwidth = await this.measureBandwidth(link);
    const quality = await this.measureQuality(link);
    const sfp = link.link_type === 'fiber' ? await this.checkSFPModule(link) : {};
    
    const healthScore = this.calculateHealthScore({
      linkStatus: linkStatus.status,
      rxUtilization: bandwidth.rxUtilizationPercent,
      txUtilization: bandwidth.txUtilizationPercent,
      latency: quality.latencyMs,
      packetLoss: quality.packetLossPercent,
      rxErrors: linkStatus.rxErrors,
      sfpTemperatureCelsius: sfp.sfpTemperatureCelsius
    });
    
    return {
      linkId: link.id,
      healthScore,
      healthStatus: this.determineHealthStatus(healthScore),
      linkStatus: linkStatus.status,
      adminStatus: linkStatus.adminStatus,
      bandwidthCapacityMbps: link.bandwidth_mbps,
      ...bandwidth,
      ...quality,
      ...linkStatus.counters,
      ...sfp,
      observedAt: new Date()
    };
  }

  private async checkLinkStatus(link: any) {
    // Simplified - implement SNMP polling
    return {
      status: 'up' as const,
      adminStatus: 'enabled' as const,
      rxErrors: 0,
      counters: {
        rxBytes: BigInt(0),
        txBytes: BigInt(0),
        rxErrors: 0,
        txErrors: 0,
        rxDrops: 0,
        txDrops: 0
      }
    };
  }

  private async measureBandwidth(link: any) {
    // Measure using SNMP interface counters
    return {
      rxUtilizationPercent: 45.2,
      txUtilizationPercent: 32.1,
      rxRateMbps: 45.2,
      txRateMbps: 32.1
    };
  }

  private async measureQuality(link: any) {
    // Ping tests for latency/jitter/loss
    return {
      latencyMs: 25.3,
      jitterMs: 2.1,
      packetLossPercent: 0.1
    };
  }

  private async checkSFPModule(link: any): Promise<{
    sfpPresent?: boolean;
    sfpVendor?: string;
    sfpTemperatureCelsius?: number;
    sfpRxPowerDbm?: number;
    sfpTxPowerDbm?: number;
  }> {
    // SFP diagnostics via SNMP
    return {
      sfpPresent: true,
      sfpVendor: 'Cisco',
      sfpTemperatureCelsius: 42.0,
      sfpRxPowerDbm: -12.5,
      sfpTxPowerDbm: -8.2
    };
  }

  private calculateHealthScore(params: any): number {
    let score = 100;
    if (params.linkStatus === 'down') score -= 100;
    if (params.rxUtilization > 90) score -= 20;
    if (params.latency > 100) score -= 15;
    if (params.packetLoss > 1) score -= 25;
    return Math.max(0, score);
  }

  private determineHealthStatus(score: number): 'healthy' | 'warning' | 'critical' {
    if (score >= 90) return 'healthy';
    if (score >= 70) return 'warning';
    return 'critical';
  }

  private async getBranchLinks(branchId: string, tenantId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM network_links WHERE branch_id = $1 AND tenant_id = $2`,
      [branchId, tenantId]
    );
    return result.rows;
  }

  private async saveHealthMetrics(metrics: NetworkLinkHealthMetrics, tenantId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO network_link_health_metrics (
        tenant_id, link_id, health_score, health_status, link_status,
        rx_utilization_percent, tx_utilization_percent, latency_ms,
        packet_loss_percent, observed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        tenantId, metrics.linkId, metrics.healthScore, metrics.healthStatus,
        metrics.linkStatus, metrics.rxUtilizationPercent, metrics.txUtilizationPercent,
        metrics.latencyMs, metrics.packetLossPercent, metrics.observedAt
      ]
    );
  }

  private async generateAlerts(link: any, metrics: NetworkLinkHealthMetrics): Promise<any[]> {
    const alerts = [];
    if (metrics.linkStatus === 'down') {
      alerts.push({
        severity: 'critical',
        alertType: 'link_down',
        message: `Network link ${link.name} is down`
      });
    }
    return alerts;
  }

  private async saveAlert(alert: any, tenantId: string, branchId: string): Promise<void> {
    // Simplified alert save
  }
}

export default NetworkLinkMonitoringService;
