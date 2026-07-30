import { describe, expect, it } from "vitest";
import {
  applyDiskHistory,
  diskToMetrics,
  normalizeRecorderHddStatus,
} from "../src/operational-health/disk-health.js";

describe("recorder disk-health normalization", () => {
  it("keeps slot, SMART, RAID, capacity, and write evidence independent", () => {
    const [disk] = normalizeRecorderHddStatus([{
      diskNo: 1,
      state: "Normal",
      capacity: "4000GB",
      freeSpace: "1200GB",
      raidStatus: "Degraded",
      raidLevel: "RAID5",
      writeVerified: false,
    }]);

    expect(disk).toMatchObject({
      detected: true,
      slotStatus: "present",
      smartAvailable: false,
      smartStatus: "unknown",
      capacityBytes: 4_000_000_000_000,
      availableBytes: 1_200_000_000_000,
      usedBytes: 2_800_000_000_000,
      usagePercent: 70,
      raidStatus: "degraded",
      raidLevel: "RAID5",
      writeVerification: "failed",
      operationalStatus: "critical",
    });
    expect(disk?.reasonCodes).toEqual(expect.arrayContaining(["smart_telemetry_unavailable", "raid_degraded", "recording_write_failed"]));
  });

  it.each([
    ["missing", false, "missing", "critical"],
    ["uninitialized", true, "uninitialized", "warning"],
    ["read-only", true, "read_only", "warning"],
  ] as const)("classifies %s slots explicitly", (state, detected, slotStatus, operationalStatus) => {
    expect(normalizeRecorderHddStatus([{ diskNo: 1, state }])[0]).toMatchObject({
      detected, slotStatus, operationalStatus,
    });
  });

  it("uses immutable prior-slot metrics to expose growing errors", () => {
    const [previous] = normalizeRecorderHddStatus([{
      diskNo: 1, state: "normal", serial: "SER-1", smartStatus: "healthy",
      reallocatedSectors: 1, readErrors: 2,
    }]);
    const [current] = normalizeRecorderHddStatus([{
      diskNo: 1, state: "normal", serial: "SER-1", smartStatus: "healthy",
      reallocatedSectors: 4, readErrors: 12,
    }]);
    const enriched = applyDiskHistory(current!, diskToMetrics(previous!));

    expect(enriched).toMatchObject({ predictionBasis: "historical_delta", sectorGrowth: 3, ioErrorGrowth: 10 });
    expect(enriched.failureProbability).toBeGreaterThan(current!.failureProbability);
    expect(enriched.reasonCodes).toEqual(expect.arrayContaining(["smart_sector_count_increasing", "disk_io_errors_increasing"]));
  });

  it("records a serial change as slot replacement history", () => {
    const [previous] = normalizeRecorderHddStatus([{ diskNo: 1, state: "normal", serial: "OLD", smartStatus: "healthy" }]);
    const [current] = normalizeRecorderHddStatus([{ diskNo: 1, state: "normal", serial: "NEW", smartStatus: "healthy" }]);
    expect(applyDiskHistory(current!, diskToMetrics(previous!))).toMatchObject({
      replacementDetected: true,
      previousSerialNumber: "OLD",
    });
  });
});
