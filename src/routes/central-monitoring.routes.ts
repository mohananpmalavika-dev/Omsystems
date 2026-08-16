/**
 * Central Monitoring Station REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { centralMonitoringStationService } from "../monitoring/index.js";

export async function registerCentralMonitoringRoutes(app: FastifyInstance) {
  /**
   * POST /api/v1/monitoring/events & /v1/monitoring/events
   */
  const handleIngestEvent = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as any) || {};
    const result = await centralMonitoringStationService.ingestEvent({
      eventId: body.eventId || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tenantId: body.tenantId || "bank-corp",
      branchId: body.branchId || "branch-01",
      source: body.source || { type: "ANALYTICS", sourceId: "detector-01" },
      eventType: body.eventType || "INTRUSION_DETECTED",
      severity: body.severity || "P1",
      occurredAt: body.occurredAt || new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      cameraId: body.cameraId,
      recorderId: body.recorderId,
      title: body.title || "Surveillance Detection Event",
      description: body.description,
      attributes: body.attributes || {},
      evidence: body.evidence,
      schemaVersion: body.schemaVersion || 1,
    });

    return reply.status(result.isDuplicate ? 200 : 201).send({ success: true, data: result });
  };

  app.post("/api/v1/monitoring/events", handleIngestEvent);
  app.post("/v1/monitoring/events", handleIngestEvent);

  /**
   * GET /api/v1/monitoring/alerts & /v1/monitoring/alerts
   */
  const handleGetActiveAlerts = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query as any) || {};
    const alerts = await centralMonitoringStationService.getActiveAlerts(
      query.tenantId || "bank-corp",
      query.operatorId
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
    const body = (request.body as any) || {};
    const operatorId = body.operatorId || "operator-admin";

    const claimed = await centralMonitoringStationService.claimAlert(params.id, operatorId);
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
    const operatorId = body.operatorId || "operator-admin";
    const expectedVersion = body.version !== undefined ? Number(body.version) : undefined;

    const acknowledged = await centralMonitoringStationService.acknowledgeAlert(
      params.id,
      operatorId,
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
  const handleGetMetrics = async (_request: FastifyRequest, reply: FastifyReply) => {
    const metrics = await centralMonitoringStationService.getPipelineMetrics();
    return reply.send({ success: true, data: metrics });
  };

  app.get("/api/v1/monitoring/pipeline/metrics", handleGetMetrics);
  app.get("/v1/monitoring/pipeline/metrics", handleGetMetrics);

  /**
   * GET /api/v1/monitoring/pipeline/dead-letters
   */
  const handleGetDeadLetters = async (_request: FastifyRequest, reply: FastifyReply) => {
    const dlq = await centralMonitoringStationService.getDeadLetters();
    return reply.send({ success: true, data: dlq });
  };

  app.get("/api/v1/monitoring/pipeline/dead-letters", handleGetDeadLetters);
  app.get("/v1/monitoring/pipeline/dead-letters", handleGetDeadLetters);
}
