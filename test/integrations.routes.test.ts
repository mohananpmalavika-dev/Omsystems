import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerIntegrationRoutes } from "../src/routes/integrations.routes.js";

describe("integration management routes", () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("registers the inventory, connector catalog, and health endpoints", async () => {
    const pool = {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    };
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (request) => {
      request.currentUser = {
        id: "user-global-admin",
        tenantId: "tenant-1",
        role: "super_admin",
      } as any;
    });

    await registerIntegrationRoutes(app, { db: pool } as any);

    const [inventory, connectors, health] = await Promise.all([
      app.inject({ method: "GET", url: "/v1/integrations" }),
      app.inject({ method: "GET", url: "/v1/integrations/connectors" }),
      app.inject({ method: "GET", url: "/v1/integrations/health" }),
    ]);

    expect(inventory.statusCode).toBe(200);
    expect(inventory.json()).toEqual({ data: [], total: 0 });
    expect(connectors.statusCode).toBe(200);
    expect(connectors.json().total).toBeGreaterThan(0);
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ data: [], total: 0 });
  });

  it("does not expose database-backed routes when PostgreSQL is unavailable", async () => {
    const app = Fastify();
    apps.push(app);

    await registerIntegrationRoutes(app, {} as any);
    const response = await app.inject({ method: "GET", url: "/v1/integrations" });

    expect(response.statusCode).toBe(404);
  });
});
