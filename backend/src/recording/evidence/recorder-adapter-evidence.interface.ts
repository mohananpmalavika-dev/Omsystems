/**
 * Recorder Adapter Evidence Interface
 * 
 * Enhanced recorder adapter interface that returns structured evidence
 * instead of simple health checks. Adapters are responsible for evidence
 * acquisition only, never compliance evaluation.
 * 
 * CRITICAL RULES:
 * 1. Return evidence, not compliance decisions
 * 2. Unknown/unavailable = explicit UNKNOWN state, not optimistic defaults
 * 3. All timestamps are actual measurements, never fabricated
 * 4. Transport errors return UNKNOWN evidence with reason
 * 5. Confidence reflects verification method strength
 */

import type {
  RecordingEvidence,
  EvidenceMethod,
  EvidenceReason,
  StorageEvidence,
  ArchiveCoverageEvidence,
  RecordingGap,
  ClockSkewEvidence
} from './recording-evidence.types.js';

/**
 * Recording state evidence from adapter
 */
export interface RecordingStateEvidence {
  /** Whether recording is active */
  isRecording: boolean | null;
  
  /** Recording mode if known */
  mode?: 'continuous' | 'motion' | 'event' | 'schedule';
  
  /** Recording configuration enabled */
  configurationEnabled?: boolean;
  
  /** When this was verified */
  verifiedAt: Date;
  
  /** Verification method used */
  method: EvidenceMethod;
  
  /** Confidence in this evidence (0.0-1.0) */
  confidence: number;
  
  /** Reason if recording state unknown */
  reason?: EvidenceReason;
}

/**
 * Archive range evidence from adapter
 */
export interface ArchiveRangeEvidence {
  /** Oldest recording timestamp */
  oldestRecordingAt: Date | null;
  
  /** Latest recording timestamp */
  latestRecordingAt: Date | null;
  
  /** Retention span in days */
  retentionDays: number | null;
  
  /** When this was verified */
  verifiedAt: Date;
  
  /** Verification method used */
  method: EvidenceMethod;
  
  /** Confidence in this evidence (0.0-1.0) */
  confidence: number;
  
  /** Reason if archive unavailable */
  reason?: EvidenceReason;
  
  /** Additional archive metadata */
  metadata?: {
    totalSegments?: number;
    totalSizeBytes?: number;
  };
}

/**
 * Storage evidence from adapter
 */
export interface StorageEvidenceResult {
  /** Storage information */
  storage: StorageEvidence;
  
  /** When this was verified */
  verifiedAt: Date;
  
  /** Verification method used */
  method: EvidenceMethod;
  
  /** Confidence in this evidence (0.0-1.0) */
  confidence: number;
  
  /** Reason if storage unavailable */
  reason?: EvidenceReason;
}

/**
 * Recording gap evidence from adapter
 */
export interface RecordingGapEvidence {
  /** Detected gaps */
  gaps: RecordingGap[];
  
  /** Time range queried */
  rangeStart: Date;
  rangeEnd: Date;
  
  /** Expected duration in seconds */
  expectedDurationSeconds: number;
  
  /** Actual recorded duration in seconds */
  recordedDurationSeconds: number;
  
  /** Coverage ratio (0.0-1.0) */
  coverageRatio: number;
  
  /** When this was verified */
  verifiedAt: Date;
  
  /** Verification method used */
  method: EvidenceMethod;
  
  /** Confidence in this evidence (0.0-1.0) */
  confidence: number;
  
  /** Reason if gap analysis unavailable */
  reason?: EvidenceReason;
}

/**
 * Recorder health evidence from adapter
 */
export interface RecorderHealthEvidence {
  /** Whether recorder is reachable */
  reachable: boolean | null;
  
  /** Whether authentication succeeded */
  authenticated: boolean | null;
  
  /** Network latency in milliseconds */
  latencyMs?: number;
  
  /** Authentication method used */
  authMethod?: string;
  
  /** When this was verified */
  verifiedAt: Date;
  
  /** Reason if health check failed */
  reason?: EvidenceReason;
}

/**
 * Channel existence evidence from adapter
 */
export interface ChannelEvidence {
  /** Whether channel exists */
  exists: boolean | null;
  
  /** Whether channel is enabled */
  enabled?: boolean;
  
  /** Channel name */
  name?: string;
  
  /** Whether channel is configured for recording */
  recordingConfigured?: boolean;
  
  /** When this was verified */
  verifiedAt: Date;
  
  /** Reason if channel check failed */
  reason?: EvidenceReason;
}

/**
 * Clock skew evidence from adapter
 */
export interface ClockSkewEvidenceResult {
  /** Clock skew information */
  clockSkew: ClockSkewEvidence;
  
  /** When this was verified */
  verifiedAt: Date;
  
  /** Reason if clock check failed */
  reason?: EvidenceReason;
}

/**
 * Recorder device information
 */
export interface RecorderDevice {
  /** Recorder ID */
  id: string;
  
  /** IP address */
  ipAddress: string;
  
  /** Port */
  port: number;
  
  /** Protocol */
  protocol: 'http' | 'https' | 'onvif';
  
  /** Vendor */
  vendor: string;
  
  /** Model */
  model?: string;
  
  /** Credentials */
  credentials: {
    username: string;
    password: string;
  };
  
  /** Tenant ID */
  tenantId: string;
}

/**
 * Recorder channel reference
 */
export interface RecorderChannel {
  /** Channel ID */
  id: string;
  
  /** Channel number or identifier on recorder */
  channelNumber: string;
  
  /** Camera name */
  name?: string;
  
  /** Tenant ID */
  tenantId: string;
}

/**
 * Enhanced recorder adapter interface for evidence acquisition
 * 
 * Adapters implement this interface to provide evidence about
 * recording status without making compliance decisions.
 */
export interface RecorderEvidenceAdapter {
  /**
   * Get adapter type identifier
   */
  readonly type: string;
  
  /**
   * Get adapter version
   */
  readonly version: string;
  
  /**
   * Get adapter capabilities
   */
  getCapabilities(): {
    recordingState: boolean;
    archiveRange: boolean;
    archiveCoverage: boolean;
    storage: boolean;
    clockSkew: boolean;
    gapDetection: boolean;
  };
  
  /**
   * Check if this adapter supports the given device
   */
  supports(device: RecorderDevice): boolean;
  
  /**
   * Test recorder health (connectivity + authentication)
   */
  getHealth(
    device: RecorderDevice
  ): Promise<RecorderHealthEvidence>;
  
  /**
   * Verify channel exists and is configured
   */
  getChannelEvidence(
    device: RecorderDevice,
    channel: RecorderChannel
  ): Promise<ChannelEvidence>;
  
  /**
   * Get recording state evidence
   * 
   * CRITICAL: Returns actual recording state from recorder.
   * Configuration alone is insufficient - must verify active recording.
   * Returns null for isRecording if cannot verify.
   */
  getChannelRecordingState(
    device: RecorderDevice,
    channel: RecorderChannel
  ): Promise<RecordingStateEvidence>;
  
  /**
   * Get archive range evidence
   * 
   * CRITICAL: Returns actual timestamps from archive.
   * Never fabricates timestamps. Returns null if archive unavailable.
   */
  getArchiveRange(
    device: RecorderDevice,
    channel: RecorderChannel
  ): Promise<ArchiveRangeEvidence>;
  
  /**
   * Get storage evidence
   * 
   * Returns actual storage status from recorder.
   * Returns UNKNOWN status if cannot query storage.
   */
  getStorageEvidence(
    device: RecorderDevice
  ): Promise<StorageEvidenceResult>;
  
  /**
   * Find recording gaps in a time range
   * 
   * Optional feature - not all adapters support this.
   * Returns null if gap detection not supported.
   */
  findRecordingGaps?(
    device: RecorderDevice,
    channel: RecorderChannel,
    from: Date,
    to: Date
  ): Promise<RecordingGapEvidence | null>;
  
  /**
   * Get archive coverage evidence for a time period
   * 
   * Calculates coverage statistics for a specific time range.
   * Uses gap detection if available.
   */
  getArchiveCoverage?(
    device: RecorderDevice,
    channel: RecorderChannel,
    from: Date,
    to: Date
  ): Promise<ArchiveCoverageEvidence | null>;
  
  /**
   * Get clock skew evidence
   * 
   * Checks time synchronization between recorder and platform.
   */
  getClockSkew?(
    device: RecorderDevice
  ): Promise<ClockSkewEvidenceResult>;
  
  /**
   * Verify media is actually readable (deep check)
   * 
   * Optional expensive check that actually attempts to read
   * a sample of the archive to verify it's not corrupted.
   * 
   * Returns confidence level based on sample verification.
   */
  verifyMediaReadability?(
    device: RecorderDevice,
    channel: RecorderChannel,
    sampleSize: number
  ): Promise<{
    readable: boolean;
    samplesChecked: number;
    samplesPassed: number;
    confidence: number;
    verifiedAt: Date;
    reason?: EvidenceReason;
  }>;
  
  /**
   * Disconnect and clean up resources
   */
  disconnect(): Promise<void>;
}

/**
 * Adapter registry for managing multiple adapter implementations
 */
export interface RecorderAdapterRegistry {
  /**
   * Register an adapter factory
   */
  register(
    vendor: string,
    factory: RecorderAdapterFactory
  ): void;
  
  /**
   * Get adapter for a specific device
   */
  getAdapter(
    device: RecorderDevice
  ): Promise<RecorderEvidenceAdapter>;
  
  /**
   * Check if adapter exists for vendor
   */
  hasAdapter(vendor: string): boolean;
  
  /**
   * Get all registered vendors
   */
  getVendors(): string[];
}

/**
 * Factory for creating adapter instances
 */
export interface RecorderAdapterFactory {
  /**
   * Create adapter instance for device
   */
  create(device: RecorderDevice): Promise<RecorderEvidenceAdapter>;
  
  /**
   * Check if this factory supports the device
   */
  supports(device: RecorderDevice): boolean;
}

/**
 * Helper to create UNKNOWN evidence when adapter unavailable
 */
export function createUnknownRecordingState(
  reason: EvidenceReason,
  source: string = 'unavailable'
): RecordingStateEvidence {
  return {
    isRecording: null,
    verifiedAt: new Date(),
    method: 'UNKNOWN',
    confidence: 0,
    reason
  };
}

/**
 * Helper to create UNKNOWN archive range
 */
export function createUnknownArchiveRange(
  reason: EvidenceReason,
  source: string = 'unavailable'
): ArchiveRangeEvidence {
  return {
    oldestRecordingAt: null,
    latestRecordingAt: null,
    retentionDays: null,
    verifiedAt: new Date(),
    method: 'UNKNOWN',
    confidence: 0,
    reason
  };
}

/**
 * Helper to create UNKNOWN storage evidence
 */
export function createUnknownStorage(
  reason: EvidenceReason
): StorageEvidenceResult {
  return {
    storage: {
      status: 'UNKNOWN',
      totalBytes: null,
      usedBytes: null,
      freeBytes: null
    },
    verifiedAt: new Date(),
    method: 'UNKNOWN',
    confidence: 0,
    reason
  };
}

/**
 * Confidence levels for different verification methods
 */
export const EVIDENCE_CONFIDENCE = {
  /** Direct vendor API query */
  VENDOR_API: 1.0,
  
  /** ONVIF standard protocol */
  ONVIF: 0.95,
  
  /** Archive database query */
  ARCHIVE_QUERY: 0.95,
  
  /** Local agent verification */
  LOCAL_AGENT: 0.98,
  
  /** RTSP stream check (weak evidence for recording) */
  RTSP: 0.4,
  
  /** SNMP check */
  SNMP: 0.7,
  
  /** Manual verification */
  MANUAL: 1.0,
  
  /** Unknown/unavailable */
  UNKNOWN: 0.0
} as const;
