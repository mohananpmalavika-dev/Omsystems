import Fastify from "fastify";
import { timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import { z } from "zod";
import { AccessRegistry } from "./access-registry.js";
import { GatewayError } from "./control-plane-client.js";
import type {
  ControlPlaneClient,
  MediaRouter,
  StreamSecretProvider,
} from "./contracts.js";

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
  const access = new AccessRegistry(options.router, options.accessTtlMs, (error) => {
    app.log.error({ err: error }, "Media session cleanup failed");
  });
  app.addHook("onClose", async () => access.close());
  app.addContentTypeParser(
    ["application/sdp", "application/trickle-ice-sdpfrag"],
    { parseAs: "string", bodyLimit: 256 * 1024 },
    (_request, body, done) => done(null, body),
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
  const mediaMtxWebRtcUrl = options.mediaMtxWebRtcUrl || "http://127.0.0.1:8889";
  app.route({
    method: ["GET", "POST", "OPTIONS", "PATCH", "DELETE", "HEAD"],
    url: "/webrtc/*",
    handler: async (request, reply) => {
      setWebRtcCorsHeaders(request.headers.origin, reply);
      if (request.method === "OPTIONS") {
        return reply.code(204).send();
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
    const sourceUri = await options.secrets.resolve(
      consumed.connectionSecretRef,
    );
    if (!sourceUri) {
      throw new GatewayError(503, "stream_secret_unavailable");
    }
    const path = `camera-${safeIdentifier(consumed.cameraId)}`;
    const session = await access.start(path, sourceUri);
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

  app.post("/v1/portable/publish-start", async (request, reply) => {
    // Only the authenticated control plane may authorize a publisher. A viewer
    // token or caller-supplied camera ID must never grant camera write access.
    if (!options.controlPlaneSharedKey || !secureEqualHeader(
      request.headers["x-media-gateway-key"], options.controlPlaneSharedKey,
    )) {
      throw new GatewayError(401, "invalid_gateway_identity");
    }
    const body = z.object({
      controlPlaneToken: z.string().min(10).max(256),
      cameraId: z.string().min(1).max(200),
    }).parse(request.body);

    const path = `camera-${safeIdentifier(body.cameraId)}`;
    const session = await access.start(path, "publisher", "publish");
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
  if (origin) {
    reply.header("access-control-allow-origin", origin);
    reply.header("access-control-allow-credentials", "true");
    reply.header("vary", "Origin");
  } else {
    reply.header("access-control-allow-origin", "*");
  }
  reply.header("access-control-allow-headers", "Authorization, Content-Type, Range");
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
  if (origin) {
    reply.header("access-control-allow-origin", origin);
    reply.header("access-control-allow-credentials", "true");
    reply.header("vary", "Origin");
  } else {
    reply.header("access-control-allow-origin", "*");
  }
  reply.header("access-control-allow-headers", "Authorization, Content-Type, Range, Id, If-Match");
  reply.header("access-control-expose-headers", "Location, ETag, Id, Link, Accept-Patch");
  reply.header("access-control-allow-methods", "GET, POST, OPTIONS, PATCH, DELETE, HEAD");
}

function setLiveSessionCorsHeaders(
  origin: string | undefined,
  reply: { header(name: string, value: string): unknown },
) {
  if (origin) {
    reply.header("access-control-allow-origin", origin);
    reply.header("access-control-allow-credentials", "true");
    reply.header("vary", "Origin");
  } else {
    reply.header("access-control-allow-origin", "*");
  }
  reply.header("access-control-allow-headers", "Authorization, Content-Type");
  reply.header("access-control-allow-methods", "DELETE, OPTIONS");
}

function forwardWebRtcHeaders(headers: Record<string, unknown>) {
  const forwarded: Record<string, string> = {};
  for (const name of ["accept", "authorization", "content-type", "id", "if-match", "range", "user-agent"]) {
    const value = headers[name];
    if (typeof value === "string") forwarded[name] = value;
  }
  return forwarded;
}
