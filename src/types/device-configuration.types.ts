/**
 * Centralized Device Configuration Types
 * 
 * Standardized contracts for DVR/NVR and IP Camera Configuration Center.
 * Enforces strict typing for capabilities, desired vs actual state,
 * read-after-write verification, and rollback snapshots.
 */

export type VideoCodec = "H264" | "H265" | "MJPEG" | "MPEG4";

export interface Resolution {
  width: number;
  height: number;
}

export interface ValueRange<T = number> {
  min: T;
  max: T;
  step?: T;
}

// ---------------------------------------------------------------------------
// Camera Video Configuration & Introspection Options
// ---------------------------------------------------------------------------

export interface ChannelVideoConfig {
  codec: VideoCodec;
  resolution: Resolution;
  fps: number;
  frameRate?: number;
  bitrateKbps: number;
  quality?: number;
  govLength?: number;
  h264Profile?: "Baseline" | "Main" | "Extended" | "High";
  bitrateControl?: "CBR" | "VBR";
  streamProfileToken?: string;
}

export interface ChannelVideoOptions {
  supportedCodecs: VideoCodec[];
  supportedResolutions: Resolution[];
  fpsRange: ValueRange<number>;
  bitrateRangeKbps: ValueRange<number>;
  govLengthRange?: ValueRange<number>;
  qualityRange?: ValueRange<number>;
  profilesSupported?: Array<"Baseline" | "Main" | "Extended" | "High">;
}

// ---------------------------------------------------------------------------
// Camera Imaging Configuration & Introspection Options
// ---------------------------------------------------------------------------

export interface DeviceImageConfig {
  brightness?: number; // 0.0 - 100.0
  contrast?: number; // 0.0 - 100.0
  colorSaturation?: number; // 0.0 - 100.0
  sharpness?: number; // 0.0 - 100.0
  irCutFilter?: "ON" | "OFF" | "AUTO";
  exposure?: {
    mode?: "AUTO" | "MANUAL";
    exposureTime?: number;
    gain?: number;
    iris?: number;
  };
  focus?: {
    autoFocusMode?: "AUTO" | "MANUAL";
    defaultSpeed?: number;
  };
  wideDynamicRange?: {
    mode?: "OFF" | "ON";
    level?: number;
  };
  whiteBalance?: {
    mode?: "AUTO" | "MANUAL";
    crGain?: number;
    cbGain?: number;
  };
}

export interface DeviceImageOptions {
  brightnessRange?: ValueRange<number>;
  contrastRange?: ValueRange<number>;
  colorSaturationRange?: ValueRange<number>;
  sharpnessRange?: ValueRange<number>;
  exposureModes?: Array<"AUTO" | "MANUAL">;
  exposureTimeRange?: ValueRange<number>;
  gainRange?: ValueRange<number>;
  irisRange?: ValueRange<number>;
  wdrSupported?: boolean;
  wdrLevelRange?: ValueRange<number>;
  whiteBalanceModes?: Array<"AUTO" | "MANUAL">;
  irCutFilterModes?: Array<"ON" | "OFF" | "AUTO">;
}

// ---------------------------------------------------------------------------
// Time & Clock Configuration
// ---------------------------------------------------------------------------

export interface DeviceTimeConfig {
  dateTimeType: "Manual" | "NTP";
  timeZone?: string;
  ntpServer?: string;
  utcDateTime?: string; // ISO 8601 string
  daylightSavings?: boolean;
}

export interface DeviceTimeStatus {
  deviceTime: Date;
  serverTime: Date;
  offsetSeconds: number;
  ntpActive: boolean;
  ntpServer?: string;
  timeZone?: string;
  status: "SYNCHRONIZED" | "DRIFT_WARNING" | "DRIFT_CRITICAL" | "UNKNOWN";
}

// ---------------------------------------------------------------------------
// Network Configuration (Protected by Feature Flag)
// ---------------------------------------------------------------------------

export interface DeviceNetworkConfig {
  dhcpEnabled: boolean;
  ipAddress: string;
  subnetMask: string;
  gateway: string;
  dnsServers?: string[];
  httpPort?: number;
  httpsPort?: number;
  rtspPort?: number;
  onvifPort?: number;
}

// ---------------------------------------------------------------------------
// Recorder-Side Internal Recording Schedule & Storage
// ---------------------------------------------------------------------------

export type DayOfWeek =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

export type RecordingPeriodType = "CONTINUOUS" | "MOTION" | "ALARM" | "OFF";

export interface SchedulePeriod {
  startHour: number; // 0 - 23
  startMinute: number; // 0 - 59
  endHour: number; // 0 - 24
  endMinute: number; // 0 - 59
  type: RecordingPeriodType;
}

export interface DailySchedule {
  day: DayOfWeek;
  periods: SchedulePeriod[];
}

export interface RecordingSchedule {
  channelNumber: number;
  enabled: boolean;
  schedule: DailySchedule[];
  preRecordSeconds?: number;
  postRecordSeconds?: number;
  audioRecording?: boolean;
  streamType?: "main" | "sub";
}

export interface RecorderStorageInfo {
  diskIndex: number;
  name: string;
  status: "OK" | "WARNING" | "FAILED" | "READ_ONLY" | "UNFORMATTED" | "UNKNOWN";
  capacityBytes: number;
  usedBytes: number;
  freeBytes: number;
  smartHealth?: "PASSED" | "FAILED" | "UNKNOWN";
  temperatureCelsius?: number;
  readOnly: boolean;
}

// ---------------------------------------------------------------------------
// Configuration Job Lifecycle, Verification & Rollback
// ---------------------------------------------------------------------------

export type ConfigurationJobState =
  | "DRAFT"
  | "VALIDATING"
  | "READY"
  | "QUEUED"
  | "APPLYING"
  | "APPLIED"
  | "VERIFYING"
  | "VERIFIED"
  | "FAILED"
  | "ROLLBACK_STARTED"
  | "ROLLED_BACK"
  | "ROLLBACK_FAILED";

export interface RollbackSnapshot {
  snapshotId: string;
  deviceId: string;
  createdAt: string;
  videoConfig?: ChannelVideoConfig;
  imageConfig?: DeviceImageConfig;
  timeConfig?: DeviceTimeConfig;
  networkConfig?: DeviceNetworkConfig;
  recordingSchedule?: RecordingSchedule;
}

export interface ConfigurationDriftItem {
  path?: string;
  desired?: unknown;
  actual?: unknown;
  differenceSummary?: string;
  section?: string;
  field?: string;
  expectedValue?: unknown;
  actualValue?: unknown;
}

export interface ConfigurationVerificationResult {
  verified: boolean;
  status: "VERIFIED" | "CONFIGURATION_DRIFT" | "VERIFICATION_FAILED";
  desiredConfig: Record<string, unknown>;
  actualConfig: Record<string, unknown>;
  drifts: ConfigurationDriftItem[];
  verifiedAt: string;
  error?: string;
}

export interface ConfigurationApplyResult {
  success: boolean;
  jobId: string;
  state: ConfigurationJobState;
  deviceId: string;
  previousSnapshotId?: string;
  verification: ConfigurationVerificationResult;
  message: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Phase 9: Golden Configuration Templates & Fleet Compliance
// ---------------------------------------------------------------------------

export type TemplateTargetClassification =
  | "branch_entrance"
  | "cash_counter"
  | "strongroom_vault"
  | "atm_vestibule"
  | "perimeter"
  | "universal";

export interface GoldenTemplateSettings {
  videoConfig?: Partial<ChannelVideoConfig>;
  imageConfig?: Partial<DeviceImageConfig>;
  timeConfig?: Partial<DeviceTimeConfig>;
  networkConfig?: Partial<DeviceNetworkConfig>;
  recordingSchedule?: Partial<RecordingSchedule>;
}

export interface DeviceGoldenTemplate {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  targetType: "camera" | "recorder";
  classification: TemplateTargetClassification;
  version: number;
  status: "draft" | "published" | "deprecated";
  settings: GoldenTemplateSettings;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceComplianceDrift {
  deviceId: string;
  deviceName: string;
  templateId: string;
  templateName: string;
  classification: TemplateTargetClassification;
  drifts: ConfigurationDriftItem[];
  status: "compliant" | "drifted" | "unsupported";
  lastEvaluatedAt: string;
}

export interface FleetComplianceReport {
  tenantId: string;
  overallPercentage: number;
  totalDevicesEvaluated: number;
  compliantCount: number;
  driftedCount: number;
  unassignedCount: number;
  byClassification: Record<string, { total: number; compliant: number; percentage: number }>;
  drifts: DeviceComplianceDrift[];
  generatedAt: string;
}

export interface GoldenTemplateApplyRequest {
  scope: "single" | "branch" | "classification" | "fleet";
  deviceId?: string;
  branchId?: string;
  classification?: TemplateTargetClassification;
}

