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
}
