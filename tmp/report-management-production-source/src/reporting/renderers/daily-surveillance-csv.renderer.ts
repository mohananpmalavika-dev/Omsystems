/**
 * Daily Surveillance Health Report - CSV Renderer
 * 
 * Supports rendering all 9 discrete daily reports plus composite executive report:
 * 1. Daily Branch Health Report
 * 2. Daily Camera Availability Report
 * 3. Daily DVR/NVR Health Report
 * 4. Daily HDD Health Report
 * 5. Daily Recording Continuity Report
 * 6. Daily Retention Compliance Report
 * 7. Daily Internet Connectivity Report
 * 8. Daily Alert Summary
 * 9. Daily P1/P2 Incident Report
 */

import type { DailySurveillanceHealthReportData, DailyReportType } from "../domain/daily-surveillance-report.types.js";

function escapeCsv(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function renderDailySurveillanceHealthCsv(
  report: DailySurveillanceHealthReportData,
  reportTypeOrSection?: DailyReportType | "branches" | "exceptions" | "retention" | "disks" | "summary"
): Buffer {
  const lines: string[] = [];
  const type = reportTypeOrSection || report.metadata.reportType || "DAILY_SURVEILLANCE_HEALTH";

  if (type === "DAILY_BRANCH_HEALTH" || type === "branches") {
    lines.push("Branch Code,Branch Name,Region,Overall Status,Internet,Recorder,Camera,Storage,Recording,Retention,Active P1,Active P2,Last Observed,Reason Codes");
    for (const b of report.branches) {
      lines.push(
        [
          escapeCsv(b.branchCode),
          escapeCsv(b.branchName),
          escapeCsv(b.region || "Unassigned"),
          escapeCsv(b.status),
          escapeCsv(b.internetStatus),
          escapeCsv(b.recorderStatus),
          escapeCsv(b.cameraStatus),
          escapeCsv(b.storageStatus),
          escapeCsv(b.recordingStatus),
          escapeCsv(b.retentionStatus),
          escapeCsv(b.activeP1),
          escapeCsv(b.activeP2),
          escapeCsv(b.lastObservedAt?.toISOString() || "N/A"),
          escapeCsv(b.reasonCodes.join("; ")),
        ].join(",")
      );
    }
    return Buffer.from(lines.join("\r\n"), "utf-8");
  }

  if (type === "DAILY_CAMERA_AVAILABILITY") {
    lines.push("Branch Name,Camera ID,Camera Name,Current State,Network Reachable,Stream Reachable,Recording Active,Availability (%),Downtime (min),Outage Count,Last Seen");
    for (const c of report.cameras) {
      lines.push(
        [
          escapeCsv(c.branchName),
          escapeCsv(c.cameraId),
          escapeCsv(c.cameraName),
          escapeCsv(c.currentState),
          escapeCsv(c.networkReachable ?? false),
          escapeCsv(c.streamReachable ?? false),
          escapeCsv(c.recordingActive ?? false),
          escapeCsv(c.availabilityPercent),
          escapeCsv(c.downtimeMinutes),
          escapeCsv(c.outageCount),
          escapeCsv(c.lastSeenAt?.toISOString() || "N/A"),
        ].join(",")
      );
    }
    return Buffer.from(lines.join("\r\n"), "utf-8");
  }

  if (type === "DAILY_DVR_NVR_HEALTH") {
    lines.push("Branch Name,Recorder ID,Recorder Name,Manufacturer,Model,State,Total Channels,Connected Channels,Recording Channels,Last Seen");
    for (const r of report.recorders) {
      lines.push(
        [
          escapeCsv(r.branchName),
          escapeCsv(r.recorderId),
          escapeCsv(r.recorderName),
          escapeCsv(r.manufacturer || "Unknown"),
          escapeCsv(r.model || "Unknown"),
          escapeCsv(r.state),
          escapeCsv(r.channelCount ?? "N/A"),
          escapeCsv(r.connectedChannels ?? "N/A"),
          escapeCsv(r.recordingChannels ?? "N/A"),
          escapeCsv(r.lastSeenAt?.toISOString() || "N/A"),
        ].join(",")
      );
    }
    return Buffer.from(lines.join("\r\n"), "utf-8");
  }

  if (type === "DAILY_HDD_HEALTH" || type === "disks") {
    lines.push("Branch Name,Recorder ID,Disk ID,Serial Number,Capacity (GB),Used (GB),Free (GB),Utilization (%),Temp (C),SMART Status,State");
    for (const d of report.disks) {
      lines.push(
        [
          escapeCsv(d.branchName),
          escapeCsv(d.recorderId),
          escapeCsv(d.diskId),
          escapeCsv(d.serialNumber || "N/A"),
          escapeCsv(d.capacityBytes ? (d.capacityBytes / 1e9).toFixed(1) : "N/A"),
          escapeCsv(d.usedBytes ? (d.usedBytes / 1e9).toFixed(1) : "N/A"),
          escapeCsv(d.freeBytes ? (d.freeBytes / 1e9).toFixed(1) : "N/A"),
          escapeCsv(d.utilizationPercent ?? "N/A"),
          escapeCsv(d.temperatureC ?? "N/A"),
          escapeCsv(d.smartStatus || "UNKNOWN"),
          escapeCsv(d.state),
        ].join(",")
      );
    }
    return Buffer.from(lines.join("\r\n"), "utf-8");
  }

  if (type === "DAILY_RECORDING_CONTINUITY") {
    lines.push("Branch Name,Camera ID,Camera Name,Recording State,Last Recording At,Gap Minutes,Gaps Detected,Verification Source");
    for (const rec of report.recording) {
      lines.push(
        [
          escapeCsv(rec.branchName),
          escapeCsv(rec.cameraId),
          escapeCsv(rec.cameraName),
          escapeCsv(rec.state),
          escapeCsv(rec.lastRecordingAt?.toISOString() || "N/A"),
          escapeCsv(rec.gapMinutes ?? 0),
          escapeCsv(rec.gapsDetected ?? 0),
          escapeCsv(rec.verificationSource),
        ].join(",")
      );
    }
    return Buffer.from(lines.join("\r\n"), "utf-8");
  }

  if (type === "DAILY_RETENTION_COMPLIANCE" || type === "retention") {
    lines.push("Branch Name,Recorder ID,Required Days,Actual Days,Projected Days,Deficit Days,Status,Reason");
    for (const ret of report.retentionViolations) {
      lines.push(
        [
          escapeCsv(ret.branchName),
          escapeCsv(ret.recorderId || "N/A"),
          escapeCsv(ret.requiredRetentionDays),
          escapeCsv(ret.actualRetentionDays ?? "N/A"),
          escapeCsv(ret.projectedRetentionDays ?? "N/A"),
          escapeCsv(ret.deficitDays ?? 0),
          escapeCsv(ret.state),
          escapeCsv(ret.reason || "N/A"),
        ].join(",")
      );
    }
    return Buffer.from(lines.join("\r\n"), "utf-8");
  }

  if (type === "DAILY_INTERNET_CONNECTIVITY") {
    lines.push("Branch Name,Started At,Duration (s),Path,Failover Activated,Impact,Reason");
    for (const net of report.internetOutages) {
      lines.push(
        [
          escapeCsv(net.branchName),
          escapeCsv(net.startedAt.toISOString()),
          escapeCsv(net.durationSeconds),
          escapeCsv(net.path),
          escapeCsv(net.failoverActivated),
          escapeCsv(net.impact),
          escapeCsv(net.reason || "N/A"),
        ].join(",")
      );
    }
    return Buffer.from(lines.join("\r\n"), "utf-8");
  }

  if (type === "DAILY_ALERT_SUMMARY" || type === "DAILY_P1_P2_INCIDENT") {
    lines.push("Alert ID,Branch Name,Camera Name,Priority,Detection Type,Created At,SLA Breached,State");
    const filteredAlerts = type === "DAILY_P1_P2_INCIDENT"
      ? report.alerts.filter((a) => a.priority === "P1" || a.priority === "P2")
      : report.alerts;

    for (const a of filteredAlerts) {
      lines.push(
        [
          escapeCsv(a.alertId),
          escapeCsv(a.branchName),
          escapeCsv(a.cameraName || "N/A"),
          escapeCsv(a.priority),
          escapeCsv(a.detectionType),
          escapeCsv(a.createdAt.toISOString()),
          escapeCsv(a.slaBreached),
          escapeCsv(a.state),
        ].join(",")
      );
    }
    return Buffer.from(lines.join("\r\n"), "utf-8");
  }

  // Default: Composite Report
  lines.push("Category,Metric,Value");
  lines.push(`Metadata,Report ID,${escapeCsv(report.metadata.reportId)}`);
  lines.push(`Metadata,Generated At,${escapeCsv(report.metadata.generatedAt.toISOString())}`);
  lines.push(`Branches,Total,${report.executiveSummary.totalBranches}`);
  lines.push(`Branches,Healthy,${report.executiveSummary.healthyBranches}`);
  lines.push(`Branches,Warning,${report.executiveSummary.warningBranches}`);
  lines.push(`Branches,Critical,${report.executiveSummary.criticalBranches}`);
  lines.push(`Cameras,Availability (%),${report.executiveSummary.cameraAvailabilityPercent}%`);
  lines.push(`Retention,Violations,${report.executiveSummary.retentionViolations}`);
  lines.push(`Storage,SMART Failed Disks,${report.executiveSummary.failedDisks}`);
  lines.push(`Alerts,Unacknowledged P1,${report.executiveSummary.unacknowledgedP1}`);
  lines.push(`Integrity,SHA-256,${report.metadata.integrityHashSha256 || "N/A"}`);
  lines.push("");

  lines.push("Severity,Branch,Type,Resource,Summary,Recommended Action");
  for (const exc of report.exceptionsRequiringAction) {
    lines.push(
      [
        escapeCsv(exc.severity),
        escapeCsv(exc.branchName),
        escapeCsv(exc.type),
        escapeCsv(exc.resourceType),
        escapeCsv(exc.summary),
        escapeCsv(exc.recommendedAction),
      ].join(",")
    );
  }
  lines.push("");

  lines.push("Branch Code,Branch Name,Region,Overall Status,Internet,Recorder,Camera,Storage,Recording,Retention,Reason Codes");
  for (const b of report.branches) {
    lines.push(
      [
        escapeCsv(b.branchCode),
        escapeCsv(b.branchName),
        escapeCsv(b.region || "Unassigned"),
        escapeCsv(b.status),
        escapeCsv(b.internetStatus),
        escapeCsv(b.recorderStatus),
        escapeCsv(b.cameraStatus),
        escapeCsv(b.storageStatus),
        escapeCsv(b.recordingStatus),
        escapeCsv(b.retentionStatus),
        escapeCsv(b.reasonCodes.join("; ")),
      ].join(",")
    );
  }

  return Buffer.from(lines.join("\r\n"), "utf-8");
}
