/**
 * Recorder Driver Interface
 * 
 * Canonical interface for recorder integration.
 * All vendor implementations must implement this interface.
 * 
 * CRITICAL PRINCIPLES:
 * 1. Return UNKNOWN when cannot verify, never fabricate values
 * 2. Preserve observation metadata (timestamp, latency, confidence)
 * 3. Normalize vendor responses to canonical types
 * 4. Include raw vendor data for diagnostics
 * 5. Capability-driven feature detection
 */

import type {
  RecorderProtocol,
  RecorderContext,
  RecorderCapabilities,
  DeviceInfo,
  StorageStatus,
  RecorderChannel,
  StreamEndpoint,
  StreamRequest,
  RecordingSearchRequest,
  RecordingSearchResult,
  RecorderProbeResult,
  HealthState
} from "./recorder-driver.types.js";

/**
 * Recorder driver interface
 * 
 * All operations accept RecorderContext for:
 * - Multi-tenancy
 * - Credential resolution
 * - Timeout control
 * - Request correlation
 */
export interface RecorderDriver {
  /** Protocol identifier */
  readonly protocol: RecorderProtocol;
  
  /** Driver version */
  readonly version: string;
  
  /**
   * Probe recorder health
   * 
   * Performs comprehensive health check including:
   * - Connectivity
   * - Authentication
   * - Device info
   * - Storage
   * - Channels
   * - Recording status
   * 
   * This is the primary health collection method.
   */
  probe(
    ctx: RecorderContext,
    options?: ProbeOptions
  ): Promise<RecorderProbeResult>;
  
  /**
   * Get device information
   * 
   * Returns manufacturer, model, firmware, serial number.
   * Used for capability detection and troubleshooting.
   */
  getDeviceInfo(
    ctx: RecorderContext
  ): Promise<DeviceInfo>;
  
  /**
   * Get capabilities
   * 
   * Declares which features this driver can verify.
   * May include runtime detection results.
   */
  getCapabilities(
    ctx: RecorderContext
  ): Promise<RecorderCapabilities>;
  
  /**
   * Get all channels
   * 
   * Enumerates all recorder channels with status.
   */
  getChannels(
    ctx: RecorderContext
  ): Promise<RecorderChannel[]>;
  
  /**
   * Get specific channel
   * 
   * Returns single channel with detailed status.
   */
  getChannel(
    ctx: RecorderContext,
    channelId: string
  ): Promise<RecorderChannel>;
  
  /**
   * Get stream URI
   * 
   * Resolves stream endpoint for live viewing.
   * Returns RTSP, HTTP, or other protocol URI.
   */
  getStreamUri(
    ctx: RecorderContext,
    request: StreamRequest
  ): Promise<StreamEndpoint>;
  
  /**
   * Get channel status
   * 
   * Quick status check for single channel.
   * Verifies connection, video signal, recording state.
   */
  getChannelStatus(
    ctx: RecorderContext,
    channelId: string
  ): Promise<ChannelStatus>;
  
  /**
   * Get recording status
   * 
   * Verifies recording is actively writing.
   * CRITICAL: Must verify actual recording activity, not just config.
   */
  getRecordingStatus(
    ctx: RecorderContext,
    channelId: string
  ): Promise<RecordingStatus>;
  
  /**
   * Search recordings
   * 
   * Find recording segments in archive.
   * Used for retention verification and playback.
   */
  searchRecordings(
    ctx: RecorderContext,
    request: RecordingSearchRequest
  ): Promise<RecordingSearchResult>;
  
  /**
   * Get storage status
   * 
   * Returns disk health, capacity, usage.
   * Includes SMART status if available.
   */
  getStorageStatus(
    ctx: RecorderContext
  ): Promise<StorageStatus>;
  
  /**
   * Get device time
   * 
   * Returns recorder's current time.
   * Used for clock drift detection.
   */
  getDeviceTime(
    ctx: RecorderContext
  ): Promise<DeviceTimeResult>;
}

/**
 * Probe options
 */
export interface ProbeOptions {
  /** Include archive search (expensive) */
  includeArchive?: boolean;
  
  /** Include channel details */
  includeChannels?: boolean;
  
  /** Include storage details */
  includeStorage?: boolean;
  
  /** Enable diagnostic mode (captures raw responses) */
  diagnostic?: boolean;
  
  /** Timeout override (ms) */
  timeoutMs?: number;
}

/**
 * Channel status result
 */
export interface ChannelStatus {
  /** Channel ID */
  channelId: string;
  
  /** Overall channel health */
  state: HealthState;
  
  /** Connection state */
  connected: boolean;
  
  /** Has video signal */
  hasSignal: boolean;
  
  /** Is recording */
  recording: boolean;
  
  /** State reason */
  reason?: string;
  
  /** Observed at */
  observedAt: Date;
}

/**
 * Recording status result
 */
export interface RecordingStatus {
  /** Channel ID */
  channelId: string;
  
  /** Recording state */
  state: "RECORDING" | "NOT_RECORDING" | "PAUSED" | "ERROR" | "UNKNOWN";
  
  /** Is actively writing */
  activelyWriting: boolean;
  
  /** Latest recording timestamp (from archive, NOT current time) */
  latestRecordingAt?: Date;
  
  /** Recording enabled in config */
  configEnabled: boolean;
  
  /** State reason */
  reason?: string;
  
  /** Observed at */
  observedAt: Date;
}

/**
 * Device time result
 */
export interface DeviceTimeResult {
  /** Device time */
  deviceTime: Date;
  
  /** System time when read */
  systemTime: Date;
  
  /** Clock drift (seconds, positive = device ahead) */
  driftSeconds: number;
  
  /** NTP enabled */
  ntpEnabled?: boolean;
  
  /** NTP synchronized */
  ntpSynchronized?: boolean;
  
  /** Observed at */
  observedAt: Date;
}

/**
 * Driver detection result
 * Result of automatic driver detection
 */
export interface DriverDetectionResult {
  /** Detected protocol */
  protocol: RecorderProtocol;
  
  /** Detected vendor */
  vendor: string;
  
  /** Detection confidence (0-1) */
  confidence: number;
  
  /** Evidence for detection */
  evidence: string[];
  
  /** Alternative protocols */
  alternatives?: Array<{
    protocol: RecorderProtocol;
    confidence: number;
  }>;
}

/**
 * Driver detector interface
 * Automatically identifies recorder protocol
 */
export interface DriverDetector {
  /**
   * Detect recorder protocol
   * 
   * Attempts to identify the best driver by:
   * - ONVIF discovery
   * - HTTP fingerprinting
   * - Vendor-specific probes
   * 
   * Returns confidence-scored result.
   */
  detect(
    endpoint: {
      host: string;
      port: number;
      scheme: "http" | "https";
    },
    credentials: {
      username: string;
      password: string;
    },
    options?: {
      timeoutMs?: number;
      tryAllDrivers?: boolean;
    }
  ): Promise<DriverDetectionResult>;
}
