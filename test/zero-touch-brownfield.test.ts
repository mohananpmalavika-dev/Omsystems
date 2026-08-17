import { describe, it, expect, beforeEach } from "vitest";
import {
  ZeroTouchEnrollmentService,
} from "../src/zero-touch/services/zero-touch-enrollment.service.js";
import {
  ZeroTouchJobEngineService,
} from "../src/zero-touch/services/zero-touch-job-engine.service.js";
import {
  ZeroTouchDeviceReviewService,
} from "../src/zero-touch/services/zero-touch-device-review.service.js";

describe("Production Zero-Touch Brownfield Control Plane (V2) Test Suite", () => {
  let enrollment: ZeroTouchEnrollmentService;
  let jobEngine: ZeroTouchJobEngineService;
  let deviceReview: ZeroTouchDeviceReviewService;

  beforeEach(() => {
    enrollment = new ZeroTouchEnrollmentService("https://control.sentinelgrid.internal");
    jobEngine = new ZeroTouchJobEngineService();
    deviceReview = new ZeroTouchDeviceReviewService(jobEngine);
  });

  it("Invariant 1: Generates 15-minute single-use signed enrollment package", () => {
    const pkg = enrollment.generateEnrollmentPackage("A005", "Adithi Malavika Commercial", "tenant-bank-01", 15);
    expect(pkg.token).toMatch(/^ENR-A005-[0-9A-F]{8}$/);
    expect(pkg.branchId).toBe("A005");
    expect(pkg.maxUses).toBe(1);
    expect(pkg.usedCount).toBe(0);
    expect(pkg.isRevoked).toBe(false);
    expect(new Date(pkg.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("Invariant 2: Generates valid 1-line unattended installer scripts for Windows & Linux", () => {
    const pkg = enrollment.generateEnrollmentPackage("A006", "Mumbai BKC");
    expect(pkg.installerScripts.windowsPowerShell).toContain("powershell -NoProfile");
    expect(pkg.installerScripts.windowsPowerShell).toContain(pkg.token);
    expect(pkg.installerScripts.linuxBash).toContain("curl -fsSL");
    expect(pkg.installerScripts.linuxBash).toContain(pkg.token);
  });

  it("Invariant 3: Agent exchanges token for pinned mTLS X.509 certificates and scan profile", () => {
    const pkg = enrollment.generateEnrollmentPackage("A008", "Bengaluru Tech Park");
    const exchange = enrollment.exchangeToken(pkg.token, {
      hostname: "sg-edge-a008-gw1",
      platform: "linux",
      macAddress: "3C:EF:8C:11:22:33",
    });

    expect(exchange.success).toBe(true);
    expect(exchange.agentId).toBe("agent-a008-gw1");
    expect(exchange.mtlsCredentials?.clientCertPem).toContain("BEGIN CERTIFICATE");
    expect(exchange.mtlsCredentials?.pinnedFingerprint).toMatch(/^SHA256:[0-9A-F]{32}$/);
    expect(exchange.scanProfile?.defaultSubnets).toContain("192.168.1.0/24");
  });

  it("Invariant 4: Enforces single-use policy and rejects re-enrollment with same token", () => {
    const pkg = enrollment.generateEnrollmentPackage("A009", "Hyderabad Flagship");
    const first = enrollment.exchangeToken(pkg.token, {
      hostname: "sg-edge-01",
      platform: "linux",
      macAddress: "00:11:22:33:44:55",
    });
    expect(first.success).toBe(true);

    const second = enrollment.exchangeToken(pkg.token, {
      hostname: "sg-edge-02",
      platform: "linux",
      macAddress: "00:11:22:33:44:66",
    });
    expect(second.success).toBe(false);
    expect(second.error).toContain("already been consumed");
  });

  it("Invariant 5: Rejects expired enrollment tokens (15-min SLA window)", () => {
    const pkg = enrollment.generateEnrollmentPackage("A010", "Expired Branch", "tenant-01", -5); // Expired 5 mins ago
    const result = enrollment.exchangeToken(pkg.token, {
      hostname: "sg-edge-exp",
      platform: "win32",
      macAddress: "AA:BB:CC:DD:EE:FF",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("expired");
  });

  it("Invariant 6: Starts real provisioning job and executes 12-step pipeline", async () => {
    const job = await jobEngine.startProvisioningJob({
      branchId: "A005",
      scannedSubnets: ["192.168.1.0/24"],
      createdBy: "Chief Security Officer",
    });

    expect(job).toBeDefined();
    expect(job.branchId).toBe("A005");
    expect(job.steps).toHaveLength(12);
    expect(job.steps[0]!.step).toBe("CREATE_BRANCH");
    expect(job.steps[11]!.step).toBe("MONITORING_ACTIVATION");

    // Wait for pipeline execution
    await new Promise((r) => setTimeout(r, 300));

    const updatedJob = jobEngine.getJob(job.id);
    expect(updatedJob).toBeDefined();
    expect(updatedJob!.discoveredDeviceCount).toBeGreaterThanOrEqual(1);
    expect(updatedJob!.discoveredChannelCount).toBe(20);
    expect(updatedJob!.status).toBe("COMPLETED");
  });

  it("Invariant 7: Decomposes brownfield DVR/NVR into 16 discrete channels without manual IP entry", async () => {
    const job = await jobEngine.startProvisioningJob({ branchId: "A008" });
    await new Promise((r) => setTimeout(r, 300));

    const devices = jobEngine.getDiscoveredDevices("A008");
    expect(devices).toHaveLength(5); // 1 NVR + 4 IPCs

    const nvr = devices.find((d) => d.deviceType === "DVR_NVR");
    expect(nvr).toBeDefined();
    expect(nvr!.channelCount).toBe(16);
    expect(nvr!.channels).toHaveLength(16);
    expect(nvr!.channels[0]!.mainRtspUri).toContain("channel=1");
    expect(nvr!.channels[15]!.mainRtspUri).toContain("channel=16");
  });

  it("Invariant 8: Separates discovery from approval and supports credential resolution", async () => {
    await jobEngine.startProvisioningJob({ branchId: "A005" });
    await new Promise((r) => setTimeout(r, 300));

    const devices = jobEngine.getDiscoveredDevices("A005");
    expect(devices.length).toBeGreaterThan(0);

    const firstDevice = devices[0]!;
    const reviewResult = deviceReview.approveDeviceChannels("A005", firstDevice.deviceId, [1, 2, 3]);
    expect(reviewResult.success).toBe(true);
    expect(reviewResult.approvedCount).toBe(3);

    const batchResult = deviceReview.batchApproveBranch("A005");
    expect(batchResult.success).toBe(true);
    expect(batchResult.totalApproved).toBeGreaterThanOrEqual(16);
  });

  it("Invariant 9: Verifies end-to-end video pipeline (Frames -> Recording -> Storage -> Playback)", async () => {
    const job = await jobEngine.startProvisioningJob({ branchId: "A005" });
    await new Promise((r) => setTimeout(r, 600));

    const devices = jobEngine.getDiscoveredDevices("A005");
    const verifiedChannel = devices[0]!.channels[0]!;

    expect(verifiedChannel.streamVerification).toBeDefined();
    expect(verifiedChannel.streamVerification!.recordingSegmentWritten).toBe(true);
    expect(verifiedChannel.streamVerification!.playbackVerified).toBe(true);
    expect(verifiedChannel.streamVerification!.telemetryBound).toBe(true);
  });

  it("Invariant 10: Calculates realistic Fleet SLA metrics (P50, P95, and average adherence)", () => {
    const sla = jobEngine.getFleetSlaMetrics();
    expect(sla.targetSlaSeconds).toBe(90);
    expect(sla.fleetAverageSeconds).toBeGreaterThan(60);
    expect(sla.p50Seconds).toBeLessThanOrEqual(sla.p95Seconds);
    expect(sla.slaAdherencePct).toBeGreaterThanOrEqual(85);
  });
});
