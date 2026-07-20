import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildMediaGateway } from "../src/app.js";
import type {
  ControlPlaneClient,
  MediaRouter,
  StreamSecretProvider,
} from "../src/contracts.js";

describe("authorized media startup", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it("consumes a control-plane token and restricts MediaMTX to its path", async () => {
    const router: MediaRouter = {
      ensurePath: vi.fn(async () => undefined),
      removePath: vi.fn(async () => undefined),
    };
    const controlPlane: ControlPlaneClient = {
      consumeLiveSession: vi.fn(async () => ({
        id: "control-session",
        cameraId: "cam-001",
        cameraNodeId: "camera-entrance",
        userId: "user-global-admin",
        tenantId: "omsystems",
        connectionSecretRef: "vault://pilot/camera-1",
        profiles: [
          { name: "main", codec: "H264", width: 1920, height: 1080 },
        ],
      })),
    };
    const secrets: StreamSecretProvider = {
      resolve: vi.fn(async () => "rtsp://operator:secret@192.168.1.10/live"),
    };
    app = await buildMediaGateway({
      controlPlane,
      router,
      secrets,
      publicHlsBaseUrl: "https://media.example/hls",
      publicWebRtcBaseUrl: "https://media.example/webrtc",
      accessTtlMs: 60_000,
    });

    const start = await app.inject({
      method: "POST",
      url: "/v1/live/start",
      payload: { controlPlaneToken: "a".repeat(43) },
    });
    expect(start.statusCode).toBe(201);
    const session = start.json();
    expect(session.path).toBe("camera-cam-001");
    expect(session.hls.url).toBe(
      "https://media.example/hls/camera-cam-001/index.m3u8",
    );
    expect(router.ensurePath).toHaveBeenCalledWith(
      "camera-cam-001",
      "rtsp://operator:secret@192.168.1.10/live",
    );

    const allowed = await app.inject({
      method: "POST",
      url: "/internal/mediamtx/auth",
      payload: {
        token: session.hls.bearerToken,
        action: "read",
        path: "camera-cam-001",
      },
    });
    expect(allowed.statusCode).toBe(204);

    const denied = await app.inject({
      method: "POST",
      url: "/internal/mediamtx/auth",
      payload: {
        token: session.hls.bearerToken,
        action: "read",
        path: "camera-different",
      },
    });
    expect(denied.statusCode).toBe(401);
  });
});
