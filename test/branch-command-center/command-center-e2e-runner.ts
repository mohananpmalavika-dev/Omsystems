/**
 * Branch Command Center & Authoritative State - End-to-End Verification Test Runner
 */

import { buildApp } from "../../src/app.js";
import { MemoryStore } from "../../src/store.js";
import { LiveSessionManager } from "../../dashboard/lib/live-view/live-session-manager.js";

async function runCommandCenterE2ETests() {
  console.log("================================================================================");
  console.log("  BRANCH COMMAND CENTER & AUTHORITATIVE HEALTH - E2E VERIFICATION RUNNER");
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

  const store = new MemoryStore();
  const branchId = "branch-178";
  const tenantId = "omsystems";

  store.nodes.set(branchId, {
    id: branchId,
    tenantId,
    name: "Branch 178 — Aluva",
    code: "BR-178",
    type: "branch",
    parentId: "company-1",
    path: ["company-1", branchId],
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const app = await buildApp({ store });
  const authHeaders = {
    "x-user-id": "user-global-admin",
  };

  // 1. Canonical Authoritative Branch Operational State
  console.log("Suite 1: Canonical Authoritative Branch Operational State API");
  const stateRes = await app.inject({
    method: "GET",
    url: `/api/v1/branches/${branchId}/operational-state`,
    headers: authHeaders,
  });

  assert(stateRes.statusCode === 200, "GET /api/v1/branches/:id/operational-state returns 200 OK", {
    code: stateRes.statusCode,
    body: stateRes.body,
  });

  let stateData: any = {};
  try {
    stateData = JSON.parse(stateRes.body);
  } catch {}

  assert(stateData.branchId === branchId, "State branchId matches requested branch");
  assert(stateData.overallStatus === "CRITICAL", "State overallStatus correctly calculated as CRITICAL");
  assert(stateData.internet?.status === "ONLINE", "Internet status is ONLINE");
  assert(stateData.gateway?.status === "ONLINE", "Gateway status is ONLINE");
  assert(stateData.recorder?.status === "ONLINE" && stateData.recorder?.total === 1, "Recorder status is ONLINE with 1 recorder");
  assert(stateData.storage?.status === "WARNING", "Storage status is WARNING (SMART warning on Disk 2)");
  assert(stateData.cameras?.total === 16, "Cameras total is 16");
  assert(stateData.cameras?.recording >= 14, "Cameras recording is at least 14/16");
  assert(stateData.cameras?.notRecording >= 1, "Cameras notRecording tracks stopped recording channels");
  assert(stateData.retention?.status === "VIOLATION", "Retention status is VIOLATION");
  assert(stateData.retention?.actualDays === 61 && stateData.retention?.requiredDays === 90, "Retention tracks 61 / 90 days");

  // 2. Dedicated Camera Operational State List API
  console.log("\nSuite 2: Dedicated Camera Operational State List API");
  const camRes = await app.inject({
    method: "GET",
    url: `/api/v1/branches/${branchId}/cameras`,
    headers: authHeaders,
  });

  assert(camRes.statusCode === 200, "GET /api/v1/branches/:id/cameras returns 200 OK", {
    code: camRes.statusCode,
    body: camRes.body,
  });

  let camList: any[] = [];
  try {
    camList = JSON.parse(camRes.body);
  } catch {}

  assert(Array.isArray(camList) && camList.length === 16, "Returned 16 camera operational states");

  const cam01 = camList.find((c) => c.channelNumber === 1 || c.name.includes("01"));
  const cam07 = camList.find((c) => c.channelNumber === 7 || c.name.includes("07"));

  assert(cam01?.health?.connectivity === "ONLINE" && cam01?.health?.recording === "RECORDING", "CAM01 is ONLINE and RECORDING");
  assert(cam07?.health?.connectivity === "ONLINE" && cam07?.health?.recording === "NOT_RECORDING", "CAM07 is ONLINE but NOT_RECORDING (NO RECORD state)");
  assert(cam07?.health?.stream === "AVAILABLE", "CAM07 stream is AVAILABLE despite recording failure");

  // 3. Centralized Live Session Manager with Reference Counting
  console.log("\nSuite 3: Live Session Manager Reference Counting & Lifecycle");
  const sessionManager = new LiveSessionManager("/api/v1");

  const s1 = await sessionManager.acquire("cam-178-01", "branch-wall-consumer", "SUB");
  assert(s1.state === "ACTIVE", "Acquired live session for CAM01");
  assert(sessionManager.getConsumerCount("cam-178-01") === 1, "Consumer count is 1");

  // Second consumer requests same stream (e.g. incident focus popup)
  const s2 = await sessionManager.acquire("cam-178-01", "incident-popup-consumer", "SUB");
  assert(s2.sessionId === s1.sessionId, "Reused existing stream session for second consumer");
  assert(sessionManager.getConsumerCount("cam-178-01") === 2, "Consumer reference count incremented to 2");

  // Release first consumer
  const released1 = await sessionManager.release("cam-178-01", "branch-wall-consumer");
  assert(released1 === false, "Session was NOT terminated while second consumer is still active");
  assert(sessionManager.getConsumerCount("cam-178-01") === 1, "Consumer reference count decremented to 1");

  // Release second consumer
  const released2 = await sessionManager.release("cam-178-01", "incident-popup-consumer");
  assert(released2 === true, "Session was terminated when reference count reached 0");
  assert(sessionManager.getConsumerCount("cam-178-01") === 0, "Consumer reference count is 0");

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runCommandCenterE2ETests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
