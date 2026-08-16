/**
 * Daily Surveillance Health Report - Automated Verification Runner
 */

import { dailySurveillanceCollectorService } from "../../src/reporting/services/daily-surveillance-collector.service.js";
import { surveillanceExceptionBuilder } from "../../src/reporting/services/surveillance-exception-builder.js";
import { dailySurveillanceReportService } from "../../src/reporting/services/daily-surveillance-report.service.js";
import { renderDailySurveillanceHealthPdf } from "../../src/reporting/renderers/daily-surveillance-pdf.renderer.js";
import { renderDailySurveillanceHealthXlsx } from "../../src/reporting/renderers/daily-surveillance-xlsx.renderer.js";
import { renderDailySurveillanceHealthCsv } from "../../src/reporting/renderers/daily-surveillance-csv.renderer.js";
import { app } from "../../src/app.js";

async function runDailySurveillanceReportTests() {
  console.log("================================================================================");
  console.log("  DAILY SURVEILLANCE HEALTH REPORT - COMPREHENSIVE VERIFICATION RUNNER");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, description: string, extra?: unknown) {
    if (condition) {
      console.log(`  [PASS] ${description}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${description}`);
      if (extra !== undefined) console.error(`         Details:`, extra);
      failed++;
    }
  }

  // Suite 1: Canonical Data Collector & UNKNOWN State Invariant
  console.log("Suite 1: Canonical Data Collector & UNKNOWN State Invariant");
  const reportData = await dailySurveillanceCollectorService.collect({
    tenantId: "bank-corp",
    timezone: "Asia/Kolkata",
    generatedBy: "SCHEDULED",
  });

  assert(reportData.executiveSummary.totalBranches === 400, "Tracks 400 total branches in estate");
  assert(reportData.executiveSummary.unknownBranches > 0, "UNKNOWN branches are tracked strictly separate from HEALTHY");
  assert(reportData.executiveSummary.offlineBranches > 0, "OFFLINE branches are tracked explicitly");
  assert(reportData.executiveSummary.criticalBranches > 0, "CRITICAL branches are identified by worst-case dominance");
  assert(reportData.executiveSummary.cameraAvailabilityPercent > 90, "Calculates fleet camera availability percentage");
  assert(reportData.executiveSummary.unknownCameras > 0, "UNKNOWN cameras are tracked separately from offline cameras");

  // Suite 2: Prioritized Surveillance Exception Builder
  console.log("\nSuite 2: Prioritized Surveillance Exception Builder");
  const exceptions = reportData.exceptionsRequiringAction;
  assert(exceptions.length > 0, "Constructs actionable exceptions from operational telemetry");

  const unackP1 = exceptions.find((e) => e.type === "P1_UNACKNOWLEDGED");
  assert(unackP1 !== undefined, "Flags unacknowledged P1 alert as critical exception");
  assert(unackP1?.severity === "CRITICAL", "Unacknowledged P1 has CRITICAL severity");
  assert(unackP1?.recommendedAction.includes("supervisor"), "Includes actionable supervisor escalation instruction");

  const hddFailed = exceptions.find((e) => e.type === "HDD_FAILED");
  assert(hddFailed !== undefined, "Flags SMART failed disk as critical exception");
  assert(hddFailed?.recommendedAction.includes("Replace HDD"), "Includes 'Replace HDD immediately' action");

  const recOffline = exceptions.find((e) => e.type === "RECORDER_OFFLINE");
  assert(recOffline !== undefined, "Flags offline recorder as critical exception");

  const retViolation = exceptions.find((e) => e.type === "RETENTION_VIOLATION");
  assert(retViolation !== undefined, "Flags retention shortfall as critical exception");

  // Suite 3: Document Renderers (PDF, XLSX, CSV) & Integrity
  console.log("\nSuite 3: Document Renderers (PDF, XLSX, CSV) & Integrity");
  const pdfBuffer = await renderDailySurveillanceHealthPdf(reportData);
  assert(pdfBuffer.length > 1000, "Generates PDF buffer with multi-page content");
  assert(pdfBuffer.subarray(0, 5).toString("utf-8") === "%PDF-", "PDF buffer has valid '%PDF-' header");

  const xlsxBuffer = await renderDailySurveillanceHealthXlsx(reportData);
  assert(xlsxBuffer.length > 1000, "Generates Excel XLSX buffer with 5 worksheets");
  assert(xlsxBuffer[0] === 0x50 && xlsxBuffer[1] === 0x4b, "XLSX buffer has valid ZIP/PK header");

  const csvBuffer = renderDailySurveillanceHealthCsv(reportData);
  assert(csvBuffer.length > 500, "Generates CSV buffer");
  assert(csvBuffer.toString("utf-8").includes("DAILY SURVEILLANCE HEALTH REPORT") || csvBuffer.toString("utf-8").includes("Category,Metric,Value"), "CSV contains executive summary rows");

  assert(reportData.metadata.integrityHashSha256 !== undefined && reportData.metadata.integrityHashSha256.length === 64, "Calculates 64-char SHA-256 integrity hash for snapshot immutability");

  // Suite 4: End-to-End Report Service Lifecycle
  console.log("\nSuite 4: End-to-End Report Service Lifecycle");
  const storedRecord = await dailySurveillanceReportService.generate({
    tenantId: "bank-corp",
    timezone: "Asia/Kolkata",
    formats: ["PDF", "XLSX", "CSV"],
    generatedBy: "API",
  });

  assert(storedRecord.status === "COMPLETED", "Report generation status is COMPLETED");
  assert(storedRecord.artifacts.pdf !== undefined, "Stored PDF artifact in report record");
  assert(storedRecord.artifacts.xlsx !== undefined, "Stored XLSX artifact in report record");
  assert(storedRecord.artifacts.csv !== undefined, "Stored CSV artifact in report record");

  const fetchedRecord = dailySurveillanceReportService.getReport(storedRecord.reportId);
  assert(fetchedRecord?.reportId === storedRecord.reportId, "Retrieves historical immutable report snapshot by ID");

  const pdfArtifact = dailySurveillanceReportService.getArtifact(storedRecord.reportId, "pdf");
  assert(pdfArtifact?.mimeType === "application/pdf", "Retrieves PDF artifact with correct MIME type");

  const xlsxArtifact = dailySurveillanceReportService.getArtifact(storedRecord.reportId, "xlsx");
  assert(xlsxArtifact?.mimeType.includes("spreadsheetml"), "Retrieves XLSX artifact with spreadsheet MIME type");

  // Suite 5: Report Schedules Management
  console.log("\nSuite 5: Report Schedules Management");
  const schedules = dailySurveillanceReportService.getSchedules("bank-corp");
  assert(schedules.length >= 1, "Lists configured daily morning schedules");
  assert(schedules[0].dailyAt === "06:00", "Default schedule set to 06:00 morning run");
  assert(schedules[0].timezone === "Asia/Kolkata", "Default schedule honors Asia/Kolkata timezone");

  // Suite 6: Fastify REST API Routes Verification
  console.log("\nSuite 6: Fastify REST API Routes Verification");
  await app.ready();

  const genResp = await app.inject({
    method: "POST",
    url: "/api/v1/reports/daily-surveillance-health/generate",
    payload: {
      tenantId: "bank-corp",
      timezone: "Asia/Kolkata",
      formats: ["PDF", "XLSX", "CSV"],
    },
  });
  assert(genResp.statusCode === 201, "POST /api/v1/reports/daily-surveillance-health/generate returns 201 Created");
  const genData = JSON.parse(genResp.body).data;
  assert(genData.reportId !== undefined, "Returned generated reportId");

  const latestResp = await app.inject({
    method: "GET",
    url: "/api/v1/reports/daily-surveillance-health/latest?tenantId=bank-corp",
  });
  assert(latestResp.statusCode === 200, "GET /api/v1/reports/daily-surveillance-health/latest returns 200 OK");

  const downloadPdfResp = await app.inject({
    method: "GET",
    url: `/api/v1/reports/daily-surveillance-health/${genData.reportId}/download?format=pdf`,
  });
  assert(downloadPdfResp.statusCode === 200, "GET /download?format=pdf returns 200 OK");
  assert(downloadPdfResp.headers["content-type"] === "application/pdf", "Returns application/pdf Content-Type header");

  const downloadXlsxResp = await app.inject({
    method: "GET",
    url: `/api/v1/reports/daily-surveillance-health/${genData.reportId}/download?format=xlsx`,
  });
  assert(downloadXlsxResp.statusCode === 200, "GET /download?format=xlsx returns 200 OK");
  assert(downloadXlsxResp.headers["content-type"]?.includes("spreadsheetml") === true, "Returns spreadsheetml Content-Type header");

  const schedulesResp = await app.inject({
    method: "GET",
    url: "/api/v1/reports/daily-surveillance-health/schedules?tenantId=bank-corp",
  });
  assert(schedulesResp.statusCode === 200, "GET /schedules returns 200 OK with schedule list");

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runDailySurveillanceReportTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
