import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../../src/app.js";
import { MemoryStore } from "../../src/store.js";
import type { FastifyInstance } from "fastify";

const authHeaders = { "x-user-id": "user-global-admin" };

describe("Live Session Lifecycle Management", () => {
  let app: FastifyInstance;
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore();
    app = await buildApp({ store });
  });

  it("creates, renews, and deletes media live sessions", async () => {
    // 1. Create live session
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/media/live-sessions",
      headers: authHeaders,
      payload: {
        cameraId: "CAM-178-07",
        quality: "SUB",
      },
    });

    expect(createRes.statusCode).toBe(201);
    const createJson = JSON.parse(createRes.body);
    expect(createJson.success).toBe(true);
    expect(createJson.data.sessionId).toBeDefined();
    expect(createJson.data.quality).toBe("SUB");
    expect(createJson.data.renewAfterSeconds).toBe(240);

    const sessionId = createJson.data.sessionId;

    // 2. Renew session
    const renewRes = await app.inject({
      method: "POST",
      url: `/v1/media/live-sessions/${encodeURIComponent(sessionId)}/renew`,
      headers: authHeaders,
    });

    expect(renewRes.statusCode).toBe(200);
    const renewJson = JSON.parse(renewRes.body);
    expect(renewJson.success).toBe(true);
    expect(renewJson.expiresAt).toBeDefined();

    // 3. Delete session
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/v1/media/live-sessions/${encodeURIComponent(sessionId)}`,
      headers: authHeaders,
    });

    expect(deleteRes.statusCode).toBe(200);
    const deleteJson = JSON.parse(deleteRes.body);
    expect(deleteJson.success).toBe(true);
    expect(deleteJson.terminated).toBe(true);
  });
});
