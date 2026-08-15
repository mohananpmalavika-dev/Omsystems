/**
 * Branch Command Center API Routes (Fastify)
 * 
 * RESTful endpoints for the Branch Command Center UI.
 * Provides unified operational snapshots, camera details, events, and diagnostics.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { BranchOperationalSnapshotService } from "../services/branch-operational-snapshot.service.js";

// Request/Query schemas
const branchIdParamSchema = z.object({
  branchId: z.string().min(1),
});

const operationalSnapshotQuerySchema = z.object({
  refresh: z.enum(["true", "false"]).optional(),
});

const camerasQuerySchema = z.object({
  filter: z.enum(["all", "online", "offline", "recording", "not-recording", "problem"]).optional(),
  sortBy: z.enum(["number", "health", "name"]).optional().default("number"),
});

const eventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  severity: z.enum(["INFO", "WARNING", "HIGH", "CRITICAL"]).optional(),
  type: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export async function registerBranchCommandCenterRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  const snapshotService = new BranchOperationalSnapshotService(store.pool);

  /**
   * GET /v1/branches/:branchId/operational-snapshot
   * Get complete operational health snapshot for a branch
   */
  app.get(
    "/v1/branches/:branchId/operational-snapshot",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const query = operationalSnapshotQuerySchema.parse(request.query);
      const tenantId = request.currentUser.tenantId;
      const forceRefresh = query.refresh === "true";

      // Check access
      const branch = await store.getNode(branchId);
      if (!branch || branch.type !== "branch" || branch.tenantId !== tenantId) {
        return reply.code(404).send({
          success: false,
          error: "Branch not found or access denied",
        });
      }

      const decision = await store.checkAccess(request.currentUser, "recording:view", branchId);
      if (!decision?.allowed) {
        return reply.code(403).send({
          success: false,
          error: "Access denied",
        });
      }

      const snapshot = await snapshotService.getBranchSnapshot(tenantId, branchId, forceRefresh);

      if (!snapshot) {
        return reply.code(404).send({
          success: false,
          error: "Branch not found or access denied",
        });
      }

      // Determine cache age
      const cacheAge = forceRefresh ? 0 : undefined;

      return reply.send({
        success: true,
        data: snapshot,
        cached: !forceRefresh,
        cacheAge,
      });
    }
  );

  /**
   * GET /v1/branches/:branchId/cameras
   * Get detailed camera list with operational status
   */
  app.get(
    "/v1/branches/:branchId/cameras",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const query = camerasQuerySchema.parse(request.query);
      const tenantId = request.currentUser.tenantId;

      // Check access
      const branch = await store.getNode(branchId);
      if (!branch || branch.type !== "branch" || branch.tenantId !== tenantId) {
        return reply.code(404).send({
          success: false,
          error: "Branch not found",
        });
      }

      const decision = await store.checkAccess(request.currentUser, "recording:view", branchId);
      if (!decision?.allowed) {
        return reply.code(403).send({
          success: false,
          error: "Access denied",
        });
      }

      const result = await snapshotService.getBranchCameras(tenantId, branchId, query.filter);

      // Apply sorting
      if (query.sortBy === "health") {
        result.cameras.sort((a, b) => a.healthScore - b.healthScore);
      } else if (query.sortBy === "name") {
        result.cameras.sort((a, b) => a.name.localeCompare(b.name));
      }

      return reply.send({
        success: true,
        data: result,
      });
    }
  );

  /**
   * GET /v1/branches/:branchId/events
   * Get recent operational events for a branch
   */
  app.get(
    "/v1/branches/:branchId/events",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const query = eventsQuerySchema.parse(request.query);
      const tenantId = request.currentUser.tenantId;

      // Check access
      const branch = await store.getNode(branchId);
      if (!branch || branch.type !== "branch" || branch.tenantId !== tenantId) {
        return reply.code(404).send({
          success: false,
          error: "Branch not found",
        });
      }

      const decision = await store.checkAccess(request.currentUser, "recording:view", branchId);
      if (!decision?.allowed) {
        return reply.code(403).send({
          success: false,
          error: "Access denied",
        });
      }

      const result = await snapshotService.getBranchEvents(branchId, {
        limit: query.limit,
        offset: query.offset,
        severity: query.severity,
        type: query.type as any,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
      });

      return reply.send({
        success: true,
        data: result,
      });
    }
  );

  /**
   * GET /v1/branches/:branchId/recorders
   * Get recorder details for a branch
   */
  app.get(
    "/v1/branches/:branchId/recorders",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const tenantId = request.currentUser.tenantId;

      // Check access
      const branch = await store.getNode(branchId);
      if (!branch || branch.type !== "branch" || branch.tenantId !== tenantId) {
        return reply.code(404).send({
          success: false,
          error: "Branch not found",
        });
      }

      const decision = await store.checkAccess(request.currentUser, "recording:view", branchId);
      if (!decision?.allowed) {
        return reply.code(403).send({
          success: false,
          error: "Access denied",
        });
      }

      const snapshot = await snapshotService.getBranchSnapshot(tenantId, branchId);

      if (!snapshot) {
        return reply.code(404).send({
          success: false,
          error: "Branch not found",
        });
      }

      return reply.send({
        success: true,
        data: snapshot.recorders,
      });
    }
  );

  /**
   * GET /v1/branches/:branchId/storage
   * Get storage health details for a branch
   */
  app.get(
    "/v1/branches/:branchId/storage",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const tenantId = request.currentUser.tenantId;

      // Check access
      const branch = await store.getNode(branchId);
      if (!branch || branch.type !== "branch" || branch.tenantId !== tenantId) {
        return reply.code(404).send({
          success: false,
          error: "Branch not found",
        });
      }

      const decision = await store.checkAccess(request.currentUser, "recording:view", branchId);
      if (!decision?.allowed) {
        return reply.code(403).send({
          success: false,
          error: "Access denied",
        });
      }

      const snapshot = await snapshotService.getBranchSnapshot(tenantId, branchId);

      if (!snapshot) {
        return reply.code(404).send({
          success: false,
          error: "Branch not found",
        });
      }

      return reply.send({
        success: true,
        data: snapshot.storage,
      });
    }
  );

  /**
   * GET /v1/branches/:branchId/retention
   * Get retention status for a branch
   */
  app.get(
    "/v1/branches/:branchId/retention",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const tenantId = request.currentUser.tenantId;

      // Check access
      const branch = await store.getNode(branchId);
      if (!branch || branch.type !== "branch" || branch.tenantId !== tenantId) {
        return reply.code(404).send({
          success: false,
          error: "Branch not found",
        });
      }

      const decision = await store.checkAccess(request.currentUser, "recording:view", branchId);
      if (!decision?.allowed) {
        return reply.code(403).send({
          success: false,
          error: "Access denied",
        });
      }

      const snapshot = await snapshotService.getBranchSnapshot(tenantId, branchId);

      if (!snapshot) {
        return reply.code(404).send({
          success: false,
          error: "Branch not found",
        });
      }

      return reply.send({
        success: true,
        data: snapshot.retention,
      });
    }
  );

  /**
   * GET /v1/branches/:branchId/network-health
   * Get network connectivity status for a branch
   */
  app.get(
    "/v1/branches/:branchId/network-health",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const tenantId = request.currentUser.tenantId;

      // Check access
      const branch = await store.getNode(branchId);
      if (!branch || branch.type !== "branch" || branch.tenantId !== tenantId) {
        return reply.code(404).send({
          success: false,
          error: "Branch not found",
        });
      }

      const decision = await store.checkAccess(request.currentUser, "recording:view", branchId);
      if (!decision?.allowed) {
        return reply.code(403).send({
          success: false,
          error: "Access denied",
        });
      }

      const snapshot = await snapshotService.getBranchSnapshot(tenantId, branchId);

      if (!snapshot) {
        return reply.code(404).send({
          success: false,
          error: "Branch not found",
        });
      }

      return reply.send({
        success: true,
        data: snapshot.network,
      });
    }
  );

  /**
   * GET /v1/branches/:branchId/alerts
   * Get active alerts for a branch
   */
  app.get(
    "/v1/branches/:branchId/alerts",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const tenantId = request.currentUser.tenantId;

      // Check access
      const branch = await store.getNode(branchId);
      if (!branch || branch.type !== "branch" || branch.tenantId !== tenantId) {
        return reply.code(404).send({
          success: false,
          error: "Branch not found",
        });
      }

      const decision = await store.checkAccess(request.currentUser, "recording:view", branchId);
      if (!decision?.allowed) {
        return reply.code(403).send({
          success: false,
          error: "Access denied",
        });
      }

      const snapshot = await snapshotService.getBranchSnapshot(tenantId, branchId);

      if (!snapshot) {
        return reply.code(404).send({
          success: false,
          error: "Branch not found",
        });
      }

      return reply.send({
        success: true,
        data: snapshot.alerts,
      });
    }
  );

  /**
   * POST /v1/branches/:branchId/refresh
   * Force refresh of branch operational health
   */
  app.post(
    "/v1/branches/:branchId/refresh",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const tenantId = request.currentUser.tenantId;

      // Check access
      const branch = await store.getNode(branchId);
      if (!branch || branch.type !== "branch" || branch.tenantId !== tenantId) {
        return reply.code(404).send({
          success: false,
          error: "Branch not found",
        });
      }

      const decision = await store.checkAccess(request.currentUser, "recording:view", branchId);
      if (!decision?.allowed) {
        return reply.code(403).send({
          success: false,
          error: "Access denied",
        });
      }

      // Clear cache to force recomputation
      snapshotService.clearCache(tenantId, branchId);

      const snapshot = await snapshotService.getBranchSnapshot(tenantId, branchId, true);

      if (!snapshot) {
        return reply.code(404).send({
          success: false,
          error: "Branch not found",
        });
      }

      return reply.send({
        success: true,
        data: snapshot,
        message: "Branch health refreshed successfully",
      });
    }
  );
}
