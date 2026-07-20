import Fastify from "fastify";
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
  logger?: boolean;
}) {
  const app = Fastify({ logger: options.logger ?? false });
  const access = new AccessRegistry(options.router, options.accessTtlMs);

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
      action: z.string(),
      path: z.string().default(""),
    }).passthrough().parse(request.body);
    if (!access.authenticate(body.token, body.path, body.action)) {
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
