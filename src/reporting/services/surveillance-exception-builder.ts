/**
 * Surveillance Exception Builder
 * 
 * Analyzes operational telemetry across 10 surveillance dimensions
 * and constructs prioritized, actionable exception records for executive and SOC action.
 */

import type {
  SurveillanceException,
  BranchHealthReportRow,
  RecorderReportRow,
  CameraReportRow,
  DiskHealthReportRow,
  RecordingReportRow,
  RetentionViolationRow,
  InternetOutageRow,
  AlertReportRow,
} from "../domain/daily-surveillance-report.types.js";

export class SurveillanceExceptionBuilder {
  build(data: {
    branches: BranchHealthReportRow[];
    recorders: RecorderReportRow[];
    cameras: CameraReportRow[];
    disks: DiskHealthReportRow[];
    recording: RecordingReportRow[];
    retentionViolations: RetentionViolationRow[];
    internetOutages: InternetOutageRow[];
    alerts: AlertReportRow[];
  }): SurveillanceException[] {
    const exceptions: SurveillanceException[] = [];
    const now = new Date();

    // 1. Unacknowledged P1 Alerts
    for (const alert of data.alerts) {
      if (alert.priority === "P1" && (alert.state === "OPEN" || alert.state === "ESCALATED")) {
        const ageSec = Math.floor((now.getTime() - alert.createdAt.getTime()) / 1000);
        exceptions.push({
          id: `exc-alt-${alert.alertId}`,
          branchId: alert.branchId,
          branchName: alert.branchName,
          type: "P1_UNACKNOWLEDGED",
          severity: "CRITICAL",
          resourceType: "ALERT",
          resourceId: alert.alertId,
          summary: `P1 ${alert.detectionType} alert unacknowledged for ${Math.floor(ageSec / 60)} minutes`,
          detectedAt: alert.createdAt,
          ageSeconds: ageSec,
          recommendedAction: "Escalate immediately to central surveillance supervisor and on-call manager.",
        });
      }
    }

    // 2. Offline / Failed Recorders
    for (const recorder of data.recorders) {
      if (recorder.state === "OFFLINE") {
        exceptions.push({
          id: `exc-rec-${recorder.recorderId}`,
          branchId: recorder.branchId,
          branchName: recorder.branchName,
          type: "RECORDER_OFFLINE",
          severity: "CRITICAL",
          resourceType: "RECORDER",
          resourceId: recorder.recorderId,
          summary: `${recorder.recorderName} (${recorder.model || "NVR"}) is offline`,
          detectedAt: recorder.lastSeenAt || now,
          ageSeconds: recorder.lastSeenAt ? Math.floor((now.getTime() - recorder.lastSeenAt.getTime()) / 1000) : 0,
          recommendedAction: "Verify recorder power, network switch, edge gateway, and UPS supply.",
        });
      }
    }

    // 3. Failed or SMART Degraded Disks
    for (const disk of data.disks) {
      if (disk.state === "FAILED" || disk.predictedFailure) {
        exceptions.push({
          id: `exc-disk-${disk.diskId}`,
          branchId: disk.branchId,
          branchName: disk.branchName,
          type: "HDD_FAILED",
          severity: "CRITICAL",
          resourceType: "DISK",
          resourceId: disk.diskId,
          summary: `${disk.diskId} failed SMART health check (${disk.smartStatus || "Critical errors"})`,
          detectedAt: disk.observedAt || now,
          ageSeconds: 0,
          recommendedAction: "Replace surveillance HDD immediately before overwrite data loss occurs.",
        });
      } else if (disk.state === "WARNING") {
        exceptions.push({
          id: `exc-disk-warn-${disk.diskId}`,
          branchId: disk.branchId,
          branchName: disk.branchName,
          type: "HDD_WARNING",
          severity: "HIGH",
          resourceType: "DISK",
          resourceId: disk.diskId,
          summary: `${disk.diskId} SMART warning (${disk.reallocatedSectors ?? 0} reallocated sectors, temp ${disk.temperatureC ?? 45}°C)`,
          detectedAt: disk.observedAt || now,
          ageSeconds: 0,
          recommendedAction: "Schedule proactive disk replacement during next maintenance window.",
        });
      }
    }

    // 4. Retention Violations
    for (const ret of data.retentionViolations) {
      if (ret.state === "VIOLATION") {
        exceptions.push({
          id: `exc-ret-${ret.branchId}-${ret.cameraId || "branch"}`,
          branchId: ret.branchId,
          branchName: ret.branchName,
          type: "RETENTION_VIOLATION",
          severity: "CRITICAL",
          resourceType: "BRANCH",
          resourceId: ret.cameraId,
          summary: `Retention violation: ${ret.actualRetentionDays?.toFixed(1) || 0} / ${ret.requiredRetentionDays} days (${ret.deficitDays?.toFixed(1) || 0}d deficit)`,
          detectedAt: ret.observedAt || now,
          ageSeconds: 0,
          recommendedAction: "Inspect disk capacity, storage overwrite policies, and historical recording gaps.",
        });
      }
    }

    // 5. Stopped Recording Channels
    for (const rec of data.recording) {
      if (rec.state === "NOT_RECORDING") {
        exceptions.push({
          id: `exc-recg-${rec.cameraId}`,
          branchId: rec.branchId,
          branchName: rec.branchName,
          type: "RECORDING_FAILURE",
          severity: "HIGH",
          resourceType: "CAMERA",
          resourceId: rec.cameraId,
          summary: `${rec.cameraName} is not recording (Last recording: ${rec.lastRecordingAt ? rec.lastRecordingAt.toLocaleTimeString() : "Never"})`,
          detectedAt: rec.observedAt || now,
          ageSeconds: rec.lastRecordingAt ? Math.floor((now.getTime() - rec.lastRecordingAt.getTime()) / 1000) : 0,
          recommendedAction: "Verify recorder channel connection, stream encoding, and recording schedule.",
        });
      }
    }

    // 6. Severe Internet Outages
    for (const outage of data.internetOutages) {
      if (outage.durationSeconds > 1800 || !outage.failoverActivated) {
        exceptions.push({
          id: `exc-net-${outage.branchId}-${outage.startedAt.getTime()}`,
          branchId: outage.branchId,
          branchName: outage.branchName,
          type: "INTERNET_OUTAGE",
          severity: "HIGH",
          resourceType: "NETWORK",
          summary: `Branch internet outage for ${Math.floor(outage.durationSeconds / 60)}m (Failover: ${outage.failoverActivated ? "Active" : "Failed"})`,
          detectedAt: outage.startedAt,
          ageSeconds: outage.durationSeconds,
          recommendedAction: "Check ISP primary/secondary link, router interface, and WireGuard VPN tunnel.",
        });
      }
    }

    // Sort by severity: CRITICAL first, then HIGH, then MEDIUM
    const severityRank: Record<string, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
    return exceptions.sort((a, b) => (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0));
  }
}

export const surveillanceExceptionBuilder = new SurveillanceExceptionBuilder();
