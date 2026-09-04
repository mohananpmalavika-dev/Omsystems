import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { AlertOperationsService } from "../alerts/services/alert-operations.service.js";
import type { OperationalAlert } from "../alerts/domain/operational-alert.types.js";
import { queuePhysicalSiren } from "../alerts/physical-siren-dispatcher.js";

const alertIdParamSchema = z.object({ id: z.string().min(1) });

export async function registerAlertOperationsRoutes(
  app: FastifyInstance,
  store?: ControlPlaneStore,
  customService?: AlertOperationsService,
) {
  const service = customService ?? new AlertOperationsService();
  if (store) {
    service.subscribe((event) => {
      if (event.type !== "ALERT_CREATED") return;
      const alert = event.payload as OperationalAlert;
      void queuePhysicalSiren(store, {
        alertId: alert.id,
        tenantId: alert.tenantId,
        branchId: alert.branch.id,
        cameraId: alert.camera?.id,
        severity: alert.severity,
        detectionType: alert.detection.type,
        occurredAt: alert.occurredAt.toISOString(),
      }).then((result) => {
        if (!result.queued) {
          app.log.warn({ alertId: alert.id, reason: "reason" in result ? result.reason : undefined }, "Physical siren command was not queued");
        }
      }).catch((error) => {
        app.log.error({ error, alertId: alert.id }, "Physical siren command dispatch failed");
      });
    });
  }

  const registerEndpoints = (prefix: string) => {
    // 1. List Alerts with Query Filters
    app.get(`${prefix}/alerts`, async (request, reply) => {
      const query = request.query as {
        severity?: any;
        status?: any;
        branchId?: string;
        slaBreached?: string;
      };

      const list = await service.listAlerts({
        severity: query.severity,
        status: query.status,
        branchId: query.branchId,
        slaBreached: query.slaBreached === "true",
      });

      return reply.code(200).send({
        success: true,
        count: list.length,
        data: list,
      });
    });

    // 2. Get Single Alert
    app.get(`${prefix}/alerts/:id`, async (request, reply) => {
      const { id } = alertIdParamSchema.parse(request.params);
      const alert = await service.getAlert(id);

      if (!alert) {
        return reply.code(404).send({ success: false, error: "Alert not found" });
      }

      return reply.code(200).send(alert);
    });

    // 3. Ingest Raw Event
    app.post(`${prefix}/alerts/ingest`, async (request, reply) => {
      const body = request.body as any;
      if (!body || !body.type || !body.branchId || !body.tenantId) {
        return reply.code(400).send({
          success: false,
          error: "Missing required fields (type, branchId, tenantId)",
        });
      }

      const alert = await service.ingestEvent(body);
      return reply.code(201).send({
        success: true,
        alertId: alert.id,
        severity: alert.severity,
        status: alert.status,
        occurrenceCount: alert.occurrenceCount,
        alert,
      });
    });

    // 4. Server-Authoritative Acknowledge
    app.post(`${prefix}/alerts/:id/acknowledge`, async (request, reply) => {
      const { id } = alertIdParamSchema.parse(request.params);
      const actor = (request as any).currentUser
        ? { id: (request as any).currentUser.id, name: (request as any).currentUser.name ?? "Operator" }
        : { id: "op-soc-14", name: "Priya (SOC L1)" };

      try {
        const alert = await service.acknowledgeAlert(id, actor);
        return reply.code(200).send({
          success: true,
          alert,
        });
      } catch (err: any) {
        if (err.name === "InvalidAlertTransitionError") {
          return reply.code(409).send({ success: false, error: err.message });
        }
        return reply.code(400).send({ success: false, error: err.message });
      }
    });

    // 5. Tiered Escalation
    app.post(`${prefix}/alerts/:id/escalate`, async (request, reply) => {
      const { id } = alertIdParamSchema.parse(request.params);
      const body = (request.body as { reason?: string }) ?? {};
      const actor = (request as any).currentUser
        ? { id: (request as any).currentUser.id, name: (request as any).currentUser.name ?? "Operator" }
        : { id: "op-soc-14", name: "Priya (SOC L1)" };

      try {
        const alert = await service.escalateAlert(id, actor, body.reason);
        return reply.code(200).send({ success: true, alert });
      } catch (err: any) {
        return reply.code(400).send({ success: false, error: err.message });
      }
    });

    // 6. Assign Alert
    app.post(`${prefix}/alerts/:id/assign`, async (request, reply) => {
      const { id } = alertIdParamSchema.parse(request.params);
      const body = request.body as { userId: string; userName?: string };
      const actor = (request as any).currentUser
        ? { id: (request as any).currentUser.id, name: (request as any).currentUser.name ?? "Supervisor" }
        : { id: "sup-01", name: "Raj (SOC Lead)" };

      if (!body?.userId) {
        return reply.code(400).send({ success: false, error: "userId is required" });
      }

      const alert = await service.assignAlert(id, { id: body.userId, name: body.userName ?? body.userId }, actor);
      return reply.code(200).send({ success: true, alert });
    });

    // 7. Add Comment / Investigation Note
    app.post(`${prefix}/alerts/:id/comment`, async (request, reply) => {
      const { id } = alertIdParamSchema.parse(request.params);
      const body = request.body as { comment: string };
      const actor = (request as any).currentUser
        ? { id: (request as any).currentUser.id, name: (request as any).currentUser.name ?? "Operator" }
        : { id: "op-soc-14", name: "Priya (SOC L1)" };

      if (!body?.comment) {
        return reply.code(400).send({ success: false, error: "comment text is required" });
      }

      const comment = await service.addComment(id, actor, body.comment);
      return reply.code(201).send({ success: true, comment });
    });

    // 8. Resolve Incident with Mandatory Disposition
    app.post(`${prefix}/alerts/:id/resolve`, async (request, reply) => {
      const { id } = alertIdParamSchema.parse(request.params);
      const body = request.body as { disposition: any; notes?: string };
      const actor = (request as any).currentUser
        ? { id: (request as any).currentUser.id, name: (request as any).currentUser.name ?? "Operator" }
        : { id: "op-soc-14", name: "Priya (SOC L1)" };

      if (!body?.disposition) {
        return reply.code(400).send({ success: false, error: "disposition is required to resolve alert" });
      }

      try {
        const alert = await service.resolveAlert(id, actor, body.disposition, body.notes ?? "Resolved by operator");
        return reply.code(200).send({ success: true, alert });
      } catch (err: any) {
        return reply.code(400).send({ success: false, error: err.message });
      }
    });

    // 9. Generate Short-Lived Live Stream Session Token
    app.post(`${prefix}/alerts/:id/live-session`, async (request, reply) => {
      const { id } = alertIdParamSchema.parse(request.params);
      const actorId = (request as any).currentUser?.id ?? "op-soc-14";

      const session = await service.createLiveSession(id, actorId);
      return reply.code(200).send(session);
    });

    // 10. Get Audit Timeline Log
    app.get(`${prefix}/alerts/:id/timeline`, async (request, reply) => {
      const { id } = alertIdParamSchema.parse(request.params);
      const timeline = await service.getTimeline(id);
      return reply.code(200).send({
        alertId: id,
        count: timeline.length,
        timeline,
      });
    });

    // 11. Daily Alert & SLA Report
    app.get(`${prefix}/alerts/reports/daily`, async (_request, reply) => {
      const alerts = await service.listAlerts();
      const p1 = alerts.filter((a) => a.severity === "P1").length;
      const p2 = alerts.filter((a) => a.severity === "P2").length;
      const p3 = alerts.filter((a) => a.severity === "P3").length;
      const p4 = alerts.filter((a) => a.severity === "P4").length;
      const acknowledgedInSla = alerts.filter((a) => a.acknowledgement && !a.acknowledgement.slaBreached).length;

      return reply.code(200).send({
        date: new Date().toISOString().slice(0, 10),
        totalAlerts: alerts.length,
        p1,
        p2,
        p3,
        p4,
        slaCompliancePct: alerts.length ? Math.round((acknowledgedInSla / alerts.length) * 1000) / 10 : 100,
        resolvedCount: alerts.filter((a) => a.status === "RESOLVED").length,
      });
    });
  };

  registerEndpoints("/v1");
  registerEndpoints("/api/v1");
  registerEndpoints("/api");
}
