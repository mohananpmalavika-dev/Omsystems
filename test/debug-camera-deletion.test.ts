/**
 * Debug test to understand why camera deletion is returning 500 instead of 404
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import type { ControlPlaneStore } from "../src/control-plane-store.js";
import pg from "pg";

const { Pool } = pg;

function createDbStore(pool: pg.Pool): ControlPlaneStore & { db: { connect: () => Promise<pg.PoolClient>; query: (sql: string, params?: any[]) => Promise<any> } } {
  return {
    db: {
      connect: () => pool.connect(),
      query: (sql: string, params?: any[]) => pool.query(sql, params),
    },
    close: async () => {
      // No-op for tests
    },
  } as any;
}

describe("Debug Camera Deletion", () => {
  let app: FastifyInstance;
  let pool: pg.Pool | undefined;
  const testDbUrl = process.env.DATABASE_URL;

  beforeEach(async () => {
    if (!testDbUrl) {
      console.warn("Skipping database-dependent tests: DATABASE_URL not set");
      return;
    }

    try {
      console.log("Creating pool...");
      pool = new Pool({ connectionString: testDbUrl });
      const store = createDbStore(pool);
      console.log("Building app...");
      app = await buildApp({ store });
      console.log("App built successfully!");
    } catch (error) {
      console.error("Error building app:", error);
      throw error;
    }
  });

  afterEach(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
  });

  it("debug: is the route registered?", async () => {
    if (!testDbUrl) return;

    // First check if app has the route
    const routes = app.printRoutes();
    const routeLines = routes.split('\n');
    
    console.log(`Total route lines: ${routeLines.length}`);
    console.log('\nFirst 30 lines of route tree:');
    routeLines.slice(0, 30).forEach((line, idx) => console.log(`${idx}: ${line}`));
    
    console.log("\nSearching for admin/cameras routes...");
    const adminCameraRoutes = routeLines.filter(line => line.toLowerCase().includes('admin') && line.toLowerCase().includes('camera'));
    console.log("Found admin camera routes:", adminCameraRoutes.length);
    adminCameraRoutes.forEach(route => console.log("  -", route.trim()));
    
    expect(true).toBe(true);
  });

  it("debug: what does the endpoint return for non-existent camera?", async () => {
    if (!testDbUrl) return;

    try {
      const nonExistentCameraId = "00000000-0000-0000-0000-000000000000";
      
      // Try calling the route we registered
      console.log("Trying direct route call to /v1/admin/cameras/all...");
      const response3 = await app.inject({
        method: "GET",
        url: `/v1/admin/cameras/count`,
      });
      console.log("GET /v1/admin/cameras/count - Status Code:", response3.statusCode);
      console.log("GET /v1/admin/cameras/count - Response Body:", response3.body);
      
      // Try without /v1 prefix
      console.log("\nTrying without /v1 prefix...");
      const response1 = await app.inject({
        method: "DELETE",
        url: `/admin/cameras/${nonExistentCameraId}`,
        headers: { "x-user-id": "user-global-admin" },
      });
      console.log("Without /v1 - Status Code:", response1.statusCode);
      console.log("Without /v1 - Response Body:", response1.body);
      
      // Try with /v1 prefix and auth header
      console.log("\nTrying with /v1 prefix...");
      const response2 = await app.inject({
        method: "DELETE",
        url: `/v1/admin/cameras/${nonExistentCameraId}`,
        headers: { "x-user-id": "user-global-admin" },
      });
      console.log("With /v1 - Status Code:", response2.statusCode);
      console.log("With /v1 - Response Body:", response2.body);
      
      // Try GET count with auth header
      console.log("\nTrying GET /v1/admin/cameras/count with auth...");
      const response4 = await app.inject({
        method: "GET",
        url: `/v1/admin/cameras/count`,
        headers: { "x-user-id": "user-global-admin" },
      });
      console.log("GET /v1/admin/cameras/count - Status Code:", response4.statusCode);
      console.log("GET /v1/admin/cameras/count - Response Body:", response4.body);

      // Just log, don't assert for now
      expect(response1.statusCode).toBeDefined();
    } catch (error) {
      console.error("Test error:", error);
      throw error;
    }
  });
});
