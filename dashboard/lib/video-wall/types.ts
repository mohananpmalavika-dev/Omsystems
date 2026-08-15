/**
 * Adaptive Video Wall & Decoder Capacity Manager
 * 
 * Formal domain models separating grid positions from active decoder allocations.
 */

export type CameraRenderMode =
  | "MAIN_STREAM"      // Full resolution & FPS (investigation / fullscreen)
  | "SUB_STREAM"       // Low bandwidth substream (standard grid monitoring)
  | "LOW_FPS_STREAM"   // Throttled substream under resource pressure
  | "SNAPSHOT"         // Periodic JPEG snapshot (non-decoded positions)
  | "CACHED_FRAME"     // Frozen last frame with overlay
  | "SUSPENDED";       // Dormant / unallocated

export type StreamPurpose =
  | "GRID_MONITORING"
  | "CRITICAL_ALERT"
  | "FULLSCREEN"
  | "INVESTIGATION"
  | "PLAYBACK"
  | "AI_VALIDATION";

export type HardwareAccelerationState =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "UNKNOWN";

export interface VideoWallCapacity {
  maxGridSlots: number;               // Total visible slots (e.g. 144 for 12x12)
  maxActiveDecoders: number;          // Safe simultaneous video decoders (e.g. 32-40)
  maxAggregateBitrateMbps: number;    // Network bandwidth budget (e.g. 80 Mbps)
  maxPixelsPerSecond: number;         // Total pixel processing throughput (e.g. 180,000,000 px/s)
  maxMainStreams: number;             // Concurrently allowed 1080p+ streams (e.g. 4)
  maxSubStreams: number;              // Concurrently allowed substreams (e.g. 28)
  hardwareAcceleration: HardwareAccelerationState;
  measuredAt?: string;
}

export interface CameraSchedulingContext {
  cameraId: string;
  branchId: string;
  cameraName?: string;
  branchName?: string;

  isVisible: boolean;
  isSelected: boolean;
  isPinned: boolean;
  isFullscreen: boolean;

  hasCriticalAlert: boolean;
  hasHighAlert: boolean;

  isOffline: boolean;
  recordingFailure: boolean;
  healthWarning: boolean;

  operatorRecentlyViewed: boolean;
  positionInViewport: number;

  desiredQuality: "MAIN" | "SUB" | "THUMBNAIL";
  purpose: StreamPurpose;

  tileWidth?: number;
  tileHeight?: number;
}

export interface CameraAllocation {
  cameraId: string;
  priority: number;
  mode: CameraRenderMode;
  profile: "MAIN" | "SUB" | "THUMBNAIL";
  reason:
    | "FULLSCREEN"
    | "SELECTED"
    | "CRITICAL_ALERT"
    | "PINNED"
    | "VISIBLE_ACTIVE"
    | "SEQUENCING"
    | "CAPACITY_DEFERRED"
    | "OFFSCREEN_SUSPENDED";
  allocatedBitrateKbps: number;
  allocatedFps: number;
  allocatedResolution: { width: number; height: number };
}

export interface VideoWallTelemetry {
  gridSlots: number;
  activeStreams: number;
  mainStreams: number;
  subStreams: number;
  snapshots: number;
  suspended: number;
  decoderUtilizationPercent: number;
  aggregateBitrateMbps: number;
  pixelRate: number;
  averageStartupMs: number;
  droppedFrameRatio: number;
  reconnectingStreams: number;
  degradedLevel: 0 | 1 | 2 | 3;
}

export interface VideoWallPolicy {
  minDecoderHoldMs: number;         // Hysteresis: minimum time a stream holds a slot (e.g. 10,000ms)
  evictionPriorityDelta: number;    // Minimum priority delta required to evict (e.g. 1,000)
  offscreenGraceMs: number;         // Keep offscreen stream warm before release (e.g. 3,000ms)
  criticalPreemption: boolean;      // Immediate preemption for P0/P1 alerts
  snapshotIntervalMs: number;       // Refresh cadence for non-decoded tiles (e.g. 8,000ms)
}
