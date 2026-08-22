import type {
  KeyframeIndexItem,
  RecordingSegment,
  RecordingSegmentHealth,
  RecordingSegmentLifecycleState,
  DbRecordingKeyframe,
  DbRecordingSegmentLocation,
} from "../domain/models.js";

export type ArchiveState =
  | "ONLINE"
  | "NEARLINE"
  | "ARCHIVED"
  | "RESTORING"
  | "OFFLINE"
  | "DELETED"
  | "LEGAL_HOLD";

export type StorageTier = "HOT" | "WARM" | "COLD" | "ARCHIVE";

export interface KeyframeEntry {
  timestamp: Date;
  pts?: number;
  dts?: number;
  byteOffset?: number;
}

export interface RegisterRecordingSegmentInput {
  id?: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  streamId?: string;
  startTime: Date;
  endTime: Date;
  durationMs?: number;
  deviceStartTime?: Date;
  deviceEndTime?: Date;
  clockOffsetMs?: number;
  clockUncertaintyMs?: number;
  codec?: string;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number;
  storageNodeId: string;
  storageTier?: StorageTier;
  storageUri: string;
  fileSize: number;
  sha256?: string;
  archiveState?: ArchiveState;
  firstPts?: number;
  lastPts?: number;
  firstDts?: number;
  lastDts?: number;
  timeBase?: string;
  startsWithKeyframe?: boolean;
  health?: RecordingSegmentHealth;
  segmentState?: RecordingSegmentLifecycleState;
  manifestJson?: Record<string, unknown>;
  keyframes?: KeyframeEntry[];
}

export interface RecordingSearchRequest {
  tenantId: string;
  cameraIds: string[];
  from: Date;
  to: Date;
  includeKeyframes?: boolean;
  includeGaps?: boolean;
  storageStates?: ArchiveState[];
  minDurationMs?: number;
}

export interface RecordingGapItem {
  from: Date;
  to: Date;
  durationMs: number;
  reason?: string;
}

export interface StorageDescriptor {
  nodeId?: string;
  tier: StorageTier;
  uri: string;
  available: boolean;
  localPath?: string;
  streamUrl?: string;
}

export interface ArchiveDescriptor {
  state: ArchiveState;
  restoreRequired: boolean;
}

export interface RecordingSegmentResult {
  segmentId: string;
  cameraId: string;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  fileSize: number;
  sha256?: string;
  codec?: string;
  width?: number;
  height?: number;
  fps?: number;
  storage: StorageDescriptor;
  archive: ArchiveDescriptor;
  health: RecordingSegmentHealth;
  keyframes?: KeyframeEntry[];
}

export interface CameraRecordingResult {
  cameraId: string;
  segments: RecordingSegmentResult[];
  gaps: RecordingGapItem[];
  coverageMs: number;
  requestedMs: number;
  coveragePercent: number;
}

export interface RecordingSearchResult {
  from: Date;
  to: Date;
  cameras: CameraRecordingResult[];
}

export interface KeyframeLookupResult {
  segmentId: string;
  cameraId: string;
  targetTime: Date;
  nearestKeyframeTime: Date;
  pts?: number;
  dts?: number;
  byteOffset?: number;
  storageUri: string;
  timeDifferenceMs: number;
}

export interface RecordingRangeResult {
  cameraId: string;
  firstRecordedTime?: Date;
  lastRecordedTime?: Date;
  totalSegments: number;
  totalSizeBytes: number;
  archiveStates: Record<ArchiveState, number>;
}

export interface ReconciliationResultItem {
  segmentId: string;
  storageUri: string;
  status: "OK" | "INDEX_REBUILT" | "MARKED_MISSING" | "MARKED_CORRUPT";
  message: string;
}

export interface SegmentReconciliationSummary {
  scannedCount: number;
  rebuiltCount: number;
  missingCount: number;
  corruptCount: number;
  okCount: number;
  details: ReconciliationResultItem[];
}
