import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../../src/app.js";
import { MemoryStore } from "../../src/store.js";
import type { FastifyInstance } from "fastify";

const authHeaders = { "x-user-id": "user-global-admin" };

describe("Branch Command Center REST Routes", () => {
  let app: FastifyInstance;
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore();
    store.nodes.set("branch-178", {
      id: "branch-178",
      tenantId: "tenant-default",
      name: "Branch 178 — Aluva",
      code: "BR-178",
      type: "branch",
      parentId: "company-1",
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    app = await buildApp({ store });
  });

  it("GET /v1/branches/:branchId/operational-snapshot returns full snapshot", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/branches/branch-178/operational-snapshot",
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.data.branchId).toBe("branch-178");
    expect(json.data.branchName).toBe("Branch 178 — Aluva");
    expect(json.data.healthScore).toBeDefined();
    expect(json.data.cameras.total).toBe(16);
    expect(json.data.storage.disks.total).toBeGreaterThanOrEqual(1);
    expect(json.data.retention.requiredDays).toBe(90);
  });

  it("GET /v1/branches/:branchId/command-center/cameras supports operational filtering", async () => {
    const resAll = await app.inject({
      method: "GET",
      url: "/v1/branches/branch-178/command-center/cameras",
      headers: authHeaders,
    });

    expect(resAll.statusCode).toBe(200);
    const jsonAll = JSON.parse(resAll.body);
    expect(jsonAll.success).toBe(true);
    expect(jsonAll.data.cameras.length).toBe(16);

    const resNoRec = await app.inject({
      method: "GET",
      url: "/v1/branches/branch-178/command-center/cameras?filter=no-record",
      headers: authHeaders,
    });

    expect(resNoRec.statusCode).toBe(200);
    const jsonNoRec = JSON.parse(resNoRec.body);
    expect(jsonNoRec.success).toBe(true);
    expect(jsonNoRec.data.cameras.length).toBeGreaterThan(0);
    expect(jsonNoRec.data.cameras[0].state).toBe("NO_RECORD");
  });

  it("GET /v1/branches/:branchId/storage returns disk health & SMART telemetry", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/branches/branch-178/storage",
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.data.criticalDisks.length).toBeGreaterThan(0);
  });

  it("GET /v1/branches/:branchId/retention returns verified retention statistics", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/branches/branch-178/retention",
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.data.minimumVerifiedDays).toBe(61);
    expect(json.data.requiredDays).toBe(90);
  });
});
