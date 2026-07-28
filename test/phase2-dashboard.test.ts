import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";
import { OperationalHealthEventStream } from "../src/operational-health/event-stream.js";

const admin = { "x-user-id": "user-global-admin" };

describe("Phase 2 bulk dashboard contracts", () => {
  let app: FastifyInstance;
  let store: MemoryStore;
  beforeEach(async () => { store = new MemoryStore(); app = await buildApp({ store }); });
  afterEach(async () => app.close());

  it("returns all authorized cameras in one paginated request", async () => {
    const response = await app.inject({
      method: "GET", url: "/v1/cameras?limit=500&action=live%3Aview", headers: admin,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().total).toBe(2);
    expect(response.json().data[0].branchName).toBe("Bengaluru Branch 001");
    expect(response.json().data[0].connectionSecretRef).toBeUndefined();
  });

  it("projects a 400-branch mosaic through one browser-facing request", async () => {
    await Promise.all(Array.from({ length: 399 }, (_, index) =>
      store.createBranch("omsystems", "region-south", `Pilot Branch ${String(index + 2).padStart(3, "0")}`),
    ));
    const response = await app.inject({
      method: "GET", url: "/v1/operations/health/branches?limit=500", headers: admin,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.total).toBe(400);
    expect(response.json().data.branches).toHaveLength(400);
    expect(response.json().data.branches[0].region).toBe("South Region");
  });

  it("filters the mosaic server-side by search and status", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/operations/health/branches?limit=500&search=Bengaluru&status=unknown",
      headers: admin,
    });
    expect(response.json().data.total).toBe(1);
  });

  it("persists per-user video-wall layouts and enforces camera authorization", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/video-wall/layouts",
      headers: admin,
      payload: {
        name: "HO overview",
        gridSize: "2x2",
        cameraPositions: [{ position: 0, cameraId: "cam-001", stream: "sub" }],
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().cameraPositions[0].stream).toBe("sub");

    const listed = await app.inject({
      method: "GET", url: "/v1/video-wall/layouts", headers: admin,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().data).toHaveLength(1);
    expect(listed.json().data[0].createdBy).toBe("user-global-admin");

    const forbidden = await app.inject({
      method: "POST",
      url: "/v1/video-wall/layouts",
      headers: { "x-user-id": "user-branch-manager" },
      payload: {
        name: "Forbidden camera",
        gridSize: "1x1",
        cameraPositions: [{ position: 0, cameraId: "cam-002", stream: "main" }],
      },
    });
    expect(forbidden.statusCode).toBe(403);
  });
});

describe("operational health event stream", () => {
  it("fans events only to subscribers in the same tenant and unsubscribes", () => {
    const stream = new OperationalHealthEventStream();
    const tenantA: string[] = [];
    const tenantB: string[] = [];
    const unsubscribe = stream.subscribe("a", (event) => tenantA.push(event.id));
    stream.subscribe("b", (event) => tenantB.push(event.id));
    const event = { id: "one", tenantId: "a", type: "health.updated" as const, occurredAt: new Date().toISOString() };
    stream.publish(event);
    unsubscribe();
    stream.publish({ ...event, id: "two" });
    expect(tenantA).toEqual(["one"]);
    expect(tenantB).toEqual([]);
  });
});
