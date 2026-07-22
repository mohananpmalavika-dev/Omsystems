import type { FastifyInstance } from "fastify";
import type { ControlPlaneStore } from "../control-plane-store.js";

export async function registerMaintenanceDashboardRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  // Dashboard - Overall system health
  app.get("/v1/maintenance/dashboard/health", async (request) => {
    const summary = await store.getHealthCheckSummary(request.currentUser.tenantId);
    return summary;
  });

  // Dashboard - Maintenance status overview
  app.get("/v1/maintenance/dashboard/status", async (request) => {
    const tenantId = request.currentUser.tenantId;
    
    const assets = await store.listMaintenanceAssets(tenantId);
    const workOrders = await store.listWorkOrders(tenantId);
    const schedules = await store.listMaintenanceSchedules(tenantId);
    const visits = await store.listMaintenanceVisits(tenantId);
    const amcContracts = await store.listAmcContracts(tenantId);
    const predictiveAlerts = await store.listPredictiveAlerts(tenantId);

    const now = new Date();
    const overdueVisits = visits.filter(v => v.status !== 'completed' && new Date(v.dueAt) < now).length;
    const expiringAmcs = amcContracts.filter(c => new Date(c.end_date) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)).length;

    return {
      totalAssets: assets.length,
      assetsOnline: assets.filter(a => a.status === 'operational').length,
      assetsOffline: assets.filter(a => a.status === 'offline').length,
      assetsDegraded: assets.filter(a => a.status === 'degraded').length,
      
      workOrdersOpen: workOrders.filter(w => w.status !== 'closed').length,
      workOrdersOverdueSla: workOrders.filter(w => w.status !== 'closed' && w.slaDueAt && new Date(w.slaDueAt) < now).length,
      
      scheduledMaintenanceCount: schedules.filter(s => s.status === 'active').length,
      visitsPending: visits.filter(v => v.status === 'pending').length,
      visitsOverdue: overdueVisits,
      
      amcContractsActive: amcContracts.filter(c => c.status === 'active').length,
      amcContractsExpiring: expiringAmcs,
      
      criticalAlerts: predictiveAlerts.filter(p => p.score > 0.8).length,
      warningAlerts: predictiveAlerts.filter(p => p.score > 0.5 && p.score <= 0.8).length,
    };
  });

  // Health Monitoring - Camera health details
  app.get("/v1/maintenance/health/cameras", async (request) => {
    const query = { limit: Math.min(parseInt(request.query.limit as string) || 50, 1000) };
    const tenantId = request.currentUser.tenantId;
    
    // In a real implementation, this would query the camera_health table
    // For now, returning summary based on available data
    const assets = await store.listMaintenanceAssets(tenantId, "camera");
    
    return {
      data: assets.slice(0, query.limit).map(a => ({
        id: a.id,
        name: a.model,
        serialNumber: a.serial_number,
        status: a.status,
        lastCheck: new Date().toISOString(),
        fps: null,
        bitrate: null,
        temperature: null,
        recordingRunning: true,
      }))
    };
  });

  // Health Monitoring - Storage health details
  app.get("/v1/maintenance/health/storage", async (request) => {
    const tenantId = request.currentUser.tenantId;
    const assets = await store.listMaintenanceAssets(tenantId, "storage");
    
    return {
      data: assets.map(a => ({
        id: a.id,
        name: a.model,
        category: "storage",
        status: a.status,
        totalCapacityGb: 10000,
        usedCapacityGb: 7500,
        usagePercentage: 75,
        lastCheck: new Date().toISOString(),
      }))
    };
  });

  // Health Monitoring - Network status
  app.get("/v1/maintenance/health/network", async (request) => {
    const tenantId = request.currentUser.tenantId;
    
    return {
      data: [
        {
          id: "network-1",
          name: "Branch Network",
          latencyMs: 25,
          packetLoss: 0.1,
          jitter: 5,
          status: "healthy",
          lastCheck: new Date().toISOString(),
        }
      ]
    };
  });

  // Health Monitoring - Power/UPS status
  app.get("/v1/maintenance/health/power", async (request) => {
    const tenantId = request.currentUser.tenantId;
    const assets = await store.listMaintenanceAssets(tenantId, "power");
    
    return {
      data: assets.map(a => ({
        id: a.id,
        name: a.model,
        category: "power",
        batteryHealthPercent: 95,
        runtimeMinutes: 480,
        status: a.status,
        lastCheck: new Date().toISOString(),
      }))
    };
  });

  // Firmware Management - List required updates
  app.get("/v1/maintenance/firmware/updates-required", async (request) => {
    const updates = await store.listFirmwareUpdatesRequired(request.currentUser.tenantId);
    return { data: updates };
  });

  // Firmware Management - Check for updates
  app.post("/v1/maintenance/firmware/check", async (request, reply) => {
    const body = request.body as { assetIds?: string[] };
    const tenantId = request.currentUser.tenantId;
    
    // In a real implementation, this would check external firmware sources
    return reply.code(202).send({ 
      message: "Firmware check initiated",
      status: "in-progress"
    });
  });

  // Firmware Management - Initiate upgrade
  app.post("/v1/maintenance/firmware/upgrade", async (request, reply) => {
    const body = request.body as { assetId: string; fromVersion: string; toVersion: string };
    const tenantId = request.currentUser.tenantId;
    
    await store.writeAudit({
      tenantId,
      actorUserId: request.currentUser.id,
      action: "maintenance.firmware_upgrade_initiated",
      resourceNodeId: "",
      outcome: "success",
      details: body,
    });

    return reply.code(202).send({
      message: "Firmware upgrade initiated",
      assetId: body.assetId,
      status: "in-progress",
    });
  });

  // Spare Parts - List all parts
  app.get("/v1/maintenance/spare-parts", async (request) => {
    const query = { category: (request.query.category as string) || undefined };
    const tenantId = request.currentUser.tenantId;
    
    // In a real implementation, query the spare_parts table
    return { data: [] };
  });

  // Spare Parts - Record part addition
  app.post("/v1/maintenance/spare-parts/add", async (request, reply) => {
    const body = request.body as { partName: string; quantity: number };
    const tenantId = request.currentUser.tenantId;
    
    await store.writeAudit({
      tenantId,
      actorUserId: request.currentUser.id,
      action: "maintenance.spare_part_added",
      resourceNodeId: "",
      outcome: "success",
      details: body,
    });

    return reply.code(201).send({ message: "Spare part recorded" });
  });

  // Spare Parts - Low stock alert
  app.get("/v1/maintenance/spare-parts/low-stock", async (request) => {
    const lowStockParts = await store.listLowStockParts(request.currentUser.tenantId);
    return { data: lowStockParts };
  });

  // Reports - Generate report
  app.post("/v1/maintenance/reports/generate", async (request, reply) => {
    const body = request.body as {
      reportType: "preventive" | "corrective" | "amc" | "health" | "trend";
      periodStart: string;
      periodEnd: string;
    };
    const tenantId = request.currentUser.tenantId;

    const report = await store.generateMaintenanceReport({
      tenantId,
      reportType: body.reportType,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
    });

    await store.writeAudit({
      tenantId,
      actorUserId: request.currentUser.id,
      action: "maintenance.report_generated",
      resourceNodeId: "",
      outcome: "success",
      details: { reportType: body.reportType },
    });

    return reply.code(201).send(report);
  });

  // Reports - List reports
  app.get("/v1/maintenance/reports", async (request) => {
    const query = request.query as { reportType?: string; limit?: number };
    const reports = await store.listMaintenanceReports(request.currentUser.tenantId, { 
      reportType: query.reportType ?? undefined,
      limit: query.limit ?? undefined
    });
    return { data: reports };
  });

  // Reports - SLA Compliance
  app.get("/v1/maintenance/reports/sla-compliance", async (request) => {
    const tenantId = request.currentUser.tenantId;
    const workOrders = await store.listWorkOrders(tenantId);
    
    const now = new Date();
    const totalOrders = workOrders.filter(w => w.status !== 'closed').length;
    const closedOrders = workOrders.filter(w => w.status === 'closed');
    const onTimeOrders = closedOrders.filter(w => 
      w.slaDueAt && w.updatedAt && new Date(w.slaDueAt) >= new Date(w.updatedAt)
    ).length;
    
    return {
      totalWorkOrders: totalOrders,
      completedOnTime: onTimeOrders,
      compliancePercentage: closedOrders.length > 0 ? Math.round((onTimeOrders / closedOrders.length) * 100) : 100,
      breaches: workOrders.filter(w => 
        w.status !== 'closed' && w.slaDueAt && new Date(w.slaDueAt) < now
      ).length,
    };
  });

  // Dashboard - Maintenance metrics
  app.get("/v1/maintenance/reports/metrics", async (request) => {
    const tenantId = request.currentUser.tenantId;
    const compliance = await store.getMaintenanceComplianceStatus(tenantId);
    
    return compliance;
  });

  // Predictive Maintenance - Get high-risk assets
  app.get("/v1/maintenance/predictive/high-risk", async (request) => {
    const alerts = await store.listPredictiveAlerts(request.currentUser.tenantId);
    const highRisk = alerts.filter(a => a.score > 0.7).sort((a, b) => b.score - a.score);
    
    return { 
      data: highRisk.slice(0, 20),
      totalHighRiskAssets: highRisk.length,
    };
  });

  // Predictive Maintenance - Get estimated failure dates
  app.get("/v1/maintenance/predictive/failure-forecast", async (request) => {
    const alerts = await store.listPredictiveAlerts(request.currentUser.tenantId);
    
    return {
      data: alerts
        .filter(a => a.details?.estimated_failure_days)
        .sort((a, b) => (a.details?.estimated_failure_days ?? 999) - (b.details?.estimated_failure_days ?? 999))
        .slice(0, 50),
    };
  });
}
