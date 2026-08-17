/**
 * Production HA Telemetry and Infrastructure Monitoring Types
 * 
 * This replaces the mock data with real infrastructure health metrics.
 */

// ============ Real-Time Infrastructure Health Probes ============

export interface LoadBalancerHealth {
  vip: string;
  type: "nginx" | "haproxy" | "aws-alb" | "azure-lb";
  healthy: boolean;
  healthyBackends: number;
  totalBackends: number;
  activeConnections: number;
  totalRequests: number;
  requestsPerSecond: number;
  errorRate: number;
  backends: Array<{
    address: string;
    status: "up" | "down" | "draining";
    weight: number;
    activeConnections: number;
    failedHealthChecks: number;
    lastHealthCheckMs: number;
  }>;
  lastProbeAt: string;
  probeDurationMs: number;
}

export interface ControlAPINodeHealth {
  nodeId: string;
  nodeName: string;
  ipAddress: string;
  port: number;
  status: "healthy" | "degraded" | "unhealthy" | "offline";
  role: "active-active" | "primary" | "standby"; // Corrected architecture
  isReachable: boolean;
  
  // Application metrics
  uptime: number;
  requestsPerSecond: number;
  activeWebsockets: number;
  activeSessions: number;
  queueDepth: number;
  
  // System metrics
  cpuPercent: number;
  memoryPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  diskUsedPercent: number;
  networkInMbps: number;
  networkOutMbps: number;
  
  // Health indicators
  healthCheckLatencyMs: number;
  errorRate: number;
  lastHeartbeatAt: string;
  heartbeatAgeMs: number;
  consecutiveFailures: number;
  
  lastProbeAt: string;
}

export interface PostgreSQLNodeHealth {
  nodeId: string;
  ipAddress: string;
  port: number;
  role: "primary" | "standby-sync" | "standby-async";
  status: "healthy" | "degraded" | "failed" | "recovering";
  isReachable: boolean;
  
  // Replication health
  replicationState: "streaming" | "catchup" | "disconnected" | "n/a";
  replicationMode: "synchronous" | "asynchronous" | "n/a";
  replicationLagBytes: number;
  replicationLagSeconds: number;
  walPosition: string;
  walLsn: string;
  replayLsn?: string;
  
  // Database health
  isAcceptingConnections: boolean;
  activeConnections: number;
  maxConnections: number;
  transactionsPerSecond: number;
  deadlocks: number;
  cachHitRatio: number;
  
  // System health
  cpuPercent: number;
  memoryPercent: number;
  diskUsedPercent: number;
  diskIops: number;
  diskLatencyMs: number;
  
  // Backup and recovery
  lastBackupAt?: string;
  lastBackupStatus?: "success" | "failed" | "in-progress";
  lastRestoreTestAt?: string;
  rpoTargetSeconds: number;
  rtoTargetSeconds: number;
  
  lastProbeAt: string;
}

export interface RedisNodeHealth {
  nodeId: string;
  ipAddress: string;
  port: number;
  role: "master" | "replica" | "sentinel";
  status: "healthy" | "degraded" | "offline";
  isReachable: boolean;
  
  // Redis-specific
  uptimeSeconds: number;
  connectedClients: number;
  blockedClients: number;
  usedMemoryMb: number;
  maxMemoryMb: number;
  memoryFragmentationRatio: number;
  evictedKeys: number;
  expiredKeys: number;
  
  // Replication (for master/replica)
  masterLinkStatus?: "up" | "down";
  masterLastIoSecondsAgo?: number;
  masterSyncInProgress?: boolean;
  replicationOffset?: number;
  replicationLag?: number;
  
  // Sentinel-specific (if role === 'sentinel')
  monitoredMasters?: number;
  sentinelQuorum?: number;
  sentinelKnownSentinels?: number;
  sentinelKnownReplicas?: number;
  
  // Performance
  opsPerSecond: number;
  hitRate: number;
  keyspaceHits: number;
  keyspaceMisses: number;
  
  lastProbeAt: string;
}

export interface MediaGatewayHealth {
  gatewayId: string;
  gatewayName: string;
  ipAddress: string;
  status: "healthy" | "degraded" | "overloaded" | "offline";
  isReachable: boolean;
  
  // Stream capacity
  capacityStreams: number;
  activeStreams: number;
  recordingStreams: number;
  liveViewStreams: number;
  utilizationPercent: number;
  
  // Camera ownership (distributed leases)
  ownedCameraIds: string[];
  leaseExpirySeconds: number;
  leaseRenewals: number;
  leaseConflicts: number;
  
  // System resources
  cpuPercent: number;
  memoryPercent: number;
  diskWriteMbps: number;
  diskReadMbps: number;
  diskUsedPercent: number;
  networkInMbps: number;
  networkOutMbps: number;
  
  // Stream health
  healthyStreams: number;
  degradedStreams: number;
  failedStreams: number;
  avgBitrate: number;
  avgFrameRate: number;
  packetLoss: number;
  frameDrops: number;
  
  // Process health
  ffmpegProcesses: number;
  restarts: number;
  crashCount: number;
  lastRestartAt?: string;
  
  lastHeartbeatAt: string;
  heartbeatAgeMs: number;
  lastProbeAt: string;
}

export interface KafkaClusterHealth {
  clusterId: string;
  status: "healthy" | "degraded" | "offline";
  
  // Cluster topology
  brokers: Array<{
    brokerId: number;
    address: string;
    status: "online" | "offline";
    isController: boolean;
  }>;
  
  // Partition health
  totalPartitions: number;
  underReplicatedPartitions: number;
  offlinePartitions: number;
  inSyncReplicas: number;
  
  // Consumer health
  consumerGroups: number;
  activeMemberCount: number;
  lagMs: number;
  
  lastProbeAt: string;
}

export interface EdgeGatewayHealth {
  edgeAgentId: string;
  branchId: string;
  branchName: string;
  status: "online" | "offline" | "degraded";
  
  // Connectivity
  primaryIsp: {
    name: string;
    status: "online" | "offline";
    latencyMs: number;
    bandwidthMbps: number;
    packetLoss: number;
  };
  backupIsp?: {
    name: string;
    status: "standby" | "active" | "offline";
    latencyMs: number;
    bandwidthMbps: number;
    packetLoss: number;
  };
  
  // Edge recording
  localRecordingStatus: "direct-streaming" | "local-buffering" | "replaying" | "offline";
  bufferedEvents: number;
  bufferedMb: number;
  diskUsedPercent: number;
  
  // Gateway health
  serviceStatus: "running" | "stopped" | "restarting";
  uptime: number;
  managedCameras: number;
  lastHeartbeatAt: string;
  
  lastProbeAt: string;
}

export interface StorageNodeHealth {
  nodeId: string;
  nodeName: string;
  status: "healthy" | "degraded" | "critical" | "offline";
  
  // Capacity
  totalCapacityGb: number;
  usedCapacityGb: number;
  availableCapacityGb: number;
  usedPercent: number;
  
  // RAID / Array health
  arrayStatus?: "optimal" | "degraded" | "rebuilding" | "failed";
  failedDisks?: number;
  hotSpareActive?: boolean;
  rebuildProgress?: number;
  
  // Performance
  readMbps: number;
  writeMbps: number;
  iops: number;
  latencyMs: number;
  
  // SMART health
  diskCount?: number;
  healthyDisks?: number;
  degradedDisks?: number;
  temperatureCelsius?: number;
  
  lastProbeAt: string;
}

// ============ Complete HA Topology with Real Metrics ============

export interface HATopologySnapshot {
  generatedAt: string;
  probeDurationMs: number;
  
  loadBalancer: LoadBalancerHealth;
  controlPlane: ControlAPINodeHealth[];
  database: {
    topology: string;
    primary?: PostgreSQLNodeHealth;
    standbys: PostgreSQLNodeHealth[];
  };
  redis: {
    topology: string;
    master?: RedisNodeHealth;
    replicas: RedisNodeHealth[];
    sentinels: RedisNodeHealth[];
  };
  kafka?: KafkaClusterHealth;
  mediaGateways: MediaGatewayHealth[];
  edgeGateways: EdgeGatewayHealth[];
  storage: StorageNodeHealth[];
}

// ============ Camera Ownership & Distributed Leases ============

export interface CameraLease {
  cameraId: string;
  ownerId: string; // media gateway ID
  leaseKey: string; // Redis key
  acquiredAt: string;
  expiresAt: string;
  renewedAt: string;
  epoch: number; // Fencing token to prevent split-brain
  heartbeatIntervalMs: number;
}

export interface CameraLeaseTransfer {
  cameraId: string;
  previousOwner: string;
  newOwner: string;
  reason: "failover" | "rebalance" | "manual" | "healthcheck-failure";
  initiatedAt: string;
  completedAt?: string;
  reconnectAttempts: number;
  status: "pending" | "reconnecting" | "completed" | "failed";
}

// ============ HA Event Timeline ============

export type HAEventType =
  | "node-online"
  | "node-offline"
  | "node-degraded"
  | "node-recovered"
  | "failover-initiated"
  | "failover-completed"
  | "failover-failed"
  | "database-promoted"
  | "redis-failover"
  | "media-gateway-failover"
  | "camera-lease-transferred"
  | "capacity-warning"
  | "capacity-critical"
  | "experiment-started"
  | "experiment-completed";

export interface HAEvent {
  id: string;
  tenantId: string;
  timestamp: string;
  eventType: HAEventType;
  severity: "info" | "warning" | "critical";
  component: "load-balancer" | "control-api" | "database" | "redis" | "kafka" | "media-gateway" | "edge-gateway" | "storage";
  nodeId?: string;
  nodeName?: string;
  
  message: string;
  details: Record<string, unknown>;
  
  // For failover events
  rtoMs?: number; // Recovery Time Objective
  dataLossBytes?: number; // Recovery Point Objective
  affectedCameras?: number;
  recordingGapMs?: number;
  
  // For capacity events
  currentUtilization?: number;
  thresholdUtilization?: number;
  
  // Correlation
  experimentId?: string;
  correlationId?: string;
}

// ============ Capacity Calculation ============

export interface CapacityConstraints {
  maxConcurrentStreams: number;
  maxDecoders: number;
  maxEncoders: number;
  maxNetworkMbps: number;
  maxDiskWriteMbps: number;
  maxCpu: number;
  maxGpu?: number;
  safetyMarginPercent: number; // Reserve capacity
}

export interface CapacityCalculation {
  theoreticalMax: number;
  hardLimit: number;
  safeLimit: number;
  currentUsed: number;
  availableHeadroom: number;
  utilizationPercent: number;
  isAtCapacity: boolean;
  bottleneck?: "cpu" | "network" | "disk" | "gpu" | "decoders" | "encoders";
}

// ============ HA Health Scoring ============

export interface ComponentHealthScore {
  component: string;
  score: number; // 0-100
  status: "healthy" | "warning" | "critical" | "offline";
  weight: number; // Importance for overall score
  checks: Array<{
    name: string;
    passed: boolean;
    value?: string | number;
    threshold?: string | number;
    message?: string;
  }>;
}

export interface HAHealthScore {
  overallScore: number; // 0-100
  status: "healthy" | "degraded" | "critical";
  components: {
    loadBalancer: ComponentHealthScore;
    controlPlane: ComponentHealthScore;
    database: ComponentHealthScore;
    redis: ComponentHealthScore;
    kafka: ComponentHealthScore;
    mediaPlane: ComponentHealthScore;
    edge: ComponentHealthScore;
    storage: ComponentHealthScore;
  };
  failingChecks: string[];
  warnings: string[];
  recommendations: string[];
  calculatedAt: string;
}
