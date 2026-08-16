/**
 * Daily Surveillance Health Report - Domain Types
 * 
 * Canonical data contracts for the daily executive surveillance health report,
 * covering 10 major operational dimensions, exception prioritization,
 * data quality freshness, and auditable snapshots.
 */

export type HealthState =
  | "HEALTHY"
  | "WARNING"
  | "CRITICAL"
  | "OFFLINE"
  | "UNKNOWN";

export interface DataQualitySummary {
  totalResources: number;
  freshTelemetry: number;
  staleTelemetry: number;
  unavailableTelemetry: number;
  unknownState: number;
  completenessPercent: number;
  oldestObservationAt?: Date | undefined;
}

export interface ExecutiveSummary {
  totalBranches: number;
  healthyBranches: number;
  warningBranches: number;
  criticalBranches: number;
  offlineBranches: number;
  unknownBranches: number;
  branchAvailabilityPercent: number;

  totalRecorders: number;
  onlineRecorders: number;
  degradedRecorders: number;
  offlineRecorders: number;

  totalCameras: number;
  onlineCameras: number;
  unavailableCameras: number;
  unknownCameras: number;
  cameraAvailabilityPercent: number;

  totalDisks: number;
  healthyDisks: number;
  warningDisks: number;
  failedDisks: number;
  missingDisks: number;

  recordingFailures: number;
  retentionViolations: number;
  internetOutages: number;

  p1Alerts: number;
  p2Alerts: number;
  unacknowledgedP1: number;
  unacknowledgedP2: number;
  p1SlaBreaches: number;

  actionRequiredCount: number;
  dataQuality: DataQualitySummary;
}

export type ExceptionType =
  | "BRANCH_OFFLINE"
  | "RECORDER_OFFLINE"
  | "CAMERA_OFFLINE"
  | "CAMERA_LOW_AVAILABILITY"
  | "HDD_WARNING"
  | "HDD_FAILED"
  | "RECORDING_FAILURE"
  | "RETENTION_VIOLATION"
  | "INTERNET_OUTAGE"
  | "P1_UNACKNOWLEDGED"
  | "P1_SLA_BREACH"
  | "TELEMETRY_UNKNOWN";

export interface SurveillanceException {
  id: string;
  branchId: string;
  branchName: string;
  type: ExceptionType;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  resourceType: "BRANCH" | "RECORDER" | "CAMERA" | "DISK" | "NETWORK" | "ALERT";
  resourceId?: string | undefined;
  summary: string;
  detectedAt: Date;
  ageSeconds: number;
  recommendedAction: string;
}

export interface BranchHealthReportRow {
  branchId: string;
  branchCode: string;
  branchName: string;
  region?: string | undefined;
  status: HealthState;
  internetStatus: HealthState;
  recorderStatus: HealthState;
  cameraStatus: HealthState;
  storageStatus: HealthState;
  recordingStatus: HealthState;
  retentionStatus: HealthState;
  activeP1: number;
  activeP2: number;
  lastObservedAt?: Date | undefined;
  reasonCodes: string[];
}

export interface RecorderReportRow {
  branchId: string;
  branchName: string;
  recorderId: string;
  recorderName: string;
  manufacturer?: string | undefined;
  model?: string | undefined;
  state: "ONLINE" | "DEGRADED" | "OFFLINE" | "UNKNOWN";
  channelCount?: number | undefined;
  connectedChannels?: number | undefined;
  recordingChannels?: number | undefined;
  clockDriftSeconds?: number | undefined;
  lastSeenAt?: Date | undefined;
  reason?: string | undefined;
}

export interface CameraReportRow {
  branchId: string;
  branchName: string;
  cameraId: string;
  cameraName: string;
  currentState: "WORKING" | "DEGRADED" | "OFFLINE" | "UNKNOWN";
  networkReachable?: boolean | undefined;
  streamReachable?: boolean | undefined;
  framesDecodable?: boolean | undefined;
  recordingActive?: boolean | undefined;
  availabilityPercent: number;
  downtimeMinutes: number;
  outageCount: number;
  lastSeenAt?: Date | undefined;
  reason?: string | undefined;
}

export interface DiskHealthReportRow {
  branchId: string;
  branchName: string;
  recorderId: string;
  diskId: string;
  serialNumber?: string | undefined;
  capacityBytes?: number | undefined;
  usedBytes?: number | undefined;
  freeBytes?: number | undefined;
  utilizationPercent?: number | undefined;
  temperatureC?: number | undefined;
  smartStatus?: string | undefined;
  reallocatedSectors?: number | undefined;
  predictedFailure?: boolean | undefined;
  state: "HEALTHY" | "WARNING" | "FAILED" | "MISSING" | "UNKNOWN";
  observedAt?: Date | undefined;
}

export interface RecordingReportRow {
  branchId: string;
  branchName: string;
  cameraId: string;
  cameraName: string;
  state: "RECORDING" | "NOT_RECORDING" | "INTERMITTENT" | "UNKNOWN";
  lastRecordingAt?: Date | undefined;
  gapMinutes?: number | undefined;
  gapsDetected?: number | undefined;
  verificationSource: "RECORDER_ARCHIVE" | "RECORDER_STATUS" | "EDGE_AGENT" | "UNKNOWN";
  observedAt?: Date | undefined;
}

export interface RetentionViolationRow {
  branchId: string;
  branchName: string;
  cameraId?: string | undefined;
  recorderId?: string | undefined;
  requiredRetentionDays: number;
  actualRetentionDays?: number | undefined;
  projectedRetentionDays?: number | undefined;
  deficitDays?: number | undefined;
  state: "COMPLIANT" | "WARNING" | "VIOLATION" | "UNKNOWN";
  oldestRecordingAt?: Date | undefined;
  observedAt?: Date | undefined;
  reason?: string | undefined;
}

export interface InternetOutageRow {
  branchId: string;
  branchName: string;
  startedAt: Date;
  endedAt?: Date | undefined;
  durationSeconds: number;
  path: "PRIMARY" | "BACKUP" | "BOTH" | "UNKNOWN";
  failoverActivated: boolean;
  impact: "NO_IMPACT" | "DEGRADED_MONITORING" | "REMOTE_MONITORING_LOST" | "UNKNOWN";
  reason?: string | undefined;
}

export interface AlertReportRow {
  alertId: string;
  branchId: string;
  branchName: string;
  cameraId?: string | undefined;
  cameraName?: string | undefined;
  priority: "P1" | "P2" | "P3" | "P4";
  detectionType: string;
  createdAt: Date;
  acknowledgedAt?: Date | undefined;
  resolvedAt?: Date | undefined;
  acknowledgedBy?: string | undefined;
  acknowledgementSeconds?: number | undefined;
  slaBreached: boolean;
  state: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "ESCALATED";
}

export interface DailySurveillanceHealthReportData {
  metadata: {
    reportId: string;
    tenantId: string;
    generatedAt: Date;
    periodStart: Date;
    periodEnd: Date;
    timezone: string;
    generatedBy: "SCHEDULED" | "MANUAL" | "API";
    dataFreshness: Date;
    integrityHashSha256?: string | undefined;
    reportVersion: number;
  };
  executiveSummary: ExecutiveSummary;
  exceptionsRequiringAction: SurveillanceException[];
  branches: BranchHealthReportRow[];
  recorders: RecorderReportRow[];
  cameras: CameraReportRow[];
  disks: DiskHealthReportRow[];
  recording: RecordingReportRow[];
  retentionViolations: RetentionViolationRow[];
  internetOutages: InternetOutageRow[];
  alerts: AlertReportRow[];
}
