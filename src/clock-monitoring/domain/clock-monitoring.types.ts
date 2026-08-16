/**
 * Clock & Time-Drift Monitoring Domain Contracts
 */

export type ClockHealthState =
  | "SYNCHRONIZED"
  | "WARNING"
  | "CRITICAL"
  | "UNKNOWN"
  | "UNREACHABLE";

export type ClockSource =
  | "ONVIF"
  | "DAHUA_CGI"
  | "HIKVISION_ISAPI"
  | "SNMP"
  | "EDGE_SYSTEM";

export interface DeviceTimeSample {
  startTimestampMs: number;
  deviceTimestamp: Date;
  endTimestampMs: number;
  roundTripTimeMs: number;
}

export interface ClockEvidence {
  deviceId: string;
  deviceName: string;
  deviceType: "CAMERA" | "RECORDER" | "GATEWAY";
  branchId: string;

  deviceTime: Date;
  referenceTime: Date;
  roundTripTimeMs: number;

  signedOffsetSeconds: number;
  absoluteOffsetSeconds: number;
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
}

export interface BranchClockHealth {
  branchId: string;
  branchName: string;
  overallState: ClockHealthState;

  gateway?: ClockEvidence | undefined;
  recorders: ClockEvidence[];
  cameras: ClockEvidence[];
  cameraRecorderComparisons: CameraRecorderClockComparison[];

  maxDriftSeconds: number;
  criticalDevicesCount: number;
  warningDevicesCount: number;
  synchronizedDevicesCount: number;
  unapprovedNtpCount: number;
  timezoneMismatchCount: number;

  lastEvaluatedAt: Date;
}

export interface FleetClockSummary {
  totalBranches: number;
  compliantBranches: number;
  warningBranches: number;
  criticalBranches: number;

  totalDevices: number;
  synchronizedDevices: number;
  warningDevices: number;
  criticalDevices: number;
  unapprovedNtpDevices: number;
  timezoneMismatchDevices: number;

  worstDriftDevices: Array<{
    deviceId: string;
    deviceName: string;
    branchId: string;
    offsetSeconds: number;
    healthState: ClockHealthState;
  }>;
}

export interface ClockSyncAuditEntry {
  id: string;
  deviceId: string;
  branchId: string;
  action: "NTP_TRIGGER" | "MANUAL_SET_TIME" | "AUTO_CORRECT";
  initiatedByUserId: string;
  previousOffsetSeconds: number;
  newOffsetSeconds: number;
  reason: string;
  timestamp: Date;
}
