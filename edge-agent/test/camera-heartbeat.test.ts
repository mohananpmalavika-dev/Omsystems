import { describe, expect, it, vi } from "vitest";
import {
  assessLumaFrame,
  CameraHeartbeatService,
  shouldMarkCameraDegraded,
  type CameraConfig,
  type CameraHeartbeatData,
} from "../src/monitoring/camera-heartbeat.js";

describe("camera frame health", () => {
  it("detects a persistently identical frame only after three samples", () => {
    const frame = Buffer.alloc(64 * 36, 80);
    const one = assessLumaFrame(undefined, frame);
    const two = assessLumaFrame(one.state, frame);
    const three = assessLumaFrame(two.state, frame);
    expect(one.imageFrozen).toBe(false);
    expect(two.imageFrozen).toBe(false);
    expect(three.imageFrozen).toBe(true);
  });

  it("detects a genuinely dark decoded luminance frame", () => {
    expect(assessLumaFrame(undefined, Buffer.alloc(64 * 36, 4)).blackScreen).toBe(true);
    expect(assessLumaFrame(undefined, Buffer.alloc(64 * 36, 80)).blackScreen).toBe(false);
  });

  it("does not downgrade a healthy monochrome night stream", () => {
    // Colour loss and scene movement are retained in telemetry as evidence,
    // but neither proves a delivery or image failure. This keeps IR cameras
    // online after dark while genuine image failures still degrade them.
    expect(shouldMarkCameraDegraded({
      fps: 25,
      bitrateKbps: 1_024,
      packetLoss: 0,
    })).toBe(false);
    expect(shouldMarkCameraDegraded({
      fps: 25,
      bitrateKbps: 1_024,
      packetLoss: 0,
      blackScreen: true,
    })).toBe(true);
  });

  it("starts one local recovery after three consecutive offline heartbeats", async () => {
    const recover = vi.fn(async () => undefined);
    const service = new CameraHeartbeatService(
      "http://control.example",
      "branch-1",
      "agent-1",
      undefined,
      "ffprobe",
      "ffmpeg",
      undefined,
      undefined,
      recover,
    );
    const invokeRecovery = (service as unknown as {
      considerAutomaticRecovery(camera: CameraConfig, data: CameraHeartbeatData): void;
    }).considerAutomaticRecovery.bind(service);
    const camera: CameraConfig = {
      id: "camera-1",
      name: "Front door",
      rtspUrl: "rtsp://operator:secret@10.0.0.5/stream",
      enabled: true,
    };
    const offline: CameraHeartbeatData = {
      cameraId: camera.id,
      status: "offline",
      responseTimeMs: 20,
      streamActive: false,
      videoLoss: true,
      quality: "verified",
      reasonCodes: ["rtsp_unreachable"],
    };

    invokeRecovery(camera, offline);
    invokeRecovery(camera, offline);
    expect(recover).not.toHaveBeenCalled();
    invokeRecovery(camera, offline);
    await vi.waitFor(() => expect(recover).toHaveBeenCalledOnce());
    invokeRecovery(camera, offline);

    expect(recover).toHaveBeenCalledWith(expect.objectContaining({
      cameraId: "camera-1",
      consecutiveFailures: 3,
    }));
    expect(recover).toHaveBeenCalledOnce();
  });
});
