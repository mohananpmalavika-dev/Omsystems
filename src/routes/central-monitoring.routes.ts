/**
 * Central Monitoring Station REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { centralMonitoringStationService } from "../monitoring/index.js";

export async function registerCentralMonitoringRoutes(app: FastifyInstance) {
  const currentUser = (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.currentUser) {
      reply.code(401).send({ success: false, error: "Authentication required" });
      return null;
    }
    return request.currentUser;
  };
  /**
   * POST /api/v1/monitoring/events & /v1/monitoring/events
   */
  const handleIngestEvent = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = currentUser(request, reply);
    if (!user) return;
    const body = z.object({
      eventId: z.string().min(1).optional(),
      branchId: z.string().min(1),
      source: z.object({ type: z.string().min(1), sourceId: z.string().min(1) }),
      eventType: z.string().min(1),
      severity: z.string().min(1),
      occurredAt: z.string().datetime(),
      cameraId: z.string().optional(),
      recorderId: z.string().optional(),
      title: z.string().min(1),
      description: z.string().optional(),
      attributes: z.record(z.string(), z.unknown()).optional(),
      evidence: z.unknown().optional(),
      schemaVersion: z.number().int().positive(),
    }).parse(request.body);
    const result = await centralMonitoringStationService.ingestEvent({
      eventId: body.eventId ?? `evt-${randomUUID()}`,
      tenantId: user.tenantId,
      branchId: body.branchId,
      source: body.source as any,
      eventType: body.eventType as any,
      severity: body.severity as any,
      occurredAt: body.occurredAt,
      receivedAt: new Date().toISOString(),
      cameraId: body.cameraId,
      recorderId: body.recorderId,
      title: body.title,
      description: body.description,
      attributes: body.attributes ?? {},
      evidence: body.evidence as any,
      schemaVersion: body.schemaVersion,
    });

    return reply.status(result.isDuplicate ? 200 : 201).send({ success: true, data: result });
  };

  app.post("/api/v1/monitoring/events", handleIngestEvent);
  app.post("/v1/monitoring/events", handleIngestEvent);

  /**
   * GET /api/v1/monitoring/alerts & /v1/monitoring/alerts
   */
  const handleGetActiveAlerts = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = currentUser(request, reply);
    if (!user) return;
    const query = (request.query as any) || {};
    const alerts = await centralMonitoringStationService.getActiveAlerts(
      user.tenantId,
      query.operatorId ?? user.id,
    );
    return reply.send({ success: true, data: alerts });
  };

  app.get("/api/v1/monitoring/alerts", handleGetActiveAlerts);
  app.get("/v1/monitoring/alerts", handleGetActiveAlerts);

  /**
   * POST /api/v1/monitoring/alerts/:id/claim
   */
  const handleClaimAlert = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const user = currentUser(request, reply);
    if (!user) return;

    const claimed = await centralMonitoringStationService.claimAlert(params.id, user.id);
    if (!claimed) {
      return reply.status(409).send({ success: false, error: "Alert already claimed or unavailable" });
    }
    return reply.send({ success: true, data: claimed });
  };

  app.post("/api/v1/monitoring/alerts/:id/claim", handleClaimAlert);
  app.post("/v1/monitoring/alerts/:id/claim", handleClaimAlert);

  /**
   * POST /api/v1/monitoring/alerts/:id/acknowledge
   */
  const handleAcknowledgeAlert = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const body = (request.body as any) || {};
    const user = currentUser(request, reply);
    if (!user) return;
    const expectedVersion = body.version !== undefined ? Number(body.version) : undefined;

    const acknowledged = await centralMonitoringStationService.acknowledgeAlert(
      params.id,
      user.id,
      expectedVersion
    );
    if (!acknowledged) {
      return reply.status(409).send({ success: false, error: "Alert version conflict or already resolved" });
    }
    return reply.send({ success: true, data: acknowledged });
  };

  app.post("/api/v1/monitoring/alerts/:id/acknowledge", handleAcknowledgeAlert);
  app.post("/v1/monitoring/alerts/:id/acknowledge", handleAcknowledgeAlert);

  /**
   * GET /api/v1/monitoring/pipeline/metrics
   */
  const handleGetMetrics = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!currentUser(request, reply)) return;
    const metrics = await centralMonitoringStationService.getPipelineMetrics();
    return reply.send({ success: true, data: metrics });
  };

  app.get("/api/v1/monitoring/pipeline/metrics", handleGetMetrics);
  app.get("/v1/monitoring/pipeline/metrics", handleGetMetrics);

  /**
   * GET /api/v1/monitoring/pipeline/dead-letters
   */
  const handleGetDeadLetters = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!currentUser(request, reply)) return;
    const dlq = await centralMonitoringStationService.getDeadLetters();
    return reply.send({ success: true, data: dlq });
  };

  app.get("/api/v1/monitoring/pipeline/dead-letters", handleGetDeadLetters);
  app.get("/v1/monitoring/pipeline/dead-letters", handleGetDeadLetters);
}
