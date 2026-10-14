import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IdentityService } from "../src/identity/services/identity.service.js";
import { SessionService } from "../src/identity/services/session.service.js";
import type { AuthenticatedPrincipal } from "../src/identity/domain/authenticated-principal.js";
import { MemoryStore } from "../src/store.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_SECONDS = 2_592_000;
const issuedAt = new Date("2026-10-14T00:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(issuedAt);
});
afterEach(() => vi.useRealTimers());

describe("30-day login token expiry", () => {
  it("issues and renews enterprise tokens for 30 days and rejects expired tokens", async () => {
    const service = new IdentityService(undefined, "test-token-expiry-secret-at-least-32-chars");
    const login = await service.authenticate({
      providerType: "LOCAL", tenantId: "bank-a", username: "operator", password: "test-password",
    });
    expect(login.success).toBe(true);
    expect(login.expiresIn).toBe(THIRTY_DAYS_SECONDS);
    expect(service.verifyJwt(login.accessToken!)?.expiresAt.getTime()).toBe(issuedAt.getTime() + 30 * DAY_MS);

    vi.setSystemTime(issuedAt.getTime() + 29 * DAY_MS);
    expect(service.verifyJwt(login.accessToken!)).not.toBeNull();
    const renewed = await service.refreshSession(login.refreshToken!);
    expect(renewed.expiresIn).toBe(THIRTY_DAYS_SECONDS);
    expect(renewed.principal.expiresAt.getTime()).toBe(issuedAt.getTime() + 59 * DAY_MS);
    await expect(service.refreshSession(login.refreshToken!)).rejects.toThrow("Invalid or expired refresh token");

    vi.setSystemTime(issuedAt.getTime() + 30 * DAY_MS + 1000);
    expect(service.verifyJwt(login.accessToken!)).toBeNull();
    expect(service.verifyJwt(renewed.accessToken)).not.toBeNull();
    vi.setSystemTime(issuedAt.getTime() + 59 * DAY_MS + 1000);
    expect(service.verifyJwt(renewed.accessToken)).toBeNull();
    await expect(service.refreshSession(renewed.refreshToken)).rejects.toThrow("Invalid or expired refresh token");
  });

  it.each([undefined, 3600])("uses 30-day session defaults and honors an explicit lifetime: %s", async (accessTokenLifetime) => {
    const query = vi.fn(async (_sql: string, _params: unknown[]) => ({ rows: [], rowCount: 1 }));
    const service = new SessionService({ query } as unknown as Pool, {
      jwtSecret: "test-token-expiry-secret-at-least-32-chars", accessTokenLifetime,
    });
    const principal: AuthenticatedPrincipal = {
      userId: "user-a", tenantId: "bank-a", membershipId: "member-a",
      userStatus: "ACTIVE", membershipStatus: "ACTIVE",
      user: { id: "user-a", email: "operator@example.com", displayName: "Operator" },
      roles: ["operator"], permissions: [],
      authentication: { source: "PASSWORD", mfa: false, authenticatedAt: issuedAt },
    };
    try {
      const session = await service.create(principal);
      const expectedSeconds = accessTokenLifetime ?? THIRTY_DAYS_SECONDS;
      const claims = JSON.parse(Buffer.from(session.accessToken.split(".")[1]!, "base64url").toString());
      expect(claims.exp - claims.iat).toBe(expectedSeconds);
      expect(session.expiresIn).toBe(expectedSeconds);
      expect(session.accessTokenExpiresAt.getTime()).toBe(issuedAt.getTime() + expectedSeconds * 1000);
      expect(session.refreshTokenExpiresAt.getTime()).toBe(issuedAt.getTime() + 30 * DAY_MS);
      expect(query.mock.calls[0]?.[1]?.[11]).toEqual(session.refreshTokenExpiresAt);
    } finally {
      service.destroy();
    }
  });

  it("keeps password-login sessions valid until their 30-day expiry", async () => {
    const store = new MemoryStore();
    const session = await store.createUserSession("user-a", "bank-a", "access-hash", "refresh-hash");
    expect(session.accessExpiresAt.getTime()).toBe(issuedAt.getTime() + 30 * DAY_MS);
    vi.setSystemTime(issuedAt.getTime() + 29 * DAY_MS);
    expect(await store.findSessionByAccessToken("access-hash")).toBeDefined();
    vi.setSystemTime(issuedAt.getTime() + 30 * DAY_MS);
    expect(await store.findSessionByAccessToken("access-hash")).toBeUndefined();
    expect(await store.findSessionByRefreshToken("refresh-hash")).toBeUndefined();
  });
});
