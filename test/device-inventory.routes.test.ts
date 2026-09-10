import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerDeviceInventoryRoutes } from "../src/routes/device-inventory.routes.js";
import type { User } from "../src/domain/models.js";

const user: User = { id: "user-1", tenantId: "tenant-a", displayName: "Admin", role: "company_admin" };
const branch = { id: "branch-a", tenantId: "tenant-a", type: "branch", name: "Main" };

describe("device inventory routes", () => {
  const apps: FastifyInstance[] = [];

  afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

  async function createApp(store: Record<string, unknown>) {
    const app = Fastify();
    apps.push(app);
    app.decorateRequest("currentUser");
    app.addHook("preHandler", async (request) => { (request as any).currentUser = user; });
    await registerDeviceInventoryRoutes(app, store as any);
    return app;
  }

  it("does not list inventory for a caller-supplied foreign tenant", async () => {
    const listDeviceInventory = vi.fn();
    const app = await createApp({ listDeviceInventory });
    const response = await app.inject({ method: "GET", url: "/v1/device-inventory?tenant=tenant-b" });
    expect(response.statusCode).toBe(403);
    expect(listDeviceInventory).not.toHaveBeenCalled();
  });

  it("does not accept a device record with a foreign tenant label", async () => {
    const createDeviceInventoryRecord = vi.fn();
    const app = await createApp({ getNode: vi.fn().mockResolvedValue(branch), createDeviceInventoryRecord });
    const response = await app.inject({
      method: "POST", url: "/v1/device-inventory",
      payload: { deviceId: "cam-1", tenant: "tenant-b", region: "south", branch: "branch-a", deviceType: "ip-camera", manufacturer: "Axis", model: "P3245" },
    });
    expect(response.statusCode).toBe(400);
    expect(createDeviceInventoryRecord).not.toHaveBeenCalled();
  });

  it("does not allow a generic PATCH to relocate a registered device", async () => {
    const updateDeviceInventory = vi.fn();
    const app = await createApp({
      getDeviceInventory: vi.fn().mockResolvedValue({ id: "record-1", tenantId: "tenant-a", tenant: "tenant-a", branch: "branch-a" }),
      getNode: vi.fn().mockResolvedValue(branch),
      checkAccess: vi.fn().mockResolvedValue({ allowed: true }),
      updateDeviceInventory,
    });
    const response = await app.inject({ method: "PATCH", url: "/v1/device-inventory/record-1", payload: { branch: "branch-b" } });
    expect(response.statusCode).toBe(400);
    expect(updateDeviceInventory).not.toHaveBeenCalled();
  });
});
