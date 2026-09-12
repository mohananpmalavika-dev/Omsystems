/**
 * Types and Interfaces for Cold Cloud Archive Export (recording.archive)
 * Supports long-term automated archival of marked incident video to AWS S3 / Glacier.
 */

export type ArchiveStorageClass =
  | "GLACIER"
  | "DEEP_ARCHIVE"
  | "GLACIER_IR"
  | "INTELLIGENT_TIERING";

export type ArchiveJobStatus =
  | "PENDING"
  | "EXPORTING"
  | "ARCHIVED"
  | "FAILED"
  | "CANCELLED";

export type GlacierRestoreTier = "Expedited" | "Standard" | "Bulk";

export type RestoreStatus =
  | "NONE"
  | "RESTORE_REQUESTED"
  | "RESTORING"
  | "RESTORED"
  | "EXPIRED";

export interface ColdCloudArchiveJob {
  id: string;
  tenantId: string;
  incidentId: string;
  incidentNumber: string;
  cameraId: string;
  branchId?: string;
  evidencePackageId?: string;
  clipId?: string;
  storageTier: ArchiveStorageClass;
  s3Bucket: string;
  s3Key: string;
  s3Region: string;
  s3Endpoint?: string;
  fileSizeBytes: number;
  checksumSha256: string;
  encryptionKmsKeyId?: string;
  archiveStatus: ArchiveJobStatus;
  restoreStatus: RestoreStatus;
  restoreRequestedAt?: string;
  restoreCompletedAt?: string;
  restoreExpiresAt?: string;
  restoreTier?: GlacierRestoreTier;
  attempts: number;
  maxAttempts: number;
  errorMessage?: string;
  metadata: Record<string, any>;
  createdBy?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ArchivePolicy {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  enabled: boolean;
  targetStorageClass: ArchiveStorageClass;
  targetBucket: string;
  targetPrefix: string;
  triggerCondition: {
    severities?: string[];
    incidentStatuses?: string[];
    ageDays?: number;
    markedForArchive?: boolean;
    tags?: string[];
  };
  encryptionKmsKeyId?: string;
  retentionDays: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ArchiveAuditEntry {
  id: string;
  jobId?: string;
  tenantId: string;
  incidentId?: string;
  incidentNumber?: string;
  action:
    | "ARCHIVE_QUEUED"
    | "UPLOAD_STARTED"
    | "UPLOAD_COMPLETED"
    | "TIERED_TO_GLACIER"
    | "INTEGRITY_VERIFIED"
    | "RESTORE_REQUESTED"
    | "RESTORE_COMPLETED"
    | "RESTORE_EXPIRED"
    | "EXPORT_FAILED";
  operatorId?: string;
  checksumSha256?: string;
  s3Uri?: string;
  storageClass?: string;
  details: Record<string, any>;
  timestamp: string;
}

export interface ArchiveStatistics {
  totalJobs: number;
  archivedJobs: number;
  pendingJobs: number;
  failedJobs: number;
  totalBytesArchived: number;
  totalBytesGlacier: number;
  totalBytesDeepArchive: number;
  activeRestoresCount: number;
  completedRestoresCount: number;
  estimatedMonthlyHotCostUsd: number;
  estimatedMonthlyColdCostUsd: number;
  estimatedMonthlySavingsUsd: number;
  savingsPercentage: number;
}

export interface S3GlacierClientConfig {
  region?: string;
  endpoint?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
  kmsKeyId?: string;
  serverSideEncryption?: "AES256" | "aws:kms";
}

export interface S3GlacierUploadResult {
  bucket: string;
  key: string;
  uri: string;
  eTag?: string;
  checksumSha256: string;
  bytesWritten: number;
  storageClass: ArchiveStorageClass;
  versionId?: string;
}

export interface RestoreObjectResult {
  status: "ACCEPTED" | "ALREADY_RESTORED" | "RESTORING";
  tier: GlacierRestoreTier;
  validityDays: number;
  estimatedReadyMinutes: number;
  expiryDate?: Date;
}
