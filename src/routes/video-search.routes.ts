import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RecordingSearchService } from "../recording/search-service.js";
import type { PlaybackEngine } from "../recording/playback-engine.js";
import type { SnapshotService } from "../recording/snapshot-service.js";

const searchFiltersSchema = z.object({
  cameraId: z.string().uuid().optional(),
  cameraIds: z.array(z.string().uuid()).optional(),
  branchId: z.string().uuid().optional(),
  from: z.string().datetime(),
  to: z.string().datetime(),
  eventType: z.string().optional(),
  objectClass: z.string().optional(),
  hasMotion: z.coerce.boolean().optional(),
  hasAIEvents: z.coerce.boolean().optional(),
  minDuration: z.coerce.number().int().min(1).optional(),
  zoneId: z.string().uuid().optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  recordingType: z.enum(["continuous", "motion", "scheduled", "event", "manual"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const motionSearchSchema = z.object({
  cameraId: z.string().uuid().optional(),
  from: z.string().datetime(),
  to: z.string().datetime(),
  minDuration: z.coerce.number().int().min(1).optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  zoneId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const objectSearchSchema = z.object({
  cameraId: z.string().uuid().optional(),
  from: z.string().datetime(),
  to: z.string().datetime(),
  objectClass: z.string().optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  zoneId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const snapshotSchema = z.object({
  segmentId: z.string().uuid(),
  cameraId: z.string().uuid(),
  timestamp: z.string().datetime(),
  snapshotType: z.enum(["manual", "automatic", "forensic", "investigation"]).default("manual"),
  reason: z.string().trim().min(3).max(500),
  notes: z.string().trim().max(2000).optional(),
  evidenceCaseId: z.string().uuid().optional(),
  incidentId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const bookmarkSchema = z.object({
  cameraId: z.string().uuid(),
  timestamp: z.string().datetime(),
  reason: z.string().trim().min(3).max(500),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  notes: z.string().trim().max(2000).optional(),
  recordingSegmentId: z.string().uuid().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).optional(),
  evidenceCaseId: z.string().uuid().optional(),
  frameOffsetMs: z.number().int().min(0).optional(),
  incidentId: z.string().uuid().optional(),
});

const playbackSessionSchema = z.object({
  cameraId: z.string().uuid(),
  fromTime: z.string().datetime(),
  toTime: z.string().datetime(),
  evidenceCaseId: z.string().uuid().optional(),
  reason: z.string().trim().max(500).optional(),
});

const syncedPlaybackSchema = z.object({
  groupId: z.string().uuid().optional(),
  cameraIds: z.array(z.string().uuid()).min(1).max(16),
  masterCameraId: z.string().uuid().optional(),
  fromTime: z.string().datetime(),
  toTime: z.string().datetime(),
  layout: z.enum(["grid", "stacked", "custom"]).default("grid"),
});

/**
 * Register video search and playback routes
 */
export async function registerVideoSearchRoutes(
  app: FastifyInstance,
  services: {
    searchService: RecordingSearchService;
    playbackEngine: PlaybackEngine;
    snapshotService: SnapshotService;
  },
) {
  const { searchService, playbackEngine, snapshotService } = services;

  /**
   * Search recordings with comprehensive filters
   * GET /v1/recordings/search
   */
  app.get("/v1/recordings/search", async (request, reply) => {
    const filters = searchFiltersSchema.parse(request.query);
    const tenantId = request.currentUser.tenantId;

    // Validate time range
    const fromTime = new Date(filters.from).getTime();
    const toTime = new Date(filters.to).getTime();

    if (toTime <= fromTime) {
      return reply.code(400).send({ error: "invalid_time_range" });
    }

    if (toTime - fromTime > 31 * 24 * 60 * 60 * 1000) {
      return reply.code(400).send({ error: "time_range_exceeds_31_days" });
    }

    try {
      const results = await searchService.searchRecordings(
        tenantId,
        {
          cameraId: filters.cameraId,
          cameraIds: filters.cameraIds,
          branchId: filters.branchId,
          from: filters.from,
          to: filters.to,
          eventType: filters.eventType,
          objectClass: filters.objectClass,
          hasMotion: filters.hasMotion,
          hasAIEvents: filters.hasAIEvents,
          minDuration: filters.minDuration,
          zoneId: filters.zoneId,
          minConfidence: filters.minConfidence,
          recordingType: filters.recordingType,
        },
        { limit: filters.limit, offset: filters.offset },
      );

      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "search_failed", details: message });
    }
  });

  /**
   * Get thumbnails for a recording range
   * GET /v1/recordings/thumbnails
   */
  app.get("/v1/recordings/thumbnails", async (request, reply) => {
    const query = z.object({
      cameraId: z.string().uuid().optional(),
      from: z.string().datetime(),
      to: z.string().datetime(),
      limit: z.coerce.number().int().min(1).max(200).default(100),
      offset: z.coerce.number().int().min(0).default(0),
    }).parse(request.query);

    try {
      const thumbnails = await searchService.getRecordingThumbnails(
        request.currentUser.tenantId,
        {
          cameraId: query.cameraId,
          from: query.from,
          to: query.to,
          limit: query.limit,
          offset: query.offset,
        },
      );

      return { data: thumbnails.data, total: thumbnails.total };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "thumbnails_fetch_failed", details: message });
    }
  });

  /**
   * Get timeline for a specific camera
   * GET /v1/recordings/timeline
   */
  app.get("/v1/recordings/timeline", async (request, reply) => {
    const query = z
      .object({
        cameraId: z.string().uuid(),
        from: z.string().datetime(),
        to: z.string().datetime(),
      })
      .parse(request.query);

    try {
      const results = await searchService.searchRecordings(
        request.currentUser.tenantId,
        {
          cameraId: query.cameraId,
          from: query.from,
          to: query.to,
        },
        { limit: 500, offset: 0 },
      );

      return {
        timeline: results.timeline,
        gaps: results.gaps,
        events: results.events,
        coveragePercent: results.coveragePercent,
        recordedSeconds: results.recordedSeconds,
        requestedSeconds: results.requestedSeconds,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "timeline_fetch_failed", details: message });
    }
  });

  /**
   * Search by motion events
   * GET /v1/recordings/search/motion
   */
  app.get("/v1/recordings/search/motion", async (request, reply) => {
    const filters = motionSearchSchema.parse(request.query);

    try {
      const results = await searchService.searchByMotion(request.currentUser.tenantId, {
        cameraId: filters.cameraId,
        from: filters.from,
        to: filters.to,
        minDuration: filters.minDuration,
        minConfidence: filters.minConfidence,
        zoneId: filters.zoneId,
        limit: filters.limit,
        offset: filters.offset,
      });

      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "motion_search_failed", details: message });
    }
  });

  /**
   * Search by detected objects
   * GET /v1/recordings/search/objects
   */
  app.get("/v1/recordings/search/objects", async (request, reply) => {
    const filters = objectSearchSchema.parse(request.query);

    try {
      const results = await searchService.searchByObject(request.currentUser.tenantId, {
        cameraId: filters.cameraId,
        from: filters.from,
        to: filters.to,
        objectClass: filters.objectClass,
        minConfidence: filters.minConfidence,
        zoneId: filters.zoneId,
        limit: filters.limit,
        offset: filters.offset,
      });

      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "object_search_failed", details: message });
    }
  });

  /**
   * Get available object classes for filtering
   * GET /v1/recordings/search/object-classes
   */
  app.get("/v1/recordings/search/object-classes", async (request, reply) => {
    const query = z
      .object({
        cameraId: z.string().uuid().optional(),
      })
      .parse(request.query);

    try {
      const classes = await searchService.getAvailableObjectClasses(
        request.currentUser.tenantId,
        query.cameraId,
      );

      return { data: classes };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "fetch_failed", details: message });
    }
  });

  /**
   * Get recording statistics
   * GET /v1/recordings/statistics
   */
  app.get("/v1/recordings/statistics", async (request, reply) => {
    const query = z
      .object({
        cameraId: z.string().uuid().optional(),
        branchId: z.string().uuid().optional(),
        from: z.string().datetime(),
        to: z.string().datetime(),
      })
      .parse(request.query);

    try {
      const stats = await searchService.getRecordingStatistics(request.currentUser.tenantId, {
        cameraId: query.cameraId,
        branchId: query.branchId,
        from: query.from,
        to: query.to,
      });

      return stats;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "statistics_fetch_failed", details: message });
    }
  });

  /**
   * Create forensic snapshot
   * POST /v1/recordings/snapshots
   */
  app.post("/v1/recordings/snapshots", async (request, reply) => {
    const body = snapshotSchema.parse(request.body);

    try {
      const snapshot = await snapshotService.createForensicSnapshot({
        segmentId: body.segmentId,
        cameraId: body.cameraId,
        timestamp: body.timestamp,
        snapshotType: body.snapshotType,
        reason: body.reason,
        notes: body.notes,
        operatorId: request.currentUser.id,
        evidenceCaseId: body.evidenceCaseId,
        incidentId: body.incidentId,
        metadata: body.metadata,
      });

      return reply.code(201).send(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "snapshot_creation_failed", details: message });
    }
  });

  /**
   * List snapshots
   * GET /v1/recordings/snapshots
   */
  app.get("/v1/recordings/snapshots", async (request, reply) => {
    const query = z
      .object({
        cameraId: z.string().uuid().optional(),
        evidenceCaseId: z.string().uuid().optional(),
        incidentId: z.string().uuid().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        snapshotType: z.enum(["manual", "automatic", "forensic", "investigation"]).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);

    try {
      const results = await snapshotService.listSnapshots({
        cameraId: query.cameraId,
        evidenceCaseId: query.evidenceCaseId,
        incidentId: query.incidentId,
        from: query.from,
        to: query.to,
        snapshotType: query.snapshotType,
        limit: query.limit,
        offset: query.offset,
      });

      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "snapshots_fetch_failed", details: message });
    }
  });

  /**
   * Get snapshot by ID
   * GET /v1/recordings/snapshots/:id
   */
  app.get("/v1/recordings/snapshots/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    try {
      const snapshot = await snapshotService.getSnapshot(id);
      if (!snapshot) {
        return reply.code(404).send({ error: "snapshot_not_found" });
      }

      return snapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "snapshot_fetch_failed", details: message });
    }
  });

  /**
   * Create bookmark
   * POST /v1/recordings/bookmarks
   */
  app.post("/v1/recordings/bookmarks", async (request, reply) => {
    const body = bookmarkSchema.parse(request.body);

    try {
      const bookmark = await snapshotService.createBookmark({
        tenantId: request.currentUser.tenantId,
        cameraId: body.cameraId,
        operatorId: request.currentUser.id,
        timestamp: body.timestamp,
        reason: body.reason,
        priority: body.priority,
        notes: body.notes,
        recordingSegmentId: body.recordingSegmentId,
        tags: body.tags,
        evidenceCaseId: body.evidenceCaseId,
        frameOffsetMs: body.frameOffsetMs,
        incidentId: body.incidentId,
      });

      return reply.code(201).send(bookmark);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "bookmark_creation_failed", details: message });
    }
  });

  /**
   * List bookmarks
   * GET /v1/recordings/bookmarks
   */
  app.get("/v1/recordings/bookmarks", async (request, reply) => {
    const query = z
      .object({
        cameraId: z.string().uuid().optional(),
        evidenceCaseId: z.string().uuid().optional(),
        incidentId: z.string().uuid().optional(),
        priority: z.enum(["low", "medium", "high", "critical"]).optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        tags: z.array(z.string()).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);

    try {
      const results = await snapshotService.listBookmarks({
        tenantId: request.currentUser.tenantId,
        cameraId: query.cameraId,
        evidenceCaseId: query.evidenceCaseId,
        incidentId: query.incidentId,
        priority: query.priority,
        from: query.from,
        to: query.to,
        tags: query.tags,
        limit: query.limit,
        offset: query.offset,
      });

      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "bookmarks_fetch_failed", details: message });
    }
  });

  /**
   * Verify bookmark
   * POST /v1/recordings/bookmarks/:id/verify
   */
  app.post("/v1/recordings/bookmarks/:id/verify", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    try {
      const bookmark = await snapshotService.verifyBookmark({
        bookmarkId: id,
        verifiedBy: request.currentUser.id,
      });

      if (!bookmark) {
        return reply.code(404).send({ error: "bookmark_not_found" });
      }

      return bookmark;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "bookmark_verification_failed", details: message });
    }
  });

  /**
   * Create playback session
   * POST /v1/recordings/playback/sessions
   */
  app.post("/v1/recordings/playback/sessions", async (request, reply) => {
    const body = playbackSessionSchema.parse(request.body);

    try {
      const session = await playbackEngine.createSession({
        tenantId: request.currentUser.tenantId,
        userId: request.currentUser.id,
        cameraId: body.cameraId,
        fromTime: body.fromTime,
        toTime: body.toTime,
        evidenceCaseId: body.evidenceCaseId,
        reason: body.reason,
        sourceIp: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return reply.code(201).send(session);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "session_creation_failed", details: message });
    }
  });

  /**
   * End playback session
   * POST /v1/recordings/playback/sessions/:id/end
   */
  app.post("/v1/recordings/playback/sessions/:id/end", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    try {
      await playbackEngine.endSession(id);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "session_end_failed", details: message });
    }
  });

  /**
   * Get synchronized playback data
   * POST /v1/recordings/playback/synchronized
   */
  app.post("/v1/recordings/playback/synchronized", async (request, reply) => {
    const body = syncedPlaybackSchema.parse(request.body);

    try {
      const syncData = await playbackEngine.getSynchronizedPlayback({
        tenantId: request.currentUser.tenantId,
        groupId: body.groupId,
        cameraIds: body.cameraIds,
        masterCameraId: body.masterCameraId,
        fromTime: body.fromTime,
        toTime: body.toTime,
        layout: body.layout,
      });

      return syncData;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "synced_playback_failed", details: message });
    }
  });

  /**
   * List playback groups
   * GET /v1/recordings/playback/groups
   */
  app.get("/v1/recordings/playback/groups", async (request, reply) => {
    try {
      const groups = await playbackEngine.listPlaybackGroups(
        request.currentUser.tenantId,
        request.currentUser.id,
      );

      return { data: groups };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "groups_fetch_failed", details: message });
    }
  });

  /**
   * Save playback group
   * POST /v1/recordings/playback/groups
   */
  app.post("/v1/recordings/playback/groups", async (request, reply) => {
    const body = z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(200),
        description: z.string().trim().max(1000).optional(),
        cameraIds: z.array(z.string().uuid()).min(1).max(16),
        masterCameraId: z.string().uuid(),
        timeOffsets: z.record(z.number()).optional(),
        layout: z.enum(["grid", "stacked", "custom"]).default("grid"),
      })
      .parse(request.body);

    try {
      const group = await playbackEngine.savePlaybackGroup({
        id: body.id,
        tenantId: request.currentUser.tenantId,
        name: body.name,
        description: body.description,
        cameraIds: body.cameraIds,
        masterCameraId: body.masterCameraId,
        timeOffsets: body.timeOffsets,
        layout: body.layout,
        createdBy: request.currentUser.id,
      });

      return body.id ? group : reply.code(201).send(group);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "group_save_failed", details: message });
    }
  });
}
