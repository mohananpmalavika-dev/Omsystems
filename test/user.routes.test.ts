import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerUserRoutes } from "../src/routes/user.routes.js";

const currentUser = {
  id: "00000000-0000-4000-8000-000000000101",
  tenantId: "00000000-0000-4000-8000-000000000001",
  username: "company-admin",
  displayName: "Company Admin",
  email: "admin@example.test",
  role: "company_admin",
  status: "active",
};

describe("user directory route", () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function createApp(store: Record<string, unknown>) {
    const app = Fastify({ logger: false });
    apps.push(app);
    app.decorateRequest("currentUser");
    app.addHook("preHandler", async (request) => {
      request.currentUser = currentUser as any;
    });
    await registerUserRoutes(app, store as any);
    return app;
  }

  it("preserves repository totals and applies role boundaries in the query", async () => {
    const listUsers = vi.fn(async (_tenantId: string, _filters: unknown) => ({ data: [], total: 123 }));
    const listAccessibleNodes = vi.fn(async () => {
      throw new Error("tenant administrators should not need a scope lookup");
    });
    const app = await createApp({ listUsers, listAccessibleNodes });

    const response = await app.inject({ method: "GET", url: "/v1/users?limit=25&offset=50" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], total: 123 });
    expect(listAccessibleNodes).not.toHaveBeenCalled();
    expect(listUsers).toHaveBeenCalledWith(
      currentUser.tenantId,
      expect.objectContaining({
        limit: 25,
        offset: 50,
        includeUserId: currentUser.id,
        manageableRoles: expect.arrayContaining(["operator", "viewer", "branch_manager"]),
      }),
    );
    const filters = listUsers.mock.calls[0]?.[1] as { manageableRoles: string[] };
    expect(filters.manageableRoles).not.toContain("company_admin");
    expect(filters.manageableRoles).not.toContain("super_admin");
  });

  it("surfaces a directory failure instead of returning a misleading self-only result", async () => {
    const app = await createApp({
      listAccessibleNodes: vi.fn(async () => [{ id: "branch-1" }]),
      listUsers: vi.fn(async () => {
        throw new Error("directory unavailable");
      }),
    });

    const response = await app.inject({ method: "GET", url: "/v1/users" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).not.toMatchObject({ data: [currentUser], total: 1 });
  });

  it("creates all employee location assignments atomically through one repository call", async () => {
    const primaryScopeId = "00000000-0000-4000-8000-000000000201";
    const additionalScopeId = "00000000-0000-4000-8000-000000000202";
    const createUser = vi.fn().mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000203",
      tenantId: currentUser.tenantId,
      username: "new-operator",
      role: "operator",
      passwordHash: "never-returned",
    });
    const app = await createApp({
      getNode: vi.fn((id: string) => ({ id, tenantId: currentUser.tenantId })),
      checkAccess: vi.fn().mockResolvedValue({ allowed: true }),
      createUser,
      writeAudit: vi.fn(),
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/users",
      payload: {
        displayName: "New Operator",
        email: "new.operator@example.test",
        username: "new-operator",
        password: "a-safe-password",
        role: "operator",
        primaryOrgNodeId: primaryScopeId,
        organizationScopeNodeIds: [primaryScopeId, additionalScopeId],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).not.toHaveProperty("passwordHash");
    expect(createUser).toHaveBeenCalledWith(
      currentUser.tenantId,
      expect.objectContaining({
        primaryOrgNodeId: primaryScopeId,
        organizationScopeNodeIds: [primaryScopeId, additionalScopeId],
      }),
    );
  });

  it("does not create an employee when any requested location is outside the tenant", async () => {
    const createUser = vi.fn();
    const app = await createApp({
      getNode: vi.fn((id: string) => ({
        id,
        tenantId: id.endsWith("202") ? "00000000-0000-4000-8000-000000000999" : currentUser.tenantId,
      })),
      checkAccess: vi.fn().mockResolvedValue({ allowed: true }),
      createUser,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/users",
      payload: {
        displayName: "New Operator",
        email: "new.operator@example.test",
        username: "new-operator",
        password: "a-safe-password",
        role: "operator",
        primaryOrgNodeId: "00000000-0000-4000-8000-000000000201",
        organizationScopeNodeIds: ["00000000-0000-4000-8000-000000000202"],
      },
    });

    expect(response.statusCode).toBe(404);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("does not delete a custom role while employees are assigned to it", async () => {
    const deleteCustomRole = vi.fn();
    const app = await createApp({
      getCustomRole: vi.fn().mockResolvedValue({ id: "00000000-0000-4000-8000-000000000301", userCount: 1 }),
      deleteCustomRole,
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/v1/roles/00000000-0000-4000-8000-000000000301",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("role_in_use");
    expect(deleteCustomRole).not.toHaveBeenCalled();
  });

  it("retrieves a custom role by id", async () => {
    const customRole = {
      id: "00000000-0000-4000-8000-000000000301",
      name: "Custom Operator",
      baseRole: "operator",
      menuAccess: ["/control-room"],
      userCount: 3,
    };
    const app = await createApp({
      getCustomRole: vi.fn().mockResolvedValue(customRole),
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/roles/${customRole.id}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(customRole);
  });

  it("validates custom role assignment when creating a user", async () => {
    const createUser = vi.fn().mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000204",
      tenantId: currentUser.tenantId,
      username: "role-user",
      role: "operator",
    });
    const app = await createApp({
      getNode: vi.fn((id: string) => ({ id, tenantId: currentUser.tenantId })),
      checkAccess: vi.fn().mockResolvedValue({ allowed: true }),
      getCustomRole: vi.fn().mockResolvedValue({
        id: "00000000-0000-4000-8000-000000000301",
        baseRole: "operator",
      }),
      createUser,
      writeAudit: vi.fn(),
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/users",
      payload: {
        displayName: "Role User",
        email: "role.user@example.test",
        username: "role-user",
        password: "a-safe-password",
        role: "operator",
        primaryOrgNodeId: "00000000-0000-4000-8000-000000000201",
        customRoleId: "00000000-0000-4000-8000-000000000301",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(createUser).toHaveBeenCalledWith(
      currentUser.tenantId,
      expect.objectContaining({
        customRoleId: "00000000-0000-4000-8000-000000000301",
      }),
    );
  });

  it("returns 409 when creating a user with an already existing username or email", async () => {
    const conflictError: any = new Error("An employee with this login username already exists in this organization.");
    conflictError.statusCode = 409;
    conflictError.code = "username_taken";

    const app = await createApp({
      getNode: vi.fn((id: string) => ({ id, tenantId: currentUser.tenantId })),
      checkAccess: vi.fn().mockResolvedValue({ allowed: true }),
      createUser: vi.fn().mockRejectedValue(conflictError),
      writeAudit: vi.fn(),
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/users",
      payload: {
        displayName: "Duplicate User",
        email: "duplicate@example.test",
        username: "duplicate-user",
        password: "a-safe-password",
        role: "operator",
        primaryOrgNodeId: "00000000-0000-4000-8000-000000000201",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: "username_taken",
      message: "An employee with this login username already exists in this organization.",
    });
  });

  it("calls deleteUser and invalidates sessions on DELETE /v1/users/:id", async () => {
    const deleteUser = vi.fn().mockResolvedValue(true);
    const writeAudit = vi.fn().mockResolvedValue(undefined);
    const targetUserId = "00000000-0000-4000-8000-000000000999";
    const app = await createApp({
      deleteUser,
      getUserDetails: vi.fn().mockResolvedValue({
        id: targetUserId,
        tenantId: currentUser.tenantId,
        role: "operator",
        organizations: [{ scopeNodeId: "00000000-0000-4000-8000-000000000201", isPrimary: true }],
      }),
      checkAccess: vi.fn().mockResolvedValue({ allowed: true }),
      writeAudit,
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/v1/users/${targetUserId}`,
    });

    expect(response.statusCode).toBe(204);
    expect(deleteUser).toHaveBeenCalledWith(targetUserId);
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.deleted",
        details: { userId: targetUserId },
      }),
    );
  });

  it("clears face biometrics when removeFace is specified on PATCH /v1/users/:id", async () => {
    const targetUserId = "00000000-0000-4000-8000-000000000888";
    const updateUser = vi.fn().mockResolvedValue({
      id: targetUserId,
      tenantId: currentUser.tenantId,
      displayName: "Updated User",
      profilePhotoUrl: null,
    });
    const writeAudit = vi.fn().mockResolvedValue(undefined);
    const app = await createApp({
      updateUser,
      getUserDetails: vi.fn().mockResolvedValue({
        id: targetUserId,
        tenantId: currentUser.tenantId,
        role: "operator",
        organizations: [{ scopeNodeId: "00000000-0000-4000-8000-000000000201", isPrimary: true }],
      }),
      checkAccess: vi.fn().mockResolvedValue({ allowed: true }),
      writeAudit,
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/users/${targetUserId}`,
      payload: {
        removeFace: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(updateUser).toHaveBeenCalledWith(
      targetUserId,
      expect.objectContaining({
        removeFace: true,
        profilePhotoUrl: null,
      }),
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.updated",
        details: expect.objectContaining({
          faceVerificationUpdated: true,
        }),
      }),
    );
  });
});
