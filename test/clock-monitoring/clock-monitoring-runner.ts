/**
 * Clock & Time-Drift Monitoring - Verification Test Runner
 */

import { ClockOffsetEstimator } from "../../src/clock-monitoring/services/clock-offset-estimator.js";
import { ClockMonitoringService } from "../../src/clock-monitoring/services/clock-monitoring.service.js";
import { registerClockMonitoringRoutes } from "../../src/routes/clock-monitoring.routes.js";
import Fastify from "fastify";

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

async function runClockMonitoringTests() {
  console.log("================================================================================");
  console.log("  CLOCK & TIME-DRIFT MONITORING - VERIFICATION TEST RUNNER");
  console.log("================================================================================\n");

  const service = new ClockMonitoringService();
  const now = new Date();

  // --------------------------------------------------------------------------
  // Suite 1: Latency-Compensated Offset Estimation
  // --------------------------------------------------------------------------
  console.log("Suite 1: Latency-Compensated Offset Estimation");

  // RTT = 40ms, Midpoint = T_start + 20ms
  // Device time is 1,200ms ahead of Midpoint -> Offset = 1.20s
  const sample1 = {
    startTimestampMs: 1000,
    endTimestampMs: 1040, // 40ms RTT, midpoint = 1020
    deviceTimestamp: new Date(2220), // 2220 - 1020 = 1200ms = 1.20s
    roundTripTimeMs: 40,
  };
  const res1 = ClockOffsetEstimator.estimateSingle(sample1);
  assert(res1.signedOffsetSeconds === 1.2, `Calculates exact latency-adjusted offset 1.20s (got ${res1.signedOffsetSeconds}s)`);
  assert(res1.healthState === "SYNCHRONIZED", "Offset 1.2s evaluates to SYNCHRONIZED (threshold <= 5s)");

  // Multi-sample median filter
  const multiSamples = [
    { startTimestampMs: 1000, endTimestampMs: 1020, deviceTimestamp: new Date(2010), roundTripTimeMs: 20 }, // 1.00s
    { startTimestampMs: 1000, endTimestampMs: 1020, deviceTimestamp: new Date(2012), roundTripTimeMs: 20 }, // 1.00s
    { startTimestampMs: 1000, endTimestampMs: 1020, deviceTimestamp: new Date(3500), roundTripTimeMs: 20 }, // Jitter spike (2.49s)
  ];
  const resMulti = ClockOffsetEstimator.estimateMulti(multiSamples);
  assert(resMulti.signedOffsetSeconds === 1.0, `Multi-sample median rejects transient jitter spike (got ${resMulti.signedOffsetSeconds}s)`);

  // --------------------------------------------------------------------------
  // Suite 2: Operational Thresholds & Classifications
  // --------------------------------------------------------------------------
  console.log("\nSuite 2: Operational Thresholds & Classifications");

  assert(ClockOffsetEstimator.classifyHealthState(2.5) === "SYNCHRONIZED", "2.5s offset is SYNCHRONIZED");
  assert(ClockOffsetEstimator.classifyHealthState(14.5) === "WARNING", "14.5s offset is WARNING (> 5s)");
  assert(ClockOffsetEstimator.classifyHealthState(48.0) === "CRITICAL", "48.0s offset is CRITICAL (> 30s)");
  assert(ClockOffsetEstimator.classifyHealthState(-35.0) === "CRITICAL", "Negative -35.0s offset is CRITICAL");

  // --------------------------------------------------------------------------
  // Suite 3: Derivative Drift Rate Calculation
  // --------------------------------------------------------------------------
  console.log("\nSuite 3: Derivative Drift Rate Calculation");

  // Device gained 6 seconds over a 2-hour window -> 3.00 sec/hour
  const prevObs = { offsetSeconds: 2.0, observedAt: new Date(now.getTime() - 2 * 3600_000) };
  const currObs = { offsetSeconds: 8.0, observedAt: now };
  const driftRate = ClockOffsetEstimator.calculateDriftRate(prevObs, currObs);
  assert(driftRate === 3.0, `Calculates exact drift rate of 3.00 sec/hour (got ${driftRate})`);

  // --------------------------------------------------------------------------
  // Suite 4: Timezone Mismatch & NTP Whitelist Detection
  // --------------------------------------------------------------------------
  console.log("\nSuite 4: Timezone Mismatch & NTP Whitelist Detection");

  // 19,800s offset = 5.5 hours (IST vs UTC)
  assert(ClockOffsetEstimator.detectTimezoneMismatch(19800) === true, "Detects 5.5h discrepancy as timezone mismatch");
  assert(ClockOffsetEstimator.detectTimezoneMismatch(3600) === true, "Detects 1.0h discrepancy as timezone/DST mismatch");
  assert(ClockOffsetEstimator.detectTimezoneMismatch(14.5) === false, "Normal 14.5s drift is not flagged as timezone mismatch");

  // --------------------------------------------------------------------------
  // Suite 5: Branch Clock Health Roll-Up & Camera-Recorder Comparison
  // --------------------------------------------------------------------------
  console.log("\nSuite 5: Branch Clock Health Roll-Up & Camera-Recorder Comparison");

  const thrissur = await service.getBranchClockHealth("branch-thrissur-14");
  assert(thrissur !== null, "Retrieves Thrissur 14 branch clock health");
  assert(thrissur?.overallState === "SYNCHRONIZED", "Thrissur 14 overall state is SYNCHRONIZED");
  assert(thrissur?.recorders.length === 1, "Contains 1 recorder");
  assert(thrissur?.cameras.length === 1, "Contains 1 camera");
  assert(thrissur?.cameraRecorderComparisons.length === 1, "Calculates Camera vs Recorder cross-comparison");
  assert(thrissur?.cameraRecorderComparisons[0]?.relativeOffsetSeconds === 0.4, "Relative camera-to-recorder delta is 0.4s");

  const kannur = await service.getBranchClockHealth("branch-kannur-04");
  assert(kannur?.overallState === "CRITICAL", "Kannur 04 branch is marked CRITICAL due to 48s recorder drift");
  assert(kannur?.criticalDevicesCount === 1, "Tracks 1 critical device");

  // --------------------------------------------------------------------------
  // Suite 6: Audited Clock Remediation Action
  // --------------------------------------------------------------------------
  console.log("\nSuite 6: Audited Clock Remediation Action");

  const syncRes = await service.syncDeviceClock({
    deviceId: "nvr-kannur-04",
    branchId: "branch-kannur-04",
    action: "NTP_TRIGGER",
    initiatedByUserId: "user-soc-operator-01",
    reason: "Correcting 48s drift for forensic integrity",
  });

  assert(syncRes.success === true, "Clock sync action executed successfully");
  assert(syncRes.auditEntry.previousOffsetSeconds === 48.0, "Audit entry records previous offset 48.0s");
  assert(syncRes.auditEntry.newOffsetSeconds === 0.05, "Audit entry records new offset 0.05s");
  assert(syncRes.auditEntry.initiatedByUserId === "user-soc-operator-01", "Audit entry records user ID");

  const auditLogs = await service.listAuditEntries();
  assert(auditLogs.length >= 1, "Audit log contains record of sync action");

  // --------------------------------------------------------------------------
  // Suite 7: Backend REST Control-Plane Endpoints
  // --------------------------------------------------------------------------
  console.log("\nSuite 7: Backend REST Control-Plane Endpoints");

  const app = Fastify();
  await registerClockMonitoringRoutes(app, undefined, service);

  // 1. GET /v1/clock-health/branches/:id
  const branchRes = await app.inject({ method: "GET", url: "/v1/clock-health/branches/branch-thrissur-14" });
  assert(branchRes.statusCode === 200, "GET /v1/clock-health/branches/:id returns 200 OK");
  const branchData = JSON.parse(branchRes.body);
  assert(branchData.data.overallState === "SYNCHRONIZED", "Returns branch clock health");

  // 2. GET /v1/clock-health/fleet/summary
  const fleetRes = await app.inject({ method: "GET", url: "/v1/clock-health/fleet/summary" });
  assert(fleetRes.statusCode === 200, "GET /v1/clock-health/fleet/summary returns 200 OK");
  const fleetData = JSON.parse(fleetRes.body);
  assert(fleetData.data.totalBranches >= 3, "Summary contains total branches count");

  // 3. GET /v1/clock-health/devices/:id/history
  const histRes = await app.inject({ method: "GET", url: "/v1/clock-health/devices/cam-thrissur-01/history" });
  assert(histRes.statusCode === 200, "GET /v1/clock-health/devices/:id/history returns 200 OK");

  // 4. POST /v1/clock-health/poll
  const pollRes = await app.inject({
    method: "POST",
    url: "/v1/clock-health/poll",
    payload: {
      deviceId: "cam-test-new",
      deviceName: "New Branch CAM",
      deviceType: "CAMERA",
      branchId: "branch-thrissur-14",
      signedOffsetSeconds: 1.1,
    },
  });
  assert(pollRes.statusCode === 200, "POST /v1/clock-health/poll returns 200 OK");

  // 5. GET /v1/clock-health/audit
  const auditRes = await app.inject({ method: "GET", url: "/v1/clock-health/audit" });
  assert(auditRes.statusCode === 200, "GET /v1/clock-health/audit returns 200 OK");

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

runClockMonitoringTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
