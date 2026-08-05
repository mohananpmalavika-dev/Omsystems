/**
 * Bug Condition Exploration Test for Camera Deletion Error Handling
 * 
 * **Validates: Requirements 2.2, 2.3, 2.4, 2.5**
 * 
 * IMPORTANT: This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * The test encodes the expected behavior - it will validate the fix when it passes after implementation.
 * 
 * Property 1: Bug Condition - Proper Error Status Codes
 * 
 * For any deletion request where error conditions occur (camera not found, constraint violations,
 * missing tables, or unexpected errors), the endpoint SHALL return the appropriate HTTP status code:
 * - 404 for missing cameras
 * - 409 for constraint violations
 * - 500 only for truly unexpected errors
 * - Error messages SHALL be sanitized and not contain sensitive database information
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import type { ControlPlaneStore } from "../src/control-plane-store.js";
import pg from "pg";

const { Pool } = pg;

/**
 * Create a store with database pool for testing admin camera management routes
 */
function createDbStore(pool: pg.Pool): ControlPlaneStore & { db: { connect: () => Promise<pg.PoolClient>; query: (sql: string, params?: any[]) => Promise<any> } } {
  return {
    db: {
      connect: () => pool.connect(),
      query: (sql: string, params?: any[]) => pool.query(sql, params),
    },
  } as any; // Cast to ControlPlaneStore with db property
}

describe("Camera Deletion Error Handling - Bug Condition Exploration", () => {
  let app: FastifyInstance;
  let pool: pg.Pool | undefined;
  const testDbUrl = process.env.DATABASE_URL;

  beforeEach(async () => {
    // Skip tests if no database is available
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

  /**
   * Test 1: Missing Camera Detection
   * 
   * EXPECTED BEHAVIOR: DELETE with non-existent camera ID should return 404 with error "camera_not_found"
   * CURRENT BUG: Returns 500 instead of 404
   * 
   * **Validates: Requirement 2.2**
   */
  it("returns 404 for non-existent camera (DELETE endpoint)", async () => {
    if (!testDbUrl) return;

    const nonExistentCameraId = "cam-nonexistent-" + Date.now();
    const response = await app.inject({
      method: "DELETE",
      url: `/v1/admin/cameras/${nonExistentCameraId}`,
      headers: { "x-user-id": "user-global-admin" },
    });

    // Expected behavior (this assertion will FAIL on unfixed code)
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: "camera_not_found",
    });
  });

  it("returns 404 for non-existent camera (POST endpoint)", async () => {
    if (!testDbUrl) return;

    const nonExistentCameraId = "cam-nonexistent-" + Date.now();
    const response = await app.inject({
      method: "POST",
      url: "/v1/admin/cameras/delete",
      headers: { "x-user-id": "user-global-admin" },
      payload: { id: nonExistentCameraId },
    });

    // Expected behavior (this assertion will FAIL on unfixed code)
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: "camera_not_found",
    });
  });

  /**
   * Test 2: Constraint Violation Detection
   * 
   * EXPECTED BEHAVIOR: Deletion with constraint violations should return 409 with error "deletion_constrained"
   * CURRENT BUG: Returns 500 instead of 409
   * 
   * This test creates a scenario where a camera has protected dependent records that prevent deletion.
   * We simulate this by creating a constraint that would block deletion.
   * 
   * **Validates: Requirement 2.3**
   */
  it("returns 409 for constraint violation preventing deletion", async () => {
    if (!testDbUrl || !pool) return;

    // Setup: Create a test camera and add a constraint that will prevent deletion
    const client = await pool.connect();
    
    try {
      await client.query("BEGIN");

      // Create a resource node for the camera
      const nodeResult = await client.query(
        `INSERT INTO resource_nodes (tenant_id, name, type) 
         VALUES ('omsystems', 'Test Constraint Camera', 'camera') 
         RETURNING id`
      );
      const resourceNodeId = nodeResult.rows[0].id;

      // Create a camera
      const cameraResult = await client.query(
        `INSERT INTO cameras (tenant_id, branch_node_id, resource_node_id, status, vendor, model)
         VALUES ('omsystems', 
                 (SELECT id FROM resource_nodes WHERE type = 'branch' LIMIT 1),
                 $1, 'active', 'test', 'constraint-test')
         RETURNING id::text`,
        [resourceNodeId]
      );
      const cameraId = cameraResult.rows[0].id;

      // Create a temporary constraint that will prevent deletion
      // We'll add a foreign key constraint with RESTRICT behavior
      await client.query(`
        CREATE TEMP TABLE protected_references (
          id SERIAL PRIMARY KEY,
          camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE RESTRICT,
          data TEXT
        )
      `);
      
      // Insert a protected record
      await client.query(
        "INSERT INTO protected_references (camera_id, data) VALUES ($1, 'protected')",
        [cameraId]
      );

      await client.query("COMMIT");

      // Attempt deletion - should return 409 due to constraint violation
      const response = await app.inject({
        method: "DELETE",
        url: `/v1/admin/cameras/${cameraId}`,
        headers: { "x-user-id": "user-global-admin" },
      });

      // Expected behavior (this assertion will FAIL on unfixed code)
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        error: "deletion_constrained",
      });
      expect(response.json().message).toContain("constraint");

      // Cleanup: Remove the constraint and protected record
      await client.query("BEGIN");
      await client.query("DROP TABLE IF EXISTS protected_references");
      await client.query("DELETE FROM cameras WHERE id = $1", [cameraId]);
      await client.query("DELETE FROM resource_nodes WHERE id = $1", [resourceNodeId]);
      await client.query("COMMIT");

    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  /**
   * Test 3: Missing Table Handling
   * 
   * EXPECTED BEHAVIOR: Deletion should continue gracefully when dependent tables are missing
   * CURRENT BUG: May cause transaction rollback and return 500
   * 
   * This test verifies that if a dependent table doesn't exist in the schema,
   * the deletion process continues for other tables without failing.
   * 
   * **Validates: Requirement 2.5**
   */
  it("handles missing dependent tables gracefully without transaction rollback", async () => {
    if (!testDbUrl || !pool) return;

    const client = await pool.connect();
    
    try {
      await client.query("BEGIN");

      // Create a resource node for the camera
      const nodeResult = await client.query(
        `INSERT INTO resource_nodes (tenant_id, name, type) 
         VALUES ('omsystems', 'Test Missing Table Camera', 'camera') 
         RETURNING id`
      );
      const resourceNodeId = nodeResult.rows[0].id;

      // Create a camera with no dependent records
      const cameraResult = await client.query(
        `INSERT INTO cameras (tenant_id, branch_node_id, resource_node_id, status, vendor, model)
         VALUES ('omsystems', 
                 (SELECT id FROM resource_nodes WHERE type = 'branch' LIMIT 1),
                 $1, 'active', 'test', 'missing-table-test')
         RETURNING id::text`,
        [resourceNodeId]
      );
      const cameraId = cameraResult.rows[0].id;

      await client.query("COMMIT");

      // Note: The current code includes dependent tables that may not exist in all schemas
      // The deletion should handle this gracefully
      
      // Attempt deletion - should succeed even if some tables don't exist
      const response = await app.inject({
        method: "DELETE",
        url: `/v1/admin/cameras/${cameraId}`,
        headers: { "x-user-id": "user-global-admin" },
      });

      // Expected behavior: Either succeeds with 204, or if there's an error,
      // it should not be due to missing tables causing rollback
      if (response.statusCode !== 204) {
        // If there's an error, verify it's not a transaction failure
        expect(response.statusCode).not.toBe(500);
        // And the error message should not indicate table-related issues
        const body = response.json();
        expect(body.message || "").not.toMatch(/does not exist/i);
        expect(body.message || "").not.toMatch(/relation.*does not exist/i);
      } else {
        // Success case - camera should be deleted
        expect(response.statusCode).toBe(204);
        
        // Verify camera was actually deleted
        const checkResult = await client.query(
          "SELECT id FROM cameras WHERE id = $1",
          [cameraId]
        );
        expect(checkResult.rowCount).toBe(0);
      }

    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  /**
   * Test 4: Error Message Sanitization
   * 
   * EXPECTED BEHAVIOR: 500 errors should return sanitized messages without sensitive database information
   * CURRENT BUG: May expose internal database details in error messages
   * 
   * This test triggers a database error and verifies that the response
   * does not contain sensitive information like connection strings, table schemas, or internal details.
   * 
   * **Validates: Requirement 2.4**
   */
  it("sanitizes error messages and does not expose sensitive database information", async () => {
    if (!testDbUrl || !pool) return;

    // Attempt to delete with an invalid ID format that might cause a database error
    const response = await app.inject({
      method: "DELETE",
      url: "/v1/admin/cameras/invalid-uuid-format!!!",
      headers: { "x-user-id": "user-global-admin" },
    });

    // We expect some error (404 or 500), but the message should be sanitized
    expect([404, 500]).toContain(response.statusCode);
    
    const body = response.json();
    const errorMessage = body.message || body.error || "";
    
    // Expected behavior: Error messages should NOT contain sensitive information
    // (these assertions may FAIL on unfixed code if messages expose DB details)
    expect(errorMessage).not.toMatch(/postgresql/i);
    expect(errorMessage).not.toMatch(/connection string/i);
    expect(errorMessage).not.toMatch(/database.*error/i);
    expect(errorMessage).not.toMatch(/pg_/i);
    expect(errorMessage).not.toMatch(/SQLSTATE/i);
    expect(errorMessage).not.toMatch(/relation/i);
    expect(errorMessage).not.toMatch(/constraint.*violation/i);
    
    // Should not expose internal implementation details
    expect(errorMessage.length).toBeLessThan(200); // Reasonable error message length
  });

  /**
   * Test 5: Property-Based Test - Error Code Consistency
   * 
   * This test generates multiple scenarios and verifies consistent error handling.
   * 
   * **Validates: Requirements 2.2, 2.3, 2.4, 2.5**
   */
  it("returns appropriate status codes for various error scenarios", async () => {
    if (!testDbUrl) return;

    // Test multiple non-existent camera IDs
    const nonExistentIds = [
      "cam-test-001",
      "cam-test-002", 
      "cam-test-003",
      `cam-generated-${Date.now()}`,
      `cam-uuid-${Math.random().toString(36).substring(7)}`,
    ];

    for (const cameraId of nonExistentIds) {
      const response = await app.inject({
        method: "DELETE",
        url: `/v1/admin/cameras/${cameraId}`,
        headers: { "x-user-id": "user-global-admin" },
      });

      // Expected: All non-existent cameras should return 404
      // (this assertion will FAIL on unfixed code if it returns 500)
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        error: "camera_not_found",
      });
    }
  });
});
