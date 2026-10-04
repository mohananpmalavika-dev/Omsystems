import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewerCapacityManager } from "../lib/video/viewer-capacity-manager.js";
import { DecoderPool } from "../lib/video/decoder-pool.js";
import { StreamScheduler } from "../lib/video/stream-scheduler.js";
import type { CameraContext, PlaybackMetrics, StreamProfile } from "../lib/video/types.js";

function metrics(ratio: number): Map<string, PlaybackMetrics> {
  return new Map([["camera", {
    totalFrames: 100, droppedFrames: ratio * 100, droppedFrameRatio: ratio, stallCount: 0,
  }]]);
}

const profile: StreamProfile = {
  cameraId: "camera", streamType: "SUB", codec: "H264", width: 640, height: 360,
  fps: 15, estimatedBitrateKbps: 512,
};

describe("adaptive viewer capacity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function managerWithUsage(count = 3) {
    const manager = new ViewerCapacityManager();
    await manager.initialize();
    manager.updateUsage(count, count * 0.512, count * 640 * 360 * 15);
    return manager;
  }

  it("reduces the live workload of a four-stream wall on the next scheduling pass", async () => {
    const manager = await managerWithUsage();
    const scheduler = new StreamScheduler(manager);
    const cameras: CameraContext[] = Array.from({ length: 9 }, (_, index) => ({
      id: `camera-${index}`, name: `camera-${index}`, branchId: "branch",
      operatorSelected: false, operatorPinned: false, hasCriticalAlert: false,
      hasHighAlert: false, incidentActive: false, isVisible: true,
      branchSelected: false, isRotationallyDue: false, isOnline: true,
      subStream: { ...profile, cameraId: `camera-${index}` },
    }));
    const liveCount = (schedule: Awaited<ReturnType<StreamScheduler["schedule"]>>) =>
      [...schedule.values()].filter((entry) => entry.mode === "SUB_STREAM" || entry.mode === "MAIN_STREAM").length;

    expect((await manager.getResourceBudget(4)).decoderBudget).toBe(4);
    expect(liveCount(await scheduler.schedule(cameras, { width: 160, height: 90 }, undefined, { maxDecoderLimit: 4 }))).toBe(3);
    expect(await manager.monitorPerformance(metrics(0.1), 4)).toBe(false);
    vi.advanceTimersByTime(6_000);
    expect(await manager.monitorPerformance(metrics(0.1), 4)).toBe(true);
    const next = await scheduler.schedule(cameras, { width: 160, height: 90 }, undefined, { maxDecoderLimit: 4 });
    expect(liveCount(next)).toBeLessThan(3);
    expect((await manager.getResourceBudget(4)).decoderBudget).toBe(2);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("does not emit repeated reductions when only one decoder is active", async () => {
    const manager = await managerWithUsage(1);
    const initial = (await manager.getCapacity()).recommendedDecoderLimit;
    for (let sample = 0; sample < 10; sample++) {
      expect(await manager.monitorPerformance(metrics(0.5), 4)).toBe(false);
      vi.advanceTimersByTime(8_000);
    }
    expect((await manager.getCapacity()).recommendedDecoderLimit).toBe(initial);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("requires uninterrupted playing samples and respects the page cap during recovery", async () => {
    const manager = await managerWithUsage();
    await manager.monitorPerformance(metrics(0.1), 4);
    vi.advanceTimersByTime(6_000);
    await manager.monitorPerformance(metrics(0.1), 4);
    manager.updateUsage(1, 0.512, 640 * 360 * 15);
    await manager.monitorPerformance(metrics(0), 4);
    vi.advanceTimersByTime(20_000);
    await manager.monitorPerformance(metrics(0.1), 4);
    vi.advanceTimersByTime(11_000);
    expect(await manager.monitorPerformance(metrics(0), 4)).toBe(false);
    vi.advanceTimersByTime(31_000);
    expect(await manager.monitorPerformance(metrics(0), 4)).toBe(true);
    expect((await manager.getCapacity()).recommendedDecoderLimit).toBe(3);
    await manager.monitorPerformance(metrics(0), 4);
    vi.advanceTimersByTime(31_000);
    expect(await manager.monitorPerformance(metrics(0), 4)).toBe(true);
    expect((await manager.getCapacity()).recommendedDecoderLimit).toBe(4);
    await manager.monitorPerformance(metrics(0), 4);
    vi.advanceTimersByTime(31_000);
    expect(await manager.monitorPerformance(metrics(0), 4)).toBe(false);
  });

  it("resets overload and recovery timers when there are no valid playback samples", async () => {
    const manager = await managerWithUsage();
    await manager.monitorPerformance(metrics(0.1), 4);
    vi.advanceTimersByTime(6_000);
    expect(await manager.monitorPerformance(new Map(), 4)).toBe(false);
    expect(await manager.monitorPerformance(metrics(0.1), 4)).toBe(false);
    vi.advanceTimersByTime(6_000);
    await manager.monitorPerformance(metrics(0.1), 4);
    await manager.monitorPerformance(metrics(0), 4);
    vi.advanceTimersByTime(31_000);
    expect(await manager.monitorPerformance(metrics(Number.NaN), 4)).toBe(false);
    expect(await manager.monitorPerformance(metrics(0), 4)).toBe(false);
    expect((await manager.getCapacity()).recommendedDecoderLimit).toBe(2);
  });

  it("never recovers beyond the detected hard limit", async () => {
    const manager = await managerWithUsage();
    const capacity = await manager.getCapacity();
    capacity.recommendedDecoderLimit = 9;
    capacity.maxVideoDecoders = 10;
    await manager.monitorPerformance(metrics(0));
    vi.advanceTimersByTime(31_000);
    expect(await manager.monitorPerformance(metrics(0))).toBe(true);
    expect(capacity.recommendedDecoderLimit).toBe(10);
  });
});

describe("decoder performance samples", () => {
  beforeEach(() => vi.spyOn(console, "log").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  async function playingDecoder() {
    const pool = new DecoderPool();
    let quality = { totalVideoFrames: 100, droppedVideoFrames: 40 };
    const video = {
      paused: false, ended: false, readyState: 4,
      buffered: { length: 0 },
      getVideoPlaybackQuality: () => quality,
    };
    await pool.acquire("camera", profile);
    pool.attachVideoElement("camera", video as unknown as HTMLVideoElement);
    return { pool, video, sample: (total: number, dropped: number) => {
      quality = { totalVideoFrames: total, droppedVideoFrames: dropped };
      return pool.getAllMetrics().get("camera");
    } };
  }

  it("uses recent frame deltas and ignores startup history and stalled samples", async () => {
    const { sample } = await playingDecoder();
    expect(sample(100, 40)).toBeUndefined();
    expect(sample(200, 40)?.droppedFrameRatio).toBe(0);
    expect(sample(300, 50)?.droppedFrameRatio).toBe(0.1);
    expect(sample(300, 50)).toBeUndefined();
    expect(sample(10, 0)).toBeUndefined();
    expect(sample(110, 0)?.droppedFrameRatio).toBe(0);
  });

  it("discards paused/background intervals and establishes a fresh resume baseline", async () => {
    const { pool, video, sample } = await playingDecoder();
    sample(100, 40);
    video.paused = true;
    expect(sample(200, 140)).toBeUndefined();
    video.paused = false;
    expect(sample(300, 240)).toBeUndefined();
    expect(sample(400, 240)?.droppedFrameRatio).toBe(0);
    pool.resetPerformanceMetrics();
    expect(sample(500, 340)).toBeUndefined();
    expect(sample(600, 340)?.droppedFrameRatio).toBe(0);
  });

  it("discards the previous player's counters when the video element is replaced", async () => {
    const { pool, sample } = await playingDecoder();
    sample(100, 40);
    let quality = { totalVideoFrames: 1_000, droppedVideoFrames: 800 };
    pool.attachVideoElement("camera", {
      paused: false, ended: false, readyState: 4,
      buffered: { length: 0 }, getVideoPlaybackQuality: () => quality,
    } as unknown as HTMLVideoElement);
    expect(pool.getAllMetrics().size).toBe(0);
    quality = { totalVideoFrames: 1_100, droppedVideoFrames: 800 };
    expect(pool.getAllMetrics().get("camera")?.droppedFrameRatio).toBe(0);
  });
});
