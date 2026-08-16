import type { DiskEvidence } from "../domain/disk-evidence.js";
import type { FailurePrediction, DiskMetricTrend } from "../domain/disk-health.js";

export class DiskFailurePredictor {
  private readonly modelVersion = "rules-engine-v2.4-banking";

  predict(
    evidence: DiskEvidence,
    history?: {
      trends?: DiskMetricTrend[] | undefined;
      previousReadings?: DiskEvidence[] | undefined;
      arrayDegraded?: boolean | undefined;
    },
  ): FailurePrediction {
    let score = 0;
    const reasons: string[] = [];
    let predictedWindowHours: number | undefined = undefined;

    // 1. SMART Overall Failure (+100)
    if (evidence.smartStatus === "FAILED") {
      score += 100;
      reasons.push("SMART self-test reported overall hardware failure.");
      predictedWindowHours = 24;
    }

    // 2. Pending Sectors
    const pending = evidence.pendingSectors ?? 0;
    if (pending >= 10) {
      score += 45;
      reasons.push(`High pending sector count (${pending} pending).`);
      if (!predictedWindowHours) predictedWindowHours = 72;
    } else if (pending > 0) {
      score += 25;
      reasons.push(`Unstable pending sectors detected (${pending} pending).`);
      if (!predictedWindowHours) predictedWindowHours = 168;
    }

    // 3. Pending Sector Growth / Derivative
    const pendingTrend = history?.trends?.find((t) => t.metric === "pendingSectors");
    if (pendingTrend && pendingTrend.delta24h && pendingTrend.delta24h > 0) {
      score += 25;
      reasons.push(`Pending sector count increased by +${pendingTrend.delta24h} in the last 24h.`);
      predictedWindowHours = Math.min(predictedWindowHours ?? 72, 48);
    }

    // 4. Offline Uncorrectable Errors
    const uncorrect = evidence.offlineUncorrectableSectors ?? 0;
    if (uncorrect > 0) {
      score += 30;
      reasons.push(`Disk has ${uncorrect} uncorrectable read errors.`);
      if (!predictedWindowHours) predictedWindowHours = 120;
    }

    // 5. Reallocated Sectors & Growth
    const reallocated = evidence.reallocatedSectors ?? 0;
    if (reallocated >= 50) {
      score += 35;
      reasons.push(`High reallocated sector count (${reallocated}).`);
    } else if (reallocated > 0) {
      score += 15;
      reasons.push(`Reallocated sector count is non-zero (${reallocated}).`);
    }

    const reallocTrend = history?.trends?.find((t) => t.metric === "reallocatedSectors");
    if (reallocTrend && reallocTrend.delta7d && reallocTrend.delta7d > 5) {
      score += 20;
      reasons.push(`Reallocated sectors accelerated by +${reallocTrend.delta7d} in 7 days.`);
    }

    // 6. Thermal Stress
    const temp = evidence.temperatureC;
    if (temp !== undefined && temp >= 55) {
      score += 15;
      reasons.push(`Operating temperature is high (${temp}°C).`);
    }

    // 7. Read / Write Errors
    const writeErrors = evidence.writeErrors ?? 0;
    const readErrors = evidence.readErrors ?? 0;
    if (writeErrors > 0 || readErrors > 10) {
      score += 15;
      reasons.push(`Elevated read/write error counters (Write: ${writeErrors}, Read: ${readErrors}).`);
    }

    // 8. Array Degradation Context
    if (history?.arrayDegraded) {
      score += 20;
      reasons.push("Operating in degraded storage array with reduced redundancy.");
    }

    // 9. High Power-On Hours (> 35,000 hrs ~ 4 years 24/7)
    const poh = evidence.powerOnHours;
    if (poh !== undefined && poh > 35000) {
      score += 10;
      reasons.push(`High operational service life (${Math.round(poh / 8760 * 10) / 10} years continuous).`);
    }

    const failureProbability = Number(Math.min(1.0, score / 100).toFixed(2));

    let risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
    if (failureProbability >= 0.80 || score >= 80) {
      risk = "CRITICAL";
    } else if (failureProbability >= 0.50 || score >= 50) {
      risk = "HIGH";
    } else if (failureProbability >= 0.25 || score >= 25) {
      risk = "MEDIUM";
    }

    if (reasons.length === 0) {
      reasons.push("Telemetry parameters within nominal manufacturer tolerances.");
    }

    return {
      diskId: evidence.diskId,
      failureProbability,
      risk,
      predictedWindowHours,
      reasons,
      modelVersion: this.modelVersion,
      generatedAt: new Date(),
    };
  }
}
