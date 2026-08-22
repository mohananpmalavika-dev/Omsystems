/**
 * Capability-Aware Device Health REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { deviceHealthService } from "../device-health/index.js";

export async function registerDeviceHealthRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/devices/:id/capabilities & /v1/devices/:id/capabilities
   */
  const handleGetCapabilities = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const profile = deviceHealthService.getProfile(params.id);
    return reply.send({ success: true, data: profile });
  };

  app.get("/api/v1/devices/:id/capabilities", handleGetCapabilities);
  app.get("/v1/devices/:id/capabilities", handleGetCapabilities);

  /**
   * POST /api/v1/devices/:id/evidence & /v1/devices/:id/evidence
   */
  const handleIngestEvidence = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const body = (request.body as any) || {};

    if (Array.isArray(body.evidence)) {
      deviceHealthService.ingestEvidenceBatch(
        body.evidence.map((e: any) => ({
          ...e,
          deviceId: params.id,
          observedAt: e.observedAt ? new Date(e.observedAt) : new Date(),
          collectedAt: new Date(),
        }))
      );
    } else if (body.capability && body.status) {
      deviceHealthService.ingestEvidence({
        deviceId: params.id,
        capability: body.capability,
        status: body.status,
        value: body.value,
        source: body.source || "EDGE_AGENT",
        observedAt: body.observedAt ? new Date(body.observedAt) : new Date(),
        collectedAt: new Date(),
      });
    }

    const snapshot = deviceHealthService.getHealthSnapshot(params.id, body.tenantId || "bank-corp");
    return reply.status(201).send({ success: true, data: snapshot });
  };

  app.post("/api/v1/devices/:id/evidence", handleIngestEvidence);
  app.post("/v1/devices/:id/evidence", handleIngestEvidence);

  /**
   * GET /api/v1/devices/:id/health-snapshot & /v1/devices/:id/health-snapshot
   */
  const handleGetHealthSnapshot = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const query = (request.query as any) || {};
    const snapshot = deviceHealthService.getHealthSnapshot(params.id, query.tenantId || "bank-corp", {
      branchId: query.branchId,
      branchName: query.branchName,
    });
    return reply.send({ success: true, data: snapshot });
  };

  app.get("/api/v1/devices/:id/health-snapshot", handleGetHealthSnapshot);
  app.get("/v1/devices/:id/health-snapshot", handleGetHealthSnapshot);

  /**
   * GET /api/v1/branches/:id/devices-health & /v1/branches/:id/devices-health
   */
  const handleGetBranchDevicesHealth = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const query = (request.query as any) || {};
    const deviceIds = query.deviceIds ? String(query.deviceIds).split(",") : [`rec-${params.id}-01`];

    const summary = deviceHealthService.getBranchDeviceHealthSummary(
      params.id,
      deviceIds,
      query.tenantId || "bank-corp"
    );
    return reply.send({ success: true, data: summary });
  };

  app.get("/api/v1/branches/:id/devices-health", handleGetBranchDevicesHealth);
  app.get("/v1/branches/:id/devices-health", handleGetBranchDevicesHealth);
}
