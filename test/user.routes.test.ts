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
});
