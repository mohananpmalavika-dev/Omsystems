/**
 * Distributed Runtime State & Lease Domain Types
 */

export type NodeType = 'CONTROL_PLANE' | 'MEDIA_GATEWAY' | 'RECORDER' | 'EDGE_AGENT';
export type NodeHealthStatus = 'HEALTHY' | 'DEGRADED' | 'DEAD';

export interface DistributedLease {
  key: string;
  ownerId: string;
  token: string;
  fencingToken: number;
  acquiredAt: number; // Unix epoch ms
  expiresAt: number;  // Unix epoch ms
  metadata?: Record<string, unknown>;
}

export interface CameraOwnership {
  cameraId: string;
  ownerNodeId: string;
  fencingToken: number;
  status: 'ACTIVE' | 'STEALING' | 'RELEASED';
  leaseTtlMs: number;
  acquiredAt: number;
  expiresAt: number;
}

export interface AlertDedupRecord {
  dedupKey: string;
  fingerprint: string;
  firstSeenAt: number;
  lastSeenAt: number;
  occurrenceCount: number;
  expiresAt: number;
}

export interface RecordingWriterLease {
  cameraId: string;
  recorderNodeId: string;
  storagePoolId: string;
  fencingToken: number;
  acquiredAt: number;
  expiresAt: number;
}

export interface ClusterNodeState {
  nodeId: string;
  nodeType: NodeType;
  address: string;
  status: NodeHealthStatus;
  assignedWorkload: number;
  lastHeartbeatAt: number;
  leaseExpiresAt: number;
  metadata?: Record<string, unknown>;
}
