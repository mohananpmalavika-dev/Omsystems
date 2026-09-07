import { describe, expect, it } from "vitest";
import { CameraHealthEvaluator } from "../../edge-agent/src/monitoring/camera-health/camera-health-evaluator.js";
import { CameraHealthService } from "../../edge-agent/src/monitoring/camera-health/camera-health.service.js";

const camera = { id: "cam-004", name: "Entrance", branchId: "branch-1", recorderId: "rec-1", channelNumber: 4, ipAddress: "10.0.0.4" };
const observedAt = new Date();
const complete = (overrides: Record<string, unknown> = {}) => ({
  camera, observedAt,
  network: { reachable: true, port: 554, latencyMs: 8, protocol: "TCP" as const },
  stream: { reachable: true, videoTrackPresent: true, codec: "h264", fps: 25, width: 1920, height: 1080 },
  decode: { decodable: true, decodedFrames: 25, decodeErrors: 0 },
  freeze: { frozen: false, confidence: 0.99, durationSeconds: 0, timestampProgressing: true, packetsFlowing: true },
  recorderChannel: { channelId: "4", channelNumber: 4, configured: true, connected: true, signalPresent: true, enabled: true, observedAt },
  recording: { activelyWriting: true, archiveContinuityOk: true, recentSegmentsCount: 2, observedAt },
  ...overrides,
});

describe("seven-layer camera health evaluator", () => {
  it("does not manufacture channel-number failures", () => {
    const result = new CameraHealthEvaluator().evaluate(complete());
    expect(result.state).toBe("HEALTHY");
    expect(result.reasonCodes).toEqual([]);
  });
  it("reports absent probe evidence as unknown instead of healthy", () => {
    const result = new CameraHealthEvaluator().evaluate({ camera, observedAt });
    expect(result.state).toBe("UNKNOWN");
    expect(result.network.state).toBe("UNKNOWN");
    expect(result.recording.state).toBe("UNKNOWN");
  });
  it("requires both RTSP reachability and a video track", () => {
    const result = new CameraHealthEvaluator().evaluate(complete({ stream: { reachable: false, videoTrackPresent: true, errorCode: "AUTH_FAILED" } }));
    expect(result.state).toBe("CRITICAL");
    expect(result.reasonCodes).toContain("STREAM_AUTH_FAILED");
  });
  it("marks broken archive continuity as degraded and retains actual stream metadata", () => {
    const result = new CameraHealthEvaluator().evaluate(complete({ recording: { activelyWriting: true, archiveContinuityOk: false, recentSegmentsCount: 0, observedAt } }));
    expect(result.state).toBe("DEGRADED");
    expect(result.recording.state).toBe("FAIL");
    expect(result.codec).toBe("h264");
    expect(result.resolution).toBe("1920x1080");
  });
  it("does not present stale telemetry as a live camera result", () => {
    const result = new CameraHealthEvaluator().evaluate(complete({ observedAt: new Date(Date.now() - 91_000) }));
    expect(result.state).toBe("UNKNOWN");
    expect(result.reasonCodes).toContain("STALE_OBSERVATION");
  });
  it("contains probe collector failures as unknown evidence", async () => {
    const service = new CameraHealthService(
      { probe: async () => { throw new Error("collector timeout"); } } as any,
      {} as any, {} as any, {} as any,
    );
    await expect(service.checkCamera(camera)).resolves.toMatchObject({ state: "UNKNOWN" });
  });
});
