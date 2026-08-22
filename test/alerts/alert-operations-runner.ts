/**
 * Production-Grade Real-Time Alert Operations System - Verification Test Runner
 */

import { AlertOperationsService } from "../../backend/src/alerts/services/alert-operations.service.js";
import { AlertNormalizerService } from "../../backend/src/alerts/services/alert-normalizer.service.js";
import { AlertDeduplicationService } from "../../backend/src/alerts/services/alert-deduplication.service.js";
import { registerAlertOperationsRoutes } from "../../src/routes/alert-operations.routes.js";
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

async function runAlertOperationsTests() {
  console.log("================================================================================");
  console.log("  REAL-TIME ALERT OPERATIONS & STATE MACHINE - VERIFICATION TEST RUNNER");
  console.log("================================================================================\n");

  const service = new AlertOperationsService();
  const normalizer = new AlertNormalizerService();

  // --------------------------------------------------------------------------
  // Suite 1: Contextual Severity Policy Engine
  // --------------------------------------------------------------------------
  console.log("Suite 1: Contextual Severity Policy Engine");

  // 1. Vault intrusion -> P1
  const vaultIntrusion = normalizer.normalize({
    source: "ai-vision",
    type: "person_in_vault",
    tenantId: "bank-01",
    branchId: "branch-178",
    zone: "Strongroom Vault",
    cameraId: "cam-04",
    cameraName: "Vault Main CAM",
    cameraCriticality: "CRITICAL",
  });
  assert(vaultIntrusion.severity === "P1", "Vault intrusion evaluates to P1");

  // 2. Vault Camera Offline -> P1 (Critical camera down)
  const vaultCamOffline = normalizer.normalize({
    source: "health-monitor",
    type: "camera_offline",
    tenantId: "bank-01",
    branchId: "branch-178",
    zone: "Strongroom Vault",
    cameraId: "cam-04",
    cameraName: "Vault CAM",
    cameraCriticality: "CRITICAL",
  });
  assert(vaultCamOffline.severity === "P1", "Critical vault camera offline evaluates to P1");

  // 3. Lobby Camera Offline -> P3 (Non-critical decorative camera down)
  const lobbyCamOffline = normalizer.normalize({
    source: "health-monitor",
    type: "camera_offline",
    tenantId: "bank-01",
    branchId: "branch-178",
    zone: "Lobby Customer Area",
    cameraId: "cam-08",
    cameraName: "Lobby Decorative CAM",
    cameraCriticality: "LOW",
  });
  assert(lobbyCamOffline.severity === "P3", "Lobby non-critical camera offline evaluates to P3");

  // 4. WAN Outage -> P1
  const wanOutage = normalizer.normalize({
    source: "connectivity-monitor",
    type: "wan_offline",
    tenantId: "bank-01",
    branchId: "branch-178",
  });
  assert(wanOutage.severity === "P1", "Complete WAN outage evaluates to P1");

  // --------------------------------------------------------------------------
  // Suite 2: Deduplication & Suppression Window
  // --------------------------------------------------------------------------
  console.log("\nSuite 2: Deduplication & Suppression Window");

  const rawEvent = {
    source: "ai-vision",
    type: "restricted_zone_intrusion",
    tenantId: "bank-01",
    branchId: "branch-178",
    cameraId: "cam-02",
    cameraName: "Cash Counter CAM",
  };

  // Ingest first event -> Creates new alert
  const alert1 = await service.ingestEvent(rawEvent);
  assert(alert1.status === "NEW", "First event creates new alert with status NEW");
  assert(alert1.occurrenceCount === 1, "Initial occurrence count is 1");

  // Ingest 5 more identical events within suppression window
  for (let i = 0; i < 5; i++) {
    await service.ingestEvent(rawEvent);
  }

  const updatedAlert = await service.getAlert(alert1.id);
  assert(updatedAlert?.occurrenceCount === 6, "Deduplication increments occurrenceCount to 6 without creating duplicate alerts");
  assert(updatedAlert?.revision! >= 6, "Revision counter increments on deduplicated updates");

  // --------------------------------------------------------------------------
  // Suite 3: Asynchronous Non-Blocking Evidence Capture
  // --------------------------------------------------------------------------
  console.log("\nSuite 3: Asynchronous Non-Blocking Evidence Capture");

  // Normal capture
  const alertWithEvidence = await service.ingestEvent({
    source: "ai-vision",
    type: "vault_door_tamper",
    tenantId: "bank-01",
    branchId: "branch-178",
    cameraId: "cam-01",
    zone: "Strongroom",
  });
  assert(alertWithEvidence.evidence.state === "READY", "Async pipeline successfully captures snapshot and video clip");
  assert(alertWithEvidence.evidence.clipDurationSeconds === 45, "Video clip contains 15s pre + 30s post event recording (45s total)");

  // Failure with explicit explanation
  const alertWithFailedEvidence = await service.ingestEvent(
    {
      source: "ai-vision",
      type: "perimeter_breach",
      tenantId: "bank-01",
      branchId: "branch-178",
      cameraId: "cam-09",
    },
    { mockEvidenceFailure: "NO_RECORDING_FOUND" },
  );
  assert(alertWithFailedEvidence.evidence.clipState === "FAILED", "Handles clip extraction failure");
  assert(alertWithFailedEvidence.evidence.failure?.reason === "NO_RECORDING_FOUND", "Explains explicit failure reason (NO_RECORDING_FOUND)");

  // --------------------------------------------------------------------------
  // Suite 4: Server-Authoritative State Machine & Concurrency Locking
  // --------------------------------------------------------------------------
  console.log("\nSuite 4: Server-Authoritative State Machine & Concurrency");

  const p1Alert = await service.ingestEvent({
    source: "ai-vision",
    type: "night_intrusion",
    tenantId: "bank-01",
    branchId: "branch-041",
    zone: "Vault",
    cameraId: "cam-04",
  });

  // Operator A acknowledges
  const ackResult = await service.acknowledgeAlert(p1Alert.id, { id: "op-01", name: "Priya (SOC L1)" });
  assert(ackResult.status === "ACKNOWLEDGED", "Operator A successfully acknowledges alert");
  assert(ackResult.acknowledgement?.acknowledgedByName === "Priya (SOC L1)", "Stores acknowledging operator identity");

  // Operator B tries to acknowledge simultaneously -> Must fail with conflict!
  let doubleAckFailed = false;
  try {
    await service.acknowledgeAlert(p1Alert.id, { id: "op-02", name: "Raj (SOC L1)" });
  } catch (err: any) {
    doubleAckFailed = true;
    assert(err.name === "InvalidAlertTransitionError", "Simultaneous double acknowledgement throws InvalidAlertTransitionError");
  }
  assert(doubleAckFailed, "Rejects double acknowledgement attempt");

  // Escalate to Tier 2
  const escalated = await service.escalateAlert(p1Alert.id, { id: "op-01", name: "Priya" }, "Unauthorized person spotted near safety deposit boxes");
  assert(escalated.status === "ESCALATED", "Status moves to ESCALATED");
  assert(escalated.escalationLevel === 2, "Escalation level increments to Tier 2");

  // Add Comment
  const comment = await service.addComment(p1Alert.id, { id: "sup-01", name: "Raj (SOC Lead)" }, "Local police unit dispatched to Kochi Main branch.");
  assert(comment.comment.includes("Local police unit dispatched"), "Investigation comment attached");

  // Resolve with mandatory disposition
  const resolved = await service.resolveAlert(p1Alert.id, { id: "sup-01", name: "Raj (SOC Lead)" }, "TRUE_POSITIVE", "Intruder apprehended by local patrol.");
  assert(resolved.status === "RESOLVED", "Status moves to RESOLVED");
  assert(resolved.resolution?.disposition === "TRUE_POSITIVE", "Records required disposition code (TRUE_POSITIVE)");

  // --------------------------------------------------------------------------
  // Suite 5: Short-Lived Live Video Session Tokens
  // --------------------------------------------------------------------------
  console.log("\nSuite 5: Short-Lived Live Video Session Tokens");

  const session = await service.createLiveSession(p1Alert.id, "op-01");
  assert(session.protocol === "webrtc", "Generates secure WebRTC live session");
  assert(session.expiresAt.getTime() > Date.now(), "Session token has future expiration timestamp");

  // --------------------------------------------------------------------------
  // Suite 6: Multi-Operator Audit Trail Log
  // --------------------------------------------------------------------------
  console.log("\nSuite 6: Multi-Operator Audit Trail Log");

  const timeline = await service.getTimeline(p1Alert.id);
  assert(timeline.length >= 4, "Timeline contains audit trail records");
  assert(timeline.some((e) => e.action === "CREATED"), "Timeline logs CREATED action");
  assert(timeline.some((e) => e.action === "ACKNOWLEDGED"), "Timeline logs ACKNOWLEDGED action");
  assert(timeline.some((e) => e.action === "ESCALATED"), "Timeline logs ESCALATED action");
  assert(timeline.some((e) => e.action === "RESOLVED"), "Timeline logs RESOLVED action");

  // --------------------------------------------------------------------------
  // Suite 7: Backend REST Control-Plane Routes
  // --------------------------------------------------------------------------
  console.log("\nSuite 7: Backend REST Control-Plane Routes");

  const app = Fastify();
  await registerAlertOperationsRoutes(app, undefined, service);

  // 1. List alerts
  const listRes = await app.inject({ method: "GET", url: "/v1/alerts" });
  assert(listRes.statusCode === 200, "GET /v1/alerts returns 200 OK");
  const listData = JSON.parse(listRes.body);
  assert(listData.data.length >= 2, "Returns list of active operational alerts");

  // 2. Ingest via REST
  const ingestRes = await app.inject({
    method: "POST",
    url: "/v1/alerts/ingest",
    payload: {
      source: "api-test",
      type: "motion_detected",
      tenantId: "bank-01",
      branchId: "branch-041",
    },
  });
  assert(ingestRes.statusCode === 201, "POST /v1/alerts/ingest creates alert (201 Created)");
  const newAlert = JSON.parse(ingestRes.body).alert;

  // 3. Acknowledge via REST
  const ackRes = await app.inject({
    method: "POST",
    url: `/v1/alerts/${newAlert.id}/acknowledge`,
  });
  assert(ackRes.statusCode === 200, "POST /v1/alerts/:id/acknowledge succeeds (200 OK)");

  // 4. Assign via REST
  const assignRes = await app.inject({
    method: "POST",
    url: `/v1/alerts/${newAlert.id}/assign`,
    payload: { userId: "op-14", userName: "Anita (SOC L1)" },
  });
  assert(assignRes.statusCode === 200, "POST /v1/alerts/:id/assign succeeds (200 OK)");

  // 5. Add Comment via REST
  const commentRes = await app.inject({
    method: "POST",
    url: `/v1/alerts/${newAlert.id}/comment`,
    payload: { comment: "Inspecting live camera feed." },
  });
  assert(commentRes.statusCode === 201, "POST /v1/alerts/:id/comment creates comment (201 Created)");

  // 6. Resolve via REST
  const resolveRes = await app.inject({
    method: "POST",
    url: `/v1/alerts/${newAlert.id}/resolve`,
    payload: { disposition: "AUTHORIZED_ACTIVITY", notes: "Branch staff closing up." },
  });
  assert(resolveRes.statusCode === 200, "POST /v1/alerts/:id/resolve succeeds with disposition");

  // 7. Daily Report
  const reportRes = await app.inject({ method: "GET", url: "/v1/alerts/reports/daily" });
  assert(reportRes.statusCode === 200, "GET /v1/alerts/reports/daily returns 200 OK");
  const report = JSON.parse(reportRes.body);
  assert(report.totalAlerts >= 3, "Report aggregates total alerts");

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

runAlertOperationsTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
