import { describe, it, expect, beforeEach } from "vitest";
import { AdaptiveProfileResolverService } from "../src/media/adaptive/adaptive-profile-resolver.service.js";

describe("Adaptive Stream Profile & 144-Grid Efficiency Test Suite", () => {
  let resolver: AdaptiveProfileResolverService;

  beforeEach(() => {
    resolver = new AdaptiveProfileResolverService();
  });

  it("Rule 1: 1 camera solo layout resolves to MAINSTREAM (1080p @ 30fps)", () => {
    const decision = resolver.resolveProfile({
      cameraId: "CAM-001",
      gridDensity: 1,
      viewportSize: { widthPx: 1920, heightPx: 1080 },
    });

    expect(decision.selectedTier).toBe("MAINSTREAM");
    expect(decision.targetResolution).toEqual({ width: 1920, height: 1080 });
    expect(decision.targetFps).toBe(30);
    expect(decision.targetBitrateKbps).toBe(3000);
  });

  it("Rule 2: 4 cameras (2x2 grid) resolves to MEDIUM (720p @ 20fps)", () => {
    const decision = resolver.resolveProfile({
      cameraId: "CAM-002",
      gridDensity: 4,
      viewportSize: { widthPx: 960, heightPx: 540 },
    });

    expect(decision.selectedTier).toBe("MEDIUM");
    expect(decision.targetResolution).toEqual({ width: 1280, height: 720 });
    expect(decision.targetFps).toBe(20);
    expect(decision.targetBitrateKbps).toBe(1200);
  });

  it("Rule 3: 16 cameras (4x4 grid) resolves to SUBSTREAM (360p @ 15fps)", () => {
    const decision = resolver.resolveProfile({
      cameraId: "CAM-016",
      gridDensity: 16,
      viewportSize: { widthPx: 480, heightPx: 270 },
    });

    expect(decision.selectedTier).toBe("SUBSTREAM");
    expect(decision.targetResolution).toEqual({ width: 640, height: 360 });
    expect(decision.targetFps).toBe(15);
    expect(decision.targetBitrateKbps).toBe(450);
  });

  it("Rule 4: 64 cameras (8x8 grid) resolves to LOW_SUBSTREAM (240p @ 10fps)", () => {
    const decision = resolver.resolveProfile({
      cameraId: "CAM-064",
      gridDensity: 64,
      viewportSize: { widthPx: 240, heightPx: 135 },
    });

    expect(decision.selectedTier).toBe("LOW_SUBSTREAM");
    expect(decision.targetResolution).toEqual({ width: 426, height: 240 });
    expect(decision.targetFps).toBe(10);
    expect(decision.targetBitrateKbps).toBe(200);
  });

  it("Rule 5: 144 cameras (12x12 video wall) resolves to ULTRA_LOW_THUMBNAIL (180p @ 3fps)", () => {
    const decision = resolver.resolveProfile({
      cameraId: "CAM-144",
      gridDensity: 144,
      viewportSize: { widthPx: 160, heightPx: 90 },
    });

    expect(decision.selectedTier).toBe("ULTRA_LOW_THUMBNAIL");
    expect(decision.targetResolution).toEqual({ width: 320, height: 180 });
    expect(decision.targetFps).toBe(3);
    expect(decision.targetBitrateKbps).toBe(70);
    expect(decision.transport).toBe("ANIMATED_KEYFRAME");
  });

  it("Rule 6: Operator clicking/maximizing camera immediately promotes to MAINSTREAM", () => {
    const decision = resolver.resolveProfile({
      cameraId: "CAM-042",
      gridDensity: 144, // In a 144-grid
      viewportSize: { widthPx: 1920, heightPx: 1080 },
      operatorFocus: {
        isMaximized: true,
        isHovered: false,
        isFocused: true,
        isInActiveAlarm: false,
        priority: "NORMAL",
      },
    });

    expect(decision.selectedTier).toBe("MAINSTREAM");
    expect(decision.targetResolution).toEqual({ width: 1920, height: 1080 });
    expect(decision.targetFps).toBe(30);
    expect(decision.audioEnabled).toBe(true);
  });

  it("Rule 7: Active P1 Alarm auto-promotes tile to MAINSTREAM with audio", () => {
    const decision = resolver.resolveProfile({
      cameraId: "CAM-088",
      gridDensity: 64,
      viewportSize: { widthPx: 240, heightPx: 135 },
      operatorFocus: {
        isMaximized: false,
        isHovered: false,
        isFocused: false,
        isInActiveAlarm: true,
        priority: "P1",
      },
    });

    expect(decision.selectedTier).toBe("MAINSTREAM");
    expect(decision.audioEnabled).toBe(true);
  });

  it("Rule 8: High client CPU (>80%) triggers automatic hardware throttle", () => {
    const decision = resolver.resolveProfile({
      cameraId: "CAM-010",
      gridDensity: 16,
      viewportSize: { widthPx: 480, heightPx: 270 },
      clientTelemetry: {
        cpuUsagePct: 88,
        memoryPressure: "moderate",
        hardwareDecoderSlots: 16,
        activeHardwareDecoders: 16,
      },
    });

    expect(decision.selectedTier).toBe("LOW_SUBSTREAM");
    expect(decision.reason).toContain("High Client CPU");
  });

  it("Rule 9: Off-screen / non-intersecting tile is PAUSED (0 kbps)", () => {
    const decision = resolver.resolveProfile({
      cameraId: "CAM-099",
      gridDensity: 16,
      viewportSize: { widthPx: 480, heightPx: 270 },
      visibility: {
        isIntersecting: false,
        visibilityRatio: 0,
      },
    });

    expect(decision.selectedTier).toBe("PAUSED");
    expect(decision.targetBitrateKbps).toBe(0);
    expect(decision.bandwidthSavedPct).toBe(100);
  });

  it("Rule 10: 144-camera grid achieves >95% bandwidth reduction against unoptimized 1080p", () => {
    const summary = resolver.summarizeGrid(144, "CAM-001");

    expect(summary.totalCameras).toBe(144);
    expect(summary.unoptimizedBandwidthKbps).toBe(432000); // 432 Mbps
    expect(summary.totalEstimatedBandwidthKbps).toBeLessThan(20000); // Under 20 Mbps total!
    expect(summary.totalBandwidthSavedPct).toBeGreaterThan(95); // >95% savings
    expect(summary.tierBreakdown.MAINSTREAM).toBe(1); // The focused camera is Mainstream
    expect(summary.tierBreakdown.ULTRA_LOW_THUMBNAIL).toBe(143);
  });
});
