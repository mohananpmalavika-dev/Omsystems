/**
 * Enterprise 400-Branch Edge Agent Subsystem Domain Types
 * Robust branch-level appliance management with WAN outage tolerance,
 * persistent buffering, discovery, network diagnostics, and credential rotation.
 */

export type EdgeAgentStatus = "ONLINE" | "DEGRADED" | "OFFLINE_BUFFERING" | "MAINTENANCE" | "UPDATING";
export type UplinkMode = "PRIMARY_FIBER" | "LTE_FAILOVER" | "OFFLINE_AIRGAP";
export type DeviceProtocol = "ONVIF" | "DAHUA_CGI" | "HIKVISION_ISAPI" | "CPPLUS_PROPRIETARY" | "GENERIC_RTSP";

export interface DiscoveredDevice {
  ip: string;
  macAddress: string;
  protocol: DeviceProtocol;
  manufacturer: string;
  model: string;
  firmwareVersion: string;
  serialNumber: string;
  channelCount: number;
  onvifXaddr?: string;
  rtspUriCandidates: string[];
  status: "UNPROVISIONED" | "MANAGED" | "UNKNOWN";
  discoveredAt: string;
}

export interface DeviceDiscoveryReport {
  jobId: string;
  branchId: string;
  agentId: string;
  scannedSubnet: string;
  totalDevicesFound: number;
  devices: DiscoveredDevice[];
  durationMs: number;
  completedAt: string;
}

export interface LocalHealthDiagnostics {
  agentId: string;
  branchId: string;
  cpuUsagePct: number;
  memoryUsagePct: number;
  temperatureCelsius: number;
  diskFreeGb: number;
  diskTotalGb: number;
  ntpTimeDriftMs: number;
  cameraLatencyP95Ms: number;
  nvrSmartStatus: "HEALTHY" | "WARNING_BAD_SECTORS" | "CRITICAL_FAILURE";
  activeStreamCount: number;
  healthyCameraCount: number;
  totalCameraCount: number;
  reportedAt: string;
}

export interface NetworkDiagnostics {
  agentId: string;
  branchId: string;
  currentUplink: UplinkMode;
  gatewayLatencyMs: number;
  dnsResolutionMs: number;
  wanUplinkMbps: number;
  packetLossPct: number;
  lteSignalStrengthDbm?: number; // e.g. -75 dBm
  lteProvider?: string;
  wanOutageCount24h: number;
  diagnosedAt: string;
}

export interface BufferedEventRecord {
  id: string;
  sequenceNumber: number;
  eventType: string;
  cameraId?: string;
  branchId: string;
  severity: "P1" | "P2" | "P3" | "INFO";
  payload: Record<string, unknown>;
  snapshotBase64?: string;
  recordedAt: string;
  spooledToDiskAt: string;
  syncedToCloud: boolean;
}

export interface OfflineBufferQueueState {
  agentId: string;
  branchId: string;
  isBufferingActive: boolean;
  totalBufferedEvents: number;
  unflushedP1Events: number;
  totalBufferSizeBytes: number;
  maxBufferSizeBytes: number;
  oldestBufferedEventAt?: string;
  lastFlushCompletedAt?: string;
  flushProgressPct: number;
}

export interface ConfigSyncState {
  agentId: string;
  branchId: string;
  desiredRevision: string;
  actualRevision: string;
  isDriftDetected: boolean;
  driftFields: string[];
  lastSyncedAt: string;
}

export interface CredentialRotationTask {
  taskId: string;
  branchId: string;
  agentId: string;
  deviceId: string;
  deviceIp: string;
  status: "PENDING" | "IN_PROGRESS" | "ROTATED_VERIFIED" | "FAILED_ROLLED_BACK";
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface OtaUpdateRollout {
  rolloutId: string;
  targetVersion: string;
  signedPackageSha256: string;
  signatureBase64: string;
  stage: "CANARY_5_BRANCHES" | "WAVE_1_50_BRANCHES" | "FULL_FLEET_400_BRANCHES" | "COMPLETED" | "ROLLED_BACK";
  totalTargetBranches: number;
  successfulUpdates: number;
  failedUpdates: number;
  inProgressUpdates: number;
  autoRollbackTriggered: boolean;
  createdAt: string;
}

export interface BranchEdgeAgent {
  agentId: string;
  branchId: string;
  branchName: string;
  hostname: string;
  ipAddress: string;
  status: EdgeAgentStatus;
  uplinkMode: UplinkMode;
  firmwareVersion: string;
  certFingerprintSha256: string;
  certExpiresAt: string;
  health: LocalHealthDiagnostics;
  network: NetworkDiagnostics;
  bufferQueue: OfflineBufferQueueState;
  configSync: ConfigSyncState;
  lastHeartbeatAt: string;
  installedAt: string;
}

export interface FleetSummary {
  totalAgents: number;
  onlineCount: number;
  degradedCount: number;
  bufferingOfflineCount: number;
  totalManagedCameras: number;
  totalManagedRecorders: number;
  activeLteFailoverCount: number;
  totalBufferedEventsAcrossFleet: number;
  firmwareDistribution: Record<string, number>;
  complianceScore: number;
}
