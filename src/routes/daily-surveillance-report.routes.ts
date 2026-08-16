/**
 * Daily Surveillance Health Report - REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { dailySurveillanceReportService } from "../reporting/services/daily-surveillance-report.service.js";

export async function registerDailySurveillanceReportRoutes(app: FastifyInstance) {
  /**
   * POST /api/v1/reports/daily-surveillance-health/generate & /v1/reports/daily-surveillance-health/generate
   */
  const handleGenerate = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as any) || {};
    const tenantId = body.tenantId || "bank-corp";

    const record = await dailySurveillanceReportService.generate({
      tenantId,
      periodStart: body.periodStart ? new Date(body.periodStart) : undefined,
      periodEnd: body.periodEnd ? new Date(body.periodEnd) : undefined,
      timezone: body.timezone || "Asia/Kolkata",
      formats: body.formats || ["PDF", "XLSX", "CSV"],
      generatedBy: "API",
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
    const query = (request.query as any) || {};
    const tenantId = query.tenantId || "bank-corp";

    let list = dailySurveillanceReportService.listReports(tenantId);
    if (list.length === 0) {
      // Auto-generate if none exist
      const record = await dailySurveillanceReportService.generate({ tenantId, generatedBy: "API" });
      return reply.send({ success: true, data: record.data });
    }

    const first = list[0];
    const latest = first ? dailySurveillanceReportService.getReport(first.reportId) : undefined;
    return reply.send({ success: true, data: latest?.data });
  };

  app.get("/api/v1/reports/daily-surveillance-health/latest", handleGetLatest);
  app.get("/v1/reports/daily-surveillance-health/latest", handleGetLatest);

  /**
   * GET /api/v1/reports/daily-surveillance-health/:id & /v1/reports/daily-surveillance-health/:id
   */
  const handleGetById = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const record = dailySurveillanceReportService.getReport(params.id);

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
    const query = (request.query as any) || {};
    const tenantId = query.tenantId || "bank-corp";
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
    const schedule = dailySurveillanceReportService.saveSchedule({
      id: body.id || `sched-${Date.now()}`,
      tenantId: body.tenantId || "bank-corp",
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
