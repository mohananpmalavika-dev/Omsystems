/**
 * On-Demand Media & Local Video Residency - Domain Types
 * 
 * Defines formal contracts for temporary on-demand live video sessions,
 * remote playback sessions, evidence clip exports, snapshots, and video access audit trails.
 */

export type SessionState =
  | "REQUESTED"
  | "AUTHORIZING"
  | "STARTING"
  | "ACTIVE"
  | "DEGRADED"
  | "STOPPING"
  | "STOPPED"
  | "FAILED";

export type StreamQuality =
  | "THUMBNAIL"
  | "SUBSTREAM"
  | "MAINSTREAM"
  | "AUTO";

export type StreamProtocol =
  | "WEBRTC"
  | "HLS";

export type SessionPurpose =
  | "LIVE_VIEW"
  | "VIDEO_WALL"
  | "ALERT"
  | "INCIDENT"
  | "INVESTIGATION"
  | "PLAYBACK";

export interface MediaSessionMetrics {
  bitrateKbps: number;
  fps: number;
  width: number;
  height: number;
  packetLossPct?: number | undefined;
  jitterMs?: number | undefined;
  rttMs?: number | undefined;
  droppedFrames?: number | undefined;
  reconnectCount: number;
}

export interface LiveSession {
  id: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  cameraName?: string | undefined;

  requestedByUserId: string;
  purpose: SessionPurpose;
  requestedQuality: StreamQuality;
  resolvedQuality: "SUBSTREAM" | "MAINSTREAM";
  protocol: StreamProtocol;
  mediaMode: "DIRECT" | "REMUX" | "TRANSCODE";

  state: SessionState;
  edgeGatewayId: string;
  streamUrl: string;
  sessionToken: string;

  createdAt: Date;
  startedAt?: Date | undefined;
  lastActivityAt?: Date | undefined;
  expiresAt: Date;

  errorCode?: string | undefined;
  metrics?: MediaSessionMetrics | undefined;
}

export interface PlaybackSession {
  id: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  from: Date;
  to: Date;
  requestedByUserId: string;
  state: "SEARCHING" | "READY" | "STREAMING" | "COMPLETE" | "FAILED";
  streamUrl: string;
  sessionToken: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface EvidenceExport {
  id: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  from: Date;
  to: Date;
  requestedByUserId: string;
  reason: string;
  sha256: string;
  sizeBytes: number;
  storageObjectId: string;
  downloadUrl: string;
  createdAt: Date;
}

export interface CameraSnapshot {
  cameraId: string;
  branchId: string;
  capturedAt: Date;
  width: number;
  height: number;
  dataBase64?: string | undefined;
  objectKey: string;
  source: "RECORDER" | "RTSP_FRAME" | "CAMERA_API";
}

export interface VideoAccessAudit {
  id: string;
  userId: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  action: "LIVE_START" | "LIVE_STOP" | "PLAYBACK" | "SNAPSHOT" | "EXPORT";
  purpose: string;
  sourceIp?: string | undefined;
  startedAt: Date;
  endedAt?: Date | undefined;
  durationSeconds?: number | undefined;
}

export interface EdgeGatewayCapacity {
  gatewayId: string;
  branchId: string;
  maxRtspInputs: number;
  maxWebRtcOutputs: number;
  maxTranscode1080p: number;
  activeRtspInputs: number;
  activeWebRtcOutputs: number;
  activeTranscodes: number;
  cpuPct: number;
  memoryPct: number;
  online: boolean;
}

export interface BranchNetworkState {
  mode: "PRIMARY" | "FAILOVER" | "OFFLINE";
  uploadMbps: number;
  latencyMs: number;
  packetLossPct: number;
}
