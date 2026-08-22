/**
 * Retention Compliance Domain Types
 * 
 * First-class domain model for CCTV recording retention compliance,
 * multi-source evidence capture, deterministic policy evaluation,
 * predictive risk modeling, continuous coverage, and audit trails.
 */

export type RetentionState =
  | "HEALTHY"
  | "WARNING"
  | "VIOLATION"
  | "CRITICAL"
  | "UNKNOWN";

export type RetentionEvidenceSource =
  | "RECORDER_ARCHIVE"
  | "RECORDER_API"
  | "PLATFORM_INDEX"
  | "EDGE_AGENT"
  | "MANUAL_VERIFICATION";

export type RetentionEvidenceQuality =
  | "INDEX_ONLY"
  | "ARCHIVE_CONFIRMED"
  | "PLAYBACK_CONFIRMED";

export type EvidenceAgreement =
  | "AGREED"
  | "PARTIAL"
  | "CONFLICTING"
  | "SINGLE_SOURCE"
  | "NO_EVIDENCE";

export type RetentionComplianceState =
  | "COMPLIANT"
  | "VIOLATION"
  | "UNKNOWN";

export type RetentionRiskState =
  | "STABLE"
  | "AT_RISK"
  | "IMMINENT"
  | "UNKNOWN";

export type RetentionReason =
  | "MEETS_POLICY"
  | "NEAR_THRESHOLD"
  | "BELOW_REQUIRED_RETENTION"
  | "SEVERE_RETENTION_SHORTFALL"
  | "INSUFFICIENT_EVIDENCE"
  | "ARCHIVE_QUERY_FAILED"
  | "RECORDER_OFFLINE"
  | "RECORDING_GAPS"
  | "EVIDENCE_CONFLICT"
  | "STALE_OBSERVATION"
  | "STORAGE_PRESSURE";

export interface RetentionEvidence {
  id: string;
  tenantId: string;
  branchId: string;
  recorderId: string;
  cameraId?: string | undefined;

  source: RetentionEvidenceSource;
  quality: RetentionEvidenceQuality;

  oldestRecordingAt?: Date | undefined;
  newestRecordingAt?: Date | undefined;

  continuousFrom?: Date | undefined;
  continuousUntil?: Date | undefined;

  recordingGapMinutes?: number | undefined;
  verifiedPlayable?: boolean | undefined;

  observedAt: Date;
  confidence: number;

  errorCode?: string | undefined;
  errorMessage?: string | undefined;
}

export interface RecordingWindow {
  oldestRecordingAt: Date;
  newestRecordingAt: Date;
  archiveSpanDays: number;
  latestRecordingAgeMinutes: number;
  coveragePercent?: number | undefined;
}

export interface RecordingGap {
  from: Date;
  to: Date;
  durationMinutes: number;
  cause?: ("RECORDER_OFFLINE" | "CAMERA_OFFLINE" | "STORAGE_FAILURE" | "SCHEDULE" | "RECORDING_GAPS" | "UNKNOWN") | undefined;
}

export interface RecordingCoverage {
  expectedMinutes: number;
  recordedMinutes: number;
  missingMinutes: number;
  coveragePercent: number;
  largestGapMinutes: number;
  gaps: RecordingGap[];
}

export interface RetentionPrediction {
  projectedRetentionDays?: number | undefined;
  estimatedDailyWriteBytes?: number | undefined;
  storageGrowthRate?: number | undefined;
  daysUntilPolicyViolation?: number | undefined;
  daysUntilDiskPressure?: number | undefined;
  predictionConfidence: number;
  riskState: RetentionRiskState;
  calculatedAt: Date;
  reason?: string | undefined;
}

export interface RetentionPolicy {
  requiredDays: number;
  warningDays: number;
  criticalDeficitDays: number;
  unknownAfterMinutes: number;
  minimumCoveragePercent: number;
}

export interface RetentionPolicyAssignment {
  id: string;
  tenantId: string;
  scopeType: "TENANT" | "REGION" | "BRANCH" | "RECORDER" | "CAMERA_GROUP" | "CAMERA";
  scopeId: string;
  requiredRetentionDays: number;
  warningThresholdDays?: number | undefined;
  minimumCoveragePercent?: number | undefined;
  effectiveFrom: Date;
  effectiveUntil?: Date | undefined;
  priority: number;
}

export interface RetentionAssessment {
  id: string;
  tenantId: string;
  branchId: string;
  recorderId: string;
  cameraId?: string | undefined;
  cameraName?: string | undefined;

  requiredRetentionDays: number;
  actualRetentionDays?: number | undefined;
  projectedRetentionDays?: number | undefined;
  daysUntilPolicyViolation?: number | undefined;
  coveragePercent?: number | undefined;

  state: RetentionState;
  complianceState: RetentionComplianceState;
  riskState: RetentionRiskState;
  reason: RetentionReason;

  confidence: number;
  evidenceAgreement: EvidenceAgreement;
  evaluatedAt: Date;
  evidenceIds: string[];

  recordingWindow?: RecordingWindow | undefined;
  gaps?: RecordingGap[] | undefined;
}

export interface BranchRetentionSummary {
  branchId: string;
  branchName: string;
  cameraCount: number;

  healthy: number;
  warning: number;
  violation: number;
  critical: number;
  unknown: number;

  worstRetentionDays?: number | undefined;
  requiredRetentionDays: number;

  state: RetentionState;
  complianceState: RetentionComplianceState;
  riskState: RetentionRiskState;
  averageCoveragePercent: number;
  daysUntilViolation?: number | undefined;
  lastCheckedAt: Date;
}

export interface RetentionAuditEvent {
  id: string;
  tenantId: string;
  entityType: "BRANCH" | "RECORDER" | "CAMERA";
  entityId: string;
  eventType:
    | "EVIDENCE_COLLECTED"
    | "ASSESSMENT_CHANGED"
    | "VIOLATION_CREATED"
    | "VIOLATION_ACKNOWLEDGED"
    | "VIOLATION_RESOLVED"
    | "MANUAL_VERIFICATION";
  previousState?: RetentionState | undefined;
  newState?: RetentionState | undefined;
  actorType: "SYSTEM" | "USER";
  actorId?: string | undefined;
  evidenceId?: string | undefined;
  notes?: string | undefined;
  occurredAt: Date;
}

export interface DailyRetentionReport {
  date: string;
  totalBranches: number;
  fullyCompliant: number;
  atRisk: number;
  retentionViolations: number;
  criticalViolations: number;
  unableToVerify: number;

  worstOffenders: Array<{
    branchId: string;
    branchName: string;
    requiredDays: number;
    actualDays: number;
    deficitDays: number;
    state: RetentionState;
  }>;

  newViolations: string[];
  resolvedViolations: string[];
  persistentViolations: string[];
  predictedViolations7Days: Array<{
    branchId: string;
    branchName: string;
    predictedDays: number;
    daysUntilViolation: number;
  }>;

  generatedAt: Date;
}
