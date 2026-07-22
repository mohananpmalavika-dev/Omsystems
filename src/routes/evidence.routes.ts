import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import type { ExportWorker } from "../recording/export-worker.js";

const evidenceCaseSchema = z.object({
  caseNumber: z.string().trim().min(2).max(50),
  title: z.string().trim().min(5).max(200),
  description: z.string().trim().max(2000).optional(),
});

const evidenceItemSchema = z.object({
  type: z.enum(["recording", "snapshot", "exported-video", "manifest", "document"]),
  cameraId: z.string().uuid().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  description: z.string().trim().max(1000),
  hash: z.string().optional(),
  fileSize: z.number().int().min(0).optional(),
});

const exportRequestSchema = z.object({
  format: z.enum(["original", "mp4", "manifest-only"]),
  reason: z.string().trim().min(5).max(500),
});

const legalHoldSchema = z.object({
  caseNumber: z.string().trim().min(2).max(50),
  reason: z.string().trim().max(500),
  cameraIds: z.array(z.string().uuid()).min(1),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  reviewDate: z.string().datetime().optional(),
  expiryDate: z.string().datetime().optional(),
});

async function hasAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  action: "recording:view" | "evidence:export" | "evidence:create",
  nodeId: string,
): Promise<boolean> {
  if (!request.currentUser) {
    await reply.code(401).send({ error: "unauthenticated" });
    return false;
  }

  const decision = await store.checkAccess(
    request.currentUser,
    action,
    nodeId,
  );

  if (!decision || !decision.allowed) {
    await reply.code(403).send({ error: "access_denied" });
    return false;
  }

  return true;
}

function inferRecordingCameras(items: Array<{ type: string; cameraId?: string; startTime?: string; endTime?: string }>) {
  const cameras = new Map<string, { cameraId: string; fromTime: string; toTime: string }>();

  for (const item of items) {
    if (item.type !== "recording" || !item.cameraId || !item.startTime || !item.endTime) {
      continue;
    }

    const existing = cameras.get(item.cameraId);
    if (!existing) {
      cameras.set(item.cameraId, {
        cameraId: item.cameraId,
        fromTime: item.startTime,
        toTime: item.endTime,
      });
      continue;
    }

    if (item.startTime < existing.fromTime) {
      existing.fromTime = item.startTime;
    }
    if (item.endTime > existing.toTime) {
      existing.toTime = item.endTime;
    }
  }

  return Array.from(cameras.values());
}

/**
 * Register evidence management routes
 */
export async function registerEvidenceRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  exportWorker?: ExportWorker,
) {
  /**
   * Create evidence case
   * POST /v1/evidence/cases
   */
  app.post("/v1/evidence/cases", async (request, reply) => {
    const body = evidenceCaseSchema.parse(request.body);

    try {
      const caseRecord = await store.createEvidenceCase({
        tenantId: request.currentUser?.tenantId ?? "",
        caseNumber: body.caseNumber,
        title: body.title,
        description: body.description,
        createdBy: request.currentUser?.id ?? "unknown",
      });

      await store.recordCustodyEvent({
        evidenceId: caseRecord.id,
        action: "recording_created",
        performedBy: request.currentUser?.id ?? "system",
        sourceIp: request.ip,
        reason: `Evidence case created: ${body.caseNumber}`,
      });

      return caseRecord;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "case_creation_failed", details: message });
    }
  });

  /**
   * Get evidence case
   * GET /v1/evidence/cases/:caseId
   */
  app.get("/v1/evidence/cases/:caseId", async (request, reply) => {
    const { caseId } = z.object({ caseId: z.string() }).parse(request.params);

    try {
      const caseRecord = await store.getEvidenceCase(caseId);
      if (!caseRecord) {
        return reply.code(404).send({ error: "case_not_found" });
      }

      return caseRecord;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "case_fetch_failed", details: message });
    }
  });

  /**
   * List evidence cases
   * GET /v1/evidence/cases
   */
  app.get("/v1/evidence/cases", async (request, reply) => {
    const query = z.object({
      status: z.enum(["open", "investigating", "closed", "archived"]).optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }).parse(request.query);

    try {
      const cases = await store.listEvidenceCases(request.currentUser?.tenantId ?? "", {
        status: query.status,
        limit: query.limit,
      });

      return { data: cases };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "cases_fetch_failed", details: message });
    }
  });

  /**
   * Add item to evidence case
   * POST /v1/evidence/cases/:caseId/items
   */
  app.post("/v1/evidence/cases/:caseId/items", async (request, reply) => {
    const { caseId } = z.object({ caseId: z.string() }).parse(request.params);
    const body = evidenceItemSchema.parse(request.body);

    const caseRecord = await store.getEvidenceCase(caseId);
    if (!caseRecord) {
      return reply.code(404).send({ error: "case_not_found" });
    }

    try {
      const item = await store.addEvidenceItem(caseId, {
        type: body.type,
        cameraId: body.cameraId,
        startTime: body.startTime,
        endTime: body.endTime,
        description: body.description,
        addedBy: request.currentUser?.id ?? "unknown",
        hash: body.hash,
        fileSize: body.fileSize,
      });

      await store.recordCustodyEvent({
        evidenceId: caseId,
        action: "added_to_case",
        performedBy: request.currentUser?.id ?? "system",
        sourceIp: request.ip,
        reason: body.description,
      });

      return item;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "item_add_failed", details: message });
    }
  });

  /**
   * List items in evidence case
   * GET /v1/evidence/cases/:caseId/items
   */
  app.get("/v1/evidence/cases/:caseId/items", async (request, reply) => {
    const { caseId } = z.object({ caseId: z.string() }).parse(request.params);

    const caseRecord = await store.getEvidenceCase(caseId);
    if (!caseRecord) {
      return reply.code(404).send({ error: "case_not_found" });
    }

    try {
      const items = await store.listEvidenceItems(caseId);
      return { data: items };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "items_fetch_failed", details: message });
    }
  });

  /**
   * Request evidence export
   * POST /v1/evidence/cases/:caseId/exports
   */
  app.post("/v1/evidence/cases/:caseId/exports", async (request, reply) => {
    const { caseId } = z.object({ caseId: z.string() }).parse(request.params);
    const body = exportRequestSchema.parse(request.body);

    const caseRecord = await store.getEvidenceCase(caseId);
    if (!caseRecord) {
      return reply.code(404).send({ error: "case_not_found" });
    }

    try {
      const exportRequest = await store.requestEvidenceExport(caseId, {
        format: body.format,
        reason: body.reason,
        exportedBy: request.currentUser?.id ?? "unknown",
      });

      await store.recordCustodyEvent({
        evidenceId: caseId,
        action: "exported",
        performedBy: request.currentUser?.id ?? "system",
        sourceIp: request.ip,
        reason: body.reason,
      });

      return exportRequest;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "export_request_failed", details: message });
    }
  });

  /**
   * Get export status
   * GET /v1/evidence/exports/:exportId
   */
  app.get("/v1/evidence/exports/:exportId", async (request, reply) => {
    const { exportId } = z.object({ exportId: z.string() }).parse(request.params);

    try {
      const exportRecord = await store.getEvidenceExport(exportId);
      if (!exportRecord) {
        return reply.code(404).send({ error: "export_not_found" });
      }

      return exportRecord;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "export_fetch_failed", details: message });
    }
  });

  /**
   * Get chain of custody
   * GET /v1/evidence/cases/:caseId/chain-of-custody
   */
  app.get("/v1/evidence/cases/:caseId/chain-of-custody", async (request, reply) => {
    const { caseId } = z.object({ caseId: z.string() }).parse(request.params);

    const caseRecord = await store.getEvidenceCase(caseId);
    if (!caseRecord) {
      return reply.code(404).send({ error: "case_not_found" });
    }

    try {
      const custody = await store.getCustodyLog(caseId);
      return { data: custody };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "custody_fetch_failed", details: message });
    }
  });

  /**
   * Create legal hold
   * POST /v1/evidence/legal-holds
   */
  app.post("/v1/evidence/legal-holds", async (request, reply) => {
    const body = legalHoldSchema.parse(request.body);

    // Check access to at least one camera's branch
    const firstCamera = await store.getCamera(body.cameraIds[0]!);
    if (!firstCamera) {
      return reply.code(404).send({ error: "camera_not_found" });
    }

    if (!(await hasAccess(request, reply, store, "evidence:create", firstCamera.nodeId))) {
      return;
    }

    try {
      const hold = await store.createLegalHold({
        caseNumber: body.caseNumber,
        reason: body.reason,
        requestedBy: request.currentUser?.id ?? "unknown",
        cameraIds: body.cameraIds,
        startTime: body.startTime,
        endTime: body.endTime,
        reviewDate: body.reviewDate,
        expiryDate: body.expiryDate,
      });

      await store.recordCustodyEvent({
        action: "legal_hold_applied",
        performedBy: request.currentUser?.id ?? "system",
        sourceIp: request.ip,
        reason: body.reason,
      });

      return hold;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "legal_hold_failed", details: message });
    }
  });

  /**
   * Release legal hold
   * POST /v1/evidence/legal-holds/:holdId/release
   */
  app.post("/v1/evidence/legal-holds/:holdId/release", async (request, reply) => {
    const { holdId } = z.object({ holdId: z.string() }).parse(request.params);
    const body = z.object({ reason: z.string().trim().max(500).optional() }).parse(request.body);

    try {
      const released = await store.releaseLegalHold(holdId, request.currentUser?.id ?? "unknown");
      if (!released) {
        return reply.code(404).send({ error: "hold_not_found" });
      }

      await store.recordCustodyEvent({
        action: "hold_released",
        performedBy: request.currentUser?.id ?? "system",
        sourceIp: request.ip,
        reason: body.reason,
      });

      return released;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "hold_release_failed", details: message });
    }
  });

  /**
   * Verify evidence integrity
   * POST /v1/evidence/verify/:caseId
   */
  app.post("/v1/evidence/verify/:caseId", async (request, reply) => {
    const { caseId } = z.object({ caseId: z.string() }).parse(request.params);

    try {
      const caseRecord = await store.getEvidenceCase(caseId);
      if (!caseRecord) {
        return reply.code(404).send({ error: "case_not_found" });
      }

      const items = await store.listEvidenceItems(caseId);
      const verifications = await Promise.all(
        items
          .filter((item) => item.type === "recording" && item.hash)
          .map((item) => store.verifyRecordingSegment(item.hash!)),
      );

      await store.recordCustodyEvent({
        evidenceId: caseId,
        action: "verified",
        performedBy: request.currentUser?.id ?? "system",
        sourceIp: request.ip,
      });

      return {
        caseId,
        verifications,
        allVerified: verifications.every((v) => v.status === "verified"),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "verification_failed", details: message });
    }
  });

  /**
   * Request forensic export
   * POST /v1/evidence/exports
   */
  app.post("/v1/evidence/exports", async (request, reply) => {
    const body = z.object({
      caseId: z.string().uuid(),
      exportType: z.enum(["original", "viewing-copy", "multi-camera", "investigation-package"]),
      format: z.enum(["original", "mp4", "mkv", "manifest-only"]),
      cameras: z.array(z.object({
        cameraId: z.string().uuid(),
        fromTime: z.string().datetime(),
        toTime: z.string().datetime(),
      })).min(1),
      options: z.object({
        watermark: z.boolean().optional(),
        timestampOverlay: z.boolean().optional(),
        audioIncluded: z.boolean().optional(),
        password: z.string().trim().min(8).max(64).optional(),
        quality: z.enum(["original", "high", "medium"]).optional(),
      }).optional(),
      reason: z.string().trim().min(5).max(1000),
      priority: z.number().int().min(1).max(1000).optional(),
    }).parse(request.body);

    if (!request.currentUser) {
      return reply.code(401).send({ error: "unauthenticated" });
    }

    if (!exportWorker) {
      return reply.code(501).send({ error: "export_worker_not_enabled" });
    }

    try {
      const caseRecord = await store.getEvidenceCase(body.caseId);
      if (!caseRecord) {
        return reply.code(404).send({ error: "case_not_found" });
      }

      if (!(await hasAccess(request, reply, store, "evidence:export", caseRecord.id))) {
        return;
      }

      const exportJob = await exportWorker.createExportJob({
        caseId: body.caseId,
        tenantId: request.currentUser.tenantId,
        exportType: body.exportType,
        format: body.format,
        cameras: body.cameras,
        options: body.options,
        requestedBy: request.currentUser.id,
        reason: body.reason,
        priority: body.priority,
      });

      return reply.code(201).send(exportJob);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "export_request_failed", details: message });
    }
  });

  /**
   * Get export job status
   * GET /v1/evidence/exports/:exportId/status
   */
  app.get("/v1/evidence/exports/:exportId/status", async (request, reply) => {
    const { exportId } = z.object({ exportId: z.string().uuid() }).parse(request.params);

    try {
      if (exportWorker) {
        const job = await exportWorker.getExportJob(exportId);
        if (job) {
          const progress = job.totalSegments
            ? Math.min(100, Math.round((job.processedSegments / job.totalSegments) * 100))
            : job.status === "ready"
              ? 100
              : 0;

          return {
            id: job.id,
            status: job.status,
            progress,
            downloadUrl: job.outputPath,
          };
        }
      }

      const exportRecord = await store.getEvidenceExport(exportId);
      if (!exportRecord) {
        return reply.code(404).send({ error: "export_not_found" });
      }

      return {
        id: exportRecord.id,
        status: exportRecord.status,
        progress: exportRecord.status === "ready" ? 100 : 0,
        downloadUrl: exportRecord.downloadUrl,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "export_status_failed", details: message });
    }
  });

  /**
   * Download export
   * GET /v1/evidence/exports/:exportId/download
   */
  app.get("/v1/evidence/exports/:exportId/download", async (request, reply) => {
    const { exportId } = z.object({ exportId: z.string().uuid() }).parse(request.params);
    const query = z.object({ token: z.string().optional() }).parse(request.query);

    if (!exportWorker) {
      return reply.code(501).send({ error: "export_worker_not_enabled" });
    }

    if (!query.token) {
      return reply.code(400).send({ error: "missing_download_token" });
    }

    try {
      const validation = await exportWorker.validateDownload(query.token);
      if (!validation.valid || !validation.job || validation.job.id !== exportId) {
        return reply.code(403).send({ error: "invalid_download_token" });
      }

      await store.recordCustodyEvent({
        evidenceId: exportId,
        action: "export_downloaded",
        performedBy: request.currentUser?.id ?? "system",
        sourceIp: request.ip,
        reason: "Export download requested",
      });

      return {
        id: validation.job.id,
        status: validation.job.status,
        outputPath: validation.job.outputPath,
        downloadToken: query.token,
        downloadExpiresAt: validation.job.downloadExpiresAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "download_failed", details: message });
    }
  });

  /**
   * Get export manifest
   * GET /v1/evidence/exports/:exportId/manifest
   */
  app.get("/v1/evidence/exports/:exportId/manifest", async (request, reply) => {
    const { exportId } = z.object({ exportId: z.string().uuid() }).parse(request.params);

    try {
      let manifestId: string | undefined;

      if (exportWorker) {
        const job = await exportWorker.getExportJob(exportId);
        manifestId = job?.manifestId;
      }

      if (!manifestId) {
        const exportRecord = await store.getEvidenceExport(exportId);
        manifestId = exportRecord?.manifestId;
      }

      if (!manifestId) {
        return reply.code(404).send({ error: "manifest_not_found" });
      }

      const manifest = await store.getEvidenceManifest(manifestId);
      if (!manifest) {
        return reply.code(404).send({ error: "manifest_not_found" });
      }

      return manifest;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "manifest_fetch_failed", details: message });
    }
  });
}
