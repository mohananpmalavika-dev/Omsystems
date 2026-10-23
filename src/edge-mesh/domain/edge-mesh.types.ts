/**
 * Domain Types for Smart Edge Offline Mesh & Zero-Bandwidth Mode (Bandwidth Killer)
 *
 * Defines contracts for Quiescent 1 FPS stream throttling, AI-triggered 4K burst
 * streaming, Anti-Jamming local cache survivability, and Store-and-Forward sync.
 */

export type StreamMode =
  | 'QUIESCENT_1FPS'       // ~40 kbps, 1 FPS keyframes (98% bandwidth reduction)
  | 'BURST_4K'             // ~4500 kbps, 30 FPS 4K broadcast on AI alert
  | 'OFFLINE_CACHED'       // 0 kbps WAN (spooled to local anti-jamming disk cache)
  | 'OPERATOR_OVERRIDE';   // Manual high-res live view request from NOC

export type MeshNodeStatus =
  | 'ONLINE'               // Primary WAN link healthy
  | 'OFFLINE_ISOLATED'     // WAN cable cut or jamming detected; edge running 100% locally
  | 'MESH_FAILOVER'        // Primary WAN down; routing through secondary peer hotspot
  | 'SYNCING';             // Reconnected; store-and-forward replaying backlog to cloud

export type WanConnectionType =
  | 'FIBER_BROADBAND'
  | '4G_5G_CELLULAR'
  | 'VSAT'
  | 'MESH_PEER';

export interface EdgeBandwidthPolicy {
  id: string;
  tenant_id: string;
  branch_id?: string | null;
  camera_id?: string | null;
  name: string;
  enabled: boolean;
  quiescent_fps: number;
  quiescent_resolution: string;
  quiescent_bitrate_kbps: number;
  burst_fps: number;
  burst_resolution: string;
  burst_bitrate_kbps: number;
  burst_duration_seconds: number;
  pre_buffer_seconds: number;
  trigger_alert_types: string[];
  monthly_data_quota_mb: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateEdgeBandwidthPolicyInput {
  tenantId: string;
  branchId?: string | null;
  cameraId?: string | null;
  name: string;
  enabled?: boolean;
  quiescentFps?: number;
  quiescentResolution?: string;
  quiescentBitrateKbps?: number;
  burstFps?: number;
  burstResolution?: string;
  burstBitrateKbps?: number;
  burstDurationSeconds?: number;
  preBufferSeconds?: number;
  triggerAlertTypes?: string[];
  monthlyDataQuotaMb?: number;
}

export interface UpdateEdgeBandwidthPolicyInput {
  name?: string;
  enabled?: boolean;
  quiescentFps?: number;
  quiescentResolution?: string;
  quiescentBitrateKbps?: number;
  burstFps?: number;
  burstResolution?: string;
  burstBitrateKbps?: number;
  burstDurationSeconds?: number;
  preBufferSeconds?: number;
  triggerAlertTypes?: string[];
  monthlyDataQuotaMb?: number;
}

export interface EdgeMeshNode {
  id: string;
  tenant_id: string;
  branch_id: string;
  node_id: string;
  role: 'PRIMARY_GATEWAY' | 'SECONDARY_MESH_PEER' | 'LTE_FAILOVER_HOTSPOT';
  status: MeshNodeStatus;
  ip_address?: string | null;
  local_storage_total_bytes: number;
  local_storage_used_bytes: number;
  local_cache_items_queued: number;
  wan_connection_type: WanConnectionType;
  mesh_peers: Array<{ peerId: string; ip: string; pingMs: number }>;
  anti_jamming_active: boolean;
  last_heartbeat_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface ActiveStreamState {
  cameraId: string;
  branchId?: string;
  currentMode: StreamMode;
  currentFps: number;
  currentBitrateKbps: number;
  currentResolution: string;
  isBurstActive: boolean;
  burstRemainingSeconds: number;
  triggerAlertId?: string;
  triggerAlertType?: string;
  bytesStreamedQuiescent: number;
  bytesStreamedBurst: number;
  unoptimizedBytesHypothetical: number;
  bandwidthSavingsPct: number;
  lastBurstAt?: Date;
}

export interface AntiJammingCacheItem {
  id: string;
  branchId: string;
  cameraId: string;
  type: 'AI_DETECTION_SNAPSHOT' | 'VIDEO_CHUNK' | 'INCIDENT_TELEMETRY' | 'HEALTH_DIAGNOSTIC';
  priority: number; // 100 for high-severity alerts (Intrusion/Helmet), 40 for video chunks
  timestamp: Date;
  payload: Record<string, unknown>;
  sizeBytes: number;
  sha256: string;
  status: 'LOCAL_SPOOLED' | 'SYNCING' | 'SYNCED' | 'FAILED';
}

export interface BandwidthSummaryStats {
  totalMonitoredCameras: number;
  quiescentCamerasCount: number;
  activeBurstCamerasCount: number;
  offlineIsolatedNodesCount: number;
  averageDataSavingsPercentage: number; // e.g. 74.8%
  quiescentDataGbToday: number;
  burstDataGbToday: number;
  totalDataStreamedGbToday: number;
  unoptimizedDataHypotheticalGbToday: number;
  dataSavedGbToday: number;
  estimatedMonthlyCostSavingsInr: number; // calculated at standard ~Rs 20/GB data rate
}

/**
 * Calculates mathematical data savings percentage comparing actual bandwidth
 * against hypothetical unoptimized 1080p continuous streaming (~3500 kbps).
 */
export function calculateBandwidthSavings(
  actualBytes: number,
  unoptimizedBytes: number
): number {
  if (unoptimizedBytes <= 0) return 75.0;
  const ratio = (unoptimizedBytes - actualBytes) / unoptimizedBytes;
  const pct = Math.max(0, Math.min(99.0, ratio * 100));
  return Number(pct.toFixed(1));
}
