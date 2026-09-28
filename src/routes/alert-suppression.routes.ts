/**
 * Alert Suppression REST Routes
 *
 * Registers endpoints so the dashboard can read and toggle suppression
 * for any scope: global (tenant), branch, camera, or per-detection-type.
 *
 * Mounted under /v1/alerts/suppression  and  /api/v1/alerts/suppression
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { AlertSuppressionService } from "../alerts/services/alert-suppression.service.js";

const ALLOWED_ROLES = new Set([
  "admin",
  "super_admin",
  "superadmin",
  "company_admin",
  "hq_admin",
  "zone_manager",
  "region_manager",
  "area_manager",
  "branch_manager",
  "security_officer",
]);

const CANONICAL_DETECTION_TYPES = [
  "INTRUSION",
  "FIRE",
  "SMOKE",
  "CAMERA_TAMPER",
  "VAULT_ACCESS",
  "LOITERING",
  "CROWD_GATHERING",
  "BLACKLIST_PERSON",
  "VEHICLE_ANPR",
  "VIOLENCE",
  "CAMERA_OBSTRUCTION",
  "ATM_VANDALISM",
  "WEAPON_DETECTED",
  "CASH_VAN_MONITORING",
  "QUEUE_ANOMALY",
  "CAMERA_HEALTH_FAULT",
] as const;

const toggleSchema = z.object({
  branchId: z.string().min(1).nullable().optional(),
  cameraId: z.string().min(1).nullable().optional(),
  detectionType: z.enum(CANONICAL_DETECTION_TYPES).nullable().optional(),
  suppressed: z.boolean(),
  label: z.string().max(120).optional(),
  reason: z.string().max(500).optional(),
});

const bulkToggleSchema = z.object({
  branchId: z.string().min(1).nullable().optional(),
  cameraId: z.string().min(1).nullable().optional(),
  suppressed: z.boolean(),
  reason: z.string().max(500).optional(),
});

export async function registerAlertSuppressionRoutes(
  app: FastifyInstance,
  service: AlertSuppressionService
): Promise<void> {

  function getActor(request: FastifyRequest): { tenantId: string; userId: string; role: string } | null {
    const u = (request as any).currentUser;
    if (!u?.tenantId || !u?.id) return null;
    return { tenantId: u.tenantId, userId: u.id, role: u.role ?? "" };
  }

  async function requireOperator(request: FastifyRequest, reply: FastifyReply) {
    const actor = getActor(request);
    if (!actor) {
      await reply.code(401).send({ success: false, error: "unauthenticated" });
      return null;
    }
    if (!ALLOWED_ROLES.has(actor.role)) {
      await reply.code(403).send({ success: false, error: "forbidden", message: "Alert suppression management requires a security administrator role" });
      return null;
    }
    return actor;
  }

  const safe = (
    method: "get" | "post" | "put" | "patch" | "delete",
    url: string,
    handler: (req: FastifyRequest, rep: FastifyReply) => Promise<unknown>
  ) => {
    const fullHandler = async (req: FastifyRequest, rep: FastifyReply) => {
      try {
        return await handler(req, rep);
      } catch (err: any) {
        app.log.error({ err, url }, "Alert suppression route error");
        if (!rep.sent) {
          await rep.code(500).send({ success: false, error: "internal_error", message: err.message });
        }
      }
    };

    for (const prefix of ["/v1", "/api/v1", "/api"]) {
      try {
        app[method](`${prefix}${url}`, fullHandler);
      } catch (err: any) {
        if (err?.code !== "FST_ERR_DUPLICATED_ROUTE") throw err;
      }
    }
  };

  // ───────────────────────────────────────────────────────────
  // GET /alerts/suppression
  // List all suppression configs for the tenant (optionally filter by branch/camera)
  // ───────────────────────────────────────────────────────────
  safe("get", "/alerts/suppression", async (request, reply) => {
    const actor = await requireOperator(request, reply);
    if (!actor) return;

    const query = request.query as { branchId?: string; cameraId?: string };
    const configs = await service.listConfigs(actor.tenantId, {
      branchId: query.branchId,
      cameraId: query.cameraId,
    });

    return reply.code(200).send({ success: true, count: configs.length, data: configs });
  });

  // ───────────────────────────────────────────────────────────
  // GET /alerts/suppression/check
  // Hot-path check: is a specific event suppressed?
  // ───────────────────────────────────────────────────────────
  safe("get", "/alerts/suppression/check", async (request, reply) => {
    const actor = await requireOperator(request, reply);
    if (!actor) return;

    const q = request.query as { branchId?: string; cameraId?: string; detectionType?: string };
    if (!q.branchId || !q.detectionType) {
      return reply.code(400).send({ success: false, error: "branchId and detectionType are required" });
    }

    const result = await service.isSuppressed(actor.tenantId, q.branchId, q.cameraId, q.detectionType);
    return reply.code(200).send({ success: true, data: result });
  });

  // ───────────────────────────────────────────────────────────
  // GET /alerts/suppression/:id
  // Get a single suppression config by ID
  // ───────────────────────────────────────────────────────────
  safe("get", "/alerts/suppression/:id", async (request, reply) => {
    const actor = await requireOperator(request, reply);
    if (!actor) return;

    const { id } = request.params as { id: string };
    const config = await service.getConfig(id);
    if (!config || config.tenantId !== actor.tenantId) {
      return reply.code(404).send({ success: false, error: "suppression_config_not_found" });
    }
    return reply.code(200).send({ success: true, data: config });
  });

  // ───────────────────────────────────────────────────────────
  // POST /alerts/suppression/toggle
  // Upsert a single suppression rule (specific detection type at a scope)
  // ───────────────────────────────────────────────────────────
  safe("post", "/alerts/suppression/toggle", async (request, reply) => {
    const actor = await requireOperator(request, reply);
    if (!actor) return;

    const body = toggleSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ success: false, error: "validation_error", details: body.error.issues });
    }

    const config = await service.upsertSuppression({
      tenantId: actor.tenantId,
      branchId: body.data.branchId ?? null,
      cameraId: body.data.cameraId ?? null,
      detectionType: body.data.detectionType ?? null,
      suppressed: body.data.suppressed,
      label: body.data.label,
      updatedBy: actor.userId,
      reason: body.data.reason,
    });

    return reply.code(200).send({ success: true, data: config });
  });

  // ───────────────────────────────────────────────────────────
  // POST /alerts/suppression/bulk-toggle
  // Toggle ALL alert types at once for a given scope (branch or camera)
  // ───────────────────────────────────────────────────────────
  safe("post", "/alerts/suppression/bulk-toggle", async (request, reply) => {
    const actor = await requireOperator(request, reply);
    if (!actor) return;

    const body = bulkToggleSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ success: false, error: "validation_error", details: body.error.issues });
    }

    const config = await service.bulkToggle(
      actor.tenantId,
      body.data.suppressed,
      actor.userId,
      { branchId: body.data.branchId ?? null, cameraId: body.data.cameraId ?? null },
      body.data.reason
    );

    return reply.code(200).send({ success: true, data: config });
  });

  // ───────────────────────────────────────────────────────────
  // DELETE /alerts/suppression/:id
  // Remove a suppression config (alerts will fire again for that scope)
  // ───────────────────────────────────────────────────────────
  safe("delete", "/alerts/suppression/:id", async (request, reply) => {
    const actor = await requireOperator(request, reply);
    if (!actor) return;

    const { id } = request.params as { id: string };
    const deleted = await service.deleteConfig(id, actor.tenantId);

    if (!deleted) {
      return reply.code(404).send({ success: false, error: "suppression_config_not_found" });
    }
    return reply.code(200).send({ success: true, message: "Suppression config deleted. Alerts will resume." });
  });

  // ───────────────────────────────────────────────────────────
  // GET /alerts/suppression/:id/audit
  // Audit trail for a suppression config
  // ───────────────────────────────────────────────────────────
  safe("get", "/alerts/suppression/:id/audit", async (request, reply) => {
    const actor = await requireOperator(request, reply);
    if (!actor) return;

    const { id } = request.params as { id: string };
    const log = await service.getAuditLog(id, actor.tenantId);
    return reply.code(200).send({ success: true, count: log.length, data: log });
  });
}
