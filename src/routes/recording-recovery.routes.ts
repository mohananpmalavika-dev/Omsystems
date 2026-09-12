/**
 * Fastify REST API Routes for Recording Gap Recovery & Edge Backfill
 * Capability ID: recording.recovery
 * 
 * Production endpoints for automated gap detection, edge-to-cloud backfill orchestration,
 * deduplication telemetry, and tamper-proof recovery auditing.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import {
  RecordingGapDetectorService,
  EdgeBackfillCoordinatorService,
  type GapStatus,
  type BackfillJobStatus,
  type BackfillTriggerSource,
} from "../recording/recovery/index.js";

const scanGapsSchema = z.object({
  cameraId: z.string().min(1, "cameraId is required"),
  branchId: z.string().optional(),
  startTime: z.string().min(1, "startTime is required"),
  endTime: z.string().min(1, "endTime is required"),
  toleranceSeconds: z.number().positive().optional(),
});

const createJobSchema = z.object({
  branchId: z.string().min(1, "branchId is required"),
  cameraId: z.string().min(1, "cameraId is required"),
  gapId: z.string().optional(),
  triggerSource: z.enum(["AUTO_WAN_RECOVERY", "MANUAL_OPERATOR", "SCHEDULED_AUDIT"]).optional(),
  windowStart: z.string().min(1, "windowStart is required"),
  windowEnd: z.string().min(1, "windowEnd is required"),
  rateLimitKbps: z.number().min(0).optional(),
});

const uploadSegmentSchema = z.object({
  jobId: z.string().optional(),
  branchId: z.string().min(1, "branchId is required"),
  cameraId: z.string().min(1, "cameraId is required"),
  segmentId: z.string().min(1, "segmentId is required"),
  startTime: z.string().min(1, "startTime is required"),
  endTime: z.string().min(1, "endTime is required"),
  durationMs: z.number().positive("durationMs must be positive"),
  fileSize: z.number().positive("fileSize must be positive"),
  sha256: z.string().min(10, "sha256 hash required"),
  storagePath: z.string().min(1, "storagePath is required"),
  dataBase64: z.string().optional(),
});

const batchUploadSchema = z.object({
  jobId: z.string().optional(),
  branchId: z.string().min(1, "branchId is required"),
  cameraId: z.string().min(1, "cameraId is required"),
  rateLimitKbps: z.number().min(0).optional(),
  segments: z.array(
    z.object({
      segmentId: z.string().min(1),
      startTime: z.string().min(1),
      endTime: z.string().min(1),
      durationMs: z.number().positive(),
      fileSize: z.number().positive(),
      sha256: z.string().min(10),
      storagePath: z.string().min(1),
    })
  ).min(1, "At least one segment required"),
});

export async function registerRecordingRecoveryRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  const pool = (store as any).pool || (store as any).db;

  if (!pool) {
    app.log.warn("[RecordingRecoveryRoutes] No PostgreSQL pool available on store; routes disabled");
    return;
  }

  const gapDetector = new RecordingGapDetectorService(pool);
  const coordinator = new EdgeBackfillCoordinatorService(pool, gapDetector);

  const getTenantId = (req: FastifyRequest): string => {
    const user = (req as any).currentUser || (req as any).user;
    return (
      user?.tenantId ||
      (req.headers["x-tenant-id"] as string) ||
      "00000000-0000-4000-8000-000000000000"
    );
  };

  // 1. List recording gaps with multi-filtering
  app.get("/v1/recording/recovery/gaps", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = request.query as {
        branchId?: string;
        cameraId?: string;
        status?: string;
        startDate?: string;
        endDate?: string;
        limit?: string;
        offset?: string;
      };

      const result = await gapDetector.listGaps({
        tenantId,
        branchId: query.branchId,
        cameraId: query.cameraId,
        status: query.status as GapStatus,
        startDate: query.startDate,
        endDate: query.endDate,
        limit: query.limit ? Number(query.limit) : undefined,
        offset: query.offset ? Number(query.offset) : undefined,
      });

      return reply.send({
        success: true,
        data: result.items,
        meta: {
          total: result.total,
          limit: query.limit ? Number(query.limit) : 50,
          offset: query.offset ? Number(query.offset) : 0,
        },
      });
    } catch (error: any) {
      request.log.error({ error }, "Failed to list recording gaps");
      return reply.code(500).send({ success: false, error: error?.message || "Internal error" });
    }
  });

  // 2. Scan timeline gaps for camera or branch
  app.post("/v1/recording/recovery/scan-gaps", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = scanGapsSchema.parse(request.body);

      const gaps = await gapDetector.scanTimelineGaps({
        tenantId,
        cameraId: body.cameraId,
        branchId: body.branchId,
        startTime: body.startTime,
        endTime: body.endTime,
        toleranceSeconds: body.toleranceSeconds,
      });

      return reply.send({ success: true, data: gaps });
    } catch (error: any) {
      request.log.error({ error }, "Failed to scan timeline gaps");
      const code = error instanceof z.ZodError ? 400 : 500;
      return reply.code(code).send({ success: false, error: error?.message || "Internal error" });
    }
  });

  // 3. List backfill jobs
  app.get("/v1/recording/recovery/jobs", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = request.query as {
        branchId?: string;
        cameraId?: string;
        status?: string;
        limit?: string;
        offset?: string;
      };

      const result = await coordinator.listJobs({
        tenantId,
        branchId: query.branchId,
        cameraId: query.cameraId,
        status: query.status as BackfillJobStatus,
        limit: query.limit ? Number(query.limit) : undefined,
        offset: query.offset ? Number(query.offset) : undefined,
      });

      return reply.send({
        success: true,
        data: result.items,
        meta: {
          total: result.total,
          limit: query.limit ? Number(query.limit) : 50,
          offset: query.offset ? Number(query.offset) : 0,
        },
      });
    } catch (error: any) {
      request.log.error({ error }, "Failed to list backfill jobs");
      return reply.code(500).send({ success: false, error: error?.message || "Internal error" });
    }
  });

  // 4. Get backfill job by ID
  app.get("/v1/recording/recovery/jobs/:jobId", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { jobId: string };
      const job = await coordinator.getJobById(params.jobId);
      if (!job) {
        return reply.code(404).send({ success: false, error: "Backfill job not found" });
      }
      return reply.send({ success: true, data: job });
    } catch (error: any) {
      request.log.error({ error }, "Failed to get backfill job");
      return reply.code(500).send({ success: false, error: error?.message || "Internal error" });
    }
  });

  // 5. Create new backfill job
  app.post("/v1/recording/recovery/jobs", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = createJobSchema.parse(request.body);

      const job = await coordinator.createBackfillJob({
        tenantId,
        branchId: body.branchId,
        cameraId: body.cameraId,
        gapId: body.gapId,
        triggerSource: body.triggerSource as BackfillTriggerSource,
        windowStart: body.windowStart,
        windowEnd: body.windowEnd,
        rateLimitKbps: body.rateLimitKbps,
      });

      return reply.code(201).send({ success: true, data: job });
    } catch (error: any) {
      request.log.error({ error }, "Failed to create backfill job");
      const code = error instanceof z.ZodError ? 400 : 500;
      return reply.code(code).send({ success: false, error: error?.message || "Internal error" });
    }
  });

  // 6. Cancel backfill job
  app.post("/v1/recording/recovery/jobs/:jobId/cancel", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { jobId: string };
      const cancelled = await coordinator.cancelJob(params.jobId);
      if (!cancelled) {
        return reply.code(404).send({ success: false, error: "Job not found or not active" });
      }
      return reply.send({ success: true, data: cancelled });
    } catch (error: any) {
      request.log.error({ error }, "Failed to cancel backfill job");
      return reply.code(500).send({ success: false, error: error?.message || "Internal error" });
    }
  });

  // 7. Ingest single backfill segment
  app.post("/v1/recording/recovery/backfill/upload", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = uploadSegmentSchema.parse(request.body);

      const result = await coordinator.ingestBackfillSegment({
        tenantId,
        jobId: body.jobId,
        branchId: body.branchId,
        cameraId: body.cameraId,
        segmentId: body.segmentId,
        startTime: body.startTime,
        endTime: body.endTime,
        durationMs: body.durationMs,
        fileSize: body.fileSize,
        sha256: body.sha256,
        storagePath: body.storagePath,
        dataBase64: body.dataBase64,
      });

      return reply.send({ success: true, data: result });
    } catch (error: any) {
      request.log.error({ error }, "Failed to ingest backfill segment");
      const code = error instanceof z.ZodError ? 400 : 500;
      return reply.code(code).send({ success: false, error: error?.message || "Internal error" });
    }
  });

  // 8. Batch ingest backfill segments
  app.post("/v1/recording/recovery/backfill/sync-batch", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = batchUploadSchema.parse(request.body);

      const summary = await coordinator.ingestBackfillBatch({
        tenantId,
        jobId: body.jobId,
        branchId: body.branchId,
        cameraId: body.cameraId,
        rateLimitKbps: body.rateLimitKbps,
        segments: body.segments,
      });

      return reply.send({ success: true, data: summary });
    } catch (error: any) {
      request.log.error({ error }, "Failed to batch ingest backfill segments");
      const code = error instanceof z.ZodError ? 400 : 500;
      return reply.code(code).send({ success: false, error: error?.message || "Internal error" });
    }
  });

  // 9. Overall gap & recovery metrics
  app.get("/v1/recording/recovery/stats", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = request.query as { branchId?: string; cameraId?: string };

      const [gapMetrics, recoveryStats] = await Promise.all([
        gapDetector.getGapMetrics({
          tenantId,
          branchId: query.branchId,
          cameraId: query.cameraId,
        }),
        coordinator.getRecoveryStats(query.branchId),
      ]);

      return reply.send({
        success: true,
        data: {
          ...gapMetrics,
          ...recoveryStats,
        },
      });
    } catch (error: any) {
      request.log.error({ error }, "Failed to get recovery stats");
      return reply.code(500).send({ success: false, error: error?.message || "Internal error" });
    }
  });

  // 10. Audit log entries
  app.get("/v1/recording/recovery/audit", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as {
        cameraId?: string;
        jobId?: string;
        limit?: string;
        offset?: string;
      };

      const result = await coordinator.listAuditEntries({
        cameraId: query.cameraId,
        jobId: query.jobId,
        limit: query.limit ? Number(query.limit) : undefined,
        offset: query.offset ? Number(query.offset) : undefined,
      });

      return reply.send({
        success: true,
        data: result.items,
        meta: {
          total: result.total,
          limit: query.limit ? Number(query.limit) : 50,
          offset: query.offset ? Number(query.offset) : 0,
        },
      });
    } catch (error: any) {
      request.log.error({ error }, "Failed to get recovery audit log");
      return reply.code(500).send({ success: false, error: error?.message || "Internal error" });
    }
  });
}
