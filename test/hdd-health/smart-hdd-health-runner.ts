/**
 * First-Class SMART & Enterprise HDD Health Monitoring - Verification Test Runner
 */

import { DiskHealthEvaluator } from "../../backend/src/storage/evaluation/disk-health.evaluator.js";
import { EvidenceFusionService } from "../../backend/src/storage/evaluation/evidence-fusion.service.js";
import { DiskFailurePredictor } from "../../backend/src/storage/prediction/disk-failure-predictor.js";
import { DiskHealthService } from "../../backend/src/storage/services/disk-health.service.js";
import { SmartctlDiskCollector } from "../../backend/src/storage/collectors/smartctl-disk.collector.js";
import { registerStorageHealthRoutes } from "../../src/routes/storage-health.routes.js";
import { parseSmartctlJson } from "../../edge-agent/src/monitoring/storage/smartctl-parser.js";
import Fastify from "fastify";
import type { DiskEvidence } from "../../backend/src/storage/domain/disk-evidence.js";

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

async function runSmartHddHealthTests() {
  console.log("================================================================================");
  console.log("  SMART & ENTERPRISE HDD HEALTH MONITORING - VERIFICATION TEST RUNNER");
  console.log("================================================================================\n");

  const evaluator = new DiskHealthEvaluator();
  const fusion = new EvidenceFusionService();
  const predictor = new DiskFailurePredictor();
  const service = new DiskHealthService();
  const collector = new SmartctlDiskCollector();

  // --------------------------------------------------------------------------
  // Suite 1: Deterministic Health Evaluation & Precedence
  // --------------------------------------------------------------------------
  console.log("Suite 1: Deterministic Health Evaluation & Precedence");

  // Critical Scenario: SMART PASSED, but 14 pending sectors -> MUST BE CRITICAL
  const sampleEvidenceWithPending: DiskEvidence = {
    diskId: "disk-test-01",
    recorderId: "rec-01",
    branchId: "branch-101",
    slot: 1,
    state: "HEALTHY",
    smartStatus: "PASSED",
    recorderReportedState: "NORMAL",
    pendingSectors: 14,
    reallocatedSectors: 0,
    source: "SMARTCTL",
    confidence: 0.98,
    observedAt: new Date(),
  };

  const snap1 = evaluator.evaluate(sampleEvidenceWithPending);
  assert(snap1.state === "CRITICAL", "SMART PASSED with 14 pending sectors evaluates to CRITICAL (not suppressed!)");
  assert(snap1.healthScore <= 60, "Health score drops below 60 on critical pending sectors");
  assert(snap1.reasons.some((r) => r.code === "PENDING_SECTORS_CRITICAL"), "Includes PENDING_SECTORS_CRITICAL reason code");

  // Missing disk scenario
  const missingEvidence: DiskEvidence = {
    ...sampleEvidenceWithPending,
    state: "MISSING",
  };
  const snapMissing = evaluator.evaluate(missingEvidence);
  assert(snapMissing.state === "MISSING", "Missing physical disk evaluates to MISSING");
  assert(snapMissing.healthScore === 0, "Missing physical disk assigns 0 health score");

  // Hard SMART failure scenario
  const smartFailedEvidence: DiskEvidence = {
    ...sampleEvidenceWithPending,
    smartStatus: "FAILED",
    pendingSectors: 0,
  };
  const snapSmartFail = evaluator.evaluate(smartFailedEvidence);
  assert(snapSmartFail.state === "FAILED", "Hard SMART failure evaluates to FAILED");

  // Thermal critical scenario (62 C)
  const thermalCritEvidence: DiskEvidence = {
    ...sampleEvidenceWithPending,
    pendingSectors: 0,
    temperatureC: 62,
  };
  const snapThermal = evaluator.evaluate(thermalCritEvidence);
  assert(snapThermal.state === "CRITICAL", "Temperature 62°C evaluates to CRITICAL (threshold >= 60°C)");

  // --------------------------------------------------------------------------
  // Suite 2: Evidence Fusion & Source Priority
  // --------------------------------------------------------------------------
  console.log("\nSuite 2: Evidence Fusion & Source Priority");

  const recorderEvidence: DiskEvidence = {
    diskId: "rec-01-disk-1",
    recorderId: "rec-01",
    branchId: "branch-101",
    slot: 1,
    serialNumber: "WD-SERIAL-100",
    model: "WD Purple",
    totalBytes: 8_000_000_000_000,
    usedBytes: 4_000_000_000_000,
    freeBytes: 4_000_000_000_000,
    usagePercent: 50,
    state: "HEALTHY",
    recorderReportedState: "NORMAL",
    smartStatus: "UNAVAILABLE",
    source: "RECORDER_API",
    confidence: 0.80,
    observedAt: new Date(),
  };

  const smartctlEvidence: DiskEvidence = {
    diskId: "rec-01-WD-SERIAL-100",
    recorderId: "rec-01",
    branchId: "branch-101",
    slot: 1,
    serialNumber: "WD-SERIAL-100",
    model: "WD Purple WD82PURZ",
    totalBytes: 8_000_000_000_000,
    state: "CRITICAL",
    smartStatus: "FAILED",
    temperatureC: 48,
    pendingSectors: 20,
    reallocatedSectors: 35,
    source: "SMARTCTL",
    confidence: 0.98,
    observedAt: new Date(),
  };

  const fused = fusion.fuse([recorderEvidence, smartctlEvidence]);
  assert(fused.state === "FAILED" || fused.state === "CRITICAL", "SMARTCTL hard failure overrides Recorder API Normal");
  assert(fused.smartStatus === "FAILED", "Fused SMART status resolves to FAILED");
  assert(fused.pendingSectors === 20, "Fused pending sectors retains maximum observed (20)");
  assert(fused.serialNumber === "WD-SERIAL-100", "Physical identity resolved via serial number");

  // --------------------------------------------------------------------------
  // Suite 3: Derivative Trends & Failure Predictor
  // --------------------------------------------------------------------------
  console.log("\nSuite 3: Derivative Trends & Failure Predictor");

  const trendHistory = [
    { metric: "pendingSectors", current: 9, delta24h: 7, accelerating: true },
    { metric: "reallocatedSectors", current: 18, delta7d: 12, accelerating: true },
  ];

  const highRiskEvidence: DiskEvidence = {
    diskId: "disk-risk-01",
    recorderId: "rec-01",
    branchId: "branch-101",
    state: "WARNING",
    smartStatus: "PASSED",
    pendingSectors: 9,
    reallocatedSectors: 18,
    temperatureC: 56,
    powerOnHours: 36000,
    source: "SMARTCTL",
    confidence: 0.98,
    observedAt: new Date(),
  };

  const pred = predictor.predict(highRiskEvidence, { trends: trendHistory, arrayDegraded: true });
  assert(pred.failureProbability >= 0.70, `Accelerating pending sectors calculates high failure probability >= 0.70 (got ${pred.failureProbability})`);
  assert(pred.risk === "HIGH" || pred.risk === "CRITICAL", "Classified as HIGH or CRITICAL failure risk");
  assert(pred.reasons.length >= 3, "Explains multi-factor contributing risk reasons");

  // --------------------------------------------------------------------------
  // Suite 4: Edge Agent smartctl JSON Parser
  // --------------------------------------------------------------------------
  console.log("\nSuite 4: Edge Agent smartctl JSON Parser");

  const sampleSmartctlOutput = {
    model_name: "WD Purple WD82PURZ",
    serial_number: "WX32A8921",
    firmware_version: "82.00A82",
    user_capacity: { bytes: 8000000000000 },
    smart_status: { passed: true },
    temperature: { current: 48 },
    power_on_time: { hours: 24300 },
    power_cycle_count: 14,
    ata_smart_attributes: {
      table: [
        { id: 5, name: "Reallocated_Sector_Ct", value: 98, worst: 98, thresh: 50, raw: { value: 2, string: "2" } },
        { id: 194, name: "Temperature_Celsius", value: 52, worst: 45, thresh: 0, raw: { value: 48, string: "48" } },
        { id: 197, name: "Current_Pending_Sector", value: 97, worst: 97, thresh: 0, raw: { value: 3, string: "3" } },
        { id: 198, name: "Offline_Uncorrectable", value: 100, worst: 100, thresh: 0, raw: { value: 0, string: "0" } },
      ],
    },
  };

  const parsed = parseSmartctlJson(sampleSmartctlOutput, "/dev/sdb");
  assert(parsed.model === "WD Purple WD82PURZ", "Extracts model name correctly");
  assert(parsed.serialNumber === "WX32A8921", "Extracts serial number");
  assert(parsed.pendingSectors === 3, "Extracts pending sectors (3)");
  assert(parsed.reallocatedSectors === 2, "Extracts reallocated sectors (2)");
  assert(parsed.temperatureCelsius === 48, "Extracts temperature in Celsius (48°C)");
  assert(parsed.attributes.length === 4, "Extracts 4 individual SMART attributes");

  // --------------------------------------------------------------------------
  // Suite 5: Backend REST Storage Control-Plane Routes
  // --------------------------------------------------------------------------
  console.log("\nSuite 5: Backend REST Storage Control-Plane Routes");

  const app = Fastify();
  await registerStorageHealthRoutes(app, undefined, service);

  // 1. List all disks
  const listRes = await app.inject({ method: "GET", url: "/v1/storage/disks" });
  assert(listRes.statusCode === 200, "GET /v1/storage/disks returns 200 OK");
  const listBody = JSON.parse(listRes.body);
  assert(listBody.data.length >= 2, "Returns list of monitored physical disks");

  // 2. Get specific disk
  const diskRes = await app.inject({ method: "GET", url: `/v1/storage/disks/${listBody.data[0].diskId}` });
  assert(diskRes.statusCode === 200, "GET /v1/storage/disks/:id returns 200 OK");

  // 3. Get SMART attributes
  const smartRes = await app.inject({ method: "GET", url: `/v1/storage/disks/${listBody.data[0].diskId}/smart` });
  assert(smartRes.statusCode === 200, "GET /v1/storage/disks/:id/smart returns attributes table");

  // 4. Get Recorder Storage Aggregation
  const recRes = await app.inject({ method: "GET", url: "/v1/recorders/rec-branch-178-01/storage" });
  assert(recRes.statusCode === 200, "GET /v1/recorders/:id/storage returns 200 OK");
  const recBody = JSON.parse(recRes.body);
  assert(recBody.totalDisks >= 2, "Recorder storage aggregates total disks");
  assert(recBody.impact?.retentionRequirementDays === 90, "Includes recording impact retention requirement (90 days)");

  // 5. Get Fleet Summary
  const fleetRes = await app.inject({ method: "GET", url: "/v1/storage/fleet/summary" });
  assert(fleetRes.statusCode === 200, "GET /v1/storage/fleet/summary returns 200 OK");
  const fleetBody = JSON.parse(fleetRes.body);
  assert(fleetBody.totalDisks >= 2, "Fleet summary reports total disks");

  // 6. Get At-Risk Fleet Disks
  const risksRes = await app.inject({ method: "GET", url: "/v1/storage/fleet/risks" });
  assert(risksRes.statusCode === 200, "GET /v1/storage/fleet/risks returns at-risk disk list");

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

runSmartHddHealthTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
