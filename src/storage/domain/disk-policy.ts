export interface MetricThreshold {
  enter: number;
  clear: number;
}

export interface DiskHealthPolicy {
  // Thermal limits in Celsius
  warningTemperatureC: MetricThreshold;
  criticalTemperatureC: MetricThreshold;

  // Capacity usage limits in percent
  warningUsagePercent: MetricThreshold;
  criticalUsagePercent: MetricThreshold;

  // Sector limits
  warningPendingSectors: number;
  criticalPendingSectors: number;

  warningReallocatedSectors: number;
  criticalReallocatedSectors: number;

  warningUncorrectableSectors: number;
  criticalUncorrectableSectors: number;

  // Telemetry freshness
  maxObservationAgeSeconds: number;
}

export const DEFAULT_BANKING_STORAGE_POLICY: DiskHealthPolicy = {
  warningTemperatureC: { enter: 50, clear: 46 },
  criticalTemperatureC: { enter: 60, clear: 55 },

  warningUsagePercent: { enter: 85, clear: 80 },
  criticalUsagePercent: { enter: 95, clear: 90 },

  warningPendingSectors: 1,
  criticalPendingSectors: 10,

  warningReallocatedSectors: 1,
  criticalReallocatedSectors: 50,

  warningUncorrectableSectors: 1,
  criticalUncorrectableSectors: 5,

  maxObservationAgeSeconds: 300, // 5 minutes
};
