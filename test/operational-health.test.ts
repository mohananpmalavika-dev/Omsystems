import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";
import { telemetryStatus, verifyContinuousRetention } from "../src/operational-health/service.js";
import { defaultOperationalHealthPolicy } from "../src/operational-health/types.js";

const admin = { "x-user-id": "user-global-admin" };

describe("Phase 1 operational health", () => {
  let app: FastifyInstance;
  let store: MemoryStore;
  let agentId: string;

  beforeEach(async () => {
    store = new MemoryStore();
    const agent = await store.registerEdgeAgent("branch-blr-001", "Pilot edge", "1.0.0");
    agentId = agent.id;
    app = await buildApp({ store });
  });

  afterEach(async () => app.close());

  it("ingests an idempotent normalized camera envelope and projects it", async () => {
    const payload = {
      branchId: "branch-blr-001",
      edgeAgentId: agentId,
      deviceType: "camera",
      deviceId: "cam-001",
      observedAt: new Date().toISOString(),
      source: "rtsp",
      quality: "verified",
      idempotencyKey: "pilot:cam-001:one",
      metrics: { status: "online", streamActive: true, responseTimeMs: 24 },
      reasonCodes: ["fps_unavailable"],
    };
    const accepted = await app.inject({
      method: "POST", url: `/v1/edge-agents/${agentId}/telemetry`, headers: admin, payload,
    });
    expect(accepted.statusCode).toBe(202);
    expect(accepted.json().duplicate).toBe(false);

    const duplicate = await app.inject({
      method: "POST", url: `/v1/edge-agents/${agentId}/telemetry`, headers: admin, payload,
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().duplicate).toBe(true);

    const cameras = await app.inject({
      method: "GET", url: "/v1/operations/health/cameras?branchId=branch-blr-001", headers: admin,
    });
    expect(cameras.statusCode).toBe(200);
    const camera = cameras.json().data.cameras.find((item: { id: string }) => item.id === "cam-001");
    expect(camera.onlineStatus).toBe("online");
    expect(camera.currentFps).toBeNull();
    expect(camera.reasonCodes).toContain("fps_unavailable");
  });

  it("rejects an edge agent reporting outside its registered branch", async () => {
    const response = await app.inject({
      method: "POST", url: `/v1/edge-agents/${agentId}/telemetry`, headers: admin,
      payload: {
        branchId: "other-branch", edgeAgentId: agentId,
        deviceType: "network", deviceId: "internet", observedAt: new Date().toISOString(),
        source: "system", quality: "verified", idempotencyKey: "wrong-scope",
        metrics: { status: "online" }, reasonCodes: [],
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it("returns paginated branches and preserves unknown components", async () => {
    const response = await app.inject({
      method: "GET", url: "/v1/operations/health/branches?limit=1&offset=0", headers: admin,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.total).toBe(1);
    expect(response.json().data.branches[0].healthStatus).toBe("unknown");
    expect(response.json().data.branches[0].unknownComponents).toContain("storage");
  });

  it("persists tenant policy defaults and branch overrides", async () => {
    const policy = { ...defaultOperationalHealthPolicy, retentionDays: 120 };
    const saved = await app.inject({
      method: "PUT", url: "/v1/operations/health/policy", headers: admin,
      payload: { policy },
    });
    expect(saved.statusCode).toBe(200);

    const inherited = await app.inject({
      method: "GET", url: "/v1/operations/health/policy?branchId=branch-blr-001", headers: admin,
    });
    expect(inherited.json().data.retentionDays).toBe(120);

    const overridden = await app.inject({
      method: "PUT", url: "/v1/operations/health/policy", headers: admin,
      payload: { branchId: "branch-blr-001", policy: { ...policy, retentionDays: 180 } },
    });
    expect(overridden.statusCode).toBe(200);
    const effective = await app.inject({
      method: "GET", url: "/v1/operations/health/policy?branchId=branch-blr-001", headers: admin,
    });
    expect(effective.json().data.retentionDays).toBe(180);
  });
});

describe("operational health evidence rules", () => {
  it("does not convert unavailable or stale telemetry to healthy", () => {
    const base = {
      tenantId: "tenant", branchId: "branch", edgeAgentId: "agent",
      deviceType: "camera" as const, deviceId: "camera", receivedAt: "2026-07-28T00:00:00.000Z",
      source: "rtsp" as const, idempotencyKey: "one", metrics: { status: "online" }, reasonCodes: [],
    };
    expect(telemetryStatus({ ...base, observedAt: "2026-07-28T00:00:00.000Z", quality: "unavailable" }, defaultOperationalHealthPolicy, Date.parse("2026-07-28T00:00:10.000Z"))).toBe("unknown");
    expect(telemetryStatus({ ...base, observedAt: "2026-07-27T23:50:00.000Z", quality: "verified" }, defaultOperationalHealthPolicy, Date.parse("2026-07-28T00:00:00.000Z"))).toBe("critical");
  });

  it("marks continuous playable footage below policy as a breach", () => {
    const verification = verifyContinuousRetention("camera", [
      segment("2026-07-27T00:00:00.000Z", "2026-07-28T00:00:00.000Z", "one"),
      segment("2026-07-26T00:00:00.000Z", "2026-07-27T00:00:00.000Z", "two"),
    ], { retentionDays: 3, maxRecordingGapSeconds: 120 }, Date.parse("2026-07-28T00:00:30.000Z"));
    expect(verification.status).toBe("breach");
    expect(verification.actualDays).toBe(2);
    expect(verification.reasonCodes).toContain("retention_below_policy");
  });
});

function segment(startedAt: string, endedAt: string, id: string) {
  return {
    id, cameraId: "camera", jobId: "job", startedAt, endedAt,
    storagePath: id, sizeBytes: 1, storageNodeExternalId: "node",
    storageTier: "hot" as const, status: "ready" as const, createdAt: startedAt,
  };
}
