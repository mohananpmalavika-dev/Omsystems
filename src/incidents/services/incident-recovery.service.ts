/**
 * Incident Recovery & Reversible Suppression Service
 * 
 * Re-evaluates suppressed child devices upon root-cause recovery.
 * Resolves child alerts if the device recovered, or PROMOTES them to independent P2 alarms
 * if the device remains broken after upstream infrastructure restoration.
 */

import { alertIncidentRepository, AlertIncidentRepository } from "../repositories/alert-incident.repository.js";
import { digitalTwinDependencyGraph, DigitalTwinDependencyGraph } from "../../digital-twin/dependency-graph.js";

export interface RecoveryEvaluationResult {
  incidentId: string;
  recoveredCount: number;
  promotedCount: number;
  promotedAlertIds: string[];
}

export class IncidentRecoveryService {
  constructor(
    private readonly incidents: AlertIncidentRepository = alertIncidentRepository,
    private readonly twin: DigitalTwinDependencyGraph = digitalTwinDependencyGraph
  ) {}

  async handleRootCauseRecovery(
    incidentId: string,
    unrecoveredNodeIds: string[] = []
  ): Promise<RecoveryEvaluationResult> {
    const incident = await this.incidents.findById(incidentId);
    if (!incident) {
      return { incidentId, recoveredCount: 0, promotedCount: 0, promotedAlertIds: [] };
    }

    // Set Digital Twin root node to HEALTHY
    this.twin.setNodeStatus(incident.rootCauseNodeId, "HEALTHY");
    incident.status = "RECOVERING";

    const unrecoveredSet = new Set(unrecoveredNodeIds);
    let recoveredCount = 0;
    const promotedAlertIds: string[] = [];

    // Evaluate children
    for (const childAlertId of incident.childAlertIds) {
      // If child device is in unrecovered set, promote it
      const isStillBroken = unrecoveredNodeIds.some((brokenId) => childAlertId.includes(brokenId));
      if (isStillBroken) {
        promotedAlertIds.push(childAlertId);
      } else {
        recoveredCount++;
      }
    }

    incident.status = "RESOLVED";
    incident.resolvedAt = new Date();
    await this.incidents.update(incident);

    return {
      incidentId,
      recoveredCount,
      promotedCount: promotedAlertIds.length,
      promotedAlertIds,
    };
  }
}

export const incidentRecoveryService = new IncidentRecoveryService();
