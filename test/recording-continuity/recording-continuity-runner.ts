/**
 * Recording Continuity Subsystem - Automated Verification Runner
 */

import {
  recordingContinuityService,
  RecordingGapDetector,
  RecordingGapRootCauseClassifier,
  type RecordingSegment,
} from "../../src/recording-continuity/index.js";
import { app } from "../../src/app.js";

async function runRecordingContinuityTests() {
  console.log("================================================================================");
  console.log("  RECORDING CONTINUITY & EVIDENCE AVAILABILITY - VERIFICATION RUNNER");
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

  // Suite 1: Timeline Segment Merging & Gap Detection
  console.log("Suite 1: Timeline Segment Merging & Gap Detection");
  const base = new Date("2026-08-16T10:00:00Z");
  const fragmentedSegments: RecordingSegment[] = [
    { start: new Date(base.getTime()), end: new Date(base.getTime() + 1800_000), type: "CONTINUOUS", source: "DAHUA_CGI" }, // 10:00 - 10:30
    { start: new Date(base.getTime() + 1740_000), end: new Date(base.getTime() + 3600_000), type: "CONTINUOUS", source: "DAHUA_CGI" }, // 10:29 - 11:00 (overlapping by 1 min)
    { start: new Date(base.getTime() + 3612_000), end: new Date(base.getTime() + 7200_000), type: "CONTINUOUS", source: "DAHUA_CGI" }, // 11:00:12 - 12:00 (12s gap)
  ];

  const merged = RecordingGapDetector.mergeSegments(fragmentedSegments);
  assert(merged.length === 2, "Merged overlapping chunks into 2 distinct continuous segments");
  assert(merged[0]!.end.getTime() === base.getTime() + 3600_000, "First merged segment correctly extends to 11:00:00");

  const gaps = RecordingGapDetector.detectGaps(fragmentedSegments, {
    windowStart: base,
    windowEnd: new Date(base.getTime() + 7200_000),
    allowedGapSeconds: 5,
  });
  assert(gaps.length === 1, "Detects exactly 1 recording gap exceeding 5s threshold");
  assert(gaps[0]!.durationSeconds === 12, "Calculates exact gap duration of 12 seconds");

  // Suite 2: 24h Continuity SLA Percentage Calculation
  console.log("\nSuite 2: 24h Continuity SLA Percentage Calculation");
  const continuityPct = RecordingGapDetector.calculateContinuityPct(86400, gaps);
  assert(continuityPct > 99.98, "24h continuity evaluates to > 99.98% for a 12-second gap");
  assert(continuityPct === 99.9861, "Continuity calculation formula is mathematically exact (99.9861%)");

  // Suite 3: Multi-Evidence Recording Confidence & Playback Verification
  console.log("\nSuite 3: Multi-Evidence Recording Confidence & Playback Verification");
  const pbSuccess = await recordingContinuityService.verifyPlayback("cam-178-01", new Date(Date.now() - 600_000));
  assert(pbSuccess.successful === true, "Playback verification succeeds when archive is present");
  assert(pbSuccess.framesDecoded === true, "Sample frames decoded from playback stream");
  assert(pbSuccess.timestampProgressing === true, "Verified timestamp progression in video stream");

  const pbFailure = await recordingContinuityService.verifyPlayback("cam-178-08", new Date(Date.now() - 600_000));
  assert(pbFailure.successful === false, "Playback verification fails when recording is missing");
  assert(pbFailure.failureReason !== undefined, "Provides actionable failure reason");

  // Suite 4: Root Cause Correlation
  console.log("\nSuite 4: Root Cause Correlation");
  const now = new Date();
  const testGap = {
    id: "gap-test-01",
    organizationId: "bank-corp",
    branchId: "branch-178",
    recorderId: "rec-178-01",
    cameraId: "cam-178-01",
    start: new Date(now.getTime() - 3600_000),
    end: new Date(now.getTime() - 3300_000), // 5 min gap
    durationSeconds: 300,
    cause: "UNKNOWN" as const,
    causeConfidence: "LOW" as const,
    detectedAt: now,
    status: "CONFIRMED" as const,
  };

  const recOfflineClass = RecordingGapRootCauseClassifier.classify(testGap, {
    recorderOfflineWindows: [{ start: new Date(now.getTime() - 3650_000), end: new Date(now.getTime() - 3250_000) }],
  });
  assert(recOfflineClass.cause === "RECORDER_OFFLINE", "Correlates gap to RECORDER_OFFLINE when recorder was down");
  assert(recOfflineClass.confidence === "HIGH", "Assigns HIGH confidence for verified recorder offline window");

  const storageFailClass = RecordingGapRootCauseClassifier.classify(testGap, {
    storageFailureWindows: [{ start: new Date(now.getTime() - 3650_000), end: new Date(now.getTime() - 3250_000) }],
  });
  assert(storageFailClass.cause === "STORAGE_FAILURE", "Correlates gap to STORAGE_FAILURE when disk SMART failed");

  // Suite 5: Conservative Multi-Metric Health State Evaluation
  console.log("\nSuite 5: Conservative Multi-Metric Health State Evaluation");
  const vaultContinuity = recordingContinuityService.getContinuity("cam-178-01", {
    cameraName: "CAM01-Entrance",
    branchId: "branch-178",
    branchName: "Aluva Main Branch",
  });
  assert(vaultContinuity.recordingNow === true, "Vault CAM01 is actively recording");
  assert(vaultContinuity.continuity24hPct > 99.9, "Vault CAM01 has >99.9% 24h continuity");
  assert(vaultContinuity.playbackVerified === true, "Vault CAM01 playback is verified");
  assert(vaultContinuity.state === "HEALTHY", "Vault CAM01 evaluates to HEALTHY state");

  const atmContinuity = recordingContinuityService.getContinuity("cam-178-08", {
    cameraName: "CAM08-ATM-Back",
    branchId: "branch-178",
  });
  assert(atmContinuity.recordingNow === false, "ATM CAM08 is NOT actively recording");
  assert(atmContinuity.state === "CRITICAL", "ATM CAM08 evaluates to CRITICAL state");
  assert(atmContinuity.currentGapStartedAt !== undefined, "Tracks current recording gap start timestamp");

  // Suite 6: Branch-Level Aggregation
  console.log("\nSuite 6: Branch-Level Aggregation");
  const branchHealth = recordingContinuityService.getBranchRecordingHealth("branch-178", [
    "cam-178-01",
    "cam-178-07",
    "cam-178-08",
  ]);
  assert(branchHealth.totalCameras === 3, "Branch aggregates all 3 test cameras");
  assert(branchHealth.currentlyRecording === 1, "Only 1 of 3 cameras currently recording");
  assert(branchHealth.state === "CRITICAL", "Branch recording state evaluates to CRITICAL due to stopped channels");
  assert(branchHealth.largestGapSeconds > 1000, "Tracks largest recording gap across branch fleet");

  // Suite 7: Fastify REST API Endpoints Verification
  console.log("\nSuite 7: Fastify REST API Endpoints Verification");
  await app.ready();

  const contResp = await app.inject({
    method: "GET",
    url: "/api/v1/cameras/cam-178-01/recording-continuity?branchId=branch-178",
  });
  assert(contResp.statusCode === 200, "GET /api/v1/cameras/:id/recording-continuity returns 200 OK");
  const contData = JSON.parse(contResp.body).data;
  assert(contData.recordingNow === true, "API response confirms recordingNow is true");
  assert(contData.continuity24hPct > 99.9, "API response returns 24h continuity percentage");

  const gapsResp = await app.inject({
    method: "GET",
    url: "/api/v1/cameras/cam-178-01/recording-gaps?branchId=branch-178",
  });
  assert(gapsResp.statusCode === 200, "GET /api/v1/cameras/:id/recording-gaps returns 200 OK");
  const gapsData = JSON.parse(gapsResp.body).data;
  assert(gapsData.totalGaps >= 1, "API returns detected recording gaps list");

  const timelineResp = await app.inject({
    method: "GET",
    url: "/api/v1/cameras/cam-178-01/recording-timeline",
  });
  assert(timelineResp.statusCode === 200, "GET /api/v1/cameras/:id/recording-timeline returns 200 OK");
  const timelineData = JSON.parse(timelineResp.body).data;
  assert(timelineData.mergedSegmentsCount >= 1, "API returns merged recording timeline segments");

  const pbResp = await app.inject({
    method: "POST",
    url: "/api/v1/cameras/cam-178-01/playback-verification",
    payload: { timestamp: new Date(Date.now() - 900_000).toISOString() },
  });
  assert(pbResp.statusCode === 201, "POST /api/v1/cameras/:id/playback-verification returns 201 Created");
  const pbData = JSON.parse(pbResp.body).data;
  assert(pbData.successful === true, "Playback verification returns successful true");

  const branchResp = await app.inject({
    method: "GET",
    url: "/api/v1/branches/branch-178/recording-health",
  });
  assert(branchResp.statusCode === 200, "GET /api/v1/branches/:id/recording-health returns 200 OK");
  const branchData = JSON.parse(branchResp.body).data;
  assert(branchData.branchContinuityPct > 0, "API returns branch overall continuity percentage");

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runRecordingContinuityTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
