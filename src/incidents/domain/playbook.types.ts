/**
 * Stateful Incident Playbook & Operator SOP Engine Domain Types
 * (Modeled after Genetec Mission Control / Enterprise Bank Security SOC)
 */

import type { IncidentStatus } from "./alert-incident.types.js";

export type PlaybookStepType =
  | "OPERATOR_ACTION"
  | "AUTOMATED_CHECK"
  | "EVIDENCE_REVIEW"
  | "LIVE_VIDEO_REVIEW"
  | "DECISION"
  | "FORM"
  | "APPROVAL"
  | "NOTIFICATION"
  | "EXTERNAL_CALL"
  | "TIMER"
  | "PARALLEL"
  | "ESCALATION"
  | "RESOLUTION_GATE";

export type StepStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "OVERRIDDEN"
  | "SKIPPED"
  | "BLOCKED"
  | "FAILED";

export type PlaybookInstanceStatus =
  | "PENDING"
  | "RUNNING"
  | "WAITING"
  | "BLOCKED"
  | "COMPLETED"
  | "CANCELLED";

export type IncidentSeverity = "P1" | "P2" | "P3" | "P4" | "P5";

export interface PlaybookStepDefinition {
  id: string;
  order: number;
  type: PlaybookStepType;
  title: string;
  description: string;
  mandatory: boolean;
  assignedRole?: string;
  estimatedDurationSeconds?: number;
  dependsOn?: string[]; // Step IDs that must complete first
  evidenceRequirements?: {
    videoBeforeSeconds?: number;
    videoAfterSeconds?: number;
    snapshotRequired?: boolean;
    requireLiveVerification?: boolean;
  };
  decisionOutputs?: {
    choice: string;
    label: string;
    nextStepId?: string;
    requireNotes?: boolean;
    requireEvidenceId?: boolean;
  }[];
  automatedAction?: {
    service: string;
    method: string;
    params?: Record<string, any>;
  };
  parallelBranches?: string[];
  parallelCompletionPolicy?: "ALL" | "ANY" | "N_OF_M";
  parallelRequiredCount?: number;
  escalationTimeoutSeconds?: number;
}

export interface PlaybookDefinition {
  id: string;
  name: string;
  version: number;
  description: string;
  category: "banking_security" | "access_control" | "device_health" | "fire_safety";
  trigger: {
    incidentType: string;
    severity?: IncidentSeverity;
    timeWindow?: "ANY" | "BUSINESS_HOURS" | "AFTER_HOURS";
    branchType?: string[];
  };
  resolutionPolicy: {
    requireMandatorySteps: boolean;
    allowOverride: boolean;
    overridePermission: string;
    requireClassification: boolean;
    requireRootCause: boolean;
  };
  steps: PlaybookStepDefinition[];
  createdAt: string;
  updatedAt: string;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
}

export interface StepInstance {
  stepId: string;
  order: number;
  type: PlaybookStepType;
  title: string;
  description: string;
  mandatory: boolean;
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  completedBy?: {
    userId: string;
    userName: string;
    role?: string;
  };
  resultJson?: Record<string, any>;
  evidenceLinked?: {
    clipId?: string;
    snapshotId?: string;
    cameraId?: string;
    viewDurationSeconds?: number;
  };
  overrideInfo?: {
    requestedBy: string;
    approvedBy: string;
    reasonCode: string;
    justification: string;
    timestamp: string;
  };
}

export interface PlaybookInstance {
  instanceId: string;
  incidentId: string;
  tenantId: string;
  playbookId: string;
  playbookName: string;
  playbookVersion: number;
  status: PlaybookInstanceStatus;
  currentStepIds: string[];
  completedStepIds: string[];
  stepInstances: Record<string, StepInstance>;
  contextData: Record<string, any>;
  startedAt: string;
  completedAt?: string;
  version: number; // Optimistic concurrency version
}

export interface IncidentDecisionRecord {
  decisionId: string;
  incidentId: string;
  stepId: string;
  decisionType:
    | "FALSE_POSITIVE"
    | "AUTHORIZED_ACTIVITY"
    | "SUSPICIOUS"
    | "CONFIRMED_INTRUSION"
    | "ESCALATE_POLICE"
    | "ESCALATE_QRT"
    | "NORMAL_HOURS_EXCEPTION";
  chosenOption: string;
  confidence: "LOW" | "MEDIUM" | "HIGH" | "CONFIRMED";
  operatorNotes: string;
  evidenceId?: string;
  recordedBy: {
    userId: string;
    userName: string;
  };
  recordedAt: string;
}

export interface IncidentAuditEvent {
  eventId: string;
  incidentId: string;
  tenantId: string;
  branchId?: string;
  eventType:
    | "INCIDENT_CREATED"
    | "INCIDENT_ACKNOWLEDGED"
    | "PLAYBOOK_INITIALIZED"
    | "STEP_STARTED"
    | "STEP_COMPLETED"
    | "STEP_OVERRIDDEN"
    | "AUTOMATION_EXECUTED"
    | "DECISION_RECORDED"
    | "ESCALATION_TRIGGERED"
    | "RESOLUTION_ATTEMPTED"
    | "RESOLUTION_BLOCKED"
    | "INCIDENT_RESOLVED"
    | "INCIDENT_CLOSED";
  stepId?: string;
  actor: {
    type: "USER" | "SYSTEM" | "AI_COPILOT";
    userId?: string;
    userName?: string;
  };
  details: Record<string, any>;
  timestamp: string;
}

export interface IncidentStateWorkspace {
  incident: {
    id: string;
    incidentNumber: string;
    title: string;
    incidentType: string;
    severity: IncidentSeverity;
    status: IncidentStatus;
    branchId?: string;
    cameraId?: string;
    occurredAt: string;
    assignedOperatorId?: string;
  };
  playbook: {
    instanceId: string;
    playbookId: string;
    playbookName: string;
    playbookVersion: number;
    status: PlaybookInstanceStatus;
    startedAt: string;
  };
  steps: StepInstance[];
  currentStepIds: string[];
  allowedActions: ("START_STEP" | "COMPLETE_STEP" | "OVERRIDE_STEP" | "RECORD_DECISION" | "ESCALATE" | "RESOLVE")[];
  blockedResolutionReasons?: string[];
  decisions: IncidentDecisionRecord[];
  auditTimeline: IncidentAuditEvent[];
}
