/**
 * Guaranteed Alert Evidence & Forensic Verification - Verification Test Runner
 */

import { EvidenceCapturePipelineService } from "../../src/evidence/services/evidence-capture-pipeline.service.js";
import { EvidenceHashVerifierService } from "../../src/evidence/services/evidence-hash-verifier.service.js";
import { registerEvidenceCaptureRoutes } from "../../src/routes/evidence-capture.routes.js";
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

async function runGuaranteedEvidenceTests() {
  console.log("================================================================================");
  console.log("  GUARANTEED EVIDENCE CAPTURE & VERIFICATION - VERIFICATION TEST RUNNER");
  console.log("================================================================================\n");

  const pipeline = new EvidenceCapturePipelineService();
  const now = new Date();

  // --------------------------------------------------------------------------
  // Suite 1: Policy-Driven Pre/Post-Event Durations
  // --------------------------------------------------------------------------
  console.log("Suite 1: Policy-Driven Pre/Post-Event Durations");

  const intrusionJob = await pipeline.enqueueEvidenceCapture({
    alertId: "alert-test-intrusion-01",
    tenantId: "tenant-bank-01",
    branchId: "branch-thrissur-14",
    cameraId: "cam-vault-01",
    alertType: "intrusion",
    severity: "P1",
    detectedAt: now,
  });

  assert(intrusionJob.preEventSeconds === 10, "P1 Intrusion applies 10s pre-event window");
  assert(intrusionJob.postEventSeconds === 30, "P1 Intrusion applies 30s post-event window");
  assert(intrusionJob.videoClip?.durationSeconds === 40, "Calculates exact 40s total clip duration (10s pre + 30s post)");

  // --------------------------------------------------------------------------
  // Suite 2: Immediate Snapshot Capture (T0)
  // --------------------------------------------------------------------------
  console.log("\nSuite 2: Immediate Snapshot Capture (T0)");

  assert(intrusionJob.snapshot !== undefined, "Captures immediate snapshot asset");
  assert(intrusionJob.snapshot?.type === "SNAPSHOT", "Snapshot asset is categorized as SNAPSHOT");
  assert(intrusionJob.snapshot?.verified === true, "Snapshot asset is verified");
  assert(intrusionJob.snapshot?.url.includes("/snapshot.jpg") === true, "Snapshot has clean storage URL");

  // --------------------------------------------------------------------------
  // Suite 3: Media Verification & SHA-256 Hashing
  // --------------------------------------------------------------------------
  console.log("\nSuite 3: Media Verification & SHA-256 Hashing");

  assert(intrusionJob.snapshot?.sha256.length === 64, "Calculates 64-character SHA-256 hex hash for snapshot");
  assert(intrusionJob.videoClip?.sha256.length === 64, "Calculates 64-character SHA-256 hex hash for video clip");

  const clipVerify = EvidenceHashVerifierService.verifyMediaAsset({
    data: Buffer.from("DUMMY_MP4_DATA_1234567890"),
    expectedMinSizeBytes: 10,
    expectedMinDurationSeconds: 40,
    actualDurationSeconds: 40,
  });
  assert(clipVerify.valid === true, "Complete 40s clip passes 100% duration coverage verification");

  const partialVerify = EvidenceHashVerifierService.verifyMediaAsset({
    data: Buffer.from("DUMMY_MP4_DATA_SHORT"),
    expectedMinSizeBytes: 10,
    expectedMinDurationSeconds: 40,
    actualDurationSeconds: 20, // Only 50% coverage
  });
  assert(partialVerify.valid === false, "Truncated 20s clip fails verification");
  assert(partialVerify.durationCoveragePct === 50, "Calculates exact 50% coverage");

  // --------------------------------------------------------------------------
  // Suite 4: Cryptographic Tamper-Evident Manifest
  // --------------------------------------------------------------------------
  console.log("\nSuite 4: Cryptographic Tamper-Evident Manifest");

  assert(intrusionJob.manifest !== undefined, "Generates canonical evidence manifest");
  assert(intrusionJob.manifestHash !== undefined && intrusionJob.manifestHash.length === 64, "Generates 64-char manifest hash");

  const storedManifest = await pipeline.getManifest(intrusionJob.id);
  assert(storedManifest !== null, "Retrieves stored manifest by evidence ID");
  if (storedManifest) {
    assert(EvidenceHashVerifierService.verifyManifest(storedManifest) === true, "Manifest passes cryptographic integrity check");
  }

  // --------------------------------------------------------------------------
  // Suite 5: Capture Idempotency
  // --------------------------------------------------------------------------
  console.log("\nSuite 5: Capture Idempotency");

  const duplicateJob = await pipeline.enqueueEvidenceCapture({
    alertId: "alert-test-intrusion-01", // SAME alertId
    tenantId: "tenant-bank-01",
    branchId: "branch-thrissur-14",
    cameraId: "cam-vault-01",
    alertType: "intrusion",
    severity: "P1",
  });
  assert(duplicateJob.id === intrusionJob.id, "Idempotent capture returns existing evidence record without duplicate jobs");

  // --------------------------------------------------------------------------
  // Suite 6: Machine-Readable Failure Codes
  // --------------------------------------------------------------------------
  console.log("\nSuite 6: Machine-Readable Failure Codes");

  const failedJob = await pipeline.enqueueEvidenceCapture({
    alertId: "alert-test-fail-01",
    tenantId: "tenant-bank-01",
    branchId: "branch-kannur-04",
    cameraId: "cam-lobby-02",
    alertType: "intrusion",
    severity: "P1",
    mockFailureCode: "RECORDING_NOT_FOUND",
  });

  assert(failedJob.status === "FAILED", "Marks status as FAILED on unretrievable footage");
  assert(failedJob.failureCode === "RECORDING_NOT_FOUND", "Captures machine-readable failure code RECORDING_NOT_FOUND");

  // --------------------------------------------------------------------------
  // Suite 7: Evidence Capture SLA Metrics
  // --------------------------------------------------------------------------
  console.log("\nSuite 7: Evidence Capture SLA Metrics");

  const sla = await pipeline.getSlaSummary();
  assert(sla.totalRequested >= 2, "SLA summary tracks total requested jobs");
  assert(sla.completedReady >= 1, "Tracks ready evidence packages");
  assert(sla.failedCount >= 1, "Tracks failed evidence packages");
  assert(sla.failureBreakdown["RECORDING_NOT_FOUND"] >= 1, "Aggregates failure breakdown reasons");

  // --------------------------------------------------------------------------
  // Suite 8: Backend REST Control-Plane Endpoints
  // --------------------------------------------------------------------------
  console.log("\nSuite 8: Backend REST Control-Plane Endpoints");

  const app = Fastify();
  await registerEvidenceCaptureRoutes(app, undefined, pipeline);

  // 1. POST /v1/evidence/jobs
  const jobRes = await app.inject({
    method: "POST",
    url: "/v1/evidence/jobs",
    payload: {
      alertId: "alert-rest-vault-01",
      branchId: "branch-thrissur-14",
      cameraId: "cam-vault-01",
      alertType: "intrusion",
      severity: "P1",
    },
  });
  assert(jobRes.statusCode === 201, "POST /v1/evidence/jobs returns 201 Created");
  const jobData = JSON.parse(jobRes.body);
  assert(jobData.data.status === "READY", "Evidence package resolves to READY");

  // 2. GET /v1/evidence/alerts/:alertId
  const alertEvRes = await app.inject({ method: "GET", url: "/v1/evidence/alerts/alert-rest-vault-01" });
  assert(alertEvRes.statusCode === 200, "GET /v1/evidence/alerts/:alertId returns 200 OK");

  // 3. GET /v1/evidence/:id/manifest
  const manifestRes = await app.inject({ method: "GET", url: `/v1/evidence/${jobData.data.id}/manifest` });
  assert(manifestRes.statusCode === 200, "GET /v1/evidence/:id/manifest returns 200 OK");

  // 4. POST /v1/evidence/:id/verify
  const verifyRes = await app.inject({ method: "POST", url: `/v1/evidence/${jobData.data.id}/verify` });
  assert(verifyRes.statusCode === 200, "POST /v1/evidence/:id/verify returns 200 OK");
  const verifyData = JSON.parse(verifyRes.body);
  assert(verifyData.verified === true, "Endpoint confirms cryptographic integrity");

  // 5. GET /v1/evidence/sla/summary
  const slaRes = await app.inject({ method: "GET", url: "/v1/evidence/sla/summary" });
  assert(slaRes.statusCode === 200, "GET /v1/evidence/sla/summary returns 200 OK");

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

runGuaranteedEvidenceTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
