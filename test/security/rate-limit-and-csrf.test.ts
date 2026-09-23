import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateCsrfToken, verifyCsrfToken } from "../../src/security/middleware/csrf-protection.middleware.js";
import { buildApp } from "../../src/app.js";
import { MemoryStore } from "../../src/store.js";
import type { FastifyInstance } from "fastify";

describe("Security Hardening: Rate Limiting, CSRF, and Security Headers", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      store: new MemoryStore(),
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

    it("allows edge enrollment activation requests without CSRF token", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/edge-enrollment/activate",
        payload: {
          activationCode: "test-code",
          deviceUuid: "test-device",
          version: "0.1.27",
          commandPublicKey: "test-key",
        },
      });
      // Should not be rejected by CSRF hook (not 403 csrf_token_missing)
      const parsed = JSON.parse(response.body);
      expect(parsed.error).not.toBe("csrf_token_missing");
    });

    it("allows edge agent heartbeat requests without CSRF token", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/edge-agents/test-agent-id/heartbeat",
        headers: {
          "x-edge-agent-token": "test-edge-token",
        },
        payload: {
          version: "0.1.27",
        },
      });
      // Should not be rejected by CSRF hook (not 403 csrf_token_missing)
      const parsed = JSON.parse(response.body);
      expect(parsed.error).not.toBe("csrf_token_missing");
    });

    it("rejects invalid CSRF token header with 403 csrf_token_invalid", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/cameras/cam-1/live-sessions",
        headers: {
          "x-csrf-token": "invalid.csrf-token",
        },
      });
      expect(response.statusCode).toBe(403);
      const parsed = JSON.parse(response.body);
      expect(parsed.error).toBe("csrf_token_invalid");
    });

    it("accepts valid CSRF token header without 403 csrf error", async () => {
      const validToken = generateCsrfToken("test-session");
      const response = await app.inject({
        method: "POST",
        url: "/v1/cameras/cam-1/live-sessions",
        headers: {
          "x-csrf-token": validToken,
        },
      });
      expect(response.statusCode).not.toBe(403);
    });

    it("allows API clients with x-sentinel-session without requiring CSRF token", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/cameras/cam-1/live-sessions",
        headers: {
          "x-sentinel-session": "api-session-token",
        },
      });
      expect(response.statusCode).not.toBe(403);
    });

    it("blocks cross-site ambient cookie requests missing CSRF token with 403 csrf_token_missing", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/cameras/cam-1/live-sessions",
        headers: {
          cookie: "sentinel_access=ambient-session-cookie-123",
          origin: "https://attacker-site.com",
          "sec-fetch-site": "cross-site",
          host: "api.sentinelgrid.internal",
        },
      });
      expect(response.statusCode).toBe(403);
      const parsed = JSON.parse(response.body);
      expect(parsed.error).toBe("csrf_token_missing");
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
    it("does not emit rate-limit headers while rate limiting is disabled", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/auth/csrf-token",
      });

      expect(response.statusCode).toBe(200);
      const hasRateLimitHeader =
        response.headers["x-ratelimit-limit"] !== undefined ||
        response.headers["ratelimit-limit"] !== undefined;
      expect(hasRateLimitHeader).toBe(false);
    });
  });
});
