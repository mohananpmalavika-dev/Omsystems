import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  eventNormalizationService,
  EventNormalizationService,
} from "../services/event-normalization.service.js";
import type { VendorOrigin } from "../domain/device-event.types.js";

const ingestRawEventSchema = z.object({
  vendor: z.enum(["CP_PLUS", "DAHUA", "HIKVISION", "AXIS", "ONVIF", "EDGE_AGENT", "GENERIC"]).optional(),
  context: z.object({
    tenantId: z.string().optional(),
    branchId: z.string().optional(),
    deviceId: z.string().optional(),
    cameraId: z.string().optional(),
    channel: z.number().int().optional(),
    zoneName: z.string().optional(),
    isHighSecurityZone: z.boolean().optional(),
  }).optional(),
  rawPayload: z.record(z.unknown()),
});

const batchIngestSchema = z.object({
  vendor: z.enum(["CP_PLUS", "DAHUA", "HIKVISION", "AXIS", "ONVIF", "EDGE_AGENT", "GENERIC"]).optional(),
  context: z.object({
    tenantId: z.string().optional(),
    branchId: z.string().optional(),
    deviceId: z.string().optional(),
  }).optional(),
  events: z.array(z.record(z.unknown())).min(1).max(500),
});

export async function registerEventNormalizationRoutes(
  app: FastifyInstance,
  service: EventNormalizationService = eventNormalizationService,
): Promise<void> {
  /**
   * POST /v1/events/normalize
   * Dry-run normalization: parses vendor-specific payload into canonical DeviceEvent
   */
  app.post("/v1/events/normalize", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = ingestRawEventSchema.parse(request.body);
    const normalized = service.normalizeEvent(
      body.rawPayload,
      body.context,
      body.vendor as VendorOrigin | undefined,
    );
    return reply.status(200).send({
      success: true,
      deviceEvent: normalized,
    });
  });

  /**
   * POST /v1/events/ingest
   * Ingests a raw device event, normalizes it, and broadcasts it to downstream SOC modules
   */
  app.post("/v1/events/ingest", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = ingestRawEventSchema.parse(request.body);
    const ingested = await service.ingestRawEvent(
      body.rawPayload,
      body.context,
      body.vendor as VendorOrigin | undefined,
    );
    return reply.status(201).send({
      success: true,
      deviceEvent: ingested,
    });
  });

  /**
   * POST /v1/events/ingest/batch
   * High-throughput batch ingestion for branch gateways & NVR alert queues
   */
  app.post("/v1/events/ingest/batch", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = batchIngestSchema.parse(request.body);
    const result = await service.batchIngest(
      body.events,
      body.context,
      body.vendor as VendorOrigin | undefined,
    );
    return reply.status(201).send({
      success: true,
      count: result.count,
      events: result.ingested,
    });
  });

  /**
   * GET /v1/events/recent
   * Queries recent normalized DeviceEvents with branch, type, severity, and time filters
   */
  app.get("/v1/events/recent", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string | undefined>;
    const events = service.getRecentEvents({
      tenantId: query.tenantId,
      branchId: query.branchId,
      deviceId: query.deviceId,
      cameraId: query.cameraId,
      type: query.type as any,
      severity: query.severity as any,
      from: query.from,
      to: query.to,
      limit: query.limit ? Number.parseInt(query.limit, 10) : 50,
    });

    return reply.status(200).send({
      success: true,
      count: events.length,
      events,
    });
  });

  /**
   * GET /v1/events/taxonomy
   * Returns supported standard normalized types, severities, and supported device vendors
   */
  app.get("/v1/events/taxonomy", async (_request: FastifyRequest, reply: FastifyReply) => {
    const taxonomy = service.getSupportedEventTaxonomy();
    return reply.status(200).send(taxonomy);
  });
}
