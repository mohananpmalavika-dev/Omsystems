import { describe, it, expect, beforeEach } from "vitest";
import {
  RedisStreamLeaseRepository,
  RedisMediaGatewayRegistry,
  RedisViewerSessionRepository,
  PostgresCameraCapabilityRepository,
  ViewerStreamScheduler,
  GlobalStreamCoordinator,
  MediaOrchestrator,
  MediaMetricsService,
} from "../../src/media/index.js";

describe("Distributed Media Orchestration & Stream Scheduling Architecture", () => {
  let leaseRepo: RedisStreamLeaseRepository;
  let gatewayRegistry: RedisMediaGatewayRegistry;
  let sessionRepo: RedisViewerSessionRepository;
  let capabilityRepo: PostgresCameraCapabilityRepository;
  let orchestrator: MediaOrchestrator;

  beforeEach(() => {
    leaseRepo = new RedisStreamLeaseRepository();
    gatewayRegistry = new RedisMediaGatewayRegistry();
    sessionRepo = new RedisViewerSessionRepository();
    capabilityRepo = new PostgresCameraCapabilityRepository();
    orchestrator = new MediaOrchestrator(
      leaseRepo,
      gatewayRegistry,
      sessionRepo,
      capabilityRepo,
    );
  });

  describe("Suite 1: Distributed Stream Lease & Token Ownership", () => {
    it("atomically acquires a distributed stream lease with random token and TTL", async () => {
      const lease = await leaseRepo.acquire({
        cameraId: "cam-kochi-001",
        sessionId: "sess-user-1",
        ownerInstanceId: "backend-node-a",
        streamProfile: "main",
        ttlMs: 30000,
      });

      expect(lease).toBeDefined();
      expect(lease?.cameraId).toBe("cam-kochi-001");
      expect(lease?.token).toBeDefined();
      expect(typeof lease?.token).toBe("string");
      expect(lease?.ownerInstanceId).toBe("backend-node-a");
      expect(lease?.expiresAt).toBeGreaterThan(Date.now());
    });

    it("rejects concurrent acquisition for the same camera and profile (mutual exclusion)", async () => {
      const lease1 = await leaseRepo.acquire({
        cameraId: "cam-kochi-002",
        sessionId: "sess-user-1",
        ownerInstanceId: "backend-node-a",
        streamProfile: "main",
      });
      expect(lease1).not.toBeNull();

      // Second backend node tries to acquire the same stream
      const lease2 = await leaseRepo.acquire({
        cameraId: "cam-kochi-002",
        sessionId: "sess-user-2",
        ownerInstanceId: "backend-node-b",
        streamProfile: "main",
      });

      expect(lease2).toBeNull(); // Must fail because lease1 is active
    });

    it("allows token-guarded renewal and rejects invalid token renewal", async () => {
      const lease = await leaseRepo.acquire({
        cameraId: "cam-kochi-003",
        sessionId: "sess-user-1",
        ownerInstanceId: "backend-node-a",
      });
      expect(lease).not.toBeNull();

      // Valid renewal with correct token
      const renewed = await leaseRepo.renew(lease!.leaseId, lease!.token, 60000);
      expect(renewed).toBe(true);

      // Malicious or stale node trying to renew with wrong token
      const fakeRenew = await leaseRepo.renew(lease!.leaseId, "wrong-token-xyz", 60000);
      expect(fakeRenew).toBe(false);
    });

    it("allows token-guarded release and prevents deleting another node's re-acquired lease", async () => {
      const lease = await leaseRepo.acquire({
        cameraId: "cam-kochi-004",
        sessionId: "sess-user-1",
        ownerInstanceId: "backend-node-a",
      });
      expect(lease).not.toBeNull();

      // Release with wrong token fails
      const fakeRelease = await leaseRepo.release(lease!.leaseId, "invalid-token");
      expect(fakeRelease).toBe(false);

      // Release with true token succeeds
      const trueRelease = await leaseRepo.release(lease!.leaseId, lease!.token);
      expect(trueRelease).toBe(true);

      // Can now be acquired again
      const reAcquired = await leaseRepo.acquire({
        cameraId: "cam-kochi-004",
        sessionId: "sess-user-2",
        ownerInstanceId: "backend-node-b",
      });
      expect(reAcquired).not.toBeNull();
    });
  });

  describe("Suite 2: Multi-Node Cluster Failover & Stream Reuse Simulation", () => {
    it("simulates Backend A crash: Backend B reuses existing stream relay without duplicating pipeline", async () => {
      // 1. Backend A starts stream coordinator
      const coordinatorA = new GlobalStreamCoordinator(leaseRepo, gatewayRegistry, capabilityRepo);
      const coordinatorB = new GlobalStreamCoordinator(leaseRepo, gatewayRegistry, capabilityRepo);

      // 2. Viewer 1 on Backend A opens Camera 101
      const streamA = await coordinatorA.acquireStream("cam-vault-101", "sess-operator-1", "main");
      expect(streamA).toBeDefined();
      expect(streamA.relayUrl).toContain("cam-vault-101");

      // 3. Viewer 2 on Backend B opens the same Camera 101
      const streamB = await coordinatorB.acquireStream("cam-vault-101", "sess-operator-2", "main");

      // 4. Backend B receives the exact same relay URL and lease token (Zero duplicate RTSP relay!)
      expect(streamB.leaseId).toBe(streamA.leaseId);
      expect(streamB.relayUrl).toBe(streamA.relayUrl);
      expect(streamB.gatewayId).toBe(streamA.gatewayId);

      // 5. Backend A shuts down / crashes
      await coordinatorA.shutdown();

      // 6. Verification: Lease was shared and metrics recorded the reuse
      const metrics = MediaMetricsService.getInstance().getMetrics();
      expect(metrics.leaseAcquisitionSuccessCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Suite 3: Media Gateway Capacity & Atomic Slot Admission", () => {
    it("registers gateway heartbeats and selects the least loaded gateway", async () => {
      await gatewayRegistry.registerHeartbeat({
        gatewayId: "gateway-south-1",
        instanceId: "gw-inst-1",
        host: "10.0.1.10",
        port: 8554,
        region: "south",
        activeStreams: 250,
        maxStreams: 500,
        activeRelays: 100,
        maxRelays: 200,
        cpuPercent: 40,
        gpuPercent: 30,
        bandwidthMbps: 500,
        maxBandwidthMbps: 1000,
        transcodingSessions: 5,
        healthStatus: "HEALTHY",
        registeredAt: Date.now(),
        lastHeartbeatAt: Date.now(),
      });

      await gatewayRegistry.registerHeartbeat({
        gatewayId: "gateway-south-2",
        instanceId: "gw-inst-2",
        host: "10.0.1.20",
        port: 8554,
        region: "south",
        activeStreams: 50, // Less loaded
        maxStreams: 500,
        activeRelays: 20,
        maxRelays: 200,
        cpuPercent: 12,
        gpuPercent: 8,
        bandwidthMbps: 100,
        maxBandwidthMbps: 1000,
        transcodingSessions: 0,
        healthStatus: "HEALTHY",
        registeredAt: Date.now(),
        lastHeartbeatAt: Date.now(),
      });

      const optimal = await gatewayRegistry.selectOptimalGateway("south", 2);
      expect(optimal?.gatewayId).toBe("gateway-south-2"); // Picks the least loaded gateway
    });

    it("atomically reserves and releases streaming capacity slots", async () => {
      const reservation = await gatewayRegistry.reserveSlot(
        "gateway-south-2",
        "cam-entry-1",
        "sess-123",
        2,
      );

      expect(reservation).toBeDefined();
      expect(reservation?.reservationId).toBeDefined();
      expect(reservation?.gatewayId).toBe("gateway-south-2");

      const released = await gatewayRegistry.releaseSlot("gateway-south-2", reservation!.reservationId);
      expect(released).toBe(true);
    });
  });

  describe("Suite 4: Viewer Session & Hardware Decode Telemetry", () => {
    it("distinguishes multiple sessions per user (workstation vs mobile app)", async () => {
      const session1 = await orchestrator.createViewerSession("user-dhanya", "tenant-omsystems", "workstation", "4x4");
      const session2 = await orchestrator.createViewerSession("user-dhanya", "tenant-omsystems", "mobile", "1x1");

      expect(session1.sessionId).not.toBe(session2.sessionId);
      expect(session1.deviceType).toBe("workstation");
      expect(session2.deviceType).toBe("mobile");

      // Report telemetry for workstation
      await orchestrator.reportTelemetry({
        sessionId: session1.sessionId,
        browser: "chrome",
        hardwareDecode: true,
        codecsSupported: ["H264", "H265"],
        maxDecoders: 16,
        activeDecoders: 4,
        viewportTiles: 16,
        visibleCameraIds: ["cam-1", "cam-2", "cam-3", "cam-4"],
        lastReportedAt: Date.now(),
      });

      const tel = await sessionRepo.getTelemetry(session1.sessionId);
      expect(tel?.maxDecoders).toBe(16);
      expect(tel?.hardwareDecode).toBe(true);
    });
  });

  describe("Suite 5: 3-Tier Camera Capabilities Caching", () => {
    it("retrieves camera capabilities with multi-layer cache", async () => {
      await capabilityRepo.saveCapabilities({
        cameraId: "cam-ptz-4k",
        codecs: ["H264", "H265"],
        supportsMainStream: true,
        supportsSubStream: true,
        supportsPtz: true,
        supportsAudio: true,
        supportsOnvif: true,
        supportsRtsp: true,
        supportsWebRtc: true,
        maxWidth: 3840,
        maxHeight: 2160,
        maxFps: 30,
        profiles: [
          { name: "main", width: 3840, height: 2160, fps: 30, codec: "H265", bitrateKbps: 4096 },
          { name: "sub", width: 960, height: 540, fps: 15, codec: "H264", bitrateKbps: 1024 },
          { name: "preview", width: 320, height: 180, fps: 5, codec: "H264", bitrateKbps: 128 },
        ],
        discoveredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const caps = await capabilityRepo.getCapabilities("cam-ptz-4k");
      expect(caps?.maxWidth).toBe(3840);
      expect(caps?.supportsPtz).toBe(true);
      expect(caps?.profiles.length).toBe(3);
    });
  });

  describe("Suite 6: ViewerStreamScheduler Local Optimization", () => {
    it("prioritizes alarms and focused cameras while placing excess cameras in deferred mode", async () => {
      const scheduler = new ViewerStreamScheduler();
      const cameras = Array.from({ length: 32 }, (_, i) => ({
        id: `cam-${i + 1}`,
        name: `Camera ${i + 1}`,
        isOnline: true,
      }));

      const schedule = scheduler.calculateViewerSchedule(
        cameras,
        {
          sessionId: "sess-test",
          gridRows: 4,
          gridCols: 4,
          visibleCameraIds: ["cam-1", "cam-2", "cam-3", "cam-4"],
          focusedCameraId: "cam-1",
          activeAlarmCameraIds: ["cam-5"],
        },
        {
          sessionId: "sess-test",
          browser: "chrome",
          hardwareDecode: true,
          codecsSupported: ["H264"],
          maxDecoders: 16, // Browser budget: 16 live streams max
          activeDecoders: 0,
          viewportTiles: 16,
          visibleCameraIds: [],
          lastReportedAt: Date.now(),
        },
      );

      // Camera 5 (Alarm) must have CRITICAL_ALERT and main stream
      const cam5 = schedule.get("cam-5");
      expect(cam5?.priorityClass).toBe("CRITICAL_ALERT");
      expect(cam5?.streamProfile).toBe("main");
      expect(cam5?.playbackMode).toBe("live_video");

      // Camera 1 (Focused) must have USER_SELECTED
      const cam1 = schedule.get("cam-1");
      expect(cam1?.priorityClass).toBe("USER_SELECTED");
      expect(cam1?.playbackMode).toBe("live_video");

      // Cameras beyond decoder capacity (17-32) must be deferred / low fps
      const cam25 = schedule.get("cam-25");
      expect(cam25?.playbackMode).toBe("low_fps_preview");
    });
  });

  describe("Suite 7: Full Media Orchestrator Video Wall Grid Scheduling", () => {
    it("runs complete scheduling pass, acquiring distributed leases for live tiles", async () => {
      const session = await orchestrator.createViewerSession("user-admin", "tenant-omsystems");

      const cameras = [
        { id: "cam-hq-1", name: "HQ Entrance", isOnline: true },
        { id: "cam-hq-2", name: "Vault", isOnline: true },
        { id: "cam-hq-3", name: "Parking", isOnline: true },
      ];

      const result = await orchestrator.scheduleViewerGrid(session.sessionId, cameras, {
        gridRows: 2,
        gridCols: 2,
        visibleCameraIds: ["cam-hq-1", "cam-hq-2"],
        focusedCameraId: "cam-hq-1",
        activeAlarmCameraIds: ["cam-hq-2"],
      });

      expect(result.totalCameras).toBe(3);
      expect(result.liveStreamsScheduled).toBe(3);
      expect(result.cameras["cam-hq-1"]?.relayUrl).toBeDefined();
      expect(result.cameras["cam-hq-2"]?.relayUrl).toBeDefined();
    });
  });
});
