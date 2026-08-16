/**
 * Unified Operations Service
 * 
 * Central aggregation layer providing precomputed read models for the Unified
 * Surveillance Operating System product shell.
 */

import {
  CommandCenterSummary,
  AttentionRequiredItem,
  BranchOperationalView,
  Branch360Workspace,
  UniversalSearchResult,
} from "../domain/command-center-summary.types.js";
import { alertIncidentRepository } from "../../incidents/index.js";
import { maintenanceWindowRepository } from "../../maintenance/index.js";
import { hasExtendedInfrastructure, type ControlPlaneStore } from "../../control-plane-store.js";

export class UnifiedOperationsService {
  async getCommandCenterSummary(tenantId = "tenant-default", store?: ControlPlaneStore): Promise<CommandCenterSummary> {
    const incidents = await alertIncidentRepository.list();
    const activeIncidents = incidents.filter((i) => i.status !== "RESOLVED");
    const activeMaintenance = await maintenanceWindowRepository.list({ status: "ACTIVE" });

    const branches = await this.getFleetBranchSummaries(tenantId, store);

    const totalBranches = branches.length;
    const healthyBranches = branches.filter((b) => b.operationalState === "HEALTHY").length;
    const warningBranches = branches.filter((b) => b.operationalState === "WARNING").length;
    const criticalBranches = branches.filter((b) => b.operationalState === "CRITICAL").length;
    const offlineBranches = branches.filter((b) => b.operationalState === "OFFLINE").length;
    const maintenanceBranches = branches.filter((b) => b.operationalState === "MAINTENANCE").length;
    const unknownBranches = branches.filter((b) => b.operationalState === "UNKNOWN" || b.operationalState === "STALE").length;

    const totalCameras = branches.reduce((acc, b) => acc + (b.cameras?.total || 0), 0);
    const healthyCameras = branches.reduce((acc, b) => acc + (b.cameras?.healthy || 0), 0);
    const offlineCameras = branches.reduce((acc, b) => acc + (b.cameras?.offline || 0), 0);
    const recordingFailureCameras = branches.reduce((acc, b) => acc + (b.cameras?.notRecording || 0), 0);
    const maintenanceCameras = branches.reduce((acc, b) => acc + (b.cameras?.maintenance || 0), 0);

    const totalRecorders = branches.reduce((acc, b) => acc + (b.recorders?.total || 0), 0);
    const onlineRecorders = branches.reduce((acc, b) => acc + (b.recorders?.online || 0), 0);
    const offlineRecorders = branches.reduce((acc, b) => acc + (b.recorders?.offline || 0), 0);

    const totalDisks = branches.reduce((acc, b) => acc + (b.storage?.diskCount || 0), 0);
    const warningDisks = branches.filter((b) => b.storage?.state === "WARNING").length;
    const criticalDisks = branches.filter((b) => b.storage?.state === "CRITICAL").length;
    const healthyDisks = Math.max(0, totalDisks - warningDisks - criticalDisks);

    const compliantRetention = branches.filter((b) => b.retention?.compliant).length;
    const violationRetention = branches.filter((b) => !b.retention?.compliant && (b.cameras?.total || 0) > 0).length;

    const networkOnline = branches.filter((b) => b.internet?.state === "HEALTHY").length;
    const networkFailover = branches.filter((b) => b.internet?.mode === "FAILOVER_4G").length;
    const networkOffline = branches.filter((b) => b.internet?.state === "OFFLINE").length;

    const p1Alerts = branches.reduce((acc, b) => acc + (b.alerts?.p1 || 0), 0);
    const p2Alerts = branches.reduce((acc, b) => acc + (b.alerts?.p2 || 0), 0);

    const attentionRequired: AttentionRequiredItem[] = [];
    for (const incident of activeIncidents.slice(0, 5)) {
      attentionRequired.push({
        id: incident.id,
        category: "P1_ALERT",
        severity: "P1",
        branchId: incident.branchId || "default-branch",
        branchName: incident.branchName || "Active Branch",
        entityId: incident.rootCauseAlertId || incident.id,
        entityType: "INCIDENT",
        title: incident.rootCauseSummary || "Surveillance Exception Detected",
        description: incident.rootCauseSummary || "Incident triage active",
        occurredAt: incident.startedAt ? new Date(incident.startedAt) : new Date(),
        actionUrl: `/incidents/${incident.id}`,
      });
    }

    return {
      generatedAt: new Date(),
      branches: {
        total: totalBranches,
        healthy: healthyBranches,
        warning: warningBranches,
        critical: criticalBranches,
        offline: offlineBranches,
        maintenance: maintenanceBranches || activeMaintenance.length,
        unknown: unknownBranches,
      },
      cameras: {
        total: totalCameras,
        healthy: healthyCameras,
        offline: offlineCameras,
        recordingFailure: recordingFailureCameras,
        maintenance: maintenanceCameras,
        unknown: 0,
      },
      recorders: {
        total: totalRecorders,
        online: onlineRecorders,
        offline: offlineRecorders,
        maintenance: 0,
      },
      storage: {
        totalDisks,
        healthy: healthyDisks,
        warning: warningDisks,
        critical: criticalDisks,
      },
      retention: {
        requiredDays: 90,
        compliantBranches: compliantRetention,
        warningBranches: 0,
        violationBranches: violationRetention,
      },
      network: {
        online: networkOnline,
        failoverLte: networkFailover,
        offline: networkOffline,
      },
      alerts: {
        p1Open: p1Alerts,
        p2Open: p2Alerts,
        unacknowledged: p1Alerts + p2Alerts,
        suppressedToday: 0,
      },
      incidents: {
        active: activeIncidents.length,
        investigating: activeIncidents.filter((i) => i.status === "OPEN" || i.status === "ACKNOWLEDGED").length,
        resolvedToday: 0,
      },
      attentionRequired,
    };
  }

  async getFleetBranchSummaries(tenantId = "tenant-default", store?: ControlPlaneStore): Promise<BranchOperationalView[]> {
    if (store && hasExtendedInfrastructure(store)) {
      try {
        const nodes = await store.listOrganizationNodes(tenantId, "branch", undefined, true);
        if (Array.isArray(nodes)) {
          const views: BranchOperationalView[] = [];
          for (const node of nodes) {
            let cameras: any[] = [];
            try {
              if (typeof (store as any).listCamerasByBranchId === "function") {
                cameras = await (store as any).listCamerasByBranchId(node.id);
              }
            } catch {
              cameras = [];
            }

            const total = cameras.length;
            const healthy = cameras.filter((c: any) => c.status === "online").length;
            const offline = cameras.filter((c: any) => c.status === "offline").length;
            const notRecording = cameras.filter((c: any) => c.status === "degraded" || c.status === "alert").length;

            const isOffline = total > 0 && offline === total;
            const isCritical = notRecording > 0 || offline > 0;

            views.push({
              branchId: node.id,
              branchCode: (node as any).code || (node.name || "BR").slice(0, 8).toUpperCase(),
              name: node.name,
              region: (node as any).region || "Default Region",
              operationalState: isOffline ? "OFFLINE" : isCritical ? "WARNING" : "HEALTHY",
              internet: {
                state: isOffline ? "OFFLINE" : "HEALTHY",
                mode: "PRIMARY",
                latencyMs: isOffline ? 0 : 25,
              },
              cameras: {
                total,
                healthy,
                offline,
                notRecording,
                maintenance: 0,
              },
              recorders: {
                total: total > 0 ? 1 : 0,
                online: isOffline ? 0 : (total > 0 ? 1 : 0),
                offline: isOffline ? 1 : 0,
              },
              storage: {
                diskCount: total > 0 ? 2 : 0,
                state: isOffline ? "UNKNOWN" : "HEALTHY",
                minFreePercent: isOffline ? 0 : 45.0,
              },
              retention: {
                requiredDays: 90,
                observedDays: total > 0 ? 90.0 : 0,
                compliant: true,
              },
              alerts: {
                p1: 0,
                p2: 0,
              },
              openIncidents: 0,
              lastReportedAt: new Date(),
            });
          }
          return views;
        }
      } catch (error) {
        console.warn("Failed to list organization branches from store:", error);
      }
    }

    return [];
  }

  async getBranch360Workspace(branchId: string, tenantId = "tenant-default", store?: ControlPlaneStore): Promise<Branch360Workspace> {
    const summaries = await this.getFleetBranchSummaries(tenantId, store);
    const branch = summaries.find((b) => b.branchId === branchId) || {
      branchId,
      branchCode: branchId.slice(0, 8).toUpperCase(),
      name: `Branch ${branchId}`,
      region: "Default Region",
      operationalState: "HEALTHY" as const,
      internet: { state: "HEALTHY" as const, mode: "PRIMARY" as const, latencyMs: 25 },
      cameras: { total: 0, healthy: 0, offline: 0, notRecording: 0, maintenance: 0 },
      recorders: { total: 0, online: 0, offline: 0 },
      storage: { diskCount: 0, state: "HEALTHY" as const, minFreePercent: 50 },
      retention: { requiredDays: 90, observedDays: 90, compliant: true },
      alerts: { p1: 0, p2: 0 },
      openIncidents: 0,
      lastReportedAt: new Date(),
    };

    return {
      branch,
      cameras: [],
      recorders: [],
      disks: [],
      network: {
        primaryIsp: "Primary Enterprise Fiber",
        backupIsp: "Secondary 4G LTE",
        currentMode: branch.internet.mode,
        latencyMs: branch.internet.latencyMs,
        packetLossPct: 0.0,
        vpnConnected: branch.internet.state !== "OFFLINE",
      },
      activeAlerts: [],
      activeIncidents: [],
    };
  }

  async getUniversalSearch(query: string, tenantId = "tenant-default", store?: ControlPlaneStore): Promise<UniversalSearchResult> {
    const q = query.toLowerCase().trim();
    const matches: UniversalSearchResult["matches"] = [];

    if (!q) {
      return { query, matches: [] };
    }

    const branches = await this.getFleetBranchSummaries(tenantId, store);
    for (const b of branches) {
      if (b.name.toLowerCase().includes(q) || b.branchCode.toLowerCase().includes(q)) {
        matches.push({
          entityType: "BRANCH",
          entityId: b.branchId,
          title: `${b.name} (${b.branchCode})`,
          subtitle: `${b.region} • Status: ${b.operationalState} • ${b.cameras.total} Cameras`,
          status: b.operationalState,
          branchId: b.branchId,
          navigationUrl: `/operations/branches/${b.branchId}`,
        });
      }
    }

    return { query, matches };
  }
}

export const unifiedOperationsService = new UnifiedOperationsService();
