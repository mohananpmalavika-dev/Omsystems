/**
 * Capability-Aware Device Health & Evidence Model - Automated Verification Runner
 */

import {
  deviceCapabilityRegistry,
  deviceEvidenceStore,
  healthEvaluatorEngine,
  deviceHealthService,
} from "../../src/device-health/index.js";
import { app } from "../../src/app.js";

async function runDeviceHealthCapabilityTests() {
  console.log("================================================================================");
  console.log("  CAPABILITY-AWARE DEVICE HEALTH - COMPREHENSIVE VERIFICATION RUNNER");
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

  // Suite 1: Capability Registry & CP PLUS Fingerprinting
  console.log("Suite 1: Capability Registry & CP PLUS Fingerprinting");
  const cpProfile = deviceCapabilityRegistry.getOrCreateProfile("rec-aluva-017", "CP PLUS", "CP-UNR-4K4322-V2");
  assert(cpProfile.manufacturer === "CP PLUS", "Profile manufacturer is CP PLUS");
  assert(cpProfile.apiFamily === "DAHUA_CGI", "Profile maps to DAHUA_CGI API family");

  const fanCap = cpProfile.capabilities.find((c) => c.capability === "FAN_SPEED");
  assert(fanCap?.support === "UNSUPPORTED", "FAN_SPEED is explicitly marked UNSUPPORTED on CP PLUS");

  const smartCap = cpProfile.capabilities.find((c) => c.capability === "SMART_STATUS");
  assert(smartCap?.support === "PARTIAL", "SMART_STATUS is marked PARTIAL support");

  const recCap = cpProfile.capabilities.find((c) => c.capability === "RECORDING_STATUS");
  assert(recCap?.support === "SUPPORTED" && recCap.importance === "REQUIRED", "RECORDING_STATUS is SUPPORTED and REQUIRED");

  // Suite 2: Strict Invariant Enforcement (NO EVIDENCE ≠ HEALTHY & UNSUPPORTED ≠ UNKNOWN)
  console.log("\nSuite 2: Strict Invariant Enforcement (NO EVIDENCE ≠ HEALTHY & UNSUPPORTED ≠ UNKNOWN)");
  const fanMetric = healthEvaluatorEngine.evaluateMetric(fanCap!, undefined);
  assert(fanMetric.healthState === "UNSUPPORTED", "Unsupported capability evaluates to UNSUPPORTED state");
  assert(fanMetric.message.includes("Not supported"), "Includes explicit 'Not supported' message");

  const missingRecMetric = healthEvaluatorEngine.evaluateMetric(recCap!, undefined);
  assert(missingRecMetric.healthState === "UNKNOWN", "Missing required evidence evaluates to UNKNOWN, not HEALTHY");
  assert(missingRecMetric.message.includes("unavailable"), "Explains evidence is unavailable");

  // Suite 3: Freshness & Stale Evidence Demotion
  console.log("\nSuite 3: Freshness & Stale Evidence Demotion");
  deviceEvidenceStore.clear();

  const now = new Date();
  const freshEvidence = {
    deviceId: "rec-aluva-017",
    capability: "STORAGE_STATUS" as const,
    status: "AVAILABLE" as const,
    value: "NORMAL",
    source: "RECORDER_API" as const,
    observedAt: now,
    collectedAt: now,
  };
  deviceEvidenceStore.put(freshEvidence);

  const freshItem = deviceEvidenceStore.get("rec-aluva-017", "STORAGE_STATUS", now);
  assert(freshItem?.status === "AVAILABLE", "Recent evidence is classified as AVAILABLE");

  // Stale evidence 10 minutes (600s) later (TTL is 300s)
  const tenMinutesLater = new Date(now.getTime() + 600_000);
  const staleItem = deviceEvidenceStore.get("rec-aluva-017", "STORAGE_STATUS", tenMinutesLater);
  assert(staleItem?.status === "STALE", "Expired evidence automatically transitions to STALE status");

  const storageCap = cpProfile.capabilities.find((c) => c.capability === "STORAGE_STATUS")!;
  const staleMetric = healthEvaluatorEngine.evaluateMetric(storageCap, staleItem, tenMinutesLater);
  assert(staleMetric.healthState === "UNKNOWN", "Stale evidence evaluates to UNKNOWN health state");
  assert(staleMetric.message.includes("stale"), "Explains evidence is stale with elapsed duration");

  // Suite 4: Domain Evaluation Rules across Capabilities
  console.log("\nSuite 4: Domain Evaluation Rules across Capabilities");
  const tempCap = cpProfile.capabilities.find((c) => c.capability === "DEVICE_TEMPERATURE")!;

  const normalTempMetric = healthEvaluatorEngine.evaluateMetric(tempCap, {
    deviceId: "rec-aluva-017",
    capability: "DEVICE_TEMPERATURE",
    status: "AVAILABLE",
    value: 57,
    source: "RECORDER_API",
    observedAt: now,
    collectedAt: now,
  });
  assert(normalTempMetric.healthState === "HEALTHY", "57°C evaluates to HEALTHY temperature");

  const highTempMetric = healthEvaluatorEngine.evaluateMetric(tempCap, {
    deviceId: "rec-aluva-017",
    capability: "DEVICE_TEMPERATURE",
    status: "AVAILABLE",
    value: 72,
    source: "RECORDER_API",
    observedAt: now,
    collectedAt: now,
  });
  assert(highTempMetric.healthState === "WARNING", "72°C evaluates to WARNING temperature");

  const critTempMetric = healthEvaluatorEngine.evaluateMetric(tempCap, {
    deviceId: "rec-aluva-017",
    capability: "DEVICE_TEMPERATURE",
    status: "AVAILABLE",
    value: 84,
    source: "RECORDER_API",
    observedAt: now,
    collectedAt: now,
  });
  assert(critTempMetric.healthState === "FAILURE", "84°C evaluates to FAILURE temperature");

  const timeCap = cpProfile.capabilities.find((c) => c.capability === "TIME_DRIFT")!;
  const severeDriftMetric = healthEvaluatorEngine.evaluateMetric(timeCap, {
    deviceId: "rec-aluva-017",
    capability: "TIME_DRIFT",
    status: "AVAILABLE",
    value: 137,
    source: "RECORDER_API",
    observedAt: now,
    collectedAt: now,
  });
  assert(severeDriftMetric.healthState === "FAILURE", "137s clock drift evaluates to FAILURE");
  assert(severeDriftMetric.message.includes("137"), "Includes exact drift measurement in message");

  const retCap = cpProfile.capabilities.find((c) => c.capability === "RETENTION_VERIFICATION")!;
  const retMetric = healthEvaluatorEngine.evaluateMetric(retCap, {
    deviceId: "rec-aluva-017",
    capability: "RETENTION_VERIFICATION",
    status: "AVAILABLE",
    value: { requiredDays: 90, actualDays: 61.4 },
    source: "RECORDER_API",
    observedAt: now,
    collectedAt: now,
  });
  assert(retMetric.healthState === "FAILURE", "61.4/90d retention evaluates to FAILURE");
  assert(retMetric.message.includes("28.6d deficit"), "Computes retention deficit accurately");

  // Suite 5: CP PLUS Realistic Comprehensive Health Snapshot
  console.log("\nSuite 5: CP PLUS Realistic Comprehensive Health Snapshot");
  deviceEvidenceStore.clear();

  // Ingest full CP PLUS telemetry from the user prompt scenario
  deviceHealthService.ingestEvidenceBatch([
    {
      deviceId: "rec-aluva-017",
      capability: "DEVICE_ONLINE",
      status: "AVAILABLE",
      value: true,
      source: "RECORDER_API",
      observedAt: now,
      collectedAt: now,
    },
    {
      deviceId: "rec-aluva-017",
      capability: "CHANNEL_STATUS",
      status: "AVAILABLE",
      value: { total: 16, connected: 15 },
      source: "RECORDER_API",
      observedAt: now,
      collectedAt: now,
    },
    {
      deviceId: "rec-aluva-017",
      capability: "STREAM_STATUS",
      status: "AVAILABLE",
      value: { total: 16, connected: 15 },
      source: "RECORDER_API",
      observedAt: now,
      collectedAt: now,
    },
    {
      deviceId: "rec-aluva-017",
      capability: "RECORDING_STATUS",
      status: "AVAILABLE",
      value: { total: 16, recording: 14 },
      source: "RECORDER_API",
      observedAt: now,
      collectedAt: now,
    },
    {
      deviceId: "rec-aluva-017",
      capability: "STORAGE_STATUS",
      status: "AVAILABLE",
      value: "NORMAL",
      source: "RECORDER_API",
      observedAt: now,
      collectedAt: now,
    },
    {
      deviceId: "rec-aluva-017",
      capability: "RETENTION_VERIFICATION",
      status: "AVAILABLE",
      value: { requiredDays: 90, actualDays: 61.4 },
      source: "RECORDER_API",
      observedAt: now,
      collectedAt: now,
    },
    {
      deviceId: "rec-aluva-017",
      capability: "FIRMWARE_VERSION",
      status: "AVAILABLE",
      value: "4.001.0000000.2.R",
      source: "RECORDER_API",
      observedAt: now,
      collectedAt: now,
    },
    {
      deviceId: "rec-aluva-017",
      capability: "NTP_STATUS",
      status: "AVAILABLE",
      value: "ENABLED",
      source: "RECORDER_API",
      observedAt: now,
      collectedAt: now,
    },
    {
      deviceId: "rec-aluva-017",
      capability: "TIME_DRIFT",
      status: "AVAILABLE",
      value: 137,
      source: "RECORDER_API",
      observedAt: now,
      collectedAt: now,
    },
  ]);

  const snapshot = deviceHealthService.getHealthSnapshot("rec-aluva-017", "bank-corp", {
    branchId: "branch-178",
    branchName: "Aluva Main Branch",
  });

  assert(snapshot.overallState === "FAILURE", "Overall headline state evaluates to FAILURE due to retention deficit & clock drift");
  assert(snapshot.criticalFailures >= 2, "Tracks 2 critical failure dimensions");
  assert(snapshot.warnings >= 2, "Tracks warning dimensions (15/16 channels, 14/16 recording)");
  assert(snapshot.unsupporteds === 1, "Tracks 1 UNSUPPORTED metric (Fan Speed)");
  assert(snapshot.unknowns >= 1, "Tracks UNKNOWN metrics (SMART, Device Temperature)");
  assert(snapshot.headlineReasons.length > 0, "Provides human-readable headline reasons");

  // Suite 6: Fastify REST API Endpoints Verification
  console.log("\nSuite 6: Fastify REST API Endpoints Verification");
  await app.ready();

  const capResp = await app.inject({
    method: "GET",
    url: "/api/v1/devices/rec-aluva-017/capabilities",
  });
  assert(capResp.statusCode === 200, "GET /api/v1/devices/:id/capabilities returns 200 OK");
  const capData = JSON.parse(capResp.body).data;
  assert(capData.capabilities.length >= 10, "Returns full capability profile");

  const snapResp = await app.inject({
    method: "GET",
    url: "/api/v1/devices/rec-aluva-017/health-snapshot?branchId=branch-178",
  });
  assert(snapResp.statusCode === 200, "GET /api/v1/devices/:id/health-snapshot returns 200 OK");
  const snapData = JSON.parse(snapResp.body).data;
  assert(snapData.overallState === "FAILURE", "REST response returns calculated FAILURE overallState");
  assert(snapData.metrics.some((m: any) => m.capability === "FAN_SPEED" && m.healthState === "UNSUPPORTED"), "REST response contains UNSUPPORTED Fan Speed");
  assert(snapData.metrics.some((m: any) => m.capability === "RETENTION_VERIFICATION" && m.healthState === "FAILURE"), "REST response contains FAILURE Retention");

  const branchSummaryResp = await app.inject({
    method: "GET",
    url: "/api/v1/branches/branch-178/devices-health?deviceIds=rec-aluva-017",
  });
  assert(branchSummaryResp.statusCode === 200, "GET /api/v1/branches/:id/devices-health returns 200 OK");
  const branchData = JSON.parse(branchSummaryResp.body).data;
  assert(branchData.overallState === "FAILURE", "Branch-level summary calculates FAILURE overallState");

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runDeviceHealthCapabilityTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
