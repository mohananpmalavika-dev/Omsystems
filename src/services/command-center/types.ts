import type { Action } from "../../domain/models.js";
import type { TelemetryQuality } from "../../operational-health/types.js";

export type EvidenceCertainty = "confirmed" | "likely" | "possible" | "unknown";
export type CommandEntityType = "branch" | "power" | "ups" | "network" | "edge-agent" | "recorder" | "disk" | "camera";
export type CommandHealthStatus = "online" | "healthy" | "degraded" | "warning" | "offline" | "critical" | "unknown" | "maintenance";

export interface OperationalEntityNode {
  id: string;
  entityType: CommandEntityType;
  name: string;
  status: CommandHealthStatus;
  observedAt: string | null;
  source: string;
  quality: TelemetryQuality | "inventory";
  reasonCodes: string[];
  metrics: Record<string, string | number | boolean | null>;
}

export interface OperationalDependency {
  fromEntityId: string;
  toEntityId: string;
  relationship: "contains" | "depends_on" | "records_to" | "powered_by" | "connects_through";
  source: "inventory" | "telemetry";
}

export interface OperationalGraph {
  branch: { id: string; name: string; status: CommandHealthStatus };
  entities: OperationalEntityNode[];
  dependencies: OperationalDependency[];
  summary: {
    totalEntities: number;
    unhealthyEntities: number;
    totalCameras: number;
    unavailableCameras: number;
    recorders: number;
    offlineRecorders: number;
    networks: number;
    availableNetworks: number;
  };
  generatedAt: string;
}

export interface CommandEvidence {
  id: string;
  certainty: EvidenceCertainty;
  assertion: string;
  entityId: string | null;
  observedAt: string;
  source: string;
  quality: TelemetryQuality | "inventory" | "system";
  raw: Record<string, unknown>;
}

export interface CommandTimelineEvent {
  id: string;
  occurredAt: string;
  category: "telemetry" | "incident" | "predictive" | "maintenance";
  entityId: string | null;
  entityType: string;
  title: string;
  detail: string;
  severity: "info" | "warning" | "critical";
  certainty: "confirmed";
  source: string;
  evidenceId: string;
  raw: Record<string, unknown>;
}

export interface RootCauseAssessment {
  code: string;
  label: string;
  certainty: EvidenceCertainty;
  confidence: number;
  explanation: string;
  evidenceIds: string[];
}

export interface RecoveryEstimate {
  available: boolean;
  automatedMinutes: { minimum: number; maximum: number } | null;
  engineerAssistedMinutes: { minimum: number; maximum: number } | null;
  confidence: "high" | "medium" | "low" | "insufficient";
  basis: string[];
  missingInputs: string[];
  statement: string;
}

export type CommandActionType = "create_work_order" | "open_diagnostics" | "view_evidence" | "retry_recorder" | "notify_branch_manager";
export type CommandActionStatus = "proposed" | "approved" | "completed" | "failed" | "expired";

export interface CommandRecommendedAction {
  id: string;
  caseId: string;
  actionType: CommandActionType;
  title: string;
  reason: string;
  risk: "low" | "medium" | "high";
  requiredPermission: Action;
  expectedImpact: string;
  rollbackProcedure: string | null;
  approvalRequired: boolean;
  executionMode: "platform" | "manual" | "integration-required";
  status: CommandActionStatus;
  href?: string;
}

export interface CommandCenterDiagnosis {
  caseId: string;
  caseFingerprint: string;
  branch: { id: string; name: string };
  status: { label: string; certainty: "confirmed"; explanation: string };
  rootCause: RootCauseAssessment;
  evidence: CommandEvidence[];
  impact: {
    unavailableCameras: number;
    totalCameras: number;
    offlineRecorders: number;
    affectedEntityIds: string[];
    statement: string;
  };
  currentRecoveryActivity: string[];
  recoveryEstimate: RecoveryEstimate;
  recommendedActions: CommandRecommendedAction[];
  alternativeCauses: RootCauseAssessment[];
  missingEvidence: string[];
  lastUpdatedAt: string;
  graph: OperationalGraph;
  timeline: CommandTimelineEvent[];
}

export interface CommandCenterAnswer {
  conversationId: string;
  messageId: string;
  intent: "branch_diagnosis" | "evidence" | "history" | "priorities";
  question: string;
  answer: {
    status: string;
    rootCause: string;
    evidence: string[];
    impact: string;
    currentRecoveryActivity: string[];
    estimatedRecoveryTime: string;
    recommendedAction: string;
    confidence: number;
    alternativeCause: string;
    lastUpdatedAt: string;
  };
  diagnosis: CommandCenterDiagnosis;
}
