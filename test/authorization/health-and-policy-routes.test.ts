import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerStaleHealthRoutes } from "../../src/routes/stale-health.routes.js";
import { registerSurveillancePolicyRoutes } from "../../src/routes/surveillance-policy.routes.js";

const store = {
  getNode: async (id: string) => id === "branch-a"
    ? { id, type: "branch", tenantId: "tenant-a" }
    : id === "branch-b" ? { id, type: "branch", tenantId: "tenant-b" } : undefined,
  checkAccess: async () => ({ allowed: true }),
};

describe("health and surveillance policy route authorization", () => {
  it("rejects stale-health ingestion outside the session tenant", async () => {
    const app = Fastify();
    app.addHook("preHandler", async (request) => {
      (request as any).currentUser = { id: "user-a", tenantId: "tenant-a", role: "company_admin" };
    });
    await registerStaleHealthRoutes(app, store as any);

    const response = await app.inject({
      method: "POST",
      url: "/v1/health/observations/ingest",
      payload: { tenantId: "tenant-b", branchId: "branch-b", entityId: "camera-b", entityType: "CAMERA", health: "HEALTHY", observedAt: new Date().toISOString() },
    });
    expect(response.statusCode).toBe(404);
  });

  it("rejects policy administration by a non-admin and foreign branch reads", async () => {
    const app = Fastify();
    let user: any = { id: "user-a", tenantId: "tenant-a", role: "operator" };
    app.addHook("preHandler", async (request) => { (request as any).currentUser = user; });
    await registerSurveillancePolicyRoutes(app, store as any);

    expect((await app.inject({ method: "GET", url: "/v1/surveillance-policies" })).statusCode).toBe(403);
    user = { ...user, role: "company_admin" };
    expect((await app.inject({ method: "GET", url: "/v1/branches/branch-b/surveillance-policy" })).statusCode).toBe(404);
  });
});
