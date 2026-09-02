/**
 * Canonical Storage Types for Sentinel Grid
 * 
 * Provides authoritative storage contracts across recording engines, retention
 * services, evidence pipelines, and control APIs.
 */

export type StorageBackendKind = "FILESYSTEM" | "OBJECT_STORE";

export type StorageType = "local-disk" | "nfs" | "smb" | "san" | "s3" | "cloud-archive";

export type RecordingStorageTier = "hot" | "warm" | "cold" | "archive";

export type StorageStatus = "healthy" | "warning" | "critical" | "degraded" | "offline" | "recovering";

export type StorageLocator =
  | {
      kind: "FILESYSTEM";
      path: string;
    }
  | {
      kind: "S3";
      bucket: string;
      key: string;
      versionId?: string;
    };

export type StorageCapacity =
  | {
      type: "FIXED";
      totalBytes: number;
      usedBytes: number;
      availableBytes: number;
      usedPercent: number;
    }
  | {
      type: "ELASTIC";
      totalBytes: null;
      usedBytes: number | null;
      availableBytes: null;
    };

export interface StorageCapacityPolicy {
  warningPercent: number; // e.g. 80
  criticalPercent: number; // e.g. 90
  stopWritePercent: number; // e.g. 95
  reserveBytes: number; // e.g. 5GB
  minimumFreeBytes: number; // e.g. 1GB
}

export const DEFAULT_STORAGE_CAPACITY_POLICY: StorageCapacityPolicy = {
  warningPercent: 80,
  criticalPercent: 90,
  stopWritePercent: 95,
  reserveBytes: 5 * 1024 * 1024 * 1024, // 5GB
  minimumFreeBytes: 1 * 1024 * 1024 * 1024, // 1GB
};

export type MetricsSource = "FILESYSTEM" | "CLOUDWATCH" | "OBJECT_LISTING" | "PROVIDER_API";
export type MetricsFreshness = "REALTIME" | "DELAYED" | "ESTIMATED";

export interface StorageProbeResult {
  status: "passed" | "failed";
  latencyMs: number;
  bytesWritten: number;
  checksum: string;
  error?: string;
  timestamp: string;
}

export interface StorageMetrics {
  storageNodeId: string;
  storageType: StorageType;
  backendKind: StorageBackendKind;
  status: StorageStatus;
  capacity: StorageCapacity;
  mountPathOrLocation: string;
  supportedTiers: RecordingStorageTier[];
  supportedProtocols: string[];
  metricsSource: MetricsSource;
  metricsFreshness: MetricsFreshness;
  metricsObservedAt: string;
  writeMbps?: number;
  readMbps?: number;
  latencyMs?: number;
  lastWriteProbe?: StorageProbeResult;
  smartStatus?: "passed" | "failed" | "unknown";
  raidStatus?: "healthy" | "degraded" | "rebuilding" | "failed" | "unknown";
  multipathStatus?: "healthy" | "degraded" | "failed" | "unknown";
}

export interface StorageHealth {
  storageNodeId: string;
  storageType: StorageType;
  status: StorageStatus;
  isWritable: boolean;
  isReadable: boolean;
  consecutiveFailures: number;
  lastSuccessfulWrite?: string;
  lastSuccessfulProbe?: string;
  lastError?: string;
  checkedAt: string;
}

export interface StorageWriteRequest {
  recordingId: string;
  segmentId: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  sourcePath: string; // Local finalized staging path
  expectedSizeBytes: number;
  expectedSha256: string;
  startedAt: Date;
  endedAt: Date;
  contentType: string;
  legalHold?: boolean;
  storageTier?: RecordingStorageTier;
}

export interface StorageWriteResult {
  status: "COMMITTED" | "FAILED" | "RETRY_PENDING";
  storageNodeId: string;
  locator?: StorageLocator;
  bytesWritten: number;
  sha256: string | null;
  verified: boolean;
  committedAt?: string;
  errorCode?: string;
  error?: string;
}

export interface StorageVerificationResult {
  valid: boolean;
  exists: boolean;
  sizeBytes?: number;
  sha256?: string;
  expectedSha256?: string;
  matchesExpected: boolean;
  verifiedAt: string;
  error?: string;
}

export type ArchiveState =
  | "ONLINE"
  | "ARCHIVING"
  | "ARCHIVED"
  | "RESTORE_REQUESTED"
  | "RESTORING"
  | "RESTORED"
  | "RESTORE_FAILED";

export type ReplicationState =
  | "LOCAL_ONLY"
  | "REPLICATION_PENDING"
  | "REPLICATING"
  | "REPLICATED"
  | "REPLICATION_FAILED";

export type StorageState =
  | "ALLOCATED"
  | "WRITING"
  | "FINALIZING"
  | "VERIFYING"
  | "COMMITTED"
  | "RETRY_PENDING"
  | "ARCHIVED"
  | "CORRUPT"
  | "MISSING"
  | "DELETED"
  | "QUARANTINED";

export interface CanonicalRecordingIndexRecord {
  segmentId: string;
  recordingId: string;
  cameraId: string;
  tenantId: string;
  branchId: string;
  startTimestamp: string;
  endTimestamp: string;
  storageNodeId: string;
  storageBackendType: StorageType;
  storageLocator: StorageLocator;
  sizeBytes: number;
  sha256: string;
  storageState: StorageState;
  archiveState?: ArchiveState;
  replicationState?: ReplicationState;
  legalHold: boolean;
  legalHoldId?: string;
  encryption?: {
    type: string;
    keyId?: string;
    provider?: string;
  };
  createdAt: string;
  committedAt?: string;
  verifiedAt?: string;
  deletedAt?: string;
}
