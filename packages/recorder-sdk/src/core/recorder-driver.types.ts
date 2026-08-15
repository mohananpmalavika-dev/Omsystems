/**
 * Recorder Driver Core Types
 * 
 * Canonical type system for recorder integration.
 * All vendor drivers normalize to these types.
 */

/**
 * Recorder vendor identity
 * Separate vendor from protocol to handle OEM variations
 */
export type RecorderVendor =
  | "hikvision"
  | "dahua"
  | "cp-plus"      // CP PLUS (often Dahua OEM)
  | "uniview"
  | "tvt"
  | "prama"
  | "honeywell"
  | "matrix"
  | "secureye"
  | "tiandy"
  | "axis"
  | "bosch"
  | "hanwha"
  | "vivotek"
  | "unknown";

/**
 * Recorder protocol family
 * Independent from vendor to handle firmware variations
 */
export type RecorderProtocol =
  | "hikvision-isapi"   // Hikvision ISAPI (XML over HTTP)
  | "dahua-cgi"         // Dahua CGI (proprietary text format)
  | "onvif"             // ONVIF SOAP (XML)
  | "uniview-api"       // Uniview proprietary API
  | "generic-rtsp"      // Fallback RTSP-only
  | "unknown";

/**
 * Recorder identity
 * Complete identification with vendor/protocol separation
 */
export interface RecorderIdentity {
  /** Vendor/manufacturer name */
  vendor: RecorderVendor;
  
  /** Protocol family this device uses */
  protocolFamily: RecorderProtocol;
  
  /** Raw manufacturer string from device */
  manufacturer?: string;
  
  /** Model number/name */
  model?: string;
  
  /** Firmware version */
  firmwareVersion?: string;
  
  /** Hardware ID or serial number */
  hardwareId?: string;
  
  /** Device serial number */
  serialNumber?: string;
}

/**
 * Device endpoint configuration
 */
export interface DeviceEndpoint {
  /** IP address or hostname */
  host: string;
  
  /** Port number */
  port: number;
  
  /** Protocol (http/https) */
  scheme: "http" | "https";
  
  /** Base URL */
  baseUrl: string;
}

/**
 * Credential reference
 * Never store credentials directly in context
 */
export interface CredentialRef {
  /** Reference ID to retrieve from secret store */
  ref: string;
  
  /** Credential type hint */
  type: "basic" | "digest" | "api-key" | "token";
}

/**
 * Recorder execution context
 * Passed to all driver operations
 */
export interface RecorderContext {
  /** Tenant ID for multi-tenancy */
  tenantId: string;
  
  /** Branch ID */
  branchId: string;
  
  /** Recorder ID */
  recorderId: string;
  
  /** Device endpoint */
  endpoint: DeviceEndpoint;
  
  /** Credential reference (resolved by transport layer) */
  credentialRef: CredentialRef;
  
  /** Protocol family */
  protocol: RecorderProtocol;
  
  /** Request correlation ID */
  correlationId?: string;
  
  /** Request timeout override (ms) */
  timeoutMs?: number;
}

/**
 * Health state enumeration
 * Normalized across all vendors
 */
export type HealthState =
  | "HEALTHY"      // Verified operational
  | "DEGRADED"     // Operational but impaired
  | "FAILED"       // Not operational
  | "UNKNOWN";     // Cannot verify

/**
 * Capability state
 * Tracks feature support and confidence
 */
export interface CapabilityState {
  /** Is this capability supported? */
  supported: boolean;
  
  /** How was support determined? */
  source: "discovered" | "vendor" | "onvif" | "configuration" | "unknown";
  
  /** Confidence level (0-1) */
  confidence: number;
  
  /** Optional reason for unavailability */
  reason?: string;
}

/**
 * Recorder capabilities
 * Declares what the driver can verify
 */
export interface RecorderCapabilities {
  // Video streaming
  liveVideo: CapabilityState;
  subStream: CapabilityState;
  
  // Channel management
  channelEnumeration: CapabilityState;
  
  // Recording verification
  recordingStatus: CapabilityState;
  recordingSearch: CapabilityState;
  playback: CapabilityState;
  recordingExport: CapabilityState;
  
  // Storage monitoring
  storageTelemetry: CapabilityState;
  retentionTelemetry: CapabilityState;
  
  // Time management
  deviceTime: CapabilityState;
  ntpStatus: CapabilityState;
  
  // Event monitoring
  videoLossEvents: CapabilityState;
  motionEvents: CapabilityState;
  
  // PTZ control
  ptz: CapabilityState;
  
  // Protocol support
  vendorApi: CapabilityState;
  onvif: CapabilityState;
}

/**
 * Device information
 * Normalized device metadata
 */
export interface DeviceInfo extends RecorderIdentity {
  /** Device name/description */
  deviceName?: string;
  
  /** MAC address */
  macAddress?: string;
  
  /** Detected at timestamp */
  detectedAt: Date;
}

/**
 * Storage type enumeration
 */
export type StorageType = "HDD" | "SSD" | "NAS" | "SD" | "UNKNOWN";

/**
 * Storage volume
 * Normalized storage representation
 */
export interface StorageVolume {
  /** Volume ID */
  id: string;
  
  /** Storage type */
  type: StorageType;
  
  /** Health state */
  state: HealthState;
  
  /** Total capacity in bytes */
  capacityBytes?: number;
  
  /** Free space in bytes */
  freeBytes?: number;
  
  /** Used space in bytes */
  usedBytes?: number;
  
  /** SMART health state (if available) */
  smartState?: HealthState;
  
  /** Raw vendor-specific state string */
  rawVendorState?: string;
  
  /** RAID/group membership */
  groupId?: string;
}

/**
 * Storage status result
 */
export interface StorageStatus {
  /** Overall storage health */
  state: HealthState;
  
  /** Storage volumes/disks */
  volumes: StorageVolume[];
  
  /** Total capacity across all volumes */
  totalCapacityBytes?: number;
  
  /** Total free space */
  totalFreeBytes?: number;
  
  /** Total used space */
  totalUsedBytes?: number;
  
  /** Usage percentage */
  usagePercent?: number;
  
  /** Availability reason if not healthy */
  reason?: string;
  
  /** When was this observed */
  observedAt: Date;
}

/**
 * Channel source type
 */
export type ChannelSourceType = "IP" | "ANALOG" | "VIRTUAL" | "UNKNOWN";

/**
 * Channel connection state
 */
export type ChannelConnectionState =
  | "ONLINE"          // Camera connected and streaming
  | "OFFLINE"         // Camera not reachable
  | "AUTH_ERROR"      // Authentication failed
  | "VIDEO_LOSS"      // Physical video loss
  | "UNKNOWN";        // Cannot determine

/**
 * Channel recording state
 */
export type ChannelRecordingState =
  | "RECORDING"       // Actively recording
  | "NOT_RECORDING"   // Not recording
  | "PAUSED"          // Recording paused
  | "ERROR"           // Recording error
  | "UNKNOWN";        // Cannot determine

/**
 * Recorder channel
 * Normalized channel representation
 */
export interface RecorderChannel {
  /** Channel ID (stable across reboots) */
  id: string;
  
  /** Channel index/number (1-based typically) */
  index: number;
  
  /** Channel name/label */
  name?: string;
  
  /** Is channel enabled? */
  enabled: boolean;
  
  /** Source type */
  sourceType: ChannelSourceType;
  
  /** Connection state */
  connectionState: ChannelConnectionState;
  
  /** Recording state */
  recordingState: ChannelRecordingState;
  
  /** Main stream URI */
  mainStreamUri?: string;
  
  /** Sub stream URI */
  subStreamUri?: string;
  
  /** Raw vendor channel data */
  rawVendorData?: Record<string, unknown>;
}

/**
 * Stream profile enumeration
 */
export type StreamProfile = "MAIN" | "SUBSTREAM" | "THIRD";

/**
 * Stream endpoint
 * Result of stream URI resolution
 */
export interface StreamEndpoint {
  /** Stream protocol */
  protocol: "RTSP" | "HTTP" | "RTMP" | "HLS" | "WEBRTC";
  
  /** Stream URI */
  uri: string;
  
  /** Video codec */
  codec?: string;
  
  /** Resolution width */
  width?: number;
  
  /** Resolution height */
  height?: number;
  
  /** Frame rate */
  fps?: number;
  
  /** Bitrate (bps) */
  bitrate?: number;
}

/**
 * Stream request
 * Request for stream URI resolution
 */
export interface StreamRequest {
  /** Channel ID */
  channelId: string;
  
  /** Stream profile */
  profile: StreamProfile;
  
  /** Prefer specific transport */
  preferredProtocol?: "RTSP" | "HTTP";
}

/**
 * Recording segment
 * Single continuous recording segment
 */
export interface RecordingSegment {
  /** Segment ID */
  id: string;
  
  /** Channel ID */
  channelId: string;
  
  /** Start time */
  startTime: Date;
  
  /** End time */
  endTime: Date;
  
  /** Duration in seconds */
  durationSeconds: number;
  
  /** File size in bytes */
  fileSizeBytes?: number;
  
  /** Recording type */
  recordingType?: "continuous" | "event" | "manual";
}

/**
 * Recording search request
 */
export interface RecordingSearchRequest {
  /** Channel ID */
  channelId: string;
  
  /** Search start time */
  from: Date;
  
  /** Search end time */
  to: Date;
  
  /** Result ordering */
  order?: "ASC" | "DESC";
  
  /** Maximum results */
  limit?: number;
  
  /** Recording type filter */
  recordingType?: "continuous" | "event" | "manual";
}

/**
 * Recording search result
 */
export interface RecordingSearchResult {
  /** Found segments */
  segments: RecordingSegment[];
  
  /** Total matches */
  totalCount: number;
  
  /** Has more results */
  hasMore: boolean;
  
  /** Search completed successfully */
  success: boolean;
  
  /** Availability reason if not successful */
  reason?: string;
}

/**
 * Recorder probe result
 * Complete health snapshot
 */
export interface RecorderProbeResult {
  /** Recorder ID */
  recorderId: string;
  
  /** Is recorder reachable? */
  reachable: boolean;
  
  /** Overall status */
  status: HealthState;
  
  /** Device identity */
  identity?: DeviceInfo;
  
  /** Detected capabilities */
  capabilities: RecorderCapabilities;
  
  /** Storage status */
  storage?: StorageStatus;
  
  /** Channels */
  channels: RecorderChannel[];
  
  /** Device time */
  deviceTime?: Date;
  
  /** Clock drift from system time (seconds) */
  clockDriftSeconds?: number;
  
  /** Probe duration (ms) */
  probeDurationMs: number;
  
  /** Probe timestamp */
  probedAt: Date;
  
  /** Reason codes for issues */
  reasonCodes: string[];
  
  /** Raw vendor response (diagnostic mode) */
  diagnosticData?: {
    endpoints: string[];
    responses: Array<{
      endpoint: string;
      statusCode: number;
      durationMs: number;
      fingerprint: string;
    }>;
  };
}

/**
 * Recorder driver error codes
 */
export type RecorderDriverErrorCode =
  | "CONNECTION_REFUSED"
  | "NETWORK_TIMEOUT"
  | "DNS_RESOLUTION_FAILED"
  | "AUTHENTICATION_FAILED"
  | "INVALID_CREDENTIALS"
  | "TLS_ERROR"
  | "CERTIFICATE_ERROR"
  | "AUTHORIZATION_DENIED"
  | "ENDPOINT_NOT_FOUND"
  | "UNSUPPORTED_FEATURE"
  | "MALFORMED_RESPONSE"
  | "PARSE_ERROR"
  | "DEVICE_ERROR"
  | "PROTOCOL_ERROR"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "UNKNOWN_ERROR";

/**
 * Recorder driver error
 */
export class RecorderDriverError extends Error {
  constructor(
    message: string,
    public code: RecorderDriverErrorCode,
    public retryable: boolean = false,
    public cause?: unknown
  ) {
    super(message);
    this.name = "RecorderDriverError";
  }
}

/**
 * Connection error
 */
export class RecorderConnectionError extends RecorderDriverError {
  constructor(message: string, cause?: unknown) {
    super(message, "CONNECTION_REFUSED", true, cause);
    this.name = "RecorderConnectionError";
  }
}

/**
 * Authentication error
 */
export class RecorderAuthenticationError extends RecorderDriverError {
  constructor(message: string, cause?: unknown) {
    super(message, "AUTHENTICATION_FAILED", false, cause);
    this.name = "RecorderAuthenticationError";
  }
}

/**
 * Timeout error
 */
export class RecorderTimeoutError extends RecorderDriverError {
  constructor(message: string, cause?: unknown) {
    super(message, "NETWORK_TIMEOUT", true, cause);
    this.name = "RecorderTimeoutError";
  }
}

/**
 * Protocol error
 */
export class RecorderProtocolError extends RecorderDriverError {
  constructor(message: string, cause?: unknown) {
    super(message, "PROTOCOL_ERROR", false, cause);
    this.name = "RecorderProtocolError";
  }
}

/**
 * Unsupported feature error
 */
export class UnsupportedCapabilityError extends RecorderDriverError {
  constructor(capability: string, vendor: string) {
    super(
      `Capability '${capability}' is not supported by ${vendor}`,
      "UNSUPPORTED_FEATURE",
      false
    );
    this.name = "UnsupportedCapabilityError";
  }
}
