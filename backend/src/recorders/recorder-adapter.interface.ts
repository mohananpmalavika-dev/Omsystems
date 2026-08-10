/**
 * Recorder Adapter Interface
 * 
 * Vendor-independent API for querying recorder health and recording status.
 * Each vendor implementation (Hikvision, Dahua, Axis, ONVIF, etc.) provides
 * concrete implementations of these methods.
 * 
 * CRITICAL DESIGN RULES:
 * 1. Methods return CheckResult with status: healthy/unhealthy/unknown
 * 2. Cannot verify = UNKNOWN, never healthy
 * 3. Unsupported features = UNKNOWN with clear message
 * 4. All methods include timeout and error handling
 * 5. Never fabricate timestamps or health data
 */

import type {
  ConnectionStatus,
  AuthenticationStatus,
  RecorderChannel,
  StreamStatus,
  RecordingStatus,
  RecordingArchiveInfo,
  StorageCheckResult,
  RecorderDeviceInfo,
  RecorderCapabilities,
  CheckResult
} from './types/index.js';

/**
 * Recorder credentials
 */
export interface RecorderCredentials {
  username: string;
  password: string;
}

/**
 * Recorder connection configuration
 */
export interface RecorderConnection {
  ipAddress: string;
  port: number;
  protocol: 'http' | 'https';
  credentials: RecorderCredentials;
}

/**
 * Recorder adapter interface
 * 
 * All methods are async and include built-in timeout handling.
 * Methods return CheckResult to distinguish between:
 * - healthy: positive evidence of proper operation
 * - unhealthy: evidence of failure
 * - unknown: cannot verify
 */
export interface RecorderAdapter {
  /**
   * Get adapter capabilities
   * Declares which features this adapter can verify
   */
  getCapabilities(): RecorderCapabilities;
  
  /**
   * Get adapter metadata
   */
  getAdapterInfo(): {
    type: string;
    version: string;
    vendor: string;
  };
  
  /**
   * Test basic connectivity to recorder
   * 
   * Verifies:
   * - Network reachable
   * - Port accessible
   * - Device responds
   * 
   * Returns:
   * - healthy: device reachable
   * - unhealthy: connection refused, no route to host
   * - unknown: timeout (could be network or device issue)
   */
  testConnection(): Promise<ConnectionStatus>;
  
  /**
   * Authenticate with recorder
   * 
   * Verifies:
   * - Credentials valid
   * - Session established
   * 
   * Returns:
   * - healthy: authenticated successfully
   * - unhealthy: invalid credentials, unauthorized
   * - unknown: cannot determine (dependent check failed)
   */
  authenticate(): Promise<AuthenticationStatus>;
  
  /**
   * Get device information
   * 
   * Returns manufacturer, model, firmware version, etc.
   * Used for capability detection and troubleshooting.
   */
  getDeviceInfo(): Promise<CheckResult<RecorderDeviceInfo>>;
  
  /**
   * Get all channels on this recorder
   * 
   * Returns:
   * - healthy: channels enumerated
   * - unhealthy: API error
   * - unknown: feature not supported or cannot verify
   */
  getChannels(): Promise<CheckResult<RecorderChannel[]>>;
  
  /**
   * Get specific channel details
   * 
   * Verifies:
   * - Channel exists
   * - Channel configured
   * 
   * Returns:
   * - healthy: channel found
   * - unhealthy: channel not found or disabled
   * - unknown: cannot query channels
   */
  getChannel(channelId: string): Promise<CheckResult<RecorderChannel>>;
  
  /**
   * Get stream status for a channel
   * 
   * Verifies:
   * - Stream is active
   * - Signal present
   * 
   * Returns:
   * - healthy: stream active with signal
   * - unhealthy: no signal, stream error
   * - unknown: cannot verify stream status
   */
  getStreamStatus(channelId: string): Promise<StreamStatus>;
  
  /**
   * Get recording status for a channel
   * 
   * Verifies:
   * - Recording enabled in config
   * - Recording actively writing
   * 
   * CRITICAL: Configuration alone is insufficient.
   * Must verify actual recording activity.
   * 
   * Returns:
   * - healthy: actively recording
   * - unhealthy: recording stopped or error
   * - unknown: cannot verify recording state
   */
  getRecordingStatus(channelId: string): Promise<RecordingStatus>;
  
  /**
   * Get latest recording from archive
   * 
   * Verifies:
   * - Archive accessible
   * - Recent footage exists
   * 
   * CRITICAL: Returns actual archive evidence, never current timestamp.
   * 
   * Returns:
   * - healthy: recent recording found
   * - unhealthy: archive stale or missing
   * - unknown: cannot access archive
   * - null: no recordings found
   */
  getLatestRecording(channelId: string): Promise<RecordingArchiveInfo | null>;
  
  /**
   * Get oldest recording from archive
   * 
   * Used for retention compliance verification.
   * 
   * Returns actual oldest recording time or null if no recordings.
   */
  getOldestRecording(channelId: string): Promise<RecordingArchiveInfo | null>;
  
  /**
   * Get storage status
   * 
   * Verifies:
   * - Disks present and healthy
   * - Capacity available
   * - No RAID degradation
   * 
   * Returns:
   * - healthy: storage operational with capacity
   * - unhealthy: disk failed, full, or read-only
   * - unknown: cannot query storage
   */
  getStorageStatus(): Promise<StorageCheckResult>;
  
  /**
   * Get device time
   * 
   * Returns recorder's current time for clock drift detection.
   * 
   * Returns:
   * - healthy: time retrieved
   * - unknown: cannot read device time
   */
  getDeviceTime(): Promise<CheckResult<Date>>;
  
  /**
   * Close connection and clean up resources
   */
  disconnect(): Promise<void>;
}

/**
 * Base error class for recorder adapter errors
 */
export class RecorderAdapterError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean = false,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'RecorderAdapterError';
  }
}

/**
 * Connection timeout error
 */
export class RecorderConnectionTimeoutError extends RecorderAdapterError {
  constructor(ipAddress: string, timeoutMs: number) {
    super(
      `Connection to ${ipAddress} timed out after ${timeoutMs}ms`,
      'NETWORK_TIMEOUT',
      true
    );
    this.name = 'RecorderConnectionTimeoutError';
  }
}

/**
 * Authentication error
 */
export class RecorderAuthenticationError extends RecorderAdapterError {
  constructor(message: string) {
    super(message, 'AUTHENTICATION_FAILED', false);
    this.name = 'RecorderAuthenticationError';
  }
}

/**
 * Unsupported feature error
 */
export class RecorderUnsupportedFeatureError extends RecorderAdapterError {
  constructor(feature: string, vendor: string) {
    super(
      `${feature} is not supported by ${vendor} adapter`,
      'UNSUPPORTED_FEATURE',
      false
    );
    this.name = 'RecorderUnsupportedFeatureError';
  }
}
