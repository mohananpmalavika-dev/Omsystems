import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";

const recordingSearchSchema = z.object({
  cameraId: z.string().optional(),
  branchId: z.string().optional(),
  from: z.string().datetime(),
  to: z.string().datetime(),
  eventType: z.enum([
    "motion", "person", "vehicle", "intrusion", "line-crossing",
    "loitering", "crowd", "fire", "unattended-object", "removed-object",
    "anpr", "face-match", "camera-tampering", "offline", "bookmark", "incident"
  ]).optional(),
  confidence: z.number().min(0).max(100).optional(),
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
});

const timelineRequestSchema = z.object({
  cameraId: z.string().uuid(),
  from: z.string().datetime(),
  to: z.string().datetime(),
  includeEvents: z.boolean().default(true),
  includeMotion: z.boolean().default(true),
  includeBookmarks: z.boolean().default(true),
  includeLegalHolds: z.boolean().default(true),
});

const snapshotCreateSchema = z.object({
  segmentId: z.string().uuid(),
  timestamp: z.string().datetime(),
  reason: z.enum([
    "investigation", "evidence", "reference", "incident", "audit"
  ]),
  notes: z.string().max(500).optional(),
});

const bookmarkCreateSchema = z.object({
  cameraId: z.string().uuid(),
  timestamp: z.string().datetime(),
  reason: z.string().max(200),
  priority: z.enum(["low", "medium", "high", "critical"]),
  incidentId: z.string().uuid().optional(),
});

async function hasAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  action: "recording:view" | "evidence:export",
  nodeId: string,
): Promise<boolean> {
  const hasPermission = await store.checkAccess(request.user.userId, action, nodeId);
  if (!hasPermission) {
    await reply.code(403).send({ error: "access_denied" });
    return false;
  }
  return true;
}

/**
 * Register video search routes
 */
export async function registerVideoSearchRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  /**
   * Search recordings by criteria
   * GET /v1/recordings/search
   */
  app.get("/v1/recordings/search", async (request, reply) => {
    const query = recordingSearchSchema.parse(request.query);

    try {
      const results = await store.searchRecordings(
        request.user.userId,
        query,
      );

      return {
        data: results.segments,
        timeline: results.timeline,
        gaps: results.gaps,
        total: results.total,
        limit: query.limit,
        offset: query.offset,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "search_failed", details: message });
    }
  });

  /**
   * Get recording timeline for a camera
   * GET /v1/cameras/:cameraId/recordings/timeline
   */
  app.get("/v1/cameras/:cameraId/recordings/timeline", async (request, reply) => {
    const { cameraId } = z.object({ cameraId: z.string() }).parse(request.params);
    const query = timelineRequestSchema.partial().parse(request.query);

    const camera = await store.getCamera(cameraId);
    if (!camera) {
      return reply.code(404).send({ error: "camera_not_found" });
    }

    // Check access to camera's branch
    if (!(await hasAccess(request, reply, store, "recording:view", camera.nodeId))) {
      return;
    }

    try {
      const timeline = await store.getRecordingTimeline(cameraId, {
        from: query.from || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        to: query.to || new Date().toISOString(),
        includeEvents: query.includeEvents ?? true,
        includeMotion: query.includeMotion ?? true,
        includeBookmarks: query.includeBookmarks ?? true,
        includeLegalHolds: query.includeLegalHolds ?? true,
      });

      return {
        cameraId,
        timeline,
        from: query.from,
        to: query.to,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "timeline_failed", details: message });
    }
  });

  /**
   * Get thumbnails for search results
   * GET /v1/recordings/thumbnails
   */
  app.get("/v1/recordings/thumbnails", async (request, reply) => {
    const query = z.object({
      cameraId: z.string().uuid(),
      from: z.string().datetime(),
      to: z.string().datetime(),
      eventTypes: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }).parse(request.query);

    const camera = await store.getCamera(query.cameraId);
    if (!camera) {
      return reply.code(404).send({ error: "camera_not_found" });
    }

    if (!(await hasAccess(request, reply, store, "recording:view", camera.nodeId))) {
      return;
    }

    try {
      const thumbnails = await store.getRecordingThumbnails({
        cameraId: query.cameraId,
        from: query.from,
        to: query.to,
        eventTypes: query.eventTypes?.split(","),
        limit: query.limit,
      });

      return { data: thumbnails };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "thumbnails_failed", details: message });
    }
  });

  /**
   * Create a snapshot from recording
   * POST /v1/recordings/:segmentId/snapshots
   */
  app.post("/v1/recordings/:segmentId/snapshots", async (request, reply) => {
    const { segmentId } = z.object({ segmentId: z.string() }).parse(request.params);
    const body = snapshotCreateSchema.parse(request.body);

    const segment = await store.getRecordingSegment(segmentId);
    if (!segment) {
      return reply.code(404).send({ error: "segment_not_found" });
    }

    const camera = await store.getCamera(segment.cameraId);
    if (!camera) {
      return reply.code(404).send({ error: "camera_not_found" });
    }

    if (!(await hasAccess(request, reply, store, "recording:view", camera.nodeId))) {
      return;
    }

    try {
      const snapshot = await store.createSnapshot({
        segmentId,
        cameraId: segment.cameraId,
        timestamp: body.timestamp,
        reason: body.reason,
        notes: body.notes,
        operatorId: request.user.userId,
      });

      return snapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "snapshot_failed", details: message });
    }
  });

  /**
   * Create a bookmark
   * POST /v1/recordings/bookmarks
   */
  app.post("/v1/recordings/bookmarks", async (request, reply) => {
    const body = bookmarkCreateSchema.parse(request.body);

    const camera = await store.getCamera(body.cameraId);
    if (!camera) {
      return reply.code(404).send({ error: "camera_not_found" });
    }

    if (!(await hasAccess(request, reply, store, "recording:view", camera.nodeId))) {
      return;
    }

    try {
      const bookmark = await store.createBookmark({
        cameraId: body.cameraId,
        timestamp: body.timestamp,
        reason: body.reason,
        priority: body.priority,
        incidentId: body.incidentId,
        operatorId: request.user.userId,
      });

      return bookmark;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "bookmark_failed", details: message });
    }
  });

  /**
   * List bookmarks for a camera
   * GET /v1/cameras/:cameraId/recordings/bookmarks
   */
  app.get("/v1/cameras/:cameraId/recordings/bookmarks", async (request, reply) => {
    const { cameraId } = z.object({ cameraId: z.string() }).parse(request.params);
    const query = z.object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }).parse(request.query);

    const camera = await store.getCamera(cameraId);
    if (!camera) {
      return reply.code(404).send({ error: "camera_not_found" });
    }

    if (!(await hasAccess(request, reply, store, "recording:view", camera.nodeId))) {
      return;
    }

    try {
      const bookmarks = await store.getBookmarks(cameraId, query);
      return { data: bookmarks };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "bookmarks_failed", details: message });
    }
  });

  /**
   * Get recording segment details
   * GET /v1/recordings/:segmentId
   */
  app.get("/v1/recordings/:segmentId", async (request, reply) => {
    const { segmentId } = z.object({ segmentId: z.string() }).parse(request.params);

    const segment = await store.getRecordingSegment(segmentId);
    if (!segment) {
      return reply.code(404).send({ error: "segment_not_found" });
    }

    const camera = await store.getCamera(segment.cameraId);
    if (!camera) {
      return reply.code(404).send({ error: "camera_not_found" });
    }

    if (!(await hasAccess(request, reply, store, "recording:view", camera.nodeId))) {
      return;
    }

    return segment;
  });

  /**
   * Verify recording segment integrity
   * POST /v1/recordings/:segmentId/verify
   */
  app.post("/v1/recordings/:segmentId/verify", async (request, reply) => {
    const { segmentId } = z.object({ segmentId: z.string() }).parse(request.params);

    const segment = await store.getRecordingSegment(segmentId);
    if (!segment) {
      return reply.code(404).send({ error: "segment_not_found" });
    }

    const camera = await store.getCamera(segment.cameraId);
    if (!camera) {
      return reply.code(404).send({ error: "camera_not_found" });
    }

    if (!(await hasAccess(request, reply, store, "evidence:export", camera.nodeId))) {
      return;
    }

    try {
      const verification = await store.verifyRecordingSegment(segmentId);
      return verification;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "verification_failed", details: message });
    }
  });
}
