/**
 * Debug test to understand what's happening with camera deletion
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp } from "../src/app.js";
import pg from "pg";

const { Pool } = pg;

function createDbStore(pool: pg.Pool) {
  return {
    db: {
      connect: () => pool.connect(),
      query: (sql: string, params?: any[]) => pool.query(sql, params),
    },
    close: async () => {},
  } as any;
}

describe("Debug Camera Deletion", () => {
  it("tests what error we get for non-existent camera", async () => {
    const testDbUrl = process.env.DATABASE_URL;
    if (!testDbUrl) {
      console.log("Skipping: no DATABASE_URL");
      return;
    }

    const pool = new Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false } });
    const store = createDbStore(pool);
    const app = await buildApp({ store });

    try {
      // Test with various ID formats
      const testIds = [
        "cam-test-" + Date.now(),
        "00000000-0000-0000-0000-000000000000", // Valid UUID format
        "not-a-uuid",
      ];

      for (const nonExistentId of testIds) {
        console.log("\n=== Testing ID:", nonExistentId);
        const response = await app.inject({
          method: "DELETE",
          url: `/v1/admin/cameras/${nonExistentId}`,
          headers: { "x-user-id": "user-global-admin" },
        });

        console.log("Status code:", response.statusCode);
        console.log("Response body:", response.body);
      }
    } finally {
      await app.close();
      await pool.end();
    }
  });
});
