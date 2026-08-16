/**
 * Distributed Media Scheduling & Cluster State Types
 *
 * Explicit separation between:
 * 1. EPHEMERAL VIEWER / SESSION STATE (browser/session-local, Redis TTL)
 * 2. GLOBAL MEDIA RUNTIME STATE (Redis distributed leases, gateway ownership, atomic reservations)
 * 3. DURABLE MEDIA CONFIGURATION (PostgreSQL + distributed/local cache)
 */

export interface StreamLease {
  leaseId: string;
  cameraId: string;
  streamProfile: "main" | "sub" | "preview" | "hd";
  gatewayId: string;
  sessionId: string;
  ownerInstanceId: string;
  token: string;
  relayUrl: string;
  webrtcSessionId?: string;
  hlsStreamUrl?: string;
  bitrateKbps: number;
  acquiredAt: number;
  expiresAt: number;
}

export interface StreamLeaseAcquireInput {
  cameraId: string;
  streamProfile?: "main" | "sub" | "preview" | "hd";
  sessionId: string;
  ownerInstanceId: string;
  preferredGatewayId?: string;
  ttlMs?: number;
  bitrateKbps?: number;
}

export interface ViewerTelemetry {
  sessionId: string;
  userId?: string;
  browser: string;
  hardwareDecode: boolean;
  codecsSupported: ("H264" | "H265" | "AV1" | "VP9" | "MJPEG")[];
  maxDecoders: number;
  activeDecoders: number;
  cpuUsagePercent?: number;
  gpuUsagePercent?: number;
  viewportTiles: number;
  visibleCameraIds: string[];
  focusedCameraId?: string;
  networkDownlinkMbps?: number;
  lastReportedAt: number;
}

export interface ViewerSession {
  sessionId: string;
  userId: string;
  tenantId: string;
  deviceType: "workstation" | "video_wall" | "mobile" | "tablet";
  activeLayout: string;
  createdAt: number;
  lastHeartbeatAt: number;
  telemetry?: ViewerTelemetry;
}

export interface GatewayCapacity {
  gatewayId: string;
  instanceId: string;
  host: string;
  port: number;
  region: string;
  activeStreams: number;
  maxStreams: number;
  activeRelays: number;
  maxRelays: number;
  cpuPercent: number;
  gpuPercent: number;
  bandwidthMbps: number;
  maxBandwidthMbps: number;
  transcodingSessions: number;
  healthStatus: "HEALTHY" | "DEGRADED" | "OVERLOADED" | "OFFLINE";
  registeredAt: number;
  lastHeartbeatAt: number;
}

export interface GatewayReservation {
  reservationId: string;
  gatewayId: string;
  cameraId: string;
  sessionId: string;
  allocatedBandwidthMbps: number;
  expiresAt: number;
}

export interface CameraCapabilitiesDurable {
  cameraId: string;
  tenantId?: string;
  manufacturer?: string;
  model?: string;
  codecs: ("H264" | "H265" | "MJPEG" | "AV1")[];
  supportsMainStream: boolean;
  supportsSubStream: boolean;
  supportsPtz: boolean;
  supportsAudio: boolean;
  supportsOnvif: boolean;
  supportsRtsp: boolean;
  supportsWebRtc: boolean;
  maxWidth: number;
  maxHeight: number;
  maxFps: number;
  profiles: {
    name: "main" | "sub" | "preview" | "hd";
    width: number;
    height: number;
    fps: number;
    codec: string;
    bitrateKbps: number;
    rtspUrl?: string;
  }[];
  discoveredAt: string;
  updatedAt: string;
}

export interface ViewerCameraPriority {
  cameraId: string;
  score: number;
  priorityClass: "CRITICAL_ALERT" | "USER_SELECTED" | "VISIBLE_ACTIVE" | "BACKGROUND_DEFERRED";
  desiredProfile: "main" | "sub" | "preview";
  isPaused: boolean;
}
