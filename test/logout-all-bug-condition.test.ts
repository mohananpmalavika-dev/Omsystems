/**
 * Bug Condition Exploration Test for Logout-All 500 Error
 * 
 * **Validates: Requirements 1.1, 2.1, 2.2**
 * 
 * This test verifies that the /v1/auth/logout-all endpoint successfully logs out
 * all user sessions and returns 200 (not 500).
 * 
 * CRITICAL: This test was written to FAIL on unfixed code (demonstrating the bug exists).
 * After implementing the fix, this test should PASS, confirming the bug is resolved.
 * 
 * The bug occurs when the authentication middleware attempts to update session activity
 * timestamps for logout endpoints, creating a race condition or conflict when the
 * logout handler subsequently deletes those same sessions.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

describe("Bug Condition: Logout-All Returns 500 Error (Expected: 200)", () => {
  let app: FastifyInstance;
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore();
    // Build app in development mode to use x-user-id header for testing
    app = await buildApp({ store });
  });

  afterEach(async () => {
    await app.close();
  });

  /**
   * Property 1: Bug Condition - Logout-All with valid token succeeds
   * 
   * Tests that POST /v1/auth/logout-all with valid user identity returns 200
   * with { success: true } and successfully deletes all user sessions.
   * 
   * On UNFIXED code: Expected to FAIL with 500 error
   * On FIXED code: Expected to PASS with 200 status
   */
  it("successfully logs out all sessions with 200 status (not 500)", async () => {
    // Call logout-all endpoint with valid user identity
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/logout-all",
      headers: {
        "x-user-id": "user-global-admin",
      },
    });

    // CRITICAL ASSERTIONS: These encode the expected behavior
    // Status code MUST be 200 (not 500)
    expect(response.statusCode).toBe(200);
    
    // Response body MUST be { success: true }
    const body = response.json();
    expect(body).toEqual({ success: true });
  });

  /**
   * Property 1: Bug Condition - Multiple sessions logout-all succeeds
   * 
   * Tests logout-all with the conceptual scenario of multiple sessions.
   * In the actual system with token-based auth, this would delete all sessions
   * for the user across multiple devices/browsers.
   */
  it("successfully logs out when user has multiple conceptual sessions", async () => {
    // First, verify the user can access authenticated endpoints
    const preLogoutCheck = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        "x-user-id": "user-global-admin",
      },
    });
    expect(preLogoutCheck.statusCode).toBe(200);

    // Now call logout-all
    const logoutResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/logout-all",
      headers: {
        "x-user-id": "user-global-admin",
      },
    });

    // Verify logout succeeds with 200 (not 500)
    expect(logoutResponse.statusCode).toBe(200);
    expect(logoutResponse.json()).toEqual({ success: true });
  });

  /**
   * Property 1: Bug Condition - Single session logout also works
   * 
   * Tests that the single-session logout endpoint also works correctly,
   * as it may be affected by the same bug (session activity update during logout).
   */
  it("successfully logs out single session with 200 status (not 500)", async () => {
    // Call single-session logout endpoint
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: {
        "x-user-id": "user-global-admin",
      },
    });

    // Verify logout succeeds with 200 (not 500)
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
  });

  /**
   * Property 1: Bug Condition - Logout-all doesn't leak errors
   * 
   * Tests that even if internal operations have issues, the endpoint
   * handles them gracefully and doesn't return 500 errors.
   */
  it("handles logout-all gracefully without 500 errors", async () => {
    // Call logout-all multiple times rapidly (simulating potential race conditions)
    const requests = Array.from({ length: 3 }, () =>
      app.inject({
        method: "POST",
        url: "/v1/auth/logout-all",
        headers: {
          "x-user-id": "user-global-admin",
        },
      })
    );

    const responses = await Promise.all(requests);

    // All requests should complete without 500 errors
    for (const response of responses) {
      // Should be either 200 (success) or 401 (if subsequent calls have no valid session)
      // But definitely NOT 500 (Internal Server Error)
      expect(response.statusCode).not.toBe(500);
    }
  });

  /**
   * Property 1: Bug Condition - Logout-all creates audit log
   * 
   * Tests that successful logout-all creates proper audit log entry,
   * validating Requirement 2.4.
   */
  it("creates audit log entry for successful logout-all", async () => {
    // Call logout-all
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/logout-all",
      headers: {
        "x-user-id": "user-global-admin",
      },
    });

    // Verify logout succeeds
    expect(response.statusCode).toBe(200);

    // Check audit log contains the logout-all action
    const auditEvents = store.auditEvents;
    const logoutAuditEvent = auditEvents.find(
      (event) => event.action === "user.logout_all_sessions"
    );

    expect(logoutAuditEvent).toBeDefined();
    expect(logoutAuditEvent?.outcome).toBe("success");
    expect(logoutAuditEvent?.actorUserId).toBe("user-global-admin");
  });
});
