import { afterAll, describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { Pool } from "pg";
import { MemoryStore } from "../src/store.js";
import { createMISUnifiedRoutes } from "../src/routes/reports/mis-unified.routes.js";

describe("MIS report branch permissions", () => {
  const store = new MemoryStore();
  const app = Fastify();
  const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;

  app.addHook("preHandler", async (request) => {
    request.currentUser = (await store.getUser("user-branch-manager"))!;
  });
  createMISUnifiedRoutes(app, pool, store);
  afterAll(async () => app.close());

  it("includes only permitted branches in data and filter choices", async () => {
    const response = await app.inject({ method: "GET", url: "/mis" });
    expect(response.statusCode).toBe(200);
    const report = response.json();
    expect(report.filterOptions.branches.map((branch: { id: string }) => branch.id)).toEqual(["A005"]);
    expect(report.allBranches).toHaveLength(1);
    expect(report.allBranches[0].name).toBe(report.filterOptions.branches[0].name);
  });

  it("rejects an explicitly requested branch outside the user's scope", async () => {
    const response = await app.inject({ method: "GET", url: "/mis?branchId=A008" });
    expect(response.statusCode).toBe(403);
  });
});
