/**
 * On-Demand Media REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  liveSessionService,
  playbackSessionService,
  evidenceExportService,
  snapshotService,
  videoAccessAuditService,
} from "../media/index.js";
import type { SessionPurpose, StreamQuality } from "../media/domain/media-session.types.js";

export async function registerOnDemandMediaRoutes(app: FastifyInstance) {
  const required = (value: unknown, field: string): string => {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${field}_required`);
    return value.trim();
  };
  const purpose = (value: unknown): SessionPurpose => {
    const candidate = required(value, "purpose");
    if (!["LIVE_VIEW", "VIDEO_WALL", "ALERT", "INCIDENT", "INVESTIGATION", "PLAYBACK"].includes(candidate)) {
      throw new Error("invalid_purpose");
    }
    return candidate as SessionPurpose;
  };
  const quality = (value: unknown): StreamQuality => {
    const candidate = required(value, "quality");
    if (!["THUMBNAIL", "SUBSTREAM", "MAINSTREAM", "AUTO"].includes(candidate)) {
      throw new Error("invalid_quality");
    }
    return candidate as StreamQuality;
  };
  /**
   * POST /api/v1/media/live-sessions & /v1/media/live-sessions
   */
  const handleCreateLiveSession = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as any) || {};
    const session = await liveSessionService.createSession({
      tenantId: required((request as any).currentUser?.tenantId ?? body.tenantId, "tenantId"),
      branchId: required(body.branchId, "branchId"),
      cameraId: required(body.cameraId, "cameraId"),
      cameraName: body.cameraName,
      userId: required((request as any).currentUser?.id, "userId"),
      purpose: purpose(body.purpose),
      quality: quality(body.quality),
      sourceIp: request.ip,
    });

    return reply.status(201).send({ success: true, data: session });
  };

  app.post("/api/v1/media/live-sessions", handleCreateLiveSession);
  app.post("/v1/media/live-sessions", handleCreateLiveSession);

  /**
   * GET /api/v1/media/live-sessions/:id & /v1/media/live-sessions/:id
   */
  const handleGetLiveSession = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const session = liveSessionService.getSession(params.id);
    if (!session) {
      return reply.status(404).send({ success: false, error: "Live session not found or expired" });
    }
    return reply.send({ success: true, data: session });
  };

  app.get("/api/v1/media/live-sessions/:id", handleGetLiveSession);
  app.get("/v1/media/live-sessions/:id", handleGetLiveSession);

  /**
   * POST /api/v1/media/live-sessions/:id/heartbeat
   */
  const handleHeartbeat = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const session = await liveSessionService.heartbeat(params.id);
    if (!session) {
      return reply.status(404).send({ success: false, error: "Live session not found" });
    }
    return reply.send({ success: true, data: session });
  };

  app.post("/api/v1/media/live-sessions/:id/heartbeat", handleHeartbeat);
  app.post("/v1/media/live-sessions/:id/renew", handleHeartbeat);

  /**
   * DELETE /api/v1/media/live-sessions/:id
   */
  const handleTerminateSession = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const success = await liveSessionService.terminateSession(params.id);
    return reply.send({ success });
  };

  app.delete("/api/v1/media/live-sessions/:id", handleTerminateSession);
  app.delete("/v1/media/live-sessions/:id", handleTerminateSession);

  /**
   * POST /api/v1/media/playback-sessions
   */
  const handleCreatePlaybackSession = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as any) || {};
    const now = new Date();
    const session = await playbackSessionService.createSession({
      tenantId: required((request as any).currentUser?.tenantId ?? body.tenantId, "tenantId"),
      branchId: required(body.branchId, "branchId"),
      cameraId: required(body.cameraId, "cameraId"),
      from: new Date(required(body.from, "from")),
      to: new Date(required(body.to, "to")),
      userId: required((request as any).currentUser?.id, "userId"),
      sourceIp: request.ip,
    });

    return reply.status(201).send({ success: true, data: session });
  };

  app.post("/api/v1/media/playback-sessions", handleCreatePlaybackSession);
  app.post("/v1/media/playback-sessions", handleCreatePlaybackSession);

  /**
   * POST /api/v1/media/evidence-exports
   */
  const handleCreateExport = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as any) || {};
    const now = new Date();
    const exp = await evidenceExportService.createExport({
      tenantId: required((request as any).currentUser?.tenantId ?? body.tenantId, "tenantId"),
      branchId: required(body.branchId, "branchId"),
      cameraId: required(body.cameraId, "cameraId"),
      from: new Date(required(body.from, "from")),
      to: new Date(required(body.to, "to")),
      userId: required((request as any).currentUser?.id, "userId"),
      reason: required(body.reason, "reason"),
      sourceIp: request.ip,
    });

    return reply.status(201).send({ success: true, data: exp });
  };

  app.post("/api/v1/media/evidence-exports", handleCreateExport);
  app.post("/v1/media/evidence-exports", handleCreateExport);

  /**
   * GET /api/v1/media/snapshots/:cameraId
   */
  const handleGetSnapshot = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const query = (request.query as any) || {};
    const snapshot = await snapshotService.getLatestSnapshot(params.cameraId, query.branchId);
    return reply.send({ success: true, data: snapshot });
  };

  app.get("/api/v1/media/snapshots/:cameraId", handleGetSnapshot);
  app.get("/v1/media/snapshots/:cameraId", handleGetSnapshot);

  /**
   * GET /api/v1/media/audit
   */
  const handleGetAudit = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query as any) || {};
    const logs = await videoAccessAuditService.getLogs(query);
    return reply.send({ success: true, data: logs });
  };

  app.get("/api/v1/media/audit", handleGetAudit);
  app.get("/v1/media/audit", handleGetAudit);
}
