/**
 * Control Plane vs Media Plane Separation - Verification Test Runner
 */

import { EdgeGatewayManagerService } from "../../src/edge-protocol/services/edge-gateway-manager.service.js";
import { MediaSessionManagerService } from "../../src/edge-protocol/services/media-session-manager.service.js";
import { EdgeStoreAndForwardQueue } from "../../src/edge-protocol/services/edge-store-and-forward.js";
import { registerEdgeGatewayRoutes } from "../../src/routes/edge-gateway.routes.js";
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

async function runControlMediaSeparationTests() {
  console.log("================================================================================");
  console.log("  CONTROL PLANE VS MEDIA PLANE SEPARATION - VERIFICATION TEST RUNNER");
  console.log("================================================================================\n");

  const edgeMgr = new EdgeGatewayManagerService();
  const mediaMgr = new MediaSessionManagerService();
  const now = new Date();

  // --------------------------------------------------------------------------
  // Suite 1: Lightweight Edge Heartbeat Ingestion
  // --------------------------------------------------------------------------
  console.log("Suite 1: Lightweight Edge Heartbeat Ingestion");

  const hbRes = await edgeMgr.processHeartbeat({
    edgeId: "edge-test-01",
    branchId: "branch-test-01",
    timestamp: now,
    edgeVersion: "3.8.2",
    status: "HEALTHY",
    recorderCount: 2,
    cameraCount: 46,
    cameraHealthy: 46,
    cameraFailed: 0,
    activeAlerts: 0,
    systemMetrics: {
      cpuPercent: 15,
      ramPercent: 40,
      diskPercent: 55,
      queueBacklog: 0,
      hoLatencyMs: 22,
      configVersion: 54,
      uptimeSeconds: 999999,
    },
  });

  assert(hbRes.acknowledged === true, "HO acknowledges edge heartbeat");
  assert(hbRes.connectionState === "ONLINE", "Gateway connection state is ONLINE");
  assert(hbRes.configUpdateRequired === false, "Configuration is in sync (v54)");

  // --------------------------------------------------------------------------
  // Suite 2: Branch Connection State Calculation
  // --------------------------------------------------------------------------
  console.log("\nSuite 2: Branch Connection State Calculation");

  assert(edgeMgr.calculateConnectionState(now, "HEALTHY") === "ONLINE", "Recent heartbeat is ONLINE");
  assert(edgeMgr.calculateConnectionState(now, "DEGRADED") === "DEGRADED", "Active problems evaluate to DEGRADED");
  assert(edgeMgr.calculateConnectionState(new Date(now.getTime() - 70_000), "HEALTHY") === "STALE", "> 60s age evaluates to STALE");
  assert(edgeMgr.calculateConnectionState(new Date(now.getTime() - 200_000), "HEALTHY") === "OFFLINE", "> 180s age evaluates to OFFLINE");

  // --------------------------------------------------------------------------
  // Suite 3: Store-and-Forward Offline Buffering & Lossless Replay
  // --------------------------------------------------------------------------
  console.log("\nSuite 3: Store-and-Forward Offline Buffering & Lossless Replay");

  const queue = new EdgeStoreAndForwardQueue("edge-branch-offline", "branch-offline-101", edgeMgr);

  // 1. Simulate WAN disconnected
  queue.setConnectivity(false);
  queue.enqueueEvent({ entityType: "CAMERA", entityId: "cam-01", previousState: "HEALTHY", newState: "VIDEO_LOSS", reason: "Signal lost" });
  queue.enqueueEvent({ entityType: "STORAGE", entityId: "disk-01", previousState: "HEALTHY", newState: "WARNING", reason: "Pending sectors" });
  queue.enqueueEvent({ entityType: "RECORDER", entityId: "nvr-01", previousState: "HEALTHY", newState: "HEALTHY", reason: "Periodic check" });

  assert(queue.getPendingQueueLength() === 3, "Buffers 3 events locally during WAN outage");

  const offlineFlush = await queue.flush();
  assert(offlineFlush.flushedCount === 0, "No events flushed while WAN is offline");
  assert(offlineFlush.remainingCount === 3, "Queue retains all 3 events");

  // 2. Simulate WAN reconnected
  queue.setConnectivity(true);
  const onlineFlush = await queue.flush();
  assert(onlineFlush.flushedCount === 3, "Flushes all 3 events upon WAN recovery");
  assert(onlineFlush.remainingCount === 0, "Queue is empty after successful flush");

  // 3. Sequence Deduplication (Idempotency)
  const dupRes = await edgeMgr.ingestEventBatch([
    { eventId: "evt-dup-1", sequenceNumber: 1, edgeId: "edge-branch-offline", branchId: "branch-offline-101", entityType: "CAMERA", entityId: "cam-01", previousState: "HEALTHY", newState: "VIDEO_LOSS", observedAt: now },
  ]);
  assert(dupRes.duplicateCount === 1, "Rejects duplicate sequence number on replay");

  // --------------------------------------------------------------------------
  // Suite 4: HO -> Edge Command Protocol
  // --------------------------------------------------------------------------
  console.log("\nSuite 4: HO -> Edge Command Protocol");

  const cmd = await edgeMgr.dispatchCommand({
    commandId: "cmd-snap-01",
    branchId: "branch-thrissur-14",
    edgeId: "edge-thrissur-14",
    type: "CAPTURE_SNAPSHOT",
    payload: { cameraId: "cam-vault-01" },
    createdAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    requestedBy: "user-soc-operator",
  });

  assert(cmd.type === "CAPTURE_SNAPSHOT", "Dispatches CAPTURE_SNAPSHOT command");
  const initStatus = await edgeMgr.getCommandStatus(cmd.commandId);
  assert(initStatus?.status === "ACCEPTED", "Command state is ACCEPTED");

  await edgeMgr.recordCommandResult({
    commandId: cmd.commandId,
    status: "SUCCEEDED",
    result: { snapshotUrl: "https://media.bank.internal/snapshots/snap123.jpg" },
    completedAt: new Date(),
  });

  const finalStatus = await edgeMgr.getCommandStatus(cmd.commandId);
  assert(finalStatus?.status === "SUCCEEDED", "Command state completes as SUCCEEDED");

  // --------------------------------------------------------------------------
  // Suite 5: Configuration Versioning & Drift Detection
  // --------------------------------------------------------------------------
  console.log("\nSuite 5: Configuration Versioning & Drift Detection");

  const kochiGw = await edgeMgr.getEdgeGateway("edge-kochi-08");
  assert(kochiGw?.configOutOfSync === true, "Detects configuration drift (running v53 vs desired v54)");

  // Heartbeat with updated config
  const updateRes = await edgeMgr.processHeartbeat({
    edgeId: "edge-kochi-08",
    branchId: "branch-kochi-08",
    timestamp: new Date(),
    edgeVersion: "3.8.2",
    status: "HEALTHY",
    recorderCount: 2,
    cameraCount: 40,
    cameraHealthy: 40,
    cameraFailed: 0,
    activeAlerts: 0,
    systemMetrics: {
      cpuPercent: 20,
      ramPercent: 40,
      diskPercent: 60,
      queueBacklog: 0,
      hoLatencyMs: 25,
      configVersion: 54, // Updated
      uptimeSeconds: 500000,
    },
  });

  assert(updateRes.configUpdateRequired === false, "Configuration in sync after update to v54");

  // --------------------------------------------------------------------------
  // Suite 6: On-Demand Media Sessions & Credential Masking
  // --------------------------------------------------------------------------
  console.log("\nSuite 6: On-Demand Media Sessions & Credential Masking");

  const session = await mediaMgr.createMediaSession({
    branchId: "branch-thrissur-14",
    cameraId: "cam-vault-01",
    requestedByUserId: "user-soc-operator",
    durationMinutes: 15,
  });

  assert(session.status === "ACTIVE", "Allocates ACTIVE on-demand media session");
  assert(!session.playbackUrl.includes("admin:") && !session.playbackUrl.includes("password"), "Playback URL does NOT leak raw camera RTSP credentials");
  assert(session.playbackUrl.includes("token="), "Playback URL is protected with single-use session token");

  const activeSessions = await mediaMgr.listActiveSessions();
  assert(activeSessions.length >= 1, "Active sessions list includes newly created session");

  await mediaMgr.terminateSession(session.sessionId);
  assert((await mediaMgr.listActiveSessions()).some((s) => s.sessionId === session.sessionId) === false, "Terminated session removed from active streams");

  // --------------------------------------------------------------------------
  // Suite 7: 144-Camera Video Wall Multi-Tier Optimization
  // --------------------------------------------------------------------------
  console.log("\nSuite 7: 144-Camera Video Wall Multi-Tier Optimization");

  const dummyTiles = Array.from({ length: 144 }, (_, i) => ({
    position: i + 1,
    cameraId: `cam-${i + 1}`,
    branchId: `branch-${Math.floor(i / 10) + 1}`,
    priorityScore: i < 10 ? 100 : i < 32 ? 50 : 10,
  }));

  const wallPlan = mediaMgr.planVideoWallAllocation(dummyTiles);
  assert(wallPlan.totalTiles === 144, "Plans for all 144 video wall positions");
  assert(wallPlan.activeWebRtcCount === 32, "Allocates exactly 32 high-priority WebRTC live streams");
  assert(wallPlan.lowFpsPreviewCount === 64, "Allocates exactly 64 low-FPS preview streams");
  assert(wallPlan.cachedSnapshotCount === 48, "Allocates 48 low-bandwidth cached snapshot positions");
  assert(wallPlan.totalBandwidthEstimateKbps < 65000, `Total bandwidth ${wallPlan.totalBandwidthEstimateKbps} Kbps (< 65 Mbps vs naive 288 Mbps)`);

  // --------------------------------------------------------------------------
  // Suite 8: Backend REST Control-Plane Endpoints
  // --------------------------------------------------------------------------
  console.log("\nSuite 8: Backend REST Control-Plane Endpoints");

  const app = Fastify();
  await registerEdgeGatewayRoutes(app, undefined, edgeMgr, mediaMgr);

  // 1. POST /v1/edge/register
  const regRes = await app.inject({
    method: "POST",
    url: "/v1/edge/register",
    payload: {
      edgeId: "edge-rest-test",
      branchId: "branch-rest-test",
      hostname: "gw-rest.internal",
    },
  });
  assert(regRes.statusCode === 200, "POST /v1/edge/register returns 200 OK");

  // 2. POST /v1/edge/heartbeat
  const hbRestRes = await app.inject({
    method: "POST",
    url: "/v1/edge/heartbeat",
    payload: {
      edgeId: "edge-rest-test",
      branchId: "branch-rest-test",
    },
  });
  assert(hbRestRes.statusCode === 200, "POST /v1/edge/heartbeat returns 200 OK");

  // 3. GET /v1/edge/gateways
  const listRes = await app.inject({ method: "GET", url: "/v1/edge/gateways" });
  assert(listRes.statusCode === 200, "GET /v1/edge/gateways returns 200 OK");

  // 4. POST /v1/media/sessions
  const sessRes = await app.inject({
    method: "POST",
    url: "/v1/media/sessions",
    payload: {
      branchId: "branch-thrissur-14",
      cameraId: "cam-vault-01",
    },
  });
  assert(sessRes.statusCode === 201, "POST /v1/media/sessions returns 201 Created");

  // 5. POST /v1/media/videowall/plan
  const wallRes = await app.inject({
    method: "POST",
    url: "/v1/media/videowall/plan",
    payload: {
      tiles: dummyTiles.slice(0, 144),
    },
  });
  assert(wallRes.statusCode === 200, "POST /v1/media/videowall/plan returns 200 OK");

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

runControlMediaSeparationTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
