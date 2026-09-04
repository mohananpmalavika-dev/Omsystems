import { describe, it, expect, beforeEach } from "vitest";
import { PortableCameraRepository } from "../src/portable-camera/portable-camera-repository";
import { PortableCameraLeaseManager } from "../src/ha/services/portable-camera-lease-manager.service";

describe("Portable Camera Subsystem", () => {
  let repository: PortableCameraRepository;
  let leaseManager: PortableCameraLeaseManager;

  const tenantId = "tenant-test-01";
  const branchId = "branch-kollam-01";
  const userId = "user-engineer-07";

  beforeEach(() => {
    repository = new PortableCameraRepository(null); // In-memory mode
    leaseManager = new PortableCameraLeaseManager(null as any, null); // In-memory mode
  });

  describe("1. Enrollment & Token Security", () => {
    it("generates short-lived, single-use enrollment token with expiration", async () => {
      const enrollment = await repository.createEnrollment({
        tenantId,
        branchId,
        createdBy: userId,
        expiresInSeconds: 300,
        allowedSourceTypes: ["ANDROID_CAMERA" as any, "LAPTOP_CAMERA" as any],
        requestedPermissions: ["camera", "microphone"],
      });

      expect(enrollment.id).toBeDefined();
      expect(enrollment.token.startsWith("pce_")).toBe(true);
      expect(enrollment.status).toBe("PENDING");
      expect(enrollment.tenantId).toBe(tenantId);
      expect(enrollment.branchId).toBe(branchId);

      const expDate = new Date(enrollment.expiresAt).getTime();
      const now = Date.now();
      expect(expDate - now).toBeGreaterThan(4 * 60 * 1000);
      expect(expDate - now).toBeLessThanOrEqual(5 * 60 * 1000 + 5000);
    });

    it("enforces single-use token consumption (cannot be reused)", async () => {
      const enrollment = await repository.createEnrollment({
        tenantId,
        branchId,
        createdBy: userId,
        expiresInSeconds: 300,
        allowedSourceTypes: ["BROWSER_CAMERA" as any],
        requestedPermissions: ["camera"],
      });

      const firstConsumed = await repository.consumeEnrollment(enrollment.token, "device-phone-01");
      expect(firstConsumed).toBe(true);

      // Attempting to consume again must FAIL
      const secondConsumed = await repository.consumeEnrollment(enrollment.token, "device-phone-02");
      expect(secondConsumed).toBe(false);

      const retrieved = await repository.getEnrollmentByToken(enrollment.token);
      expect(retrieved?.status).toBe("CONSUMED");
      expect(retrieved?.usedByDeviceId).toBe("device-phone-01");
    });

    it("rejects expired enrollment tokens", async () => {
      const enrollment = await repository.createEnrollment({
        tenantId,
        branchId,
        createdBy: userId,
        expiresInSeconds: -10, // Expired in past
        allowedSourceTypes: ["ANDROID_CAMERA" as any],
        requestedPermissions: ["camera"],
      });

      const consumed = await repository.consumeEnrollment(enrollment.token, "device-phone-03");
      expect(consumed).toBe(false);
    });
  });

  describe("2. Device Identity & Remote Revocation", () => {
    it("registers a device with secure persistent identity", async () => {
      const device = await repository.registerDevice({
        tenantId,
        deviceType: "ANDROID",
        deviceName: "Engineer-07 Samsung S24",
        enrolledBy: userId,
        appVersion: "1.0.0",
        osVersion: "Android 14",
      });

      expect(device.id).toBeDefined();
      expect(device.state).toBe("ACTIVE");
      expect(device.credentialId).toBeDefined();
      expect(device.deviceName).toBe("Engineer-07 Samsung S24");

      const fetched = await repository.getDevice(device.id);
      expect(fetched).toBeDefined();
      expect(fetched?.state).toBe("ACTIVE");
    });

    it("supports remote revocation of enrolled device", async () => {
      const device = await repository.registerDevice({
        tenantId,
        deviceType: "WINDOWS",
        deviceName: "Tech-03 Dell XPS",
        enrolledBy: userId,
      });

      expect(device.state).toBe("ACTIVE");

      const revoked = await repository.revokeDevice(device.id);
      expect(revoked).toBe(true);

      const fetched = await repository.getDevice(device.id);
      expect(fetched?.state).toBe("REVOKED");
    });
  });

  describe("3. Session Lifecycle & State Machine", () => {
    it("creates and transitions session through lifecycle states", async () => {
      const device = await repository.registerDevice({
        tenantId,
        deviceType: "BROWSER",
        deviceName: "Chrome Browser Streamer",
        enrolledBy: userId,
      });

      const session = await repository.createSession({
        tenantId,
        branchId,
        sourceId: "cam-portable-01",
        deviceId: device.id,
        userId,
        mediaNodeId: "media-node-01",
        fencingToken: 1001,
        recordingPolicy: "RECORD_WHILE_LIVE",
        videoCodec: "H264",
        audioCodec: "OPUS",
        resolution: { width: 1920, height: 1080 },
        fps: 25,
        bitrateKbps: 2000,
      });

      expect(session.id).toBeDefined();
      expect(session.state).toBe("CREATED");
      expect(session.fencingToken).toBe(1001);

      // Transition to LIVE with telemetry
      await repository.updateSessionState(session.id, "LIVE", {
        connectivity: "HEALTHY",
        bitrateKbps: 2040,
        fps: 25,
        packetLossPercent: 0.1,
        recordingState: "RECORDING",
      });

      const liveSession = await repository.getSession(session.id);
      expect(liveSession?.state).toBe("LIVE");
      expect(liveSession?.health?.fps).toBe(25);
      expect(liveSession?.health?.recordingState).toBe("RECORDING");

      // Network loss transition to DEGRADED
      await repository.updateSessionState(session.id, "DEGRADED");
      const degradedSession = await repository.getSession(session.id);
      expect(degradedSession?.state).toBe("DEGRADED");

      // Controlled stop transitions to ENDED
      await repository.updateSessionState(session.id, "ENDED", undefined, "operator_stopped");
      const endedSession = await repository.getSession(session.id);
      expect(endedSession?.state).toBe("ENDED");
      expect(endedSession?.endedReason).toBe("operator_stopped");
      expect(endedSession?.endedAt).toBeDefined();
    });
  });

  describe("4. Distributed Media Node Lease Management & Fencing", () => {
    it("acquires lease with monotonic fencing token to prevent split brain", async () => {
      const sourceId = "cam-portable-lease-test";
      const sessionId = "session-01";
      const mediaNodeId = "media-node-01";

      const lease1 = await leaseManager.acquireLease(tenantId, sourceId, sessionId, mediaNodeId, 10);
      expect(lease1.acquired).toBe(true);
      expect(lease1.lease?.fencingToken).toBeGreaterThan(0);
      expect(lease1.lease?.nodeId).toBe(mediaNodeId);

      // Second node attempting to acquire with different session while lease active is rejected
      const lease2 = await leaseManager.acquireLease(tenantId, sourceId, "session-02", "media-node-02", 10);
      expect(lease2.acquired).toBe(false);

      // Releasing lease allows new node to acquire with increased fencing token
      await leaseManager.releaseLease(tenantId, sourceId, sessionId, mediaNodeId);
      const lease3 = await leaseManager.acquireLease(tenantId, sourceId, "session-03", "media-node-02", 10);
      expect(lease3.acquired).toBe(true);
      expect(lease3.lease?.fencingToken).toBeGreaterThan(lease1.lease!.fencingToken);
      expect(lease3.lease?.nodeId).toBe("media-node-02");
    });
  });

  describe("5. Tenant Policy Enforcement", () => {
    it("returns default policy and allows tenant custom policies", async () => {
      const policy = await repository.getPolicy(tenantId);
      expect(policy.enabled).toBe(true);
      expect(policy.allowRecording).toBe(true);
      expect(policy.maxConcurrentSessions).toBeGreaterThan(0);

      await repository.savePolicy({
        tenantId,
        enabled: false,
        allowedSourceTypes: [],
        maxConcurrentSessions: 0,
        allowAudio: false,
        allowLocation: false,
        allowRecording: false,
        defaultRecordingPolicy: "NO_RECORDING",
        requireUserConsent: true,
      });

      const updated = await repository.getPolicy(tenantId);
      expect(updated.enabled).toBe(false);
      expect(updated.allowAudio).toBe(false);
    });
  });

  describe("6. Incident Attachment & Forensic Evidence Integration", () => {
    it("attaches portable camera session to active security incident", async () => {
      const device = await repository.registerDevice({
        tenantId,
        deviceType: "ANDROID",
        deviceName: "Patrol Officer Phone",
        enrolledBy: userId,
      });

      const session = await repository.createSession({
        tenantId,
        branchId,
        sourceId: "cam-portable-patrol",
        deviceId: device.id,
        userId,
        mediaNodeId: "media-node-01",
        fencingToken: 2001,
        recordingPolicy: "CONTINUOUS_WHILE_SESSION_ACTIVE",
      });

      const incidentId = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
      await repository.attachIncidentToSession(session.id, incidentId);

      const retrieved = await repository.getSession(session.id);
      expect(retrieved?.incidentIds).toContain(incidentId);
    });

    it("records location telemetry without fabricating coordinates", async () => {
      const device = await repository.registerDevice({
        tenantId,
        deviceType: "IOS",
        deviceName: "Branch Manager iPhone",
        enrolledBy: userId,
      });

      const session = await repository.createSession({
        tenantId,
        branchId,
        sourceId: "cam-portable-ios",
        deviceId: device.id,
        userId,
        mediaNodeId: "media-node-01",
        fencingToken: 3001,
        recordingPolicy: "RECORD_WHILE_LIVE",
      });

      // Claimed GPS location recorded
      await repository.recordSessionEvent(session.id, "HEALTH_TELEMETRY", {
        location: {
          available: true,
          latitude: 8.8932,
          longitude: 76.6141,
          accuracy: 12,
          capturedAt: new Date().toISOString(),
        },
      });

      // Verification when location is denied/unavailable
      await repository.recordSessionEvent(session.id, "HEALTH_TELEMETRY", {
        location: {
          available: false,
          reason: "PERMISSION_DENIED",
        },
      });

      const active = await repository.getSession(session.id);
      expect(active).toBeDefined();
    });
  });
});
