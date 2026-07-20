import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

describe("control-plane API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("requires a development identity", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/branches" });
    expect(response.statusCode).toBe(401);
  });

  it("requires the edge bridge identity when configured", async () => {
    const bridgeKey = "b".repeat(43);
    const bridgedApp = await buildApp({ edgeBridgeSharedKey: bridgeKey });
    try {
      const denied = await bridgedApp.inject({
        method: "GET",
        url: "/v1/branches",
        headers: { "x-user-id": "user-global-admin" },
      });
      expect(denied.statusCode).toBe(401);
      expect(denied.json().error).toBe("invalid_bridge_identity");

      const allowed = await bridgedApp.inject({
        method: "GET",
        url: "/v1/branches",
        headers: {
          "x-user-id": "user-global-admin",
          "x-edge-bridge-key": bridgeKey,
        },
      });
      expect(allowed.statusCode).toBe(200);
    } finally {
      await bridgedApp.close();
    }
  });

  it("filters cameras according to camera-group restrictions", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/branches/branch-blr-001/cameras",
      headers: { "x-user-id": "user-branch-manager" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(response.json().data[0].id).toBe("cam-001");
    expect(response.body).not.toContain("connectionSecretRef");
  });

  it("supports edge registration, discovery, approval and live sessions", async () => {
    const headers = { "x-user-id": "user-global-admin" };
    const agentResponse = await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/edge-agents/register",
      headers,
      payload: { name: "BLR-001 Edge", version: "0.1.0" },
    });
    expect(agentResponse.statusCode).toBe(201);
    const agent = agentResponse.json();

    const heartbeat = await app.inject({
      method: "POST",
      url: `/v1/edge-agents/${agent.id}/heartbeat`,
      headers,
      payload: { version: "0.1.0" },
    });
    expect(heartbeat.statusCode).toBe(200);
    expect(heartbeat.json().status).toBe("online");

    const discoveryResponse = await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/cameras/discovered",
      headers,
      payload: {
        edgeAgentId: agent.id,
        vendor: "hikvision",
        model: "DS-2CD-Test",
        ipAddress: "192.168.10.20",
        onvifPort: 80,
        rtspPort: 554,
        profiles: [
          { name: "main", codec: "H264", width: 1920, height: 1080 },
        ],
        capabilities: { ptz: false, audio: true, events: true },
      },
    });
    expect(discoveryResponse.statusCode).toBe(202);
    const discovery = discoveryResponse.json();

    const approvalResponse = await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/cameras",
      headers,
      payload: {
        discoveryId: discovery.id,
        name: "Pilot Entrance",
        channel: 3,
        protocol: "onvif-t",
        connectionSecretRef: "vault://pilot/camera-003",
      },
    });
    expect(approvalResponse.statusCode).toBe(201);
    expect(approvalResponse.body).not.toContain("connectionSecretRef");
    const camera = approvalResponse.json();

    const sessionResponse = await app.inject({
      method: "POST",
      url: `/v1/cameras/${camera.id}/live-sessions`,
      headers,
    });
    expect(sessionResponse.statusCode).toBe(201);
    expect(sessionResponse.json().token).toHaveLength(43);
  });
});
