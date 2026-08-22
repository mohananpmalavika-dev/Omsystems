/**
 * Maintenance Windows REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  maintenanceWindowRepository,
  maintenanceResolverService,
  MaintenanceWindow,
} from "../maintenance/index.js";

export async function registerMaintenanceWindowsRoutes(app: FastifyInstance) {
  /**
   * POST /api/v1/maintenance-windows
   */
  const handleCreateWindow = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as any) || {};
    if (!body.branchId || !body.startsAt || !body.endsAt || !body.reason) {
      return reply.status(400).send({ success: false, error: "Missing required fields for maintenance window" });
    }

    const windowId = `mw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);

    if (endsAt <= startsAt) {
      return reply.status(400).send({ success: false, error: "endsAt must be after startsAt" });
    }

    const window: MaintenanceWindow = {
      id: windowId,
      tenantId: body.tenantId || "bank-corp",
      scopeType: body.scopeType || "BRANCH",
      branchId: body.branchId,
      deviceIds: body.deviceIds,
      deviceGroupId: body.deviceGroupId,
      startsAt,
      endsAt,
      recoveryGraceSeconds: body.recoveryGraceSeconds || 300,
      reason: body.reason,
      requestedByUserId: body.requestedByUserId || "technician-01",
      approvedByUserId: body.approvedByUserId,
      approvedAt: body.approvedByUserId ? new Date() : undefined,
      status: body.approvedByUserId ? "ACTIVE" : "SCHEDULED",
      suppressNotifications: body.suppressNotifications !== false,
      suppressIncidentCreation: body.suppressIncidentCreation !== false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await maintenanceWindowRepository.create(window);
    return reply.status(201).send({ success: true, data: window });
  };

  app.post("/api/v1/maintenance-windows", handleCreateWindow);
  app.post("/v1/maintenance-windows", handleCreateWindow);

  /**
   * GET /api/v1/maintenance-windows
   */
  const handleListWindows = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query as any) || {};
    const windows = await maintenanceWindowRepository.list({
      tenantId: query.tenantId,
      branchId: query.branchId,
      status: query.status,
    });
    return reply.send({ success: true, count: windows.length, data: windows });
  };

  app.get("/api/v1/maintenance-windows", handleListWindows);
  app.get("/v1/maintenance-windows", handleListWindows);

  /**
   * GET /api/v1/maintenance-windows/:id
   */
  const handleGetWindow = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const window = await maintenanceWindowRepository.findById(params.id);
    if (!window) {
      return reply.status(404).send({ success: false, error: "Maintenance window not found" });
    }
    return reply.send({ success: true, data: window });
  };

  app.get("/api/v1/maintenance-windows/:id", handleGetWindow);
  app.get("/v1/maintenance-windows/:id", handleGetWindow);

  /**
   * POST /api/v1/maintenance-windows/:id/approve
   */
  const handleApproveWindow = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const body = (request.body as any) || {};
    const window = await maintenanceWindowRepository.findById(params.id);
    if (!window) {
      return reply.status(404).send({ success: false, error: "Maintenance window not found" });
    }

    window.approvedByUserId = body.approvedByUserId || "security-manager-01";
    window.approvedAt = new Date();
    window.status = "ACTIVE";
    window.updatedAt = new Date();
    await maintenanceWindowRepository.update(window);

    return reply.send({ success: true, data: window });
  };

  app.post("/api/v1/maintenance-windows/:id/approve", handleApproveWindow);
  app.post("/v1/maintenance-windows/:id/approve", handleApproveWindow);

  /**
   * POST /api/v1/maintenance-windows/:id/cancel
   */
  const handleCancelWindow = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const window = await maintenanceWindowRepository.findById(params.id);
    if (!window) {
      return reply.status(404).send({ success: false, error: "Maintenance window not found" });
    }

    window.status = "CANCELLED";
    window.updatedAt = new Date();
    await maintenanceWindowRepository.update(window);

    return reply.send({ success: true, data: window });
  };

  app.post("/api/v1/maintenance-windows/:id/cancel", handleCancelWindow);
  app.post("/v1/maintenance-windows/:id/cancel", handleCancelWindow);

  /**
   * GET /api/v1/maintenance-windows/active/:branchId
   */
  const handleGetActiveForBranch = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const windows = await maintenanceWindowRepository.findActiveByBranch(params.branchId);
    return reply.send({ success: true, count: windows.length, data: windows });
  };

  app.get("/api/v1/maintenance-windows/active/:branchId", handleGetActiveForBranch);
  app.get("/v1/maintenance-windows/active/:branchId", handleGetActiveForBranch);
}
