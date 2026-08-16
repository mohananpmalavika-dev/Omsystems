import type {
  InfrastructureIncident,
  TwinHealthState,
  TwinNode,
} from "../domain/twin-health.types.js";
import {
  DigitalTwinTopologyService,
  digitalTwinTopologyService,
} from "./digital-twin-topology.service.js";

export class TwinRootCauseAnalyzerService {
  private readonly activeIncidents = new Map<string, InfrastructureIncident>(); // key: branchId

  constructor(private readonly topology: DigitalTwinTopologyService = digitalTwinTopologyService) {}

  analyzeBranch(branchId: string, now = new Date()): InfrastructureIncident | null {
    const nodes = this.topology.listNodes(branchId);
    const failedNodes = nodes.filter((n) => n.health !== "HEALTHY");

    if (failedNodes.length === 0) {
      // Resolve any active incident
      const active = this.activeIncidents.get(branchId);
      if (active && active.status !== "RESOLVED") {
        active.status = "RESOLVED";
        active.resolvedAt = now;
        active.durationSeconds = Math.round((now.getTime() - active.startedAt.getTime()) / 1000);
      }
      return null;
    }

    // 1. Identify Root Cause Node
    // Sort failed nodes by firstFailureAt (earliest first) and upstream depth
    let rootCauseNode: TwinNode = failedNodes[0]!;
    let earliestTime = rootCauseNode.firstFailureAt?.getTime() ?? now.getTime();

    for (const node of failedNodes) {
      const upstreams = this.topology.getUpstreamNodes(node.id);
      const failedUpstream = upstreams.find((u) => u.health !== "HEALTHY");

      if (failedUpstream) {
        // If an upstream ancestor is failed, current node is a DEPENDENCY failure
        node.healthOrigin = "DEPENDENCY";
        node.rootCauseNodeId = failedUpstream.id;
      } else {
        // Root candidate
        const failTime = node.firstFailureAt?.getTime() ?? now.getTime();
        if (failTime <= earliestTime) {
          earliestTime = failTime;
          rootCauseNode = node;
        }
      }
    }

    // 2. Compute Blast Radius Downstream from Root Cause
    const downstream = this.topology.getDownstreamNodes(rootCauseNode.id);
    const directImpactedIds: string[] = [];
    const dependentImpactedIds: string[] = [];
    const impactedServices: string[] = [];

    let impactedRecorders = 0;
    let impactedCameras = 0;

    for (const node of downstream) {
      if (node.type === "RECORDER") {
        impactedRecorders++;
        directImpactedIds.push(node.id);
        node.health = "OFFLINE";
        node.healthOrigin = "DEPENDENCY";
        node.rootCauseNodeId = rootCauseNode.id;
      } else if (node.type === "CAMERA") {
        impactedCameras++;
        dependentImpactedIds.push(node.id);
        node.health = "OFFLINE";
        node.healthOrigin = "DEPENDENCY";
        node.rootCauseNodeId = rootCauseNode.id;
      } else if (node.type === "SERVICE") {
        impactedServices.push(node.name);
        node.health = "CRITICAL";
        node.healthOrigin = "DEPENDENCY";
        node.rootCauseNodeId = rootCauseNode.id;
      }
    }

    // Total child alarms suppressed (e.g. 3 alarms per camera/recorder: stream, recording, ping)
    const totalImpactedDevices = impactedRecorders + impactedCameras;
    const suppressedAlertsCount = totalImpactedDevices * 3;

    const startedAt = rootCauseNode.firstFailureAt ?? now;
    const durationSeconds = Math.round((now.getTime() - startedAt.getTime()) / 1000);

    const incident: InfrastructureIncident = {
      id: `inc-${branchId}-${rootCauseNode.id}`,
      tenantId: rootCauseNode.tenantId,
      branchId,
      status: "OPEN",
      severity: impactedServices.length > 0 || impactedRecorders > 0 ? "P1" : "P2",
      rootCauseNodeId: rootCauseNode.id,
      rootCauseNodeName: rootCauseNode.name,
      rootCauseNodeType: rootCauseNode.type,
      rootCauseReason: `${rootCauseNode.name} unreachable (ICMP/SNMP/TCP probe failed)`,
      impactedNodeIds: [...directImpactedIds, ...dependentImpactedIds],
      impactedRecordersCount: impactedRecorders,
      impactedCamerasCount: impactedCameras,
      impactedServices,
      suppressedAlertsCount,
      startedAt,
      durationSeconds,
    };

    this.activeIncidents.set(branchId, incident);
    return incident;
  }

  getActiveIncident(branchId: string): InfrastructureIncident | null {
    const inc = this.activeIncidents.get(branchId);
    return inc && inc.status !== "RESOLVED" ? inc : null;
  }
}

export const twinRootCauseAnalyzerService = new TwinRootCauseAnalyzerService();
