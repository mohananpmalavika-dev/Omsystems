import Fastify from "fastify";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthMiddleware, activeInMemorySessions, PermissionChecker, RateLimiter } from "../src/middleware/auth.middleware.js";
import { registerAuthRoutes } from "../src/routes/auth.routes.js";
import { hashPassword } from "../src/security/password.js";
import { PERMANENT_SUPERADMIN } from "../src/identity/services/bootstrap-onboarding.service.js";

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  activeInMemorySessions.clear();
});

function authApp(store: any, developmentMode = false) {
  const app = Fastify();
  apps.push(app);
  app.addHook("preHandler", createAuthMiddleware({ store, developmentMode }));
  app.get("/protected", (request) => request.currentUser);
  return app;
}

describe("production authentication trust boundaries", () => {
  it("rejects forged development headers in production and unknown development identities", async () => {
    const getUser = vi.fn(async () => undefined);
    for (const development of [false, true]) {
      const response = await authApp({ getUser }, development).inject({
        url: "/protected", headers: { "x-user-id": "invented-superadmin" },
      });
      expect(response.statusCode).toBe(401);
    }
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("rejects a revoked session even when another instance left it cached", async () => {
    const token = "formerly-valid-access-token";
    activeInMemorySessions.set(createHash("sha256").update(token).digest("base64"), {
      user: { id: "operator", tenantId: "bank-a", role: "super_admin" },
      sessionId: "revoked", expiresAt: Date.now() + 86400_000,
    });
    const lookup = vi.fn(async () => undefined);
    const response = await authApp({ findSessionByAccessToken: lookup }).inject({
      url: "/protected", headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
    expect(lookup).toHaveBeenCalledOnce();
  });

  it("preserves tenant identity and stored privileges while excluding password hashes", async () => {
    const response = await authApp({
      getUser: async () => ({ id: "user-a", tenantId: "bank-a", username: "mgdhanyamohan", role: "viewer", status: "active", passwordHash: "secret" }),
    }, true).inject({ url: "/protected", headers: { "x-user-id": "user-a" } });
    expect(response.json()).toMatchObject({ id: "user-a", tenantId: "bank-a", role: "viewer", isSuperAdmin: false });
    expect(response.json()).not.toHaveProperty("passwordHash");
    expect(new PermissionChecker({} as never).isSuperAdmin({ currentUser: response.json() } as never)).toBe(false);
  });

  it.each(["invalid", new Date(Date.now() - 1000).toISOString()])("rejects invalid or expired session expiry: %s", async (accessExpiresAt) => {
    const response = await authApp({ findSessionByAccessToken: async () => ({ accessExpiresAt }) }).inject({
      url: "/protected", headers: { authorization: "Bearer token" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects session and user tenant mismatches", async () => {
    const response = await authApp({
      findSessionByAccessToken: async () => ({ userId: "u", tenantId: "bank-a", accessExpiresAt: new Date(Date.now() + 3600_000) }),
      getUserById: async () => ({ id: "u", tenantId: "bank-b", status: "active" }),
    }).inject({ url: "/protected", headers: { authorization: "Bearer token" } });
    expect(response.statusCode).toBe(401);
  });

  it("handles malformed session cookies without a server error", async () => {
    const response = await authApp({}).inject({ url: "/protected", headers: { cookie: "sentinel_access=%ZZ" } });
    expect(response.statusCode).toBe(401);
  });

  it("does not allow spoofed forwarded headers to evade login rate limits", async () => {
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", new RateLimiter(1).middleware());
    app.post("/auth/login", () => ({ success: true }));
    expect((await app.inject({ method: "POST", url: "/auth/login", headers: { "x-forwarded-for": "1.1.1.1" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/auth/login", headers: { "x-forwarded-for": "2.2.2.2" } })).statusCode).toBe(429);
  });
});

describe("persisted login credentials", () => {
  async function loginApp(overrides: Record<string, unknown> = {}) {
    const user = { id: "user-a", tenantId: "bank-a", username: PERMANENT_SUPERADMIN.username, role: "super_admin", status: "active", passwordHash: await hashPassword("rotated-password"), mustChangePassword: true };
    const store = {
      findUserByUsername: vi.fn(async () => user), checkAccountLockout: vi.fn(async () => false),
      createUserSession: vi.fn(async () => ({ id: "session-a", accessExpiresAt: new Date(Date.now() + 3600_000) })),
      createUser: vi.fn(), recordFailedLogin: vi.fn(), ...overrides,
    };
    const app = Fastify();
    apps.push(app);
    await registerAuthRoutes(app, store as never);
    return { app, store };
  }

  it("validates request bodies with 400 responses", async () => {
    const { app } = await loginApp();
    expect((await app.inject({ method: "POST", url: "/v1/auth/login", payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/v1/auth/refresh", payload: {} })).statusCode).toBe(400);
  });

  it("does not provision accounts or reactivate admins on a failed login", async () => {
    const { app, store } = await loginApp();
    const response = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { username: "krypton", password: "wrong-password" } });
    expect(response.statusCode).toBe(401);
    expect(store.createUser).not.toHaveBeenCalled();
    expect(store.createUserSession).not.toHaveBeenCalled();
  });

  it("does not issue an access token when session persistence fails", async () => {
    const { app } = await loginApp({ createUserSession: vi.fn(async () => { throw new Error("database unavailable"); }) });
    const response = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { username: PERMANENT_SUPERADMIN.username, password: "rotated-password" } });
    expect(response.statusCode).toBe(500);
    expect(response.json()).not.toHaveProperty("accessToken");
    expect(activeInMemorySessions.size).toBe(0);
  });

  it("preserves tenant, password-change requirements and persisted token expiry", async () => {
    const { app } = await loginApp();
    const response = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { username: PERMANENT_SUPERADMIN.username, password: "rotated-password" } });
    expect(response.statusCode).toBe(200);
    expect(response.json().user).toMatchObject({ id: "user-a", tenantId: "bank-a", mustChangePassword: true });
    expect(response.json().expiresIn).toBeGreaterThan(3595);
    expect(response.json().expiresIn).toBeLessThanOrEqual(3600);
  });

  it("applies lockout to administrators", async () => {
    const { app, store } = await loginApp({ checkAccountLockout: async () => true });
    const response = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { username: PERMANENT_SUPERADMIN.username, password: "rotated-password" } });
    expect(response.statusCode).toBe(403);
    expect(store.createUserSession).not.toHaveBeenCalled();
  });
});
