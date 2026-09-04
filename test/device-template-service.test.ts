import { describe, expect, it, vi } from "vitest";
import { DeviceTemplateService, BANK_PRESET_TEMPLATES } from "../src/services/device-template-service.js";
import { DeviceConfigurationService } from "../src/services/device-configuration.service.js";
import { MemoryStore } from "../src/store.js";
import type { User, Camera } from "../src/domain/models.js";

describe("DeviceTemplateService (Phase 9: Golden Configuration Templates)", () => {
  const adminUser: User = {
    id: "user-admin",
    name: "Admin User",
    email: "admin@omsystems.com",
    roles: ["SUPER_ADMIN" as any],
    tenantId: "tenant-test",
    permissions: ["device:configure", "live:view", "recording:view"],
  };

  const testCamera: Camera = {
    id: "cam-entrance-01",
    name: "Main Branch Entrance Camera",
    nodeId: "branch-blr-01",
    branchId: "branch-blr-01",
    vendor: "hikvision",
    model: "DS-2CD2143G2",
    channel: 1,
    protocol: "rtsp",
    status: "online",
    profiles: [],
    capabilities: { ptz: false, audio: false, motion: true },
    ipAddress: "192.168.1.120",
    connectionSecretRef: "secret-vault-ref",
  };

  function setupTestEnvironment() {
    const store = new MemoryStore();

    // Node & hierarchy
    (store as any).nodes.set("branch-blr-01", {
      id: "branch-blr-01",
      tenantId: "tenant-test",
      type: "branch",
      name: "Bengaluru Main Branch",
      path: ["branch-blr-01"],
    });

    (store as any).cameras.set(testCamera.id, testCamera);

    // Branch network metadata
    (store as any).branchNetworks.set("branch-blr-01", {
      id: "net-branch-blr-01",
      branchId: "branch-blr-01",
      networkCidr: "192.168.1.0/24",
      gateway: "192.168.1.1",
      dnsServers: ["1.1.1.1", "8.8.8.8"],
      ntpServer: "time.nist.gov",
      vlanId: 10,
    });

    // Mock DeviceConfigurationService
    const mockConfigService = {
      getVideoConfiguration: vi.fn().mockResolvedValue({
        profileToken: "Profile_1",
        codec: "H.264",
        resolution: { width: 1920, height: 1080 },
        frameRate: 30,
        bitrateKbps: 4096,
        encodingInterval: 1,
        profile: "High",
      }),
      setVideoConfiguration: vi.fn().mockResolvedValue({
        success: true,
        jobId: "job-video-1",
        state: "COMPLETED",
        deviceId: testCamera.id,
        verification: { status: "VERIFIED", desiredConfig: {}, actualConfig: {}, drifts: [], verifiedAt: new Date().toISOString() },
        message: "Video configuration verified",
      }),
      getImagingConfiguration: vi.fn().mockResolvedValue({
        brightness: 50,
        colorSaturation: 50,
        contrast: 55,
        sharpness: 60,
        wideDynamicRange: { mode: "ON", level: 70 },
        dayNightMode: "AUTO",
      }),
      setImagingConfiguration: vi.fn().mockResolvedValue({
        success: true,
        jobId: "job-img-1",
        state: "COMPLETED",
        deviceId: testCamera.id,
        verification: { status: "VERIFIED", desiredConfig: {}, actualConfig: {}, drifts: [], verifiedAt: new Date().toISOString() },
        message: "Imaging configuration verified",
      }),
      getTimeConfiguration: vi.fn().mockResolvedValue({
        currentTime: new Date().toISOString(),
        timeZone: "Asia/Kolkata",
        ntpActive: true,
        ntpServer: "time.nist.gov",
        synchronized: true,
      }),
      setTimeConfiguration: vi.fn().mockResolvedValue({
        success: true,
        jobId: "job-time-1",
        state: "COMPLETED",
        deviceId: testCamera.id,
        verification: { status: "VERIFIED", desiredConfig: {}, actualConfig: {}, drifts: [], verifiedAt: new Date().toISOString() },
        message: "Time configuration verified",
      }),
      getNetworkConfiguration: vi.fn().mockResolvedValue({
        dhcpEnabled: false,
        ipAddress: "192.168.1.120",
        subnetMask: "255.255.255.0",
        defaultGateway: "192.168.1.1",
        dnsServers: ["1.1.1.1"],
      }),
      setNetworkConfiguration: vi.fn().mockResolvedValue({
        success: true,
        jobId: "job-net-1",
        state: "COMPLETED",
        deviceId: testCamera.id,
        verification: { status: "VERIFIED", desiredConfig: {}, actualConfig: {}, drifts: [], verifiedAt: new Date().toISOString() },
        message: "Network configuration verified",
      }),
      readDeviceConfiguration: vi.fn().mockResolvedValue({
        video: {
          codec: "H.264",
          resolution: { width: 1920, height: 1080 },
          frameRate: 30,
          bitrateKbps: 4096,
        },
        imaging: {
          brightness: 50,
          contrast: 55,
          sharpness: 60,
          wideDynamicRange: { mode: "ON", level: 70 },
          dayNightMode: "AUTO",
        },
        time: {
          timeZone: "Asia/Kolkata",
          dateTimeType: "NTP",
        },
      }),
      captureSnapshot: vi.fn().mockResolvedValue({
        snapshotId: "snap-pre-flight",
        deviceId: testCamera.id,
        createdAt: new Date().toISOString(),
      }),
    } as unknown as DeviceConfigurationService;

    const templateService = new DeviceTemplateService(store, mockConfigService);
    return { store, templateService, mockConfigService };
  }

  describe("Banking Presets Catalog", () => {
    it("provides 6 built-in banking standard presets with valid settings", async () => {
      const { templateService } = setupTestEnvironment();
      const templates = await templateService.listGoldenTemplates("tenant-test");

      expect(templates.length).toBeGreaterThanOrEqual(6);

      const classifications = templates.map((t) => t.classification);
      expect(classifications).toContain("branch_entrance");
      expect(classifications).toContain("cash_counter");
      expect(classifications).toContain("strongroom_vault");
      expect(classifications).toContain("atm_vestibule");
      expect(classifications).toContain("perimeter");
      expect(classifications).toContain("universal");

      const entrancePreset = templates.find((t) => t.classification === "branch_entrance")!;
      expect(entrancePreset.settings.videoConfig?.frameRate).toBe(30);
      expect(entrancePreset.settings.imageConfig?.wideDynamicRange?.mode).toBe("ON");
      expect(entrancePreset.settings.imageConfig?.wideDynamicRange?.level).toBe(70);
      expect(entrancePreset.tenantId).toBe("system");
    });

    it("prevents mutating system presets directly", async () => {
      const { templateService } = setupTestEnvironment();
      await expect(
        templateService.updateGoldenTemplate("tmpl-preset-branch-entrance", { name: "Illegal Name" })
      ).rejects.toThrow(/System preset templates cannot be modified directly/);
    });

    it("allows creating and updating tenant custom golden templates", async () => {
      const { templateService } = setupTestEnvironment();
      const created = await templateService.createGoldenTemplate({
        tenantId: "tenant-test",
        name: "Custom Teller VIP",
        description: "Custom template for high net worth teller counter",
        targetType: "camera",
        classification: "cash_counter",
        createdBy: adminUser.id,
        settings: {
          videoConfig: {
            codec: "H.264",
            resolution: { width: 1920, height: 1080 },
            frameRate: 25,
            bitrateKbps: 4096,
          },
        },
      });

      expect(created.id).toBeDefined();
      expect(created.name).toBe("Custom Teller VIP");
      expect(created.classification).toBe("cash_counter");

      const fetched = await templateService.getGoldenTemplate(created.id, "tenant-test");
      expect(fetched).toBeDefined();
      expect(fetched?.name).toBe("Custom Teller VIP");

      const updated = await templateService.updateGoldenTemplate(
        created.id,
        { name: "Custom Teller VIP Updated" },
        adminUser
      );
      expect(updated?.name).toBe("Custom Teller VIP Updated");
    });
  });

  describe("Variable Substitution", () => {
    it("substitutes all branch and device variables accurately", async () => {
      const { templateService } = setupTestEnvironment();
      const settingsWithVariables = {
        timeConfig: {
          dateTimeType: "NTP" as const,
          ntpServer: "{{branch-ntp}}",
          timeZone: "Asia/Kolkata",
        },
        networkConfig: {
          dhcpEnabled: false,
          ipAddress: "{{assigned}}",
          subnetMask: "{{branch-subnet}}",
          defaultGateway: "{{branch-gateway}}",
          dnsServers: ["{{branch-dns}}"],
        },
      };

      const device = {
        id: "cam-01",
        deviceId: "cam-01",
        displayName: "Front Lobby Cam",
        ipAddress: "192.168.1.55",
        branch: "branch-blr-01",
      };

      const branchNetwork = {
        gateway: "192.168.1.254",
        dnsServers: ["10.0.0.1"],
        networkCidr: "192.168.1.0/24",
        ntpServer: "ntp.bank.internal",
      };

      const resolved = await templateService.resolveVariablesForDevice(
        settingsWithVariables,
        device,
        branchNetwork
      );

      expect(resolved.timeConfig?.ntpServer).toBe("ntp.bank.internal");
      expect(resolved.networkConfig?.ipAddress).toBe("192.168.1.55");
      expect(resolved.networkConfig?.defaultGateway).toBe("192.168.1.254");
      expect(resolved.networkConfig?.dnsServers).toEqual(["10.0.0.1"]);
    });
  });

  describe("Staged Application Orchestration", () => {
    it("applies golden template to single device with rollback snapshot and hardware verification", async () => {
      const { templateService, mockConfigService } = setupTestEnvironment();

      const res = await templateService.applyGoldenTemplate(
        "tenant-test",
        "tmpl-preset-branch-entrance",
        { scope: "single", deviceId: testCamera.id },
        adminUser
      );

      expect(res.appliedCount).toBe(1);
      expect(res.failedCount).toBe(0);
      expect(res.results[0].success).toBe(true);

      // Verifies DeviceConfigurationService was invoked with pre-flight snapshot & setters
      expect(mockConfigService.captureSnapshot).toHaveBeenCalledWith(
        "tenant-test",
        testCamera.id,
        adminUser
      );
      expect(mockConfigService.setVideoConfiguration).toHaveBeenCalled();
      expect(mockConfigService.setImagingConfiguration).toHaveBeenCalled();
      expect(mockConfigService.setTimeConfiguration).toHaveBeenCalled();
    });

    it("applies golden template across branch scope", async () => {
      const { templateService } = setupTestEnvironment();

      const res = await templateService.applyGoldenTemplate(
        "tenant-test",
        "tmpl-preset-branch-entrance",
        { scope: "branch", branchId: "branch-blr-01" },
        adminUser
      );

      expect(res.totalTargeted).toBeGreaterThanOrEqual(1);
      expect(res.appliedCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Compliance Audit & Drift Remediation", () => {
    it("calculates 100% compliance when device matches golden template", async () => {
      const { templateService } = setupTestEnvironment();

      const report = await templateService.calculateFleetCompliance("tenant-test");
      expect(report.totalDevicesEvaluated).toBeGreaterThanOrEqual(1);
      expect(report.compliantCount).toBe(report.totalDevicesEvaluated);
      expect(report.driftedCount).toBe(0);
      expect(report.overallPercentage).toBe(100);
    });

    it("detects configuration drifts when device hardware parameters diverge", async () => {
      const { templateService, mockConfigService } = setupTestEnvironment();

      // Simulate drifted hardware: frameRate dropped to 15, WDR mode turned OFF
      (mockConfigService.readDeviceConfiguration as any).mockResolvedValue({
        video: {
          codec: "H.264",
          resolution: { width: 1920, height: 1080 },
          frameRate: 15, // Drifted from 30
          bitrateKbps: 4096,
        },
        imaging: {
          brightness: 50,
          contrast: 55,
          sharpness: 60,
          wideDynamicRange: { mode: "OFF", level: 0 }, // Drifted from ON
          dayNightMode: "AUTO",
        },
        time: {
          timeZone: "Asia/Kolkata",
          dateTimeType: "NTP",
        },
      });

      const report = await templateService.calculateFleetCompliance(
        "tenant-test",
        "tmpl-preset-branch-entrance"
      );

      expect(report.driftedCount).toBeGreaterThanOrEqual(1);
      expect(report.compliantCount).toBe(0);
      expect(report.overallPercentage).toBe(0);

      const deviceDrift = report.drifts.find((d) => d.deviceId === testCamera.id)!;
      expect(deviceDrift).toBeDefined();
      expect(deviceDrift.status).toBe("drifted");
      expect(deviceDrift.drifts.length).toBe(2);

      const frameRateDrift = deviceDrift.drifts.find((d) => d.field === "frameRate");
      expect(frameRateDrift).toBeDefined();
      expect(frameRateDrift?.expectedValue).toBe(30);
      expect(frameRateDrift?.actualValue).toBe(15);

      const wdrDrift = deviceDrift.drifts.find((d) => d.field === "wideDynamicRange.mode");
      expect(wdrDrift).toBeDefined();
      expect(wdrDrift?.expectedValue).toBe("ON");
      expect(wdrDrift?.actualValue).toBe("OFF");
    });

    it("remediates drifted devices using 1-click remediation", async () => {
      const { templateService } = setupTestEnvironment();

      const result = await templateService.remediateDrift(
        "tenant-test",
        "tmpl-preset-branch-entrance",
        adminUser,
        [testCamera.id]
      );

      expect(result.remediatedCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(result.results[0].success).toBe(true);
    });
  });
});
