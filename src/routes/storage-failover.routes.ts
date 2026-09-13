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

function parseRequest<T>(schema: z.ZodType<T>, value: unknown, reply: FastifyReply): T | undefined {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  reply.code(400).send({
    success: false,
    error: "invalid_request",
    details: parsed.error.flatten(),
  });
  return undefined;
}

export async function registerStorageFailoverRoutes(
  app: FastifyInstance,
  options: {
    failoverService?: StorageFailoverService;
    failoverRouter?: StorageFailoverRouter;
  } = {},
): Promise<void> {
  const service = options.failoverService || storageFailoverService;
  const router = options.failoverRouter || storageFailoverRouter;

  const registerEndpoints = (prefix: string) => {
    /**
     * GET <prefix>/targets
     * Lists permitted recording targets and their priorities
     */
    app.get(`${prefix}/targets`, async (request: FastifyRequest, reply: FastifyReply) => {
      const input = parseRequest(z.object({
        mediaNodeId: z.string().min(1),
        cameraId: z.string().uuid().optional(),
      }), request.query || {}, reply);
      if (!input) return reply;
      const { mediaNodeId, cameraId } = input;

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
     * POST <prefix>/targets
     * Configures a permitted recording target with priority
     */
    app.post(`${prefix}/targets`, async (request: FastifyRequest, reply: FastifyReply) => {
      const input = parseRequest(configureTargetSchema, request.body, reply);
      if (!input) return reply;
      const entry = await service.configureTarget(input as any);

      return reply.code(201).send({
        success: true,
        data: entry,
      });
    });

    /**
     * DELETE <prefix>/targets/:targetId
     * Deactivates or removes a permitted recording target
     */
    app.delete(`${prefix}/targets/:targetId`, async (request: FastifyRequest, reply: FastifyReply) => {
      const params = parseRequest(z.object({ targetId: z.string().min(1) }), request.params, reply);
      if (!params) return reply;

      const query = parseRequest(z.object({
        mediaNodeId: z.string().min(1),
        cameraId: z.string().uuid().optional(),
      }), request.query || {}, reply);
      if (!query) return reply;

      const success = await service.deleteTarget(query.mediaNodeId, params.targetId, query.cameraId);
      return reply.code(200).send({
        success,
        data: { targetId: params.targetId, removed: success },
      });
    });

    /**
     * PATCH <prefix>/targets/:targetId
     * Updates target priority, active state, name, or spillover threshold
     */
    app.patch(`${prefix}/targets/:targetId`, async (request: FastifyRequest, reply: FastifyReply) => {
      const params = parseRequest(z.object({ targetId: z.string().min(1) }), request.params, reply);
      if (!params) return reply;

      const body = parseRequest(z.object({
        mediaNodeId: z.string().min(1),
        cameraId: z.string().uuid().optional(),
        priority: z.number().int().min(1).max(100).optional(),
        isActive: z.boolean().optional(),
        targetName: z.string().min(1).optional(),
        targetPath: z.string().min(1).optional(),
        spilloverThresholdPercent: z.number().min(50).max(100).optional(),
      }), request.body, reply);
      if (!body) return reply;

      const updated = await service.updateTarget(
        body.mediaNodeId,
        params.targetId,
        {
          priority: body.priority,
          isActive: body.isActive,
          targetName: body.targetName,
          targetPath: body.targetPath,
          spilloverThresholdPercent: body.spilloverThresholdPercent,
        },
        body.cameraId,
      );

      if (!updated) {
        return reply.code(404).send({
          success: false,
          error: "target_not_found",
          message: `Storage target [${params.targetId}] not found for media node [${body.mediaNodeId}]`,
        });
      }

      return reply.code(200).send({
        success: true,
        data: updated,
      });
    });

    /**
     * POST <prefix>/trigger
     * Triggers a failover on a target (e.g. simulated disk drop or manual re-route)
     */
    app.post(`${prefix}/trigger`, async (request: FastifyRequest, reply: FastifyReply) => {
      const input = parseRequest(triggerFailoverSchema, request.body, reply);
      if (!input) return reply;
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
     * POST <prefix>/recover
     * Marks a failed storage target as recovered and restores higher priority route
     */
    app.post(`${prefix}/recover`, async (request: FastifyRequest, reply: FastifyReply) => {
      const input = parseRequest(z.object({
        mediaNodeId: z.string().min(1),
        targetId: z.string().min(1),
        cameraId: z.string().uuid().optional(),
      }), request.body, reply);
      if (!input) return reply;

      const result = await service.recoverTarget(input.mediaNodeId, input.targetId, input.cameraId);
      return reply.code(200).send({
        success: true,
        data: result,
      });
    });

    /**
     * POST <prefix>/probe
     * Proactively evaluates real filesystem capacity and connectivity across targets
     */
    app.post(`${prefix}/probe`, async (request: FastifyRequest, reply: FastifyReply) => {
      const input = parseRequest(z.object({
        mediaNodeId: z.string().min(1),
        cameraId: z.string().uuid().optional(),
      }), request.body, reply);
      if (!input) return reply;

      const report = await service.probeTargetHealth(input.mediaNodeId, input.cameraId);
      return reply.code(200).send({
        success: true,
        data: report,
      });
    });

    /**
     * GET <prefix>/health
     * Returns current active target and target health statuses for a media node
     */
    app.get(`${prefix}/health`, async (request: FastifyRequest, reply: FastifyReply) => {
      const input = parseRequest(z.object({
        mediaNodeId: z.string().min(1),
        cameraId: z.string().uuid().optional(),
      }), request.query || {}, reply);
      if (!input) return reply;

      const report = await service.probeTargetHealth(input.mediaNodeId, input.cameraId);
      return reply.code(200).send({
        success: true,
        data: report,
      });
    });

    /**
     * GET <prefix>/events
     * Lists historical failover audit events
     */
    app.get(`${prefix}/events`, async (request: FastifyRequest, reply: FastifyReply) => {
      const input = parseRequest(z.object({
        mediaNodeId: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        reason: z.string().optional(),
      }), request.query || {}, reply);
      if (!input) return reply;
      const { mediaNodeId, limit, reason } = input;

      const events = await service.listFailoverEvents(mediaNodeId, limit, reason);
      return reply.code(200).send({
        success: true,
        data: events,
      });
    });

    /**
     * GET <prefix>/metrics
     * Returns operational failover metrics and MTTR
     */
    app.get(`${prefix}/metrics`, async (request: FastifyRequest, reply: FastifyReply) => {
      const input = parseRequest(z.object({
        mediaNodeId: z.string().optional(),
      }), request.query || {}, reply);
      if (!input) return reply;

      const metrics = await service.getFailoverMetrics(input.mediaNodeId);
      return reply.code(200).send({
        success: true,
        data: metrics,
      });
    });
  };

  registerEndpoints("/v1/storage/failover");
  registerEndpoints("/api/v1/storage/failover");
}

