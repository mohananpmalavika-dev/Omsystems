import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { MemoryStore } from "../../src/store.js";
import { registerAuthRoutes } from "../../src/routes/auth.routes.js";
import { PERMANENT_SUPERADMIN } from "../../src/identity/services/bootstrap-onboarding.service.js";

describe("Krypton and Admin Login Aliases", () => {
  it("authenticates krypton, Krypton, admin, and superadmin aliases", async () => {
    PERMANENT_SUPERADMIN.password = "SentinelMasterAdmin2026!";
    const store = new MemoryStore();
    const app = Fastify();
    await registerAuthRoutes(app, store as any);

    const aliases = ["mgdhanyamohan", "krypton", "Krypton", "kryptonlogic", "admin", "superadmin"];

    for (const username of aliases) {
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: {
          username,
          password: "SentinelMasterAdmin2026!",
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.accessToken).toBeDefined();
      expect(data.user).toBeDefined();
      expect(data.user.role).toMatch(/admin/);
    }
  });
});
