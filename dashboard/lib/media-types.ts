/**
 * Media Types for Frontend
 * Shared types with backend media orchestration
 */

export type StreamQuality = "AUTO" | "SUBSTREAM" | "MAINSTREAM";

export type StreamPurpose = 
  | "MONITORING"
  | "INVESTIGATION"
  | "INCIDENT"
  | "PLAYBACK";

export type MediaSessionState =
  | "REQUESTED"
  | "CONNECTING"
  | "ACTIVE"
  | "FAILED"
  | "EXPIRED"
  | "CLOSED";

export type TileStreamState =
  | "METADATA_ONLY"
  | "QUEUED"
  | "CONNECTING"
  | "LIVE_SUBSTREAM"
  | "LIVE_MAINSTREAM"
  | "PAUSED"
  | "ERROR";

export enum MediaDegradationLevel {
  NONE = 0,
  REDUCED_FPS = 1,
  SUBSTREAM_ONLY = 2,
  SNAPSHOT_ONLY = 3,
  METADATA_ONLY = 4,
}

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

export interface MediaSession {
  id: string;
  cameraId: string;
  userId: string;
  tenantId: string;
  gatewayId?: string;
  profile: VideoProfile;
  purpose: StreamPurpose;
  priority: number;
  createdAt: string | Date;
  lastHeartbeatAt: string | Date;
  expiresAt: string | Date;
  state: MediaSessionState;
  transportType: "WEBRTC" | "HLS" | "LL-HLS";
  connectionUrl?: string;
}

export interface ClientMediaCapabilities {
  logicalProcessors: number;
  hardwareConcurrency: number;
  webCodecsAvailable: boolean;
  webRtcAvailable: boolean;
  h265Supported: boolean;
  estimatedDecodeClass: "LOW" | "STANDARD" | "HIGH" | "VIDEO_WALL";
  screenResolution: { width: number; height: number };
}

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

export interface WorkstationCapacityMetrics {
  gridPositions: number;
  activeDecoders: number;
  liveCameras: number;
  snapshotCameras: number;
  decoderLoadPercent: number;
  estimatedCapacityClass: ClientMediaCapabilities["estimatedDecodeClass"];
}

export interface BranchMediaCapacity {
  branchId: string;
  configuredUploadMbps: number;
  usableVideoBudgetMbps: number;
  activeVideoMbps: number;
  activeSessions: number;
  lastUpdated: string | Date;
}

export interface MonitoringProfile {
  userId: string;
  role: string;
  maxGridPositions: number;
  preferredDecoderBudget: number;
  maxMainStreams: number;
  maxBranchBandwidthMbps: number;
  sequenceIntervalSeconds: number;
}

export interface SequencePolicy {
  enabled: boolean;
  intervalSeconds: number;
  pinnedCameraIds: string[];
  rotatingCameraIds: string[];
  activeSlots: number;
  order: "BRANCH" | "PRIORITY" | "ALERT_SEVERITY" | "ROUND_ROBIN";
}

export type PresentationMode = 
  | "OPERATIONS_OVERVIEW"
  | "LIVE_MONITORING"
  | "INVESTIGATION";
