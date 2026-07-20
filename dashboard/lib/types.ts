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
