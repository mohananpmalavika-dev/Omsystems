import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { pool } from "../database/pool.js";
import { getWebSocketService } from "../services/websocket-service.js";

export interface CameraAnnotationRecord {
  id: string;
  tenantId: string;
  cameraId: string;
  flagType: string;
  label: string;
  note: string;
  pinned: boolean;
  priority: string;
  authorId?: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
}

// In-memory fallback cache
const inMemoryAnnotations = new Map<string, CameraAnnotationRecord[]>();

const createAnnotationSchema = z.object({
  flagType: z.string().default("custom"),
  label: z.string().min(1).max(100),
  note: z.string().min(1).max(2000),
  pinned: z.boolean().default(true),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  authorName: z.string().optional(),
});

export async function registerCameraAnnotationRoutes(app: FastifyInstance) {
  // Ensure table exists
  if (pool) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS camera_annotations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR(100) NOT NULL,
          camera_id VARCHAR(100) NOT NULL,
          flag_type VARCHAR(50) NOT NULL DEFAULT 'custom',
          label VARCHAR(100) NOT NULL,
          note TEXT NOT NULL,
          pinned BOOLEAN NOT NULL DEFAULT true,
          priority VARCHAR(20) NOT NULL DEFAULT 'medium',
          author_id VARCHAR(100),
          author_name VARCHAR(100) NOT NULL DEFAULT 'Control Room Operator',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          resolved_at TIMESTAMPTZ,
          resolved_by VARCHAR(100)
        );
        CREATE INDEX IF NOT EXISTS idx_camera_annotations_cam ON camera_annotations (camera_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_camera_annotations_tenant ON camera_annotations (tenant_id);
      `);
    } catch (err: any) {
      app.log.warn({ err: err?.message }, "[CameraAnnotation] Table ensure check completed");
    }
  }

  const getTenantId = (req: FastifyRequest) => (req as any).currentUser?.tenantId || "default";
  const getUsername = (req: FastifyRequest) =>
    (req as any).currentUser?.username || (req as any).currentUser?.id || "Control Room Operator";

  /**
   * GET /api/v1/cameras/annotations/all
   * Returns all active pinned annotations across the entire facility
   */
  const handleGetAllAnnotations = async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = getTenantId(request);

    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM camera_annotations 
           WHERE tenant_id = $1 AND resolved_at IS NULL AND pinned = true 
           ORDER BY created_at DESC`,
          [tenantId]
        );
        const map: Record<string, CameraAnnotationRecord[]> = {};
        for (const row of rows) {
          const rec: CameraAnnotationRecord = {
            id: row.id,
            tenantId: row.tenant_id,
            cameraId: row.camera_id,
            flagType: row.flag_type,
            label: row.label,
            note: row.note,
            pinned: row.pinned,
            priority: row.priority,
            authorId: row.author_id,
            authorName: row.author_name,
            createdAt: new Date(row.created_at).toISOString(),
            updatedAt: new Date(row.updated_at).toISOString(),
            resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
            resolvedBy: row.resolved_by,
          };
          if (!map[rec.cameraId]) map[rec.cameraId] = [];
          map[rec.cameraId]!.push(rec);
        }
        return reply.code(200).send({ success: true, count: rows.length, annotations: map });
      } catch (err: any) {
        app.log.warn({ err: err?.message }, "[CameraAnnotation] DB query fallback to memory");
      }
    }

    const map: Record<string, CameraAnnotationRecord[]> = {};
    for (const [camId, items] of inMemoryAnnotations.entries()) {
      const active = items.filter((i) => i.tenantId === tenantId && !i.resolvedAt && i.pinned);
      if (active.length > 0) {
        map[camId] = active;
      }
    }
    return reply.code(200).send({ success: true, count: Object.keys(map).length, annotations: map });
  };

  app.get("/v1/cameras/annotations/all", handleGetAllAnnotations);
  app.get("/api/v1/cameras/annotations/all", handleGetAllAnnotations);

  /**
   * GET /api/v1/cameras/:cameraId/annotations
   * Returns active annotations for a single camera
   */
  const handleGetCameraAnnotations = async (request: FastifyRequest, reply: FastifyReply) => {
    const { cameraId } = z.object({ cameraId: z.string() }).parse(request.params);
    const tenantId = getTenantId(request);

    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM camera_annotations 
           WHERE camera_id = $1 AND tenant_id = $2 AND resolved_at IS NULL 
           ORDER BY created_at DESC`,
          [cameraId, tenantId]
        );
        const list: CameraAnnotationRecord[] = rows.map((row) => ({
          id: row.id,
          tenantId: row.tenant_id,
          cameraId: row.camera_id,
          flagType: row.flag_type,
          label: row.label,
          note: row.note,
          pinned: row.pinned,
          priority: row.priority,
          authorId: row.author_id,
          authorName: row.author_name,
          createdAt: new Date(row.created_at).toISOString(),
          updatedAt: new Date(row.updated_at).toISOString(),
          resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
          resolvedBy: row.resolved_by,
        }));
        return reply.code(200).send({ success: true, cameraId, count: list.length, annotations: list });
      } catch (err: any) {
        app.log.warn({ err: err?.message }, "[CameraAnnotation] DB query fallback");
      }
    }

    const items = (inMemoryAnnotations.get(cameraId) || []).filter(
      (i) => i.tenantId === tenantId && !i.resolvedAt
    );
    return reply.code(200).send({ success: true, cameraId, count: items.length, annotations: items });
  };

  app.get("/v1/cameras/:cameraId/annotations", handleGetCameraAnnotations);
  app.get("/api/v1/cameras/:cameraId/annotations", handleGetCameraAnnotations);

  /**
   * POST /api/v1/cameras/:cameraId/annotations
   * Adds an operator pinned annotation or note (e.g. "Guards dispatched to this door - 01:15 AM")
   */
  const handleCreateAnnotation = async (request: FastifyRequest, reply: FastifyReply) => {
    const { cameraId } = z.object({ cameraId: z.string() }).parse(request.params);
    const body = createAnnotationSchema.parse(request.body || {});
    const tenantId = getTenantId(request);
    const authorName = body.authorName || getUsername(request);
    const authorId = (request as any).currentUser?.id || "operator-1";
    const now = new Date();
    const id = randomUUID();

    const record: CameraAnnotationRecord = {
      id,
      tenantId,
      cameraId,
      flagType: body.flagType,
      label: body.label,
      note: body.note,
      pinned: body.pinned,
      priority: body.priority,
      authorId,
      authorName,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      resolvedAt: null,
      resolvedBy: null,
    };

    if (pool) {
      try {
        await pool.query(
          `INSERT INTO camera_annotations 
           (id, tenant_id, camera_id, flag_type, label, note, pinned, priority, author_id, author_name, created_at, updated_at) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
          [
            id,
            tenantId,
            cameraId,
            body.flagType,
            body.label,
            body.note,
            body.pinned,
            body.priority,
            authorId,
            authorName,
            now,
          ]
        );
      } catch (err: any) {
        app.log.warn({ err: err?.message }, "[CameraAnnotation] Insert fallback to memory");
      }
    }

    if (!inMemoryAnnotations.has(cameraId)) {
      inMemoryAnnotations.set(cameraId, []);
    }
    inMemoryAnnotations.get(cameraId)!.unshift(record);

    // Broadcast in real-time to all connected WebSocket clients across all shifts
    try {
      const ws = getWebSocketService();
      if (ws) {
        ws.broadcastCameraAnnotation(tenantId, {
          id: record.id,
          cameraId: record.cameraId,
          flagType: record.flagType,
          label: record.label,
          note: record.note,
          authorName: record.authorName,
          priority: record.priority,
          pinned: record.pinned,
          createdAt: record.createdAt,
          action: "create",
        });
      }
    } catch (wsErr) {
      app.log.warn({ wsErr }, "[CameraAnnotation] WebSocket broadcast notice");
    }

    return reply.code(201).send({ success: true, annotation: record });
  };

  app.post("/v1/cameras/:cameraId/annotations", handleCreateAnnotation);
  app.post("/api/v1/cameras/:cameraId/annotations", handleCreateAnnotation);

  /**
   * DELETE /api/v1/cameras/:cameraId/annotations/:annotationId
   * Resolves/removes an annotation pin
   */
  const handleDeleteAnnotation = async (request: FastifyRequest, reply: FastifyReply) => {
    const { cameraId, annotationId } = z.object({
      cameraId: z.string(),
      annotationId: z.string(),
    }).parse(request.params);
    const tenantId = getTenantId(request);
    const resolvedBy = getUsername(request);
    const now = new Date();

    if (pool) {
      try {
        await pool.query(
          `UPDATE camera_annotations 
           SET resolved_at = $1, resolved_by = $2, updated_at = $1 
           WHERE id = $3 AND tenant_id = $4`,
          [now, resolvedBy, annotationId, tenantId]
        );
      } catch (err: any) {
        app.log.warn({ err: err?.message }, "[CameraAnnotation] DB delete fallback");
      }
    }

    const items = inMemoryAnnotations.get(cameraId);
    if (items) {
      const target = items.find((i) => i.id === annotationId);
      if (target) {
        target.resolvedAt = now.toISOString();
        target.resolvedBy = resolvedBy;
      }
    }

    // Broadcast removal in real-time
    try {
      const ws = getWebSocketService();
      if (ws) {
        ws.broadcastCameraAnnotation(tenantId, {
          id: annotationId,
          cameraId,
          flagType: "custom",
          label: "Resolved",
          note: "Annotation resolved by operator",
          authorName: resolvedBy,
          pinned: false,
          createdAt: now.toISOString(),
          action: "resolve",
        });
      }
    } catch {}

    return reply.code(200).send({ success: true, message: "Annotation resolved" });
  };

  app.delete("/v1/cameras/:cameraId/annotations/:annotationId", handleDeleteAnnotation);
  app.delete("/api/v1/cameras/:cameraId/annotations/:annotationId", handleDeleteAnnotation);
}
