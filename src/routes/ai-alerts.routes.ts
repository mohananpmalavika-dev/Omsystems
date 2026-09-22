/**
 * AI Alerts & Normalized Surveillance Event REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { unifiedAiAlertService, alertPresentationService } from "../alerts/index.js";

export async function registerAiAlertsRoutes(app: FastifyInstance) {
  /**
   * POST /api/v1/ai/events
   * Ingests raw detection from any AI detector / vendor model
   */
  const handleIngestAiEvent = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as any) || {};
    if (!body.eventId || !body.branchId || !body.cameraId || !body.vendorSource || !body.rawEventType) {
      return reply.status(400).send({
        success: false,
        error: "Missing required fields: eventId, branchId, cameraId, vendorSource, rawEventType",
      });
    }

    const { alert, isDeduplicated } = await unifiedAiAlertService.ingestRawAiEvent({
      eventId: body.eventId,
      tenantId: body.tenantId || "bank-corp",
      branchId: body.branchId,
      cameraId: body.cameraId,
      recorderId: body.recorderId,
      vendorSource: body.vendorSource,
      rawEventType: body.rawEventType,
      timestamp: body.timestamp || new Date().toISOString(),
      confidence: body.confidence,
      attributes: body.attributes,
      snapshotRef: body.snapshotRef,
      clipRef: body.clipRef,
    });

    return reply.status(isDeduplicated ? 200 : 201).send({
      success: true,
      data: alert,
      isDeduplicated,
    });
  };

  app.route({
    method: "POST",
    url: "/api/v1/ai/events",
    config: { noAuth: true },
    handler: handleIngestAiEvent,
  });
  app.route({
    method: "POST",
    url: "/v1/ai/events",
    config: { noAuth: true },
    handler: handleIngestAiEvent,
  });

  /**
   * GET /api/v1/ai/alerts
   * Queries normalized alerts with filters
   * Supports both single branchId and multiple branchIds[] for cross-branch visibility
   */
  const handleGetAlerts = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query as any) || {};
    
    // Parse branchIds from comma-separated string or array
    let branchIds: string[] | undefined;
    if (query.branchIds) {
      branchIds = Array.isArray(query.branchIds) 
        ? query.branchIds 
        : String(query.branchIds).split(',').map(id => id.trim()).filter(Boolean);
    }
    
    const alerts = unifiedAiAlertService.getAlerts({
      tenantId: query.tenantId,
      branchId: query.branchId, // Single branch filter (backward compatible)
      branchIds, // Multi-branch filter (new feature)
      alertType: query.alertType,
      severity: query.severity,
      status: query.status,
    });
    return reply.send({ success: true, count: alerts.length, data: alerts });
  };

  app.route({
    method: "GET",
    url: "/api/v1/ai/alerts",
    config: { noAuth: true },
    handler: handleGetAlerts,
  });
  app.route({
    method: "GET",
    url: "/v1/ai/alerts",
    config: { noAuth: true },
    handler: handleGetAlerts,
  });

  /**
   * GET /api/v1/ai/alerts/:id
   */
  const handleGetAlert = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const alert = unifiedAiAlertService.getAlert(params.id);
    if (!alert) {
      return reply.status(404).send({ success: false, error: "Surveillance alert not found" });
    }
    return reply.send({ success: true, data: alert });
  };

  app.route({
    method: "GET",
    url: "/api/v1/ai/alerts/:id",
    config: { noAuth: true },
    handler: handleGetAlert,
  });
  app.route({
    method: "GET",
    url: "/v1/ai/alerts/:id",
    config: { noAuth: true },
    handler: handleGetAlert,
  });

  /**
   * POST /api/v1/ai/alerts/:id/acknowledge
   */
  const handleAcknowledge = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const body = (request.body as any) || {};
    const operatorId = body.operatorId || (request as any).currentUser?.id || "operator-control-room";

    const alert = await unifiedAiAlertService.acknowledgeAlert(params.id, operatorId);
    if (!alert) {
      return reply.status(404).send({ success: false, error: "Alert not found" });
    }
    return reply.send({ success: true, data: alert });
  };

  app.route({
    method: "POST",
    url: "/api/v1/ai/alerts/:id/acknowledge",
    config: { noAuth: true },
    handler: handleAcknowledge,
  });
  app.route({
    method: "POST",
    url: "/v1/ai/alerts/:id/acknowledge",
    config: { noAuth: true },
    handler: handleAcknowledge,
  });

  /**
   * POST /api/v1/ai/alerts/:id/escalate
   */
  const handleEscalate = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const body = (request.body as any) || {};
    const operatorId = body.operatorId || (request as any).currentUser?.id || "operator-control-room";

    const alert = await unifiedAiAlertService.escalateAlert(params.id, operatorId, body.reason);
    if (!alert) {
      return reply.status(404).send({ success: false, error: "Alert not found" });
    }
    return reply.send({ success: true, data: alert });
  };

  app.route({
    method: "POST",
    url: "/api/v1/ai/alerts/:id/escalate",
    config: { noAuth: true },
    handler: handleEscalate,
  });
  app.route({
    method: "POST",
    url: "/v1/ai/alerts/:id/escalate",
    config: { noAuth: true },
    handler: handleEscalate,
  });

  /**
   * GET /api/v1/ai/alerts/presentation-metadata
   */
  const handleGetPresentation = async (_request: FastifyRequest, reply: FastifyReply) => {
    const schemas = alertPresentationService.getAllPresentationSchemas();
    return reply.send({ success: true, data: schemas });
  };

  app.route({
    method: "GET",
    url: "/api/v1/ai/alerts/presentation-metadata",
    config: { noAuth: true },
    handler: handleGetPresentation,
  });
  app.route({
    method: "GET",
    url: "/v1/ai/alerts/presentation-metadata",
    config: { noAuth: true },
    handler: handleGetPresentation,
  });
}
