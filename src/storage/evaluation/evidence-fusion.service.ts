import type {
  DiskEvidence,
  DiskEvidenceSource,
  DiskHealthState,
  SmartState,
} from "../domain/disk-evidence.js";

const SOURCE_PRIORITY: Record<DiskEvidenceSource, number> = {
  SMARTCTL: 4,
  EDGE_AGENT: 3,
  RECORDER_API: 2,
  SNMP: 1,
};

export class EvidenceFusionService {
  /**
   * Fuses multiple evidence records for a single physical disk into a merged consensus record
   */
  fuse(evidenceList: DiskEvidence[]): DiskEvidence {
    if (!evidenceList.length) {
      throw new Error("Cannot fuse empty evidence list");
    }

    if (evidenceList.length === 1) {
      return evidenceList[0]!;
    }

    // Sort evidence by priority (highest first)
    const sorted = [...evidenceList].sort((a, b) => {
      const pA = SOURCE_PRIORITY[a.source] ?? 0;
      const pB = SOURCE_PRIORITY[b.source] ?? 0;
      return pB - pA;
    });

    const primary = sorted[0]!;

    // Resolve Physical Identity Attributes
    const serialNumber = sorted.find((e) => e.serialNumber)?.serialNumber ?? primary.serialNumber;
    const model = sorted.find((e) => e.model)?.model ?? primary.model;
    const firmwareVersion = sorted.find((e) => e.firmwareVersion)?.firmwareVersion ?? primary.firmwareVersion;
    const slot = sorted.find((e) => e.slot !== undefined)?.slot ?? primary.slot;
    const totalBytes = sorted.find((e) => e.totalBytes !== undefined)?.totalBytes ?? primary.totalBytes;
    const usedBytes = sorted.find((e) => e.usedBytes !== undefined)?.usedBytes ?? primary.usedBytes;
    const freeBytes = sorted.find((e) => e.freeBytes !== undefined)?.freeBytes ?? primary.freeBytes;
    const usagePercent = sorted.find((e) => e.usagePercent !== undefined)?.usagePercent ?? primary.usagePercent;

    // Resolve SMART status: Hard failure in any source overrides "PASSED"
    let smartStatus: SmartState = "UNAVAILABLE";
    if (sorted.some((e) => e.smartStatus === "FAILED")) {
      smartStatus = "FAILED";
    } else if (sorted.some((e) => e.smartStatus === "PASSED")) {
      smartStatus = "PASSED";
    } else if (sorted.some((e) => e.smartStatus === "UNKNOWN")) {
      smartStatus = "UNKNOWN";
    }

    // Resolve Temperature: prefer highest observed temperature across trusted sources
    const temps = sorted.map((e) => e.temperatureC).filter((t): t is number => typeof t === "number");
    const temperatureC = temps.length ? Math.max(...temps) : undefined;

    // Resolve Sector Metrics: use maximum observed error counts
    const pendingList = sorted.map((e) => e.pendingSectors).filter((s): s is number => typeof s === "number");
    const pendingSectors = pendingList.length ? Math.max(...pendingList) : undefined;

    const reallocList = sorted.map((e) => e.reallocatedSectors).filter((s): s is number => typeof s === "number");
    const reallocatedSectors = reallocList.length ? Math.max(...reallocList) : undefined;

    const uncorrectList = sorted.map((e) => e.offlineUncorrectableSectors).filter((s): s is number => typeof s === "number");
    const offlineUncorrectableSectors = uncorrectList.length ? Math.max(...uncorrectList) : undefined;

    const powerHours = sorted.find((e) => e.powerOnHours !== undefined)?.powerOnHours ?? primary.powerOnHours;

    // Resolve Hardware State: Priority to hard failure
    let state: DiskHealthState = primary.state;
    if (sorted.some((e) => e.state === "MISSING")) {
      state = "MISSING";
    } else if (sorted.some((e) => e.state === "FAILED") || smartStatus === "FAILED") {
      state = "FAILED";
    } else if (sorted.some((e) => e.state === "CRITICAL")) {
      state = "CRITICAL";
    } else if (sorted.some((e) => e.state === "WARNING")) {
      state = "WARNING";
    }

    // Combine attributes table
    const attributes = sorted.find((e) => e.attributes && e.attributes.length > 0)?.attributes ?? primary.attributes;

    return {
      diskId: primary.diskId,
      recorderId: primary.recorderId,
      branchId: primary.branchId,
      tenantId: primary.tenantId,
      slot,
      model,
      serialNumber,
      firmwareVersion,
      interfaceType: primary.interfaceType,
      totalBytes,
      usedBytes,
      freeBytes,
      usagePercent,
      state,
      recorderReportedState: primary.recorderReportedState,
      smartSupported: sorted.some((e) => e.smartSupported),
      smartEnabled: sorted.some((e) => e.smartEnabled),
      smartStatus,
      temperatureC,
      powerOnHours: powerHours,
      reallocatedSectors,
      pendingSectors,
      offlineUncorrectableSectors,
      attributes,
      source: primary.source,
      confidence: Math.max(...sorted.map((e) => e.confidence)),
      observedAt: new Date(),
    };
  }
}
