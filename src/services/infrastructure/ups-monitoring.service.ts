/**
 * UPS Monitoring Service
 * Monitors UPS devices including battery health, runtime, power quality, and predictive replacement
 */

import { Pool } from 'pg';
import { 
  SNMPCollectorService, 
  SNMPTarget, 
  VENDOR_OIDS 
} from './snmp-collector.service';
import {
  UPSDevice,
  UPSHealthMetrics,
  HealthStatus
} from '../types/infrastructure.types';

export interface UPSCollectionResult {
  success: boolean;
  upsId: string;
  metricsCollected: boolean;
  onBattery: boolean;
  batteryHealthPercent?: number;
  runtimeMinutes?: number;
  errors: string[];
}

/**
 * Extended UPS OIDs for different vendors
 */
const UPS_OIDS = {
  // APC UPS (PowerNet-MIB) - already defined in VENDOR_OIDS
  apc: VENDOR_OIDS.apc,
  
  // Eaton/MGE UPS
  eaton: {
    upsIdentModel: '1.3.6.1.4.1.534.1.1.2.0',
    upsIdentFirmware: '1.3.6.1.4.1.534.1.1.3.0',
    upsBatteryStatus: '1.3.6.1.4.1.534.1.2.1.0',
    upsBatteryCapacity: '1.3.6.1.4.1.534.1.2.4.0',
    upsBatteryVoltage: '1.3.6.1.4.1.534.1.2.2.0',
    upsBatteryTemperature: '1.3.6.1.4.1.534.1.2.5.0',
    upsEstimatedRuntime: '1.3.6.1.4.1.534.1.2.1.0',
    upsInputVoltage: '1.3.6.1.4.1.534.1.3.1.0',
    upsInputFrequency: '1.3.6.1.4.1.534.1.3.2.0',
    upsOutputVoltage: '1.3.6.1.4.1.534.1.4.1.0',
    upsOutputFrequency: '1.3.6.1.4.1.534.1.4.2.0',
    upsOutputLoad: '1.3.6.1.4.1.534.1.4.4.0',
  },
  
  // CyberPower UPS
  cyberpower: {
    upsIdentManufacturer: '1.3.6.1.4.1.3808.1.1.1.1.1.1.0',
    upsIdentModel: '1.3.6.1.4.1.3808.1.1.1.1.1.2.0',
    upsBatteryStatus: '1.3.6.1.4.1.3808.1.1.1.2.1.1.0',
    upsSecondsOnBattery: '1.3.6.1.4.1.3808.1.1.1.2.1.2.0',
    upsBatteryEstimatedMinutes: '1.3.6.1.4.1.3808.1.1.1.2.1.3.0',
    upsBatteryVoltage: '1.3.6.1.4.1.3808.1.1.1.2.2.1.0',
    upsBatteryCapacity: '1.3.6.1.4.1.3808.1.1.1.2.2.4.0',
    upsInputVoltage: '1.3.6.1.4.1.3808.1.1.1.3.2.1.0',
    upsOutputVoltage: '1.3.6.1.4.1.3808.1.1.1.4.2.1.0',
    upsOutputLoad: '1.3.6.1.4.1.3808.1.1.1.4.2.3.0',
  },
  
  // Standard UPS MIB (RFC 1628)
  standard: {
    upsBatteryStatus: '1.3.6.1.2.1.33.1.2.1.0',
    upsSecondsOnBattery: '1.3.6.1.2.1.33.1.2.2.0',
    upsEstimatedMinutesRemaining: '1.3.6.1.2.1.33.1.2.3.0',
    upsEstimatedChargeRemaining: '1.3.6.1.2.1.33.1.2.4.0',
    upsBatteryVoltage: '1.3.6.1.2.1.33.1.2.5.0',
    upsBatteryCurrent: '1.3.6.1.2.1.33.1.2.6.0',
    upsBatteryTemperature: '1.3.6.1.2.1.33.1.2.7.0',
    upsInputLineBads: '1.3.6.1.2.1.33.1.3.1.0',
    upsInputVoltage: '1.3.6.1.2.1.33.1.3.3.1.3',
    upsInputFrequency: '1.3.6.1.2.1.33.1.3.3.1.2',
    upsOutputSource: '1.3.6.1.2.1.33.1.4.1.0',
    upsOutputVoltage: '1.3.6.1.2.1.33.1.4.4.1.2',
    upsOutputCurrent: '1.3.6.1.2.1.33.1.4.4.1.3',
    upsOutputPower: '1.3.6.1.2.1.33.1.4.4.1.4',
    upsOutputPercentLoad: '1.3.6.1.2.1.33.1.4.4.1.5',
  }
};

export class UPSMonitoringService {
  private snmp: SNMPCollectorService;

  constructor(private pool: Pool) {
    this.snmp = new SNMPCollectorService(pool);
  }

  /**
   * Collect metrics for all UPS devices in a branch
   */
  async collectBranchUPS(
    tenantId: string, 
    branchId: string
  ): Promise<UPSCollectionResult[]> {
    const upsDevices = await this.getUPSDevices(tenantId, branchId);
    
    const results: UPSCollectionResult[] = [];
    
    for (const ups of upsDevices) {
      try {
        const result = await this.collectUPSMetrics(ups);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          upsId: ups.id,
          metricsCollected: false,
          onBattery: false,
          errors: [error instanceof Error ? error.message : 'Unknown error']
        });
      }
    }
    
    return results;
  }

  /**
   * Collect comprehensive metrics for a single UPS
   */
  async collectUPSMetrics(ups: UPSDevice): Promise<UPSCollectionResult> {
    const errors: string[] = [];
    let metricsCollected = false;

    try {
      const target = this.buildSNMPTarget(ups);

      // Collect UPS health metrics
      let metrics: UPSHealthMetrics | undefined;
      try {
        metrics = await this.collectUPSHealth(ups, target);
        metricsCollected = true;
      } catch (error) {
        errors.push(`Health collection failed: ${error instanceof Error ? error.message : 'Unknown'}`);
      }

      // Update UPS status
      const status = metrics?.runningOnBattery ? 'on_battery' : 
                    metricsCollected ? 'online' : 'offline';
      await this.updateUPSStatus(ups.id, status);

      return {
        success: metricsCollected,
        upsId: ups.id,
        metricsCollected,
        onBattery: metrics?.runningOnBattery || false,
        batteryHealthPercent: metrics?.batteryHealthPercent,
        runtimeMinutes: metrics?.estimatedRuntimeMinutes,
        errors
      };
    } catch (error) {
      await this.updateUPSStatus(ups.id, 'offline');
      
      return {
        success: false,
        upsId: ups.id,
        metricsCollected: false,
        onBattery: false,
        errors: [error instanceof Error ? error.message : 'Critical failure']
      };
    }
  }

  /**
   * Collect UPS health metrics
   */
  private async collectUPSHealth(
    ups: UPSDevice, 
    target: SNMPTarget
  ): Promise<UPSHealthMetrics> {
    const observedAt = new Date();

    // Determine OIDs based on manufacturer
    const oids = this.selectUPSOIDs(ups.manufacturer);

    // Collect metrics via SNMP
    const results = await this.snmp.snmpGet(target, oids.oidList);

    // Parse results based on vendor
    const metrics = this.parseUPSMetrics(ups.manufacturer, results, oids.oidMap);

    // Calculate battery age
    const batteryAgeDays = ups.batteryInstallationDate 
      ? Math.floor((Date.now() - ups.batteryInstallationDate.getTime()) / (1000 * 60 * 60 * 24))
      : undefined;

    // Predict battery replacement date
    const predictedReplacementDays = this.predictBatteryReplacement(
      metrics.batteryHealthPercent,
      batteryAgeDays,
      metrics.lastSelfTestResult
    );

    // Calculate health score
    const healthScore = this.calculateUPSHealthScore({
      batteryHealthPercent: metrics.batteryHealthPercent,
      runningOnBattery: metrics.runningOnBattery,
      loadPercent: metrics.loadPercent,
      inputVoltage: metrics.inputVoltage,
      temperature: metrics.batteryTemperature,
      lastSelfTestResult: metrics.lastSelfTestResult,
      batteryAgeDays
    });

    const healthStatus = this.determineHealthStatus(healthScore);

    const healthMetrics: UPSHealthMetrics = {
      id: '',
      tenantId: ups.tenantId,
      upsId: ups.id,
      observedAt,
      batteryHealthPercent: metrics.batteryHealthPercent,
      batteryVoltage: metrics.batteryVoltage,
      batteryCurrent: metrics.batteryCurrent,
      batteryTemperatureCelsius: metrics.batteryTemperature,
      batteryAgeDays,
      estimatedRuntimeMinutes: metrics.estimatedRuntimeMinutes,
      estimatedChargeTimeMinutes: metrics.estimatedChargeTimeMinutes,
      utilityPowerAvailable: !metrics.runningOnBattery,
      runningOnBattery: metrics.runningOnBattery,
      inputVoltage: metrics.inputVoltage,
      inputFrequency: metrics.inputFrequency,
      outputVoltage: metrics.outputVoltage,
      outputFrequency: metrics.outputFrequency,
      outputCurrent: metrics.outputCurrent,
      loadPercent: metrics.loadPercent,
      loadWatts: metrics.loadWatts,
      lastSelfTestDate: metrics.lastSelfTestDate,
      lastSelfTestResult: metrics.lastSelfTestResult,
      lastPowerEventType: metrics.lastPowerEventType,
      lastPowerEventTime: metrics.lastPowerEventTime,
      batteryReplacementIndicator: metrics.batteryReplacementIndicator || 
        (predictedReplacementDays !== undefined && predictedReplacementDays < 30),
      predictedReplacementDays,
      alarmStatus: metrics.alarmStatus,
      healthScore,
      healthStatus
    };

    // Store in database
    await this.storeUPSHealth(healthMetrics);

    // Check and create alerts
    await this.checkAndCreateAlerts(ups, healthMetrics);

    return healthMetrics;
  }
