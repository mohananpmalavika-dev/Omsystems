/**
 * Edge Telemetry Ingestion REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { telemetryIngestionService, CompressionService } from "../telemetry/index.js";

const boundedId = z.string().trim().min(1).max(200);
const timestamp = z.string().datetime();
const branchTelemetryEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  messageId: boundedId,
  tenantId: boundedId,
  branchId: boundedId,
  agentId: boundedId,
  sequenceNumber: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  observedAt: timestamp,
  sentAt: timestamp,
  type: z.enum(["FULL", "DELTA"]),
  internet: z.object({ state: z.enum(["HEALTHY", "DEGRADED", "FAILOVER", "OFFLINE"]), latencyMs: z.number().finite().min(0).max(300_000), packetLossPct: z.number().finite().min(0).max(100), mode: z.enum(["PRIMARY", "FAILOVER", "OFFLINE"]), uploadMbps: z.number().finite().min(0).max(1_000_000).optional() }).strict(),
  recorders: z.array(z.object({ recorderId: boundedId, model: z.string().max(200), state: z.enum(["HEALTHY", "WARNING", "CRITICAL", "OFFLINE"]), reachable: z.boolean(), recording: z.boolean(), channelsTotal: z.number().int().min(0).max(65_535), channelsRecording: z.number().int().min(0).max(65_535), clockOffsetSeconds: z.number().finite().min(-86_400).max(86_400) }).strict()).max(512),
  cameras: z.array(z.object({ cameraId: boundedId, channelNumber: z.number().int().min(0).max(65_535), state: z.enum(["HEALTHY", "WARNING", "CRITICAL", "OFFLINE", "UNKNOWN"]), reachable: z.boolean(), streamAvailable: z.boolean(), recording: z.boolean(), fps: z.number().finite().min(0).max(1_000).optional(), bitrateKbps: z.number().finite().min(0).max(10_000_000).optional(), lastRecordedAt: timestamp.optional() }).strict()).max(4_096),
  disks: z.array(z.object({ diskId: boundedId, slotNumber: z.number().int().min(0).max(65_535), state: z.enum(["HEALTHY", "WARNING", "FAILED"]), capacityBytes: z.number().finite().nonnegative(), freeBytes: z.number().finite().nonnegative(), smartStatus: z.enum(["PASSED", "WARNING", "FAILED"]), temperatureC: z.number().finite().min(-100).max(200), retentionDays: z.number().finite().min(0).max(36_500) }).strict().refine((disk) => disk.freeBytes <= disk.capacityBytes, { message: "freeBytes must not exceed capacityBytes" })).max(256),
  agent: z.object({ version: z.string().trim().min(1).max(100), uptimeSeconds: z.number().finite().nonnegative(), queueDepth: z.number().int().nonnegative().max(1_000_000), cpuPct: z.number().finite().min(0).max(100).optional(), memoryPct: z.number().finite().min(0).max(100).optional(), lastSuccessfulUploadAt: timestamp.optional() }).strict(),
}).strict();
const deviceTransitionSchema = z.object({
  eventType: z.literal("DEVICE_HEALTH_CHANGED"), messageId: boundedId, tenantId: boundedId,
  branchId: boundedId, agentId: boundedId, deviceId: boundedId,
  deviceType: z.enum(["CAMERA", "RECORDER", "STORAGE", "INTERNET", "ROUTER"]),
  previousState: z.string().trim().min(1).max(100), currentState: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(1).max(500), observedAt: timestamp,
}).strict();

export async function registerEdgeTelemetryRoutes(app: FastifyInstance) {
  /**
   * POST /api/v1/edge/telemetry
   */
  const handleIngestTelemetry = async (request: FastifyRequest, reply: FastifyReply) => {
    let payload = request.body as any;

    // Support gzip compressed body
    if (request.headers["content-encoding"] === "gzip" && Buffer.isBuffer(request.body)) {
      const json = await CompressionService.decompress(request.body);
      payload = JSON.parse(json);
    }

    const parsed = branchTelemetryEnvelopeSchema.safeParse(payload);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "invalid_telemetry_envelope", details: parsed.error.flatten() });
    }
    payload = parsed.data;
    if (request.edgeAgentAuthenticated && request.edgeAgentId && payload.agentId !== request.edgeAgentId) {
      return reply.status(403).send({ success: false, error: "edge_agent_identity_mismatch" });
    }

    try {
      const result = await telemetryIngestionService.ingestEnvelope(payload);
      return reply.status(result.duplicate ? 200 : 202).send({ success: true, data: result });
    } catch (error) {
      const code = error instanceof Error ? error.message : "telemetry_rejected";
      return reply.status(400).send({ success: false, error: code });
    }
  };

  app.post("/api/v1/edge/telemetry", handleIngestTelemetry);
  app.post("/v1/edge/telemetry", handleIngestTelemetry);

  /**
   * POST /api/v1/edge/transitions
   */
  const handleIngestTransition = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = deviceTransitionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "invalid_device_transition", details: parsed.error.flatten() });
    }
    if (request.edgeAgentAuthenticated && request.edgeAgentId && parsed.data.agentId !== request.edgeAgentId) {
      return reply.status(403).send({ success: false, error: "edge_agent_identity_mismatch" });
    }
    await telemetryIngestionService.recordTransition(parsed.data);
    return reply.status(202).send({ success: true, accepted: true });
  };

  app.post("/api/v1/edge/transitions", handleIngestTransition);
  app.post("/v1/edge/transitions", handleIngestTransition);

  /**
   * GET /api/v1/edge/agents
   */
  const handleListAgents = async (_request: FastifyRequest, reply: FastifyReply) => {
    const agents = telemetryIngestionService.listAgents();
    return reply.send({ success: true, count: agents.length, data: agents });
  };

  app.get("/api/v1/edge/agents", handleListAgents);
  app.get("/v1/edge/agents", handleListAgents);

  /**
   * GET /api/v1/edge/agents/:id/liveness
   */
  const handleGetAgentLiveness = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const liveness = telemetryIngestionService.getAgentLiveness(params.id);
    if (!liveness) {
      return reply.status(404).send({ success: false, error: "Agent not found" });
    }
    return reply.send({ success: true, data: liveness });
  };

  app.get("/api/v1/edge/agents/:id/liveness", handleGetAgentLiveness);
  app.get("/v1/edge/agents/:id/liveness", handleGetAgentLiveness);

  /**
   * GET /api/v1/telemetry/branches/:branchId/current
   */
  const handleGetBranchCurrent = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const current = telemetryIngestionService.getBranchCurrentState(params.branchId);
    if (!current) {
      return reply.status(404).send({ success: false, error: "Branch telemetry state not found" });
    }

    const { staleDataEvaluatorService, DEFAULT_OBSERVATION_TTLS } = await import("../telemetry/index.js");
    const metadata = staleDataEvaluatorService.evaluateMetadata(
      current.lastReportedAt,
      current.overallState,
      DEFAULT_OBSERVATION_TTLS.BRANCH_STATE_TTL_SECONDS
    );

    return reply.send({
      success: true,
      data: {
        ...current,
        effectiveState: metadata.effectiveState,
        isStale: metadata.isStale,
        freshnessStatus: metadata.freshnessStatus,
        observedAt: metadata.observedAt,
        expiresAt: metadata.expiresAt,
        ttlSeconds: metadata.ttlSeconds,
        stalenessReason: metadata.stalenessReason,
        lastObservedAgoSeconds: metadata.lastObservedAgoSeconds,
      },
    });
  };

  app.get("/api/v1/telemetry/branches/:branchId/current", handleGetBranchCurrent);
  app.get("/v1/telemetry/branches/:branchId/current", handleGetBranchCurrent);
}
