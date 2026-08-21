import type {
  AiOperationsBriefing,
  AttentionRequiredItem,
  Branch360Workspace,
  BranchOperationalView,
  CommandCenterSummary,
  LiveIncidentItem,
  UniversalSearchResult,
} from "../domain/command-center-summary.types.js";
import { alertIncidentRepository } from "../../incidents/index.js";
import type { ControlPlaneStore } from "../../control-plane-store.js";
import type { User } from "../../domain/models.js";
import { BranchOperationalSnapshotService } from "../../services/branch-operational-snapshot.production.service.js";

const percentage = (part: number, total: number): number => total > 0 ? Math.round((part / total) * 1000) / 10 : 0;

export class UnifiedOperationsService {
  async getCommandCenterSummary(tenantId: string, store?: ControlPlaneStore, user?: User): Promise<CommandCenterSummary> {
    const branches = await this.getFleetBranchSummaries(tenantId, store, user);
    const incidents = await alertIncidentRepository.list();
    const activeIncidents = incidents.filter((incident) => incident.status !== "RESOLVED" && (!incident.tenantId || incident.tenantId === tenantId));
    const healthyBranches = branches.filter((branch) => branch.operationalState === "HEALTHY").length;
    const warningBranches = branches.filter((branch) => branch.operationalState === "WARNING").length;
    const criticalBranches = branches.filter((branch) => branch.operationalState === "CRITICAL").length;
    const offlineBranches = branches.filter((branch) => branch.operationalState === "OFFLINE").length;
    const unprovisionedBranches = branches.filter((branch) => branch.operationalState === "NOT_PROVISIONED").length;
    const unknownBranches = branches.filter((branch) => ["UNKNOWN", "STALE", "MONITORING_INCOMPLETE"].includes(branch.operationalState)).length;
    const totalCameras = branches.reduce((sum, branch) => sum + branch.cameras.total, 0);
    const healthyCameras = branches.reduce((sum, branch) => sum + branch.cameras.healthy, 0);
    const offlineCameras = branches.reduce((sum, branch) => sum + branch.cameras.offline, 0);
    const degradedCameras = branches.reduce((sum, branch) => sum + branch.cameras.degraded, 0);
    const unknownCameras = branches.reduce((sum, branch) => sum + branch.cameras.unknown, 0);
    const recordingFailures = branches.reduce((sum, branch) => sum + branch.cameras.notRecording, 0);
    const totalRecorders = branches.reduce((sum, branch) => sum + branch.recorders.total, 0);
    const onlineRecorders = branches.reduce((sum, branch) => sum + branch.recorders.online, 0);
    const offlineRecorders = branches.reduce((sum, branch) => sum + branch.recorders.offline, 0);
    const totalDisks = branches.reduce((sum, branch) => sum + branch.storage.diskCount, 0);
    const warningDisks = branches.reduce((sum, branch) => sum + (branch.storage.smartWarningsCount ?? 0), 0);
    const criticalDisks = branches.filter((branch) => branch.storage.state === "CRITICAL").length;
    const healthyDisks = Math.max(0, totalDisks - warningDisks - criticalDisks);
    const observedRetention = branches.filter((branch) => branch.retention.observedDays !== undefined);
    const compliantRetention = observedRetention.filter((branch) => branch.retention.compliant === true).length;
    const warningRetention = observedRetention.filter((branch) => branch.retention.compliant === false && branch.operationalState === "WARNING").length;
    const violationRetention = observedRetention.filter((branch) => branch.retention.compliant === false && branch.operationalState === "CRITICAL").length;
    const networkOnline = branches.filter((branch) => branch.internet.state === "ONLINE").length;
    const networkFailover = branches.filter((branch) => branch.internet.state === "FAILOVER").length;
    const networkOffline = branches.filter((branch) => branch.internet.state === "OFFLINE").length;
    const latestTelemetry = branches.flatMap((branch) => branch.telemetry.lastReportedAt ? [branch.telemetry.lastReportedAt] : []).sort((a, b) => b.getTime() - a.getTime())[0];

    const liveIncidents: LiveIncidentItem[] = activeIncidents.map((incident) => ({
      id: incident.id,
      severityColor: String(incident.severity) === "P1" ? "RED" : String(incident.severity) === "P2" ? "ORANGE" : "YELLOW",
      branchCode: incident.branchId ?? "FLEET",
      branchName: incident.branchName ?? incident.branchId ?? "Fleet",
      headline: incident.rootCauseSummary ?? "Active surveillance incident",
      startedAgo: incident.startedAt ? `${Math.max(0, Math.round((Date.now() - new Date(incident.startedAt).getTime()) / 60_000))}m ago` : "Unknown",
      actionUrl: `/incidents/${incident.id}`,
    }));

    const attentionRequired: AttentionRequiredItem[] = [];
    for (const branch of branches) {
      const occurredAt = branch.telemetry.lastReportedAt;
      if (!occurredAt) continue;
      if (branch.cameras.offline > 0 || branch.cameras.notRecording > 0) attentionRequired.push({
        id: `camera-health:${branch.branchId}:${occurredAt.toISOString()}`,
        category: "RECORDING_FAILURE",
        severity: branch.cameras.offline > 0 ? "CRITICAL" : "WARNING",
        branchId: branch.branchId,
        branchName: branch.name,
        entityId: branch.branchId,
        entityType: "CAMERA",
        title: "Observed camera or recording failures",
        description: `${branch.cameras.offline} offline; ${branch.cameras.notRecording} not recording`,
        occurredAt,
        actionUrl: `/operations/branches/${branch.branchId}`,
      });
      if (branch.retention.compliant === false) attentionRequired.push({
        id: `retention:${branch.branchId}:${occurredAt.toISOString()}`,
        category: "RETENTION_VIOLATION",
        severity: "CRITICAL",
        branchId: branch.branchId,
        branchName: branch.name,
        entityId: branch.branchId,
        entityType: "STORAGE",
        title: "Observed retention is below policy",
        description: `${branch.retention.observedDays ?? "Unknown"} / ${branch.retention.requiredDays} days`,
        occurredAt,
        actionUrl: `/operations/branches/${branch.branchId}`,
      });
      if (branch.internet.state === "OFFLINE") attentionRequired.push({
        id: `network:${branch.branchId}:${occurredAt.toISOString()}`,
        category: "INTERNET_OUTAGE",
        severity: "CRITICAL",
        branchId: branch.branchId,
        branchName: branch.name,
        entityId: branch.branchId,
        entityType: "INTERNET",
        title: "Observed branch network outage",
        description: "The latest verified network telemetry is offline.",
        occurredAt,
        actionUrl: `/operations/branches/${branch.branchId}`,
      });
    }

    const criticalItemsCount = criticalBranches + offlineBranches + activeIncidents.length;
    const aiBriefing: AiOperationsBriefing = branches.length === 0 ? {
      status: "NORMAL",
      headline: "No authorized branches are available",
      summaryText: "No fleet state can be calculated until branch inventory and telemetry are available.",
      criticalItemsCount: 0,
      recommendedAction: "Verify branch onboarding and edge-agent connectivity.",
      items: [],
    } : criticalItemsCount > 0 ? {
      status: "CRITICAL_ISSUES",
      headline: `${criticalItemsCount} observed critical issue(s) require attention`,
      summaryText: "This briefing is derived from current branch telemetry and persisted incidents.",
      criticalItemsCount,
      recommendedAction: "Review affected branch workspaces.",
      items: branches.filter((branch) => ["CRITICAL", "OFFLINE"].includes(branch.operationalState)).map((branch) => ({
        branchId: branch.branchId,
        branchCode: branch.branchCode,
        branchName: branch.name,
        issue: `${branch.operationalState} branch health`,
        actionLabel: "Investigate",
      })).slice(0, 5),
    } : warningBranches > 0 ? {
      status: "ANOMALIES_DETECTED",
      headline: `${warningBranches} branch(es) have observed warnings`,
      summaryText: "Warnings are derived from current telemetry; unknown components are not counted as healthy.",
      criticalItemsCount: 0,
      recommendedAction: "Review warning branches and stale telemetry.",
      items: branches.filter((branch) => branch.operationalState === "WARNING").map((branch) => ({
        branchId: branch.branchId,
        branchCode: branch.branchCode,
        branchName: branch.name,
        issue: "Observed operational warning",
        actionLabel: "Review",
      })).slice(0, 5),
    } : {
      status: "NORMAL",
      headline: "No observed critical conditions",
      summaryText: unknownBranches > 0 ? `${unknownBranches} branch(es) still have unknown or stale telemetry.` : "All monitored components with current telemetry are healthy.",
      criticalItemsCount: 0,
      recommendedAction: unknownBranches > 0 ? "Restore missing telemetry coverage." : "Continue monitoring.",
      items: [],
    };

    const knownBranches = branches.filter((branch) => !["UNKNOWN", "STALE", "MONITORING_INCOMPLETE", "NOT_PROVISIONED"].includes(branch.operationalState));
    const fleetScore = knownBranches.length > 0 ? Math.round(knownBranches.reduce((sum, branch) => sum + branch.healthScore, 0) / knownBranches.length) : null;
    const cameraScore = totalCameras > 0 ? percentage(healthyCameras, totalCameras) : null;
    const recordingScore = totalCameras > 0 ? percentage(totalCameras - recordingFailures, totalCameras) : null;
    const networkScore = branches.length > 0 ? percentage(networkOnline + networkFailover, branches.length) : null;
    const storageScore = totalDisks > 0 ? percentage(healthyDisks, totalDisks) : null;
    const retentionScore = observedRetention.length > 0 ? percentage(compliantRetention, observedRetention.length) : null;
    const mandateDays = branches.map((branch) => branch.retention.requiredDays).filter((days) => days > 0).sort((a, b) => b - a)[0] ?? 0;

    return {
      generatedAt: new Date(),
      lastTelemetryTimestamp: latestTelemetry?.toISOString() ?? null,
      agentHeartbeatSecondsAgo: latestTelemetry ? Math.max(0, Math.round((Date.now() - latestTelemetry.getTime()) / 1000)) : null,
      fleetHealth: {
        score: fleetScore,
        trendPct: 0,
        subscores: { infrastructure: fleetScore, cameras: cameraScore, recording: recordingScore, network: networkScore, storage: storageScore, retention: retentionScore },
      },
      predictedFailuresSummary: { total: 0, highRiskCount: 0, mediumRiskCount: 0, horizon: null, nextLikelyFailure: null, allPredictions: [] },
      atRiskBranchesCount: criticalBranches + warningBranches + offlineBranches,
      atRiskTrend: 0,
      changeSinceYesterday: { camerasRestored: 0, camerasOffline: offlineCameras, branchesDegraded: warningBranches + criticalBranches, criticalIncidents: activeIncidents.filter((incident) => String(incident.severity) === "P1").length, predictedFailures: 0 },
      businessImpact: { branchesAffected: warningBranches + criticalBranches + offlineBranches, camerasAffected: offlineCameras + recordingFailures, surveillanceExposureMinutes: 0, complianceRisksCount: violationRetention, vaultOrAtmExposures: 0 },
      liveIncidents,
      aiBriefing,
      branches: { total: branches.length, healthy: healthyBranches, warning: warningBranches, critical: criticalBranches, offline: offlineBranches, maintenance: 0, unprovisioned: unprovisionedBranches, unknown: unknownBranches },
      cameras: { total: totalCameras, healthy: healthyCameras, working: healthyCameras, notWorking: totalCameras - healthyCameras, offline: offlineCameras, degraded: degradedCameras, recordingFailure: recordingFailures, maintenance: 0, unknown: unknownCameras, trendPct: 0 },
      recording: { healthyPct: recordingScore ?? 0, trendPct: 0, totalRecording: Math.max(0, totalCameras - recordingFailures), totalFailing: recordingFailures },
      recorders: { total: totalRecorders, online: onlineRecorders, offline: offlineRecorders, maintenance: 0 },
      storage: { healthyPct: storageScore ?? 0, trendPct: 0, totalDisks, healthy: healthyDisks, warning: warningDisks, critical: criticalDisks },
      retention: { compliancePct: retentionScore ?? 0, configuredMandateDays: mandateDays, policyTag: mandateDays > 0 ? `${mandateDays}d` : "Unknown", compliantBranches: compliantRetention, warningBranches: warningRetention, violationBranches: violationRetention },
      network: { online: networkOnline, failoverLte: networkFailover, offline: networkOffline },
      alerts: { p1Open: 0, p2Open: 0, unacknowledged: 0, suppressedToday: 0 },
      incidents: { active: activeIncidents.length, investigating: activeIncidents.filter((incident) => incident.status === "OPEN" || incident.status === "ACKNOWLEDGED").length, resolvedToday: 0 },
      attentionRequired,
    };
  }

  async getFleetBranchSummaries(tenantId: string, store?: ControlPlaneStore, user?: User): Promise<BranchOperationalView[]> {
    if (!store) return [];
    const nodes = user
      ? await store.listAccessibleNodes(user, "live:view", "branch")
      : typeof (store as { listOrganizationNodes?: unknown }).listOrganizationNodes === "function"
        ? await (store as unknown as { listOrganizationNodes: (tenantId: string, type: string, parent?: string, recursive?: boolean) => Promise<Array<{ id: string }>> }).listOrganizationNodes(tenantId, "branch", undefined, true)
        : [];
    const snapshots = new BranchOperationalSnapshotService(store);
    const incidents = await alertIncidentRepository.list();
    const views: BranchOperationalView[] = [];
    for (const node of nodes) {
      const snapshot = await snapshots.getBranchSnapshot(tenantId, node.id);
      if (!snapshot) continue;
      const unknown = (snapshot.cameraList ?? []).filter((camera) => camera.state === "UNKNOWN").length;
      const degraded = snapshot.cameras.warningCount;
      const lastReportedAt = snapshot.lastTelemetryAt ? new Date(snapshot.lastTelemetryAt) : undefined;
      const operationalState: BranchOperationalView["operationalState"] = snapshot.cameras.total === 0 ? "NOT_PROVISIONED"
        : snapshot.telemetryFreshness === "OUTDATED" ? "STALE" : snapshot.overallState;
      views.push({
        branchId: snapshot.branchId,
        branchCode: snapshot.branchCode,
        name: snapshot.branchName,
        region: snapshot.regionName ?? "Unassigned",
        operationalState,
        healthScore: snapshot.healthScore,
        risk: { level: "UNKNOWN" },
        internet: {
          state: snapshot.network.state,
          mode: snapshot.network.state === "FAILOVER" ? "FAILOVER" : snapshot.network.state === "UNKNOWN" ? undefined : "PRIMARY",
          latencyMs: snapshot.network.latencyMs,
          packetLossPct: snapshot.network.packetLossPct,
        },
        cameras: {
          total: snapshot.cameras.total,
          healthy: snapshot.cameras.healthyCount,
          working: snapshot.cameras.online,
          notWorking: snapshot.cameras.offline + degraded + unknown,
          offline: snapshot.cameras.offline,
          degraded,
          unknown,
          notRecording: snapshot.cameras.notRecording,
          maintenance: 0,
        },
        recording: {
          totalChannels: snapshot.cameras.total,
          recordingChannels: snapshot.cameras.recording,
          status: snapshot.cameras.total === 0 ? "NOT_PROVISIONED" : snapshot.cameras.notRecording > 0 ? "DEGRADED" : snapshot.cameras.recording === snapshot.cameras.total ? "HEALTHY" : "FAILED",
        },
        recorders: { total: snapshot.recorders.total, online: snapshot.recorders.online, offline: snapshot.recorders.offline },
        storage: {
          diskCount: snapshot.storage.disks.total,
          state: snapshot.storage.state,
          minFreePercent: snapshot.storage.capacity ? Math.max(0, 100 - snapshot.storage.capacity.usagePercent) : undefined,
          smartWarningsCount: snapshot.storage.disks.warning + snapshot.storage.disks.failed,
        },
        retention: {
          requiredDays: snapshot.retention.requiredDays,
          observedDays: snapshot.retention.minimumVerifiedDays,
          compliant: snapshot.retention.state === "UNKNOWN" ? undefined : snapshot.retention.state === "COMPLIANT",
          displayTag: snapshot.retention.minimumVerifiedDays === undefined ? "Unknown" : `${snapshot.retention.minimumVerifiedDays}d / ${snapshot.retention.requiredDays}d`,
        },
        alerts: { p1: snapshot.alerts.p1Count, p2: snapshot.alerts.p2Count },
        telemetry: {
          lastReportedAt,
          secondsAgo: lastReportedAt ? Math.max(0, Math.round((Date.now() - lastReportedAt.getTime()) / 1000)) : undefined,
          isStale: snapshot.telemetryFreshness === "STALE" || snapshot.telemetryFreshness === "OUTDATED",
        },
        openIncidents: incidents.filter((incident) => incident.branchId === snapshot.branchId && incident.status !== "RESOLVED").length,
      });
    }
    return views;
  }

  async getBranch360Workspace(branchId: string, tenantId: string, store?: ControlPlaneStore): Promise<Branch360Workspace | null> {
    if (!store) return null;
    const snapshotService = new BranchOperationalSnapshotService(store);
    const snapshot = await snapshotService.getBranchSnapshot(tenantId, branchId, true);
    if (!snapshot) return null;
    const [branches, telemetry, incidents] = await Promise.all([
      this.getFleetBranchSummaries(tenantId, store),
      store.listLatestOperationalTelemetry(tenantId, [branchId]),
      alertIncidentRepository.list(),
    ]);
    const branch = branches.find((item) => item.branchId === branchId);
    if (!branch) return null;
    const disks = telemetry.filter((item) => item.deviceType === "disk");
    const network = telemetry.find((item) => item.deviceType === "network" && item.metrics.role !== "backup") ?? telemetry.find((item) => item.deviceType === "network");
    const backupNetwork = telemetry.find((item) => item.deviceType === "network" && item.metrics.role === "backup");
    const activeIncidents = incidents.filter((incident) => incident.branchId === branchId && incident.status !== "RESOLVED");
    return {
      branch,
      cameras: (snapshot.cameraList ?? []).map((camera) => ({
        cameraId: camera.id,
        name: camera.name,
        channelNumber: Number(camera.channelNumber.replace(/\D/g, "")) || 0,
        operationalState: camera.state === "LIVE" || camera.state === "ONLINE" ? "HEALTHY" : camera.state === "OFFLINE" ? "OFFLINE" : camera.state === "UNKNOWN" ? "UNKNOWN" : "WARNING",
        isStreaming: camera.streamAvailable,
        isRecording: camera.recordingStatus === "recording",
        fps: camera.currentFps,
        lastRecordedAt: camera.lastRecordingAt,
      })),
      recorders: snapshot.recorders.recorders.map((recorder) => ({
        recorderId: recorder.id,
        model: recorder.name,
        status: recorder.state,
        channelsTotal: recorder.totalChannels,
        channelsRecording: recorder.recordingChannels,
      })),
      disks: disks.map((disk, index) => ({
        diskId: disk.deviceId,
        slot: typeof disk.metrics.slot === "number" ? disk.metrics.slot : index + 1,
        capacityTb: typeof disk.metrics.capacityGB === "number" ? disk.metrics.capacityGB / 1000 : undefined,
        freePercent: typeof disk.metrics.capacityGB === "number" && typeof disk.metrics.usedGB === "number" && disk.metrics.capacityGB > 0
          ? Math.max(0, Math.round((1 - disk.metrics.usedGB / disk.metrics.capacityGB) * 1000) / 10) : undefined,
        smartStatus: typeof disk.metrics.smartStatus === "string" ? disk.metrics.smartStatus : "unknown",
        retentionDays: typeof disk.metrics.retentionDays === "number" ? disk.metrics.retentionDays : undefined,
      })),
      network: {
        primaryIsp: typeof network?.metrics.ispName === "string" ? network.metrics.ispName : undefined,
        backupIsp: typeof backupNetwork?.metrics.ispName === "string" ? backupNetwork.metrics.ispName : undefined,
        currentMode: snapshot.network.state === "FAILOVER" ? "FAILOVER" : snapshot.network.state === "UNKNOWN" ? undefined : "PRIMARY",
        latencyMs: snapshot.network.latencyMs,
        packetLossPct: snapshot.network.packetLossPct,
        jitterMs: typeof network?.metrics.jitterMs === "number" ? network.metrics.jitterMs : undefined,
        vpnConnected: snapshot.network.vpn?.connected,
      },
      activeAlerts: [],
      activeIncidents: activeIncidents.map((incident) => ({
        id: incident.id,
        title: incident.rootCauseSummary ?? "Active surveillance incident",
        severity: String(incident.severity),
        startedAt: incident.startedAt ? new Date(incident.startedAt) : new Date(0),
        status: incident.status,
      })),
    };
  }

  async getUniversalSearch(query: string, tenantId: string, store?: ControlPlaneStore): Promise<UniversalSearchResult> {
    const normalized = query.trim().toLowerCase();
    const branches = await this.getFleetBranchSummaries(tenantId, store);
    const matches = branches.filter((branch) => [branch.name, branch.branchCode, branch.region].some((value) => value.toLowerCase().includes(normalized))).map((branch) => ({
      entityType: "BRANCH" as const,
      entityId: branch.branchId,
      title: branch.name,
      subtitle: `${branch.branchCode} • ${branch.region} • ${branch.operationalState}`,
      status: branch.operationalState,
      branchId: branch.branchId,
      navigationUrl: `/operations/branches/${branch.branchId}`,
    }));
    return { query, matches };
  }
}

export const unifiedOperationsService = new UnifiedOperationsService();
