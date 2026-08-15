import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

const admin = { "x-user-id": "user-global-admin" };

describe("live security operations posture", () => {
  let app: FastifyInstance;
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore();
    app = await buildApp({ store });
  });

  afterEach(async () => {
    await app.close();
  });

  it("requires an authenticated tenant context", async () => {
    const response = await app.inject({ method: "GET", url: "/api/security/posture" });
    expect(response.statusCode).toBe(401);
  });

  it("returns current tenant-scoped operational evidence instead of a synthetic unavailable posture", async () => {
    const agent = await store.registerEdgeAgent("branch-blr-001", "Security edge", "1.0.0");
    await store.upsertRecordingStorageNode({
      tenantId: "omsystems",
      externalId: "security-storage-01",
      name: "Security Storage 01",
      supportedTiers: ["hot"],
      capacityBytes: 1_000_000,
      usedBytes: 250_000,
      availableBytes: 750_000,
      status: "healthy",
    });

    const telemetry = await app.inject({
      method: "POST",
      url: `/v1/edge-agents/${agent.id}/telemetry`,
      headers: admin,
      payload: {
        branchId: "branch-blr-001",
        edgeAgentId: agent.id,
        deviceType: "edge-agent",
        deviceId: agent.id,
        observedAt: new Date().toISOString(),
        source: "system",
        quality: "verified",
        idempotencyKey: "security-operations-live-posture",
        metrics: { status: "online" },
        reasonCodes: [],
      },
    });
    expect(telemetry.statusCode).toBe(202);

    const response = await app.inject({
      method: "GET",
      url: "/api/security/posture",
      headers: admin,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      available: true,
      provenance: "LIVE",
      summary: {
        branchCount: 1,
        telemetryConnected: true,
      },
      operations: {
        cameras: { total: expect.any(Number), online: expect.any(Number) },
        edgeAgents: { total: 1 },
        storage: { total: 1, healthy: 1, impaired: 0, health: 100 },
      },
    });
    expect(response.json().evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "secure-boot", state: "unknown" }),
      expect.objectContaining({ id: "tpm", state: "unknown" }),
      expect.objectContaining({ id: "ransomware", state: "unknown" }),
      expect.objectContaining({ id: "tamper", state: "unknown" }),
    ]));
  });
});
