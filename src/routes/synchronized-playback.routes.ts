/**
 * Fastify Routes for Multi-Camera Synchronized Playback & Timeline Drift Compensation
 * 
 * Production REST endpoints providing:
 * - Synchronized session lifecycle management (create, list, get, delete)
 * - Sub-second barrier seeking with timeline drift compensation
 * - Frame stepping (forward/backward at specified frame rate e.g. 25fps = 40ms)
 * - Variable speed playback and pause/resume control
 * - Dynamic drift compensation toggling and fine-grained camera calibration
 * - Synchronized multi-angle forensic bookmarks with camera snapshots
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { Pool } from "pg";
import {
  SynchronizedPlaybackService,
  synchronizedPlaybackService,
} from "../vms/services/synchronized-playback.service.js";

const createSessionSchema = z.object({
  tenantId: z.string().min(1).optional(),
  branchId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  cameraIds: z.array(z.string().min(1)).min(1).max(16),
  masterCameraId: z.string().min(1).optional(),
  startTime: z.string().datetime({ offset: true }).or(z.string()),
  endTime: z.string().datetime({ offset: true }).or(z.string()),
  layout: z.enum(["1x1", "2x2", "3x3", "2x3", "4x4"]).optional(),
  driftCompensationEnabled: z.boolean().optional(),
});

const seekSchema = z.object({
  targetTimestamp: z.string().datetime({ offset: true }).or(z.string()),
});

const stepSchema = z.object({
  direction: z.enum(["FORWARD", "BACKWARD"]).default("FORWARD"),
  fps: z.number().int().min(1).max(120).default(25),
});

const stateSchema = z.object({
  state: z.enum(["PLAYING", "PAUSED", "BUFFERING", "STOPPED"]),
  speed: z.number().min(-32).max(32).default(1.0),
});

const bookmarkSchema = z.object({
  timestamp: z.string().datetime({ offset: true }).or(z.string()),
  label: z.string().min(1).max(200),
  notes: z.string().max(2000).optional(),
});

const calibrateSchema = z.object({
  cameraId: z.string().min(1),
  manualOffsetMs: z.number().int().min(-300_000).max(300_000),
});

const toggleDriftSchema = z.object({
  enabled: z.boolean(),
});

export async function registerSynchronizedPlaybackRoutes(
  app: FastifyInstance,
  pool?: Pool
) {
  const service = pool ? new SynchronizedPlaybackService(pool) : synchronizedPlaybackService;

  const resolveTenantId = (req: FastifyRequest): string => {
    const user = (req as any).currentUser || (req as any).user;
    return user?.tenantId || (req.headers["x-tenant-id"] as string) || "00000000-0000-4000-8000-000000000000";
  };

  const resolveUserId = (req: FastifyRequest): string => {
    const user = (req as any).currentUser || (req as any).user;
    return user?.id || (req.headers["x-user-id"] as string) || "operator";
  };

  /**
   * POST /v1/playback/sync/sessions
   * Create a new synchronized playback session
   */
  app.post("/v1/playback/sync/sessions", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = resolveTenantId(request);
      const userId = resolveUserId(request);
      const body = createSessionSchema.parse(request.body);

      const session = await service.createSession({
        ...body,
        tenantId: body.tenantId || tenantId,
        createdByUser: userId,
      });

      return reply.code(201).send({ data: session });
    } catch (err: any) {
      request.log.error({ err }, "Failed to create synchronized playback session");
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: "create_sync_session_failed", message });
    }
  });

  /**
   * GET /v1/playback/sync/sessions
   * List synchronized playback sessions
   */
  app.get("/v1/playback/sync/sessions", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = resolveTenantId(request);
      const query = request.query as { branchId?: string };
      const sessions = await service.listSessions(query.branchId, tenantId);
      return reply.send({ data: sessions });
    } catch (err: any) {
      request.log.error({ err }, "Failed to list synchronized playback sessions");
      return reply.code(500).send({ error: "list_sync_sessions_failed" });
    }
  });

  /**
   * GET /v1/playback/sync/sessions/:id
   * Get synchronized playback session state
   */
  app.get("/v1/playback/sync/sessions/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      const session = await service.getSession(id);
      if (!session) {
        return reply.code(404).send({ error: "playback_session_not_found" });
      }
      return reply.send({ data: session });
    } catch (err: any) {
      request.log.error({ err, id }, "Failed to retrieve synchronized playback session");
      return reply.code(500).send({ error: "get_sync_session_failed" });
    }
  });

  /**
   * POST /v1/playback/sync/sessions/:id/seek
   * Seek timeline cursor across all cameras synchronously with drift compensation
   */
  app.post("/v1/playback/sync/sessions/:id/seek", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      const body = seekSchema.parse(request.body);
      const session = await service.seek(id, body.targetTimestamp);
      return reply.send({ data: session });
    } catch (err: any) {
      request.log.error({ err, id }, "Failed to seek synchronized playback session");
      const message = err instanceof Error ? err.message : String(err);
      const isNotFound = message.includes("not found");
      return reply.code(isNotFound ? 404 : 400).send({ error: "seek_sync_session_failed", message });
    }
  });

  /**
   * POST /v1/playback/sync/sessions/:id/step
   * Step frame forward or backward (sub-second barrier step e.g. 40ms)
   */
  app.post("/v1/playback/sync/sessions/:id/step", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      const body = stepSchema.parse(request.body || {});
      const session = await service.stepFrame(id, body.direction, body.fps);
      return reply.send({ data: session });
    } catch (err: any) {
      request.log.error({ err, id }, "Failed to step synchronized playback frame");
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: "step_sync_frame_failed", message });
    }
  });

  /**
   * POST /v1/playback/sync/sessions/:id/state
   * Update playback state (PLAYING, PAUSED) and speed
   */
  app.post("/v1/playback/sync/sessions/:id/state", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      const body = stateSchema.parse(request.body);
      const session = await service.setPlaybackState(id, body.state, body.speed);
      return reply.send({ data: session });
    } catch (err: any) {
      request.log.error({ err, id }, "Failed to update synchronized playback state");
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: "update_sync_state_failed", message });
    }
  });

  /**
   * POST /v1/playback/sync/sessions/:id/drift-toggle
   * Enable or disable timeline drift compensation
   */
  app.post("/v1/playback/sync/sessions/:id/drift-toggle", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      const body = toggleDriftSchema.parse(request.body);
      const session = await service.toggleDriftCompensation(id, body.enabled);
      return reply.send({ data: session });
    } catch (err: any) {
      request.log.error({ err, id }, "Failed to toggle drift compensation");
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: "toggle_drift_failed", message });
    }
  });

  /**
   * POST /v1/playback/sync/sessions/:id/bookmarks
   * Add a synchronized bookmark across all cameras
   */
  app.post("/v1/playback/sync/sessions/:id/bookmarks", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      const userId = resolveUserId(request);
      const body = bookmarkSchema.parse(request.body);
      const session = await service.addBookmark(id, body.timestamp, body.label, userId, body.notes);
      return reply.code(201).send({ data: session });
    } catch (err: any) {
      request.log.error({ err, id }, "Failed to add synchronized playback bookmark");
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: "add_sync_bookmark_failed", message });
    }
  });

  /**
   * GET /v1/playback/sync/sessions/:id/bookmarks
   * List bookmarks for session
   */
  app.get("/v1/playback/sync/sessions/:id/bookmarks", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      const bookmarks = await service.getBookmarks(id);
      return reply.send({ data: bookmarks });
    } catch (err: any) {
      request.log.error({ err, id }, "Failed to retrieve synchronized playback bookmarks");
      return reply.code(500).send({ error: "get_sync_bookmarks_failed" });
    }
  });

  /**
   * POST /v1/playback/sync/sessions/:id/calibrate
   * Calibrate manual clock drift offset for a camera
   */
  app.post("/v1/playback/sync/sessions/:id/calibrate", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      const userId = resolveUserId(request);
      const body = calibrateSchema.parse(request.body);
      const session = await service.calibrateDrift(id, body.cameraId, body.manualOffsetMs, userId);
      return reply.send({ data: session });
    } catch (err: any) {
      request.log.error({ err, id }, "Failed to calibrate drift for camera");
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: "calibrate_sync_drift_failed", message });
    }
  });

  /**
   * DELETE /v1/playback/sync/sessions/:id
   * Terminate and delete session
   */
  app.delete("/v1/playback/sync/sessions/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      const deleted = await service.deleteSession(id);
      return reply.send({ success: deleted });
    } catch (err: any) {
      request.log.error({ err, id }, "Failed to delete synchronized playback session");
      return reply.code(500).send({ error: "delete_sync_session_failed" });
    }
  });
}
