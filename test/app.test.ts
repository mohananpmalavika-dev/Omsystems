import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

describe("control-plane API", () => {
  let app: FastifyInstance;
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore();
    app = await buildApp({ store });
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

  it("lists only branches the employee may configure", async () => {
    const allowed = await app.inject({
      method: "GET",
      url: "/v1/branches?action=device%3Aconfigure",
      headers: { "x-user-id": "user-global-admin" },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().data).toHaveLength(1);

    const denied = await app.inject({
      method: "GET",
      url: "/v1/branches?action=device%3Aconfigure",
      headers: { "x-user-id": "user-south-operator" },
    });
    expect(denied.statusCode).toBe(200);
    expect(denied.json().data).toHaveLength(0);
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

    const agentList = await app.inject({
      method: "GET",
      url: "/v1/branches/branch-blr-001/edge-agents",
      headers,
    });
    expect(agentList.statusCode).toBe(200);
    expect(agentList.json().data).toEqual([agent]);

    const deniedAgentList = await app.inject({
      method: "GET",
      url: "/v1/branches/branch-blr-001/edge-agents",
      headers: { "x-user-id": "user-south-operator" },
    });
    expect(deniedAgentList.statusCode).toBe(403);

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

  it("creates bookmarks and protects incident recording windows", async () => {
    const headers = { "x-user-id": "user-global-admin" };
    const bookmarkResponse = await app.inject({
      method: "POST",
      url: "/v1/cameras/cam-001/bookmarks",
      headers,
      payload: {
        bookmarkedAt: "2026-07-21T10:00:00.000Z",
        reason: "unauthorized-entry",
        notes: "Person entered through the restricted door",
        priority: "high",
      },
    });
    expect(bookmarkResponse.statusCode).toBe(201);
    expect(bookmarkResponse.json()).toMatchObject({
      cameraId: "cam-001",
      reason: "unauthorized-entry",
      priority: "high",
    });

    const incidentResponse = await app.inject({
      method: "POST",
      url: "/v1/cameras/cam-001/incidents",
      headers,
      payload: {
        occurredAt: "2026-07-21T10:05:00.000Z",
        title: "Restricted entrance opened",
        notes: "Operator observed an unknown person",
        priority: "P1",
        preRollSeconds: 60,
        postRollSeconds: 300,
      },
    });
    expect(incidentResponse.statusCode).toBe(201);
    expect(incidentResponse.json()).toMatchObject({
      cameraId: "cam-001",
      priority: "P1",
      status: "new",
      recordingFrom: "2026-07-21T10:04:00.000Z",
      recordingTo: "2026-07-21T10:10:00.000Z",
    });
    const incident = incidentResponse.json();
    expect(store.recordingLegalHolds).toContainEqual(expect.objectContaining({
      id: incident.legalHoldId,
      cameraId: "cam-001",
      fromAt: incident.recordingFrom,
      toAt: incident.recordingTo,
    }));
    expect(store.liveBookmarks).toContainEqual(expect.objectContaining({
      id: incident.bookmarkId,
      incidentId: incident.id,
      priority: "critical",
    }));
    expect(store.auditEvents.map((event) => event.action)).toEqual(
      expect.arrayContaining(["live.bookmark_created", "live.incident_created"]),
    );

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/cameras/cam-001/incidents",
      headers,
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().data).toHaveLength(1);

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/v1/cameras/cam-001/incidents/${incident.id}`,
      headers,
      payload: { status: "investigating" },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().status).toBe("investigating");
  });

  it("denies incident creation without alarm acknowledgement permission", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/cameras/cam-001/incidents",
      headers: { "x-user-id": "user-branch-manager" },
      payload: {
        title: "Test incident",
        priority: "P3",
        preRollSeconds: 60,
        postRollSeconds: 300,
      },
    });
    expect(response.statusCode).toBe(403);
    expect(store.liveIncidents).toHaveLength(0);
  });
});
