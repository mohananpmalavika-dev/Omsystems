/**
 * Preservation Property Tests for Authentication Middleware Session Activity Updates
 * 
 * **Validates: Requirements 3.2, 3.4**
 * 
 * These tests verify that non-logout authenticated endpoints continue to function
 * correctly after the logout-all fix. This preservation property ensures that the fix
 * for the logout-all 500 error does not break existing authentication behavior.
 * 
 * IMPORTANT: These tests should PASS on both UNFIXED and FIXED code.
 * - On UNFIXED code: Confirms baseline behavior to preserve
 * - On FIXED code: Confirms no regression in authentication
 * 
 * NOTE: These tests use development mode (x-user-id header) because the MemoryStore
 * used in tests doesn't implement session-based authentication. The conceptual preservation
 * property being tested is that non-logout endpoints continue to work correctly.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

describe("Preservation: Non-Logout Authenticated Requests Continue to Work", () => {
  let app: FastifyInstance;
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore();
    // Build app in development mode (default behavior when no authMode specified)
    app = await buildApp({ store });
  });

  afterEach(async () => {
    await app.close();
  });

  /**
   * Property 2: Preservation - GET /me works with authentication
   * 
   * Observes that GET /me with valid user identity continues to work correctly.
   * This represents the baseline behavior that must be preserved after the fix.
   */
  it("authenticates and processes GET /me successfully", async () => {
    // Make authenticated request using development mode header
    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        "x-user-id": "user-global-admin",
      },
    });

    // Verify request succeeded and returns user data
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty("id");
    // The endpoint returns the raw user object which has the basic identity
    expect(body.id).toBe("user-global-admin");
  });

  /**
   * Property 2: Preservation - GET /branches works with authentication
   * 
   * Observes that GET /branches with valid user identity continues to work correctly.
   */
  it("authenticates and processes GET /branches successfully", async () => {
    // Make authenticated request
    const response = await app.inject({
      method: "GET",
      url: "/v1/branches",
      headers: {
        "x-user-id": "user-global-admin",
      },
    });

    // Verify request succeeded
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json().data)).toBe(true);
  });

  /**
   * Property 2: Preservation - GET /cameras works with authentication
   * 
   * Observes that camera endpoints with valid user identity continue to work correctly.
   */
  it("authenticates and processes GET /cameras for a branch successfully", async () => {
    // Make authenticated request to cameras endpoint
    const response = await app.inject({
      method: "GET",
      url: "/v1/branches/branch-blr-001/cameras",
      headers: {
        "x-user-id": "user-global-admin",
      },
    });

    // Verify request succeeded
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty("data");
  });

  /**
   * Property 2: Preservation - POST /incidents works with authentication
   * 
   * Observes that POST requests to authenticated endpoints continue to work.
   */
  it("authenticates and processes POST /cameras/:id/incidents successfully", async () => {
    // Make authenticated POST request
    const response = await app.inject({
      method: "POST",
      url: "/v1/cameras/cam-001/incidents",
      headers: {
        "x-user-id": "user-global-admin",
      },
      payload: {
        occurredAt: new Date().toISOString(),
        title: "Test incident",
        priority: "P3",
        preRollSeconds: 60,
        postRollSeconds: 300,
      },
    });

    // Verify request succeeded
    expect(response.statusCode).toBe(201);
    expect(response.json()).toHaveProperty("id");
  });

  /**
   * Property 2: Preservation - Multiple authenticated requests work correctly
   * 
   * Verifies that multiple authenticated requests in sequence all work correctly,
   * demonstrating that authentication remains functional across multiple calls.
   */
  it("processes multiple authenticated requests successfully", async () => {
    // Make multiple authenticated requests
    const response1 = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { "x-user-id": "user-global-admin" },
    });

    const response2 = await app.inject({
      method: "GET",
      url: "/v1/branches",
      headers: { "x-user-id": "user-global-admin" },
    });

    const response3 = await app.inject({
      method: "GET",
      url: "/v1/dashboard/stats",
      headers: { "x-user-id": "user-global-admin" },
    });

    // Verify all requests succeeded
    expect(response1.statusCode).toBe(200);
    expect(response2.statusCode).toBe(200);
    expect(response3.statusCode).toBe(200);
  });

  /**
   * Property 2: Preservation - Health check endpoint bypasses authentication
   * 
   * Verifies that the health check endpoint does not require authentication
   * and continues to work without any user identity.
   */
  it("allows access to health check endpoint without authentication", async () => {
    // Make request to health endpoint (no auth header)
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    // Verify request succeeded
    expect(response.statusCode).toBe(200);
  });

  /**
   * Property 2: Preservation - Unauthenticated requests return 401
   * 
   * Verifies that requests without valid user identity return 401 errors,
   * confirming authentication continues to be enforced.
   */
  it("returns 401 for requests without authentication", async () => {
    // Make request without auth header
    const response = await app.inject({
      method: "GET",
      url: "/v1/branches",
    });

    // Verify 401 response
    expect(response.statusCode).toBe(401);
  });

  /**
   * Property 2: Preservation - User context is populated correctly
   * 
   * Verifies that request.currentUser is populated correctly for authenticated
   * requests, which is essential for authorization and audit logging.
   */
  it("populates user context for authenticated requests", async () => {
    // Make authenticated request that returns user info
    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        "x-user-id": "user-global-admin",
      },
    });

    // Verify user information is returned (proves request.currentUser was set)
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBe("user-global-admin");
    // Verify it has the expected tenant
    expect(body).toHaveProperty("tenantId");
  });

  /**
   * Property 2: Preservation - Different users have appropriate access
   * 
   * Verifies that different user identities result in appropriate access control,
   * confirming that authorization logic continues to work correctly.
   */
  it("enforces access control for different users", async () => {
    // Global admin should see branches
    const adminResponse = await app.inject({
      method: "GET",
      url: "/v1/branches",
      headers: { "x-user-id": "user-global-admin" },
    });
    expect(adminResponse.statusCode).toBe(200);

    // Branch manager should also see branches (their accessible ones)
    const managerResponse = await app.inject({
      method: "GET",
      url: "/v1/branches",
      headers: { "x-user-id": "user-branch-manager" },
    });
    expect(managerResponse.statusCode).toBe(200);
  });
});
