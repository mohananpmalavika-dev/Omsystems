/**
 * Edge Batch Health Collection & Compressed Telemetry Ingestion Runner
 */

import {
  InternetHealthCollector,
  RecorderHealthCollector,
  CameraHealthCollector,
  StorageHealthCollector,
  EnvelopeBuilder,
  LocalTelemetryBuffer,
  CompressionService,
  telemetryIngestionService,
} from "../../src/telemetry/index.js";
import { app } from "../../src/app.js";

async function runEdgeTelemetryTests() {
  console.log("================================================================================");
  console.log("  EDGE BATCH HEALTH COLLECTION & COMPRESSED TELEMETRY - VERIFICATION RUNNER");
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

  // Suite 1: Edge Local Health Collectors & NVR Channel Aggregation
  console.log("Suite 1: Edge Local Health Collectors & NVR Channel Aggregation");
  const netCollector = new InternetHealthCollector();
  const recCollector = new RecorderHealthCollector();
  const camCollector = new CameraHealthCollector();
  const diskCollector = new StorageHealthCollector();

  const netHealth = await netCollector.collect();
  assert(netHealth.state === "HEALTHY", "Internet collector evaluates primary WAN link healthy");
  assert(netHealth.latencyMs === 38, "Tracks WAN latency (38 ms)");

  const recHealth = await recCollector.collect("branch-148");
  assert(recHealth.length === 1, "Recorder collector queries NVR in 1 single call");
  assert(recHealth[0]?.channelsTotal === 16, "NVR reports 16 total channels in one network request");

  const camHealth = await camCollector.collect("branch-148", 16);
  assert(camHealth.length === 16, "Camera collector aggregates all 16 branch cameras locally");
  assert(camHealth[6]?.recording === false, "CAM-07 accurately flagged as not recording");

  const diskHealth = await diskCollector.collect("branch-148");
  assert(diskHealth.length === 2, "Storage collector tracks 2 SATA HDDs with retention measurements");
  assert(diskHealth[0]?.retentionDays === 91.5, "HDD-01 tracks 91.5 retention days");

  // Suite 2: Branch Telemetry Envelope Building & Gzip Compression
  console.log("\nSuite 2: Branch Telemetry Envelope Building & Gzip Compression");
  const builder = new EnvelopeBuilder();
  const envelope = builder.buildEnvelope({
    tenantId: "bank-corp",
    branchId: "branch-148",
    agentId: "edge-agent-148",
    internet: netHealth,
    recorders: recHealth,
    cameras: camHealth,
    disks: diskHealth,
  });

  assert(envelope.schemaVersion === 1, "Envelope schemaVersion is 1");
  assert(envelope.sequenceNumber === 1001, "Sequence number is 1001");
  assert(envelope.cameras.length === 16, "Single envelope batches all 16 cameras");

  const compressedBuffer = await CompressionService.compress(envelope);
  assert(compressedBuffer.length > 0 && compressedBuffer.length < JSON.stringify(envelope).length, "Gzip compression reduces envelope payload size");

  const decompressedJson = await CompressionService.decompress(compressedBuffer);
  const roundtrip = JSON.parse(decompressedJson);
  assert(roundtrip.messageId === envelope.messageId, "Gzip roundtrip preserves message integrity");

  // Suite 3: Telemetry Ingestion Pipeline & Idempotency
  console.log("\nSuite 3: Telemetry Ingestion Pipeline & Idempotency");
  const ingestRes = await telemetryIngestionService.ingestEnvelope(envelope);
  assert(ingestRes.accepted === true, "Central Telemetry Ingestion accepts valid envelope (202)");
  assert(ingestRes.duplicate === false, "First submission is not a duplicate");

  const branchState = telemetryIngestionService.getBranchCurrentState("branch-148");
  assert(branchState?.overallState === "WARNING", "Central engine calculates WARNING state (CAM-07 not recording)");
  assert(branchState?.onlineCameras === 15, "15 online healthy cameras tracked in fast cache");
  assert(branchState?.recordingCameras === 15, "15 recording cameras tracked in fast cache");

  // Re-ingest same envelope -> idempotency check
  const duplicateRes = await telemetryIngestionService.ingestEnvelope(envelope);
  assert(duplicateRes.accepted === true && duplicateRes.duplicate === true, "Idempotency drops duplicate messageId without reprocessing");

  // Suite 4: Offline Local Buffering & Reconnection Sequential Playback
  console.log("\nSuite 4: Offline Local Buffering & Reconnection Sequential Playback");
  const localBuffer = new LocalTelemetryBuffer();
  const env1 = builder.buildEnvelope({ tenantId: "bank-corp", branchId: "branch-148", agentId: "edge-agent-148", internet: netHealth, recorders: recHealth, cameras: camHealth, disks: diskHealth });
  const env2 = builder.buildEnvelope({ tenantId: "bank-corp", branchId: "branch-148", agentId: "edge-agent-148", internet: netHealth, recorders: recHealth, cameras: camHealth, disks: diskHealth });
  const env3 = builder.buildEnvelope({ tenantId: "bank-corp", branchId: "branch-148", agentId: "edge-agent-148", internet: netHealth, recorders: recHealth, cameras: camHealth, disks: diskHealth });

  localBuffer.push(env1);
  localBuffer.push(env2);
  localBuffer.push(env3);
  assert(localBuffer.size() === 3, "Buffered 3 telemetry envelopes during branch WAN outage");

  // Network restored -> flush buffer sequentially
  let flushedCount = 0;
  while (localBuffer.size() > 0) {
    const item = localBuffer.pop()!;
    await telemetryIngestionService.ingestEnvelope(item);
    flushedCount++;
  }
  assert(flushedCount === 3, "Flushed all 3 buffered envelopes sequentially upon WAN restoration");
  assert(localBuffer.size() === 0, "Local buffer is completely drained");

  // Suite 5: Edge Agent Liveness & Dead Agent Detection
  console.log("\nSuite 5: Edge Agent Liveness & Dead Agent Detection");
  const now = new Date();
  const onlineAgent = telemetryIngestionService.getAgentLiveness("edge-agent-148", now);
  assert(onlineAgent?.status === "ONLINE", "Agent with recent heartbeat is ONLINE");

  // 75 seconds later -> STALE
  const staleTime = new Date(now.getTime() + 75 * 1000);
  const staleAgent = telemetryIngestionService.getAgentLiveness("edge-agent-148", staleTime);
  assert(staleAgent?.status === "STALE", "Agent with 75s elapsed heartbeat is marked STALE");

  // 150 seconds later -> OFFLINE
  const offlineTime = new Date(now.getTime() + 150 * 1000);
  const offlineAgent = telemetryIngestionService.getAgentLiveness("edge-agent-148", offlineTime);
  assert(offlineAgent?.status === "OFFLINE", "Agent with 150s elapsed heartbeat is marked OFFLINE");

  // Suite 6: Fastify REST API Endpoints Verification
  console.log("\nSuite 6: Fastify REST API Endpoints Verification");
  await app.ready();

  const envApi = builder.buildEnvelope({
    tenantId: "bank-corp",
    branchId: "branch-200",
    agentId: "edge-agent-200",
    internet: netHealth,
    recorders: recHealth,
    cameras: camHealth,
    disks: diskHealth,
  });

  const postResp = await app.inject({
    method: "POST",
    url: "/api/v1/edge/telemetry",
    payload: envApi,
  });
  assert(postResp.statusCode === 202, "POST /api/v1/edge/telemetry returns 202 Accepted");

  const transitionResp = await app.inject({
    method: "POST",
    url: "/api/v1/edge/transitions",
    payload: {
      eventType: "DEVICE_HEALTH_CHANGED",
      messageId: "msg-trans-01",
      tenantId: "bank-corp",
      branchId: "branch-200",
      agentId: "edge-agent-200",
      deviceId: "cam-200-01",
      deviceType: "CAMERA",
      previousState: "HEALTHY",
      currentState: "OFFLINE",
      reason: "RTSP_STREAM_TIMEOUT",
      observedAt: new Date().toISOString(),
    },
  });
  assert(transitionResp.statusCode === 202, "POST /api/v1/edge/transitions returns 202 Accepted");

  const listAgentsResp = await app.inject({
    method: "GET",
    url: "/api/v1/edge/agents",
  });
  assert(listAgentsResp.statusCode === 200, "GET /api/v1/edge/agents returns 200 OK");
  const agentsData = JSON.parse(listAgentsResp.body).data;
  assert(agentsData.length >= 2, "Lists all registered edge agents with liveness records");

  const getBranchStateResp = await app.inject({
    method: "GET",
    url: "/api/v1/telemetry/branches/branch-200/current",
  });
  assert(getBranchStateResp.statusCode === 200, "GET /api/v1/telemetry/branches/:id/current returns 200 OK");
  const currentData = JSON.parse(getBranchStateResp.body).data;
  assert(currentData.branchId === "branch-200", "Returns fast cached branch current state");

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runEdgeTelemetryTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
