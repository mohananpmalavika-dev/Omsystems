/**
 * Switch Monitoring Service
 * Monitors network switches including health, ports, PoE, and performance metrics
 */

import { Pool } from 'pg';
import { 
  SNMPCollectorService, 
  SNMPTarget, 
  STANDARD_OIDS,
  VENDOR_OIDS 
} from './snmp-collector.service.js';
import {
  NetworkSwitch,
  SwitchHealthMetrics,
  SwitchPortMetrics,
  HealthStatus
} from '../../types/infrastructure.types.js';

export interface SwitchCollectionResult {
  success: boolean;
  switchId: string;
  metricsCollected: boolean;
  portsCollected: number;
  errors: string[];
}

export class SwitchMonitoringService {
  private snmp: SNMPCollectorService;

  constructor(private pool: Pool) {
    this.snmp = new SNMPCollectorService(pool);
  }

  /**
   * Collect metrics for all switches in a branch
   */
  async collectBranchSwitches(
    tenantId: string, 
    branchId: string
  ): Promise<SwitchCollectionResult[]> {
    const switches = await this.getSwitches(tenantId, branchId);
    
    const results: SwitchCollectionResult[] = [];
    
    for (const sw of switches) {
      try {
        const result = await this.collectSwitchMetrics(sw);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          switchId: sw.id,
          metricsCollected: false,
          portsCollected: 0,
          errors: [error instanceof Error ? error.message : 'Unknown error']
        });
      }
    }
    
    return results;
  }

  /**
   * Collect comprehensive metrics for a single switch
   */
  async collectSwitchMetrics(sw: NetworkSwitch): Promise<SwitchCollectionResult> {
    const errors: string[] = [];
    let metricsCollected = false;
    let portsCollected = 0;

    try {
      const target = this.buildSNMPTarget(sw);

      // Collect switch health metrics
      try {
        await this.collectSwitchHealth(sw, target);
        metricsCollected = true;
      } catch (error) {
        errors.push(`Health collection failed: ${error instanceof Error ? error.message : 'Unknown'}`);
      }

      // Collect port-level metrics
      try {
        portsCollected = await this.collectPortMetrics(sw, target);
      } catch (error) {
        errors.push(`Port collection failed: ${error instanceof Error ? error.message : 'Unknown'}`);
      }

      // Update switch status
      await this.updateSwitchStatus(sw.id, metricsCollected ? 'online' : 'degraded');

      return {
        success: metricsCollected || portsCollected > 0,
        switchId: sw.id,
        metricsCollected,
        portsCollected,
        errors
      };
    } catch (error) {
      await this.updateSwitchStatus(sw.id, 'offline');
      
      return {
        success: false,
        switchId: sw.id,
        metricsCollected: false,
        portsCollected: 0,
        errors: [error instanceof Error ? error.message : 'Critical failure']
      };
    }
  }

  /**
   * Collect switch-level health metrics
   */
  private async collectSwitchHealth(
    sw: NetworkSwitch, 
    target: SNMPTarget
  ): Promise<void> {
    const observedAt = new Date();

    // Determine OIDs based on manufacturer
    const cpuOid = this.selectCPUOid(sw.manufacturer);
    const memoryOids = this.selectMemoryOids(sw.manufacturer);
    const tempOid = this.selectTemperatureOid(sw.manufacturer);

    // Collect basic metrics
    const oids = [
      STANDARD_OIDS.sysUpTime,
      cpuOid,
      ...memoryOids
    ];

    if (tempOid) {
      oids.push(tempOid);
    }

    const results = await this.snmp.snmpGet(target, oids);

    let idx = 0;
    const uptimeSeconds = Math.floor(this.snmp.parseValue(results[idx++]) / 100);
    const cpuUsage = this.snmp.parseValue(results[idx++]);
    
    let memoryUsage = 0;
    let memoryTotal = 0;
    let memoryUsed = 0;

    if (memoryOids.length === 2) {
      memoryUsed = this.snmp.parseValue(results[idx++]);
      memoryTotal = this.snmp.parseValue(results[idx++]);
      memoryUsage = memoryTotal > 0 ? (memoryUsed / memoryTotal) * 100 : 0;
    } else if (memoryOids.length === 1) {
      memoryUsage = this.snmp.parseValue(results[idx++]);
    }

    const temperature = tempOid ? this.snmp.parseValue(results[idx++]) : undefined;

    // Get port statistics
    const portStats = await this.getPortCounts(target);

    // Get PoE metrics if supported
    let poeMetrics;
    if (sw.poeEnabled) {
      poeMetrics = await this.getPoEMetrics(sw, target);
    }

    // Calculate health score
    const healthScore = this.calculateSwitchHealthScore({
      cpuUsage,
      memoryUsage,
      temperature,
      portsUp: portStats.portsUp,
      portsTotal: portStats.total,
      poeUtilization: poeMetrics?.utilizationPercent
    });

    const healthStatus = this.determineHealthStatus(healthScore);

    // Store metrics in database
    await this.storeSwitchHealth({
      tenantId: sw.tenantId,
      switchId: sw.id,
      observedAt,
      cpuUsagePercent: cpuUsage,
      memoryUsagePercent: memoryUsage,
      memoryTotalMb: memoryTotal / (1024 * 1024),
      memoryUsedMb: memoryUsed / (1024 * 1024),
      temperatureCelsius: temperature,
      uptimeSeconds,
      poePowerUsageWatts: poeMetrics?.powerUsageWatts,
      poePowerAvailableWatts: poeMetrics?.powerAvailableWatts,
      poeUtilizationPercent: poeMetrics?.utilizationPercent,
      totalPorts: portStats.total,
      portsUp: portStats.portsUp,
      portsDown: portStats.portsDown,
      healthScore,
      healthStatus
    });

    // Create alerts if needed
    await this.checkAndCreateAlerts(sw, {
      cpuUsage,
      memoryUsage,
      temperature,
      healthStatus,
      poeUtilization: poeMetrics?.utilizationPercent
    });
  }

  /**
   * Collect metrics for all ports on the switch
   */
  private async collectPortMetrics(
    sw: NetworkSwitch, 
    target: SNMPTarget
  ): Promise<number> {
    const observedAt = new Date();

    // Walk interface table
    const ifDescrResults = await this.snmp.snmpWalk(target, STANDARD_OIDS.ifDescr);
    const ifOperStatusResults = await this.snmp.snmpWalk(target, STANDARD_OIDS.ifOperStatus);
    const ifSpeedResults = await this.snmp.snmpWalk(target, STANDARD_OIDS.ifSpeed);

    // Get high-speed counters (64-bit) if available
    let ifInOctetsResults = await this.snmp.snmpWalk(target, STANDARD_OIDS.ifHCInOctets);
    let ifOutOctetsResults = await this.snmp.snmpWalk(target, STANDARD_OIDS.ifHCOutOctets);

    // Fallback to 32-bit counters if 64-bit not available
    if (ifInOctetsResults.length === 0) {
      ifInOctetsResults = await this.snmp.snmpWalk(target, STANDARD_OIDS.ifInOctets);
      ifOutOctetsResults = await this.snmp.snmpWalk(target, STANDARD_OIDS.ifOutOctets);
    }

    const ifInErrorsResults = await this.snmp.snmpWalk(target, STANDARD_OIDS.ifInErrors);
    const ifOutErrorsResults = await this.snmp.snmpWalk(target, STANDARD_OIDS.ifOutErrors);

    let portsCollected = 0;

    // Process each interface
    for (let i = 0; i < ifDescrResults.length; i++) {
      const portNumber = i + 1;
      const description = String(ifDescrResults[i] || '');

      // Skip non-physical interfaces (e.g., management, VLAN interfaces)
      if (this.shouldSkipInterface(description)) {
        continue;
      }

      const operStatus = this.parseOperStatus(this.snmp.parseValue(ifOperStatusResults[i]));
      const speedBps = this.snmp.parseValue(ifSpeedResults[i]);
      const speedMbps = speedBps / 1000000;

      const rxBytes = ifInOctetsResults[i] ? this.snmp.parseValue(ifInOctetsResults[i]) : 0;
      const txBytes = ifOutOctetsResults[i] ? this.snmp.parseValue(ifOutOctetsResults[i]) : 0;
      const rxErrors = ifInErrorsResults[i] ? this.snmp.parseValue(ifInErrorsResults[i]) : 0;
      const txErrors = ifOutErrorsResults[i] ? this.snmp.parseValue(ifOutErrorsResults[i]) : 0;

      await this.storePortMetrics({
        tenantId: sw.tenantId,
        switchId: sw.id,
        portNumber,
        portName: description,
        observedAt,
        operStatus,
        speedMbps,
        rxBytes,
        txBytes,
        rxErrors,
        txErrors,
        poeEnabled: false, // Will be updated by PoE collection
        poeDeviceDetected: false
      });

      portsCollected++;
    }

    // Collect PoE port metrics if switch supports PoE
    if (sw.poeEnabled) {
      await this.collectPoEPortMetrics(sw, target, observedAt);
    }

    return portsCollected;
  }

  /**
   * Get PoE metrics for the switch
   */
  private async getPoEMetrics(
    sw: NetworkSwitch,
    target: SNMPTarget
  ): Promise<{
    powerUsageWatts: number;
    powerAvailableWatts: number;
    utilizationPercent: number;
  } | undefined> {
    try {
      // Standard PoE MIB OIDs (IEEE 802.3af/at)
      const poePortPowerOid = '1.3.6.1.2.1.105.1.1.1.1.4'; // pethPsePortPower
      
      const portPowerResults = await this.snmp.snmpWalk(target, poePortPowerOid);
      
      let totalPowerUsage = 0;
      portPowerResults.forEach(result => {
        totalPowerUsage += this.snmp.parseValue(result);
      });

      const powerAvailableWatts = sw.poeBudgetWatts || 0;
      const utilizationPercent = powerAvailableWatts > 0 
        ? (totalPowerUsage / powerAvailableWatts) * 100 
        : 0;

      return {
        powerUsageWatts: totalPowerUsage,
        powerAvailableWatts,
        utilizationPercent
      };
    } catch (error) {
      console.warn(`PoE metrics collection failed for switch ${sw.id}:`, error);
      return undefined;
    }
  }

  /**
   * Collect PoE metrics for individual ports
   */
  private async collectPoEPortMetrics(
    sw: NetworkSwitch,
    target: SNMPTarget,
    observedAt: Date
  ): Promise<void> {
    try {
      // IEEE 802.3af/at PoE MIB OIDs
      const poePortStatusOid = '1.3.6.1.2.1.105.1.1.1.1.3'; // pethPsePortDetectionStatus
      const poePortPowerOid = '1.3.6.1.2.1.105.1.1.1.1.4'; // pethPsePortPower

      const statusResults = await this.snmp.snmpWalk(target, poePortStatusOid);
      const powerResults = await this.snmp.snmpWalk(target, poePortPowerOid);

      for (let i = 0; i < statusResults.length; i++) {
        const portNumber = i + 1;
        const detectionStatus = this.snmp.parseValue(statusResults[i]);
        const powerWatts = powerResults[i] ? this.snmp.parseValue(powerResults[i]) : 0;

        // Detection status: 1=disabled, 2=searching, 3=delivering, 4=fault, 5=test, 6=other
        const poeDeviceDetected = detectionStatus === 3; // delivering power

        // Update port metrics with PoE info
        await this.updatePortPoEMetrics(sw.id, portNumber, {
          poeEnabled: true,
          poePowerWatts: powerWatts,
          poeDeviceDetected
        });
      }
    } catch (error) {
      console.warn(`PoE port metrics collection failed for switch ${sw.id}:`, error);
    }
  }

  /**
   * Get port up/down counts
   */
  private async getPortCounts(target: SNMPTarget): Promise<{
    total: number;
    portsUp: number;
    portsDown: number;
  }> {
    const ifOperStatusResults = await this.snmp.snmpWalk(target, STANDARD_OIDS.ifOperStatus);
    
    let portsUp = 0;
    let portsDown = 0;

    ifOperStatusResults.forEach(result => {
      const status = this.snmp.parseValue(result);
      // 1 = up, 2 = down, 3 = testing
      if (status === 1) {
        portsUp++;
      } else if (status === 2) {
        portsDown++;
      }
    });

    return {
      total: ifOperStatusResults.length,
      portsUp,
      portsDown
    };
  }

  /**
   * Calculate switch health score (0-100)
   */
  private calculateSwitchHealthScore(metrics: {
    cpuUsage: number;
    memoryUsage: number;
    temperature?: number;
    portsUp: number;
    portsTotal: number;
    poeUtilization?: number;
  }): number {
    let score = 100;

    // CPU usage impact (0-30 points)
    if (metrics.cpuUsage > 90) score -= 30;
    else if (metrics.cpuUsage > 80) score -= 20;
    else if (metrics.cpuUsage > 70) score -= 10;
    else if (metrics.cpuUsage > 60) score -= 5;

    // Memory usage impact (0-20 points)
    if (metrics.memoryUsage > 95) score -= 20;
    else if (metrics.memoryUsage > 90) score -= 15;
    else if (metrics.memoryUsage > 85) score -= 10;
    else if (metrics.memoryUsage > 80) score -= 5;

    // Temperature impact (0-20 points)
    if (metrics.temperature) {
      if (metrics.temperature > 75) score -= 20;
      else if (metrics.temperature > 70) score -= 15;
      else if (metrics.temperature > 65) score -= 10;
      else if (metrics.temperature > 60) score -= 5;
    }

    // Port availability impact (0-20 points)
    const portAvailability = metrics.portsTotal > 0 
      ? (metrics.portsUp / metrics.portsTotal) * 100 
      : 100;
    
    if (portAvailability < 50) score -= 20;
    else if (portAvailability < 70) score -= 15;
    else if (portAvailability < 85) score -= 10;
    else if (portAvailability < 95) score -= 5;

    // PoE utilization impact (0-10 points)
    if (metrics.poeUtilization) {
      if (metrics.poeUtilization > 95) score -= 10;
      else if (metrics.poeUtilization > 90) score -= 7;
      else if (metrics.poeUtilization > 85) score -= 5;
      else if (metrics.poeUtilization > 80) score -= 3;
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
    sw: NetworkSwitch,
    metrics: {
      cpuUsage: number;
      memoryUsage: number;
      temperature?: number;
      healthStatus: HealthStatus;
      poeUtilization?: number;
    }
  ): Promise<void> {
    const alerts: Array<{
      type: string;
      severity: 'critical' | 'warning';
      title: string;
      description: string;
      metrics: any;
    }> = [];

    // CPU alerts
    if (metrics.cpuUsage > 90) {
      alerts.push({
        type: 'switch_cpu_critical',
        severity: 'critical',
        title: 'Switch CPU Critical',
        description: `Switch ${sw.name} CPU usage is at ${metrics.cpuUsage.toFixed(1)}%`,
        metrics: { cpuUsage: metrics.cpuUsage }
      });
    } else if (metrics.cpuUsage > 80) {
      alerts.push({
        type: 'switch_cpu_warning',
        severity: 'warning',
        title: 'Switch CPU High',
        description: `Switch ${sw.name} CPU usage is at ${metrics.cpuUsage.toFixed(1)}%`,
        metrics: { cpuUsage: metrics.cpuUsage }
      });
    }

    // Memory alerts
    if (metrics.memoryUsage > 95) {
      alerts.push({
        type: 'switch_memory_critical',
        severity: 'critical',
        title: 'Switch Memory Critical',
        description: `Switch ${sw.name} memory usage is at ${metrics.memoryUsage.toFixed(1)}%`,
        metrics: { memoryUsage: metrics.memoryUsage }
      });
    } else if (metrics.memoryUsage > 90) {
      alerts.push({
        type: 'switch_memory_warning',
        severity: 'warning',
        title: 'Switch Memory High',
        description: `Switch ${sw.name} memory usage is at ${metrics.memoryUsage.toFixed(1)}%`,
        metrics: { memoryUsage: metrics.memoryUsage }
      });
    }

    // Temperature alerts
    if (metrics.temperature) {
      if (metrics.temperature > 75) {
        alerts.push({
          type: 'switch_temperature_critical',
          severity: 'critical',
          title: 'Switch Temperature Critical',
          description: `Switch ${sw.name} temperature is at ${metrics.temperature.toFixed(1)}°C`,
          metrics: { temperature: metrics.temperature }
        });
      } else if (metrics.temperature > 70) {
        alerts.push({
          type: 'switch_temperature_warning',
          severity: 'warning',
          title: 'Switch Temperature High',
          description: `Switch ${sw.name} temperature is at ${metrics.temperature.toFixed(1)}°C`,
          metrics: { temperature: metrics.temperature }
        });
      }
    }

    // PoE alerts
    if (metrics.poeUtilization) {
      if (metrics.poeUtilization > 95) {
        alerts.push({
          type: 'switch_poe_critical',
          severity: 'critical',
          title: 'Switch PoE Budget Critical',
          description: `Switch ${sw.name} PoE utilization is at ${metrics.poeUtilization.toFixed(1)}%`,
          metrics: { poeUtilization: metrics.poeUtilization }
        });
      } else if (metrics.poeUtilization > 90) {
        alerts.push({
          type: 'switch_poe_warning',
          severity: 'warning',
          title: 'Switch PoE Budget High',
          description: `Switch ${sw.name} PoE utilization is at ${metrics.poeUtilization.toFixed(1)}%`,
          metrics: { poeUtilization: metrics.poeUtilization }
        });
      }
    }

    // Store alerts
    for (const alert of alerts) {
      await this.createInfrastructureAlert({
        tenantId: sw.tenantId,
        branchId: sw.branchId,
        componentType: 'switch',
        componentId: sw.id,
        componentName: sw.name,
        ...alert
      });
    }
  }

  /**
   * Select CPU OID based on manufacturer
   */
  private selectCPUOid(manufacturer?: string): string {
    const vendor = manufacturer?.toLowerCase();
    
    if (vendor?.includes('cisco')) {
      return VENDOR_OIDS.cisco.cpuUsage;
    } else if (vendor?.includes('hp') || vendor?.includes('aruba')) {
      return VENDOR_OIDS.hp.cpuUtilization;
    } else if (vendor?.includes('dell')) {
      return VENDOR_OIDS.dell.cpuUsage;
    }
    
    // Default to HOST-RESOURCES-MIB
    return STANDARD_OIDS.hrProcessorLoad;
  }

  /**
   * Select memory OIDs based on manufacturer
   */
  private selectMemoryOids(manufacturer?: string): string[] {
    const vendor = manufacturer?.toLowerCase();
    
    if (vendor?.includes('cisco')) {
      return [VENDOR_OIDS.cisco.memoryPoolUsed, VENDOR_OIDS.cisco.memoryPoolFree];
    } else if (vendor?.includes('hp') || vendor?.includes('aruba')) {
      return [VENDOR_OIDS.hp.memoryTotal, VENDOR_OIDS.hp.memoryFree];
    } else if (vendor?.includes('dell')) {
      return [VENDOR_OIDS.dell.memoryUsage];
    }
    
    // Default to HOST-RESOURCES-MIB
    return [STANDARD_OIDS.hrStorageUsed, STANDARD_OIDS.hrStorageSize];
  }

  /**
   * Select temperature OID based on manufacturer
   */
  private selectTemperatureOid(manufacturer?: string): string | undefined {
    const vendor = manufacturer?.toLowerCase();
    
    if (vendor?.includes('cisco')) {
      return VENDOR_OIDS.cisco.temperature;
    } else if (vendor?.includes('hp') || vendor?.includes('aruba')) {
      return VENDOR_OIDS.hp.temperature;
    } else if (vendor?.includes('dell')) {
      return VENDOR_OIDS.dell.temperature;
    }
    
    // Try standard sensor MIB
    return STANDARD_OIDS.entPhySensorValue;
  }

  /**
   * Parse SNMP interface operational status
   */
  private parseOperStatus(value: number): 'up' | 'down' | 'testing' | 'unknown' | 'dormant' | 'notPresent' | 'lowerLayerDown' {
    const statusMap: Record<number, 'up' | 'down' | 'testing' | 'unknown' | 'dormant' | 'notPresent' | 'lowerLayerDown'> = {
      1: 'up',
      2: 'down',
      3: 'testing',
      4: 'unknown',
      5: 'dormant',
      6: 'notPresent',
      7: 'lowerLayerDown'
    };
    return statusMap[value] || 'unknown';
  }

  /**
   * Determine if interface should be skipped
   */
  private shouldSkipInterface(description: string): boolean {
    const skipPatterns = [
      /vlan/i,
      /loopback/i,
      /null/i,
      /management/i,
      /mgmt/i,
      /cpu/i
    ];
    
    return skipPatterns.some(pattern => pattern.test(description));
  }

  /**
   * Build SNMP target from switch configuration
   */
  private buildSNMPTarget(sw: NetworkSwitch): SNMPTarget {
    return {
      host: sw.ipAddress,
      port: 161,
      timeout: 5000,
      community: sw.snmpCommunity,
      version: sw.snmpVersion || '2c'
    };
  }

  // =====================================================
  // DATABASE OPERATIONS
  // =====================================================

  /**
   * Get all switches for a branch
   */
  private async getSwitches(tenantId: string, branchId: string): Promise<NetworkSwitch[]> {
    const query = `
      SELECT 
        id, tenant_id, branch_id, name, ip_address, mac_address,
        manufacturer, model, serial_number, firmware_version,
        management_protocol, snmp_community, snmp_version,
        port_count, poe_enabled, poe_budget_watts,
        stack_member, stack_priority, status, location, notes
      FROM network_switches
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
      macAddress: row.mac_address,
      manufacturer: row.manufacturer,
      model: row.model,
      serialNumber: row.serial_number,
      firmwareVersion: row.firmware_version,
      managementProtocol: row.management_protocol,
      snmpCommunity: row.snmp_community,
      snmpVersion: row.snmp_version,
      portCount: row.port_count,
      poeEnabled: row.poe_enabled,
      poeBudgetWatts: row.poe_budget_watts,
      stackMember: row.stack_member,
      stackPriority: row.stack_priority,
      status: row.status,
      location: row.location,
      notes: row.notes
    }));
  }

  /**
   * Store switch health metrics
   */
  private async storeSwitchHealth(metrics: Partial<SwitchHealthMetrics>): Promise<void> {
    const query = `
      INSERT INTO switch_health_metrics (
        tenant_id, switch_id, observed_at,
        cpu_usage_percent, memory_usage_percent,
        memory_total_mb, memory_used_mb,
        temperature_celsius, uptime_seconds,
        poe_power_usage_watts, poe_power_available_watts, poe_utilization_percent,
        total_ports, ports_up, ports_down,
        health_score, health_status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      )
    `;

    await this.pool.query(query, [
      metrics.tenantId,
      metrics.switchId,
      metrics.observedAt,
      metrics.cpuUsagePercent,
      metrics.memoryUsagePercent,
      metrics.memoryTotalMb,
      metrics.memoryUsedMb,
      metrics.temperatureCelsius,
      metrics.uptimeSeconds,
      metrics.poePowerUsageWatts,
      metrics.poePowerAvailableWatts,
      metrics.poeUtilizationPercent,
      metrics.totalPorts,
      metrics.portsUp,
      metrics.portsDown,
      metrics.healthScore,
      metrics.healthStatus
    ]);
  }

  /**
   * Store port metrics
   */
  private async storePortMetrics(metrics: Partial<SwitchPortMetrics>): Promise<void> {
    const query = `
      INSERT INTO switch_port_metrics (
        tenant_id, switch_id, port_number, port_name, observed_at,
        oper_status, speed_mbps, poe_enabled, poe_device_detected,
        rx_bytes, tx_bytes, rx_errors, tx_errors
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      )
      ON CONFLICT (switch_id, port_number, observed_at) 
      DO UPDATE SET
        oper_status = EXCLUDED.oper_status,
        speed_mbps = EXCLUDED.speed_mbps,
        rx_bytes = EXCLUDED.rx_bytes,
        tx_bytes = EXCLUDED.tx_bytes,
        rx_errors = EXCLUDED.rx_errors,
        tx_errors = EXCLUDED.tx_errors
    `;

    await this.pool.query(query, [
      metrics.tenantId,
      metrics.switchId,
      metrics.portNumber,
      metrics.portName,
      metrics.observedAt,
      metrics.operStatus,
      metrics.speedMbps,
      metrics.poeEnabled,
      metrics.poeDeviceDetected,
      metrics.rxBytes,
      metrics.txBytes,
      metrics.rxErrors,
      metrics.txErrors
    ]);
  }

  /**
   * Update port PoE metrics
   */
  private async updatePortPoEMetrics(
    switchId: string,
    portNumber: number,
    poeData: {
      poeEnabled: boolean;
      poePowerWatts: number;
      poeDeviceDetected: boolean;
    }
  ): Promise<void> {
    const query = `
      UPDATE switch_port_metrics
      SET 
        poe_enabled = $3,
        poe_power_watts = $4,
        poe_device_detected = $5
      WHERE switch_id = $1 
        AND port_number = $2
        AND observed_at = (
          SELECT MAX(observed_at) 
          FROM switch_port_metrics 
          WHERE switch_id = $1 AND port_number = $2
        )
    `;

    await this.pool.query(query, [
      switchId,
      portNumber,
      poeData.poeEnabled,
      poeData.poePowerWatts,
      poeData.poeDeviceDetected
    ]);
  }

  /**
   * Update switch status
   */
  private async updateSwitchStatus(switchId: string, status: string): Promise<void> {
    const query = `
      UPDATE network_switches
      SET status = $2, updated_at = NOW()
      WHERE id = $1
    `;

    await this.pool.query(query, [switchId, status]);
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
        title, description, metrics, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active'
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
      JSON.stringify(alert.metrics)
    ]);
  }
}
