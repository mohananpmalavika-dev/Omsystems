import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import {
  DailyBranchHealthAggregatorService,
  dailyBranchHealthAggregator,
} from "../sla/services/daily-branch-health-aggregator.service.js";

const branchIdParamSchema = z.object({ id: z.string().min(1) });

export async function registerSlaReportRoutes(
  app: FastifyInstance,
  store?: ControlPlaneStore,
  customService?: DailyBranchHealthAggregatorService,
) {
  const service = customService ?? dailyBranchHealthAggregator;

  const registerEndpoints = (prefix: string) => {
    // 1. List Daily Branch Aggregates
    app.get(`${prefix}/sla/branches/daily`, async (request, reply) => {
      const query = request.query as { reportDate?: string; regionId?: string };
      const list = await service.listDailyBranchAggregates(query);
      return reply.code(200).send({
        success: true,
        count: list.length,
        data: list,
      });
    });

    // 2. Branch Historical SLA Trend (7d, 30d, 90d)
    app.get(`${prefix}/sla/branches/:id/history`, async (request, reply) => {
      const { id } = branchIdParamSchema.parse(request.params);
      const query = request.query as { days?: string };
      const days = query.days ? parseInt(query.days, 10) : 30;

      const history = await service.getBranchSlaHistory(id, days);
      return reply.code(200).send({
        success: true,
        branchId: id,
        days: history.length,
        history,
      });
    });

    // 3. Per-Camera Daily Drill-Down Breakdown
    app.get(`${prefix}/sla/branches/:id/cameras/daily`, async (request, reply) => {
      const { id } = branchIdParamSchema.parse(request.params);
      const query = request.query as { reportDate?: string };
      const reportDate = query.reportDate ?? new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

      const cameras = await service.getCameraDailyBreakdown(id, reportDate);
      return reply.code(200).send({
        success: true,
        branchId: id,
        reportDate,
        count: cameras.length,
        cameras,
      });
    });

    // 4. Fleet Weighted SLA Summary
    app.get(`${prefix}/sla/fleet/summary`, async (request, reply) => {
      const query = request.query as { reportDate?: string };
      const reportDate = query.reportDate ?? new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

      const summary = await service.getFleetSummary(reportDate);
      return reply.code(200).send({
        success: true,
        data: summary,
      });
    });

    // 5. Trigger / Re-run Daily Aggregation
    app.post(`${prefix}/sla/aggregate`, async (request, reply) => {
      const body = request.body as any;
      if (!body || !body.branchId || !body.reportDate) {
        return reply.code(400).send({
          success: false,
          error: "branchId and reportDate (YYYY-MM-DD) are required",
        });
      }

      const windowStart = new Date(`${body.reportDate}T00:00:00.000Z`);
      const windowEnd = new Date(`${body.reportDate}T23:59:59.999Z`);

      const result = await service.aggregateBranch({
        branchId: body.branchId,
        branchName: body.branchName ?? `Branch ${body.branchId}`,
        regionId: body.regionId,
        reportDate: body.reportDate,
        windowStart,
        windowEnd,
        cameraIntervals: new Map(),
        recorderIntervals: [],
        recordingIntervals: new Map(),
        internetIntervals: [],
        retentionCounts: { compliant: 40, nonCompliant: 0, unknown: 0 },
        alerts: {
          p1Count: 0,
          p2Count: 0,
          p3Count: 0,
          p4Count: 0,
          acknowledgedCount: 0,
          resolvedCount: 0,
          p1Breaches: 0,
          p2Breaches: 0,
          meanAckSeconds: 0,
          meanResolutionSeconds: 0,
        },
      });

      return reply.code(200).send({
        success: true,
        aggregate: result,
      });
    });

    // 6. Daily SLA Report Export Data
    app.get(`${prefix}/sla/reports/daily-export`, async (request, reply) => {
      const query = request.query as { reportDate?: string; format?: "json" | "csv" };
      const reportDate = query.reportDate ?? new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

      const summary = await service.getFleetSummary(reportDate);
      const branches = await service.listDailyBranchAggregates({ reportDate });

      if (query.format === "csv") {
        const header = "branch_id,branch_name,camera_availability_pct,recording_availability_pct,recorder_availability_pct,internet_availability_pct,retention_compliance_pct,p1_alerts,p2_alerts,sla_status\n";
        const rows = branches
          .map(
            (b) =>
              `${b.branchId},"${b.branchName}",${b.cameraAvailabilityPct ?? ""},${b.recordingAvailabilityPct ?? ""},${b.recorderAvailabilityPct ?? ""},${b.internetAvailabilityPct ?? ""},${b.retentionCompliancePct ?? ""},${b.p1AlertCount},${b.p2AlertCount},${b.slaStatus}`,
          )
          .join("\n");
        return reply
          .header("content-type", "text/csv")
          .header("content-disposition", `attachment; filename="sla_report_${reportDate}.csv"`)
          .send(header + rows);
      }

      return reply.code(200).send({
        success: true,
        reportDate,
        fleetSummary: summary,
        branches,
      });
    });
  };

  registerEndpoints("/v1");
  registerEndpoints("/api/v1");
  registerEndpoints("/api");
}
