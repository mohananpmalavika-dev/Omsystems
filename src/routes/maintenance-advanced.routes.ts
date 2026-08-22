/**
 * Phase 3-7 Integration Examples
 * Demonstrates how to integrate all implemented phases into existing routes
 */

import type { FastifyInstance } from "fastify";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { getHealthMonitoring } from "../maintenance/health-monitor.js";
import { getReportingEngine } from "../maintenance/reporting-engine.js";
import { getFirmwareManager } from "../maintenance/firmware-manager.js";
import { getPredictiveEngine } from "../maintenance/predictive-engine.js";

/**
 * Example integration for Phase 3-7 routes
 * Add this to your routes directory or merge with existing maintenance routes
 */
export async function registerMaintenanceAdvancedRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  // ============================================================================
  // Phase 3: Health Monitoring Routes
  // ============================================================================

  app.get("/v1/maintenance/health/summary/:tenantId", async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const healthMonitor = getHealthMonitoring();
    const summary = await healthMonitor.getHealthSummary(tenantId);
    return reply.send(summary);
  });

  app.get("/v1/maintenance/health/metrics/:componentId", async (request, reply) => {
    const { componentId } = request.params as { componentId: string };
    const healthMonitor = getHealthMonitoring();
    const metrics = healthMonitor.getRecentMetrics(componentId, 60);
    return reply.send(metrics);
  });

  app.post("/v1/maintenance/health/record-metric", async (request, reply) => {
    const healthMonitor = getHealthMonitoring();
    const metric = request.body as any;
    healthMonitor.recordMetric(metric);
    return reply.send({ success: true, message: "Metric recorded" });
  });

  app.get("/v1/maintenance/health/trend/:componentId/:metricName", async (
    request,
    reply
  ) => {
    const params = request.params as { componentId: string; metricName: string };
    const healthMonitor = getHealthMonitoring();
    const trend = healthMonitor.analyzeTrend(
      params.componentId,
      params.metricName,
      120
    );
    return reply.send(trend);
  });

  app.get("/v1/maintenance/health/alerts", async (request, reply) => {
    const healthMonitor = getHealthMonitoring();
    const alerts = healthMonitor.getActiveAlerts();
    return reply.send(alerts);
  });

  app.post("/v1/maintenance/health/alerts/:alertId/acknowledge", async (
    request,
    reply
  ) => {
    const { alertId } = request.params as { alertId: string };
    const healthMonitor = getHealthMonitoring();
    healthMonitor.acknowledgeAlert(alertId);
    return reply.send({ success: true, message: "Alert acknowledged" });
  });

  // ============================================================================
  // Phase 5: Reporting Routes
  // ============================================================================
  // NOTE: Report generation moved to maintenance-reports.routes.ts to avoid duplication
  // NOTE: GET /v1/maintenance/reports/:reportId moved to maintenance-reports.routes.ts to avoid duplication

  app.get("/v1/maintenance/reports/:reportId/export/pdf", async (
    request,
    reply
  ) => {
    // TODO: Implement PDF export once reportingEngine has exportReportToPDF method
    return reply.status(501).send({ error: "PDF export not yet implemented" });
    /*
    const reportingEngine = getReportingEngine();
    const report = reportingEngine.getReport(request.params.reportId);
    if (!report) {
      return reply.status(404).send({ error: "Report not found" });
    }
    const pdfBuffer = await reportingEngine.exportReportToPDF(report);
    reply.header("Content-Type", "application/pdf");
    reply.header(
      "Content-Disposition",
      `attachment; filename="report-${report.reportId}.pdf"`
    );
    return reply.send(pdfBuffer);
    */
  });

  app.get("/v1/maintenance/reports/:reportId/export/json", async (
    request,
    reply
  ) => {
    // TODO: Implement JSON export once reportingEngine has exportReportToJSON method
    return reply.status(501).send({ error: "JSON export not yet implemented" });
    /*
    const reportingEngine = getReportingEngine();
    const report = reportingEngine.getReport(request.params.reportId);
    if (!report) {
      return reply.status(404).send({ error: "Report not found" });
    }
    const jsonString = await reportingEngine.exportReportToJSON(report);
    reply.header("Content-Type", "application/json");
    reply.header(
      "Content-Disposition",
      `attachment; filename="report-${report.reportId}.json"`
    );
    return reply.send(jsonString);
    */
  });

  // NOTE: GET /v1/maintenance/reports moved to maintenance-reports.routes.ts to avoid duplication

  // ============================================================================
  // Phase 6: Firmware Management Routes
  // ============================================================================
  // NOTE: All firmware routes moved to maintenance-firmware.routes.ts to avoid duplication

  // ============================================================================
  // Phase 7: Predictive Maintenance Routes
  // ============================================================================
  // NOTE: All predictive routes moved to maintenance-predictive.routes.ts to avoid duplication
}
