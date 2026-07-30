import type { DiskHealth } from "@/lib/types/operational-health";

export interface HddFleetSummary {
  total: number;
  detected: number;
  missing: number;
  smartHealthy: number;
  smartUnavailable: number;
  raidAtRisk: number;
  writeVerified: number;
  writeFailed: number;
  writeUnverified: number;
  capacityCritical: number;
  branchesAtRisk: number;
}

export function summarizeHddFleet(disks: DiskHealth[]): HddFleetSummary {
  const atRisk = disks.filter((disk) => disk.operationalStatus === "warning" || disk.operationalStatus === "critical");
  return {
    total: disks.length,
    detected: disks.filter((disk) => disk.detected).length,
    missing: disks.filter((disk) => !disk.detected || disk.slotStatus === "missing").length,
    smartHealthy: disks.filter((disk) => disk.smartAvailable && disk.smartStatus === "healthy").length,
    smartUnavailable: disks.filter((disk) => !disk.smartAvailable || disk.smartStatus === "unknown").length,
    raidAtRisk: disks.filter((disk) => ["degraded", "rebuilding", "failed"].includes(disk.raidStatus)).length,
    writeVerified: disks.filter((disk) => disk.writeVerification === "verified").length,
    writeFailed: disks.filter((disk) => disk.writeVerification === "failed").length,
    writeUnverified: disks.filter((disk) => disk.writeVerification === "unverified").length,
    capacityCritical: disks.filter((disk) => disk.usagePercent >= 95).length,
    branchesAtRisk: new Set(atRisk.map((disk) => disk.branchId)).size,
  };
}

export function rankAtRiskDisks(disks: DiskHealth[], limit = 8) {
  const rank = { critical: 3, warning: 2, unknown: 1, healthy: 0 } as const;
  return [...disks]
    .filter((disk) => disk.operationalStatus !== "healthy")
    .sort((left, right) => rank[right.operationalStatus] - rank[left.operationalStatus]
      || right.failureProbability - left.failureProbability
      || right.usagePercent - left.usagePercent)
    .slice(0, limit);
}
