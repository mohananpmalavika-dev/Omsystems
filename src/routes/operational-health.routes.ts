import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import {
  projectBranchHealth,
  verifyContinuousRetention,
  type RetentionVerification,
  type RecorderArchiveEvidence,
} from "../operational-health/service.js";
import {
  defaultOperationalHealthPolicy,
  type OperationalHealthPolicy,
  type OperationalTelemetryEnvelope,
} from "../operational-health/types.js";
import { operationalHealthEvents } from "../operational-health/event-stream.js";
import {
  diskToMetrics,
  normalizeDiskMetrics,
  normalizeRecorderHddStatus,
  projectDiskHealth,
} from "../operational-health/disk-health.js";
import { normalizeNetworkMetrics, projectInternetLink, summarizeBranchInternet } from "../operational-health/network-health.js";
import { normalizeRecorderMetrics, projectRecorderChannelHealth, projectRecorderHealth } from "../operational-health/recorder-health.js";
import { normalizeEdgeAgentMetrics } from "../operational-health/edge-agent-health.js";

const deviceTypes = ["branch", "edge-agent", "recorder", "recorder-channel", "camera", "disk", "network", "ups"] as const;
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
const recorderHddSchema = z.object({
  branchId: z.string().min(1),
  recorderId: z.string().min(1).max(200),
  observedAt: z.string().datetime(),
  source: z.enum(sources).default("cp-plus-adapter"),
  quality: z.enum(qualities).default("verified"),
  idempotencyKey: z.string().min(1).max(200),
  hddStatus: z.union([
    z.array(z.record(z.string(), z.unknown())).max(64),
    z.record(z.string(), z.unknown()),
  ]),
});
const recorderArchiveSchema = z.object({
  branchId: z.string().min(1),
  recorderId: z.string().min(1).max(150),
  observedAt: z.string().datetime(),
  source: z.enum(sources).default("system"),
  quality: z.enum(qualities).default("verified"),
  idempotencyKey: z.string().min(1).max(200),
  entries: z.array(z.object({
    cameraId: z.string().min(1).max(200),
    sourceChannel: z.number().int().min(0).max(65_535),
    status: z.enum(["available", "empty", "unavailable"]),
    oldestContinuousAt: z.string().datetime().nullable(),
    newestPlayableAt: z.string().datetime().nullable(),
    retentionLowerBound: z.boolean(),
    coverageComplete: z.boolean(),
    continuityGapSeconds: z.number().int().min(0).max(86_400),
    gapCount: z.number().int().min(0).default(0),
    largestGapSeconds: z.number().min(0).default(0),
    searchStartedAt: z.string().datetime(),
    reasonCodes: z.array(z.string().min(1).max(100)).max(30).default([]),
  })).min(1).max(128).superRefine((entries, context) => {
    const cameras = new Set<string>();
    const channels = new Set<number>();
    entries.forEach((entry, index) => {
      if (cameras.has(entry.cameraId)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "cameraId"], message: "cameraId is duplicated" });
      if (channels.has(entry.sourceChannel)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "sourceChannel"], message: "sourceChannel is duplicated" });
      cameras.add(entry.cameraId);
      channels.add(entry.sourceChannel);
    });
  }),
});
const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(["healthy", "warning", "critical", "unknown"]).optional(),
  connectivity: z.enum(["online", "degraded", "failover", "offline", "unknown"]).optional(),
  branchId: z.string().optional(),
  region: z.string().trim().max(120).optional(),
  search: z.string().trim().max(120).optional(),
});
const policySchema = z.object({
  staleAfterSeconds: z.number().int().min(15).max(3600),
  offlineAfterSeconds: z.number().int().min(30).max(86_400),
  retentionDays: z.number().int().min(1).max(3650),
  retentionWarningDays: z.number().int().min(1).max(365).default(7),
  maxRecordingGapSeconds: z.number().int().min(0).max(86_400),
  cameraWarningPercent: z.number().min(0).max(100),
  cameraCriticalPercent: z.number().min(0).max(100),
  latencyWarningMs: z.number().min(1).max(60_000),
  latencyCriticalMs: z.number().min(1).max(60_000),
  jitterWarningMs: z.number().min(0).max(60_000).default(30),
  jitterCriticalMs: z.number().min(0).max(60_000).default(60),
  packetLossWarningPercent: z.number().min(0).max(100),
  packetLossCriticalPercent: z.number().min(0).max(100),
  bandwidthUtilizationWarningPercent: z.number().min(0).max(100).default(80),
  bandwidthUtilizationCriticalPercent: z.number().min(0).max(100).default(95),
  edgeAgentWarningPercent: z.number().min(0).max(100).default(80),
  edgeAgentCriticalPercent: z.number().min(0).max(100).default(95),
}).refine((value) => value.offlineAfterSeconds > value.staleAfterSeconds, {
  message: "offlineAfterSeconds must exceed staleAfterSeconds",
}).refine((value) => value.cameraCriticalPercent >= value.cameraWarningPercent, {
  message: "cameraCriticalPercent must be at least cameraWarningPercent",
}).refine((value) => value.latencyCriticalMs >= value.latencyWarningMs, {
  message: "latencyCriticalMs must be at least latencyWarningMs",
}).refine((value) => value.packetLossCriticalPercent >= value.packetLossWarningPercent, {
  message: "packetLossCriticalPercent must be at least packetLossWarningPercent",
}).refine((value) => value.jitterCriticalMs >= value.jitterWarningMs, {
  message: "jitterCriticalMs must be at least jitterWarningMs",
}).refine((value) => value.bandwidthUtilizationCriticalPercent >= value.bandwidthUtilizationWarningPercent, {
  message: "bandwidthUtilizationCriticalPercent must be at least bandwidthUtilizationWarningPercent",
}).refine((value) => value.edgeAgentCriticalPercent >= value.edgeAgentWarningPercent, {
  message: "edgeAgentCriticalPercent must be at least edgeAgentWarningPercent",
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
    const normalizedDisk = input.deviceType === "disk"
      ? normalizeDiskMetrics(input.metrics, input.deviceId)
      : null;
    const effectivePolicy = input.deviceType === "network" || input.deviceType === "edge-agent"
      ? { ...defaultOperationalHealthPolicy, ...((await store.getOperationalHealthPolicy(branch.tenantId, branch.id)) ?? {}) }
      : null;
    const normalizedNetwork = input.deviceType === "network" && effectivePolicy
      ? normalizeNetworkMetrics(input.metrics, effectivePolicy)
      : null;
    const normalizedEdgeAgent = input.deviceType === "edge-agent" && effectivePolicy
      ? normalizeEdgeAgentMetrics(input.metrics, effectivePolicy)
      : null;
    const normalizedRecorder = input.deviceType === "recorder" ? normalizeRecorderMetrics(input.metrics) : null;
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
      metrics: normalizedDisk?.metrics ?? normalizedNetwork?.metrics ?? normalizedEdgeAgent?.metrics ?? normalizedRecorder?.metrics ?? input.metrics,
      reasonCodes: [...new Set([...input.reasonCodes, ...(normalizedDisk?.reasonCodes ?? []), ...(normalizedNetwork?.reasonCodes ?? []), ...(normalizedEdgeAgent?.reasonCodes ?? []), ...(normalizedRecorder?.reasonCodes ?? [])])],
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

  app.post("/v1/edge-agents/:id/recorder-hdd", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const input = recorderHddSchema.parse(request.body);
    const branch = await store.getNode(input.branchId);
    if (!branch || branch.type !== "branch") return reply.code(404).send({ error: "branch_not_found" });
    const agents = await store.listEdgeAgentsByBranch(branch.id);
    if (!agents.some((agent) => agent.id === id)) {
      return reply.code(403).send({ error: "edge_agent_branch_mismatch" });
    }
    const disks = normalizeRecorderHddStatus(input.hddStatus);
    if (disks.length === 0) return reply.code(422).send({ error: "hdd_status_unparseable" });
    const receivedAt = new Date().toISOString();
    const results = [];
    for (const [index, disk] of disks.entries()) {
      const deviceId = `${input.recorderId}:disk:${disk.id || index + 1}`;
      const envelope: OperationalTelemetryEnvelope = {
        tenantId: branch.tenantId,
        branchId: branch.id,
        edgeAgentId: id,
        deviceType: "disk",
        deviceId,
        observedAt: input.observedAt,
        receivedAt,
        source: input.source,
        quality: input.quality,
        idempotencyKey: `${input.idempotencyKey}:${disk.id || index + 1}`,
        metrics: diskToMetrics(disk),
        reasonCodes: disk.reasonCodes,
      };
      const result = await store.ingestOperationalTelemetry(envelope);
      results.push({ deviceId, ...result, smartStatus: disk.smartStatus, failureProbability: disk.failureProbability });
      if (!result.duplicate) {
        operationalHealthEvents.publish({
          id: randomUUID(), tenantId: branch.tenantId, type: "health.updated",
          occurredAt: receivedAt, branchId: branch.id, deviceType: "disk", deviceId,
        });
      }
    }
    return reply.code(results.every((item) => item.duplicate) ? 200 : 202).send({
      accepted: results.filter((item) => !item.duplicate).length,
      duplicates: results.filter((item) => item.duplicate).length,
      disks: results,
      receivedAt,
    });
  });

  app.post("/v1/edge-agents/:id/recorder-archive", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const input = recorderArchiveSchema.parse(request.body);
    const branch = await store.getNode(input.branchId);
    if (!branch || branch.type !== "branch") return reply.code(404).send({ error: "branch_not_found" });
    const agents = await store.listEdgeAgentsByBranch(branch.id);
    if (!agents.some((agent) => agent.id === id)) return reply.code(403).send({ error: "edge_agent_branch_mismatch" });
    const cameras = await Promise.all(input.entries.map((entry) => store.getCamera(entry.cameraId)));
    if (cameras.some((camera) => !camera || camera.branchId !== branch.id || (camera.edgeAgentId && camera.edgeAgentId !== id))) {
      return reply.code(403).send({ error: "camera_edge_scope_mismatch" });
    }
    const receivedAt = new Date().toISOString();
    const results = [];
    for (const entry of input.entries) {
      const deviceId = `${input.recorderId}:archive:${entry.sourceChannel}`;
      const envelope: OperationalTelemetryEnvelope = {
        tenantId: branch.tenantId, branchId: branch.id, edgeAgentId: id,
        deviceType: "archive", deviceId, observedAt: input.observedAt, receivedAt,
        source: input.source, quality: input.quality,
        idempotencyKey: `${input.idempotencyKey}:${entry.sourceChannel}`,
        metrics: {
          recorderId: input.recorderId, cameraId: entry.cameraId, sourceChannel: entry.sourceChannel,
          archiveStatus: entry.status, oldestContinuousAt: entry.oldestContinuousAt,
          newestPlayableAt: entry.newestPlayableAt, retentionLowerBound: entry.retentionLowerBound,
          coverageComplete: entry.coverageComplete, continuityGapSeconds: entry.continuityGapSeconds,
          gapCount: entry.gapCount, largestGapSeconds: entry.largestGapSeconds,
          searchStartedAt: entry.searchStartedAt,
        },
        reasonCodes: entry.reasonCodes,
      };
      const result = await store.ingestOperationalTelemetry(envelope);
      results.push({ deviceId, ...result });
      if (!result.duplicate) {
        operationalHealthEvents.publish({
          id: randomUUID(), tenantId: branch.tenantId, type: "health.updated", occurredAt: receivedAt,
          branchId: branch.id, deviceType: "archive", deviceId,
        });
      }
    }
    return reply.code(results.every((item) => item.duplicate) ? 200 : 202).send({
      accepted: results.filter((item) => !item.duplicate).length,
      duplicates: results.filter((item) => item.duplicate).length,
      archiveEvidence: results,
      receivedAt,
    });
  });

  app.get("/v1/operations/health/summary", async (request) => {
    const projections = await loadAccessibleProjections(request, store);
    const cameras = projections.flatMap((branch) => branch.cameras);
    const agents = (await Promise.all(projections.map((branch) => store.listEdgeAgentsByBranch(branch.id)))).flat();
    const scoredBranches = projections.filter((branch) => branch.healthScore !== null);
    const overallHealthScore = scoredBranches.length > 0
      ? Math.round((scoredBranches.reduce((sum, branch) => sum + (branch.healthScore ?? 0), 0) / scoredBranches.length) * 10) / 10
      : 0;
    return {
      success: true,
      data: {
        totalBranches: projections.length,
        onlineBranches: projections.filter((branch) => branch.internetStatus === "online").length,
        offlineBranches: projections.filter((branch) => branch.internetStatus === "offline").length,
        healthyBranches: projections.filter((branch) => branch.healthStatus === "healthy").length,
        warningBranches: projections.filter((branch) => branch.healthStatus === "warning").length,
        criticalBranches: projections.filter((branch) => branch.healthStatus === "critical").length,
        unknownBranches: projections.filter((branch) => branch.healthStatus === "unknown").length,
        overallHealthScore,
        totalCameras: cameras.length,
        camerasOnline: cameras.filter((camera) => camera.onlineStatus === "online").length,
        camerasOffline: cameras.filter((camera) => camera.onlineStatus === "offline").length,
        camerasUnknown: cameras.filter((camera) => camera.onlineStatus === "unknown").length,
        camerasRecording: cameras.filter((camera) => camera.recordingStatus === "compliant" || camera.recordingStatus === "at_risk").length,
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
    if (query.connectivity) projections = projections.filter((branch) => branch.internetStatus === query.connectivity);
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
    return { success: true, data: {
      items, total: items.length,
      summary: {
        compliant: items.filter((item) => item.status === "compliant").length,
        atRisk: items.filter((item) => item.status === "at_risk").length,
        breaches: items.filter((item) => item.status === "breach").length,
        unknown: items.filter((item) => item.status === "unknown").length,
      },
      calculatedAt: new Date().toISOString(),
    } };
  });

  app.get("/v1/operations/health/disks", async (request) => {
    const query = z.object({
      branchId: z.string().optional(),
      status: z.enum(["healthy", "warning", "degraded", "failure_predicted", "failed", "missing"]).optional(),
    }).parse(request.query);
    const projections = await loadAccessibleProjections(request, store, query.branchId ? [query.branchId] : undefined);
    const branchById = new Map(projections.map((branch) => [branch.id, branch]));
    const telemetry = await store.listLatestOperationalTelemetry(request.currentUser.tenantId, [...branchById.keys()]);
    let disks = telemetry
      .filter((item) => item.deviceType === "disk")
      .flatMap((item) => {
        const branch = branchById.get(item.branchId);
        return branch ? [projectDiskHealth(item, branch)] : [];
      })
      .sort((left, right) => right.failureProbability - left.failureProbability || left.branchName.localeCompare(right.branchName));
    if (query.status) disks = disks.filter((disk) => disk.smartStatus === query.status);
    return { success: true, data: disks };
  });

  app.get("/v1/operations/health/network", async (request) => {
    const query = z.object({ branchId: z.string().optional() }).parse(request.query);
    const projections = await loadAccessibleProjections(request, store, query.branchId ? [query.branchId] : undefined);
    const branchById = new Map(projections.map((branch) => [branch.id, branch]));
    const telemetry = await store.listLatestOperationalTelemetry(request.currentUser.tenantId, [...branchById.keys()]);
    const links = telemetry.filter((item) => item.deviceType === "network").flatMap((item) => {
      const branch = branchById.get(item.branchId); return branch ? [projectInternetLink(item, branch)] : [];
    });
    const branches = [...branchById.values()].map((branch) => ({
      branchId: branch.id, branchName: branch.name, branchCode: branch.code,
      ...summarizeBranchInternet(links.filter((link) => link.branchId === branch.id)),
    })).sort((left, right) => {
      const order = { offline: 0, failover: 1, degraded: 2, unknown: 3, online: 4 } as const;
      return order[left.status] - order[right.status] || left.branchName.localeCompare(right.branchName);
    });
    return { success: true, data: {
      branches, links,
      summary: {
        totalBranches: branches.length,
        online: branches.filter((branch) => branch.status === "online").length,
        degraded: branches.filter((branch) => branch.status === "degraded").length,
        failover: branches.filter((branch) => branch.status === "failover").length,
        offline: branches.filter((branch) => branch.status === "offline").length,
        unknown: branches.filter((branch) => branch.status === "unknown").length,
      }, calculatedAt: new Date().toISOString(),
    } };
  });

  app.get("/v1/operations/health/recorders", async (request) => {
    const query = z.object({
      branchId: z.string().optional(), status: z.enum(["online", "offline", "degraded", "unknown"]).optional(),
    }).parse(request.query);
    const projections = await loadAccessibleProjections(request, store, query.branchId ? [query.branchId] : undefined);
    const branchById = new Map(projections.map((branch) => [branch.id, branch]));
    const telemetry = await store.listLatestOperationalTelemetry(request.currentUser.tenantId, [...branchById.keys()]);
    const channelsByRecorder = new Map<string, ReturnType<typeof projectRecorderChannelHealth>[]>();
    for (const item of telemetry) {
      if (item.deviceType !== "recorder-channel") continue;
      const channel = projectRecorderChannelHealth(item);
      if (!channel.recorderId || channel.sourceChannel === null) continue;
      const channels = channelsByRecorder.get(channel.recorderId) ?? [];
      channels.push(channel);
      channelsByRecorder.set(channel.recorderId, channels);
    }
    let recorders = telemetry.filter((item) => item.deviceType === "recorder").flatMap((item) => {
      const branch = branchById.get(item.branchId);
      if (!branch) return [];
      const recorder = projectRecorderHealth(item, branch);
      const channels = (channelsByRecorder.get(recorder.id) ?? []).sort((left, right) => (left.sourceChannel ?? 0) - (right.sourceChannel ?? 0));
      const channelTimestamps = channels.map((channel) => channel.lastRecordedAt).filter((value): value is string => Boolean(value));
      return [{
        ...recorder,
        channels,
        lastRecordedAt: recorder.lastRecordedAt ?? newestTimestamp(channelTimestamps),
      }];
    });
    if (query.status) recorders = recorders.filter((recorder) => recorder.status === query.status);
    recorders.sort((left, right) => {
      const rank = { offline: 0, degraded: 1, unknown: 2, online: 3 } as const;
      return rank[left.status] - rank[right.status] || left.branchName.localeCompare(right.branchName);
    });
    return { success: true, data: {
      recorders,
      summary: {
        total: recorders.length, online: recorders.filter((item) => item.status === "online").length,
        offline: recorders.filter((item) => item.status === "offline").length,
        degraded: recorders.filter((item) => item.status === "degraded").length,
        unknown: recorders.filter((item) => item.status === "unknown").length,
        recording: recorders.filter((item) => item.recordingStatus === "recording").length,
        partial: recorders.filter((item) => item.recordingStatus === "partial").length,
        stopped: recorders.filter((item) => item.recordingStatus === "stopped").length,
        unverified: recorders.filter((item) => item.recordingStatus === "unknown").length,
        affectedBranches: new Set(recorders.filter((item) => item.status !== "online").map((item) => item.branchId)).size,
      }, calculatedAt: new Date().toISOString(),
    } };
  });

  app.get("/v1/operations/health/policy", async (request, reply) => {
    const { branchId } = z.object({ branchId: z.string().optional() }).parse(request.query);
    if (branchId && !(await canViewBranch(request, reply, store, branchId))) return;
    const stored = await store.getOperationalHealthPolicy(request.currentUser.tenantId, branchId);
    return { success: true, data: { ...defaultOperationalHealthPolicy, ...(stored ?? {}) } };
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
      component: z.string().max(100).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }).parse(request.query);
    const projections = await loadAccessibleProjections(request, store, query.branchId ? [query.branchId] : undefined);
    const branchById = new Map(projections.map((branch) => [branch.id, branch]));
    const diskTelemetry = await store.listLatestOperationalTelemetry(request.currentUser.tenantId, [...branchById.keys()]);
    const diskAlerts = diskTelemetry
      .filter((item) => item.deviceType === "disk")
      .flatMap((item) => {
        const branch = branchById.get(item.branchId);
        if (!branch) return [];
        const disk = projectDiskHealth(item, branch);
        if (disk.smartStatus === "healthy") return [];
        const critical = ["failure_predicted", "failed", "missing"].includes(disk.smartStatus);
        return [{
          id: `hdd:${branch.id}:${disk.id}`,
          severity: critical ? "critical" as const : "warning" as const,
          status: "active" as const,
          componentType: "storage",
          deviceId: disk.id,
          title: `HDD ${disk.smartStatus.replaceAll("_", " ")}: ${disk.devicePath}`,
          description: `${disk.model} has a ${disk.failureProbability.toFixed(1)}% SMART risk score. ${disk.reasonCodes.join(", ")}.`,
          impact: critical ? "Recording data is at immediate risk of loss." : "Disk degradation may reduce recording reliability.",
          recommendedAction: critical ? "Verify redundancy and replace the disk immediately." : "Run an extended SMART test and schedule preventive replacement.",
          branchId: branch.id, branchName: branch.name, branchCode: branch.code,
          detectedAt: disk.lastCheck,
          acknowledgedAt: null, acknowledgedBy: null, acknowledgedByName: null,
          assignedAt: null, assignedTo: null, assignedToName: null,
          resolvedAt: null, resolvedBy: null, resolvedByName: null, resolution: null,
          slaDeadline: null, workOrderId: null,
        }];
      });
    const networkAlerts = diskTelemetry
      .filter((item) => item.deviceType === "network")
      .flatMap((item) => {
        const branch = branchById.get(item.branchId); if (!branch) return [];
        const link = projectInternetLink(item, branch);
        if (link.status === "online") return [];
        const offline = link.status === "offline";
        return [{
          id: `internet:${branch.id}:${link.linkId}`,
          severity: offline && link.role === "primary" ? "critical" as const : "warning" as const,
          status: "active" as const, componentType: "network", deviceId: item.deviceId,
          title: offline ? `${link.role} internet link offline` : `${link.role} internet link degraded`,
          description: `${link.ispName}: latency ${link.latencyMs ?? "unknown"}ms, jitter ${link.jitterMs ?? "unknown"}ms, packet loss ${link.packetLossPercent ?? "unknown"}%, utilization ${link.bandwidthUtilizationPercent ?? "unknown"}%.`,
          impact: offline ? "Remote branch surveillance connectivity is unavailable or running without redundancy." : "Live video and remote operations may be impaired.",
          recommendedAction: offline ? "Confirm ISP outage and validate backup-link failover immediately." : "Review ISP performance, interface traffic, and bandwidth saturation.",
          branchId: branch.id, branchName: branch.name, branchCode: branch.code, detectedAt: link.lastCheck,
          acknowledgedAt: null, acknowledgedBy: null, acknowledgedByName: null,
          assignedAt: null, assignedTo: null, assignedToName: null,
          resolvedAt: null, resolvedBy: null, resolvedByName: null, resolution: null,
          slaDeadline: null, workOrderId: null,
        }];
      });
    const recorderAlerts = diskTelemetry.filter((item) => item.deviceType === "recorder").flatMap((item) => {
      const branch = branchById.get(item.branchId); if (!branch) return [];
      const recorder = projectRecorderHealth(item, branch); if (recorder.status === "online") return [];
      const offline = recorder.status === "offline";
      return [{
        id: `recorder:${branch.id}:${recorder.id}`,
        severity: offline ? "critical" as const : "warning" as const, status: "active" as const,
        componentType: "recording", deviceId: recorder.id,
        title: `${recorder.deviceType.toUpperCase()} ${offline ? "offline" : "degraded"}: ${recorder.name}`,
        description: `${recorder.vendor} ${recorder.model}; recording ${recorder.recordingStatus}; cameras ${recorder.connectedCameras ?? "unknown"}/${recorder.totalCameras ?? "unknown"}.`,
        impact: offline ? "Live and recorded video from this recorder may be unavailable." : "Some recording channels or recorder functions may be impaired.",
        recommendedAction: offline ? "Verify recorder power, branch LAN connectivity, and vendor API credentials." : "Inspect recording state and offline channels.",
        branchId: branch.id, branchName: branch.name, branchCode: branch.code, detectedAt: recorder.lastCheck,
        acknowledgedAt: null, acknowledgedBy: null, acknowledgedByName: null,
        assignedAt: null, assignedTo: null, assignedToName: null,
        resolvedAt: null, resolvedBy: null, resolvedByName: null, resolution: null,
        slaDeadline: null, workOrderId: null,
      }];
    });
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
        .filter((camera) => camera.retention?.status === "breach" || camera.retention?.status === "at_risk")
        .map((camera) => ({
          id: `retention:${branch.id}:${camera.id}`,
          severity: camera.retention?.status === "breach" ? "critical" as const : "warning" as const,
          status: "active" as const,
          componentType: "retention",
          deviceId: camera.id,
          title: camera.retention?.status === "breach" ? `Retention below policy: ${camera.name}` : `Retention approaching threshold: ${camera.name}`,
          description: `${camera.retention?.actualDays ?? 0} continuous days available; ${camera.retention?.configuredDays} required; seven-day forecast ${camera.retention?.forecastDaysIn7Days ?? "unknown"} days.`,
          impact: camera.retention?.status === "breach" ? "Required surveillance footage may be unavailable." : "The camera is within the configured early-warning margin.",
          recommendedAction: camera.retention?.status === "breach" ? "Inspect recording gaps and recorder/storage health immediately." : "Review storage capacity and recording continuity before a breach occurs.",
          branchId: branch.id, branchName: branch.name, branchCode: branch.code,
          detectedAt: camera.retention?.newestPlayableAt ?? new Date().toISOString(),
          acknowledgedAt: null, acknowledgedBy: null, acknowledgedByName: null,
          assignedAt: null, assignedTo: null, assignedToName: null,
          resolvedAt: null, resolvedBy: null, resolvedByName: null, resolution: null,
          slaDeadline: null, workOrderId: null,
        }));
      return [...componentAlerts, ...retentionAlerts];
    });
    alerts = [...diskAlerts, ...networkAlerts, ...recorderAlerts, ...alerts];
    if (query.severity) alerts = alerts.filter((alert) => alert.severity === query.severity);
    if (query.status) alerts = alerts.filter((alert) => alert.status === query.status);
    if (query.component) alerts = alerts.filter((alert) => alert.componentType === query.component);
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
  const calculatedAt = Date.now();
  return Promise.all(branches.map(async (branch) => {
    const storedPolicy = await store.getOperationalHealthPolicy(request.currentUser.tenantId, branch.id);
    const policy = { ...defaultOperationalHealthPolicy, ...(storedPolicy ?? {}) };
    const cameras = await store.listCamerasByBranch(request.currentUser, branch.id, "recording:view");
    const archiveByCamera = latestArchiveEvidenceByCamera(telemetry.filter((item) => item.branchId === branch.id));
    const retentions: RetentionVerification[] = await Promise.all(cameras.map(async (camera) => {
      const job = await store.getRecordingJob(camera.id);
      const segments = await store.listRecordingSegments(camera.id);
      return verifyContinuousRetention(camera.id, segments, {
        retentionDays: Math.max(job?.retentionDays ?? 0, policy.retentionDays),
        retentionWarningDays: policy.retentionWarningDays,
        maxRecordingGapSeconds: policy.maxRecordingGapSeconds,
      }, calculatedAt, archiveByCamera.get(camera.id));
    }));
    return projectBranchHealth({
      branch,
      cameras,
      telemetry: telemetry.filter((item) => item.branchId === branch.id),
      retentions,
      policy,
      now: calculatedAt,
      region: branch.path.map((id) => regionNames.get(id)).find(Boolean),
    });
  }));
}

function latestArchiveEvidenceByCamera(telemetry: OperationalTelemetryEnvelope[]) {
  const evidence = new Map<string, RecorderArchiveEvidence>();
  for (const item of telemetry) {
    if (item.deviceType !== "archive") continue;
    const metrics = item.metrics;
    const cameraId = stringMetric(metrics.cameraId);
    const recorderId = stringMetric(metrics.recorderId);
    const status = stringMetric(metrics.archiveStatus);
    const sourceChannel = numberMetric(metrics.sourceChannel);
    const continuityGapSeconds = numberMetric(metrics.continuityGapSeconds);
    const coverageComplete = booleanMetric(metrics.coverageComplete);
    const retentionLowerBound = booleanMetric(metrics.retentionLowerBound);
    const gapCount = numberMetric(metrics.gapCount);
    const largestGapSeconds = numberMetric(metrics.largestGapSeconds);
    if (!cameraId || !recorderId || (status !== "available" && status !== "empty" && status !== "unavailable")
      || sourceChannel === null || continuityGapSeconds === null || coverageComplete === null || retentionLowerBound === null) continue;
    const next: RecorderArchiveEvidence = {
      recorderId, observedAt: item.observedAt, sourceChannel, status,
      oldestContinuousAt: nullableStringMetric(metrics.oldestContinuousAt),
      newestPlayableAt: nullableStringMetric(metrics.newestPlayableAt),
      retentionLowerBound, coverageComplete, continuityGapSeconds,
      gapCount: gapCount ?? 0, largestGapSeconds: largestGapSeconds ?? 0,
      reasonCodes: item.reasonCodes,
    };
    const current = evidence.get(cameraId);
    if (!current || Date.parse(current.observedAt) < Date.parse(next.observedAt)) evidence.set(cameraId, next);
  }
  return evidence;
}

function stringMetric(value: OperationalTelemetryEnvelope["metrics"][string] | undefined) {
  return typeof value === "string" ? value : "";
}
function nullableStringMetric(value: OperationalTelemetryEnvelope["metrics"][string] | undefined) {
  return typeof value === "string" ? value : null;
}
function numberMetric(value: OperationalTelemetryEnvelope["metrics"][string] | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function booleanMetric(value: OperationalTelemetryEnvelope["metrics"][string] | undefined) {
  return typeof value === "boolean" ? value : null;
}

function newestTimestamp(values: string[]) {
  let newest: string | null = null;
  let newestTime = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > newestTime) { newest = value; newestTime = parsed; }
  }
  return newest;
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
