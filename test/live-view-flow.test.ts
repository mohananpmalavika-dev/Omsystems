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

function addLiveViewFixture(store: MemoryStore) {
  store.nodes.set("company-live-test", {
    id: "company-live-test",
    parentId: null,
    tenantId: "omsystems",
    type: "company",
    name: "Live view test company",
    path: ["company-live-test"],
  });
  store.nodes.set("camera-live-test-node", {
    id: "camera-live-test-node",
    parentId: "company-live-test",
    tenantId: "omsystems",
    type: "camera",
    name: "Live view test camera",
    path: ["company-live-test", "camera-live-test-node"],
  });
  store.users.set("user-live-test", {
    id: "user-live-test",
    displayName: "Live view test operator",
    tenantId: "omsystems",
  });
  store.grants.push({
    userId: "user-live-test",
    scopeNodeId: "company-live-test",
    actions: ["live:view"],
    effect: "allow",
  });
  store.cameras.set("camera-live-test", {
    id: "camera-live-test",
    name: "Live view test camera",
    nodeId: "camera-live-test-node",
    branchId: "company-live-test",
    vendor: "other",
    model: "Test camera",
    channel: 1,
    protocol: "rtsp",
    status: "online",
    profiles: [{ name: "main", codec: "H264", width: 1920, height: 1080, role: "main" }],
    capabilities: { ptz: false, audio: false, events: false },
    connectionSecretRef: "vault://live-view-test/camera",
    sourceType: "ip-camera",
  });
}

describe("complete authorized live-view handshake", () => {
  let control: FastifyInstance | undefined;
  let media: FastifyInstance | undefined;

  afterEach(async () => {
    await media?.close();
    await control?.close();
  });

  it("turns a scoped permission into one protected media path", async () => {
    const store = new MemoryStore();
    addLiveViewFixture(store);
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
      url: "/v1/cameras/camera-live-test/live-sessions",
      headers: { "x-user-id": "user-live-test" },
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
