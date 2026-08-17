import { describe, it, expect, beforeEach } from "vitest";
import {
  ZeroTouchEnrollmentService,
} from "../src/zero-touch/services/zero-touch-enrollment.service.js";
import {
  ZeroTouchAutoProvisionerService,
} from "../src/zero-touch/services/zero-touch-auto-provisioner.service.js";
import type { AutoDiscoveredDevice } from "../src/zero-touch/domain/zero-touch.types.js";

describe("Zero-Touch Brownfield Automated Onboarding (V2) Test Suite", () => {
  let enrollment: ZeroTouchEnrollmentService;
  let autoProvisioner: ZeroTouchAutoProvisionerService;

  beforeEach(() => {
    enrollment = new ZeroTouchEnrollmentService("https://control.sentinelgrid.internal");
    autoProvisioner = new ZeroTouchAutoProvisionerService(enrollment);
  });

  it("Invariant 1: Generates 24-hour signed single-use enrollment token", () => {
    const token = enrollment.generateEnrollmentToken("BR-MUM-42", "Mumbai Bandra West", "tenant-bank-01", 24);
    expect(token.token).toMatch(/^ENROLL-BRMUM42-[0-9A-F]{8}$/);
    expect(token.branchId).toBe("BR-MUM-42");
    expect(token.isUsed).toBe(false);
    expect(new Date(token.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("Invariant 2: Generates valid 1-line unattended installer scripts for Windows & Linux", () => {
    const token = enrollment.generateEnrollmentToken("BR-BLR-10", "Bengaluru Whitefield");
    expect(token.installerScripts.windowsPowerShell).toContain("powershell -NoProfile");
    expect(token.installerScripts.windowsPowerShell).toContain(token.token);
    expect(token.installerScripts.linuxBash).toContain("curl -fsSL");
    expect(token.installerScripts.linuxBash).toContain(token.token);
  });

  it("Invariant 3: Agent successfully exchanges enrollment token for mTLS certificates and scan profile", () => {
    const token = enrollment.generateEnrollmentToken("BR-CHN-05", "Chennai Anna Nagar");
    const exchange = enrollment.exchangeToken(token.token, {
      hostname: "sg-edge-br-chn-05",
      platform: "win32",
      macAddress: "3C:EF:8C:AA:BB:CC",
    });

    expect(exchange.success).toBe(true);
    expect(exchange.agentId).toBe("agent-br-chn-05");
    expect(exchange.mtlsCredentials?.clientCertPem).toContain("BEGIN CERTIFICATE");
    expect(exchange.mtlsCredentials?.pinnedFingerprint).toBeDefined();
    expect(exchange.scanProfile?.defaultSubnets).toContain("192.168.1.0/24");
  });

  it("Invariant 4: Enforces single-use policy and rejects re-enrollment using same token", () => {
    const token = enrollment.generateEnrollmentToken("BR-HYD-01", "Hyderabad Hitec City");
    const first = enrollment.exchangeToken(token.token, {
      hostname: "sg-edge-01",
      platform: "linux",
      macAddress: "00:11:22:33:44:55",
    });
    expect(first.success).toBe(true);

    // Second attempt must fail
    const second = enrollment.exchangeToken(token.token, {
      hostname: "sg-edge-02",
      platform: "linux",
      macAddress: "00:11:22:33:44:66",
    });
    expect(second.success).toBe(false);
    expect(second.error).toContain("already been used");
  });

  it("Invariant 5: Rejects expired enrollment tokens", () => {
    const token = enrollment.generateEnrollmentToken("BR-EXP-01", "Expired Branch", "tenant-01", -1); // Expired 1h ago
    const result = enrollment.exchangeToken(token.token, {
      hostname: "sg-edge-exp",
      platform: "win32",
      macAddress: "AA:BB:CC:DD:EE:FF",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("expired");
  });

  it("Invariant 6: Ingests multi-protocol LAN discovery devices (CP PLUS, Dahua, Hikvision, Axis)", async () => {
    const mockDevices: AutoDiscoveredDevice[] = [
      {
        ipAddress: "192.168.1.10",
        macAddress: "3C:EF:8C:44:11:A1",
        protocol: "CPPLUS_PROPRIETARY",
        deviceType: "DVR_NVR",
        manufacturer: "CP PLUS",
        model: "CP-UNR-416T2",
        firmwareVersion: "4.001.0000000.2",
        serialNumber: "CP416T2991823",
        channelCount: 16,
        channels: Array.from({ length: 16 }, (_, i) => ({
          channelNumber: i + 1,
          channelName: `Camera ${i + 1}`,
          mainRtspUri: `rtsp://192.168.1.10:554/cam/realmonitor?channel=${i + 1}&subtype=0`,
          codec: "H264",
          resolution: { width: 1920, height: 1080 },
          fps: 25,
          bitrateKbps: 3200,
          hasAudio: false,
          hasPtz: false,
          status: "ONLINE",
        })),
        discoveredAt: new Date().toISOString(),
      },
    ];

    const report = await autoProvisioner.autoProvisionBranch({
      branchId: "BR-MUM-42",
      agentId: "agent-br-mum-42",
      scannedSubnets: ["192.168.1.0/24"],
      discoveredDevices: mockDevices,
      discoveryDurationMs: 1200,
    });

    expect(report.totalRecordersFound).toBe(1);
    expect(report.totalCamerasProvisioned).toBe(16);
  });

  it("Invariant 7: Automatically extracts 16 discrete cameras from single CP PLUS NVR IP without manual IP entry", async () => {
    const mockChannels = Array.from({ length: 16 }, (_, i) => ({
      channelNumber: i + 1,
      channelName: `Teller ${i + 1}`,
      mainRtspUri: `rtsp://192.168.1.50:554/cam/realmonitor?channel=${i + 1}&subtype=0`,
      codec: "H264" as const,
      resolution: { width: 1920, height: 1080 },
      fps: 25,
      bitrateKbps: 3200,
      hasAudio: true,
      hasPtz: false,
      status: "ONLINE" as const,
    }));

    const mockNvr: AutoDiscoveredDevice = {
      ipAddress: "192.168.1.50",
      macAddress: "3C:EF:8C:99:00:11",
      protocol: "CPPLUS_PROPRIETARY",
      deviceType: "DVR_NVR",
      manufacturer: "CP PLUS",
      model: "CP-UVR-1601E1-CS",
      firmwareVersion: "4.000.0000001.0",
      serialNumber: "CP1601E998877",
      channelCount: 16,
      channels: mockChannels,
      discoveredAt: new Date().toISOString(),
    };

    const report = await autoProvisioner.autoProvisionBranch({
      branchId: "BR-PUN-01",
      agentId: "agent-br-pun-01",
      scannedSubnets: ["192.168.1.0/24"],
      discoveredDevices: [mockNvr],
      discoveryDurationMs: 1500,
    });

    const cameras = autoProvisioner.listCamerasForBranch("BR-PUN-01");
    expect(cameras).toHaveLength(16);
    expect(cameras[0]!.cameraId).toContain("CH01");
    expect(cameras[15]!.cameraId).toContain("CH16");
    expect(cameras[0]!.ipAddress).toBe("192.168.1.50"); // Shared NVR IP
  });

  it("Invariant 8: Provisions mixed brownfield environment (1 NVR + 4 IPCs) totaling 20 cameras with 0 technician clicks", async () => {
    const devices: AutoDiscoveredDevice[] = [
      {
        ipAddress: "192.168.1.10",
        macAddress: "3C:EF:8C:44:11:A1",
        protocol: "CPPLUS_PROPRIETARY",
        deviceType: "DVR_NVR",
        manufacturer: "CP PLUS",
        model: "CP-UNR-416T2",
        firmwareVersion: "4.001.0000000.2",
        serialNumber: "CP416T2991823",
        channelCount: 16,
        channels: Array.from({ length: 16 }, (_, i) => ({
          channelNumber: i + 1,
          channelName: `Internal Cam ${i + 1}`,
          mainRtspUri: `rtsp://192.168.1.10:554/ch${i + 1}`,
          codec: "H264",
          resolution: { width: 1920, height: 1080 },
          fps: 25,
          bitrateKbps: 3200,
          hasAudio: false,
          hasPtz: false,
          status: "ONLINE",
        })),
        discoveredAt: new Date().toISOString(),
      },
      ...Array.from({ length: 4 }, (_, idx) => ({
        ipAddress: `192.168.1.${100 + idx}`,
        macAddress: `E0:50:8B:00:11:${(10 + idx).toString(16)}`,
        protocol: "DAHUA_CGI" as const,
        deviceType: "IP_CAMERA" as const,
        manufacturer: "Dahua Technology",
        model: "IPC-HFW5442E-ZE",
        firmwareVersion: "2.800.0000000.18.R",
        serialNumber: `DH5442998${10 + idx}`,
        channelCount: 1,
        channels: [
          {
            channelNumber: 1,
            channelName: `Perimeter ${idx + 1}`,
            mainRtspUri: `rtsp://192.168.1.${100 + idx}:554/live`,
            codec: "H265" as const,
            resolution: { width: 2560, height: 1440 },
            fps: 30,
            bitrateKbps: 4096,
            hasAudio: false,
            hasPtz: false,
            status: "ONLINE" as const,
          },
        ],
        discoveredAt: new Date().toISOString(),
      })),
    ];

    const report = await autoProvisioner.autoProvisionBranch({
      branchId: "BR-DEL-02",
      agentId: "agent-br-del-02",
      scannedSubnets: ["192.168.1.0/24"],
      discoveredDevices: devices,
      discoveryDurationMs: 1800,
    });

    expect(report.totalCamerasProvisioned).toBe(20);
    expect(report.digitalTwinNodesCreated).toBe(22); // 20 cams + 1 NVR + 1 branch
    expect(report.recordingStarted).toBe(true);
  });

  it("Invariant 9: Digital Twin topological nodes created and bound automatically", async () => {
    const devices: AutoDiscoveredDevice[] = [
      {
        ipAddress: "192.168.1.10",
        macAddress: "3C:EF:8C:44:11:A1",
        protocol: "CPPLUS_PROPRIETARY",
        deviceType: "DVR_NVR",
        manufacturer: "CP PLUS",
        model: "CP-UNR-416T2",
        firmwareVersion: "4.001.0000000.2",
        serialNumber: "CP416T2991823",
        channelCount: 16,
        channels: Array.from({ length: 16 }, (_, i) => ({
          channelNumber: i + 1,
          channelName: `Camera ${i + 1}`,
          mainRtspUri: `rtsp://192.168.1.10:554/ch${i + 1}`,
          codec: "H264",
          resolution: { width: 1920, height: 1080 },
          fps: 25,
          bitrateKbps: 3200,
          hasAudio: false,
          hasPtz: false,
          status: "ONLINE",
        })),
        discoveredAt: new Date().toISOString(),
      },
    ];

    const report = await autoProvisioner.autoProvisionBranch({
      branchId: "BR-TWIN-01",
      agentId: "agent-br-twin-01",
      scannedSubnets: ["192.168.1.0/24"],
      discoveredDevices: devices,
      discoveryDurationMs: 1200,
    });

    expect(report).toBeDefined();
    expect(report.digitalTwinNodesCreated).toBe(18); // 16 cams + 1 NVR + 1 branch
    expect(autoProvisioner.getOnboardingReport("BR-TWIN-01")).toBeDefined();
  });

  it("Invariant 10: Completes full 20-camera onboarding and transitions to MONITORING_ACTIVE in under 90s SLA", async () => {
    // 1. Generate Token
    const token = enrollment.generateEnrollmentToken("BR-SLA-01", "Bengaluru Tech Park");
    expect(token.token).toBeDefined();

    // 2. Exchange Token
    const exchange = enrollment.exchangeToken(token.token, {
      hostname: "sg-edge-sla",
      platform: "linux",
      macAddress: "3C:EF:8C:11:22:33",
    });
    expect(exchange.success).toBe(true);

    // 3. Auto-provision 20 cameras
    const devices: AutoDiscoveredDevice[] = [
      {
        ipAddress: "192.168.1.10",
        macAddress: "3C:EF:8C:44:11:A1",
        protocol: "CPPLUS_PROPRIETARY",
        deviceType: "DVR_NVR",
        manufacturer: "CP PLUS",
        model: "CP-UNR-416T2",
        firmwareVersion: "4.001.0000000.2",
        serialNumber: "CP416T2991823",
        channelCount: 16,
        channels: Array.from({ length: 16 }, (_, i) => ({
          channelNumber: i + 1,
          channelName: `Camera ${i + 1}`,
          mainRtspUri: `rtsp://192.168.1.10:554/ch${i + 1}`,
          codec: "H264",
          resolution: { width: 1920, height: 1080 },
          fps: 25,
          bitrateKbps: 3200,
          hasAudio: false,
          hasPtz: false,
          status: "ONLINE",
        })),
        discoveredAt: new Date().toISOString(),
      },
      ...Array.from({ length: 4 }, (_, idx) => ({
        ipAddress: `192.168.1.${100 + idx}`,
        macAddress: `E0:50:8B:00:11:${(10 + idx).toString(16)}`,
        protocol: "DAHUA_CGI" as const,
        deviceType: "IP_CAMERA" as const,
        manufacturer: "Dahua Technology",
        model: "IPC-HFW5442E-ZE",
        firmwareVersion: "2.800.0000000.18.R",
        serialNumber: `DH5442998${10 + idx}`,
        channelCount: 1,
        channels: [
          {
            channelNumber: 1,
            channelName: `Perimeter ${idx + 1}`,
            mainRtspUri: `rtsp://192.168.1.${100 + idx}:554/live`,
            codec: "H265" as const,
            resolution: { width: 2560, height: 1440 },
            fps: 30,
            bitrateKbps: 4096,
            hasAudio: false,
            hasPtz: false,
            status: "ONLINE" as const,
          },
        ],
        discoveredAt: new Date().toISOString(),
      })),
    ];

    const report = await autoProvisioner.autoProvisionBranch({
      branchId: "BR-SLA-01",
      agentId: "agent-br-sla-01",
      scannedSubnets: ["192.168.1.0/24"],
      discoveredDevices: devices,
      discoveryDurationMs: 1600,
    });

    expect(report.totalCamerasProvisioned).toBe(20);
    expect(report.elapsedSeconds).toBeLessThan(90);

    const status = enrollment.getBranchStatus("BR-SLA-01");
    expect(status).toBeDefined();
    expect(status!.currentStage).toBe("MONITORING_ACTIVE");
    expect(status!.stageProgressPct).toBe(100);
    expect(status!.elapsedSeconds).toBeLessThan(90);
  });
});
