/**
 * Daily Surveillance Health Report - Excel XLSX Renderer
 */

import ExcelJS from "exceljs";
import type { DailySurveillanceHealthReportData } from "../domain/daily-surveillance-report.types.js";

export async function renderDailySurveillanceHealthXlsx(
  report: DailySurveillanceHealthReportData
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sentinel Surveillance Grid";
  workbook.created = report.metadata.generatedAt;

  const headerFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" },
  };

  const headerFont: Partial<ExcelJS.Font> = {
    bold: true,
    color: { argb: "FFFFFFFF" },
    size: 10,
  };

  // --- Sheet 1: Executive Summary ---
  const wsSummary = workbook.addWorksheet("Executive Summary");
  wsSummary.columns = [
    { header: "Metric", key: "metric", width: 35 },
    { header: "Value", key: "value", width: 25 },
  ];
  wsSummary.getRow(1).font = headerFont;
  wsSummary.getRow(1).fill = headerFill;

  const summary = report.executiveSummary;
  wsSummary.addRows([
    { metric: "Report ID", value: report.metadata.reportId },
    { metric: "Generated At", value: report.metadata.generatedAt.toISOString() },
    { metric: "Total Branches", value: summary.totalBranches },
    { metric: "Healthy Branches", value: summary.healthyBranches },
    { metric: "Warning Branches", value: summary.warningBranches },
    { metric: "Critical Branches", value: summary.criticalBranches },
    { metric: "Offline Branches", value: summary.offlineBranches },
    { metric: "Unknown Branches", value: summary.unknownBranches },
    { metric: "Branch Availability (%)", value: `${summary.branchAvailabilityPercent}%` },
    { metric: "Total Cameras", value: summary.totalCameras },
    { metric: "Online Cameras", value: summary.onlineCameras },
    { metric: "Unavailable Cameras", value: summary.unavailableCameras },
    { metric: "Camera Availability (%)", value: `${summary.cameraAvailabilityPercent}%` },
    { metric: "Recording Failures", value: summary.recordingFailures },
    { metric: "Retention Violations", value: summary.retentionViolations },
    { metric: "SMART Failed Disks", value: summary.failedDisks },
    { metric: "Active Unacknowledged P1 Alerts", value: summary.unacknowledgedP1 },
    { metric: "Total Actions Required", value: summary.actionRequiredCount },
    { metric: "Data Quality Completeness (%)", value: `${summary.dataQuality.completenessPercent}%` },
    { metric: "Integrity Hash (SHA-256)", value: report.metadata.integrityHashSha256 || "N/A" },
  ]);

  // --- Sheet 2: Exceptions Requiring Action ---
  const wsExceptions = workbook.addWorksheet("Exceptions Requiring Action");
  wsExceptions.columns = [
    { header: "Severity", key: "severity", width: 12 },
    { header: "Branch Name", key: "branchName", width: 25 },
    { header: "Type", key: "type", width: 22 },
    { header: "Resource Type", key: "resourceType", width: 15 },
    { header: "Summary", key: "summary", width: 45 },
    { header: "Recommended Action", key: "recommendedAction", width: 55 },
  ];
  wsExceptions.getRow(1).font = headerFont;
  wsExceptions.getRow(1).fill = headerFill;

  for (const exc of report.exceptionsRequiringAction) {
    wsExceptions.addRow({
      severity: exc.severity,
      branchName: exc.branchName,
      type: exc.type,
      resourceType: exc.resourceType,
      summary: exc.summary,
      recommendedAction: exc.recommendedAction,
    });
  }

  // --- Sheet 3: Branch Health ---
  const wsBranches = workbook.addWorksheet("Branch Health");
  wsBranches.columns = [
    { header: "Branch Code", key: "branchCode", width: 14 },
    { header: "Branch Name", key: "branchName", width: 25 },
    { header: "Region", key: "region", width: 18 },
    { header: "Overall Status", key: "status", width: 14 },
    { header: "Internet", key: "internetStatus", width: 12 },
    { header: "Recorder", key: "recorderStatus", width: 12 },
    { header: "Camera", key: "cameraStatus", width: 12 },
    { header: "Storage", key: "storageStatus", width: 12 },
    { header: "Recording", key: "recordingStatus", width: 12 },
    { header: "Retention", key: "retentionStatus", width: 12 },
    { header: "Reason Codes", key: "reasonCodes", width: 35 },
  ];
  wsBranches.getRow(1).font = headerFont;
  wsBranches.getRow(1).fill = headerFill;

  for (const b of report.branches) {
    wsBranches.addRow({
      branchCode: b.branchCode,
      branchName: b.branchName,
      region: b.region || "Unassigned",
      status: b.status,
      internetStatus: b.internetStatus,
      recorderStatus: b.recorderStatus,
      cameraStatus: b.cameraStatus,
      storageStatus: b.storageStatus,
      recordingStatus: b.recordingStatus,
      retentionStatus: b.retentionStatus,
      reasonCodes: b.reasonCodes.join(", "),
    });
  }

  // --- Sheet 4: Retention Compliance ---
  const wsRetention = workbook.addWorksheet("Retention Compliance");
  wsRetention.columns = [
    { header: "Branch Name", key: "branchName", width: 25 },
    { header: "Required (Days)", key: "requiredDays", width: 16 },
    { header: "Actual (Days)", key: "actualDays", width: 14 },
    { header: "Deficit (Days)", key: "deficitDays", width: 14 },
    { header: "Compliance State", key: "state", width: 16 },
    { header: "Root Cause Reason", key: "reason", width: 40 },
  ];
  wsRetention.getRow(1).font = headerFont;
  wsRetention.getRow(1).fill = headerFill;

  for (const r of report.retentionViolations) {
    wsRetention.addRow({
      branchName: r.branchName,
      requiredDays: r.requiredRetentionDays,
      actualDays: r.actualRetentionDays?.toFixed(1) || 0,
      deficitDays: r.deficitDays?.toFixed(1) || 0,
      state: r.state,
      reason: r.reason || "Shortfall",
    });
  }

  // --- Sheet 5: HDD Storage Health ---
  const wsDisks = workbook.addWorksheet("HDD Storage Health");
  wsDisks.columns = [
    { header: "Branch Name", key: "branchName", width: 25 },
    { header: "Disk ID", key: "diskId", width: 12 },
    { header: "Serial Number", key: "serialNumber", width: 20 },
    { header: "Status", key: "state", width: 12 },
    { header: "SMART Status", key: "smartStatus", width: 14 },
    { header: "Utilization (%)", key: "utilization", width: 14 },
    { header: "Temperature (°C)", key: "temp", width: 16 },
    { header: "Reallocated Sectors", key: "sectors", width: 18 },
  ];
  wsDisks.getRow(1).font = headerFont;
  wsDisks.getRow(1).fill = headerFill;

  for (const d of report.disks) {
    wsDisks.addRow({
      branchName: d.branchName,
      diskId: d.diskId,
      serialNumber: d.serialNumber || "N/A",
      state: d.state,
      smartStatus: d.smartStatus || "OK",
      utilization: `${d.utilizationPercent ?? 0}%`,
      temp: `${d.temperatureC ?? 40}°C`,
      sectors: d.reallocatedSectors ?? 0,
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
