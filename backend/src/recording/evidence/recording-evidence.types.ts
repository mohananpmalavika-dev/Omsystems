/**
 * Recording Evidence Types
 * 
 * Evidence-based recording verification types that separate "what we observed"
 * from "whether that satisfies policy".
 * 
 * CRITICAL PRINCIPLES:
 * 1. Evidence must never be fabricated
 * 2. UNKNOWN ≠ HEALTHY
 * 3. Transport errors → UNKNOWN, not optimistic defaults
 * 4. Freshness and confidence are explicit
 * 5. Source attribution is mandatory
 */

/**
 * Verification status for evidence
 */
export type VerificationStatus = 'VERIFIED' | 'FAILED' | 'UNKNOWN';

/**
 * Recording state from evidence
 */
export type RecordingState = 'RECORDING' | 'NOT_RECORDING' | 'UNKNOWN';

/**
 * Storage health status
 */
export type StorageStatus = 'HEALTHY' | 'DEGRADED' | 'FULL' | 'UNKNOWN';

/**
 * Evidence freshness state
 */
export type FreshnessState = 'FRESH' | 'AGING' | 'STALE' | 'UNKNOWN';

/**
 * Evidence acquisition method
 */
export type EvidenceMethod =
  | 'VENDOR_API'
  | 'ONVIF'
  | 'ARCHIVE_QUERY'
  | 'RTSP'
  | 'SNMP'
  | 'LOCAL_AGENT'
  | 'MANUAL'
  | 'UNKNOWN';

/**
 * Reason codes for evidence failures or unknown states
 */
export type EvidenceReason =
  // Connectivity issues
  | 'RECORDER_UNREACHABLE'
  | 'NETWORK_TIMEOUT'
  | 'CONNECTION_REFUSED'
  | 'DNS_RESOLUTION_FAILED'
  
  // Authentication issues
  | 'AUTHENTICATION_FAILED'
  | 'INVALID_CREDENTIALS'
  | 'SESSION_EXPIRED'
  
  // Adapter issues
  | 'RECORDER_ADAPTER_UNAVAILABLE'
  | 'CAPABILITY_UNSUPPORTED'
  | 'VENDOR_API_ERROR'
  | 'PROTOCOL_ERROR'
  
  // Configuration issues
  | 'CHANNEL_NOT_FOUND'
  | 'CHANNEL_DISABLED'
  | 'INVALID_CONFIGURATION'
  
  // Data issues
  | 'QUERY_TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'STALE_EVIDENCE'
  | 'NO_ARCHIVE_FOUND'
  | 'ARCHIVE_UNAVAILABLE'
  
  // Recording issues
  | 'RECORDING_DISABLED'
  | 'RECORDING_ERROR'
  | 'RECORDING_PAUSED'
  
  // Storage issues
  | 'STORAGE_UNAVAILABLE'
  | 'STORAGE_FAILED'
  | 'DISK_FAILED'
  
  // System issues
  | 'INTERNAL_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Evidence quality metadata
 * 
 * Reusable construct for any evidence source across the platform.
 */
export interface EvidenceQuality {
  /** Whether evidence could be acquired */
  availability: 'AVAILABLE' | 'UNAVAILABLE';
  
  /** How recent the evidence is */
  freshness: FreshnessState;
  
  /** Age of evidence in seconds */
  ageSeconds?: number;
  
  /** Maximum acceptable age in seconds */
  maxAgeSeconds?: number;
  
  /** Confidence in this evidence (0.0-1.0) */
  confidence: number;
  
  /** Evidence acquisition method/source */
  source: string;
  
  /** Acquisition method type */
  method: EvidenceMethod;
  
  /** When evidence was verified */
  verifiedAt: Date | null;
  
  /** When evidence expires/becomes stale */
  expiresAt?: Date;
  
  /** Why evidence is unavailable or uncertain */
  reason?: EvidenceReason;
  
  /** Additional diagnostic details */
  details?: Record<string, unknown>;
}

/**
 * Storage evidence
 */
export interface StorageEvidence {
  /** Storage health status */
  status: StorageStatus;
  
  /** Total storage capacity in bytes */
  totalBytes: number | null;
  
  /** Used storage in bytes */
  usedBytes: number | null;
  
  /** Free storage in bytes */
  freeBytes: number | null;
  
  /** Usage percentage */
  usagePercent?: number;
  
  /** Individual disk information */
  disks?: Array<{
    id: string;
    status: 'HEALTHY' | 'WARNING' | 'FAILED' | 'UNKNOWN';
    totalBytes?: number;
    usedBytes?: number;
    temperatureC?: number;
  }>;
  
  /** Estimated retention days at current rate */
  estimatedRetentionDays?: number;
}

/**
 * Recording gap detected in archive
 */
export interface RecordingGap {
  /** Gap start time */
  start: Date;
  
  /** Gap end time */
  end: Date;
  
  /** Duration in seconds */
  durationSeconds: number;
  
  /** Reason for gap if known */
  reason?: string;
}

/**
 * Archive coverage evidence
 */
export interface ArchiveCoverageEvidence {
  /** Coverage time range start */
  rangeStart: Date | null;
  
  /** Coverage time range end */
  rangeEnd: Date | null;
  
  /** Expected duration in seconds (based on policy) */
  expectedDurationSeconds: number | null;
  
  /** Actual recorded duration in seconds */
  recordedDurationSeconds: number | null;
  
  /** Coverage ratio (0.0-1.0) */
  coverageRatio: number | null;
  
  /** Detected recording gaps */
  gaps: RecordingGap[];
  
  /** Longest gap duration in seconds */
  longestGapSeconds?: number;
  
  /** Total gap duration in seconds */
  totalGapSeconds?: number;
}

/**
 * Verification check dimensions
 * 
 * Separates different aspects of recorder health to avoid
 * ambiguous "healthy=true" that masks specific issues.
 */
export interface VerificationChecks {
  /** Network connectivity check */
  connectivity: {
    status: VerificationStatus;
    latencyMs?: number;
    message?: string;
  };
  
  /** Authentication check */
  authentication: {
    status: VerificationStatus;
    method?: string;
    message?: string;
  };
  
  /** Channel configuration check */
  channelConfiguration: {
    status: VerificationStatus;
    channelExists: boolean;
    channelEnabled?: boolean;
    message?: string;
  };
  
  /** Live stream check */
  liveStream: {
    status: VerificationStatus;
    streaming?: boolean;
    hasSignal?: boolean;
    message?: string;
  };
  
  /** Recording state check */
  recordingState: {
    status: VerificationStatus;
    isRecording?: boolean;
    mode?: string;
    message?: string;
  };
  
  /** Archive availability check */
  archiveAvailability: {
    status: VerificationStatus;
    accessible?: boolean;
    message?: string;
  };
  
  /** Retention coverage check */
  retentionCoverage: {
    status: VerificationStatus;
    hasCoverage?: boolean;
    message?: string;
  };
  
  /** Storage health check */
  storageHealth: {
    status: VerificationStatus;
    operational?: boolean;
    message?: string;
  };
  
  /** Clock synchronization check */
  clockSynchronization: {
    status: VerificationStatus;
    driftSeconds?: number;
    excessive?: boolean;
    message?: string;
  };
}

/**
 * Complete recording evidence snapshot
 * 
 * This is what the evidence acquisition subsystem produces.
 * It contains only observed facts, no policy evaluation.
 */
export interface RecordingEvidence {
  /** Evidence snapshot ID */
  id?: string;
  
  /** Tenant this evidence belongs to */
  tenantId: string;
  
  /** Recorder that was verified */
  recorderId: string;
  
  /** Channel/camera that was verified */
  channelId: string;
  
  /** Recording state from recorder */
  recordingState: RecordingState;
  
  /** Latest recording timestamp from archive */
  latestRecordingAt: Date | null;
  
  /** Oldest recording timestamp from archive */
  oldestRecordingAt: Date | null;
  
  /** Retention span in days */
  retentionDays?: number;
  
  /** Storage evidence */
  storage: StorageEvidence;
  
  /** Archive coverage (if queried) */
  coverage?: ArchiveCoverageEvidence;
  
  /** Detailed verification checks */
  checks: VerificationChecks;
  
  /** Overall verification metadata */
  verification: {
    /** Overall verification status */
    status: VerificationStatus;
    
    /** When evidence was verified */
    verifiedAt: Date | null;
    
    /** Evidence source/adapter */
    source: string;
    
    /** Evidence method */
    method: EvidenceMethod;
    
    /** Confidence level (0.0-1.0) */
    confidence: number;
    
    /** Verification latency in milliseconds */
    latencyMs?: number;
    
    /** When this evidence expires */
    expiresAt?: Date;
  };
  
  /** Why evidence is incomplete or failed */
  reason?: EvidenceReason;
  
  /** Additional diagnostic details */
  details?: Record<string, unknown>;
  
  /** Hash of raw adapter response (for audit trail) */
  rawPayloadHash?: string;
  
  /** When this evidence was created */
  createdAt?: Date;
}

/**
 * Evidence freshness evaluation result
 */
export interface EvidenceFreshness {
  /** Age in seconds */
  ageSeconds: number;
  
  /** Maximum acceptable age in seconds */
  maxAgeSeconds: number;
  
  /** Freshness state */
  state: FreshnessState;
  
  /** When evidence was verified */
  verifiedAt: Date | null;
  
  /** When evidence expires */
  expiresAt: Date;
}

/**
 * Evidence hierarchy level
 * 
 * Formalizes the strength of evidence for different checks.
 */
export enum EvidenceLevel {
  /** No evidence */
  NONE = 0,
  
  /** Recorder reachable */
  CONNECTIVITY = 1,
  
  /** Configuration says recording enabled */
  CONFIGURATION = 2,
  
  /** Recorder reports recording state */
  RECORDER_STATE = 3,
  
  /** Recent archive segment verified */
  ARCHIVE_VERIFIED = 4,
  
  /** Archive segment can be opened/read */
  MEDIA_READABLE = 5,
}

/**
 * Error during evidence acquisition
 */
export interface EvidenceAcquisitionError {
  /** Error code */
  code: EvidenceReason;
  
  /** Human-readable message */
  message: string;
  
  /** Whether retry might succeed */
  retryable: boolean;
  
  /** Which check failed */
  checkType?: string;
  
  /** Original error */
  cause?: unknown;
  
  /** When error occurred */
  timestamp: Date;
}

/**
 * Recording evidence query filters
 */
export interface RecordingEvidenceQuery {
  /** Filter by tenant */
  tenantId?: string;
  
  /** Filter by recorder */
  recorderId?: string;
  
  /** Filter by channel */
  channelId?: string;
  
  /** Filter by verification status */
  status?: VerificationStatus;
  
  /** Only return fresh evidence */
  freshOnly?: boolean;
  
  /** Maximum age in seconds */
  maxAgeSeconds?: number;
  
  /** Minimum confidence level */
  minConfidence?: number;
  
  /** Evidence acquired after this date */
  after?: Date;
  
  /** Evidence acquired before this date */
  before?: Date;
  
  /** Limit number of results */
  limit?: number;
}

/**
 * Clock skew evidence
 */
export interface ClockSkewEvidence {
  /** Recorder's reported time */
  recorderTime: Date | null;
  
  /** Platform time when checked */
  platformTime: Date;
  
  /** Drift in seconds (positive = recorder ahead) */
  driftSeconds: number | null;
  
  /** Whether drift exceeds threshold */
  excessive: boolean;
  
  /** Drift threshold in seconds */
  thresholdSeconds: number;
}

/**
 * Daily coverage summary for efficient retention queries
 */
export interface DailyCoverageSummary {
  /** Date (day) */
  date: Date;
  
  /** Tenant ID */
  tenantId: string;
  
  /** Recorder ID */
  recorderId: string;
  
  /** Camera/channel ID */
  cameraId: string;
  
  /** Expected recording duration in seconds */
  expectedSeconds: number;
  
  /** Actual recorded duration in seconds */
  recordedSeconds: number;
  
  /** Coverage ratio */
  coverageRatio: number;
  
  /** Largest gap in seconds */
  largestGapSeconds: number;
  
  /** When this was verified */
  verifiedAt: Date;
  
  /** Evidence source */
  source: string;
  
  /** Evidence confidence */
  confidence: number;
}
