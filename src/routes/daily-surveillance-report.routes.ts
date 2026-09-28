/**
 * Daily Surveillance Health Report - REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { dailySurveillanceReportService } from "../reporting/services/daily-surveillance-report.service.js";
import type { ControlPlaneStore } from "../control-plane-store.js";

export async function registerDailySurveillanceReportRoutes(app: FastifyInstance, store: ControlPlaneStore) {
  const allowedBranches = async (request: FastifyRequest) => {
    const [exportable, viewable] = await Promise.all([
      store.listAccessibleNodes(request.currentUser, "analytics:export", "branch"),
      store.listAccessibleNodes(request.currentUser, "live:view", "branch"),
    ]);
    const visible = new Set(viewable.map((branch) => branch.id));
    return exportable.map((branch) => branch.id).filter((id) => visible.has(id));
  };
  const canManageTenantSchedules = async (request: FastifyRequest) =>
    (await store.listAccessibleNodes(request.currentUser, "analytics:export", "company"))
      .some((company) => company.tenantId === request.currentUser.tenantId);
  const canReadRecord = async (request: FastifyRequest, reportId: string) => {
    const record = dailySurveillanceReportService.getReport(reportId);
    if (!record || record.tenantId !== request.currentUser.tenantId || !record.scopeBranchIds) return undefined;
    const allowed = new Set(await allowedBranches(request));
    return allowed.size > 0 && record.scopeBranchIds.every((id) => allowed.has(id)) ? record : undefined;
  };
  /**
   * POST /api/v1/reports/daily-surveillance-health/generate & /v1/reports/daily-surveillance-health/generate
   */
  const handleGenerate = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as any) || {};
    const tenantId = request.currentUser.tenantId;
    const permitted = await allowedBranches(request);
    if (permitted.length === 0) return reply.code(403).send({ error: "forbidden" });
    if (body.filters?.branchId && !permitted.includes(body.filters.branchId)) {
      return reply.code(403).send({ error: "branch_forbidden" });
    }

    const record = await dailySurveillanceReportService.generate({
      tenantId,
      periodStart: body.periodStart ? new Date(body.periodStart) : undefined,
      periodEnd: body.periodEnd ? new Date(body.periodEnd) : undefined,
      timezone: body.timezone || "Asia/Kolkata",
      formats: body.formats || ["PDF", "XLSX", "CSV"],
      generatedBy: "API",
      filters: body.filters,
      scopeBranchIds: body.filters?.branchId ? [body.filters.branchId] : permitted,
      store,
    });

    return reply.status(201).send({
      success: true,
      data: {
        reportId: record.reportId,
        generatedAt: record.generatedAt,
        status: record.status,
        integrityHashSha256: record.integrityHashSha256,
        summary: record.data.executiveSummary,
        exceptionsCount: record.data.exceptionsRequiringAction.length,
        availableFormats: Object.keys(record.artifacts),
      },
    });
  };

  app.post("/api/v1/reports/daily-surveillance-health/generate", handleGenerate);
  app.post("/v1/reports/daily-surveillance-health/generate", handleGenerate);

  /**
   * GET /api/v1/reports/daily-surveillance-health/latest & /v1/reports/daily-surveillance-health/latest
   */
  const handleGetLatest = async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.currentUser.tenantId;
    const permitted = await allowedBranches(request);
    if (permitted.length === 0) return reply.code(403).send({ error: "forbidden" });

    const list = dailySurveillanceReportService.listReports(tenantId);
    const visible = [];
    for (const item of list) {
      const record = await canReadRecord(request, item.reportId);
      if (record) visible.push(record);
    }
    if (visible.length === 0) {
      // Auto-generate if none exist
      const record = await dailySurveillanceReportService.generate({
        tenantId,
        generatedBy: "API",
        scopeBranchIds: permitted,
        store,
      });
      return reply.send({ success: true, data: record.data });
    }

    const latest = visible.sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())[0];
    return reply.send({ success: true, data: latest?.data });
  };

  app.get("/api/v1/reports/daily-surveillance-health/latest", handleGetLatest);
  app.get("/v1/reports/daily-surveillance-health/latest", handleGetLatest);

  /**
   * GET /api/v1/reports/daily-surveillance-health/:id & /v1/reports/daily-surveillance-health/:id
   */
  const handleGetById = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const record = await canReadRecord(request, params.id);

    if (!record) {
      return reply.status(404).send({ success: false, error: "Report not found" });
    }

    return reply.send({ success: true, data: record.data });
  };

  app.get("/api/v1/reports/daily-surveillance-health/:id", handleGetById);
  app.get("/v1/reports/daily-surveillance-health/:id", handleGetById);

  /**
   * GET /api/v1/reports/daily-surveillance-health/:id/download & /v1/reports/daily-surveillance-health/:id/download
   */
  const handleDownload = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const query = (request.query as any) || {};
    const format = (query.format || "pdf").toLowerCase() as "pdf" | "xlsx" | "csv";
    if (!await canReadRecord(request, params.id)) {
      return reply.status(404).send({ success: false, error: "Report not found" });
    }

    const artifact = dailySurveillanceReportService.getArtifact(params.id, format);
    if (!artifact) {
      return reply.status(404).send({ success: false, error: `Artifact for format '${format}' not found` });
    }

    return reply
      .header("Content-Type", artifact.mimeType)
      .header("Content-Disposition", `attachment; filename="${artifact.filename}"`)
      .send(artifact.buffer);
  };

  app.get("/api/v1/reports/daily-surveillance-health/:id/download", handleDownload);
  app.get("/v1/reports/daily-surveillance-health/:id/download", handleDownload);

  /**
   * GET /api/v1/reports/daily-surveillance-health/schedules & /v1/reports/daily-surveillance-health/schedules
   */
  const handleGetSchedules = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!await canManageTenantSchedules(request)) return reply.code(403).send({ error: "forbidden" });
    const tenantId = request.currentUser.tenantId;
    const schedules = dailySurveillanceReportService.getSchedules(tenantId);
    return reply.send({ success: true, data: { schedules } });
  };

  app.get("/api/v1/reports/daily-surveillance-health/schedules", handleGetSchedules);
  app.get("/v1/reports/daily-surveillance-health/schedules", handleGetSchedules);

  /**
   * POST /api/v1/reports/daily-surveillance-health/schedules & /v1/reports/daily-surveillance-health/schedules
   */
  const handleSaveSchedule = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as any) || {};
    if (!await canManageTenantSchedules(request)) return reply.code(403).send({ error: "forbidden" });
    const schedule = dailySurveillanceReportService.saveSchedule({
      id: body.id || `sched-${Date.now()}`,
      tenantId: request.currentUser.tenantId,
      enabled: body.enabled !== false,
      dailyAt: body.dailyAt || "06:00",
      timezone: body.timezone || "Asia/Kolkata",
      formats: body.formats || ["PDF", "XLSX"],
      recipients: body.recipients || ["soc@bank-corp.internal"],
    });

    return reply.status(201).send({ success: true, data: { schedule } });
  };

  app.post("/api/v1/reports/daily-surveillance-health/schedules", handleSaveSchedule);
  app.post("/v1/reports/daily-surveillance-health/schedules", handleSaveSchedule);
}
