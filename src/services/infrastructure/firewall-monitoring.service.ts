/**
 * Firewall Monitoring Service
 * Monitors firewalls including health, sessions, threats, VPN tunnels, and HA status
 */

import { Pool } from 'pg';
import { 
  SNMPCollectorService, 
  SNMPTarget, 
  STANDARD_OIDS 
} from './snmp-collector.service.js';
import {
  Firewall,
  FirewallHealthMetrics,
  HealthStatus
} from '../../types/infrastructure.types.js';

export interface FirewallCollectionResult {
  success: boolean;
  firewallId: string;
  metricsCollected: boolean;
  vpnTunnelsChecked: number;
  threatsDetected: number;
  errors: string[];
}

/**
 * Vendor-specific firewall OIDs
 */
const FIREWALL_OIDS = {
  // Fortinet FortiGate
  fortigate: {
    cpuUsage: '1.3.6.1.4.1.12356.101.4.1.3.0',
    memoryUsage: '1.3.6.1.4.1.12356.101.4.1.4.0',
    sessionCount: '1.3.6.1.4.1.12356.101.4.1.8.0',
    virusDetected: '1.3.6.1.4.1.12356.101.8.2.1.1.2',
    ipsIntrusionsBlocked: '1.3.6.1.4.1.12356.101.8.2.1.1.4',
    vpnTunnelUpCount: '1.3.6.1.4.1.12356.101.12.2.2.1.20',
    haMode: '1.3.6.1.4.1.12356.101.13.1.1.0',
    haGroupId: '1.3.6.1.4.1.12356.101.13.1.7.0',
  },
  // Palo Alto
  paloalto: {
    cpuUsage: '1.3.6.1.4.1.25461.2.1.2.1.9.0',
    memoryUsage: '1.3.6.1.4.1.25461.2.1.2.1.6.0',
    sessionUtilization: '1.3.6.1.4.1.25461.2.1.2.3.1.0',
    sessionMax: '1.3.6.1.4.1.25461.2.1.2.3.2.0',
    sessionActive: '1.3.6.1.4.1.25461.2.1.2.3.3.0',
    vpnTunnelCount: '1.3.6.1.4.1.25461.2.1.2.5.1.1.0',
    haState: '1.3.6.1.4.1.25461.2.1.2.1.13.0',
  },
  // Cisco ASA
  ciscoASA: {
    cpuUsage: '1.3.6.1.4.1.9.9.109.1.1.1.1.5',
    memoryUsed: '1.3.6.1.4.1.9.9.48.1.1.1.5',
    memoryFree: '1.3.6.1.4.1.9.9.48.1.1.1.6',
    connectionCount: '1.3.6.1.4.1.9.9.147.1.2.2.2.1.5',
    vpnSessionCount: '1.3.6.1.4.1.9.9.392.1.3.1.0',
    haFailoverStatus: '1.3.6.1.4.1.9.9.147.1.2.1.1.1.3',
  },
  // pfSense/OPNsense
  pfsense: {
    cpuUsage: '1.3.6.1.4.1.2021.11.9.0',
    memoryUsed: '1.3.6.1.4.1.2021.4.6.0',
    memoryTotal: '1.3.6.1.4.1.2021.4.5.0',
    pfStateCount: '1.3.6.1.4.1.12325.1.200.1.3.1.0',
    pfStateLimit: '1.3.6.1.4.1.12325.1.200.1.3.2.0',
  }
};

export class FirewallMonitoringService {
  private snmp: SNMPCollectorService;

  constructor(private pool: Pool) {
    this.snmp = new SNMPCollectorService(pool);
  }

  /**
   * Collect metrics for all firewalls in a branch
   */
  async collectBranchFirewalls(
    tenantId: string, 
    branchId: string
  ): Promise<FirewallCollectionResult[]> {
    const firewalls = await this.getFirewalls(tenantId, branchId);
    
    const results: FirewallCollectionResult[] = [];
    
    for (const fw of firewalls) {
      try {
        const result = await this.collectFirewallMetrics(fw);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          firewallId: fw.id,
          metricsCollected: false,
          vpnTunnelsChecked: 0,
          threatsDetected: 0,
          errors: [error instanceof Error ? error.message : 'Unknown error']
        });
      }
    }
    
    return results;
  }

  /**
   * Collect comprehensive metrics for a single firewall
   */
  async collectFirewallMetrics(fw: Firewall): Promise<FirewallCollectionResult> {
    const errors: string[] = [];
    let metricsCollected = false;
    let vpnTunnelsChecked = 0;
    let threatsDetected = 0;

    try {
      const target = this.buildSNMPTarget(fw);

      // Collect firewall health metrics
      try {
        const metrics = await this.collectFirewallHealth(fw, target);
        metricsCollected = true;
        vpnTunnelsChecked = metrics.vpnTunnelsTotal || 0;
        threatsDetected = metrics.threatsBlockedLastHour || 0;
      } catch (error) {
        errors.push(`Health collection failed: ${error instanceof Error ? error.message : 'Unknown'}`);
      }

      // Update firewall status
      await this.updateFirewallStatus(fw.id, metricsCollected ? 'online' : 'degraded');

      return {
        success: metricsCollected,
        firewallId: fw.id,
        metricsCollected,
        vpnTunnelsChecked,
        threatsDetected,
        errors
      };
    } catch (error) {
      await this.updateFirewallStatus(fw.id, 'offline');
      
      return {
        success: false,
        firewallId: fw.id,
        metricsCollected: false,
        vpnTunnelsChecked: 0,
        threatsDetected: 0,
        errors: [error instanceof Error ? error.message : 'Critical failure']
      };
    }
  }

  /**
   * Collect firewall health metrics
   */
  private async collectFirewallHealth(
    fw: Firewall, 
    target: SNMPTarget
  ): Promise<FirewallHealthMetrics> {
    const observedAt = new Date();

    // Determine OIDs based on manufacturer
    const oids = this.selectFirewallOIDs(fw.manufacturer);

    // Collect metrics via SNMP
    const results = await this.snmp.snmpGet(target, oids.oidList);

    // Parse results based on vendor
    const metrics = this.parseFirewallMetrics(fw.manufacturer, results, oids.oidMap);

    // Get uptime
    const uptimeResult = await this.snmp.snmpGet(target, [STANDARD_OIDS.sysUpTime]);
    const uptimeSeconds = Math.floor(this.snmp.parseValue(uptimeResult[0]) / 100);

    // Calculate health score
    const healthScore = this.calculateFirewallHealthScore(metrics);
    const healthStatus = this.determineHealthStatus(healthScore);

    const healthMetrics: FirewallHealthMetrics = {
      id: '', // Will be generated by DB
      tenantId: fw.tenantId,
      firewallId: fw.id,
      observedAt,
      cpuUsagePercent: metrics.cpuUsage,
      memoryUsagePercent: metrics.memoryUsage,
      sessionCount: metrics.sessionCount,
      sessionUtilizationPercent: metrics.sessionUtilization,
      threatsBlockedTotal: metrics.threatsBlockedTotal,
      threatsBlockedLastHour: metrics.threatsBlockedLastHour,
      ipsStatus: metrics.ipsStatus,
      avStatus: metrics.avStatus,
      vpnTunnelsTotal: metrics.vpnTunnelsTotal,
      vpnTunnelsUp: metrics.vpnTunnelsUp,
      vpnTunnelsDown: metrics.vpnTunnelsDown,
      haSyncStatus: metrics.haSyncStatus,
      healthScore,
      healthStatus
    };

    // Store in database
    await this.storeFirewallHealth(healthMetrics);

    // Check and create alerts
    await this.checkAndCreateAlerts(fw, healthMetrics);

    return healthMetrics;
  }

  /**
   * Select appropriate OIDs based on firewall manufacturer
   */
  private selectFirewallOIDs(manufacturer?: string): {
    oidList: string[];
    oidMap: Record<string, string>;
  } {
    const vendor = manufacturer?.toLowerCase();

    if (vendor?.includes('fortinet') || vendor?.includes('fortigate')) {
      return {
        oidList: [
          FIREWALL_OIDS.fortigate.cpuUsage,
          FIREWALL_OIDS.fortigate.memoryUsage,
          FIREWALL_OIDS.fortigate.sessionCount,
          FIREWALL_OIDS.fortigate.vpnTunnelUpCount,
        ],
        oidMap: {
          cpuUsage: FIREWALL_OIDS.fortigate.cpuUsage,
          memoryUsage: FIREWALL_OIDS.fortigate.memoryUsage,
          sessionCount: FIREWALL_OIDS.fortigate.sessionCount,
          vpnTunnelUpCount: FIREWALL_OIDS.fortigate.vpnTunnelUpCount,
        }
      };
    } else if (vendor?.includes('palo alto') || vendor?.includes('pa-')) {
      return {
        oidList: [
          FIREWALL_OIDS.paloalto.cpuUsage,
          FIREWALL_OIDS.paloalto.memoryUsage,
          FIREWALL_OIDS.paloalto.sessionActive,
          FIREWALL_OIDS.paloalto.sessionMax,
          FIREWALL_OIDS.paloalto.vpnTunnelCount,
        ],
        oidMap: {
          cpuUsage: FIREWALL_OIDS.paloalto.cpuUsage,
          memoryUsage: FIREWALL_OIDS.paloalto.memoryUsage,
          sessionActive: FIREWALL_OIDS.paloalto.sessionActive,
          sessionMax: FIREWALL_OIDS.paloalto.sessionMax,
          vpnTunnelCount: FIREWALL_OIDS.paloalto.vpnTunnelCount,
        }
      };
    } else if (vendor?.includes('cisco') || vendor?.includes('asa')) {
      return {
        oidList: [
          FIREWALL_OIDS.ciscoASA.cpuUsage,
          FIREWALL_OIDS.ciscoASA.memoryUsed,
          FIREWALL_OIDS.ciscoASA.memoryFree,
          FIREWALL_OIDS.ciscoASA.connectionCount,
          FIREWALL_OIDS.ciscoASA.vpnSessionCount,
        ],
        oidMap: {
          cpuUsage: FIREWALL_OIDS.ciscoASA.cpuUsage,
          memoryUsed: FIREWALL_OIDS.ciscoASA.memoryUsed,
          memoryFree: FIREWALL_OIDS.ciscoASA.memoryFree,
          connectionCount: FIREWALL_OIDS.ciscoASA.connectionCount,
          vpnSessionCount: FIREWALL_OIDS.ciscoASA.vpnSessionCount,
        }
      };
    } else {
      // Default to standard HOST-RESOURCES-MIB
      return {
        oidList: [
          STANDARD_OIDS.hrProcessorLoad,
          STANDARD_OIDS.hrStorageUsed,
          STANDARD_OIDS.hrStorageSize,
        ],
        oidMap: {
          cpuUsage: STANDARD_OIDS.hrProcessorLoad,
          memoryUsed: STANDARD_OIDS.hrStorageUsed,
          memorySize: STANDARD_OIDS.hrStorageSize,
        }
      };
    }
  }

  /**
   * Parse SNMP results based on vendor
   */
  private parseFirewallMetrics(
    manufacturer: string | undefined,
    results: any[],
    oidMap: Record<string, string>
  ): {
    cpuUsage?: number;
    memoryUsage?: number;
    sessionCount?: number;
    sessionUtilization?: number;
    threatsBlockedTotal?: number;
    threatsBlockedLastHour?: number;
    ipsStatus?: 'enabled' | 'disabled' | 'bypassed';
    avStatus?: 'enabled' | 'disabled' | 'outdated';
    vpnTunnelsTotal?: number;
    vpnTunnelsUp?: number;
    vpnTunnelsDown?: number;
    haSyncStatus?: 'in_sync' | 'out_of_sync' | 'na';
  } {
    const vendor = manufacturer?.toLowerCase();
    const metrics: any = {};

    if (vendor?.includes('fortinet')) {
      metrics.cpuUsage = this.snmp.parseValue(results[0]);
      metrics.memoryUsage = this.snmp.parseValue(results[1]);
      metrics.sessionCount = this.snmp.parseValue(results[2]);
      metrics.vpnTunnelsUp = this.snmp.parseValue(results[3]);
      metrics.vpnTunnelsTotal = metrics.vpnTunnelsUp; // Simplified
      metrics.sessionUtilization = 0; // Would need session limit
    } else if (vendor?.includes('palo alto')) {
      metrics.cpuUsage = this.snmp.parseValue(results[0]);
      metrics.memoryUsage = this.snmp.parseValue(results[1]);
      metrics.sessionCount = this.snmp.parseValue(results[2]);
      const sessionMax = this.snmp.parseValue(results[3]);
      metrics.sessionUtilization = sessionMax > 0 
        ? (metrics.sessionCount / sessionMax) * 100 
        : 0;
      metrics.vpnTunnelsTotal = this.snmp.parseValue(results[4]);
      metrics.vpnTunnelsUp = metrics.vpnTunnelsTotal; // Simplified
    } else if (vendor?.includes('cisco')) {
      metrics.cpuUsage = this.snmp.parseValue(results[0]);
      const memUsed = this.snmp.parseValue(results[1]);
      const memFree = this.snmp.parseValue(results[2]);
      const memTotal = memUsed + memFree;
      metrics.memoryUsage = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;
      metrics.sessionCount = this.snmp.parseValue(results[3]);
      metrics.vpnTunnelsTotal = this.snmp.parseValue(results[4]);
    } else {
      // Standard MIB parsing
      metrics.cpuUsage = this.snmp.parseValue(results[0]);
      const memUsed = this.snmp.parseValue(results[1]);
      const memSize = this.snmp.parseValue(results[2]);
      metrics.memoryUsage = memSize > 0 ? (memUsed / memSize) * 100 : 0;
    }

    // Default values for unavailable metrics
    metrics.ipsStatus = metrics.ipsStatus || 'enabled';
    metrics.avStatus = metrics.avStatus || 'enabled';
    metrics.haSyncStatus = metrics.haSyncStatus || 'na';
    metrics.threatsBlockedTotal = metrics.threatsBlockedTotal || 0;
    metrics.threatsBlockedLastHour = metrics.threatsBlockedLastHour || 0;
    metrics.vpnTunnelsDown = (metrics.vpnTunnelsTotal || 0) - (metrics.vpnTunnelsUp || 0);

    return metrics;
  }

  /**
   * Calculate firewall health score (0-100)
   */
  private calculateFirewallHealthScore(metrics: {
    cpuUsage?: number;
    memoryUsage?: number;
    sessionUtilization?: number;
    vpnTunnelsTotal?: number;
    vpnTunnelsUp?: number;
    ipsStatus?: string;
    avStatus?: string;
    haSyncStatus?: string;
  }): number {
    let score = 100;

    // CPU usage impact (0-25 points)
    if (metrics.cpuUsage) {
      if (metrics.cpuUsage > 95) score -= 25;
      else if (metrics.cpuUsage > 90) score -= 20;
      else if (metrics.cpuUsage > 85) score -= 15;
      else if (metrics.cpuUsage > 80) score -= 10;
      else if (metrics.cpuUsage > 70) score -= 5;
    }

    // Memory usage impact (0-20 points)
    if (metrics.memoryUsage) {
      if (metrics.memoryUsage > 95) score -= 20;
      else if (metrics.memoryUsage > 90) score -= 15;
      else if (metrics.memoryUsage > 85) score -= 10;
      else if (metrics.memoryUsage > 80) score -= 5;
    }

    // Session utilization impact (0-20 points)
    if (metrics.sessionUtilization) {
      if (metrics.sessionUtilization > 95) score -= 20;
      else if (metrics.sessionUtilization > 90) score -= 15;
      else if (metrics.sessionUtilization > 85) score -= 10;
      else if (metrics.sessionUtilization > 80) score -= 5;
    }

    // VPN tunnel health (0-15 points)
    if (metrics.vpnTunnelsTotal && metrics.vpnTunnelsTotal > 0) {
      const vpnAvailability = ((metrics.vpnTunnelsUp || 0) / metrics.vpnTunnelsTotal) * 100;
      if (vpnAvailability < 50) score -= 15;
      else if (vpnAvailability < 70) score -= 10;
      else if (vpnAvailability < 90) score -= 5;
    }

    // Security services status (0-10 points)
    if (metrics.ipsStatus === 'disabled' || metrics.ipsStatus === 'bypassed') {
      score -= 5;
    }
    if (metrics.avStatus === 'disabled' || metrics.avStatus === 'outdated') {
      score -= 5;
    }

    // HA sync status (0-10 points)
    if (metrics.haSyncStatus === 'out_of_sync') {
      score -= 10;
    }

    return Math.max(0, Math.min(100, score));
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
   * Check metrics and create alerts if thresholds exceeded
   */
  private async checkAndCreateAlerts(
    fw: Firewall,
    metrics: FirewallHealthMetrics
  ): Promise<void> {
    const alerts: Array<{
      type: string;
      severity: 'critical' | 'warning';
      title: string;
      description: string;
      impact?: string;
      recommendedAction?: string;
      metrics: any;
    }> = [];

    // CPU alerts
    if (metrics.cpuUsagePercent) {
      if (metrics.cpuUsagePercent > 95) {
        alerts.push({
          type: 'firewall_cpu_critical',
          severity: 'critical',
          title: 'Firewall CPU Critical',
          description: `Firewall ${fw.name} CPU usage is at ${metrics.cpuUsagePercent.toFixed(1)}%`,
          impact: 'Traffic processing may be degraded, connections may be dropped',
          recommendedAction: 'Review firewall rules, check for DDoS attack, consider hardware upgrade',
          metrics: { cpuUsage: metrics.cpuUsagePercent }
        });
      } else if (metrics.cpuUsagePercent > 90) {
        alerts.push({
          type: 'firewall_cpu_warning',
          severity: 'warning',
          title: 'Firewall CPU High',
          description: `Firewall ${fw.name} CPU usage is at ${metrics.cpuUsagePercent.toFixed(1)}%`,
          impact: 'Performance degradation likely during traffic spikes',
          recommendedAction: 'Monitor traffic patterns, review resource-intensive rules',
          metrics: { cpuUsage: metrics.cpuUsagePercent }
        });
      }
    }

    // Memory alerts
    if (metrics.memoryUsagePercent) {
      if (metrics.memoryUsagePercent > 95) {
        alerts.push({
          type: 'firewall_memory_critical',
          severity: 'critical',
          title: 'Firewall Memory Critical',
          description: `Firewall ${fw.name} memory usage is at ${metrics.memoryUsagePercent.toFixed(1)}%`,
          impact: 'New connections may fail, system instability possible',
          recommendedAction: 'Clear sessions, restart services, or reboot firewall if needed',
          metrics: { memoryUsage: metrics.memoryUsagePercent }
        });
      } else if (metrics.memoryUsagePercent > 90) {
        alerts.push({
          type: 'firewall_memory_warning',
          severity: 'warning',
          title: 'Firewall Memory High',
          description: `Firewall ${fw.name} memory usage is at ${metrics.memoryUsagePercent.toFixed(1)}%`,
          impact: 'May affect performance under load',
          recommendedAction: 'Review session table, check for memory leaks',
          metrics: { memoryUsage: metrics.memoryUsagePercent }
        });
      }
    }

    // Session utilization alerts
    if (metrics.sessionUtilizationPercent) {
      if (metrics.sessionUtilizationPercent > 95) {
        alerts.push({
          type: 'firewall_sessions_critical',
          severity: 'critical',
          title: 'Firewall Session Table Critical',
          description: `Firewall ${fw.name} session utilization is at ${metrics.sessionUtilizationPercent.toFixed(1)}%`,
          impact: 'New connections will be rejected',
          recommendedAction: 'Increase session limit or investigate abnormal connection count',
          metrics: { 
            sessionUtilization: metrics.sessionUtilizationPercent,
            sessionCount: metrics.sessionCount 
          }
        });
      } else if (metrics.sessionUtilizationPercent > 90) {
        alerts.push({
          type: 'firewall_sessions_warning',
          severity: 'warning',
          title: 'Firewall Session Table High',
          description: `Firewall ${fw.name} session utilization is at ${metrics.sessionUtilizationPercent.toFixed(1)}%`,
          impact: 'Approaching session limit',
          recommendedAction: 'Monitor session growth, review timeout settings',
          metrics: { 
            sessionUtilization: metrics.sessionUtilizationPercent,
            sessionCount: metrics.sessionCount 
          }
        });
      }
    }

    // VPN tunnel alerts
    if (metrics.vpnTunnelsDown && metrics.vpnTunnelsDown > 0) {
      alerts.push({
        type: 'firewall_vpn_tunnels_down',
        severity: metrics.vpnTunnelsDown >= (metrics.vpnTunnelsTotal || 0) / 2 ? 'critical' : 'warning',
        title: 'VPN Tunnels Down',
        description: `${metrics.vpnTunnelsDown} of ${metrics.vpnTunnelsTotal} VPN tunnels are down on firewall ${fw.name}`,
        impact: 'Remote site connectivity affected',
        recommendedAction: 'Check VPN tunnel status, verify remote endpoints, review logs',
        metrics: { 
          vpnTunnelsDown: metrics.vpnTunnelsDown,
          vpnTunnelsTotal: metrics.vpnTunnelsTotal 
        }
      });
    }

    // Security service alerts
    if (metrics.ipsStatus === 'disabled' || metrics.ipsStatus === 'bypassed') {
      alerts.push({
        type: 'firewall_ips_disabled',
        severity: 'critical',
        title: 'Firewall IPS Disabled',
        description: `IPS is ${metrics.ipsStatus} on firewall ${fw.name}`,
        impact: 'Network is vulnerable to intrusion attacks',
        recommendedAction: 'Enable IPS immediately, review security policy',
        metrics: { ipsStatus: metrics.ipsStatus }
      });
    }

    if (metrics.avStatus === 'disabled' || metrics.avStatus === 'outdated') {
      alerts.push({
        type: 'firewall_av_issue',
        severity: 'warning',
        title: `Firewall Antivirus ${metrics.avStatus}`,
        description: `Antivirus is ${metrics.avStatus} on firewall ${fw.name}`,
        impact: 'Malware may pass through firewall undetected',
        recommendedAction: metrics.avStatus === 'outdated' 
          ? 'Update antivirus signatures' 
          : 'Enable antivirus protection',
        metrics: { avStatus: metrics.avStatus }
      });
    }

    // HA sync alert
    if (metrics.haSyncStatus === 'out_of_sync') {
      alerts.push({
        type: 'firewall_ha_out_of_sync',
        severity: 'warning',
        title: 'Firewall HA Out of Sync',
        description: `High availability pair is out of sync on firewall ${fw.name}`,
        impact: 'Failover may not work properly, configuration inconsistency',
        recommendedAction: 'Force configuration sync, verify HA heartbeat connectivity',
        metrics: { haSyncStatus: metrics.haSyncStatus }
      });
    }

    // High threat activity alert
    if (metrics.threatsBlockedLastHour && metrics.threatsBlockedLastHour > 100) {
      alerts.push({
        type: 'firewall_high_threat_activity',
        severity: metrics.threatsBlockedLastHour > 1000 ? 'critical' : 'warning',
        title: 'High Threat Activity Detected',
        description: `${metrics.threatsBlockedLastHour} threats blocked in the last hour on firewall ${fw.name}`,
        impact: 'Possible targeted attack or compromised device on network',
        recommendedAction: 'Review threat logs, identify source IPs, investigate affected devices',
        metrics: { 
          threatsBlockedLastHour: metrics.threatsBlockedLastHour,
          threatsBlockedTotal: metrics.threatsBlockedTotal 
        }
      });
    }

    // Store alerts
    for (const alert of alerts) {
      await this.createInfrastructureAlert({
        tenantId: fw.tenantId,
        branchId: fw.branchId,
        componentType: 'firewall',
        componentId: fw.id,
        componentName: fw.name,
        ...alert
      });
    }
  }

  /**
   * Build SNMP target from firewall configuration
   */
  private buildSNMPTarget(fw: Firewall): SNMPTarget {
    return {
      host: fw.ipAddress,
      port: 161,
      timeout: 5000,
      retries: 3,
      credentials: {
        version: '2c', // Default, would come from config
        community: 'public' // Would come from secure config
      }
    };
  }

  // =====================================================
  // DATABASE OPERATIONS
  // =====================================================

  /**
   * Get all firewalls for a branch
   */
  private async getFirewalls(tenantId: string, branchId: string): Promise<Firewall[]> {
    const query = `
      SELECT 
        id, tenant_id, branch_id, name, ip_address,
        manufacturer, model, serial_number, firmware_version,
        management_protocol, high_availability, ha_role,
        license_expiry_date, status
      FROM firewalls
      WHERE tenant_id = $1 AND branch_id = $2
      ORDER BY name
    `;

    const result = await this.pool.query(query, [tenantId, branchId]);
    
    return result.rows.map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      name: row.name,
      ipAddress: row.ip_address,
      manufacturer: row.manufacturer,
      model: row.model,
      serialNumber: row.serial_number,
      firmwareVersion: row.firmware_version,
      managementProtocol: row.management_protocol,
      highAvailability: row.high_availability,
      haRole: row.ha_role,
      licenseExpiryDate: row.license_expiry_date,
      status: row.status
    }));
  }

  /**
   * Store firewall health metrics
   */
  private async storeFirewallHealth(metrics: FirewallHealthMetrics): Promise<void> {
    const query = `
      INSERT INTO firewall_health_metrics (
        tenant_id, firewall_id, observed_at,
        cpu_usage_percent, memory_usage_percent,
        session_count, session_utilization_percent,
        threats_blocked_total, threats_blocked_last_hour,
        ips_status, av_status,
        vpn_tunnels_total, vpn_tunnels_up, vpn_tunnels_down,
        ha_sync_status, health_score, health_status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      )
    `;

    await this.pool.query(query, [
      metrics.tenantId,
      metrics.firewallId,
      metrics.observedAt,
      metrics.cpuUsagePercent,
      metrics.memoryUsagePercent,
      metrics.sessionCount,
      metrics.sessionUtilizationPercent,
      metrics.threatsBlockedTotal,
      metrics.threatsBlockedLastHour,
      metrics.ipsStatus,
      metrics.avStatus,
      metrics.vpnTunnelsTotal,
      metrics.vpnTunnelsUp,
      metrics.vpnTunnelsDown,
      metrics.haSyncStatus,
      metrics.healthScore,
      metrics.healthStatus
    ]);
  }

  /**
   * Update firewall status
   */
  private async updateFirewallStatus(firewallId: string, status: string): Promise<void> {
    const query = `
      UPDATE firewalls
      SET status = $2, updated_at = NOW()
      WHERE id = $1
    `;

    await this.pool.query(query, [firewallId, status]);
  }

  /**
   * Create infrastructure alert
   */
  private async createInfrastructureAlert(alert: {
    tenantId: string;
    branchId: string;
    type: string;
    severity: 'critical' | 'warning';
    componentType: string;
    componentId: string;
    componentName: string;
    title: string;
    description: string;
    impact?: string;
    recommendedAction?: string;
    metrics: any;
  }): Promise<void> {
    // Check if similar alert already exists and is active
    const checkQuery = `
      SELECT id FROM infrastructure_alerts
      WHERE tenant_id = $1 
        AND component_id = $2 
        AND alert_type = $3
        AND status = 'active'
    `;

    const existing = await this.pool.query(checkQuery, [
      alert.tenantId,
      alert.componentId,
      alert.type
    ]);

    if (existing.rows.length > 0) {
      // Alert already exists, don't create duplicate
      return;
    }

    const query = `
      INSERT INTO infrastructure_alerts (
        tenant_id, branch_id, alert_type, severity,
        component_type, component_id, component_name,
        title, description, impact, recommended_action,
        metrics, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active'
      )
    `;

    await this.pool.query(query, [
      alert.tenantId,
      alert.branchId,
      alert.type,
      alert.severity,
      alert.componentType,
      alert.componentId,
      alert.componentName,
      alert.title,
      alert.description,
      alert.impact,
      alert.recommendedAction,
      JSON.stringify(alert.metrics)
    ]);
  }

  /**
   * Check license expiry and create alert if needed
   */
  async checkLicenseExpiry(tenantId: string, branchId: string): Promise<void> {
    const query = `
      SELECT id, name, license_expiry_date
      FROM firewalls
      WHERE tenant_id = $1 
        AND branch_id = $2
        AND license_expiry_date IS NOT NULL
        AND license_expiry_date <= CURRENT_DATE + INTERVAL '30 days'
    `;

    const result = await this.pool.query(query, [tenantId, branchId]);

    for (const fw of result.rows) {
      const daysUntilExpiry = Math.floor(
        (new Date(fw.license_expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      await this.createInfrastructureAlert({
        tenantId,
        branchId,
        type: 'firewall_license_expiring',
        severity: daysUntilExpiry <= 7 ? 'critical' : 'warning',
        componentType: 'firewall',
        componentId: fw.id,
        componentName: fw.name,
        title: 'Firewall License Expiring',
        description: `Firewall ${fw.name} license expires in ${daysUntilExpiry} days`,
        impact: 'Firewall features may be disabled after license expiry',
        recommendedAction: 'Renew firewall license before expiry date',
        metrics: { 
          licenseExpiryDate: fw.license_expiry_date,
          daysUntilExpiry 
        }
      });
    }
  }
}
