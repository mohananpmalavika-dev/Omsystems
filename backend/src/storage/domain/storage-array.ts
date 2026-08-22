export type RaidLevel =
  | "RAID0"
  | "RAID1"
  | "RAID5"
  | "RAID6"
  | "RAID10"
  | "JBOD"
  | "SINGLE"
  | "UNKNOWN";

export type RaidState =
  | "HEALTHY"
  | "DEGRADED"
  | "REBUILDING"
  | "FAILED"
  | "UNKNOWN";

export interface StorageArray {
  id: string;
  recorderId: string;
  branchId: string;
  level: RaidLevel;
  state: RaidState;
  diskIds: string[];
  totalBytes?: number | undefined;
  usableBytes?: number | undefined;
  freeBytes?: number | undefined;
  rebuildProgressPercent?: number | undefined;
  failedDisksCount: number;
  observedAt: Date;
}

export interface RecordingStorageImpact {
  recorderId: string;
  branchId: string;
  affectedDiskIds: string[];
  affectedCameraIds: string[];
  recordingAtRisk: boolean;
  estimatedRemainingRecordingHours?: number | undefined;
  evidenceLossRisk: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  retentionRequirementDays: number;
  currentRetentionDays: number;
  retentionCompliant: boolean;
  evaluatedAt: Date;
}

export interface RecorderStorageHealth {
  recorderId: string;
  branchId: string;
  state: "HEALTHY" | "WARNING" | "CRITICAL" | "FAILED" | "UNKNOWN";
  totalDisks: number;
  healthyDisks: number;
  warningDisks: number;
  criticalDisks: number;
  failedDisks: number;
  missingDisks: number;
  unknownDisks: number;
  totalCapacityBytes: number;
  usedCapacityBytes: number;
  freeCapacityBytes: number;
  overallUsagePercent: number;
  arrays: StorageArray[];
  degradedArrays: number;
  recordingStorageAvailable: boolean;
  predictedFailuresCount: number;
  impact?: RecordingStorageImpact | undefined;
  observedAt: Date;
}
