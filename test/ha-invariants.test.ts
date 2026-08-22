import { describe, it, expect, beforeEach } from "vitest";
import {
  CameraLeaseService,
  MediaNodeRegistry,
  MediaPlacementService,
  CameraSupervisorService,
  FencingTokenService,
  HaFailoverCoordinator,
} from "../src/media/cluster/index.js";

describe("High Availability (HA) & Distributed Camera Ownership Invariant Test Suite", () => {
  let leaseService: CameraLeaseService;
  let nodeRegistry: MediaNodeRegistry;
  let placementService: MediaPlacementService;
  let supervisor: CameraSupervisorService;
  let fencingService: FencingTokenService;
  let coordinator: HaFailoverCoordinator;

  beforeEach(() => {
    leaseService = new CameraLeaseService();
    nodeRegistry = new MediaNodeRegistry();
    placementService = new MediaPlacementService(nodeRegistry);
    supervisor = new CameraSupervisorService(leaseService);
    fencingService = new FencingTokenService();
    coordinator = new HaFailoverCoordinator(
      leaseService,
      nodeRegistry,
      placementService,
      supervisor,
      fencingService,
    );
  });

  it("Invariant 1: At most one active authoritative lease exists per camera", async () => {
    const tenantId = "tenant-blr";
    const cameraId = "CAM-101";

    const leaseA = await leaseService.acquire(tenantId, cameraId, "media-node-01", "inst-01", 15_000);
    expect(leaseA).not.toBeNull();
    expect(leaseA?.nodeId).toBe("media-node-01");

    // Node B attempts to acquire while Node A's lease is active
    const leaseB = await leaseService.acquire(tenantId, cameraId, "media-node-02", "inst-02", 15_000);
    expect(leaseB).toBeNull(); // Must be rejected
  });

  it("Invariant 2: Ownership epochs (fencing tokens) only increase monotonically", async () => {
    const tenantId = "tenant-blr";
    const cameraId = "CAM-102";

    const lease1 = await leaseService.acquire(tenantId, cameraId, "media-node-01", "inst-01", 10);
    expect(lease1).not.toBeNull();
    const token1 = lease1!.fencingToken;

    // Simulate expiration
    await new Promise((r) => setTimeout(r, 20));

    const lease2 = await leaseService.acquire(tenantId, cameraId, "media-node-02", "inst-02", 15_000);
    expect(lease2).not.toBeNull();
    const token2 = lease2!.fencingToken;

    expect(token2).toBeGreaterThan(token1);
  });

  it("Invariant 3: A stale owner cannot update the Recording Index (STALE_OWNER_REJECTED)", () => {
    const tenantId = "tenant-blr";
    const cameraId = "CAM-103";

    // Media Node B has current authoritative epoch 52
    fencingService.setAuthoritativeEpoch(tenantId, cameraId, 52);

    // Media Node A wakes up late from GC pause and attempts to write with stale token 51
    const staleResult = fencingService.verifyAndCommitSegment({
      tenantId,
      cameraId,
      segmentId: "seg-stale-01",
      nodeId: "media-node-01",
      instanceId: "inst-01",
      fencingToken: 51,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      sizeBytes: 10240,
      codec: "H264",
      storagePath: "",
    });

    expect(staleResult.accepted).toBe(false);
    expect(staleResult.rejectionReason).toBe("STALE_OWNER_REJECTED");
    expect(staleResult.currentAuthoritativeEpoch).toBe(52);

    // Media Node B writes with token 52
    const validResult = fencingService.verifyAndCommitSegment({
      tenantId,
      cameraId,
      segmentId: "seg-valid-01",
      nodeId: "media-node-02",
      instanceId: "inst-02",
      fencingToken: 52,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      sizeBytes: 10240,
      codec: "H264",
      storagePath: "",
    });

    expect(validResult.accepted).toBe(true);
  });

  it("Invariant 4: Lease loss cancels recording immediately via AbortController", async () => {
    const tenantId = "tenant-blr";
    const cameraId = "CAM-104";

    const worker = await supervisor.startWorker(tenantId, cameraId, "media-node-01", "inst-01");
    expect(worker).not.toBeNull();
    expect(worker?.state).toBe("STREAMING");
    expect(worker?.context.abortController.signal.aborted).toBe(false);

    // Terminate worker upon lease loss
    supervisor.terminateWorker(tenantId, cameraId, "LEASE_EXPIRED");
    expect(worker?.context.abortController.signal.aborted).toBe(true);
    expect(supervisor.getWorker(tenantId, cameraId)).toBeUndefined();
  });

  it("Invariant 5: Camera reassignment does not require user intervention (automated failover)", async () => {
    const tenantId = "tenant-blr";
    const cameraId = "CAM-105";

    // Setup initial placement and active lease
    placementService.scheduleCamera(tenantId, cameraId, "branch-01");
    await leaseService.acquire(tenantId, cameraId, "media-node-01", "inst-01", 10);
    await new Promise((r) => setTimeout(r, 20)); // Expire lease

    // Execute automated failover
    const result = await coordinator.executeFailover(tenantId, cameraId, "Automated test failover");
    expect(result.success).toBe(true);
    expect(result.event.type).toBe("CAMERA_FAILOVER_COMPLETED");
    expect(result.event.newNode).toBeDefined();
    expect(result.event.recordingGapMs).toBeGreaterThan(0);
  });

  it("Invariant 6: Node restart creates a new instance identity", () => {
    const defaultNode = nodeRegistry.getNode("media-node-01");
    expect(defaultNode).toBeDefined();
    const oldInstanceId = defaultNode!.instanceId;

    // Simulate node reboot
    const rebooted = nodeRegistry.registerNode(
      "media-node-01",
      defaultNode!.nodeName,
      defaultNode!.host,
      defaultNode!.port,
      defaultNode!.failureDomain,
      defaultNode!.capacity,
    );

    expect(rebooted.nodeId).toBe("media-node-01");
    expect(rebooted.instanceId).not.toBe(oldInstanceId);
  });

  it("Invariant 7: Expired lease prevents old owner from renewing after failover", async () => {
    const tenantId = "tenant-blr";
    const cameraId = "CAM-107";

    const leaseA = await leaseService.acquire(tenantId, cameraId, "media-node-01", "inst-01", 10);
    expect(leaseA).not.toBeNull();

    // Expire lease
    await new Promise((r) => setTimeout(r, 20));

    // Node B acquires camera
    const leaseB = await leaseService.acquire(tenantId, cameraId, "media-node-02", "inst-02", 15_000);
    expect(leaseB).not.toBeNull();

    // Node A wakes up and attempts to renew its expired lease
    const renewedByA = await leaseService.renew(leaseA!);
    expect(renewedByA).toBe(false); // Compare-and-renew must fail
  });

  it("Invariant 8: Recording remains searchable and uses immutable paths across transitions", () => {
    const pathA = fencingService.generateImmutableSegmentPath("tenant-01", "CAM-101", 18452, "media-01", "2026-08-17T16:42:00Z");
    const pathB = fencingService.generateImmutableSegmentPath("tenant-01", "CAM-101", 18453, "media-02", "2026-08-17T16:42:30Z");

    expect(pathA).toContain("18452-media-01");
    expect(pathB).toContain("18453-media-02");
    expect(pathA).not.toBe(pathB);
  });

  it("Invariant 9: Every failover is auditable with recorded gap duration", async () => {
    const tenantId = "tenant-blr";
    const cameraId = "CAM-109";
    placementService.scheduleCamera(tenantId, cameraId, "branch-01");

    const { event } = await coordinator.executeFailover(tenantId, cameraId, "Network partition test");
    expect(event.id).toBeDefined();
    expect(event.recordingGapMs).toBeGreaterThanOrEqual(100);
    expect(event.streamRestoredAt).toBeDefined();

    const recent = coordinator.getRecentEvents(1);
    expect(recent[0]?.id).toBe(event.id);
  });

  it("Invariant 10: Standby capacity headroom is measured and verified", () => {
    const metrics = coordinator.getMetrics();
    expect(metrics.totalCapacityHeadroomPct).toBeGreaterThan(0);
    expect(metrics.activeNodes).toBeGreaterThan(1);
    expect(metrics.healthyNodes).toBeGreaterThan(0);
  });
});
