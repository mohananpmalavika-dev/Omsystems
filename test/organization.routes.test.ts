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

  it("only offers root creation to super administrators mgdhanyamohan and krypton", async () => {
    const mgdhanyamohanUser: User = {
      id: "user-superadmin-mgdhanyamohan",
      tenantId: "tenant-1",
      displayName: "Dhanya Mohan (Superadmin)",
      username: "mgdhanyamohan",
      role: "super_admin",
    };
    const kryptonUser: User = {
      id: "user-krypton",
      tenantId: "tenant-1",
      displayName: "Krypton Admin",
      username: "krypton",
      role: "super_admin",
    };
    const otherAdminUser: User = {
      id: "admin-1",
      tenantId: "tenant-1",
      displayName: "Company Administrator",
      username: "otheradmin",
      role: "company_admin",
    };

    const appMg = await createApp(mgdhanyamohanUser, {
      getOrganizationTree: vi.fn().mockResolvedValue([]),
      listAccessibleNodes: vi.fn().mockResolvedValue([]),
    });
    const resMg = await appMg.inject({ method: "GET", url: "/v1/organization/tree" });
    expect(resMg.json().meta.canCreateRoot).toBe(true);

    const appKrypton = await createApp(kryptonUser, {
      getOrganizationTree: vi.fn().mockResolvedValue([]),
      listAccessibleNodes: vi.fn().mockResolvedValue([]),
    });
    const resKrypton = await appKrypton.inject({ method: "GET", url: "/v1/organization/tree" });
    expect(resKrypton.json().meta.canCreateRoot).toBe(true);

    const appOther = await createApp(otherAdminUser, {
      getOrganizationTree: vi.fn().mockResolvedValue([]),
      listAccessibleNodes: vi.fn().mockResolvedValue([]),
    });
    const resOther = await appOther.inject({ method: "GET", url: "/v1/organization/tree" });
    expect(resOther.json().meta.canCreateRoot).toBe(false);
  });

  it("allows mgdhanyamohan and krypton to create root organization and assigns the creator", async () => {
    const user: User = {
      id: "user-superadmin-mgdhanyamohan",
      tenantId: "tenant-1",
      displayName: "Dhanya Mohan (Superadmin)",
      username: "mgdhanyamohan",
      role: "super_admin",
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

  it("denies organization creation to non-superadmin users but allows zone/region/area/branch creation", async () => {
    const user: User = {
      id: "admin-1",
      tenantId: "tenant-1",
      displayName: "Company Administrator",
      username: "normal_admin",
      role: "company_admin",
    };
    const createOrganizationNode = vi.fn().mockImplementation((_tenantId, body) => ({
      id: "node-new",
      ...body,
    }));
    const app = await createApp(user, {
      getOrganizationNodeDetails: vi.fn().mockResolvedValue(companyNode),
      checkAccess: vi.fn().mockResolvedValue({ allowed: true }),
      validateHierarchyRelationship: vi.fn().mockResolvedValue(true),
      createOrganizationNode,
      writeAudit: vi.fn().mockResolvedValue(undefined),
    });

    // Attempting to create company node must fail with 403
    const companyRes = await app.inject({
      method: "POST",
      url: "/v1/organization/nodes",
      payload: { nodeType: "company", name: "Illegal Org" },
    });
    expect(companyRes.statusCode).toBe(403);
    expect(companyRes.json().message).toContain("Only super administrators mgdhanyamohan and krypton can create an organization");

    // Attempting to create Zone, Region, Area, Branch under parent node succeeds
    for (const type of ["zone", "region", "area", "branch"]) {
      const subNodeRes = await app.inject({
        method: "POST",
        url: "/v1/organization/nodes",
        payload: { parentNodeId: companyNode.id, nodeType: type, name: `Test ${type}` },
      });
      expect(subNodeRes.statusCode).toBe(201);
    }
  });

  it("rejects an invalid location relationship before creating a node", async () => {
    const user: User = {
      id: "admin-1", tenantId: "tenant-1", displayName: "Company Administrator", role: "company_admin",
    };
    const createOrganizationNode = vi.fn();
    const app = await createApp(user, {
      getOrganizationNodeDetails: vi.fn().mockResolvedValue(companyNode),
      checkAccess: vi.fn().mockResolvedValue({ allowed: true }),
      validateHierarchyRelationship: vi.fn().mockResolvedValue(false),
      createOrganizationNode,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/organization/nodes",
      payload: { parentNodeId: companyNode.id, nodeType: "floor", name: "Basement" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_hierarchy_relationship");
    expect(createOrganizationNode).not.toHaveBeenCalled();
  });

  it("does not mutate a node owned by another tenant", async () => {
    const user: User = {
      id: "admin-1", tenantId: "tenant-1", displayName: "Company Administrator", role: "company_admin",
    };
    const updateOrganizationNode = vi.fn();
    const app = await createApp(user, {
      getOrganizationNodeDetails: vi.fn().mockResolvedValue({ ...companyNode, tenantId: "tenant-2" }),
      updateOrganizationNode,
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/organization/nodes/${companyNode.id}`,
      payload: { name: "Should not update" },
    });

    expect(response.statusCode).toBe(404);
    expect(updateOrganizationNode).not.toHaveBeenCalled();
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

  it("scopes company_admin to only their assigned company in organization tree", async () => {
    const user: User = {
      id: "admin-1",
      tenantId: "tenant-1",
      displayName: "Company Admin",
      role: "company_admin",
    };
    const otherCompanyNode = {
      id: "company-2",
      tenantId: "tenant-1",
      parentId: null,
      type: "company",
      name: "Other Company",
      isActive: true,
      children: [],
    };
    const app = await createApp(user, {
      getOrganizationTree: vi.fn().mockResolvedValue([companyNode, otherCompanyNode]),
      listAccessibleNodes: vi.fn().mockResolvedValue([companyNode]),
    });

    const response = await app.inject({ method: "GET", url: "/v1/organization/tree" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe("company-1");
    expect(body.data[0].name).toBe("Sentinel Grid");
  });
});
