export const actions = [
  "live:view",
  "recording:view",
  "evidence:export",
  "ptz:operate",
  "alarm:acknowledge",
  "device:configure",
  "user:manage",
  "audit:view",
] as const;

export type Action = (typeof actions)[number];

export type NodeType =
  | "company"
  | "division"
  | "region"
  | "branch"
  | "camera-group"
  | "camera";

export interface ResourceNode {
  id: string;
  parentId: string | null;
  tenantId: string;
  type: NodeType;
  name: string;
  /** Ordered ancestor IDs, including this node. */
  path: string[];
}

export type CameraVendor = "hikvision" | "cp-plus" | "other";
export type CameraStatus = "online" | "offline" | "degraded" | "unknown";

export interface Camera {
  id: string;
  name: string;
  nodeId: string;
  branchId: string;
  vendor: CameraVendor;
  model: string;
  channel: number;
  protocol: "onvif-t" | "onvif-s" | "rtsp" | "vendor-adapter";
  status: CameraStatus;
  profiles: CameraProfile[];
  capabilities: CameraCapabilities;
  /** Reference to a secret; never store camera credentials in this record. */
  connectionSecretRef: string;
}

export interface CameraProfile {
  name: string;
  codec: "H264" | "H265" | "MJPEG" | "unknown";
  width: number;
  height: number;
  rtspUri?: string | undefined;
}

export interface CameraCapabilities {
  ptz: boolean;
  audio: boolean;
  events: boolean;
}

export interface AccessGrant {
  userId: string;
  scopeNodeId: string;
  actions: Action[];
  effect: "allow" | "deny";
}

export interface User {
  id: string;
  displayName: string;
  tenantId: string;
}

export interface EdgeAgent {
  id: string;
  branchId: string;
  name: string;
  version: string;
  status: "pending" | "online" | "offline";
  lastSeenAt: string | null;
}

export interface DiscoveredCamera {
  id: string;
  branchId: string;
  edgeAgentId: string;
  vendor: CameraVendor;
  model: string;
  ipAddress: string;
  onvifPort: number;
  rtspPort: number;
  profiles: CameraProfile[];
  capabilities: CameraCapabilities;
  status: "pending" | "approved" | "rejected";
  discoveredAt: string;
}

export interface LiveSession {
  id: string;
  cameraId: string;
  userId: string;
  token: string;
  expiresAt: string;
}

export interface ConsumedLiveSession {
  id: string;
  cameraId: string;
  cameraNodeId: string;
  userId: string;
  tenantId: string;
  connectionSecretRef: string;
  profiles: CameraProfile[];
}

export interface AuditEventInput {
  tenantId: string;
  actorUserId: string | null;
  action: string;
  resourceNodeId: string | null;
  outcome: "success" | "denied" | "failure";
  sourceIp?: string;
  details?: Record<string, unknown>;
}
