import { describe, expect, it } from "vitest";
import { rankAtRiskDisks, summarizeHddFleet } from "../components/operational-health/hdd-fleet-model.js";
import type { DiskHealth, DiskStatus } from "../lib/types/operational-health.js";

describe("HDD fleet dashboard model", () => {
  it("counts independent HDD evidence and ranks operational risk", () => {
    const disks = [
      disk("healthy", 5, "branch-a"),
      disk("warning", 35, "branch-b"),
      disk("failure_predicted", 88, "branch-b"),
      disk("missing", 100, "branch-c"),
    ];
    expect(summarizeHddFleet(disks)).toEqual({
      total: 4, detected: 3, missing: 1, smartHealthy: 1, smartUnavailable: 1,
      raidAtRisk: 0, writeVerified: 1, writeFailed: 1, writeUnverified: 2,
      capacityCritical: 1, branchesAtRisk: 2,
    });
    expect(rankAtRiskDisks(disks, 2).map((item) => item.failureProbability)).toEqual([100, 88]);
  });
});

function disk(smartStatus: DiskStatus, failureProbability: number, branchId: string): DiskHealth {
  const missing = smartStatus === "missing";
  const critical = ["failure_predicted", "failed", "missing"].includes(smartStatus);
  return {
    id: `${branchId}-${smartStatus}`, branchId, branchName: branchId, branchCode: branchId,
    devicePath: "/dev/disk", serialNumber: "serial", model: "model",
    detected: !missing, slotStatus: missing ? "missing" : "present",
    smartAvailable: !missing, smartStatus,
    temperature: 40, powerOnHours: 100, reallocatedSectors: 0, pendingSectors: 0,
    uncorrectableSectors: 0, readErrors: 0, writeErrors: 0,
    capacityBytes: 100, availableBytes: smartStatus === "failure_predicted" ? 4 : 50,
    usedBytes: smartStatus === "failure_predicted" ? 96 : 50,
    usagePercent: smartStatus === "failure_predicted" ? 96 : 50,
    raidStatus: "not_configured", raidLevel: "", raidMemberCount: 0,
    raidFailedMemberCount: 0, raidRebuildPercent: 0,
    writeVerification: smartStatus === "healthy" ? "verified" : smartStatus === "failure_predicted" ? "failed" : "unverified",
    writeVerifiedAt: "", writeLatencyMs: 0, failureProbability,
    predictionBasis: missing ? "unavailable" : "threshold_only", sectorGrowth: 0, ioErrorGrowth: 0,
    replacementDetected: false, previousSerialNumber: "",
    operationalStatus: missing || critical ? "critical" : smartStatus === "warning" ? "warning" : "healthy",
    reasonCodes: [], lastCheck: "2026-07-28T00:00:00.000Z",
  };
}
