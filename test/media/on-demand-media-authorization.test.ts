import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { MemoryStore } from "../../src/store.js";

describe("on-demand media authorization", () => {
  it("rejects cross-tenant media targets before invoking media services", async () => {
    const store = new MemoryStore();
    const app = await buildApp({ store });

    const response = await app.inject({
      method: "POST",
      url: "/v1/media/live-sessions",
      headers: { "x-user-id": "user-global-admin" },
      payload: {
        branchId: "branch-owned-by-other-tenant",
        cameraId: "camera-owned-by-other-tenant",
        purpose: "LIVE_VIEW",
        quality: "SUBSTREAM",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      success: false,
      error: "media_resource_not_found",
    });
    await app.close();
  });

  it("requires a branch identifier for snapshot authorization", async () => {
    const store = new MemoryStore();
    const app = await buildApp({ store });

    const response = await app.inject({
      method: "GET",
      url: "/v1/media/snapshots/camera-1",
      headers: { "x-user-id": "user-global-admin" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "branchId_required" });
    await app.close();
  });

  it("uses the durable canonical live grant instead of an in-process media session", async () => {
    const store = new MemoryStore();
    const branchId = "branch-media-contract";
    const cameraId = "camera-media-contract";
    store.nodes.set(branchId, {
      id: branchId, tenantId: "omsystems", type: "branch", name: "Media branch",
      parentId: null, path: [branchId], metadata: {},
    });
    store.nodes.set("camera-media-contract-node", {
      id: "camera-media-contract-node", tenantId: "omsystems", type: "camera", name: "Media camera",
      parentId: branchId, path: [branchId, "camera-media-contract-node"], metadata: {},
    });
    store.cameras.set(cameraId, {
      id: cameraId, name: "Media camera", nodeId: "camera-media-contract-node", branchId,
      vendor: "other", model: "Test", channel: 1, protocol: "rtsp", status: "online",
      profiles: [], capabilities: { ptz: false, audio: false, events: false },
      connectionSecretRef: "vault://test/media", sourceType: "ip-camera",
    });
    const app = await buildApp({ store });

    const created = await app.inject({
      method: "POST", url: "/v1/media/live-sessions", headers: { "x-user-id": "user-global-admin" },
      payload: { branchId, cameraId },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().data.token).toEqual(expect.any(String));
    expect(created.json().data.id).toEqual(expect.any(String));

    const retired = await app.inject({
      method: "POST", url: `/v1/media/live-sessions/${created.json().data.id}/renew`,
      headers: { "x-user-id": "user-global-admin" },
    });
    expect(retired.statusCode).toBe(410);
    await app.close();
  });
});
