import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { randomUUID, randomBytes } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import { pool as defaultPool } from "../database/pool.js";
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

function inferRecordingCameras(items: Array<{ type: string; cameraId?: string; startTime?: string; endTime?: string }>): Array<{ cameraId: string; fromTime: string; toTime: string }> {
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
    if (!request.currentUser || !request.currentUser.tenantId) {
      return reply.code(401).send({ error: "unauthenticated" });
    }
    const body = evidenceCaseSchema.parse(request.body);

    try {
      const caseRecord = await store.createEvidenceCase({
        tenantId: request.currentUser.tenantId,
        caseNumber: body.caseNumber,
        title: body.title,
        description: body.description,
        createdBy: request.currentUser.id,
      });

      await store.recordCustodyEvent({
        evidenceId: caseRecord.id,
        action: "recording_created",
        performedBy: request.currentUser.id,
        sourceIp: request.ip,
        reason: `Evidence case created: ${body.caseNumber}`,
        tenantId: request.currentUser.tenantId,
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
    if (!request.currentUser || !request.currentUser.tenantId) {
      return reply.code(401).send({ error: "unauthenticated" });
    }
    const { caseId } = z.object({ caseId: z.string() }).parse(request.params);

    try {
      const caseRecord = await store.getEvidenceCase(caseId, request.currentUser.tenantId);
      if (!caseRecord || (caseRecord.tenantId && caseRecord.tenantId !== request.currentUser.tenantId && request.currentUser.role !== "super_admin")) {
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
    if (!request.currentUser || !request.currentUser.tenantId) {
      return reply.code(401).send({ error: "unauthenticated" });
    }
    const query = z.object({
      status: z.enum(["open", "investigating", "closed", "archived"]).optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }).parse(request.query);

    try {
      const cases = await store.listEvidenceCases(request.currentUser.tenantId, {
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
    if (!request.currentUser || !request.currentUser.tenantId) {
      return reply.code(401).send({ error: "unauthenticated" });
    }
    const { caseId } = z.object({ caseId: z.string() }).parse(request.params);
    const body = evidenceItemSchema.parse(request.body);

    const caseRecord = await store.getEvidenceCase(caseId, request.currentUser.tenantId);
    if (!caseRecord || (caseRecord.tenantId && caseRecord.tenantId !== request.currentUser.tenantId && request.currentUser.role !== "super_admin")) {
      return reply.code(404).send({ error: "case_not_found" });
    }

    if (body.cameraId) {
      const camera = await store.getCamera(body.cameraId);
      if (!camera || (camera.tenantId && camera.tenantId !== request.currentUser.tenantId && request.currentUser.role !== "super_admin")) {
        return reply.code(404).send({ error: "camera_not_found", message: "Camera not found or tenant unauthorized" });
      }
    }

    try {
      const item = await store.addEvidenceItem(caseId, {
        type: body.type,
        cameraId: body.cameraId,
        startTime: body.startTime,
        endTime: body.endTime,
        description: body.description,
        addedBy: request.currentUser.id,
        hash: body.hash,
        fileSize: body.fileSize,
      }, request.currentUser.tenantId);

      await store.recordCustodyEvent({
        evidenceId: caseId,
        action: "added_to_case",
        performedBy: request.currentUser.id,
        sourceIp: request.ip,
        reason: body.description,
        tenantId: request.currentUser.tenantId,
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
    if (!request.currentUser || !request.currentUser.tenantId) {
      return reply.code(401).send({ error: "unauthenticated" });
    }
    const { caseId } = z.object({ caseId: z.string() }).parse(request.params);

    const caseRecord = await store.getEvidenceCase(caseId, request.currentUser.tenantId);
    if (!caseRecord || (caseRecord.tenantId && caseRecord.tenantId !== request.currentUser.tenantId && request.currentUser.role !== "super_admin")) {
      return reply.code(404).send({ error: "case_not_found" });
    }

    try {
      const items = await store.listEvidenceItems(caseId, request.currentUser.tenantId);
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
    if (!request.currentUser || !request.currentUser.tenantId) {
      return reply.code(401).send({ error: "unauthenticated" });
    }
    const { caseId } = z.object({ caseId: z.string().uuid() }).parse(request.params);
    const body = exportRequestSchema.parse(request.body);

    if (!exportWorker) {
      return reply.code(501).send({ error: "export_worker_not_enabled" });
    }

    const caseRecord = await store.getEvidenceCase(caseId, request.currentUser.tenantId);
    if (!caseRecord || (caseRecord.tenantId && caseRecord.tenantId !== request.currentUser.tenantId && request.currentUser.role !== "super_admin")) {
      return reply.code(404).send({ error: "case_not_found" });
    }

    const items = await store.listEvidenceItems(caseId, request.currentUser.tenantId);
    const cameras = inferRecordingCameras(items);
    if (cameras.length === 0) {
      return reply.code(400).send({ error: "no_recording_items", message: "No recording items found for this case." });
    }

    // Defense-in-depth: Verify all referenced cameras belong to request.currentUser.tenantId
    for (const cam of cameras) {
      const camera = await store.getCamera(cam.cameraId);
      if (!camera || (camera.tenantId && camera.tenantId !== request.currentUser.tenantId && request.currentUser.role !== "super_admin")) {
        return reply.code(404).send({
          error: "camera_not_found",
          message: `Camera ${cam.cameraId} not found or tenant unauthorized`,
        });
      }
    }

    let accessNodeId = caseRecord.id;
    const recordingItem = items.find((item) => item.cameraId);
    if (recordingItem?.cameraId) {
      const camera = await store.getCamera(recordingItem.cameraId);
      if (camera) accessNodeId = camera.nodeId;
    }

    if (!(await hasAccess(request, reply, store, "evidence:export", accessNodeId))) {
      return;
    }

    try {
      const exportType = body.format === "original"
        ? "original"
        : body.format === "mp4"
          ? "viewing-copy"
          : "investigation-package";

      const exportJob = await exportWorker.createExportJob({
        caseId,
        tenantId: request.currentUser.tenantId,
        exportType,
        format: body.format,
        cameras,
        options: {},
        requestedBy: request.currentUser.id,
        reason: body.reason,
        priority: 100,
      });

      await store.recordCustodyEvent({
        evidenceId: caseId,
        action: "export_requested",
        performedBy: request.currentUser.id,
        sourceIp: request.ip,
        reason: body.reason,
        tenantId: request.currentUser.tenantId,
      });

      return reply.code(201).send(exportJob);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "export_request_failed", details: message });
    }
  });

  /**
   * List evidence export jobs for a case
   * GET /v1/evidence/cases/:caseId/exports
   */
  app.get("/v1/evidence/cases/:caseId/exports", async (request, reply) => {
    if (!request.currentUser || !request.currentUser.tenantId) {
      return reply.code(401).send({ error: "unauthenticated" });
    }
    const { caseId } = z.object({ caseId: z.string().uuid() }).parse(request.params);

    if (!exportWorker) {
      return reply.code(501).send({ error: "export_worker_not_enabled" });
    }

    const caseRecord = await store.getEvidenceCase(caseId, request.currentUser.tenantId);
    if (!caseRecord || (caseRecord.tenantId && caseRecord.tenantId !== request.currentUser.tenantId && request.currentUser.role !== "super_admin")) {
      return reply.code(404).send({ error: "case_not_found" });
    }

    if (!(await hasAccess(request, reply, store, "evidence:export", caseRecord.id))) {
      return;
    }

    try {
      const jobs = await exportWorker.listExportJobs(caseId, { limit: 50 });
      return { data: jobs };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "export_list_failed", details: message });
    }
  });

  /**
   * Get export status
   * GET /v1/evidence/exports/:exportId
   */
  app.get("/v1/evidence/exports/:exportId", async (request, reply) => {
    if (!request.currentUser || !request.currentUser.tenantId) {
      return reply.code(401).send({ error: "unauthenticated" });
    }
    const { exportId } = z.object({ exportId: z.string() }).parse(request.params);

    try {
      const exportRecord = await store.getEvidenceExport(exportId, request.currentUser.tenantId);
      if (!exportRecord || (exportRecord.tenantId && exportRecord.tenantId !== request.currentUser.tenantId && request.currentUser.role !== "super_admin")) {
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
    if (!request.currentUser || !request.currentUser.tenantId) {
      return reply.code(401).send({ error: "unauthenticated" });
    }
    const { caseId } = z.object({ caseId: z.string() }).parse(request.params);

    const caseRecord = await store.getEvidenceCase(caseId, request.currentUser.tenantId);
    if (!caseRecord || (caseRecord.tenantId && caseRecord.tenantId !== request.currentUser.tenantId && request.currentUser.role !== "super_admin")) {
      return reply.code(404).send({ error: "case_not_found" });
    }

    try {
      const custody = await store.getCustodyLog(caseId, request.currentUser.tenantId);
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
    if (!request.currentUser || !request.currentUser.tenantId) {
      return reply.code(401).send({ error: "unauthenticated" });
    }
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
        requestedBy: request.currentUser.id,
        cameraIds: body.cameraIds,
        startTime: body.startTime,
        endTime: body.endTime,
        reviewDate: body.reviewDate,
        expiryDate: body.expiryDate,
        tenantId: request.currentUser.tenantId,
      });

      await store.recordCustodyEvent({
        action: "legal_hold_applied",
        performedBy: request.currentUser.id,
        sourceIp: request.ip,
        reason: body.reason,
        tenantId: request.currentUser.tenantId,
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
    if (!request.currentUser || !request.currentUser.tenantId) {
      return reply.code(401).send({ error: "unauthenticated" });
    }
    const { holdId } = z.object({ holdId: z.string() }).parse(request.params);
    const body = z.object({ reason: z.string().trim().max(500).optional() }).parse(request.body);

    try {
      const released = await store.releaseLegalHold(holdId, request.currentUser.id, request.currentUser.tenantId, body.reason);
      if (!released) {
        return reply.code(404).send({ error: "hold_not_found" });
      }

      await store.recordCustodyEvent({
        action: "hold_released",
        performedBy: request.currentUser.id,
        sourceIp: request.ip,
        reason: body.reason,
        tenantId: request.currentUser.tenantId,
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
    if (!request.currentUser || !request.currentUser.tenantId) {
      return reply.code(401).send({ error: "unauthenticated" });
    }
    const { caseId } = z.object({ caseId: z.string() }).parse(request.params);

    try {
      const caseRecord = await store.getEvidenceCase(caseId, request.currentUser.tenantId);
      if (!caseRecord || (caseRecord.tenantId && caseRecord.tenantId !== request.currentUser.tenantId && request.currentUser.role !== "super_admin")) {
        return reply.code(404).send({ error: "case_not_found" });
      }

      const items = await store.listEvidenceItems(caseId, request.currentUser.tenantId);
      const recordingItems = items.filter((item) => item.type === "recording" && item.recordingSegmentId);
      const verifications = await Promise.all(
        recordingItems.map((item) => store.verifyRecordingSegment(item.recordingSegmentId!)),
      );

      await store.recordCustodyEvent({
        evidenceId: caseId,
        action: "verified",
        performedBy: request.currentUser.id,
        sourceIp: request.ip,
        tenantId: request.currentUser.tenantId,
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

    if (!request.currentUser || !request.currentUser.tenantId) {
      return reply.code(401).send({ error: "unauthenticated" });
    }

    if (!exportWorker) {
      return reply.code(501).send({ error: "export_worker_not_enabled" });
    }

    try {
      const caseRecord = await store.getEvidenceCase(body.caseId, request.currentUser.tenantId);
      if (!caseRecord || (caseRecord.tenantId && caseRecord.tenantId !== request.currentUser.tenantId && request.currentUser.role !== "super_admin")) {
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
        cameras: body.cameras as Array<{ cameraId: string; fromTime: string; toTime: string }>,
        options: body.options ?? {},
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
    if (!request.currentUser || !request.currentUser.tenantId) {
      return reply.code(401).send({ error: "unauthenticated" });
    }
    const { exportId } = z.object({ exportId: z.string().uuid() }).parse(request.params);

    try {
      if (exportWorker) {
        const job = await exportWorker.getExportJob(exportId);
        if (job) {
          if (job.tenantId && job.tenantId !== request.currentUser.tenantId && request.currentUser.role !== "super_admin") {
            return reply.code(404).send({ error: "export_not_found" });
          }

          const progress = job.totalSegments
            ? Math.min(100, Math.round((job.processedSegments / job.totalSegments) * 100))
            : job.status === "ready"
              ? 100
              : 0;

          const downloadUrl = job.downloadToken
            ? `/v1/evidence/exports/${job.id}/download?token=${job.downloadToken}`
            : undefined;

          return {
            id: job.id,
            status: job.status,
            progress,
            downloadUrl,
          };
        }
      }

      const exportRecord = await store.getEvidenceExport(exportId, request.currentUser.tenantId);
      if (!exportRecord || (exportRecord.tenantId && exportRecord.tenantId !== request.currentUser.tenantId && request.currentUser.role !== "super_admin")) {
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
   * Enforces P0.24, P0.26:
   * Authenticated session + valid download token + tenant match + permission check + audit of successes and failures
   */
  app.get("/v1/evidence/exports/:exportId/download", async (request, reply) => {
    const { exportId } = z.object({ exportId: z.string().uuid() }).parse(request.params);
    const query = z.object({ token: z.string().optional() }).parse(request.query);

    if (!exportWorker) {
      return reply.code(501).send({ error: "export_worker_not_enabled" });
    }

    const currentUser = request.currentUser;
    if (!currentUser || !currentUser.tenantId) {
      try {
        await store.recordCustodyEvent({
          evidenceId: exportId,
          action: "export_download_rejected" as any,
          performedBy: "unauthenticated",
          sourceIp: request.ip,
          reason: "Unauthenticated download request rejected",
        });
      } catch {}
      return reply.code(401).send({ error: "unauthenticated" });
    }

    if (!query.token) {
      try {
        await store.recordCustodyEvent({
          evidenceId: exportId,
          action: "export_download_rejected" as any,
          performedBy: currentUser.id,
          sourceIp: request.ip,
          reason: "Missing download token",
          tenantId: currentUser.tenantId,
        });
      } catch {}
      return reply.code(400).send({ error: "missing_download_token" });
    }

    try {
      const validation = await exportWorker.validateDownload(query.token);
      if (!validation.valid || !validation.job || validation.job.id !== exportId) {
        try {
          await store.recordCustodyEvent({
            evidenceId: exportId,
            action: "export_download_rejected" as any,
            performedBy: currentUser.id,
            sourceIp: request.ip,
            reason: `Invalid download token: ${validation.reason || "mismatch"}`,
            tenantId: currentUser.tenantId,
          });
        } catch {}
        return reply.code(403).send({ error: "invalid_download_token", reason: validation.reason });
      }

      // Tenant match check (P0-19: Must return 404 to prevent enumeration)
      if (validation.job.tenantId && validation.job.tenantId !== currentUser.tenantId && currentUser.role !== "super_admin") {
        try {
          await store.recordCustodyEvent({
            evidenceId: exportId,
            action: "export_download_rejected" as any,
            performedBy: currentUser.id,
            sourceIp: request.ip,
            reason: `Tenant mismatch: expected ${validation.job.tenantId}, user belongs to ${currentUser.tenantId}`,
            tenantId: currentUser.tenantId,
          });
        } catch {}
        return reply.code(404).send({ error: "export_not_found" });
      }

      // Permission check (P0.24)
      const allowedRoles = ["super_admin", "admin", "investigator", "cso"];
      const userPermissions: string[] = (currentUser as any).permissions || [];
      const hasPerm =
        Boolean(currentUser.role && allowedRoles.includes(currentUser.role)) ||
        userPermissions.includes("evidence:download") ||
        userPermissions.includes("evidence:export") ||
        userPermissions.includes("evidence.download");

      if (!hasPerm) {
        try {
          await store.recordCustodyEvent({
            evidenceId: exportId,
            action: "export_download_rejected" as any,
            performedBy: currentUser.id,
            sourceIp: request.ip,
            reason: "Insufficient permissions for evidence download",
            tenantId: currentUser.tenantId,
          });
        } catch {}
        return reply.code(403).send({ error: "access_denied", reason: "Insufficient evidence download permissions" });
      }

      const filePath = validation.job.outputPath;
      if (filePath && existsSync(filePath)) {
        const stats = statSync(filePath);
        // Record custody event before sending bytes (durability is part of operation)
        await store.recordCustodyEvent({
          evidenceId: exportId,
          action: "export_downloaded",
          performedBy: currentUser.id,
          sourceIp: request.ip,
          reason: `Authorized download of evidence package ${exportId} (${stats.size} bytes) via ${request.headers["user-agent"] ?? "client"}`,
          tenantId: currentUser.tenantId,
        });

        const filename = basename(filePath);
        const ext = extname(filename).toLowerCase();
        const mimeType = ext === ".mp4" ? "video/mp4" : ext === ".zip" ? "application/zip" : ext === ".tar" ? "application/x-tar" : ext === ".json" ? "application/json" : "application/octet-stream";
        reply.header("Content-Type", mimeType);
        reply.header("Content-Disposition", `attachment; filename="${filename}"`);
        reply.header("Content-Length", stats.size);
        return reply.send(createReadStream(filePath));
      }

      return reply.code(404).send({ error: "evidence_media_not_found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "download_failed", details: message });
    }
  });

  /**
   * P0.25 External Evidence Sharing
   * POST /v1/evidence/shares - Create a time-limited, audited external share
   */
  app.post("/v1/evidence/shares", async (request, reply) => {
    const currentUser = request.currentUser;
    if (!currentUser || !currentUser.tenantId) return reply.code(401).send({ error: "unauthenticated" });

    const body = z.object({
      exportId: z.string().uuid(),
      recipientEmail: z.string().email(),
      reason: z.string().min(5),
      scope: z.enum(["VIEW_ONLY", "DOWNLOAD"]).default("VIEW_ONLY"),
      maxDownloads: z.number().int().min(1).max(10).default(3),
      expiresInHours: z.number().int().min(1).max(168).default(24),
    }).parse(request.body);

    const shareId = randomUUID();
    const shareToken = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + body.expiresInHours * 3600_000);

    const pool = (store as any).pool || defaultPool;
    if (pool) {
      await pool.query(
        `INSERT INTO external_evidence_shares (
           id, tenant_id, export_id, share_token, recipient_email, reason,
           scope, max_downloads, download_count, expires_at, created_by, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, now())`,
        [
          shareId,
          currentUser.tenantId,
          body.exportId,
          shareToken,
          body.recipientEmail,
          body.reason,
          body.scope,
          body.maxDownloads,
          expiresAt,
          currentUser.id,
        ],
      );
    }

    await store.recordCustodyEvent({
      evidenceId: body.exportId,
      action: "export_shared" as any,
      performedBy: currentUser.id,
      sourceIp: request.ip,
      reason: `External share created for ${body.recipientEmail} (expires in ${body.expiresInHours}h, max ${body.maxDownloads} downloads)`,
      tenantId: currentUser.tenantId,
    });

    return reply.code(201).send({
      shareId,
      shareToken,
      recipientEmail: body.recipientEmail,
      expiresAt: expiresAt.toISOString(),
      maxDownloads: body.maxDownloads,
      shareUrl: `/v1/evidence/external-download?token=${shareToken}`,
    });
  });

  /**
   * P0.25 External Download via Share Token
   * GET /v1/evidence/external-download
   */
  app.get("/v1/evidence/external-download", async (request, reply) => {
    const query = z.object({ token: z.string().min(16) }).parse(request.query);
    const pool = (store as any).pool || defaultPool;
    if (!pool) return reply.code(501).send({ error: "database_not_configured" });

    const res = await pool.query(
      `SELECT * FROM external_evidence_shares WHERE share_token = $1`,
      [query.token],
    );

    if (res.rows.length === 0) {
      return reply.code(404).send({ error: "share_not_found" });
    }

    const share = res.rows[0];
    if (share.revoked_at) {
      return reply.code(403).send({ error: "share_revoked" });
    }

    if (new Date(share.expires_at).getTime() < Date.now()) {
      return reply.code(403).send({ error: "share_expired" });
    }

    if (share.download_count >= share.max_downloads) {
      return reply.code(403).send({ error: "download_limit_exceeded" });
    }

    await pool.query(
      `UPDATE external_evidence_shares SET download_count = download_count + 1 WHERE id = $1`,
      [share.id],
    );

    await store.recordCustodyEvent({
      evidenceId: share.export_id,
      action: "export_downloaded",
      performedBy: `external:${share.recipient_email}`,
      sourceIp: request.ip,
      reason: `External share download (${share.download_count + 1}/${share.max_downloads})`,
    });

    if (exportWorker) {
      const job = await exportWorker.getExportJob(share.export_id);
      if (job?.outputPath && existsSync(job.outputPath)) {
        const stats = statSync(job.outputPath);
        const filename = basename(job.outputPath);
        reply.header("Content-Disposition", `attachment; filename="${filename}"`);
        reply.header("Content-Length", stats.size);
        return reply.send(createReadStream(job.outputPath));
      }
    }

    return reply.code(404).send({ error: "evidence_media_not_found" });
  });

  /**
   * Get export manifest
   * GET /v1/evidence/exports/:exportId/manifest
   */
  app.get("/v1/evidence/exports/:exportId/manifest", async (request, reply) => {
    if (!request.currentUser || !request.currentUser.tenantId) {
      return reply.code(401).send({ error: "unauthenticated" });
    }
    const { exportId } = z.object({ exportId: z.string().uuid() }).parse(request.params);

    try {
      let manifestId: string | undefined;

      if (exportWorker) {
        const job = await exportWorker.getExportJob(exportId);
        if (job) {
          if (job.tenantId && job.tenantId !== request.currentUser.tenantId && request.currentUser.role !== "super_admin") {
            return reply.code(404).send({ error: "export_not_found" });
          }
          manifestId = job.manifestId;
        }
      }

      if (!manifestId) {
        const exportRecord = await store.getEvidenceExport(exportId, request.currentUser.tenantId);
        if (exportRecord) {
          if (exportRecord.tenantId && exportRecord.tenantId !== request.currentUser.tenantId && request.currentUser.role !== "super_admin") {
            return reply.code(404).send({ error: "export_not_found" });
          }
          manifestId = exportRecord.manifestId;
        }
      }

      if (!manifestId) {
        return reply.code(404).send({ error: "manifest_not_found" });
      }

      const manifest = await store.getEvidenceManifest(manifestId, request.currentUser.tenantId);
      if (!manifest || (manifest.tenantId && manifest.tenantId !== request.currentUser.tenantId && request.currentUser.role !== "super_admin")) {
        return reply.code(404).send({ error: "manifest_not_found" });
      }

      return manifest;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "manifest_fetch_failed", details: message });
    }
  });
}
