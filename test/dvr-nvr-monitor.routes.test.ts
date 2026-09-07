import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerDVRNVRMonitorRoutes } from "../src/routes/dvr-nvr-monitor.routes.js";

describe("DVR/NVR monitor routes", () => {
  it("runs an immediate, tenant-scoped health check", async () => {
    const service = {
      getDevice: vi.fn((id: string) => id === "nvr-1" ? {
        id, tenantId: "tenant-1", branchId: "branch-1", deviceType: "nvr", manufacturer: "Hikvision", model: "NVR", ipAddress: "10.0.0.2",
        status: "online", lastPolled: undefined, pollingInterval: 30, enabled: true, consecutiveFailures: 0,
      } : undefined),
      checkNow: vi.fn().mockResolvedValue({ deviceId: "nvr-1", status: "online", timestamp: new Date() }),
      getStatistics: vi.fn(), getAllDevices: vi.fn(() => []), getDeviceHealth: vi.fn(), updateDevice: vi.fn(),
    } as any;
    const app = Fastify();
    app.addHook("onRequest", async (request) => { request.currentUser = { tenantId: "tenant-1" } as any; });
    await registerDVRNVRMonitorRoutes(app, service, { query: vi.fn() } as any);
    await app.ready();

    const response = await app.inject({ method: "POST", url: "/v1/dvr-nvr/monitor/devices/nvr-1/check" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, message: "Health check completed", health: { deviceId: "nvr-1" } });
    expect(service.checkNow).toHaveBeenCalledWith("nvr-1");
    await app.close();
  });

  it("does not expose a recorder from another tenant", async () => {
    const service = { getDevice: vi.fn(() => ({ id: "nvr-2", tenantId: "tenant-2" })), getAllDevices: vi.fn(() => []) } as any;
    const app = Fastify();
    app.addHook("onRequest", async (request) => { request.currentUser = { tenantId: "tenant-1" } as any; });
    await registerDVRNVRMonitorRoutes(app, service, { query: vi.fn() } as any);
    await app.ready();
    const response = await app.inject({ method: "POST", url: "/v1/dvr-nvr/monitor/devices/nvr-2/check" });
    expect(response.statusCode).toBe(404);
    expect(service.checkNow).toBeUndefined();
    await app.close();
  });

  it("returns only the signed-in tenant's recorder fleet", async () => {
    const service = {
      getAllDevices: vi.fn(() => [
        { id: "nvr-1", tenantId: "tenant-1", deviceType: "nvr", manufacturer: "Hikvision", model: "NVR", ipAddress: "10.0.0.2", status: "online", consecutiveFailures: 0, pollingInterval: 30, enabled: true },
        { id: "nvr-2", tenantId: "tenant-2", deviceType: "dvr", manufacturer: "Dahua", model: "DVR", ipAddress: "10.0.1.2", status: "online", consecutiveFailures: 0, pollingInterval: 30, enabled: true },
      ]),
      getStatisticsForTenant: vi.fn(() => ({ totalDevices: 1, onlineDevices: 1, offlineDevices: 0, degradedDevices: 0, lastUpdateTime: new Date(), avgLatencyMs: 8 })),
    } as any;
    const app = Fastify();
    app.addHook("onRequest", async (request) => { request.currentUser = { tenantId: "tenant-1" } as any; });
    await registerDVRNVRMonitorRoutes(app, service, { query: vi.fn() } as any);
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/v1/dvr-nvr/monitor/devices" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(response.json().data[0].id).toBe("nvr-1");
    await app.close();
  });
});
