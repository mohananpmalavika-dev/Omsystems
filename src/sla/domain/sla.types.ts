/**
 * Historical SLA & Availability Metrics Domain Contracts
 */

export type HealthEntityType = "CAMERA" | "RECORDER" | "RECORDING" | "INTERNET";

export type HealthIntervalState = "HEALTHY" | "FAILED" | "UNKNOWN" | "DEGRADED";

export type SlaStatus = "COMPLIANT" | "WARNING" | "BREACH" | "UNKNOWN";

export interface HealthInterval {
  entityId: string;
  entityType: HealthEntityType;
  state: HealthIntervalState;
  startedAt: Date;
  endedAt?: Date | undefined;
  reason?: string | undefined;
}

export interface AvailabilityResult {
  availableSeconds: number;
  unavailableSeconds: number;
  unknownSeconds: number;
  monitoredSeconds: number;
  availabilityPct: number | null;
  monitoringCoveragePct: number;
}

export interface CameraHealthDaily {
  cameraId: string;
  cameraName: string;
  branchId: string;
  reportDate: string; // YYYY-MM-DD

  availabilityPct: number | null;
  recordingAvailabilityPct: number | null;

  availableSeconds: number;
  unavailableSeconds: number;
  unknownSeconds: number;

  retentionDays: number;
  retentionCompliant: boolean;

  outageCount: number;
  longestOutageSeconds: number;
  monitoringCoveragePct: number;
}

export interface BranchHealthDaily {
  branchId: string;
  branchName: string;
  regionId?: string | undefined;
  reportDate: string; // YYYY-MM-DD

  // Percentage availability metrics
  cameraAvailabilityPct: number | null;
  recordingAvailabilityPct: number | null;
  recorderAvailabilityPct: number | null;
  internetAvailabilityPct: number | null;
  primaryIspAvailabilityPct: number | null;

  retentionCompliancePct: number | null;

  // Alert SLA metrics
  p1AlertCount: number;
  p2AlertCount: number;
  p3AlertCount: number;
  p4AlertCount: number;

  acknowledgedAlertCount: number;
  resolvedAlertCount: number;

  p1SlaBreachCount: number;
  p2SlaBreachCount: number;
  acknowledgementSlaCompliancePct: number | null;

  meanAcknowledgeTimeSeconds: number | null;
  meanResolutionTimeSeconds: number | null;

  // Underlying duration & counts (for debugging and weighted roll-ups)
  cameraDowntimeSeconds: number;
  recordingDowntimeSeconds: number;
  recorderDowntimeSeconds: number;
  internetDowntimeSeconds: number;

  totalCameras: number;
  retentionCompliantCameras: number;
  retentionNoncompliantCameras: number;
  retentionUnknownCameras: number;

  // Telemetry coverage
  cameraMonitoringCoveragePct: number;
  recorderMonitoringCoveragePct: number;
  internetMonitoringCoveragePct: number;

  slaStatus: SlaStatus;
  generatedAt: Date;
}

export interface SlaPolicyTarget {
  cameraAvailabilityTarget: number; // e.g. 99.5
  recordingAvailabilityTarget: number; // e.g. 99.9
  recorderAvailabilityTarget: number; // e.g. 99.9
  internetAvailabilityTarget: number; // e.g. 99.5
  retentionComplianceTarget: number; // e.g. 100.0

  p1AcknowledgeTargetSeconds: number; // e.g. 60
  p1ResolutionTargetSeconds: number; // e.g. 900 (15 min)

  p2AcknowledgeTargetSeconds: number; // e.g. 300 (5 min)
  p2ResolutionTargetSeconds: number; // e.g. 3600 (1 hr)
}

export interface FleetSlaSummary {
  reportDate: string;
  totalBranches: number;
  compliantBranches: number;
  warningBranches: number;
  breachBranches: number;

  overallCameraAvailabilityPct: number;
  overallRecordingAvailabilityPct: number;
  overallRecorderAvailabilityPct: number;
  overallInternetAvailabilityPct: number;
  overallRetentionCompliancePct: number;

  totalP1Alerts: number;
  totalP2Alerts: number;
  p1SlaBreaches: number;
  p2SlaBreaches: number;
  overallAckSlaCompliancePct: number;

  meanAcknowledgeSeconds: number;
  meanResolutionSeconds: number;

  worstPerformingBranches: Array<{
    branchId: string;
    branchName: string;
    cameraAvailabilityPct: number | null;
    recordingAvailabilityPct: number | null;
    internetAvailabilityPct: number | null;
    slaStatus: SlaStatus;
  }>;
}
