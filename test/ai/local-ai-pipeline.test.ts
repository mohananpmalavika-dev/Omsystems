/**
 * Local Open-Source AI Pipeline & Zero-Cloud Cost Test Runner
 * 
 * Verifies that all AI capabilities (YOLO Computer Vision, Native Onboard AI,
 * Local ANPR, Local Face Matching, Camera Tamper AI, and Incident Summarization)
 * function 100% locally with zero external paid APIs.
 */

import { localVisionEngineService } from "../../src/ai/services/local-vision-engine.service.js";
import { localAnprService } from "../../src/ai/services/local-anpr.service.js";
import { localFaceMatcherService } from "../../src/ai/services/local-face-matcher.service.js";
import { localIncidentSummaryService } from "../../src/ai/services/local-incident-summary.service.js";
import { buildApp } from "../../src/app.js";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedCount++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failedCount++;
  }
}

async function runLocalAiTests() {
  console.log("================================================================================");
  console.log("  100% FREE LOCAL OPEN-SOURCE AI PIPELINE - VERIFICATION TEST RUNNER");
  console.log("================================================================================\n");

  // Suite 1: Local Vision Engine & Native Hardware AI Ingestion
  console.log("Suite 1: Local Vision Engine (YOLO & Native Hardware AI)");
  {
    const status = localVisionEngineService.getStatus();
    assert(status.online === true, "Local AI Engine is online");
    assert(status.monthlyCloudCost === 0, "Monthly cloud AI cost is 0 (100% Free)");
    assert(status.externalApiDependencies.length === 0, "Zero external paid API dependencies");
    assert(status.availableModels.includes("YOLO_V8_NANO"), "Supports local YOLOv8 ONNX model");
    assert(status.availableModels.includes("CP_PLUS_IVS"), "Supports native CP PLUS onboard IVS");
    assert(status.availableModels.includes("DAHUA_SMD"), "Supports native Dahua SMD");
    assert(status.availableModels.includes("HIKVISION_ACUSENSE"), "Supports native Hikvision AcuSense");

    // Local YOLO inference
    const yoloDetections = await localVisionEngineService.processFrame({
      cameraId: "cam-vault-01",
      branchId: "branch-aluva-178",
      zone: "VAULT",
    });
    assert(yoloDetections.length > 0, "YOLO detector returns detections");
    assert(yoloDetections[0]?.classification === "PERSON", "YOLO classifies person in vault zone");
    assert(yoloDetections[0]?.modelUsed === "YOLO_V8_NANO", "Model used is local YOLO_V8_NANO");

    // Native CP PLUS hardware AI event
    const cpPlusDetections = await localVisionEngineService.processFrame({
      cameraId: "cam-gate-02",
      branchId: "branch-aluva-178",
      hardwareEvent: {
        vendor: "CP_PLUS",
        eventType: "CrossLineDetection_Pedestrian",
        confidence: 0.98,
      },
    });
    assert(cpPlusDetections[0]?.classification === "PERSON", "CP PLUS event mapped to PERSON");
    assert(cpPlusDetections[0]?.modelUsed === "CP_PLUS_IVS", "Identifies CP_PLUS_IVS source");

    // Native Hikvision AcuSense hardware AI event
    const hikDetections = await localVisionEngineService.processFrame({
      cameraId: "cam-parking-03",
      branchId: "branch-aluva-178",
      hardwareEvent: {
        vendor: "HIKVISION",
        eventType: "VehiclePerimeterIntrusion",
        confidence: 0.95,
      },
    });
    assert(hikDetections[0]?.classification === "VEHICLE", "Hikvision event mapped to VEHICLE");
    assert(hikDetections[0]?.modelUsed === "HIKVISION_ACUSENSE", "Identifies HIKVISION_ACUSENSE source");
  }

  // Suite 2: Camera Anti-Tamper & Frame Quality AI
  console.log("\nSuite 2: Camera Anti-Tamper & Quality AI");
  {
    const blackFrame = await localVisionEngineService.evaluateCameraTampering({
      cameraId: "cam-01",
      branchId: "branch-178",
      frameVariance: 1.2, // Black frame
    });
    assert(blackFrame.isTampered === true, "Detects black/blank frame as tampered");
    assert(blackFrame.tamperType === "BLACK_FRAME", "Tamper type is BLACK_FRAME");

    const frozenFrame = await localVisionEngineService.evaluateCameraTampering({
      cameraId: "cam-02",
      branchId: "branch-178",
      ssimScore: 0.9995, // Frozen identical frames
    });
    assert(frozenFrame.isTampered === true, "Detects frozen video feed");
    assert(frozenFrame.tamperType === "FROZEN_VIDEO", "Tamper type is FROZEN_VIDEO");

    const healthyFrame = await localVisionEngineService.evaluateCameraTampering({
      cameraId: "cam-03",
      branchId: "branch-178",
      frameVariance: 52.0,
      ssimScore: 0.82,
    });
    assert(healthyFrame.isTampered === false, "Healthy live video evaluates as untampered");
    assert(healthyFrame.tamperType === "NONE", "Tamper type is NONE");
  }

  // Suite 3: Local ANPR License Plate Recognition
  console.log("\nSuite 3: Local ANPR (Automatic Number Plate Recognition)");
  {
    const anprResult = await localAnprService.recognizePlate({
      cameraId: "cam-entry-01",
      branchId: "branch-178",
      rawText: "KL07CD1234",
    });
    assert(anprResult.plateNumber === "KL-07-CD-1234", "Formats plate to standard KL-07-CD-1234");
    assert(anprResult.normalizedPlate === "KL07CD1234", "Normalizes plate alphanumeric characters");
    assert(anprResult.stateCode === "KL", "Extracts state code KL (Kerala)");
    assert(anprResult.isWatchlistMatch === true, "Matches against local suspicious watchlist");
    assert(anprResult.matchedListType === "SUSPICIOUS", "Matches list type SUSPICIOUS");

    const cleanPlate = await localAnprService.recognizePlate({
      cameraId: "cam-entry-02",
      branchId: "branch-178",
      rawText: "MH 12 AB 9999",
    });
    assert(cleanPlate.plateNumber === "MH-12-AB-9999", "Formats MH plate correctly");
    assert(cleanPlate.stateCode === "MH", "Extracts state code MH (Maharashtra)");
  }

  // Suite 4: Local Face Vector Matcher (Cosine Similarity)
  console.log("\nSuite 4: Local Face Watchlist & Biometric Matching");
  {
    // Match exact wanted suspect vector
    const suspectVector = localFaceMatcherService.createSyntheticVector(0.5);
    const matchResult = await localFaceMatcherService.matchFace({
      cameraId: "cam-lobby-01",
      branchId: "branch-178",
      embeddingVector: suspectVector,
      minThreshold: 0.75,
    });
    assert(matchResult.matched === true, "Successfully matches face vector against watchlist");
    assert(matchResult.candidate?.name === "Suspect Person A", "Identifies Suspect Person A");
    assert(matchResult.candidate?.watchlistType === "WANTED", "Watchlist type is WANTED");
    assert(matchResult.confidence > 0.99, "Similarity confidence > 99%");

    // Non-match test with dissimilar vector
    const unknownVector = localFaceMatcherService.createSyntheticVector(9.9);
    const nonMatch = await localFaceMatcherService.matchFace({
      cameraId: "cam-lobby-01",
      branchId: "branch-178",
      embeddingVector: unknownVector,
      minThreshold: 0.75,
    });
    assert(nonMatch.matched === false, "Correctly rejects non-watchlist face vector");
  }

  // Suite 5: Local Incident Summary Generator
  console.log("\nSuite 5: Local Incident Investigation & Timeline Summary");
  {
    const summary = await localIncidentSummaryService.generateSummary({
      incidentId: "inc-178-01",
      branchId: "branch-178",
      branchName: "Aluva Main Branch",
      alertType: "VAULT_INTRUSION",
      rootCause: "Unauthorized motion in strongroom after branch closure",
    });
    assert(summary.aiEngine === "LOCAL_DETERMINISTIC_RULES", "Engine is LOCAL_DETERMINISTIC_RULES");
    assert(summary.cloudCost === 0, "Cloud cost is 0");
    assert(summary.keyFindings.length >= 3, "Generates multi-point key findings");
    assert(summary.immediateActionsTaken.length >= 2, "Generates immediate action checklist");
    assert(summary.timeline.length >= 3, "Reconstructs chronological incident timeline");
  }

  // Suite 6: Control Plane REST API Routes
  console.log("\nSuite 6: Control Plane REST API Routes");
  {
    const app = await buildApp({
      reportDownloadSecret: "test-secret-key-1234567890123456",
      jwtSecret: "test-jwt-secret-12345678901234567890",
    });

    const headers = { "x-user-id": "user-superadmin-mgdhanyamohan" };

    const statusRes = await app.inject({
      method: "GET",
      url: "/v1/ai/status",
      headers,
    });
    assert(statusRes.statusCode === 200, "GET /v1/ai/status returns 200 OK");
    const statusPayload = JSON.parse(statusRes.payload);
    assert(statusPayload.data?.monthlyCloudCost === 0, "API reports monthlyCloudCost = 0");

    const visionRes = await app.inject({
      method: "POST",
      url: "/v1/ai/vision/detect",
      headers,
      payload: {
        cameraId: "cam-101",
        branchId: "br-01",
        zone: "VAULT",
      },
    });
    assert(visionRes.statusCode === 200, "POST /v1/ai/vision/detect returns 200 OK");
    const visionPayload = JSON.parse(visionRes.payload);
    assert(visionPayload.data?.[0]?.classification === "PERSON", "API returns local detection");

    const anprRes = await app.inject({
      method: "POST",
      url: "/v1/ai/anpr/recognize",
      headers,
      payload: {
        cameraId: "cam-entry-1",
        branchId: "br-01",
        rawText: "KL07CD1234",
      },
    });
    assert(anprRes.statusCode === 200, "POST /v1/ai/anpr/recognize returns 200 OK");
    const anprPayload = JSON.parse(anprRes.payload);
    assert(anprPayload.data?.plateNumber === "KL-07-CD-1234", "API returns recognized plate");

    const faceRes = await app.inject({
      method: "POST",
      url: "/v1/ai/face/match",
      headers,
      payload: {
        cameraId: "cam-lobby-1",
        branchId: "br-01",
        embeddingVector: localFaceMatcherService.createSyntheticVector(0.5),
      },
    });
    assert(faceRes.statusCode === 200, "POST /v1/ai/face/match returns 200 OK");
    const facePayload = JSON.parse(faceRes.payload);
    assert(facePayload.data?.matched === true, "API returns face match candidate");

    await app.close();
  }

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passedCount} passed, ${failedCount} failed`);
  console.log("================================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runLocalAiTests().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
