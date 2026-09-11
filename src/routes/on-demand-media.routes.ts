/**
 * On-Demand Media REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ControlPlaneStore } from "../control-plane-store.js";
import type { Action, User } from "../domain/models.js";
import type { ExportWorker } from "../recording/export-worker.js";

export async function registerOnDemandMediaRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  exportWorker?: ExportWorker,
) {
  const required = (value: unknown, field: string): string => {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${field}_required`);
    return value.trim();
  };

  const authorizeTarget = async (
    request: FastifyRequest,
    reply: FastifyReply,
    branchId: string,
    cameraId: string,
    action: Extract<Action, "live:view" | "recording:view">,
  ): Promise<User | undefined> => {
    const user = request.currentUser;
    if (!user?.tenantId || !user.id) {
      await reply.code(401).send({ success: false, error: "unauthorized" });
      return undefined;
    }

    const [branch, branchAccess, camera] = await Promise.all([
      store.getNode(branchId),
      store.checkAccess(user, action, branchId),
      store.getCamera(cameraId),
    ]);
    if (!branch || branch.type !== "branch" || branch.tenantId !== user.tenantId ||
        !branchAccess?.allowed || !camera || camera.branchId !== branchId ||
        (camera.tenantId && camera.tenantId !== user.tenantId)) {
      await reply.code(404).send({ success: false, error: "media_resource_not_found" });
      return undefined;
    }

    const cameraAccess = await store.checkAccess(user, action, camera.nodeId);
    if (!cameraAccess?.allowed) {
      await reply.code(404).send({ success: false, error: "media_resource_not_found" });
      return undefined;
    }
    return user;
  };

  /**
   * POST /api/v1/media/live-sessions & /v1/media/live-sessions
   */
  const handleCreateLiveSession = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as any) || {};
    const branchId = required(body.branchId, "branchId");
    const cameraId = required(body.cameraId, "cameraId");
    const user = await authorizeTarget(request, reply, branchId, cameraId, "live:view");
    if (!user) return;
    // This is retained as a compatibility alias only.  The old in-process
    // service produced a URL that no edge or gateway consumed; use the same
    // durable, single-use grant as the dashboard's canonical live path.
    const session = await store.createLiveSession(cameraId, user.id, "view");
    await store.writeAudit({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "live_session.created",
      resourceNodeId: (await store.getCamera(cameraId))!.nodeId,
      outcome: "success",
      sourceIp: request.ip,
      details: { sessionId: session.id, compatibilityRoute: true },
    });
    return reply.status(201).send({ success: true, data: session });
  };

  app.post("/api/v1/media/live-sessions", handleCreateLiveSession);
  app.post("/v1/media/live-sessions", handleCreateLiveSession);

  // Canonical live grants are deliberately single-use and expire after one
  // minute; they are consumed by the media gateway rather than renewed or
  // queried by a browser.  Explicitly reject the old process-local lifecycle
  // API so callers cannot mistake it for a working control plane.
  const retiredLifecycle = async (_request: FastifyRequest, reply: FastifyReply) =>
    reply.code(410).send({ success: false, error: "live_session_lifecycle_retired", canonical: "/v1/cameras/:id/live-sessions" });
  app.get("/api/v1/media/live-sessions/:id", retiredLifecycle);
  app.get("/v1/media/live-sessions/:id", retiredLifecycle);
  app.post("/api/v1/media/live-sessions/:id/heartbeat", retiredLifecycle);
  app.post("/v1/media/live-sessions/:id/renew", retiredLifecycle);
  app.delete("/api/v1/media/live-sessions/:id", retiredLifecycle);
  app.delete("/v1/media/live-sessions/:id", retiredLifecycle);

  /**
   * POST /api/v1/media/playback-sessions
   */
  const handleCreatePlaybackSession = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as any) || {};
    const branchId = required(body.branchId, "branchId");
    const cameraId = required(body.cameraId, "cameraId");
    const user = await authorizeTarget(request, reply, branchId, cameraId, "recording:view");
    if (!user) return;
    const from = new Date(required(body.from, "from"));
    const to = new Date(required(body.to, "to"));
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) {
      return reply.code(400).send({ success: false, error: "invalid_playback_range" });
    }
    const segments = await store.listRecordingSegments(cameraId, from.toISOString(), to.toISOString());
    const playable = segments.filter((segment) => segment.status === "ready");
    if (playable.length === 0) return reply.code(404).send({ success: false, error: "recording_not_found" });
    await store.writeAudit({
      tenantId: user.tenantId, actorUserId: user.id, action: "recording.playback_requested",
      resourceNodeId: (await store.getCamera(cameraId))!.nodeId, outcome: "success", sourceIp: request.ip,
      details: { from: from.toISOString(), to: to.toISOString(), segmentCount: playable.length },
    });
    return reply.status(201).send({ success: true, data: {
      cameraId, from: from.toISOString(), to: to.toISOString(),
      segments: playable.map((segment) => ({
        id: segment.id, startTime: segment.startedAt, endTime: segment.endedAt,
        playbackPath: `/api/recordings/play?segmentId=${encodeURIComponent(segment.id)}`,
      })),
    } });
  };

  app.post("/api/v1/media/playback-sessions", handleCreatePlaybackSession);
  app.post("/v1/media/playback-sessions", handleCreatePlaybackSession);

  /**
   * POST /api/v1/media/evidence-exports
   */
  const handleCreateExport = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as any) || {};
    if (!exportWorker) {
      return reply.code(503).send({ success: false, error: "evidence_export_unavailable" });
    }
    const branchId = required(body.branchId, "branchId");
    const cameraId = required(body.cameraId, "cameraId");
    const caseId = required(body.caseId, "caseId");
    const user = await authorizeTarget(request, reply, branchId, cameraId, "recording:view");
    if (!user) return;

    const evidenceCase = await store.getEvidenceCase(caseId, user.tenantId);
    if (!evidenceCase || (evidenceCase.tenantId && evidenceCase.tenantId !== user.tenantId)) {
      return reply.code(404).send({ success: false, error: "evidence_case_not_found" });
    }

    try {
      // Exports are always processed by the authoritative worker.  It creates
      // a UUID job, extracts the requested interval, signs the package and
      // issues the only accepted download token; this route must not create a
      // parallel direct-file export with a non-verifiable token.
      const exp = await exportWorker.createExportJob({
        tenantId: user.tenantId,
        caseId,
        exportType: body.format === "original" ? "original" : "viewing-copy",
        format: body.format === "original" ? "original" : "mp4",
        cameras: [{
          cameraId,
          fromTime: new Date(required(body.from, "from")).toISOString(),
          toTime: new Date(required(body.to, "to")).toISOString(),
        }],
        requestedBy: user.id,
        reason: required(body.reason, "reason"),
      });

      return reply.status(201).send({ success: true, data: exp });
    } catch (error) {
      if (error instanceof Error && (error as any).statusCode === 404) {
        return reply.status(404).send({ success: false, error: "recording_not_found" });
      }
      throw error;
    }
  };

  app.post("/api/v1/media/evidence-exports", handleCreateExport);
  app.post("/v1/media/evidence-exports", handleCreateExport);

  /**
   * GET /api/v1/media/snapshots/:cameraId
   */
  const handleGetSnapshot = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const query = (request.query as any) || {};
    if (typeof query.branchId !== "string" || !query.branchId.trim()) {
      return reply.code(400).send({ success: false, error: "branchId_required" });
    }
    const branchId = query.branchId.trim();
    const user = await authorizeTarget(request, reply, branchId, required(params.cameraId, "cameraId"), "live:view");
    if (!user) return;
    // Do not return metadata for an object that was never captured.  The
    // canonical endpoint returns an actual recent edge analytics frame.
    return reply.redirect(307, `/v1/cameras/${encodeURIComponent(params.cameraId)}/snapshot`);
  };

  app.get("/api/v1/media/snapshots/:cameraId", handleGetSnapshot);
  app.get("/v1/media/snapshots/:cameraId", handleGetSnapshot);

  /**
   * GET /api/v1/media/audit
   */
  const handleGetAudit = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query as any) || {};
    const user = request.currentUser;
    if (!user?.tenantId || !user.id) {
      return reply.code(401).send({ success: false, error: "unauthorized" });
    }

    if (query.cameraId) {
      const camera = await store.getCamera(String(query.cameraId));
      if (!camera || (camera.tenantId && camera.tenantId !== user.tenantId)) {
        return reply.code(404).send({ success: false, error: "media_resource_not_found" });
      }
      const cameraAccess = await store.checkAccess(user, "live:view", camera.nodeId);
      if (!cameraAccess?.allowed) {
        return reply.code(404).send({ success: false, error: "media_resource_not_found" });
      }
    } else if (query.branchId) {
      const branch = await store.getNode(String(query.branchId));
      const branchAccess = await store.checkAccess(user, "live:view", String(query.branchId));
      if (!branch || branch.type !== "branch" || branch.tenantId !== user.tenantId || !branchAccess?.allowed) {
        return reply.code(404).send({ success: false, error: "media_resource_not_found" });
      }
    }

    return reply.code(410).send({
      success: false,
      error: "media_audit_route_retired",
      message: "Use the durable audit-event query; the former endpoint exposed process-local logs.",
    });
  };

  app.get("/api/v1/media/audit", handleGetAudit);
  app.get("/v1/media/audit", handleGetAudit);
}
