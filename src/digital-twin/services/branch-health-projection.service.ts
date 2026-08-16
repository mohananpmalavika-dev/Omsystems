import type {
  BranchHealthProjection,
  TwinHealthState,
} from "../domain/twin-health.types.js";
import {
  DigitalTwinTopologyService,
  digitalTwinTopologyService,
} from "./digital-twin-topology.service.js";
import {
  TwinRootCauseAnalyzerService,
  twinRootCauseAnalyzerService,
} from "./twin-root-cause-analyzer.service.js";

export class BranchHealthProjectionService {
  constructor(
    private readonly topology: DigitalTwinTopologyService = digitalTwinTopologyService,
    private readonly analyzer: TwinRootCauseAnalyzerService = twinRootCauseAnalyzerService,
  ) {}

  getBranchProjection(branchId: string, now = new Date()): BranchHealthProjection {
    const nodes = this.topology.listNodes(branchId);
    const branchRoot = nodes.find((n) => n.type === "BRANCH");
    const incident = this.analyzer.analyzeBranch(branchId, now);

    let status: TwinHealthState = "HEALTHY";
    let summary = "All systems and recording services operational";

    if (incident) {
      status = incident.severity === "P1" ? "CRITICAL" : "WARNING";
      summary = `${incident.rootCauseNodeType.toLowerCase()} failure: ${incident.rootCauseReason}`;
    }

    const cameras = nodes.filter((n) => n.type === "CAMERA");
    const recorders = nodes.filter((n) => n.type === "RECORDER");
    const storage = nodes.filter((n) => n.type === "STORAGE");

    const impactedCameras = incident ? incident.impactedCamerasCount : cameras.filter((c) => c.health !== "HEALTHY").length;
    const impactedRecorders = incident ? incident.impactedRecordersCount : recorders.filter((r) => r.health !== "HEALTHY").length;
    const impactedStorage = storage.filter((s) => s.health !== "HEALTHY").length;
    const impactedServices = incident ? incident.impactedServices : [];

    return {
      branchId,
      status,
      summary,
      primaryRootCause: incident
        ? {
            nodeId: incident.rootCauseNodeId,
            nodeName: incident.rootCauseNodeName,
            nodeType: incident.rootCauseNodeType,
            reason: incident.rootCauseReason,
            startedAt: incident.startedAt,
            durationSeconds: incident.durationSeconds ?? 0,
          }
        : undefined,
      impacts: {
        recorders: impactedRecorders,
        cameras: impactedCameras,
        storage: impactedStorage,
        services: impactedServices,
      },
      suppressedAlertsCount: incident ? incident.suppressedAlertsCount : 0,
      lastUpdatedAt: now,
    };
  }

  listControlRoomBranches(now = new Date()): Array<{
    branchId: string;
    branchName: string;
    status: TwinHealthState;
    rootCause?: string | undefined;
    affectedCameras: number;
    affectedRecorders: number;
    affectedServices: string[];
    startedAt?: Date | undefined;
    durationSeconds?: number | undefined;
    suppressedAlerts: number;
  }> {
    const branchNodes = this.topology.listNodes().filter((n) => n.type === "BRANCH");
    return branchNodes.map((br) => {
      const proj = this.getBranchProjection(br.branchId, now);
      return {
        branchId: br.branchId,
        branchName: br.name,
        status: proj.status,
        rootCause: proj.primaryRootCause ? proj.primaryRootCause.reason : undefined,
        affectedCameras: proj.impacts.cameras,
        affectedRecorders: proj.impacts.recorders,
        affectedServices: proj.impacts.services,
        startedAt: proj.primaryRootCause?.startedAt,
        durationSeconds: proj.primaryRootCause?.durationSeconds,
        suppressedAlerts: proj.suppressedAlertsCount,
      };
    });
  }
}

export const branchHealthProjectionService = new BranchHealthProjectionService();
