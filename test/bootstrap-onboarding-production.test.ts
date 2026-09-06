import { createHash } from "node:crypto";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BootstrapOnboardingService, PERMANENT_SUPERADMIN } from "../src/identity/services/bootstrap-onboarding.service.js";
import { MemoryStore } from "../src/store.js";
import { registerAuthRoutes } from "../src/routes/auth.routes.js";
import { InfrastructureRepository } from "../src/database/infrastructure-repository.js";
import { PostgresStore } from "../src/database/postgres-store.js";

const input = { organizationName: "Example Bank", firstBranchName: "Main Branch", adminPassword: "New-admin-password-123" };
const originalPassword = PERMANENT_SUPERADMIN.password;
beforeEach(() => { PERMANENT_SUPERADMIN.password = ""; });
afterEach(() => { PERMANENT_SUPERADMIN.password = originalPassword; vi.restoreAllMocks(); });

describe("first-time onboarding integrity", () => {
  it("counts branches below nested organization nodes", async () => {
    const status = await new BootstrapOnboardingService().getOnboardingStatus({
      getOrganizationTree: async () => [{ type: "company", children: [{ type: "region", children: [{ type: "branch" }] }] }],
    });
    expect(status).toMatchObject({ organizationCount: 1, branchCount: 1, isFirstTimeSetup: false, requiresOrganizationSetup: false });
  });

  it("does not reopen bootstrap when the status query fails", async () => {
    await expect(new BootstrapOnboardingService().getOnboardingStatus({
      getOrganizationTree: async () => { throw new Error("database unavailable"); },
    })).rejects.toThrow("database unavailable");
  });

  it("rejects setup on initialized installations, including a different tenant", async () => {
    const store = new MemoryStore();
    const beforeCount = store.nodes.size;
    await expect(new BootstrapOnboardingService().setupFirstTimeOnboarding(store, { ...input, tenantSlug: "another-bank" }))
      .rejects.toThrow("onboarding_already_completed");
    expect(store.nodes.size).toBe(beforeCount);
  });

  it("issues real, resolvable access and refresh sessions after successful setup", async () => {
    const store = new MemoryStore();
    store.nodes.clear();
    store.users.clear();
    const result = await new BootstrapOnboardingService().setupFirstTimeOnboarding(store, input);
    const hash = (value: string) => createHash("sha256").update(value).digest("base64");
    const session = await store.findSessionByAccessToken(hash(result.tokens.accessToken));
    expect(session).toMatchObject({ userId: result.superadmin.id, tenantId: result.organization.tenantId });
    expect(await store.findSessionByRefreshToken(hash(result.tokens.refreshToken))).toMatchObject({ id: session!.id });
    expect(result.tokens.expiresIn).toBeLessThanOrEqual(3600);
    await expect(new BootstrapOnboardingService().setupFirstTimeOnboarding(store, input)).rejects.toThrow("onboarding_already_completed");
  });

  it("does not fabricate successful setup when a configuration write fails", async () => {
    const store = {
      getOrganizationTree: async () => [], findUserByUsername: async () => undefined,
      createOrganizationNode: vi.fn(async () => { throw new Error("insert failed"); }),
      createUserSession: vi.fn(),
    };
    await expect(new BootstrapOnboardingService().setupFirstTimeOnboarding(store, input)).rejects.toThrow("insert failed");
    expect(store.createUserSession).not.toHaveBeenCalled();
  });

  it("rejects a bootstrap request that does not prove knowledge of configured credentials", async () => {
    PERMANENT_SUPERADMIN.password = "deployment-specific-secret";
    const store = { getOrganizationTree: async () => [], createOrganizationNode: vi.fn() };
    await expect(new BootstrapOnboardingService().setupFirstTimeOnboarding(store, input)).rejects.toThrow("invalid_bootstrap_credentials");
    expect(store.createOrganizationNode).not.toHaveBeenCalled();
  });

  it("rolls back all PostgreSQL onboarding writes when administrator creation fails", async () => {
    const queries: string[] = [];
    const client = { query: vi.fn(async (sql: string) => {
      queries.push(sql);
      return { rows: sql.includes("count(*)") ? [{ organizations: 0, branches: 0 }] : [] };
    }), release: vi.fn() };
    vi.spyOn(InfrastructureRepository.prototype, "findUserByUsername").mockResolvedValue(undefined);
    vi.spyOn(InfrastructureRepository.prototype, "createOrganizationNode").mockResolvedValue({ id: "persisted-node" });
    vi.spyOn(InfrastructureRepository.prototype, "createUser").mockRejectedValue(new Error("user insert failed"));
    await expect(new BootstrapOnboardingService().setupFirstTimeOnboarding({ db: { connect: async () => client } }, input)).rejects.toThrow("user insert failed");
    expect(queries[0]).toBe("BEGIN");
    expect(queries).toContain("SELECT pg_advisory_xact_lock(739214608)");
    expect(queries.at(-1)).toBe("ROLLBACK");
    expect(queries).not.toContain("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("reuses the outer PostgreSQL transaction when creating the first administrator", async () => {
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes("FROM tenants WHERE slug")) return { rows: [{ id: "tenant-id" }] };
        if (sql.includes("INSERT INTO users")) return { rows: [{ id: "admin-id" }] };
        if (sql.includes("FROM users u") && sql.includes("WHERE u.id=$1")) {
          return { rows: [{ id: "admin-id", tenant_id: "tenant-id", username: "admin" }] };
        }
        return { rows: [] };
      }),
    };
    const repository = new InfrastructureRepository(client as never);

    const user = await repository.createUser("omsystems", {
      username: "admin",
      displayName: "Administrator",
      email: "admin@example.test",
      passwordHash: "stored-hash",
      role: "super_admin",
    });

    expect(user).toMatchObject({ id: "admin-id", tenantId: "tenant-id" });
    expect(queries).not.toContain("BEGIN");
    expect(queries).not.toContain("COMMIT");
    expect(queries).not.toContain("ROLLBACK");
  });

  it("assigns a pre-provisioned administrator to the new organization", async () => {
    const admin = {
      id: "existing-admin",
      tenantId: "omsystems",
      username: PERMANENT_SUPERADMIN.username,
      passwordHash: await (await import("../src/security/password.js")).hashPassword(input.adminPassword),
      role: "super_admin",
      status: "active",
    };
    const assignUserToOrganization = vi.fn(async () => ({ id: "assignment-id" }));
    const store = {
      getOrganizationTree: async () => [],
      findUserByUsername: async () => admin,
      createOrganizationNode: vi.fn()
        .mockResolvedValueOnce({ id: "org-id", tenantId: "omsystems" })
        .mockResolvedValueOnce({ id: "region-id", tenantId: "omsystems" })
        .mockResolvedValueOnce({ id: "branch-id", tenantId: "omsystems" }),
      assignUserToOrganization,
      createUserSession: async () => ({
        id: "session-id",
        accessExpiresAt: new Date(Date.now() + 3_600_000),
      }),
    };

    await new BootstrapOnboardingService().setupFirstTimeOnboarding(store, input);

    expect(assignUserToOrganization).toHaveBeenCalledWith(
      "existing-admin",
      "org-id",
      true,
      "existing-admin",
    );
  });

  it("returns a conflict for public setup after initialization", async () => {
    const app = Fastify();
    try {
      await registerAuthRoutes(app, new MemoryStore() as never);
      const response = await app.inject({ method: "POST", url: "/v1/auth/onboarding/setup", payload: input });
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe("onboarding_already_completed");
    } finally { await app.close(); }
  });

  it("never reactivates or escalates existing accounts during API startup", async () => {
    PERMANENT_SUPERADMIN.password = "configured-bootstrap-password";
    const query = vi.fn(async () => ({ rows: [{ initialized: true }] }));
    const release = vi.fn();
    await PostgresStore.prototype.ensureSuperUser.call({ pool: { connect: async () => ({ query, release }) } } as never);
    expect(query.mock.calls.map(([sql]) => sql).join(" ")).not.toMatch(/UPDATE users|INSERT INTO users/);
    expect(release).toHaveBeenCalledOnce();
  });
});
