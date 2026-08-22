/**
 * Canonical Operational Health Types
 * 
 * These types define the source-of-truth health model for the entire surveillance system.
 * Every dashboard, report, alert, and Digital Twin view uses these contracts.
 */

/**
 * Core health states - used consistently across all health evaluations
 */
export type HealthState = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';

/**
 * Connectivity states for network and internet health
 */
export type ConnectivityState = 'ONLINE' | 'DEGRADED' | 'FAILOVER' | 'OFFLINE';

/**
 * Retention compliance states
 */
export type RetentionState = 'COMPLIANT' | 'BELOW_POLICY' | 'UNKNOWN';

/**
 * Health domain categories for reason codes
 */
export type HealthDomain =
  | 'CAMERA'
  | 'RECORDER'
  | 'STORAGE'
  | 'RETENTION'
  | 'NETWORK'
  | 'UPS'
  | 'EDGE_AGENT'
  | 'ALERT'
  | 'RECORDING';

/**
 * Reason code explaining why a branch has a particular health state
 */
export interface BranchHealthReason {
  domain: HealthDomain;
  severity: HealthState;
  code: string;
  message: string;
  assetId?: string;
  observedAt: string;
}

/**
 * Camera health summary for a branch
 */
export interface CameraHealthSummary {
  total: number;
  online: number;
  offline: number;
  recording: number;
  notRecording: number;
  state: HealthState;
}

/**
 * Recorder health summary for a branch
 */
export interface RecorderHealthSummary {
  total: number;
  online: number;
  offline: number;
  state: HealthState;
  type?: 'DVR' | 'NVR' | 'HYBRID';
  uptime?: number; // seconds
}

/**
 * Storage health summary for a branch
 */
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

/**
 * Retention health summary for a branch
 */
export interface RetentionHealthSummary {
  requiredDays: number;
  actualDays: number | null;
  gapDays: number | null;
  state: RetentionState;
  confidence: number; // 0-1
  observedAt: Date | null;
}

/**
 * Network health summary for a branch
 */
export interface NetworkHealthSummary {
  internetState: ConnectivityState;
  primaryLink: ConnectivityState;
  failoverLink?: ConnectivityState;
  edgeAgentConnected: boolean;
  lastSeenAt?: Date;
}

/**
 * UPS health summary for a branch
 */
export interface UPSHealthSummary {
  state: HealthState;
  online: boolean;
  batteryPercent?: number;
  onBattery: boolean;
  lastSeenAt?: Date;
}

/**
 * Alert summary for a branch
 */
export interface AlertHealthSummary {
  p1Count: number;
  p2Count: number;
  p3Count: number;
  unacknowledgedCount: number;
}

/**
 * Complete operational health for a single branch
 * This is the canonical contract used everywhere
 */
export interface BranchOperationalHealth {
  branchId: string;
  branchCode: string;
  branchName: string;
  regionId?: string;
  regionName?: string;
  
  // Overall health
  overallState: HealthState;
  healthScore: number; // 0-100
  reasonCodes: string[];
  reasons: BranchHealthReason[];
  
  // Component health
  cameras: CameraHealthSummary;
  recorders: RecorderHealthSummary;
  storage: StorageHealthSummary;
  retention: RetentionHealthSummary;
  network: NetworkHealthSummary;
  ups: UPSHealthSummary;
  alerts: AlertHealthSummary;
  
  // Telemetry metadata
  telemetryFreshness: 'CURRENT' | 'STALE' | 'OFFLINE';
  lastTelemetryAt: Date | null;
  observedAt: Date;
  updatedAt: Date;
}

/**
 * Lightweight branch health for mosaic display (400 branches)
 */
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
  
  telemetryFreshness: 'CURRENT' | 'STALE' | 'OFFLINE';
  lastSeenAt?: Date;
}

/**
 * Dashboard summary KPIs
 */
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

/**
 * Multi-dimensional filter for branch health queries
 */
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

/**
 * Branch health state change event
 */
export interface BranchHealthChangedEvent {
  tenantId: string;
  branchId: string;
  branchCode: string;
  branchName: string;
  previousState: HealthState;
  newState: HealthState;
  previousScore: number;
  newScore: number;
  reasonCodes: string[];
  reasons: BranchHealthReason[];
  changedAt: Date;
}

/**
 * Telemetry freshness thresholds (milliseconds)
 */
export const TELEMETRY_THRESHOLDS = {
  CURRENT: 30_000,      // < 30 seconds
  STALE: 120_000,       // 30 sec - 2 min
  OFFLINE: 300_000,     // > 5 min
} as const;

/**
 * Health scoring penalties
 */
export const HEALTH_PENALTIES = {
  // Critical penalties
  ALL_RECORDERS_OFFLINE: 50,
  ALL_CAMERAS_OFFLINE: 50,
  RECORDING_STOPPED: 45,
  STORAGE_FAILURE: 40,
  RETENTION_VIOLATION: 35,
  INTERNET_OFFLINE: 30,
  EDGE_AGENT_OFFLINE: 25,
  
  // Warning penalties
  RECORDER_DEGRADED: 15,
  CAMERA_OFFLINE: 10,
  STORAGE_WARNING: 10,
  NETWORK_DEGRADED: 8,
  UPS_ON_BATTERY: 5,
  
  // Per-item penalties
  PER_CAMERA_OFFLINE: 2,
  PER_RECORDING_FAILURE: 3,
} as const;

/**
 * Standard reason codes for branch health issues
 */
export const REASON_CODES = {
  // Recorder
  ALL_RECORDERS_OFFLINE: 'ALL_RECORDERS_OFFLINE',
  RECORDER_OFFLINE: 'RECORDER_OFFLINE',
  RECORDER_UNREACHABLE: 'RECORDER_UNREACHABLE',
  
  // Camera
  ALL_CAMERAS_OFFLINE: 'ALL_CAMERAS_OFFLINE',
  CAMERAS_OFFLINE: 'CAMERAS_OFFLINE',
  CAMERA_UNREACHABLE: 'CAMERA_UNREACHABLE',
  CAMERA_LOW_AVAILABILITY: 'CAMERA_LOW_AVAILABILITY',
  
  // Recording
  RECORDING_STOPPED: 'RECORDING_STOPPED',
  RECORDING_FAILURE: 'RECORDING_FAILURE',
  CAMERAS_NOT_RECORDING: 'CAMERAS_NOT_RECORDING',
  
  // Storage
  STORAGE_FAILURE: 'STORAGE_FAILURE',
  HDD_FAILED: 'HDD_FAILED',
  HDD_WARNING: 'HDD_WARNING',
  STORAGE_CAPACITY_CRITICAL: 'STORAGE_CAPACITY_CRITICAL',
  STORAGE_CAPACITY_WARNING: 'STORAGE_CAPACITY_WARNING',
  
  // Retention
  RETENTION_BELOW_POLICY: 'RETENTION_BELOW_POLICY',
  RETENTION_UNKNOWN: 'RETENTION_UNKNOWN',
  RETENTION_GAP: 'RETENTION_GAP',
  
  // Network
  INTERNET_OFFLINE: 'INTERNET_OFFLINE',
  INTERNET_DEGRADED: 'INTERNET_DEGRADED',
  INTERNET_FAILOVER: 'INTERNET_FAILOVER',
  
  // Edge Agent
  EDGE_AGENT_OFFLINE: 'EDGE_AGENT_OFFLINE',
  EDGE_AGENT_DISCONNECTED: 'EDGE_AGENT_DISCONNECTED',
  TELEMETRY_STALE: 'TELEMETRY_STALE',
  
  // UPS
  UPS_OFFLINE: 'UPS_OFFLINE',
  UPS_ON_BATTERY: 'UPS_ON_BATTERY',
  UPS_LOW_BATTERY: 'UPS_LOW_BATTERY',
  
  // Alerts
  CRITICAL_ALERTS_ACTIVE: 'CRITICAL_ALERTS_ACTIVE',
  UNACKNOWLEDGED_P1_ALERTS: 'UNACKNOWLEDGED_P1_ALERTS',
} as const;

export type ReasonCode = typeof REASON_CODES[keyof typeof REASON_CODES];
