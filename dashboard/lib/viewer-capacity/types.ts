/**
 * Viewer Capacity & Decode Scheduler Domain Types
 * 
 * Formalizes the decoupling of visual grid slots (e.g. 144 positions) from
 * physical browser decoding resources, multi-dimensional admission budgets,
 * stream prioritization, degradation states, and telemetry.
 */

export interface ViewerEntitlement {
  maxGridPositions: number;
  maxBranchesVisible: number;
  allowSequencing: boolean;
  allowPriorityPreemption: boolean;
  multiMonitorAllowed: boolean;
}

export interface ViewerCapacity {
  // Hard / learned limits
  maxVideoDecoders: number;
  maxAggregateBitrateMbps: number;
  maxPixelsPerSecond: number;

  // Current usage
  activeDecoders: number;
  activeBitrateMbps: number;
  activePixelsPerSecond: number;

  // Codec support & preference
  supportedCodecs: Array<"H264" | "H265" | "AV1">;
  preferredCodec: "H264" | "H265" | "AV1";

  // Hardware acceleration status
  hardwareAcceleration: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";

  // Calibration metadata
  confidence: number;
  lastCalibratedAt?: string;
}

export type CodecType = "H264" | "H265" | "AV1";

export type StreamType = "MAIN" | "SUB" | "THUMBNAIL";

export type TransportType = "WEBRTC" | "HLS" | "MSE" | "OTHER";

export interface StreamProfile {
  cameraId: string;
  codec: CodecType;
  width: number;
  height: number;
  fps: number;
  bitrateMbps: number;
  streamType: StreamType;
  transport: TransportType;
}

export type StreamPriority = "P0" | "P1" | "P2" | "P3" | "P4";

export type RequestedQuality = "THUMBNAIL" | "GRID" | "FOCUSED";

export type StreamState =
  | "MAIN_LIVE"
  | "SUB_LIVE"
  | "LOW_FPS"
  | "THUMBNAIL"
  | "ROTATING"
  | "SNAPSHOT"
  | "SUSPENDED";

export interface StreamCandidate {
  cameraId: string;
  branchId: string;
  priority: StreamPriority;
  requestedQuality: RequestedQuality;
  stream: StreamProfile;
  visible: boolean;
  selected: boolean;
  alarmActive: boolean;
  pinned: boolean;
  lastActivatedAt?: number;
  lastViewedAt?: number;
  healthState?: "HEALTHY" | "WARNING" | "CRITICAL" | "OFFLINE";
  alertSeverity?: "INFO" | "MEDIUM" | "HIGH" | "CRITICAL";
  tileWidth?: number;
  tileHeight?: number;
}

export interface AdmissionDecision {
  admitted: boolean;
  reason: string;
  effectiveProfile?: StreamProfile;
  requiredEvictions?: string[];
  effectiveQuality?: RequestedQuality;
}

export interface AdmissionResult {
  success: boolean;
  streamState: StreamState;
  allocatedDecoder: boolean;
  lease?: DecoderLease;
  evictedCameraIds?: string[];
  error?: string;
}

export interface DecoderLease {
  cameraId: string;
  acquiredAt: number;
  minHoldUntil: number;
  expiresAt: number;
  priorityScore: number;
  preemptible: boolean;
  profile: StreamProfile;
}

export type CapacityPressure = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

export interface ViewerPerformance {
  timestamp: number;
  activeStreams: number;
  averageFps: number;
  droppedFrames: number;
  decodedFrames: number;
  droppedFrameRatio: number;
  averageStartupMs: number;
  averageDecodeLatencyMs?: number;
  longTaskRatio: number;
  memoryPressure: "LOW" | "MEDIUM" | "HIGH";
  pressure: CapacityPressure;
}

export interface WorkstationProfile {
  id: string;
  userAgentHash: string;
  screenCount?: number;
  measuredCapacity: ViewerCapacity;
  lastCalibrationAt: string;
  stabilityScore: number;
}

export interface FairnessPolicy {
  maxNormalStreamsPerBranch: number;
  maxAlarmStreamsPerBranch: number;
}

export interface DecoderPoolPolicy {
  targetInteractiveSlots: number;
  targetPrioritySlots: number;
  minimumRotationSlots: number;
}

export interface CameraTileState {
  cameraId: string;
  branchId?: string;
  presentation: "LIVE" | "SNAPSHOT" | "ROTATING" | "BUFFERING" | "OFFLINE" | "ERROR";
  streamQuality?: "MAIN" | "SUB" | "LOW";
  priority: StreamPriority;
  decoderAllocated: boolean;
  lastFrameAt?: number;
  lastFrameDataUrl?: string;
  streamUrl?: string;
  snapshotUrl?: string;
  reason?: string;
}

export interface ViewerPolicy {
  criticalAlertPreemption: boolean;
  rotationIntervalSeconds: number;
  defaultGridQuality: "SUB";
  priorityReservationPercent: number;
  minDecoderHoldMs: number;
  offscreenGraceMs: number;
}
