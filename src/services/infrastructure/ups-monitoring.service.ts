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

  /**
   * Select appropriate OIDs based on UPS manufacturer
   */
  private selectUPSOIDs(manufacturer?: string): {
    oidList: string[];
    oidMap: Record<string, string>;
  } {
    const vendor = manufacturer?.toLowerCase();

    if (vendor?.includes('apc')) {
      return {
        oidList: [
          UPS_OIDS.apc.upsBasicBatteryStatus,
          UPS_OIDS.apc.upsAdvBatteryCapacity,
          UPS_OIDS.apc.upsAdvBatteryTemperature,
          UPS_OIDS.apc.upsAdvBatteryRunTimeRemaining,
          UPS_OIDS.apc.upsAdvInputVoltage,
          UPS_OIDS.apc.upsAdvInputFrequency,
          UPS_OIDS.apc.upsAdvOutputVoltage,
          UPS_OIDS.apc.upsAdvOutputFrequency,
          UPS_OIDS.apc.upsAdvOutputLoad,
          UPS_OIDS.apc.upsAdvOutputCurrent,
        ],
        oidMap: {
          batteryStatus: UPS_OIDS.apc.upsBasicBatteryStatus,
          batteryCapacity: UPS_OIDS.apc.upsAdvBatteryCapacity,
          batteryTemperature: UPS_OIDS.apc.upsAdvBatteryTemperature,
          runtime: UPS_OIDS.apc.upsAdvBatteryRunTimeRemaining,
          inputVoltage: UPS_OIDS.apc.upsAdvInputVoltage,
          inputFrequency: UPS_OIDS.apc.upsAdvInputFrequency,
          outputVoltage: UPS_OIDS.apc.upsAdvOutputVoltage,
          outputFrequency: UPS_OIDS.apc.upsAdvOutputFrequency,
          outputLoad: UPS_OIDS.apc.upsAdvOutputLoad,
          outputCurrent: UPS_OIDS.apc.upsAdvOutputCurrent,
        }
      };
    } else if (vendor?.includes('eaton') || vendor?.includes('mge')) {
      return {
        oidList: [
          UPS_OIDS.eaton.upsBatteryStatus,
          UPS_OIDS.eaton.upsBatteryCapacity,
          UPS_OIDS.eaton.upsBatteryVoltage,
          UPS_OIDS.eaton.upsBatteryTemperature,
          UPS_OIDS.eaton.upsEstimatedRuntime,
          UPS_OIDS.eaton.upsInputVoltage,
          UPS_OIDS.eaton.upsInputFrequency,
          UPS_OIDS.eaton.upsOutputVoltage,
          UPS_OIDS.eaton.upsOutputFrequency,
          UPS_OIDS.eaton.upsOutputLoad,
        ],
        oidMap: {
          batteryStatus: UPS_OIDS.eaton.upsBatteryStatus,
          batteryCapacity: UPS_OIDS.eaton.upsBatteryCapacity,
          batteryVoltage: UPS_OIDS.eaton.upsBatteryVoltage,
          batteryTemperature: UPS_OIDS.eaton.upsBatteryTemperature,
          runtime: UPS_OIDS.eaton.upsEstimatedRuntime,
          inputVoltage: UPS_OIDS.eaton.upsInputVoltage,
          inputFrequency: UPS_OIDS.eaton.upsInputFrequency,
          outputVoltage: UPS_OIDS.eaton.upsOutputVoltage,
          outputFrequency: UPS_OIDS.eaton.upsOutputFrequency,
          outputLoad: UPS_OIDS.eaton.upsOutputLoad,
        }
      };
    } else if (vendor?.includes('cyberpower')) {
      return {
        oidList: [
          UPS_OIDS.cyberpower.upsBatteryStatus,
          UPS_OIDS.cyberpower.upsBatteryCapacity,
          UPS_OIDS.cyberpower.upsBatteryVoltage,
          UPS_OIDS.cyberpower.upsBatteryEstimatedMinutes,
          UPS_OIDS.cyberpower.upsInputVoltage,
          UPS_OIDS.cyberpower.upsOutputVoltage,
          UPS_OIDS.cyberpower.upsOutputLoad,
        ],
        oidMap: {
          batteryStatus: UPS_OIDS.cyberpower.upsBatteryStatus,
          batteryCapacity: UPS_OIDS.cyberpower.upsBatteryCapacity,
          batteryVoltage: UPS_OIDS.cyberpower.upsBatteryVoltage,
          runtime: UPS_OIDS.cyberpower.upsBatteryEstimatedMinutes,
          inputVoltage: UPS_OIDS.cyberpower.upsInputVoltage,
          outputVoltage: UPS_OIDS.cyberpower.upsOutputVoltage,
          outputLoad: UPS_OIDS.cyberpower.upsOutputLoad,
        }
      };
    } else {
      // Standard UPS MIB (RFC 1628)
      return {
        oidList: [
          UPS_OIDS.standard.upsBatteryStatus,
          UPS_OIDS.standard.upsEstimatedChargeRemaining,
          UPS_OIDS.standard.upsEstimatedMinutesRemaining,
          UPS_OIDS.standard.upsBatteryVoltage,
          UPS_OIDS.standard.upsBatteryCurrent,
          UPS_OIDS.standard.upsBatteryTemperature,
          UPS_OIDS.standard.upsInputVoltage,
          UPS_OIDS.standard.upsInputFrequency,
          UPS_OIDS.standard.upsOutputVoltage,
          UPS_OIDS.standard.upsOutputCurrent,
          UPS_OIDS.standard.upsOutputPercentLoad,
        ],
        oidMap: {
          batteryStatus: UPS_OIDS.standard.upsBatteryStatus,
          batteryCapacity: UPS_OIDS.standard.upsEstimatedChargeRemaining,
          runtime: UPS_OIDS.standard.upsEstimatedMinutesRemaining,
          batteryVoltage: UPS_OIDS.standard.upsBatteryVoltage,
          batteryCurrent: UPS_OIDS.standard.upsBatteryCurrent,
          batteryTemperature: UPS_OIDS.standard.upsBatteryTemperature,
          inputVoltage: UPS_OIDS.standard.upsInputVoltage,
          inputFrequency: UPS_OIDS.standard.upsInputFrequency,
          outputVoltage: UPS_OIDS.standard.upsOutputVoltage,
          outputCurrent: UPS_OIDS.standard.upsOutputCurrent,
          outputLoad: UPS_OIDS.standard.upsOutputPercentLoad,
        }
      };
    }
  }

  /**
   * Parse SNMP results based on vendor
   */
  private parseUPSMetrics(
    manufacturer: string | undefined,
    results: any[],
    oidMap: Record<string, string>
  ): any {
    const metrics: any = {};

    const vendor = manufacturer?.toLowerCase();

    // Battery status (varies by vendor)
    const batteryStatus = this.snmp.parseValue(results[0]);
    metrics.runningOnBattery = this.parseBatteryStatus(batteryStatus, vendor);

    // Battery capacity/health
    metrics.batteryHealthPercent = this.snmp.parseValue(results[1]);

    // Runtime
    let runtimeValue = this.snmp.parseValue(results[2]);
    if (vendor?.includes('apc')) {
      // APC reports in time ticks (centiseconds)
      metrics.estimatedRuntimeMinutes = Math.floor(runtimeValue / 6000);
    } else {
      metrics.estimatedRuntimeMinutes = runtimeValue;
    }

    // Voltage and current
    if (results[3]) {
      let voltage = this.snmp.parseValue(results[3]);
      // Some UPS report voltage in tenths
      if (vendor?.includes('apc') || vendor?.includes('standard')) {
        voltage = voltage / 10;
      }
      metrics.batteryVoltage = voltage;
    }

    if (results[4]) {
      let value = this.snmp.parseValue(results[4]);
      if (vendor?.includes('apc')) {
        metrics.inputVoltage = value;
      } else if (results.length > 5) {
        metrics.batteryCurrent = value / 10; // Tenths of amps
        metrics.batteryTemperature = this.snmp.parseValue(results[5]);
      }
    }

    // Input/Output metrics
    const voltageStartIdx = vendor?.includes('apc') ? 4 : 
                           vendor?.includes('eaton') ? 5 : 6;

    if (results[voltageStartIdx]) {
      metrics.inputVoltage = this.snmp.parseValue(results[voltageStartIdx]);
    }
    if (results[voltageStartIdx + 1]) {
      metrics.inputFrequency = this.snmp.parseValue(results[voltageStartIdx + 1]) / 10;
    }
    if (results[voltageStartIdx + 2]) {
      metrics.outputVoltage = this.snmp.parseValue(results[voltageStartIdx + 2]);
    }
    if (results[voltageStartIdx + 3]) {
      metrics.outputFrequency = this.snmp.parseValue(results[voltageStartIdx + 3]) / 10;
    }
    if (results[voltageStartIdx + 4]) {
      metrics.loadPercent = this.snmp.parseValue(results[voltageStartIdx + 4]);
    }
    if (results[voltageStartIdx + 5]) {
      metrics.outputCurrent = this.snmp.parseValue(results[voltageStartIdx + 5]) / 10;
    }

    // Calculate load watts if capacity is known
    if (metrics.loadPercent && manufacturer) {
      // Would need UPS capacity from device record
      metrics.loadWatts = undefined; // Calculated later with device capacity
    }

    // Default values
    metrics.lastSelfTestResult = 'not_available';
    metrics.batteryReplacementIndicator = false;
    metrics.alarmStatus = [];

    return metrics;
  }

  /**
   * Parse battery status based on vendor
   */
  private parseBatteryStatus(status: number, vendor?: string): boolean {
    // APC: 2=normal, 3=low, 4=depleted
    if (vendor?.includes('apc')) {
      return status !== 2; // Not normal means on battery
    }
    
    // Standard UPS MIB: 1=unknown, 2=batteryNormal, 3=batteryLow, 4=batteryDepleted
    // CyberPower: 2=normal, 3=low, 4=depleted
    return status !== 2;
  }

  /**
   * Predict battery replacement date using AI-like heuristics
   */
  private predictBatteryReplacement(
    batteryHealthPercent?: number,
    batteryAgeDays?: number,
    lastSelfTestResult?: string
  ): number | undefined {
    if (!batteryHealthPercent && !batteryAgeDays) {
      return undefined;
    }

    let score = 100;

    // Age factor (batteries typically last 3-5 years)
    if (batteryAgeDays) {
      const ageYears = batteryAgeDays / 365;
      if (ageYears > 5) score -= 50; // Very old
      else if (ageYears > 4) score -= 40;
      else if (ageYears > 3) score -= 30;
      else if (ageYears > 2) score -= 15;
    }

    // Health factor
    if (batteryHealthPercent) {
      if (batteryHealthPercent < 50) score -= 40;
      else if (batteryHealthPercent < 70) score -= 30;
      else if (batteryHealthPercent < 80) score -= 20;
      else if (batteryHealthPercent < 90) score -= 10;
    }

    // Self-test factor
    if (lastSelfTestResult === 'failed') {
      score -= 25;
    } else if (lastSelfTestResult === 'warning') {
      score -= 15;
    }

    // Convert score to predicted days
    // Score 100 = 365 days, Score 0 = 0 days
    const predictedDays = Math.max(0, Math.floor((score / 100) * 365));

    return predictedDays;
  }

  /**
   * Calculate UPS health score (0-100)
   */
  private calculateUPSHealthScore(metrics: {
    batteryHealthPercent?: number;
    runningOnBattery: boolean;
    loadPercent?: number;
    inputVoltage?: number;
    temperature?: number;
    lastSelfTestResult?: string;
    batteryAgeDays?: number;
  }): number {
    let score = 100;

    // Critical: Running on battery (0-30 points)
    if (metrics.runningOnBattery) {
      score -= 30;
    }

    // Battery health (0-25 points)
    if (metrics.batteryHealthPercent) {
      if (metrics.batteryHealthPercent < 50) score -= 25;
      else if (metrics.batteryHealthPercent < 60) score -= 20;
      else if (metrics.batteryHealthPercent < 70) score -= 15;
      else if (metrics.batteryHealthPercent < 80) score -= 10;
      else if (metrics.batteryHealthPercent < 90) score -= 5;
    }

    // Battery age (0-15 points)
    if (metrics.batteryAgeDays) {
      const ageYears = metrics.batteryAgeDays / 365;
      if (ageYears > 5) score -= 15;
      else if (ageYears > 4) score -= 10;
      else if (ageYears > 3) score -= 5;
    }

    // Load (0-15 points)
    if (metrics.loadPercent) {
      if (metrics.loadPercent > 95) score -= 15;
      else if (metrics.loadPercent > 90) score -= 10;
      else if (metrics.loadPercent > 85) score -= 5;
    }

    // Input voltage quality (0-10 points)
    if (metrics.inputVoltage) {
      const deviation = Math.abs(metrics.inputVoltage - 220); // Assuming 220V nominal
      if (deviation > 30) score -= 10;
      else if (deviation > 20) score -= 7;
      else if (deviation > 15) score -= 5;
      else if (deviation > 10) score -= 3;
    }

    // Temperature (0-10 points)
    if (metrics.temperature) {
      if (metrics.temperature > 35) score -= 10;
      else if (metrics.temperature > 32) score -= 7;
      else if (metrics.temperature > 30) score -= 5;
      else if (metrics.temperature > 28) score -= 3;
    }

    // Self-test result (0-5 points)
    if (metrics.lastSelfTestResult === 'failed') {
      score -= 5;
    } else if (metrics.lastSelfTestResult === 'warning') {
      score -= 3;
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
    ups: UPSDevice,
    metrics: UPSHealthMetrics
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

    // CRITICAL: UPS on battery
    if (metrics.runningOnBattery) {
      alerts.push({
        type: 'ups_on_battery',
        severity: 'critical',
        title: 'UPS Running on Battery',
        description: `UPS ${ups.name} is running on battery power`,
        impact: 'Branch will lose power if battery depletes',
        recommendedAction: `Check utility power supply. Estimated runtime: ${metrics.estimatedRuntimeMinutes || 'unknown'} minutes`,
        metrics: {
          onBattery: true,
          runtimeMinutes: metrics.estimatedRuntimeMinutes,
          batteryPercent: metrics.batteryHealthPercent
        }
      });
    }

    // Battery health alerts
    if (metrics.batteryHealthPercent) {
      if (metrics.batteryHealthPercent < 50) {
        alerts.push({
          type: 'ups_battery_critical',
          severity: 'critical',
          title: 'UPS Battery Health Critical',
          description: `UPS ${ups.name} battery health is at ${metrics.batteryHealthPercent.toFixed(0)}%`,
          impact: 'Battery may fail during power outage, very limited runtime',
          recommendedAction: 'Replace UPS battery immediately',
          metrics: { batteryHealth: metrics.batteryHealthPercent }
        });
      } else if (metrics.batteryHealthPercent < 70) {
        alerts.push({
          type: 'ups_battery_warning',
          severity: 'warning',
          title: 'UPS Battery Health Low',
          description: `UPS ${ups.name} battery health is at ${metrics.batteryHealthPercent.toFixed(0)}%`,
          impact: 'Reduced runtime during power outage',
          recommendedAction: 'Schedule battery replacement soon',
          metrics: { batteryHealth: metrics.batteryHealthPercent }
        });
      }
    }

    // Low runtime alert
    if (metrics.runningOnBattery && metrics.estimatedRuntimeMinutes) {
      if (metrics.estimatedRuntimeMinutes < 5) {
        alerts.push({
          type: 'ups_low_runtime',
          severity: 'critical',
          title: 'UPS Runtime Critical',
          description: `UPS ${ups.name} has only ${metrics.estimatedRuntimeMinutes} minutes remaining`,
          impact: 'Imminent power loss to branch equipment',
          recommendedAction: 'Initiate controlled shutdown of non-critical systems',
          metrics: { runtimeMinutes: metrics.estimatedRuntimeMinutes }
        });
      } else if (metrics.estimatedRuntimeMinutes < 15) {
        alerts.push({
          type: 'ups_low_runtime_warning',
          severity: 'warning',
          title: 'UPS Runtime Low',
          description: `UPS ${ups.name} has ${metrics.estimatedRuntimeMinutes} minutes remaining`,
          impact: 'Limited time before power loss',
          recommendedAction: 'Monitor situation, prepare for shutdown if needed',
          metrics: { runtimeMinutes: metrics.estimatedRuntimeMinutes }
        });
      }
    }

    // High load alert
    if (metrics.loadPercent) {
      if (metrics.loadPercent > 95) {
        alerts.push({
          type: 'ups_overload',
          severity: 'critical',
          title: 'UPS Overload',
          description: `UPS ${ups.name} load is at ${metrics.loadPercent.toFixed(0)}%`,
          impact: 'UPS may fail or shutdown, reduced runtime',
          recommendedAction: 'Reduce load immediately, disconnect non-critical equipment',
          metrics: { loadPercent: metrics.loadPercent, loadWatts: metrics.loadWatts }
        });
      } else if (metrics.loadPercent > 90) {
        alerts.push({
          type: 'ups_high_load',
          severity: 'warning',
          title: 'UPS High Load',
          description: `UPS ${ups.name} load is at ${metrics.loadPercent.toFixed(0)}%`,
          impact: 'Approaching capacity limit, reduced runtime',
          recommendedAction: 'Review connected equipment, consider UPS upgrade',
          metrics: { loadPercent: metrics.loadPercent, loadWatts: metrics.loadWatts }
        });
      }
    }

    // Temperature alert
    if (metrics.batteryTemperatureCelsius) {
      if (metrics.batteryTemperatureCelsius > 35) {
        alerts.push({
          type: 'ups_temperature_high',
          severity: 'critical',
          title: 'UPS Battery Temperature High',
          description: `UPS ${ups.name} battery temperature is ${metrics.batteryTemperatureCelsius.toFixed(1)}°C`,
          impact: 'Battery degradation accelerated, risk of failure',
          recommendedAction: 'Improve ventilation, check cooling system',
          metrics: { temperature: metrics.batteryTemperatureCelsius }
        });
      } else if (metrics.batteryTemperatureCelsius > 32) {
        alerts.push({
          type: 'ups_temperature_warning',
          severity: 'warning',
          title: 'UPS Battery Temperature Elevated',
          description: `UPS ${ups.name} battery temperature is ${metrics.batteryTemperatureCelsius.toFixed(1)}°C`,
          impact: 'Battery lifespan may be reduced',
          recommendedAction: 'Monitor temperature, ensure adequate ventilation',
          metrics: { temperature: metrics.batteryTemperatureCelsius }
        });
      }
    }

    // Input voltage alerts
    if (metrics.inputVoltage) {
      const deviation = Math.abs(metrics.inputVoltage - 220); // Assuming 220V nominal
      if (deviation > 30) {
        alerts.push({
          type: 'ups_input_voltage_abnormal',
          severity: 'warning',
          title: 'UPS Input Voltage Abnormal',
          description: `UPS ${ups.name} input voltage is ${metrics.inputVoltage.toFixed(1)}V`,
          impact: 'Frequent voltage fluctuations may cause UPS to switch to battery',
          recommendedAction: 'Check utility power quality, consider voltage regulator',
          metrics: { inputVoltage: metrics.inputVoltage }
        });
      }
    }

    // Battery replacement indicator
    if (metrics.batteryReplacementIndicator) {
      alerts.push({
        type: 'ups_battery_replacement_needed',
        severity: 'warning',
        title: 'UPS Battery Replacement Needed',
        description: `UPS ${ups.name} battery requires replacement`,
        impact: 'Unreliable backup power',
        recommendedAction: metrics.predictedReplacementDays 
          ? `Replace battery within ${metrics.predictedReplacementDays} days`
          : 'Replace battery as soon as possible',
        metrics: { 
          replacementNeeded: true,
          predictedDays: metrics.predictedReplacementDays,
          batteryAgeDays: metrics.batteryAgeDays
        }
      });
    }

    // Self-test failure
    if (metrics.lastSelfTestResult === 'failed') {
      alerts.push({
        type: 'ups_self_test_failed',
        severity: 'critical',
        title: 'UPS Self-Test Failed',
        description: `UPS ${ups.name} failed its last self-test`,
        impact: 'UPS may not provide backup power during outage',
        recommendedAction: 'Investigate failure, replace battery or UPS if needed',
        metrics: { selfTestResult: metrics.lastSelfTestResult }
      });
    }

    // Store alerts
    for (const alert of alerts) {
      await this.createInfrastructureAlert({
        tenantId: ups.tenantId,
        branchId: ups.branchId,
        componentType: 'ups',
        componentId: ups.id,
        componentName: ups.name,
        ...alert
      });
    }
  }

  /**
   * Build SNMP target from UPS configuration
   */
  private buildSNMPTarget(ups: UPSDevice): SNMPTarget {
    return {
      host: ups.ipAddress || ups.name, // Fallback to hostname if no IP
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
   * Get all UPS devices for a branch
   */
  private async getUPSDevices(tenantId: string, branchId: string): Promise<UPSDevice[]> {
    const query = `
      SELECT 
        id, tenant_id, branch_id, name, ip_address,
        manufacturer, model, serial_number,
        capacity_va, capacity_watts, battery_type,
        battery_installation_date, management_protocol, status
      FROM ups_devices
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
      capacityVA: row.capacity_va,
      capacityWatts: row.capacity_watts,
      batteryType: row.battery_type,
      batteryInstallationDate: row.battery_installation_date,
      managementProtocol: row.management_protocol,
      status: row.status
    }));
  }

  /**
   * Store UPS health metrics
   */
  private async storeUPSHealth(metrics: UPSHealthMetrics): Promise<void> {
    const query = `
      INSERT INTO ups_health_metrics (
        tenant_id, ups_id, observed_at,
        battery_health_percent, battery_voltage, battery_current,
        battery_temperature_celsius, battery_age_days,
        estimated_runtime_minutes, estimated_charge_time_minutes,
        utility_power_available, running_on_battery,
        input_voltage, input_frequency,
        output_voltage, output_frequency, output_current,
        load_percent, load_watts,
        last_self_test_date, last_self_test_result,
        last_power_event_type, last_power_event_time,
        battery_replacement_indicator, predicted_replacement_days,
        alarm_status, health_score, health_status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
      )
    `;

    await this.pool.query(query, [
      metrics.tenantId,
      metrics.upsId,
      metrics.observedAt,
      metrics.batteryHealthPercent,
      metrics.batteryVoltage,
      metrics.batteryCurrent,
      metrics.batteryTemperatureCelsius,
      metrics.batteryAgeDays,
      metrics.estimatedRuntimeMinutes,
      metrics.estimatedChargeTimeMinutes,
      metrics.utilityPowerAvailable,
      metrics.runningOnBattery,
      metrics.inputVoltage,
      metrics.inputFrequency,
      metrics.outputVoltage,
      metrics.outputFrequency,
      metrics.outputCurrent,
      metrics.loadPercent,
      metrics.loadWatts,
      metrics.lastSelfTestDate,
      metrics.lastSelfTestResult,
      metrics.lastPowerEventType,
      metrics.lastPowerEventTime,
      metrics.batteryReplacementIndicator,
      metrics.predictedReplacementDays,
      metrics.alarmStatus ? JSON.stringify(metrics.alarmStatus) : null,
      metrics.healthScore,
      metrics.healthStatus
    ]);
  }

  /**
   * Update UPS status
   */
  private async updateUPSStatus(upsId: string, status: string): Promise<void> {
    const query = `
      UPDATE ups_devices
      SET status = $2, updated_at = NOW()
      WHERE id = $1
    `;

    await this.pool.query(query, [upsId, status]);
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
   * Get UPS devices requiring battery replacement
   */
  async getUPSRequiringReplacement(tenantId: string): Promise<Array<{
    upsId: string;
    upsName: string;
    branchId: string;
    branchName: string;
    batteryAgeDays: number;
    batteryHealthPercent?: number;
    predictedReplacementDays?: number;
  }>> {
    const query = `
      SELECT 
        u.id as ups_id,
        u.name as ups_name,
        u.branch_id,
        b.name as branch_name,
        uhm.battery_age_days,
        uhm.battery_health_percent,
        uhm.predicted_replacement_days
      FROM ups_devices u
      JOIN resource_nodes b ON b.id = u.branch_id
      LEFT JOIN LATERAL (
        SELECT battery_age_days, battery_health_percent, predicted_replacement_days
        FROM ups_health_metrics
        WHERE ups_id = u.id
        ORDER BY observed_at DESC
        LIMIT 1
      ) uhm ON true
      WHERE u.tenant_id = $1
        AND (
          uhm.battery_replacement_indicator = true
          OR uhm.predicted_replacement_days < 90
          OR uhm.battery_health_percent < 70
          OR uhm.battery_age_days > 1825  -- 5 years
        )
      ORDER BY uhm.predicted_replacement_days ASC NULLS LAST
    `;

    const result = await this.pool.query(query, [tenantId]);

    return result.rows.map(row => ({
      upsId: row.ups_id,
      upsName: row.ups_name,
      branchId: row.branch_id,
      branchName: row.branch_name,
      batteryAgeDays: row.battery_age_days,
      batteryHealthPercent: row.battery_health_percent,
      predictedReplacementDays: row.predicted_replacement_days
    }));
  }
}
