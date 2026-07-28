/**
 * TypeScript types for operational health monitoring
 */

export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown';
export type RecordingStatus = 'healthy' | 'compliant' | 'breach' | 'unknown' | 'at_risk' | 'not_recording' | 'recording_gap' | 'storage_blocked' | 'stream_unavailable' | 'policy_disabled';
export type DiskStatus = 'healthy' | 'warning' | 'degraded' | 'failure_predicted' | 'failed' | 'missing';
export type UPSStatus = 'online' | 'on_battery' | 'offline' | 'overload' | 'unknown';
export type EdgeAgentStatus = 'online' | 'offline' | 'warning' | 'unknown';
export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertStatus = 'active' | 'acknowledged' | 'assigned' | 'resolved' | 'closed';

/**
 * Top-level operational health summary
 */
export interface HealthSummary {
  totalBranches: number;
  healthyBranches: number;
  warningBranches: number;
  criticalBranches: number;
  unknownBranches: number;
  totalCameras: number;
  camerasOnline: number;
  camerasOffline: number;
  camerasRecording: number;
  recordingFailures: number;
  activeCriticalAlerts: number;
  totalEdgeAgents: number;
  edgeAgentsOnline: number;
  edgeAgentsOffline: number;
  edgeAgentsWarning: number;
  edgeAgentsUnknown: number;
  timestamp: string;
}

/**
 * Branch health summary
 */
export interface BranchHealth {
  id: string;
  name: string;
  code: string;
  region: string;
  healthStatus: HealthStatus;
  healthScore: number | null;
  lastHealthCheck: string | null;
  totalCameras: number;
  onlineCameras: number;
  recordingCameras: number;
  criticalAlerts: number;
  edgeAgentStatus: EdgeAgentStatus;
  edgeAgentHeartbeat: string;
}

/**
 * Component health scores
 */
export interface ComponentHealth {
  score: number | null;
  status: HealthStatus;
  lastUpdated: string | null;
}

/**
 * Detailed branch health
 */
export interface BranchHealthDetail {
  id: string;
  name: string;
  code: string;
  region: string;
  healthStatus: HealthStatus;
  healthScore: number | null;
  lastHealthCheck: string | null;
  components: {
    camera: ComponentHealth;
    recording: ComponentHealth;
    storage: ComponentHealth;
    network: ComponentHealth;
    ups: ComponentHealth;
    edgeAgent: ComponentHealth;
  };
  edgeAgent: EdgeAgentHealth;
}

/**
 * Edge agent health
 */
export interface EdgeAgentHealth {
  id: string;
  status: EdgeAgentStatus;
  version: string;
  cpuUsage: number | null;
  memoryUsage: number | null;
  diskUsage: number | null;
  lastHeartbeat: string | null;
  uptimeSeconds: number | null;
  connectedCameras?: number;
  recordingCameras?: number;
  failedRecordingJobs?: number;
  pendingUploads?: number;
  lastConfigSync?: string;
  branchId?: string;
  branchName?: string;
  branchCode?: string;
}

/**
 * Camera health
 */
export interface CameraHealth {
  id: string;
  name: string;
  rtspUrl?: string;
  onlineStatus: 'online' | 'offline' | 'warning' | 'degraded' | 'unknown';
  recordingStatus: RecordingStatus;
  lastHeartbeat: string | null;
  currentFps: number | null;
  expectedFps: number | null;
  currentBitrate: number | null;
  latencyMs: number | null;
  packetLoss: number | null;
  healthScore: number | null;
  branchId: string;
  branchName: string;
  onvifAvailable: boolean;
  streamAvailable: boolean;
  videoLoss: boolean;
  tamperingDetected: boolean;
  imageFrozen: boolean;
}

/**
 * Recording health metrics
 */
export interface RecordingHealth {
  totalRecordings: number;
  activeRecordings: number;
  recordingGaps: number;
  failedRecordings: number;
  avgSegmentInterval: number;
  totalGapSeconds: number;
}

/**
 * Storage health metrics
 */
export interface StorageHealth {
  totalCapacity: string;
  usedCapacity: string;
  availableCapacity: string;
  avgUsagePercent: number;
  avgRetentionDays: number;
  avgWriteLatency: number;
  degradedArrays: number;
  unmountedVolumes: number;
}

/**
 * Disk health with SMART metrics
 */
export interface DiskHealth {
  id: string;
  branchId: string;
  branchName: string;
  branchCode: string;
  devicePath: string;
  serialNumber: string;
  model: string;
  smartStatus: DiskStatus;
  temperature: number;
  powerOnHours: number;
  reallocatedSectors: number;
  pendingSectors: number;
  uncorrectableSectors: number;
  failureProbability: number;
  lastCheck: string;
}

/**
 * Network health metrics
 */
export interface NetworkHealth {
  avgLatency: number;
  avgJitter: number;
  avgPacketLoss: number;
  avgBandwidthUsage: number;
  wanDisconnected: number;
  vpnDisconnected: number;
  lastWanDisconnect: string | null;
}

/**
 * UPS health
 */
export interface UPSHealth {
  id: string;
  branchId: string;
  branchName: string;
  branchCode: string;
  upsStatus: UPSStatus;
  utilityPowerAvailable: boolean;
  runningOnBattery: boolean;
  batteryPercent: number;
  estimatedRuntimeMinutes: number;
  loadPercent: number;
  inputVoltage: number;
  outputVoltage: number;
  batteryAgeMonths: number;
  lastSelfTest: string | null;
  lastCheck: string;
}

/**
 * Health trend data point
 */
export interface HealthTrend {
  timestamp: string;
  component: string;
  avgScore: number;
  minScore: number;
  maxScore: number;
  criticalCount: number;
}

/**
 * Operational alert
 */
export interface OperationalAlert {
  id: string;
  severity: AlertSeverity;
  status: AlertStatus;
  componentType: string;
  deviceId: string | null;
  title: string;
  description: string;
  impact: string;
  recommendedAction: string;
  branchId: string | null;
  branchName: string | null;
  branchCode: string | null;
  detectedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  acknowledgedByName: string | null;
  assignedAt: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolution: string | null;
  slaDeadline: string | null;
  workOrderId: string | null;
}

/**
 * Filter options for branches
 */
export interface BranchHealthFilters {
  status?: HealthStatus;
  region?: string;
  limit?: number;
  offset?: number;
}

/**
 * Filter options for cameras
 */
export interface CameraHealthFilters {
  status?: 'online' | 'offline';
  branchId?: string;
  recordingStatus?: RecordingStatus;
  limit?: number;
  offset?: number;
}

/**
 * Filter options for disks
 */
export interface DiskHealthFilters {
  branchId?: string;
  status?: DiskStatus;
}

/**
 * Filter options for UPS
 */
export interface UPSHealthFilters {
  branchId?: string;
  status?: UPSStatus;
}

/**
 * Filter options for edge agents
 */
export interface EdgeAgentFilters {
  branchId?: string;
  status?: EdgeAgentStatus;
}

/**
 * Filter options for health trends
 */
export interface HealthTrendFilters {
  branchId?: string;
  component?: string;
  startDate?: string;
  endDate?: string;
  interval?: 'hour' | 'day' | 'week';
}

/**
 * Filter options for operational alerts
 */
export interface AlertFilters {
  severity?: AlertSeverity;
  status?: AlertStatus;
  branchId?: string;
  component?: string;
  limit?: number;
  offset?: number;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Alert action payloads
 */
export interface AcknowledgeAlertPayload {
  userId: string;
}

export interface AssignAlertPayload {
  assigneeId: string;
  assignedBy: string;
}

export interface ResolveAlertPayload {
  userId: string;
  resolution: string;
  notes?: string;
}

export interface CreateWorkOrderPayload {
  priority?: 'low' | 'medium' | 'high' | 'critical';
  assigneeId?: string;
  notes?: string;
}

/**
 * Health score thresholds
 */
export const HEALTH_THRESHOLDS = {
  healthy: 80,
  warning: 50,
  critical: 0
} as const;

/**
 * Component weight configuration for branch health score
 */
export const COMPONENT_WEIGHTS = {
  camera: 0.25,
  recording: 0.30,
  storage: 0.15,
  network: 0.10,
  ups: 0.10,
  edgeAgent: 0.10
} as const;

/**
 * Network health thresholds
 */
export const NETWORK_THRESHOLDS = {
  latency: {
    warning: 150,
    critical: 300
  },
  packetLoss: {
    warning: 2,
    critical: 5
  },
  jitter: {
    warning: 30,
    critical: 75
  },
  bandwidthUsage: {
    warning: 80,
    critical: 95
  }
} as const;

/**
 * Helper function to get health status from score
 */
export function getHealthStatusFromScore(score: number): HealthStatus {
  if (score >= HEALTH_THRESHOLDS.healthy) return 'healthy';
  if (score >= HEALTH_THRESHOLDS.warning) return 'warning';
  if (score > 0) return 'critical';
  return 'unknown';
}

/**
 * Helper function to get health status color
 */
export function getHealthStatusColor(status: HealthStatus): string {
  switch (status) {
    case 'healthy': return '#10b981'; // green-500
    case 'warning': return '#f59e0b'; // amber-500
    case 'critical': return '#ef4444'; // red-500
    case 'unknown': return '#6b7280'; // gray-500
  }
}

/**
 * Helper function to get health status icon
 */
export function getHealthStatusIcon(status: HealthStatus): string {
  switch (status) {
    case 'healthy': return '🟢';
    case 'warning': return '🟡';
    case 'critical': return '🔴';
    case 'unknown': return '⚫';
  }
}

/**
 * Format uptime seconds to human-readable string
 */
export function formatUptime(seconds: number | null): string {
  if (seconds === null) return '--';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number | string): string {
  const numBytes = typeof bytes === 'string' ? parseInt(bytes) : bytes;
  if (numBytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(numBytes) / Math.log(k));
  
  return `${(numBytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Calculate time ago from timestamp
 */
export function getTimeAgo(timestamp: string | null): string {
  if (!timestamp) return 'No telemetry';
  const now = new Date();
  const time = new Date(timestamp);
  const seconds = Math.floor((now.getTime() - time.getTime()) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
