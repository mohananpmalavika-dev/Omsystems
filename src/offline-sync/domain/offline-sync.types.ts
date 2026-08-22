/**
 * Offline Edge Survivability & Store-and-Forward Synchronization Domain Types
 */

export type ConnectivityState = 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'RECONNECTING' | 'SYNCING';

export type SyncBacklogType =
  | 'P1_INCIDENTS'
  | 'RECORDING_METADATA'
  | 'AUDIT_LOGS'
  | 'OPERATIONAL_EVENTS'
  | 'HEALTH_TELEMETRY';

export const BACKLOG_PRIORITIES: Record<SyncBacklogType, number> = {
  P1_INCIDENTS: 100,
  RECORDING_METADATA: 80,
  AUDIT_LOGS: 60,
  OPERATIONAL_EVENTS: 40,
  HEALTH_TELEMETRY: 20,
};

export interface QueuedBacklogItem {
  id: string;
  branchId: string;
  type: SyncBacklogType;
  priority: number;
  payload: Record<string, unknown>;
  timestamp: string;
  checksum: string;
  retryCount: number;
  status: 'QUEUED' | 'SYNCING' | 'SYNCED' | 'FAILED';
  errorMessage?: string;
}

export interface BranchLocalState {
  branchId: string;
  branchName: string;
  connectivityState: ConnectivityState;
  lastCloudHeartbeatAt: number;
  localRecordingActive: boolean;
  localHealthMonitorActive: boolean;
  activeRecordingCamerasCount: number;
  totalQueuedItems: number;
  backlogByType: Record<SyncBacklogType, number>;
  syncProgressPct: number;
}

export interface SyncBatchPayload {
  batchId: string;
  branchId: string;
  generatedAt: string;
  itemCount: number;
  items: QueuedBacklogItem[];
  checksum: string;
}

export interface SyncBatchAck {
  batchId: string;
  branchId: string;
  processedCount: number;
  duplicateCount: number;
  failedCount: number;
  healedRecordingGapsCount: number;
  acknowledgedAt: string;
  status: 'SUCCESS' | 'PARTIAL' | 'ERROR';
}
