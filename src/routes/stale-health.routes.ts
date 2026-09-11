import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { EntityType, HealthObservation } from "../operational-health/domain/stale-semantics.types.js";
import { telemetryQualityService } from "../operational-health/services/telemetry-quality.service.js";
import { staleDependencyIntegrator } from "../operational-health/services/stale-dependency-integrator.service.js";
import type { ControlPlaneStore } from "../control-plane-store.js";

const observationSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string().optional(),
  branchId: z.string().optional(),
  entityId: z.string().min(1),
  entityType: z.enum([
    "BRANCH",
    "INTERNET",
    "EDGE_GATEWAY",
    "ROUTER",
    "SWITCH",
    "RECORDER",
    "CAMERA",
    "DISK",
    "RECORDING",
    "NTP",
    "VPN",
  ]),
  health: z.enum(["HEALTHY", "WARNING", "CRITICAL"]),
  observedAt: z.string().or(z.date()),
  receivedAt: z.string().or(z.date()).optional(),
  expiresAt: z.string().or(z.date()).optional(),
  source: z.string().default("edge-health-agent"),
  data: z.record(z.unknown()).optional(),
  reason: z.string().optional(),
  reasonCode: z.string().optional(),
});

const batchIngestSchema = z.object({
  branchId: z.string().optional(),
  observations: z.array(observationSchema),
});

const branchEvaluateSchema = z.object({
  branchId: z.string(),
  branchName: z.string().optional(),
  internet: observationSchema.optional(),
  router: observationSchema.optional(),
  switch: observationSchema.optional(),
  recorders: z.array(observationSchema).default([]),
  cameras: z.array(observationSchema).default([]),
  disks: z.array(observationSchema).default([]),
});

export async function registerStaleHealthRoutes(app: FastifyInstance, store: ControlPlaneStore): Promise<void> {
  const authorizeBranch = async (request: FastifyRequest, reply: any, branchId: string, action: "live:view" | "device:configure") => {
    const user = request.currentUser;
    const branch = user && await store.getNode(branchId);
    const access = user && branch && await store.checkAccess(user, action, branchId);
    if (!user?.tenantId || !branch || branch.type !== "branch" || branch.tenantId !== user.tenantId || !access?.allowed) {
      await reply.code(user ? 404 : 401).send({ success: false, error: user ? "health_resource_not_found" : "unauthorized" });
      return undefined;
    }
    return user;
  };
  // 1. Ingest Single Health Observation
  app.post("/v1/health/observations/ingest", async (request, reply) => {
    const body = observationSchema.parse(request.body);
    if (!body.branchId || !await authorizeBranch(request, reply, body.branchId, "device:configure")) return;
    const enriched = telemetryQualityService.ingestObservation({ ...body, tenantId: request.currentUser.tenantId } as HealthObservation);
    return reply.code(201).send({
      success: true,
      message: "Health observation ingested and freshness TTL calculated",
      data: enriched,
    });
  });

  // 2. Ingest Batch of Health Observations
  app.post("/v1/health/observations/batch", async (request, reply) => {
    const body = batchIngestSchema.parse(request.body);
    const branchIds = new Set(body.observations.map((observation) => observation.branchId ?? body.branchId));
    if (branchIds.has(undefined)) return reply.code(400).send({ success: false, error: "branch_id_required" });
    for (const branchId of branchIds) if (!await authorizeBranch(request, reply, branchId!, "device:configure")) return;
    const enriched = telemetryQualityService.ingestBatch(body.observations.map((observation) => ({ ...observation, branchId: observation.branchId ?? body.branchId, tenantId: request.currentUser.tenantId })) as HealthObservation[]);
    return reply.code(201).send({
      success: true,
      count: enriched.length,
      data: enriched,
    });
  });

  // 3. Get Raw Observation
  app.get("/v1/health/observations/:entityType/:entityId", async (request, reply) => {
    const { entityType, entityId } = request.params as { entityType: EntityType; entityId: string };
    const { branchId } = z.object({ branchId: z.string().min(1) }).parse(request.query);
    if (!await authorizeBranch(request, reply, branchId, "live:view")) return;
    const obs = telemetryQualityService.getObservation(entityType, entityId);
    if (!obs) {
      return reply.code(404).send({ error: "observation_not_found", message: `No observation for ${entityType}:${entityId}` });
    }
    return reply.code(200).send({ success: true, data: obs });
  });

  // 4. Get Effective Health Evaluation with Freshness
  app.get("/v1/health/evaluations/:entityType/:entityId", async (request, reply) => {
    const { entityType, entityId } = request.params as { entityType: EntityType; entityId: string };
    const { branchId } = z.object({ branchId: z.string().min(1) }).parse(request.query);
    if (!await authorizeBranch(request, reply, branchId, "live:view")) return;
    const evaluated = telemetryQualityService.getEffectiveHealth(entityType, entityId);
    return reply.code(200).send({ success: true, data: evaluated });
  });

  // 5. Evaluate Complete Branch with Digital Twin Dependency Reasoning
  app.post("/v1/health/branches/evaluate", async (request, reply) => {
    const body = branchEvaluateSchema.parse(request.body);
    if (!await authorizeBranch(request, reply, body.branchId, "live:view")) return;
    const summary = staleDependencyIntegrator.evaluateBranchTelemetry(body as any);
    return reply.code(200).send({ success: true, data: summary });
  });

  // 6. Platform-Wide Telemetry Quality Report
  app.get("/v1/health/telemetry/quality-report", async (request, reply) => {
    const { branchId } = z.object({ branchId: z.string().min(1) }).parse(request.query);
    if (!await authorizeBranch(request, reply, branchId, "live:view")) return;
    const report = telemetryQualityService.generateQualityReport();
    return reply.code(200).send({ success: true, data: report });
  });
}
