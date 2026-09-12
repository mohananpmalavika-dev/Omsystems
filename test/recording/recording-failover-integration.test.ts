import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { RecordingNodeRegistry } from "../../src/recording/failover/recording-node-registry.js";
import { RecordingFailoverCoordinator } from "../../src/recording/failover/recording-failover-coordinator.service.js";
import { registerRecordingFailoverRoutes } from "../../src/routes/recording-failover.routes.js";

describe("Recording Engine N+1 Failover Fastify Integration Suite", () => {
  let app: FastifyInstance;
  let registry: RecordingNodeRegistry;
  let coordinator: RecordingFailoverCoordinator;

  beforeEach(async () => {
    registry = new RecordingNodeRegistry(undefined as any);
    coordinator = new RecordingFailoverCoordinator(
      undefined as any,
      registry,
      undefined,
      {
        heartbeatTimeoutMs: 4000,
        detectionIntervalMs: 1000,
        enableAutoFailover: true,
      },
    );

    app = Fastify({ logger: false });
    await registerRecordingFailoverRoutes(app, { coordinator, registry });
    await app.ready();
  });

  afterEach(async () => {
    coordinator.stopLivenessMonitoring();
    await app.close();
  });

  it("completes full lifecycle: node registration, heartbeat ingest, stream assignment, automated failover, and failback", async () => {
    // 1. Register Active Node via API
    const regActiveRes = await app.inject({
      method: "POST",
      url: "/api/v1/recording/failover/nodes",
      payload: {
        id: "rec-node-hq-01",
        name: "HQ Primary Recorder 01",
        host: "10.0.1.10",
        port: 8085,
        role: "ACTIVE",
        maxStreamCapacity: 128,
      },
    });

    expect(regActiveRes.statusCode).toBe(201);
    const activeData = regActiveRes.json().data;
    expect(activeData.id).toBe("rec-node-hq-01");
    expect(activeData.role).toBe("ACTIVE");
    expect(activeData.state).toBe("HEALTHY");

    // 2. Register Standby Node via API
    const regStandbyRes = await app.inject({
      method: "POST",
      url: "/api/v1/recording/failover/nodes",
      payload: {
        id: "rec-node-standby-01",
        name: "HQ Hot Standby 01",
        host: "10.0.1.99",
        port: 8085,
        role: "STANDBY",
        maxStreamCapacity: 128,
      },
    });

    expect(regStandbyRes.statusCode).toBe(201);
    expect(regStandbyRes.json().data.role).toBe("STANDBY");

    // 3. Ingest periodic heartbeats
    const hbRes = await app.inject({
      method: "POST",
      url: "/api/v1/recording/failover/nodes/rec-node-hq-01/heartbeat",
      payload: {
        cpuPercent: 28.5,
        memoryPercent: 42.0,
        diskWriteMbps: 65.4,
      },
    });

    expect(hbRes.statusCode).toBe(200);
    expect(hbRes.json().data.cpuPercent).toBe(28.5);

    // 4. Assign camera stream ingest
    const camId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const assignRes = await app.inject({
      method: "POST",
      url: "/api/v1/recording/failover/assignments",
      payload: {
        cameraId: camId,
        primaryNodeId: "rec-node-hq-01",
        streamUri: "rtsp://10.0.1.50:554/live",
        streamProfile: "main",
      },
    });

    expect(assignRes.statusCode).toBe(201);
    expect(assignRes.json().data.primaryNodeId).toBe("rec-node-hq-01");
    expect(assignRes.json().data.currentNodeId).toBe("rec-node-hq-01");
    expect(assignRes.json().data.status).toBe("ACTIVE");

    // 5. Query assignments
    const listAssignRes = await app.inject({
      method: "GET",
      url: "/api/v1/recording/failover/assignments",
    });
    expect(listAssignRes.statusCode).toBe(200);
    expect(listAssignRes.json().data.length).toBe(1);

    // 6. Simulate active node crash by setting heartbeat timestamp to 10s ago
    registry.setNodeHeartbeatAt("rec-node-hq-01", new Date(Date.now() - 10000));

    // Keep standby node fresh
    await app.inject({
      method: "POST",
      url: "/api/v1/recording/failover/nodes/rec-node-standby-01/heartbeat",
      payload: { cpuPercent: 5 },
    });

    // 7. Probe liveness via API
    const probeRes = await app.inject({
      method: "POST",
      url: "/api/v1/recording/failover/check-liveness",
    });

    expect(probeRes.statusCode).toBe(200);
    const probeData = probeRes.json().data;
    expect(probeData.expiredNodes).toContain("rec-node-hq-01");
    expect(probeData.failoverResults.length).toBe(1);

    const failoverResult = probeData.failoverResults[0];
    expect(failoverResult.success).toBe(true);
    expect(failoverResult.failedNodeId).toBe("rec-node-hq-01");
    expect(failoverResult.standbyNodeId).toBe("rec-node-standby-01");
    expect(failoverResult.transferredCameras).toBe(1);

    // 8. Verify camera assignment switched to standby node
    const checkAssignmentRes = await app.inject({
      method: "GET",
      url: `/api/v1/recording/failover/assignments?cameraId=${camId}`,
    });
    const currentAssignment = checkAssignmentRes.json().data[0];
    expect(currentAssignment.currentNodeId).toBe("rec-node-standby-01");
    expect(currentAssignment.status).toBe("FAILED_OVER");
    expect(currentAssignment.takeoverEpoch).toBe(2);

    // 9. Verify failover audit events
    const eventsRes = await app.inject({
      method: "GET",
      url: "/api/v1/recording/failover/events",
    });
    expect(eventsRes.statusCode).toBe(200);
    const events = eventsRes.json().data;
    expect(events.length).toBe(1);
    expect(events[0].failedNodeId).toBe("rec-node-hq-01");
    expect(events[0].standbyNodeId).toBe("rec-node-standby-01");
    expect(events[0].status).toBe("COMPLETED");

    // 10. Verify cluster HA metrics
    const metricsRes = await app.inject({
      method: "GET",
      url: "/api/v1/recording/failover/metrics",
    });
    expect(metricsRes.statusCode).toBe(200);
    const metrics = metricsRes.json().data;
    expect(metrics.totalNodes).toBe(2);
    expect(metrics.totalFailovers).toBe(1);
    expect(metrics.failedOverStreams).toBe(1);

    // 11. Primary node recovers and sends fresh heartbeat
    await app.inject({
      method: "POST",
      url: "/api/v1/recording/failover/nodes/rec-node-hq-01/heartbeat",
      payload: { cpuPercent: 12 },
    });

    // 12. Execute graceful failback via API
    const failbackRes = await app.inject({
      method: "POST",
      url: "/api/v1/recording/failover/failback",
      payload: {
        primaryNodeId: "rec-node-hq-01",
        standbyNodeId: "rec-node-standby-01",
      },
    });

    expect(failbackRes.statusCode).toBe(200);
    const failbackData = failbackRes.json().data;
    expect(failbackData.success).toBe(true);
    expect(failbackData.restoredCameras).toBe(1);

    // Verify camera is restored to primary node
    const restoredAssignRes = await app.inject({
      method: "GET",
      url: `/api/v1/recording/failover/assignments?cameraId=${camId}`,
    });
    const restoredAssignment = restoredAssignRes.json().data[0];
    expect(restoredAssignment.currentNodeId).toBe("rec-node-hq-01");
    expect(restoredAssignment.status).toBe("ACTIVE");

    // 13. Verify failover event is now marked RECOVERED
    const recoveredEventsRes = await app.inject({
      method: "GET",
      url: "/api/v1/recording/failover/events",
    });
    expect(recoveredEventsRes.json().data[0].status).toBe("RECOVERED");
  });

  it("handles manual failover trigger and rejects failback when primary is still down", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v1/recording/failover/nodes",
      payload: { id: "rec-primary-02", name: "Primary 02", host: "10.0.2.1", role: "ACTIVE" },
    });

    await app.inject({
      method: "POST",
      url: "/api/v1/recording/failover/nodes",
      payload: { id: "rec-standby-02", name: "Standby 02", host: "10.0.2.9", role: "STANDBY" },
    });

    const camId = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
    await app.inject({
      method: "POST",
      url: "/api/v1/recording/failover/assignments",
      payload: {
        cameraId: camId,
        primaryNodeId: "rec-primary-02",
        streamUri: "rtsp://10.0.2.50/stream",
      },
    });

    // Manually trigger failover
    const triggerRes = await app.inject({
      method: "POST",
      url: "/api/v1/recording/failover/trigger",
      payload: {
        failedNodeId: "rec-primary-02",
        reason: "MANUAL_FAILOVER",
      },
    });

    expect(triggerRes.statusCode).toBe(200);
    expect(triggerRes.json().data.success).toBe(true);

    // Failback while primary is offline/expired
    await registry.updateNodeState("rec-primary-02", "OFFLINE");
    const badFailbackRes = await app.inject({
      method: "POST",
      url: "/api/v1/recording/failover/failback",
      payload: {
        primaryNodeId: "rec-primary-02",
        standbyNodeId: "rec-standby-02",
      },
    });

    expect(badFailbackRes.statusCode).toBe(400);
    expect(badFailbackRes.json().error).toBe("failback_execution_failed");
  });
});
