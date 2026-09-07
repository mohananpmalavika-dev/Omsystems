/**
 * 7-Layer Evidence-Based Camera Health Monitoring - Verification Test Runner
 */

import {
  CameraHealthEvaluator,
  HEALTH_STALE_AFTER_MS,
  CameraHealthService,
  type CameraConfiguration,
} from "../../edge-agent/src/monitoring/camera-health/index.js";
import { buildApp } from "../../src/app.js";
import { MemoryStore } from "../../src/store.js";

async function runCameraHealthTests() {
  console.log("================================================================================");
  console.log("  7-LAYER EVIDENCE-BASED CAMERA HEALTH MONITORING - VERIFICATION RUNNER");
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

  const evaluator = new CameraHealthEvaluator();
  const service = new CameraHealthService();

  const mockCamera: CameraConfiguration = {
    id: "cam-178-01",
    name: "Entrance Main",
    branchId: "branch-178",
    recorderId: "rec-aluva-01",
    channelNumber: 1,
    ipAddress: "192.168.1.101",
    rtspPort: 554,
  };

  // 1. Separation of TCP Reachability from Video Availability
  console.log("Suite 1: Separation of TCP Transport from Video Availability");
  const tcpOnlyResult = evaluator.evaluate({
    camera: mockCamera,
    network: { reachable: true, port: 554, latencyMs: 10, protocol: "TCP" },
    stream: { reachable: false, videoTrackPresent: false, errorCode: "NO_VIDEO_TRACK" },
    decode: { decodable: false, decodedFrames: 0, decodeErrors: 1, errorCode: "NO_FRAMES" },
  });

  assert(tcpOnlyResult.network.state === "PASS", "TCP network probe reports PASS");
  assert(tcpOnlyResult.stream.state === "FAIL", "RTSP stream probe reports FAIL (No video track)");
  assert(tcpOnlyResult.decoding.state === "FAIL", "Video decoding probe reports FAIL");
  assert(tcpOnlyResult.state === "CRITICAL", "Overall camera state is CRITICAL despite TCP reachability");
  assert(tcpOnlyResult.reasonCodes.includes("RTSP_UNREACHABLE"), "Attaches RTSP_UNREACHABLE reason code");

  // 2. Stream Decodability Failure Detection
  console.log("\nSuite 2: Video Stream Decodability Verification (Corrupt NALs vs Valid Frames)");
  const undecodableResult = evaluator.evaluate({
    camera: mockCamera,
    network: { reachable: true, port: 554, latencyMs: 12, protocol: "TCP" },
    stream: { reachable: true, videoTrackPresent: true, codec: "h264" },
    decode: { decodable: false, decodedFrames: 0, decodeErrors: 15, errorCode: "CORRUPT_STREAM" },
  });

  assert(undecodableResult.network.state === "PASS", "Network connection is PASS");
  assert(undecodableResult.stream.state === "PASS", "RTSP SDP track is present");
  assert(undecodableResult.decoding.state === "FAIL", "Decoder fails on corrupt stream");
  assert(undecodableResult.state === "CRITICAL", "Evaluates to CRITICAL due to decode failure");
  assert(undecodableResult.reasonCodes.includes("DECODE_FAILED"), "Attaches DECODE_FAILED reason code");

  // 3. Frozen Video Stream Detection
  console.log("\nSuite 3: Frozen Video Detection (PTS/DTS Non-Progression & Static Hash)");
  const frozenResult = evaluator.evaluate({
    camera: mockCamera,
    network: { reachable: true, port: 554, latencyMs: 10, protocol: "TCP" },
    stream: { reachable: true, videoTrackPresent: true, codec: "h264" },
    decode: { decodable: true, decodedFrames: 5, decodeErrors: 0 },
    freeze: {
      frozen: true,
      confidence: 0.94,
      durationSeconds: 45,
      timestampProgressing: false,
      packetsFlowing: true,
      frameHashVariance: 0.001,
    },
  });

  assert(frozenResult.videoFrozen === true, "Identifies video stream as frozen");
  assert(frozenResult.freeze.state === "FAIL", "Freeze layer observation is FAIL");
  assert(frozenResult.state === "CRITICAL", "Frozen video triggers CRITICAL state");
  assert(frozenResult.reasonCodes.includes("VIDEO_FROZEN"), "Attaches VIDEO_FROZEN reason code");

  // 4. Signal Loss on NVR-Connected Channel
  console.log("\nSuite 4: Recorder Signal Loss Translation (Independent of NVR Reachability)");
  const signalLostResult = evaluator.evaluate({
    camera: { ...mockCamera, channelNumber: 4, id: "cam-178-04" },
    network: { reachable: true, port: 554, latencyMs: 10, protocol: "TCP" },
    recorderChannel: {
      channelId: "ch-4",
      channelNumber: 4,
      configured: true,
      connected: true,
      signalPresent: false,
      enabled: true,
      observedAt: new Date(),
    },
  });

  assert(signalLostResult.signalLost === true, "Identifies channel video loss on recorder");
  assert(signalLostResult.signal.state === "FAIL", "Signal layer observation is FAIL");
  assert(signalLostResult.state === "CRITICAL", "Signal loss triggers CRITICAL operational state");
  assert(signalLostResult.reasonCodes.includes("SIGNAL_LOST"), "Attaches SIGNAL_LOST reason code");

  // 5. Recording Active Verification (Live Working vs Recording Stopped)
  console.log("\nSuite 5: Recording Active Verification (Live Working vs Compliance Stopped)");
  const stoppedRecordingResult = evaluator.evaluate({
    camera: { ...mockCamera, channelNumber: 7, id: "cam-178-07" },
    network: { reachable: true, port: 554, latencyMs: 12, protocol: "TCP" },
    stream: { reachable: true, videoTrackPresent: true },
    decode: { decodable: true, decodedFrames: 5, decodeErrors: 0 },
    recording: {
      activelyWriting: false,
      recentSegmentsCount: 0,
      archiveContinuityOk: false,
      observedAt: new Date(),
    },
  });

  assert(stoppedRecordingResult.networkReachable === true, "Network is reachable");
  assert(stoppedRecordingResult.framesDecodable === true, "Live video is decodable");
  assert(stoppedRecordingResult.recordingActive === false, "Recording is actively stopped");
  assert(stoppedRecordingResult.state === "DEGRADED", "Evaluates to DEGRADED (Live Working, Recording Halted)");
  assert(stoppedRecordingResult.reasonCodes.includes("RECORDING_STOPPED"), "Attaches RECORDING_STOPPED reason code");

  // 6. Stale Telemetry Detection
  console.log("\nSuite 6: Telemetry Freshness & Stale-Data Guard (>90s -> UNKNOWN)");
  const staleObservedAt = new Date(Date.now() - 120_000);
  const staleResult = evaluator.evaluate({
    camera: mockCamera,
    network: { reachable: true, port: 554, latencyMs: 10, protocol: "TCP" },
    stream: { reachable: true, videoTrackPresent: true },
    decode: { decodable: true, decodedFrames: 5, decodeErrors: 0 },
    observedAt: staleObservedAt,
  });

  assert(staleResult.state === "UNKNOWN", "Stale telemetry (>90s) flips state to UNKNOWN");
  assert(staleResult.reasonCodes.includes("STALE_OBSERVATION"), "Attaches STALE_OBSERVATION reason code");

  // 7. Edge Agent CameraHealthService Branch Aggregation
  console.log("\nSuite 7: Edge Agent CameraHealthService Multi-Camera Branch Aggregation");
  const branchCameras: CameraConfiguration[] = [
    { ...mockCamera, id: "cam-178-01", channelNumber: 1, name: "Entrance" },
    { ...mockCamera, id: "cam-178-04", channelNumber: 4, name: "Lobby" },
    { ...mockCamera, id: "cam-178-07", channelNumber: 7, name: "Vault" },
  ];

  const mockNetProbe = {
    probe: async () => ({ reachable: true, port: 554, latencyMs: 10, protocol: "TCP" as const }),
  } as any;
  const mockStreamProbe = {
    inspect: async (cam: CameraConfiguration) => ({
      reachable: cam.channelNumber !== 4,
      videoTrackPresent: cam.channelNumber !== 4,
      codec: "h264",
      width: 1920,
      height: 1080,
      fps: 25,
      bitrateKbps: 4096,
    }),
  } as any;
  const mockDecProbe = {
    sample: async (cam: CameraConfiguration) => ({
      decodable: cam.channelNumber !== 4,
      decodedFrames: cam.channelNumber !== 4 ? 25 : 0,
      decodeErrors: 0,
    }),
  } as any;
  const mockFreezeDetector = {
    analyze: async () => ({
      frozen: false,
      confidence: 0.05,
      durationSeconds: 0,
      timestampProgressing: true,
      packetsFlowing: true,
    }),
  } as any;

  const mockHealthService = new CameraHealthService(
    mockNetProbe,
    mockStreamProbe,
    mockDecProbe,
    mockFreezeDetector,
    evaluator
  );

  const branchSummary = await mockHealthService.checkBranchCameras("branch-178", branchCameras);
  assert(branchSummary.totalCameras === 3, "Summary tracks 3 cameras");
  assert(branchSummary.healthyCameras === 1, "Correctly identifies 1 fully healthy camera (CAM01)");
  assert(branchSummary.criticalCameras === 1, "Correctly identifies 1 critical camera (CAM04 Signal Loss)");
  assert(branchSummary.degradedCameras === 1, "Correctly identifies 1 degraded camera (CAM07 No Record)");
  assert(branchSummary.streamingCoverage.fraction === "2/3", "Tracks streaming coverage (2/3)");
  assert(branchSummary.recordingCoverage.fraction === "1/3", "Tracks recording coverage (1/3)");

  // 8. REST API Endpoints Verification
  console.log("\nSuite 8: REST API Endpoints (Branch Cameras Health & Single Camera Diagnostics)");
  const store = new MemoryStore();
  const tenantId = "omsystems";

  (store as any).nodes.set("branch-178", {
    id: "branch-178",
    parentId: "company-1",
    tenantId,
    type: "branch",
    name: "Aluva Branch 178",
    code: "ALV-178",
    path: ["company-1", "branch-178"],
  });

  for (let i = 1; i <= 16; i++) {
    const chStr = String(i).padStart(2, "0");
    const camId = `cam-178-${chStr}`;
    (store as any).cameras.set(camId, {
      id: camId,
      name: `Camera ${chStr}`,
      tenantId,
      branchId: "branch-178",
      nodeId: "branch-178",
      channel: i,
      ipAddress: `192.168.1.${100 + i}`,
      capabilities: { ptz: false, audio: false, events: true },
      specifications: { frameRate: 25 },
      lastSeenAt: new Date().toISOString(),
    });

    const isCam4 = i === 4;
    const isCam7 = i === 7;
    (store as any).operationalTelemetry.set(`camera:${camId}`, {
      id: `tel-${camId}`,
      idempotencyKey: `tel-${camId}`,
      tenantId,
      branchId: "branch-178",
      deviceType: "camera",
      deviceId: camId,
      status: isCam4 ? "critical" : isCam7 ? "warning" : "healthy",
      reasonCodes: isCam4 ? ["SIGNAL_LOST"] : isCam7 ? ["RECORDING_STOPPED"] : [],
      observedAt: new Date().toISOString(),
      metrics: {
        status: isCam4 ? "critical" : isCam7 ? "warning" : "healthy",
        streamActive: !isCam4,
        recordingStatus: isCam4 || isCam7 ? "stopped" : "recording",
        retentionDays: 90,
        fps: isCam4 ? 0 : 25,
        videoLoss: isCam4,
        tamperingDetected: false,
        imageFrozen: false,
        blackScreen: false,
        latencyMs: 12,
      },
    });
  }

  const app = await buildApp({ store });
  await app.ready();

  const authHeaders = { "x-user-id": "user-global-admin" };

  const branchHealthResp = await app.inject({
    method: "GET",
    url: "/api/v1/branches/branch-178/cameras/health",
    headers: authHeaders,
  });
  assert(branchHealthResp.statusCode === 200, "GET /api/v1/branches/:branchId/cameras/health returns 200 OK", {
    statusCode: branchHealthResp.statusCode,
    body: branchHealthResp.body,
  });
  const branchData = JSON.parse(branchHealthResp.body);
  assert(branchData.cameras.length === 16, "Branch cameras health returns 16 cameras");
  assert(branchData.healthyCameras === 14, "Tracks 14 healthy cameras");
  assert(branchData.criticalCameras === 1, "Tracks 1 critical camera (CAM04)");
  assert(branchData.degradedCameras === 1, "Tracks 1 degraded camera (CAM07)");

  const camHealthResp = await app.inject({
    method: "GET",
    url: "/api/v1/cameras/cam-178-04/health",
    headers: authHeaders,
  });
  assert(camHealthResp.statusCode === 200, "GET /api/v1/cameras/:cameraId/health returns 200 OK");
  const camData = JSON.parse(camHealthResp.body);
  assert(camData.cameraId === "cam-178-04", "Returns diagnostic for cam-178-04");
  assert(camData.signalLost === true, "cam-178-04 has signalLost = true");
  assert(camData.network.source === "TCP", "Network layer has source = TCP");
  assert(camData.signal.source === "DAHUA_CGI", "Signal layer has source = DAHUA_CGI");

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  await app.close();
  process.exit(failed > 0 ? 1 : 0);
}

runCameraHealthTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
