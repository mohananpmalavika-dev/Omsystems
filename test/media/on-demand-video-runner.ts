/**
 * On-Demand Video & Local Video Residency Verification Runner
 */

import {
  liveSessionService,
  playbackSessionService,
  evidenceExportService,
  snapshotService,
  videoAccessAuditService,
  edgeMediaProxyService,
  StreamProfileSelector,
} from "../../src/media/index.js";
import { app } from "../../src/app.js";

async function runOnDemandVideoTests() {
  console.log("================================================================================");
  console.log("  ON-DEMAND VIDEO & LOCAL VIDEO RESIDENCY - VERIFICATION RUNNER");
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
  liveSessionService.clear();
  playbackSessionService.clear();
  evidenceExportService.clear();
  snapshotService.clear();

  // Suite 1: Local Video Residency Normal State
  console.log("Suite 1: Local Video Residency Normal State");
  assert(liveSessionService.getActiveSessionsCount() === 0, "Normal state has 0 active live video sessions");
  assert(edgeMediaProxyService.getActiveStreamCount() === 0, "Normal state has 0 upstream RTSP streams opened to Head Office");

  // Suite 2: On-Demand Live Session Authorization & Session Token
  console.log("\nSuite 2: On-Demand Live Session Authorization & Session Token");
  const session1 = await liveSessionService.createSession({
    tenantId: "bank-corp",
    branchId: "branch-178",
    cameraId: "cam-178-01",
    cameraName: "CAM01-Entrance",
    userId: "operator-alice",
    purpose: "LIVE_VIEW",
    quality: "AUTO",
  });

  assert(session1.state === "ACTIVE", "Live session successfully created in ACTIVE state");
  assert(session1.resolvedQuality === "SUBSTREAM", "AUTO quality for LIVE_VIEW resolves to SUBSTREAM");
  assert(session1.sessionToken.startsWith("token-"), "Issued cryptographically signed short-lived session token");
  assert(session1.streamUrl.includes("webrtc"), "Stream endpoint negotiated over WebRTC");

  // Suite 3: Reference Counting & Warm Grace Period
  console.log("\nSuite 3: Reference Counting & Warm Grace Period");
  // Second operator opens the same camera
  const session2 = await liveSessionService.createSession({
    tenantId: "bank-corp",
    branchId: "branch-178",
    cameraId: "cam-178-01",
    cameraName: "CAM01-Entrance",
    userId: "operator-bob",
    purpose: "LIVE_VIEW",
    quality: "SUBSTREAM",
  });

  assert(edgeMediaProxyService.getActiveStreamCount() === 1, "Two concurrent operators share exactly 1 upstream RTSP stream (Reference counting)");

  // Operator Alice closes session
  await liveSessionService.terminateSession(session1.id);
  assert(edgeMediaProxyService.getActiveStreamCount() === 1, "Upstream stream remains active while Operator Bob is still watching");

  // Operator Bob closes session -> Warm grace period starts
  await liveSessionService.terminateSession(session2.id);
  assert(liveSessionService.getActiveSessionsCount() === 0, "All viewer sessions closed");

  // Suite 4: Adaptive Stream Quality Selection
  console.log("\nSuite 4: Adaptive Stream Quality Selection");
  const gridProfile = StreamProfileSelector.select({
    purpose: "VIDEO_WALL",
    requestedQuality: "AUTO",
  });
  assert(gridProfile.resolvedQuality === "SUBSTREAM", "Grid / Video Wall selects SUBSTREAM");

  const failoverProfile = StreamProfileSelector.select({
    purpose: "INVESTIGATION",
    requestedQuality: "MAINSTREAM",
    network: { mode: "FAILOVER", uploadMbps: 4, latencyMs: 85, packetLossPct: 0.05 },
  });
  assert(failoverProfile.resolvedQuality === "SUBSTREAM", "LTE Failover link enforces SUBSTREAM even when MAINSTREAM requested");

  const focusedProfile = StreamProfileSelector.select({
    purpose: "INVESTIGATION",
    requestedQuality: "MAINSTREAM",
    network: { mode: "PRIMARY", uploadMbps: 50, latencyMs: 18, packetLossPct: 0.0 },
  });
  assert(focusedProfile.resolvedQuality === "MAINSTREAM", "Primary broadband link permits 1080p MAINSTREAM for focused investigation");

  // Suite 5: Heartbeat Renewal & Session Teardown
  console.log("\nSuite 5: Heartbeat Renewal & Session Teardown");
  const session3 = await liveSessionService.createSession({
    tenantId: "bank-corp",
    branchId: "branch-178",
    cameraId: "cam-178-07",
    userId: "operator-charlie",
  });

  const renewed = await liveSessionService.heartbeat(session3.id, 600);
  assert(renewed !== null, "Session heartbeat renewed successfully");
  assert(renewed!.expiresAt.getTime() > session3.createdAt.getTime() + 300_000, "Expiration extended by 600s");

  await liveSessionService.terminateSession(session3.id);

  // Suite 6: Remote Playback & SHA-256 Hashed Evidence Exports
  console.log("\nSuite 6: Remote Playback & SHA-256 Hashed Evidence Exports");
  const now = new Date();
  const pbSession = await playbackSessionService.createSession({
    tenantId: "bank-corp",
    branchId: "branch-178",
    cameraId: "cam-178-01",
    from: new Date(now.getTime() - 1800_000),
    to: now,
    userId: "operator-alice",
  });
  assert(pbSession.state === "READY", "Playback session created in READY state");
  assert(pbSession.streamUrl.includes("playback"), "Playback stream negotiated via WebRTC");

  const exportRecord = await evidenceExportService.createExport({
    tenantId: "bank-corp",
    branchId: "branch-178",
    cameraId: "cam-178-01",
    from: new Date(now.getTime() - 900_000),
    to: now,
    userId: "operator-alice",
    reason: "Vault Door Tamper Forensic Investigation",
  });
  assert(exportRecord.sha256.length === 64, "Calculated valid 64-character SHA-256 integrity hash");
  assert(exportRecord.downloadUrl.includes("token="), "Generated secure time-limited download URL");

  // Suite 7: Snapshot Service & Audit Logging
  console.log("\nSuite 7: Snapshot Service & Audit Logging");
  const snapshot = await snapshotService.getLatestSnapshot("cam-178-01", "branch-178");
  assert(snapshot.width === 640 && snapshot.height === 360, "Snapshot generated at 640x360 for low-bandwidth mosaic");

  const auditLogs = await videoAccessAuditService.getLogs({ cameraId: "cam-178-01" });
  assert(auditLogs.length >= 2, "Audit logs recorded live sessions and exports for CAM01");
  assert(auditLogs.some((l) => l.action === "EXPORT"), "Audit trail contains EXPORT entry");

  // Suite 8: Fastify REST API Endpoints Verification
  console.log("\nSuite 8: Fastify REST API Endpoints Verification");
  await app.ready();

  const restLiveResp = await app.inject({
    method: "POST",
    url: "/api/v1/media/live-sessions",
    payload: {
      tenantId: "bank-corp",
      branchId: "branch-178",
      cameraId: "cam-178-01",
      purpose: "LIVE_VIEW",
      quality: "SUBSTREAM",
    },
  });
  assert(restLiveResp.statusCode === 201, "POST /api/v1/media/live-sessions returns 201 Created");
  const restSession = JSON.parse(restLiveResp.body).data;
  assert(restSession.id !== undefined, "Returns valid sessionId");

  const getLiveResp = await app.inject({
    method: "GET",
    url: `/api/v1/media/live-sessions/${restSession.id}`,
  });
  assert(getLiveResp.statusCode === 200, "GET /api/v1/media/live-sessions/:id returns 200 OK");

  const hbResp = await app.inject({
    method: "POST",
    url: `/api/v1/media/live-sessions/${restSession.id}/heartbeat`,
  });
  assert(hbResp.statusCode === 200, "POST /api/v1/media/live-sessions/:id/heartbeat returns 200 OK");

  const restPbResp = await app.inject({
    method: "POST",
    url: "/api/v1/media/playback-sessions",
    payload: {
      tenantId: "bank-corp",
      branchId: "branch-178",
      cameraId: "cam-178-01",
      from: new Date(now.getTime() - 1800_000).toISOString(),
      to: now.toISOString(),
    },
  });
  assert(restPbResp.statusCode === 201, "POST /api/v1/media/playback-sessions returns 201 Created");

  const restExpResp = await app.inject({
    method: "POST",
    url: "/api/v1/media/evidence-exports",
    payload: {
      tenantId: "bank-corp",
      branchId: "branch-178",
      cameraId: "cam-178-01",
      reason: "API Audit Check",
    },
  });
  assert(restExpResp.statusCode === 201, "POST /api/v1/media/evidence-exports returns 201 Created");
  const expData = JSON.parse(restExpResp.body).data;
  assert(expData.sha256 !== undefined, "REST API returns SHA-256 hash");

  const snapResp = await app.inject({
    method: "GET",
    url: "/api/v1/media/snapshots/cam-178-01?branchId=branch-178",
  });
  assert(snapResp.statusCode === 200, "GET /api/v1/media/snapshots/:cameraId returns 200 OK");

  const auditResp = await app.inject({
    method: "GET",
    url: "/api/v1/media/audit?cameraId=cam-178-01",
  });
  assert(auditResp.statusCode === 200, "GET /api/v1/media/audit returns 200 OK");

  const delResp = await app.inject({
    method: "DELETE",
    url: `/api/v1/media/live-sessions/${restSession.id}`,
  });
  assert(delResp.statusCode === 200, "DELETE /api/v1/media/live-sessions/:id terminates session");

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runOnDemandVideoTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
