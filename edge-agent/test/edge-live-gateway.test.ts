import { afterEach, describe, expect, it } from "vitest";
import {
  buildEdgeLiveGateway,
  resolvePrivateMediaGatewayUrl,
  resolveMediaTunnelMode,
  startEdgeMediaRuntimeIfAvailable,
  type EdgeLiveGateway,
} from "../src/streaming/edge-live-gateway.js";

describe("all-in-one edge live gateway", () => {
  let app: EdgeLiveGateway | undefined;
  afterEach(async () => { await app?.close(); app = undefined; });

  it("falls back to a quick tunnel when managed media is not provisioned", () => {
    expect(resolveMediaTunnelMode({
      MEDIA_TUNNEL_MODE: "named",
      MEDIA_QUICK_TUNNEL_FALLBACK: true,
      CLOUDFLARED_TUNNEL_TOKEN: undefined,
      PUBLIC_MEDIA_GATEWAY_URL: undefined,
    })).toBe("quick");
    expect(resolveMediaTunnelMode({
      MEDIA_TUNNEL_MODE: "named",
      MEDIA_QUICK_TUNNEL_FALLBACK: true,
      CLOUDFLARED_TUNNEL_TOKEN: "managed-tunnel-token",
      PUBLIC_MEDIA_GATEWAY_URL: "https://branch.media.example.com",
    })).toBe("named");
  });

  it("keeps discovery available when optional live media cannot start", async () => {
    const runtime = await startEdgeMediaRuntimeIfAvailable({} as never, async () => {
      throw new Error("public media tunnel unavailable");
    });
    expect(runtime).toBeUndefined();
  });

  it("advertises the physical private network for LAN and routed VPN viewers", () => {
    expect(resolvePrivateMediaGatewayUrl("auto", 8090, {
      "vEthernet (WSL)": [{ address: "172.26.160.1", family: "IPv4", internal: false } as any],
      "Tailscale VPN": [{ address: "100.95.10.4", family: "IPv4", internal: false } as any],
      "Wi-Fi": [{ address: "192.168.29.101", family: "IPv4", internal: false } as any],
    })).toBe("http://192.168.29.101:8090");
    expect(resolvePrivateMediaGatewayUrl("https://private-media.example.test", 8090, {}))
      .toBe("https://private-media.example.test");
  });

  it("authorizes a dashboard session and creates a path from the branch-local secret", async () => {
    const paths: Array<{ path: string; source: string }> = [];
    const bridgeKey = "b".repeat(43);
    app = buildEdgeLiveGateway({
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
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const liveCors = await fetch(`${baseUrl}/v1/live/start`, {
      method: "OPTIONS",
      headers: {
        origin: "https://dashboard.example.com",
        "access-control-request-private-network": "true",
      },
    });
    expect(liveCors.status).toBe(204);
    expect(liveCors.headers.get("access-control-allow-origin")).toBe("https://dashboard.example.com");
    expect(liveCors.headers.get("access-control-allow-private-network")).toBe("true");

    const cors = await fetch(`${baseUrl}/hls/camera-camera-1/index.m3u8`, {
      method: "OPTIONS",
      headers: { origin: "https://dashboard.example.com" },
    });
    expect(cors.status).toBe(204);
    expect(cors.headers.get("access-control-allow-origin")).toBe("https://dashboard.example.com");
    expect(cors.headers.get("access-control-allow-credentials")).toBe("true");

    const denied = await fetch(`${baseUrl}/v1/live/start`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ controlPlaneToken: "t".repeat(43) }),
    });
    expect(denied.status).toBe(401);

    const started = await fetch(`${baseUrl}/v1/live/start`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-edge-bridge-key": bridgeKey },
      body: JSON.stringify({ controlPlaneToken: "t".repeat(43) }),
    });
    expect(started.status).toBe(201);
    const session = await started.json() as any;
    expect(paths).toEqual([{ path: "camera-camera-1", source: "rtsp://admin:secret@192.168.1.20/stream" }]);
    expect(session.hls.url).toBe("https://branch-media.example.com/hls/camera-camera-1/index.m3u8");

    const mediaAuth = await fetch(`${baseUrl}/internal/mediamtx/auth`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "read", path: "camera-camera-1", query: `token=${session.hls.bearerToken}` }),
    });
    expect(mediaAuth.status).toBe(204);
  });
});
