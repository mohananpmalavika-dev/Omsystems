/**
 * Recording Engine N+1 Failover Domain Types
 * (Nx Witness & Milestone XProtect Corporate Architecture)
 */

export type RecordingNodeRole = "ACTIVE" | "STANDBY" | "DRAINING" | "MAINTENANCE";

export type RecordingNodeState =
  | "HEALTHY"
  | "DEGRADED"
  | "HEARTBEAT_EXPIRED"
  | "OFFLINE"
  | "FAILOVER_ACTIVE";

export type AssignmentStatus = "ACTIVE" | "FAILED_OVER" | "DRAINING" | "STOPPED";

export type RecordingFailoverReason =
  | "HEARTBEAT_EXPIRED"
  | "NODE_CRASH"
  | "MANUAL_FAILOVER"
  | "NETWORK_PARTITION"
  | "HIGH_ERROR_RATE"
  | "STORAGE_UNAVAILABLE";

export type RecordingFailoverStatus =
  | "TRIGGERED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "RECOVERED";

export interface RecordingNode {
  id: string;
  name: string;
  host: string;
  port: number;
  role: RecordingNodeRole;
  state: RecordingNodeState;
  currentEpoch: number;
  maxStreamCapacity: number;
  activeStreamCount: number;
  cpuPercent: number;
  memoryPercent: number;
  diskWriteMbps: number;
  networkInMbps: number;
  heartbeatAt: Date;
  heartbeatAgeMs?: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecordingNodeAssignment {
  id: string;
  cameraId: string;
  tenantId: string;
  primaryNodeId: string;
  currentNodeId: string;
  streamUri: string;
  streamProfile: string;
  status: AssignmentStatus;
  takeoverEpoch: number;
  failedOverAt?: Date;
  lastGapLoggedAt?: Date;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecordingFailoverEvent {
  id: string;
  tenantId: string;
  failedNodeId: string;
  standbyNodeId: string;
  affectedCameras: number;
  transferredCameras: number;
  detectionTimeMs: number;
  takeoverTimeMs: number;
  totalRtoMs: number;
  reason: RecordingFailoverReason;
  status: RecordingFailoverStatus;
  details: Record<string, unknown>;
  createdAt: Date;
  recoveredAt?: Date;
}

export interface RecordingHeartbeatPayload {
  nodeId: string;
  name?: string;
  host?: string;
  port?: number;
  role?: RecordingNodeRole;
  cpuPercent?: number;
  memoryPercent?: number;
  diskWriteMbps?: number;
  networkInMbps?: number;
  activeStreamCount?: number;
  maxStreamCapacity?: number;
  epoch?: number;
  metadata?: Record<string, unknown>;
}

export interface TakeoverResult {
  success: boolean;
  failedNodeId: string;
  standbyNodeId: string;
  affectedCameras: number;
  transferredCameras: number;
  detectionTimeMs: number;
  takeoverTimeMs: number;
  totalRtoMs: number;
  newEpoch: number;
  event: RecordingFailoverEvent;
  transferredAssignments: RecordingNodeAssignment[];
}

export interface FailbackResult {
  success: boolean;
  primaryNodeId: string;
  standbyNodeId: string;
  restoredCameras: number;
  restoredEpoch: number;
  assignments: RecordingNodeAssignment[];
  message: string;
}

export interface FailoverTelemetryMetrics {
  totalNodes: number;
  activeNodes: number;
  standbyNodes: number;
  healthyNodes: number;
  heartbeatExpiredNodes: number;
  totalAssignedStreams: number;
  failedOverStreams: number;
  totalFailovers: number;
  averageRtoMs: number;
  streamContinuityPercent: number;
  activeAlerts: Array<{
    nodeId: string;
    level: "WARNING" | "CRITICAL";
    message: string;
  }>;
}

export interface IStreamIngestActivator {
  activateStreamIngest(params: {
    nodeId: string;
    cameraId: string;
    streamUri: string;
    epoch: number;
  }): Promise<{ success: boolean; pid?: number; streamId?: string }>;

  deactivateStreamIngest(params: {
    nodeId: string;
    cameraId: string;
    epoch: number;
  }): Promise<{ success: boolean }>;
}
