import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { registerDeviceConnectivityRoutes } from "../src/device-connectivity/routes/device-connectivity.routes.js";

describe("device connectivity routes", () => {
  it("returns transport-unavailable evidence instead of a synthetic stream pass", async () => {
    const app = Fastify();
    await registerDeviceConnectivityRoutes(app);
    const response = await app.inject({ method: "POST", url: "/v1/connectivity/verify-stream", payload: { host: "192.168.1.20", port: 554 } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ success: false, data: { overallHealthy: false } });
    await app.close();
  });

  it("rejects invalid targets and does not invent status for unknown devices", async () => {
    const app = Fastify();
    await registerDeviceConnectivityRoutes(app);
    const invalid = await app.inject({ method: "POST", url: "/v1/connectivity/probe", payload: { host: "host name", port: 70_000 } });
    expect(invalid.statusCode).toBe(400);
    const unknown = await app.inject({ method: "GET", url: "/v1/connectivity/device/no-such-device" });
    expect(unknown.statusCode).toBe(404);
    await app.close();
  });
});
