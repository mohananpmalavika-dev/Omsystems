import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateCsrfToken, verifyCsrfToken } from "../../src/security/middleware/csrf-protection.middleware.js";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";

describe("Security Hardening: Rate Limiting, CSRF, and Security Headers", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      authMode: "development",
      logger: false,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("CSRF Protection", () => {
    it("generates a cryptographically valid token", () => {
      const token = generateCsrfToken("session-123");
      expect(token).toBeDefined();
      expect(token.includes(".")).toBe(true);
      expect(verifyCsrfToken(token)).toBe(true);
    });

    it("rejects an invalid or tampered CSRF token", () => {
      const token = generateCsrfToken("session-123");
      const tampered = token.slice(0, -4) + "abcd";
      expect(verifyCsrfToken(tampered)).toBe(false);
      expect(verifyCsrfToken("completely-invalid")).toBe(false);
    });

    it("issues a fresh CSRF token via GET /v1/auth/csrf-token", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/auth/csrf-token",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.csrfToken).toBeDefined();
      expect(body.headerName).toBe("x-csrf-token");
      expect(response.headers["set-cookie"]).toBeDefined();
    });

    it("allows GET requests without CSRF token", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/health",
      });
      expect(response.statusCode).toBe(200);
    });

    it("allows Bearer token authenticated API requests without CSRF token", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/auth/logout",
        headers: {
          authorization: "Bearer some-valid-token-for-api",
        },
      });
      // Should not be rejected by CSRF hook (might fail auth/session, but not 403 csrf_token_missing)
      expect(response.statusCode).not.toBe(403);
    });
  });

  describe("Security Headers (Helmet)", () => {
    it("injects defense-in-depth security headers", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-frame-options"]).toBe("DENY");
      expect(response.headers["strict-transport-security"]).toBeDefined();
    });
  });

  describe("Rate Limiting", () => {
    it("includes rate limit headers in API responses", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/auth/csrf-token",
      });

      expect(response.statusCode).toBe(200);
      // Fastify rate-limit sets x-ratelimit-limit or ratelimit-limit
      const hasRateLimitHeader = 
        response.headers["x-ratelimit-limit"] !== undefined ||
        response.headers["ratelimit-limit"] !== undefined;
      expect(hasRateLimitHeader).toBe(true);
    });
  });
});
