import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

describe("camera storage access", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => app?.close());

  it("issues a one-time playback grant for an authorized camera", async () => {
    const store = new MemoryStore();
    app = await buildApp({ store, mediaGatewaySharedKey: "storage-media-gateway-key-123456" });
    const issued = await app.inject({
      method: "POST", url: "/v1/cameras/cam-001/storage-sessions",
      headers: { "x-user-id": "user-global-admin" },
    });
    expect(issued.statusCode).toBe(201);
    expect(issued.json()).toMatchObject({ cameraId: "cam-001", purpose: "playback" });
    const consume = () => app!.inject({
      method: "POST", url: "/internal/live-sessions/consume",
      headers: { "x-media-gateway-key": "storage-media-gateway-key-123456" },
      payload: { token: issued.json().token },
    });
    expect((await consume()).json().purpose).toBe("playback");
    expect((await consume()).statusCode).toBe(401);
  });
});
