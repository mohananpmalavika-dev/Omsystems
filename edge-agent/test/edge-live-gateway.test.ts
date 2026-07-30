import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildEdgeLiveGateway } from "../src/streaming/edge-live-gateway.js";

describe("all-in-one edge live gateway", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => { await app?.close(); app = undefined; });

  it("authorizes a dashboard session and creates a path from the branch-local secret", async () => {
    const paths: Array<{ path: string; source: string }> = [];
    const bridgeKey = "b".repeat(43);
    app = await buildEdgeLiveGateway({
      consumer: {
        consume: async () => ({
          id: "session-1", cameraId: "camera-1", cameraNodeId: "branch-1",
          userId: "user-1", tenantId: "tenant-1", connectionSecretRef: "edge://agent-1/camera-1",
          profiles: [{ name: "main", codec: "H264", width: 1920, height: 1080 }],
        }),
      },
      router: {
        ensurePath: async (path, source) => { paths.push({ path, source }); },
        removePath: async () => undefined,
      },
      resolveSecret: () => "rtsp://admin:secret@192.168.1.20/stream",
      edgeBridgeSharedKey: bridgeKey,
      publicBaseUrl: () => "https://branch-media.example.com",
      mediaMtxHlsUrl: "http://127.0.0.1:8888",
      accessTtlMs: 30_000,
    });

    const denied = await app.inject({
      method: "POST", url: "/v1/live/start",
      payload: { controlPlaneToken: "t".repeat(43) },
    });
    expect(denied.statusCode).toBe(401);

    const started = await app.inject({
      method: "POST", url: "/v1/live/start",
      headers: { "x-edge-bridge-key": bridgeKey },
      payload: { controlPlaneToken: "t".repeat(43) },
    });
    expect(started.statusCode).toBe(201);
    expect(paths).toEqual([{ path: "camera-camera-1", source: "rtsp://admin:secret@192.168.1.20/stream" }]);
    expect(started.json().hls.url).toBe("https://branch-media.example.com/hls/camera-camera-1/index.m3u8");

    const mediaAuth = await app.inject({
      method: "POST", url: "/internal/mediamtx/auth",
      payload: { action: "read", path: "camera-camera-1", query: `token=${started.json().hls.bearerToken}` },
    });
    expect(mediaAuth.statusCode).toBe(204);
  });
});
