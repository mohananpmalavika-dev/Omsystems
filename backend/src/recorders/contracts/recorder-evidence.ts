/**
 * Recorder Evidence Structures
 * 
 * Normalized evidence models for all recorder observations.
 * 
 * CRITICAL: These structures represent FACTS, not assessments.
 * Never add fields like "healthy" or "compliant" here.
 */

import type {
  EvidenceValue,
  RecorderAdapterType
} from './evidence-value.js';

/**
 * Complete recorder evidence snapshot
 * 
 * Aggregates all observations from a single collection cycle.
 */
export interface RecorderEvidence {
  /**
   * Recorder ID
   */
  recorderId: string;

  /**
   * Tenant/organization ID
   */
  tenantId: string;

  /**
   * Branch ID (if applicable)
   */
  branchId?: string;

  /**
   * When evidence was collected
   */
  collectedAt: Date;

  /**
   * Adapter used for primary collection
   */
  primaryAdapter: RecorderAdapterType;

  /**
   * Network reachability
   */
  reachable: EvidenceValue<boolean>;

  /**
   * Authentication status
   */
  authenticated: EvidenceValue<boolean>;

  /**
   * Device information
   */
  deviceInfo: EvidenceValue<DeviceInfo>;

  /**
   * Device capabilities
   */
  capabilities: EvidenceValue<RecorderCapabilities>;

  /**
   * Storage status
   */
  storage: EvidenceValue<StorageEvidence>;

  /**
   * Device clock state
   */
  deviceTime: EvidenceValue<DeviceClockEvidence>;

  /**
   * Channel evidence
   */
  channels: EvidenceValue<ChannelEvidence[]>;

  /**
   * Collection duration in milliseconds
   */
  collectionDurationMs: number;
}

/**
 * Device information
 */
export interface DeviceInfo {
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  serialNumber?: string;
  hardwareId?: string;
  deviceName?: string;
}

/**
 * Device capabilities
 * 
 * What operations the recorder supports.
 * Determined by probing or known model database.
 */
export interface RecorderCapabilities {
  /**
   * Device info retrieval
   */
  deviceInfo: boolean;

  /**
   * Channel enumeration
   */
  channelEnumeration: boolean;

  /**
   * Stream status checking
   */
  streamStatus: boolean;

  /**
   * Recording status checking
   */
  recordingStatus: boolean;

  /**
   * Archive search
   */
  recordingSearch: boolean;

  /**
   * Storage/disk status
   */
  storageStatus: boolean;

  /**
   * Device clock query
   */
  deviceTime: boolean;

  /**
   * Playback URI generation
   */
  playbackUri: boolean;

  /**
   * How capabilities were determined
   */
  source: 'reported' | 'known_model' | 'probe' | 'assumed';

  /**
   * When capabilities were discovered
   */
  discoveredAt?: Date;
}

/**
 * Storage evidence
 */
export interface StorageEvidence {
  /**
   * Total capacity in bytes
   */
  totalBytes?: number;

  /**
   * Used space in bytes
   */
  usedBytes?: number;

  /**
   * Free space in bytes
   */
  freeBytes?: number;

  /**
   * Usage percentage (0-100)
   */
  usagePercent?: number;

  /**
   * Individual disks
   */
  disks?: DiskEvidence[];

  /**
   * RAID/storage group information
   */
  storageGroups?: StorageGroupEvidence[];
}

/**
 * Individual disk evidence
 */
export interface DiskEvidence {
  /**
   * Disk identifier
   */
  diskId: string;

  /**
   * Disk state
   */
  state: DiskState;

  /**
   * Capacity in bytes
   */
  capacityBytes?: number;

  /**
   * Disk type
   */
  type?: 'hdd' | 'ssd' | 'unknown';

  /**
   * SMART health status (if available)
   */
  smartStatus?: 'healthy' | 'warning' | 'failed' | 'unknown';

  /**
   * Temperature in Celsius (if available)
   */
  temperatureCelsius?: number;

  /**
   * Vendor-specific disk info
   */
  vendor?: {
    model?: string;
    serialNumber?: string;
    firmwareVersion?: string;
  };
}

export type DiskState =
  | 'normal'      // Operating normally
  | 'degraded'    // Operating but with issues
  | 'failed'      // Failed/unusable
  | 'missing'     // Expected but not detected
  | 'formatting'  // Being formatted
  | 'unknown';    // State unclear

/**
 * Storage group/RAID evidence
 */
export interface StorageGroupEvidence {
  groupId: string;
  type: 'raid0' | 'raid1' | 'raid5' | 'raid6' | 'raid10' | 'jbod' | 'unknown';
  state: 'normal' | 'degraded' | 'rebuilding' | 'failed' | 'unknown';
  diskIds: string[];
}

/**
 * Device clock evidence
 */
export interface DeviceClockEvidence {
  /**
   * Recorder's reported time
   */
  recorderTime: Date;

  /**
   * Local time when observation was made
   */
  observedLocalTime: Date;

  /**
   * Clock offset in milliseconds
   * Positive = recorder ahead
   * Negative = recorder behind
   */
  offsetMs: number;

  /**
   * Whether recorder uses NTP
   */
  ntpEnabled?: boolean;

  /**
   * Configured timezone
   */
  timezone?: string;
}

/**
 * Channel evidence
 */
export interface ChannelEvidence {
  /**
   * Normalized channel ID
   */
  channelId: string;

  /**
   * Vendor-specific channel reference
   */
  vendorChannelRef?: string;

  /**
   * Channel name
   */
  name?: string;

  /**
   * Channel enabled in configuration
   */
  enabled: EvidenceValue<boolean>;

  /**
   * Video stream reachability
   */
  streamReachable: EvidenceValue<boolean>;

  /**
   * Decodable video present
   */
  videoPresent: EvidenceValue<boolean>;

  /**
   * Recording enabled in configuration
   */
  recordingConfigured: EvidenceValue<boolean>;

  /**
   * Recording currently active
   */
  recordingActive: EvidenceValue<boolean>;

  /**
   * Most recent archive timestamp
   */
  latestRecordingAt: EvidenceValue<Date>;

  /**
   * Archive playback verified
   */
  archivePlayable: EvidenceValue<boolean>;

  /**
   * Stream metadata (if available)
   */
  streamMetadata?: StreamMetadata;

  /**
   * Available stream profiles
   */
  streamProfiles?: StreamProfile[];
}

/**
 * Stream metadata
 */
export interface StreamMetadata {
  /**
   * Video codec
   */
  codec?: string;

  /**
   * Resolution width
   */
  width?: number;

  /**
   * Resolution height
   */
  height?: number;

  /**
   * Frame rate
   */
  fps?: number;

  /**
   * Bitrate in kbps
   */
  bitrateKbps?: number;

  /**
   * Audio present
   */
  hasAudio?: boolean;

  /**
   * Audio codec
   */
  audioCodec?: string;
}

/**
 * Stream profile
 * (multiple quality/resolution options per channel)
 */
export interface StreamProfile {
  /**
   * Profile identifier
   */
  profileId: string;

  /**
   * Profile name/type
   */
  name?: string;

  /**
   * Profile type
   */
  type: 'main' | 'sub' | 'mobile' | 'unknown';

  /**
   * Stream URI (sanitized - no credentials)
   */
  streamUri?: string;

  /**
   * Profile metadata
   */
  metadata?: StreamMetadata;

  /**
   * Vendor-specific profile token/reference
   */
  vendorToken?: string;
}

/**
 * Recording segment from archive search
 */
export interface RecordingSegment {
  /**
   * Segment identifier
   */
  id: string;

  /**
   * Channel ID
   */
  channelId: string;

  /**
   * Segment start time
   */
  startTime: Date;

  /**
   * Segment end time
   */
  endTime: Date;

  /**
   * Recording type/trigger
   */
  recordingType?: RecordingType;

  /**
   * Playback URI (if available, sanitized)
   */
  playbackUri?: string;

  /**
   * Segment size in bytes (if available)
   */
  sizeBytes?: number;

  /**
   * Whether segment is locked/protected
   */
  locked?: boolean;

  /**
   * Vendor-specific segment reference
   */
  vendorReference?: string;
}

export type RecordingType =
  | 'continuous'   // Continuous recording
  | 'motion'       // Motion-triggered
  | 'event'        // Event/analytics-triggered
  | 'alarm'        // Alarm input triggered
  | 'manual'       // Manual recording
  | 'unknown';

/**
 * Recording search request
 */
export interface RecordingSearchRequest {
  /**
   * Channel ID
   */
  channelId: string;

  /**
   * Search start time
   */
  from: Date;

  /**
   * Search end time
   */
  to: Date;

  /**
   * Recording types to include (optional)
   */
  types?: RecordingType[];

  /**
   * Maximum segments to return
   */
  limit?: number;

  /**
   * Sort order
   */
  order?: 'asc' | 'desc';
}

/**
 * Recorder probe result
 * 
 * Used during initial discovery to identify recorder type
 * and select appropriate adapter.
 */
export interface RecorderProbe {
  /**
   * Whether device responded
   */
  reachable: boolean;

  /**
   * Detected manufacturer
   */
  manufacturer?: string;

  /**
   * Detected model
   */
  model?: string;

  /**
   * Firmware version
   */
  firmwareVersion?: string;

  /**
   * Supported adapter types (ordered by confidence)
   */
  supportedAdapters: Array<{
    type: RecorderAdapterType;
    confidence: number;
    detectionMethod: 'onvif_discovery' | 'http_headers' | 'api_response' | 'known_model' | 'manual';
  }>;

  /**
   * ONVIF support details (if applicable)
   */
  onvif?: {
    deviceServiceUrl?: string;
    mediaServiceUrl?: string;
    recordingServiceUrl?: string;
    searchServiceUrl?: string;
    profiles?: string[];
  };

  /**
   * Probe duration in milliseconds
   */
  probeDurationMs: number;
}
