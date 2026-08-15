/**
 * Frontend TypeScript Types for Operational Health
 * 
 * Mirrors backend types for type-safe API communication
 */

export type HealthState = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
export type ConnectivityState = 'ONLINE' | 'DEGRADED' | 'FAILOVER' | 'OFFLINE';
export type RetentionState = 'COMPLIANT' | 'BELOW_POLICY' | 'UNKNOWN';
export type TelemetryFreshness = 'CURRENT' | 'STALE' | 'OFFLINE';

export interface BranchHealthReason {
  domain: string;
  severity: HealthState;
  code: string;
  message: string;
  assetId?: string;
  observedAt: string;
}

export interface CameraHealthSummary {
  total: number;
  online: number;
  offline: number;
  recording: number;
  notRecording: number;
  state: HealthState;
}

export interface RecorderHealthSummary {
  total: number;
  online: number;
  offline: number;
  state: HealthState;
  type?: 'DVR' | 'NVR' | 'HYBRID';
  uptime?: number;
}

export interface StorageHealthSummary {
  state: HealthState;
  disks: {
    total: number;
    healthy: number;
    failed: number;
    warning: number;
  };
  capacity?: {
    totalGB: number;
    usedGB: number;
    availableGB: number;
    usagePercent: number;
  };
}

export interface RetentionHealthSummary {
  requiredDays: number;
  actualDays: number | null;
  gapDays: number | null;
  state: RetentionState;
  confidence: number;
  observedAt: Date | null;
}

export interface NetworkHealthSummary {
  internetState: ConnectivityState;
  primaryLink?: ConnectivityState;
  failoverLink?: ConnectivityState;
  edgeAgentConnected: boolean;
  lastSeenAt?: Date;
}

export interface UPSHealthSummary {
  state: HealthState;
  online: boolean;
  batteryPercent?: number;
  onBattery: boolean;
  lastSeenAt?: Date;
}

export interface AlertHealthSummary {
  p1Count: number;
  p2Count: number;
  p3Count: number;
  unacknowledgedCount: number;
}

export interface BranchOperationalHealth {
  branchId: string;
  branchCode: string;
  branchName: string;
  regionId?: string;
  regionName?: string;
  overallState: HealthState;
  healthScore: number;
  reasonCodes: string[];
  reasons: BranchHealthReason[];
  cameras: CameraHealthSummary;
  recorders: RecorderHealthSummary;
  storage: StorageHealthSummary;
  retention: RetentionHealthSummary;
  network: NetworkHealthSummary;
  ups: UPSHealthSummary;
  alerts: AlertHealthSummary;
  telemetryFreshness: TelemetryFreshness;
  lastTelemetryAt: Date | null;
  observedAt: Date;
  updatedAt: Date;
}

export interface BranchMosaicItem {
  branchId: string;
  branchCode: string;
  branchName: string;
  regionName?: string;
  state: HealthState;
  score: number;
  camerasOnline: number;
  camerasTotal: number;
  camerasRecording: number;
  recorderState: HealthState;
  storageState: HealthState;
  retentionDays?: number;
  retentionRequiredDays?: number;
  retentionState: RetentionState;
  internetState: ConnectivityState;
  p1Alerts: number;
  primaryReason?: string;
  reasonCodes: string[];
  telemetryFreshness: TelemetryFreshness;
  lastSeenAt?: Date;
}

export interface OperationalDashboardSummary {
  generatedAt: Date;
  branches: {
    total: number;
    healthy: number;
    warning: number;
    critical: number;
    unknown: number;
  };
  cameras: {
    total: number;
    online: number;
    offline: number;
    recording: number;
    notRecording: number;
  };
  recorders: {
    total: number;
    online: number;
    offline: number;
  };
  storage: {
    healthy: number;
    warning: number;
    critical: number;
  };
  retention: {
    compliantBranches: number;
    violatingBranches: number;
  };
  network: {
    online: number;
    degraded: number;
    failover: number;
    offline: number;
  };
  alerts: {
    p1: number;
    p2: number;
    p3: number;
  };
}

export interface BranchHealthFilter {
  states?: HealthState[];
  internetStates?: ConnectivityState[];
  recorderStates?: HealthState[];
  storageStates?: HealthState[];
  retentionViolation?: boolean;
  recordingProblem?: boolean;
  cameraOffline?: boolean;
  p1Only?: boolean;
  regionIds?: string[];
  reasonCodes?: string[];
  search?: string;
}
