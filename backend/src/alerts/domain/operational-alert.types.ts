/**
 * Production-Grade Operational Alert Domain Models and State Machine
 */

export type AlertSeverity = "P1" | "P2" | "P3" | "P4";

export type AlertStatus =
  | "NEW"
  | "ACKNOWLEDGED"
  | "INVESTIGATING"
  | "ESCALATED"
  | "RESOLVED"
  | "DISMISSED";

export type EvidenceState =
  | "QUEUED"
  | "CAPTURING"
  | "READY"
  | "PARTIAL"
  | "FAILED";

export type AlertDisposition =
  | "TRUE_POSITIVE"
  | "FALSE_POSITIVE"
  | "AUTHORIZED_ACTIVITY"
  | "DEVICE_FAULT"
  | "NETWORK_FAILURE"
  | "MAINTENANCE"
  | "DUPLICATE"
  | "TEST_EVENT"
  | "OTHER";

export type AlertCategory =
  | "AI"
  | "CAMERA"
  | "RECORDER"
  | "STORAGE"
  | "NETWORK"
  | "SECURITY"
  | "SYSTEM";

export interface AlertEvidenceFailure {
  stage:
    | "RECORDER_LOOKUP"
    | "ARCHIVE_SEARCH"
    | "DOWNLOAD"
    | "TRANSCODE"
    | "OBJECT_STORAGE";
  reason:
    | "RECORDER_OFFLINE"
    | "NO_RECORDING_FOUND"
    | "AUTHENTICATION_FAILED"
    | "TIMEOUT"
    | "CORRUPTED_RECORDING"
    | "UNSUPPORTED_API"
    | "UNKNOWN";
  message?: string | undefined;
}

export interface AlertEvidence {
  state: EvidenceState;
  snapshotState: EvidenceState;
  clipState: EvidenceState;
  snapshotUrl?: string | undefined;
  clipUrl?: string | undefined;
  clipDurationSeconds?: number | undefined;
  preEventSeconds?: number | undefined;
  postEventSeconds?: number | undefined;
  liveStreamSessionId?: string | undefined;
  liveStreamPlaybackUrl?: string | undefined;
  failure?: AlertEvidenceFailure | undefined;
  capturedAt?: Date | undefined;
}

export interface AlertAssignment {
  assignedTo?: string | undefined;
  assignedToName?: string | undefined;
  assignedAt?: Date | undefined;
  assignedBy?: string | undefined;
}

export interface AlertAcknowledgement {
  acknowledgedAt: Date;
  acknowledgedBy: string;
  acknowledgedByName?: string | undefined;
  responseTimeSeconds: number;
  slaBreached: boolean;
}

export interface AlertResolution {
  resolvedAt: Date;
  resolvedBy: string;
  resolvedByName?: string | undefined;
  disposition: AlertDisposition;
  notes: string;
  resolutionTimeSeconds: number;
  slaBreached: boolean;
}

export interface AlertComment {
  id: string;
  alertId: string;
  authorId: string;
  authorName: string;
  comment: string;
  createdAt: Date;
}

export interface AlertAuditEvent {
  id: string;
  alertId: string;
  tenantId: string;
  action:
    | "CREATED"
    | "DISPLAYED"
    | "VIEWED"
    | "ACKNOWLEDGED"
    | "ESCALATED"
    | "ASSIGNED"
    | "COMMENTED"
    | "EVIDENCE_VIEWED"
    | "RESOLVED"
    | "REOPENED";
  actorId?: string | undefined;
  actorName?: string | undefined;
  timestamp: Date;
  metadata?: Record<string, unknown> | undefined;
}

export interface OperationalAlert {
  id: string;
  tenantId: string;
  revision: number; // Monotonically increasing counter for out-of-order rejection

  branch: {
    id: string;
    name: string;
    code?: string | undefined;
    zone?: string | undefined;
  };

  camera?: {
    id: string;
    name: string;
    channel?: number | undefined;
    criticality?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | undefined;
  } | undefined;

  detection: {
    type: string;
    category: AlertCategory;
    title: string;
    description?: string | undefined;
    confidence?: number | undefined;
    boundingBoxes?: Array<{ x: number; y: number; width: number; height: number; label: string }> | undefined;
  };

  severity: AlertSeverity;
  status: AlertStatus;

  occurredAt: Date;
  responseDeadline: Date;
  resolutionDeadline: Date;

  evidence: AlertEvidence;
  assignment?: AlertAssignment | undefined;
  acknowledgement?: AlertAcknowledgement | undefined;
  resolution?: AlertResolution | undefined;

  escalationLevel: number;
  occurrenceCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;

  dedupKey: string;
  correlatedIncidentId?: string | undefined;
  tags?: string[] | undefined;
}

export const ALLOWED_ALERT_TRANSITIONS: Record<AlertStatus, AlertStatus[]> = {
  NEW: ["ACKNOWLEDGED", "ESCALATED", "RESOLVED", "DISMISSED"],
  ACKNOWLEDGED: ["INVESTIGATING", "ESCALATED", "RESOLVED"],
  INVESTIGATING: ["ESCALATED", "RESOLVED"],
  ESCALATED: ["INVESTIGATING", "RESOLVED"],
  RESOLVED: ["INVESTIGATING"], // Can be reopened by supervisor
  DISMISSED: [],
};

export class InvalidAlertTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAlertTransitionError";
  }
}
