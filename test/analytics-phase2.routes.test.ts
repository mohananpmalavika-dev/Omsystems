import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerAnalyticsPhase2Routes } from "../src/routes/analytics-phase2.routes.js";
import { MemoryStore } from "../src/store.js";

describe("identity analytics routes without PostgreSQL", () => {
  let app: FastifyInstance;
  let store: MemoryStore;
  const superadmin = { "x-user-id": "user-superadmin-mgdhanyamohan" };

  beforeEach(async () => {
    store = new MemoryStore();
    store.grants.push({
      userId: "user-south-operator",
      scopeNodeId: "region-south",
      actions: ["face:view", "anpr:search", "behavior:view"],
      effect: "allow",
    });
    app = Fastify();
    app.decorateRequest("currentUser");
    app.addHook("preHandler", async (request, reply) => {
      const identity = request.headers["x-user-id"];
      const user = typeof identity === "string" ? await store.getUser(identity) : undefined;
      if (!user) return reply.code(401).send({ error: "unauthorized" });
      request.currentUser = user;
    });
    await registerAnalyticsPhase2Routes(app, store);
  });

  afterEach(async () => app.close());

  it("creates, lists, and enrols governed face identities locally", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/analytics/face-watchlists",
      headers: superadmin,
      payload: {
        name: "Restricted identities",
        listType: "security",
        alertOnMatch: true,
        alertSeverity: "P1",
      },
    });
    expect(created.statusCode).toBe(201);
    const watchlistId = created.json().data.id as string;

    const enrolled = await app.inject({
      method: "POST",
      url: `/v1/analytics/face-watchlists/${watchlistId}/persons`,
      headers: superadmin,
      payload: { fullName: "Approved Person", gender: "unknown", metadata: {} },
    });
    expect(enrolled.statusCode).toBe(201);
    expect(enrolled.json().data).toMatchObject({
      fullName: "Approved Person",
      embeddingCount: 0,
    });

    const persons = await app.inject({
      method: "GET",
      url: `/v1/analytics/face-watchlists/${watchlistId}/persons`,
      headers: superadmin,
    });
    expect(persons.statusCode).toBe(200);
    expect(persons.json().data).toHaveLength(1);

    const missing = await app.inject({
      method: "POST",
      url: "/v1/analytics/face-watchlists/00000000-0000-4000-8000-000000000999/persons",
      headers: superadmin,
      payload: { fullName: "No owner", metadata: {} },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("creates ANPR lists and returns registered plates", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/analytics/anpr-watchlists",
      headers: superadmin,
      payload: {
        name: "Vehicles of interest",
        listType: "alert",
        alertOnMatch: true,
        alertSeverity: "P2",
        alertAuthorities: false,
      },
    });
    expect(created.statusCode).toBe(201);
    const watchlistId = created.json().data.id as string;

    const registered = await app.inject({
      method: "POST",
      url: `/v1/analytics/anpr-watchlists/${watchlistId}/plates`,
      headers: superadmin,
      payload: {
        plateNumber: "kl07ab1234",
        countryCode: "IN",
        vehicleType: "car",
        reason: "Approved security review",
      },
    });
    expect(registered.statusCode).toBe(201);
    expect(registered.json().data.plateNumber).toBe("KL07AB1234");

    const plates = await app.inject({
      method: "GET",
      url: `/v1/analytics/anpr-watchlists/${watchlistId}/plates`,
      headers: superadmin,
    });
    expect(plates.statusCode).toBe(200);
    expect(plates.json().data).toEqual([
      expect.objectContaining({ plateNumber: "KL07AB1234", matchCount: 0 }),
    ]);
  });

  it("scopes searches to authorized cameras and accepts non-UUID camera IDs", async () => {
    const allowed = await app.inject({
      method: "GET",
      url: "/v1/analytics/face-events?cameraId=cam-001",
      headers: { "x-user-id": "user-south-operator" },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toEqual({ data: [] });

    const denied = await app.inject({
      method: "GET",
      url: "/v1/analytics/face-events?cameraId=cam-a006-01",
      headers: { "x-user-id": "user-south-operator" },
    });
    expect(denied.statusCode).toBe(404);

    const invalidRange = await app.inject({
      method: "GET",
      url: "/v1/analytics/anpr-events?from=2026-09-01T00%3A00%3A00.000Z&to=2026-08-01T00%3A00%3A00.000Z",
      headers: { "x-user-id": "user-south-operator" },
    });
    expect(invalidRange.statusCode).toBe(400);
  });

  it("stores protected-object zones for real camera identifiers", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/cameras/cam-001/protected-objects",
      headers: { "x-user-id": "user-branch-manager" },
      payload: {
        name: "Cash drawer",
        objectType: "cash-drawer",
        zone: { x: 0.1, y: 0.1, width: 0.4, height: 0.3 },
        alertOnRemoval: true,
        alertSeverity: "P1",
        removalThresholdSeconds: 10,
      },
    });
    expect(created.statusCode).toBe(201);

    const listed = await app.inject({
      method: "GET",
      url: "/v1/cameras/cam-001/protected-objects",
      headers: { "x-user-id": "user-branch-manager" },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().data).toEqual([
      expect.objectContaining({ name: "Cash drawer", cameraId: "cam-001" }),
    ]);

    const invalidZone = await app.inject({
      method: "POST",
      url: "/v1/cameras/cam-001/protected-objects",
      headers: { "x-user-id": "user-branch-manager" },
      payload: {
        name: "Outside frame",
        objectType: "test",
        zone: { x: 0.9, y: 0.9, width: 0.5, height: 0.5 },
      },
    });
    expect(invalidZone.statusCode).toBe(400);
  });

  it("accepts authenticated dashboard telemetry and persists each item", async () => {
    const timestamp = new Date().toISOString();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/analytics",
      headers: superadmin,
      payload: {
        sessionId: "00000000-0000-4000-8000-000000000123",
        timestamp,
        events: [{
          category: "branch",
          action: "provisioning.started",
          label: "branch-001",
          metadata: { accessToken: "must-not-be-stored", mode: "named" },
          timestamp,
        }],
        performance: [{
          name: "fleet_load",
          value: 125,
          unit: "ms",
          metadata: {},
          timestamp,
        }],
        errors: [{
          error: "Gateway unavailable",
          context: "live-view",
          severity: "high",
          metadata: {},
          timestamp,
        }],
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().accepted).toBe(3);
    expect(store.userActionLogs).toHaveLength(3);
    expect(store.userActionLogs.map((entry) => entry.actionCategory)).toEqual([
      "branch",
      "performance",
      "error",
    ]);
    expect(store.userActionLogs[0]?.actionMetadata).toMatchObject({
      accessToken: "[redacted]",
      mode: "named",
    });

    const unauthenticated = await app.inject({
      method: "POST",
      url: "/api/v1/analytics",
      payload: {
        sessionId: "00000000-0000-4000-8000-000000000123",
        timestamp,
        events: [{ category: "page", action: "view", metadata: {}, timestamp }],
      },
    });
    expect(unauthenticated.statusCode).toBe(401);
  });
});
