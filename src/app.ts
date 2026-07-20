import cors from "@fastify/cors";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import {
  hasExtendedInfrastructure,
  type ControlPlaneStore,
} from "./control-plane-store.js";
import { actions, type Action, type Camera } from "./domain/models.js";
import { createAuthMiddleware, RateLimiter } from "./middleware/auth.middleware.js";
import { registerAuthRoutes } from "./routes/auth.routes.js";
import { registerCameraPermissionRoutes } from "./routes/camera-permissions.routes.js";
import { registerCctvInfrastructureRoutes } from "./routes/cctv-infrastructure.js";
import { registerOrganizationRoutes } from "./routes/organization.routes.js";
import { registerUserRoutes } from "./routes/user.routes.js";
import { MemoryStore } from "./store.js";

declare module "fastify" {
  interface FastifyRequest {
    currentUser: Awaited<ReturnType<ControlPlaneStore["getUser"]>> & {};
  }
}

const idParams = z.object({ id: z.string().min(1) });
const branchParams = z.object({ branchId: z.string().min(1) });
const edgeAgentParams = z.object({ id: z.string().min(1) });
const cameraStatusSchema = z.object({
  status: z.enum(["online", "offline", "degraded", "unknown"]),
});
const cameraProfileSchema = z.object({
  name: z.string().min(1),
  codec: z.enum(["H264", "H265", "MJPEG", "unknown"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  rtspUri: z.string().min(1).optional(),
});
const capabilitiesSchema = z.object({
  ptz: z.boolean(),
  audio: z.boolean(),
  events: z.boolean(),
});

export async function buildApp(options?: {
  logger?: boolean;
  store?: ControlPlaneStore;
  mediaGatewaySharedKey?: string;
  edgeBridgeSharedKey?: string;
  authMode?: "development" | "session" | "oidc";
}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options?.logger ?? false,
    trustProxy: Boolean(options?.edgeBridgeSharedKey),
  });
  const store = options?.store ?? new MemoryStore();
  const mediaGatewaySharedKey =
    options?.mediaGatewaySharedKey ??
    "development-media-gateway-key-change-me";

  await app.register(cors, { origin: false });

  app.decorateRequest("currentUser");
  const extendedStore = hasExtendedInfrastructure(store) ? store : undefined;
  const sessionAuth = extendedStore
    ? createAuthMiddleware({
        store: extendedStore,
        developmentMode: (options?.authMode ?? "development") === "development",
      })
    : undefined;
  const loginRateLimiter = new RateLimiter(20, 15 * 60 * 1000);

  app.addHook("preHandler", async (request, reply) => {
    if (
      request.url === "/health" ||
      request.url === "/internal/live-sessions/consume"
    ) return;

    if (
      options?.edgeBridgeSharedKey &&
      !secureEqualHeader(
        request.headers["x-edge-bridge-key"],
        options.edgeBridgeSharedKey,
      )
    ) {
      return reply.code(401).send({ error: "invalid_bridge_identity" });
    }

    if ((request.routeOptions.config as unknown as Record<string, unknown>)?.noAuth) {
      return loginRateLimiter.middleware()(request, reply);
    }

    if (sessionAuth) {
      return sessionAuth(request, reply);
    }

    // Memory-store development identity for local tests.
    const identity = request.headers["x-user-id"];
    if (typeof identity !== "string") {
      return reply.code(401).send({
        error: "unauthenticated",
        message: "Supply x-user-id while AUTH_MODE=development",
      });
    }
    const user = await store.getUser(identity);
    if (!user) return reply.code(401).send({ error: "unknown_user" });
    request.currentUser = user;
  });

  app.addHook("onClose", async () => store.close());

  app.get("/health", async () => ({
    status: "ok",
    service: "sentinel-control-plane",
  }));

  app.get("/v1/me", async (request) => request.currentUser);

  app.get("/v1/branches", async (request) => ({
    data: await store.listAccessibleNodes(
      request.currentUser,
      "live:view",
      "branch",
    ),
  }));

  app.post("/v1/branches", async (request, reply) => {
    const body = z.object({
      parentNodeId: z.string().min(1),
      name: z.string().trim().min(2).max(120),
    }).parse(request.body);
    if (
      !(await requireAccess(
        request,
        reply,
        store,
        "device:configure",
        body.parentNodeId,
      ))
    ) return;

    const branch = await store.createBranch(
      request.currentUser.tenantId,
      body.parentNodeId,
      body.name,
    );
    await audit(request, store, "branch.created", branch.id, "success");
    return reply.code(201).send(branch);
  });

  app.get("/v1/branches/:id/cameras", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const branch = await store.getNode(id);
    if (!branch || branch.type !== "branch") {
      return reply.code(404).send({ error: "branch_not_found" });
    }
    if (!(await requireAccess(request, reply, store, "live:view", branch.id))) return;
    return {
      data: (await store.listCamerasByBranch(
        request.currentUser,
        id,
        "live:view",
      )).map(safeCamera),
    };
  });

  app.get("/v1/cameras/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraAccess(request, reply, store, camera))) return;
    return safeCamera(camera);
  });

  app.get("/v1/cameras/:id/capabilities", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraAccess(request, reply, store, camera))) return;
    return { cameraId: camera.id, capabilities: camera.capabilities, profiles: camera.profiles };
  });

  app.post("/v1/branches/:branchId/edge-agents/register", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    const body = z.object({
      name: z.string().trim().min(2).max(120),
      version: z.string().trim().min(1).max(40),
    }).parse(request.body);
    if (!(await requireAccess(request, reply, store, "device:configure", branchId))) return;
    const agent = await store.registerEdgeAgent(branchId, body.name, body.version);
    await audit(request, store, "edge_agent.registered", branchId, "success", {
      edgeAgentId: agent.id,
    });
    return reply.code(201).send(agent);
  });

  app.post("/v1/edge-agents/:id/heartbeat", async (request, reply) => {
    const { id } = edgeAgentParams.parse(request.params);
    const body = z.object({ version: z.string().min(1).max(40) }).parse(request.body);
    // Temporary operator authentication; replace with edge-agent mTLS identity.
    const agent = await store.heartbeatEdgeAgent(id, body.version);
    if (!agent) return reply.code(404).send({ error: "edge_agent_not_found" });
    return agent;
  });

  app.post("/v1/branches/:branchId/cameras/discovered", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    if (!(await requireAccess(request, reply, store, "device:configure", branchId))) return;
    const body = z.object({
      edgeAgentId: z.string().min(1),
      vendor: z.enum(["hikvision", "cp-plus", "other"]),
      model: z.string().min(1).max(120),
      ipAddress: z.string().ip(),
      onvifPort: z.number().int().min(1).max(65535),
      rtspPort: z.number().int().min(1).max(65535),
      profiles: z.array(cameraProfileSchema).min(1),
      capabilities: capabilitiesSchema,
    }).parse(request.body);
    const discovery = await store.createDiscovery(branchId, body);
    await audit(request, store, "camera.discovered", branchId, "success", {
      discoveryId: discovery.id,
      vendor: discovery.vendor,
      model: discovery.model,
    });
    return reply.code(202).send(discovery);
  });

  app.post("/v1/branches/:branchId/cameras", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    if (!(await requireAccess(request, reply, store, "device:configure", branchId))) return;
    const body = z.object({
      discoveryId: z.string().min(1),
      name: z.string().trim().min(2).max(120),
      channel: z.number().int().positive(),
      protocol: z.enum(["onvif-t", "onvif-s", "rtsp", "vendor-adapter"]),
      connectionSecretRef: z.string().min(8).max(500),
    }).parse(request.body);
    const camera = await store.approveCamera(branchId, body);
    if (!camera) return reply.code(404).send({ error: "discovery_not_found" });
    await audit(request, store, "camera.approved", camera.nodeId, "success", {
      cameraId: camera.id,
    });
    return reply.code(201).send(safeCamera(camera));
  });

  app.patch("/v1/cameras/:id/status", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = cameraStatusSchema.parse(request.body);
    const existing = await store.getCamera(id);
    if (!existing) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireAccess(request, reply, store, "device:configure", existing.nodeId))) return;
    const camera = await store.updateCameraStatus(id, body.status);
    await audit(request, store, "camera.status_changed", existing.nodeId, "success", body);
    return safeCamera(camera!);
  });

  app.post("/v1/cameras/:id/live-sessions", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraAccess(request, reply, store, camera))) {
      await audit(request, store, "live_session.created", camera.nodeId, "denied");
      return;
    }
    const session = await store.createLiveSession(id, request.currentUser.id);
    await audit(request, store, "live_session.created", camera.nodeId, "success", {
      sessionId: session.id,
    });
    return reply.code(201).send(session);
  });

  app.post("/internal/live-sessions/consume", async (request, reply) => {
    const suppliedKey = request.headers["x-media-gateway-key"];
    if (
      typeof suppliedKey !== "string" ||
      !secureEqual(suppliedKey, mediaGatewaySharedKey)
    ) {
      return reply.code(401).send({ error: "invalid_gateway_identity" });
    }
    const body = z.object({ token: z.string().min(32).max(200) }).parse(request.body);
    const session = await store.consumeLiveSession(body.token);
    if (!session) {
      return reply.code(401).send({ error: "invalid_or_consumed_session" });
    }
    await store.writeAudit({
      tenantId: session.tenantId,
      actorUserId: session.userId,
      action: "live_session.consumed",
      resourceNodeId: session.cameraNodeId,
      outcome: "success",
      details: { sessionId: session.id },
    });
    return session;
  });

  app.post("/v1/access/check", async (request, reply) => {
    const body = z.object({
      action: z.enum(actions),
      resourceNodeId: z.string().min(1),
    }).parse(request.body);
    const decision = await store.checkAccess(
      request.currentUser,
      body.action,
      body.resourceNodeId,
    );
    if (!decision) return reply.code(404).send({ error: "resource_not_found" });
    return decision;
  });

  if (extendedStore) {
    await registerAuthRoutes(app, extendedStore);
    await registerOrganizationRoutes(app, extendedStore);
    await registerUserRoutes(app, extendedStore);
    await registerCameraPermissionRoutes(app, extendedStore);
    await registerCctvInfrastructureRoutes(app, extendedStore);
  }

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        error: "invalid_request",
        details: error.flatten(),
      });
    }
    if (error instanceof Error && error.message === "invalid_parent") {
      return reply.code(400).send({ error: "invalid_parent" });
    }
    if (
      error instanceof Error &&
      [
        "invalid_camera_grant_target",
        "invalid_camera_access_target",
        "invalid_time_restriction_target",
      ].includes(error.message)
    ) {
      return reply.code(400).send({ error: error.message });
    }
    if (error instanceof Error && error.message === "camera_not_found") {
      return reply.code(404).send({ error: "camera_not_found" });
    }
    const databaseCode = (error as { code?: string }).code;
    if (databaseCode === "23505") {
      return reply.code(409).send({ error: "resource_conflict" });
    }
    if (
      databaseCode === "23503" ||
      databaseCode === "23514" ||
      databaseCode === "22P02" ||
      databaseCode === "P0001"
    ) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    app.log.error(error);
    return reply.code(500).send({ error: "internal_error" });
  });

  return app;
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer);
}

function secureEqualHeader(value: string | string[] | undefined, expected: string) {
  return typeof value === "string" && secureEqual(value, expected);
}

function safeCamera(camera: Camera) {
  const { connectionSecretRef: _secret, ...safe } = camera;
  return safe;
}

async function requireAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  action: Action,
  resourceNodeId: string,
) {
  const decision = await store.checkAccess(
    request.currentUser,
    action,
    resourceNodeId,
  );
  if (!decision) {
    await reply.code(404).send({ error: "resource_not_found" });
    return false;
  }
  if (!decision.allowed) {
    await reply.code(403).send({ error: "forbidden", reason: decision.reason });
    return false;
  }
  return true;
}

async function requireCameraAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  camera: Camera,
) {
  if (!hasExtendedInfrastructure(store)) {
    return requireAccess(request, reply, store, "live:view", camera.nodeId);
  }

  const decision = await store.checkCameraAccess(
    request.currentUser.id,
    camera.id,
    "live:view",
  );
  if (decision.allowed) return true;

  await reply.code(403).send({
    error: decision.requiresApproval ? "approval_required" : "forbidden",
    reason: decision.reason,
    requiresApproval: decision.requiresApproval,
  });
  return false;
}

async function audit(
  request: FastifyRequest,
  store: ControlPlaneStore,
  action: string,
  resourceNodeId: string | null,
  outcome: "success" | "denied" | "failure",
  details?: Record<string, unknown>,
) {
  await store.writeAudit({
    tenantId: request.currentUser.tenantId,
    actorUserId: request.currentUser.id,
    action,
    resourceNodeId,
    outcome,
    sourceIp: request.ip,
    ...(details ? { details } : {}),
  });
}
