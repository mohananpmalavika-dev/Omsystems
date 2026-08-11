/**
 * Recording Compliance Policy Types
 * 
 * Types for retention policy definition and compliance evaluation.
 * These types are completely independent of evidence acquisition.
 * 
 * CRITICAL PRINCIPLES:
 * 1. Policy evaluation never manufactures evidence
 * 2. Four-state outcomes: COMPLIANT, NON_COMPLIANT, INDETERMINATE, NOT_APPLICABLE
 * 3. UNKNOWN evidence → INDETERMINATE compliance
 * 4. Policies are versioned for audit trail
 * 5. Findings link to evidence snapshots
 */

import type { 
  RecordingEvidence, 
  EvidenceReason,
  VerificationStatus 
} from '../evidence/recording-evidence.types.js';

/**
 * Compliance state with proper semantics
 * 
 * - COMPLIANT: Evidence confirms policy is satisfied
 * - NON_COMPLIANT: Evidence confirms policy violation
 * - INDETERMINATE: Cannot verify (missing/stale/weak evidence)
 * - NOT_APPLICABLE: Policy does not apply to this resource
 */
export type ComplianceState = 
  | 'COMPLIANT' 
  | 'NON_COMPLIANT' 
  | 'INDETERMINATE' 
  | 'NOT_APPLICABLE';

/**
 * Compliance violation code
 */
export type ViolationCode =
  // Recording violations
  | 'RECORDING_DISABLED'
  | 'RECORDING_STOPPED'
  | 'RECORDING_PAUSED'
  | 'NO_RECENT_RECORDING'
  
  // Retention violations
  | 'INSUFFICIENT_RETENTION'
  | 'RETENTION_RANGE_UNAVAILABLE'
  | 'ARCHIVE_STALE'
  | 'ARCHIVE_MISSING'
  
  // Coverage violations
  | 'INSUFFICIENT_COVERAGE'
  | 'RECORDING_GAP_EXCEEDED'
  | 'EXCESSIVE_GAPS'
  | 'CONTINUOUS_RECORDING_REQUIRED'
  
  // Evidence quality violations
  | 'EVIDENCE_UNAVAILABLE'
  | 'EVIDENCE_STALE'
  | 'INSUFFICIENT_EVIDENCE_CONFIDENCE'
  | 'EVIDENCE_METHOD_INADEQUATE'
  
  // System violations
  | 'CLOCK_SKEW_EXCESSIVE'
  | 'STORAGE_CRITICAL'
  | 'RECORDER_UNREACHABLE'
  | 'VERIFICATION_FAILED';

/**
 * Recording retention policy
 * 
 * Defines requirements that evidence must satisfy.
 */
export interface RecordingRetentionPolicy {
  /** Policy ID */
  id: string;
  
  /** Policy version for audit trail */
  version: number;
  
  /** Tenant this policy applies to */
  tenantId: string;
  
  /** Policy name */
  name: string;
  
  /** Policy description */
  description?: string;
  
  /** When policy becomes effective */
  effectiveFrom: Date;
  
  /** When policy expires (null = indefinite) */
  effectiveUntil?: Date | null;
  
  /** Policy scope */
  scope: {
    /** Apply to these branches (null = all) */
    branchIds?: string[] | null;
    
    /** Apply to these cameras (null = all in scope) */
    cameraIds?: string[] | null;
    
    /** Apply to cameras with these tags */
    cameraTags?: string[] | null;
  };
  
  /** Required retention duration in days */
  requiredRetentionDays: number;
  
  /** Maximum acceptable recording gap in minutes */
  maxRecordingGapMinutes: number;
  
  /** Whether continuous recording is required */
  requireContinuousRecording: boolean;
  
  /** Minimum coverage ratio (0.0-1.0) */
  minimumCoverageRatio?: number;
  
  /** Minimum evidence confidence level (0.0-1.0) */
  minimumEvidenceConfidence: number;
  
  /** Maximum evidence age in minutes */
  maxEvidenceAgeMinutes: number;
  
  /** Minimum evidence level required */
  minimumEvidenceLevel?: number;
  
  /** Maximum acceptable clock drift in seconds */
  maxClockDriftSeconds?: number;
  
  /** Whether to alert on INDETERMINATE */
  alertOnIndeterminate?: boolean;
  
  /** Policy enforcement level */
  enforcementLevel: 'STRICT' | 'STANDARD' | 'LENIENT';
  
  /** Created by user */
  createdBy?: string;
  
  /** Created at timestamp */
  createdAt?: Date;
  
  /** Last updated timestamp */
  updatedAt?: Date;
}

/**
 * Compliance violation detail
 */
export interface ComplianceViolation {
  /** Violation code */
  code: ViolationCode;
  
  /** Human-readable message */
  message: string;
  
  /** Severity level */
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  
  /** Required value */
  required?: number | string;
  
  /** Observed value */
  observed?: number | string;
  
  /** Gap/difference */
  gap?: number;
  
  /** Related evidence reason */
  evidenceReason?: EvidenceReason;
  
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Compliance requirements extracted from policy
 */
export interface ComplianceRequirements {
  /** Retention requirement */
  retentionDays: number;
  
  /** Coverage requirement */
  minimumCoverage: number;
  
  /** Gap tolerance */
  maximumGapMinutes: number;
  
  /** Continuous recording required */
  continuousRequired: boolean;
  
  /** Evidence freshness requirement */
  maxEvidenceAgeMinutes: number;
  
  /** Evidence confidence requirement */
  minimumConfidence: number;
}

/**
 * Observed values from evidence
 */
export interface ObservedValues {
  /** Observed retention in days */
  retentionDays?: number;
  
  /** Observed coverage ratio */
  coverage?: number;
  
  /** Largest gap in minutes */
  largestGapMinutes?: number;
  
  /** Evidence age in minutes */
  evidenceAgeMinutes?: number;
  
  /** Evidence confidence */
  evidenceConfidence?: number;
  
  /** Recording state */
  recordingState?: string;
  
  /** Clock drift in seconds */
  clockDriftSeconds?: number;
}

/**
 * Compliance finding
 * 
 * Result of evaluating evidence against policy.
 * Links evidence snapshot to policy version.
 */
export interface ComplianceFinding {
  /** Finding ID */
  id?: string;
  
  /** Tenant */
  tenantId: string;
  
  /** Policy that was evaluated */
  policyId: string;
  
  /** Policy version used for evaluation */
  policyVersion: number;
  
  /** Policy name (for convenience) */
  policyName?: string;
  
  /** Camera/channel evaluated */
  cameraId: string;
  
  /** Camera name (for convenience) */
  cameraName?: string;
  
  /** Recorder */
  recorderId: string;
  
  /** Recorder name (for convenience) */
  recorderName?: string;
  
  /** Compliance state */
  state: ComplianceState;
  
  /** Primary reason for state */
  reason?: string;
  
  /** Detailed reason code */
  reasonCode?: ViolationCode;
  
  /** When this evaluation was performed */
  evaluatedAt: Date;
  
  /** Evidence snapshot used for evaluation */
  evidenceSnapshotId?: string;
  
  /** Evidence verification status */
  evidenceStatus?: VerificationStatus;
  
  /** When evidence was verified */
  evidenceVerifiedAt?: Date | null;
  
  /** Evidence age in seconds at evaluation time */
  evidenceAgeSeconds?: number;
  
  /** Policy requirements */
  requirements: ComplianceRequirements;
  
  /** Observed values from evidence */
  observed: ObservedValues;
  
  /** All violations found */
  violations: ComplianceViolation[];
  
  /** Overall compliance score (0-100) */
  complianceScore?: number;
  
  /** Next evaluation due date */
  nextEvaluationAt?: Date;
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  
  /** Created timestamp */
  createdAt?: Date;
}

/**
 * Compliance evaluation request
 */
export interface ComplianceEvaluationRequest {
  /** Tenant ID */
  tenantId: string;
  
  /** Camera/channel to evaluate */
  cameraId: string;
  
  /** Optional specific policy ID */
  policyId?: string;
  
  /** Force re-acquisition of evidence */
  forceRefresh?: boolean;
  
  /** Include detailed evidence in response */
  includeEvidence?: boolean;
}

/**
 * Compliance evaluation result
 */
export interface ComplianceEvaluationResult {
  /** Compliance finding */
  finding: ComplianceFinding;
  
  /** Evidence used (if requested) */
  evidence?: RecordingEvidence;
  
  /** Policy used */
  policy: RecordingRetentionPolicy;
  
  /** Evaluation metadata */
  metadata: {
    /** Evaluation duration in milliseconds */
    durationMs: number;
    
    /** Whether evidence was freshly acquired */
    evidenceFresh: boolean;
    
    /** Adapter used for evidence */
    adapterType?: string;
  };
}

/**
 * Compliance summary for a scope
 */
export interface ComplianceSummary {
  /** Tenant ID */
  tenantId: string;
  
  /** Branch ID (if specific branch) */
  branchId?: string;
  
  /** Policy ID (if specific policy) */
  policyId?: string;
  
  /** Summary period */
  period: {
    start: Date;
    end: Date;
  };
  
  /** Total cameras in scope */
  totalCameras: number;
  
  /** Cameras by compliance state */
  byState: {
    compliant: number;
    nonCompliant: number;
    indeterminate: number;
    notApplicable: number;
  };
  
  /** Compliance rate (excludes NOT_APPLICABLE) */
  complianceRate: number;
  
  /** Average compliance score */
  averageScore: number;
  
  /** Cameras that cannot be verified */
  cannotVerify: {
    total: number;
    byReason: Record<string, number>;
  };
  
  /** Most common violations */
  topViolations: Array<{
    code: ViolationCode;
    count: number;
    percentage: number;
  }>;
  
  /** Retention statistics */
  retention: {
    /** Average retention days */
    averageDays: number;
    
    /** Minimum retention days */
    minimumDays: number;
    
    /** Cameras below requirement */
    belowRequirement: number;
  };
  
  /** Coverage statistics */
  coverage: {
    /** Average coverage ratio */
    averageRatio: number;
    
    /** Total gaps detected */
    totalGaps: number;
    
    /** Largest gap in minutes */
    largestGapMinutes: number;
  };
  
  /** Last updated */
  lastUpdated: Date;
}

/**
 * Compliance report configuration
 */
export interface ComplianceReportConfig {
  /** Report type */
  type: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'AUDIT' | 'EXECUTIVE';
  
  /** Report scope */
  scope: {
    tenantId: string;
    branchIds?: string[];
    policyIds?: string[];
  };
  
  /** Report period */
  period: {
    start: Date;
    end: Date;
  };
  
  /** Include details */
  includeDetails: {
    violations: boolean;
    evidence: boolean;
    trends: boolean;
    recommendations: boolean;
  };
  
  /** Format */
  format: 'JSON' | 'PDF' | 'CSV';
}

/**
 * Compliance audit record
 * 
 * Immutable record for compliance audit trail
 */
export interface ComplianceAuditRecord {
  /** Audit record ID */
  id: string;
  
  /** Finding ID */
  findingId: string;
  
  /** Policy version at time of evaluation */
  policyVersion: number;
  
  /** Evidence snapshot ID */
  evidenceSnapshotId: string;
  
  /** Compliance state */
  state: ComplianceState;
  
  /** Evaluation timestamp */
  evaluatedAt: Date;
  
  /** Evaluator (user/system) */
  evaluatedBy?: string;
  
  /** Evidence hash for integrity */
  evidenceHash: string;
  
  /** Finding hash for integrity */
  findingHash: string;
  
  /** Immutable timestamp */
  createdAt: Date;
}

/**
 * Policy change record
 */
export interface PolicyChangeRecord {
  /** Change ID */
  id: string;
  
  /** Policy ID */
  policyId: string;
  
  /** Previous version */
  fromVersion: number;
  
  /** New version */
  toVersion: number;
  
  /** Changes made */
  changes: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
  
  /** Changed by */
  changedBy: string;
  
  /** Change timestamp */
  changedAt: Date;
  
  /** Change reason */
  reason?: string;
}
