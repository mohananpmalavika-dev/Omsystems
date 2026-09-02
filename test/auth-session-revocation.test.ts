import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";
import { createHash } from "node:crypto";

describe("Session Revocation and Security Endpoints", () => {
  let app: FastifyInstance;
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore();
    app = await buildApp({ store });
  });

  afterEach(async () => {
    await app.close();
  });

  it("lists active user sessions and allows revoking a session by ID", async () => {
    // 1. Create a session for global admin
    const token = "test-token-12345678901234567890123456789012";
    const tokenHash = createHash("sha256").update(token).digest("base64");
    const session = await store.createUserSession(
      "user-global-admin",
      "tenant-default",
      tokenHash,
      "refresh-hash-123",
      "192.168.1.100",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
    );

    expect(session).toBeDefined();
    expect(session.id).toBeDefined();

    // 2. Fetch sessions list via API
    const listRes = await app.inject({
      method: "GET",
      url: "/v1/auth/sessions",
      headers: {
        "x-user-id": "user-global-admin",
      },
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = listRes.json();
    expect(Array.isArray(listBody.data)).toBe(true);
    expect(listBody.data.length).toBeGreaterThanOrEqual(1);
    expect(listBody.data.some((s: any) => s.id === session.id)).toBe(true);

    // 3. Revoke the session via DELETE /v1/auth/sessions/:id
    const revokeRes = await app.inject({
      method: "DELETE",
      url: `/v1/auth/sessions/${session.id}`,
      headers: {
        "x-user-id": "user-global-admin",
      },
    });

    expect(revokeRes.statusCode).toBe(204);

    // 4. Verify session is no longer in active list
    const afterRes = await app.inject({
      method: "GET",
      url: "/v1/auth/sessions",
      headers: {
        "x-user-id": "user-global-admin",
      },
    });

    expect(afterRes.statusCode).toBe(200);
    const afterBody = afterRes.json();
    expect(afterBody.data.some((s: any) => s.id === session.id)).toBe(false);
  });

  it("handles custom or non-uuid session IDs gracefully", async () => {
    // Custom formatted session ID (e.g. sess-172389123)
    const customSession = {
      id: "sess-custom-device-998877",
      userId: "user-global-admin",
      tenantId: "tenant-default",
      accessTokenHash: "access-token-hash-xyz",
      refreshTokenHash: "refresh-token-hash-xyz",
      ipAddress: "10.0.0.1",
      userAgent: "Custom Device Agent",
      accessExpiresAt: new Date(Date.now() + 3600000),
      expiresAt: new Date(Date.now() + 86400000),
      lastActivityAt: new Date(),
      createdAt: new Date(),
    };
    store.userSessions.set(customSession.id, customSession);

    const revokeRes = await app.inject({
      method: "DELETE",
      url: `/v1/auth/sessions/${customSession.id}`,
      headers: {
        "x-user-id": "user-global-admin",
      },
    });

    expect(revokeRes.statusCode).toBe(204);
    expect(store.userSessions.has(customSession.id)).toBe(false);
  });

  it("allows a super admin to revoke a session after identity normalization", async () => {
    const session = await store.createUserSession(
      "user-global-admin",
      "tenant-default",
      "access-hash-super-admin",
      "refresh-hash-super-admin",
    );

    const revokeRes = await app.inject({
      method: "DELETE",
      url: `/v1/auth/sessions/${session.id}`,
      headers: { "x-user-id": "user-global-admin" },
    });

    expect(revokeRes.statusCode).toBe(204);
    expect(store.userSessions.has(session.id)).toBe(false);
  });
});
