import { describe, expect, it } from "vitest";
import {
  CameraLeaseService,
  CameraSupervisorService,
  FencingTokenService,
  HaFailoverCoordinator,
  MediaNodeRegistry,
  MediaPlacementService,
} from "../../src/media/cluster/index.js";

const capacity = {
  maxCameras: 100, currentCameras: 5, cpuPct: 20, memoryPct: 30,
  ingressMbps: 20, maxIngressMbps: 500, diskWriteMbps: 10, maxDiskWriteMbps: 500,
  activeRtspSessions: 5, activeRecordingSessions: 5,
};

describe("media cluster failover", () => {
  it("fences an unexpired failed owner before assigning its camera to a healthy standby", async () => {
    const leases = new CameraLeaseService(undefined, { mode: "standalone" });
    const nodes = new MediaNodeRegistry();
    const placement = new MediaPlacementService(nodes);
    const coordinator = new HaFailoverCoordinator(leases, nodes, placement, new CameraSupervisorService(leases), new FencingTokenService());
    nodes.registerNode("node-a", "Node A", "10.0.0.1", 9001, { datacenter: "dc-a", zone: "z1", rack: "r1", host: "a", network: "n1", storagePool: "s1" }, capacity);
    nodes.registerNode("node-b", "Node B", "10.0.0.2", 9001, { datacenter: "dc-a", zone: "z1", rack: "r2", host: "b", network: "n2", storagePool: "s2" }, capacity);
    placement.scheduleCamera("tenant-a", "camera-a", "branch-a");
    const original = await leases.acquire("tenant-a", "camera-a", "node-a", "instance-a", 60_000);
    expect(original).not.toBeNull();

    nodes.simulateNodeCrash("node-a");
    const result = await coordinator.executeFailover("tenant-a", "camera-a", "heartbeat expired");

    expect(result.success).toBe(true);
    expect(result.newLease?.nodeId).toBe("node-b");
    expect(result.newLease?.fencingToken).toBeGreaterThan(original!.fencingToken);
    expect(await leases.renew(original!)).toBe(false);
  });
});
