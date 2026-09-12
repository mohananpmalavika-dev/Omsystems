import Fastify from "fastify";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import { z } from "zod";
import { AccessRegistry } from "./access-registry.js";
import { GatewayError } from "./control-plane-client.js";
import type {
  ControlPlaneClient,
  MediaRouter,
  StreamSecretProvider,
} from "./contracts.js";

const PORTABLE_SOURCE_TYPES = new Set([
  "android-camera",
  "ios-camera",
  "laptop-camera",
  "browser-camera",
]);

function isPortableSource(sourceType?: string) {
  return Boolean(sourceType && PORTABLE_SOURCE_TYPES.has(sourceType));
}

export async function buildMediaGateway(options: {
  controlPlane: ControlPlaneClient;
  router: MediaRouter;
  secrets: StreamSecretProvider;
  publicHlsBaseUrl: string;
  publicWebRtcBaseUrl: string;
  mediaMtxHlsUrl?: string;
  mediaMtxWebRtcUrl?: string;
  accessTtlMs: number;
  edgeBridgeSharedKey?: string;
  controlPlaneSharedKey?: string;
  logger?: boolean;
}) {
  const app = Fastify({ logger: options.logger ?? false });
  const configuredCorsOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const allowCloudflareManagedOrigins = process.env.CORS_ALLOW_CLOUDFLARE === "true";
  const isAllowedCorsOrigin = (origin: string): boolean => {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== "https:") return false;
      if (configuredCorsOrigins.includes(origin)) return true;
      if (!allowCloudflareManagedOrigins) return false;
      const hostname = parsed.hostname.toLowerCase();
      return hostname.endsWith(".pages.dev")
        || hostname.endsWith(".workers.dev")
        || hostname.endsWith(".trycloudflare.com");
    } catch {
      return false;
    }
  };
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (request.method !== "OPTIONS" || !origin || !isAllowedCorsOrigin(origin)) return;
    setCorsHeaders(origin, request.headers["access-control-request-headers"], reply);
    return reply.code(204).send();
  });
  const access = new AccessRegistry(options.router, options.accessTtlMs, (error) => {
    app.log.error({ err: error }, "Media session cleanup failed");
  });
  app.addHook("onClose", async () => access.close());
  (app as any).addContentTypeParser(
    [/^application\/(sdp|trickle-ice-sdpfrag)/i, "application/sdp", "application/trickle-ice-sdpfrag"],
    { parseAs: "string", bodyLimit: 256 * 1024 },
    (_request: unknown, body: string, done: (err: Error | null, body?: string) => void) => done(null, body),
  );
  (app as any).addContentTypeParser(
    [/^audio\//i, "application/octet-stream"],
    { parseAs: "buffer", bodyLimit: 128 * 1024 },
    (_request: unknown, body: Buffer, done: (err: Error | null, body?: Buffer) => void) => done(null, body),
  );

  app.addHook("preHandler", async (request, reply) => {
    if (
      request.routeOptions.url === "/v1/live/start" &&
      options.edgeBridgeSharedKey &&
      !secureEqualHeader(
        request.headers["x-edge-bridge-key"],
        options.edgeBridgeSharedKey,
      )
    ) {
      return reply.code(401).send({ error: "invalid_bridge_identity" });
    }
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "sentinel-media-gateway",
  }));

  // Proxy MediaMTX's HLS listener through the gateway so playlists and segments
  // share the main public service port.
  if (options.mediaMtxHlsUrl) {
    app.route({
      method: ["GET", "HEAD", "OPTIONS"],
      url: "/hls/*",
      handler: async (request, reply) => {
        setHlsCorsHeaders(request.headers.origin, request.headers["access-control-request-private-network"], reply);
        if (request.method === "OPTIONS") {
          return reply.code(204).send();
        }
        const suffix = request.raw.url?.slice("/hls".length) || "/";
        const target = mediaTarget(suffix, options.mediaMtxHlsUrl!);
        const upstream = await fetch(target, {
          method: request.method,
          headers: forwardMediaHeaders(request.headers),
          signal: AbortSignal.timeout(30_000),
          redirect: "error",
        });
        reply.code(upstream.status);
        for (const name of [
          "accept-ranges",
          "cache-control",
          "content-length",
          "content-type",
          "content-range",
          "etag",
          "last-modified",
        ]) {
          const value = upstream.headers.get(name);
          if (value) reply.header(name, value);
        }
        if (request.method === "HEAD" || upstream.status === 204 || upstream.status === 304 || !upstream.body) {
          await upstream.body?.cancel();
          return reply.send();
        }
        return reply.send(Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream));
      },
    });
  }

  // WebRTC WHEP / WHIP listener proxy
  const mediaMtxWebRtcUrl = options.mediaMtxWebRtcUrl || process.env.MEDIAMTX_WEBRTC_URL;
  app.route({
    method: ["GET", "POST", "OPTIONS", "PATCH", "DELETE", "HEAD"],
    url: "/webrtc/*",
    handler: async (request, reply) => {
      setWebRtcCorsHeaders(request.headers.origin, reply);
      if (request.method === "OPTIONS") {
        return reply.code(204).send();
      }
      if (!mediaMtxWebRtcUrl) {
        return reply.code(503).send({ error: "media_webrtc_not_configured" });
      }
      const suffix = request.raw.url?.slice("/webrtc".length) || "/";
      const target = mediaTarget(suffix, mediaMtxWebRtcUrl);
      const hasBody = request.method === "POST" || request.method === "PATCH";
      if (hasBody && typeof request.body !== "string") {
        throw new GatewayError(415, "unsupported_media_type");
      }
      const upstream = await fetch(target, {
        method: request.method,
        headers: forwardWebRtcHeaders(request.headers),
        ...(hasBody ? { body: request.body as string } : {}),
        signal: AbortSignal.timeout(30_000),
        redirect: "error",
      });
      reply.code(upstream.status);
      for (const [name, value] of upstream.headers.entries()) {
        if (["content-type", "etag", "id", "link", "accept-patch"].includes(name.toLowerCase())) {
          reply.header(name, value);
        }
      }
      const location = upstream.headers.get("location");
      if (location) {
        const sessionUrl = new URL(location, target);
        if (sessionUrl.origin !== target.origin) {
          await upstream.body?.cancel();
          throw new GatewayError(502, "invalid_media_session_location");
        }
        reply.header("location", `/webrtc${sessionUrl.pathname}${sessionUrl.search}`);
      }
      if (request.method === "HEAD" || upstream.status === 204 || upstream.status === 304) {
        await upstream.body?.cancel();
        return reply.send();
      }
      const responseData = await upstream.text();
      return reply.send(responseData);
    },
  });

  app.post("/v1/live/start", async (request, reply) => {
    const body = z.object({
      controlPlaneToken: z.string().min(32).max(200),
    }).parse(request.body);
    const consumed = await options.controlPlane.consumeLiveSession(
      body.controlPlaneToken,
    );
    if (consumed.purpose === "talk") throw new GatewayError(403, "invalid_live_session");
    const path = `camera-${safeIdentifier(consumed.cameraId)}`;
    const portableSource = isPortableSource(consumed.sourceType);
    const session = portableSource
      ? access.issue(path, "read")
      : await startCameraSource(path, consumed.connectionSecretRef);
    reply.header("cache-control", "no-store");
    return reply.code(201).send({
      sessionId: session.id,
      cameraId: consumed.cameraId,
      path,
      expiresAt: session.expiresAt,
      hls: {
        url: `${stripSlash(options.publicHlsBaseUrl)}/${path}/index.m3u8`,
        bearerToken: session.token,
      },
      webRtc: {
        whepUrl: `${stripSlash(options.publicWebRtcBaseUrl)}/${path}/whep`,
        bearerToken: session.token,
      },
    });

    async function startCameraSource(cameraPath: string, connectionSecretRef: string) {
      const sourceUri = await options.secrets.resolve(connectionSecretRef);
      if (!sourceUri) throw new GatewayError(503, "stream_secret_unavailable");
      return access.start(cameraPath, sourceUri);
    }
  });

  app.route({
    method: ["DELETE", "OPTIONS"],
    url: "/v1/live/:sessionId",
    handler: async (request, reply) => {
      setLiveSessionCorsHeaders(request.headers.origin, reply);
      if (request.method === "OPTIONS") {
        return reply.code(204).send();
      }
      const params = z.object({ sessionId: z.string().uuid() }).parse(request.params);
      const token = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      if (!token) throw new GatewayError(401, "invalid_live_session");
      const released = await access.release(params.sessionId, token);
      if (!released) throw new GatewayError(404, "invalid_live_session");
      return reply.code(200).send({ status: "released" });
    },
  });

  interface GatewayTalkSession {
    id: string;
    cameraId: string;
    token: string;
    expiresAt: number;
    adapter: string;
    codec: string;
    sampleRate: number;
    bytesSent: number;
    startedAt: number;
    timer: NodeJS.Timeout;
    onWritePcm?: (pcm: Buffer) => Promise<void>;
    onClose?: () => Promise<void>;
  }
  const gatewayTalkSessions = new Map<string, GatewayTalkSession>();
  const gatewayTalkLeases = new Map<string, string>();

  app.post("/v1/talk/start", async (request, reply) => {
    setCorsHeaders(request.headers.origin, undefined, reply);
    const body = z.object({
      controlPlaneToken: z.string().min(32).max(200),
    }).parse(request.body);
    const consumed = await options.controlPlane.consumeLiveSession(
      body.controlPlaneToken,
    );
    if (consumed.purpose !== "talk") {
      throw new GatewayError(403, "invalid_talk_session");
    }

    // Check single-talker lease
    const now = Date.now();
    const existingLeaseSessionId = gatewayTalkLeases.get(consumed.cameraId);
    if (existingLeaseSessionId) {
      const existing = gatewayTalkSessions.get(existingLeaseSessionId);
      if (existing && existing.expiresAt > now) {
        throw new GatewayError(409, "talkback_busy");
      }
      // Expired lease cleanup
      gatewayTalkLeases.delete(consumed.cameraId);
      if (existing) {
        clearTimeout(existing.timer);
        gatewayTalkSessions.delete(existingLeaseSessionId);
      }
    }

    const sourceUri = await options.secrets.resolve(consumed.connectionSecretRef);
    if (!sourceUri) throw new GatewayError(503, "stream_secret_unavailable");

    const sessionId = consumed.id;
    const token = randomBytes(32).toString("base64url");
    const expiresAt = now + options.accessTtlMs;
    const adapter = "onvif-rtsp-backchannel";
    const codec = "PCMA";
    const sampleRate = 8000;

    const session: GatewayTalkSession = {
      id: sessionId,
      cameraId: consumed.cameraId,
      token,
      expiresAt,
      adapter,
      codec,
      sampleRate,
      bytesSent: 0,
      startedAt: now,
      timer: setTimeout(() => {
        gatewayTalkSessions.delete(sessionId);
        gatewayTalkLeases.delete(consumed.cameraId);
      }, options.accessTtlMs),
    };
    session.timer.unref();

    gatewayTalkSessions.set(sessionId, session);
    gatewayTalkLeases.set(consumed.cameraId, sessionId);

    reply.header("cache-control", "no-store");
    const base = stripSlash(options.publicWebRtcBaseUrl.replace(/\/webrtc\/?$/, ""));
    return reply.code(201).send({
      sessionId: session.id,
      cameraId: session.cameraId,
      expiresAt: new Date(expiresAt).toISOString(),
      adapter: session.adapter,
      audio: {
        url: `${base}/v1/talk/${encodeURIComponent(session.id)}/audio`,
        endUrl: `${base}/v1/talk/${encodeURIComponent(session.id)}`,
        bearerToken: session.token,
        contentType: "audio/L16;rate=8000;channels=1",
        codec: session.codec,
        sampleRate: session.sampleRate,
      },
    });
  });

  app.route({
    method: ["POST", "OPTIONS"],
    url: "/v1/talk/:sessionId/audio",
    handler: async (request, reply) => {
      setCorsHeaders(request.headers.origin, undefined, reply);
      if (request.method === "OPTIONS") {
        return reply.code(204).send();
      }
      const { sessionId } = z.object({ sessionId: z.string().min(1) }).parse(request.params);
      const token = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const session = gatewayTalkSessions.get(sessionId);
      if (!session || session.expiresAt <= Date.now() || !token || session.token !== token) {
        throw new GatewayError(401, "invalid_talk_access");
      }

      const pcm = request.body as Buffer;
      if (!Buffer.isBuffer(pcm) || pcm.length === 0 || pcm.length > 32_000 || pcm.length % 2 !== 0) {
        throw new GatewayError(400, "invalid_audio_chunk");
      }

      if (session.onWritePcm) {
        await session.onWritePcm(pcm);
      }
      session.bytesSent += pcm.length;
      return reply.code(202).send();
    },
  });

  app.route({
    method: ["DELETE", "OPTIONS"],
    url: "/v1/talk/:sessionId",
    handler: async (request, reply) => {
      setCorsHeaders(request.headers.origin, undefined, reply);
      if (request.method === "OPTIONS") {
        return reply.code(204).send();
      }
      const { sessionId } = z.object({ sessionId: z.string().min(1) }).parse(request.params);
      const token = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const session = gatewayTalkSessions.get(sessionId);
      if (!session || !token || session.token !== token) {
        throw new GatewayError(401, "invalid_talk_access");
      }

      clearTimeout(session.timer);
      gatewayTalkSessions.delete(sessionId);
      gatewayTalkLeases.delete(session.cameraId);
      if (session.onClose) {
        await session.onClose().catch(() => undefined);
      }
      return reply.code(204).send();
    },
  });

  app.post("/v1/portable/publish-start", async (request, reply) => {
    // Only the authenticated control plane may authorize a publisher. A viewer
    // token or caller-supplied camera ID must never grant camera write access.
    if (!options.controlPlaneSharedKey || !secureEqualHeader(
      request.headers["x-media-gateway-key"], options.controlPlaneSharedKey,
    )) {
      throw new GatewayError(401, "invalid_gateway_identity");
    }
    const body = z.object({
      controlPlaneToken: z.string().uuid(),
      cameraId: z.string().min(1).max(200),
    }).parse(request.body);

    const path = `camera-${safeIdentifier(body.cameraId)}`;
    const session = await access.start(path, "publisher", "publish", body.controlPlaneToken);
    reply.header("cache-control", "no-store");
    return reply.code(201).send({
      sessionId: session.id,
      cameraId: body.cameraId,
      path,
      expiresAt: session.expiresAt,
      whipUrl: `${stripSlash(options.publicWebRtcBaseUrl)}/${path}/whip`,
      whepUrl: `${stripSlash(options.publicWebRtcBaseUrl)}/${path}/whep`,
      publishToken: session.token,
    });
  });

  app.post("/v1/portable/:sessionId/stop", async (request, reply) => {
    if (!options.controlPlaneSharedKey || !secureEqualHeader(
      request.headers["x-media-gateway-key"], options.controlPlaneSharedKey,
    )) throw new GatewayError(401, "invalid_gateway_identity");
    const { sessionId } = z.object({ sessionId: z.string().uuid() }).parse(request.params);
    await access.revokePublisher(sessionId);
    return reply.code(204).send();
  });

  app.post("/internal/mediamtx/auth", async (request, reply) => {
    const body = z.object({
      token: z.string().default(""),
      password: z.string().default(""),
      action: z.string(),
      path: z.string().default(""),
      protocol: z.string().default(""),
      user: z.string().default(""),
      query: z.string().default(""),
    }).passthrough().parse(request.body);
    // MediaMTX can forward a credential through `token`, through `password`
    // for its documented Basic-auth fallback, or from a `token` query value.
    // The query form keeps HLS reliable through proxies that do not preserve
    // opaque Authorization headers; the token remains short-lived and bound
    // to one camera path.
    const queryCredential = new URLSearchParams(body.query).get("token") ?? "";
    const credential = body.token || body.password || queryCredential;
    if (!access.authenticate(credential, body.path, body.action)) {
      app.log.warn({
        mediaAuthDenied: {
          action: body.action,
          path: body.path,
          protocol: body.protocol,
          tokenLength: body.token.length,
          passwordLength: body.password.length,
          userPresent: body.user.length > 0,
          queryPresent: body.query.length > 0,
        },
      }, "Media access denied");
      return reply.code(401).send({ error: "media_access_denied" });
    }
    return reply.code(204).send();
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        error: "invalid_request",
        details: error.flatten(),
      });
    }
    if (error instanceof GatewayError) {
      return reply.code(error.statusCode).send({ error: error.code });
    }
    if (error && typeof error === "object" && "statusCode" in error &&
        typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: "invalid_request" });
    }
    app.log.error(error);
    return reply.code(502).send({ error: "media_gateway_failure" });
  });

  return app;
}

function safeIdentifier(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

function stripSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function mediaTarget(suffix: string, base: string) {
  // Reject authority overrides and backslash URL normalization before resolving.
  if (!suffix.startsWith("/") || suffix.startsWith("//") || suffix.includes("\\")) {
    throw new GatewayError(400, "invalid_media_path");
  }
  const configured = new URL(base);
  const target = new URL(suffix, configured);
  if (target.origin !== configured.origin) throw new GatewayError(400, "invalid_media_path");
  return target;
}

function secureEqualHeader(value: string | string[] | undefined, expected: string) {
  if (typeof value !== "string") return false;
  const supplied = Buffer.from(value);
  const configured = Buffer.from(expected);
  return supplied.length === configured.length &&
    timingSafeEqual(supplied, configured);
}

function forwardMediaHeaders(headers: Record<string, unknown>) {
  const forwarded: Record<string, string> = {};
  // The gateway is the browser-facing CORS boundary. Forwarding the browser's
  // Origin to MediaMTX makes its static hlsAllowOrigins setting decide whether
  // a playlist is usable, which breaks as soon as the dashboard hostname changes.
  for (const name of ["accept", "authorization", "range", "if-none-match", "if-modified-since", "if-range", "user-agent"]) {
    const value = headers[name];
    if (typeof value === "string") forwarded[name] = value;
  }
  return forwarded;
}

function setHlsCorsHeaders(
  origin: string | undefined,
  privateNetworkRequest: string | string[] | undefined,
  reply: { header(name: string, value: string): unknown },
) {
  setCorsHeaders(origin, undefined, reply);
  reply.header("access-control-allow-methods", "GET, HEAD, OPTIONS");
  reply.header("access-control-expose-headers", "Accept-Ranges, Content-Range, Content-Length, ETag");
  const requestsPrivateNetwork = Array.isArray(privateNetworkRequest)
    ? privateNetworkRequest.includes("true")
    : privateNetworkRequest === "true";
  if (requestsPrivateNetwork) {
    reply.header("access-control-allow-private-network", "true");
  }
}

function setWebRtcCorsHeaders(
  origin: string | undefined,
  reply: { header(name: string, value: string): unknown },
) {
  setCorsHeaders(origin, undefined, reply);
  reply.header("access-control-expose-headers", "Location, ETag, Id, Link, Accept-Patch");
  reply.header("access-control-allow-methods", "GET, POST, OPTIONS, PATCH, DELETE, HEAD");
}

function setLiveSessionCorsHeaders(
  origin: string | undefined,
  reply: { header(name: string, value: string): unknown },
) {
  setCorsHeaders(origin, undefined, reply);
  reply.header("access-control-allow-methods", "DELETE, OPTIONS");
}

function setCorsHeaders(
  origin: string | undefined,
  requestedHeaders: string | string[] | undefined,
  reply: { header(name: string, value: string): unknown },
) {
  if (origin) {
    reply.header("access-control-allow-origin", origin);
    reply.header("access-control-allow-credentials", "true");
    reply.header("vary", "Origin");
  } else {
    reply.header("access-control-allow-origin", "*");
  }
  const headers = Array.isArray(requestedHeaders) ? requestedHeaders.join(", ") : requestedHeaders;
  reply.header("access-control-allow-headers", headers || "Authorization, Content-Type, Range, Id, If-Match");
}

function forwardWebRtcHeaders(headers: Record<string, unknown>) {
  const forwarded: Record<string, string> = {};
  for (const name of ["accept", "authorization", "content-type", "id", "if-match", "range", "user-agent"]) {
    const value = headers[name];
    if (typeof value === "string") {
      if (name === "content-type") {
        const lower = value.toLowerCase();
        if (lower.includes("application/sdp")) {
          forwarded[name] = "application/sdp";
          continue;
        }
        if (lower.includes("application/trickle-ice-sdpfrag")) {
          forwarded[name] = "application/trickle-ice-sdpfrag";
          continue;
        }
      }
      forwarded[name] = value;
    }
  }
  return forwarded;
}
