import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminCameraManagementRoutes } from "../src/routes/admin-camera-management.routes.js";

type QueryCall = { sql: string; params?: any[] };

function createStore(options: { failCameraDelete?: boolean } = {}) {
  const calls: QueryCall[] = [];
  const client = {
    query: vi.fn(async (sql: string, params?: any[]) => {
      calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, " ").trim();

      if (normalized.startsWith("SELECT resource_node_id FROM cameras")) {
        return { rows: [{ resource_node_id: "node-123" }], rowCount: 1 };
      }
      if (normalized.includes("FROM pg_constraint")) {
        return {
          rows: [{ table_schema: "public", table_name: "recording_jobs", column_name: "camera_id" }],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('DELETE FROM "public"."recording_jobs"')) {
        return { rows: [], rowCount: 2 };
      }
      if (normalized === "DELETE FROM cameras WHERE id::text = $1") {
        if (options.failCameraDelete) {
          throw Object.assign(new Error("camera is referenced"), {
            code: "23503",
            constraint: "protected_camera_fk",
          });
        }
        return { rows: [], rowCount: 1 };
      }
      if (normalized.startsWith("DELETE FROM resource_nodes")) {
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
  const store = {
    getCamera: vi.fn(async (id: string) => ({
      id,
      nodeId: "camera-node-123",
      branchId: "branch-123",
    })),
    checkAccess: vi.fn(async () => ({ allowed: true, reason: "admin" })),
    listAccessibleCameras: vi.fn(async () => ({ cameras: [], total: 0 })),
    db: {
      connect: vi.fn(async () => client),
      query: vi.fn(),
    },
  } as any;

  return { store, client, calls };
}

describe("admin camera deletion", () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it.each([
    { method: "DELETE" as const, url: "/v1/admin/cameras/camera-123" },
    { method: "POST" as const, url: "/v1/admin/cameras/delete", payload: { id: "camera-123" } },
  ])(
    "hard-deletes a camera through $method $url without using an invalid status",
    async (request) => {
      const { store, calls } = createStore();
      const app = Fastify();
      apps.push(app);
      registerAsAdmin(app);
      await adminCameraManagementRoutes(app, store);

      const response = await app.inject(request);
      const statements = calls.map(({ sql }) => sql.replace(/\s+/g, " ").trim());

      expect(response.statusCode).toBe(204);
      expect(statements.some((sql) => sql.includes('DELETE FROM "public"."recording_jobs"'))).toBe(true);
      expect(statements).toContain("DELETE FROM cameras WHERE id::text = $1");
      expect(statements.some((sql) => /status\s*=\s*'inactive'/i.test(sql))).toBe(false);
      expect(statements.indexOf('DELETE FROM "public"."recording_jobs" WHERE "camera_id" = $1'))
        .toBeLessThan(statements.indexOf("DELETE FROM cameras WHERE id::text = $1"));
    },
    15_000,
  );

  it("returns 409 when an unknown reference still prevents deletion", async () => {
    const { store, client } = createStore({ failCameraDelete: true });
    const app = Fastify();
    apps.push(app);
    registerAsAdmin(app);
    await adminCameraManagementRoutes(app, store);

    const response = await app.inject({
      method: "DELETE",
      url: "/v1/admin/cameras/camera-123",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: "deletion_constrained",
      constraint: "protected_camera_fk",
    });
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("keeps fleet-wide camera deletion disabled", async () => {
    const { store, client } = createStore();
    const app = Fastify();
    apps.push(app);
    registerAsAdmin(app);
    await adminCameraManagementRoutes(app, store);

    const response = await app.inject({
      method: "DELETE",
      url: "/v1/admin/cameras/all",
      payload: { confirmDelete: "DELETE_ALL_CAMERAS" },
    });

    expect(response.statusCode).toBe(405);
    expect(client.query).not.toHaveBeenCalled();
  });

  it("rejects camera deletion when the admin cannot configure that camera", async () => {
    const { store, client } = createStore();
    store.checkAccess.mockResolvedValue({ allowed: false, reason: "outside_scope" });
    const app = Fastify();
    apps.push(app);
    registerAsAdmin(app);
    await adminCameraManagementRoutes(app, store);

    const response = await app.inject({
      method: "DELETE",
      url: "/v1/admin/cameras/camera-123",
    });

    expect(response.statusCode).toBe(403);
    expect(client.query).not.toHaveBeenCalled();
  });
});

function registerAsAdmin(app: ReturnType<typeof Fastify>) {
  app.decorateRequest("currentUser");
  app.addHook("preHandler", async (request) => {
    request.currentUser = {
      id: "00000000-0000-4000-8000-000000000201",
      tenantId: "00000000-0000-4000-8000-000000000001",
      username: "admin",
      displayName: "Administrator",
      email: "admin@example.test",
      role: "super_admin",
      status: "active",
    };
  });
}
