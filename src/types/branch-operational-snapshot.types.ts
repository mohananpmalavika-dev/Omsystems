/**
 * Branch Operational Snapshot Types
 * 
 * Comprehensive operational state models for the Branch Command Center.
 * These types represent the canonical "single truth" for branch health,
 * combining cameras, recorders, storage, network, retention, and alerts.
 */

/**
 * Health states for components and overall branch
 */
export type HealthState = 
  | 'HEALTHY'
  | 'WARNING'
  | 'CRITICAL'
  | 'UNKNOWN';

/**
 * Connectivity states for network components
 */
export type ConnectivityState =
  | 'ONLINE'
  | 'DEGRADED'
  | 'FAILOVER'
  | 'OFFLINE'
  | 'UNKNOWN';

/**
 * Camera operational state (extends simple online/offline)
 */
export type CameraOperationalState =
  | 'LIVE'           // Online, streaming, recording
  | 'ONLINE'         // Online but not recording
  | 'NO_RECORD'      // Online, streaming, but recording failed
  | 'STREAM_LOSS'    // Online but stream unavailable
  | 'OFFLINE'        // Cannot reach camera
  | 'UNKNOWN';       // Status not determined

/**
 * Recorder operational state
 */
export type RecorderState =
  | 'ONLINE'
  | 'DEGRADED'
  | 'OFFLINE'
  | 'UNKNOWN';

/**
 * Storage health state
 */
export type StorageState =
  | 'HEALTHY'
  | 'WARNING'        // High usage or minor SMART warnings
  | 'CRITICAL'       // Failed disk or imminent failure
  | 'UNKNOWN';

/**
 * Retention compliance state
 */
export type RetentionState =
  | 'COMPLIANT'      // Meets required retention days
  | 'WARNING'        // Close to policy threshold
  | 'VIOLATION'      // Below required retention
  | 'UNKNOWN';       // Cannot verify

/**
 * Telemetry freshness
 */
export type TelemetryFreshness =
  | 'CURRENT'        // <30 seconds
  | 'RECENT'         // 30s - 2min
  | 'STALE'          // 2min - 10min
  | 'OUTDATED';      // >10min

/**
 * Observed state with provenance metadata
 */
export interface ObservedState<T> {
  value: T;
  observedAt: Date;
  source: 'ONVIF' | 'VENDOR_API' | 'SNMP' | 'EDGE_AGENT' | 'RTSP' | 'PING' | 'DERIVED';
  confidence: number; // 0.0 - 1.0
  stale: boolean;
}

/**
 * Individual camera operational status
 */
export interface CameraOperationalStatus {
  id: string;
  name: string;
  channelNumber: string;
  state: CameraOperationalState;
  healthScore: number;
  
  // Connection state
  onlineStatus: 'online' | 'offline' | 'unknown';
  streamAvailable: boolean;
  
  // Recording state
  recordingStatus: 'recording' | 'stopped' | 'error' | 'unknown';
  lastRecordingAt?: Date;
  recordingGapSeconds?: number;
  
  // Retention
  retentionDays?: number;
  retentionState?: RetentionState;
  
  // Video quality
  currentFps?: number;
  expectedFps?: number;
  latencyMs?: number;
  
  // Health indicators
  videoLoss: boolean;
  tamperingDetected: boolean;
  imageFrozen: boolean;
  blackScreen: boolean;
  
  // Capabilities
  ptzSupported: boolean;
  audioSupported: boolean;
  
  // Metadata
  lastHeartbeat?: Date;
  observedAt: Date;
}

/**
 * Camera health summary for the branch
 */
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

/**
 * Individual recorder status
 */
export interface RecorderStatus {
  id: string;
  name: string;
  type: 'DVR' | 'NVR' | 'Hybrid' | 'Server';
  state: RecorderState;
  
  online: boolean;
  lastHeartbeat?: Date;
  uptimeSeconds?: number;
  
  // Channels
  totalChannels: number;
  activeChannels: number;
  recordingChannels: number;
  
  // Performance
  cpuUsage?: number;
  memoryUsage?: number;
  
  // Firmware
  firmwareVersion?: string;
  firmwareUpdateAvailable?: boolean;
  
  observedAt: Date;
}

/**
 * Recorder health summary
 */
export interface RecorderHealthSummary {
  total: number;
  online: number;
  offline: number;
  degraded: number;
  state: HealthState;
  recorders: RecorderStatus[];
}

/**
 * Individual disk status with SMART metrics
 */
export interface DiskStatus {
  id: string;
  devicePath: string;
  serialNumber?: string;
  model?: string;
  
  smartStatus: 'healthy' | 'warning' | 'failure_predicted' | 'failed' | 'unknown';
  temperature?: number;
  powerOnHours?: number;
  
  // Critical SMART attributes
  reallocatedSectors: number;
  pendingSectors: number;
  uncorrectableSectors: number;
  
  failureProbability?: number; // 0-100%
  
  // Capacity
  capacityGB?: number;
  usedGB?: number;
  
  lastCheck: Date;
}

/**
 * Storage health summary
 */
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
  
  observedAt?: Date;
}

/**
 * Branch retention summary
 */
export interface BranchRetentionSummary {
  requiredDays: number;
  minimumVerifiedDays?: number;
  medianVerifiedDays?: number;
  
  // Channel counts
  compliantChannels: number;
  warningChannels: number;    // Within threshold but below required
  violatingChannels: number;
  unknownChannels: number;
  
  state: RetentionState;
  confidence: number;
  
  // Affected cameras
  affectedCameras?: Array<{
    cameraId: string;
    cameraName: string;
    actualDays: number;
    gapDays: number;
    severity: 'WARNING' | 'CRITICAL';
  }>;
  
  observedAt?: Date;
}

/**
 * Link health for WAN/VPN connections
 */
export interface LinkHealth {
  state: ConnectivityState;
  latencyMs?: number;
  packetLossPct?: number;
  bandwidthMbps?: number;
  lastDisconnectAt?: Date;
  disconnectCount24h?: number;
}

/**
 * Branch connectivity status
 */
export interface BranchConnectivityStatus {
  state: ConnectivityState;
  
  // WAN links
  primaryWan: LinkHealth;
  secondaryWan?: LinkHealth;
  
  // Gateway
  gateway?: {
    reachable: boolean;
    ipAddress?: string;
    lastSeenAt?: Date;
  };
  
  // VPN tunnel
  vpn?: {
    connected: boolean;
    lastEstablishedAt?: Date;
  };
  
  // Edge Agent
  edgeAgent?: {
    connected: boolean;
    version?: string;
    lastHeartbeat?: Date;
  };
  
  // Metrics
  latencyMs?: number;
  packetLossPct?: number;
  
  // History
  lastOutage?: {
    startedAt: Date;
    endedAt: Date;
    durationSeconds: number;
  };
  
  observedAt: Date;
}

/**
 * UPS health status
 */
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
  lastSelfTest?: Date;
  
  observedAt?: Date;
}

/**
 * Alert summary by severity
 */
export interface AlertSummary {
  p1Count: number;      // Critical
  p2Count: number;      // Warning
  p3Count: number;      // Info
  
  unacknowledgedCount: number;
  activeCount: number;
  
  // Recent critical alerts
  recentCritical?: Array<{
    id: string;
    title: string;
    componentType: string;
    deviceId?: string;
    detectedAt: Date;
  }>;
}

/**
 * Branch operational event for timeline
 */
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
  
  // Related resources
  cameraId?: string;
  cameraName?: string;
  recorderId?: string;
  alertId?: string;
  
  occurredAt: Date;
  
  // Metadata
  metadata?: Record<string, unknown>;
}

/**
 * Reason for branch health state
 */
export interface BranchHealthReason {
  code: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  component: 'CAMERA' | 'RECORDER' | 'STORAGE' | 'NETWORK' | 'RETENTION' | 'UPS' | 'ALERT';
  message: string;
  
  // Affected resources
  affectedCameras?: string[];
  affectedRecorders?: string[];
  affectedDisks?: string[];
  
  // Blast radius
  impactLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  impactDescription?: string;
}

/**
 * Complete branch operational snapshot
 * This is the canonical model returned by GET /branches/:id/operational-snapshot
 */
export interface BranchOperationalSnapshot {
  // Branch identity
  branchId: string;
  branchCode: string;
  branchName: string;
  regionId?: string;
  regionName?: string;
  
  // Overall state
  overallState: HealthState;
  healthScore: number; // 0-100
  
  // Why this branch has this state
  reasonCodes: string[];
  reasons: BranchHealthReason[];
  primaryReason?: BranchHealthReason; // Most important issue
  
  // Component health
  cameras: CameraHealthSummary;
  recorders: RecorderHealthSummary;
  storage: StorageHealthSummary;
  retention: BranchRetentionSummary;
  network: BranchConnectivityStatus;
  ups?: UPSHealthStatus;
  alerts: AlertSummary;
  
  // Telemetry metadata
  telemetryFreshness: TelemetryFreshness;
  lastTelemetryAt?: Date;
  
  // Timestamps
  observedAt: Date;
  computedAt: Date;
}

/**
 * Camera wall configuration
 */
export interface CameraWallConfig {
  branchId: string;
  
  // Display options
  gridColumns: number; // 2, 3, 4, 6, 8
  sortBy: 'number' | 'health' | 'recording' | 'retention' | 'alert';
  sortOrder: 'asc' | 'desc';
  
  // Filters
  filter?: 'all' | 'live' | 'offline' | 'no-record' | 'retention-violation' | 'active-alert';
  
  // Stream quality
  streamProfile: 'main' | 'sub' | 'auto';
  
  // Capacity management
  maxDecoders: number;
  autoRotate: boolean;
  rotationIntervalSeconds?: number;
}

/**
 * Live session for camera streaming
 */
export interface LiveSession {
  sessionId: string;
  cameraId: string;
  streamProfile: 'main' | 'sub';
  
  // URLs
  hlsUrl?: string;
  dashUrl?: string;
  webRtcUrl?: string;
  
  // Session lifecycle
  createdAt: Date;
  expiresAt: Date;
  renewedAt?: Date;
  
  // Status
  status: 'active' | 'expiring' | 'expired';
}

/**
 * Operator audit event
 */
export interface OperatorAuditEvent {
  id: string;
  tenantId: string;
  userId: string;
  userName?: string;
  
  branchId: string;
  
  action:
    | 'VIEW_LIVE'
    | 'VIEW_PLAYBACK'
    | 'EXPORT_VIDEO'
    | 'SNAPSHOT'
    | 'PTZ_CONTROL'
    | 'ACKNOWLEDGE_ALERT'
    | 'CREATE_INCIDENT'
    | 'RUN_DIAGNOSTIC'
    | 'RESTART_DEVICE'
    | 'CHANGE_CONFIG';
  
  resourceType?: 'CAMERA' | 'RECORDER' | 'ALERT' | 'BRANCH';
  resourceId?: string;
  
  // Context
  sourceIp?: string;
  userAgent?: string;
  
  // Result
  outcome: 'SUCCESS' | 'FAILURE' | 'DENIED';
  failureReason?: string;
  
  timestamp: Date;
  
  // Details
  metadata?: Record<string, unknown>;
}

/**
 * Request/response types for API endpoints
 */

export interface GetBranchSnapshotRequest {
  branchId: string;
  refresh?: boolean; // Force refresh from telemetry sources
}

export interface GetBranchSnapshotResponse {
  success: boolean;
  data: BranchOperationalSnapshot;
  cached: boolean;
  cacheAge?: number; // milliseconds
}

export interface GetBranchCamerasRequest {
  branchId: string;
  filter?: 'all' | 'online' | 'offline' | 'recording' | 'not-recording' | 'problem';
  sortBy?: 'number' | 'health' | 'name';
  includeDetails?: boolean;
}

export interface GetBranchCamerasResponse {
  success: boolean;
  data: {
    cameras: CameraOperationalStatus[];
    summary: CameraHealthSummary;
  };
}

export interface GetBranchEventsRequest {
  branchId: string;
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  severity?: 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';
  type?: BranchOperationalEvent['type'];
}

export interface GetBranchEventsResponse {
  success: boolean;
  data: {
    events: BranchOperationalEvent[];
    total: number;
  };
}

export interface CreateLiveSessionRequest {
  cameraIds: string[];
  streamProfile?: 'main' | 'sub' | 'auto';
  durationSeconds?: number; // Default 300 (5 minutes)
}

export interface CreateLiveSessionResponse {
  success: boolean;
  data: {
    sessions: LiveSession[];
  };
}

export interface RenewLiveSessionRequest {
  sessionId: string;
  extendSeconds?: number; // Default 300
}

export interface RenewLiveSessionResponse {
  success: boolean;
  data: {
    session: LiveSession;
  };
}

export interface CloseLiveSessionRequest {
  sessionId: string;
}

export interface CloseLiveSessionResponse {
  success: boolean;
  message: string;
}

export interface RunDiagnosticRequest {
  deviceType: 'camera' | 'recorder' | 'storage';
  deviceId: string;
  diagnosticType: 'connectivity' | 'recording' | 'health' | 'full';
}

export interface RunDiagnosticResponse {
  success: boolean;
  data: {
    diagnosticId: string;
    status: 'running' | 'completed' | 'failed';
    results?: Record<string, unknown>;
  };
}
