/**
 * Standalone Verification Test Runner for Branch Command Center & All-Camera Monitoring
 */

import { BranchOperationalSnapshotService } from "../../src/services/branch-operational-snapshot.service.js";
import { MemoryStore } from "../../src/store.js";
import { buildApp } from "../../src/app.js";

const authHeaders = { "x-user-id": "user-global-admin" };

async function runAllTests() {
  console.log("================================================================================");
  console.log("  BRANCH COMMAND CENTER & ALL-CAMERA MONITORING - VERIFICATION TEST RUNNER");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string, extra?: unknown) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      if (extra !== undefined) console.error(`         Details:`, extra);
      failed++;
    }
  }

  const store = new MemoryStore();
  const branchId = "branch-178";
  const tenantId = "tenant-default";

  store.nodes.set(branchId, {
    id: branchId,
    tenantId,
    name: "Branch 178 — Aluva",
    code: "BR-178",
    type: "branch",
    parentId: "company-1",
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const service = new BranchOperationalSnapshotService(store);
  const app = await buildApp({ store });

  console.log("\nSuite 1: Branch Operational Snapshot Aggregation & Normalization");
  const snapshot = await service.getSnapshot(tenantId, branchId);
  assert(Boolean(snapshot), "Service resolves operational snapshot for branch");
  assert(snapshot?.branchId === branchId, "Snapshot branchId matches requested branch");
  assert(snapshot?.branchName === "Branch 178 — Aluva", "Snapshot branchName matches");
  assert(snapshot?.cameras.total === 16, "Snapshot accurately aggregates 16 cameras");
  assert(snapshot?.storage.disks.total >= 2, "Snapshot tracks multiple physical disks");
  assert(snapshot?.retention.requiredDays === 90, "Snapshot enforces 90 days retention requirement");

  console.log("\nSuite 2: Centralized Branch Severity & Explainable Reason Codes");
  assert(snapshot?.overallState === "CRITICAL", "Branch status is centrally calculated as CRITICAL");
  assert(Boolean(snapshot?.reasons?.some((r) => r.code === "CAMERA_NOT_RECORDING")), "Explains CAM07 not recording as critical reason");
  assert(Boolean(snapshot?.reasons?.some((r) => r.code === "RETENTION_VIOLATION")), "Explains retention violation (61/90 days) as critical reason");
  assert(Boolean(snapshot?.reasons?.some((r) => r.code === "HDD_WARNING" || r.code === "DISK_DEGRADED")), "Explains HDD SMART warning reason");

  console.log("\nSuite 3: Camera Operational States (Reachability vs Recording Separation)");
  const cameras = snapshot?.cameraList ?? [];
  const cam01 = cameras.find((c) => c.channelNumber === "CH-01");
  const cam07 = cameras.find((c) => c.channelNumber === "CH-07");
  assert(cam01?.state === "LIVE" && cam01?.recordingStatus === "recording", "CAM01 is LIVE and RECORDING");
  assert(cam07?.onlineStatus === "online" && cam07?.recordingStatus === "stopped" && cam07?.state === "NO_RECORD", "CAM07 is reachable + streaming but NO_RECORD");
  assert(cam01?.ptzSupported === true, "CAM01 advertises PTZ capability");

  console.log("\nSuite 4: Media Live Session Lifecycle");
  const createRes = await app.inject({
    method: "POST",
    url: "/v1/media/live-sessions",
    headers: authHeaders,
    payload: { cameraId: "CAM-178-07", quality: "SUB" },
  });
  assert(createRes.statusCode === 201, "POST /v1/media/live-sessions creates session (201 Created)", {
    code: createRes.statusCode,
    body: createRes.body,
  });

  let sid = "";
  try {
    const createJson = JSON.parse(createRes.body);
    sid = createJson.data?.sessionId || createJson.sessionId;
  } catch {}
  assert(Boolean(sid), "Returned valid live sessionId");

  const renewRes = await app.inject({
    method: "POST",
    url: `/v1/media/live-sessions/${encodeURIComponent(sid || "test")}/renew`,
    headers: authHeaders,
  });
  assert(renewRes.statusCode === 200, "POST /v1/media/live-sessions/:id/renew succeeds (200 OK)", {
    code: renewRes.statusCode,
    body: renewRes.body,
  });

  const deleteRes = await app.inject({
    method: "DELETE",
    url: `/v1/media/live-sessions/${encodeURIComponent(sid || "test")}`,
    headers: authHeaders,
  });
  assert(deleteRes.statusCode === 200, "DELETE /v1/media/live-sessions/:id terminates session", {
    code: deleteRes.statusCode,
    body: deleteRes.body,
  });

  console.log("\nSuite 5: REST Endpoints for Command Center Workspace");
  const snapRes = await app.inject({
    method: "GET",
    url: "/v1/branches/branch-178/operational-snapshot",
    headers: authHeaders,
  });
  assert(snapRes.statusCode === 200, "GET /v1/branches/:id/operational-snapshot returns 200 OK", {
    code: snapRes.statusCode,
    body: snapRes.body,
  });

  const camFilterRes = await app.inject({
    method: "GET",
    url: "/v1/branches/branch-178/command-center/cameras?filter=no-record",
    headers: authHeaders,
  });
  assert(camFilterRes.statusCode === 200, "GET /v1/branches/:id/command-center/cameras?filter=no-record returns filtered camera list", {
    code: camFilterRes.statusCode,
    body: camFilterRes.body,
  });

  const storageRes = await app.inject({
    method: "GET",
    url: "/v1/branches/branch-178/storage",
    headers: authHeaders,
  });
  assert(storageRes.statusCode === 200, "GET /v1/branches/:id/storage returns storage breakdown", {
    code: storageRes.statusCode,
    body: storageRes.body,
  });

  const retentionRes = await app.inject({
    method: "GET",
    url: "/v1/branches/branch-178/retention",
    headers: authHeaders,
  });
  assert(retentionRes.statusCode === 200, "GET /v1/branches/:id/retention returns retention compliance", {
    code: retentionRes.statusCode,
    body: retentionRes.body,
  });

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

void runAllTests();
