import { describe, it, expect, beforeEach } from "vitest";
import {
  ClientMediaSchedulerService,
} from "../../src/media/scheduler/client-media-scheduler.service.js";
import type {
  ClientHardwareProfile,
  ViewportGridContext,
} from "../../src/media/scheduler/client-media-scheduler.types.js";

describe("Authoritative Client Media Scheduler Service (Zero Guessing)", () => {
  let scheduler: ClientMediaSchedulerService;

  beforeEach(() => {
    scheduler = ClientMediaSchedulerService.getInstance();
  });

  const generateCameras = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      id: `CAM-${String(i + 1).padStart(3, "0")}`,
      name: `Branch Camera ${i + 1}`,
      isOnline: true,
      hasAudio: true,
    }));
  };

  const createViewport = (
    cameraCount: number,
    focusedId?: string,
    alarmIds: string[] = [],
    p1Ids: string[] = []
  ): ViewportGridContext => {
    const gridDim = Math.ceil(Math.sqrt(cameraCount));
    const tileWidth = Math.floor(1920 / gridDim);
    const tileHeight = Math.floor(1080 / gridDim);

    return {
      sessionId: "00000000-0000-0000-0000-000000000001",
      gridRows: gridDim,
      gridCols: gridDim,
      totalTiles: cameraCount,
      visibleCameraIds: Array.from({ length: cameraCount }, (_, i) => `CAM-${String(i + 1).padStart(3, "0")}`),
      tiles: Array.from({ length: cameraCount }, (_, i) => ({
        cameraId: `CAM-${String(i + 1).padStart(3, "0")}`,
        widthPx: tileWidth,
        heightPx: tileHeight,
        tileIndex: i,
        isIntersecting: true,
      })),
      focusedCameraId: focusedId,
      activeAlarmCameraIds: alarmIds,
      p1IncidentCameraIds: p1Ids,
    };
  };

  describe("RTX GPU Workstation (64 Measured Streams)", () => {
    const rtxProfile: ClientHardwareProfile = {
      fingerprint: "ws_rtx_4090_measured",
      gpuModel: "NVIDIA GeForce RTX 4090",
      rendererString: "NVIDIA Corporation - NVIDIA GeForce RTX 4090/PCIe/SSE2",
      hardwareDecoder: "NVDEC",
      supportedCodecs: [
        {
          codec: "H264",
          mimeType: "video/mp4; codecs=\"avc1.42E01E\"",
          isHardwareAccelerated: true,
          maxSupportedResolution: { width: 3840, height: 2160 },
          maxFps: 60,
        },
        {
          codec: "H265",
          mimeType: "video/mp4; codecs=\"hev1.1.6.L93.B0\"",
          isHardwareAccelerated: true,
          maxSupportedResolution: { width: 3840, height: 2160 },
          maxFps: 60,
        },
      ],
      preferredCodec: "H265",
      measuredMaxDecodeSessions: 64, // Measured NVDEC capacity
      benchmarkAverageLatencyMs: 2.8,
      benchmarkDroppedFramePct: 0.0,
      benchmarkTimestamp: new Date().toISOString(),
      cpuCores: 16,
      memoryGb: 32,
      measuredDownlinkMbps: 100.0,
      measuredRttMs: 15.0,
      measuredPacketLossPct: 0.0,
    };

    it("should schedule all 64 cameras to live decode with zero fallback to keyframes", () => {
      const cameras = generateCameras(64);
      const viewport = createViewport(64);

      const result = scheduler.calculateSchedule(cameras, viewport, rtxProfile);

      expect(result.totalCameras).toBe(64);
      expect(result.activeLiveDecodes).toBe(64);
      expect(result.activeKeyframeStreams).toBe(0);
      expect(result.hardwareDecodersUsed).toBe(64);
      expect(result.hardwareDecodersLimit).toBe(64);
      expect(result.diagnostics.limitingFactor).toBe("NONE");
      expect(result.systemHealthStatus).toBe("OPTIMAL");
    });

    it("should allocate 1080p Mainstream with audio to focused camera and 720p/360p to remaining tiles", () => {
      const cameras = generateCameras(64);
      const viewport = createViewport(64, "CAM-005", ["CAM-002"]);

      const result = scheduler.calculateSchedule(cameras, viewport, rtxProfile);

      // Focused camera CAM-005
      const focusedSchedule = result.schedules["CAM-005"];
      expect(focusedSchedule).toBeDefined();
      expect(focusedSchedule.streamTier).toBe("MAINSTREAM_1080P");
      expect(focusedSchedule.targetResolution).toEqual({ width: 1920, height: 1080 });
      expect(focusedSchedule.targetFps).toBe(30);
      expect(focusedSchedule.audioEnabled).toBe(true);
      expect(focusedSchedule.playbackMode).toBe("LIVE_DECODE");

      // Alarm camera CAM-002
      const alarmSchedule = result.schedules["CAM-002"];
      expect(alarmSchedule).toBeDefined();
      expect(alarmSchedule.streamTier).toBe("MEDIUM_720P");
      expect(alarmSchedule.targetResolution).toEqual({ width: 1280, height: 720 });
      expect(alarmSchedule.targetFps).toBe(25);
    });
  });

  describe("Standard Office Laptop (16 Measured Streams)", () => {
    const laptopProfile: ClientHardwareProfile = {
      fingerprint: "ws_intel_iris_xe_measured",
      gpuModel: "Intel(R) Iris(R) Xe Graphics",
      rendererString: "Intel - Intel(R) Iris(R) Xe Graphics Direct3D11",
      hardwareDecoder: "QUICKSYNC",
      supportedCodecs: [
        {
          codec: "H264",
          mimeType: "video/mp4; codecs=\"avc1.42E01E\"",
          isHardwareAccelerated: true,
          maxSupportedResolution: { width: 1920, height: 1080 },
          maxFps: 60,
        },
      ],
      preferredCodec: "H264",
      measuredMaxDecodeSessions: 16, // Measured QuickSync limit
      benchmarkAverageLatencyMs: 7.5,
      benchmarkDroppedFramePct: 0.1,
      benchmarkTimestamp: new Date().toISOString(),
      cpuCores: 8,
      memoryGb: 16,
      measuredDownlinkMbps: 35.0,
      measuredRttMs: 25.0,
      measuredPacketLossPct: 0.0,
    };

    it("should allocate top 16 cameras to live decode and overflow remaining cameras to synchronized keyframes", () => {
      const cameras = generateCameras(36); // 36 cameras on a 16-decoder laptop
      const viewport = createViewport(36, "CAM-001", ["CAM-003"]);

      const result = scheduler.calculateSchedule(cameras, viewport, laptopProfile);

      expect(result.totalCameras).toBe(36);
      expect(result.activeLiveDecodes).toBe(16);
      expect(result.activeKeyframeStreams).toBe(20);
      expect(result.hardwareDecodersUsed).toBe(16);
      expect(result.hardwareDecodersLimit).toBe(16);
      expect(result.diagnostics.limitingFactor).toBe("DECODER_SESSIONS");

      // High priority cameras must be in the live 16
      expect(result.schedules["CAM-001"].playbackMode).toBe("LIVE_DECODE");
      expect(result.schedules["CAM-003"].playbackMode).toBe("LIVE_DECODE");

      // Excess cameras should be in low-fps keyframe mode
      const overflowCam = result.schedules["CAM-030"];
      expect(overflowCam.playbackMode).toBe("LOW_FPS_KEYFRAME");
      expect(overflowCam.targetFps).toBeLessThanOrEqual(2);
      expect(overflowCam.targetBitrateKbps).toBeLessThan(100);
    });
  });

  describe("Thin Client (9 Measured Streams)", () => {
    const thinClientProfile: ClientHardwareProfile = {
      fingerprint: "ws_thin_client_celeron_measured",
      gpuModel: "Intel Celeron N100 / VAAPI",
      rendererString: "Mesa Intel(R) Graphics (ADL-N)",
      hardwareDecoder: "VAAPI",
      supportedCodecs: [
        {
          codec: "H264",
          mimeType: "video/mp4; codecs=\"avc1.42E01E\"",
          isHardwareAccelerated: true,
          maxSupportedResolution: { width: 1920, height: 1080 },
          maxFps: 30,
        },
      ],
      preferredCodec: "H264",
      measuredMaxDecodeSessions: 9, // Measured thin client limit
      benchmarkAverageLatencyMs: 14.0,
      benchmarkDroppedFramePct: 0.5,
      benchmarkTimestamp: new Date().toISOString(),
      cpuCores: 4,
      memoryGb: 8,
      measuredDownlinkMbps: 15.0,
      measuredRttMs: 35.0,
      measuredPacketLossPct: 0.0,
    };

    it("should strictly limit live decodes to 9 and schedule remainder to keyframes", () => {
      const cameras = generateCameras(25);
      const viewport = createViewport(25);

      const result = scheduler.calculateSchedule(cameras, viewport, thinClientProfile);

      expect(result.totalCameras).toBe(25);
      expect(result.activeLiveDecodes).toBe(9);
      expect(result.activeKeyframeStreams).toBe(16);
      expect(result.hardwareDecodersUsed).toBe(9);
      expect(result.hardwareDecodersLimit).toBe(9);
    });
  });

  describe("Dynamic Congestion & CPU Overload Adaptation", () => {
    it("should throttle bitrates and FPS when network is congested (low bandwidth / packet loss)", () => {
      const baseProfile = ClientMediaSchedulerService.HARDWARE_PRESETS.OFFICE_LAPTOP;
      const profile = scheduler.resolveEffectiveProfile(undefined, {
        measuredMaxDecodeSessions: baseProfile.measuredMaxDecodeSessions,
        hardwareDecoder: baseProfile.hardwareDecoder,
      });

      const cameras = generateCameras(16);
      const viewport = createViewport(16);

      // Low downlink 3 Mbps with 4% packet loss
      const liveTelemetry = {
        sessionId: viewport.sessionId,
        currentDownlinkMbps: 3.0,
        currentPacketLossPct: 4.0,
        cpuUsagePct: 30,
        eventLoopLagMs: 8,
        activeDecodedStreams: 16,
        totalRenderedFps: 240,
        droppedFramesPerSec: 12,
        decodeLatencyP95Ms: 15,
        memoryPressure: "normal" as const,
      };

      const result = scheduler.calculateSchedule(cameras, viewport, profile, liveTelemetry);

      expect(result.diagnostics.limitingFactor).toBe("BANDWIDTH");
      expect(result.totalAllocatedBandwidthKbps).toBeLessThanOrEqual(3000 * 0.85 + 500);
      expect(result.systemHealthStatus).toBe("CONGESTED");
    });

    it("should pause non-intersecting / off-screen cameras completely", () => {
      const baseProfile = ClientMediaSchedulerService.HARDWARE_PRESETS.OFFICE_LAPTOP;
      const profile = scheduler.resolveEffectiveProfile(undefined, {
        measuredMaxDecodeSessions: baseProfile.measuredMaxDecodeSessions,
        hardwareDecoder: baseProfile.hardwareDecoder,
      });

      const cameras = generateCameras(10);
      const viewport = createViewport(10);
      // Mark cameras 8, 9, 10 as off-screen
      viewport.tiles[7].isIntersecting = false;
      viewport.tiles[8].isIntersecting = false;
      viewport.tiles[9].isIntersecting = false;

      const result = scheduler.calculateSchedule(cameras, viewport, profile);

      expect(result.schedules["CAM-008"].playbackMode).toBe("PAUSED");
      expect(result.schedules["CAM-008"].targetBitrateKbps).toBe(0);
      expect(result.schedules["CAM-009"].playbackMode).toBe("PAUSED");
      expect(result.schedules["CAM-010"].playbackMode).toBe("PAUSED");
      expect(result.pausedStreams).toBe(3);
    });
  });
});
