/**
 * Media Authorization & Control-Plane / Media-Plane Separation Domain Types
 */

export type MediaAccessPermission =
  | 'live.view'
  | 'recording.playback'
  | 'ptz.control'
  | 'evidence.export';

export type StreamTransportProtocol = 'WEBRTC' | 'HLS' | 'RTSP' | 'WS_RAW';

export type MediaNodeType = 'PRIMARY_INGEST' | 'SECONDARY_INGEST' | 'EDGE_RELAY' | 'RECORDER_NODE';

export interface MediaPlaneNode {
  nodeId: string;
  nodeName: string;
  host: string;
  publicHost?: string;
  port: number;
  relayPort: number;
  type: MediaNodeType;
  region: string;
  status: 'HEALTHY' | 'DEGRADED' | 'OFFLINE';
  activeStreams: number;
  maxStreams: number;
  ingressMbps: number;
  maxIngressMbps: number;
  lastHeartbeat: number;
}

export interface MediaTokenClaims {
  sub: string;                   // User ID
  tenantId: string;
  branchId: string;
  cameraId: string;
  cameraName?: string;
  permissions: MediaAccessPermission[];
  streamProfile: 'main' | 'sub' | 'preview';
  transport: StreamTransportProtocol;
  purpose: 'LIVE_VIEW' | 'INCIDENT_INVESTIGATION' | 'PLAYBACK' | 'VIDEO_WALL';
  mediaNodeId: string;
  mediaRelayUrl: string;
  clientIp?: string;
  jti: string;                   // Unique token ID
  iat: number;                   // Issued at (unix sec)
  exp: number;                   // Expires at (unix sec)
}

export interface IssueMediaTokenRequest {
  userId: string;
  tenantId?: string;
  branchId: string;
  cameraId: string;
  cameraName?: string;
  userPermissions: string[];     // e.g. ['camera.live.view', 'camera.playback.view']
  requestedPermission: MediaAccessPermission;
  streamProfile?: 'main' | 'sub' | 'preview';
  transport?: StreamTransportProtocol;
  purpose?: 'LIVE_VIEW' | 'INCIDENT_INVESTIGATION' | 'PLAYBACK' | 'VIDEO_WALL';
  preferredRegion?: string;
  clientIp?: string;
  ttlSeconds?: number;           // Default 300s (5 minutes)
}

export interface MediaTokenIssueResult {
  success: boolean;
  mediaToken?: string;
  mediaRelayUrl?: string;
  mediaNodeId?: string;
  expiresAt?: string;
  expiresInSeconds?: number;
  streamProfile?: string;
  transport?: StreamTransportProtocol;
  error?: string;
}

export interface MediaTokenValidationResult {
  isValid: boolean;
  claims?: MediaTokenClaims;
  error?: string;
  errorCode?: 'TOKEN_EXPIRED' | 'INVALID_SIGNATURE' | 'PERMISSION_DENIED' | 'CAMERA_MISMATCH' | 'TOKEN_REVOKED' | 'MALFORMED_TOKEN';
}
