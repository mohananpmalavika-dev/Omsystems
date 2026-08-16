/**
 * Control Plane vs Media Plane - Edge Protocol Domain Contracts
 */

export type EdgeGatewayStatus = "HEALTHY" | "DEGRADED" | "CRITICAL" | "OFFLINE";

export type BranchConnectionState = "ONLINE" | "DEGRADED" | "STALE" | "OFFLINE";

export interface EdgeSystemMetrics {
  cpuPercent: number;
  ramPercent: number;
  diskPercent: number;
  queueBacklog: number;
  hoLatencyMs: number;
  configVersion: number;
  uptimeSeconds: number;
}

export interface EdgeHeartbeat {
  edgeId: string;
  branchId: string;
  timestamp: Date;
  edgeVersion: string;
  status: EdgeGatewayStatus;

  recorderCount: number;
  cameraCount: number;
  cameraHealthy: number;
  cameraFailed: number;
  activeAlerts: number;

  systemMetrics: EdgeSystemMetrics;
}

export interface EdgeStateChangeEvent {
  eventId: string;
  sequenceNumber: number;
  edgeId: string;
  branchId: string;

  entityType: "CAMERA" | "RECORDER" | "STORAGE" | "INTERNET" | "CLOCK" | "EDGE";
  entityId: string;

  previousState: string;
  newState: string;
  reason?: string | undefined;

  observedAt: Date;
  payload?: Record<string, unknown> | undefined;
}

export type EdgeCommandType =
  | "HEALTH_CHECK"
  | "REFRESH_INVENTORY"
  | "START_STREAM"
  | "STOP_STREAM"
  | "CAPTURE_SNAPSHOT"
  | "SEARCH_RECORDING"
  | "EXPORT_CLIP"
  | "VERIFY_RETENTION"
  | "SYNC_POLICY";

export interface EdgeCommand {
  commandId: string;
  branchId: string;
  edgeId: string;
  type: EdgeCommandType;
  payload: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date;
  requestedBy?: string | undefined;
}

export interface EdgeCommandResult {
  commandId: string;
  status: "ACCEPTED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "EXPIRED";
  result?: Record<string, unknown> | undefined;
  error?: {
    code: string;
    message: string;
  } | undefined;
  completedAt?: Date | undefined;
}

export interface EdgeConfiguration {
  branchId: string;
  version: number;
  issuedAt: Date;
  monitoringPolicy: {
    cameraPollIntervalSec: number;
    recorderPollIntervalSec: number;
    heartbeatIntervalSec: number;
  };
  recordingPolicy: {
    continuousRecording: boolean;
    resolution: string;
  };
  retentionPolicy: {
    mandatoryDays: number;
  };
  analyticsPolicy: {
    localInferenceEnabled: boolean;
    intrusionZones: string[];
  };
}

export type MediaSessionType = "WEBRTC" | "HLS" | "JPEG_PREVIEW" | "CLIP";

export interface MediaSession {
  sessionId: string;
  branchId: string;
  cameraId: string;
  edgeId: string;
  streamType: MediaSessionType;
  token: string;
  playbackUrl: string;
  status: "ACTIVE" | "TERMINATED" | "EXPIRED";
  requestedByUserId: string;
  createdAt: Date;
  expiresAt: Date;
  lastKeepAliveAt: Date;
}

export type VideoWallTileTier = "ACTIVE_WEBRTC" | "LOW_FPS_PREVIEW" | "CACHED_SNAPSHOT";

export interface VideoWallAllocationPlan {
  totalTiles: number;
  activeWebRtcCount: number;
  lowFpsPreviewCount: number;
  cachedSnapshotCount: number;
  totalBandwidthEstimateKbps: number;
  tiles: Array<{
    position: number;
    cameraId: string;
    branchId: string;
    tier: VideoWallTileTier;
    allocatedBitrateKbps: number;
  }>;
}
