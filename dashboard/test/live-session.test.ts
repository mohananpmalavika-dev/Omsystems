import { afterEach, describe, expect, it, vi } from "vitest";
import { startLive } from "../lib/backend";

const originalDemoMode = process.env.DASHBOARD_DEMO_MODE;
const originalControlUrl = process.env.CONTROL_PLANE_INTERNAL_URL;
const originalMediaUrl = process.env.MEDIA_GATEWAY_INTERNAL_URL;
const originalLocalMediaUrl = process.env.MEDIA_GATEWAY_LOCAL_URL;
const originalPublicMediaUrl = process.env.MEDIA_GATEWAY_PUBLIC_URL;
const originalPublicMediaUrls = process.env.MEDIA_GATEWAY_PUBLIC_URLS;
const originalDevUser = process.env.DASHBOARD_DEV_USER_ID;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  vi.unstubAllGlobals();
  restore("DASHBOARD_DEMO_MODE", originalDemoMode);
  restore("CONTROL_PLANE_INTERNAL_URL", originalControlUrl);
  restore("MEDIA_GATEWAY_INTERNAL_URL", originalMediaUrl);
  restore("MEDIA_GATEWAY_LOCAL_URL", originalLocalMediaUrl);
  restore("MEDIA_GATEWAY_PUBLIC_URL", originalPublicMediaUrl);
  restore("MEDIA_GATEWAY_PUBLIC_URLS", originalPublicMediaUrls);
  restore("DASHBOARD_DEV_USER_ID", originalDevUser);
  restore("NODE_ENV", originalNodeEnv);
});

describe("dashboard live session startup", () => {
  it("uses the configured dashboard identity and returns the gateway session", async () => {
    process.env.DASHBOARD_DEMO_MODE = "false";
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    process.env.MEDIA_GATEWAY_INTERNAL_URL = "http://media.internal:8090";
    process.env.DASHBOARD_DEV_USER_ID = "user-global-admin";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("control.internal")) {
        return Response.json({ token: "t".repeat(43) }, { status: 201 });
      }
      return Response.json({
        cameraId: "camera-1",
        hls: { url: "https://media.example/hls/camera-1/index.m3u8", bearerToken: "stream-token" },
      }, { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(startLive("camera-1")).resolves.toMatchObject({
      cameraId: "camera-1",
      hls: { url: "https://media.example/hls/camera-1/index.m3u8" },
    });

    const controlHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(controlHeaders.get("x-user-id")).toBe("user-global-admin");
    expect(controlHeaders.has("authorization")).toBe(false);
  });

  it("does not impersonate a development user in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    process.env.DASHBOARD_DEV_USER_ID = "user-global-admin";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.has("x-user-id")).toBe(false);
      expect(headers.has("authorization")).toBe(false);
      return Response.json({ error: "unauthenticated" }, { status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(startLive("camera-1")).rejects.toThrow("unauthenticated");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not manufacture a demo stream when the media gateway rejects a session", async () => {
    process.env.DASHBOARD_DEMO_MODE = "false";
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    process.env.MEDIA_GATEWAY_INTERNAL_URL = "http://media.internal:8090";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("control.internal")) {
        return Response.json({ token: "t".repeat(43) }, { status: 201 });
      }
      return Response.json({ error: "stream_secret_unavailable" }, { status: 503 });
    }));

    await expect(startLive("camera-1")).rejects.toThrow("stream_secret_unavailable");
  });

  it("uses the configured local gateway as a fallback when the agent does not advertise one", async () => {
    process.env.DASHBOARD_DEMO_MODE = "false";
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    process.env.MEDIA_GATEWAY_LOCAL_URL = "http://192.168.29.101:8090";
    process.env.MEDIA_GATEWAY_PUBLIC_URL = "https://public.example";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("control.internal")) {
        return Response.json({
          token: "t".repeat(43),
          mediaGatewayUrl: "https://expired-tunnel.example",
        }, { status: 201 });
      }
      return Response.json({
        cameraId: "camera-1",
        hls: { url: "http://192.168.29.101:8888/live/camera-1/index.m3u8", bearerToken: "stream-token" },
      }, { status: 201 });
    }));

    await expect(startLive("camera-1")).resolves.toMatchObject({
      direct: {
        url: "http://192.168.29.101:8090/v1/live/start",
      },
      directFallbacks: [{
        url: "https://expired-tunnel.example/v1/live/start",
      }],
    });
  });

  it("prefers the camera's advertised local gateway over a workstation-wide fallback", async () => {
    process.env.DASHBOARD_DEMO_MODE = "false";
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    process.env.MEDIA_GATEWAY_LOCAL_URL = "http://127.0.0.1:8090";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("control.internal");
      return Response.json({
        token: "t".repeat(43),
        mediaGatewayUrl: "https://branch-public.example",
        localMediaGatewayUrl: "http://192.168.50.25:8090",
      }, { status: 201 });
    }));

    await expect(startLive("camera-1")).resolves.toMatchObject({
      cameraId: "camera-1",
      direct: { url: "http://192.168.50.25:8090/v1/live/start" },
      directFallbacks: [{ url: "https://branch-public.example/v1/live/start" }],
    });
  });

  it("uses the camera's public gateway for an explicit public retry", async () => {
    process.env.NODE_ENV = "production";
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    process.env.MEDIA_GATEWAY_PUBLIC_URL = "https://current-public.example";
    process.env.MEDIA_GATEWAY_INTERNAL_URL = "http://media.internal:8090";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("control.internal")) {
        return Response.json({
          token: "t".repeat(43),
          mediaGatewayUrl: "https://expired-tunnel.example",
          localMediaGatewayUrl: "http://192.168.29.101:8090",
        }, { status: 201 });
      }
      expect(url).toBe("https://expired-tunnel.example/v1/live/start");
      return Response.json({
        cameraId: "camera-1",
        hls: { url: "http://127.0.0.1:8888/hls/camera-1/index.m3u8", bearerToken: "stream-token" },
      }, { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(startLive("camera-1", undefined, "public")).resolves.toMatchObject({
      hls: { url: "https://expired-tunnel.example/hls/camera-1/index.m3u8" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses a mapped public gateway replacement for a stale camera tunnel", async () => {
    process.env.NODE_ENV = "production";
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    process.env.MEDIA_GATEWAY_PUBLIC_URL = "https://unrelated-global.example";
    process.env.MEDIA_GATEWAY_PUBLIC_URLS = JSON.stringify({
      "https://stale-branch.example": "https://current-branch.example",
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("control.internal")) {
        return Response.json({
          token: "t".repeat(43),
          mediaGatewayUrl: "https://stale-branch.example",
        }, { status: 201 });
      }
      expect(url).toBe("https://current-branch.example/v1/live/start");
      return Response.json({
        cameraId: "camera-1",
        hls: { url: "http://127.0.0.1:8888/hls/camera-1/index.m3u8", bearerToken: "stream-token" },
      }, { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(startLive("camera-1", undefined, "public")).resolves.toMatchObject({
      hls: { url: "https://current-branch.example/hls/camera-1/index.m3u8" },
    });
  });

  it("returns the edge-advertised LAN gateway to a VPN or local-network browser when no tunnel is available", async () => {
    process.env.NODE_ENV = "production";
    process.env.DASHBOARD_DEMO_MODE = "false";
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    delete process.env.MEDIA_GATEWAY_LOCAL_URL;
    delete process.env.MEDIA_GATEWAY_PUBLIC_URL;
    delete process.env.MEDIA_GATEWAY_INTERNAL_URL;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("control.internal");
      return Response.json({
        token: "t".repeat(43),
        localMediaGatewayUrl: "http://10.42.0.15:8090",
      }, { status: 201 });
    }));

    await expect(startLive("camera-1")).resolves.toMatchObject({
      cameraId: "camera-1",
      direct: {
        url: "http://10.42.0.15:8090/v1/live/start",
      },
    });
  });

  it("uses a private legacy mediaGatewayUrl as the browser-local fallback", async () => {
    process.env.NODE_ENV = "production";
    process.env.DASHBOARD_DEMO_MODE = "false";
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    delete process.env.MEDIA_GATEWAY_LOCAL_URL;
    delete process.env.MEDIA_GATEWAY_PUBLIC_URL;
    delete process.env.MEDIA_GATEWAY_INTERNAL_URL;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("control.internal");
      return Response.json({
        token: "t".repeat(43),
        mediaGatewayUrl: "http://192.168.50.10:8090",
      }, { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(startLive("camera-1")).resolves.toMatchObject({
      cameraId: "camera-1",
      direct: {
        url: "http://192.168.50.10:8090/v1/live/start",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns both LAN and secure public routes when both are advertised", async () => {
    process.env.DASHBOARD_DEMO_MODE = "false";
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    delete process.env.MEDIA_GATEWAY_LOCAL_URL;
    process.env.MEDIA_GATEWAY_PUBLIC_URL = "https://public.example";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("control.internal")) {
        return Response.json({
          token: "t".repeat(43),
          mediaGatewayUrl: "https://public.example",
          localMediaGatewayUrl: "http://192.168.29.101:8090",
        }, { status: 201 });
      }
      return Response.json({
        cameraId: "camera-1",
        hls: { url: "http://192.168.29.101:8888/live/camera-1/index.m3u8", bearerToken: "stream-token" },
      }, { status: 201 });
    }));

    await expect(startLive("camera-1")).resolves.toMatchObject({
      cameraId: "camera-1",
      direct: { url: "http://192.168.29.101:8090/v1/live/start" },
      directFallbacks: [{ url: "https://public.example/v1/live/start" }],
    });
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
