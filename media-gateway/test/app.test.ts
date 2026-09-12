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

    const allowedPasswordFallback = await app.inject({
      method: "POST",
      url: "/internal/mediamtx/auth",
      payload: {
        token: "",
        password: session.hls.bearerToken,
        action: "read",
        path: "camera-cam-001",
      },
    });
    expect(allowedPasswordFallback.statusCode).toBe(204);

    const allowedQueryFallback = await app.inject({
      method: "POST",
      url: "/internal/mediamtx/auth",
      payload: {
        token: "",
        action: "read",
        path: "camera-cam-001",
        query: `token=${encodeURIComponent(session.hls.bearerToken)}`,
      },
    });
    expect(allowedQueryFallback.statusCode).toBe(204);

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

  it("protects live startup with the edge bridge identity", async () => {
    const bridgeKey = "b".repeat(43);
    app = await buildMediaGateway({
      controlPlane: {
        consumeLiveSession: vi.fn(async () => {
          throw new Error("must not be called without bridge authentication");
        }),
      },
      router: {
        ensurePath: vi.fn(async () => undefined),
        removePath: vi.fn(async () => undefined),
      },
      secrets: { resolve: vi.fn(async () => undefined) },
      publicHlsBaseUrl: "https://media.example/hls",
      publicWebRtcBaseUrl: "https://media.example/webrtc",
      accessTtlMs: 60_000,
      edgeBridgeSharedKey: bridgeKey,
    });

    const denied = await app.inject({
      method: "POST",
      url: "/v1/live/start",
      payload: { controlPlaneToken: "a".repeat(43) },
    });
    expect(denied.statusCode).toBe(401);
    expect(denied.json().error).toBe("invalid_bridge_identity");
  });

  it("rejects a live session when no real camera source can be resolved", async () => {
    app = await buildMediaGateway({
      controlPlane: {
        consumeLiveSession: vi.fn(async () => ({
          id: "control-session",
          cameraId: "cam-001",
          cameraNodeId: "camera-entrance",
          userId: "user-global-admin",
          tenantId: "omsystems",
          connectionSecretRef: "edge://offline/cam-001",
          profiles: [],
        })),
      },
      router: {
        ensurePath: vi.fn(async () => undefined),
        removePath: vi.fn(async () => undefined),
      },
      secrets: { resolve: vi.fn(async () => undefined) },
      publicHlsBaseUrl: "https://media.example/hls",
      publicWebRtcBaseUrl: "https://media.example/webrtc",
      accessTtlMs: 60_000,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/live/start",
      payload: { controlPlaneToken: "a".repeat(43) },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: "stream_secret_unavailable" });
  });

  it("issues a viewer token for an already-published portable camera", async () => {
    const router: MediaRouter = {
      ensurePath: vi.fn(async () => undefined),
      removePath: vi.fn(async () => undefined),
    };
    const secrets: StreamSecretProvider = {
      resolve: vi.fn(async () => undefined),
    };
    app = await buildMediaGateway({
      controlPlane: {
        consumeLiveSession: vi.fn(async () => ({
          id: "control-session",
          cameraId: "portable-001",
          cameraNodeId: "branch-001",
          userId: "user-001",
          tenantId: "tenant-001",
          connectionSecretRef: "rtsp://media-gateway:8554/camera-device-001",
          sourceType: "browser-camera",
          profiles: [],
        })),
      },
      router,
      secrets,
      publicHlsBaseUrl: "https://media.example/hls",
      publicWebRtcBaseUrl: "https://media.example/webrtc",
      accessTtlMs: 60_000,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/live/start",
      payload: { controlPlaneToken: "a".repeat(43) },
    });

    expect(response.statusCode).toBe(201);
    expect(router.ensurePath).not.toHaveBeenCalled();
    expect(secrets.resolve).not.toHaveBeenCalled();
    expect(response.json().path).toBe("camera-portable-001");
  });

  it("proxies HLS playlists through the gateway public port", async () => {
    const upstream = await import("node:http").then(({ createServer }) =>
      createServer((request, response) => {
        expect(request.url).toBe("/camera-cam-001/index.m3u8?token=session-token");
        response.writeHead(200, {
          "content-type": "application/vnd.apple.mpegurl",
          "access-control-allow-origin": "https://dashboard.example",
        });
        response.end("#EXTM3U\n");
      })
    );
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const address = upstream.address();
    if (!address || typeof address === "string") throw new Error("test server unavailable");

    try {
      app = await buildMediaGateway({
        controlPlane: {
          consumeLiveSession: vi.fn(async () => {
            throw new Error("not used");
          }),
        },
        router: {
          ensurePath: vi.fn(async () => undefined),
          removePath: vi.fn(async () => undefined),
        },
        secrets: { resolve: vi.fn(async () => undefined) },
        publicHlsBaseUrl: "https://media.example/hls",
        publicWebRtcBaseUrl: "https://media.example/webrtc",
        mediaMtxHlsUrl: `http://127.0.0.1:${address.port}`,
        accessTtlMs: 60_000,
      });

      const response = await app.inject({
        method: "GET",
        url: "/hls/camera-cam-001/index.m3u8?token=session-token",
        headers: {
          origin: "https://dashboard.example",
          "access-control-request-private-network": "true",
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe("#EXTM3U\n");
      expect(response.headers["content-type"]).toContain(
        "application/vnd.apple.mpegurl",
      );
      expect(response.headers["access-control-allow-origin"]).toBe(
        "https://dashboard.example",
      );
      expect(response.headers["access-control-allow-private-network"]).toBe("true");
    } finally {
      await new Promise<void>((resolve, reject) =>
        upstream.close((error) => error ? reject(error) : resolve())
      );
    }
  });

  it("handles push-to-talk backchannel startup, audio streaming, and single-talker locking", async () => {
    const controlPlane: ControlPlaneClient = {
      consumeLiveSession: vi.fn(async (token: string) => {
        if (token === "talk-token-busy") {
          return {
            id: "talk-session-2",
            cameraId: "cam-talk-01",
            cameraNodeId: "node-1",
            userId: "user-2",
            tenantId: "tenant-1",
            purpose: "talk" as const,
            connectionSecretRef: "secret://cam-talk-01",
            profiles: [],
          };
        }
        return {
          id: "talk-session-1",
          cameraId: "cam-talk-01",
          cameraNodeId: "node-1",
          userId: "user-1",
          tenantId: "tenant-1",
          purpose: "talk" as const,
          connectionSecretRef: "secret://cam-talk-01",
          profiles: [],
        };
      }),
    };
    const secrets: StreamSecretProvider = {
      resolve: vi.fn(async () => "rtsp://camera:554/live"),
    };
    const router: MediaRouter = {
      ensurePath: vi.fn(async () => undefined),
      removePath: vi.fn(async () => undefined),
    };

    app = await buildMediaGateway({
      controlPlane,
      router,
      secrets,
      publicHlsBaseUrl: "https://media.example/hls",
      publicWebRtcBaseUrl: "https://media.example/webrtc",
      accessTtlMs: 30_000,
    });

    // 1. Start talkback session
    const startRes = await app.inject({
      method: "POST",
      url: "/v1/talk/start",
      payload: { controlPlaneToken: "a".repeat(43) },
    });
    expect(startRes.statusCode).toBe(201);
    const session = startRes.json();
    expect(session.sessionId).toBe("talk-session-1");
    expect(session.cameraId).toBe("cam-talk-01");
    expect(session.adapter).toBe("onvif-rtsp-backchannel");
    expect(session.audio.url).toContain("/v1/talk/talk-session-1/audio");

    // 2. Reject concurrent talkback on same camera (Single-Talker Mutex)
    const busyRes = await app.inject({
      method: "POST",
      url: "/v1/talk/start",
      payload: { controlPlaneToken: "talk-token-busy" + "b".repeat(30) },
    });
    expect(busyRes.statusCode).toBe(409);
    expect(busyRes.json().error).toBe("talkback_busy");

    // 3. Send PCM16 audio chunk
    const pcmChunk = Buffer.from(new Int16Array([0, 500, -500, 1000]).buffer);
    const audioRes = await app.inject({
      method: "POST",
      url: `/v1/talk/${session.sessionId}/audio`,
      headers: {
        authorization: `Bearer ${session.audio.bearerToken}`,
        "content-type": "audio/L16",
      },
      payload: pcmChunk,
    });
    expect(audioRes.statusCode).toBe(202);

    // 4. Unauthorized audio chunk rejected
    const unauthRes = await app.inject({
      method: "POST",
      url: `/v1/talk/${session.sessionId}/audio`,
      headers: {
        authorization: "Bearer wrong-token",
        "content-type": "audio/L16",
      },
      payload: pcmChunk,
    });
    expect(unauthRes.statusCode).toBe(401);

    // 5. End talk session
    const endRes = await app.inject({
      method: "DELETE",
      url: `/v1/talk/${session.sessionId}`,
      headers: {
        authorization: `Bearer ${session.audio.bearerToken}`,
      },
    });
    expect(endRes.statusCode).toBe(204);

    // 6. Camera is now free for new talker
    const nextStartRes = await app.inject({
      method: "POST",
      url: "/v1/talk/start",
      payload: { controlPlaneToken: "talk-token-busy" + "b".repeat(30) },
    });
    expect(nextStartRes.statusCode).toBe(201);
  });
});
