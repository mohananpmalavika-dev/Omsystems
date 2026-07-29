import { describe, expect, it } from "vitest";
import type { CameraHealth } from "../lib/types/operational-health.js";
import {
  CAMERA_WALL_LAYOUTS,
  CAMERA_WALL_RENDER_BATCH_SIZE,
  cameraPlaybackHref,
  cameraRenderWindow,
  cameraStatusTone,
  cameraSequenceWindow,
  canStartCamera,
  nextCameraRenderCount,
} from "../components/operational-health/branch-camera-wall-model.js";

describe("branch camera wall model", () => {
  it("provides responsive operator layouts and camera-specific playback navigation", () => {
    expect(CAMERA_WALL_LAYOUTS).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(cameraPlaybackHref("branch one", "camera/one")).toBe("/recordings?branchId=branch+one&cameraId=camera%2Fone");
  });

  it("keeps every sequence inside the workstation decoder budget", () => {
    const cameras = Array.from({ length: 40 }, (_, index) => camera({ id: `camera-${index}` }));
    expect(cameraSequenceWindow(cameras, 16, 0).map((item) => item.id)).toEqual(cameras.slice(0, 16).map((item) => item.id));
    expect(cameraSequenceWindow(cameras, 16, 16).map((item) => item.id)).toEqual(cameras.slice(16, 32).map((item) => item.id));
    cameras[17]!.onlineStatus = "offline";
    expect(cameraSequenceWindow(cameras, 16, 16)).toHaveLength(16);
    expect(cameraSequenceWindow(cameras, 16, 16).some((item) => item.id === "camera-17")).toBe(false);
  });

  it("only starts reachable cameras and elevates video-quality faults", () => {
    expect(canStartCamera(camera({ onlineStatus: "online" }))).toBe(true);
    expect(canStartCamera(camera({ onlineStatus: "offline" }))).toBe(false);
    expect(cameraStatusTone(camera({ onlineStatus: "online", videoLoss: true }))).toBe("critical");
    expect(cameraStatusTone(camera({ onlineStatus: "degraded" }))).toBe("warning");
  });

  it("keeps a large branch wall bounded until the operator requests more tiles", () => {
    const cameras = Array.from({ length: 500 }, (_, index) => camera({ id: `camera-${index}` }));

    expect(cameraRenderWindow(cameras, CAMERA_WALL_RENDER_BATCH_SIZE)).toHaveLength(48);
    expect(nextCameraRenderCount(48, cameras.length)).toBe(96);
    expect(cameraRenderWindow(cameras, nextCameraRenderCount(480, cameras.length))).toHaveLength(500);
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
    blackScreen: false,
    ...overrides,
  };
}
