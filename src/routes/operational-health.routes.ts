import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import {
  projectBranchHealth,
  verifyContinuousRetention,
  type RetentionVerification,
} from "../operational-health/service.js";
import {
  defaultOperationalHealthPolicy,
  type OperationalHealthPolicy,
  type OperationalTelemetryEnvelope,
} from "../operational-health/types.js";
import { operationalHealthEvents } from "../operational-health/event-stream.js";

const deviceTypes = ["branch", "edge-agent", "recorder", "camera", "disk", "network", "ups"] as const;
const sources = ["onvif", "cp-plus-adapter", "rtsp", "system", "recording-engine"] as const;
const qualities = ["verified", "estimated", "unsupported", "unavailable"] as const;
const metricValue = z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]);
const telemetrySchema = z.object({
  branchId: z.string().min(1),
  edgeAgentId: z.string().min(1),
  deviceType: z.enum(deviceTypes),
  deviceId: z.string().min(1).max(200),
  observedAt: z.string().datetime(),
  source: z.enum(sources),
  quality: z.enum(qualities),
  idempotencyKey: z.string().min(1).max(200),
  metrics: z.record(z.string(), metricValue).default({}),
  reasonCodes: z.array(z.string().min(1).max(100)).max(30).default([]),
});
const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(["healthy", "warning", "critical", "unknown"]).optional(),
  branchId: z.string().optional(),
  region: z.string().trim().max(120).optional(),
  search: z.string().trim().max(120).optional(),
});
const policySchema = z.object({
  staleAfterSeconds: z.number().int().min(15).max(3600),
  offlineAfterSeconds: z.number().int().min(30).max(86_400),
  retentionDays: z.number().int().min(1).max(3650),
  maxRecordingGapSeconds: z.number().int().min(0).max(86_400),
  cameraWarningPercent: z.number().min(0).max(100),
  cameraCriticalPercent: z.number().min(0).max(100),
  latencyWarningMs: z.number().min(1).max(60_000),
  latencyCriticalMs: z.number().min(1).max(60_000),
  packetLossWarningPercent: z.number().min(0).max(100),
  packetLossCriticalPercent: z.number().min(0).max(100),
}).refine((value) => value.offlineAfterSeconds > value.staleAfterSeconds, {
  message: "offlineAfterSeconds must exceed staleAfterSeconds",
}).refine((value) => value.cameraCriticalPercent >= value.cameraWarningPercent, {
  message: "cameraCriticalPercent must be at least cameraWarningPercent",
}).refine((value) => value.latencyCriticalMs >= value.latencyWarningMs, {
  message: "latencyCriticalMs must be at least latencyWarningMs",
}).refine((value) => value.packetLossCriticalPercent >= value.packetLossWarningPercent, {
  message: "packetLossCriticalPercent must be at least packetLossWarningPercent",
});

export async function registerOperationalHealthRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  app.post("/v1/edge-agents/:id/telemetry", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const input = telemetrySchema.parse(request.body);
    if (input.edgeAgentId !== id) {
      return reply.code(400).send({ error: "edge_agent_identity_mismatch" });
    }
    const branch = await store.getNode(input.branchId);
    if (!branch || branch.type !== "branch") {
      return reply.code(404).send({ error: "branch_not_found" });
    }
    const agents = await store.listEdgeAgentsByBranch(branch.id);
    if (!agents.some((agent) => agent.id === id)) {
      return reply.code(403).send({ error: "edge_agent_branch_mismatch" });
    }
    if (input.deviceType === "camera") {
      const camera = await store.getCamera(input.deviceId);
      if (!camera || camera.branchId !== branch.id || (camera.edgeAgentId && camera.edgeAgentId !== id)) {
        return reply.code(403).send({ error: "camera_edge_scope_mismatch" });
      }
      const reported = input.metrics.status;
      if (reported === "online" || reported === "offline" || reported === "degraded" || reported === "unknown") {
        await store.updateCameraStatus(input.deviceId, reported);
      }
    }
    const receivedAt = new Date().toISOString();
    const envelope: OperationalTelemetryEnvelope = {
      tenantId: branch.tenantId,
      branchId: input.branchId,
      edgeAgentId: input.edgeAgentId,
      deviceType: input.deviceType,
      deviceId: input.deviceId,
      observedAt: input.observedAt,
      receivedAt,
      source: input.source,
      quality: input.quality,
      idempotencyKey: input.idempotencyKey,
      metrics: input.metrics,
      reasonCodes: input.reasonCodes,
    };
    const result = await store.ingestOperationalTelemetry(envelope);
    if (!result.duplicate) {
      operationalHealthEvents.publish({
        id: randomUUID(), tenantId: envelope.tenantId, type: "health.updated",
        occurredAt: receivedAt, branchId: envelope.branchId,
        deviceType: envelope.deviceType, deviceId: envelope.deviceId,
      });
    }
    return reply.code(result.duplicate ? 200 : 202).send({ ...result, receivedAt });
  });

  app.get("/v1/operations/health/summary", async (request) => {
    const projections = await loadAccessibleProjections(request, store);
    const cameras = projections.flatMap((branch) => branch.cameras);
    const agents = (await Promise.all(projections.map((branch) => store.listEdgeAgentsByBranch(branch.id)))).flat();
    return {
      success: true,
      data: {
        totalBranches: projections.length,
        healthyBranches: projections.filter((branch) => branch.healthStatus === "healthy").length,
        warningBranches: projections.filter((branch) => branch.healthStatus === "warning").length,
        criticalBranches: projections.filter((branch) => branch.healthStatus === "critical").length,
        unknownBranches: projections.filter((branch) => branch.healthStatus === "unknown").length,
        totalCameras: cameras.length,
        camerasOnline: cameras.filter((camera) => camera.onlineStatus === "healthy").length,
        camerasOffline: cameras.filter((camera) => camera.onlineStatus === "critical").length,
        camerasUnknown: cameras.filter((camera) => camera.onlineStatus === "unknown").length,
        camerasRecording: cameras.filter((camera) => camera.recordingStatus === "compliant").length,
        recordingFailures: cameras.filter((camera) => camera.recordingStatus === "breach").length,
        retentionBreaches: projections.reduce((sum, branch) => sum + branch.retentionBreaches, 0),
        activeCriticalAlerts: projections.reduce((sum, branch) => sum + branch.criticalAlerts, 0),
        totalEdgeAgents: agents.length,
        edgeAgentsOnline: projections.filter((branch) => branch.edgeAgentStatus === "online").length,
        edgeAgentsOffline: projections.filter((branch) => branch.edgeAgentStatus === "offline").length,
        edgeAgentsWarning: projections.filter((branch) => branch.edgeAgentStatus === "warning").length,
        edgeAgentsUnknown: projections.filter((branch) => branch.edgeAgentStatus === "unknown").length,
        timestamp: new Date().toISOString(),
      },
    };
  });

  app.get("/v1/operations/health/branches", async (request) => {
    const query = paginationSchema.parse(request.query);
    let projections = await loadAccessibleProjections(request, store);
    if (query.status) projections = projections.filter((branch) => branch.healthStatus === query.status);
    if (query.region) projections = projections.filter((branch) => branch.region === query.region);
    if (query.search) {
      const search = query.search.toLowerCase();
      projections = projections.filter((branch) =>
        `${branch.name} ${branch.code} ${branch.region}`.toLowerCase().includes(search),
      );
    }
    const total = projections.length;
    const branches = projections.slice(query.offset, query.offset + query.limit).map(({ cameras, ...branch }) => branch);
    return { success: true, data: { branches, total, limit: query.limit, offset: query.offset } };
  });

  app.get("/v1/operations/health/branches/:branchId", async (request, reply) => {
    const { branchId } = z.object({ branchId: z.string().min(1) }).parse(request.params);
    if (!(await canViewBranch(request, reply, store, branchId))) return;
    const projection = (await loadAccessibleProjections(request, store, [branchId]))[0];
    if (!projection) return reply.code(404).send({ error: "branch_not_found" });
    const agents = await store.listEdgeAgentsByBranch(branchId);
    const latest = await store.listLatestOperationalTelemetry(request.currentUser.tenantId, [branchId]);
    const agent = agents[0];
    const agentTelemetry = latest
      .filter((item) => item.deviceType === "edge-agent" && (!agent || item.deviceId === agent.id))
      .sort((left, right) => right.observedAt.localeCompare(left.observedAt))[0];
    const metric = (name: string) => typeof agentTelemetry?.metrics[name] === "number"
      ? agentTelemetry.metrics[name] as number
      : null;
    return { success: true, data: {
      ...projection,
      edgeAgent: {
        id: agent?.id ?? "unavailable",
        status: projection.edgeAgentStatus,
        version: agent?.version ?? "unknown",
        cpuUsage: metric("cpuUsedPercent"),
        memoryUsage: metric("memoryUsedPercent"),
        diskUsage: metric("diskUsedPercent"),
        lastHeartbeat: agentTelemetry?.observedAt ?? null,
        uptimeSeconds: metric("uptimeSeconds"),
      },
      edgeAgents: agents,
    } };
  });

  app.get("/v1/operations/health/cameras", async (request) => {
    const query = paginationSchema.parse(request.query);
    let projections = await loadAccessibleProjections(
      request,
      store,
      query.branchId ? [query.branchId] : undefined,
    );
    let cameras = projections.flatMap((branch) => branch.cameras.map((camera) => ({
      ...camera,
      branchName: branch.name,
    })));
    if (query.status) cameras = cameras.filter((camera) => camera.onlineStatus === query.status);
    const total = cameras.length;
    return {
      success: true,
      data: { cameras: cameras.slice(query.offset, query.offset + query.limit), total, limit: query.limit, offset: query.offset },
    };
  });

  app.get("/v1/operations/health/retention", async (request) => {
    const query = z.object({ branchId: z.string().optional() }).parse(request.query);
    const projections = await loadAccessibleProjections(request, store, query.branchId ? [query.branchId] : undefined);
    const items = projections.flatMap((branch) => branch.cameras.map((camera) => ({
      branchId: branch.id,
      branchName: branch.name,
      cameraId: camera.id,
      cameraName: camera.name,
      ...camera.retention,
    })));
    return { success: true, data: { items, total: items.length } };
  });

  app.get("/v1/operations/health/policy", async (request, reply) => {
    const { branchId } = z.object({ branchId: z.string().optional() }).parse(request.query);
    if (branchId && !(await canViewBranch(request, reply, store, branchId))) return;
    const stored = await store.getOperationalHealthPolicy(request.currentUser.tenantId, branchId);
    return { success: true, data: stored ?? defaultOperationalHealthPolicy };
  });

  app.put("/v1/operations/health/policy", async (request, reply) => {
    const input = z.object({ branchId: z.string().optional(), policy: policySchema }).parse(request.body);
    if (!(await canManagePolicy(request, reply, store, input.branchId))) return;
    const policy = await store.upsertOperationalHealthPolicy(
      request.currentUser.tenantId,
      input.branchId,
      input.policy as OperationalHealthPolicy,
    );
    operationalHealthEvents.publish({
      id: randomUUID(), tenantId: request.currentUser.tenantId,
      type: "policy.updated", occurredAt: new Date().toISOString(),
      ...(input.branchId ? { branchId: input.branchId } : {}),
    });
    return { success: true, data: policy };
  });

  app.get("/v1/operations/events", async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    reply.raw.write(`event: ready\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
    const unsubscribe = operationalHealthEvents.subscribe(request.currentUser.tenantId, (event) => {
      if (!reply.raw.destroyed) {
        reply.raw.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
    });
    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed) reply.raw.write(`: heartbeat ${Date.now()}\n\n`);
    }, 15_000);
    heartbeat.unref();
    request.raw.once("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.get("/v1/operations/alerts", async (request) => {
    const query = z.object({
      severity: z.enum(["critical", "warning", "info"]).optional(),
      status: z.enum(["active", "acknowledged", "resolved"]).optional(),
      branchId: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }).parse(request.query);
    const projections = await loadAccessibleProjections(request, store, query.branchId ? [query.branchId] : undefined);
    let alerts = projections.flatMap((branch) => {
      const componentAlerts = Object.entries(branch.components)
        .filter(([, component]) => component.status === "critical" || component.status === "warning")
        .map(([componentType, component]) => ({
          id: `health:${branch.id}:${componentType}`,
          severity: component.status === "critical" ? "critical" as const : "warning" as const,
          status: "active" as const,
          componentType,
          deviceId: null,
          title: `${componentType} health ${component.status}`,
          description: `Current evidence places ${componentType} health in ${component.status} state.`,
          impact: "Branch surveillance availability may be reduced.",
          recommendedAction: "Review the branch health detail and latest reason codes.",
          branchId: branch.id,
          branchName: branch.name,
          branchCode: branch.code,
          detectedAt: component.lastUpdated ?? new Date().toISOString(),
          acknowledgedAt: null, acknowledgedBy: null, acknowledgedByName: null,
          assignedAt: null, assignedTo: null, assignedToName: null,
          resolvedAt: null, resolvedBy: null, resolvedByName: null, resolution: null,
          slaDeadline: null, workOrderId: null,
        }));
      const retentionAlerts = branch.cameras
        .filter((camera) => camera.retention?.status === "breach")
        .map((camera) => ({
          id: `retention:${branch.id}:${camera.id}`,
          severity: "critical" as const,
          status: "active" as const,
          componentType: "retention",
          deviceId: camera.id,
          title: `Retention below policy: ${camera.name}`,
          description: `${camera.retention?.actualDays ?? 0} continuous days available; ${camera.retention?.configuredDays} required.`,
          impact: "Required surveillance footage may be unavailable.",
          recommendedAction: "Inspect recording gaps and recorder/storage health immediately.",
          branchId: branch.id, branchName: branch.name, branchCode: branch.code,
          detectedAt: camera.retention?.newestPlayableAt ?? new Date().toISOString(),
          acknowledgedAt: null, acknowledgedBy: null, acknowledgedByName: null,
          assignedAt: null, assignedTo: null, assignedToName: null,
          resolvedAt: null, resolvedBy: null, resolvedByName: null, resolution: null,
          slaDeadline: null, workOrderId: null,
        }));
      return [...componentAlerts, ...retentionAlerts];
    });
    if (query.severity) alerts = alerts.filter((alert) => alert.severity === query.severity);
    if (query.status) alerts = alerts.filter((alert) => alert.status === query.status);
    const total = alerts.length;
    return { success: true, data: { alerts: alerts.slice(query.offset, query.offset + query.limit), total, limit: query.limit, offset: query.offset } };
  });
}

async function loadAccessibleProjections(
  request: FastifyRequest,
  store: ControlPlaneStore,
  requestedBranchIds?: string[],
) {
  let branches = await store.listAccessibleNodes(request.currentUser, "recording:view", "branch");
  const regions = await store.listAccessibleNodes(request.currentUser, "recording:view", "region");
  const regionNames = new Map(regions.map((region) => [region.id, region.name]));
  if (requestedBranchIds) {
    const requested = new Set(requestedBranchIds);
    branches = branches.filter((branch) => requested.has(branch.id));
  }
  const telemetry = await store.listLatestOperationalTelemetry(request.currentUser.tenantId, branches.map((branch) => branch.id));
  return Promise.all(branches.map(async (branch) => {
    const policy = await store.getOperationalHealthPolicy(request.currentUser.tenantId, branch.id)
      ?? defaultOperationalHealthPolicy;
    const cameras = await store.listCamerasByBranch(request.currentUser, branch.id, "recording:view");
    const retentions: RetentionVerification[] = await Promise.all(cameras.map(async (camera) => {
      const job = await store.getRecordingJob(camera.id);
      const segments = await store.listRecordingSegments(camera.id);
      return verifyContinuousRetention(camera.id, segments, {
        retentionDays: Math.max(job?.retentionDays ?? 0, policy.retentionDays),
        maxRecordingGapSeconds: policy.maxRecordingGapSeconds,
      });
    }));
    return projectBranchHealth({
      branch,
      cameras,
      telemetry: telemetry.filter((item) => item.branchId === branch.id),
      retentions,
      policy,
      region: branch.path.map((id) => regionNames.get(id)).find(Boolean),
    });
  }));
}

async function canManagePolicy(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  branchId?: string,
) {
  if (branchId) {
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") {
      await reply.code(404).send({ error: "branch_not_found" });
      return false;
    }
    const decision = await store.checkAccess(request.currentUser, "device:configure", branchId);
    if (decision?.allowed) return true;
  } else {
    const companies = await store.listAccessibleNodes(request.currentUser, "org:manage", "company");
    if (companies.length > 0) return true;
  }
  await reply.code(403).send({ error: "forbidden" });
  return false;
}

async function canViewBranch(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  branchId: string,
) {
  const branch = await store.getNode(branchId);
  if (!branch || branch.type !== "branch") {
    await reply.code(404).send({ error: "branch_not_found" });
    return false;
  }
  const decision = await store.checkAccess(request.currentUser, "recording:view", branchId);
  if (!decision?.allowed) {
    await reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}
