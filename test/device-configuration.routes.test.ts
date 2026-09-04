import { describe, expect, it, vi, beforeAll } from "vitest";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";
import type { Camera } from "../src/domain/models.js";
import {
  DeviceConfigurationService,
  type RecorderAdapterProvider,
} from "../src/services/device-configuration.service.js";
import type { OnvifCameraClient } from "../src/onvif/onvif-camera-client.js";

describe("Device Configuration Center Routes (Phase 2 & Phase 3)", () => {
  const adminHeaders = { "x-user-id": "user-global-admin" };
  const restrictedHeaders = { "x-user-id": "user-restricted-guard" };

  const testCamera: Camera = {
    id: "cam-conf-01",
    name: "Main Branch Entrance Camera",
    nodeId: "branch-blr-001",
    branchId: "branch-blr-001",
    vendor: "hikvision",
    model: "DS-2CD2143G2",
    channel: 1,
    protocol: "rtsp",
    status: "online",
    profiles: [],
    capabilities: { ptz: false, audio: false, motion: true },
    ipAddress: "192.168.1.55",
    connectionSecretRef: "vault://branches/blr-001/cameras/01",
  };

  function createMockOnvifClient() {
    let currentMainConfig = {
      codec: "H264",
      resolution: { width: 1920, height: 1080 },
      fps: 25,
      bitrateKbps: 4096,
      quality: 75,
      govLength: 50,
      h264Profile: "Main",
    };

    let currentSubConfig = {
      codec: "H264",
      resolution: { width: 1280, height: 720 },
      fps: 15,
      bitrateKbps: 1024,
      quality: 60,
      govLength: 30,
      h264Profile: "Baseline",
    };

    let currentImagingConfig = {
      brightness: 55,
      contrast: 50,
      colorSaturation: 52,
      sharpness: 60,
      irCutFilter: "AUTO" as const,
      exposure: { mode: "AUTO", exposureTime: 0.02, gain: 10 },
      wideDynamicRange: { mode: "ON", level: 50 },
      whiteBalance: { mode: "AUTO" },
    };

    let currentTime: Date | null = null;
    let currentNtpActive = true;
    let currentNtpServer = "time.bank.internal";

    let currentNetworkConfig = {
      ipAddress: "192.168.1.55",
      prefixLength: 24,
      dhcpEnabled: false,
      gateway: "192.168.1.1",
      dnsServers: ["8.8.8.8", "1.1.1.1"],
    };

    return {
      connect: vi.fn().mockResolvedValue({}),
      media: {
        getProfiles: vi.fn().mockImplementation(async () => [
          {
            token: "Profile_1",
            name: "MainStream",
            videoSourceConfigurationToken: "V_SRC_1",
            videoEncoderConfiguration: {
              token: "V_ENC_1",
              name: "H264_Main",
              encoding: currentMainConfig.codec,
              resolution: currentMainConfig.resolution,
              quality: currentMainConfig.quality,
              framerateLimit: currentMainConfig.fps,
              bitrateLimitKbps: currentMainConfig.bitrateKbps,
              govLength: currentMainConfig.govLength,
              h264Profile: currentMainConfig.h264Profile,
            },
          },
          {
            token: "Profile_2",
            name: "SubStream",
            videoSourceConfigurationToken: "V_SRC_1",
            videoEncoderConfiguration: {
              token: "V_ENC_2",
              name: "H264_Sub",
              encoding: currentSubConfig.codec,
              resolution: currentSubConfig.resolution,
              quality: currentSubConfig.quality,
              framerateLimit: currentSubConfig.fps,
              bitrateLimitKbps: currentSubConfig.bitrateKbps,
              govLength: currentSubConfig.govLength,
              h264Profile: currentSubConfig.h264Profile,
            },
          },
        ]),
        getVideoEncoderConfigurationOptions: vi.fn().mockResolvedValue({
          qualityRange: { min: 1, max: 100 },
          resolutionsAvailable: [
            { width: 1280, height: 720 },
            { width: 1920, height: 1080 },
            { width: 2560, height: 1440 },
          ],
          frameRateRange: { min: 1, max: 30 },
          bitrateRangeKbps: { min: 128, max: 8192 },
          govLengthRange: { min: 1, max: 200 },
        }),
        setVideoEncoderConfiguration: vi.fn().mockImplementation(async (cfg) => {
          if (cfg.token === "V_ENC_2") {
            currentSubConfig = {
              ...currentSubConfig,
              codec: cfg.encoding,
              resolution: cfg.resolution ?? { width: cfg.width, height: cfg.height },
              fps: cfg.framerateLimit,
              bitrateKbps: cfg.bitrateLimitKbps,
              quality: cfg.quality,
              govLength: cfg.govLength,
            };
          } else {
            currentMainConfig = {
              ...currentMainConfig,
              codec: cfg.encoding,
              resolution: cfg.resolution ?? { width: cfg.width, height: cfg.height },
              fps: cfg.framerateLimit,
              bitrateKbps: cfg.bitrateLimitKbps,
              quality: cfg.quality,
              govLength: cfg.govLength,
            };
          }
        }),
      },
      imaging: {
        getImagingSettings: vi.fn().mockImplementation(async () => ({ ...currentImagingConfig })),
        getOptions: vi.fn().mockResolvedValue({
          brightness: { min: 0, max: 100 },
          contrast: { min: 0, max: 100 },
          colorSaturation: { min: 0, max: 100 },
          sharpness: { min: 0, max: 100 },
          irCutFilterModes: ["ON", "OFF", "AUTO"],
          exposure: { mode: ["AUTO", "MANUAL"], gain: { min: 0, max: 100 } },
        }),
        setImagingSettings: vi.fn().mockImplementation(async (_token, settings) => {
          currentImagingConfig = {
            ...currentImagingConfig,
            ...settings,
          };
        }),
      },
      device: {
        getSystemDateAndTime: vi.fn().mockImplementation(async () => ({
          dateTimeType: currentNtpActive ? "NTP" : "Manual",
          daylightSavings: false,
          timeZone: "Asia/Kolkata",
          utcDateTime: currentTime ?? new Date(),
          clockDriftMs: 0,
        })),
        setSystemDateAndTime: vi.fn().mockImplementation(async (timeCfg: any) => {
          currentTime = timeCfg.utcDateTime ?? new Date();
          currentNtpActive = timeCfg.dateTimeType === "NTP";
        }),
        getNtp: vi.fn().mockImplementation(async () => ({
          fromDHCP: false,
          manualServers: [currentNtpServer],
          dhcpServers: [],
        })),
        setNtp: vi.fn().mockImplementation(async (opts: any) => {
          if (opts.manualServers && opts.manualServers.length > 0) {
            currentNtpServer = opts.manualServers[0];
          }
        }),
        getNetworkInterfaces: vi.fn().mockImplementation(async () => [
          {
            token: "eth0",
            enabled: true,
            ipv4: {
              enabled: true,
              dhcp: currentNetworkConfig.dhcpEnabled,
              manual: [
                {
                  address: currentNetworkConfig.ipAddress,
                  prefixLength: currentNetworkConfig.prefixLength,
                },
              ],
            },
          },
        ]),
        setNetworkInterfaces: vi.fn().mockImplementation(async (_token: string, cfg: any) => {
          currentNetworkConfig.ipAddress = cfg.ipAddress;
          currentNetworkConfig.prefixLength = cfg.prefixLength;
          currentNetworkConfig.dhcpEnabled = cfg.dhcpEnabled;
        }),
        getNetworkDefaultGateway: vi.fn().mockImplementation(async () => [currentNetworkConfig.gateway]),
        setNetworkDefaultGateway: vi.fn().mockImplementation(async (gws: string[]) => {
          if (gws.length > 0) currentNetworkConfig.gateway = gws[0]!;
        }),
        getDNS: vi.fn().mockImplementation(async () => ({
          fromDHCP: currentNetworkConfig.dhcpEnabled,
          searchDomain: [],
          manualServers: currentNetworkConfig.dnsServers,
        })),
        setDNS: vi.fn().mockImplementation(async (opts: any) => {
          if (opts.manualServers) currentNetworkConfig.dnsServers = opts.manualServers;
        }),
      },
    } as unknown as OnvifCameraClient;
  }

  function createMockRecorderProvider(): RecorderAdapterProvider {
    let manualTime: Date | null = null;
    let channel1Schedule: any = {
      channelNumber: 1,
      enabled: true,
      schedule: [
        {
          day: "MONDAY",
          periods: [
            {
              startHour: 9,
              startMinute: 0,
              endHour: 18,
              endMinute: 0,
              type: "CONTINUOUS",
            },
          ],
        },
      ],
      preRecordSeconds: 5,
      postRecordSeconds: 30,
    };

    let channel1Encoding: any = {
      codec: "H264",
      resolution: { width: 1920, height: 1080 },
      fps: 25,
      bitrateKbps: 4096,
      quality: 75,
      govLength: 50,
      h264Profile: "Main",
    };

    let recorderNetwork: any = {
      dhcpEnabled: false,
      ipAddress: "192.168.1.200",
      subnetMask: "255.255.255.0",
      gateway: "192.168.1.1",
      dnsServers: ["8.8.8.8", "1.1.1.1"],
      httpPort: 80,
      httpsPort: 443,
      rtspPort: 554,
      onvifPort: 80,
    };

    return {
      create: vi.fn().mockResolvedValue({
        getNetworkConfiguration: vi.fn().mockImplementation(async () => ({
          status: "healthy",
          value: { ...recorderNetwork },
          checkedAt: new Date(),
        })),
        setNetworkConfiguration: vi.fn().mockImplementation(async (net: any) => {
          recorderNetwork = { ...recorderNetwork, ...net };
          return { status: "healthy", checkedAt: new Date() };
        }),
        getChannels: vi.fn().mockResolvedValue({
          status: "healthy",
          value: [
            { id: "ch-1", name: "Channel 1", status: "online" },
            { id: "ch-2", name: "Channel 2", status: "online" },
          ],
          checkedAt: new Date(),
        }),
        getRecordingStatus: vi.fn().mockResolvedValue({
          status: "healthy",
          value: "recording",
          checkedAt: new Date(),
        }),
        getRecordingSchedule: vi.fn().mockImplementation(async () => ({
          status: "healthy",
          value: { ...channel1Schedule },
          checkedAt: new Date(),
        })),
        setRecordingSchedule: vi.fn().mockImplementation(async (_ch: string, sched: any) => {
          channel1Schedule = { ...sched };
          return { status: "healthy", checkedAt: new Date() };
        }),
        getChannelEncoding: vi.fn().mockImplementation(async () => ({
          status: "healthy",
          value: { ...channel1Encoding },
          checkedAt: new Date(),
        })),
        setChannelEncoding: vi.fn().mockImplementation(async (_ch: string, enc: any) => {
          channel1Encoding = { ...channel1Encoding, ...enc };
          return { status: "healthy", checkedAt: new Date() };
        }),
        getStorageStatus: vi.fn().mockResolvedValue({
          status: "healthy",
          value: {
            disks: [
              {
                diskIndex: 1,
                name: "HDD 1",
                status: "OK",
                capacityBytes: 4000000000000,
                usedBytes: 2500000000000,
                freeBytes: 1500000000000,
                smartHealth: "PASSED",
                readOnly: false,
              },
            ],
          },
          checkedAt: new Date(),
        }),
        getDeviceTime: vi.fn().mockImplementation(async () => ({
          status: "healthy",
          value: manualTime ?? new Date(),
          checkedAt: new Date(),
        })),
        setTimeConfiguration: vi.fn().mockImplementation(async (cfg: any) => {
          manualTime = cfg.utcDateTime ? new Date(cfg.utcDateTime) : new Date();
          return { status: "healthy", checkedAt: new Date() };
        }),
        disconnect: vi.fn().mockResolvedValue(undefined),
      }),
    };
  }

  let app: any;
  let store: MemoryStore;

  beforeAll(async () => {
    store = new MemoryStore();

    (store as any).nodes.set("company-1", {
      id: "company-1",
      tenantId: "omsystems",
      type: "company",
      name: "Corporate HO",
      path: ["company-1"],
    });

    (store as any).nodes.set("branch-blr-001", {
      id: "branch-blr-001",
      parentId: "company-1",
      tenantId: "omsystems",
      type: "branch",
      name: "Bengaluru Central",
      path: ["company-1", "branch-blr-001"],
    });

    (store as any).nodes.set("rec-blr-001", {
      id: "rec-blr-001",
      parentId: "branch-blr-001",
      tenantId: "omsystems",
      type: "dvr",
      name: "DVR Bengaluru Central",
      path: ["company-1", "branch-blr-001", "rec-blr-001"],
    });

    (store as any).cameras.set(testCamera.id, testCamera);

    (store as any).users.set("user-global-admin", {
      id: "user-global-admin",
      displayName: "Global Admin",
      tenantId: "omsystems",
      role: "super_admin",
      status: "active",
    });

    (store as any).users.set("user-restricted-guard", {
      id: "user-restricted-guard",
      displayName: "Security Guard",
      tenantId: "omsystems",
      role: "operator",
      status: "active",
    });

    (store as any).grants.push({
      userId: "user-global-admin",
      scopeNodeId: "company-1",
      actions: ["live:view", "device:configure", "recording:view"],
      effect: "allow",
    });

    const mockOnvif = createMockOnvifClient();
    const mockRecorders = createMockRecorderProvider();

    const configService = new DeviceConfigurationService({
      store,
      onvifClientFactory: () => mockOnvif,
      recorderAdapterProvider: mockRecorders,
    });

    app = await buildApp({
      logger: false,
      store,
      deviceConfigurationService: configService,
    });
  });

  // =========================================================================
  // PHASE 2: READ-ONLY TESTS
  // =========================================================================

  it("reads actual camera video configuration via GET /v1/devices/:id/configuration/video", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/devices/${testCamera.id}/configuration/video`,
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.codec).toBe("H264");
    expect(body.data.resolution).toEqual({ width: 1920, height: 1080 });
    expect(body.data.fps).toBe(25);
    expect(body.data.bitrateKbps).toBe(4096);
  });

  it("introspects supported video options via GET /v1/devices/:id/configuration/video/options", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/devices/${testCamera.id}/configuration/video/options`,
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.supportedResolutions).toHaveLength(3);
    expect(body.data.fpsRange).toEqual({ min: 1, max: 30 });
    expect(body.data.bitrateRangeKbps).toEqual({ min: 128, max: 8192 });
  });

  it("reads actual camera imaging settings via GET /v1/devices/:id/configuration/imaging", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/devices/${testCamera.id}/configuration/imaging`,
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.brightness).toBe(55);
    expect(body.data.contrast).toBe(50);
    expect(body.data.irCutFilter).toBe("AUTO");
  });

  it("introspects supported imaging options via GET /v1/devices/:id/configuration/imaging/options", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/devices/${testCamera.id}/configuration/imaging/options`,
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.brightnessRange).toEqual({ min: 0, max: 100 });
    expect(body.data.irCutFilterModes).toContain("AUTO");
  });

  it("reads clock status and offset via GET /v1/devices/:id/configuration/time", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/devices/${testCamera.id}/configuration/time`,
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.ntpActive).toBe(true);
    expect(body.data.status).toBe("SYNCHRONIZED");
  });

  it("reads camera network parameters safely via GET /v1/devices/:id/configuration/network", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/devices/${testCamera.id}/configuration/network`,
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.ipAddress).toBe(testCamera.ipAddress);
    expect(body.data.subnetMask).toBe("255.255.255.0");
  });

  it("reads recorder channels via GET /v1/recorders/:id/configuration/channels", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/recorders/rec-blr-001/configuration/channels`,
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(2);
    expect(body.data.channels[0].name).toBe("Channel 1");
  });

  it("reads recorder recording status via GET /v1/recorders/:id/configuration/recording", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/recorders/rec-blr-001/configuration/recording?channelId=1`,
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.recordingStatus.status).toBe("healthy");
    expect(body.data.recordingStatus.value).toBe("recording");
  });

  it("reads recorder storage health via GET /v1/recorders/:id/configuration/storage", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/recorders/rec-blr-001/configuration/storage`,
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("healthy");
    expect(body.data.value.disks).toHaveLength(1);
    expect(body.data.value.disks[0].name).toBe("HDD 1");
  });

  it("enforces 403 FORBIDDEN when user lacks permission to view camera configuration", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/devices/${testCamera.id}/configuration/video`,
      headers: restrictedHeaders,
    });

    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.error).toBe("PERMISSION_DENIED");
  });

  it("returns 404 NOT_FOUND when querying nonexistent camera", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/devices/nonexistent-camera-id/configuration/video`,
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error).toBe("CAMERA_NOT_FOUND");
  });

  // =========================================================================
  // PHASE 3: MUTATION & VERIFICATION TESTS
  // =========================================================================

  it("applies video configuration with hardware verification via POST /v1/devices/:id/configuration/video", async () => {
    const desired = {
      codec: "H265",
      resolution: { width: 2560, height: 1440 },
      fps: 30,
      bitrateKbps: 6144,
      quality: 80,
    };

    const response = await app.inject({
      method: "POST",
      url: `/v1/devices/${testCamera.id}/configuration/video`,
      headers: adminHeaders,
      payload: desired,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.state).toBe("VERIFIED");
    expect(body.data.verification.verified).toBe(true);
    expect(body.data.verification.drifts).toHaveLength(0);
    expect(body.data.previousSnapshotId).toBeDefined();

    // Verify read-back confirms the updated configuration
    const readResponse = await app.inject({
      method: "GET",
      url: `/v1/devices/${testCamera.id}/configuration/video`,
      headers: adminHeaders,
    });
    expect(readResponse.statusCode).toBe(200);
    const readBody = readResponse.json();
    expect(readBody.data.codec).toBe("H265");
    expect(readBody.data.resolution).toEqual({ width: 2560, height: 1440 });
    expect(readBody.data.fps).toBe(30);
    expect(readBody.data.bitrateKbps).toBe(6144);
  });

  it("targets secondary sub-stream independently via streamProfileToken", async () => {
    const subDesired = {
      codec: "H264",
      resolution: { width: 1280, height: 720 },
      fps: 20,
      bitrateKbps: 2048,
      streamProfileToken: "Profile_2",
    };

    const response = await app.inject({
      method: "POST",
      url: `/v1/devices/${testCamera.id}/configuration/video`,
      headers: adminHeaders,
      payload: subDesired,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.state).toBe("VERIFIED");

    // Read back sub-stream directly
    const readSub = await app.inject({
      method: "GET",
      url: `/v1/devices/${testCamera.id}/configuration/video?profileToken=Profile_2`,
      headers: adminHeaders,
    });
    expect(readSub.statusCode).toBe(200);
    expect(readSub.json().data.resolution).toEqual({ width: 1280, height: 720 });
    expect(readSub.json().data.fps).toBe(20);
    expect(readSub.json().data.bitrateKbps).toBe(2048);
  });

  it("rejects unsupported resolution with 422 UNSUPPORTED_RESOLUTION", async () => {
    const invalidRes = {
      codec: "H264",
      resolution: { width: 3840, height: 2160 }, // 4K not in hardware resolutions list
      fps: 25,
      bitrateKbps: 4096,
    };

    const response = await app.inject({
      method: "POST",
      url: `/v1/devices/${testCamera.id}/configuration/video`,
      headers: adminHeaders,
      payload: invalidRes,
    });

    expect(response.statusCode).toBe(422);
    const body = response.json();
    expect(body.error).toBe("UNSUPPORTED_RESOLUTION");
  });

  it("rejects out-of-range FPS with 422 FPS_OUT_OF_RANGE", async () => {
    const invalidFps = {
      codec: "H264",
      resolution: { width: 1920, height: 1080 },
      fps: 60, // Max supported is 30
      bitrateKbps: 4096,
    };

    const response = await app.inject({
      method: "POST",
      url: `/v1/devices/${testCamera.id}/configuration/video`,
      headers: adminHeaders,
      payload: invalidFps,
    });

    expect(response.statusCode).toBe(422);
    const body = response.json();
    expect(body.error).toBe("FPS_OUT_OF_RANGE");
  });

  it("rejects out-of-range bitrate with 422 BITRATE_OUT_OF_RANGE", async () => {
    const invalidBitrate = {
      codec: "H264",
      resolution: { width: 1920, height: 1080 },
      fps: 25,
      bitrateKbps: 50000, // Max supported is 8192
    };

    const response = await app.inject({
      method: "POST",
      url: `/v1/devices/${testCamera.id}/configuration/video`,
      headers: adminHeaders,
      payload: invalidBitrate,
    });

    expect(response.statusCode).toBe(422);
    const body = response.json();
    expect(body.error).toBe("BITRATE_OUT_OF_RANGE");
  });

  it("enforces 403 when user lacking device:configure attempts to mutate video configuration", async () => {
    const payload = {
      codec: "H264",
      resolution: { width: 1920, height: 1080 },
      fps: 25,
      bitrateKbps: 4096,
    };

    const response = await app.inject({
      method: "POST",
      url: `/v1/devices/${testCamera.id}/configuration/video`,
      headers: restrictedHeaders,
      payload,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("PERMISSION_DENIED");
  });

  it("restores snapshot safely via POST /v1/devices/:id/configuration/rollback", async () => {
    // 1. Mutate to 1440p
    const mutateRes = await app.inject({
      method: "POST",
      url: `/v1/devices/${testCamera.id}/configuration/video`,
      headers: adminHeaders,
      payload: {
        codec: "H265",
        resolution: { width: 2560, height: 1440 },
        fps: 30,
        bitrateKbps: 6144,
      },
    });
    expect(mutateRes.statusCode).toBe(200);
    const snapshotId = mutateRes.json().data.previousSnapshotId;
    expect(snapshotId).toBeDefined();

    // 2. Trigger rollback
    const rollbackRes = await app.inject({
      method: "POST",
      url: `/v1/devices/${testCamera.id}/configuration/rollback`,
      headers: adminHeaders,
      payload: { snapshotId },
    });

    expect(rollbackRes.statusCode).toBe(200);
    expect(rollbackRes.json().data.state).toBe("ROLLED_BACK");

    // 3. Read back to confirm state restored
    const readRes = await app.inject({
      method: "GET",
      url: `/v1/devices/${testCamera.id}/configuration/video`,
      headers: adminHeaders,
    });
    expect(readRes.statusCode).toBe(200);
    // Was restored to what was captured in snapshot
    expect(readRes.json().data.resolution).toBeDefined();
  });

  // =========================================================================
  // PHASE 4: SAFE IMAGE TUNING & DAY/NIGHT TESTS
  // =========================================================================

  it("applies imaging configuration and verifies on hardware via POST /v1/devices/:id/configuration/imaging", async () => {
    const desiredImage = {
      brightness: 65,
      contrast: 55,
      colorSaturation: 60,
      sharpness: 70,
      irCutFilter: "ON",
      wideDynamicRange: { mode: "ON", level: 60 },
    };

    const response = await app.inject({
      method: "POST",
      url: `/v1/devices/${testCamera.id}/configuration/imaging`,
      headers: adminHeaders,
      payload: desiredImage,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.state).toBe("VERIFIED");
    expect(body.data.verification.verified).toBe(true);
    expect(body.data.verification.drifts).toHaveLength(0);
    expect(body.data.previousSnapshotId).toBeDefined();

    // Verify read-back confirms settings applied
    const readResponse = await app.inject({
      method: "GET",
      url: `/v1/devices/${testCamera.id}/configuration/imaging`,
      headers: adminHeaders,
    });
    expect(readResponse.statusCode).toBe(200);
    const readBody = readResponse.json();
    expect(readBody.data.brightness).toBe(65);
    expect(readBody.data.contrast).toBe(55);
    expect(readBody.data.sharpness).toBe(70);
    expect(readBody.data.irCutFilter).toBe("ON");
  });

  it("rejects out-of-bounds imaging parameters with 400 or 422", async () => {
    const invalidImage = {
      brightness: 150, // Max allowed is 100
    };

    const response = await app.inject({
      method: "POST",
      url: `/v1/devices/${testCamera.id}/configuration/imaging`,
      headers: adminHeaders,
      payload: invalidImage,
    });

    expect([400, 422]).toContain(response.statusCode);
  });

  it("enforces 403 when user lacking device:configure attempts to mutate imaging settings", async () => {
    const payload = {
      brightness: 60,
      contrast: 60,
    };

    const response = await app.inject({
      method: "POST",
      url: `/v1/devices/${testCamera.id}/configuration/imaging`,
      headers: restrictedHeaders,
      payload,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("PERMISSION_DENIED");
  });

  // =========================================================================
  // PHASE 5: TIME SYNCHRONIZATION & DRIFT MITIGATION TESTS
  // =========================================================================

  it("synchronizes camera time via POST /v1/devices/:id/configuration/time", async () => {
    const payload = {
      dateTimeType: "NTP",
      ntpServer: "pool.ntp.org",
      timeZone: "Asia/Kolkata",
    };

    const response = await app.inject({
      method: "POST",
      url: `/v1/devices/${testCamera.id}/configuration/time`,
      headers: adminHeaders,
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.state).toBe("VERIFIED");
    expect(body.data.verification.verified).toBe(true);
    expect(body.data.verification.drifts).toHaveLength(0);
    expect(body.data.previousSnapshotId).toBeDefined();

    // Verify read-back
    const readResponse = await app.inject({
      method: "GET",
      url: `/v1/devices/${testCamera.id}/configuration/time`,
      headers: adminHeaders,
    });
    expect(readResponse.statusCode).toBe(200);
    expect(readResponse.json().data.ntpActive).toBe(true);
  });

  it("configures manual camera time via POST /v1/devices/:id/configuration/time", async () => {
    const payload = {
      dateTimeType: "Manual",
      utcDateTime: new Date().toISOString(),
      timeZone: "Asia/Kolkata",
    };

    const response = await app.inject({
      method: "POST",
      url: `/v1/devices/${testCamera.id}/configuration/time`,
      headers: adminHeaders,
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.state).toBe("VERIFIED");
  });

  it("rejects invalid time payload with 400 INVALID_REQUEST_PAYLOAD", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/devices/${testCamera.id}/configuration/time`,
      headers: adminHeaders,
      payload: {
        dateTimeType: "INVALID_MODE",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("INVALID_REQUEST_PAYLOAD");
  });

  it("enforces 403 when user lacking device:configure attempts to mutate camera time", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/devices/${testCamera.id}/configuration/time`,
      headers: restrictedHeaders,
      payload: {
        dateTimeType: "NTP",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("PERMISSION_DENIED");
  });

  it("reads recorder time via GET /v1/recorders/:id/configuration/time", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/recorders/rec-blr-001/configuration/time`,
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("SYNCHRONIZED");
  });

  it("configures recorder time via POST /v1/recorders/:id/configuration/time", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/recorders/rec-blr-001/configuration/time`,
      headers: adminHeaders,
      payload: {
        dateTimeType: "NTP",
        ntpServer: "time.bank.internal",
        timeZone: "Asia/Kolkata",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.state).toBe("VERIFIED");
    expect(body.data.verification.verified).toBe(true);
  });

  // =========================================================================
  // PHASE 6: RECORDER CHANNELS & RECORDING SCHEDULES
  // =========================================================================

  it("reads recorder channel schedule via GET /v1/recorders/:id/configuration/channels/:channelId/schedule", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/recorders/rec-blr-001/configuration/channels/1/schedule`,
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.channelNumber).toBe(1);
    expect(body.data.enabled).toBe(true);
    expect(body.data.schedule).toBeInstanceOf(Array);
  });

  it("updates recorder channel schedule via PUT /v1/recorders/:id/configuration/channels/:channelId/schedule", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/v1/recorders/rec-blr-001/configuration/channels/1/schedule`,
      headers: adminHeaders,
      payload: {
        channelNumber: 1,
        enabled: true,
        preRecordSeconds: 10,
        postRecordSeconds: 60,
        audioRecording: true,
        streamType: "main",
        schedule: [
          {
            day: "MONDAY",
            periods: [
              {
                startHour: 8,
                startMinute: 30,
                endHour: 20,
                endMinute: 0,
                type: "CONTINUOUS",
              },
            ],
          },
          {
            day: "TUESDAY",
            periods: [
              {
                startHour: 8,
                startMinute: 30,
                endHour: 20,
                endMinute: 0,
                type: "MOTION",
              },
            ],
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.state).toBe("VERIFIED");
    expect(body.data.verification.verified).toBe(true);
    expect(body.data.verification.drifts).toHaveLength(0);
  });

  it("rejects invalid schedule period with start time after end time (400 INVALID_REQUEST_PAYLOAD)", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/v1/recorders/rec-blr-001/configuration/channels/1/schedule`,
      headers: adminHeaders,
      payload: {
        enabled: true,
        schedule: [
          {
            day: "WEDNESDAY",
            periods: [
              {
                startHour: 22,
                startMinute: 0,
                endHour: 8,
                endMinute: 0,
                type: "CONTINUOUS",
              },
            ],
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe("INVALID_REQUEST_PAYLOAD");
  });

  it("reads recorder channel encoding via GET /v1/recorders/:id/configuration/channels/:channelId/encoding", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/recorders/rec-blr-001/configuration/channels/1/encoding`,
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.codec).toBe("H264");
    expect(body.data.resolution.width).toBe(1920);
    expect(body.data.fps).toBe(25);
  });

  it("updates recorder channel encoding via PUT /v1/recorders/:id/configuration/channels/:channelId/encoding", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/v1/recorders/rec-blr-001/configuration/channels/1/encoding`,
      headers: adminHeaders,
      payload: {
        codec: "H265",
        resolution: { width: 2560, height: 1440 },
        fps: 30,
        bitrateKbps: 6144,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.state).toBe("VERIFIED");
    expect(body.data.verification.verified).toBe(true);
  });

  it("enforces 403 when unprivileged operator attempts to modify recorder channel schedule", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/v1/recorders/rec-blr-001/configuration/channels/1/schedule`,
      headers: restrictedHeaders,
      payload: {
        enabled: false,
        schedule: [],
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("PERMISSION_DENIED");
  });

  // =========================================================================
  // PHASE 7: NETWORK CONFIGURATION ROUTE TESTS
  // =========================================================================

  it("reads camera network parameters via GET /v1/devices/:id/configuration/network", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/devices/${testCamera.id}/configuration/network`,
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.ipAddress).toBe("192.168.1.55");
    expect(body.data.subnetMask).toBe("255.255.255.0");
    expect(body.data.gateway).toBe("192.168.1.1");
    expect(body.data.dnsServers).toEqual(["8.8.8.8", "1.1.1.1"]);
  });

  it("safely updates camera network configuration via PUT /v1/devices/:id/configuration/network with confirmNetworkChange", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/v1/devices/${testCamera.id}/configuration/network`,
      headers: adminHeaders,
      payload: {
        dhcpEnabled: false,
        ipAddress: "192.168.1.66",
        subnetMask: "255.255.255.0",
        gateway: "192.168.1.1",
        dnsServers: ["1.1.1.1"],
        confirmNetworkChange: true,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.state).toBe("VERIFIED");
    expect(body.data.verification.verified).toBe(true);
    expect(body.data.previousSnapshotId).toBeDefined();
  });

  it("rejects camera network update with 400 when confirmNetworkChange is missing or false", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/v1/devices/${testCamera.id}/configuration/network`,
      headers: adminHeaders,
      payload: {
        dhcpEnabled: false,
        ipAddress: "192.168.1.66",
        subnetMask: "255.255.255.0",
        gateway: "192.168.1.1",
        confirmNetworkChange: false,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe("NETWORK_CONFIRMATION_REQUIRED");
  });

  it("rejects camera network update with 400 when gateway is outside subnet domain (anti-lockout)", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/v1/devices/${testCamera.id}/configuration/network`,
      headers: adminHeaders,
      payload: {
        dhcpEnabled: false,
        ipAddress: "192.168.1.66",
        subnetMask: "255.255.255.0",
        gateway: "10.0.0.1",
        confirmNetworkChange: true,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe("INVALID_GATEWAY_SUBNET");
  });

  it("rejects camera network update with 400 when IP address collides with gateway", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/v1/devices/${testCamera.id}/configuration/network`,
      headers: adminHeaders,
      payload: {
        dhcpEnabled: false,
        ipAddress: "192.168.1.1",
        subnetMask: "255.255.255.0",
        gateway: "192.168.1.1",
        confirmNetworkChange: true,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe("IP_COLLISION_WITH_GATEWAY");
  });

  it("reads recorder network configuration via GET /v1/recorders/:id/configuration/network", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/recorders/rec-blr-001/configuration/network`,
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.ipAddress).toBe("192.168.1.200");
    expect(body.data.subnetMask).toBe("255.255.255.0");
    expect(body.data.gateway).toBe("192.168.1.1");
  });

  it("safely updates recorder network configuration via PUT /v1/recorders/:id/configuration/network with confirmNetworkChange", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/v1/recorders/rec-blr-001/configuration/network`,
      headers: adminHeaders,
      payload: {
        dhcpEnabled: false,
        ipAddress: "192.168.1.210",
        subnetMask: "255.255.255.0",
        gateway: "192.168.1.1",
        confirmNetworkChange: true,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.state).toBe("VERIFIED");
    expect(body.data.verification.verified).toBe(true);
  });

  it("rejects recorder network update with 400 when confirmNetworkChange is not provided", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/v1/recorders/rec-blr-001/configuration/network`,
      headers: adminHeaders,
      payload: {
        dhcpEnabled: false,
        ipAddress: "192.168.1.210",
        subnetMask: "255.255.255.0",
        gateway: "192.168.1.1",
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe("NETWORK_CONFIRMATION_REQUIRED");
  });

  it("enforces 403 when unprivileged operator attempts to modify device network configuration", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/v1/devices/${testCamera.id}/configuration/network`,
      headers: restrictedHeaders,
      payload: {
        dhcpEnabled: false,
        ipAddress: "192.168.1.99",
        subnetMask: "255.255.255.0",
        gateway: "192.168.1.1",
        confirmNetworkChange: true,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("PERMISSION_DENIED");
  });

  // =========================================================================
  // Phase 9: Golden Configuration Templates & Fleet Compliance Routes
  // =========================================================================

  it("lists golden configuration templates including banking presets via GET /v1/device-configuration/templates", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/device-configuration/templates`,
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(6);

    const classifications = body.data.map((t: any) => t.classification);
    expect(classifications).toContain("branch_entrance");
    expect(classifications).toContain("cash_counter");
    expect(classifications).toContain("strongroom_vault");
  });

  it("creates and updates a custom golden template via POST/PUT /v1/device-configuration/templates", async () => {
    // 1. Create
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/device-configuration/templates`,
      headers: adminHeaders,
      payload: {
        name: "ATM Lobby High Security",
        description: "Standard template for high-risk ATM vestibule kiosks",
        targetType: "camera",
        classification: "atm_vestibule",
        settings: {
          videoConfig: {
            codec: "H.264",
            resolution: { width: 1920, height: 1080 },
            frameRate: 25,
            bitrateKbps: 3072,
          },
        },
      },
    });

    expect(createRes.statusCode).toBe(201);
    const createBody = createRes.json();
    expect(createBody.success).toBe(true);
    const createdId = createBody.data.id;
    expect(createdId).toBeDefined();

    // 2. Get by ID
    const getRes = await app.inject({
      method: "GET",
      url: `/v1/device-configuration/templates/${createdId}`,
      headers: adminHeaders,
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().data.name).toBe("ATM Lobby High Security");

    // 3. Update
    const updateRes = await app.inject({
      method: "PUT",
      url: `/v1/device-configuration/templates/${createdId}`,
      headers: adminHeaders,
      payload: {
        name: "ATM Lobby High Security - Updated",
      },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().data.name).toBe("ATM Lobby High Security - Updated");
  });

  it("applies golden template across branch via POST /v1/device-configuration/templates/:id/apply", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/device-configuration/templates/tmpl-preset-branch-entrance/apply`,
      headers: adminHeaders,
      payload: {
        scope: "single",
        deviceId: testCamera.id,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.appliedCount).toBe(1);
    expect(body.data.results[0].success).toBe(true);
  });

  it("evaluates fleet compliance report via GET /v1/device-configuration/compliance", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/device-configuration/compliance`,
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.overallPercentage).toBeDefined();
    expect(body.data.totalDevicesEvaluated).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(body.data.drifts)).toBe(true);
  });

  it("remediates configuration drifts via POST /v1/device-configuration/compliance/remediate", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/device-configuration/compliance/remediate`,
      headers: adminHeaders,
      payload: {
        templateId: "tmpl-preset-branch-entrance",
        deviceIds: [testCamera.id],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.remediatedCount).toBe(1);
  });
});
