import { describe, expect, it, vi } from "vitest";
import {
  DeviceConfigurationService,
  type RecorderAdapterProvider,
} from "../src/services/device-configuration.service.js";
import { MemoryStore } from "../src/store.js";
import type { User, Camera } from "../src/domain/models.js";
import type { OnvifCameraClient } from "../src/onvif/onvif-camera-client.js";
import type {
  ChannelVideoConfig,
  DeviceImageConfig,
  DeviceTimeConfig,
  DeviceNetworkConfig,
  RecordingSchedule,
} from "../src/types/device-configuration.types.js";

describe("DeviceConfigurationService (Phase 1)", () => {
  const adminUser: User = {
    id: "user-admin",
    name: "Admin User",
    email: "admin@omsystems.com",
    roles: ["SUPER_ADMIN" as any],
    tenantId: "tenant-test",
    permissions: ["device:configure", "live:view", "recording:view"],
  };

  const restrictedUser: User = {
    id: "user-restricted",
    name: "Restricted Operator",
    email: "operator@omsystems.com",
    roles: ["VIRTUAL_GUARD_OPERATOR" as any],
    tenantId: "tenant-test",
    permissions: ["live:view"],
  };

  const testCamera: Camera = {
    id: "cam-test-01",
    name: "ATM Camera 1",
    nodeId: "branch-blr-01",
    branchId: "branch-blr-01",
    vendor: "hikvision",
    model: "DS-2CD2143G2",
    channel: 1,
    protocol: "rtsp",
    status: "online",
    profiles: [],
    capabilities: { ptz: false, audio: false, motion: true },
    ipAddress: "192.168.1.50",
    connectionSecretRef: "secret-vault-ref",
  };

  function setupTestStore() {
    const store = new MemoryStore();
    (store as any).nodes.set("company-1", {
      id: "company-1",
      tenantId: "tenant-test",
      type: "company",
      name: "Test Company",
      path: ["company-1"],
    });
    (store as any).nodes.set("branch-blr-01", {
      id: "branch-blr-01",
      parentId: "company-1",
      tenantId: "tenant-test",
      type: "branch",
      name: "Test branch",
      path: ["company-1", "branch-blr-01"],
    });
    (store as any).nodes.set("rec-test-01", {
      id: "rec-test-01",
      parentId: "branch-blr-01",
      tenantId: "tenant-test",
      type: "dvr",
      name: "Test DVR",
      path: ["company-1", "branch-blr-01", "rec-test-01"],
    });
    (store as any).cameras.set(testCamera.id, testCamera);
    (store as any).users.set(adminUser.id, adminUser);
    (store as any).users.set(restrictedUser.id, restrictedUser);
    (store as any).grants.push(
      {
        userId: adminUser.id,
        scopeNodeId: "company-1",
        actions: ["device:configure", "live:view", "recording:view"],
        effect: "allow",
      },
      {
        userId: restrictedUser.id,
        scopeNodeId: "company-1",
        actions: ["live:view"],
        effect: "allow",
      }
    );
    return store;
  }

  function createMockRecorderProvider(options?: {
    initialSchedule?: RecordingSchedule;
    initialEncoding?: ChannelVideoConfig;
    initialNetwork?: DeviceNetworkConfig;
    driftScheduleOnWrite?: boolean;
  }) {
    let currentSchedule: RecordingSchedule = options?.initialSchedule ?? {
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
      audioRecording: false,
      streamType: "main",
    };

    let currentEncoding: ChannelVideoConfig = options?.initialEncoding ?? {
      codec: "H264",
      resolution: { width: 1920, height: 1080 },
      fps: 25,
      bitrateKbps: 4096,
    };

    let currentNetwork: DeviceNetworkConfig = options?.initialNetwork ?? {
      dhcpEnabled: false,
      ipAddress: "192.168.1.100",
      subnetMask: "255.255.255.0",
      gateway: "192.168.1.1",
      dnsServers: ["8.8.8.8", "1.1.1.1"],
      httpPort: 80,
      httpsPort: 443,
      rtspPort: 554,
      onvifPort: 80,
    };

    const mockAdapter: any = {
      getChannels: vi.fn().mockResolvedValue({
        status: "healthy",
        value: [{ channelNumber: 1, name: "Channel 1", status: "online" }],
      }),
      getRecordingSchedule: vi.fn().mockImplementation(async (_ch: string) => ({
        status: "healthy",
        value: { ...currentSchedule },
      })),
      setRecordingSchedule: vi.fn().mockImplementation(async (_ch: string, sched: RecordingSchedule) => {
        if (options?.driftScheduleOnWrite) {
          currentSchedule = { ...sched, enabled: false };
        } else {
          currentSchedule = { ...sched };
        }
        return { status: "healthy" };
      }),
      getChannelEncoding: vi.fn().mockImplementation(async (_ch: string) => ({
        status: "healthy",
        value: { ...currentEncoding },
      })),
      setChannelEncoding: vi.fn().mockImplementation(async (_ch: string, enc: ChannelVideoConfig) => {
        currentEncoding = { ...enc };
        return { status: "healthy" };
      }),
      getNetworkConfiguration: vi.fn().mockImplementation(async () => ({
        status: "healthy",
        value: { ...currentNetwork },
      })),
      setNetworkConfiguration: vi.fn().mockImplementation(async (net: DeviceNetworkConfig) => {
        currentNetwork = { ...net };
        return { status: "healthy" };
      }),
      getStorageStatus: vi.fn().mockResolvedValue({
        status: "healthy",
        value: [{ diskIndex: 0, name: "HDD1", status: "OK", capacityBytes: 1000000, usedBytes: 500000, freeBytes: 500000, readOnly: false }],
      }),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };

    const provider: RecorderAdapterProvider = {
      create: vi.fn().mockResolvedValue(mockAdapter),
    };

    return { provider, mockAdapter };
  }

  function createMockOnvifClient(initialConfig?: Partial<ChannelVideoConfig>) {
    let currentVideoConfig = {
      codec: "H264",
      resolution: { width: 1920, height: 1080 },
      fps: 25,
      bitrateKbps: 4096,
      quality: 80,
      govLength: 50,
      h264Profile: "Main",
      ...initialConfig,
    };

    let currentImageConfig = {
      brightness: 50,
      contrast: 50,
      colorSaturation: 50,
      sharpness: 50,
      irCutFilter: "AUTO" as const,
    };

    let currentTime = new Date();

    const mockMedia = {
      getProfiles: vi.fn().mockImplementation(async () => [
        {
          token: "ProfileToken1",
          name: "MainProfile",
          videoSourceConfigurationToken: "VideoSourceToken1",
          videoEncoderConfiguration: {
            token: "EncoderToken1",
            name: "H264Encoder",
            encoding: currentVideoConfig.codec,
            resolution: currentVideoConfig.resolution,
            quality: currentVideoConfig.quality,
            framerateLimit: currentVideoConfig.fps,
            bitrateLimitKbps: currentVideoConfig.bitrateKbps,
            govLength: currentVideoConfig.govLength,
            h264Profile: currentVideoConfig.h264Profile,
          },
        },
      ]),
      getVideoEncoderConfigurationOptions: vi.fn().mockResolvedValue({
        qualityRange: { min: 1, max: 100 },
        resolutionsAvailable: [
          { width: 1280, height: 720 },
          { width: 1920, height: 1080 },
          { width: 2560, height: 1440 },
          { width: 3840, height: 2160 },
        ],
        frameRateRange: { min: 1, max: 30 },
        bitrateRangeKbps: { min: 64, max: 16384 },
        govLengthRange: { min: 1, max: 300 },
      }),
      setVideoEncoderConfiguration: vi.fn().mockImplementation(async (cfg) => {
        currentVideoConfig = {
          ...currentVideoConfig,
          codec: cfg.encoding,
          resolution: cfg.resolution ?? { width: cfg.width, height: cfg.height },
          fps: cfg.framerateLimit,
          bitrateKbps: cfg.bitrateLimitKbps,
          quality: cfg.quality,
          govLength: cfg.govLength,
        };
      }),
    };

    const mockImaging = {
      getImagingSettings: vi.fn().mockImplementation(async () => currentImageConfig),
      getOptions: vi.fn().mockResolvedValue({
        brightness: { min: 0, max: 100 },
        contrast: { min: 0, max: 100 },
        colorSaturation: { min: 0, max: 100 },
        sharpness: { min: 0, max: 100 },
        irCutFilterModes: ["ON", "OFF", "AUTO"],
      }),
      setImagingSettings: vi.fn().mockImplementation(async (_token, settings) => {
        currentImageConfig = {
          ...currentImageConfig,
          ...settings,
        };
      }),
    };

    let currentNtpActive = true;
    let currentNtpServer = "time.bank.internal";
    let currentCameraNetwork = {
      ipAddress: "192.168.1.50",
      prefixLength: 24,
      dhcpEnabled: false,
      gateway: "192.168.1.1",
      dnsServers: ["8.8.8.8", "1.1.1.1"],
    };

    const mockDevice = {
      getSystemDateAndTime: vi.fn().mockImplementation(async () => ({
        dateTimeType: currentNtpActive ? "NTP" : "Manual",
        daylightSavings: false,
        timeZone: "UTC",
        utcDateTime: currentTime,
        clockDriftMs: 0,
      })),
      setSystemDateAndTime: vi.fn().mockImplementation(async (timeCfg) => {
        currentTime = timeCfg.utcDateTime ?? new Date();
        currentNtpActive = timeCfg.dateTimeType === "NTP";
      }),
      getNtp: vi.fn().mockImplementation(async () => ({
        fromDHCP: false,
        manualServers: [currentNtpServer],
        dhcpServers: [],
      })),
      setNtp: vi.fn().mockImplementation(async (opts) => {
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
            dhcp: currentCameraNetwork.dhcpEnabled,
            manual: [
              {
                address: currentCameraNetwork.ipAddress,
                prefixLength: currentCameraNetwork.prefixLength,
              },
            ],
          },
        },
      ]),
      setNetworkInterfaces: vi.fn().mockImplementation(async (_token: string, cfg: any) => {
        currentCameraNetwork.ipAddress = cfg.ipAddress;
        currentCameraNetwork.prefixLength = cfg.prefixLength;
        currentCameraNetwork.dhcpEnabled = cfg.dhcpEnabled;
      }),
      getNetworkDefaultGateway: vi.fn().mockImplementation(async () => [currentCameraNetwork.gateway]),
      setNetworkDefaultGateway: vi.fn().mockImplementation(async (gws: string[]) => {
        if (gws.length > 0) currentCameraNetwork.gateway = gws[0]!;
      }),
      getDNS: vi.fn().mockImplementation(async () => ({
        fromDHCP: currentCameraNetwork.dhcpEnabled,
        searchDomain: [],
        manualServers: currentCameraNetwork.dnsServers,
      })),
      setDNS: vi.fn().mockImplementation(async (opts: any) => {
        if (opts.manualServers) currentCameraNetwork.dnsServers = opts.manualServers;
      }),
    };

    const client = {
      connect: vi.fn().mockResolvedValue({}),
      media: mockMedia,
      imaging: mockImaging,
      device: mockDevice,
    } as unknown as OnvifCameraClient;

    return { client, mockMedia, mockImaging, mockDevice };
  }

  it("enforces RBAC/ABAC permissions before modifying device configuration", async () => {
    const store = setupTestStore();

    const { client } = createMockOnvifClient();
    const service = new DeviceConfigurationService({
      store,
      onvifClientFactory: () => client,
    });

    const desired: ChannelVideoConfig = {
      codec: "H265",
      resolution: { width: 1920, height: 1080 },
      fps: 25,
      bitrateKbps: 2048,
    };

    // User without device:configure permission should be rejected
    await expect(
      service.setVideoConfiguration("tenant-test", testCamera.id, restrictedUser, desired)
    ).rejects.toThrow("not authorized");
  });

  it("validates hardware options and rejects unsupported resolutions", async () => {
    const store = setupTestStore();

    const { client } = createMockOnvifClient();
    const service = new DeviceConfigurationService({
      store,
      onvifClientFactory: () => client,
    });

    const invalidResConfig: ChannelVideoConfig = {
      codec: "H264",
      resolution: { width: 9999, height: 9999 }, // Unsupported resolution
      fps: 25,
      bitrateKbps: 4096,
    };

    await expect(
      service.setVideoConfiguration("tenant-test", testCamera.id, adminUser, invalidResConfig)
    ).rejects.toThrow("is not supported by device hardware");
  });

  it("validates hardware options and rejects FPS exceeding device limits", async () => {
    const store = setupTestStore();

    const { client } = createMockOnvifClient();
    const service = new DeviceConfigurationService({
      store,
      onvifClientFactory: () => client,
    });

    const invalidFpsConfig: ChannelVideoConfig = {
      codec: "H264",
      resolution: { width: 1920, height: 1080 },
      fps: 120, // Supported max is 30
      bitrateKbps: 4096,
    };

    await expect(
      service.setVideoConfiguration("tenant-test", testCamera.id, adminUser, invalidFpsConfig)
    ).rejects.toThrow("FPS 120 is out of hardware range");
  });

  it("applies video configuration with successful read-after-write verification", async () => {
    const store = setupTestStore();

    const { client, mockMedia } = createMockOnvifClient();
    const service = new DeviceConfigurationService({
      store,
      onvifClientFactory: () => client,
    });

    const desired: ChannelVideoConfig = {
      codec: "H265",
      resolution: { width: 2560, height: 1440 },
      fps: 30,
      bitrateKbps: 6144,
      quality: 85,
    };

    const result = await service.setVideoConfiguration(
      "tenant-test",
      testCamera.id,
      adminUser,
      desired
    );

    expect(result.success).toBe(true);
    expect(result.state).toBe("VERIFIED");
    expect(result.verification.verified).toBe(true);
    expect(result.verification.drifts).toHaveLength(0);
    expect(result.previousSnapshotId).toBeDefined();

    // Verify adapter was called
    expect(mockMedia.setVideoEncoderConfiguration).toHaveBeenCalled();
  });

  it("detects configuration drift and marks FAILED when read-after-write does not match desired state", async () => {
    const store = setupTestStore();

    const { client, mockMedia } = createMockOnvifClient();

    // Simulate device bug: device accepts 6144 kbps but hardware clamps it to 4096 kbps
    mockMedia.setVideoEncoderConfiguration.mockImplementation(async (cfg) => {
      // Mock device ignores the bitrate update
    });

    const service = new DeviceConfigurationService({
      store,
      onvifClientFactory: () => client,
    });

    const desired: ChannelVideoConfig = {
      codec: "H264",
      resolution: { width: 1920, height: 1080 },
      fps: 25,
      bitrateKbps: 6144, // Desired is 6144, actual remains 4096
    };

    const result = await service.setVideoConfiguration(
      "tenant-test",
      testCamera.id,
      adminUser,
      desired
    );

    expect(result.success).toBe(false);
    expect(result.state).toBe("FAILED");
    expect(result.verification.verified).toBe(false);
    expect(result.verification.drifts).toHaveLength(1);
    expect(result.verification.drifts[0]?.path).toBe("bitrateKbps");
    expect(result.verification.drifts[0]?.desired).toBe(6144);
    expect(result.verification.drifts[0]?.actual).toBe(4096);
  });

  it("safely modifies imaging settings and verifies on hardware", async () => {
    const store = setupTestStore();

    const { client, mockImaging } = createMockOnvifClient();
    const service = new DeviceConfigurationService({
      store,
      onvifClientFactory: () => client,
    });

    const desiredImage: DeviceImageConfig = {
      brightness: 65,
      contrast: 55,
      colorSaturation: 60,
      sharpness: 70,
      irCutFilter: "ON",
    };

    const result = await service.setImagingConfiguration(
      "tenant-test",
      testCamera.id,
      adminUser,
      desiredImage
    );

    expect(result.success).toBe(true);
    expect(result.state).toBe("VERIFIED");
    expect(result.verification.verified).toBe(true);
    expect(mockImaging.setImagingSettings).toHaveBeenCalled();
  });

  it("synchronizes time and evaluates drift tolerance", async () => {
    const store = setupTestStore();

    const { client, mockDevice } = createMockOnvifClient();
    const service = new DeviceConfigurationService({
      store,
      onvifClientFactory: () => client,
    });

    const timeConfig: DeviceTimeConfig = {
      dateTimeType: "NTP",
      timeZone: "UTC",
      utcDateTime: new Date().toISOString(),
    };

    const result = await service.setTimeConfiguration(
      "tenant-test",
      testCamera.id,
      adminUser,
      timeConfig
    );

    expect(result.success).toBe(true);
    expect(result.state).toBe("VERIFIED");
    expect(mockDevice.setSystemDateAndTime).toHaveBeenCalled();
  });

  it("reads time configuration and categorizes SYNCHRONIZED, DRIFT_WARNING, and DRIFT_CRITICAL", async () => {
    const store = setupTestStore();
    const { client, mockDevice } = createMockOnvifClient();
    const service = new DeviceConfigurationService({
      store,
      onvifClientFactory: () => client,
    });

    // 1. Within 5s -> SYNCHRONIZED
    mockDevice.getSystemDateAndTime.mockImplementationOnce(async () => ({
      dateTimeType: "NTP",
      daylightSavings: false,
      timeZone: "Asia/Kolkata",
      utcDateTime: new Date(),
      clockDriftMs: 1000,
    }));
    const syncResult = await service.getTimeConfiguration("tenant-test", testCamera.id, adminUser);
    expect(syncResult.status).toBe("SYNCHRONIZED");
    expect(syncResult.ntpActive).toBe(true);
    expect(syncResult.ntpServer).toBe("time.bank.internal");

    // 2. 15s offset -> DRIFT_WARNING
    const warningTime = new Date(Date.now() - 15000);
    mockDevice.getSystemDateAndTime.mockImplementationOnce(async () => ({
      dateTimeType: "Manual",
      daylightSavings: false,
      timeZone: "Asia/Kolkata",
      utcDateTime: warningTime,
      clockDriftMs: -15000,
    }));
    const warningResult = await service.getTimeConfiguration("tenant-test", testCamera.id, adminUser);
    expect(warningResult.status).toBe("DRIFT_WARNING");
    expect(warningResult.ntpActive).toBe(false);

    // 3. 60s offset -> DRIFT_CRITICAL
    const criticalTime = new Date(Date.now() - 60000);
    mockDevice.getSystemDateAndTime.mockImplementationOnce(async () => ({
      dateTimeType: "Manual",
      daylightSavings: false,
      timeZone: "Asia/Kolkata",
      utcDateTime: criticalTime,
      clockDriftMs: -60000,
    }));
    const criticalResult = await service.getTimeConfiguration("tenant-test", testCamera.id, adminUser);
    expect(criticalResult.status).toBe("DRIFT_CRITICAL");
  });

  it("configures NTP server via setNtp and verifies synchronised state", async () => {
    const store = setupTestStore();
    const { client, mockDevice } = createMockOnvifClient();
    const service = new DeviceConfigurationService({
      store,
      onvifClientFactory: () => client,
    });

    const timeConfig: DeviceTimeConfig = {
      dateTimeType: "NTP",
      timeZone: "Asia/Kolkata",
      ntpServer: "ntp1.bank.internal",
    };

    const result = await service.setTimeConfiguration(
      "tenant-test",
      testCamera.id,
      adminUser,
      timeConfig
    );

    expect(result.success).toBe(true);
    expect(result.state).toBe("VERIFIED");
    expect(mockDevice.setNtp).toHaveBeenCalledWith({
      fromDHCP: false,
      manualServers: ["ntp1.bank.internal"],
    });
    expect(mockDevice.setSystemDateAndTime).toHaveBeenCalled();
  });

  it("detects clock drift and marks FAILED when read-after-write offset exceeds banking tolerance", async () => {
    const store = setupTestStore();
    const { client, mockDevice } = createMockOnvifClient();
    const service = new DeviceConfigurationService({
      store,
      onvifClientFactory: () => client,
    });

    // Simulate camera clock failing to sync and remaining 45 seconds behind
    mockDevice.setSystemDateAndTime.mockImplementationOnce(async () => {
      mockDevice.getSystemDateAndTime.mockImplementationOnce(async () => ({
        dateTimeType: "NTP",
        daylightSavings: false,
        timeZone: "UTC",
        utcDateTime: new Date(Date.now() - 45000),
        clockDriftMs: -45000,
      }));
    });

    const timeConfig: DeviceTimeConfig = {
      dateTimeType: "NTP",
      timeZone: "UTC",
      utcDateTime: new Date().toISOString(),
    };

    const result = await service.setTimeConfiguration(
      "tenant-test",
      testCamera.id,
      adminUser,
      timeConfig
    );

    expect(result.success).toBe(false);
    expect(result.state).toBe("FAILED");
    expect(result.verification.verified).toBe(false);
    expect(result.verification.drifts.some((d) => d.path === "offsetSeconds")).toBe(true);
  });

  it("reads and configures recorder time via recorder adapter", async () => {
    const store = setupTestStore();
    let currentRecTime = new Date();

    const mockAdapter = {
      getDeviceTime: vi.fn().mockImplementation(async () => ({
        status: "healthy",
        value: currentRecTime,
        checkedAt: new Date(),
      })),
      setTimeConfiguration: vi.fn().mockImplementation(async (cfg) => {
        currentRecTime = cfg.utcDateTime ? new Date(cfg.utcDateTime) : new Date();
        return { status: "healthy", checkedAt: new Date() };
      }),
    };

    const service = new DeviceConfigurationService({
      store,
      recorderAdapterProvider: {
        create: vi.fn().mockResolvedValue(mockAdapter as any),
      },
    });

    // 1. Read recorder time
    const readResult = await service.getRecorderTime("tenant-test", "rec-01", adminUser);
    expect(readResult.status).toBe("SYNCHRONIZED");
    expect(readResult.ntpActive).toBe(true);

    // 2. Set recorder time
    const setResult = await service.setRecorderTime("tenant-test", "rec-01", adminUser, {
      dateTimeType: "NTP",
      ntpServer: "ntp.bank.internal",
      timeZone: "Asia/Kolkata",
    });

    expect(setResult.success).toBe(true);
    expect(setResult.state).toBe("VERIFIED");
    expect(mockAdapter.setTimeConfiguration).toHaveBeenCalled();
  });

  it("reads consolidated device configuration via readDeviceConfiguration", async () => {
    const store = setupTestStore();
    const { client } = createMockOnvifClient();
    const service = new DeviceConfigurationService({
      store,
      onvifClientFactory: () => client,
    });

    const config = await service.readDeviceConfiguration("tenant-test", testCamera.id, adminUser);
    expect(config).toBeDefined();
    expect(config.video).toBeDefined();
    expect(config.imaging).toBeDefined();
    expect(config.time).toBeDefined();
    expect(config.network).toBeDefined();
  });

  it("supports rollback snapshot capture and restoration", async () => {
    const store = setupTestStore();

    const { client } = createMockOnvifClient({
      codec: "H264",
      resolution: { width: 1920, height: 1080 },
      fps: 25,
      bitrateKbps: 4096,
    });

    const service = new DeviceConfigurationService({
      store,
      onvifClientFactory: () => client,
    });

    // 1. Capture snapshot of initial 1080p state
    const snapshot = await service.captureSnapshot("tenant-test", testCamera.id, adminUser);
    expect(snapshot.videoConfig?.resolution.width).toBe(1920);

    // 2. Modify to 2560x1440
    await service.setVideoConfiguration("tenant-test", testCamera.id, adminUser, {
      codec: "H265",
      resolution: { width: 2560, height: 1440 },
      fps: 30,
      bitrateKbps: 6144,
    });

    // 3. Rollback to initial snapshot
    const rollbackResult = await service.rollback(
      "tenant-test",
      testCamera.id,
      adminUser,
      snapshot.snapshotId
    );

    expect(rollbackResult.success).toBe(true);
    expect(rollbackResult.state).toBe("ROLLED_BACK");

    // 4. Read back video configuration to verify restored state
    const restored = await service.getVideoConfiguration(
      "tenant-test",
      testCamera.id,
      adminUser
    );
    expect(restored.resolution.width).toBe(1920);
    expect(restored.resolution.height).toBe(1080);
  });

  // =========================================================================
  // PHASE 6: RECORDER CHANNELS & RECORDING SCHEDULES
  // =========================================================================

  it("reads and modifies recorder recording schedule with pre-flight snapshot and hardware verification", async () => {
    const store = setupTestStore();
    const { provider } = createMockRecorderProvider();
    const service = new DeviceConfigurationService({
      store,
      recorderAdapterProvider: provider,
    });

    // 1. Read schedule
    const initialSchedule = await service.getRecorderSchedule(
      "tenant-test",
      "rec-test-01",
      "1",
      adminUser
    );
    expect(initialSchedule.channelNumber).toBe(1);
    expect(initialSchedule.enabled).toBe(true);
    expect(initialSchedule.schedule).toHaveLength(1);

    // 2. Modify schedule
    const newSchedule: RecordingSchedule = {
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
              startMinute: 0,
              endHour: 19,
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
              startMinute: 0,
              endHour: 19,
              endMinute: 0,
              type: "MOTION",
            },
          ],
        },
      ],
    };

    const result = await service.setRecorderSchedule(
      "tenant-test",
      "rec-test-01",
      "1",
      adminUser,
      newSchedule
    );

    expect(result.success).toBe(true);
    expect(result.state).toBe("VERIFIED");
    expect(result.previousSnapshotId).toBeDefined();
    expect(result.verification.verified).toBe(true);
    expect(result.verification.drifts).toHaveLength(0);

    // 3. Verify read-back confirms new state
    const readBack = await service.getRecorderSchedule(
      "tenant-test",
      "rec-test-01",
      "1",
      adminUser
    );
    expect(readBack.schedule).toHaveLength(2);
    expect(readBack.preRecordSeconds).toBe(10);
  });

  it("validates pre-record and post-record bounds and rejects out-of-range values", async () => {
    const store = setupTestStore();
    const { provider } = createMockRecorderProvider();
    const service = new DeviceConfigurationService({
      store,
      recorderAdapterProvider: provider,
    });

    // Rejects preRecordSeconds > 30
    await expect(
      service.setRecorderSchedule(
        "tenant-test",
        "rec-test-01",
        "1",
        adminUser,
        {
          channelNumber: 1,
          enabled: true,
          preRecordSeconds: 35,
          schedule: [],
        }
      )
    ).rejects.toMatchObject({
      code: "INVALID_PRE_RECORD_TIME",
      statusCode: 400,
    });

    // Rejects postRecordSeconds < 5
    await expect(
      service.setRecorderSchedule(
        "tenant-test",
        "rec-test-01",
        "1",
        adminUser,
        {
          channelNumber: 1,
          enabled: true,
          postRecordSeconds: 2,
          schedule: [],
        }
      )
    ).rejects.toMatchObject({
      code: "INVALID_POST_RECORD_TIME",
      statusCode: 400,
    });
  });

  it("detects recording schedule drift when hardware state differs from desired", async () => {
    const store = setupTestStore();
    const { provider } = createMockRecorderProvider({ driftScheduleOnWrite: true });
    const service = new DeviceConfigurationService({
      store,
      recorderAdapterProvider: provider,
    });

    const result = await service.setRecorderSchedule(
      "tenant-test",
      "rec-test-01",
      "1",
      adminUser,
      {
        channelNumber: 1,
        enabled: true,
        schedule: [],
      }
    );

    expect(result.success).toBe(false);
    expect(result.state).toBe("FAILED");
    expect(result.verification.verified).toBe(false);
    expect(result.verification.drifts.length).toBeGreaterThan(0);
    expect(result.verification.drifts[0]?.path).toBe("enabled");
  });

  it("reads and updates recorder channel video encoding with verification", async () => {
    const store = setupTestStore();
    const { provider } = createMockRecorderProvider();
    const service = new DeviceConfigurationService({
      store,
      recorderAdapterProvider: provider,
    });

    // Read initial encoding
    const initialEncoding = await service.getRecorderChannelEncoding(
      "tenant-test",
      "rec-test-01",
      "1",
      adminUser
    );
    expect(initialEncoding.codec).toBe("H264");
    expect(initialEncoding.resolution.width).toBe(1920);

    // Update encoding
    const result = await service.setRecorderChannelEncoding(
      "tenant-test",
      "rec-test-01",
      "1",
      adminUser,
      {
        codec: "H265",
        resolution: { width: 2560, height: 1440 },
        fps: 30,
        bitrateKbps: 6144,
      }
    );

    expect(result.success).toBe(true);
    expect(result.state).toBe("VERIFIED");
    expect(result.previousSnapshotId).toBeDefined();

    // Verify read-back confirms updated values
    const updated = await service.getRecorderChannelEncoding(
      "tenant-test",
      "rec-test-01",
      "1",
      adminUser
    );
    expect(updated.codec).toBe("H265");
    expect(updated.resolution.width).toBe(2560);
    expect(updated.fps).toBe(30);
  });

  it("restores recording schedule via rollback snapshot", async () => {
    const store = setupTestStore();
    const { provider } = createMockRecorderProvider();
    const service = new DeviceConfigurationService({
      store,
      recorderAdapterProvider: provider,
    });

    // 1. Initial schedule has 1 period
    const initial = await service.getRecorderSchedule("tenant-test", "rec-test-01", "1", adminUser);
    expect(initial.schedule).toHaveLength(1);

    // 2. Set new schedule (captures snapshot)
    const applyResult = await service.setRecorderSchedule(
      "tenant-test",
      "rec-test-01",
      "1",
      adminUser,
      {
        channelNumber: 1,
        enabled: true,
        preRecordSeconds: 20,
        schedule: [
          { day: "MONDAY", periods: [] },
          { day: "TUESDAY", periods: [] },
          { day: "WEDNESDAY", periods: [] },
        ],
      }
    );
    expect(applyResult.success).toBe(true);
    const snapshotId = applyResult.previousSnapshotId!;
    expect(snapshotId).toBeDefined();

    // 3. Rollback to snapshot
    const rollbackResult = await service.rollback(
      "tenant-test",
      "rec-test-01",
      adminUser,
      snapshotId
    );
    expect(rollbackResult.success).toBe(true);
    expect(rollbackResult.state).toBe("ROLLED_BACK");

    // 4. Verify schedule is restored
    const restored = await service.getRecorderSchedule("tenant-test", "rec-test-01", "1", adminUser);
    expect(restored.schedule).toHaveLength(1);
    expect(restored.preRecordSeconds).toBe(5);
  });

  it("enforces 403 when unprivileged user attempts to modify recorder channel schedule", async () => {
    const store = setupTestStore();
    const { provider } = createMockRecorderProvider();
    const service = new DeviceConfigurationService({
      store,
      recorderAdapterProvider: provider,
    });

    await expect(
      service.setRecorderSchedule(
        "tenant-test",
        "rec-test-01",
        "1",
        restrictedUser,
        {
          channelNumber: 1,
          enabled: false,
          schedule: [],
        }
      )
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      statusCode: 403,
    });
  });

  // =========================================================================
  // PHASE 7: NETWORK CONFIGURATION (SAFE & GUARDED)
  // =========================================================================

  it("reads camera network configuration from physical ONVIF interfaces", async () => {
    const store = setupTestStore();
    const { client } = createMockOnvifClient();
    const service = new DeviceConfigurationService({
      store,
      onvifClientFactory: () => client,
    });

    const net = await service.getNetworkConfiguration("tenant-test", testCamera.id, adminUser);
    expect(net).toBeDefined();
    expect(net.ipAddress).toBe("192.168.1.50");
    expect(net.subnetMask).toBe("255.255.255.0");
    expect(net.gateway).toBe("192.168.1.1");
    expect(net.dnsServers).toEqual(["8.8.8.8", "1.1.1.1"]);
  });

  it("safely updates camera network configuration with confirmation, verifies on hardware, and updates store", async () => {
    const store = setupTestStore();
    const { client } = createMockOnvifClient();
    const service = new DeviceConfigurationService({
      store,
      onvifClientFactory: () => client,
    });

    const desired: DeviceNetworkConfig = {
      dhcpEnabled: false,
      ipAddress: "192.168.1.77",
      subnetMask: "255.255.255.0",
      gateway: "192.168.1.1",
      dnsServers: ["1.1.1.1"],
      onvifPort: 8080,
      rtspPort: 5554,
    };

    const result = await service.setNetworkConfiguration(
      "tenant-test",
      testCamera.id,
      adminUser,
      desired,
      true // confirmNetworkChange
    );

    expect(result.success).toBe(true);
    expect(result.state).toBe("VERIFIED");
    expect(result.previousSnapshotId).toBeDefined();
    expect(result.verification.verified).toBe(true);
    expect(result.verification.drifts).toHaveLength(0);

    // Verify camera in store has updated address and ports
    const updatedCam = await store.getCamera(testCamera.id);
    expect(updatedCam?.ipAddress).toBe("192.168.1.77");
    expect((updatedCam as any)?.onvifPort).toBe(8080);
    expect((updatedCam as any)?.rtspPort).toBe(5554);
  });

  it("rejects network mutation without explicit confirmation (confirmNetworkChange)", async () => {
    const store = setupTestStore();
    const { client } = createMockOnvifClient();
    const service = new DeviceConfigurationService({
      store,
      onvifClientFactory: () => client,
    });

    await expect(
      service.setNetworkConfiguration(
        "tenant-test",
        testCamera.id,
        adminUser,
        {
          dhcpEnabled: false,
          ipAddress: "192.168.1.77",
          subnetMask: "255.255.255.0",
          gateway: "192.168.1.1",
        },
        false // missing confirmation!
      )
    ).rejects.toMatchObject({
      code: "NETWORK_CONFIRMATION_REQUIRED",
      statusCode: 400,
    });
  });

  it("rejects network configuration when gateway is not in the same subnet (anti-lockout)", async () => {
    const store = setupTestStore();
    const { client } = createMockOnvifClient();
    const service = new DeviceConfigurationService({
      store,
      onvifClientFactory: () => client,
    });

    await expect(
      service.setNetworkConfiguration(
        "tenant-test",
        testCamera.id,
        adminUser,
        {
          dhcpEnabled: false,
          ipAddress: "192.168.1.50",
          subnetMask: "255.255.255.0",
          gateway: "10.0.0.1", // Gateway on completely different subnet!
        },
        true
      )
    ).rejects.toMatchObject({
      code: "INVALID_GATEWAY_SUBNET",
      statusCode: 400,
    });
  });

  it("rejects network configuration when IP collides with gateway or is broadcast address", async () => {
    const store = setupTestStore();
    const { client } = createMockOnvifClient();
    const service = new DeviceConfigurationService({
      store,
      onvifClientFactory: () => client,
    });

    // IP equals gateway
    await expect(
      service.setNetworkConfiguration(
        "tenant-test",
        testCamera.id,
        adminUser,
        {
          dhcpEnabled: false,
          ipAddress: "192.168.1.1",
          subnetMask: "255.255.255.0",
          gateway: "192.168.1.1",
        },
        true
      )
    ).rejects.toMatchObject({
      code: "IP_COLLISION_WITH_GATEWAY",
      statusCode: 400,
    });

    // Broadcast address
    await expect(
      service.setNetworkConfiguration(
        "tenant-test",
        testCamera.id,
        adminUser,
        {
          dhcpEnabled: false,
          ipAddress: "192.168.1.255",
          subnetMask: "255.255.255.0",
          gateway: "192.168.1.1",
        },
        true
      )
    ).rejects.toMatchObject({
      code: "INVALID_IP_ADDRESS",
      statusCode: 400,
    });
  });

  it("reads and updates recorder network configuration with verification", async () => {
    const store = setupTestStore();
    const { provider } = createMockRecorderProvider();
    const service = new DeviceConfigurationService({
      store,
      recorderAdapterProvider: provider,
    });

    // Read initial network
    const initial = await service.getRecorderNetwork("tenant-test", "rec-test-01", adminUser);
    expect(initial.ipAddress).toBe("192.168.1.100");

    // Update recorder network
    const desired: DeviceNetworkConfig = {
      dhcpEnabled: false,
      ipAddress: "192.168.1.120",
      subnetMask: "255.255.255.0",
      gateway: "192.168.1.1",
      dnsServers: ["1.1.1.1"],
      httpPort: 80,
    };

    const result = await service.setRecorderNetwork(
      "tenant-test",
      "rec-test-01",
      adminUser,
      desired,
      true
    );

    expect(result.success).toBe(true);
    expect(result.state).toBe("VERIFIED");
    expect(result.verification.verified).toBe(true);

    // Read back
    const updated = await service.getRecorderNetwork("tenant-test", "rec-test-01", adminUser);
    expect(updated.ipAddress).toBe("192.168.1.120");
  });

  it("restores network configuration via rollback snapshot", async () => {
    const store = setupTestStore();
    const { client } = createMockOnvifClient();
    const service = new DeviceConfigurationService({
      store,
      onvifClientFactory: () => client,
    });

    // 1. Initial IP is 192.168.1.50
    const snapshot = await service.captureSnapshot("tenant-test", testCamera.id, adminUser);
    expect(snapshot.networkConfig?.ipAddress).toBe("192.168.1.50");

    // 2. Modify IP to 192.168.1.88
    await service.setNetworkConfiguration(
      "tenant-test",
      testCamera.id,
      adminUser,
      {
        dhcpEnabled: false,
        ipAddress: "192.168.1.88",
        subnetMask: "255.255.255.0",
        gateway: "192.168.1.1",
      },
      true
    );

    // 3. Rollback
    const rollbackResult = await service.rollback(
      "tenant-test",
      testCamera.id,
      adminUser,
      snapshot.snapshotId
    );
    expect(rollbackResult.success).toBe(true);
    expect(rollbackResult.state).toBe("ROLLED_BACK");

    // 4. Verify restored IP
    const restored = await service.getNetworkConfiguration("tenant-test", testCamera.id, adminUser);
    expect(restored.ipAddress).toBe("192.168.1.50");
  });

  it("enforces 403 when unprivileged user attempts to modify network configuration", async () => {
    const store = setupTestStore();
    const { client } = createMockOnvifClient();
    const service = new DeviceConfigurationService({
      store,
      onvifClientFactory: () => client,
    });

    await expect(
      service.setNetworkConfiguration(
        "tenant-test",
        testCamera.id,
        restrictedUser,
        {
          dhcpEnabled: false,
          ipAddress: "192.168.1.99",
          subnetMask: "255.255.255.0",
          gateway: "192.168.1.1",
        },
        true
      )
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      statusCode: 403,
    });
  });
});
