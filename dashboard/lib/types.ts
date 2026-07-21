export type CameraStatus = "online" | "offline" | "degraded" | "unknown";

export interface Branch {
  id: string;
  name: string;
  type: "branch";
  cameraCount?: number;
  onlineCount?: number;
}

export interface Camera {
  id: string;
  name: string;
  branchId: string;
  branchName?: string;
  vendor: "hikvision" | "cp-plus" | "other";
  model: string;
  status: CameraStatus;
  channel: number;
  capabilities: {
    ptz: boolean;
    audio: boolean;
    events: boolean;
  };
}

export interface LiveSessionResponse {
  demo?: boolean;
  sessionId?: string;
  cameraId: string;
  expiresAt?: string;
  hls?: {
    url: string;
    bearerToken: string;
  };
  webRtc?: {
    whepUrl: string;
    bearerToken: string;
  };
}

export type RecordingMode = "continuous" | "motion" | "scheduled" | "event" | "manual";
export type RecordingStatus = "recording" | "scheduled" | "idle" | "error" | "disabled";
export interface RecordingJob {
  id?: string;
  cameraId: string;
  mode: RecordingMode;
  enabled: boolean;
  status: RecordingStatus;
  retentionDays: number;
  postRollSeconds: number;
  segmentDurationSeconds: number;
  hotRetentionDays: number;
  warmRetentionDays: number;
  coldRetentionDays: number;
  maxBitrateKbps?: number;
  critical: boolean;
  backupRequired: boolean;
  automaticDeletionEnabled: boolean;
  evidenceProtection: boolean;
  recordMainStream: boolean;
  schedule?: { days: number[]; start: string; end: string };
}

export type LiveBookmarkReason =
  | "suspicious-activity"
  | "cash-discrepancy"
  | "unauthorized-entry"
  | "customer-dispute"
  | "equipment-failure"
  | "safety-incident"
  | "other";

export interface LiveBookmark {
  id: string;
  cameraId: string;
  operatorId: string;
  bookmarkedAt: string;
  reason: LiveBookmarkReason;
  notes?: string;
  priority: "low" | "medium" | "high" | "critical";
  incidentId?: string;
  recordingSegmentId?: string;
  snapshotReference?: string;
  createdAt: string;
}

export interface LiveIncident {
  id: string;
  cameraId: string;
  createdBy: string;
  title: string;
  notes?: string;
  priority: "P1" | "P2" | "P3" | "P4" | "P5";
  status: "new" | "acknowledged" | "investigating" | "escalated" | "resolved" | "false-alarm";
  occurredAt: string;
  recordingFrom: string;
  recordingTo: string;
  preRollSeconds: number;
  postRollSeconds: number;
  bookmarkId: string;
  legalHoldId: string;
  createdAt: string;
  updatedAt: string;
}

export interface EdgeAgent {
  id: string;
  branchId: string;
  name: string;
  version: string;
  status: "pending" | "online" | "offline";
  lastSeenAt: string | null;
}

export type AnalyticsDetectionType =
  | "motion" | "person" | "vehicle" | "object" | "line-crossing"
  | "intrusion" | "loitering" | "crowd-density" | "camera-tampering"
  | "video-loss" | "fire-smoke";
export type AnalyticsSeverity = "P1" | "P2" | "P3" | "P4" | "P5";
export type AnalyticsAlertStatus =
  | "new" | "acknowledged" | "investigating" | "escalated"
  | "resolved" | "false_alarm" | "suppressed";

export interface AnalyticsRule {
  id: string;
  tenantId: string;
  cameraId: string;
  name: string;
  detectionType: AnalyticsDetectionType;
  enabled: boolean;
  zone?: {
    id: string;
    name: string;
    shape: "polygon" | "line";
    points: Array<{ x: number; y: number }>;
  };
  schedule?: { days: number[]; start: string; end: string; timezone: string };
  objectClasses: string[];
  minConfidence: number;
  minDurationSeconds: number;
  direction: "any" | "a-to-b" | "b-to-a" | "enter" | "exit";
  severity: AnalyticsSeverity;
  cooldownSeconds: number;
  recipients: string[];
  escalateAfterSeconds?: number;
  recordingPolicy: "none" | "event-recording" | "protect-window";
  preRollSeconds: number;
  postRollSeconds: number;
  modelId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsAlert {
  id: string;
  tenantId: string;
  cameraId: string;
  ruleId: string;
  eventId: string;
  title: string;
  description?: string;
  severity: AnalyticsSeverity;
  status: AnalyticsAlertStatus;
  confidence: number;
  objectClasses: string[];
  modelVersion: string;
  snapshotReference?: string;
  clipReference?: string;
  firstDetectedAt: string;
  lastDetectedAt: string;
  occurrenceCount: number;
  incidentId?: string;
  acknowledgedAt?: string;
  falseAlarmReason?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsAlertSummary {
  total: number;
  open: number;
  new: number;
  critical: number;
  highPriority: number;
}
