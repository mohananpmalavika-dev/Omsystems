import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import { registerClientMediaSchedulerRoutes } from "../../src/routes/client-media-scheduler.routes.js";

describe("Client Media Scheduler REST API Routes Suite", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    await registerClientMediaSchedulerRoutes(app);
    await app.ready();
  });

  it("GET /v1/media/scheduler/presets returns empirical baseline calibrations", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/media/scheduler/presets",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.presets).toBeDefined();
    expect(body.presets.RTX_GPU_WORKSTATION.measuredMaxDecodeSessions).toBe(64);
    expect(body.presets.OFFICE_LAPTOP.measuredMaxDecodeSessions).toBe(16);
    expect(body.presets.THIN_CLIENT.measuredMaxDecodeSessions).toBe(9);
  });

  it("POST /v1/media/scheduler/profile registers measured client hardware profile", async () => {
    const payload = {
      fingerprint: "ws_test_rtx_4080",
      gpuModel: "NVIDIA GeForce RTX 4080",
      rendererString: "NVIDIA Corporation - RTX 4080",
      hardwareDecoder: "NVDEC",
      supportedCodecs: [
        {
          codec: "H264",
          mimeType: "video/mp4; codecs=\"avc1.42E01E\"",
          isHardwareAccelerated: true,
          maxSupportedResolution: { width: 3840, height: 2160 },
          maxFps: 60,
        },
      ],
      preferredCodec: "H264",
      measuredMaxDecodeSessions: 64,
      benchmarkAverageLatencyMs: 3.1,
      benchmarkDroppedFramePct: 0.0,
      cpuCores: 16,
      memoryGb: 32,
      measuredDownlinkMbps: 95.0,
      measuredRttMs: 12.0,
      measuredPacketLossPct: 0.0,
    };

    const response = await app.inject({
      method: "POST",
      url: "/v1/media/scheduler/profile",
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("profile_registered");
    expect(body.fingerprint).toBe("ws_test_rtx_4080");
    expect(body.hardwareDecoder).toBe("NVDEC");
    expect(body.measuredMaxDecodeSessions).toBe(64);

    // Retrieve the profile via GET
    const getRes = await app.inject({
      method: "GET",
      url: "/v1/media/scheduler/profile/ws_test_rtx_4080",
    });
    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.body);
    expect(getBody.profile.gpuModel).toBe("NVIDIA GeForce RTX 4080");
  });

  it("POST /v1/media/scheduler/calculate returns authoritative schedules without guessing", async () => {
    const payload = {
      fingerprint: "ws_test_rtx_4080",
      sessionId: "00000000-0000-0000-0000-000000000002",
      gridRows: 4,
      gridCols: 4,
      cameras: [
        { id: "CAM-001", name: "Main Entrance", isOnline: true },
        { id: "CAM-002", name: "Vault Room", isOnline: true },
        { id: "CAM-003", name: "Parking Area", isOnline: true },
        { id: "CAM-004", name: "Offline Hallway", isOnline: false },
      ],
      tiles: [
        { cameraId: "CAM-001", widthPx: 960, heightPx: 540, tileIndex: 0, isIntersecting: true },
        { cameraId: "CAM-002", widthPx: 960, heightPx: 540, tileIndex: 1, isIntersecting: true },
        { cameraId: "CAM-003", widthPx: 960, heightPx: 540, tileIndex: 2, isIntersecting: true },
        { cameraId: "CAM-004", widthPx: 960, heightPx: 540, tileIndex: 3, isIntersecting: true },
      ],
      visibleCameraIds: ["CAM-001", "CAM-002", "CAM-003", "CAM-004"],
      focusedCameraId: "CAM-001",
      activeAlarmCameraIds: ["CAM-002"],
    };

    const response = await app.inject({
      method: "POST",
      url: "/v1/media/scheduler/calculate",
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.schedule).toBeDefined();
    expect(body.schedule.activeLiveDecodes).toBe(3); // 3 online cameras
    expect(body.schedule.pausedStreams).toBe(1); // 1 offline camera

    // Focused camera
    const cam1 = body.schedule.schedules["CAM-001"];
    expect(cam1.streamTier).toBe("MAINSTREAM_1080P");
    expect(cam1.targetResolution).toEqual({ width: 1920, height: 1080 });
    expect(cam1.targetFps).toBe(30);

    // Alarm camera
    const cam2 = body.schedule.schedules["CAM-002"];
    expect(cam2.streamTier).toBe("MEDIUM_720P");
    expect(cam2.targetResolution).toEqual({ width: 1280, height: 720 });

    // Offline camera
    const cam4 = body.schedule.schedules["CAM-004"];
    expect(cam4.playbackMode).toBe("PAUSED");
  });

  it("POST /v1/media/scheduler/adapt handles real-time player degradation feedback", async () => {
    const payload = {
      sessionId: "00000000-0000-0000-0000-000000000003",
      droppedFramesPerSec: 15,
      eventLoopLagMs: 45,
      cpuUsagePct: 88,
      packetLossPct: 3.5,
      currentDownlinkMbps: 4.0,
      activeCameraIds: ["CAM-001", "CAM-002", "CAM-003", "CAM-004", "CAM-005"],
      focusedCameraId: "CAM-001",
    };

    const response = await app.inject({
      method: "POST",
      url: "/v1/media/scheduler/adapt",
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.adaptation).toBeDefined();
    expect(body.adaptation.systemHealthStatus).toBe("CRITICAL_OVERLOAD");
    expect(body.adaptation.limitingFactor).toBe("BANDWIDTH");
  });
});
