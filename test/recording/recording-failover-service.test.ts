import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RecordingNodeRegistry } from "../../src/recording/failover/recording-node-registry.js";
import {
  RecordingFailoverCoordinator,
  type FailoverCoordinatorConfig,
} from "../../src/recording/failover/recording-failover-coordinator.service.js";
import type { IStreamIngestActivator } from "../../src/recording/failover/recording-failover.types.js";

describe("Recording Engine N+1 Failover Unit Test Suite", () => {
  let registry: RecordingNodeRegistry;
  let coordinator: RecordingFailoverCoordinator;
  let activatedStreams: Array<{ nodeId: string; cameraId: string; epoch: number }>;
  let deactivatedStreams: Array<{ nodeId: string; cameraId: string; epoch: number }>;

  class MockStreamIngestActivator implements IStreamIngestActivator {
    async activateStreamIngest(params: {
      nodeId: string;
      cameraId: string;
      streamUri: string;
      epoch: number;
    }) {
      activatedStreams.push({ nodeId: params.nodeId, cameraId: params.cameraId, epoch: params.epoch });
      return { success: true, pid: 1234, streamId: `stream-${params.cameraId}` };
    }

    async deactivateStreamIngest(params: {
      nodeId: string;
      cameraId: string;
      epoch: number;
    }) {
      deactivatedStreams.push({ nodeId: params.nodeId, cameraId: params.cameraId, epoch: params.epoch });
      return { success: true };
    }
  }

  beforeEach(() => {
    activatedStreams = [];
    deactivatedStreams = [];
    registry = new RecordingNodeRegistry(undefined as any);
    coordinator = new RecordingFailoverCoordinator(
      undefined as any,
      registry,
      new MockStreamIngestActivator(),
      {
        heartbeatTimeoutMs: 5000,
        detectionIntervalMs: 1000,
        enableAutoFailover: true,
      },
    );
  });

  afterEach(() => {
    coordinator.stopLivenessMonitoring();
  });

  it("registers active and standby nodes and processes periodic heartbeats", async () => {
    const activeNode = await registry.registerNode({
      id: "rec-node-01",
      name: "Branch Alpha Recorder",
      host: "10.0.1.10",
      role: "ACTIVE",
      maxStreamCapacity: 64,
    });

    const standbyNode = await registry.registerNode({
      id: "rec-node-standby-01",
      name: "Hot Standby Recorder 01",
      host: "10.0.1.99",
      role: "STANDBY",
      maxStreamCapacity: 128,
    });

    expect(activeNode.id).toBe("rec-node-01");
    expect(activeNode.role).toBe("ACTIVE");
    expect(activeNode.state).toBe("HEALTHY");

    expect(standbyNode.id).toBe("rec-node-standby-01");
    expect(standbyNode.role).toBe("STANDBY");

    // Ingest heartbeat with telemetry
    const updated = await registry.recordHeartbeat({
      nodeId: "rec-node-01",
      cpuPercent: 32.5,
      memoryPercent: 54.0,
      diskWriteMbps: 45.8,
      activeStreamCount: 16,
    });

    expect(updated.cpuPercent).toBe(32.5);
    expect(updated.memoryPercent).toBe(54.0);
    expect(updated.diskWriteMbps).toBe(45.8);
    expect(updated.state).toBe("HEALTHY");
  });

  it("detects expired active node heartbeats and executes automatic failover to standby", async () => {
    // 1. Setup Active node and Standby node
    await registry.registerNode({
      id: "rec-node-hq",
      name: "HQ Primary Recorder",
      host: "10.0.0.10",
      role: "ACTIVE",
      maxStreamCapacity: 64,
    });

    await registry.registerNode({
      id: "rec-node-standby",
      name: "Cluster Standby Recorder",
      host: "10.0.0.99",
      role: "STANDBY",
      maxStreamCapacity: 64,
    });

    // 2. Assign two camera streams to Active node
    const cam1 = "11111111-1111-1111-1111-111111111111";
    const cam2 = "22222222-2222-2222-2222-222222222222";

    await registry.assignCamera({
      cameraId: cam1,
      primaryNodeId: "rec-node-hq",
      streamUri: "rtsp://10.0.0.50:554/ch0",
    });

    await registry.assignCamera({
      cameraId: cam2,
      primaryNodeId: "rec-node-hq",
      streamUri: "rtsp://10.0.0.51:554/ch0",
    });

    // Verify initial stream assignment
    const initialCam1 = registry.getAssignment(cam1);
    expect(initialCam1?.currentNodeId).toBe("rec-node-hq");
    expect(initialCam1?.status).toBe("ACTIVE");

    // 3. Simulate heartbeat expiration on Active node (set heartbeatAt to 15s ago)
    registry.setNodeHeartbeatAt("rec-node-hq", new Date(Date.now() - 15000));

    // Keep Standby node heartbeat fresh
    await registry.recordHeartbeat({
      nodeId: "rec-node-standby",
      role: "STANDBY",
      cpuPercent: 5,
    });

    // 4. Trigger liveness evaluation
    const { expiredNodes, failoverResults } = await coordinator.checkNodeLiveness();

    expect(expiredNodes).toContain("rec-node-hq");
    expect(failoverResults.length).toBe(1);

    const result = failoverResults[0]!;
    expect(result.success).toBe(true);
    expect(result.failedNodeId).toBe("rec-node-hq");
    expect(result.standbyNodeId).toBe("rec-node-standby");
    expect(result.affectedCameras).toBe(2);
    expect(result.transferredCameras).toBe(2);
    expect(result.totalRtoMs).toBeGreaterThanOrEqual(0);

    // 5. Verify camera stream assignments are now routed to Standby node
    const failedOverCam1 = registry.getAssignment(cam1);
    const failedOverCam2 = registry.getAssignment(cam2);

    expect(failedOverCam1?.currentNodeId).toBe("rec-node-standby");
    expect(failedOverCam1?.status).toBe("FAILED_OVER");
    expect(failedOverCam1?.takeoverEpoch).toBe(2);

    expect(failedOverCam2?.currentNodeId).toBe("rec-node-standby");
    expect(failedOverCam2?.status).toBe("FAILED_OVER");

    // 6. Verify stream ingest activator was called for both cameras on the standby node
    expect(activatedStreams).toEqual([
      { nodeId: "rec-node-standby", cameraId: cam1, epoch: 2 },
      { nodeId: "rec-node-standby", cameraId: cam2, epoch: 2 },
    ]);

    // 7. Verify standby node state updated to FAILOVER_ACTIVE
    const standbyNode = registry.getNode("rec-node-standby");
    expect(standbyNode?.state).toBe("FAILOVER_ACTIVE");
  });

  it("selects the least-loaded standby node when multiple standby nodes are available", async () => {
    await registry.registerNode({
      id: "rec-active-01",
      name: "Active 01",
      host: "10.0.0.1",
      role: "ACTIVE",
    });

    // Standby 1: 50/100 active streams (50 free)
    await registry.registerNode({
      id: "rec-standby-busy",
      name: "Standby Busy",
      host: "10.0.0.91",
      role: "STANDBY",
      maxStreamCapacity: 100,
    });
    await registry.recordHeartbeat({
      nodeId: "rec-standby-busy",
      role: "STANDBY",
      activeStreamCount: 50,
      maxStreamCapacity: 100,
    });

    // Standby 2: 10/100 active streams (90 free) -> Preferred!
    await registry.registerNode({
      id: "rec-standby-free",
      name: "Standby Free",
      host: "10.0.0.92",
      role: "STANDBY",
      maxStreamCapacity: 100,
    });
    await registry.recordHeartbeat({
      nodeId: "rec-standby-free",
      role: "STANDBY",
      activeStreamCount: 10,
      maxStreamCapacity: 100,
    });

    const camId = "33333333-3333-3333-3333-333333333333";
    await registry.assignCamera({
      cameraId: camId,
      primaryNodeId: "rec-active-01",
      streamUri: "rtsp://10.0.0.60:554/stream",
    });

    const result = await coordinator.executeFailover("rec-active-01", "MANUAL_FAILOVER");

    expect(result.success).toBe(true);
    expect(result.standbyNodeId).toBe("rec-standby-free");
  });

  it("executes graceful failback to primary node when it recovers and reports healthy heartbeats", async () => {
    // 1. Setup nodes and stream
    await registry.registerNode({
      id: "rec-node-primary",
      name: "Primary Node",
      host: "10.0.1.1",
      role: "ACTIVE",
    });

    await registry.registerNode({
      id: "rec-node-standby",
      name: "Standby Node",
      host: "10.0.1.2",
      role: "STANDBY",
    });

    const camId = "44444444-4444-4444-4444-444444444444";
    await registry.assignCamera({
      cameraId: camId,
      primaryNodeId: "rec-node-primary",
      streamUri: "rtsp://10.0.1.50/live",
    });

    // 2. Execute failover to standby
    await coordinator.executeFailover("rec-node-primary", "NODE_CRASH");
    expect(registry.getAssignment(camId)?.currentNodeId).toBe("rec-node-standby");

    // 3. Attempt failback while primary is still expired/unhealthy -> should throw
    await registry.updateNodeState("rec-node-primary", "HEARTBEAT_EXPIRED");
    await expect(
      coordinator.executeFailback("rec-node-primary", "rec-node-standby"),
    ).rejects.toThrow("must be [HEALTHY]");

    // 4. Primary node recovers and sends fresh heartbeat
    await registry.recordHeartbeat({
      nodeId: "rec-node-primary",
      role: "ACTIVE",
      cpuPercent: 15,
    });

    // 5. Execute graceful failback
    const failbackResult = await coordinator.executeFailback("rec-node-primary", "rec-node-standby");

    expect(failbackResult.success).toBe(true);
    expect(failbackResult.restoredCameras).toBe(1);
    expect(failbackResult.primaryNodeId).toBe("rec-node-primary");

    // Verify camera is back on primary node
    const restoredAssignment = registry.getAssignment(camId);
    expect(restoredAssignment?.currentNodeId).toBe("rec-node-primary");
    expect(restoredAssignment?.status).toBe("ACTIVE");

    // Verify deactivation on standby and activation on primary occurred
    expect(deactivatedStreams).toEqual([
      { nodeId: "rec-node-standby", cameraId: camId, epoch: 3 },
    ]);
    expect(activatedStreams).toContainEqual({
      nodeId: "rec-node-primary",
      cameraId: camId,
      epoch: 3,
    });

    // Standby returns to HEALTHY standby state
    expect(registry.getNode("rec-node-standby")?.state).toBe("HEALTHY");
  });

  it("calculates accurate cluster HA metrics and MTTR", async () => {
    await registry.registerNode({ id: "rec-1", name: "Node 1", host: "1.1.1.1", role: "ACTIVE" });
    await registry.registerNode({ id: "rec-2", name: "Node 2", host: "1.1.1.2", role: "ACTIVE" });
    await registry.registerNode({ id: "rec-standby", name: "Standby", host: "1.1.1.9", role: "STANDBY" });

    await registry.assignCamera({
      cameraId: "55555555-5555-5555-5555-555555555555",
      primaryNodeId: "rec-1",
      streamUri: "rtsp://1.1.1.50/live",
    });

    await registry.assignCamera({
      cameraId: "66666666-6666-6666-6666-666666666666",
      primaryNodeId: "rec-2",
      streamUri: "rtsp://1.1.1.51/live",
    });

    const metricsBefore = coordinator.getFailoverMetrics();
    expect(metricsBefore.totalNodes).toBe(3);
    expect(metricsBefore.activeNodes).toBe(2);
    expect(metricsBefore.standbyNodes).toBe(1);
    expect(metricsBefore.totalAssignedStreams).toBe(2);
    expect(metricsBefore.failedOverStreams).toBe(0);
    expect(metricsBefore.streamContinuityPercent).toBe(100);

    // Failover rec-1
    await coordinator.executeFailover("rec-1", "MANUAL_FAILOVER");

    const metricsAfter = coordinator.getFailoverMetrics();
    expect(metricsAfter.totalFailovers).toBe(1);
    expect(metricsAfter.failedOverStreams).toBe(1);
    expect(metricsAfter.streamContinuityPercent).toBe(50);
  });
});
