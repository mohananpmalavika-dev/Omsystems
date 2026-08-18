/**
 * Stale Data Semantics & Observation TTL Verification Runner
 */

import {
  staleDataEvaluatorService,
  DEFAULT_OBSERVATION_TTLS,
  telemetryIngestionService,
  EnvelopeBuilder,
  InternetHealthCollector,
  RecorderHealthCollector,
  CameraHealthCollector,
  StorageHealthCollector,
} from "../../src/telemetry/index.js";
import { buildApp } from "../../src/app.js";

async function runStaleDataSemanticsTests() {
  const app = await buildApp();
  console.log("================================================================================");
  console.log("  STALE DATA SEMANTICS & OBSERVATION TTL - VERIFICATION RUNNER");
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

  // Clear state
  telemetryIngestionService.clear();

  // Suite 1: Observation Freshness Evaluation (Within TTL)
  console.log("Suite 1: Observation Freshness Evaluation (Within TTL)");
  const now = new Date();
  const recentObservation = new Date(now.getTime() - 10 * 1000); // 10s ago

  const freshMeta = staleDataEvaluatorService.evaluateMetadata(
    recentObservation,
    "HEALTHY",
    DEFAULT_OBSERVATION_TTLS.CAMERA_HEALTH_TTL_SECONDS,
    now
  );

  assert(freshMeta.isStale === false, "Recent observation (10s ago) is NOT stale");
  assert(freshMeta.freshnessStatus === "FRESH", "Freshness status is FRESH");
  assert(freshMeta.effectiveState === "HEALTHY", "Effective state remains HEALTHY");
  assert(freshMeta.lastObservedAgoSeconds === 10, "Tracks lastObservedAgoSeconds = 10s");

  // Suite 2: Observation Expiration & State Downgrade (Beyond TTL - e.g. 17 mins ago)
  console.log("\nSuite 2: Observation Expiration & State Downgrade (17 Minutes Ago)");
  const seventeenMinsAgo = new Date(now.getTime() - 17 * 60 * 1000); // 17m ago

  const staleMeta = staleDataEvaluatorService.evaluateMetadata(
    seventeenMinsAgo,
    "HEALTHY",
    DEFAULT_OBSERVATION_TTLS.CAMERA_HEALTH_TTL_SECONDS,
    now
  );

  assert(staleMeta.isStale === true, "Observation from 17 minutes ago IS STALE (TTL exceeded)");
  assert(staleMeta.freshnessStatus === "EXPIRED", "Freshness status is EXPIRED");
  assert(staleMeta.effectiveState === "UNKNOWN", "Effective state downgraded from HEALTHY to UNKNOWN (no false green checkmarks!)");
  assert(staleMeta.stalenessReason === "BRANCH_OFFLINE", "Explainable reason is BRANCH_OFFLINE");
  assert(staleMeta.lastObservedAgoSeconds === 1020, "Tracks lastObservedAgoSeconds = 1020s (17 mins)");

  // Suite 3: Dependent Device Health Degradation upon Branch Disconnect
  console.log("\nSuite 3: Dependent Device Health Degradation upon Branch Disconnect");
  const devState = staleDataEvaluatorService.resolveDeviceState(
    "dvr-branch-88-01",
    "HEALTHY",
    seventeenMinsAgo,
    false, // Branch is offline
    DEFAULT_OBSERVATION_TTLS.RECORDER_HEALTH_TTL_SECONDS,
    now
  );

  assert(devState.effectiveState === "UNKNOWN", "DVR on disconnected branch resolves to UNKNOWN");
  assert(devState.isStale === true, "DVR state flagged as stale");
  assert(devState.reason === "BRANCH_OFFLINE", "Reason is BRANCH_OFFLINE");

  // Suite 4: Fastify REST API Stale Semantics Verification
  console.log("\nSuite 4: Fastify REST API Stale Semantics Verification");
  await app.ready();

  const netCollector = new InternetHealthCollector();
  const recCollector = new RecorderHealthCollector();
  const camCollector = new CameraHealthCollector();
  const diskCollector = new StorageHealthCollector();
  const builder = new EnvelopeBuilder();

  const netHealth = await netCollector.collect();
  const recHealth = await recCollector.collect("branch-88");
  const camHealth = await camCollector.collect("branch-88", 16);
  const diskHealth = await diskCollector.collect("branch-88");

  const env = builder.buildEnvelope({
    tenantId: "bank-corp",
    branchId: "branch-88",
    agentId: "edge-agent-88",
    internet: netHealth,
    recorders: recHealth,
    cameras: camHealth,
    disks: diskHealth,
  });

  // Ingest fresh telemetry
  await app.inject({
    method: "POST",
    url: "/api/v1/edge/telemetry",
    payload: env,
  });

  const getFreshResp = await app.inject({
    method: "GET",
    url: "/api/v1/telemetry/branches/branch-88/current",
  });
  assert(getFreshResp.statusCode === 200, "GET /api/v1/telemetry/branches/branch-88/current returns 200 OK");
  const freshData = JSON.parse(getFreshResp.body).data;
  assert(freshData.isStale === false, "Fresh branch state returns isStale: false");
  assert(freshData.freshnessStatus === "FRESH", "Returns freshnessStatus: FRESH");
  assert(freshData.ttlSeconds === 60, "Returns ttlSeconds: 60");
  assert(freshData.expiresAt !== undefined, "Returns calculated expiresAt timestamp");

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runStaleDataSemanticsTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
