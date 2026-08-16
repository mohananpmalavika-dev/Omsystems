/**
 * Canonical Alert Incident & Root Cause Domain Contracts
 */

import type { TwinNodeType } from "../../digital-twin/dependency-graph.js";
import type { AlertSeverity } from "../../alerts/domain/operational-alert.types.js";

export type IncidentCategory =
  | "CONNECTIVITY_OUTAGE"
  | "RECORDER_FAILURE"
  | "STORAGE_CRITICAL"
  | "POWER_FAILURE"
  | "MASS_CAMERA_DISCONNECT";

export type IncidentStatus =
  | "OPEN"
  | "ACKNOWLEDGED"
  | "RECOVERING"
  | "RESOLVED";

export type SuppressionReason =
  | "UPSTREAM_NETWORK_FAILURE"
  | "RECORDER_UNAVAILABLE"
  | "POWER_FAILURE"
  | "STORAGE_FAILURE"
  | "EDGE_GATEWAY_FAILURE"
  | "MAINTENANCE_WINDOW"
  | "DUPLICATE_DEPENDENT_ALERT";

export interface IncidentBlastRadius {
  directRecorders: number;
  dependentCameras: number;
  dependentRecordingStreams: number;
  dependentAiPipelines: number;
}

export interface AlertIncident {
  id: string;
  tenantId: string;
  branchId: string;
  branchName: string;

  category: IncidentCategory;
  severity: AlertSeverity;

  rootCauseNodeId: string;
  rootCauseNodeType: TwinNodeType;
  rootCauseAlertId: string;
  rootCauseSummary: string;

  directImpactNodes: string[];
  dependentImpactNodes: string[];

  suppressedAlertCount: number;
  childAlertIds: string[];

  status: IncidentStatus;
  startedAt: Date;
  lastUpdatedAt: Date;
  acknowledgedAt?: Date | undefined;
  acknowledgedBy?: string | undefined;
  resolvedAt?: Date | undefined;

  blastRadius: IncidentBlastRadius;
}

export interface IncidentAlertRelationship {
  incidentId: string;
  alertId: string;
  relationship: "ROOT_CAUSE" | "DIRECT_IMPACT" | "DEPENDENT_IMPACT";
  suppressionReason?: SuppressionReason | undefined;
  recordedAt: Date;
}
