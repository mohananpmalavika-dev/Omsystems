import { describe, expect, it } from "vitest";
import { rankAtRiskDisks, summarizeHddFleet } from "../components/operational-health/hdd-fleet-model.js";
import type { DiskHealth, DiskStatus } from "../lib/types/operational-health.js";

describe("HDD fleet dashboard model", () => {
  it("counts color states and ranks the highest SMART risks", () => {
    const disks = [
      disk("healthy", 5, "branch-a"),
      disk("warning", 35, "branch-b"),
      disk("failure_predicted", 88, "branch-b"),
      disk("missing", 100, "branch-c"),
    ];
    expect(summarizeHddFleet(disks)).toEqual({
      total: 4, healthy: 1, warning: 1, critical: 1, missing: 1, branchesAtRisk: 2,
    });
    expect(rankAtRiskDisks(disks, 2).map((item) => item.failureProbability)).toEqual([100, 88]);
  });
});

function disk(smartStatus: DiskStatus, failureProbability: number, branchId: string): DiskHealth {
  return {
    id: `${branchId}-${smartStatus}`, branchId, branchName: branchId, branchCode: branchId,
    devicePath: "/dev/disk", serialNumber: "serial", model: "model", smartStatus,
    temperature: 40, powerOnHours: 100, reallocatedSectors: 0, pendingSectors: 0,
    uncorrectableSectors: 0, failureProbability, lastCheck: "2026-07-28T00:00:00.000Z",
  };
}
