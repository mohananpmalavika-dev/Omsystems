/**
 * Branch Operational Snapshot Types (Dashboard)
 * 
 * Frontend types matching the backend API models
 */

export type HealthState = 
  | 'HEALTHY'
  | 'WARNING'
  | 'CRITICAL'
  | 'UNKNOWN';

export type ConnectivityState =
  | 'ONLINE'
  | 'DEGRADED'
  | 'FAILOVER'
  | 'OFFLINE'
  | 'UNKNOWN';

export type CameraOperationalState =
  | 'LIVE'
  | 'ONLINE'
  | 'NO_RECORD'
  | 'STREAM_LOSS'
  | 'OFFLINE'
  | 'UNKNOWN';

export type RecorderState =
  | 'ONLINE'
  | 'DEGRADED'
  | 'OFFLINE'
  | 'UNKNOWN';

export type StorageState =
  | 'HEALTHY'
  | 'WARNING'
  | 'CRITICAL'
  | 'UNKNOWN';

export type RetentionState =
  | 'COMPLIANT'
  | 'WARNING'
  | 'VIOLATION'
  | 'UNKNOWN';

export type TelemetryFreshness =
  | 'CURRENT'
  | 'RECENT'
  | 'STALE'
  | 'OUTDATED';

export interface CameraOperationalStatus {
  id: string;
  name: string;
  channelNumber: string;
  state: CameraOperationalState;
  healthScore: number;
  onlineStatus: 'online' | 'offline' | 'unknown';
  streamAvailable: boolean;
  recordingStatus: 'recording' | 'stopped' | 'error' | 'unknown';
  lastRecordingAt?: string;
  recordingGapSeconds?: number;
  retentionDays?: number;
  retentionState?: RetentionState;
  currentFps?: number;
  expectedFps?: number;
  latencyMs?: number;
  videoLoss: boolean;
  tamperingDetected: boolean;
  imageFrozen: boolean;
  blackScreen: boolean;
  ptzSupported: boolean;
  audioSupported: boolean;
  lastHeartbeat?: string;
  observedAt: string;
}

export interface CameraHealthSummary {
  total: number;
  online: number;
  offline: number;
  recording: number;
  notRecording: number;
  streamLoss: number;
  videoLoss: number;
  healthyCount: number;
  warningCount: number;
  criticalCount: number;
  state: HealthState;
}

export interface RecorderStatus {
  id: string;
  name: string;
  type: 'DVR' | 'NVR' | 'Hybrid' | 'Server';
  state: RecorderState;
  online: boolean;
  lastHeartbeat?: string;
  uptimeSeconds?: number;
  totalChannels: number;
  activeChannels: number;
  recordingChannels: number;
  cpuUsage?: number;
  memoryUsage?: number;
  firmwareVersion?: string;
  firmwareUpdateAvailable?: boolean;
  observedAt: string;
}

export interface RecorderHealthSummary {
  total: number;
  online: number;
  offline: number;
  degraded: number;
  state: HealthState;
  recorders: RecorderStatus[];
}

export interface DiskStatus {
  id: string;
  devicePath: string;
  serialNumber?: string;
  model?: string;
  smartStatus: 'healthy' | 'warning' | 'failure_predicted' | 'failed' | 'unknown';
  temperature?: number;
  powerOnHours?: number;
  reallocatedSectors: number;
  pendingSectors: number;
  uncorrectableSectors: number;
  failureProbability?: number;
  capacityGB?: number;
  usedGB?: number;
  lastCheck: string;
}

export interface StorageHealthSummary {
  state: StorageState;
  disks: {
    total: number;
    healthy: number;
    warning: number;
    failed: number;
    unknown: number;
  };
  capacity?: {
    totalGB: number;
    usedGB: number;
    availableGB: number;
    usagePercent: number;
  };
  criticalDisks: DiskStatus[];
  raidStatus?: 'healthy' | 'degraded' | 'failed';
  observedAt?: string;
}

export interface BranchRetentionSummary {
  requiredDays: number;
  minimumVerifiedDays?: number;
  medianVerifiedDays?: number;
  compliantChannels: number;
  warningChannels: number;
  violatingChannels: number;
  unknownChannels: number;
  state: RetentionState;
  confidence: number;
  affectedCameras?: Array<{
    cameraId: string;
    cameraName: string;
    actualDays: number;
    gapDays: number;
    severity: 'WARNING' | 'CRITICAL';
  }>;
  observedAt?: string;
}

export interface LinkHealth {
  state: ConnectivityState;
  latencyMs?: number;
  packetLossPct?: number;
  bandwidthMbps?: number;
  lastDisconnectAt?: string;
  disconnectCount24h?: number;
}

export interface BranchConnectivityStatus {
  state: ConnectivityState;
  primaryWan: LinkHealth;
  secondaryWan?: LinkHealth;
  gateway?: {
    reachable: boolean;
    ipAddress?: string;
    lastSeenAt?: string;
  };
  vpn?: {
    connected: boolean;
    lastEstablishedAt?: string;
  };
  edgeAgent?: {
    connected: boolean;
    version?: string;
    lastHeartbeat?: string;
  };
  latencyMs?: number;
  packetLossPct?: number;
  lastOutage?: {
    startedAt: string;
    endedAt: string;
    durationSeconds: number;
  };
  observedAt: string;
}

export interface UPSHealthStatus {
  state: HealthState;
  online: boolean;
  utilityPowerAvailable: boolean;
  onBattery: boolean;
  batteryPercent?: number;
  estimatedRuntimeMinutes?: number;
  loadPercent?: number;
  inputVoltage?: number;
  outputVoltage?: number;
  batteryAgeMonths?: number;
  lastSelfTest?: string;
  observedAt?: string;
}

export interface AlertSummary {
  p1Count: number;
  p2Count: number;
  p3Count: number;
  unacknowledgedCount: number;
  activeCount: number;
  recentCritical?: Array<{
    id: string;
    title: string;
    componentType: string;
    deviceId?: string;
    detectedAt: string;
  }>;
}

export interface BranchHealthReason {
  code: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  component: 'CAMERA' | 'RECORDER' | 'STORAGE' | 'NETWORK' | 'RETENTION' | 'UPS' | 'ALERT';
  message: string;
  affectedCameras?: string[];
  affectedRecorders?: string[];
  affectedDisks?: string[];
  impactLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  impactDescription?: string;
}

export interface BranchOperationalSnapshot {
  branchId: string;
  branchCode: string;
  branchName: string;
  regionId?: string;
  regionName?: string;
  overallState: HealthState;
  healthScore: number;
  reasonCodes: string[];
  reasons: BranchHealthReason[];
  primaryReason?: BranchHealthReason;
  cameras: CameraHealthSummary;
  recorders: RecorderHealthSummary;
  storage: StorageHealthSummary;
  retention: BranchRetentionSummary;
  network: BranchConnectivityStatus;
  ups?: UPSHealthStatus;
  alerts: AlertSummary;
  telemetryFreshness: TelemetryFreshness;
  lastTelemetryAt?: string;
  observedAt: string;
  computedAt: string;
}

export interface BranchOperationalEvent {
  id: string;
  branchId: string;
  type:
    | 'CAMERA_STATUS_CHANGED'
    | 'RECORDING_STATUS_CHANGED'
    | 'RETENTION_CHANGED'
    | 'RECORDER_STATUS_CHANGED'
    | 'STORAGE_STATUS_CHANGED'
    | 'NETWORK_STATUS_CHANGED'
    | 'ALERT_CREATED'
    | 'ALERT_ACKNOWLEDGED'
    | 'ALERT_RESOLVED'
    | 'UPS_STATUS_CHANGED'
    | 'DIAGNOSTIC_RUN'
    | 'INCIDENT_CREATED';
  severity: 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';
  title: string;
  description?: string;
  cameraId?: string;
  cameraName?: string;
  recorderId?: string;
  alertId?: string;
  occurredAt: string;
  metadata?: Record<string, unknown>;
}
