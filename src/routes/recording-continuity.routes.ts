/**
 * Recording Continuity REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { recordingContinuityService, RecordingGapDetector } from "../recording-continuity/index.js";

export async function registerRecordingContinuityRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/cameras/:cameraId/recording-continuity & /v1/cameras/:cameraId/recording-continuity
   */
  const handleGetContinuity = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const query = (request.query as any) || {};

    const continuity = recordingContinuityService.getContinuity(params.cameraId, {
      cameraName: query.cameraName,
      branchId: query.branchId,
      branchName: query.branchName,
      recorderId: query.recorderId,
      clockOffsetSeconds: query.clockOffset ? Number(query.clockOffset) : undefined,
    });

    return reply.send({ success: true, data: continuity });
  };

  app.get("/api/v1/cameras/:cameraId/recording-continuity", handleGetContinuity);
  app.get("/v1/cameras/:cameraId/recording-continuity", handleGetContinuity);

  /**
   * GET /api/v1/cameras/:cameraId/recording-gaps & /v1/cameras/:cameraId/recording-gaps
   */
  const handleGetGaps = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const query = (request.query as any) || {};

    const now = new Date();
    const windowStart = query.from ? new Date(query.from) : new Date(now.getTime() - 86400_000);
    const windowEnd = query.to ? new Date(query.to) : now;

    const segments = recordingContinuityService.getTimeline(params.cameraId);
    const gaps = RecordingGapDetector.detectGaps(segments, {
      windowStart,
      windowEnd,
      allowedGapSeconds: query.allowedGapSeconds ? Number(query.allowedGapSeconds) : 5,
      context: { cameraId: params.cameraId, branchId: query.branchId },
    });

    return reply.send({
      success: true,
      data: {
        cameraId: params.cameraId,
        window: { from: windowStart.toISOString(), to: windowEnd.toISOString() },
        totalGaps: gaps.length,
        totalGapSeconds: gaps.reduce((sum, g) => sum + g.durationSeconds, 0),
        gaps,
      },
    });
  };

  app.get("/api/v1/cameras/:cameraId/recording-gaps", handleGetGaps);
  app.get("/v1/cameras/:cameraId/recording-gaps", handleGetGaps);

  /**
   * GET /api/v1/cameras/:cameraId/recording-timeline & /v1/cameras/:cameraId/recording-timeline
   */
  const handleGetTimeline = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const segments = recordingContinuityService.getTimeline(params.cameraId);
    const merged = RecordingGapDetector.mergeSegments(segments);

    return reply.send({
      success: true,
      data: {
        cameraId: params.cameraId,
        rawSegmentsCount: segments.length,
        mergedSegmentsCount: merged.length,
        segments: merged,
      },
    });
  };

  app.get("/api/v1/cameras/:cameraId/recording-timeline", handleGetTimeline);
  app.get("/v1/cameras/:cameraId/recording-timeline", handleGetTimeline);

  /**
   * POST /api/v1/cameras/:cameraId/playback-verification & /v1/cameras/:cameraId/playback-verification
   */
  const handleVerifyPlayback = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const body = (request.body as any) || {};

    const requestedTimestamp = body.timestamp ? new Date(body.timestamp) : new Date(Date.now() - 900_000);
    const verification = await recordingContinuityService.verifyPlayback(params.cameraId, requestedTimestamp);

    return reply.status(201).send({ success: true, data: verification });
  };

  app.post("/api/v1/cameras/:cameraId/playback-verification", handleVerifyPlayback);
  app.post("/v1/cameras/:cameraId/playback-verification", handleVerifyPlayback);

  /**
   * GET /api/v1/branches/:branchId/recording-health & /v1/branches/:branchId/recording-health
   */
  const handleGetBranchRecordingHealth = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const query = (request.query as any) || {};
    const cameraIds = query.cameraIds ? String(query.cameraIds).split(",") : undefined;

    const health = recordingContinuityService.getBranchRecordingHealth(params.branchId, cameraIds);
    return reply.send({ success: true, data: health });
  };

  app.get("/api/v1/branches/:branchId/recording-health", handleGetBranchRecordingHealth);
  app.get("/v1/branches/:branchId/recording-health", handleGetBranchRecordingHealth);
}
