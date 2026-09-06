import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildMediaGateway } from "../src/app.js";
import { loadMediaConfig } from "../src/config.js";
import { AccessRegistry } from "../src/access-registry.js";

describe("media gateway production boundaries", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => { await app?.close(); vi.unstubAllGlobals(); vi.useRealTimers(); });
  const options = () => ({
    controlPlane: { consumeLiveSession: vi.fn(async () => { throw new Error("not used"); }) },
    router: { ensurePath: vi.fn(async () => undefined), removePath: vi.fn(async () => undefined) },
    secrets: { resolve: vi.fn(async () => undefined) },
    publicHlsBaseUrl: "https://media.example/hls",
    publicWebRtcBaseUrl: "https://media.example/webrtc",
    mediaMtxHlsUrl: "http://127.0.0.1:8888",
    mediaMtxWebRtcUrl: "http://127.0.0.1:8889",
    accessTtlMs: 60_000,
  });

  it("does not bypass bridge authentication using a query string", async () => {
    const input = { ...options(), edgeBridgeSharedKey: "b".repeat(32) };
    app = await buildMediaGateway(input);
    const result = await app.inject({ method: "POST", url: "/v1/live/start?bypass=true", payload: { controlPlaneToken: "a".repeat(43) } });
    expect(result.statusCode).toBe(401);
    expect(input.controlPlane.consumeLiveSession).not.toHaveBeenCalled();
  });

  it("requires control-plane identity before provisioning a portable publisher", async () => {
    const input = { ...options(), controlPlaneSharedKey: "g".repeat(32) };
    app = await buildMediaGateway(input);
    const request = { method: "POST" as const, url: "/v1/portable/publish-start", payload: { controlPlaneToken: "pcs_arbitrary", cameraId: "portable-1" } };
    expect((await app.inject(request)).statusCode).toBe(401);
    expect(input.router.ensurePath).not.toHaveBeenCalled();
    const started = await app.inject({ ...request, headers: { "x-media-gateway-key": input.controlPlaneSharedKey } });
    expect(started.statusCode).toBe(201);
    expect(started.headers["cache-control"]).toBe("no-store");
    const session = started.json();
    for (const [action, status] of [["publish", 204], ["read", 401], ["api", 401]] as const) {
      expect((await app.inject({ method: "POST", url: "/internal/mediamtx/auth", payload: { token: session.publishToken, path: session.path, action } })).statusCode).toBe(status);
    }
  });

  it.each(["/hls//other.example/secrets", "/webrtc//other.example/secrets"])("rejects upstream host override: %s", async (url) => {
    const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
    app = await buildMediaGateway(options());
    const result = await app.inject({ method: "GET", url });
    expect(result.statusCode).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("proxies SDP offers and trickle ICE with public session locations and conditional headers", async () => {
    const upstream = vi.fn()
      .mockResolvedValueOnce(new Response("v=0\r\nanswer", { status: 201, headers: {
        "content-type": "application/sdp", location: "http://127.0.0.1:8889/camera-1/whep/session-1", etag: '"session"', link: '<stun:stun.example>; rel="ice-server"',
      } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", upstream);
    app = await buildMediaGateway(options());
    const offer = "v=0\r\no=browser";
    const result = await app.inject({ method: "POST", url: "/webrtc/camera-1/whep", headers: { "content-type": "application/sdp", authorization: "Bearer viewer" }, payload: offer });
    expect(result.statusCode).toBe(201);
    expect(result.headers.location).toBe("/webrtc/camera-1/whep/session-1");
    expect(result.headers["access-control-expose-headers"]).toContain("Link");
    expect(upstream.mock.calls[0]?.[1]).toMatchObject({ body: offer, redirect: "error", headers: { authorization: "Bearer viewer" } });
    const patch = await app.inject({ method: "PATCH", url: result.headers.location!, headers: { "content-type": "application/trickle-ice-sdpfrag", "if-match": '"session"' }, payload: "a=candidate:1" });
    expect(patch.statusCode).toBe(204);
    expect(upstream.mock.calls[1]?.[1]).toMatchObject({ headers: { "if-match": '"session"' }, body: "a=candidate:1" });
  });

  it("preserves HLS range responses and streams segment bytes", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { "content-type": "video/mp2t", "content-range": "bytes 2-4/10", "content-length": "3" } }));
    vi.stubGlobal("fetch", upstream);
    app = await buildMediaGateway(options());
    const result = await app.inject({ method: "GET", url: "/hls/camera-1/segment.ts", headers: { range: "bytes=2-4" } });
    expect(result.statusCode).toBe(206);
    expect(result.headers["content-range"]).toBe("bytes 2-4/10");
    expect(result.rawPayload).toEqual(Buffer.from([1, 2, 3]));
  });

  it("keeps a new viewer alive when startup races the final previous viewer release", async () => {
    const input = options();
    const registry = new AccessRegistry(input.router, 60_000);
    const old = await registry.start("camera-1", "rtsp://camera/live");
    let finishStartup!: () => void;
    input.router.ensurePath.mockImplementationOnce(() => new Promise<void>((resolve) => { finishStartup = resolve; }));
    const newSession = registry.start("camera-1", "rtsp://camera/live");
    await Promise.resolve(); await Promise.resolve();
    const released = registry.release(old.id, old.token);
    finishStartup();
    const current = await newSession;
    await released;
    expect(input.router.removePath).not.toHaveBeenCalled();
    expect(registry.authenticate(current.token, "camera-1", "read")).toBe(true);
    await registry.close();
    expect(registry.authenticate(current.token, "camera-1", "read")).toBe(false);
    expect(input.router.removePath).toHaveBeenCalledTimes(1);
  });

  it("handles expiration cleanup failures without unhandled rejections", async () => {
    vi.useFakeTimers();
    const cleanupError = vi.fn();
    const router = { ensurePath: vi.fn(), removePath: vi.fn().mockRejectedValue(new Error("offline")) };
    const registry = new AccessRegistry(router, 1000, cleanupError);
    const session = registry.issue("camera-1");
    await vi.advanceTimersByTimeAsync(1000);
    expect(cleanupError).toHaveBeenCalledOnce();
    expect(registry.authenticate(session.token, "camera-1", "read")).toBe(false);
    await registry.close();
  });
});

describe("media configuration", () => {
  const base = { CONTROL_PLANE_URL: " control-plane:8080 ", MEDIA_GATEWAY_SHARED_KEY: "k".repeat(32) };
  it("normalizes internal hosts and uses gateway public proxy URLs in development", () => {
    const config = loadMediaConfig({ ...base, PORT: "8095", PUBLIC_HLS_BASE_URL: " " });
    expect(config.CONTROL_PLANE_URL).toBe("http://control-plane:8080");
    expect(config.PUBLIC_HLS_BASE_URL).toBe("http://localhost:8095/hls");
    expect(config.PUBLIC_WEBRTC_BASE_URL).toBe("http://localhost:8095/webrtc");
  });
  it("requires reachable public endpoints to be specified in production", () => {
    expect(() => loadMediaConfig({ ...base, NODE_ENV: "production" })).toThrow("PUBLIC_HLS_BASE_URL and PUBLIC_WEBRTC_BASE_URL");
  });
  it.each(["file:///tmp/api", "ftp://control.example", "https://user:secret@control.example", "https://control.example?token=secret"])("rejects unsupported service URL %s", (url) => {
    expect(() => loadMediaConfig({ ...base, CONTROL_PLANE_URL: url })).toThrow();
  });
});
