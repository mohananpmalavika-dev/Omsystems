/**
 * Capability-Aware Device Health REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { deviceHealthService } from "../device-health/index.js";

export async function registerDeviceHealthRoutes(app: FastifyInstance, store: ControlPlaneStore) {
  const requireUser = (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.currentUser?.id || !request.currentUser.tenantId) {
      void reply.code(401).send({ success: false, error: "unauthorized" });
      return false;
    }
    return true;
  };

  const authorizeBranch = async (request: FastifyRequest, reply: FastifyReply, branchId: string) => {
    if (!requireUser(request, reply)) return false;
    const branch = await store.getNode(branchId);
    const decision = await store.checkAccess(request.currentUser, "device:configure", branchId);
    if (!branch || branch.type !== "branch" || branch.tenantId !== request.currentUser.tenantId || !decision?.allowed) {
      await reply.code(404).send({ success: false, error: "branch_not_found" });
      return false;
    }
    return true;
  };
  /**
   * GET /api/v1/devices/:id/capabilities & /v1/devices/:id/capabilities
   */
  const handleGetCapabilities = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireUser(request, reply)) return;
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
    if (!requireUser(request, reply)) return;
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

    const branchId = typeof body.branchId === "string" ? body.branchId : undefined;
    if (branchId && !(await authorizeBranch(request, reply, branchId))) return;
    const snapshot = deviceHealthService.getHealthSnapshot(params.id, request.currentUser.tenantId, { branchId });
    return reply.status(201).send({ success: true, data: snapshot });
  };

  app.post("/api/v1/devices/:id/evidence", handleIngestEvidence);
  app.post("/v1/devices/:id/evidence", handleIngestEvidence);

  /**
   * GET /api/v1/devices/:id/health-snapshot & /v1/devices/:id/health-snapshot
   */
  const handleGetHealthSnapshot = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireUser(request, reply)) return;
    const params = request.params as any;
    const query = (request.query as any) || {};
    const branchId = typeof query.branchId === "string" ? query.branchId : undefined;
    if (branchId && !(await authorizeBranch(request, reply, branchId))) return;
    const snapshot = deviceHealthService.getHealthSnapshot(params.id, request.currentUser.tenantId, {
      branchId,
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
    if (!(await authorizeBranch(request, reply, params.id))) return;
    const deviceIds = query.deviceIds ? String(query.deviceIds).split(",") : [`rec-${params.id}-01`];

    const summary = deviceHealthService.getBranchDeviceHealthSummary(
      params.id,
      deviceIds,
      request.currentUser.tenantId
    );
    return reply.send({ success: true, data: summary });
  };

  app.get("/api/v1/branches/:id/devices-health", handleGetBranchDevicesHealth);
  app.get("/v1/branches/:id/devices-health", handleGetBranchDevicesHealth);
}
