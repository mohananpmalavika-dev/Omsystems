import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

describe("authorized talkback handshake", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => app?.close());

  it("issues a one-time talk session only to a scoped operator and audits it", async () => {
    const store = new MemoryStore(); const sharedKey = "talkback-media-gateway-key-123456";
    app = await buildApp({ store, mediaGatewaySharedKey: sharedKey });
    const denied = await app.inject({
      method: "POST", url: "/v1/cameras/cam-001/talk-sessions",
      headers: { "x-user-id": "user-evidence-officer" },
    });
    expect(denied.statusCode).toBe(403);

    const issued = await app.inject({
      method: "POST", url: "/v1/cameras/cam-001/talk-sessions",
      headers: { "x-user-id": "user-south-operator" },
    });
    expect(issued.statusCode).toBe(201);
    expect(issued.json()).toMatchObject({ cameraId: "cam-001", userId: "user-south-operator", purpose: "talk" });

    const consumed = await app.inject({
      method: "POST", url: "/internal/live-sessions/consume",
      headers: { "x-media-gateway-key": sharedKey }, payload: { token: issued.json().token },
    });
    expect(consumed.statusCode).toBe(200);
    expect(consumed.json()).toMatchObject({ purpose: "talk", vendor: "hikvision", channel: 1 });
    const replay = await app.inject({
      method: "POST", url: "/internal/live-sessions/consume",
      headers: { "x-media-gateway-key": sharedKey }, payload: { token: issued.json().token },
    });
    expect(replay.statusCode).toBe(401);
    expect(store.auditEvents.map((event) => event.action)).toEqual(expect.arrayContaining([
      "talk_session.created", "talk_session.consumed",
    ]));
  }, 20_000);

  it("rejects cameras with no audio path before contacting the edge", async () => {
    app = await buildApp({ store: new MemoryStore() });
    const response = await app.inject({
      method: "POST", url: "/v1/cameras/cam-002/talk-sessions",
      headers: { "x-user-id": "user-global-admin" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("talkback_not_supported");
  }, 20_000);
});
