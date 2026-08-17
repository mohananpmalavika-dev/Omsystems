import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { registerOnvifRoutes } from "../../src/routes/onvif.routes.js";
import { WsDiscovery } from "../../src/onvif/discovery/ws-discovery.js";

describe("ONVIF REST API Endpoints Suite", () => {
  it("serves /api/v1/onvif/discover endpoint with discovered devices", async () => {
    const mockDiscovery = new WsDiscovery();
    vi.spyOn(mockDiscovery, "discover").mockResolvedValue([
      {
        endpointReference: "urn:uuid:1111-2222-3333-4444",
        ipAddress: "192.168.1.100",
        port: 80,
        xaddrs: ["http://192.168.1.100:80/onvif/device_service"],
        types: ["dn:NetworkVideoTransmitter"],
        scopes: [],
        manufacturer: "Hanwha Vision",
        model: "XNV-6080R",
        profiles: ["Streaming", "G", "T"],
        discoveredAt: new Date(),
      },
    ]);

    const app = Fastify();
    await registerOnvifRoutes(app, { discovery: mockDiscovery });
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/onvif/discover",
      payload: { timeoutMs: 1000 },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.discoveredCount).toBe(1);
    expect(body.data.devices[0].manufacturer).toBe("Hanwha Vision");
    expect(body.data.devices[0].model).toBe("XNV-6080R");
  });
});
