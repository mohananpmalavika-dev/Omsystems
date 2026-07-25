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

  app.get("/v1/maintenance/firmware/versions", async (request, reply) => {
    const firmwareManager = getFirmwareManager();
    const query = request.query as any;
    const versions = firmwareManager.getAvailableVersions(
      query.deviceType,
      query.manufacturer
    );
    return reply.send(versions);
  });

  app.post("/v1/maintenance/firmware/register-version", async (
    request,
    reply
  ) => {
    const firmwareManager = getFirmwareManager();
    const version = request.body as any;
    firmwareManager.registerFirmwareVersion(version);
    return reply.send({ success: true, message: "Firmware version registered" });
  });

  app.post("/v1/maintenance/firmware/check-compatibility", async (
    request,
    reply
  ) => {
    const firmwareManager = getFirmwareManager();
    const body = request.body as { deviceId: string; deviceModel?: string; currentVersion?: string; targetVersion?: string };
    const compatibility = await firmwareManager.checkCompatibility({
      firmwareVersionId: body.targetVersion ?? '',
      assetId: body.deviceId,
    });
    return reply.send(compatibility);
  });

  app.post("/v1/maintenance/firmware/create-deployment-plan", async (
    request,
    reply
  ) => {
    const firmwareManager = getFirmwareManager();
    const { firmwareVersionId, targetDevices, strategy, scheduleTime } = request.body as any;
    const plan = firmwareManager.createDeploymentPlan(
      firmwareVersionId,
      targetDevices,
      strategy,
      scheduleTime
    );
    return reply.send(plan);
  });

  app.post("/v1/maintenance/firmware/approve-plan/:planId", async (
    request,
    reply
  ) => {
    const firmwareManager = getFirmwareManager();
    const { approvedBy } = request.body as any;
    const { planId } = request.params as { planId: string };
    const success = firmwareManager.approvePlan(planId, approvedBy);
    return reply.send({ success, message: success ? "Plan approved" : "Approval failed" });
  });

  app.post("/v1/maintenance/firmware/start-deployment/:planId", async (
    request,
    reply
  ) => {
    const firmwareManager = getFirmwareManager();
    const { planId } = request.params as { planId: string };
    const success = firmwareManager.startDeployment(planId);
    return reply.send({ success, message: success ? "Deployment started" : "Deployment start failed" });
  });

  app.get("/v1/maintenance/firmware/deployment-status/:planId", async (
    request,
    reply
  ) => {
    const { planId } = request.params as { planId: string };
    const firmwareManager = getFirmwareManager();
    const status = firmwareManager.getDeploymentStatus(planId);
    return reply.send(status);
  });

  app.post("/v1/maintenance/firmware/rollback/:updateId", async (
    request,
    reply
  ) => {
    const { updateId } = request.params as { updateId: string };
    const firmwareManager = getFirmwareManager();
    const success = firmwareManager.rollbackDevice(updateId);
    return reply.send({ success, message: success ? "Rollback initiated" : "Rollback failed" });
  });

  app.get("/v1/maintenance/firmware/pending-approvals", async (request, reply) => {
    const firmwareManager = getFirmwareManager();
    const approvals = firmwareManager.getPendingApprovals();
    return reply.send(approvals);
  });

  // ============================================================================
  // Phase 7: Predictive Maintenance Routes
  // ============================================================================

  app.post("/v1/maintenance/predictive/analyze-storage", async (
    request,
    reply
  ) => {
    const predictiveEngine = getPredictiveEngine();
    const { deviceId, smartData } = request.body as { deviceId: string; smartData: any };
    const prediction = predictiveEngine.predictStorageFailure(deviceId, smartData);
    return reply.send(prediction);
  });

  app.post("/v1/maintenance/predictive/analyze-ups", async (request, reply) => {
    const predictiveEngine = getPredictiveEngine();
    const { deviceId, batteryData } = request.body as any;
    const prediction = predictiveEngine.predictUPSBatteryFailure(
      deviceId,
      batteryData
    );
    return reply.send(prediction);
  });

  app.post("/v1/maintenance/predictive/analyze-camera", async (
    request,
    reply
  ) => {
    const predictiveEngine = getPredictiveEngine();
    const { deviceId, cameraMetrics } = request.body as any;
    const prediction = predictiveEngine.predictCameraFailure(
      deviceId,
      cameraMetrics
    );
    return reply.send(prediction);
  });

  app.post("/v1/maintenance/predictive/detect-anomaly", async (
    request,
    reply
  ) => {
    const predictiveEngine = getPredictiveEngine();
    const {
      deviceId,
      metricName,
      actualValue,
      expectedValue,
      historicalStdDev,
    } = request.body as any;
    const anomaly = predictiveEngine.detectAnomaly(
      deviceId,
      metricName,
      actualValue,
      expectedValue,
      historicalStdDev
    );
    return reply.send(anomaly);
  });

  app.get("/v1/maintenance/predictive/predictions/:deviceId", async (
    request,
    reply
  ) => {
    const { deviceId } = request.params as { deviceId: string };
    const predictiveEngine = getPredictiveEngine();
    const predictions = predictiveEngine.getActivePredictions(deviceId);
    return reply.send(predictions);
  });

  app.get("/v1/maintenance/predictive/anomalies", async (request, reply) => {
    const predictiveEngine = getPredictiveEngine();
    const query = request.query as any;
    const anomalies = predictiveEngine.getRecentAnomalies(query.hours || 24);
    return reply.send(anomalies);
  });
}
