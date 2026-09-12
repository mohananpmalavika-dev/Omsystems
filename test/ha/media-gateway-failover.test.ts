import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  MediaGatewayFailoverService,
  type MediaGatewayNode,
  type MediaStreamRoute,
} from "../../src/ha/services/media-gateway-failover.service.js";

describe("Production-Ready Automatic Media Gateway Failover Unit Suite", () => {
  let service: MediaGatewayFailoverService;

  beforeEach(() => {
    service = new MediaGatewayFailoverService(undefined as any); // Pure in-memory mode for unit tests
  });

  afterEach(() => {
    service.stopWatchdog();
  });

  it("registers media gateway nodes and ingests real-time heartbeat telemetry", async () => {
    const node = await service.registerGateway({
      gatewayId: "media-gw-alpha",
      gatewayName: "Gateway Alpha",
      ipAddress: "10.10.1.10",
      port: 8554,
      apiPort: 9997,
      maxStreams: 100,
      maxNetworkMbps: 1000,
    });

    expect(node.gatewayId).toBe("media-gw-alpha");
    expect(node.status).toBe("HEALTHY");
    expect(node.activeStreams).toBe(0);

    // Ingest heartbeat
    const hbResult = await service.processHeartbeat({
      gatewayId: "media-gw-alpha",
      gatewayName: "Gateway Alpha",
      ipAddress: "10.10.1.10",
      cpuPercent: 25.5,
      memoryPercent: 40.2,
      networkInMbps: 120,
      networkOutMbps: 140,
      activeStreams: 15,
    });

    expect(hbResult.success).toBe(true);
    expect(hbResult.node.cpuPercent).toBe(25.5);
    expect(hbResult.node.memoryPercent).toBe(40.2);
    expect(hbResult.node.currentNetworkMbps).toBe(260);
    expect(hbResult.node.activeStreams).toBe(15);
  });

  it("provisions and routes camera streams to the optimal healthy media gateway", async () => {
    await service.registerGateway({
      gatewayId: "gw-1",
      gatewayName: "Gateway 1",
      ipAddress: "10.0.1.1",
      port: 8554,
      maxStreams: 100,
      maxNetworkMbps: 1000,
    });

    await service.registerGateway({
      gatewayId: "gw-2",
      gatewayName: "Gateway 2",
      ipAddress: "10.0.1.2",
      port: 8554,
      maxStreams: 100,
      maxNetworkMbps: 1000,
    });

    const route = await service.routeStream({
      cameraId: "cam-vault-01",
      streamProfile: "main",
      sourceUri: "rtsp://192.168.1.50:554/live",
      bitrateKbps: 4096,
      fps: 30,
    });

    expect(route.cameraId).toBe("cam-vault-01");
    expect(route.streamProfile).toBe("main");
    expect(route.assignedGatewayId).toBeDefined();
    expect(route.status).toBe("ACTIVE");
    expect(route.fencingToken).toBe(1);
    expect(route.redirectUrl).toContain(route.assignedGatewayId === "gw-1" ? "10.0.1.1:8554" : "10.0.1.2:8554");
  });

  it("automatically detects node failure via watchdog and seamlessly redirects streams to healthy standby with incremented fencing epoch", async () => {
    // 1. Setup two gateways
    const gw1 = await service.registerGateway({
      gatewayId: "gw-primary",
      gatewayName: "Primary Gateway",
      ipAddress: "10.0.0.1",
      port: 8554,
      maxStreams: 50,
      maxNetworkMbps: 1000,
    });

    const gw2 = await service.registerGateway({
      gatewayId: "gw-standby",
      gatewayName: "Standby Gateway",
      ipAddress: "10.0.0.2",
      port: 8554,
      maxStreams: 50,
      maxNetworkMbps: 1000,
    });

    // 2. Route stream explicitly to primary
    const route = await service.routeStream({
      cameraId: "cam-teller-01",
      streamProfile: "main",
      sourceUri: "rtsp://192.168.1.10:554/live",
      preferredGatewayId: "gw-primary",
    });
    expect(route.assignedGatewayId).toBe("gw-primary");
    expect(route.fencingToken).toBe(1);

    // 3. Simulate Primary Gateway stopping heartbeats (> timeout)
    await service.updatePolicy({ heartbeatTimeoutMs: 3000 });
    gw1.lastHeartbeatAt = new Date(Date.now() - 5000).toISOString();

    // 4. Run Watchdog Cycle
    const cycle = await service.runWatchdogCycle();
    expect(cycle.detectedFailures).toContain("gw-primary");
    expect(cycle.failoversExecuted).toBe(1);

    // 5. Verify gw1 is marked FAILED
    expect(service.getNode("gw-primary")?.status).toBe("FAILED");

    // 6. Verify stream is redirected to gw2 with incremented fencing token
    const updatedRoute = service.getRoute("cam-teller-01", "main");
    expect(updatedRoute).toBeDefined();
    expect(updatedRoute?.assignedGatewayId).toBe("gw-standby");
    expect(updatedRoute?.standbyGatewayId).toBe("gw-primary");
    expect(updatedRoute?.status).toBe("FAILED_OVER");
    expect(updatedRoute?.fencingToken).toBe(2); // Monotonic split-brain fencing increment!
    expect(updatedRoute?.redirectUrl).toContain("10.0.0.2:8554");
    expect(updatedRoute?.failoverCount).toBe(1);

    // 7. Verify SLA and Failover Event
    const events = service.getEvents();
    expect(events.length).toBeGreaterThan(0);
    const completedEvent = events.find((e) => e.eventType === "FAILOVER_COMPLETED");
    expect(completedEvent).toBeDefined();
    expect(completedEvent?.failedGatewayId).toBe("gw-primary");
    expect(completedEvent?.affectedStreams).toBe(1);
    expect(completedEvent?.redirectedStreams).toBe(1);
    expect(completedEvent?.rtoMs).toBeGreaterThanOrEqual(0);
  });

  it("gracefully drains a gateway instance for maintenance, evacuating all active streams", async () => {
    await service.registerGateway({
      gatewayId: "gw-drain-target",
      gatewayName: "Active Node 1",
      ipAddress: "10.0.2.1",
      port: 8554,
      maxStreams: 50,
      maxNetworkMbps: 1000,
    });

    await service.registerGateway({
      gatewayId: "gw-drain-receiver",
      gatewayName: "Active Node 2",
      ipAddress: "10.0.2.2",
      port: 8554,
      maxStreams: 50,
      maxNetworkMbps: 1000,
    });

    // Assign 3 streams to gw-drain-target
    await service.routeStream({ cameraId: "cam-1", sourceUri: "rtsp://cam1", preferredGatewayId: "gw-drain-target" });
    await service.routeStream({ cameraId: "cam-2", sourceUri: "rtsp://cam2", preferredGatewayId: "gw-drain-target" });
    await service.routeStream({ cameraId: "cam-3", sourceUri: "rtsp://cam3", preferredGatewayId: "gw-drain-target" });

    expect(service.getNode("gw-drain-target")?.activeStreams).toBe(3);

    // Drain the node
    const drainResult = await service.drainGateway("gw-drain-target", "SCHEDULED_OS_UPDATE");
    expect(drainResult.success).toBe(true);
    expect(drainResult.drainedStreams).toBe(3);
    expect(drainResult.failedRedirects).toBe(0);

    // Node is now evacuated and OFFLINE
    expect(service.getNode("gw-drain-target")?.status).toBe("OFFLINE");
    expect(service.getNode("gw-drain-target")?.activeStreams).toBe(0);

    // Receiver node has inherited the 3 streams
    expect(service.getNode("gw-drain-receiver")?.activeStreams).toBe(3);
    expect(service.getRoute("cam-1")?.assignedGatewayId).toBe("gw-drain-receiver");
    expect(service.getRoute("cam-2")?.assignedGatewayId).toBe("gw-drain-receiver");
    expect(service.getRoute("cam-3")?.assignedGatewayId).toBe("gw-drain-receiver");
  });

  it("handles node recovery and enforces flap dampening stabilization", async () => {
    await service.updatePolicy({ flapDampingSeconds: 2 });

    const node = await service.registerGateway({
      gatewayId: "gw-flapping",
      gatewayName: "Flapping Node",
      ipAddress: "10.0.3.1",
      port: 8554,
    });

    // Mark as failed
    node.status = "FAILED";

    // 1. Send first heartbeat after crash -> node enters DEGRADED (stabilizing)
    const hb1 = await service.processHeartbeat({
      gatewayId: "gw-flapping",
      ipAddress: "10.0.3.1",
      cpuPercent: 10,
      memoryPercent: 20,
      networkInMbps: 0,
      networkOutMbps: 0,
      activeStreams: 0,
    });
    expect(hb1.node.status).toBe("DEGRADED"); // In flap damping quiet window

    // 2. Wait for flap damping period to elapse
    await new Promise((resolve) => setTimeout(resolve, 2100));

    // 3. Send next heartbeat -> node recovers to HEALTHY
    const hb2 = await service.processHeartbeat({
      gatewayId: "gw-flapping",
      ipAddress: "10.0.3.1",
      cpuPercent: 10,
      memoryPercent: 20,
      networkInMbps: 0,
      networkOutMbps: 0,
      activeStreams: 0,
    });
    expect(hb2.node.status).toBe("HEALTHY");

    const events = service.getEvents();
    const recoveryEvt = events.find((e) => e.eventType === "GATEWAY_RECOVERED");
    expect(recoveryEvt).toBeDefined();
    expect(recoveryEvt?.failedGatewayId).toBe("gw-flapping");
  });

  it("computes accurate SLA metrics and telemetry", async () => {
    await service.registerGateway({
      gatewayId: "gw-metrics-1",
      gatewayName: "M1",
      ipAddress: "10.0.4.1",
      maxStreams: 100,
    });
    await service.registerGateway({
      gatewayId: "gw-metrics-2",
      gatewayName: "M2",
      ipAddress: "10.0.4.2",
      maxStreams: 100,
    });

    const metrics = service.getMetrics();
    expect(metrics.totalGateways).toBe(2);
    expect(metrics.healthyGateways).toBe(2);
    expect(metrics.totalCapacityStreams).toBe(200);
    expect(metrics.clusterHeadroomPercent).toBe(100);
    expect(metrics.streamContinuityPercent).toBe(100.0);
  });
});
