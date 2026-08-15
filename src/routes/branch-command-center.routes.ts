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
  filter: z.enum(["all", "online", "offline", "recording", "not-recording", "no-record", "no_record", "problem", "retention-violation", "stream-loss", "live"]).optional(),
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
  const snapshotService = new BranchOperationalSnapshotService(store);

  /**
   * GET /v1/branches/:branchId/operational-snapshot
   * Get complete operational health snapshot for a branch
   */
  app.get(
    "/v1/branches/:branchId/operational-snapshot",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const tenantId = request.currentUser?.tenantId ?? "tenant-default";

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

      const snapshot = await snapshotService.getSnapshot(tenantId, branchId);

      if (!snapshot) {
        return reply.code(404).send({
          success: false,
          error: "Branch not found or access denied",
        });
      }

      return reply.send({
        success: true,
        data: snapshot,
      });
    }
  );

  /**
   * GET /v1/branches/:branchId/command-center/cameras
   * Get detailed camera list with operational status
   */
  app.get(
    "/v1/branches/:branchId/command-center/cameras",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const query = camerasQuerySchema.parse(request.query);
      const tenantId = request.currentUser?.tenantId ?? "tenant-default";

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

      const snapshot = await snapshotService.getSnapshot(tenantId, branchId);
      let cameras = snapshot?.cameraList ?? [];

      if (query.filter && query.filter !== "all") {
        if (query.filter === "offline") cameras = cameras.filter((c) => c.state === "OFFLINE");
        else if (query.filter === "recording") cameras = cameras.filter((c) => c.recordingStatus === "recording");
        else if (query.filter === "not-recording" || query.filter === "no-record" || query.filter === "no_record") cameras = cameras.filter((c) => c.state === "NO_RECORD");
        else if (query.filter === "problem") cameras = cameras.filter((c) => c.state !== "LIVE");
        else if (query.filter === "retention-violation") cameras = cameras.filter((c) => c.retentionState === "VIOLATION");
      }

      // Apply sorting
      if (query.sortBy === "health") {
        cameras.sort((a, b) => a.healthScore - b.healthScore);
      } else if (query.sortBy === "name") {
        cameras.sort((a, b) => a.name.localeCompare(b.name));
      }

      return reply.send({
        success: true,
        data: {
          cameras,
          total: cameras.length,
          summary: snapshot?.cameras,
        },
      });
    }
  );

  /**
   * GET /v1/branches/:branchId/events
   * Get recent operational events for a branch
   */
  app.get(
    "/v1/branches/:branchId/command-center/events",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const query = eventsQuerySchema.parse(request.query);
      const tenantId = request.currentUser?.tenantId ?? "tenant-default";

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

      const snapshot = await snapshotService.getSnapshot(tenantId, branchId);
      let events = snapshot?.recentEvents ?? [];

      if (query.severity) {
        events = events.filter((e) => e.severity === query.severity);
      }

      return reply.send({
        success: true,
        data: {
          events: events.slice(query.offset, query.offset + query.limit),
          total: events.length,
          limit: query.limit,
          offset: query.offset,
        },
      });
    }
  );

  /**
   * GET /v1/branches/:branchId/recorders
   * Get recorder health details for a branch
   */
  app.get(
    "/v1/branches/:branchId/recorders",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const tenantId = request.currentUser?.tenantId ?? "tenant-default";

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

      const snapshot = await snapshotService.getSnapshot(tenantId, branchId);

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
      const tenantId = request.currentUser?.tenantId ?? "tenant-default";

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

      const snapshot = await snapshotService.getSnapshot(tenantId, branchId);

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
      const tenantId = request.currentUser?.tenantId ?? "tenant-default";

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

      const snapshot = await snapshotService.getSnapshot(tenantId, branchId);

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
   * Get network connectivity details for a branch
   */
  app.get(
    "/v1/branches/:branchId/network-health",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const tenantId = request.currentUser?.tenantId ?? "tenant-default";

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

      const snapshot = await snapshotService.getSnapshot(tenantId, branchId);

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
   * Get active alerts summary for a branch
   */
  app.get(
    "/v1/branches/:branchId/alerts",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const tenantId = request.currentUser?.tenantId ?? "tenant-default";

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

      const snapshot = await snapshotService.getSnapshot(tenantId, branchId);

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
   * Force refresh operational telemetry cache for a branch
   */
  app.post(
    "/v1/branches/:branchId/refresh",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const tenantId = request.currentUser?.tenantId ?? "tenant-default";

      const branch = await store.getNode(branchId);
      if (!branch || branch.type !== "branch" || branch.tenantId !== tenantId) {
        return reply.code(404).send({
          success: false,
          error: "Branch not found",
        });
      }

      const snapshot = await snapshotService.getSnapshot(tenantId, branchId);

      return reply.send({
        success: true,
        data: snapshot,
        message: "Branch telemetry cache refreshed",
      });
    }
  );
}
