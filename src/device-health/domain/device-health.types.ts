/**
 * Device Capability & Evidence-Driven Health Model - Domain Types
 * 
 * Defines formal contracts for device capabilities, evidence observations,
 * configurable health policies, and normalized health snapshots.
 */

export type DeviceCapability =
  | "DEVICE_ONLINE"
  | "CHANNEL_STATUS"
  | "STREAM_STATUS"
  | "RECORDING_STATUS"
  | "RECORDING_SEARCH"
  | "RETENTION_VERIFICATION"
  | "STORAGE_STATUS"
  | "STORAGE_CAPACITY"
  | "SMART_STATUS"
  | "DISK_TEMPERATURE"
  | "DISK_BAD_SECTORS"
  | "DEVICE_TEMPERATURE"
  | "FAN_SPEED"
  | "FIRMWARE_VERSION"
  | "DEVICE_TIME"
  | "NTP_STATUS"
  | "TIME_DRIFT"
  | "CPU_USAGE"
  | "MEMORY_USAGE"
  | "NETWORK_INTERFACE_STATUS";

export type CapabilitySupport =
  | "SUPPORTED"
  | "PARTIAL"
  | "UNSUPPORTED"
  | "UNKNOWN";

export type CapabilityImportance =
  | "REQUIRED"
  | "RECOMMENDED"
  | "OPTIONAL";

export type EvidenceStatus =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "STALE"
  | "ERROR";

export type HealthState =
  | "HEALTHY"
  | "WARNING"
  | "FAILURE"
  | "UNKNOWN"
  | "UNSUPPORTED";

export interface DeviceCapabilityRecord {
  capability: DeviceCapability;
  support: CapabilitySupport;
  importance: CapabilityImportance;
  source: "FINGERPRINT" | "PROBE" | "VENDOR_PROFILE" | "ADMIN_OVERRIDE";
  confidence: number;
  discoveredAt: Date;
  details?: Record<string, unknown> | undefined;
}

export interface DeviceCapabilityProfile {
  deviceId: string;
  manufacturer?: string | undefined;
  model?: string | undefined;
  firmwareVersion?: string | undefined;
  apiFamily?: string | undefined;
  capabilities: DeviceCapabilityRecord[];
  lastProbedAt?: Date | undefined;
}

export interface DeviceEvidence<T = unknown> {
  id?: string | undefined;
  deviceId: string;
  capability: DeviceCapability;
  status: EvidenceStatus;
  value?: T | undefined;
  source:
    | "RECORDER_API"
    | "ONVIF"
    | "RTSP"
    | "SNMP"
    | "EDGE_AGENT"
    | "SMARTCTL"
    | "ACTIVE_PROBE";
  observedAt: Date;
  collectedAt: Date;
  expiresAt?: Date | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  rawReference?: string | undefined;
}

export interface HealthPolicy {
  capability: DeviceCapability;
  importance: CapabilityImportance;
  warningThreshold?: number | undefined;
  failureThreshold?: number | undefined;
  staleAfterSeconds: number;
  unit?: string | undefined;
}

export interface DeviceHealthMetric {
  capability: DeviceCapability;
  capabilitySupport: CapabilitySupport;
  importance: CapabilityImportance;
  healthState: HealthState;
  value?: unknown | undefined;
  unit?: string | undefined;
  message: string;
  source?: string | undefined;
  observedAt?: Date | undefined;
  evidenceAgeSeconds?: number | undefined;
  confidence: number;
}

export interface DeviceHealthSnapshot {
  deviceId: string;
  tenantId: string;
  branchId?: string | undefined;
  branchName?: string | undefined;
  manufacturer?: string | undefined;
  model?: string | undefined;
  firmwareVersion?: string | undefined;
  overallState: HealthState;
  evaluatedAt: Date;
  headlineReasons: string[];
  metrics: DeviceHealthMetric[];
  criticalFailures: number;
  warnings: number;
  unknowns: number;
  unsupporteds: number;
}
