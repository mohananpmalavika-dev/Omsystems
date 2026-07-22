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
import { actions, type Action, type Camera, type RecordingJob } from "./domain/models.js";
import { createAuthMiddleware, RateLimiter } from "./middleware/auth.middleware.js";
import { buildPlaybackTimeline } from "./recording/playback-timeline.js";
import { calculateRecordingStorage } from "./recording/storage-calculator.js";
import { registerAuthRoutes } from "./routes/auth.routes.js";
import { registerCameraPermissionRoutes } from "./routes/camera-permissions.routes.js";
import { registerCameraDiscoveryRoutes } from "./routes/camera-discovery.routes.js";
import { registerCctvInfrastructureRoutes } from "./routes/cctv-infrastructure.js";
import { registerOrganizationRoutes } from "./routes/organization.routes.js";
import { registerUserRoutes } from "./routes/user.routes.js";
import { registerAnalyticsRoutes } from "./routes/analytics.routes.js";
import { registerAnalyticsMetricsRoutes } from "./routes/analytics-metrics.routes.js";
import { registerIncidentsRoutes } from "./routes/incidents.routes.js";
import { registerComplianceRoutes } from "./routes/compliance.routes.js";
import { registerPrivacyRoutes } from "./routes/privacy.routes.js";
// import { registerMaintenanceRoutes } from "./routes/maintenance.routes.js";
// import { registerMaintenanceDashboardRoutes } from "./routes/maintenance-dashboard.routes.js";
// import { registerMaintenanceAdvancedRoutes } from "./routes/maintenance-advanced.routes.js";
import { MemoryStore } from "./store.js";

declare module "fastify" {
  interface FastifyRequest {
    currentUser: Awaited<ReturnType<ControlPlaneStore["getUser"]>> & {};
  }
}

const idParams = z.object({ id: z.string().min(1) });
const branchParams = z.object({ branchId: z.string().min(1) });
const edgeAgentParams = z.object({ id: z.string().min(1) });
const branchListQuery = z.object({
  action: z.enum(actions).default("live:view"),
});
const cameraStatusSchema = z.object({
  status: z.enum(["online", "offline", "degraded", "unknown"]),
});
const cameraProfileSchema = z.object({
  name: z.string().min(1),
  codec: z.enum(["H264", "H265", "MJPEG", "unknown"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  rtspUri: z.string().min(1).optional(),
}).strict();
const capabilitiesSchema = z.object({
  ptz: z.boolean(),
  audio: z.boolean(),
  events: z.boolean(),
});
const scheduleWindowSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  days: z.array(z.number().int().min(0).max(6)).min(1),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  enabled: z.boolean().default(true),
});
const scheduleExceptionSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  enabled: z.boolean().default(false),
  description: z.string().trim().min(1).max(1_000).optional(),
});
const recordingScheduleSchema = z.object({
  timezone: z.string().trim().min(1).max(100).default("UTC"),
  windows: z.array(scheduleWindowSchema).min(1),
  exceptions: z.array(scheduleExceptionSchema).optional(),
});
const recordingJobSchema = z.object({
  mode: z.enum(["continuous", "motion", "scheduled", "event", "manual"]),
  enabled: z.boolean().default(true),
  retentionDays: z.number().int().min(1).max(3650).default(180),
  schedule: recordingScheduleSchema.optional(),
  preRollSeconds: z.number().int().min(0).max(3600).default(30),
  postRollSeconds: z.number().int().min(0).max(3600).default(30),
  minMotionDurationSeconds: z.number().int().min(0).max(86_400).default(0),
  motionConfidenceThreshold: z.number().min(0).max(1).default(0),
  cooldownSeconds: z.number().int().min(0).max(86_400).default(60),
  maxEventDurationSeconds: z.number().int().min(0).max(86_400).default(0),
  segmentDurationSeconds: z.number().int().min(10).max(300).default(60),
  hotRetentionDays: z.number().int().min(0).max(3650).default(30),
  warmRetentionDays: z.number().int().min(0).max(3650).default(60),
  coldRetentionDays: z.number().int().min(0).max(3650).default(90),
  maxBitrateKbps: z.number().int().min(64).max(100_000).optional(),
  storageNodeExternalId: z.string().min(1).max(200).optional(),
  triggerEventTypes: z.array(z.string().trim().min(1).max(100)).optional(),
  critical: z.boolean().default(false),
  backupRequired: z.boolean().default(false),
  automaticDeletionEnabled: z.boolean().default(true),
  evidenceProtection: z.boolean().default(true),
  recordMainStream: z.boolean().default(true),
});

const storageCalculatorSchema = z.object({
  cameraCount: z.number().int().min(1).max(100_000),
  bitrateMbps: z.number().positive().max(1_000),
  recordingHoursPerDay: z.number().positive().max(24).default(24),
  retentionDays: z.number().int().min(1).max(3650).default(180),
  metadataAndIndexPercent: z.number().min(0).max(100).default(15),
  safetyReservePercent: z.number().min(0).max(100).default(0),
  raidUsablePercent: z.number().min(10).max(100).default(75),
  backupCopies: z.number().int().min(0).max(10).default(1),
});

const internalSegmentSchema = z.object({
  tenantId: z.string().min(1), cameraId: z.string().min(1), jobId: z.string().min(1),
  startedAt: z.string().datetime(), endedAt: z.string().datetime(),
  storagePath: z.string().min(1).max(2_000), sizeBytes: z.number().int().nonnegative(),
  storageNodeExternalId: z.string().min(1).max(200),
  storageTier: z.enum(["hot", "warm", "cold"]).default("hot"),
  status: z.enum(["ready", "moving", "deleted", "error"]).default("ready"),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  codec: z.string().max(50).optional(),
});

export async function buildApp(options?: {
  logger?: boolean;
  store?: ControlPlaneStore;
  mediaGatewaySharedKey?: string;
  recordingEngineUrl?: string;
  recordingEngineSharedKey?: string;
  edgeBridgeSharedKey?: string;
  analyticsEngineSharedKey?: string;
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
      request.url === "/internal/live-sessions/consume" ||
      request.url.startsWith("/internal/recording/") ||
      request.url.startsWith("/internal/analytics/")
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

  app.get("/v1/branches", async (request) => {
    const { action } = branchListQuery.parse(request.query);
    return {
      data: await store.listAccessibleNodes(
        request.currentUser,
        action,
        "branch",
      ),
    };
  });

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
    const { action } = branchListQuery.parse(request.query);
    const branch = await store.getNode(id);
    if (!branch || branch.type !== "branch") {
      return reply.code(404).send({ error: "branch_not_found" });
    }
    if (!(await requireAccess(request, reply, store, action, branch.id))) return;
    return {
      data: (await store.listCamerasByBranch(
        request.currentUser,
        id,
        action,
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

  app.get("/v1/branches/:branchId/edge-agents", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    if (!(await requireAccess(request, reply, store, "device:configure", branchId))) return;
    return { data: await store.listEdgeAgentsByBranch(branchId) };
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
    const parsed = z.object({
      edgeAgentId: z.string().min(1),
      vendor: z.enum(["hikvision", "cp-plus", "other"]),
      model: z.string().min(1).max(120),
      ipAddress: z.string().ip(),
      onvifPort: z.number().int().min(1).max(65535),
      rtspPort: z.number().int().min(1).max(65535),
      profiles: z.array(cameraProfileSchema).min(1),
      capabilities: capabilitiesSchema,
    }).parse(request.body);
    const discoveryInput = {
      edgeAgentId: parsed.edgeAgentId,
      vendor: parsed.vendor,
      model: parsed.model,
      ipAddress: parsed.ipAddress,
      onvifPort: parsed.onvifPort,
      rtspPort: parsed.rtspPort,
      profiles: parsed.profiles.map(p => ({
        name: p.name,
        codec: p.codec,
        width: p.width,
        height: p.height,
        rtspUri: p.rtspUri,
      })),
      capabilities: {
        ptz: parsed.capabilities.ptz,
        audio: parsed.capabilities.audio,
        events: parsed.capabilities.events,
      },
    };
    const discovery = await store.createDiscovery(branchId, discoveryInput);
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
    const parsed = z.object({
      discoveryId: z.string().min(1),
      name: z.string().trim().min(2).max(120),
      channel: z.number().int().positive(),
      protocol: z.enum(["onvif-t", "onvif-s", "rtsp", "vendor-adapter"]),
      connectionSecretRef: z.string().min(8).max(500),
    }).parse(request.body);
    const approvalInput = {
      discoveryId: parsed.discoveryId,
      name: parsed.name,
      channel: parsed.channel,
      protocol: parsed.protocol,
      connectionSecretRef: parsed.connectionSecretRef,
    };
    const camera = await store.approveCamera(branchId, approvalInput);
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

  app.get("/v1/cameras/:id/recording", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraActionAccess(
      request, reply, store, camera, "recording:view",
    ))) return;
    return (await store.getRecordingJob(id)) ?? {
      cameraId: id, mode: "continuous", enabled: false, status: "disabled",
      retentionDays: 180, preRollSeconds: 30, postRollSeconds: 30,
      minMotionDurationSeconds: 0, motionConfidenceThreshold: 0,
      cooldownSeconds: 60, maxEventDurationSeconds: 0,
      segmentDurationSeconds: 60, hotRetentionDays: 30,
      warmRetentionDays: 60, coldRetentionDays: 90,
      critical: false, backupRequired: false,
      automaticDeletionEnabled: true, evidenceProtection: true,
      recordMainStream: true,
    };
  });

  app.put("/v1/cameras/:id/recording", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireAccess(request, reply, store, "device:configure", camera.nodeId))) return;
    const input = recordingJobSchema.parse(request.body);
    if (input.mode === "scheduled" && !input.schedule) {
      return reply.code(400).send({ error: "schedule_required" });
    }
    if (input.hotRetentionDays + input.warmRetentionDays +
        input.coldRetentionDays !== input.retentionDays) {
      return reply.code(400).send({ error: "storage_tiers_must_equal_retention" });
    }
    const requestedStatus = !input.enabled
      ? "disabled"
      : input.mode === "scheduled"
        ? "scheduled"
        : "idle";
    const jobPayload = {
      ...input,
      status: requestedStatus,
    } as Omit<RecordingJob, "id" | "cameraId" | "updatedAt">;
    let job = await store.upsertRecordingJob(id, jobPayload);
    if (options?.recordingEngineUrl && options.recordingEngineSharedKey) {
      const response = await fetch(new URL("/internal/jobs", options.recordingEngineUrl), {
        method: "PUT", headers: { "content-type": "application/json", "x-recording-engine-key": options.recordingEngineSharedKey },
        body: JSON.stringify({
          tenantId: request.currentUser.tenantId,
          branchId: camera.branchId,
          cameraId: id,
          connectionSecretRef: camera.connectionSecretRef,
          job,
        }),
      });
      if (!response.ok) {
        job = await store.upsertRecordingJob(id, { ...input, status: "error" } as Omit<RecordingJob, "id" | "cameraId" | "updatedAt">);
        return reply.code(503).send({ error: "recording_engine_unavailable" });
      }
      const engine = z.object({ active: z.boolean() }).parse(await response.json());
      const actualStatus = !input.enabled
        ? "disabled"
        : engine.active
          ? "recording"
          : input.mode === "scheduled"
            ? "scheduled"
            : "idle";
      if (job.status !== actualStatus) {
        job = await store.upsertRecordingJob(id, { ...input, status: actualStatus } as Omit<RecordingJob, "id" | "cameraId" | "updatedAt">);
      }
    }
    await audit(request, store, "recording.configured", camera.nodeId, "success", { mode: job.mode, enabled: job.enabled });
    return reply.code(200).send(job);
  });

  app.get("/v1/cameras/:id/recordings", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const query = z.object({ from: z.string().datetime().optional(), to: z.string().datetime().optional() }).parse(request.query);
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraActionAccess(
      request, reply, store, camera, "recording:view",
    ))) return;
    return { data: await store.listRecordingSegments(id, query.from, query.to) };
  });

  app.get("/v1/cameras/:id/recording/health", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const { limit } = z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(request.query);
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraActionAccess(
      request, reply, store, camera, "recording:view",
    ))) return;
    return { data: await store.listRecordingHealthEvents(id, limit) };
  });

  app.get("/v1/recording-segments/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const segment = await store.getRecordingSegment(id);
    if (!segment) return reply.code(404).send({ error: "recording_segment_not_found" });
    const camera = await store.getCamera(segment.cameraId);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraActionAccess(
      request, reply, store, camera, "recording:view",
    ))) return;
    return segment;
  });

  app.post("/v1/cameras/:id/recording/events", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = z.object({ type: z.enum(["motion", "event"]), metadata: z.record(z.unknown()).optional() }).parse(request.body);
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireAccess(request, reply, store, "device:configure", camera.nodeId))) return;
    const job = await store.getRecordingJob(id);
    if (!job?.enabled || job.mode !== body.type) {
      return reply.code(409).send({ error: "recording_mode_not_triggerable" });
    }
    if (!options?.recordingEngineUrl || !options.recordingEngineSharedKey) {
      return reply.code(503).send({ error: "recording_engine_not_configured" });
    }
    const response = await fetch(new URL(`/internal/jobs/${encodeURIComponent(id)}/trigger`, options.recordingEngineUrl), {
      method: "POST", headers: { "content-type": "application/json", "x-recording-engine-key": options.recordingEngineSharedKey }, body: JSON.stringify(body),
    });
    if (!response.ok) return reply.code(503).send({ error: "recording_engine_unavailable" });
    await audit(request, store, `recording.${body.type}_triggered`, camera.nodeId, "success", body.metadata);
    return reply.code(202).send({ cameraId: id, triggered: body.type });
  });

  app.get("/v1/cameras/:id/playback", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const query = z.object({
      from: z.string().datetime(), to: z.string().datetime(),
    }).parse(request.query);
    const from = Date.parse(query.from);
    const to = Date.parse(query.to);
    if (to <= from || to - from > 31 * 86_400_000) {
      return reply.code(400).send({ error: "invalid_playback_window" });
    }
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraActionAccess(
      request, reply, store, camera, "recording:view",
    ))) return;
    const segments = await store.listRecordingSegments(id, query.from, query.to);
    return buildPlaybackTimeline(segments, query.from, query.to);
  });

  app.post("/v1/recording/storage-calculator", async (request) => {
    const parsed = storageCalculatorSchema.parse(request.body);
    return calculateRecordingStorage({
      cameraCount: parsed.cameraCount,
      bitrateMbps: parsed.bitrateMbps,
      recordingHoursPerDay: parsed.recordingHoursPerDay,
      retentionDays: parsed.retentionDays,
      metadataAndIndexPercent: parsed.metadataAndIndexPercent,
      safetyReservePercent: parsed.safetyReservePercent,
      raidUsablePercent: parsed.raidUsablePercent,
      backupCopies: parsed.backupCopies,
    });
  });

  app.get("/v1/cameras/:id/recording/legal-holds", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraActionAccess(
      request, reply, store, camera, "recording:view",
    ))) return;
    return { data: await store.listRecordingLegalHolds(id) };
  });

  app.post("/v1/cameras/:id/recording/legal-holds", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = z.object({
      fromAt: z.string().datetime(), toAt: z.string().datetime(),
      reason: z.string().trim().min(3).max(1_000),
    }).parse(request.body);
    if (Date.parse(body.toAt) <= Date.parse(body.fromAt)) {
      return reply.code(400).send({ error: "invalid_legal_hold_window" });
    }
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraActionAccess(
      request, reply, store, camera, "evidence:export",
    ))) return;
    const hold = await store.createRecordingLegalHold({
      tenantId: request.currentUser.tenantId, cameraId: id,
      fromAt: body.fromAt, toAt: body.toAt, reason: body.reason,
      createdBy: request.currentUser.id,
    });
    await audit(request, store, "recording.legal_hold_created", camera.nodeId,
      "success", { legalHoldId: hold.id, fromAt: hold.fromAt, toAt: hold.toAt });
    return reply.code(201).send(hold);
  });

  app.delete("/v1/cameras/:id/recording/legal-holds/:holdId", async (request, reply) => {
    const params = z.object({
      id: z.string().min(1), holdId: z.string().min(1),
    }).parse(request.params);
    const camera = await store.getCamera(params.id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    if (!(await requireCameraActionAccess(
      request, reply, store, camera, "evidence:export",
    ))) return;
    const hold = await store.releaseRecordingLegalHold(
      params.holdId, request.currentUser.tenantId, params.id,
      request.currentUser.id,
    );
    if (!hold) {
      return reply.code(404).send({ error: "legal_hold_not_found" });
    }
    await audit(request, store, "recording.legal_hold_released", camera.nodeId,
      "success", { legalHoldId: hold.id });
    return hold;
  });

  app.post("/internal/recording/segments", async (request, reply) => {
    if (!requireRecordingEngineIdentity(request, reply, options?.recordingEngineSharedKey)) return;
    const input = internalSegmentSchema.parse(request.body);
    if (Date.parse(input.endedAt) <= Date.parse(input.startedAt)) {
      return reply.code(400).send({ error: "invalid_segment_window" });
    }
    const camera = await store.getCamera(input.cameraId);
    const node = camera ? await store.getNode(camera.nodeId) : undefined;
    const job = camera ? await store.getRecordingJob(camera.id) : undefined;
    if (!camera || !node || node.tenantId !== input.tenantId || job?.id !== input.jobId) {
      return reply.code(404).send({ error: "recording_job_not_found" });
    }
    const segment = await store.createRecordingSegment({
      cameraId: input.cameraId,
      jobId: input.jobId,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      storagePath: input.storagePath,
      sizeBytes: input.sizeBytes,
      storageNodeExternalId: input.storageNodeExternalId,
      storageTier: input.storageTier,
      status: input.status,
      checksumSha256: input.checksumSha256,
      codec: input.codec,
    });
    return reply.code(201).send(segment);
  });

  app.put("/internal/recording/storage-nodes/:externalId", async (request, reply) => {
    if (!requireRecordingEngineIdentity(request, reply, options?.recordingEngineSharedKey)) return;
    const { externalId } = z.object({ externalId: z.string().min(1).max(200) })
      .parse(request.params);
    const input = z.object({
      tenantId: z.string().min(1), name: z.string().min(1).max(200),
      scopeNodeId: z.string().min(1).optional(),
      supportedTiers: z.array(z.enum(["hot", "warm", "cold"])).min(1),
      capacityBytes: z.number().int().nonnegative(),
      usedBytes: z.number().int().nonnegative(),
      availableBytes: z.number().int().nonnegative(),
      status: z.enum(["healthy", "warning", "critical", "offline"]),
      storageType: z.enum(["local-disk", "nfs", "smb", "s3", "cloud-archive", "san"]).default("local-disk"),
      supportedProtocols: z.array(z.string().trim().min(1)).min(1).default(["fs"]),
      location: z.string().trim().optional(),
      mountPath: z.string().trim().optional(),
      readMbps: z.number().nonnegative().optional(),
      latencyMs: z.number().nonnegative().optional(),
      temperatureCelsius: z.number().min(-100).max(200).optional(),
      writeMbps: z.number().nonnegative().optional(),
    }).parse(request.body);
    if (input.usedBytes + input.availableBytes > input.capacityBytes * 1.01) {
      return reply.code(400).send({ error: "invalid_storage_capacity" });
    }
    if (input.scopeNodeId) {
      const scope = await store.getNode(input.scopeNodeId);
      if (!scope || scope.tenantId !== input.tenantId) {
        return reply.code(400).send({ error: "invalid_storage_scope" });
      }
    }
    return store.upsertRecordingStorageNode({ 
      externalId, 
      tenantId: input.tenantId,
      name: input.name,
      scopeNodeId: input.scopeNodeId,
      supportedTiers: input.supportedTiers,
      capacityBytes: input.capacityBytes,
      usedBytes: input.usedBytes,
      availableBytes: input.availableBytes,
      status: input.status,
      storageType: input.storageType,
      supportedProtocols: input.supportedProtocols,
      location: input.location,
      mountPath: input.mountPath,
      readMbps: input.readMbps,
      latencyMs: input.latencyMs,
      temperatureCelsius: input.temperatureCelsius,
      writeMbps: input.writeMbps,
    });
  });

  app.post("/internal/recording/health", async (request, reply) => {
    if (!requireRecordingEngineIdentity(request, reply, options?.recordingEngineSharedKey)) return;
    const input = z.object({
      tenantId: z.string().min(1), cameraId: z.string().min(1).optional(),
      storageNodeExternalId: z.string().min(1).max(200).optional(),
      eventType: z.string().min(1).max(100),
      severity: z.enum(["info", "warning", "critical"]),
      message: z.string().min(1).max(1_000),
      details: z.record(z.unknown()).optional(),
    }).parse(request.body);
    if (input.cameraId) {
      const camera = await store.getCamera(input.cameraId);
      const node = camera ? await store.getNode(camera.nodeId) : undefined;
      if (!node || node.tenantId !== input.tenantId) {
        return reply.code(400).send({ error: "invalid_health_event_target" });
      }
    }
    const event = await store.createRecordingHealthEvent({
      tenantId: input.tenantId,
      cameraId: input.cameraId,
      storageNodeExternalId: input.storageNodeExternalId,
      eventType: input.eventType,
      severity: input.severity,
      message: input.message,
      details: input.details,
    });
    if (input.cameraId) {
      const nextStatus = input.eventType === "recording_started"
        ? "recording"
        : input.eventType === "recording_stopped"
          ? "error"
          : input.eventType === "recording_idle"
            ? "idle"
            : input.eventType === "recording_scheduled"
              ? "scheduled"
              : undefined;
      if (nextStatus) await store.updateRecordingJobStatus(input.cameraId, nextStatus);
    }
    return reply.code(201).send(event);
  });

  app.get("/internal/recording/retention-candidates", async (request, reply) => {
    if (!requireRecordingEngineIdentity(request, reply, options?.recordingEngineSharedKey)) return;
    const query = z.object({
      tenantId: z.string().min(1), storageNodeExternalId: z.string().min(1),
      limit: z.coerce.number().int().min(1).max(1_000).default(200),
    }).parse(request.query);
    return { data: await store.listRecordingRetentionCandidates(
      query.tenantId, query.storageNodeExternalId, query.limit,
    ) };
  });

  app.post("/internal/recording/segments/deleted", async (request, reply) => {
    if (!requireRecordingEngineIdentity(request, reply, options?.recordingEngineSharedKey)) return;
    const input = z.object({
      tenantId: z.string().min(1), storageNodeExternalId: z.string().min(1),
      segmentIds: z.array(z.string().min(1)).min(1).max(1_000),
    }).parse(request.body);
    return { deleted: await store.markRecordingSegmentsDeleted(
      input.tenantId, input.storageNodeExternalId, input.segmentIds,
    ) };
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
    await registerCameraDiscoveryRoutes(app, extendedStore);
    await registerCctvInfrastructureRoutes(app, extendedStore);
    await registerComplianceRoutes(app, extendedStore);
    // await registerMaintenanceRoutes(app, extendedStore);
    // await registerMaintenanceDashboardRoutes(app, extendedStore);
    // await registerMaintenanceAdvancedRoutes(app, extendedStore);
    // start maintenance scheduler when extended store is available
    try {
      const { startMaintenanceScheduler } = await import("./maintenance/scheduler.js");
      const stop = startMaintenanceScheduler(extendedStore, app.log);
      app.addHook('onClose', async () => stop());
    } catch (err: unknown) {
      app.log.error({ err }, 'failed to start maintenance scheduler');
    }
  }
  await registerPrivacyRoutes(app, store);
  // await registerLiveOperationsRoutes(app, store);
  await registerIncidentsRoutes(app, store);
  await registerAnalyticsRoutes(app, store, {
    ...(options?.analyticsEngineSharedKey
      ? { analyticsEngineSharedKey: options.analyticsEngineSharedKey } : {}),
    ...(options?.recordingEngineUrl
      ? { recordingEngineUrl: options.recordingEngineUrl } : {}),
    ...(options?.recordingEngineSharedKey
      ? { recordingEngineSharedKey: options.recordingEngineSharedKey } : {}),
  });
  await registerAnalyticsMetricsRoutes(app, store);

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
    if (error instanceof Error && error.message === "invalid_alert_transition") {
      return reply.code(409).send({ error: "invalid_alert_transition" });
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

async function requireCameraActionAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  camera: Camera,
  action: Action,
) {
  if (!hasExtendedInfrastructure(store)) {
    return requireAccess(request, reply, store, action, camera.nodeId);
  }
  const decision = await store.checkCameraAccess(
    request.currentUser.id,
    camera.id,
    action,
  );
  if (decision.allowed) return true;
  await reply.code(403).send({
    error: decision.requiresApproval ? "approval_required" : "forbidden",
    reason: decision.reason,
    requiresApproval: decision.requiresApproval,
  });
  return false;
}

function requireRecordingEngineIdentity(
  request: FastifyRequest,
  reply: FastifyReply,
  expected: string | undefined,
) {
  if (!expected) {
    void reply.code(503).send({ error: "recording_engine_not_configured" });
    return false;
  }
  const supplied = request.headers["x-recording-engine-key"];
  if (typeof supplied !== "string" || !secureEqual(supplied, expected)) {
    void reply.code(401).send({ error: "invalid_recording_engine_identity" });
    return false;
  }
  return true;
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
