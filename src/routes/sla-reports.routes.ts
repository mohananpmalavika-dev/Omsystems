import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import {
  DailyBranchHealthAggregatorService,
  dailyBranchHealthAggregator,
} from "../sla/services/daily-branch-health-aggregator.service.js";

const branchIdParamSchema = z.object({ id: z.string().min(1) });
const reportDateSchema = z.string().date();
const dailyQuerySchema = z.object({ reportDate: reportDateSchema.optional(), regionId: z.string().min(1).max(128).optional() }).strict();
const historyQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(366).default(30) }).strict();
const reportQuerySchema = z.object({ reportDate: reportDateSchema.optional(), format: z.enum(["json", "csv"]).default("json") }).strict();

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function registerSlaReportRoutes(
  app: FastifyInstance,
  store?: ControlPlaneStore,
  customService?: DailyBranchHealthAggregatorService,
) {
  const service = customService ?? dailyBranchHealthAggregator;
  const accessibleBranchIds = async (request: any): Promise<Set<string> | null> => {
    // The standalone service is used by unit tests without the control-plane
    // identity layer.  In the app, every report is constrained to the caller's
    // branch scope before it is returned or included in a fleet total.
    if (!store || !request.currentUser) return null;
    const branches = await store.listAccessibleNodes(request.currentUser, "analytics:view", "branch");
    return new Set(branches.map((branch) => branch.id));
  };
  const canReadBranch = async (request: any, branchId: string) => {
    const allowed = await accessibleBranchIds(request);
    return allowed === null || allowed.has(branchId);
  };

  const registerEndpoints = (prefix: string) => {
    // 1. List Daily Branch Aggregates
    app.get(`${prefix}/sla/branches/daily`, async (request, reply) => {
      const parsed = dailyQuerySchema.safeParse(request.query);
      if (!parsed.success) return reply.code(400).send({ success: false, error: "validation_error", details: parsed.error.flatten() });
      const query = parsed.data;
      const allowed = await accessibleBranchIds(request);
      const list = (await service.listDailyBranchAggregates(query)).filter((branch) => !allowed || allowed.has(branch.branchId));
      return reply.code(200).send({
        success: true,
        count: list.length,
        data: list,
      });
    });

    // 2. Branch Historical SLA Trend (7d, 30d, 90d)
    app.get(`${prefix}/sla/branches/:id/history`, async (request, reply) => {
      const params = branchIdParamSchema.safeParse(request.params);
      const query = historyQuerySchema.safeParse(request.query);
      if (!params.success || !query.success) return reply.code(400).send({ success: false, error: "validation_error", details: (!params.success ? params.error : query.error).flatten() });
      const { id } = params.data;
      const { days } = query.data;
      if (!(await canReadBranch(request, id))) return reply.code(404).send({ success: false, error: "branch_not_found" });

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
      const params = branchIdParamSchema.safeParse(request.params);
      const query = z.object({ reportDate: reportDateSchema.optional() }).strict().safeParse(request.query);
      if (!params.success || !query.success) return reply.code(400).send({ success: false, error: "validation_error", details: (!params.success ? params.error : query.error).flatten() });
      const { id } = params.data;
      const reportDate = query.data.reportDate ?? new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
      if (!(await canReadBranch(request, id))) return reply.code(404).send({ success: false, error: "branch_not_found" });

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
      const query = z.object({ reportDate: reportDateSchema.optional() }).strict().safeParse(request.query);
      if (!query.success) return reply.code(400).send({ success: false, error: "validation_error", details: query.error.flatten() });
      const reportDate = query.data.reportDate ?? new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
      const allowed = await accessibleBranchIds(request);

      const summary = await service.getFleetSummary(reportDate, allowed ?? undefined);
      return reply.code(200).send({
        success: true,
        data: summary,
      });
    });

    // 5. Aggregation is a trusted worker operation.  This API must never
    // manufacture aggregate inputs from empty telemetry or fixed retention.
    app.post(`${prefix}/sla/aggregate`, async (request, reply) => {
      return reply.code(501).send({
        success: false,
        error: "sla_aggregation_worker_required",
        message: "Daily SLA aggregation must be run by the trusted telemetry worker.",
      });
    });

    // 6. Daily SLA Report Export Data
    app.get(`${prefix}/sla/reports/daily-export`, async (request, reply) => {
      const query = reportQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ success: false, error: "validation_error", details: query.error.flatten() });
      const reportDate = query.data.reportDate ?? new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

      const allowed = await accessibleBranchIds(request);
      const summary = await service.getFleetSummary(reportDate, allowed ?? undefined);
      const branches = (await service.listDailyBranchAggregates({ reportDate })).filter((branch) => !allowed || allowed.has(branch.branchId));

      if (query.data.format === "csv") {
        const header = "branch_id,branch_name,camera_availability_pct,recording_availability_pct,recorder_availability_pct,internet_availability_pct,retention_compliance_pct,p1_alerts,p2_alerts,sla_status\n";
        const rows = branches
          .map(
            (b) =>
              [b.branchId, b.branchName, b.cameraAvailabilityPct, b.recordingAvailabilityPct, b.recorderAvailabilityPct, b.internetAvailabilityPct, b.retentionCompliancePct, b.p1AlertCount, b.p2AlertCount, b.slaStatus].map(csvCell).join(","),
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
