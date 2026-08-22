/**
 * Retention Prediction & Storage Forecasting Engine
 * 
 * Estimates future retention degradation, days until disk pressure,
 * and time-to-violation based on HDD write velocity and disk telemetry.
 */

import type {
  RetentionPrediction,
  RetentionRiskState,
} from "../domain/retention.types.js";

export interface StorageMetricsInput {
  totalBytes: number;
  freeBytes: number;
  dailyWriteRateBytes?: number | undefined;
  disksWarningCount?: number | undefined;
  disksFailedCount?: number | undefined;
  currentActualRetentionDays?: number | undefined;
  requiredRetentionDays?: number | undefined;
}

export class RetentionPredictionService {
  /**
   * Predicts future retention capacity and imminent policy violation risk
   */
  predict(metrics: StorageMetricsInput, now: Date = new Date()): RetentionPrediction {
    const requiredDays = metrics.requiredRetentionDays ?? 90;
    const actualDays = metrics.currentActualRetentionDays;

    // If storage metrics are missing or totalBytes is 0
    if (!metrics.totalBytes || metrics.totalBytes <= 0) {
      return {
        predictionConfidence: 0.2,
        riskState: "UNKNOWN",
        calculatedAt: now,
        reason: "Storage metrics unavailable",
      };
    }

    // Default daily write velocity: 190 GB/day per 16-channel branch if unmeasured
    const defaultDailyWrite = 190 * 1024 * 1024 * 1024;
    const dailyWriteBytes = metrics.dailyWriteRateBytes && metrics.dailyWriteRateBytes > 0
      ? metrics.dailyWriteRateBytes
      : defaultDailyWrite;

    // Deduct damaged / failed disk capacity if disks failed
    let usableBytes = metrics.totalBytes;
    if (metrics.disksFailedCount && metrics.disksFailedCount > 0) {
      const diskSlice = metrics.totalBytes / (metrics.disksFailedCount + 1);
      usableBytes = Math.max(0, metrics.totalBytes - diskSlice * metrics.disksFailedCount);
    }

    const projectedRetentionDays = Number((usableBytes / dailyWriteBytes).toFixed(1));
    const daysUntilDiskPressure = Number((Math.max(0, metrics.freeBytes) / dailyWriteBytes).toFixed(1));

    let daysUntilPolicyViolation: number | undefined;
    let riskState: RetentionRiskState = "STABLE";
    let reason = "Retention capacity is healthy and stable";

    if (actualDays !== undefined) {
      if (actualDays < requiredDays) {
        // Already in violation
        daysUntilPolicyViolation = 0;
        riskState = "IMMINENT";
        reason = `Currently below required retention policy (${actualDays}d < ${requiredDays}d)`;
      } else if (projectedRetentionDays < requiredDays) {
        // Current actual >= required, but storage write velocity will cause violation
        const decayPerDay = (requiredDays - projectedRetentionDays) / Math.max(1, daysUntilDiskPressure);
        const estimatedDays = Math.max(1, Math.round((actualDays - requiredDays) / (decayPerDay || 1)));
        daysUntilPolicyViolation = estimatedDays;

        if (estimatedDays <= 2) {
          riskState = "IMMINENT";
          reason = `Projected retention (${projectedRetentionDays}d) below required (${requiredDays}d); violation expected in ~${estimatedDays} days`;
        } else if (estimatedDays <= 7) {
          riskState = "AT_RISK";
          reason = `Projected retention (${projectedRetentionDays}d) below required (${requiredDays}d); violation expected in ~${estimatedDays} days`;
        } else {
          riskState = "AT_RISK";
          reason = `Storage exhaustion forecast indicates risk in ${estimatedDays} days`;
        }
      } else if (metrics.disksWarningCount && metrics.disksWarningCount > 0) {
        riskState = "AT_RISK";
        reason = `SMART drive warning on storage array introduces risk of premature retention drop`;
      }
    }

    return {
      projectedRetentionDays,
      estimatedDailyWriteBytes: dailyWriteBytes,
      storageGrowthRate: dailyWriteBytes,
      daysUntilPolicyViolation,
      daysUntilDiskPressure,
      predictionConfidence: 0.92,
      riskState,
      calculatedAt: now,
      reason,
    };
  }
}

export const retentionPredictionService = new RetentionPredictionService();
