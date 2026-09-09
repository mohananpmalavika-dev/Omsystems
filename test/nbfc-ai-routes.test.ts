import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

describe("NBFC AI rules API production safeguards", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ store: new MemoryStore() });
  });

  afterEach(async () => app.close());

  it("requires authentication and a scoped target before activating automation", async () => {
    const anonymous = await app.inject({ method: "GET", url: "/api/ai/rules" });
    expect(anonymous.statusCode).toBe(401);

    const unscoped = await app.inject({
      method: "POST",
      url: "/api/ai/rules",
      headers: { "x-user-id": "user-global-admin" },
      payload: {
        name: "Unsafe fleet rule",
        detectorType: "person",
        condition: { metric: "person_count", operator: "GREATER_THAN", value: 2 },
        state: "ACTIVE",
      },
    });
    expect(unscoped.statusCode).toBe(400);
    expect(unscoped.json().error).toBe("scoped_activation_required");

    const scoped = await app.inject({
      method: "POST",
      url: "/api/ai/rules",
      headers: { "x-user-id": "user-global-admin" },
      payload: {
        name: "Scoped occupancy rule",
        branchIds: ["A005"],
        detectorType: "person",
        condition: { metric: "person_count", operator: "GREATER_THAN", value: 2 },
        actions: ["CREATE_ALERT"],
        state: "ACTIVE",
      },
    });
    expect(scoped.statusCode).toBe(201);
    expect(scoped.json()).toMatchObject({ enabled: true, state: "ACTIVE", branchIds: ["A005"] });
  });
});
