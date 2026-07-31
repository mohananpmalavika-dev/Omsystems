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
} from './snmp-collector.service';
import {
  NetworkSwitch,
  SwitchHealthMetrics,
  SwitchPortMetrics,
  HealthStatus
} from '../types/infrastructure.types';

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
