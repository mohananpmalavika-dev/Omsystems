import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import {
  ClockMonitoringService,
  clockMonitoringService,
} from "../clock-monitoring/services/clock-monitoring.service.js";

const idParamSchema = z.object({ id: z.string().min(1) });

export async function registerClockMonitoringRoutes(
  app: FastifyInstance,
  store?: ControlPlaneStore,
  customService?: ClockMonitoringService,
) {
  const service = customService ?? clockMonitoringService;

  const registerEndpoints = (prefix: string) => {
    // 1. Branch Clock Health
    app.get(`${prefix}/clock-health/branches/:id`, async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const health = await service.getBranchClockHealth(id);
      if (!health) {
        return reply.code(404).send({
          success: false,
          error: "branch_clock_health_not_found",
        });
      }
      return reply.code(200).send({
        success: true,
        data: health,
      });
    });

    // 2. Fleet Clock Compliance Summary
    app.get(`${prefix}/clock-health/fleet/summary`, async (request, reply) => {
      const summary = await service.getFleetClockSummary();
      return reply.code(200).send({
        success: true,
        data: summary,
      });
    });

    // 3. Device Historical Drift Series
    app.get(`${prefix}/clock-health/devices/:id/history`, async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const query = request.query as { limit?: string };
      const limit = query.limit ? parseInt(query.limit, 10) : 50;

      const history = await service.getDeviceHistory(id, limit);
      return reply.code(200).send({
        success: true,
        deviceId: id,
        count: history.length,
        history,
      });
    });

    // 4. Ingest / Poll Clock Probe Sample
    app.post(`${prefix}/clock-health/poll`, async (request, reply) => {
      const body = request.body as any;
      if (!body || !body.deviceId || !body.branchId) {
        return reply.code(400).send({
          success: false,
          error: "deviceId and branchId are required",
        });
      }

      const now = new Date();
      const deviceTime = body.deviceTime ? new Date(body.deviceTime) : now;
      const signedOffset = body.signedOffsetSeconds ?? 0.05;

      const evidence = await service.recordEvidence({
        deviceId: body.deviceId,
        deviceName: body.deviceName ?? `Device ${body.deviceId}`,
        deviceType: body.deviceType ?? "CAMERA",
        branchId: body.branchId,
        deviceTime,
        referenceTime: now,
        roundTripTimeMs: body.roundTripTimeMs ?? 15,
        signedOffsetSeconds: signedOffset,
        absoluteOffsetSeconds: Math.abs(signedOffset),
        ntpServer: body.ntpServer ?? "time.bank.internal",
        ntpSynchronized: body.ntpSynchronized ?? true,
        ntpWhitelisted: true,
        configuredTimezone: body.configuredTimezone ?? "Asia/Kolkata",
        timezoneOffsetMinutes: body.timezoneOffsetMinutes ?? 330,
        timezoneMismatch: false,
        healthState: Math.abs(signedOffset) > 30 ? "CRITICAL" : Math.abs(signedOffset) > 5 ? "WARNING" : "SYNCHRONIZED",
        source: body.source ?? "ONVIF",
        observedAt: now,
      });

      return reply.code(200).send({
        success: true,
        evidence,
      });
    });

    // 5. Audited Clock Remediation (NTP Trigger / Sync)
    app.post(`${prefix}/clock-health/devices/:id/sync`, async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const body = request.body as any;

      const branchId = body?.branchId ?? "branch-thrissur-14";
      const action = body?.action ?? "NTP_TRIGGER";
      const reason = body?.reason ?? "Manual SOC operator clock synchronization";
      const initiatedByUserId = (request as any).currentUser?.id ?? "user-soc-operator";

      const res = await service.syncDeviceClock({
        deviceId: id,
        branchId,
        action,
        initiatedByUserId,
        reason,
      });

      return reply.code(200).send({
        success: true,
        data: res,
      });
    });

    // 6. Clock Sync Audit Logs
    app.get(`${prefix}/clock-health/audit`, async (request, reply) => {
      const query = request.query as { limit?: string };
      const limit = query.limit ? parseInt(query.limit, 10) : 100;
      const logs = await service.listAuditEntries(limit);

      return reply.code(200).send({
        success: true,
        count: logs.length,
        data: logs,
      });
    });
  };

  registerEndpoints("/v1");
  registerEndpoints("/api/v1");
  registerEndpoints("/api");
}
