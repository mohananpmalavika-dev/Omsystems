/**
 * Guaranteed Alert Evidence & Forensic Verification Domain Contracts
 */

export type EvidenceStatus =
  | "QUEUED"
  | "WAITING_FOR_POST_EVENT"
  | "CAPTURING"
  | "VERIFYING"
  | "READY"
  | "PARTIAL"
  | "FAILED";

export type EvidenceAssetType = "SNAPSHOT" | "VIDEO_CLIP" | "MANIFEST";

export type EvidenceCaptureSource =
  | "RECORDER_ARCHIVE"
  | "EDGE_BUFFER"
  | "CAMERA_PLAYBACK"
  | "LIVE_FALLBACK";

export type EvidenceFailureCode =
  | "CAMERA_OFFLINE"
  | "RECORDER_OFFLINE"
  | "RECORDING_NOT_FOUND"
  | "ARCHIVE_SEARCH_FAILED"
  | "EXPORT_TIMEOUT"
  | "EDGE_GATEWAY_OFFLINE"
  | "BUFFER_NOT_AVAILABLE"
  | "INSUFFICIENT_PRE_EVENT"
  | "INSUFFICIENT_POST_EVENT"
  | "VIDEO_CORRUPTED"
  | "HASH_FAILED"
  | "STORAGE_UPLOAD_FAILED"
  | "STORAGE_VERIFY_FAILED"
  | "UNSUPPORTED_CAPABILITY"
  | "TIME_DRIFT_TOO_LARGE";

export interface EvidenceAsset {
  id: string;
  type: EvidenceAssetType;
  storageKey: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  capturedAt: Date;
  durationSeconds?: number | undefined;
  verified: boolean;
  assetType: "ORIGINAL" | "DERIVED";
}

export interface AlertEvidenceRecord {
  id: string;
  alertId: string;
  tenantId: string;
  branchId: string;
  cameraId: string;

  status: EvidenceStatus;

  snapshot?: EvidenceAsset | undefined;
  videoClip?: EvidenceAsset | undefined;
  manifest?: EvidenceAsset | undefined;
  manifestHash?: string | undefined;

  requestedStartAt: Date;
  requestedEndAt: Date;
  actualStartAt?: Date | undefined;
  actualEndAt?: Date | undefined;
  detectedAt: Date;

  preEventSeconds: number;
  postEventSeconds: number;

  captureSource?: EvidenceCaptureSource | undefined;
  failureCode?: EvidenceFailureCode | undefined;
  failureReason?: string | undefined;

  attemptCount: number;
  maxAttempts: number;

  createdAt: Date;
  completedAt?: Date | undefined;
  latencyMs?: number | undefined;
}

export interface EvidencePolicy {
  alertType: string;
  severity: "P1" | "P2" | "P3" | "P4";
  snapshotRequired: boolean;
  preEventSeconds: number;
  postEventSeconds: number;
  minimumClipSeconds: number;
  retryCount: number;
  retentionDays: number;
}

export interface EvidenceManifest {
  evidenceId: string;
  alertId: string;
  branchId: string;
  cameraId: string;
  detectedAt: string;
  requestedWindow: {
    start: string;
    end: string;
  };
  actualWindow: {
    start: string;
    end: string;
  };
  snapshot?: {
    sha256: string;
    sizeBytes: number;
    url: string;
  } | undefined;
  video?: {
    sha256: string;
    durationSeconds: number;
    sizeBytes: number;
    url: string;
  } | undefined;
  source: EvidenceCaptureSource;
  manifestSha256: string;
  generatedAt: string;
}

export interface EvidenceSlaSummary {
  totalRequested: number;
  completedReady: number;
  completedPartial: number;
  failedCount: number;
  readyPercentage: number;
  medianSnapshotLatencyMs: number;
  p95SnapshotLatencyMs: number;
  medianCompleteEvidenceLatencyMs: number;
  p95CompleteEvidenceLatencyMs: number;
  failureBreakdown: Record<string, number>;
}
