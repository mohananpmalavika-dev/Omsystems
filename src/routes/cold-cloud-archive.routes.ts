/**
 * Fastify REST API Routes for Cold Cloud Archive Export
 * Capability ID: recording.archive
 * 
 * Production endpoints for long-term automated archival of marked incident video
 * to AWS S3 and Glacier cold object storage, retrieval lifecycle management,
 * and immutable chain-of-custody verification.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import {
  ColdCloudArchiveCoordinatorService,
  S3GlacierClientService,
  type ArchiveJobStatus,
  type ArchiveStorageClass,
  type GlacierRestoreTier,
  type RestoreStatus,
} from "../recording/archive/index.js";

const createArchiveJobSchema = z.object({
  incidentId: z.string().min(1, "incidentId is required"),
  cameraId: z.string().min(1, "cameraId is required"),
  branchId: z.string().optional(),
  incidentNumber: z.string().optional(),
  evidencePackageId: z.string().optional(),
  clipId: z.string().optional(),
  storageTier: z.enum(["GLACIER", "DEEP_ARCHIVE", "GLACIER_IR", "INTELLIGENT_TIERING"]).optional(),
  videoData: z.string().optional(), // base64 encoded video if sent via API
  videoFilePath: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const restoreArchiveSchema = z.object({
  tier: z.enum(["Expedited", "Standard", "Bulk"]).default("Standard"),
  validityDays: z.number().int().min(1).max(365).default(7),
});

const createPolicySchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  description: z.string().optional(),
  enabled: z.boolean().default(true),
  targetStorageClass: z.enum(["GLACIER", "DEEP_ARCHIVE", "GLACIER_IR"]).default("GLACIER"),
  targetBucket: z.string().optional(),
  targetPrefix: z.string().optional(),
  triggerCondition: z.record(z.any()).optional(),
  encryptionKmsKeyId: z.string().optional(),
  retentionDays: z.number().int().min(30).default(2555),
});

export async function registerColdCloudArchiveRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  options?: {
    s3Client?: S3GlacierClientService;
    coordinator?: ColdCloudArchiveCoordinatorService;
  }
) {
  const pool = (store as any).pool || (store as any).db;

  if (!pool) {
    app.log.warn("[ColdCloudArchiveRoutes] No PostgreSQL pool available on store; routes disabled");
    return;
  }

  const s3Client = options?.s3Client || new S3GlacierClientService();
  const coordinator = options?.coordinator || new ColdCloudArchiveCoordinatorService(pool, s3Client);

  const getTenantId = (req: FastifyRequest): string => {
    const user = (req as any).currentUser || (req as any).user;
    return (
      user?.tenantId ||
      (req.headers["x-tenant-id"] as string) ||
      "00000000-0000-4000-8000-000000000000"
    );
  };

  const getOperatorId = (req: FastifyRequest): string => {
    const user = (req as any).currentUser || (req as any).user;
    return user?.id || user?.username || "operator";
  };

  // 1. List cold cloud archive export jobs
  app.get("/v1/recording/archive/jobs", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = request.query as {
        incidentId?: string;
        cameraId?: string;
        branchId?: string;
        status?: string;
        restoreStatus?: string;
        limit?: string;
        offset?: string;
      };

      const result = await coordinator.listJobs(tenantId, {
        incidentId: query.incidentId,
        cameraId: query.cameraId,
        branchId: query.branchId,
        status: query.status as ArchiveJobStatus,
        restoreStatus: query.restoreStatus as RestoreStatus,
        limit: query.limit ? parseInt(query.limit, 10) : 50,
        offset: query.offset ? parseInt(query.offset, 10) : 0,
      });

      return reply.send({
        data: result.jobs,
        meta: {
          total: result.total,
          limit: query.limit ? parseInt(query.limit, 10) : 50,
          offset: query.offset ? parseInt(query.offset, 10) : 0,
        },
      });
    } catch (err: any) {
      request.log.error({ err }, "Failed to list cold cloud archive jobs");
      return reply.code(500).send({ error: err.message || "Failed to list archive jobs" });
    }
  });

  // 2. Trigger manual archival export for marked incident video
  app.post("/v1/recording/archive/jobs", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const operatorId = getOperatorId(request);
      const body = createArchiveJobSchema.parse(request.body);

      const videoBuffer = body.videoData
        ? Buffer.from(body.videoData, "base64")
        : undefined;

      const job = await coordinator.createArchiveJob(
        tenantId,
        {
          incidentId: body.incidentId,
          cameraId: body.cameraId,
          branchId: body.branchId,
          incidentNumber: body.incidentNumber,
          evidencePackageId: body.evidencePackageId,
          clipId: body.clipId,
          storageTier: body.storageTier as ArchiveStorageClass,
          videoData: videoBuffer,
          videoFilePath: body.videoFilePath,
          metadata: body.metadata,
        },
        operatorId
      );

      return reply.code(201).send({ data: job });
    } catch (err: any) {
      request.log.error({ err }, "Failed to create cold cloud archive job");
      const statusCode = err.name === "ZodError" ? 400 : 500;
      return reply.code(statusCode).send({ error: err.message || "Failed to create archive job" });
    }
  });

  // 3. Get single archive job details
  app.get("/v1/recording/archive/jobs/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const { id } = request.params as { id: string };

      const job = await coordinator.getJob(id, tenantId);
      if (!job) {
        return reply.code(404).send({ error: `Archive job [${id}] not found` });
      }

      return reply.send({ data: job });
    } catch (err: any) {
      request.log.error({ err }, "Failed to get archive job");
      return reply.code(500).send({ error: err.message || "Failed to get archive job" });
    }
  });

  // 4. Request Glacier restore
  app.post("/v1/recording/archive/jobs/:id/restore", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const operatorId = getOperatorId(request);
      const { id } = request.params as { id: string };
      const body = restoreArchiveSchema.parse(request.body || {});

      const updatedJob = await coordinator.requestGlacierRestore(
        id,
        tenantId,
        body.tier as GlacierRestoreTier,
        body.validityDays,
        operatorId
      );

      return reply.send({ data: updatedJob });
    } catch (err: any) {
      request.log.error({ err }, "Failed to initiate Glacier restore");
      const statusCode = err.name === "ZodError" ? 400 : err.message?.includes("not found") ? 404 : 500;
      return reply.code(statusCode).send({ error: err.message || "Failed to initiate Glacier restore" });
    }
  });

  // 5. Query Glacier restore status
  app.get("/v1/recording/archive/jobs/:id/restore-status", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const { id } = request.params as { id: string };

      const updatedJob = await coordinator.pollRestoreStatus(id, tenantId);
      return reply.send({ data: updatedJob });
    } catch (err: any) {
      request.log.error({ err }, "Failed to check Glacier restore status");
      return reply.code(500).send({ error: err.message || "Failed to check restore status" });
    }
  });

  // 6. Automated retention policy sweep
  app.post("/v1/recording/archive/auto-export", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const operatorId = getOperatorId(request);

      const sweepResult = await coordinator.runAutomatedArchiveSweep(tenantId, operatorId);
      return reply.send({ data: sweepResult });
    } catch (err: any) {
      request.log.error({ err }, "Failed to execute automated archive sweep");
      return reply.code(500).send({ error: err.message || "Failed to execute automated archive sweep" });
    }
  });

  // 7. List automated retention policies
  app.get("/v1/recording/archive/policies", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const policies = await coordinator.listPolicies(tenantId);
      return reply.send({ data: policies });
    } catch (err: any) {
      request.log.error({ err }, "Failed to list archive policies");
      return reply.code(500).send({ error: err.message || "Failed to list policies" });
    }
  });

  // 8. Create automated retention policy
  app.post("/v1/recording/archive/policies", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const operatorId = getOperatorId(request);
      const body = createPolicySchema.parse(request.body);

      const policy = await coordinator.createPolicy(
        tenantId,
        {
          name: body.name,
          description: body.description,
          enabled: body.enabled,
          targetStorageClass: body.targetStorageClass as ArchiveStorageClass,
          targetBucket: body.targetBucket,
          targetPrefix: body.targetPrefix,
          triggerCondition: body.triggerCondition,
          encryptionKmsKeyId: body.encryptionKmsKeyId,
          retentionDays: body.retentionDays,
        },
        operatorId
      );

      return reply.code(201).send({ data: policy });
    } catch (err: any) {
      request.log.error({ err }, "Failed to create archive policy");
      const statusCode = err.name === "ZodError" ? 400 : 500;
      return reply.code(statusCode).send({ error: err.message || "Failed to create policy" });
    }
  });

  // 9. List chain of custody audit log
  app.get("/v1/recording/archive/audit", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = request.query as {
        jobId?: string;
        incidentId?: string;
        limit?: string;
        offset?: string;
      };

      const result = await coordinator.listAuditLogs(tenantId, {
        jobId: query.jobId,
        incidentId: query.incidentId,
        limit: query.limit ? parseInt(query.limit, 10) : 50,
        offset: query.offset ? parseInt(query.offset, 10) : 0,
      });

      return reply.send({
        data: result.auditLogs,
        meta: {
          total: result.total,
          limit: query.limit ? parseInt(query.limit, 10) : 50,
          offset: query.offset ? parseInt(query.offset, 10) : 0,
        },
      });
    } catch (err: any) {
      request.log.error({ err }, "Failed to list archive audit entries");
      return reply.code(500).send({ error: err.message || "Failed to list audit log" });
    }
  });

  // 10. Aggregated statistics and cost metrics
  app.get("/v1/recording/archive/statistics", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const stats = await coordinator.getArchiveStatistics(tenantId);
      return reply.send({ data: stats });
    } catch (err: any) {
      request.log.error({ err }, "Failed to fetch archive statistics");
      return reply.code(500).send({ error: err.message || "Failed to fetch archive statistics" });
    }
  });
}
