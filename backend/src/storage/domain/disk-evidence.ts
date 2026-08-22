/**
 * First-Class Disk Evidence and SMART Telemetry Data Models
 */

export type DiskHealthState =
  | "HEALTHY"
  | "WARNING"
  | "CRITICAL"
  | "FAILED"
  | "MISSING"
  | "UNKNOWN";

export type SmartState =
  | "PASSED"
  | "FAILED"
  | "UNAVAILABLE"
  | "UNKNOWN";

export type DiskEvidenceSource =
  | "RECORDER_API"
  | "SMARTCTL"
  | "SNMP"
  | "EDGE_AGENT";

export type InterfaceType =
  | "SATA"
  | "SAS"
  | "NVME"
  | "USB"
  | "UNKNOWN";

export interface SmartAttribute {
  diskId: string;
  attributeId?: number | undefined;
  name: string;
  normalizedValue?: number | undefined;
  worstValue?: number | undefined;
  threshold?: number | undefined;
  rawValue?: number | string | undefined;
  whenFailed?: string | undefined;
  status?: "OK" | "WARNING" | "CRITICAL" | "UNKNOWN" | undefined;
  observedAt: Date;
}

export interface DiskEvidence {
  diskId: string;
  recorderId: string;
  branchId: string;
  tenantId?: string | undefined;

  slot?: number | undefined;
  devicePath?: string | undefined;

  model?: string | undefined;
  serialNumber?: string | undefined;
  firmwareVersion?: string | undefined;
  interfaceType?: InterfaceType | undefined;

  // Capacity metrics
  totalBytes?: number | undefined;
  usedBytes?: number | undefined;
  freeBytes?: number | undefined;
  usagePercent?: number | undefined;

  // Evaluated disk hardware state
  state: DiskHealthState;
  recorderReportedState?: string | undefined;

  // SMART overall & raw status
  smartSupported?: boolean | undefined;
  smartEnabled?: boolean | undefined;
  smartStatus?: SmartState | undefined;
  rawSmartStatus?: string | undefined;

  // Thermal & operating counters
  temperatureC?: number | undefined;
  powerOnHours?: number | undefined;
  powerCycleCount?: number | undefined;

  // Critical sector counters
  reallocatedSectors?: number | undefined;
  pendingSectors?: number | undefined;
  offlineUncorrectableSectors?: number | undefined;

  // Bus & transmission errors
  readErrors?: number | undefined;
  writeErrors?: number | undefined;
  seekErrors?: number | undefined;
  crcErrors?: number | undefined;

  // SSD / NVMe specific telemetry
  percentageUsed?: number | undefined;
  wearLevelingCount?: number | undefined;
  availableSparePercent?: number | undefined;

  // Individual SMART attributes
  attributes?: SmartAttribute[] | undefined;

  // Provenance & timestamping
  source: DiskEvidenceSource;
  confidence: number; // 0.0 - 1.0
  observedAt: Date;
  validUntil?: Date | undefined;
}

export interface RawDiskEvidence {
  collector: string;
  source: DiskEvidenceSource;
  payload: unknown;
  collectedAt: Date;
  parserVersion: string;
}
