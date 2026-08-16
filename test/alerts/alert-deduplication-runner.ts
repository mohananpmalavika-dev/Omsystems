/**
 * Enterprise Alert Deduplication & Temporal Aggregation - Verification Test Runner
 */

import { UnifiedAiAlertService } from "../../src/alerts/services/unified-ai-alert.service.js";
import { AdvancedDeduplicationService } from "../../src/alerts/services/advanced-deduplication.service.js";
import { TemporalAggregatorService } from "../../src/alerts/services/temporal-aggregator.service.js";
import { DeduplicationPolicyService } from "../../src/alerts/services/deduplication-policy.service.js";
import { registerDeduplicationRoutes } from "../../src/routes/deduplication.routes.js";
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

async function runDeduplicationTests() {
  console.log("================================================================================");
  console.log("  ALERT DEDUPLICATION & TEMPORAL AGGREGATION - VERIFICATION TEST RUNNER");
  console.log("================================================================================\n");

  const policy = new DeduplicationPolicyService();
  const dedup = new AdvancedDeduplicationService(policy);
  const aggregator = new TemporalAggregatorService(policy);
  const alertService = new UnifiedAiAlertService(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    aggregator,
    dedup,
  );

  const baseTime = new Date("2026-08-16T15:00:00.000Z");

  // --------------------------------------------------------------------------
  // Suite 1: 300 Rapid Detections -> Exactly 1 Alert
  // --------------------------------------------------------------------------
  console.log("Suite 1: 300 Rapid Detections -> Exactly 1 Alert");

  let createdCount = 0;
  let mergedCount = 0;
  let finalAlert: any = null;

  // Simulate 300 detections at 10 FPS (every 100ms for 30s)
  for (let i = 0; i < 300; i++) {
    const frameTime = new Date(baseTime.getTime() + i * 100);
    const res = await alertService.ingestDetection({
      id: `det-frame-${i}`,
      tenantId: "tenant-bank-01",
      branchId: "branch-thrissur-14",
      cameraId: "cam-vault-01",
      detectorId: "yolo-v8-edge",
      detectionType: "INTRUSION",
      detectedAt: frameTime,
      trackId: "person-182",
      confidence: 0.90 + (i % 10) * 0.008,
      zoneId: "VAULT",
    });

    if (res.action === "CREATED") createdCount++;
    if (res.action === "MERGED") mergedCount++;
    finalAlert = res.alert;
  }

  assert(createdCount === 1, "Exactly 1 Alert is CREATED from 300 frame detections");
  assert(mergedCount === 299, "299 redundant frame detections are MERGED into the active alert");
  assert(finalAlert?.occurrenceCount === 300, "Alert occurrence count is updated to 300");
  assert(finalAlert?.lastSeenAt.getTime() > finalAlert?.firstSeenAt.getTime(), "Alert lastSeenAt tracks the continuous observation");

  const metrics = dedup.getMetrics();
  assert(metrics.suppressionRatioPercent >= 99.0, `Suppression ratio is ${metrics.suppressionRatioPercent}% (>= 99.0%)`);

  // --------------------------------------------------------------------------
  // Suite 2: Multi-Strategy Key Generation
  // --------------------------------------------------------------------------
  console.log("\nSuite 2: Multi-Strategy Key Generation");

  // 1. Tracked object strategy
  const key1 = aggregator.buildStreamKey({
    id: "det-1",
    tenantId: "t1",
    branchId: "b1",
    cameraId: "c1",
    detectorId: "d1",
    detectionType: "INTRUSION",
    detectedAt: baseTime,
    trackId: "person-99",
  });
  assert(key1 === "t1:b1:c1:INTRUSION:person-99", "Builds TRACKED_OBJECT key with trackId");

  // 2. Camera zone strategy (FIRE)
  const key2 = aggregator.buildStreamKey({
    id: "det-2",
    tenantId: "t1",
    branchId: "b1",
    cameraId: "c1",
    detectorId: "d1",
    detectionType: "FIRE",
    detectedAt: baseTime,
    zoneId: "CASH_COUNTER",
  });
  assert(key2 === "t1:b1:c1:FIRE:CASH_COUNTER", "Builds CAMERA_ZONE key for fire detection");

  // 3. ANPR strategy
  const key3 = aggregator.buildStreamKey({
    id: "det-3",
    tenantId: "t1",
    branchId: "b1",
    cameraId: "c1",
    detectorId: "d1",
    detectionType: "ANPR",
    detectedAt: baseTime,
    metadata: { licensePlate: "KL-08-AW-1234" },
  });
  assert(key3 === "t1:b1:KL-08-AW-1234", "Builds LICENSE_PLATE key for ANPR");

  // --------------------------------------------------------------------------
  // Suite 3: Sliding Window Expiration
  // --------------------------------------------------------------------------
  console.log("\nSuite 3: Sliding Window Expiration");

  // Detection after 70 seconds (> 60s intrusion window + 60s cooldown expires)
  const separateTime = new Date(baseTime.getTime() + 150_000);
  const sepRes = await alertService.ingestDetection({
    id: "det-new-window",
    tenantId: "tenant-bank-01",
    branchId: "branch-thrissur-14",
    cameraId: "cam-vault-01",
    detectorId: "yolo-v8-edge",
    detectionType: "INTRUSION",
    detectedAt: separateTime,
    trackId: "person-182",
    zoneId: "VAULT",
  });

  assert(sepRes.action === "CREATED", "Detection after window + cooldown creates a new alert");
  assert(sepRes.alert.id !== finalAlert.id, "Generates distinct alert ID for new incident window");

  // --------------------------------------------------------------------------
  // Suite 4: Cooldown & Alert Reopening
  // --------------------------------------------------------------------------
  console.log("\nSuite 4: Cooldown & Alert Reopening");

  // Mark previous alert in cooldown
  const dedupKey = "tenant-bank-01:branch-thrissur-14:cam-vault-01:INTRUSION:person-reopen";
  const reopenDetection = {
    id: "det-reopen-1",
    tenantId: "tenant-bank-01",
    branchId: "branch-thrissur-14",
    cameraId: "cam-vault-01",
    detectorId: "yolo-v8-edge",
    detectionType: "INTRUSION",
    detectedAt: baseTime,
    trackId: "person-reopen",
    zoneId: "VAULT",
  };

  const initialRes = await alertService.ingestDetection(reopenDetection);
  assert(initialRes.action === "CREATED", "Initial detection is CREATED");

  // Manually put into cooldown
  dedup.resolveAlert(dedupKey, baseTime);

  // Arrive within 30s during cooldown
  const cooldownDetection = {
    ...reopenDetection,
    id: "det-reopen-2",
    detectedAt: new Date(baseTime.getTime() + 20_000),
  };

  const reopenRes = await alertService.ingestDetection(cooldownDetection);
  assert(reopenRes.action === "REOPENED" || reopenRes.action === "MERGED", "Detection during cooldown reopens existing alert without duplicate creation");

  // --------------------------------------------------------------------------
  // Suite 5: REST Control-Plane Endpoints
  // --------------------------------------------------------------------------
  console.log("\nSuite 5: Backend REST Control-Plane Endpoints");

  const app = Fastify();
  await registerDeduplicationRoutes(app, undefined, dedup, policy, alertService);

  // 1. POST /v1/alerts/detections/ingest
  const ingestRes = await app.inject({
    method: "POST",
    url: "/v1/alerts/detections/ingest",
    payload: {
      branchId: "branch-kochi-08",
      cameraId: "cam-lobby-01",
      detectionType: "LOITERING",
      trackId: "person-999",
    },
  });
  assert(ingestRes.statusCode === 200, "POST /v1/alerts/detections/ingest returns 200 OK");
  const ingestData = JSON.parse(ingestRes.body);
  assert(ingestData.data.action === "CREATED", "Returns CREATED action");

  // 2. GET /v1/alerts/deduplication/metrics
  const metricsRes = await app.inject({ method: "GET", url: "/v1/alerts/deduplication/metrics" });
  assert(metricsRes.statusCode === 200, "GET /v1/alerts/deduplication/metrics returns 200 OK");
  const metricsData = JSON.parse(metricsRes.body);
  assert(metricsData.data.detectionsReceivedTotal > 0, "Metrics track total received detections");

  // 3. GET /v1/alerts/deduplication/policies
  const polRes = await app.inject({ method: "GET", url: "/v1/alerts/deduplication/policies" });
  assert(polRes.statusCode === 200, "GET /v1/alerts/deduplication/policies returns 200 OK");

  // 4. GET /v1/alerts/events/active
  const activeRes = await app.inject({ method: "GET", url: "/v1/alerts/events/active" });
  assert(activeRes.statusCode === 200, "GET /v1/alerts/events/active returns 200 OK");

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

runDeduplicationTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
