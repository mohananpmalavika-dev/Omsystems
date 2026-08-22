/**
 * Media Orchestration Types
 * Core domain types for enterprise video streaming architecture
 */

/**
 * Stream profile quality levels
 */
export type StreamQuality = "AUTO" | "SUBSTREAM" | "MAINSTREAM";

/**
 * Stream purpose drives policy decisions
 */
export type StreamPurpose = 
  | "MONITORING"
  | "INVESTIGATION"
  | "INCIDENT"
  | "PLAYBACK";

/**
 * Media session lifecycle states
 */
export type MediaSessionState =
  | "REQUESTED"
  | "CONNECTING"
  | "ACTIVE"
  | "FAILED"
  | "EXPIRED"
  | "CLOSED";

/**
 * Tile stream states for UI presentation
 */
export type TileStreamState =
  | "METADATA_ONLY"
  | "QUEUED"
  | "CONNECTING"
  | "LIVE_SUBSTREAM"
  | "LIVE_MAINSTREAM"
  | "PAUSED"
  | "ERROR";

/**
 * Media degradation levels for progressive quality reduction
 */
export enum MediaDegradationLevel {
  NONE = 0,
  REDUCED_FPS = 1,
  SUBSTREAM_ONLY = 2,
  SNAPSHOT_ONLY = 3,
  METADATA_ONLY = 4,
}

/**
 * Video stream profile capabilities
 */
export interface VideoProfile {
  id: string;
  purpose: StreamPurpose;
  codec: "H264" | "H265" | "H264+";
  width: number;
  height: number;
  fps: number;
  bitrateKbps?: number;
  uri: string;
}

/**
 * Camera stream capabilities
 */
export interface CameraStreamCapabilities {
  cameraId: string;
  mainStream: VideoProfile;
  subStream?: VideoProfile;
  supportsAudio: boolean;
  supportsPTZ: boolean;
  supportsPlayback: boolean;
}

/**
 * Media session request
 */
export interface CreateMediaSessionRequest {
  tenantId: string;
  userId: string;
  cameraId: string;
  purpose: StreamPurpose;
  preferredQuality: StreamQuality;
  priority?: number;
}

/**
 * Active media session
 */
export interface MediaSession {
  id: string;
  cameraId: string;
  userId: string;
  tenantId: string;
  gatewayId?: string;
  profile: VideoProfile;
  purpose: StreamPurpose;
  priority: number;
  createdAt: Date;
  lastHeartbeatAt: Date;
  expiresAt: Date;
  state: MediaSessionState;
  transportType: "WEBRTC" | "HLS" | "LL-HLS";
  connectionUrl?: string;
}

/**
 * Media session heartbeat
 */
export interface MediaSessionHeartbeat {
  sessionId: string;
  timestamp: Date;
  active: boolean;
}

/**
 * Decoder budget represents client decoding capacity
 */
export interface DecoderBudget {
  maxActiveDecoders: number;
  currentActiveDecoders: number;
  maxPixelRate: number; // pixels per second
  currentPixelRate: number;
  estimatedBandwidthMbps: number;
  gpuAccelerationAvailable: boolean;
  preferredCodec: "H264" | "H265" | "AUTO";
}

/**
 * Client media capabilities negotiation
 */
export interface ClientMediaCapabilities {
  logicalProcessors: number;
  hardwareConcurrency: number;
  webCodecsAvailable: boolean;
  webRtcAvailable: boolean;
  h265Supported: boolean;
  estimatedDecodeClass: "LOW" | "STANDARD" | "HIGH" | "VIDEO_WALL";
  screenResolution: { width: number; height: number };
}

/**
 * Branch media capacity
 */
export interface BranchMediaCapacity {
  branchId: string;
  configuredUploadMbps: number;
  usableVideoBudgetMbps: number;
  activeVideoMbps: number;
  activeSessions: number;
  lastUpdated: Date;
}

/**
 * Stream priority calculation result
 */
export interface StreamPriority {
  cameraId: string;
  score: number;
  reasons: string[];
  operatorSelected: boolean;
  criticalAlert: boolean;
  activeIncident: boolean;
  visibleInViewport: boolean;
  branchCritical: boolean;
  recentlySelected: boolean;
}

/**
 * Monitoring profile defines user stream budgets
 */
export interface MonitoringProfile {
  userId: string;
  role: string;
  maxGridPositions: number;
  preferredDecoderBudget: number;
  maxMainStreams: number;
  maxBranchBandwidthMbps: number;
  sequenceIntervalSeconds: number;
}

/**
 * Stream allocation request
 */
export interface StreamAllocationRequest {
  cameraId: string;
  userId: string;
  tenantId: string;
  purpose: StreamPurpose;
  priority: number;
  requestedQuality: StreamQuality;
  visibleInViewport: boolean;
}

/**
 * Stream allocation result
 */
export interface StreamAllocationResult {
  cameraId: string;
  allocated: boolean;
  profile: VideoProfile | null;
  degradationLevel: MediaDegradationLevel;
  reason: string;
}

/**
 * Presentation mode
 */
export type PresentationMode = 
  | "OPERATIONS_OVERVIEW"  // Metadata-only, no video
  | "LIVE_MONITORING"      // Substreams, controlled decoders
  | "INVESTIGATION";        // Main streams, high quality

/**
 * Decoder cost calculation for stream
 */
export interface DecoderCost {
  cameraId: string;
  profile: VideoProfile;
  pixelsPerSecond: number;
  estimatedCost: number; // normalized cost units
}

/**
 * Sequence policy for rotating cameras
 */
export interface SequencePolicy {
  enabled: boolean;
  intervalSeconds: number;
  pinnedCameraIds: string[];
  rotatingCameraIds: string[];
  activeSlots: number;
  order: "BRANCH" | "PRIORITY" | "ALERT_SEVERITY" | "ROUND_ROBIN";
}

/**
 * Media policy decision
 */
export interface MediaPolicyDecision {
  allowed: boolean;
  reason: string;
  suggestedProfile?: VideoProfile;
  suggestedDegradation?: MediaDegradationLevel;
  estimatedBandwidthMbps?: number;
}

/**
 * Camera media state (what backend knows about camera's video capability)
 */
export interface CameraMediaState {
  cameraId: string;
  branchId: string;
  online: boolean;
  capabilities: CameraStreamCapabilities | null;
  lastSeen: Date;
  healthStatus: "HEALTHY" | "DEGRADED" | "UNREACHABLE";
  networkPath: string[]; // digital twin path [camera, nvr, switch, router, ...]
  canStreamNow: boolean;
  reason?: string;
}

/**
 * Platform capacity metrics
 */
export interface PlatformCapacityMetrics {
  branchesEnrolled: number;
  camerasEnrolled: number;
  camerasCurrentlyOnline: number;
  activeHoMediaSessions: number;
  activeMainStreams: number;
  activeSubstreams: number;
  currentHoBandwidthMbps: number;
  configuredMediaBudgetMbps: number;
}

/**
 * Workstation capacity metrics
 */
export interface WorkstationCapacityMetrics {
  gridPositions: number;
  activeDecoders: number;
  liveCameras: number;
  snapshotCameras: number;
  decoderLoadPercent: number;
  estimatedCapacityClass: ClientMediaCapabilities["estimatedDecodeClass"];
}
