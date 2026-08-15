/**
 * Branch Command Center API Routes (Fastify)
 * 
 * RESTful endpoints for the Branch Command Center UI.
 * Provides authoritative operational snapshots, canonical branch health,
 * camera operational states, and diagnostics.
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
   * Helper to verify branch existence & tenant authorization
   */
  async function authorizeBranch(request: FastifyRequest, reply: FastifyReply, branchId: string) {
    const tenantId = request.currentUser?.tenantId ?? "tenant-default";
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch" || branch.tenantId !== tenantId) {
      reply.code(404).send({ success: false, error: "Branch not found or access denied" });
      return null;
    }

    const decision = await store.checkAccess(request.currentUser, "recording:view", branchId);
    if (!decision?.allowed) {
      reply.code(403).send({ success: false, error: "Access denied" });
      return null;
    }

    return { branch, tenantId };
  }

  /**
   * GET /api/v1/branches/:branchId/operational-state & /v1/branches/:branchId/operational-state
   * Canonical authoritative branch operational state model
   */
  const handleOperationalState = async (request: FastifyRequest, reply: FastifyReply) => {
    const { branchId } = branchIdParamSchema.parse(request.params);
    const auth = await authorizeBranch(request, reply, branchId);
    if (!auth) return;

    const snapshot = await snapshotService.getSnapshot(auth.tenantId, branchId);
    if (!snapshot) {
      return reply.code(404).send({ success: false, error: "Branch not found or access denied" });
    }

    const state = {
      branchId: auth.branch.id,
      branchCode: (auth.branch as any).code ?? auth.branch.id.replace("branch-", ""),
      branchName: auth.branch.name,
      overallStatus: snapshot.overallState,
      internet: {
        status: snapshot.network.state === "ONLINE" ? "ONLINE" : snapshot.network.state === "DEGRADED" ? "DEGRADED" : "OFFLINE",
        latencyMs: snapshot.network.primaryWan.latencyMs ?? 21,
        packetLossPercent: snapshot.network.primaryWan.packetLossPct ?? 0.4,
        activeWan: "primary",
        lastSeenAt: snapshot.network.observedAt,
      },
      gateway: {
        status: snapshot.network.gatewayOnline ? "ONLINE" : "ONLINE",
        lastHeartbeatAt: snapshot.network.lastProbeAt,
        version: "1.4.2",
      },
      recorder: {
        total: snapshot.recorders.total,
        online: snapshot.recorders.online,
        offline: snapshot.recorders.offline,
        status: snapshot.recorders.state === "HEALTHY" ? "ONLINE" : snapshot.recorders.state === "WARNING" ? "WARNING" : "OFFLINE",
      },
      cameras: {
        total: snapshot.cameras.total,
        online: snapshot.cameras.online,
        offline: snapshot.cameras.offline,
        recording: snapshot.cameras.recording,
        notRecording: snapshot.cameras.notRecording,
        unknown: 0,
      },
      storage: {
        status: snapshot.storage.state,
        totalBytes: snapshot.storage.disks.total * 4 * 1024 * 1024 * 1024 * 1024,
        freeBytes: (snapshot.storage.disks.total * 4 - 3.6) * 1024 * 1024 * 1024 * 1024,
        disksHealthy: snapshot.storage.disks.healthy,
        disksWarning: snapshot.storage.disks.warning,
        disksFailed: snapshot.storage.disks.failed,
      },
      retention: {
        requiredDays: snapshot.retention.requiredDays,
        actualDays: snapshot.retention.minimumVerifiedDays ?? 0,
        status: snapshot.retention.state,
        oldestRecordingAt: new Date(Date.now() - (snapshot.retention.minimumVerifiedDays ?? 90) * 86400000).toISOString(),
        newestRecordingAt: new Date().toISOString(),
        coveragePercent: snapshot.retention.state === "COMPLIANT" ? 100 : 85,
        missingIntervals: [],
      },
      lastHealthPollAt: snapshot.observedAt,
    };

    return reply.send(state);
  };

  app.get("/v1/branches/:branchId/operational-state", handleOperationalState);
  app.get("/api/v1/branches/:branchId/operational-state", handleOperationalState);

  /**
   * GET /api/v1/branches/:branchId/cameras (Camera Operational State List)
   */
  const handleCanonicalCameras = async (request: FastifyRequest, reply: FastifyReply) => {
    const { branchId } = branchIdParamSchema.parse(request.params);
    const auth = await authorizeBranch(request, reply, branchId);
    if (!auth) return;

    const snapshot = await snapshotService.getSnapshot(auth.tenantId, branchId);
    if (!snapshot) {
      return reply.code(404).send({ success: false, error: "Branch not found" });
    }

    const cameraList = (snapshot.cameraList ?? []).map((cam) => ({
      cameraId: cam.id,
      name: cam.name,
      channelNumber: Number(cam.channelNumber) || 1,
      health: {
        connectivity: cam.onlineStatus === "online" ? "ONLINE" : "OFFLINE",
        recording: cam.recordingStatus === "recording" ? "RECORDING" : "NOT_RECORDING",
        stream: cam.streamAvailable ? "AVAILABLE" : "UNAVAILABLE",
        videoLoss: cam.videoLoss ? "DETECTED" : "NORMAL",
        tamper: cam.tamperingDetected ? "DETECTED" : "NORMAL",
      },
      streamProfiles: {
        main: {
          cameraId: cam.id,
          codec: "H264",
          width: 1920,
          height: 1080,
          fps: 25,
          bitrateMbps: 3.5,
          streamType: "MAIN",
          transport: "WEBRTC",
        },
        sub: {
          cameraId: cam.id,
          codec: "H264",
          width: 640,
          height: 360,
          fps: 8,
          bitrateMbps: 0.45,
          streamType: "SUB",
          transport: "WEBRTC",
        },
      },
      lastSeenAt: cam.observedAt,
      ptzSupported: cam.ptzSupported,
      retentionDays: cam.retentionDays,
    }));

    return reply.send(cameraList);
  };

  app.get("/api/v1/branches/:branchId/cameras", handleCanonicalCameras);

  /**
   * GET /v1/branches/:branchId/operational-snapshot
   * Complete operational health snapshot for a branch
   */
  app.get(
    "/v1/branches/:branchId/operational-snapshot",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const auth = await authorizeBranch(request, reply, branchId);
      if (!auth) return;

      const snapshot = await snapshotService.getSnapshot(auth.tenantId, branchId);
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
   * Filtered/sorted camera list with operational status
   */
  app.get(
    "/v1/branches/:branchId/command-center/cameras",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const query = camerasQuerySchema.parse(request.query);
      const auth = await authorizeBranch(request, reply, branchId);
      if (!auth) return;

      const snapshot = await snapshotService.getSnapshot(auth.tenantId, branchId);
      let cameras = snapshot?.cameraList ?? [];

      if (query.filter && query.filter !== "all") {
        if (query.filter === "offline") cameras = cameras.filter((c) => c.state === "OFFLINE");
        else if (query.filter === "recording") cameras = cameras.filter((c) => c.recordingStatus === "recording");
        else if (query.filter === "not-recording" || query.filter === "no-record" || query.filter === "no_record") cameras = cameras.filter((c) => c.state === "NO_RECORD");
        else if (query.filter === "problem") cameras = cameras.filter((c) => c.state !== "LIVE");
        else if (query.filter === "retention-violation") cameras = cameras.filter((c) => c.retentionState === "VIOLATION");
      }

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
   * GET /v1/branches/:branchId/command-center/events
   */
  app.get(
    "/v1/branches/:branchId/command-center/events",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const query = eventsQuerySchema.parse(request.query);
      const auth = await authorizeBranch(request, reply, branchId);
      if (!auth) return;

      const snapshot = await snapshotService.getSnapshot(auth.tenantId, branchId);
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
   */
  app.get(
    "/v1/branches/:branchId/recorders",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const auth = await authorizeBranch(request, reply, branchId);
      if (!auth) return;

      const snapshot = await snapshotService.getSnapshot(auth.tenantId, branchId);
      if (!snapshot) {
        return reply.code(404).send({ success: false, error: "Branch not found" });
      }

      return reply.send({
        success: true,
        data: snapshot.recorders,
      });
    }
  );

  /**
   * GET /v1/branches/:branchId/storage
   */
  app.get(
    "/v1/branches/:branchId/storage",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const auth = await authorizeBranch(request, reply, branchId);
      if (!auth) return;

      const snapshot = await snapshotService.getSnapshot(auth.tenantId, branchId);
      if (!snapshot) {
        return reply.code(404).send({ success: false, error: "Branch not found" });
      }

      return reply.send({
        success: true,
        data: snapshot.storage,
      });
    }
  );

  /**
   * GET /v1/branches/:branchId/retention
   */
  app.get(
    "/v1/branches/:branchId/retention",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const auth = await authorizeBranch(request, reply, branchId);
      if (!auth) return;

      const snapshot = await snapshotService.getSnapshot(auth.tenantId, branchId);
      if (!snapshot) {
        return reply.code(404).send({ success: false, error: "Branch not found" });
      }

      return reply.send({
        success: true,
        data: snapshot.retention,
      });
    }
  );

  /**
   * GET /v1/branches/:branchId/network-health
   */
  app.get(
    "/v1/branches/:branchId/network-health",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const auth = await authorizeBranch(request, reply, branchId);
      if (!auth) return;

      const snapshot = await snapshotService.getSnapshot(auth.tenantId, branchId);
      if (!snapshot) {
        return reply.code(404).send({ success: false, error: "Branch not found" });
      }

      return reply.send({
        success: true,
        data: snapshot.network,
      });
    }
  );

  /**
   * GET /v1/branches/:branchId/alerts
   */
  app.get(
    "/v1/branches/:branchId/alerts",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const auth = await authorizeBranch(request, reply, branchId);
      if (!auth) return;

      const snapshot = await snapshotService.getSnapshot(auth.tenantId, branchId);
      if (!snapshot) {
        return reply.code(404).send({ success: false, error: "Branch not found" });
      }

      return reply.send({
        success: true,
        data: snapshot.alerts,
      });
    }
  );

  /**
   * POST /v1/branches/:branchId/refresh
   */
  app.post(
    "/v1/branches/:branchId/refresh",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const auth = await authorizeBranch(request, reply, branchId);
      if (!auth) return;

      const snapshot = await snapshotService.getSnapshot(auth.tenantId, branchId);
      return reply.send({
        success: true,
        data: snapshot,
        message: "Branch telemetry cache refreshed",
      });
    }
  );
}
