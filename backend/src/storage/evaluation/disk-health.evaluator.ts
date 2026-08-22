import type {
  DiskEvidence,
  DiskHealthState,
  SmartState,
} from "../domain/disk-evidence.js";
import type {
  DiskHealthReason,
  DiskHealthSnapshot,
  DiskOperationalState,
  StorageRole,
} from "../domain/disk-health.js";
import type { DiskHealthPolicy } from "../domain/disk-policy.js";
import { DEFAULT_BANKING_STORAGE_POLICY } from "../domain/disk-policy.js";
import type { FailurePrediction } from "../domain/disk-health.js";
import type { StorageArray } from "../domain/storage-array.js";

export class DiskHealthEvaluator {
  constructor(private readonly policy: DiskHealthPolicy = DEFAULT_BANKING_STORAGE_POLICY) {}

  evaluate(
    evidence: DiskEvidence,
    options?: {
      array?: StorageArray | undefined;
      prediction?: FailurePrediction | undefined;
      role?: StorageRole | undefined;
      previousSnapshot?: DiskHealthSnapshot | undefined;
    },
  ): DiskHealthSnapshot {
    const reasons: DiskHealthReason[] = [];
    const now = new Date();

    // Check observation freshness
    const ageSeconds = (now.getTime() - evidence.observedAt.getTime()) / 1000;
    const isStale = ageSeconds > this.policy.maxObservationAgeSeconds;
    if (isStale) {
      reasons.push({
        code: "DISK_TELEMETRY_STALE",
        severity: "WARNING",
        message: `Last disk telemetry was received ${Math.round(ageSeconds / 60)} minutes ago.`,
        source: evidence.source,
      });
    }

    let finalState: DiskHealthState = "HEALTHY";
    let healthScore = 100;

    // 1. Missing Disk Check
    if (evidence.state === "MISSING") {
      finalState = "MISSING";
      healthScore = 0;
      reasons.push({
        code: "DISK_MISSING",
        severity: "CRITICAL",
        message: `Physical disk in slot ${evidence.slot ?? 1} is missing or removed.`,
        source: evidence.source,
      });
      return this.buildSnapshot(evidence, finalState, healthScore, reasons, isStale, options);
    }

    // 2. Hard SMART Failure
    if (evidence.smartStatus === "FAILED") {
      finalState = "FAILED";
      healthScore = 0;
      reasons.push({
        code: "SMART_FAILED",
        severity: "CRITICAL",
        message: "SMART overall health self-test reports FAILED.",
        source: evidence.source,
      });
    }

    // 3. RAID Failure
    if (options?.array?.state === "FAILED") {
      finalState = "FAILED";
      healthScore = Math.min(healthScore, 10);
      reasons.push({
        code: "ARRAY_FAILED",
        severity: "CRITICAL",
        message: `Storage Array ${options.array.id} has FAILED.`,
        source: evidence.source,
      });
    }

    // 4. Recorder Reported Failure
    if (evidence.state === "FAILED" && finalState !== "FAILED") {
      finalState = "FAILED";
      healthScore = Math.min(healthScore, 10);
      reasons.push({
        code: "RECORDER_DISK_FAILED",
        severity: "CRITICAL",
        message: `Recorder reported disk failure (${evidence.recorderReportedState ?? "error"}).`,
        source: evidence.source,
      });
    }

    // 5. Critical Sector Errors (Pending / Reallocated / Uncorrectable)
    const pending = evidence.pendingSectors ?? 0;
    const reallocated = evidence.reallocatedSectors ?? 0;
    const uncorrectable = evidence.offlineUncorrectableSectors ?? 0;

    if (pending >= this.policy.criticalPendingSectors) {
      if (finalState !== "FAILED") finalState = "CRITICAL";
      healthScore -= 45;
      reasons.push({
        code: "PENDING_SECTORS_CRITICAL",
        severity: "CRITICAL",
        message: `Disk has ${pending} pending sectors awaiting reallocation (critical threshold: ${this.policy.criticalPendingSectors}).`,
        source: evidence.source,
      });
    }

    if (reallocated >= this.policy.criticalReallocatedSectors) {
      if (finalState !== "FAILED") finalState = "CRITICAL";
      healthScore -= 35;
      reasons.push({
        code: "REALLOCATED_SECTORS_CRITICAL",
        severity: "CRITICAL",
        message: `Disk has accumulated ${reallocated} reallocated sectors (critical threshold: ${this.policy.criticalReallocatedSectors}).`,
        source: evidence.source,
      });
    }

    if (uncorrectable >= this.policy.criticalUncorrectableSectors) {
      if (finalState !== "FAILED") finalState = "CRITICAL";
      healthScore -= 40;
      reasons.push({
        code: "UNCORRECTABLE_ERRORS_CRITICAL",
        severity: "CRITICAL",
        message: `Disk reported ${uncorrectable} offline uncorrectable sector read failures.`,
        source: evidence.source,
      });
    }

    // 6. Thermal Critical
    const temp = evidence.temperatureC;
    if (temp !== undefined && temp >= this.policy.criticalTemperatureC.enter) {
      if (finalState !== "FAILED") finalState = "CRITICAL";
      healthScore -= 30;
      reasons.push({
        code: "DISK_OVER_TEMPERATURE_CRITICAL",
        severity: "CRITICAL",
        message: `Disk temperature is ${temp}°C (critical limit: ${this.policy.criticalTemperatureC.enter}°C).`,
        source: evidence.source,
      });
    }

    // 7. Capacity Critical
    const usage = evidence.usagePercent;
    if (usage !== undefined && usage >= this.policy.criticalUsagePercent.enter) {
      healthScore -= 20;
      reasons.push({
        code: "STORAGE_CAPACITY_CRITICAL",
        severity: "CRITICAL",
        message: `Disk storage capacity is ${usage}% full (critical threshold: ${this.policy.criticalUsagePercent.enter}%).`,
        source: evidence.source,
      });
    }

    // 8. Warning Indicators
    if (finalState === "HEALTHY") {
      if (pending >= this.policy.warningPendingSectors) {
        finalState = "WARNING";
        healthScore -= 20;
        reasons.push({
          code: "DISK_PENDING_SECTORS",
          severity: "WARNING",
          message: `Disk has ${pending} pending sectors.`,
          source: evidence.source,
        });
      }

      if (reallocated >= this.policy.warningReallocatedSectors) {
        finalState = "WARNING";
        healthScore -= 15;
        reasons.push({
          code: "DISK_REALLOCATED_SECTORS",
          severity: "WARNING",
          message: `Disk has ${reallocated} reallocated sectors.`,
          source: evidence.source,
        });
      }

      if (temp !== undefined && temp >= this.policy.warningTemperatureC.enter) {
        finalState = "WARNING";
        healthScore -= 15;
        reasons.push({
          code: "DISK_OVER_TEMPERATURE",
          severity: "WARNING",
          message: `Disk temperature is elevated at ${temp}°C.`,
          source: evidence.source,
        });
      }

      if (usage !== undefined && usage >= this.policy.warningUsagePercent.enter) {
        healthScore -= 15;
        reasons.push({
          code: "STORAGE_CAPACITY_LOW",
          severity: "WARNING",
          message: `Disk storage capacity is ${usage}% full.`,
          source: evidence.source,
        });
      }

      if (options?.array?.state === "DEGRADED") {
        finalState = "WARNING";
        healthScore -= 25;
        reasons.push({
          code: "ARRAY_DEGRADED",
          severity: "WARNING",
          message: `RAID array ${options.array.id} is running in DEGRADED mode.`,
          source: evidence.source,
        });
      }

      if (options?.prediction && options.prediction.risk === "HIGH") {
        finalState = "WARNING";
        healthScore -= 20;
        reasons.push({
          code: "DISK_FAILURE_PREDICTED",
          severity: "WARNING",
          message: `Predictive telemetry indicates ${Math.round(options.prediction.failureProbability * 100)}% failure risk.`,
        });
      }
    }

    // Fallback to UNKNOWN if evidence is inconclusive
    if (evidence.state === "UNKNOWN" && reasons.length === 0) {
      finalState = "UNKNOWN";
      healthScore = 50;
    }

    healthScore = Math.max(0, Math.min(100, healthScore));

    return this.buildSnapshot(evidence, finalState, healthScore, reasons, isStale, options);
  }

  private buildSnapshot(
    evidence: DiskEvidence,
    state: DiskHealthState,
    healthScore: number,
    reasons: DiskHealthReason[],
    isStale: boolean,
    options?: {
      array?: StorageArray | undefined;
      prediction?: FailurePrediction | undefined;
      role?: StorageRole | undefined;
    },
  ): DiskHealthSnapshot {
    const operationalState: DiskOperationalState = {
      hardwareHealth: state,
      capacityHealth:
        (evidence.usagePercent ?? 0) >= this.policy.criticalUsagePercent.enter
          ? "CRITICAL"
          : (evidence.usagePercent ?? 0) >= this.policy.warningUsagePercent.enter
          ? "WARNING"
          : evidence.usagePercent !== undefined
          ? "HEALTHY"
          : "UNKNOWN",
      recordingHealth:
        state === "FAILED" || state === "MISSING"
          ? "STOPPED"
          : state === "CRITICAL" || state === "WARNING"
          ? "DEGRADED"
          : "ACTIVE",
      arrayHealth: options?.array?.state ?? "HEALTHY",
    };

    return {
      diskId: evidence.diskId,
      serialNumber: evidence.serialNumber,
      model: evidence.model,
      slot: evidence.slot,
      recorderId: evidence.recorderId,
      branchId: evidence.branchId,
      state,
      healthScore,
      operationalState,
      storageRole: options?.role ?? "RECORDING",
      smartStatus: evidence.smartStatus ?? "UNAVAILABLE",
      temperatureC: evidence.temperatureC,
      powerOnHours: evidence.powerOnHours,
      reallocatedSectors: evidence.reallocatedSectors,
      pendingSectors: evidence.pendingSectors,
      offlineUncorrectableSectors: evidence.offlineUncorrectableSectors,
      totalBytes: evidence.totalBytes,
      usedBytes: evidence.usedBytes,
      freeBytes: evidence.freeBytes,
      usagePercent: evidence.usagePercent,
      arrayStatus: options?.array?.state,
      arrayId: options?.array?.id,
      predictedFailure: options?.prediction ? options.prediction.risk === "HIGH" || options.prediction.risk === "CRITICAL" : false,
      prediction: options?.prediction,
      evidence: [evidence],
      reasons,
      isStale,
      evaluatedAt: new Date(),
    };
  }
}
