import { afterEach, describe, expect, it, vi } from "vitest";
import { startLiveFromBrowser } from "../lib/live-client";

afterEach(() => vi.unstubAllGlobals());

describe("browser live startup", () => {
  it("passes the supplied abort signal to the authorization request", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      Response.json({
        cameraId: "camera-1",
        hls: { url: "https://media.example/live.m3u8", bearerToken: "stream-token" },
      }, { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await startLiveFromBrowser("camera-1", "sub", controller.signal);

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it("turns an expired authorization request into a safe timeout error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new DOMException("Live session timed out", "TimeoutError");
    }));

    await expect(startLiveFromBrowser("camera-1")).rejects.toThrow("live_session_timeout");
  });

  it("requests a fresh live authorization before using the secure route", async () => {
    vi.stubGlobal("window", { location: { protocol: "https:" } });
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null) });
    let authorizationCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/live") {
        authorizationCount += 1;
        if (authorizationCount === 1) {
          return Response.json({
            cameraId: "camera-1",
            direct: {
              url: "http://192.168.29.101:8090/v1/live/start",
              controlPlaneToken: "t".repeat(43),
            },
          }, { status: 201 });
        }
        return Response.json({
          cameraId: "camera-1",
          direct: {
            url: "https://branch-media.example/v1/live/start",
            controlPlaneToken: "u".repeat(43),
          },
        }, { status: 201 });
      }
      expect(url).toBe("https://branch-media.example/v1/live/start");
      expect(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))).toEqual({
        controlPlaneToken: "u".repeat(43),
      });
      return Response.json({
        sessionId: "session-1",
        cameraId: "camera-1",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        hls: {
          url: "http://127.0.0.1:8888/hls/camera-1/index.m3u8",
          bearerToken: "stream-token",
        },
      }, { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(startLiveFromBrowser("camera-1")).resolves.toMatchObject({
      hls: { url: "https://branch-media.example/hls/camera-1/index.m3u8" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("continues to the secure route when a reachable-looking LAN route times out", async () => {
    vi.stubGlobal("window", { location: { protocol: "https:" } });
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null) });
    let authorizationCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/live") {
        authorizationCount += 1;
        if (authorizationCount > 1) {
          return Response.json({
            cameraId: "camera-1",
            direct: {
              url: "https://branch-media.example/v1/live/start",
              controlPlaneToken: "u".repeat(43),
            },
          }, { status: 201 });
        }
        return Response.json({
          cameraId: "camera-1",
          direct: {
            url: "https://media.branch.lan/v1/live/start",
            controlPlaneToken: "t".repeat(43),
          },
        }, { status: 201 });
      }
      if (url.includes("media.branch.lan")) {
        throw new DOMException("LAN gateway timed out", "TimeoutError");
      }
      return Response.json({
        sessionId: "session-1",
        cameraId: "camera-1",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        hls: {
          url: "https://branch-media.example/hls/camera-1/index.m3u8",
          bearerToken: "stream-token",
        },
      }, { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(startLiveFromBrowser("camera-1")).resolves.toMatchObject({
      hls: { url: "https://branch-media.example/hls/camera-1/index.m3u8" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("reports an unavailable gateway instead of manufacturing a snapshot feed", async () => {
    vi.stubGlobal("window", { location: { protocol: "https:" } });
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null) });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/live" && fetchMock.mock.calls.length === 1) {
        return Response.json({
          cameraId: "camera-1",
          direct: {
            url: "http://192.168.29.101:8090/v1/live/start",
            controlPlaneToken: "t".repeat(43),
          },
        }, { status: 201 });
      }
      return Response.json({ error: "media_gateway_unavailable" }, { status: 503 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(startLiveFromBrowser("camera-1")).rejects.toThrow("media_gateway_unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("snapshot-relay"))).toBe(false);
  });
});
