/**
 * First-Class Edge Agent & Gateway Fleet Lifecycle Domain Types
 * (Full Fleet Lifecycle, Desired vs Actual State, Signed Staged Rollouts, Blast Radius, Digital Twin)
 */

export type EdgeAgentStatus =
  | "ONLINE"
  | "DEGRADED"
  | "OFFLINE"
  | "UPGRADING"
  | "ROLLING_BACK"
  | "FAILED"
  | "DRIFTED"
  | "REPLACEMENT_PENDING"
  | "DECOMMISSIONED";

export type RestartReason =
  | "OS_BOOT"
  | "SERVICE_RECOVERY"
  | "REMOTE_COMMAND"
  | "UPGRADE"
  | "ROLLBACK"
  | "WATCHDOG"
  | "CRASH"
  | "CONFIGURATION_CHANGE"
  | "OPERATOR_RESTART"
  | "UNKNOWN";

export type UpgradeStatus =
  | "IDLE"
  | "REQUESTED"
  | "ELIGIBILITY_CHECK"
  | "DOWNLOADING"
  | "VERIFYING_PACKAGE"
  | "STAGED"
  | "PRE_UPGRADE_CHECK"
  | "INSTALLING"
  | "RESTARTING"
  | "VERIFYING_HEALTH"
  | "SUCCESS"
  | "FAILED"
  | "ROLLING_BACK"
  | "ROLLED_BACK";

export type CertificateHealth = "HEALTHY" | "WARNING" | "CRITICAL" | "EXPIRED";

export type ReconciliationState = "COMPLIANT" | "DRIFTED" | "UNKNOWN";

export interface EdgeAgent {
  id: string;
  tenantId: string;
  branchId: string;
  branchName: string;
  branchCode: string;
  gatewayId: string;
  hostname: string;
  platform: "windows" | "linux";
  architecture: "x64" | "arm64";

  // Software & Configuration Versions
  agentVersion: string;
  desiredAgentVersion: string;
  configurationVersion: string;
  desiredConfigurationVersion: string;
  mediaMtxVersion?: string;

  // Status & Reconciled State
  status: EdgeAgentStatus;
  versionReconciliation: ReconciliationState;
  configReconciliation: ReconciliationState;

  // Timestamps & Lifecycle
  lastHeartbeatAt: string;
  firstSeenAt: string;
  installedAt: string;
  startedAt: string;
  lastRestartAt?: string;
  lastRestartReason?: RestartReason;

  // Security & Certificate
  certificateSerial?: string;
  certificateExpiresAt?: string;
  certificateHealth: CertificateHealth;
  daysToCertExpiry?: number;

  // Latest Telemetry Snapshot
  telemetry?: EdgeAgentHealthSnapshot;

  // Upgrade Progress
  currentUpgrade?: EdgeUpgradeRun;

  createdAt: string;
  updatedAt: string;
}

export interface EdgeAgentHealthSnapshot {
  agentId: string;
  observedAt: string;
  cpuPercent: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  serviceUptimeSeconds: number;
  services: {
    edgeAgent: "HEALTHY" | "DEGRADED" | "FAILED";
    mediaMtx: "HEALTHY" | "DEGRADED" | "FAILED";
    ffmpegWorkers: "HEALTHY" | "DEGRADED" | "FAILED";
  };
  cameras: {
    configured: number;
    reachable: number;
    streaming: number;
    recording: number;
  };
  clockOffsetMs: number;
}

export interface EdgeAgentHeartbeatPayload {
  agentId: string;
  branchId: string;
  agentVersion: string;
  configurationVersion: string;
  startedAt: string;
  serviceUptimeSeconds: number;
  lastRestartReason?: RestartReason;
  system: {
    cpuPercent: number;
    memoryUsedBytes: number;
    memoryTotalBytes: number;
    diskUsedBytes: number;
    diskTotalBytes: number;
  };
  services: {
    edgeAgent: "HEALTHY" | "DEGRADED" | "FAILED";
    mediaMtx: "HEALTHY" | "DEGRADED" | "FAILED";
    ffmpegWorkers: "HEALTHY" | "DEGRADED" | "FAILED";
  };
  cameras: {
    configured: number;
    reachable: number;
    streaming: number;
    recording: number;
  };
  certificate?: {
    serial: string;
    expiresAt: string;
  };
}

export interface EdgeAgentRelease {
  id: string;
  version: string;
  platform: "windows" | "linux";
  architecture: "x64" | "arm64";
  packageUrl: string;
  sha256: string;
  signature: string;
  minUpgradeFrom: string;
  releaseNotes: string;
  status: "DRAFT" | "APPROVED" | "RELEASED" | "REVOKED";
  createdBy: string;
  approvedBy?: string;
  createdAt: string;
}

export interface EdgeDeployment {
  id: string;
  releaseId: string;
  targetVersion: string;
  currentStage: "STAGE_1_CANARY_5" | "STAGE_2_PERCENT_25" | "STAGE_3_PERCENT_50" | "STAGE_4_PERCENT_100" | "COMPLETED" | "HALTED";
  status: "ACTIVE" | "PAUSED" | "SUCCESS" | "HALTED_HEALTH_BREACH" | "ROLLED_BACK";
  totalTargetAgents: number;
  upgradedCount: number;
  failedCount: number;
  rolledBackCount: number;
  healthMetrics: {
    upgradeSuccessRatePct: number;
    offlineAgentDeltaPct: number;
    cameraLossDeltaPct: number;
    recordingFailureCount: number;
    rollbackRatePct: number;
  };
  healthGatePassed: boolean;
  canaryAgentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EdgeUpgradeRun {
  runId: string;
  agentId: string;
  branchId: string;
  fromVersion: string;
  toVersion: string;
  status: UpgradeStatus;
  stageLogs: Array<{
    stage: UpgradeStatus;
    enteredAt: string;
    message: string;
    metadata?: Record<string, unknown>;
  }>;
  preUpgradeBaseline?: {
    cameraReachable: number;
    recordingHealthy: number;
    freeDiskGb: number;
  };
  postUpgradeVerification?: {
    cameraReachable: number;
    recordingHealthy: number;
    mediaMtxOk: boolean;
    streamCheckOk: boolean;
  };
  errorReason?: string;
  startedAt: string;
  completedAt?: string;
}

export interface UpgradeEligibility {
  eligible: boolean;
  blockers: Array<{
    code: "LOW_DISK" | "ACTIVE_CRITICAL_INCIDENT" | "HIGH_CPU" | "OUTSIDE_MAINTENANCE_WINDOW" | "AGENT_OFFLINE" | "INCOMPATIBLE_VERSION";
    message: string;
  }>;
}

export interface EdgeGatewayTwinNode {
  twinId: string;
  tenantId: string;
  branchId: string;
  branchName: string;
  hostname: string;
  overallHealth: "HEALTHY" | "WARNING" | "CRITICAL" | "OFFLINE";
  dimensions: {
    connectivity: "HEALTHY" | "DEGRADED" | "OFFLINE";
    hardware: "HEALTHY" | "HIGH_LOAD" | "CRITICAL";
    agent: "HEALTHY" | "DRIFTED" | "DEGRADED";
    configuration: "COMPLIANT" | "DRIFTED";
    security: "HEALTHY" | "CERT_WARNING" | "CERT_CRITICAL";
    recording: "HEALTHY" | "PARTIAL_DROP" | "FAILED";
  };
  hardware: {
    cpuModel?: string;
    cpuCores?: number;
    memoryGb?: number;
    diskTotalGb?: number;
  };
  agent: {
    version: string;
    desiredVersion: string;
    status: EdgeAgentStatus;
  };
  configuration: {
    actualVersion: string;
    desiredVersion: string;
  };
  security: {
    certificateExpiresAt?: string;
    remainingDays?: number;
  };
  blastRadius: {
    camerasImpacted: number;
    recordingChannelsAtRisk: number;
    activeAlertsAffected: number;
    nvrsAttached: number;
    openInvestigationsReferencing: number;
  };
  dependencies: {
    router: string;
    cameras: string[];
    recorders: string[];
  };
}

export interface FleetSummary {
  totalAgents: number;
  onlineCount: number;
  degradedCount: number;
  offlineCount: number;
  latestVersion: string;
  versionDistribution: Record<string, number>;
  configCompliantCount: number;
  configDriftedCount: number;
  certificates: {
    healthyCount: number;
    expiringWithin30Days: number;
    expiringWithin14Days: number;
    expiredCount: number;
  };
  activeRollouts: number;
  upgradeFailures24h: number;
}
