import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ControlPlaneStore } from "../src/control-plane-store.js";
import type { User } from "../src/domain/models.js";
import { registerOrganizationRoutes } from "../src/routes/organization.routes.js";

declare module "fastify" {
  interface FastifyRequest {
    currentUser: Awaited<ReturnType<ControlPlaneStore["getUser"]>> & {};
  }
}

const companyNode = {
  id: "company-1",
  tenantId: "tenant-1",
  parentId: null,
  type: "company",
  name: "Sentinel Grid",
  isActive: true,
  children: [],
};

describe("organization routes", () => {
  const apps: FastifyInstance[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function createApp(user: User, store: Record<string, unknown>) {
    const app = Fastify({ logger: false });
    apps.push(app);
    app.decorateRequest("currentUser");
    app.addHook("preHandler", async (request) => {
      request.currentUser = user;
    });
    await registerOrganizationRoutes(app, store as any);
    return app;
  }

  it("reports restricted access without exposing hidden organization nodes", async () => {
    const user: User = {
      id: "employee-1",
      tenantId: "tenant-1",
      displayName: "Security Operator",
      role: "operator",
    };
    const app = await createApp(user, {
      getOrganizationTree: vi.fn().mockResolvedValue([companyNode]),
      listAccessibleNodes: vi.fn().mockResolvedValue([]),
    });

    const response = await app.inject({ method: "GET", url: "/v1/organization/tree" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [],
      meta: {
        organizationExists: true,
        accessRestricted: true,
        canCreateRoot: false,
      },
    });
    expect(response.body).not.toContain(companyNode.name);
  }, 15_000);

  it("only offers root creation to an administrator of an empty tenant", async () => {
    const user: User = {
      id: "admin-1",
      tenantId: "tenant-1",
      displayName: "Company Administrator",
      role: "company_admin",
    };
    const app = await createApp(user, {
      getOrganizationTree: vi.fn().mockResolvedValue([]),
      listAccessibleNodes: vi.fn().mockResolvedValue([]),
    });

    const response = await app.inject({ method: "GET", url: "/v1/organization/tree" });

    expect(response.json().meta).toEqual({
      organizationExists: false,
      accessRestricted: false,
      canCreateRoot: true,
    });
  });

  it("assigns the root creator so the new organization remains visible", async () => {
    const user: User = {
      id: "admin-1",
      tenantId: "tenant-1",
      displayName: "Company Administrator",
      role: "company_admin",
    };
    const assignUserToOrganization = vi.fn().mockResolvedValue({});
    const writeAudit = vi.fn().mockResolvedValue(undefined);
    const app = await createApp(user, {
      listOrganizationNodes: vi.fn().mockResolvedValue([]),
      createOrganizationNode: vi.fn().mockResolvedValue(companyNode),
      assignUserToOrganization,
      writeAudit,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/organization/nodes",
      payload: { nodeType: "company", name: "Sentinel Grid" },
    });

    expect(response.statusCode).toBe(201);
    expect(assignUserToOrganization).toHaveBeenCalledWith(
      user.id,
      companyNode.id,
      true,
      user.id,
    );
    expect(writeAudit).toHaveBeenCalledOnce();
  });

  it("does not publish the tenant-wide debug endpoint", async () => {
    const user: User = {
      id: "employee-1",
      tenantId: "tenant-1",
      displayName: "Security Operator",
      role: "operator",
    };
    const app = await createApp(user, {});

    const response = await app.inject({ method: "GET", url: "/v1/organization/debug" });

    expect(response.statusCode).toBe(404);
  });
});
