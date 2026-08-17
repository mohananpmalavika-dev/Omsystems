/**
 * Weighted Storage Forecaster & Retention Violation Estimator
 */

export interface IngestHistoryStats {
  bytesLast24h: number;
  avgDailyBytes7d: number;
  avgDailyBytes30d: number;
  configuredDailyBitrateBytes: number;
}

export interface StorageForecastResult {
  usableStorageBytes: number;
  usedStorageBytes: number;
  freeStorageBytes: number;
  weightedDailyIngestBytes: number;
  currentActualRetentionDays: number;
  requiredRetentionDays: number;
  projectedRetentionDays: number;
  daysUntilViolation?: number;
  projectedViolationAt?: Date;
  isProjectedCompliant: boolean;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  forecastConfidence: number;
}

export class StorageForecasterService {
  /**
   * Calculates weighted daily ingest velocity:
   * 50% last 7 days + 30% last 30 days + 20% configured bitrate baseline
   */
  static calculateWeightedDailyIngest(stats: IngestHistoryStats): number {
    const w7d = stats.avgDailyBytes7d * 0.50;
    const w30d = stats.avgDailyBytes30d * 0.30;
    const wConfig = stats.configuredDailyBitrateBytes * 0.20;
    return Math.round(w7d + w30d + wConfig);
  }

  /**
   * Evaluates storage capacity forecasting and retention violation risk.
   */
  static forecastRetention(params: {
    usableStorageBytes: number;
    usedStorageBytes: number;
    ingestStats: IngestHistoryStats;
    currentActualRetentionDays: number;
    requiredRetentionDays: number;
    now?: Date;
  }): StorageForecastResult {
    const now = params.now || new Date();
    const {
      usableStorageBytes,
      usedStorageBytes,
      ingestStats,
      currentActualRetentionDays,
      requiredRetentionDays,
    } = params;

    const freeStorageBytes = Math.max(0, usableStorageBytes - usedStorageBytes);
    const weightedDailyIngestBytes = this.calculateWeightedDailyIngest(ingestStats);

    const projectedRetentionDays =
      weightedDailyIngestBytes > 0
        ? parseFloat((usableStorageBytes / weightedDailyIngestBytes).toFixed(1))
        : 0;

    let daysUntilViolation: number | undefined;
    let projectedViolationAt: Date | undefined;
    let status: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
    const isProjectedCompliant = projectedRetentionDays >= requiredRetentionDays;

    if (currentActualRetentionDays < requiredRetentionDays) {
      // Immediate deficit
      daysUntilViolation = 0;
      projectedViolationAt = now;
      status = 'CRITICAL';
    } else if (projectedRetentionDays < requiredRetentionDays) {
      // Current actual >= required, but storage capacity will cause violation
      const remainingHeadroomDays = Math.max(0, currentActualRetentionDays - requiredRetentionDays);
      const daysUntilDiskFull = freeStorageBytes / (weightedDailyIngestBytes || 1);
      const estimatedDays = Math.max(1, Math.round(Math.min(remainingHeadroomDays, daysUntilDiskFull)));

      daysUntilViolation = estimatedDays;
      projectedViolationAt = new Date(now.getTime() + estimatedDays * 86400_000);

      status = estimatedDays <= 3 ? 'CRITICAL' : 'WARNING';
    } else if (projectedRetentionDays < requiredRetentionDays * 1.10) {
      // Buffer is under 10%
      status = 'WARNING';
    } else {
      status = 'HEALTHY';
    }

    return {
      usableStorageBytes,
      usedStorageBytes,
      freeStorageBytes,
      weightedDailyIngestBytes,
      currentActualRetentionDays,
      requiredRetentionDays,
      projectedRetentionDays,
      daysUntilViolation,
      projectedViolationAt,
      isProjectedCompliant,
      status,
      forecastConfidence: 0.94,
    };
  }
}
