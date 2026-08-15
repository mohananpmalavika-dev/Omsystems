/**
 * Video Capacity Management Types
 * 
 * Separates UI grid capacity from actual decoder capacity.
 * Enables resource-aware, priority-based stream scheduling.
 */

// ============================================================================
// CODEC AND HARDWARE TYPES
// ============================================================================

export type VideoCodec =
  | "H264"
  | "H265"
  | "AV1"
  | "MJPEG"
  | "UNKNOWN";

export type HardwareAccelerationState =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "UNKNOWN";

// ============================================================================
// VIEWER CAPACITY
// ============================================================================

export interface ViewerCapacity {
  // Hard limits
  maxVideoDecoders: number;
  maxAggregateBitrateMbps: number;
  maxPixelsPerSecond: number;

  // Current usage
  activeDecoders: number;
  activeBitrateMbps: number;
  activePixelsPerSecond: number;

  // Browser/device characteristics
  preferredCodec: VideoCodec;
  supportedCodecs: VideoCodec[];
  hardwareAcceleration: HardwareAccelerationState;

  // Resource pressure (optional)
  cpuLoadPercent?: number;
  memoryUsagePercent?: number;

  // Negotiated recommendation
  recommendedDecoderLimit: number;
  measuredAt: string;
}

export interface ViewerResourceBudget {
  // Budgets
  decoderBudget: number;
  bitrateBudgetMbps: number;
  pixelsPerSecondBudget: number;

  // Usage
  decoderUsage: number;
  bitrateUsageMbps: number;
  pixelsPerSecondUsage: number;

  // Emergency reserve
  emergencyReserve: number;
  normalPoolSize: number;
}

// ============================================================================
// STREAM PROFILES AND COST
// ============================================================================

export type StreamType = "MAIN" | "SUB" | "THUMBNAIL";

export interface StreamProfile {
  cameraId: string;
  streamType: StreamType;
  codec: VideoCodec;
  width: number;
  height: number;
  fps: number;
  estimatedBitrateKbps: number;
  uri?: string;
}

export interface StreamCost {
  decoderUnits: number;
  bitrateMbps: number;
  pixelsPerSecond: number;
}

// ============================================================================
// CAMERA PLAYBACK STATE
// ============================================================================

export type CameraPlaybackMode =
  | "MAIN_STREAM"      // Full resolution live
  | "SUB_STREAM"       // Substream live
  | "SNAPSHOT"         // Periodic JPEG refresh
  | "ROTATING"         // Scheduled rotation
  | "SUSPENDED";       // Not displayed

export type CameraPriorityClass =
  | "P0_OPERATOR_PINNED"  // Operator-selected/pinned (highest)
  | "P1_CRITICAL"         // Critical security alert
  | "P2_HIGH"             // High severity alert
  | "P3_INCIDENT"         // Active investigation
  | "P4_VISIBLE"          // Normal visible camera
  | "P5_ROTATION"         // Scheduled rotation
  | "P6_BACKGROUND";      // Background

export type DegradationReason =
  | "DECODER_CAPACITY"
  | "BITRATE_CAPACITY"
  | "PIXEL_CAPACITY"
  | "NETWORK"
  | "STREAM_FAILURE"
  | "EVICTED_BY_PRIORITY";

export interface CameraPlaybackState {
  cameraId: string;
  desiredMode: CameraPlaybackMode;
  actualMode: CameraPlaybackMode;
  priority: CameraPriorityClass;
  priorityScore: number;
  streamProfile?: StreamProfile;
  decoderAllocated: boolean;
  bitrateMbps?: number;
  pixelsPerSecond?: number;
  lastActivatedAt?: number;
  lastFrameAt?: number;
  degradationReason?: DegradationReason;
}

export interface ScheduledCamera {
  cameraId: string;
  mode: CameraPlaybackMode;
  priority: CameraPriorityClass;
  priorityScore: number;
  reason: ScheduleReason;
  streamProfile?: StreamProfile;
  streamCost?: StreamCost;
}

export type ScheduleReason =
  | "OPERATOR_SELECTED"
  | "CRITICAL_ALERT"
  | "HIGH_ALERT"
  | "INCIDENT_ACTIVE"
  | "VISIBLE"
  | "BRANCH_PRIORITY"
  | "ROTATION"
  | "BACKGROUND";

// ============================================================================
// PLAYBACK METRICS
// ============================================================================

export interface PlaybackMetrics {
  totalFrames: number;
  droppedFrames: number;
  droppedFrameRatio: number;
  decodeLatencyMs?: number;
  bufferHealthMs?: number;
  stallCount: number;
}

export interface PlaybackLease {
  cameraId: string;
  activatedAt: number;
  minimumActiveUntil: number;
  preemptible: boolean;
  priorityClass: CameraPriorityClass;
}

// ============================================================================
// DECODER POOL
// ============================================================================

export interface DecoderHandle {
  id: string;
  cameraId: string;
  streamProfile: StreamProfile;
  videoElement?: HTMLVideoElement;
  activatedAt: number;
  lastFrameAt?: number;
}

export interface DecoderBudget {
  total: number;
  normal: number;
  emergencyReserve: number;
}

// ============================================================================
// CAMERA CONTEXT FOR SCHEDULING
// ============================================================================

export interface CameraContext {
  id: string;
  name: string;
  branchId: string;
  
  // State
  operatorSelected: boolean;
  operatorPinned: boolean;
  hasCriticalAlert: boolean;
  hasHighAlert: boolean;
  incidentActive: boolean;
  isVisible: boolean;
  branchSelected: boolean;
  isRotationallyDue: boolean;
  
  // Available streams
  mainStream?: StreamProfile;
  subStream?: StreamProfile;
  
  // Current state
  currentPlaybackState?: CameraPlaybackState;
}

// ============================================================================
// CAPACITY DETECTION
// ============================================================================

export interface CapacityBenchmarkResult {
  maxVideoDecoders: number;
  maxAggregateBitrateMbps: number;
  maxPixelsPerSecond: number;
  recommendedDecoderLimit: number;
  benchmarkDurationMs: number;
}

// ============================================================================
// DEVICE HEALTH (separate from viewer state)
// ============================================================================

export interface CameraDeviceState {
  cameraId: string;
  
  // Device health
  deviceHealth: "ONLINE" | "OFFLINE" | "UNKNOWN";
  recordingHealth: "RECORDING" | "NOT_RECORDING" | "UNKNOWN";
  
  // Viewer state (independent of device health)
  viewerState: "LIVE" | "SNAPSHOT" | "ROTATING" | "DEFERRED" | "FAILED";
  
  lastSeenAt?: string;
  lastRecordedAt?: string;
}
