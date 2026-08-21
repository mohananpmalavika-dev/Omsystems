/**
 * Automatic High Availability (HA) & Distributed Camera Ownership Domain Types
 * 10/10 Enterprise VMS Architecture with Fencing Tokens and Monotonic Epochs
 */

export interface CameraLease {
  tenantId: string;
  cameraId: string;
  nodeId: string;
  instanceId: string;
  leaseId: string;
  fencingToken: number;
  acquiredAt: number;
  expiresAt: number;
  metadata?: {
    cameraName?: string;
    branchId?: string;
    rtspUri?: string;
  };
}

export interface CameraExecutionContext {
  tenantId: string;
  cameraId: string;
  leaseId: string;
  fencingToken: number;
  acquiredAt: number;
  abortController: AbortController;
  isOwnerActive: () => boolean;
}

export interface FailureDomain {
  datacenter: string;
  zone: string;
  rack: string;
  host: string;
  network: string;
  storagePool: string;
}

export interface MediaNodeCapacity {
  maxCameras: number;
  currentCameras: number;
  cpuPct: number;
  memoryPct: number;
  ingressMbps: number;
  maxIngressMbps: number;
  diskWriteMbps: number;
  maxDiskWriteMbps: number;
  activeRtspSessions: number;
  activeRecordingSessions: number;
  gpuLoadPct?: number;
}

export type MediaNodeStatus = "HEALTHY" | "DEGRADED" | "OFFLINE" | "DRAINING";

export interface MediaNodeInstance {
  nodeId: string;
  instanceId: string;
  nodeName: string;
  host: string;
  port: number;
  version: string;
  role: "PRIMARY_INGEST" | "SECONDARY_INGEST" | "STORAGE_NODE";
  status: MediaNodeStatus;
  failureDomain: FailureDomain;
  capacity: MediaNodeCapacity;
  lastHeartbeat: number;
  bootedAt: number;
}

export interface CameraPlacementPlan {
  cameraId: string;
  tenantId: string;
  branchId: string;
  primaryNodeId: string;
  secondaryNodeId: string;
  tertiaryNodeId: string;
  assignedNodeId?: string;
  updatedAt: string;
}

export type HaEventType =
  | "CAMERA_OWNER_ACQUIRED"
  | "CAMERA_OWNER_RENEWED"
  | "CAMERA_OWNER_RELEASED"
  | "CAMERA_OWNER_EXPIRED"
  | "CAMERA_FAILOVER_STARTED"
  | "CAMERA_FAILOVER_COMPLETED"
  | "CAMERA_FAILOVER_FAILED"
  | "MEDIA_NODE_REGISTERED"
  | "MEDIA_NODE_HEARTBEAT"
  | "MEDIA_NODE_DEGRADED"
  | "MEDIA_NODE_OFFLINE"
  | "STALE_OWNER_REJECTED"
  | "SPLIT_BRAIN_PREVENTED";

export interface HaEvent {
  id: string;
  type: HaEventType;
  tenantId: string;
  cameraId: string;
  previousNode?: string;
  newNode?: string;
  previousInstanceId?: string;
  newInstanceId?: string;
  previousEpoch?: number;
  newEpoch?: number;
  failureDetectedAt?: string;
  streamRestoredAt?: string;
  recordingGapMs?: number;
  reason?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface HaClusterMetrics {
  totalCameras: number | null;
  protectedCameras: number;
  unprotectedCameras: number | null;
  failoversToday: number;
  successfulFailovers: number;
  failedFailovers: number;
  medianRecoveryMs: number | null;
  p95RecoveryMs: number | null;
  p99RecoveryMs: number | null;
  maxRecordingGapMs: number | null;
  activeNodes: number;
  healthyNodes: number;
  totalCapacityHeadroomPct: number;
  lastFailoverEvent?: HaEvent;
}

export interface SegmentWriteRequest {
  tenantId: string;
  cameraId: string;
  segmentId: string;
  nodeId: string;
  instanceId: string;
  fencingToken: number;
  startTime: string;
  endTime: string;
  deviceStartTime?: string;
  serverStartTime?: string;
  clockOffsetMs?: number;
  sizeBytes: number;
  codec: string;
  storagePath: string;
  checksumSha256?: string;
}

export interface SegmentWriteResult {
  accepted: boolean;
  authoritativePath: string;
  currentAuthoritativeEpoch: number;
  rejectionReason?: "STALE_OWNER_REJECTED" | "TOKEN_MISMATCH" | "STORAGE_ERROR";
}

export interface CameraLeaseManager {
  acquire(tenantId: string, cameraId: string, nodeId: string, instanceId: string, ttlMs?: number): Promise<CameraLease | null>;
  renew(lease: CameraLease, ttlMs?: number): Promise<boolean>;
  release(lease: CameraLease): Promise<boolean>;
  getOwner(tenantId: string, cameraId: string): Promise<CameraLease | null>;
  listActiveLeases(tenantId?: string): Promise<CameraLease[]>;
  getCurrentFencingToken(tenantId: string, cameraId: string): Promise<number>;
}
