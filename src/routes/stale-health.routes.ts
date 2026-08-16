import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { EntityType, HealthObservation } from "../operational-health/domain/stale-semantics.types.js";
import { telemetryQualityService } from "../operational-health/services/telemetry-quality.service.js";
import { staleDependencyIntegrator } from "../operational-health/services/stale-dependency-integrator.service.js";

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

export const registerStaleHealthRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // 1. Ingest Single Health Observation
  app.post("/v1/health/observations/ingest", async (request, reply) => {
    const body = observationSchema.parse(request.body);
    const enriched = telemetryQualityService.ingestObservation(body as HealthObservation);
    return reply.code(201).send({
      success: true,
      message: "Health observation ingested and freshness TTL calculated",
      data: enriched,
    });
  });

  // 2. Ingest Batch of Health Observations
  app.post("/v1/health/observations/batch", async (request, reply) => {
    const body = batchIngestSchema.parse(request.body);
    const enriched = telemetryQualityService.ingestBatch(body.observations as HealthObservation[]);
    return reply.code(201).send({
      success: true,
      count: enriched.length,
      data: enriched,
    });
  });

  // 3. Get Raw Observation
  app.get("/v1/health/observations/:entityType/:entityId", async (request, reply) => {
    const { entityType, entityId } = request.params as { entityType: EntityType; entityId: string };
    const obs = telemetryQualityService.getObservation(entityType, entityId);
    if (!obs) {
      return reply.code(404).send({ error: "observation_not_found", message: `No observation for ${entityType}:${entityId}` });
    }
    return reply.code(200).send({ success: true, data: obs });
  });

  // 4. Get Effective Health Evaluation with Freshness
  app.get("/v1/health/evaluations/:entityType/:entityId", async (request, reply) => {
    const { entityType, entityId } = request.params as { entityType: EntityType; entityId: string };
    const evaluated = telemetryQualityService.getEffectiveHealth(entityType, entityId);
    return reply.code(200).send({ success: true, data: evaluated });
  });

  // 5. Evaluate Complete Branch with Digital Twin Dependency Reasoning
  app.post("/v1/health/branches/evaluate", async (request, reply) => {
    const body = branchEvaluateSchema.parse(request.body);
    const summary = staleDependencyIntegrator.evaluateBranchTelemetry(body as any);
    return reply.code(200).send({ success: true, data: summary });
  });

  // 6. Platform-Wide Telemetry Quality Report
  app.get("/v1/health/telemetry/quality-report", async (_request, reply) => {
    const report = telemetryQualityService.generateQualityReport();
    return reply.code(200).send({ success: true, data: report });
  });
};
