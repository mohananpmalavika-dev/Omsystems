import type { DiskHealthCollector, StorageTarget } from "./disk-collector.interface.js";
import type {
  DiskEvidence,
  DiskEvidenceSource,
  DiskHealthState,
  SmartState,
} from "../domain/disk-evidence.js";

export class RecorderDiskCollector implements DiskHealthCollector {
  readonly source: DiskEvidenceSource = "RECORDER_API";

  async supports(target: StorageTarget): Promise<boolean> {
    return Boolean(target.adapterInstance || target.host);
  }

  async collect(target: StorageTarget): Promise<DiskEvidence[]> {
    const results: DiskEvidence[] = [];
    const now = new Date();

    if (!target.adapterInstance) {
      return results;
    }

    try {
      const storageResult = await target.adapterInstance.getStorageStatus();

      if (!storageResult || storageResult.status === "unknown") {
        return [
          {
            diskId: `${target.recorderId}-disk-unknown`,
            recorderId: target.recorderId,
            branchId: target.branchId,
            tenantId: target.tenantId,
            state: "UNKNOWN",
            smartStatus: "UNAVAILABLE",
            source: this.source,
            confidence: 0.5,
            observedAt: now,
            recorderReportedState: storageResult?.message ?? "Unsupported or unreachable storage API",
          },
        ];
      }

      if (Array.isArray(storageResult.disks) && storageResult.disks.length > 0) {
        for (const disk of storageResult.disks) {
          const slotNum = disk.slot !== undefined ? Number(disk.slot) : undefined;
          const diskId = disk.serialNumber
            ? `${target.recorderId}-${disk.serialNumber}`
            : disk.id
            ? `${target.recorderId}-${disk.id}`
            : `${target.recorderId}-slot-${slotNum ?? 1}`;

          const totalBytes = disk.capacityBytes ?? (disk.totalMB ? disk.totalMB * 1024 * 1024 : undefined);
          const freeBytes = disk.freeBytes ?? (disk.freeMB ? disk.freeMB * 1024 * 1024 : undefined);
          const usedBytes = totalBytes !== undefined && freeBytes !== undefined ? totalBytes - freeBytes : undefined;
          const usagePercent = totalBytes && totalBytes > 0 && usedBytes !== undefined
            ? Math.round((usedBytes / totalBytes) * 100)
            : undefined;

          // Map raw vendor state
          const state: DiskHealthState = this.mapVendorDiskState(disk.status ?? disk.state);

          // SMART status: If vendor API specifically provides SMART status, use it; otherwise UNAVAILABLE
          let smartStatus: SmartState = "UNAVAILABLE";
          if (disk.smartStatus) {
            const raw = String(disk.smartStatus).toLowerCase();
            if (raw.includes("pass") || raw.includes("good") || raw.includes("ok")) smartStatus = "PASSED";
            else if (raw.includes("fail") || raw.includes("bad") || raw.includes("error")) smartStatus = "FAILED";
            else smartStatus = "UNKNOWN";
          }

          results.push({
            diskId,
            recorderId: target.recorderId,
            branchId: target.branchId,
            tenantId: target.tenantId,
            slot: slotNum,
            model: disk.model ?? disk.name,
            serialNumber: disk.serialNumber,
            totalBytes,
            usedBytes,
            freeBytes,
            usagePercent,
            state,
            recorderReportedState: disk.status ?? disk.state,
            smartSupported: Boolean(disk.smartStatus),
            smartEnabled: Boolean(disk.smartStatus),
            smartStatus,
            temperatureC: disk.temperatureC ?? disk.temperature,
            powerOnHours: disk.powerOnHours,
            reallocatedSectors: disk.reallocatedSectors,
            pendingSectors: disk.pendingSectors,
            source: this.source,
            confidence: 0.80,
            observedAt: now,
          });
        }
      } else {
        // Single volume / aggregate storage returned
        const totalBytes = storageResult.totalBytes;
        const usedBytes = storageResult.usedBytes;
        const freeBytes = storageResult.freeBytes ?? (totalBytes && usedBytes ? totalBytes - usedBytes : undefined);
        const usagePercent = storageResult.usagePercent;

        results.push({
          diskId: `${target.recorderId}-volume-0`,
          recorderId: target.recorderId,
          branchId: target.branchId,
          tenantId: target.tenantId,
          slot: 1,
          totalBytes,
          usedBytes,
          freeBytes,
          usagePercent,
          state: storageResult.status === "healthy" ? "HEALTHY" : storageResult.status === "unhealthy" ? "CRITICAL" : "UNKNOWN",
          smartStatus: "UNAVAILABLE",
          source: this.source,
          confidence: 0.75,
          observedAt: now,
          recorderReportedState: storageResult.status,
        });
      }
    } catch (err: any) {
      results.push({
        diskId: `${target.recorderId}-disk-err`,
        recorderId: target.recorderId,
        branchId: target.branchId,
        tenantId: target.tenantId,
        state: "UNKNOWN",
        smartStatus: "UNAVAILABLE",
        source: this.source,
        confidence: 0.3,
        observedAt: now,
        recorderReportedState: `Collector error: ${err?.message ?? err}`,
      });
    }

    return results;
  }

  private mapVendorDiskState(rawState?: string): DiskHealthState {
    if (!rawState) return "UNKNOWN";
    const s = String(rawState).toLowerCase();
    if (s === "ok" || s === "normal" || s === "healthy" || s === "working" || s === "0") return "HEALTHY";
    if (s === "warning" || s === "degraded" || s === "standby") return "WARNING";
    if (s === "critical" || s === "damaged") return "CRITICAL";
    if (s === "failed" || s === "error" || s === "bad" || s === "1") return "FAILED";
    if (s === "missing" || s === "removed" || s === "no_disk") return "MISSING";
    return "UNKNOWN";
  }
}
