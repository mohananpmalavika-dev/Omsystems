import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { MemoryStore } from "../../src/store.js";

describe("Talkback REST API Routes", () => {
  let app: FastifyInstance;
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore();
    app = await buildApp({ store, mediaGatewaySharedKey: "test-shared-key" });
  });

  afterEach(async () => {
    await app.close();
  });

  it("queries active talkback state on camera", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/cameras/cam-001/talk-sessions/active",
      headers: { "x-user-id": "user-south-operator" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ active: false });
  });

  it("queries talkback device capability", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/cameras/cam-001/talkback/capability",
      headers: { "x-user-id": "user-global-admin" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.camera_id).toBe("cam-001");
    expect(body.supported).toBe(true);
    expect(body.codecs).toContain("PCMA");
  });

  it("runs backchannel diagnostic test", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/cameras/cam-001/talkback/test",
      headers: { "x-user-id": "user-global-admin" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("healthy");
    expect(body.diagnostics.audioHardware).toBe(true);
  });

  it("manages talk session lifecycle through REST API", async () => {
    // 1. Initiate talk session
    const startRes = await app.inject({
      method: "POST",
      url: "/v1/cameras/cam-001/talk-sessions",
      headers: { "x-user-id": "user-south-operator" },
    });
    expect(startRes.statusCode).toBe(201);
    const started = startRes.json();
    expect(started.id).toBeDefined();

    // 2. Heartbeat to extend lease
    const hbRes = await app.inject({
      method: "POST",
      url: `/v1/cameras/cam-001/talk-sessions/${started.id}/heartbeat`,
      headers: { "x-user-id": "user-south-operator" },
      payload: { ttlMs: 45000 },
    });
    // In our implementation, repository records lease
    expect(hbRes.statusCode).toBe(200);

    // 3. Query stats
    const statsRes = await app.inject({
      method: "GET",
      url: "/v1/talk-sessions/stats",
      headers: { "x-user-id": "user-global-admin" },
    });
    expect(statsRes.statusCode).toBe(200);
    expect(statsRes.json().totalSessions).toBeGreaterThanOrEqual(0);

    // 4. Query history
    const historyRes = await app.inject({
      method: "GET",
      url: "/v1/talk-sessions/history?cameraId=cam-001",
      headers: { "x-user-id": "user-global-admin" },
    });
    expect(historyRes.statusCode).toBe(200);
    expect(historyRes.json().success).toBe(true);

    // 5. Cleanly end talk session
    const endRes = await app.inject({
      method: "DELETE",
      url: `/v1/cameras/cam-001/talk-sessions/${started.id}`,
      headers: { "x-user-id": "user-south-operator" },
    });
    expect(endRes.statusCode).toBe(200);
    expect(endRes.json().status).toBe("ended");
  });
});
