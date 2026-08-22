/**
 * High Availability (HA) & Distributed Cluster Domain Types
 * (Nx Witness / Milestone XProtect Corporate style Server Synchronization & Automatic Failover)
 */

export type NodeRole = "PRIMARY_MASTER" | "ACTIVE_STANDBY" | "WORKER_GATEWAY" | "REPLICA";
export type NodeHealth = "HEALTHY" | "DEGRADED" | "CRITICAL" | "DEAD" | "FAILOVER_IN_PROGRESS";

export interface ControlApiNode {
  nodeId: string;
  nodeName: string;
  role: "API_PRIMARY" | "API_SECONDARY";
  ipAddress: string;
  status: "ONLINE" | "OFFLINE" | "TAKEOVER";
  heartbeatAgeMs: number;
  cpuUsagePct: number;
  activeSessions: number;
  isLeader: boolean;
}

export interface PostgresClusterNode {
  nodeId: string;
  role: "PRIMARY_RW" | "STANDBY_SYNC_RO" | "STANDBY_ASYNC_RO";
  ipAddress: string;
  status: "ONLINE" | "PROMOTED_PRIMARY" | "FAILED";
  replicationLagBytes: number;
  replicationLagMs: number;
  walPosition: string;
}

export interface RedisClusterNode {
  nodeId: string;
  role: "MASTER" | "REPLICA_1" | "REPLICA_2" | "SENTINEL_QUORUM";
  ipAddress: string;
  status: "ONLINE" | "FAILOVER_ELECTED" | "DISCONNECTED";
  uptimeSeconds: number;
  connectedClients: number;
}

export interface MediaGatewayNode {
  gatewayId: string;
  name: "Media Gateway A" | "Media Gateway B" | "Media Gateway C";
  ipAddress: string;
  status: "ONLINE" | "OVERLOADED" | "FAILOVER_ADOPTING" | "DEAD";
  capacityStreams: number;
  activeStreams: number;
  assignedCameraIds: string[];
  bandwidthThroughputMbps: number;
}

export interface BranchWanState {
  branchId: string;
  branchName: string;
  primaryIsp: { name: string; status: "ONLINE" | "OFFLINE"; latencyMs: number };
  backupIsp: { name: string; status: "STANDBY" | "ACTIVE_FAILOVER" | "OFFLINE"; latencyMs: number };
  edgeRecordingStatus: "DIRECT_STREAMING" | "LOCAL_BUFFERING_EDGE" | "REPLAY_SYNCING";
  edgeDiskState: "HEALTHY_RAID1" | "DEGRADED_SPARE_ACTIVE" | "DISK_FAULT";
  edgeGatewayStatus: "ONLINE" | "RESTARTING" | "OFFLINE";
}

export type FailureScenarioType =
  | "KILL_API_NODE"
  | "KILL_REDIS_NODE"
  | "KILL_POSTGRES_PRIMARY"
  | "KILL_MEDIA_GATEWAY"
  | "DISCONNECT_BRANCH"
  | "RESTART_EDGE_GATEWAY"
  | "REMOVE_DISK"
  | "FAIL_PRIMARY_ISP";

export interface ChaosSimulationResult {
  scenario: FailureScenarioType;
  executedAt: string;
  targetComponent: string;
  failureInjected: string;
  automatedReaction: {
    detectionTimeMs: number;
    failoverActionTaken: string;
    recoveryTimeMs: number;
    dataLossBytes: number;
    streamInterruptionMs: number;
  };
  provenRecovery: boolean;
  auditEvidence: string[];
}
