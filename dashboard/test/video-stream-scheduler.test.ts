import { describe, expect, it } from "vitest";
import { StreamScheduler, type ViewerCapacitySource } from "../lib/video/stream-scheduler.js";
import type {
  CameraContext,
  StreamProfile,
  ViewerCapacity,
  ViewerResourceBudget,
} from "../lib/video/types.js";

const WALL_TILE = { width: 160, height: 90 };

function capacitySource(overrides: Partial<ViewerCapacity> = {}): ViewerCapacitySource {
  const capacity: ViewerCapacity = {
    maxVideoDecoders: 36,
    maxAggregateBitrateMbps: 25,
    maxPixelsPerSecond: 300_000_000,
    activeDecoders: 0,
    activeBitrateMbps: 0,
    activePixelsPerSecond: 0,
    preferredCodec: "H264",
    supportedCodecs: ["H264"],
    hardwareAcceleration: "AVAILABLE",
    recommendedDecoderLimit: 36,
    measuredAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  };
  return {
    async getCapacity() {
      return { ...capacity };
    },
    async getResourceBudget(): Promise<ViewerResourceBudget> {
      return {
        decoderBudget: capacity.recommendedDecoderLimit,
        bitrateBudgetMbps: capacity.maxAggregateBitrateMbps,
        pixelsPerSecondBudget: capacity.maxPixelsPerSecond,
        decoderUsage: 0,
        bitrateUsageMbps: 0,
        pixelsPerSecondUsage: 0,
        emergencyReserve: 4,
        normalPoolSize: 32,
      };
    },
  };
}

function profile(cameraId: string, streamType: "MAIN" | "SUB", overrides: Partial<StreamProfile> = {}): StreamProfile {
  return {
    cameraId,
    streamType,
    codec: "H264",
    width: streamType === "MAIN" ? 1920 : 640,
    height: streamType === "MAIN" ? 1080 : 360,
    fps: streamType === "MAIN" ? 25 : 10,
    estimatedBitrateKbps: streamType === "MAIN" ? 4096 : 512,
    ...overrides,
  };
}

function camera(id: string, overrides: Partial<CameraContext> = {}): CameraContext {
  return {
    id,
    name: id,
    branchId: "branch-1",
    operatorSelected: false,
    operatorPinned: false,
    hasCriticalAlert: false,
    hasHighAlert: false,
    incidentActive: false,
    isVisible: true,
    branchSelected: false,
    isRotationallyDue: false,
    isOnline: true,
    mainStream: profile(id, "MAIN"),
    subStream: profile(id, "SUB"),
    ...overrides,
  };
}

function liveCount(schedule: Map<string, { mode: string }>): number {
  return Array.from(schedule.values()).filter((item) =>
    item.mode === "MAIN_STREAM" || item.mode === "SUB_STREAM",
  ).length;
}

describe("resource-aware video-wall scheduling", () => {
  it("keeps a 144-slot wall at the normal decoder pool until priority work arrives", async () => {
    const scheduler = new StreamScheduler(capacitySource());
    const cameras = Array.from({ length: 144 }, (_, index) => camera(`camera-${index}`));

    const schedule = await scheduler.schedule(cameras, WALL_TILE);

    expect(liveCount(schedule)).toBe(32);
    expect(Array.from(schedule.values()).filter((item) => item.mode === "SNAPSHOT")).toHaveLength(112);
  });

  it("uses the emergency reserve for P1 cameras and preempts a normal decoder only after it is exhausted", async () => {
    const scheduler = new StreamScheduler(capacitySource());
    const cameras = [
      ...Array.from({ length: 40 }, (_, index) => camera(`camera-${index}`)),
      ...Array.from({ length: 5 }, (_, index) => camera(`critical-${index}`)),
    ];

    await scheduler.schedule(cameras, WALL_TILE);
    const withCriticalAlerts = cameras.map((item) => item.id.startsWith("critical-")
      ? { ...item, hasCriticalAlert: true }
      : item,
    );
    const schedule = await scheduler.schedule(withCriticalAlerts, WALL_TILE);
    const preemptedNormal = Array.from(schedule.values()).filter((item) =>
      item.cameraId.startsWith("camera-") && item.degradationReason === "EVICTED_BY_PRIORITY",
    );

    expect(liveCount(schedule)).toBe(36);
    expect(schedule.get("critical-4")?.mode).toBe("SUB_STREAM");
    expect(preemptedNormal).toHaveLength(1);
  });

  it("admits streams against the pixel budget, not only decoder count", async () => {
    const scheduler = new StreamScheduler(capacitySource({ maxPixelsPerSecond: 50_000_000 }));
    const cameras = Array.from({ length: 40 }, (_, index) => camera(`camera-${index}`));

    const schedule = await scheduler.schedule(cameras, WALL_TILE);
    const pixelDeferred = Array.from(schedule.values()).find(
      (item) => item.degradationReason === "PIXEL_CAPACITY",
    );

    expect(liveCount(schedule)).toBe(21);
    expect(pixelDeferred).toBeDefined();
  });

  it("keeps an offline device separate from a viewer-capacity deferral", async () => {
    const scheduler = new StreamScheduler(capacitySource());
    const schedule = await scheduler.schedule([
      camera("offline", { isOnline: false }),
      camera("deferred", { isVisible: true }),
    ], WALL_TILE, undefined, { maxDecoderLimit: 1 });

    expect(schedule.get("offline")?.mode).toBe("SUSPENDED");
    expect(schedule.get("offline")?.degradationReason).toBe("DEVICE_OFFLINE");
    expect(schedule.get("deferred")?.mode).toBe("SUB_STREAM");
  });
});
