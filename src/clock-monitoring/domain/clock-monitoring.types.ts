/**
 * Clock & Time-Drift Monitoring Domain Contracts
 */

export type ClockHealthState =
  | "HEALTHY"
  | "WARNING"
  | "CRITICAL"
  | "SYNCHRONIZED"
  | "UNKNOWN"
  | "UNREACHABLE";

export type ClockSource =
  | "ONVIF"
  | "DAHUA_CGI"
  | "HIKVISION_ISAPI"
  | "SNMP"
  | "EDGE_SYSTEM"
  | "NTP_INTERNAL";

export interface DeviceTimeSample {
  startTimestampMs: number;
  deviceTimestamp: Date;
  endTimestampMs: number;
  roundTripTimeMs: number;
}

export interface ClockEvidence {
  deviceId: string;
  deviceName: string;
  deviceType: "CAMERA" | "RECORDER" | "GATEWAY" | "HO_TIME_SERVER";
  branchId: string;

  deviceTime: Date;
  referenceTime: Date;
  roundTripTimeMs: number;

  signedOffsetSeconds: number;
  absoluteOffsetSeconds: number;
  jitterMs?: number;
  driftRateSecondsPerHour?: number | undefined;

  ntpServer?: string | undefined;
  ntpSynchronized: boolean;
  ntpWhitelisted: boolean;
  lastSyncAt?: Date | undefined;

  configuredTimezone?: string | undefined;
  timezoneOffsetMinutes?: number | undefined;
  timezoneMismatch: boolean;

  healthState: ClockHealthState;
  source: ClockSource;
  observedAt: Date;
}

export interface CameraRecorderClockComparison {
  cameraId: string;
  cameraName: string;
  recorderId: string;
  cameraTime: Date;
  recorderTime: Date;
  relativeOffsetSeconds: number;
  healthState: ClockHealthState;
}

export interface BranchClockHealth {
  branchId: string;
  gatewayTime?: Date;
  recorderTime?: Date;
  hoTime?: Date;
  maxOffsetSeconds: number;
  averageJitterMs: number;
  overallHealth: ClockHealthState;
  devices: ClockEvidence[];
  comparisons: CameraRecorderClockComparison[];
  evaluatedAt: Date;
}

export interface EvidenceClockManifest {
  evidenceId: string;
  branchId: string;
  cameraId: string;
  captureTimestamp: string;
  hoReferenceTime: string;
  gatewayTime: string;
  nvrTime: string;
  cameraTime: string;
  observedOffsetSeconds: number;
  jitterMs: number;
  ntpSource: string;
  clockHealthStatus: "HEALTHY" | "WARNING" | "CRITICAL";
  forensicTimestampConfidence: "HIGH" | "MEDIUM" | "DEGRADED";
}

export interface FleetClockSummary {
  totalBranches: number;
  healthyBranches: number;
  warningBranches: number;
  criticalBranches: number;
  averageOffsetSeconds: number;
  maxDriftBranchId?: string;
  lastSyncAt: Date;
}

export interface ClockSyncAuditEntry {
  auditId: string;
  deviceId: string;
  branchId: string;
  previousOffset: number;
  newOffset: number;
  actionTaken: string;
  timestamp: Date;
}
