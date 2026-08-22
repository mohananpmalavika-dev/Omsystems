import Fastify from "fastify";
import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import { registerAuthRoutes } from "../src/routes/auth.routes.js";
import { verifyPassword } from "../src/security/password.js";

describe("session login password compatibility", () => {
  it("authenticates a legacy BCrypt account and upgrades it to Scrypt", async () => {
    const legacyHash = await bcrypt.hash("Render Legacy Password", 4);
    let upgradedHash: string | undefined;
    const findUserByUsername = vi.fn(async () => ({
      id: "user-1",
      tenantId: "tenant-1",
      username: "render-admin",
      email: "admin@example.com",
      displayName: "Render Admin",
      role: "super_admin",
      status: "active",
      passwordHash: legacyHash,
      mustChangePassword: false,
    }));
    const store = {
      findUserByUsername,
      checkAccountLockout: async () => false,
      recordFailedLogin: vi.fn(),
      updateUserPassword: vi.fn(async (_id: string, passwordHash: string) => {
        upgradedHash = passwordHash;
      }),
      createUserSession: async () => ({ id: "session-1" }),
      recordSuccessfulLogin: vi.fn(),
      writeAudit: vi.fn(),
      getUserDetails: async () => ({
        id: "user-1",
        tenantId: "tenant-1",
        username: "render-admin",
        email: "admin@example.com",
        displayName: "Render Admin",
        role: "super_admin",
        mustChangePassword: false,
      }),
    };
    const app = Fastify({ logger: false });
    await registerAuthRoutes(app, store as never);

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        username: "  render-admin  ",
        password: "Render Legacy Password",
        tenantSlug: "  omsystems-pilot  ",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(findUserByUsername).toHaveBeenCalledWith("render-admin", "omsystems-pilot");
    expect(store.updateUserPassword).toHaveBeenCalledWith(
      "user-1",
      expect.stringMatching(/^scrypt\$/),
      false,
    );
    await expect(verifyPassword("Render Legacy Password", upgradedHash)).resolves.toBe(true);
    expect(response.json()).toMatchObject({
      tokenType: "Bearer",
      user: { id: "user-1", username: "render-admin" },
    });

    await app.close();
  }, 15_000);
});
