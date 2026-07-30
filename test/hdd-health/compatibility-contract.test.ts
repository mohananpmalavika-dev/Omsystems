import { describe, expect, it } from "vitest";
import { verifyRecorderCompatibility } from "./compatibility-contract.js";

const target = {
  id: "main-nvr",
  name: "Main recorder",
  vendor: "hikvision" as const,
  model: "DS-7616NI-K2",
  expectedFirmware: "V5.7.18 build 240101",
  expectedDisks: 2,
  expectedChannels: 2,
  expectedRaidLevel: "RAID1",
  requireWriteVerification: true,
};

const recordingEvidence = {
  metrics: {
    totalCameras: 2, connectedCameras: 2, recordingStatus: "recording",
    recordingStatusSource: "recent-media-search", lastRecordedAt: "2026-07-30T10:00:00.000Z",
  },
  channelHealth: [
    { sourceChannel: 1, status: "recording" as const, connected: true, lastRecordedAt: "2026-07-30T10:00:00.000Z", recordingStatusSource: "recent-media-search" as const, reasonCodes: [] },
    { sourceChannel: 2, status: "recording" as const, connected: true, lastRecordedAt: "2026-07-30T09:59:58.000Z", recordingStatusSource: "recent-media-search" as const, reasonCodes: [] },
  ],
};

describe("exact recorder HDD compatibility contract", () => {
  it("certifies only a device that reports the configured model, firmware, and disk inventory", () => {
    const checks = verifyRecorderCompatibility(target, {
      metrics: {
        ...recordingEvidence.metrics,
        reachable: true, status: "online", model: "DS-7616NI-K2", modelSource: "vendor-system",
        firmwareVersion: "V5.7.18 build 240101",
      },
      hddStatus: [
        { diskNo: 1, state: "normal", capacity: "4TB", freeSpace: "1TB", smartStatus: "healthy", raidStatus: "healthy", raidLevel: "RAID1", writeVerified: true },
        { diskNo: 2, state: "normal", capacity: "4TB", freeSpace: "1TB", smartStatus: "healthy", raidStatus: "healthy", raidLevel: "RAID1", writeVerified: true },
      ],
      reasonCodes: [],
      archiveEvidence: [],
      channelHealth: recordingEvidence.channelHealth,
    });

    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "model", passed: true }),
      expect.objectContaining({ name: "firmware", passed: true }),
      expect.objectContaining({ name: "disk_inventory", passed: true }),
    ]));
    expect(checks.every((check) => check.passed)).toBe(true);
  });

  it("does not accept configured metadata as evidence of a deployed recorder model", () => {
    const checks = verifyRecorderCompatibility(target, {
      metrics: {
        ...recordingEvidence.metrics,
        reachable: true, status: "online", model: "DS-7616NI-K2", modelSource: "configured",
        firmwareVersion: "V5.7.18 build 240101",
      },
      hddStatus: [{ diskNo: 1, state: "normal" }, { diskNo: 2, state: "normal" }],
      reasonCodes: [],
      archiveEvidence: [],
      channelHealth: recordingEvidence.channelHealth,
    });

    expect(checks.find((check) => check.name === "model")).toMatchObject({ passed: false });
  });

  it("rejects a model, firmware, or disk-count mismatch", () => {
    const checks = verifyRecorderCompatibility(target, {
      metrics: {
        ...recordingEvidence.metrics,
        reachable: true, status: "online", model: "DS-7608NI-K2", modelSource: "vendor-system",
        firmwareVersion: "V5.7.17",
      },
      hddStatus: [{ diskNo: 1, state: "normal" }],
      reasonCodes: [],
      archiveEvidence: [],
      channelHealth: recordingEvidence.channelHealth,
    });

    expect(checks.filter((check) => !check.passed).map((check) => check.name))
      .toEqual(expect.arrayContaining(["model", "firmware", "disk_inventory"]));
  });
});
