/**
 * Unified Operations & Product Surface Verification Runner
 */

import { unifiedOperationsService } from "../../src/operations/index.js";
import { app } from "../../src/app.js";

async function runUnifiedOperationsTests() {
  console.log("================================================================================");
  console.log("  UNIFIED OPERATIONS & PRODUCT SURFACE - VERIFICATION RUNNER");
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

  // Suite 1: Unified Command Center Aggregation Read Model
  console.log("Suite 1: Unified Command Center Aggregation Read Model");
  const summary = await unifiedOperationsService.getCommandCenterSummary();
  assert(summary.branches.total === 400, "Tracks 400 total branches");
  assert(summary.cameras.total === 4000, "Tracks 4,000 total cameras");
  assert(summary.recorders.total === 400, "Tracks 400 total recorders");
  assert(summary.storage.totalDisks === 800, "Tracks 800 total SATA HDDs");
  assert(summary.retention.requiredDays === 90, "Enforces 90-day retention policy");
  assert(summary.alerts.p1Open >= 1, "Tracks open P1 alerts");
  assert(summary.incidents.active >= 1, "Tracks active correlated root-cause incidents");

  // Suite 2: Attention Required Triage Matrix
  console.log("\nSuite 2: Attention Required Triage Matrix");
  assert(summary.attentionRequired.length >= 4, "Aggregates urgent attention required exception items");
  const p1Item = summary.attentionRequired.find((a) => a.category === "P1_ALERT");
  assert(p1Item !== undefined && p1Item.severity === "P1", "Attention matrix surfaces P1 Vault Access Alarm");
  const recItem = summary.attentionRequired.find((a) => a.category === "RECORDING_FAILURE");
  assert(recItem !== undefined, "Attention matrix surfaces camera recording stoppage");
  const retItem = summary.attentionRequired.find((a) => a.category === "RETENTION_VIOLATION");
  assert(retItem !== undefined, "Attention matrix surfaces retention violation (61/90 days)");

  // Suite 3: Fleet Branch Status View (Multi-Domain Read Model)
  console.log("\nSuite 3: Fleet Branch Status View (Multi-Domain Read Model)");
  const branches = await unifiedOperationsService.getFleetBranchSummaries();
  assert(branches.length >= 3, "Returns fleet branch operational views");
  const aluvaBranch = branches.find((b) => b.branchId === "branch-178");
  assert(aluvaBranch?.operationalState === "CRITICAL", "Aluva branch status is CRITICAL");
  assert(aluvaBranch?.retention.compliant === false, "Aluva retention compliance tracks violation");
  const thrissurBranch = branches.find((b) => b.branchId === "branch-118");
  assert(thrissurBranch?.operationalState === "MAINTENANCE", "Thrissur branch status is MAINTENANCE");

  // Suite 4: 360-Degree Branch Workspace
  console.log("\nSuite 4: 360-Degree Branch Workspace");
  const workspace = await unifiedOperationsService.getBranch360Workspace("branch-178");
  assert(workspace.branch.branchId === "branch-178", "Workspace branchId matches branch-178");
  assert(workspace.cameras.length === 16, "Workspace contains all 16 branch cameras with zones");
  assert(workspace.recorders.length === 1, "Workspace contains branch NVR details");
  assert(workspace.disks.length === 2, "Workspace contains SATA HDD details");
  assert(workspace.network.primaryIsp.includes("Airtel"), "Workspace exposes primary WAN link");
  assert(workspace.activeAlerts.length >= 1, "Workspace exposes active alarms for this branch");

  // Suite 5: Universal Entity Search
  console.log("\nSuite 5: Universal Entity Search");
  const branchSearch = await unifiedOperationsService.getUniversalSearch("aluva");
  assert(branchSearch.matches.some((m) => m.entityType === "BRANCH"), "Searching 'aluva' finds Branch entity");

  const cameraSearch = await unifiedOperationsService.getUniversalSearch("vault");
  assert(cameraSearch.matches.some((m) => m.entityType === "CAMERA" || m.entityType === "ALERT"), "Searching 'vault' finds Camera and Alert entities");

  const nvrSearch = await unifiedOperationsService.getUniversalSearch("cp plus");
  assert(nvrSearch.matches.some((m) => m.entityType === "RECORDER"), "Searching 'cp plus' finds Recorder entity");

  // Suite 6: Fastify REST API Endpoints Verification
  console.log("\nSuite 6: Fastify REST API Endpoints Verification");
  await app.ready();

  const getSummaryResp = await app.inject({
    method: "GET",
    url: "/api/v1/operations/command-center",
  });
  assert(getSummaryResp.statusCode === 200, "GET /api/v1/operations/command-center returns 200 OK");

  const getAttentionResp = await app.inject({
    method: "GET",
    url: "/api/v1/operations/attention-required",
  });
  assert(getAttentionResp.statusCode === 200, "GET /api/v1/operations/attention-required returns 200 OK");

  const getBranchesResp = await app.inject({
    method: "GET",
    url: "/api/v1/operations/branches",
  });
  assert(getBranchesResp.statusCode === 200, "GET /api/v1/operations/branches returns 200 OK");

  const getWorkspaceResp = await app.inject({
    method: "GET",
    url: "/api/v1/operations/branches/branch-178/workspace",
  });
  assert(getWorkspaceResp.statusCode === 200, "GET /api/v1/operations/branches/:id/workspace returns 200 OK");

  const getSearchResp = await app.inject({
    method: "GET",
    url: "/api/v1/operations/universal-search?q=aluva",
  });
  assert(getSearchResp.statusCode === 200, "GET /api/v1/operations/universal-search returns 200 OK with cross-entity matches");

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runUnifiedOperationsTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
