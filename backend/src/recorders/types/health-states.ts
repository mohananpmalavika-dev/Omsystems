/**
 * Recording Compliance Health States
 * 
 * Three-state health semantics for surveillance compliance:
 * - HEALTHY: Positive evidence confirms proper operation
 * - UNHEALTHY: Evidence confirms failure or non-compliance
 * - UNKNOWN: Cannot verify (device unreachable, API unavailable, insufficient evidence)
 * 
 * CRITICAL: UNKNOWN ≠ HEALTHY
 * Missing evidence must never be treated as health confirmation.
 */

/**
 * Compliance health state
 */
export type ComplianceState = 'healthy' | 'unhealthy' | 'unknown';

/**
 * Generic check result with evidence timestamp
 */
export interface CheckResult<T = unknown> {
  /** Health state determined from evidence */
  status: ComplianceState;
  
  /** Actual measured value (only present when verification succeeded) */
  value?: T;
  
  /** Human-readable explanation of the result */
  message?: string;
  
  /** When this check was performed */
  checkedAt: Date;
  
  /** Error code if check failed (for operational categorization) */
  errorCode?: RecorderErrorCode;
  
  /** Whether this failure is safe to retry */
  retryable?: boolean;
}

/**
 * Connection health result
 */
export interface ConnectionStatus extends CheckResult<boolean> {
  /** Round-trip latency in milliseconds (only if reachable) */
  latencyMs?: number;
}

/**
 * Authentication result
 */
export interface AuthenticationStatus extends CheckResult<boolean> {
  /** Authentication method used */
  method?: 'digest' | 'basic' | 'token' | 'session';
}

/**
 * Stream health result
 */
export interface StreamStatus extends CheckResult<string> {
  /** Stream state: streaming, stopped, no-signal, error */
  value?: 'streaming' | 'stopped' | 'no-signal' | 'error';
  
  /** Stream resolution if available */
  resolution?: string;
  
  /** Bitrate in kbps if available */
  bitrateKbps?: number;
  
  /** Frame rate if available */
  fps?: number;
}

/**
 * Recording state result
 */
export interface RecordingStatus extends CheckResult<string> {
  /** Recording state from recorder */
  value?: 'recording' | 'stopped' | 'paused' | 'error';
  
  /** Recording mode if known */
  mode?: 'continuous' | 'motion' | 'event' | 'schedule';
}

/**
 * Archive verification result
 */
export interface ArchiveCheckResult extends CheckResult {
  /** Most recent recording end time (actual evidence from archive) */
  lastRecordingTime?: Date;
  
  /** Seconds between now and last recording */
  archiveLagSeconds?: number;
  
  /** Oldest available recording time */
  oldestRecordingTime?: Date;
  
  /** Available retention in days */
  retentionDays?: number;
  
  /** Whether archive meets retention requirements */
  retentionCompliant?: boolean;
  
  /** Required retention days from policy */
  requiredRetentionDays?: number;
}

/**
 * Individual disk health
 */
export interface RecorderDisk {
  /** Disk identifier */
  id: string;
  
  /** Disk health state */
  state: 'normal' | 'warning' | 'failed' | 'missing' | 'rebuilding' | 'unknown';
  
  /** Total capacity in bytes */
  totalBytes?: number;
  
  /** Used space in bytes */
  usedBytes?: number;
  
  /** Free space in bytes */
  freeBytes?: number;
  
  /** Temperature in Celsius */
  temperatureC?: number;
  
  /** S.M.A.R.T. status if available */
  smartStatus?: string;
}

/**
 * Storage health result
 */
export interface StorageCheckResult extends CheckResult {
  /** All disks in recorder */
  disks?: RecorderDisk[];
  
  /** Total storage capacity */
  totalBytes?: number;
  
  /** Total used space */
  usedBytes?: number;
  
  /** Total free space */
  freeBytes?: number;
  
  /** Usage percentage */
  usagePercent?: number;
  
  /** Estimated days of retention at current recording rate */
  estimatedRetentionDays?: number;
}

/**
 * Clock drift result
 */
export interface ClockCheckResult extends CheckResult {
  /** Recorder's reported time */
  recorderTime?: Date;
  
  /** Platform time when check was performed */
  platformTime?: Date;
  
  /** Drift in seconds (positive = recorder ahead) */
  driftSeconds?: number;
}

/**
 * Recorder channel information
 */
export interface RecorderChannel {
  /** Channel number or identifier */
  id: string;
  
  /** Channel name */
  name?: string;
  
  /** Whether channel is enabled */
  enabled: boolean;
  
  /** Input source type */
  sourceType?: 'analog-dvr-channel' | 'nvr-channel' | 'ip-camera';
  
  /** Recording enabled on this channel */
  recordingEnabled?: boolean;
}

/**
 * Comprehensive recording compliance check result
 */
export interface RecordingCheckResult {
  /** Overall aggregated health status */
  overallStatus: ComplianceState;
  
  /** Recorder being checked */
  recorderId: string;
  
  /** Channel being checked (if specific to one channel) */
  channelId?: string;
  
  /** When this check was performed */
  checkedAt: Date;
  
  /** Individual check results */
  reachable: ConnectionStatus;
  authentication: AuthenticationStatus;
  channel: CheckResult<RecorderChannel>;
  stream: StreamStatus;
  recording: RecordingStatus;
  archive: ArchiveCheckResult;
  storage: StorageCheckResult;
  clock: ClockCheckResult;
  
  /** All errors encountered during checks */
  errors: RecorderCheckError[];
  
  /** Adapter type used for verification */
  adapterType?: string;
  
  /** Adapter version for troubleshooting */
  adapterVersion?: string;
  
  /** Last time this recorder was verified healthy */
  lastVerifiedHealthyAt?: Date;
  
  /** Age of this result in seconds */
  resultAgeSeconds?: number;
}

/**
 * Error taxonomy for recorder checks
 */
export type RecorderErrorCode =
  // Connectivity errors
  | 'DEVICE_UNREACHABLE'
  | 'NETWORK_TIMEOUT'
  | 'CONNECTION_REFUSED'
  | 'DNS_RESOLUTION_FAILED'
  
  // Authentication errors
  | 'AUTHENTICATION_FAILED'
  | 'INVALID_CREDENTIALS'
  | 'SESSION_EXPIRED'
  | 'UNAUTHORIZED'
  
  // Configuration errors
  | 'CHANNEL_NOT_FOUND'
  | 'CHANNEL_DISABLED'
  | 'INVALID_CONFIGURATION'
  
  // Stream errors
  | 'STREAM_UNAVAILABLE'
  | 'STREAM_NO_SIGNAL'
  | 'RTSP_ERROR'
  
  // Recording errors
  | 'RECORDING_STOPPED'
  | 'RECORDING_PAUSED'
  | 'RECORDING_ERROR'
  | 'ARCHIVE_UNAVAILABLE'
  | 'ARCHIVE_STALE'
  | 'ARCHIVE_CORRUPTED'
  | 'RETENTION_INSUFFICIENT'
  
  // Storage errors
  | 'STORAGE_FAILED'
  | 'STORAGE_FULL'
  | 'STORAGE_READ_ONLY'
  | 'DISK_FAILED'
  | 'DISK_MISSING'
  | 'RAID_DEGRADED'
  
  // Time synchronization errors
  | 'CLOCK_DRIFT'
  | 'NTP_SYNC_FAILED'
  
  // API errors
  | 'UNSUPPORTED_FEATURE'
  | 'VENDOR_API_ERROR'
  | 'API_VERSION_MISMATCH'
  | 'PROTOCOL_ERROR';

/**
 * Structured recorder error
 */
export interface RecorderCheckError {
  /** Categorized error code */
  code: RecorderErrorCode;
  
  /** Human-readable message */
  message: string;
  
  /** Whether retry might succeed */
  retryable: boolean;
  
  /** Which check produced this error */
  checkType?: string;
  
  /** Original error cause */
  cause?: unknown;
  
  /** When this error occurred */
  timestamp: Date;
}

/**
 * Recorder capabilities declaration
 * 
 * Different vendors expose different features.
 * Adapters declare what they can verify.
 */
export interface RecorderCapabilities {
  /** Can check if stream is active */
  liveStreamStatus: boolean;
  
  /** Can query recording state */
  recordingStatus: boolean;
  
  /** Can search archive for footage */
  archiveSearch: boolean;
  
  /** Can query storage overall status */
  storageStatus: boolean;
  
  /** Can query individual disk health */
  diskHealth: boolean;
  
  /** Can read device time */
  deviceTime: boolean;
  
  /** Can query retention/oldest recording */
  retentionQuery: boolean;
  
  /** Can enumerate channels */
  channelEnumeration: boolean;
}

/**
 * Recorder device information
 */
export interface RecorderDeviceInfo {
  /** Manufacturer */
  manufacturer: string;
  
  /** Model number */
  model: string;
  
  /** Serial number */
  serialNumber?: string;
  
  /** Firmware version */
  firmwareVersion?: string;
  
  /** Hardware version */
  hardwareVersion?: string;
  
  /** Device name */
  deviceName?: string;
}

/**
 * Archive recording metadata
 */
export interface RecordingArchiveInfo {
  /** Recording segment identifier */
  recordingId: string;
  
  /** Start time of this recording */
  startTime: Date;
  
  /** End time of this recording */
  endTime: Date;
  
  /** Duration in seconds */
  durationSeconds: number;
  
  /** File size if available */
  fileSizeBytes?: number;
  
  /** Recording type */
  recordingType?: 'continuous' | 'motion' | 'event' | 'manual';
}

/**
 * Recorder entity (from database)
 */
export interface Recorder {
  /** Recorder ID */
  id: string;
  
  /** Recorder name */
  name?: string;
  
  /** Vendor/manufacturer */
  vendor: string;
  
  /** Model */
  model?: string;
  
  /** IP address */
  ipAddress: string;
  
  /** Port */
  port: number;
  
  /** Protocol */
  protocol?: 'http' | 'https' | 'onvif';
  
  /** Username */
  username?: string;
  
  /** Encrypted password reference */
  passwordEncrypted?: string;
  
  /** Credential reference ID */
  credentialId?: string;
  
  /** Branch this recorder belongs to */
  branchId: string;
  
  /** Tenant */
  tenantId: string;
}

/**
 * Camera entity with recorder association
 */
export interface CameraWithRecorder {
  /** Camera ID */
  id: string;
  
  /** Camera name */
  name: string;
  
  /** Recording mode */
  recordingMode?: 'continuous' | 'motion' | 'event' | 'schedule';
  
  /** Recorder ID */
  recorderId?: string;
  
  /** Channel on recorder */
  recorderChannel?: string;
  
  /** Branch */
  branchId: string;
  
  /** Tenant */
  tenantId: string;
}
