import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { investigationSearchService, InvestigationSearchService } from "../investigation/investigation-search.service.js";
import type { InvestigationObjectType } from "../investigation/investigation.types.js";

const investigationSearchSchema = z.object({
  tenantId: z.string().uuid().default("00000000-0000-0000-0000-000000000000"),
  branchIds: z.array(z.string().uuid()).optional(),
  cameraIds: z.array(z.string().min(1)).optional(),
  zones: z.array(z.string().min(1)).optional(),
  from: z.string().datetime(),
  to: z.string().datetime(),
  eventTypes: z.array(z.string().min(1)).optional(),
  objectTypes: z.array(z.enum(["PERSON", "VEHICLE", "FACE", "PLATE", "PACKAGE", "ANIMAL"])).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  alertSeverity: z.array(z.enum(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"])).optional(),
  incidentIds: z.array(z.string().uuid()).optional(),
  bookmarkTags: z.array(z.string().min(1)).optional(),
  includeRelatedAssets: z.boolean().optional(),
  resolutionSeconds: z.number().int().positive().optional(),
});

const createEventSchema = z.object({
  id: z.string().uuid().optional(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  cameraId: z.string().min(1).optional(),
  deviceId: z.string().uuid().optional(),
  zoneId: z.string().min(1).optional(),
  eventType: z.string().min(1),
  eventSubtype: z.string().optional(),
  severity: z.enum(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  source: z.string().optional(),
  objectType: z.enum(["PERSON", "VEHICLE", "FACE", "PLATE", "PACKAGE", "ANIMAL"]).optional(),
  objectId: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  metadata: z.record(z.unknown()).optional(),
  incidentId: z.string().uuid().optional(),
  alertId: z.string().uuid().optional(),
});

export async function registerInvestigationRoutes(
  app: FastifyInstance,
  service: InvestigationSearchService = investigationSearchService,
): Promise<void> {
  /**
   * POST /api/v1/investigations/search
   * Unified forensic investigation search over video recordings, gaps, AI detections, access events, and alerts
   */
  app.post("/api/v1/investigations/search", async (request: FastifyRequest, reply: FastifyReply) => {
    const input = investigationSearchSchema.parse(request.body);
    const result = await service.search({
      tenantId: input.tenantId,
      branchIds: input.branchIds,
      cameraIds: input.cameraIds,
      zones: input.zones,
      from: new Date(input.from),
      to: new Date(input.to),
      eventTypes: input.eventTypes,
      objectTypes: input.objectTypes as InvestigationObjectType[] | undefined,
      minConfidence: input.minConfidence,
      alertSeverity: input.alertSeverity,
      incidentIds: input.incidentIds,
      bookmarkTags: input.bookmarkTags,
      includeRelatedAssets: input.includeRelatedAssets ?? true,
      resolutionSeconds: input.resolutionSeconds,
    });

    return reply.code(200).send({
      success: true,
      data: result,
    });
  });

  /**
   * GET /api/v1/investigations/timeline
   * Resolution-aware timeline query bucketed into N-second slices
   */
  app.get("/api/v1/investigations/timeline", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = z.object({
      tenantId: z.string().uuid().default("00000000-0000-0000-0000-000000000000"),
      cameraId: z.string().min(1).optional(),
      from: z.string().datetime(),
      to: z.string().datetime(),
      resolution: z.coerce.number().int().positive().default(60),
    }).parse(request.query);

    const result = await service.search({
      tenantId: query.tenantId,
      cameraIds: query.cameraId ? [query.cameraId] : undefined,
      from: new Date(query.from),
      to: new Date(query.to),
      resolutionSeconds: query.resolution,
    });

    return reply.code(200).send({
      success: true,
      data: {
        from: query.from,
        to: query.to,
        resolutionSeconds: query.resolution,
        buckets: result.timelineBuckets || [],
        eventSummary: result.eventSummary,
      },
    });
  });

  /**
   * POST /api/v1/investigations/events
   * Records a new forensic investigation event
   */
  app.post("/api/v1/investigations/events", async (request: FastifyRequest, reply: FastifyReply) => {
    const input = createEventSchema.parse(request.body);
    const event = await service.recordEvent({
      id: input.id,
      tenantId: input.tenantId,
      branchId: input.branchId,
      cameraId: input.cameraId,
      deviceId: input.deviceId,
      zoneId: input.zoneId,
      eventType: input.eventType,
      eventSubtype: input.eventSubtype,
      severity: input.severity,
      startTime: new Date(input.startTime),
      endTime: input.endTime ? new Date(input.endTime) : undefined,
      source: input.source,
      objectType: input.objectType as InvestigationObjectType | undefined,
      objectId: input.objectId,
      confidence: input.confidence,
      metadata: input.metadata,
      incidentId: input.incidentId,
      alertId: input.alertId,
    });

    return reply.code(201).send({
      success: true,
      data: event,
    });
  });
}
