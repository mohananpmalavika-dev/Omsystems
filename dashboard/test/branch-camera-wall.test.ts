import { describe, expect, it } from "vitest";
import type { CameraHealth } from "../lib/types/operational-health.js";
import {
  CAMERA_WALL_LAYOUTS,
  cameraPlaybackHref,
  cameraStatusTone,
  canStartCamera,
} from "../components/operational-health/branch-camera-wall-model.js";

describe("branch camera wall model", () => {
  it("provides responsive operator layouts and camera-specific playback navigation", () => {
    expect(CAMERA_WALL_LAYOUTS).toEqual([2, 3, 4]);
    expect(cameraPlaybackHref("branch one", "camera/one")).toBe("/recordings?branchId=branch+one&cameraId=camera%2Fone");
  });

  it("only starts reachable cameras and elevates video-quality faults", () => {
    expect(canStartCamera(camera({ onlineStatus: "online" }))).toBe(true);
    expect(canStartCamera(camera({ onlineStatus: "offline" }))).toBe(false);
    expect(cameraStatusTone(camera({ onlineStatus: "online", videoLoss: true }))).toBe("critical");
    expect(cameraStatusTone(camera({ onlineStatus: "degraded" }))).toBe("warning");
  });
});

function camera(overrides: Partial<CameraHealth>): CameraHealth {
  return {
    id: "camera",
    name: "Lobby",
    onlineStatus: "online",
    recordingStatus: "compliant",
    lastHeartbeat: "2026-07-28T00:00:00.000Z",
    currentFps: 25,
    expectedFps: 25,
    currentBitrate: 2_048,
    latencyMs: 20,
    packetLoss: 0,
    healthScore: 100,
    branchId: "branch",
    branchName: "Branch",
    onvifAvailable: true,
    streamAvailable: true,
    videoLoss: false,
    tamperingDetected: false,
    imageFrozen: false,
    ...overrides,
  };
}
