/**
 * Stale-Data Semantics & Health Freshness - Verification Test Runner
 */

import Fastify from "fastify";
import { registerStaleHealthRoutes } from "../../src/routes/stale-health.routes.js";
import { freshnessPolicyService } from "../../src/operational-health/services/freshness-policy.service.js";
import { healthFreshnessEvaluator } from "../../src/operational-health/services/health-freshness-evaluator.service.js";
import { staleDependencyIntegrator } from "../../src/operational-health/services/stale-dependency-integrator.service.js";
import { telemetryQualityService } from "../../src/operational-health/services/telemetry-quality.service.js";
import type { HealthObservation } from "../../src/operational-health/domain/stale-semantics.types.js";

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

async function runStaleSemanticsTests() {
  console.log("================================================================================");
  console.log("  STALE-DATA SEMANTICS & HEALTH FRESHNESS - VERIFICATION TEST RUNNER");
  console.log("================================================================================\n");

  const app = Fastify();
  await app.register(registerStaleHealthRoutes);

  const baseNow = new Date("2026-08-16T14:30:00.000Z");

  // --------------------------------------------------------------------------
  // Suite 1: Freshness Policies & Timestamp Enrichment
  // --------------------------------------------------------------------------
  console.log("Suite 1: Freshness Policies & Timestamp Enrichment");

  const internetPolicy = freshnessPolicyService.getPolicy("INTERNET");
  assert(internetPolicy.staleAfterSeconds === 60, "Internet policy stale TTL is 60s");

  const recorderPolicy = freshnessPolicyService.getPolicy("RECORDER");
  assert(recorderPolicy.staleAfterSeconds === 120, "Recorder policy stale TTL is 120s");

  const diskPolicy = freshnessPolicyService.getPolicy("DISK");
  assert(diskPolicy.staleAfterSeconds === 300, "Disk SMART policy stale TTL is 300s");

  const obs: HealthObservation = {
    entityId: "DVR-01",
    entityType: "RECORDER",
    health: "HEALTHY",
    observedAt: baseNow,
    source: "branch-edge-agent",
  };

  const enriched = freshnessPolicyService.enrichObservationWithTimestamps(obs, baseNow);
  assert(enriched.expiresAt !== undefined, "Observation enriched with expiresAt");
  const expectedExpires = new Date(baseNow.getTime() + 120 * 1000).toISOString();
  assert(new Date(enriched.expiresAt!).toISOString() === expectedExpires, "Calculates expiresAt = observedAt + 120s");

  // --------------------------------------------------------------------------
  // Suite 2: Freshness Transitions (FRESH -> AGING -> STALE)
  // --------------------------------------------------------------------------
  console.log("\nSuite 2: Freshness Transitions (FRESH -> AGING -> STALE)");

  // 1. Fresh (10s old)
  const freshNow = new Date(baseNow.getTime() + 10 * 1000);
  const freshEval = healthFreshnessEvaluator.evaluateFreshness(enriched, freshNow);
  assert(freshEval.freshness === "FRESH", "10s old observation evaluates to FRESH");
  assert(freshEval.state === "HEALTHY", "FRESH observation retains HEALTHY state");

  // 2. Aging (75s old -> warningAfterSeconds is 60s, staleAfterSeconds is 120s)
  const agingNow = new Date(baseNow.getTime() + 75 * 1000);
  const agingEval = healthFreshnessEvaluator.evaluateFreshness(enriched, agingNow);
  assert(agingEval.freshness === "AGING", "75s old observation evaluates to AGING");
  assert(agingEval.state === "HEALTHY", "AGING observation maintains observed state with telemetry delay");

  // 3. Stale (150s old -> exceeds 120s TTL)
  const staleNow = new Date(baseNow.getTime() + 150 * 1000);
  const staleEval = healthFreshnessEvaluator.evaluateFreshness(enriched, staleNow);
  assert(staleEval.freshness === "STALE", "150s old observation evaluates to STALE");
  assert(staleEval.state === "UNKNOWN", "STALE observation automatically transitions state to UNKNOWN (never false green!)");
  assert(staleEval.lastKnownState === "HEALTHY", "Preserves lastKnownState as HEALTHY for auditability");
  assert(staleEval.reasonCode === "OBSERVATION_EXPIRED", "Assigns reasonCode OBSERVATION_EXPIRED");

  // --------------------------------------------------------------------------
  // Suite 3: Clock Drift Guard
  // --------------------------------------------------------------------------
  console.log("\nSuite 3: Clock Drift Guard");

  // Edge timestamp 60s in the future
  const futureObs: HealthObservation = {
    entityId: "CAM-01",
    entityType: "CAMERA",
    health: "HEALTHY",
    observedAt: new Date(baseNow.getTime() + 60 * 1000), // 60s in future
    source: "branch-edge-agent",
  };
  const driftEnriched = freshnessPolicyService.enrichObservationWithTimestamps(futureObs, baseNow);
  assert(
    new Date(driftEnriched.observedAt).getTime() <= baseNow.getTime(),
    "Normalizes future observedAt timestamp to receivedAt",
  );

  // --------------------------------------------------------------------------
  // Suite 4: Digital Twin Dependency Override (Branch-88 WAN Failure)
  // --------------------------------------------------------------------------
  console.log("\nSuite 4: Digital Twin Dependency Override (Branch-88 WAN Failure)");

  // Scenario: Branch-88 WAN failed 17 minutes ago. Last observed state for DVR was HEALTHY.
  const time17mAgo = new Date(baseNow.getTime() - 17 * 60 * 1000);
  const branch88Data = {
    branchId: "BR-88",
    branchName: "Branch 88 Thrissur",
    internet: {
      entityId: "WAN-BR88",
      entityType: "INTERNET" as const,
      health: "CRITICAL" as const,
      observedAt: baseNow,
      source: "cloud-prober",
      reason: "WAN interface packet loss 100%",
    },
    recorders: [
      {
        entityId: "DVR-01",
        entityType: "RECORDER" as const,
        health: "HEALTHY" as const,
        observedAt: time17mAgo,
        source: "edge-agent",
      },
    ],
    cameras: [
      {
        entityId: "CAM-01",
        entityType: "CAMERA" as const,
        health: "HEALTHY" as const,
        observedAt: time17mAgo,
        source: "edge-agent",
      },
      {
        entityId: "CAM-02",
        entityType: "CAMERA" as const,
        health: "HEALTHY" as const,
        observedAt: time17mAgo,
        source: "edge-agent",
      },
    ],
    disks: [
      {
        entityId: "HDD-01",
        entityType: "DISK" as const,
        health: "HEALTHY" as const,
        observedAt: time17mAgo,
        source: "edge-agent",
      },
    ],
  };

  const branchSummary = staleDependencyIntegrator.evaluateBranchTelemetry(branch88Data, baseNow);

  assert(branchSummary.branchStatus === "CRITICAL", "Branch status evaluates to CRITICAL due to WAN outage");
  assert(branchSummary.monitoringVisibility === "UNAVAILABLE", "Monitoring visibility is UNAVAILABLE");
  assert(branchSummary.rootCause?.reasonCode === "INTERNET_OFFLINE", "Root cause identifies INTERNET_OFFLINE");

  const evaluatedDvr = branchSummary.entities.find((e) => e.entityId === "DVR-01");
  assert(evaluatedDvr !== undefined && evaluatedDvr.state === "UNKNOWN", "DVR-01 state is UNKNOWN (not false healthy)");
  assert(evaluatedDvr?.reasonCode === "BRANCH_OFFLINE", "DVR-01 reason code is BRANCH_OFFLINE");
  assert(evaluatedDvr?.freshness === "STALE", "DVR-01 freshness is STALE");

  const evaluatedCam1 = branchSummary.entities.find((e) => e.entityId === "CAM-01");
  assert(evaluatedCam1 !== undefined && evaluatedCam1.state === "UNKNOWN", "CAM-01 state is UNKNOWN");
  assert(evaluatedCam1?.reasonCode === "BRANCH_OFFLINE", "CAM-01 reason code is BRANCH_OFFLINE");

  // SLA & metric accuracy check:
  assert(branchSummary.metrics.criticalCount === 1, "Only 1 critical failure counted (the WAN link)");
  assert(branchSummary.metrics.unknownCount === 4, "4 downstream devices counted as UNKNOWN (not 4 hardware failures!)");
  assert(branchSummary.metrics.healthyCount === 0, "Zero false healthy devices reported");

  // --------------------------------------------------------------------------
  // Suite 5: Telemetry Quality Report Generation
  // --------------------------------------------------------------------------
  console.log("\nSuite 5: Telemetry Quality Report Generation");

  telemetryQualityService.ingestObservation({
    branchId: "BR-88",
    entityId: "DVR-01",
    entityType: "RECORDER",
    health: "HEALTHY",
    observedAt: time17mAgo,
    source: "edge-agent",
  }, baseNow);

  telemetryQualityService.ingestObservation({
    branchId: "BR-88",
    entityId: "CAM-01",
    entityType: "CAMERA",
    health: "HEALTHY",
    observedAt: time17mAgo,
    source: "edge-agent",
  }, baseNow);

  telemetryQualityService.ingestObservation({
    branchId: "BR-101",
    entityId: "DVR-02",
    entityType: "RECORDER",
    health: "HEALTHY",
    observedAt: baseNow, // fresh
    source: "edge-agent",
  }, baseNow);

  const qualityReport = telemetryQualityService.generateQualityReport(baseNow);
  assert(qualityReport.branchesWithStaleTelemetryCount >= 1, "Tracks branches with stale telemetry");
  assert(qualityReport.entitiesUnknownCount.recorders >= 1, "Counts unknown recorders");
  assert(qualityReport.entitiesUnknownCount.cameras >= 1, "Counts unknown cameras");
  assert(qualityReport.oldestUnresolvedTelemetryGapMinutes >= 16, "Calculates oldest telemetry gap (>= 16m)");

  // --------------------------------------------------------------------------
  // Suite 6: Backend REST Control-Plane Routes
  // --------------------------------------------------------------------------
  console.log("\nSuite 6: Backend REST Control-Plane Routes");

  const ingestRes = await app.inject({
    method: "POST",
    url: "/v1/health/observations/ingest",
    payload: {
      branchId: "BR-118",
      entityId: "DVR-118",
      entityType: "RECORDER",
      health: "HEALTHY",
      observedAt: baseNow.toISOString(),
      source: "edge-agent",
    },
  });
  assert(ingestRes.statusCode === 201, "POST /v1/health/observations/ingest returns 201 Created");

  const evalRes = await app.inject({
    method: "GET",
    url: "/v1/health/evaluations/RECORDER/DVR-118",
  });
  assert(evalRes.statusCode === 200, "GET /v1/health/evaluations/:entityType/:entityId returns 200 OK");
  const evalData = JSON.parse(evalRes.body);
  assert(evalData.data.entityId === "DVR-118", "Evaluation matches entityId DVR-118");
  assert(evalData.data.freshness === "FRESH", "Evaluates freshly ingested entity as FRESH");

  const branchEvalRes = await app.inject({
    method: "POST",
    url: "/v1/health/branches/evaluate",
    payload: branch88Data,
  });
  assert(branchEvalRes.statusCode === 200, "POST /v1/health/branches/evaluate returns 200 OK");
  const branchEvalData = JSON.parse(branchEvalRes.body);
  assert(branchEvalData.data.branchStatus === "CRITICAL", "Branch evaluate confirms CRITICAL status");
  assert(branchEvalData.data.metrics.unknownCount === 4, "Branch evaluate returns accurate unknownCount");

  const reportRes = await app.inject({
    method: "GET",
    url: "/v1/health/telemetry/quality-report",
  });
  assert(reportRes.statusCode === 200, "GET /v1/health/telemetry/quality-report returns 200 OK");
  const reportData = JSON.parse(reportRes.body);
  assert(reportData.data.totalMonitoredBranches >= 1, "Quality report includes monitored branch count");

  // --------------------------------------------------------------------------
  // Final Summary
  // --------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runStaleSemanticsTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
