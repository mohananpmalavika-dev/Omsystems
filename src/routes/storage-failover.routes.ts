import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { storageFailoverService, StorageFailoverService } from "../storage/storage-failover.service.js";
import { storageFailoverRouter, StorageFailoverRouter } from "../storage/storage-failover-router.js";
import type { StorageFailoverReason } from "../domain/models.js";

const configureTargetSchema = z.object({
  tenantId: z.string().uuid().default("00000000-0000-0000-0000-000000000000"),
  mediaNodeId: z.string().min(1),
  cameraId: z.string().uuid().optional(),
  storageNodeId: z.string().min(1),
  targetName: z.string().min(1),
  targetPath: z.string().min(1),
  storageType: z.enum(["local-disk", "nas", "san", "s3", "archive"]).default("local-disk"),
  storageTier: z.enum(["hot", "warm", "cold", "archive"]).default("hot"),
  priority: z.number().int().min(1).max(100).default(1),
  isActive: z.boolean().default(true),
  maxCapacityBytes: z.number().int().nonnegative().optional(),
  spilloverThresholdPercent: z.number().min(50).max(100).default(95.0),
});

const triggerFailoverSchema = z.object({
  mediaNodeId: z.string().min(1),
  targetId: z.string().min(1),
  reason: z.enum([
    "DISK_FULL",
    "STORAGE_OFFLINE",
    "READ_ONLY",
    "WRITE_FAILURE",
    "LATENCY_SPIKE",
    "MOUNT_DISCONNECTED",
    "MANUAL_OVERRIDE",
  ]).default("MANUAL_OVERRIDE"),
  errorDetail: z.string().optional(),
  cameraId: z.string().uuid().optional(),
});

export async function registerStorageFailoverRoutes(
  app: FastifyInstance,
  options: {
    failoverService?: StorageFailoverService;
    failoverRouter?: StorageFailoverRouter;
  } = {},
): Promise<void> {
  const service = options.failoverService || storageFailoverService;
  const router = options.failoverRouter || storageFailoverRouter;

  /**
   * GET /api/v1/storage/failover/targets
   * Lists permitted recording targets and their priorities
   */
  app.get("/api/v1/storage/failover/targets", async (request: FastifyRequest, reply: FastifyReply) => {
    const { mediaNodeId, cameraId } = z.object({
      mediaNodeId: z.string().min(1),
      cameraId: z.string().uuid().optional(),
    }).parse(request.query || {});

    const targets = await service.getTargets(mediaNodeId, cameraId);
    const active = await router.getActiveTarget(mediaNodeId, cameraId);

    return reply.code(200).send({
      success: true,
      data: {
        mediaNodeId,
        cameraId,
        activeTarget: active,
        permittedTargets: targets,
      },
    });
  });

  /**
   * POST /api/v1/storage/failover/targets
   * Configures a permitted recording target with priority
   */
  app.post("/api/v1/storage/failover/targets", async (request: FastifyRequest, reply: FastifyReply) => {
    const input = configureTargetSchema.parse(request.body);
    const entry = await service.configureTarget(input);

    return reply.code(201).send({
      success: true,
      data: entry,
    });
  });

  /**
   * POST /api/v1/storage/failover/trigger
   * Triggers a failover on a target (e.g. simulated disk drop or manual re-route)
   */
  app.post("/api/v1/storage/failover/trigger", async (request: FastifyRequest, reply: FastifyReply) => {
    const input = triggerFailoverSchema.parse(request.body);
    const result = await service.triggerFailover(
      input.mediaNodeId,
      input.targetId,
      input.reason as StorageFailoverReason,
      input.errorDetail,
      input.cameraId,
    );

    return reply.code(200).send({
      success: true,
      data: result,
    });
  });

  /**
   * GET /api/v1/storage/failover/events
   * Lists historical failover audit events
   */
  app.get("/api/v1/storage/failover/events", async (request: FastifyRequest, reply: FastifyReply) => {
    const { mediaNodeId, limit } = z.object({
      mediaNodeId: z.string().optional(),
      limit: z.coerce.number().int().positive().default(50),
    }).parse(request.query || {});

    const events = await service.listFailoverEvents(mediaNodeId, limit);
    return reply.code(200).send({
      success: true,
      data: events,
    });
  });
}
