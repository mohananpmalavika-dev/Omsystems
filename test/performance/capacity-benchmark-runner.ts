/**
 * Production Capacity Benchmark & SLO Verification Runner
 */

import {
  capacityBenchmarkService,
  BranchSimulator,
  DEFAULT_TIER_A_SLO_BUDGET,
} from "../../src/performance/index.js";
import { app } from "../../src/app.js";

async function runCapacityBenchmarkTests() {
  console.log("================================================================================");
  console.log("  PRODUCTION CAPACITY BENCHMARK & SLO VERIFICATION RUNNER");
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

  // Suite 1: Tier A Topology Simulation (400 Branches, 4,000 Cameras)
  console.log("Suite 1: Tier A Topology Simulation (400 Branches, 4,000 Cameras)");
  const sim400 = new BranchSimulator(400, 10);
  assert(sim400.getBranchCount() === 400, "Simulates exactly 400 branches");
  assert(sim400.getTotalCameraCount() === 4000, "Simulates exactly 4,000 cameras (10/branch)");
  assert(sim400.getTotalMonitoredEntities() >= 6400, "Tracks >= 6,400 total monitored entities (routers, NVRs, HDDs, links)");

  // Suite 2: Tier A End-to-End Benchmark Execution
  console.log("\nSuite 2: Tier A End-to-End Capacity Benchmark Execution");
  const scorecard = await capacityBenchmarkService.runBenchmark("TIER_A");
  assert(scorecard.tier === "TIER_A", "Executed Tier A benchmark");
  assert(scorecard.overallPassed === true, "All Tier A scenario benchmarks passed formal SLO budget");
  assert(scorecard.summary.lostP1Alerts === 0, "Zero lost P1 alerts (lostP1Alerts = 0)");

  // Assert individual scenario SLOs
  const s1 = scorecard.scenarios.find((s) => s.scenarioId === "01-steady-health");
  assert(s1 !== undefined && s1.throughputEventsPerSec >= DEFAULT_TIER_A_SLO_BUDGET.healthIngestSustainedMin, `Scenario 1: Sustained throughput (${s1?.throughputEventsPerSec} events/s >= 1,000)`);
  assert(s1 !== undefined && s1.p95Ms <= DEFAULT_TIER_A_SLO_BUDGET.healthIngestApiP95Max, `Scenario 1: Ingest p95 latency (${s1?.p95Ms} ms <= 150 ms)`);

  const s2 = scorecard.scenarios.find((s) => s.scenarioId === "02-health-burst");
  assert(s2 !== undefined && s2.throughputEventsPerSec >= DEFAULT_TIER_A_SLO_BUDGET.healthIngestBurstMin, `Scenario 2: Burst throughput (${s2?.throughputEventsPerSec} events/s >= 5,000)`);

  const s3 = scorecard.scenarios.find((s) => s.scenarioId === "03-alert-storm");
  assert(s3 !== undefined && scorecard.summary.alertReductionRatioPct >= 90, `Scenario 3: Alert storm reduction ratio (${scorecard.summary.alertReductionRatioPct}% >= 90%)`);
  assert(s3 !== undefined && s3.p95Ms <= DEFAULT_TIER_A_SLO_BUDGET.digitalTwinRcaP95Max, `Scenario 3: Digital Twin RCA p95 (${s3?.p95Ms} ms <= 250 ms)`);

  const s4 = scorecard.scenarios.find((s) => s.scenarioId === "04-branch-summary-api");
  assert(s4 !== undefined && s4.p95Ms <= DEFAULT_TIER_A_SLO_BUDGET.branchSummaryApiP95Max, `Scenario 4: 400-branch summary query p95 (${s4?.p95Ms} ms <= 300 ms)`);

  const s5 = scorecard.scenarios.find((s) => s.scenarioId === "05-p1-delivery");
  assert(s5 !== undefined && s5.p95Ms <= DEFAULT_TIER_A_SLO_BUDGET.p1PopupP95Max, `Scenario 5: P1 delivery p95 (${s5?.p95Ms} ms <= 2,000 ms)`);

  const s6 = scorecard.scenarios.find((s) => s.scenarioId === "06-live-camera-startup");
  assert(s6 !== undefined && s6.p95Ms <= DEFAULT_TIER_A_SLO_BUDGET.liveCameraStartupP95Max, `Scenario 6: Live camera startup p95 (${s6?.p95Ms} ms <= 5,000 ms)`);

  // Suite 3: Tier B Near-Future Scale (1,000 Branches, 10,000 Cameras)
  console.log("\nSuite 3: Tier B Near-Future Scale (1,000 Branches, 10,000 Cameras)");
  const scorecardB = await capacityBenchmarkService.runBenchmark("TIER_B");
  assert(scorecardB.monitoredBranches === 1000, "Simulated 1,000 branches");
  assert(scorecardB.monitoredCameras === 10000, "Simulated 10,000 cameras");
  assert(scorecardB.overallPassed === true, "Tier B benchmarks passed horizontal scale targets");

  // Suite 4: Fastify REST API Endpoints Verification
  console.log("\nSuite 4: Fastify REST API Endpoints Verification");
  await app.ready();

  const getSloResp = await app.inject({
    method: "GET",
    url: "/api/v1/benchmarks/slo-budget",
  });
  assert(getSloResp.statusCode === 200, "GET /api/v1/benchmarks/slo-budget returns 200 OK");
  const sloData = JSON.parse(getSloResp.body).data;
  assert(sloData.healthIngestSustainedMin === 1000, "Exposes formal SLO target: healthIngestSustainedMin = 1000");

  const getLatestResp = await app.inject({
    method: "GET",
    url: "/api/v1/benchmarks/latest",
  });
  assert(getLatestResp.statusCode === 200, "GET /api/v1/benchmarks/latest returns 200 OK");
  const latestData = JSON.parse(getLatestResp.body).data;
  assert(latestData.overallPassed === true, "Latest benchmark scorecard indicates overallPassed = true");

  const runResp = await app.inject({
    method: "POST",
    url: "/api/v1/benchmarks/run",
    payload: { tier: "TIER_A" },
  });
  assert(runResp.statusCode === 201, "POST /api/v1/benchmarks/run triggers on-demand capacity test (201 Created)");

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runCapacityBenchmarkTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
