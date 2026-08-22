/**
 * Daily Surveillance Health Report - CSV Renderer
 */

import type { DailySurveillanceHealthReportData } from "../domain/daily-surveillance-report.types.js";

function escapeCsv(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function renderDailySurveillanceHealthCsv(
  report: DailySurveillanceHealthReportData,
  section?: "branches" | "exceptions" | "retention" | "disks" | "summary"
): Buffer {
  let lines: string[] = [];

  if (!section || section === "summary") {
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
  }

  if (!section || section === "exceptions") {
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
  }

  if (!section || section === "branches") {
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
  }

  return Buffer.from(lines.join("\r\n"), "utf-8");
}
