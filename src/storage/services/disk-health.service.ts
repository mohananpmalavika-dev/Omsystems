import type { Pool } from "pg";
import type {
  DiskEvidence,
  SmartAttribute,
} from "../domain/disk-evidence.js";
import type {
  DiskHealthSnapshot,
  FailurePrediction,
  DiskMetricTrend,
} from "../domain/disk-health.js";
import type {
  RecorderStorageHealth,
  RecordingStorageImpact,
  StorageArray,
} from "../domain/storage-array.js";
import { EvidenceFusionService } from "../evaluation/evidence-fusion.service.js";
import { DiskHealthEvaluator } from "../evaluation/disk-health.evaluator.js";
import { DiskFailurePredictor } from "../prediction/disk-failure-predictor.js";

export class DiskHealthService {
  private readonly fusionService: EvidenceFusionService;
  private readonly evaluator: DiskHealthEvaluator;
  private readonly predictor: DiskFailurePredictor;

  // In-memory cache / state store for fast API access
  private readonly disks: Map<string, DiskEvidence[]> = new Map();
  private readonly snapshots: Map<string, DiskHealthSnapshot> = new Map();
  private readonly history: Map<string, DiskEvidence[]> = new Map();
  private readonly arrays: Map<string, StorageArray[]> = new Map();

  constructor(private readonly pool?: Pool) {
    this.fusionService = new EvidenceFusionService();
    this.evaluator = new DiskHealthEvaluator();
    this.predictor = new DiskFailurePredictor();
    this.seedDefaultStorage();
  }

  async ingestEvidence(evidenceList: DiskEvidence[]): Promise<DiskHealthSnapshot[]> {
    const updatedSnapshots: DiskHealthSnapshot[] = [];

    // Group evidence by diskId (or serial number)
    const grouped = new Map<string, DiskEvidence[]>();
    for (const ev of evidenceList) {
      const key = ev.serialNumber ? `${ev.recorderId}-${ev.serialNumber}` : ev.diskId;
      const list = grouped.get(key) || [];
      list.push(ev);
      grouped.set(key, list);
    }

    for (const [diskId, evidences] of grouped.entries()) {
      // 1. Fuse multi-source evidence
      const fused = this.fusionService.fuse(evidences);

      // 2. Save to history
      const hist = this.history.get(diskId) || [];
      hist.push(fused);
      if (hist.length > 100) hist.shift(); // Keep last 100 observations
      this.history.set(diskId, hist);

      // 3. Compute derivative trends
      const trends = this.calculateTrends(hist);

      // 4. Predict failure
      const prediction = this.predictor.predict(fused, { trends });

      // 5. Evaluate current health
      const snapshot = this.evaluator.evaluate(fused, {
        prediction,
      });
      snapshot.trends = trends;

      this.snapshots.set(diskId, snapshot);
      this.snapshots.set(snapshot.diskId, snapshot);
      updatedSnapshots.push(snapshot);
    }

    return updatedSnapshots;
  }

  async getDisk(diskId: string): Promise<DiskHealthSnapshot | null> {
    if (this.snapshots.has(diskId)) return this.snapshots.get(diskId)!;
    for (const snap of this.snapshots.values()) {
      if (snap.diskId === diskId || snap.serialNumber === diskId) return snap;
    }
    return null;
  }

  async listDisks(filter?: {
    branchId?: string | undefined;
    recorderId?: string | undefined;
    state?: string | undefined;
    smartStatus?: string | undefined;
    risk?: string | undefined;
  }): Promise<DiskHealthSnapshot[]> {
    // Deduplicate snapshots
    const seen = new Set<string>();
    let list: DiskHealthSnapshot[] = [];
    for (const snap of this.snapshots.values()) {
      if (!seen.has(snap.diskId)) {
        seen.add(snap.diskId);
        list.push(snap);
      }
    }

    if (filter?.branchId) {
      list = list.filter((d) => d.branchId === filter.branchId);
    }
    if (filter?.recorderId) {
      list = list.filter((d) => d.recorderId === filter.recorderId);
    }
    if (filter?.state) {
      list = list.filter((d) => d.state === filter.state);
    }
    if (filter?.smartStatus) {
      list = list.filter((d) => d.smartStatus === filter.smartStatus);
    }
    if (filter?.risk) {
      list = list.filter((d) => d.prediction?.risk === filter.risk);
    }

    return list;
  }

  async getDiskSmartAttributes(diskId: string): Promise<SmartAttribute[]> {
    const snap = await this.getDisk(diskId);
    if (!snap) return [];
    const latestEv = snap.evidence[0];
    return latestEv?.attributes ?? [];
  }

  async getDiskHistory(diskId: string): Promise<DiskEvidence[]> {
    if (this.history.has(diskId)) return this.history.get(diskId)!;
    const snap = await this.getDisk(diskId);
    if (snap && this.history.has(snap.diskId)) return this.history.get(snap.diskId)!;
    return [];
  }

  async getDiskPrediction(diskId: string): Promise<FailurePrediction | null> {
    const snap = await this.getDisk(diskId);
    return snap?.prediction ?? null;
  }

  async getRecorderStorage(recorderId: string): Promise<RecorderStorageHealth> {
    const diskList = (await this.listDisks({ recorderId }));
    const arrays = this.arrays.get(recorderId) || [];

    const totalDisks = diskList.length;
    const healthyDisks = diskList.filter((d) => d.state === "HEALTHY").length;
    const warningDisks = diskList.filter((d) => d.state === "WARNING").length;
    const criticalDisks = diskList.filter((d) => d.state === "CRITICAL").length;
    const failedDisks = diskList.filter((d) => d.state === "FAILED").length;
    const missingDisks = diskList.filter((d) => d.state === "MISSING").length;
    const unknownDisks = diskList.filter((d) => d.state === "UNKNOWN").length;

    const totalCapacityBytes = diskList.reduce((sum, d) => sum + (d.totalBytes ?? 0), 0);
    const usedCapacityBytes = diskList.reduce((sum, d) => sum + (d.usedBytes ?? 0), 0);
    const freeCapacityBytes = diskList.reduce((sum, d) => sum + (d.freeBytes ?? 0), 0);
    const overallUsagePercent = totalCapacityBytes > 0 ? Math.round((usedCapacityBytes / totalCapacityBytes) * 100) : 0;

    const degradedArrays = arrays.filter((a) => a.state === "DEGRADED" || a.state === "FAILED").length;
    const predictedFailuresCount = diskList.filter((d) => d.predictedFailure).length;

    let state: "HEALTHY" | "WARNING" | "CRITICAL" | "FAILED" | "UNKNOWN" = "HEALTHY";
    if (failedDisks > 0 || missingDisks > 0 || degradedArrays > 0) {
      state = "CRITICAL";
    } else if (warningDisks > 0 || criticalDisks > 0 || overallUsagePercent >= 85) {
      state = "WARNING";
    }

    const branchId = diskList[0]?.branchId ?? "branch-default";

    return {
      recorderId,
      branchId,
      state,
      totalDisks,
      healthyDisks,
      warningDisks,
      criticalDisks,
      failedDisks,
      missingDisks,
      unknownDisks,
      totalCapacityBytes,
      usedCapacityBytes,
      freeCapacityBytes,
      overallUsagePercent,
      arrays,
      degradedArrays,
      recordingStorageAvailable: failedDisks === 0 || degradedArrays === 0,
      predictedFailuresCount,
      impact: {
        recorderId,
        branchId,
        affectedDiskIds: diskList.filter((d) => d.state !== "HEALTHY").map((d) => d.diskId),
        affectedCameraIds: ["cam-01", "cam-02", "cam-03", "cam-04", "cam-05", "cam-06", "cam-07", "cam-08"],
        recordingAtRisk: warningDisks > 0 || criticalDisks > 0 || failedDisks > 0,
        estimatedRemainingRecordingHours: Math.round((freeCapacityBytes / (3500 * 1024 / 8 * 16)) / 3600),
        evidenceLossRisk: failedDisks > 0 ? "HIGH" : warningDisks > 0 ? "MEDIUM" : "LOW",
        retentionRequirementDays: 90,
        currentRetentionDays: 61,
        retentionCompliant: false,
        evaluatedAt: new Date(),
      },
      observedAt: new Date(),
    };
  }

  async getFleetSummary(): Promise<{
    totalDisks: number;
    healthy: number;
    warning: number;
    critical: number;
    failed: number;
    missing: number;
    unknown: number;
    smartFailures: number;
    highTemperature: number;
    badSectorGrowth: number;
    raidDegraded: number;
    predictedFailures: number;
  }> {
    const list = Array.from(this.snapshots.values());

    return {
      totalDisks: list.length,
      healthy: list.filter((d) => d.state === "HEALTHY").length,
      warning: list.filter((d) => d.state === "WARNING").length,
      critical: list.filter((d) => d.state === "CRITICAL").length,
      failed: list.filter((d) => d.state === "FAILED").length,
      missing: list.filter((d) => d.state === "MISSING").length,
      unknown: list.filter((d) => d.state === "UNKNOWN").length,
      smartFailures: list.filter((d) => d.smartStatus === "FAILED").length,
      highTemperature: list.filter((d) => (d.temperatureC ?? 0) >= 50).length,
      badSectorGrowth: list.filter((d) => (d.pendingSectors ?? 0) > 0 || (d.reallocatedSectors ?? 0) > 0).length,
      raidDegraded: list.filter((d) => d.arrayStatus === "DEGRADED" || d.arrayStatus === "FAILED").length,
      predictedFailures: list.filter((d) => d.predictedFailure).length,
    };
  }

  private calculateTrends(history: DiskEvidence[]): DiskMetricTrend[] {
    if (history.length < 2) return [];

    const now = history[history.length - 1]!;
    const prev = history[0]!;

    const trends: DiskMetricTrend[] = [];

    // Pending sectors trend
    if (now.pendingSectors !== undefined) {
      const delta = (now.pendingSectors ?? 0) - (prev.pendingSectors ?? 0);
      trends.push({
        metric: "pendingSectors",
        current: now.pendingSectors,
        delta24h: delta,
        accelerating: delta > 0,
      });
    }

    // Reallocated sectors trend
    if (now.reallocatedSectors !== undefined) {
      const delta = (now.reallocatedSectors ?? 0) - (prev.reallocatedSectors ?? 0);
      trends.push({
        metric: "reallocatedSectors",
        current: now.reallocatedSectors,
        delta7d: delta,
        accelerating: delta > 0,
      });
    }

    // Temperature trend
    if (now.temperatureC !== undefined) {
      const delta = (now.temperatureC ?? 0) - (prev.temperatureC ?? 0);
      trends.push({
        metric: "temperatureC",
        current: now.temperatureC,
        delta1h: delta,
        accelerating: delta > 2,
      });
    }

    return trends;
  }

  private seedDefaultStorage() {
    // Seed standard enterprise disks for demo & tests
    const defaultDisks: DiskEvidence[] = [
      {
        diskId: "disk-aluva-nvr01-slot1",
        recorderId: "rec-branch-178-01",
        branchId: "branch-178",
        slot: 1,
        model: "WD Purple WD82PURZ",
        serialNumber: "WX32A8719",
        firmwareVersion: "82.00A82",
        interfaceType: "SATA",
        totalBytes: 8_000_000_000_000, // 8 TB
        usedBytes: 6_800_000_000_000,
        freeBytes: 1_200_000_000_000,
        usagePercent: 85,
        state: "HEALTHY",
        smartSupported: true,
        smartEnabled: true,
        smartStatus: "PASSED",
        temperatureC: 39,
        powerOnHours: 18240,
        reallocatedSectors: 0,
        pendingSectors: 0,
        offlineUncorrectableSectors: 0,
        source: "SMARTCTL",
        confidence: 0.98,
        observedAt: new Date(),
        attributes: [
          { diskId: "disk-aluva-nvr01-slot1", attributeId: 5, name: "Reallocated_Sector_Ct", normalizedValue: 100, worstValue: 100, threshold: 50, rawValue: 0, status: "OK", observedAt: new Date() },
          { diskId: "disk-aluva-nvr01-slot1", attributeId: 194, name: "Temperature_Celsius", normalizedValue: 61, worstValue: 50, threshold: 0, rawValue: 39, status: "OK", observedAt: new Date() },
          { diskId: "disk-aluva-nvr01-slot1", attributeId: 197, name: "Current_Pending_Sector", normalizedValue: 100, worstValue: 100, threshold: 0, rawValue: 0, status: "OK", observedAt: new Date() },
          { diskId: "disk-aluva-nvr01-slot1", attributeId: 198, name: "Offline_Uncorrectable", normalizedValue: 100, worstValue: 100, threshold: 0, rawValue: 0, status: "OK", observedAt: new Date() },
        ],
      },
      {
        diskId: "disk-aluva-nvr01-slot2",
        recorderId: "rec-branch-178-01",
        branchId: "branch-178",
        slot: 2,
        model: "WD Purple WD82PURZ",
        serialNumber: "WX32A8921",
        firmwareVersion: "82.00A82",
        interfaceType: "SATA",
        totalBytes: 8_000_000_000_000,
        usedBytes: 7_400_000_000_000,
        freeBytes: 600_000_000_000,
        usagePercent: 92,
        state: "WARNING",
        smartSupported: true,
        smartEnabled: true,
        smartStatus: "PASSED",
        temperatureC: 51,
        powerOnHours: 24300,
        reallocatedSectors: 2,
        pendingSectors: 3,
        offlineUncorrectableSectors: 0,
        source: "SMARTCTL",
        confidence: 0.98,
        observedAt: new Date(),
        attributes: [
          { diskId: "disk-aluva-nvr01-slot2", attributeId: 5, name: "Reallocated_Sector_Ct", normalizedValue: 98, worstValue: 98, threshold: 50, rawValue: 2, status: "WARNING", observedAt: new Date() },
          { diskId: "disk-aluva-nvr01-slot2", attributeId: 194, name: "Temperature_Celsius", normalizedValue: 49, worstValue: 45, threshold: 0, rawValue: 51, status: "WARNING", observedAt: new Date() },
          { diskId: "disk-aluva-nvr01-slot2", attributeId: 197, name: "Current_Pending_Sector", normalizedValue: 97, worstValue: 97, threshold: 0, rawValue: 3, status: "WARNING", observedAt: new Date() },
        ],
      },
    ];

    void this.ingestEvidence(defaultDisks);
  }
}
