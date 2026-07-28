import type { DiskHealth, DiskStatus } from "@/lib/types/operational-health";

export interface HddFleetSummary {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  missing: number;
  branchesAtRisk: number;
}

export function summarizeHddFleet(disks: DiskHealth[]): HddFleetSummary {
  const criticalStatuses: DiskStatus[] = ["degraded", "failure_predicted", "failed"];
  return {
    total: disks.length,
    healthy: disks.filter((disk) => disk.smartStatus === "healthy").length,
    warning: disks.filter((disk) => disk.smartStatus === "warning").length,
    critical: disks.filter((disk) => criticalStatuses.includes(disk.smartStatus)).length,
    missing: disks.filter((disk) => disk.smartStatus === "missing").length,
    branchesAtRisk: new Set(disks.filter((disk) => disk.smartStatus !== "healthy").map((disk) => disk.branchId)).size,
  };
}

export function rankAtRiskDisks(disks: DiskHealth[], limit = 8) {
  return [...disks]
    .filter((disk) => disk.smartStatus !== "healthy")
    .sort((left, right) => right.failureProbability - left.failureProbability)
    .slice(0, limit);
}
