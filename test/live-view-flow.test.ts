import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";
import { buildMediaGateway } from "../media-gateway/src/app.js";
import {
  GatewayError,
} from "../media-gateway/src/control-plane-client.js";
import type {
  ControlPlaneClient,
  MediaRouter,
} from "../media-gateway/src/contracts.js";

describe("complete authorized live-view handshake", () => {
  let control: FastifyInstance | undefined;
  let media: FastifyInstance | undefined;

  afterEach(async () => {
    await media?.close();
    await control?.close();
  });

  it("turns a scoped permission into one protected media path", async () => {
    const store = new MemoryStore();
    const sharedKey = "test-media-gateway-shared-key-123456";
    control = await buildApp({
      store,
      mediaGatewaySharedKey: sharedKey,
    });

    const controlClient: ControlPlaneClient = {
      consumeLiveSession: async (token) => {
        const response = await control!.inject({
          method: "POST",
          url: "/internal/live-sessions/consume",
          headers: { "x-media-gateway-key": sharedKey },
          payload: { token },
        });
        if (response.statusCode !== 200) {
          throw new GatewayError(401, "invalid_live_session");
        }
        return response.json();
      },
    };
    const router: MediaRouter = {
      ensurePath: vi.fn(async () => undefined),
      removePath: vi.fn(async () => undefined),
    };
    media = await buildMediaGateway({
      controlPlane: controlClient,
      router,
      secrets: {
        resolve: async () => "rtsp://edge-only:secret@192.168.1.10/live",
      },
      publicHlsBaseUrl: "http://localhost:8888",
      publicWebRtcBaseUrl: "http://localhost:8889",
      accessTtlMs: 60_000,
    });

    const permissionResponse = await control.inject({
      method: "POST",
      url: "/v1/cameras/cam-001/live-sessions",
      headers: { "x-user-id": "user-south-operator" },
    });
    expect(permissionResponse.statusCode).toBe(201);
    const controlToken = permissionResponse.json().token;

    const start = await media.inject({
      method: "POST",
      url: "/v1/live/start",
      payload: { controlPlaneToken: controlToken },
    });
    expect(start.statusCode).toBe(201);
    expect(start.body).not.toContain("edge-only");
    expect(start.body).not.toContain("192.168.1.10");

    const replay = await media.inject({
      method: "POST",
      url: "/v1/live/start",
      payload: { controlPlaneToken: controlToken },
    });
    expect(replay.statusCode).toBe(401);

    expect(store.auditEvents.map((event) => event.action)).toContain(
      "live_session.consumed",
    );
  });
});
