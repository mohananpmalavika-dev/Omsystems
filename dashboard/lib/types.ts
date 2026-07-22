export type CameraStatus = "online" | "offline" | "degraded" | "unknown";

export interface Branch {
  id: string;
  name: string;
  type: "branch";
  cameraCount?: number;
  onlineCount?: number;
}

export interface ComplianceFramework {
  id: string;
  tenantId: string;
  name: string;
  source?: string;
  description?: string;
  status?: string;
  effectiveDate?: string;
  reviewDate?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceAsset {
  id: string;
  tenantId: string;
  category: "camera" | "recorder" | "storage" | "network" | "power" | "accessory";
  assetType: string;
  serialNumber?: string;
  make?: string;
  model?: string;
  firmwareVersion?: string;
  warrantyExpiresAt?: string;
  purchaseDate?: string;
  installationDate?: string;
  vendorId?: string;
  branchNodeId?: string;
  location?: string;
  mountingHeight?: string;
  status: "operational" | "degraded" | "maintenance_due" | "offline" | "retired";
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrder {
  id: string;
  tenantId: string;
  workOrderNumber: string;
  assetId?: string;
  branchNodeId?: string;
  problem: string;
  severity: "critical" | "high" | "medium" | "low";
  technician?: string;
  vendorId?: string;
  slaDueAt?: string;
  eta?: string;
  parts?: string[];
  cost?: number;
  rootCause?: string;
  actionTaken?: string;
  verification?: string;
  status: "open" | "assigned" | "in_progress" | "resolved" | "closed";
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceVendor {
  id: string;
  tenantId: string;
  name: string;
  contact?: string;
  email?: string;
  phone?: string;
  address?: string;
  gstNumber?: string;
  serviceCenters?: string[];
  escalationMatrix?: Record<string, unknown>;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AmcContract {
  id: string;
  tenantId: string;
  contractNumber: string;
  vendorId: string;
  startDate: string;
  endDate: string;
  warranty?: string;
  coverage?: string;
  exclusions?: string;
  paymentTerms?: string;
  cost?: number;
  renewal?: string;
  sla?: string;
  status: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompliancePolicy {
  id: string;
  tenantId: string;
  frameworkId: string;
  policyName: string;
  policyBasis?: string;
  entityType?: string;
  locationType?: string;
  cameraType?: string;
  normalRetentionDays?: number;
  hotStorageDays?: number;
  warmStorageDays?: number;
  coldStorageDays?: number;
  backupRequired: boolean;
  legalHoldOverride: boolean;
  incidentRetentionDays?: number;
  automaticDeletionEligibility: boolean;
  approvalAuthority?: string;
  effectiveDate?: string;
  reviewDate?: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceAssessment {
  id: string;
  tenantId: string;
  frameworkId: string;
  branchNodeId?: string;
  assessmentPeriodStart?: string;
  assessmentPeriodEnd?: string;
  status: "compliant" | "exception" | "non-compliant" | "incomplete";
  summary?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceCertificate {
  id: string;
  assessmentId: string;
  tenantId: string;
  certificateNumber: string;
  title: string;
  status:
    | "compliant"
    | "compliant_with_exceptions"
    | "provisionally_compliant"
    | "non_compliant"
    | "incomplete";
  issuedBy?: string;
  issuedAt?: string;
  expiryDate?: string;
  documentHash?: string;
  signature?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
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
export type RecordingStatus = "recording" | "scheduled" | "idle" | "error" | "disabled" | "starting" | "degraded" | "interrupted" | "recovering";
export interface RecordingScheduleWindow {
  name?: string;
  days: number[];
  start: string;
  end: string;
  enabled?: boolean;
}
export interface RecordingScheduleException {
  name?: string;
  date: string;
  start?: string;
  end?: string;
  enabled: boolean;
  description?: string;
}
export interface RecordingSchedule {
  timezone?: string;
  windows: RecordingScheduleWindow[];
  exceptions?: RecordingScheduleException[];
}
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
  schedule?: RecordingSchedule;
  preRollSeconds?: number;
  minMotionDurationSeconds?: number;
  motionConfidenceThreshold?: number;
  cooldownSeconds?: number;
  maxEventDurationSeconds?: number;
  storageNodeExternalId?: string;
  triggerEventTypes?: string[];
}

export interface RecordingSegment {
  id: string;
  cameraId: string;
  jobId: string;
  startedAt: string;
  endedAt: string;
  storagePath: string;
  sizeBytes: number;
  storageNodeExternalId: string;
  storageTier: "hot" | "warm" | "cold";
  status: "ready" | "moving" | "deleted" | "error";
  checksumSha256?: string;
  codec?: string;
  createdAt: string;
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

export interface EdgeScanJob {
  id: string;
  branchId: string;
  edgeAgentId: string;
  status: "queued" | "running" | "completed" | "failed";
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  resultCount: number;
  error: string | null;
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
