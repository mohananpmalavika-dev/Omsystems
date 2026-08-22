export type FederationServerRole =
  | "global_command_center"
  | "regional_control_center"
  | "backup_server"
  | "edge_server";

export type FederationServerStatus =
  | "online"
  | "degraded"
  | "offline"
  | "maintenance"
  | "failover_active";

export interface FederatedServer {
  id: string;
  externalId: string;
  tenantId: string;
  name: string;
  description: string | null;
  role: FederationServerRole;
  countryCode: string;
  region: string;
  area: string | null;
  timezone: string;
  baseUrl: string;
  apiUrl: string;
  websocketUrl: string | null;
  status: FederationServerStatus;
  lastHeartbeat: string | null;
  lastSeenAt: string | null;
  healthScore: number;
  totalCameras: number;
  onlineCameras: number;
  totalBranches: number;
  storageCapacityGb: number | null;
  storageUsedGb: number | null;
  avgResponseTimeMs: number | null;
  requestsPerMinute: number | null;
  bandwidthMbps: number | null;
  primaryServerId: string | null;
  backupServerId: string | null;
  failoverPriority: number;
  autoFailoverEnabled: boolean;
  syncEnabled: boolean;
  syncIntervalSeconds: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface FederatedServerRecord extends FederatedServer {
  sharedSecretHash: string;
}

export interface RegisterFederatedServerInput {
  externalId: string;
  tenantId: string;
  name: string;
  description?: string;
  role: FederationServerRole;
  countryCode: string;
  region: string;
  area?: string;
  timezone: string;
  baseUrl: string;
  apiUrl: string;
  websocketUrl?: string;
  sharedSecretHash: string;
  primaryServerId?: string;
  backupServerId?: string;
  failoverPriority: number;
  autoFailoverEnabled: boolean;
  syncEnabled: boolean;
  syncIntervalSeconds: number;
  metadata: Record<string, unknown>;
  scopeNodeIds: string[];
  createdBy: string;
}

export interface FederationHeartbeatInput {
  status: Exclude<FederationServerStatus, "offline" | "failover_active">;
  healthScore: number;
  totalCameras: number;
  onlineCameras: number;
  totalBranches: number;
  storageCapacityGb?: number;
  storageUsedGb?: number;
  avgResponseTimeMs?: number;
  requestsPerMinute?: number;
  bandwidthMbps?: number;
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: number;
  activeConnections?: number;
  errorCount?: number;
  warningCount?: number;
}

export interface FederationDashboardSummary {
  totalServers: number;
  onlineServers: number;
  offlineServers: number;
  degradedServers: number;
  failoverActiveServers: number;
  totalRegions: number;
  totalCountries: number;
  totalCameras: number;
  onlineCameras: number;
  totalBranches: number;
  totalStorageGb: number;
  usedStorageGb: number;
  avgHealthScore: number;
  lastHeartbeat: string | null;
  regions: Array<{
    countryCode: string;
    region: string;
    servers: number;
    onlineServers: number;
    branches: number;
    cameras: number;
    onlineCameras: number;
    healthScore: number;
  }>;
}

export type FederationSearchType = "vehicle" | "face" | "object" | "incident" | "recording";

export interface FederationSearchQuery {
  type: FederationSearchType;
  term: string;
  from: string;
  to: string;
  regions?: string[];
  countryCodes?: string[];
  limit: number;
}

export interface FederatedSearchItem {
  id: string;
  type: FederationSearchType;
  occurredAt: string;
  cameraId?: string;
  branchId?: string;
  title: string;
  confidence?: number;
  snapshotUrl?: string;
  playbackUrl?: string;
  metadata?: Record<string, unknown>;
  serverId?: string;
  serverName?: string;
  region?: string;
  countryCode?: string;
}

export interface FederationSearchResponse {
  status: "complete" | "partial";
  query: FederationSearchQuery;
  data: FederatedSearchItem[];
  total: number;
  searchedServers: number;
  successfulServers: number;
  failedServers: number;
  sources: Array<{
    serverId: string;
    serverName: string;
    region: string;
    status: "success" | "failed";
    resultCount: number;
    durationMs: number;
    error?: string;
  }>;
}

export interface FederationFailoverEvent {
  id: string;
  tenantId: string;
  failedServerId: string;
  activeServerId: string;
  eventType: "automatic" | "manual" | "planned";
  reason: string;
  detectedAt: string;
  initiatedAt: string;
  completedAt: string | null;
  restoredAt: string | null;
  affectedBranches: number;
  affectedCameras: number;
  affectedUsers: number | null;
  downtimeSeconds: number | null;
  status: "in_progress" | "completed" | "failed" | "rolled_back";
  success: boolean | null;
  errorMessage: string | null;
  triggeredBy: string;
  metadata: Record<string, unknown>;
}

export interface GlobalAlertCorrelation {
  id: string;
  correlationType: string;
  confidenceScore: number;
  severity: "info" | "low" | "medium" | "high" | "critical";
  alertCount: number;
  regions: string[];
  startedAt: string;
  endedAt: string;
  trackedEntityType?: string;
  trackedEntityId?: string;
  involvedServers: string[];
}

