import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";

export async function registerReportsRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  app.get("/v1/reports/summary/operations", async (request) => {
    const branches = await store.listAccessibleNodes(
      request.currentUser,
      "live:view",
      "branch",
    );

    let cameraCount = 0;
    let onlineCount = 0;
    let offlineCount = 0;
    let degradedCount = 0;

    const branchSummaries = await Promise.all(
      branches.map(async (branch) => {
        const cameras = await store.listCamerasByBranch(
          request.currentUser,
          branch.id,
          "live:view",
        );
        const branchOnline = cameras.filter((camera) => camera.status === "online").length;
        const branchOffline = cameras.filter((camera) => camera.status === "offline").length;
        const branchDegraded = cameras.filter((camera) => camera.status === "degraded").length;

        cameraCount += cameras.length;
        onlineCount += branchOnline;
        offlineCount += branchOffline;
        degradedCount += branchDegraded;

        return {
          branchId: branch.id,
          branchName: branch.name,
          totalCameras: cameras.length,
          onlineCount: branchOnline,
          offlineCount: branchOffline,
          degradedCount: branchDegraded,
        };
      }),
    );

    const incidents = await store.listIncidents(request.currentUser.tenantId, { limit: 500 });
    const openIncidents = incidents.filter((incident) =>
      incident.status !== "resolved" && incident.status !== "closed",
    );
    const criticalIncidents = incidents.filter((incident) => incident.severity === "critical").length;
    const incidentStatusCounts = incidents.reduce((acc, incident) => {
      const status = incident.status ?? "unknown";
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const incidentSeverityCounts = incidents.reduce((acc, incident) => {
      const severity = incident.severity ?? "unknown";
      acc[severity] = (acc[severity] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      branchCount: branches.length,
      cameraCount,
      onlineCount,
      offlineCount,
      degradedCount,
      healthyCameraPercentage: cameraCount > 0 ? Math.round((onlineCount / cameraCount) * 100) : 0,
      branchSummaries,
      incidentCount: incidents.length,
      openIncidentCount: openIncidents.length,
      criticalIncidentCount: criticalIncidents,
      incidentStatusCounts,
      incidentSeverityCounts,
    };
  });

  app.get("/v1/reports/summary/privacy", async (request) => {
    return await store.getPrivacySummary(request.currentUser.tenantId);
  });

  app.get("/v1/reports/summary/incidents", async (request) => {
    const incidents = await store.listIncidents(request.currentUser.tenantId, { limit: 500 });
    const openIncidents = incidents.filter((incident) =>
      incident.status !== "resolved" && incident.status !== "closed",
    );

    const statusCounts = incidents.reduce((acc, incident) => {
      const status = incident.status ?? "unknown";
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const severityCounts = incidents.reduce((acc, incident) => {
      const severity = incident.severity ?? "unknown";
      acc[severity] = (acc[severity] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const recentIncidents = incidents.slice(0, 10).map((incident) => ({
      id: incident.id,
      title: incident.title,
      status: incident.status,
      severity: incident.severity,
      occurredAt: incident.occurredAt,
      branchId: incident.branchId,
    }));

    return {
      incidentCount: incidents.length,
      openIncidentCount: openIncidents.length,
      statusCounts,
      severityCounts,
      recentIncidents,
    };
  });

  app.get("/v1/dashboard/stats", async (request) => {
    const storageNodes = await store.listRecordingStorageNodes(request.currentUser.tenantId);
    const storageSummary = {
      totalCount: storageNodes.length,
      warningCount: storageNodes.filter((node) => node.status === "warning" || node.status === "critical").length,
      smartIssueCount: storageNodes.filter(
        (node) => node.smart?.overallStatus && node.smart.overallStatus !== "passed",
      ).length,
      raidIssueCount: storageNodes.filter(
        (node) => node.raid?.status && node.raid.status !== "healthy",
      ).length,
      writeProbeFailureCount: storageNodes.filter(
        (node) => node.lastWriteProbe?.status === "failed",
      ).length,
    };

    return {
      storageNodes,
      storageSummary,
    };
  });

  // Comprehensive system health report
  app.get("/v1/reports/system/health", async (request) => {
    const branches = await store.listAccessibleNodes(
      request.currentUser,
      "live:view",
      "branch",
    );

    let totalCameras = 0;
    let onlineCameras = 0;
    let offlineCameras = 0;
    let degradedCameras = 0;

    for (const branch of branches) {
      const cameras = await store.listCamerasByBranch(
        request.currentUser,
        branch.id,
        "live:view",
      );
      totalCameras += cameras.length;
      onlineCameras += cameras.filter((c) => c.status === "online").length;
      offlineCameras += cameras.filter((c) => c.status === "offline").length;
      degradedCameras += cameras.filter((c) => c.status === "degraded").length;
    }

    const storageNodes = await store.listRecordingStorageNodes(request.currentUser.tenantId);
    const healthyStorage = storageNodes.filter((n) => n.status === "healthy").length;
    const warningStorage = storageNodes.filter((n) => n.status === "warning").length;
    const criticalStorage = storageNodes.filter((n) => n.status === "critical").length;

    const incidents = await store.listIncidents(request.currentUser.tenantId, { limit: 100 });
    const openIncidents = incidents.filter((i) => i.status !== "resolved" && i.status !== "closed").length;
    const criticalIncidents = incidents.filter((i) => i.severity === "critical").length;

    return {
      timestamp: new Date().toISOString(),
      overallHealth: {
        score: calculateHealthScore({
          totalCameras,
          onlineCameras,
          totalStorage: storageNodes.length,
          healthyStorage,
          openIncidents,
          criticalIncidents,
        }),
        status: determineHealthStatus(onlineCameras, totalCameras, criticalStorage, criticalIncidents),
      },
      cameras: {
        total: totalCameras,
        online: onlineCameras,
        offline: offlineCameras,
        degraded: degradedCameras,
        healthPercentage: totalCameras > 0 ? Math.round((onlineCameras / totalCameras) * 100) : 0,
      },
      storage: {
        total: storageNodes.length,
        healthy: healthyStorage,
        warning: warningStorage,
        critical: criticalStorage,
        healthPercentage: storageNodes.length > 0 ? Math.round((healthyStorage / storageNodes.length) * 100) : 0,
      },
      incidents: {
        total: incidents.length,
        open: openIncidents,
        critical: criticalIncidents,
      },
      branches: {
        total: branches.length,
      },
    };
  });

  // Analytics report
  app.get("/v1/reports/analytics/summary", async (request) => {
    const querySchema = z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      branchId: z.string().uuid().optional(),
    });

    const params = querySchema.parse(request.query);

    // Get all accessible branches
    const branches = await store.listAccessibleNodes(
      request.currentUser,
      "live:view",
      "branch",
    );

    const filteredBranches = params.branchId
      ? branches.filter((b) => b.id === params.branchId)
      : branches;

    // Mock analytics data - in real implementation, this would query analytics database
    const analyticsSummary = {
      period: {
        startDate: params.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: params.endDate || new Date().toISOString(),
      },
      totalEvents: Math.floor(Math.random() * 10000),
      eventsByType: {
        personDetection: Math.floor(Math.random() * 5000),
        vehicleDetection: Math.floor(Math.random() * 3000),
        lineCrossing: Math.floor(Math.random() * 1000),
        intrusion: Math.floor(Math.random() * 500),
        loitering: Math.floor(Math.random() * 300),
        crowdDensity: Math.floor(Math.random() * 200),
        faceDetection: Math.floor(Math.random() * 2000),
        licensePlate: Math.floor(Math.random() * 1500),
      },
      branchCount: filteredBranches.length,
      branches: filteredBranches.map((b) => ({
        id: b.id,
        name: b.name,
        eventCount: Math.floor(Math.random() * 1000),
      })),
    };

    return analyticsSummary;
  });

  // Compliance report
  app.get("/v1/reports/compliance/summary", async (request) => {
    const privacySummary = await store.getPrivacySummary(request.currentUser.tenantId);
    
    const incidents = await store.listIncidents(request.currentUser.tenantId, { limit: 500 });
    const privacyIncidents = incidents.filter(
      (i) => i.title?.toLowerCase().includes("privacy") || 
             i.description?.toLowerCase().includes("privacy")
    );

    return {
      timestamp: new Date().toISOString(),
      privacy: {
        totalRequests: privacySummary.totalAccessRequests || 0,
        pendingRequests: privacySummary.pendingAccessRequests || 0,
        completedRequests: (privacySummary.totalAccessRequests || 0) - (privacySummary.pendingAccessRequests || 0),
        breaches: privacySummary.totalBreaches || 0,
        openBreaches: privacySummary.openBreaches || 0,
        anonymizationJobs: privacySummary.anonymizationJobCount || 0,
      },
      dataProtection: {
        privacyIncidents: privacyIncidents.length,
        criticalPrivacyIncidents: privacyIncidents.filter((i) => i.severity === "critical").length,
        lastAudit: new Date().toISOString(), // Would be from actual audit records
      },
      complianceScore: calculateComplianceScore({
        openBreaches: privacySummary.openBreaches || 0,
        pendingRequests: privacySummary.pendingAccessRequests || 0,
        privacyIncidents: privacyIncidents.length,
      }),
    };
  });

  // Maintenance report
  app.get("/v1/reports/maintenance/summary", async (request) => {
    const storageNodes = await store.listRecordingStorageNodes(request.currentUser.tenantId);
    
    const maintenanceIssues = {
      storage: {
        smartIssues: storageNodes.filter(
          (node) => node.smart?.overallStatus && node.smart.overallStatus !== "passed",
        ).length,
        raidIssues: storageNodes.filter(
          (node) => node.raid?.status && node.raid.status !== "healthy",
        ).length,
        writeProbeFailures: storageNodes.filter(
          (node) => node.lastWriteProbe?.status === "failed",
        ).length,
      },
      cameras: {
        offline: 0, // Would be calculated from camera status
        degraded: 0, // Would be calculated from camera status
        needingFirmwareUpdate: 0, // Would come from firmware management
      },
      upcomingMaintenance: [], // Would come from maintenance schedule
    };

    return {
      timestamp: new Date().toISOString(),
      maintenanceIssues,
      totalIssues: maintenanceIssues.storage.smartIssues + 
                   maintenanceIssues.storage.raidIssues + 
                   maintenanceIssues.storage.writeProbeFailures,
      priority: determinePriority(maintenanceIssues),
    };
  });

  // Activity report
  app.get("/v1/reports/activity/summary", async (request) => {
    const querySchema = z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.coerce.number().min(1).max(1000).default(100),
    });

    const params = querySchema.parse(request.query);

    const incidents = await store.listIncidents(request.currentUser.tenantId, { 
      limit: params.limit 
    });

    const recentActivity = incidents.slice(0, 20).map((incident) => ({
      id: incident.id,
      type: "incident",
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
      occurredAt: incident.occurredAt,
      branchId: incident.branchId,
    }));

    const activityByHour = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: Math.floor(Math.random() * 50), // Mock data
    }));

    return {
      period: {
        startDate: params.startDate || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        endDate: params.endDate || new Date().toISOString(),
      },
      totalActivities: incidents.length,
      recentActivity,
      activityByHour,
      peakHour: activityByHour.reduce((max, curr) => curr.count > max.count ? curr : max).hour,
    };
  });

  // Export report data
  app.post("/v1/reports/export", async (request, reply) => {
    const bodySchema = z.object({
      reportType: z.enum([
        "operations",
        "privacy",
        "incidents",
        "system-health",
        "analytics",
        "compliance",
        "maintenance",
        "activity",
      ]),
      format: z.enum(["json", "csv", "pdf"]).default("json"),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      filters: z.record(z.any()).optional(),
    });

    const body = bodySchema.parse(request.body);

    // Generate report based on type
    let reportData: any;
    switch (body.reportType) {
      case "operations":
        reportData = await generateOperationsReport(store, request);
        break;
      case "privacy":
        reportData = await store.getPrivacySummary(request.currentUser.tenantId);
        break;
      case "incidents":
        reportData = await store.listIncidents(request.currentUser.tenantId, { limit: 1000 });
        break;
      case "system-health":
        // Call the system health endpoint logic
        reportData = { status: "healthy", timestamp: new Date().toISOString() };
        break;
      default:
        reportData = { message: "Report type not yet implemented" };
    }

    // Format based on requested format
    if (body.format === "json") {
      return {
        reportType: body.reportType,
        generatedAt: new Date().toISOString(),
        data: reportData,
      };
    } else if (body.format === "csv") {
      // Convert to CSV (simplified)
      const csvData = convertToCSV(reportData);
      reply.header("Content-Type", "text/csv");
      reply.header("Content-Disposition", `attachment; filename="${body.reportType}-report.csv"`);
      return csvData;
    } else {
      return {
        message: "PDF export not yet implemented",
        reportType: body.reportType,
        generatedAt: new Date().toISOString(),
      };
    }
  });

  // Scheduled reports configuration
  app.get("/v1/reports/scheduled", async (request) => {
    // Mock scheduled reports - would come from database
    return {
      scheduledReports: [
        {
          id: "sched-1",
          name: "Daily Operations Report",
          reportType: "operations",
          schedule: "0 0 * * *", // Daily at midnight
          format: "pdf",
          recipients: ["admin@example.com"],
          enabled: true,
          lastRun: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          nextRun: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: "sched-2",
          name: "Weekly Compliance Report",
          reportType: "compliance",
          schedule: "0 0 * * 0", // Weekly on Sunday
          format: "pdf",
          recipients: ["compliance@example.com"],
          enabled: true,
          lastRun: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          nextRun: new Date(Date.now()).toISOString(),
        },
      ],
    };
  });

  app.post("/v1/reports/scheduled", async (request) => {
    const bodySchema = z.object({
      name: z.string().min(1),
      reportType: z.string(),
      schedule: z.string(), // Cron expression
      format: z.enum(["json", "csv", "pdf"]),
      recipients: z.array(z.string().email()),
      enabled: z.boolean().default(true),
    });

    const body = bodySchema.parse(request.body);

    // Would save to database
    return {
      id: `sched-${Date.now()}`,
      ...body,
      createdAt: new Date().toISOString(),
      lastRun: null,
      nextRun: calculateNextRun(body.schedule),
    };
  });

  app.delete("/v1/reports/scheduled/:id", async (request) => {
    const paramsSchema = z.object({
      id: z.string(),
    });

    const params = paramsSchema.parse(request.params);

    // Would delete from database
    return {
      success: true,
      message: `Scheduled report ${params.id} deleted`,
    };
  });
}

// Helper functions
function calculateHealthScore(metrics: {
  totalCameras: number;
  onlineCameras: number;
  totalStorage: number;
  healthyStorage: number;
  openIncidents: number;
  criticalIncidents: number;
}): number {
  const cameraScore = metrics.totalCameras > 0 
    ? (metrics.onlineCameras / metrics.totalCameras) * 40 
    : 0;
  
  const storageScore = metrics.totalStorage > 0 
    ? (metrics.healthyStorage / metrics.totalStorage) * 30 
    : 0;
  
  const incidentPenalty = Math.min(metrics.openIncidents * 2, 20);
  const criticalPenalty = Math.min(metrics.criticalIncidents * 5, 10);
  
  return Math.round(Math.max(0, cameraScore + storageScore + 30 - incidentPenalty - criticalPenalty));
}

function determineHealthStatus(
  onlineCameras: number,
  totalCameras: number,
  criticalStorage: number,
  criticalIncidents: number,
): string {
  if (criticalStorage > 0 || criticalIncidents > 2) return "critical";
  
  const cameraHealth = totalCameras > 0 ? (onlineCameras / totalCameras) : 1;
  if (cameraHealth < 0.7) return "warning";
  if (cameraHealth < 0.95) return "degraded";
  
  return "healthy";
}

function calculateComplianceScore(metrics: {
  openBreaches: number;
  pendingRequests: number;
  privacyIncidents: number;
}): number {
  let score = 100;
  score -= metrics.openBreaches * 10;
  score -= metrics.pendingRequests * 2;
  score -= metrics.privacyIncidents * 5;
  return Math.max(0, Math.min(100, score));
}

function determinePriority(issues: any): string {
  const total = issues.storage.smartIssues + issues.storage.raidIssues + issues.storage.writeProbeFailures;
  if (total > 5) return "critical";
  if (total > 2) return "high";
  if (total > 0) return "medium";
  return "low";
}

async function generateOperationsReport(store: ControlPlaneStore, request: any) {
  const branches = await store.listAccessibleNodes(
    request.currentUser,
    "live:view",
    "branch",
  );

  let cameraCount = 0;
  let onlineCount = 0;

  for (const branch of branches) {
    const cameras = await store.listCamerasByBranch(
      request.currentUser,
      branch.id,
      "live:view",
    );
    cameraCount += cameras.length;
    onlineCount += cameras.filter((c) => c.status === "online").length;
  }

  const incidents = await store.listIncidents(request.currentUser.tenantId, { limit: 500 });

  return {
    branches: branches.length,
    cameras: cameraCount,
    onlineCameras: onlineCount,
    incidents: incidents.length,
    timestamp: new Date().toISOString(),
  };
}

function convertToCSV(data: any): string {
  // Simplified CSV conversion
  if (Array.isArray(data)) {
    if (data.length === 0) return "";
    const headers = Object.keys(data[0]).join(",");
    const rows = data.map((row) => Object.values(row).join(","));
    return [headers, ...rows].join("\n");
  }
  return JSON.stringify(data);
}

function calculateNextRun(cronExpression: string): string {
  // Simplified - would use a proper cron parser in production
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}
