import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../src/store.js";
import { registerOperationalHealthRoutes } from "../src/routes/operational-health.routes.js";

describe("Storage discovery deletion", () => {
  it("dismisses discoveries, preserves inventory state, and enforces branch permissions", async () => {
    const store = new MemoryStore();
    const app = Fastify();
    const user = store.users.get("user-global-admin")!;
    app.addHook("preHandler", async request => { request.currentUser = user; });
    await registerOperationalHealthRoutes(app, store);
    const branchId = "branch-blr-001";
    const tenantId = store.nodes.get(branchId)!.tenantId;
    const diskId = "recorder:test/disk:1";
    const record = await store.createDeviceInventoryRecord({
      tenantId, tenant: tenantId, branch: branchId, region: "South", deviceId: diskId,
      deviceType: "storage-device", manufacturer: "Test", model: "Disk", lifecycleState: "operational",
    });
    const agent = await store.registerEdgeAgent(branchId, "Test", "1.0");
    const ingest = async (offset: number) => store.ingestOperationalTelemetry({
      tenantId, branchId, edgeAgentId: agent.id, deviceType: "disk", deviceId: diskId,
      observedAt: new Date(Date.now() + offset).toISOString(), receivedAt: new Date(Date.now() + offset).toISOString(),
      source: "system", quality: "verified", idempotencyKey: `storage-delete:${offset}`,
      metrics: { model: "Disk", capacityBytes: 1_000_000 }, reasonCodes: [],
    });
    const discovery = `/v1/operations/health/disks/discovery?branchId=${branchId}`;
    const remove = `${discovery}&diskId=${encodeURIComponent(diskId)}`;
    try {
      await ingest(-1000);
      await store.retireOperationalDisk(tenantId, branchId, diskId, user.id);
      await ingest(1000);
      expect((await app.inject({ method: "GET", url: discovery })).json().data).toHaveLength(1);
      const access = vi.spyOn(store, "checkAccess").mockResolvedValueOnce({ allowed: false, reason: "denied" } as any);
      expect((await app.inject({ method: "DELETE", url: remove })).statusCode).toBe(403);
      access.mockRestore();
      expect((await app.inject({ method: "DELETE", url: remove.replace(branchId, "missing-branch") })).statusCode).toBe(404);
      expect((await app.inject({ method: "DELETE", url: remove })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: discovery })).json().data).toEqual([]);
      expect((await app.inject({ method: "DELETE", url: remove })).statusCode).toBe(404);
      await ingest(3000);
      expect((await app.inject({ method: "GET", url: discovery })).json().data).toHaveLength(1);
      expect((await app.inject({ method: "POST", url: remove.replace("/discovery?", "/discovery/add?") })).statusCode).toBe(200);
      expect((await store.getDeviceInventory(record.id))?.lifecycleState).toBe("operational");
      expect((await app.inject({ method: "GET", url: discovery })).json().data).toEqual([]);
    } finally { await app.close(); }
  });
});
