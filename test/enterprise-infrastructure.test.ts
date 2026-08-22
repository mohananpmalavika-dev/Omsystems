import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";
import {
  buildInfrastructureGraph,
  buildInfrastructureHealthSnapshot,
  getCameraInfrastructurePath,
} from "../src/infrastructure/enterprise-monitoring.js";

const admin = { "x-user-id": "user-global-admin" };

describe("enterprise branch infrastructure operations", () => {
  let app: FastifyInstance;
  let store: MemoryStore;
  let agentId: string;

  beforeEach(async () => {
    store = new MemoryStore();
    agentId = (await store.registerEdgeAgent("branch-blr-001", "Branch gateway", "1.0.0")).id;
    const camera = store.cameras.get("cam-001")!;
    camera.sourceType = "analog-dvr-channel";
    camera.recorderId = "dvr-01";
    camera.recorderChannel = 1;
    app = await buildApp({ store });
  });

  afterEach(async () => app.close());

  it("accepts edge-collected SNMP, Modbus and BACnet evidence and keeps unknown domains explicit", async () => {
    await report("switch", "switch-01", "snmp", {
      name: "Branch PoE switch", status: "online", healthScore: 96,
      upstreamDeviceId: "firewall-01", powerSourceId: "ups-01",
    });
    await report("firewall", "firewall-01", "snmp", {
      name: "Branch firewall", status: "online", healthScore: 92,
      upstreamDeviceId: "wan-primary",
    });
    await report("network", "wan-primary", "system", {
      name: "Primary WAN", status: "online", healthScore: 94,
    });
    await report("ups", "ups-01", "modbus", {
      name: "Main UPS", status: "online", healthScore: 88, batteryHealthPercent: 54,
      predictedReplacementDays: 21,
    });
    await report("environment", "server-room-sensor", "bacnet", {
      name: "Server room sensor", status: "healthy", healthScore: 98, temperatureCelsius: 24,
    });
    await report("recorder", "dvr-01", "vendor-api", {
      name: "Analog DVR", status: "online", healthScore: 91, upstreamDeviceId: "switch-01",
    });
    await report("camera", "cam-001", "rtsp", {
      name: "Entrance analog camera", status: "online", healthScore: 97,
    });
    await report("disk", "dvr-01:disk:1", "vendor-api", {
      name: "DVR disk 1", status: "failure_predicted", failureProbability: 82,
      predictedFailureDays: 5, recorderId: "dvr-01",
    });

    const health = await app.inject({
      method: "GET", url: "/v1/infrastructure/health/branch-blr-001", headers: admin,
    });
    expect(health.statusCode).toBe(200);
    expect(health.json().data).toMatchObject({
      branchId: "branch-blr-001",
      overallStatus: "critical",
      evidenceCoveragePercent: 85,
      domains: {
        power: { status: "warning", score: 88 },
        network: { status: "healthy" },
        storage: { status: "critical" },
        cooling: { status: "healthy", score: 98 },
        security: { status: "healthy", score: 92 },
        surveillance: { status: "warning" },
        compute: { status: "unknown", score: null },
      },
    });

    const predictions = await app.inject({
      method: "GET", url: "/v1/infrastructure/predicted-failures/branch-blr-001", headers: admin,
    });
    expect(predictions.statusCode).toBe(200);
    expect(predictions.json().data).toEqual(expect.arrayContaining([
      expect.objectContaining({ failureType: "disk_failure", componentId: "dvr-01:disk:1", daysUntilFailure: 5 }),
      expect.objectContaining({ failureType: "ups_battery", componentId: "ups-01", daysUntilFailure: 21 }),
    ]));
  });

  it("builds an evidence-proven dependency path for an analog camera behind a DVR", async () => {
    await report("recorder", "dvr-01", "vendor-api", {
      name: "Analog DVR", status: "online", upstreamDeviceId: "switch-01",
    });
    await report("switch", "switch-01", "snmp", {
      name: "PoE switch", status: "online", upstreamDeviceId: "firewall-01", powerSourceId: "ups-01",
    });
    await report("firewall", "firewall-01", "snmp", {
      name: "Firewall", status: "online", upstreamDeviceId: "wan-primary",
    });
    await report("network", "wan-primary", "system", { name: "WAN", status: "online" });
    await report("ups", "ups-01", "modbus", { name: "UPS", status: "online" });

    const response = await app.inject({
      method: "GET", url: "/v1/infrastructure/rca/camera/cam-001/infrastructure-path", headers: admin,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.map((node: { deviceId: string }) => node.deviceId)).toEqual([
      "cam-001", "dvr-01", "switch-01", "firewall-01", "ups-01", "wan-primary",
    ]);
    // The seeded second camera is intentionally unmapped, so coverage exposes
    // that inventory gap instead of presenting a false 100% topology claim.
    expect(response.json().graphCoverage).toBe(85.7);
  });

  it("does not invent health or dependency links when evidence is absent", async () => {
    const branch = await store.getNode("branch-blr-001");
    const camera = await store.getCamera("cam-001");
    const snapshot = buildInfrastructureHealthSnapshot({ branch: branch!, cameras: [camera!], telemetry: [] });
    expect(snapshot.overallScore).toBeNull();
    expect(snapshot.overallStatus).toBe("unknown");
    expect(snapshot.evidenceCoveragePercent).toBe(0);

    camera!.recorderId = undefined;
    const graph = buildInfrastructureGraph({ branchId: branch!.id, cameras: [camera!], telemetry: [] });
    expect(graph.mappingCoveragePercent).toBe(0);
    expect(getCameraInfrastructurePath(graph, camera!.id).map((node) => node.deviceId)).toEqual(["cam-001"]);
  });

  it("keeps common local device IDs isolated between branches", async () => {
    const observedAt = new Date().toISOString();
    for (const branchId of ["branch-blr-001", "branch-del-001"]) {
      await store.ingestOperationalTelemetry({
        tenantId: "omsystems", branchId, edgeAgentId: agentId,
        deviceType: "ups", deviceId: "ups-01", observedAt, receivedAt: observedAt,
        source: "modbus", quality: "verified", idempotencyKey: `${branchId}:ups-01`,
        metrics: { status: "online" }, reasonCodes: [],
      });
    }
    const latest = await store.listLatestOperationalTelemetry("omsystems");
    expect(latest.filter((item) => item.deviceType === "ups" && item.deviceId === "ups-01"))
      .toHaveLength(2);
  });

  async function report(
    deviceType: string,
    deviceId: string,
    source: string,
    metrics: Record<string, string | number | boolean | null>,
  ) {
    const observedAt = new Date().toISOString();
    const response = await app.inject({
      method: "POST",
      url: `/v1/edge-agents/${agentId}/telemetry`,
      headers: admin,
      payload: {
        branchId: "branch-blr-001", edgeAgentId: agentId, deviceType, deviceId,
        observedAt, source, quality: "verified",
        idempotencyKey: `${deviceType}:${deviceId}:${Math.random()}`,
        metrics, reasonCodes: [],
      },
    });
    expect(response.statusCode).toBe(202);
  }
});
