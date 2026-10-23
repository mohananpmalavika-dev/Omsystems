import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import type { Pool } from "pg";
import { ReportingEngine, type ReportConfig } from "../src/maintenance/reporting-engine.js";
import { AvailabilityCalculator } from "../src/sla/services/availability-calculator.js";
import { DailyBranchHealthAggregatorService } from "../src/sla/services/daily-branch-health-aggregator.service.js";
import { ActivityTrackingRepository } from "../src/database/activity-tracking-repository.js";
import { MaintenanceRepository } from "../src/database/maintenance-repository.js";
import { OperationalReportRepository } from "../src/database/operational-report-repository.js";
import { RetentionReportService } from "../src/retention/services/retention-report.service.js";
import { AnalyticsRepository } from "../src/database/analytics-repository.js";
import { IncidentRepository } from "../src/database/incident-repository.js";
import { registerReportsRoutes } from "../src/routes/reports.routes.js";
import { createHistoricalTrendsRoutes } from "../src/routes/reports/historical-trends.routes.js";
import { createMISUnifiedRoutes } from "../src/routes/reports/mis-unified.routes.js";
import { DailySurveillanceCollectorService } from "../src/reporting/services/daily-surveillance-collector.service.js";
import { renderDailySurveillanceHealthCsv } from "../src/reporting/renderers/daily-surveillance-csv.renderer.js";
import { BranchOperationalSnapshotService } from "../src/services/branch-operational-snapshot.production.service.js";

const date = (value: string) => new Date(value);
const start = date("2026-01-01T00:00:00Z");
const end = date("2026-01-01T01:00:00Z");
const logger = { info: vi.fn(), error: vi.fn() };
const config = (reportType: ReportConfig['reportType'], extra: Partial<ReportConfig> = {}): ReportConfig => ({
  id: "report", tenantId: "tenant", title: "Audit", reportType, format: "json",
  periodStart: date("2026-01-01T00:00:00Z"), periodEnd: date("2026-03-31T23:59:59Z"),
  generatedBy: "operator", generatedAt: new Date(), ...extra,
});
const order = (id: string, extra: Record<string, unknown> = {}) => ({
  id, tenantId: "tenant", createdAt: "2026-01-31T12:00:00Z", updatedAt: "2026-02-01T12:00:00Z",
  status: "closed", cost: 20, severity: "high", branchNodeId: "A", assetId: "asset", vendorId: "vendor", ...extra,
});
afterEach(() => vi.restoreAllMocks());

describe("report calculation regressions", () => {
  it("does not double count overlapping observations or maintenance", () => {
    const result = AvailabilityCalculator.calculate([
      { entityId: "camera", entityType: "CAMERA", state: "HEALTHY", startedAt: start, endedAt: end },
      { entityId: "camera", entityType: "CAMERA", state: "FAILED", startedAt: date("2026-01-01T00:30:00Z"), endedAt: end },
    ], start, end, [
      { startAt: date("2026-01-01T00:10:00Z"), endAt: date("2026-01-01T00:20:00Z") },
      { startAt: date("2026-01-01T00:15:00Z"), endAt: date("2026-01-01T00:25:00Z") },
    ]);
    expect(result).toMatchObject({ availableSeconds: 900, unavailableSeconds: 1800, unknownSeconds: 0, monitoredSeconds: 2700, availabilityPct: 33.33, monitoringCoveragePct: 100 });
  });

  it("preserves unknown gaps and handles a completely excluded window", () => {
    expect(AvailabilityCalculator.calculate([], start, end)).toMatchObject({ availabilityPct: null, unknownSeconds: 3600, monitoringCoveragePct: 0 });
    expect(AvailabilityCalculator.calculate([], start, end, [{ startAt: start, endAt: end }])).toMatchObject({ availabilityPct: null, monitoredSeconds: 0, unknownSeconds: 0 });
  });

  it("does not skip February or last-day costs when a period starts January 31", async () => {
    const store: any = { writeAudit: vi.fn(), listAmcContracts: async () => [], listMaintenanceAssets: async () => [],
      listWorkOrders: async () => [order("jan"), order("feb", { createdAt: "2026-02-28T23:59:59Z", cost: 30 }), order("mar", { createdAt: "2026-03-31T23:59:59Z", cost: 40 })] };
    const report = await new ReportingEngine(store, logger).generateReport(config("cost-analysis", { periodStart: date("2026-01-31T00:00:00Z") }));
    expect(report.data.costTrend).toEqual([
      { month: "2026-01", cost: 20, workOrders: 1 }, { month: "2026-02", cost: 30, workOrders: 1 }, { month: "2026-03", cost: 40, workOrders: 1 },
    ]);
  });

  it("applies maintenance filters and measures resolution without requiring an SLA", async () => {
    const listWorkOrders = vi.fn(async (..._args: any[]) => [order("allowed", { resolvedAt: "2026-01-31T14:00:00Z" }), order("other", { branchNodeId: "B", cost: 999 })]);
    const store: any = { listWorkOrders, writeAudit: vi.fn() };
    const report = await new ReportingEngine(store, logger).generateReport(config("corrective-maintenance", { filters: { branchNodeId: "A" } }));
    expect(report.metrics).toMatchObject({ total: 1, totalCost: 20, avgResolutionHours: 2 });
    expect(listWorkOrders.mock.calls[0]).toEqual(["tenant", undefined, expect.objectContaining({ branchNodeId: "A", from: "2026-01-01T00:00:00.000Z" })]);
  });

  it("counts open SLA breaches consistently in total and severity breakdowns", async () => {
    const store: any = { writeAudit: vi.fn(), listWorkOrders: async () => [
      order("good", { slaDueAt: "2026-02-02T00:00:00Z" }), order("breach", { status: "open", slaDueAt: "2026-02-02T00:00:00Z" }),
    ] };
    const report = await new ReportingEngine(store, logger).generateReport(config("sla-compliance"));
    expect(report.metrics.complianceRate).toBe(50);
    expect(report.data.bySeverity.high.compliance).toBe(50);
  });

  it("excludes out-of-period predictive alerts and filters through asset branches", async () => {
    const store: any = { writeAudit: vi.fn(), listMaintenanceAssets: async () => [{ id: "asset", branchNodeId: "A" }],
      listPredictiveAlerts: async () => [
        { assetId: "asset", score: 0.9, detectedAt: "2026-02-01T00:00:00Z" },
        { assetId: "other", score: 0.9, detectedAt: "2026-02-01T00:00:00Z" },
        { assetId: "asset", score: 0.9, detectedAt: "2020-01-01T00:00:00Z" },
      ] };
    const report = await new ReportingEngine(store, logger).generateReport(config("predictive-summary", { filters: { branchNodeId: "A" } }));
    expect(report.metrics).toMatchObject({ total: 1, highRisk: 1 });
  });

  it("excludes work orders without matching AMC coverage", async () => {
    const store: any = { writeAudit: vi.fn(), listAmcContracts: async () => [{ vendorId: "vendor", startDate: "2026-01-01", endDate: "2026-03-31", cost: 100 }],
      listWorkOrders: async () => [order("covered"), order("uncovered", { vendorId: "other" })] };
    const report = await new ReportingEngine(store, logger).generateReport(config("amc-performance"));
    expect(report.metrics.totalWorkOrders).toBe(1);
  });
});

describe("query scope and mapping regressions", () => {
  it("does not resolve timeline subjects outside the caller tenant", async () => {
    const query = vi.fn(async (..._args: any[]) => ({ rows: [] }));
    const repository = new ActivityTrackingRepository({ query } as unknown as Pool);
    expect(await repository.getActivityTimeline("tenant-A", "user-B", "2026-01-01", "2026-01-02", 20, 0)).toEqual({ events: [], total: 0 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]).toEqual([expect.stringContaining("WHERE tenant_id = $2::uuid"), ["user-B", "tenant-A"]]);
  });

  it("keeps comprehensive report tenant parameters fixed and date bounds indexable", async () => {
    const query = vi.fn(async (..._args: any[]) => ({ rows: [] }));
    await new ActivityTrackingRepository({ query } as unknown as Pool).getComprehensiveReport("tenant-A", "user-B", "2026-01-01", "2026-01-02");
    const calls = query.mock.calls as unknown as Array<[string, unknown[]]>;
    for (const [sql, params] of calls.slice(1)) {
      expect(params.slice(0, 2)).toEqual(["tenant-A", null]);
      expect(sql).not.toMatch(/DATE\(/);
      expect(sql).not.toContain("OR $1 IS NULL");
    }
    expect(calls[1]![0]).toContain("login_time < ($4::date + INTERVAL '1 day')");
  });

  it("maps PostgreSQL numeric costs to numbers and predictive fields to domain names", async () => {
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes("FROM work_orders") ? [{ cost: "12.50", created_at: new Date() }] : [{ type: "disk", score: 0.9 }] }));
    const repository = new MaintenanceRepository({ query } as unknown as Pool);
    expect((await repository.listWorkOrders("tenant", undefined, { branchNodeId: "A", from: "2026-01-01" }))[0]?.cost).toBe(12.5);
    expect(query.mock.calls[0]![0]).toContain("branch_node_id = $3");
    expect((await repository.listPredictiveAlerts("tenant"))[0]).toMatchObject({ type: "disk", score: 0.9 });
    expect(query.mock.calls[1]![0]).toContain("failure_probability::float8 AS score");
  });

  it("short-circuits explicitly empty analytics scopes", async () => {
    const query = vi.fn();
    const repository = new AnalyticsRepository({ query } as unknown as Pool);
    expect(await repository.listAlerts("tenant", { cameraIds: [], limit: 10 })).toEqual([]);
    expect(await repository.listAlerts("tenant", { branchIds: [], limit: 10 })).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it("uses a single primary camera per incident before limiting report rows", async () => {
    const query = vi.fn(async (..._args: any[]) => ({ rows: [] }));
    await new IncidentRepository({ query } as unknown as Pool).listIncidents("tenant", { branchIds: ["A"], limit: 10 });
    const sql = (query.mock.calls as unknown as Array<[string]>)[0]![0];
    expect(sql).toContain("ORDER BY COALESCE((to_jsonb(link)->>'is_primary')::boolean, false) DESC, link.added_at, link.id");
    expect(sql).toContain("inc.branch_id = ANY($2::uuid[])");
    expect(sql).not.toContain("LEFT JOIN incident_cameras icam ON");
  });

  it("filters analytics cameras before limiting, preserving visible report events", async () => {
    const app = Fastify();
    app.addHook("preHandler", async request => { (request as any).currentUser = { id: "user", tenantId: "tenant" }; });
    const listAnalyticsAlerts = vi.fn(async (_tenant: string, filters: any) => filters.cameraIds?.includes("visible") ? [{ cameraId: "visible", ruleId: "rule", occurrenceCount: 3 }] : []);
    const store: any = { listAccessibleNodes: async () => [{ id: "A", name: "Branch A", type: "branch" }], listCamerasByBranch: async () => [{ id: "visible" }], listAnalyticsAlerts, listAnalyticsRulesByCameraIds: async () => [{ id: "rule", detectionType: "intrusion" }] };
    await registerReportsRoutes(app, store);
    try {
      const response = await app.inject({ url: "/v1/reports/analytics/summary" });
      expect(response.statusCode).toBe(200);
      expect(response.json().totalEvents).toBe(3);
      expect(listAnalyticsAlerts.mock.calls[0]![1].cameraIds).toEqual(["visible"]);
    } finally { await app.close(); }
  });
});

describe("SLA aggregation regressions", () => {
  const params = () => ({ branchId: "A", branchName: "A", reportDate: "2026-01-01", windowStart: start, windowEnd: end,
    cameraIntervals: new Map([["camera", []]]), recordingIntervals: new Map(), recorderIntervals: [], internetIntervals: [],
    retentionCounts: { compliant: 0, nonCompliant: 0, unknown: 1 },
    alerts: { p1Count: 0, p2Count: 0, p3Count: 0, p4Count: 0, acknowledgedCount: 0, resolvedCount: 0, p1Breaches: 0, p2Breaches: 0, meanAckSeconds: 0, meanResolutionSeconds: 0 },
  });
  it("returns null for fully unknown availability and retention", async () => {
    const service = new DailyBranchHealthAggregatorService();
    const result = await service.aggregateBranch(params());
    expect(result).toMatchObject({ cameraAvailabilityPct: null, recordingAvailabilityPct: null, cameraMonitoringCoveragePct: 0, slaStatus: "UNKNOWN" });
    expect((await service.getCameraDailyBreakdown("A", "2026-01-01"))[0]).toMatchObject({ retentionDays: null, retentionCompliant: null });
  });
  it("clips ongoing outages to the report window and clears removed cameras on re-aggregation", async () => {
    const service = new DailyBranchHealthAggregatorService();
    const input = params();
    input.cameraIntervals = new Map([["camera", [{ state: "FAILED", startedAt: date("2025-12-31T00:00:00Z") }]]]) as any;
    await service.aggregateBranch(input);
    expect((await service.getCameraDailyBreakdown("A", "2026-01-01"))[0]).toMatchObject({ outageCount: 1, longestOutageSeconds: 3600 });
    await service.aggregateBranch({ ...input, cameraIntervals: new Map() });
    expect(await service.getCameraDailyBreakdown("A", "2026-01-01")).toEqual([]);
  });
});

describe("daily surveillance alert scope", () => {
  it("loads every selected-period alert page and reports unknown historical durations", async () => {
    vi.spyOn(BranchOperationalSnapshotService.prototype, "getBranchSnapshot").mockResolvedValue({
      branchId: "A", branchCode: "A", branchName: "Branch A", overallState: "WARNING", reasonCodes: [],
      network: { state: "OFFLINE", observedAt: "2026-01-01T00:30:00Z" }, recorders: { total: 0, online: 0, state: "UNKNOWN", recorders: [] },
      cameras: { state: "UNKNOWN", notRecording: 0 }, storage: { state: "UNKNOWN", criticalDisks: [] }, retention: { state: "UNKNOWN" },
      alerts: { p1Count: 0, p2Count: 0, recentCritical: [] }, cameraList: [{ id: "camera", name: "Camera", onlineStatus: "offline", state: "UNKNOWN", recordingStatus: "unknown" }],
    } as any);
    const makeAlert = (id: string) => ({ id, cameraId: "camera", severity: "P2", status: "resolved", firstDetectedAt: "2026-01-01T00:10:00Z", lastDetectedAt: "2026-01-01T00:10:00Z", acknowledgedAt: "2026-01-01T00:11:00Z", slaDueAt: "2026-01-01T00:15:00Z" });
    const listAnalyticsAlerts = vi.fn(async (_tenant: string, filters: any) => filters.offset === 0 ? Array.from({ length: 1000 }, (_, i) => makeAlert(String(i))) : [makeAlert("last")]);
    const store: any = { listOrganizationNodes: async () => [{ id: "A", name: "Branch A", tenantId: "tenant", type: "branch", path: [] }], listNodesByIds: async () => [], getNode: async () => undefined, listLatestOperationalTelemetry: async () => [], listAnalyticsAlerts, listCamerasByIds: async () => [{ id: "camera", branchId: "A" }] };
    const report = await new DailySurveillanceCollectorService(undefined, store).collect({ tenantId: "tenant", periodStart: start, periodEnd: end });
    expect(report.alerts).toHaveLength(1001);
    expect(listAnalyticsAlerts.mock.calls[0]![1]).toMatchObject({ branchIds: ["A"], from: start.toISOString(), to: end.toISOString() });
    expect(report.alerts.every(alert => !alert.slaBreached)).toBe(true);
    expect(report.internetOutages[0]).toMatchObject({ startedAt: undefined, durationSeconds: undefined });
    expect(report.cameras[0]).toMatchObject({ availabilityPercent: null, downtimeMinutes: null, outageCount: null });
    expect(renderDailySurveillanceHealthCsv(report, "DAILY_INTERNET_CONNECTIVITY").toString()).not.toContain("1800");
    expect(renderDailySurveillanceHealthCsv(report, "DAILY_CAMERA_AVAILABILITY").toString()).not.toContain("1440");
  });
});


describe("historical trend regressions", () => {
  it.each(["executive-kpi", "financial", "benchmarking", "compliance"])("uses scoped canonical data for %s", async reportType => {
    const app = Fastify();
    app.addHook("preHandler", async request => { (request as any).currentUser = { tenantId: "tenant" }; });
    const query = vi.fn(async (..._args: any[]) => ({ rows: [{ month: "2026-02" }, { month: "2026-01" }] }));
    createHistoricalTrendsRoutes(app, { query } as unknown as Pool, { listAccessibleNodes: async () => [{ id: "A" }] } as any);
    try {
      const response = await app.inject({ url: `/trends?reportType=${reportType}&months=2` });
      expect(response.statusCode).toBe(200);
      expect(response.json().trends).toEqual([{ month: "2026-01" }, { month: "2026-02" }]);
      const [sql, params] = query.mock.calls[0]!;
      expect(params).toEqual(["tenant", 2, ["A"]]);
      expect(sql).toContain("ANY($3::uuid[])");
      expect(sql).not.toContain("FROM nodes");
      expect(sql).not.toContain("maintenance_records");
      expect(sql).not.toContain("deleted_at");
      if (reportType === "benchmarking") {
        expect(sql).toContain("ROW_NUMBER() OVER (PARTITION BY month");
        expect(sql).not.toContain("LEFT JOIN cameras c");
      }
      if (reportType === "executive-kpi") expect(sql).toContain("COALESCE(md.month, mc.month)");
      if (reportType === "financial") expect(sql).toContain("NULL::numeric AS capex");
      if (reportType === "compliance") expect(sql).toContain("FROM recording_status_daily");
    } finally { await app.close(); }
  });

  it("weights MIS SLA by evaluated incidents and resolves acknowledgement from history", async () => {
    const app = Fastify();
    app.addHook("preHandler", async request => { (request as any).currentUser = { tenantId: "tenant" }; });
    const queries: string[] = [];
    const pool = { query: async (sql: string) => {
      queries.push(sql);
      return { rows: sql.includes("FROM resource_nodes node") ? [
        { id: "org", parent_id: null, node_type: "company", name: "Org" },
        { id: "A", parent_id: "org", node_type: "branch", name: "A" },
        { id: "B", parent_id: "org", node_type: "branch", name: "B" },
      ] : sql.includes("GROUP BY i.branch_id") ? [
        { branch_id: "A", total_alerts: 1, p1_threats: 0, sla_percent: 100, sla_evaluated: 1 },
        { branch_id: "B", total_alerts: 9, p1_threats: 9, sla_percent: 0, sla_evaluated: 9 },
      ] : [] };
    } } as unknown as Pool;
    createMISUnifiedRoutes(app, pool, { listAccessibleNodes: async () => [{ id: "A" }, { id: "B" }] } as any);
    try {
      const response = await app.inject({ url: "/mis?groupBy=organization" });
      expect(response.statusCode).toBe(200);
      expect(response.json().summary.avgSla).toBe(10);
      expect(response.json().matrix[0].slaPercent).toBe(10);
      expect(queries.find(sql => sql.includes("GROUP BY i.branch_id"))).toContain("FROM incident_status_history history");
    } finally { await app.close(); }
  });
});


describe("report query efficiency and missing evidence", () => {
  it("enqueues all recipients in one query and handles duplicates in input order", async () => {
    const timestamp = "2026-01-01T00:00:00Z";
    const query = vi.fn(async (_sql: string, params: any[]) => ({ rows: params[3].map((recipient: string, i: number) => ({ id: String(i), tenant_id: "tenant", run_id: "run", recipient, created_at: timestamp, updated_at: timestamp, next_attempt_at: timestamp })) }));
    const repository = new OperationalReportRepository({ query } as unknown as Pool);
    const input = ["a@example.com", "b@example.com", "a@example.com"].map(recipient => ({ tenantId: "tenant", runId: "run", recipient }));
    const deliveries = await repository.enqueueDeliveries(input);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]![1][3]).toEqual(["a@example.com", "b@example.com"]);
    expect(deliveries.map(delivery => delivery.recipient)).toEqual(input.map(item => item.recipient));
    expect(await repository.enqueueDeliveries([])).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("does not round a small ingestion rate to zero before forecasting", async () => {
    const store: any = { writeAudit: vi.fn(), listCameras: async () => [], listLatestOperationalTelemetry: async () => [{ branchId: "A", deviceId: "disk", metrics: { usedBytes: 1024 ** 3, dailyIngestBytes: 1024 ** 3 / 10 } }, { branchId: "B", metrics: { usedBytes: 999 * 1024 ** 3, dailyIngestBytes: 1024 ** 3 } }] };
    const report = await new ReportingEngine(store, logger).generateReport(config("capacity-forecast", { filters: { branchNodeId: "A" } }));
    expect(report.data.forecast.storage.predicted30Days).toBe(4);
  });

  it("does not invent an 85-day prediction when retention is missing, and preserves measured zero", () => {
    const branch = { branchId: "A", branchName: "A", daysUntilViolation: 2, state: "WARNING", requiredRetentionDays: 90 };
    const report = new RetentionReportService().generateDailyReport("2026-01-01", [branch, { ...branch, branchId: "B", worstRetentionDays: 0 }] as any);
    expect(report.predictedViolations7Days).toEqual([{ branchId: "B", branchName: "A", predictedDays: 0, daysUntilViolation: 2 }]);
  });
});


describe("SLA status includes all measured targets", () => {
  it("does not report compliance when the recorder is down or retention is noncompliant", async () => {
    const healthy: any[] = [{ entityId: "resource", entityType: "CAMERA", state: "HEALTHY", startedAt: start, endedAt: end }];
    const input: any = { branchId: "A", branchName: "A", reportDate: "2026-01-01", windowStart: start, windowEnd: end,
      cameraIntervals: new Map([["camera", healthy]]), recordingIntervals: new Map([["camera", healthy]]), internetIntervals: healthy,
      recorderIntervals: [{ ...healthy[0], state: "FAILED" }], retentionCounts: { compliant: 0, nonCompliant: 1, unknown: 0 },
      alerts: { p1Count: 0, p2Count: 0, p3Count: 0, p4Count: 0, acknowledgedCount: 0, resolvedCount: 0, p1Breaches: 0, p2Breaches: 0, meanAckSeconds: 0, meanResolutionSeconds: 0 } };
    const service = new DailyBranchHealthAggregatorService();
    expect((await service.aggregateBranch(input)).slaStatus).toBe("BREACH");
    expect((await service.aggregateBranch({ ...input, recorderIntervals: healthy })).slaStatus).toBe("BREACH");
    expect((await service.aggregateBranch({ ...input, recorderIntervals: healthy, retentionCounts: { compliant: 1, nonCompliant: 0, unknown: 0 } })).slaStatus).toBe("COMPLIANT");
  });
});
