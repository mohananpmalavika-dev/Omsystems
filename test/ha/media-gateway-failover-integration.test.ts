import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { MediaGatewayFailoverService } from "../../src/ha/services/media-gateway-failover.service.js";
import { registerMediaGatewayFailoverRoutes } from "../../src/routes/media-gateway-failover.routes.js";

describe("Production-Ready Automatic Media Gateway Failover Integration Suite", () => {
  let app: FastifyInstance;
  let service: MediaGatewayFailoverService;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    service = new MediaGatewayFailoverService(undefined as any); // in-memory for isolated suite
    await registerMediaGatewayFailoverRoutes(app, { service });
    await app.ready();
  });

  afterEach(async () => {
    service.stopWatchdog();
    await app.close();
  });

  it("supports full lifecycle of gateway registration and heartbeat telemetry via HTTP", async () => {
    // 1. Register Gateway 1
    const regRes = await app.inject({
      method: "POST",
      url: "/api/v1/ha/media-gateways/register",
      payload: {
        gatewayId: "media-gw-edge-01",
        gatewayName: "Edge Gateway 01",
        ipAddress: "192.168.10.1",
        port: 8554,
        apiPort: 9997,
        region: "ap-south-1",
        maxStreams: 150,
      },
    });

    expect(regRes.statusCode).toBe(201);
    const regBody = regRes.json();
    expect(regBody.success).toBe(true);
    expect(regBody.data.gatewayId).toBe("media-gw-edge-01");
    expect(regBody.data.status).toBe("HEALTHY");

    // 2. Ingest Heartbeat
    const hbRes = await app.inject({
      method: "POST",
      url: "/api/v1/ha/media-gateways/heartbeat",
      payload: {
        gatewayId: "media-gw-edge-01",
        ipAddress: "192.168.10.1",
        cpuPercent: 32.4,
        memoryPercent: 48.1,
        networkInMbps: 240,
        networkOutMbps: 250,
        activeStreams: 20,
      },
    });

    expect(hbRes.statusCode).toBe(200);
    const hbBody = hbRes.json();
    expect(hbBody.data.cpuPercent).toBe(32.4);
    expect(hbBody.data.activeStreams).toBe(20);

    // 3. List Gateways
    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/ha/media-gateways",
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = listRes.json();
    expect(listBody.data.length).toBe(1);
    expect(listBody.data[0].gatewayId).toBe("media-gw-edge-01");
  });

  it("routes camera streams and supports manual stream redirection", async () => {
    // Register two nodes
    await app.inject({
      method: "POST",
      url: "/api/v1/ha/media-gateways/register",
      payload: { gatewayId: "node-a", gatewayName: "Node A", ipAddress: "10.0.1.10" },
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/ha/media-gateways/register",
      payload: { gatewayId: "node-b", gatewayName: "Node B", ipAddress: "10.0.1.20" },
    });

    // Route a camera stream
    const routeRes = await app.inject({
      method: "POST",
      url: "/api/v1/ha/media-gateways/streams/route",
      payload: {
        cameraId: "cam-lobby-4k",
        streamProfile: "main",
        sourceUri: "rtsp://10.0.1.5:554/ch0",
        preferredGatewayId: "node-a",
      },
    });

    expect(routeRes.statusCode).toBe(201);
    const route = routeRes.json().data;
    expect(route.assignedGatewayId).toBe("node-a");
    expect(route.fencingToken).toBe(1);

    // Query streams list
    const streamsRes = await app.inject({
      method: "GET",
      url: "/api/v1/ha/media-gateways/streams",
    });
    expect(streamsRes.statusCode).toBe(200);
    expect(streamsRes.json().data.length).toBe(1);

    // Manually redirect stream to Node B
    const redirectRes = await app.inject({
      method: "POST",
      url: "/api/v1/ha/media-gateways/streams/cam-lobby-4k/redirect",
      payload: {
        targetGatewayId: "node-b",
        streamProfile: "main",
      },
    });

    expect(redirectRes.statusCode).toBe(200);
    const redirected = redirectRes.json().data;
    expect(redirected.assignedGatewayId).toBe("node-b");
    expect(redirected.standbyGatewayId).toBe("node-a");
    expect(redirected.fencingToken).toBe(2);
    expect(redirected.redirectUrl).toContain("10.0.1.20:8554");
  });

  it("executes simulated node failover drill, redirecting all affected streams within SLA", async () => {
    // 1. Setup 3 nodes: Alpha, Beta, Gamma
    for (const id of ["alpha", "beta", "gamma"]) {
      await app.inject({
        method: "POST",
        url: "/api/v1/ha/media-gateways/register",
        payload: {
          gatewayId: `gw-${id}`,
          gatewayName: `Gateway ${id.toUpperCase()}`,
          ipAddress: `10.0.0.${id === "alpha" ? 1 : id === "beta" ? 2 : 3}`,
          maxStreams: 20,
        },
      });
    }

    // 2. Provision 6 streams on Alpha
    for (let i = 1; i <= 6; i++) {
      await app.inject({
        method: "POST",
        url: "/api/v1/ha/media-gateways/streams/route",
        payload: {
          cameraId: `cam-vault-${i}`,
          streamProfile: "main",
          sourceUri: `rtsp://camera-${i}:554/live`,
          preferredGatewayId: "gw-alpha",
        },
      });
    }

    // Verify all 6 are on gw-alpha
    expect(service.getNode("gw-alpha")?.activeStreams).toBe(6);

    // 3. Trigger immediate failover of gw-alpha
    const failoverRes = await app.inject({
      method: "POST",
      url: "/api/v1/ha/media-gateways/gw-alpha/failover",
      payload: {
        reason: "CHAOS_DRILL_POWER_CUT",
        triggeredBy: "CHAOS_RUNNER",
      },
    });

    expect(failoverRes.statusCode).toBe(200);
    const result = failoverRes.json().data;
    expect(result.success).toBe(true);
    expect(result.affectedStreams).toBe(6);
    expect(result.redirectedStreams).toBe(6);
    expect(result.failedRedirects).toBe(0);
    expect(result.rtoMs).toBeLessThanOrEqual(3000); // Strict SLA: RTO <= 3s

    // 4. Verify gw-alpha status is FAILED and active streams = 0
    expect(service.getNode("gw-alpha")?.status).toBe("FAILED");
    expect(service.getNode("gw-alpha")?.activeStreams).toBe(0);

    // 5. Verify streams were distributed across beta and gamma
    const betaStreams = service.getNode("gw-beta")?.activeStreams || 0;
    const gammaStreams = service.getNode("gw-gamma")?.activeStreams || 0;
    expect(betaStreams + gammaStreams).toBe(6);
    expect(betaStreams).toBeGreaterThan(0);
    expect(gammaStreams).toBeGreaterThan(0);

    // 6. Verify fencing tokens incremented to prevent split-brain
    for (let i = 1; i <= 6; i++) {
      const r = service.getRoute(`cam-vault-${i}`);
      expect(r?.fencingToken).toBe(2);
      expect(r?.status).toBe("FAILED_OVER");
      expect(r?.assignedGatewayId).not.toBe("gw-alpha");
    }

    // 7. Verify Metrics and Events
    const metricsRes = await app.inject({
      method: "GET",
      url: "/api/v1/ha/media-gateways/metrics",
    });
    expect(metricsRes.statusCode).toBe(200);
    const metrics = metricsRes.json().data;
    expect(metrics.failedGateways).toBe(1);
    expect(metrics.healthyGateways).toBe(2);
    expect(metrics.totalFailoversToday).toBe(1);
    expect(metrics.streamContinuityPercent).toBe(100);

    const eventsRes = await app.inject({
      method: "GET",
      url: "/api/v1/ha/media-gateways/events",
    });
    expect(eventsRes.statusCode).toBe(200);
    const events = eventsRes.json().data;
    expect(events.length).toBeGreaterThanOrEqual(2); // initiated + completed
  });

  it("updates failover policy and executes on-demand cluster health probe", async () => {
    // 1. Get initial policy
    const policyGet = await app.inject({
      method: "GET",
      url: "/api/v1/ha/media-gateways/policy",
    });
    expect(policyGet.statusCode).toBe(200);
    expect(policyGet.json().data.heartbeatTimeoutMs).toBe(5000);

    // 2. Update policy
    const policyPut = await app.inject({
      method: "PUT",
      url: "/api/v1/ha/media-gateways/policy",
      payload: {
        heartbeatTimeoutMs: 3500,
        maxLoadPercent: 90,
      },
    });
    expect(policyPut.statusCode).toBe(200);
    expect(policyPut.json().data.heartbeatTimeoutMs).toBe(3500);
    expect(policyPut.json().data.maxLoadPercent).toBe(90);

    // 3. Trigger on-demand probe
    const probeRes = await app.inject({
      method: "POST",
      url: "/api/v1/ha/media-gateways/probe",
    });
    expect(probeRes.statusCode).toBe(200);
    expect(probeRes.json().data.metrics).toBeDefined();
    expect(probeRes.json().data.nodes).toBeDefined();
  });
});
