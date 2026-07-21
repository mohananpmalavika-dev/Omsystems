import Fastify from "fastify";
import { timingSafeEqual } from "node:crypto";
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
  accessTtlMs: number;
  edgeBridgeSharedKey?: string;
  logger?: boolean;
}) {
  const app = Fastify({ logger: options.logger ?? false });
  const access = new AccessRegistry(options.router, options.accessTtlMs);

  app.addHook("preHandler", async (request, reply) => {
    if (
      request.url === "/v1/live/start" &&
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

  app.post("/v1/live/start", async (request, reply) => {
    const body = z.object({
      controlPlaneToken: z.string().min(32).max(200),
    }).parse(request.body);
    const consumed = await options.controlPlane.consumeLiveSession(
      body.controlPlaneToken,
    );
    const sourceUri = await options.secrets.resolve(
      consumed.connectionSecretRef,
    );
    if (!sourceUri) {
      throw new GatewayError(503, "stream_secret_unavailable");
    }

    const path = `camera-${safeIdentifier(consumed.cameraId)}`;
    await options.router.ensurePath(path, sourceUri);
    const session = access.issue(path);
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

function secureEqualHeader(value: string | string[] | undefined, expected: string) {
  if (typeof value !== "string") return false;
  const supplied = Buffer.from(value);
  const configured = Buffer.from(expected);
  return supplied.length === configured.length &&
    timingSafeEqual(supplied, configured);
}
