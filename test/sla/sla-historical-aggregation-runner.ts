/**
 * Historical SLA Metrics & Daily Health Aggregation - Verification Test Runner
 */

import { AvailabilityCalculator } from "../../src/sla/services/availability-calculator.js";
import { DailyBranchHealthAggregatorService } from "../../src/sla/services/daily-branch-health-aggregator.service.js";
import { registerSlaReportRoutes } from "../../src/routes/sla-reports.routes.js";
import Fastify from "fastify";
import type { HealthInterval } from "../../src/sla/domain/sla.types.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${name}`);
    failed++;
  }
}

async function runSlaHistoricalTests() {
  console.log("================================================================================");
  console.log("  HISTORICAL SLA METRICS & AGGREGATION - VERIFICATION TEST RUNNER");
  console.log("================================================================================\n");

  const service = new DailyBranchHealthAggregatorService();
  const dayStart = new Date("2026-08-15T00:00:00.000Z");
  const dayEnd = new Date("2026-08-15T23:59:59.999Z");

  // --------------------------------------------------------------------------
  // Suite 1: Duration-Based Availability Math
  // --------------------------------------------------------------------------
  console.log("Suite 1: Duration-Based Availability Math");

  // 1. Camera with 8-minute outage (1432 / 1440 min = 99.44%)
  const intervals1: HealthInterval[] = [
    { entityId: "cam-01", entityType: "CAMERA", state: "HEALTHY", startedAt: dayStart, endedAt: new Date("2026-08-15T11:43:00.000Z") },
    { entityId: "cam-01", entityType: "CAMERA", state: "FAILED", startedAt: new Date("2026-08-15T11:43:00.000Z"), endedAt: new Date("2026-08-15T11:51:00.000Z") },
    { entityId: "cam-01", entityType: "CAMERA", state: "HEALTHY", startedAt: new Date("2026-08-15T11:51:00.000Z"), endedAt: dayEnd },
  ];
  const res1 = AvailabilityCalculator.calculate(intervals1, dayStart, dayEnd);
  assert(res1.unavailableSeconds === 480, "Records 480 seconds (8 min) unavailable time");
  assert(res1.availabilityPct === 99.44, `Computes exact 99.44% availability (got ${res1.availabilityPct}%)`);
  assert(res1.monitoringCoveragePct === 100, "Full 100% monitoring coverage");

  // 2. Maintenance window exclusion (30 min maintenance window excluded from downtime)
  const maintIntervals: HealthInterval[] = [
    { entityId: "nvr-01", entityType: "RECORDER", state: "HEALTHY", startedAt: dayStart, endedAt: new Date("2026-08-15T02:00:00.000Z") },
    { entityId: "nvr-01", entityType: "RECORDER", state: "FAILED", startedAt: new Date("2026-08-15T02:00:00.000Z"), endedAt: new Date("2026-08-15T02:30:00.000Z") },
    { entityId: "nvr-01", entityType: "RECORDER", state: "HEALTHY", startedAt: new Date("2026-08-15T02:30:00.000Z"), endedAt: dayEnd },
  ];
  const resMaint = AvailabilityCalculator.calculate(maintIntervals, dayStart, dayEnd, [
    { startAt: new Date("2026-08-15T02:00:00.000Z"), endAt: new Date("2026-08-15T02:30:00.000Z") },
  ]);
  assert(resMaint.unavailableSeconds === 0, "Approved maintenance window excluded from downtime");
  assert(resMaint.availabilityPct === 100.0, "Availability is 100% after approved maintenance exclusion");

  // --------------------------------------------------------------------------
  // Suite 2: Duration-Based Weighting (Never Average Percentages)
  // --------------------------------------------------------------------------
  console.log("\nSuite 2: Duration-Based Weighting (Never Average Percentages)");

  // Camera A: 10h available (36,000s)
  // Camera B: 1h available + 1h failed (total 2h monitored = 7,200s, 50% available)
  // Total available = 39,600s, Total monitored = 43,200s -> Availability = 39,600 / 43,200 = 91.67% (NOT (100+50)/2 = 75%)
  const camA: HealthInterval[] = [{ entityId: "camA", entityType: "CAMERA", state: "HEALTHY", startedAt: dayStart, endedAt: new Date(dayStart.getTime() + 10 * 3600_000) }];
  const camB: HealthInterval[] = [
    { entityId: "camB", entityType: "CAMERA", state: "HEALTHY", startedAt: dayStart, endedAt: new Date(dayStart.getTime() + 1 * 3600_000) },
    { entityId: "camB", entityType: "CAMERA", state: "FAILED", startedAt: new Date(dayStart.getTime() + 1 * 3600_000), endedAt: new Date(dayStart.getTime() + 2 * 3600_000) },
  ];
  const resA = AvailabilityCalculator.calculate(camA, dayStart, new Date(dayStart.getTime() + 10 * 3600_000));
  const resB = AvailabilityCalculator.calculate(camB, dayStart, new Date(dayStart.getTime() + 2 * 3600_000));
  const combinedPct = Math.round(((resA.availableSeconds + resB.availableSeconds) / (resA.monitoredSeconds + resB.monitoredSeconds)) * 10000) / 100;
  assert(combinedPct === 91.67, `Weighted duration math yields 91.67% instead of naive 75% average (got ${combinedPct}%)`);

  // --------------------------------------------------------------------------
  // Suite 3: Daily Branch Aggregation & Multi-Component Separation
  // --------------------------------------------------------------------------
  console.log("\nSuite 3: Daily Branch Aggregation & Multi-Component Separation");

  const cameraMap = new Map<string, HealthInterval[]>();
  cameraMap.set("cam-01", intervals1);
  cameraMap.set("cam-02", [{ entityId: "cam-02", entityType: "CAMERA", state: "HEALTHY", startedAt: dayStart, endedAt: dayEnd }]);

  const recordingMap = new Map<string, HealthInterval[]>();
  recordingMap.set("cam-01", [{ entityId: "cam-01", entityType: "RECORDING", state: "HEALTHY", startedAt: dayStart, endedAt: dayEnd }]);
  recordingMap.set("cam-02", [{ entityId: "cam-02", entityType: "RECORDING", state: "HEALTHY", startedAt: dayStart, endedAt: dayEnd }]);

  const branchAgg = await service.aggregateBranch({
    branchId: "branch-kochi-custom",
    branchName: "Kochi Marine Drive",
    regionId: "region-kochi",
    reportDate: "2026-08-15",
    windowStart: dayStart,
    windowEnd: dayEnd,
    cameraIntervals: cameraMap,
    recorderIntervals: [{ entityId: "nvr-01", entityType: "RECORDER", state: "HEALTHY", startedAt: dayStart, endedAt: dayEnd }],
    recordingIntervals: recordingMap,
    internetIntervals: [{ entityId: "wan-01", entityType: "INTERNET", state: "HEALTHY", startedAt: dayStart, endedAt: dayEnd }],
    retentionCounts: { compliant: 40, nonCompliant: 0, unknown: 0 },
    alerts: {
      p1Count: 1,
      p2Count: 5,
      p3Count: 10,
      p4Count: 20,
      acknowledgedCount: 6,
      resolvedCount: 6,
      p1Breaches: 0,
      p2Breaches: 0,
      meanAckSeconds: 24,
      meanResolutionSeconds: 380,
    },
  });

  assert(branchAgg.cameraAvailabilityPct !== null && branchAgg.cameraAvailabilityPct >= 99.0, "Computes camera availability pct");
  assert(branchAgg.recordingAvailabilityPct === 100.0, "Computes recording availability pct separately");
  assert(branchAgg.recorderAvailabilityPct === 100.0, "Computes recorder uptime separately");
  assert(branchAgg.internetAvailabilityPct === 100.0, "Computes internet availability separately");
  assert(branchAgg.retentionCompliancePct === 100.0, "Computes retention compliance pct");
  assert(branchAgg.meanAcknowledgeTimeSeconds === 24, "Records mean acknowledgement time (24s)");
  assert(branchAgg.slaStatus === "COMPLIANT", "Classifies branch as COMPLIANT with SLA targets");

  // --------------------------------------------------------------------------
  // Suite 4: Camera Daily Drill-Down Breakdown
  // --------------------------------------------------------------------------
  console.log("\nSuite 4: Camera Daily Drill-Down Breakdown");

  const cameraBreakdown = await service.getCameraDailyBreakdown("branch-kochi-custom", "2026-08-15");
  assert(cameraBreakdown.length === 2, "Stores per-camera daily records for drill-down");
  assert(cameraBreakdown.some((c) => c.cameraId === "cam-01" && c.unavailableSeconds === 480), "Per-camera record captures 480s outage on cam-01");

  // --------------------------------------------------------------------------
  // Suite 5: Fleet Weighted SLA Summary & 30-Day History
  // --------------------------------------------------------------------------
  console.log("\nSuite 5: Fleet Weighted SLA Summary & 30-Day History");

  const yesterdayStr = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  const fleet = await service.getFleetSummary(yesterdayStr);
  assert(fleet.totalBranches >= 3, "Summary aggregates across all branches");
  assert(fleet.overallCameraAvailabilityPct >= 99.0, "Calculates fleet-wide weighted camera availability");
  assert(fleet.overallRecordingAvailabilityPct >= 97.0, "Calculates fleet-wide recording availability");

  const history = await service.getBranchSlaHistory("branch-thrissur-14", 30);
  assert(history.length >= 1, "Returns historical time-series for trend charts");

  // --------------------------------------------------------------------------
  // Suite 6: Backend REST Control-Plane Endpoints
  // --------------------------------------------------------------------------
  console.log("\nSuite 6: Backend REST Control-Plane Endpoints");

  const app = Fastify();
  await registerSlaReportRoutes(app, undefined, service);

  // 1. GET /v1/sla/branches/daily
  const dailyRes = await app.inject({ method: "GET", url: "/v1/sla/branches/daily" });
  assert(dailyRes.statusCode === 200, "GET /v1/sla/branches/daily returns 200 OK");
  const dailyData = JSON.parse(dailyRes.body);
  assert(dailyData.data.length >= 3, "Returns list of daily branch aggregates");

  // 2. GET /v1/sla/branches/:id/history
  const histRes = await app.inject({ method: "GET", url: "/v1/sla/branches/branch-thrissur-14/history?days=30" });
  assert(histRes.statusCode === 200, "GET /v1/sla/branches/:id/history returns 200 OK");

  // 3. GET /v1/sla/fleet/summary
  const summaryRes = await app.inject({ method: "GET", url: `/v1/sla/fleet/summary?reportDate=${yesterdayStr}` });
  assert(summaryRes.statusCode === 200, "GET /v1/sla/fleet/summary returns 200 OK");

  // 4. GET /v1/sla/reports/daily-export (CSV)
  const csvRes = await app.inject({ method: "GET", url: `/v1/sla/reports/daily-export?reportDate=${yesterdayStr}&format=csv` });
  assert(csvRes.statusCode === 200, "GET /v1/sla/reports/daily-export?format=csv returns CSV");
  assert(csvRes.body.includes("branch_id,branch_name,camera_availability_pct"), "CSV contains SLA column headers");

  // --------------------------------------------------------------------------
  // Final Results
  // --------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runSlaHistoricalTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
