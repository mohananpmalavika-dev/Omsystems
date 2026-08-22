import type {
  DiskEvidence,
  DiskEvidenceSource,
  DiskHealthState,
  SmartState,
} from "./disk-evidence.js";
import type { RaidState } from "./storage-array.js";

export type StorageRole =
  | "RECORDING"
  | "ARCHIVE"
  | "SPARE"
  | "SYSTEM"
  | "UNKNOWN";

export interface DiskHealthReason {
  code: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  message: string;
  source?: DiskEvidenceSource | undefined;
}

export interface DiskOperationalState {
  hardwareHealth: DiskHealthState;
  capacityHealth: "HEALTHY" | "WARNING" | "CRITICAL" | "UNKNOWN";
  recordingHealth: "ACTIVE" | "DEGRADED" | "STOPPED" | "UNKNOWN";
  arrayHealth: RaidState;
}

export interface DiskMetricTrend {
  metric: string;
  current: number;
  delta1h?: number | undefined;
  delta24h?: number | undefined;
  delta7d?: number | undefined;
  ratePerDay?: number | undefined;
  accelerating?: boolean | undefined;
}

export interface FailurePrediction {
  diskId: string;
  failureProbability: number; // 0.00 - 1.00
  risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  predictedWindowHours?: number | undefined;
  reasons: string[];
  modelVersion: string;
  generatedAt: Date;
}

export interface DiskHealthSnapshot {
  diskId: string;
  serialNumber?: string | undefined;
  model?: string | undefined;
  slot?: number | undefined;
  recorderId: string;
  branchId: string;

  state: DiskHealthState;
  healthScore: number; // 0 - 100

  operationalState: DiskOperationalState;
  storageRole: StorageRole;

  smartStatus: SmartState;
  temperatureC?: number | undefined;
  powerOnHours?: number | undefined;

  reallocatedSectors?: number | undefined;
  pendingSectors?: number | undefined;
  offlineUncorrectableSectors?: number | undefined;

  totalBytes?: number | undefined;
  usedBytes?: number | undefined;
  freeBytes?: number | undefined;
  usagePercent?: number | undefined;

  arrayStatus?: RaidState | undefined;
  arrayId?: string | undefined;

  predictedFailure?: boolean | undefined;
  prediction?: FailurePrediction | undefined;

  trends?: DiskMetricTrend[] | undefined;
  evidence: DiskEvidence[];
  reasons: DiskHealthReason[];

  isStale: boolean;
  evaluatedAt: Date;
}
