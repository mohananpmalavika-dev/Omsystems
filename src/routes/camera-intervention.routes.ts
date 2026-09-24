import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { pool } from "../database/pool.js";
import { getWebSocketService } from "../services/websocket-service.js";

export interface CameraInterventionRecord {
  id: string;
  tenantId: string;
  cameraId: string;
  type: "siren" | "strobe" | "floodlight" | "door_unlock";
  mode?: string;
  state: "active" | "completed" | "cancelled";
  durationSeconds: number;
  triggeredBy: string;
  reason?: string;
  createdAt: string;
  expiresAt?: string;
  completedAt?: string | null;
}

// In-memory active interventions state map: cameraId -> CameraInterventionRecord[]
const inMemoryInterventions = new Map<string, CameraInterventionRecord[]>();
const activeTimers = new Map<string, NodeJS.Timeout>();

const sirenPayloadSchema = z.object({
  action: z.enum(["trigger", "stop"]).default("trigger"),
  mode: z.enum(["siren", "strobe", "floodlight", "dual"]).default("dual"),
  durationSeconds: z.number().min(5).max(300).default(30),
  reason: z.string().optional(),
});

const doorUnlockPayloadSchema = z.object({
  durationSeconds: z.number().min(2).max(60).default(5),
  reason: z.string().optional(),
});

export async function registerCameraInterventionRoutes(app: FastifyInstance) {
  // Auto-create database table if postgres available
  if (pool) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS camera_interventions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR(100) NOT NULL,
          camera_id VARCHAR(100) NOT NULL,
          type VARCHAR(50) NOT NULL,
          mode VARCHAR(50),
          state VARCHAR(20) NOT NULL DEFAULT 'active',
          duration_seconds INT NOT NULL DEFAULT 30,
          triggered_by VARCHAR(100) NOT NULL DEFAULT 'Control Room Operator',
          reason TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ,
          completed_at TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS idx_camera_interventions_cam ON camera_interventions (camera_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_camera_interventions_tenant ON camera_interventions (tenant_id);
      `);
    } catch (err: any) {
      app.log.warn({ err: err?.message }, "[CameraIntervention] Database table init notice, relying on in-memory cache if needed");
    }
  }

  const getTenantId = (req: FastifyRequest): string => {
    return (
      (req.headers["x-tenant-id"] as string) ||
      (req.query as any)?.tenantId ||
      "default-tenant"
    );
  };

  const getOperatorName = (req: FastifyRequest): string => {
    const user = (req as any).user;
    return user?.name || user?.username || (req.headers["x-operator-name"] as string) || "SOC Operator";
  };

  /**
   * Helper: Broadcast intervention update
   */
  const broadcastIntervention = (tenantId: string, record: CameraInterventionRecord) => {
    try {
      const wsService = getWebSocketService();
      if (wsService) {
        wsService.broadcastCameraIntervention(tenantId, {
          id: record.id,
          cameraId: record.cameraId,
          type: record.type,
          state: record.state,
          durationSeconds: record.durationSeconds,
          triggeredBy: record.triggeredBy,
          reason: record.reason,
          timestamp: record.createdAt,
          expiresAt: record.expiresAt,
        });
      }
    } catch (wsErr) {
      app.log.warn({ wsErr }, "[CameraIntervention] WebSocket broadcast notice");
    }
  };

  /**
   * Helper: Complete an intervention
   */
  const completeIntervention = async (interventionId: string, tenantId: string, cameraId: string) => {
    const list = inMemoryInterventions.get(cameraId) || [];
    const item = list.find((i) => i.id === interventionId);
    if (item) {
      item.state = "completed";
      item.completedAt = new Date().toISOString();
      broadcastIntervention(tenantId, item);
    }
    if (pool) {
      try {
        await pool.query(
          `UPDATE camera_interventions SET state = 'completed', completed_at = NOW() WHERE id = $1 AND tenant_id = $2`,
          [interventionId, tenantId]
        );
      } catch {
        // ignore
      }
    }
  };

  /**
   * GET /api/v1/cameras/interventions/all & /v1/...
   * Bulk query for live wall
   */
  const handleGetAllInterventions = async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = getTenantId(request);

    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM camera_interventions 
           WHERE tenant_id = $1 AND state = 'active' AND (expires_at IS NULL OR expires_at > NOW())
           ORDER BY created_at DESC`,
          [tenantId]
        );
        const map: Record<string, CameraInterventionRecord[]> = {};
        for (const row of rows) {
          const rec: CameraInterventionRecord = {
            id: row.id,
            tenantId: row.tenant_id,
            cameraId: row.camera_id,
            type: row.type,
            mode: row.mode,
            state: row.state,
            durationSeconds: row.duration_seconds,
            triggeredBy: row.triggered_by,
            reason: row.reason,
            createdAt: row.created_at?.toISOString?.() || row.created_at,
            expiresAt: row.expires_at?.toISOString?.() || row.expires_at,
            completedAt: row.completed_at?.toISOString?.() || row.completed_at,
          };
          if (!map[rec.cameraId]) map[rec.cameraId] = [];
          map[rec.cameraId]!.push(rec);
        }
        return reply.code(200).send({ success: true, count: rows.length, activeInterventions: map });
      } catch (err: any) {
        app.log.warn({ err: err?.message }, "[CameraIntervention] SQL get all active failed, falling back to memory");
      }
    }

    const now = Date.now();
    const map: Record<string, CameraInterventionRecord[]> = {};
    for (const [camId, list] of inMemoryInterventions.entries()) {
      const activeList = list.filter((i) => i.state === "active" && (!i.expiresAt || new Date(i.expiresAt).getTime() > now));
      if (activeList.length > 0) {
        map[camId] = activeList;
      }
    }
    return reply.code(200).send({ success: true, count: Object.keys(map).length, activeInterventions: map });
  };

  app.get("/v1/cameras/interventions/all", handleGetAllInterventions);
  app.get("/api/v1/cameras/interventions/all", handleGetAllInterventions);

  /**
   * GET /api/v1/cameras/:cameraId/interventions/status
   */
  const handleGetCameraInterventionStatus = async (request: FastifyRequest, reply: FastifyReply) => {
    const { cameraId } = z.object({ cameraId: z.string() }).parse(request.params);
    const tenantId = getTenantId(request);

    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM camera_interventions 
           WHERE tenant_id = $1 AND camera_id = $2 AND state = 'active' AND (expires_at IS NULL OR expires_at > NOW())
           ORDER BY created_at DESC`,
          [tenantId, cameraId]
        );
        const mapped = rows.map((row) => ({
          id: row.id,
          tenantId: row.tenant_id,
          cameraId: row.camera_id,
          type: row.type,
          mode: row.mode,
          state: row.state,
          durationSeconds: row.duration_seconds,
          triggeredBy: row.triggered_by,
          reason: row.reason,
          createdAt: row.created_at?.toISOString?.() || row.created_at,
          expiresAt: row.expires_at?.toISOString?.() || row.expires_at,
        }));
        return reply.code(200).send({ success: true, active: mapped });
      } catch (err: any) {
        app.log.warn({ err: err?.message }, "[CameraIntervention] DB fetch status failed, fallback to memory");
      }
    }

    const now = Date.now();
    const list = inMemoryInterventions.get(cameraId) || [];
    const active = list.filter((i) => i.state === "active" && (!i.expiresAt || new Date(i.expiresAt).getTime() > now));
    return reply.code(200).send({ success: true, active });
  };

  app.get("/v1/cameras/:cameraId/interventions/status", handleGetCameraInterventionStatus);
  app.get("/api/v1/cameras/:cameraId/interventions/status", handleGetCameraInterventionStatus);

  /**
   * POST /api/v1/cameras/:cameraId/interventions/siren
   * Single-click siren / strobe / floodlight deterrence trigger
   */
  const handleSirenIntervention = async (request: FastifyRequest, reply: FastifyReply) => {
    const { cameraId } = z.object({ cameraId: z.string() }).parse(request.params);
    const body = sirenPayloadSchema.parse(request.body || {});
    const tenantId = getTenantId(request);
    const operator = getOperatorName(request);

    if (body.action === "stop") {
      // Cancel active sirens on this camera
      const list = inMemoryInterventions.get(cameraId) || [];
      const sirenList = list.filter((i) => (i.type === "siren" || i.type === "strobe" || i.type === "floodlight") && i.state === "active");
      for (const item of sirenList) {
        item.state = "cancelled";
        item.completedAt = new Date().toISOString();
        if (activeTimers.has(item.id)) {
          clearTimeout(activeTimers.get(item.id)!);
          activeTimers.delete(item.id);
        }
        broadcastIntervention(tenantId, item);
      }

      if (pool) {
        try {
          await pool.query(
            `UPDATE camera_interventions SET state = 'cancelled', completed_at = NOW() 
             WHERE tenant_id = $1 AND camera_id = $2 AND type IN ('siren', 'strobe', 'floodlight') AND state = 'active'`,
            [tenantId, cameraId]
          );
        } catch {
          // ignore
        }
      }

      return reply.code(200).send({ success: true, message: "Deterrence sirens cancelled", stoppedCount: sirenList.length });
    }

    // Trigger action
    const id = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + body.durationSeconds * 1000);

    const record: CameraInterventionRecord = {
      id,
      tenantId,
      cameraId,
      type: body.mode === "floodlight" ? "floodlight" : body.mode === "strobe" ? "strobe" : "siren",
      mode: body.mode,
      state: "active",
      durationSeconds: body.durationSeconds,
      triggeredBy: operator,
      reason: body.reason || `Operator deterrence triggered (${body.mode})`,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      completedAt: null,
    };

    if (pool) {
      try {
        await pool.query(
          `INSERT INTO camera_interventions (
            id, tenant_id, camera_id, type, mode, state, duration_seconds, triggered_by, reason, created_at, expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            record.id,
            record.tenantId,
            record.cameraId,
            record.type,
            record.mode,
            record.state,
            record.durationSeconds,
            record.triggeredBy,
            record.reason,
            now,
            expiresAt,
          ]
        );
      } catch (err: any) {
        app.log.warn({ err: err?.message }, "[CameraIntervention] Failed to persist siren event to SQL, saving in-memory");
      }
    }

    if (!inMemoryInterventions.has(cameraId)) {
      inMemoryInterventions.set(cameraId, []);
    }
    inMemoryInterventions.get(cameraId)!.unshift(record);

    // Schedule auto-complete timer
    const timer = setTimeout(() => {
      activeTimers.delete(id);
      void completeIntervention(id, tenantId, cameraId);
    }, body.durationSeconds * 1000);
    activeTimers.set(id, timer);

    // Broadcast WebSocket
    broadcastIntervention(tenantId, record);

    return reply.code(200).send({
      success: true,
      message: `Deterrence ${body.mode.toUpperCase()} triggered for ${body.durationSeconds}s`,
      intervention: record,
    });
  };

  app.post("/v1/cameras/:cameraId/interventions/siren", handleSirenIntervention);
  app.post("/api/v1/cameras/:cameraId/interventions/siren", handleSirenIntervention);

  /**
   * POST /api/v1/cameras/:cameraId/interventions/door-unlock
   * Single-click momentary door unlock interlock
   */
  const handleDoorUnlockIntervention = async (request: FastifyRequest, reply: FastifyReply) => {
    const { cameraId } = z.object({ cameraId: z.string() }).parse(request.params);
    const body = doorUnlockPayloadSchema.parse(request.body || {});
    const tenantId = getTenantId(request);
    const operator = getOperatorName(request);

    const id = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + body.durationSeconds * 1000);

    const record: CameraInterventionRecord = {
      id,
      tenantId,
      cameraId,
      type: "door_unlock",
      mode: "momentary_pulse",
      state: "active",
      durationSeconds: body.durationSeconds,
      triggeredBy: operator,
      reason: body.reason || `Operator momentary door release (${body.durationSeconds}s)`,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      completedAt: null,
    };

    if (pool) {
      try {
        await pool.query(
          `INSERT INTO camera_interventions (
            id, tenant_id, camera_id, type, mode, state, duration_seconds, triggered_by, reason, created_at, expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            record.id,
            record.tenantId,
            record.cameraId,
            record.type,
            record.mode,
            record.state,
            record.durationSeconds,
            record.triggeredBy,
            record.reason,
            now,
            expiresAt,
          ]
        );
      } catch (err: any) {
        app.log.warn({ err: err?.message }, "[CameraIntervention] Failed to persist door unlock event to SQL, saving in-memory");
      }
    }

    if (!inMemoryInterventions.has(cameraId)) {
      inMemoryInterventions.set(cameraId, []);
    }
    inMemoryInterventions.get(cameraId)!.unshift(record);

    // Schedule auto-relock
    const timer = setTimeout(() => {
      activeTimers.delete(id);
      void completeIntervention(id, tenantId, cameraId);
    }, body.durationSeconds * 1000);
    activeTimers.set(id, timer);

    // Broadcast WebSocket
    broadcastIntervention(tenantId, record);

    return reply.code(200).send({
      success: true,
      message: `Door unlocked for ${body.durationSeconds}s (Pulse active)`,
      intervention: record,
    });
  };

  app.post("/v1/cameras/:cameraId/interventions/door-unlock", handleDoorUnlockIntervention);
  app.post("/api/v1/cameras/:cameraId/interventions/door-unlock", handleDoorUnlockIntervention);

  /**
   * GET /api/v1/cameras/:cameraId/interventions/history
   * Audit log of past interventions for this camera
   */
  const handleGetHistory = async (request: FastifyRequest, reply: FastifyReply) => {
    const { cameraId } = z.object({ cameraId: z.string() }).parse(request.params);
    const tenantId = getTenantId(request);

    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM camera_interventions 
           WHERE tenant_id = $1 AND camera_id = $2 
           ORDER BY created_at DESC LIMIT 50`,
          [tenantId, cameraId]
        );
        return reply.code(200).send({ success: true, history: rows });
      } catch {
        // fallback
      }
    }

    const list = inMemoryInterventions.get(cameraId) || [];
    return reply.code(200).send({ success: true, history: list.slice(0, 50) });
  };

  app.get("/v1/cameras/:cameraId/interventions/history", handleGetHistory);
  app.get("/api/v1/cameras/:cameraId/interventions/history", handleGetHistory);
}
