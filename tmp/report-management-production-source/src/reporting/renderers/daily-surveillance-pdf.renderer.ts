/**
 * Daily Surveillance Health Report - PDF Renderer
 */

import PDFDocument from "pdfkit";
import type { DailySurveillanceHealthReportData } from "../domain/daily-surveillance-report.types.js";

export async function renderDailySurveillanceHealthPdf(
  report: DailySurveillanceHealthReportData
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 36 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const summary = report.executiveSummary;
    const meta = report.metadata;

    // --- Page 1: Header & Executive Summary ---
    doc.rect(36, 36, 523, 50).fill("#0f172a");
    doc.fontSize(16).fillColor("#ffffff").text("DAILY SURVEILLANCE HEALTH REPORT", 48, 48);
    doc.fontSize(8).fillColor("#94a3b8").text(
      `Period: ${meta.periodStart.toLocaleDateString()} – ${meta.periodEnd.toLocaleDateString()} (${meta.timezone})  |  Generated: ${meta.generatedAt.toLocaleTimeString()}  |  ID: ${meta.reportId}`,
      48,
      70
    );

    doc.moveDown(3);

    // KPI Cards Matrix
    doc.fontSize(12).fillColor("#0f172a").text("1. EXECUTIVE SUMMARY & FLEET KPIS", 36, 105);
    doc.strokeColor("#e2e8f0").lineWidth(1).moveTo(36, 122).lineTo(559, 122).stroke();

    // Box 1: Branches
    doc.rect(36, 132, 165, 80).fillAndStroke("#f8fafc", "#cbd5e1");
    doc.fontSize(9).fillColor("#475569").text("BRANCH ESTATE", 46, 142);
    doc.fontSize(18).fillColor("#0f172a").text(`${summary.totalBranches}`, 46, 158);
    doc.fontSize(8).fillColor("#16a34a").text(`Healthy: ${summary.healthyBranches}`, 46, 182);
    doc.fontSize(8).fillColor("#dc2626").text(`Critical: ${summary.criticalBranches}  |  Warn: ${summary.warningBranches}`, 46, 194);

    // Box 2: Camera Availability
    doc.rect(215, 132, 165, 80).fillAndStroke("#f8fafc", "#cbd5e1");
    doc.fontSize(9).fillColor("#475569").text("CAMERA AVAILABILITY", 225, 142);
    doc.fontSize(18).fillColor("#0284c7").text(`${summary.cameraAvailabilityPercent}%`, 225, 158);
    doc.fontSize(8).fillColor("#16a34a").text(`Available: ${summary.onlineCameras} / ${summary.totalCameras}`, 225, 182);
    doc.fontSize(8).fillColor("#dc2626").text(`Unavailable: ${summary.unavailableCameras}  |  Unknown: ${summary.unknownCameras}`, 225, 194);

    // Box 3: Critical Conditions
    doc.rect(394, 132, 165, 80).fillAndStroke("#fef2f2", "#fca5a5");
    doc.fontSize(9).fillColor("#991b1b").text("CRITICAL EXCEPTIONS", 404, 142);
    doc.fontSize(18).fillColor("#b91c1c").text(`${summary.actionRequiredCount}`, 404, 158);
    doc.fontSize(8).fillColor("#b91c1c").text(`Retention: ${summary.retentionViolations}  |  HDD: ${summary.failedDisks}`, 404, 182);
    doc.fontSize(8).fillColor("#b91c1c").text(`Unack P1: ${summary.unacknowledgedP1}  |  Rec Orders: ${summary.recordingFailures}`, 404, 194);

    // --- Section 2: Exceptions Requiring Action ---
    doc.moveDown(5);
    doc.fontSize(12).fillColor("#0f172a").text("2. EXCEPTIONS REQUIRING ACTION (PRIORITIZED)", 36, 235);
    doc.strokeColor("#e2e8f0").lineWidth(1).moveTo(36, 252).lineTo(559, 252).stroke();

    let y = 262;
    const topExceptions = report.exceptionsRequiringAction.slice(0, 7);

    for (const exc of topExceptions) {
      const isCrit = exc.severity === "CRITICAL";
      doc.rect(36, y, 523, 40).fillAndStroke(isCrit ? "#fff1f2" : "#fefce8", isCrit ? "#fda4af" : "#fef08a");
      doc.fontSize(8).fillColor(isCrit ? "#be123c" : "#a16207").text(`[${exc.severity}] ${exc.branchName}`, 44, y + 6);
      doc.fontSize(8).fillColor("#1e293b").text(exc.summary, 44, y + 17);
      doc.fontSize(7).fillColor("#475569").text(`Action: ${exc.recommendedAction}`, 44, y + 28);
      y += 46;
    }

    // --- Page 2: Retention Violations & Storage Health ---
    doc.addPage();
    doc.fontSize(12).fillColor("#0f172a").text("3. RETENTION COMPLIANCE VIOLATIONS", 36, 40);
    doc.strokeColor("#e2e8f0").lineWidth(1).moveTo(36, 57).lineTo(559, 57).stroke();

    y = 67;
    doc.fontSize(8).fillColor("#475569").text("Branch", 36, y);
    doc.text("Required", 180, y);
    doc.text("Actual", 240, y);
    doc.text("Deficit", 300, y);
    doc.text("State", 360, y);
    doc.text("Root Cause", 420, y);
    y += 14;

    for (const ret of report.retentionViolations.slice(0, 10)) {
      doc.fontSize(8).fillColor("#0f172a").text(ret.branchName, 36, y);
      doc.text(`${ret.requiredRetentionDays}d`, 180, y);
      doc.text(`${ret.actualRetentionDays?.toFixed(1) || 0}d`, 240, y);
      doc.fontSize(8).fillColor("#dc2626").text(`${ret.deficitDays?.toFixed(1) || 0}d`, 300, y);
      doc.fontSize(8).fillColor("#dc2626").text(ret.state, 360, y);
      doc.fontSize(7).fillColor("#64748b").text(ret.reason || "Shortfall", 420, y);
      y += 18;
    }

    // Storage Section
    y += 20;
    doc.fontSize(12).fillColor("#0f172a").text("4. HDD & SMART STORAGE HEALTH", 36, y);
    doc.strokeColor("#e2e8f0").lineWidth(1).moveTo(36, y + 17).lineTo(559, y + 17).stroke();
    y += 27;

    for (const disk of report.disks.slice(0, 8)) {
      const isFail = disk.state === "FAILED";
      doc.fontSize(8).fillColor(isFail ? "#dc2626" : "#0f172a").text(
        `${disk.branchName}  |  ${disk.diskId}  |  Status: ${disk.state}  |  SMART: ${disk.smartStatus || "OK"}  |  Util: ${disk.utilizationPercent}%  |  Temp: ${disk.temperatureC ?? 40}°C`,
        36,
        y
      );
      y += 16;
    }

    // --- Footer Integrity Stamp ---
    const pageBottom = 780;
    doc.strokeColor("#e2e8f0").lineWidth(1).moveTo(36, pageBottom).lineTo(559, pageBottom).stroke();
    doc.fontSize(7).fillColor("#94a3b8").text(
      `Confidential Banking Surveillance Audit Record  |  SHA-256: ${meta.integrityHashSha256 || "N/A"}  |  Aditi Sentinel Platform`,
      36,
      pageBottom + 6
    );

    doc.end();
  });
}
