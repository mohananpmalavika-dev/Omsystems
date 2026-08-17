import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { recordingIndexService, RecordingIndexService } from "../recording-index/recording-index.service.js";
import type { ArchiveState, StorageTier } from "../recording-index/recording-index.types.js";

const searchRequestSchema = z.object({
  tenantId: z.string().uuid().default("00000000-0000-0000-0000-000000000000"),
  cameraIds: z.array(z.string().min(1)).min(1),
  from: z.string().datetime(),
  to: z.string().datetime(),
  include: z.object({
    gaps: z.boolean().optional(),
    keyframes: z.boolean().optional(),
  }).optional(),
  storageStates: z.array(z.enum([
    "ONLINE", "NEARLINE", "ARCHIVED", "RESTORING", "OFFLINE", "DELETED", "LEGAL_HOLD",
  ])).optional(),
  minDurationMs: z.number().int().nonnegative().optional(),
});

const registerSegmentSchema = z.object({
  id: z.string().uuid().optional(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  cameraId: z.string().min(1),
  streamId: z.string().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  durationMs: z.number().int().positive().optional(),
  deviceStartTime: z.string().datetime().optional(),
  deviceEndTime: z.string().datetime().optional(),
  clockOffsetMs: z.number().int().optional(),
  clockUncertaintyMs: z.number().int().optional(),
  codec: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fps: z.number().positive().optional(),
  bitrate: z.number().int().positive().optional(),
  storageNodeId: z.string().min(1),
  storageTier: z.enum(["HOT", "WARM", "COLD", "ARCHIVE"]).optional(),
  storageUri: z.string().min(1),
  fileSize: z.number().int().positive(),
  sha256: z.string().optional(),
  archiveState: z.enum([
    "ONLINE", "NEARLINE", "ARCHIVED", "RESTORING", "OFFLINE", "DELETED", "LEGAL_HOLD",
  ]).optional(),
  keyframes: z.array(z.object({
    timestamp: z.string().datetime(),
    pts: z.number().optional(),
    dts: z.number().optional(),
    byteOffset: z.number().optional(),
  })).optional(),
});

export async function registerRecordingIndexRoutes(
  app: FastifyInstance,
  service: RecordingIndexService = recordingIndexService,
): Promise<void> {
  /**
   * POST /api/v1/recordings/search
   * High-performance authoritative recording search with gaps and keyframes
   */
  app.post("/api/v1/recordings/search", async (request: FastifyRequest, reply: FastifyReply) => {
    const input = searchRequestSchema.parse(request.body);
    const result = await service.findRecording({
      tenantId: input.tenantId,
      cameraIds: input.cameraIds,
      from: new Date(input.from),
      to: new Date(input.to),
      includeGaps: input.include?.gaps ?? true,
      includeKeyframes: input.include?.keyframes ?? false,
      storageStates: input.storageStates as ArchiveState[] | undefined,
      minDurationMs: input.minDurationMs,
    });

    return reply.code(200).send({
      success: true,
      data: result,
    });
  });

  /**
   * GET /api/v1/recordings/:cameraId/range
   * Retrieves earliest and latest available recording time bounds
   */
  app.get("/api/v1/recordings/:cameraId/range", async (request: FastifyRequest, reply: FastifyReply) => {
    const { cameraId } = z.object({ cameraId: z.string().min(1) }).parse(request.params);
    const result = await service.getRecordingRange(cameraId);
    return reply.code(200).send({
      success: true,
      data: result,
    });
  });

  /**
   * GET /api/v1/recordings/:cameraId/segment-at
   * Finds the exact segment containing a given timestamp
   */
  app.get("/api/v1/recordings/:cameraId/segment-at", async (request: FastifyRequest, reply: FastifyReply) => {
    const { cameraId } = z.object({ cameraId: z.string().min(1) }).parse(request.params);
    const { timestamp } = z.object({ timestamp: z.string().datetime() }).parse(request.query);

    const segment = await service.findSegmentAt(cameraId, new Date(timestamp));
    if (!segment) {
      return reply.code(404).send({ success: false, error: "no_segment_at_timestamp" });
    }
    return reply.code(200).send({ success: true, data: segment });
  });

  /**
   * GET /api/v1/recordings/:cameraId/nearest-keyframe
   * Resolves nearest earlier keyframe for sub-second scrubber seeking
   */
  app.get("/api/v1/recordings/:cameraId/nearest-keyframe", async (request: FastifyRequest, reply: FastifyReply) => {
    const { cameraId } = z.object({ cameraId: z.string().min(1) }).parse(request.params);
    const { timestamp, maxLookbackMs } = z.object({
      timestamp: z.string().datetime(),
      maxLookbackMs: z.coerce.number().int().positive().optional(),
    }).parse(request.query);

    const keyframe = await service.findNearestKeyframe(
      cameraId,
      new Date(timestamp),
      maxLookbackMs,
    );

    if (!keyframe) {
      return reply.code(404).send({ success: false, error: "no_keyframe_found" });
    }
    return reply.code(200).send({ success: true, data: keyframe });
  });

  /**
   * POST /api/v1/recordings/segments
   * Registers a finalized recording segment
   */
  app.post("/api/v1/recordings/segments", async (request: FastifyRequest, reply: FastifyReply) => {
    const input = registerSegmentSchema.parse(request.body);
    const segment = await service.registerSegment({
      id: input.id,
      tenantId: input.tenantId,
      branchId: input.branchId,
      cameraId: input.cameraId,
      streamId: input.streamId,
      startTime: new Date(input.startTime),
      endTime: new Date(input.endTime),
      durationMs: input.durationMs,
      deviceStartTime: input.deviceStartTime ? new Date(input.deviceStartTime) : undefined,
      deviceEndTime: input.deviceEndTime ? new Date(input.deviceEndTime) : undefined,
      clockOffsetMs: input.clockOffsetMs,
      clockUncertaintyMs: input.clockUncertaintyMs,
      codec: input.codec,
      width: input.width,
      height: input.height,
      fps: input.fps,
      bitrate: input.bitrate,
      storageNodeId: input.storageNodeId,
      storageTier: input.storageTier as StorageTier | undefined,
      storageUri: input.storageUri,
      fileSize: input.fileSize,
      sha256: input.sha256,
      archiveState: input.archiveState as ArchiveState | undefined,
      keyframes: input.keyframes?.map((k) => ({
        timestamp: new Date(k.timestamp),
        pts: k.pts,
        dts: k.dts,
        byteOffset: k.byteOffset,
      })),
    });

    return reply.code(201).send({ success: true, data: segment });
  });

  /**
   * POST /api/v1/recordings/reconcile
   * Reconciles storage reality against the authoritative database index
   */
  app.post("/api/v1/recordings/reconcile", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      segmentIds: z.array(z.string().uuid()).optional(),
    }).parse(request.body || {});

    const summary = await service.reconcile(body.segmentIds);
    return reply.code(200).send({ success: true, data: summary });
  });
}
