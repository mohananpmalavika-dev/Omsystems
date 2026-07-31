/**
 * Generator Monitoring Service
 * 
 * Monitors backup generator systems for power reliability:
 * - Generator operational status (running, stopped, fault)
 * - Fuel level and fuel consumption rate
 * - Runtime hours and maintenance schedules
 * - Battery voltage for generator starter
 * - Engine temperature and oil pressure
 * - Load percentage and power output
 * - Transfer switch status (utility vs generator power)
 * 
 * Supports multiple generator types:
 * - Kohler, Cummins, Generac, Caterpillar, Perkins
 * - Standard SNMP MIBs where available
 */

import { Pool } from 'pg';
import { SNMPCollectorService } from './snmp-collector.service.js';

interface GeneratorHealthMetrics {
  generatorId: string;
  healthScore: number;
  healthStatus: 'healthy' | 'warning' | 'critical';
  
  // Operational status
  operationalStatus: 'running' | 'stopped' | 'fault' | 'standby';
  runningOnGenerator: boolean;
  transferSwitchStatus: 'utility' | 'generator' | 'transition';
  
  // Fuel monitoring
  fuelLevelPercent?: number;
  fuelLevelLiters?: number;
  fuelConsumptionRate?: number; // liters/hour
  estimatedRuntimeHours?: number;
  
  // Engine health
  engineTemperatureCelsius?: number;
  oilPressurePsi?: number;
  batteryVoltage?: number;
  coolantTemperatureCelsius?: number;
  
  // Performance
  loadPercent?: number;
  outputPowerKw?: number;
  outputVoltage?: number;
  outputFrequency?: number;
  
  // Maintenance
  runtimeHoursTotal: number;
  hoursSinceLastMaintenance?: number;
  maintenanceDue: boolean;
  maintenanceDueDays?: number;
  nextMaintenanceDate?: Date;
  
  observedAt: Date;
}

interface GeneratorAlert {
  generatorId: string;
  severity: 'critical' | 'warning' | 'info';
  alertType: string;
  message: string;
  details: Record<string, any>;
  impact: string;
  recommendedAction: string;
}

export class GeneratorMonitoringService {
  private snmpCollector: SNMPCollectorService;

  // Generator-specific OIDs (vendor abstraction)
  private readonly GENERATOR_OIDS = {
    // Kohler
    kohler: {
      status: '1.3.6.1.4.1.2254.1.2.1.0',
      fuelLevel: '1.3.6.1.4.1.2254.1.2.5.0',
      runtime: '1.3.6.1.4.1.2254.1.2.10.0',
      load: '1.3.6.1.4.1.2254.1.2.15.0',
      engineTemp: '1.3.6.1.4.1.2254.1.2.20.0',
      batteryVoltage: '1.3.6.1.4.1.2254.1.2.25.0'
    },
    // Cummins
    cummins: {
      status: '1.3.6.1.4.1.2765.2.1.1.0',
      fuelLevel: '1.3.6.1.4.1.2765.2.1.5.0',
      runtime: '1.3.6.1.4.1.2765.2.1.10.0',
      load: '1.3.6.1.4.1.2765.2.1.15.0',
      engineTemp: '1.3.6.1.4.1.2765.2.1.20.0'
    },
    // Generic (common MIBs)
    generic: {
      status: '1.3.6.1.2.1.33.1.4.1.0',
      fuelLevel: '1.3.6.1.2.1.33.1.4.5.0',
      runtime: '1.3.6.1.2.1.33.1.4.10.0',
      load: '1.3.6.1.2.1.33.1.4.15.0'
    }
  };

  constructor(private pool: Pool) {
    this.snmpCollector = new SNMPCollectorService(pool);
  }

  /**
   * Collect health metrics for all generators in a branch
   */
  async collectBranchGenerators(branchId: string, tenantId: string): Promise<void> {
    const generators = await this.getBranchGenerators(branchId, tenantId);

    for (const generator of generators) {
      try {
        const metrics = await this.collectGeneratorHealth(generator);
        await this.saveHealthMetrics(metrics, tenantId);
        
        const alerts = await this.generateAlerts(generator, metrics);
        for (const alert of alerts) {
          await this.saveAlert(alert, tenantId, branchId);
        }
      } catch (error) {
        console.error(`Error collecting generator metrics for ${generator.id}:`, error);
      }
    }
  }

  /**
   * Collect health metrics for a specific generator
   */
  private async collectGeneratorHealth(generator: any): Promise<GeneratorHealthMetrics> {
    const oids = this.selectOIDsForVendor(generator.vendor);
    
    // Collect SNMP data
    const snmpData = await this.snmpCollector.collectMultiple(
      generator.ip_address,
      Object.values(oids),
      generator.snmp_community,
      generator.snmp_version
    );

    // Parse operational status
    const operationalStatus = this.parseOperationalStatus(snmpData[oids.status]);
    const runningOnGenerator = operationalStatus === 'running';
    
    // Parse fuel data
    const fuelLevelPercent = this.parseNumeric(snmpData[oids.fuelLevel]);
    const fuelLevelLiters = generator.fuel_tank_capacity_liters 
      ? (fuelLevelPercent / 100) * generator.fuel_tank_capacity_liters
      : undefined;
    
    // Estimate runtime based on fuel and consumption
    const fuelConsumptionRate = generator.fuel_consumption_rate_lph || 15; // default 15 L/h
    const estimatedRuntimeHours = fuelLevelLiters 
      ? fuelLevelLiters / fuelConsumptionRate
      : undefined;
    
    // Parse engine health
    const engineTemperatureCelsius = this.parseNumeric(snmpData[oids.engineTemp]);
    const batteryVoltage = this.parseNumeric(snmpData[oids.batteryVoltage]);
    
    // Parse performance
    const loadPercent = this.parseNumeric(snmpData[oids.load]);
    const runtimeHoursTotal = this.parseNumeric(snmpData[oids.runtime]) || 0;
    
    // Calculate maintenance
    const hoursSinceLastMaintenance = generator.last_maintenance_hours
      ? runtimeHoursTotal - generator.last_maintenance_hours
      : undefined;
    
    const maintenanceIntervalHours = generator.maintenance_interval_hours || 500;
    const maintenanceDue = hoursSinceLastMaintenance
      ? hoursSinceLastMaintenance >= maintenanceIntervalHours
      : false;
    
    const maintenanceDueDays = hoursSinceLastMaintenance
      ? Math.max(0, Math.ceil((maintenanceIntervalHours - hoursSinceLastMaintenance) / 24))
      : undefined;
    
    // Calculate health score
    const healthScore = this.calculateHealthScore({
      operationalStatus,
      fuelLevelPercent,
      engineTemperatureCelsius,
      batteryVoltage,
      loadPercent,
      hoursSinceLastMaintenance,
      maintenanceIntervalHours
    });
    
    const healthStatus = this.determineHealthStatus(healthScore);

    return {
      generatorId: generator.id,
      healthScore,
      healthStatus,
      operationalStatus,
      runningOnGenerator,
      transferSwitchStatus: runningOnGenerator ? 'generator' : 'utility',
      fuelLevelPercent,
      fuelLevelLiters,
      fuelConsumptionRate,
      estimatedRuntimeHours,
      engineTemperatureCelsius,
      batteryVoltage,
      loadPercent,
      runtimeHoursTotal,
      hoursSinceLastMaintenance,
      maintenanceDue,
      maintenanceDueDays,
      observedAt: new Date()
    };
  }

  /**
   * Calculate generator health score
   */
  private calculateHealthScore(params: {
    operationalStatus: string;
    fuelLevelPercent?: number;
    engineTemperatureCelsius?: number;
    batteryVoltage?: number;
    loadPercent?: number;
    hoursSinceLastMaintenance?: number;
    maintenanceIntervalHours: number;
  }): number {
    let score = 100;

    // Operational status penalty
    if (params.operationalStatus === 'fault') {
      score -= 50; // Major penalty for fault
    } else if (params.operationalStatus === 'running') {
      // Running is normal during power outage, no penalty
    }

    // Fuel level penalty
    if (params.fuelLevelPercent !== undefined) {
      if (params.fuelLevelPercent < 10) {
        score -= 30; // Critical fuel level
      } else if (params.fuelLevelPercent < 25) {
        score -= 15; // Low fuel warning
      } else if (params.fuelLevelPercent < 50) {
        score -= 5; // Below half tank
      }
    }

    // Engine temperature penalty
    if (params.engineTemperatureCelsius !== undefined) {
      if (params.engineTemperatureCelsius > 110) {
        score -= 25; // Overheating
      } else if (params.engineTemperatureCelsius > 100) {
        score -= 10; // High temperature
      }
    }

    // Battery voltage penalty
    if (params.batteryVoltage !== undefined) {
      if (params.batteryVoltage < 11) {
        score -= 20; // Very low battery (won't start)
      } else if (params.batteryVoltage < 12) {
        score -= 10; // Low battery
      }
    }

    // Load penalty
    if (params.loadPercent !== undefined && params.loadPercent > 95) {
      score -= 15; // Overload condition
    }

    // Maintenance penalty
    if (params.hoursSinceLastMaintenance !== undefined) {
      const maintenanceRatio = params.hoursSinceLastMaintenance / params.maintenanceIntervalHours;
      if (maintenanceRatio > 1.2) {
        score -= 25; // Severely overdue
      } else if (maintenanceRatio > 1.0) {
        score -= 15; // Maintenance overdue
      } else if (maintenanceRatio > 0.9) {
        score -= 5; // Maintenance due soon
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate alerts based on generator health
   */
  private async generateAlerts(
    generator: any,
    metrics: GeneratorHealthMetrics
  ): Promise<GeneratorAlert[]> {
    const alerts: GeneratorAlert[] = [];

    // Generator running (power outage)
    if (metrics.runningOnGenerator) {
      alerts.push({
        generatorId: generator.id,
        severity: 'critical',
        alertType: 'generator_running',
        message: `Generator ${generator.name} is running - utility power outage detected`,
        details: {
          fuelLevel: metrics.fuelLevelPercent,
          estimatedRuntime: metrics.estimatedRuntimeHours,
          load: metrics.loadPercent
        },
        impact: 'Branch is running on backup power. Limited runtime available.',
        recommendedAction: `Monitor fuel level (${metrics.estimatedRuntimeHours?.toFixed(1)}h remaining). Check utility power restoration ETA. Prepare for refueling if extended outage expected.`
      });
    }

    // Low fuel
    if (metrics.fuelLevelPercent !== undefined && metrics.fuelLevelPercent < 25) {
      alerts.push({
        generatorId: generator.id,
        severity: metrics.fuelLevelPercent < 10 ? 'critical' : 'warning',
        alertType: 'low_fuel',
        message: `Generator ${generator.name} fuel level ${metrics.fuelLevelPercent}%`,
        details: {
          fuelLevel: metrics.fuelLevelPercent,
          fuelLiters: metrics.fuelLevelLiters,
          estimatedRuntime: metrics.estimatedRuntimeHours
        },
        impact: `Limited backup power runtime: ${metrics.estimatedRuntimeHours?.toFixed(1)} hours remaining`,
        recommendedAction: 'Schedule immediate fuel delivery. Monitor consumption rate. Consider load reduction to extend runtime.'
      });
    }

    // Maintenance due
    if (metrics.maintenanceDue) {
      alerts.push({
        generatorId: generator.id,
        severity: metrics.maintenanceDueDays && metrics.maintenanceDueDays < 0 ? 'warning' : 'info',
        alertType: 'maintenance_due',
        message: `Generator ${generator.name} maintenance ${metrics.maintenanceDueDays! < 0 ? 'overdue' : 'due'}`,
        details: {
          hoursSinceMaintenance: metrics.hoursSinceLastMaintenance,
          maintenanceDueDays: metrics.maintenanceDueDays
        },
        impact: 'Generator reliability may be compromised without regular maintenance',
        recommendedAction: 'Schedule preventive maintenance: oil change, filter replacement, battery check, coolant inspection'
      });
    }

    // Engine overheating
    if (metrics.engineTemperatureCelsius !== undefined && metrics.engineTemperatureCelsius > 100) {
      alerts.push({
        generatorId: generator.id,
        severity: metrics.engineTemperatureCelsius > 110 ? 'critical' : 'warning',
        alertType: 'engine_overheating',
        message: `Generator ${generator.name} engine temperature ${metrics.engineTemperatureCelsius}°C`,
        details: {
          temperature: metrics.engineTemperatureCelsius
        },
        impact: 'Engine damage risk. Generator may shut down automatically.',
        recommendedAction: 'Check coolant level. Verify cooling system operation. Reduce load if possible. Prepare for generator shutdown.'
      });
    }

    // Low battery voltage
    if (metrics.batteryVoltage !== undefined && metrics.batteryVoltage < 12) {
      alerts.push({
        generatorId: generator.id,
        severity: metrics.batteryVoltage < 11 ? 'critical' : 'warning',
        alertType: 'low_battery_voltage',
        message: `Generator ${generator.name} battery ${metrics.batteryVoltage}V`,
        details: {
          batteryVoltage: metrics.batteryVoltage
        },
        impact: 'Generator may fail to start during power outage',
        recommendedAction: 'Test battery and charging system. Replace battery if needed. Check alternator output.'
      });
    }

    // Generator fault
    if (metrics.operationalStatus === 'fault') {
      alerts.push({
        generatorId: generator.id,
        severity: 'critical',
        alertType: 'generator_fault',
        message: `Generator ${generator.name} in fault state`,
        details: {
          status: metrics.operationalStatus
        },
        impact: 'No backup power available. Branch vulnerable to power outages.',
        recommendedAction: 'Dispatch technician immediately. Check fault codes. Test manual start. Notify facility management.'
      });
    }

    return this.deduplicateAlerts(alerts, generator.id);
  }

  /**
   * Get all generators for a branch
   */
  private async getBranchGenerators(branchId: string, tenantId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM generators
       WHERE branch_id = $1 AND tenant_id = $2
       AND enabled = true`,
      [branchId, tenantId]
    );
    return result.rows;
  }

  /**
   * Save generator health metrics
   */
  private async saveHealthMetrics(metrics: GeneratorHealthMetrics, tenantId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO generator_health_metrics (
        tenant_id, generator_id, health_score, health_status,
        operational_status, running_on_generator, transfer_switch_status,
        fuel_level_percent, fuel_level_liters, fuel_consumption_rate, estimated_runtime_hours,
        engine_temperature_celsius, battery_voltage, load_percent,
        runtime_hours_total, hours_since_last_maintenance,
        maintenance_due, maintenance_due_days, observed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [
        tenantId, metrics.generatorId, metrics.healthScore, metrics.healthStatus,
        metrics.operationalStatus, metrics.runningOnGenerator, metrics.transferSwitchStatus,
        metrics.fuelLevelPercent, metrics.fuelLevelLiters, metrics.fuelConsumptionRate,
        metrics.estimatedRuntimeHours, metrics.engineTemperatureCelsius, metrics.batteryVoltage,
        metrics.loadPercent, metrics.runtimeHoursTotal, metrics.hoursSinceLastMaintenance,
        metrics.maintenanceDue, metrics.maintenanceDueDays, metrics.observedAt
      ]
    );
  }

  /**
   * Save alert
   */
  private async saveAlert(
    alert: GeneratorAlert,
    tenantId: string,
    branchId: string
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO infrastructure_alerts (
        tenant_id, branch_id, component_type, component_id, component_name,
        severity, alert_type, message, details, impact, recommended_action,
        detected_at, status
      ) VALUES ($1, $2, 'generator', $3, (SELECT name FROM generators WHERE id = $3), $4, $5, $6, $7, $8, $9, NOW(), 'active')
      ON CONFLICT (tenant_id, component_id, alert_type, status)
      WHERE status = 'active'
      DO UPDATE SET
        message = EXCLUDED.message,
        details = EXCLUDED.details,
        last_occurred_at = NOW(),
        occurrence_count = infrastructure_alerts.occurrence_count + 1`,
      [
        tenantId, branchId, alert.generatorId,
        alert.severity, alert.alertType, alert.message,
        JSON.stringify(alert.details), alert.impact, alert.recommendedAction
      ]
    );
  }

  // Helper methods
  private selectOIDsForVendor(vendor?: string): any {
    const v = vendor?.toLowerCase() || '';
    if (v.includes('kohler')) return this.GENERATOR_OIDS.kohler;
    if (v.includes('cummins')) return this.GENERATOR_OIDS.cummins;
    return this.GENERATOR_OIDS.generic;
  }

  private parseOperationalStatus(value: any): 'running' | 'stopped' | 'fault' | 'standby' {
    const status = String(value).toLowerCase();
    if (status.includes('run') || status === '2') return 'running';
    if (status.includes('fault') || status.includes('error')) return 'fault';
    if (status.includes('stop') || status === '1') return 'stopped';
    return 'standby';
  }

  private parseNumeric(value: any): number | undefined {
    const num = parseFloat(String(value));
    return isNaN(num) ? undefined : num;
  }

  private determineHealthStatus(score: number): 'healthy' | 'warning' | 'critical' {
    if (score >= 90) return 'healthy';
    if (score >= 70) return 'warning';
    return 'critical';
  }

  private async deduplicateAlerts(alerts: GeneratorAlert[], generatorId: string): Promise<GeneratorAlert[]> {
    const existingAlerts = await this.pool.query(
      `SELECT alert_type FROM infrastructure_alerts
       WHERE component_id = $1 AND status = 'active'
       AND detected_at > NOW() - INTERVAL '5 minutes'`,
      [generatorId]
    );

    const existingTypes = new Set(existingAlerts.rows.map(r => r.alert_type));
    return alerts.filter(alert => !existingTypes.has(alert.alertType));
  }
}

export default GeneratorMonitoringService;
