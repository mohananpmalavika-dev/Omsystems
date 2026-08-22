/**
 * Alert Storm Suppressor Service
 * 
 * Sits after event normalization/deduplication and before notification dispatch.
 * Uses the Digital Twin dependency topology to suppress downstream cascading alerts
 * and aggregate them into single explainable Root-Cause Incidents.
 */

import type { SurveillanceAlert, CanonicalAlertType } from "../../alerts/domain/surveillance-alert.types.js";
import type { AlertIncident, SuppressionReason } from "../domain/alert-incident.types.js";
import { digitalTwinDependencyGraph, DigitalTwinDependencyGraph, TwinDependencyNode } from "../../digital-twin/dependency-graph.js";
import { alertIncidentRepository, AlertIncidentRepository } from "../repositories/alert-incident.repository.js";

const NEVER_SUPPRESS_TYPES: Set<CanonicalAlertType> = new Set([
  "FIRE",
  "SMOKE",
  "WEAPON_DETECTED",
  "VIOLENCE",
  "VAULT_ACCESS",
  "INTRUSION",
  "CAMERA_TAMPER",
]);

export class AlertStormSuppressorService {
  constructor(
    private readonly twin: DigitalTwinDependencyGraph = digitalTwinDependencyGraph,
    private readonly incidents: AlertIncidentRepository = alertIncidentRepository
  ) {}

  isNeverSuppressible(alertType: CanonicalAlertType): boolean {
    return NEVER_SUPPRESS_TYPES.has(alertType);
  }

  async processAlert(alert: SurveillanceAlert): Promise<{ alert: SurveillanceAlert; incident?: AlertIncident | undefined }> {
    // 1. Critical Physical Security alarms are NEVER suppressed
    if (this.isNeverSuppressible(alert.alertType)) {
      (alert as any).isSuppressed = false;
      (alert as any).suppressionStatus = "NONE";
      return { alert };
    }

    const sourceNodeId = (alert as any).sourceNodeId || alert.cameraId || alert.branchId;

    // 2. Query active failed ancestors in Digital Twin
    const failedAncestors = this.twin.getActiveFailedAncestors(sourceNodeId);

    if (failedAncestors.length > 0) {
      // Pick best root cause ancestor (closest to the root of failure)
      const rootAncestor = failedAncestors[failedAncestors.length - 1]!;
      const existingIncident = await this.incidents.findActiveByRootNode(alert.branchId, rootAncestor.id);

      const suppressionReason: SuppressionReason =
        rootAncestor.type === "ROUTER" || rootAncestor.type === "SWITCH"
          ? "UPSTREAM_NETWORK_FAILURE"
          : rootAncestor.type === "RECORDER"
          ? "RECORDER_UNAVAILABLE"
          : "UPSTREAM_NETWORK_FAILURE";

      (alert as any).isSuppressed = true;
      (alert as any).suppressionStatus = "SUPPRESSED";
      (alert as any).suppressionReason = suppressionReason;
      (alert as any).rootCauseAlertId = existingIncident?.rootCauseAlertId || `alert-root-${rootAncestor.id}`;
      (alert as any).incidentId = existingIncident?.id;
      (alert as any).suppressedAt = new Date();

      if (existingIncident) {
        existingIncident.suppressedAlertCount += 1;
        existingIncident.childAlertIds.push(alert.id);
        existingIncident.lastUpdatedAt = new Date();
        await this.incidents.update(existingIncident);
        await this.incidents.recordRelationship({
          incidentId: existingIncident.id,
          alertId: alert.id,
          relationship: "DEPENDENT_IMPACT",
          suppressionReason,
          recordedAt: new Date(),
        });
        return { alert, incident: existingIncident };
      }
    }

    // 3. Check if this alert itself is an upstream root failure (e.g., Router or NVR offline)
    const thisNode = this.twin.getNode(sourceNodeId);
    if (thisNode && (thisNode.type === "ROUTER" || thisNode.type === "RECORDER")) {
      // Mark node status as FAILED in Digital Twin
      this.twin.setNodeStatus(thisNode.id, "FAILED", alert.occurredAt);

      // Create root-cause Incident
      const blastRadius = this.twin.calculateBlastRadius(thisNode.id);
      const incidentId = `inc-${alert.branchId}-${Date.now()}`;
      const incident: AlertIncident = {
        id: incidentId,
        tenantId: alert.tenantId,
        branchId: alert.branchId,
        branchName: alert.branchName,
        category: thisNode.type === "ROUTER" ? "CONNECTIVITY_OUTAGE" : "RECORDER_FAILURE",
        severity: "P1",
        rootCauseNodeId: thisNode.id,
        rootCauseNodeType: thisNode.type,
        rootCauseAlertId: alert.id,
        rootCauseSummary: `${thisNode.name} (${thisNode.type}) Offline`,
        directImpactNodes: [thisNode.id],
        dependentImpactNodes: [],
        suppressedAlertCount: 0,
        childAlertIds: [],
        status: "OPEN",
        startedAt: alert.occurredAt,
        lastUpdatedAt: alert.occurredAt,
        blastRadius,
      };

      await this.incidents.create(incident);
      await this.incidents.recordRelationship({
        incidentId,
        alertId: alert.id,
        relationship: "ROOT_CAUSE",
        recordedAt: alert.occurredAt,
      });

      (alert as any).isSuppressed = false;
      (alert as any).suppressionStatus = "ROOT_CAUSE";
      (alert as any).incidentId = incidentId;

      return { alert, incident };
    }

    // Normal non-suppressed alert
    (alert as any).isSuppressed = false;
    (alert as any).suppressionStatus = "NONE";
    return { alert };
  }
}

export const alertStormSuppressorService = new AlertStormSuppressorService();
