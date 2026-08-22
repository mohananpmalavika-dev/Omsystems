import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/store.js";
import { RecorderService } from "../src/vms/recorder-service.js";
import type { OperationalTelemetryEnvelope } from "../src/operational-health/types.js";

describe("RecorderService", () => {
  it("reports missing recorder evidence as unavailable instead of false or empty", async () => {
    const store = new MemoryStore();
    const camera = store.cameras.get("cam-001")!;
    Object.assign(camera, {
      sourceType: "nvr-channel",
      recorderId: "nvr-001",
      recorderChannel: 1,
    });

    const view = await new RecorderService(store).getCameraRecordingView({
      tenantId: "omsystems",
      camera,
      from: "2026-08-13T00:00:00.000Z",
      to: "2026-08-13T01:00:00.000Z",
    });

    expect(view.source).toBe("RECORDER");
    expect(view.recordingStatus).toMatchObject({
      state: "UNAVAILABLE",
      reason: "DEPENDENCY_UNAVAILABLE",
    });
    expect(view.recordingSearch).toMatchObject({
      state: "UNAVAILABLE",
      reason: "DEPENDENCY_UNAVAILABLE",
    });
    expect(view.timeline.state).toBe("UNAVAILABLE");
  });

  it("turns verified edge recorder observations into a canonical status and interval timeline", async () => {
    const store = new MemoryStore();
    const camera = store.cameras.get("cam-001")!;
    Object.assign(camera, {
      sourceType: "nvr-channel",
      recorderId: "nvr-001",
      recorderChannel: 1,
    });
    const observedAt = new Date().toISOString();
    await store.ingestOperationalTelemetry(envelope({
      deviceType: "recorder",
      deviceId: "nvr-001",
      observedAt,
      metrics: { status: "online", firmwareVersion: "5.7.1" },
    }));
    await store.ingestOperationalTelemetry(envelope({
      deviceType: "recorder-channel",
      deviceId: "nvr-001:channel:1",
      observedAt,
      metrics: {
        recorderId: "nvr-001",
        sourceChannel: 1,
        status: "recording",
        lastRecordedAt: "2026-08-13T00:59:30.000Z",
      },
    }));
    await store.ingestOperationalTelemetry(envelope({
      deviceType: "archive",
      deviceId: "nvr-001:archive:1",
      observedAt,
      metrics: {
        recorderId: "nvr-001",
        cameraId: "cam-001",
        sourceChannel: 1,
        archiveStatus: "available",
        oldestContinuousAt: "2026-08-13T00:10:00.000Z",
        newestPlayableAt: "2026-08-13T00:55:00.000Z",
        gapCount: 0,
        largestGapSeconds: 0,
        playbackVerified: true,
      },
    }));

    const view = await new RecorderService(store).getCameraRecordingView({
      tenantId: "omsystems",
      camera,
      from: "2026-08-13T00:00:00.000Z",
      to: "2026-08-13T01:00:00.000Z",
    });

    expect(view.recordingStatus).toMatchObject({
      state: "AVAILABLE",
      value: { active: true, latestSegmentAt: "2026-08-13T00:59:30.000Z" },
    });
    expect(view.capabilities.playback.support).toBe("PARTIAL");
    expect(view.timeline).toMatchObject({
      state: "AVAILABLE",
      value: {
        coverageComplete: false,
        intervals: [
          { state: "UNKNOWN", start: "2026-08-13T00:00:00.000Z", end: "2026-08-13T00:10:00.000Z" },
          { state: "RECORDED", start: "2026-08-13T00:10:00.000Z", end: "2026-08-13T00:55:00.000Z" },
          { state: "UNKNOWN", start: "2026-08-13T00:55:00.000Z", end: "2026-08-13T01:00:00.000Z" },
        ],
      },
    });
  });
});

function envelope(input: {
  deviceType: OperationalTelemetryEnvelope["deviceType"];
  deviceId: string;
  observedAt: string;
  metrics: OperationalTelemetryEnvelope["metrics"];
}): OperationalTelemetryEnvelope {
  return {
    tenantId: "omsystems",
    branchId: "branch-blr-001",
    edgeAgentId: "edge-001",
    receivedAt: input.observedAt,
    source: "system",
    quality: "verified",
    idempotencyKey: `${input.deviceId}:${input.observedAt}`,
    reasonCodes: [],
    ...input,
  };
}
