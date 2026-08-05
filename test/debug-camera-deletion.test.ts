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

    pool = new Pool({ connectionString: testDbUrl });
    const store = createDbStore(pool);
    app = await buildApp({ store });
  });

  afterEach(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
  });

  it("debug: is the route registered?", async () => {
    if (!testDbUrl) return;

    // First check if app has the route
    console.log("App routes:", app.printRoutes());
    
    expect(true).toBe(true);
  });

  it("debug: what does the endpoint return for non-existent camera?", async () => {
    if (!testDbUrl) return;

    try {
      const nonExistentCameraId = "00000000-0000-0000-0000-000000000000";
      const response = await app.inject({
        method: "DELETE",
        url: `/v1/admin/cameras/${nonExistentCameraId}`,
        headers: { "x-user-id": "user-global-admin" },
      });

      console.log("Status Code:", response.statusCode);
      console.log("Response Body:", response.body);
      
      try {
        const jsonBody = response.json();
        console.log("Response JSON:", jsonBody);
      } catch (e) {
        console.log("Could not parse JSON");
      }

      // Just log, don't assert for now
      expect(response.statusCode).toBeDefined();
    } catch (error) {
      console.error("Test error:", error);
      throw error;
    }
  });
});
