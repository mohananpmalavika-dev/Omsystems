/**
 * P0 Milestone Verification Test Runner
 *
 * Validates:
 * 1. P0-A: Canonical Recorder Drivers (CP PLUS, Dahua, Hikvision, ONVIF) with Authoritative Evidence
 * 2. P0-A: True 6-Layer Camera Health Verification (RTSP, Decode, Visual Continuity, Recording)
 * 3. P0-C: 400-Branch Mosaic Single-Query Read Model & High-Performance Benchmark
 * 4. Control-Plane REST Routes
 */

import Fastify from "fastify";
import { registerP0ControlPlaneRoutes } from "../../src/routes/p0-control-plane.routes.js";
import { recorderDriverFactory } from "../../src/recorder-drivers/services/recorder-driver-factory.service.js";
import { cameraVerificationService } from "../../src/camera-verification/services/camera-verification.service.js";
import { branchMosaicService } from "../../src/branch-mosaic/services/branch-mosaic.service.js";

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

async function runP0Tests() {
  console.log("================================================================================");
  console.log("  P0 READINESS & ARCHITECTURAL VERIFICATION - TEST RUNNER");
  console.log("================================================================================\n");

  const app = Fastify();
  await app.register(registerP0ControlPlaneRoutes);

  // --------------------------------------------------------------------------
  // Suite 1: Canonical Recorder Drivers & Authoritative Evidence
  // --------------------------------------------------------------------------
  console.log("Suite 1: Canonical Recorder Drivers & Authoritative Evidence");

  // 1. CP PLUS Driver
  const cpDriver = recorderDriverFactory.createDriver({
    recorderId: "DVR-BR118-01",
    branchId: "BR-118",
    vendor: "CP_PLUS",
    host: "192.168.1.100",
    port: 80,
  });
  assert(cpDriver.vendor === "CP_PLUS", "Factory creates CpPlusRecorderDriver");

  const cpObs = await cpDriver.buildAuthoritativeObservation(90);
  assert(cpObs.connectivity.state === "HEALTHY", "CP PLUS connectivity is HEALTHY");
  assert(cpObs.connectivity.source === "CP_PLUS_API", "Connectivity source is CP_PLUS_API");
  assert(cpObs.channels.value.online === 16, "CP PLUS enumerates 16 online channels");
  assert(cpObs.disks.value.length === 2, "CP PLUS reports 2 physical HDDs");
  assert(cpObs.disks.value[0].smartSupported === true, "CP PLUS disk reports SMART supported");
  assert(cpObs.recording.value.isAllRecording === true, "CP PLUS confirms active recording across channels");
  assert(cpObs.retention.value.isCompliant === true, "CP PLUS confirms retention >= 90 days (observed 93d)");
  assert(cpObs.deviceTime.value.offsetSeconds < 1.0, "CP PLUS clock offset is within tolerance (0.8s)");

  // 2. Dahua Driver
  const dhDriver = recorderDriverFactory.createDriver({
    recorderId: "DVR-BR200-01",
    branchId: "BR-200",
    vendor: "DAHUA",
    host: "192.168.1.101",
    port: 80,
  });
  assert(dhDriver.vendor === "DAHUA", "Factory creates DahuaRecorderDriver");
  const dhObs = await dhDriver.buildAuthoritativeObservation(90);
  assert(dhObs.connectivity.source === "DAHUA_API", "Dahua connectivity source is DAHUA_API");

  // 3. Hikvision Driver
  const hikDriver = recorderDriverFactory.createDriver({
    recorderId: "NVR-BR300-01",
    branchId: "BR-300",
    vendor: "HIKVISION",
    host: "192.168.1.102",
    port: 80,
  });
  assert(hikDriver.vendor === "HIKVISION", "Factory creates HikvisionRecorderDriver");
  const hikObs = await hikDriver.buildAuthoritativeObservation(90);
  assert(hikObs.connectivity.source === "HIKVISION_API", "Hikvision connectivity source is HIKVISION_API");

  // 4. ONVIF Generic Driver
  const onvifDriver = recorderDriverFactory.createDriver({
    recorderId: "NVR-GEN-01",
    branchId: "BR-400",
    vendor: "ONVIF",
    host: "192.168.1.103",
    port: 80,
  });
  assert(onvifDriver.vendor === "ONVIF", "Factory creates OnvifRecorderDriver");
  const onvifObs = await onvifDriver.buildAuthoritativeObservation(90);
  assert(onvifObs.connectivity.source === "ONVIF", "ONVIF connectivity source is ONVIF");

  // 5. Vendor Auto-Detection
  assert(recorderDriverFactory.detectVendor("CP PLUS 32CH NVR") === "CP_PLUS", "Detects CP PLUS from device string");
  assert(recorderDriverFactory.detectVendor("Dahua DHI-NVR5432") === "DAHUA", "Detects Dahua from device string");
  assert(recorderDriverFactory.detectVendor("Hikvision DS-7732NI") === "HIKVISION", "Detects Hikvision from device string");

  // --------------------------------------------------------------------------
  // Suite 2: True 6-Layer Camera Health Verification
  // --------------------------------------------------------------------------
  console.log("\nSuite 2: True 6-Layer Camera Health Verification");

  // 1. Fully Healthy Camera
  const healthyCam = cameraVerificationService.evaluateCameraHealth({
    cameraId: "CAM-01",
    branchId: "BR-118",
    channelConnected: true,
    signalLoss: false,
    rtspReachable: true,
    decodable: true,
    frozenFrameDetected: false,
    blackFrameDetected: false,
    recordingNow: true,
  });
  assert(healthyCam.overallState === "HEALTHY", "All 6 layers passing evaluates to HEALTHY");
  assert(healthyCam.visualContinuity.state === "HEALTHY", "Visual continuity is HEALTHY");

  // 2. Frozen Frame Failure
  const frozenCam = cameraVerificationService.evaluateCameraHealth({
    cameraId: "CAM-02",
    branchId: "BR-118",
    channelConnected: true,
    signalLoss: false,
    rtspReachable: true,
    decodable: true,
    frozenFrameDetected: true, // Frozen video
    blackFrameDetected: false,
    recordingNow: true,
  });
  assert(frozenCam.overallState === "UNHEALTHY", "Frozen frame evaluates to UNHEALTHY");
  assert(frozenCam.visualContinuity.reason?.includes("Frozen video") === true, "Identifies frozen video reason");

  // 3. Black Frame / Video Loss
  const blackCam = cameraVerificationService.evaluateCameraHealth({
    cameraId: "CAM-03",
    branchId: "BR-118",
    channelConnected: true,
    signalLoss: false,
    rtspReachable: true,
    decodable: true,
    frozenFrameDetected: false,
    blackFrameDetected: true, // Black frame
    recordingNow: true,
  });
  assert(blackCam.overallState === "UNHEALTHY", "Black frame evaluates to UNHEALTHY");

  // 4. Stream Active but Recording Stopped -> DEGRADED
  const degradedCam = cameraVerificationService.evaluateCameraHealth({
    cameraId: "CAM-04",
    branchId: "BR-118",
    channelConnected: true,
    signalLoss: false,
    rtspReachable: true,
    decodable: true,
    frozenFrameDetected: false,
    blackFrameDetected: false,
    recordingNow: false, // Recording stopped
  });
  assert(degradedCam.overallState === "DEGRADED", "Active stream with stopped recording evaluates to DEGRADED");

  // --------------------------------------------------------------------------
  // Suite 3: 400-Branch Mosaic Read-Model & Latency Benchmark
  // --------------------------------------------------------------------------
  console.log("\nSuite 3: 400-Branch Mosaic Read-Model & Latency Benchmark");

  const mosaic = await branchMosaicService.getMosaicProjections("omsystems");
  assert(mosaic.branches.length === 400, "Mosaic contains exactly 400 branches");
  assert(mosaic.summary.totalBranches === 400, "Summary reports 400 total branches");
  assert(mosaic.queryDurationMs < 300, `Single-query execution ${mosaic.queryDurationMs}ms meets P95 < 300ms SLA`);
  assert(mosaic.summary.healthyBranches > 390, "Accurately calculates healthy branch count");

  // One-click drilldown
  const drilldown = await branchMosaicService.getBranchDrilldown("BR-088");
  assert(drilldown !== undefined, "One-click drilldown returns detail for BR-088");
  assert(drilldown?.projection.branchId === "BR-088", "Drilldown matches branchId BR-088");
  assert(drilldown?.rootCause?.entityType === "INTERNET", "Drilldown identifies root cause for Branch 88");
  assert(drilldown?.devices.length >= 3, "Drilldown lists branch devices (DVR + Cameras)");

  // --------------------------------------------------------------------------
  // Suite 4: Backend REST Control-Plane Routes
  // --------------------------------------------------------------------------
  console.log("\nSuite 4: Backend REST Control-Plane Routes");

  // 1. GET /v1/mosaic/branches
  const mosaicRes = await app.inject({
    method: "GET",
    url: "/v1/mosaic/branches",
  });
  assert(mosaicRes.statusCode === 200, "GET /v1/mosaic/branches returns 200 OK");
  const mosaicData = JSON.parse(mosaicRes.body);
  assert(mosaicData.data.branches.length === 400, "API returns 400 branch projections");

  // 2. GET /v1/mosaic/branches/:branchId/drilldown
  const drillRes = await app.inject({
    method: "GET",
    url: "/v1/mosaic/branches/BR-118/drilldown",
  });
  assert(drillRes.statusCode === 200, "GET /v1/mosaic/branches/:branchId/drilldown returns 200 OK");
  const drillData = JSON.parse(drillRes.body);
  assert(drillData.data.projection.branchId === "BR-118", "Drilldown returns details for BR-118");

  // 3. POST /v1/recorders/drivers/probe
  const probeRes = await app.inject({
    method: "POST",
    url: "/v1/recorders/drivers/probe",
    payload: {
      recorderId: "DVR-BR118-01",
      branchId: "BR-118",
      vendor: "CP_PLUS",
      host: "192.168.1.100",
      port: 80,
      targetRetentionDays: 90,
    },
  });
  assert(probeRes.statusCode === 200, "POST /v1/recorders/drivers/probe returns 200 OK");
  const probeData = JSON.parse(probeRes.body);
  assert(probeData.data.vendor === "CP_PLUS", "Probe returns CP_PLUS observation");
  assert(probeData.data.disks.value.length === 2, "Probe returns 2 disks");

  // 4. POST /v1/cameras/verify
  const verifyRes = await app.inject({
    method: "POST",
    url: "/v1/cameras/verify",
    payload: {
      cameraId: "CAM-BR118-01",
      branchId: "BR-118",
      channelConnected: true,
      signalLoss: false,
      rtspReachable: true,
      decodable: true,
      frozenFrameDetected: false,
      blackFrameDetected: false,
      recordingNow: true,
    },
  });
  assert(verifyRes.statusCode === 200, "POST /v1/cameras/verify returns 200 OK");
  const verifyData = JSON.parse(verifyRes.body);
  assert(verifyData.data.overallState === "HEALTHY", "Camera verify endpoint confirms HEALTHY state");

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

runP0Tests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
