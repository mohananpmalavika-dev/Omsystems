import { describe, expect, it } from "vitest";
import { normalizeRecorderMetrics, projectRecorderHealth } from "../../src/operational-health/recorder-health.js";

describe("recorder health normalization", () => {
  it("does not turn missing reachability evidence into an online recorder", () => {
    const result = normalizeRecorderMetrics({});
    expect(result.metrics).toMatchObject({ status: "unknown", reachable: null, recordingStatus: "unknown" });
    expect(result.reasonCodes).toContain("recorder_reachability_unverified");
  });
  it("keeps a reachable recorder degraded until recording evidence is present", () => {
    expect(normalizeRecorderMetrics({ reachable: true }).metrics.status).toBe("degraded");
  });
  it("rejects impossible channel totals", () => {
    const result = normalizeRecorderMetrics({ reachable: true, recordingStatus: "recording", connectedCameras: 9, totalCameras: 8 });
    expect(result.metrics.status).toBe("degraded");
    expect(result.reasonCodes).toContain("recorder_channel_count_invalid");
  });
  it("projects an explicit online status as reachable when older telemetry lacks the field", () => {
    const recorder = projectRecorderHealth({ deviceId: "nvr-1", branchId: "branch-1", observedAt: "2026-09-01T00:00:00.000Z", quality: "verified", metrics: { status: "online" }, reasonCodes: [] } as any, { id: "branch-1", name: "Branch" });
    expect(recorder.reachable).toBe(true);
  });
});
