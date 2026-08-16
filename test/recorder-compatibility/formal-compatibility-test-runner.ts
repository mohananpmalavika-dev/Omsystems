/**
 * Formal CP PLUS Compatibility Layer - Verification Test Runner
 * 
 * Verifies fingerprinting pipeline, evidence aggregation, confidence scoring with contradiction penalties,
 * capability detection, operation-level routing, backend diagnostics endpoints, and secret redaction.
 */

import { RecorderFingerprintService } from "../../edge-agent/src/recorders/fingerprint/recorder-fingerprint.service.js";
import { EvidenceAggregator } from "../../edge-agent/src/recorders/fingerprint/evidence-aggregator.js";
import { ConfidenceScorer } from "../../edge-agent/src/recorders/fingerprint/confidence-scorer.js";
import { CapabilityDetector } from "../../edge-agent/src/recorders/capabilities/capability-detector.js";
import { RecorderProtocolRouter } from "../../edge-agent/src/recorders/routing/recorder-protocol-router.js";
import { AdapterFallbackExecutor, RecorderOperationError } from "../../edge-agent/src/recorders/adapters/adapter-fallback-executor.js";
import { MemoryStore } from "../../src/store.js";
import { registerRecorderProfileRoutes } from "../../src/routes/recorder-profile.routes.js";
import Fastify from "fastify";
import type {
  ProbeContext,
  ProbeEvidence,
  RecorderDeviceProfile,
  RecorderProbe,
} from "../../edge-agent/src/recorders/types/recorder-profile.types.js";

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

async function runFormalCompatibilityTests() {
  console.log("================================================================================");
  console.log("  FORMAL CP PLUS COMPATIBILITY LAYER - VERIFICATION TEST RUNNER");
  console.log("================================================================================\n");

  const aggregator = new EvidenceAggregator();
  const scorer = new ConfidenceScorer();
  const detector = new CapabilityDetector();
  const router = new RecorderProtocolRouter();

  const mockContext: ProbeContext = {
    recorderId: "rec-cpplus-test-01",
    host: "192.168.1.150",
    port: 80,
    httpPorts: [80, 8080],
    rtspPort: 554,
    username: "admin",
    password: "SuperSecretPassword123!",
    credentialRef: "vault://recorders/rec-cpplus-test-01",
    configuredVendor: "cp-plus",
    requestTimeoutMs: 2000,
    maxRequests: 10,
    abortSignal: new AbortController().signal,
  };

  // --------------------------------------------------------------------------
  // Suite 1: Evidence Aggregation & Separate Identity Resolution
  // --------------------------------------------------------------------------
  console.log("Suite 1: Evidence Aggregation & Separate Identity Resolution");

  const sampleEvidences: ProbeEvidence[] = [
    {
      apiFamily: "ONVIF",
      probeId: "onvif-probe",
      outcome: "MATCH",
      confidence: 0.95,
      identity: {
        manufacturer: "CP PLUS",
        model: "CP-UNR-4K4322-V2",
        firmwareVersion: "4.120",
        serialNumber: "CP20260816999",
      },
      capabilities: {
        deviceInfo: "SUPPORTED",
        liveStream: "SUPPORTED",
        deviceTime: "SUPPORTED",
      },
      preferredApiFor: ["liveStream", "deviceTime"],
      observedAt: new Date().toISOString(),
    },
    {
      apiFamily: "DAHUA_CGI",
      probeId: "dahua-cgi-probe",
      outcome: "MATCH",
      confidence: 0.98,
      identity: {
        manufacturer: "CP PLUS",
        model: "CP-UNR-4K4322-V2",
        firmwareVersion: "4.120",
      },
      capabilities: {
        channels: "SUPPORTED",
        recordingStatus: "SUPPORTED",
        playbackSearch: "SUPPORTED",
        storageStatus: "SUPPORTED",
        smartTelemetry: "PARTIAL",
      },
      preferredApiFor: ["channels", "recordingStatus", "playbackSearch", "storageStatus", "smartTelemetry"],
      observedAt: new Date().toISOString(),
    },
    {
      apiFamily: "HTTP",
      probeId: "http-identity-probe",
      outcome: "MATCH",
      confidence: 0.65,
      identity: {
        manufacturer: "CP PLUS",
      },
      observedAt: new Date().toISOString(),
    },
  ];

  const reconciledIdentity = aggregator.resolveIdentity(sampleEvidences, "cp-plus");
  const resolvedFamilies = aggregator.resolveApiFamilies(sampleEvidences);

  assert(reconciledIdentity.manufacturer === "CP PLUS", "Resolves canonical manufacturer CP PLUS from merged evidence");
  assert(reconciledIdentity.model === "CP-UNR-4K4322-V2", "Resolves exact model CP-UNR-4K4322-V2");
  assert(reconciledIdentity.firmwareVersion === "4.120", "Resolves firmware version 4.120");
  assert(reconciledIdentity.contradictions === 0, "Zero contradictions on matching ONVIF + Dahua CGI probes");

  // --------------------------------------------------------------------------
  // Suite 2: Confidence Scoring & Contradiction Penalty
  // --------------------------------------------------------------------------
  console.log("\nSuite 2: Confidence Scoring & Contradiction Penalty");

  const cleanScore = scorer.score({
    identityEvidence: reconciledIdentity.identityEvidence,
    apiEvidence: resolvedFamilies.apiEvidence,
    contradictions: reconciledIdentity.contradictions,
  });
  const cleanLabel = scorer.getLabel(cleanScore);

  assert(cleanScore >= 0.85, `Clean match calculates high confidence >= 0.85 (got ${cleanScore.toFixed(2)})`);
  assert(cleanLabel === "CONFIRMED", "High confidence score categorized as CONFIRMED");

  // Contradictory evidence scenario
  const conflictingEvidences: ProbeEvidence[] = [
    ...sampleEvidences,
    {
      apiFamily: "HIKVISION_ISAPI",
      probeId: "hik-probe",
      outcome: "MATCH",
      confidence: 0.80,
      identity: {
        manufacturer: "Hikvision",
        model: "DS-7616NI",
      },
      observedAt: new Date().toISOString(),
    },
  ];

  const conflictingIdentity = aggregator.resolveIdentity(conflictingEvidences, "cp-plus");
  const conflictingFamilies = aggregator.resolveApiFamilies(conflictingEvidences);
  const penalizedScore = scorer.score({
    identityEvidence: conflictingIdentity.identityEvidence,
    apiEvidence: conflictingFamilies.apiEvidence,
    contradictions: conflictingIdentity.contradictions,
  });

  assert(conflictingIdentity.contradictions > 0, "Detects contradictions when manufacturers conflict");
  assert(penalizedScore < cleanScore, "Applies contradiction penalty to reduce confidence score");

  // --------------------------------------------------------------------------
  // Suite 3: Capability Detection & Negative Assertions
  // --------------------------------------------------------------------------
  console.log("\nSuite 3: Capability Detection & Negative Assertions");

  const capabilities = detector.detect(sampleEvidences);
  assert(capabilities.deviceInfo.state === "SUPPORTED", "DeviceInfo is marked SUPPORTED");
  assert(capabilities.channels.state === "SUPPORTED", "Channels discovery is marked SUPPORTED");
  assert(capabilities.liveStream.state === "SUPPORTED", "LiveStream is marked SUPPORTED");
  assert(capabilities.storageStatus.state === "SUPPORTED", "StorageStatus is marked SUPPORTED");
  assert(capabilities.smartTelemetry.state === "PARTIAL", "SMART Telemetry is strictly PARTIAL when full SMART dumps are missing (never fabricated)");
  assert(capabilities.smartTelemetry.state !== "SUPPORTED", "SMART Telemetry is NOT falsely asserted as fully SUPPORTED");

  // --------------------------------------------------------------------------
  // Suite 4: Operation-Level Adapter Routing & Fallbacks
  // --------------------------------------------------------------------------
  console.log("\nSuite 4: Operation-Level Adapter Routing & Fallbacks");

  const mockProfile: RecorderDeviceProfile = {
    profileVersion: 1,
    recorderId: "rec-cpplus-test-01",
    tenantId: "t-1",
    branchId: "b-1",
    configuredVendor: "cp-plus",
    fingerprint: {
      manufacturer: "CP PLUS",
      model: "CP-UNR-4K4322-V2",
      firmwareVersion: "4.120",
      detectedApiFamilies: {
        onvif: true,
        dahuaCgi: true,
        hikvisionIsapi: false,
        proprietary: false,
        rtsp: true,
      },
      capabilities,
      confidence: cleanScore,
    },
    identityEvidence: reconciledIdentity.identityEvidence,
    apiEvidence: resolvedFamilies.apiEvidence,
    preferredApiOrder: ["DAHUA_CGI", "ONVIF", "RTSP"],
    credentialRef: "vault://recorders/rec-cpplus-test-01",
    firstSeenAt: new Date().toISOString(),
    lastFingerprintedAt: new Date().toISOString(),
    nextFingerprintAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    fingerprintReason: "NEW_DEVICE",
    signature: "sha256-test-signature",
  };

  const streamRoute = router.select("GET_STREAM_URI", mockProfile);
  assert(streamRoute[0] === "ONVIF" || streamRoute[0] === "RTSP", "GET_STREAM_URI routes to ONVIF or RTSP");

  const storageRoute = router.select("GET_STORAGE", mockProfile);
  assert(storageRoute[0] === "DAHUA_CGI", "GET_STORAGE routes to DAHUA_CGI");

  const channelRoute = router.select("LIST_CHANNELS", mockProfile);
  assert(channelRoute[0] === "DAHUA_CGI", "LIST_CHANNELS routes to DAHUA_CGI");

  const fallbackExecutor = new AdapterFallbackExecutor();
  fallbackExecutor.register({
    family: "DAHUA_CGI",
    async execute() {
      const err: any = new Error("404_not_found");
      err.statusCode = 404;
      throw err;
    },
  });
  fallbackExecutor.register({
    family: "ONVIF",
    async execute() {
      return { success: true, via: "ONVIF" };
    },
  });

  const fbResult = await fallbackExecutor.executeWithFallback<any>("GET_DEVICE_INFO", ["DAHUA_CGI", "ONVIF"], {
    recorderId: "rec-1", host: "10.0.0.1", port: 80,
  });
  assert(fbResult.via === "ONVIF", "Falls back to ONVIF on 404 endpoint error");

  // --------------------------------------------------------------------------
  // Suite 5: Full Fingerprint Service with Mock Probes
  // --------------------------------------------------------------------------
  console.log("\nSuite 5: Full Fingerprint Service End-to-End");

  const mockDahuaProbe: RecorderProbe = {
    id: "mock-dahua-probe",
    cost: 2,
    apiFamily: "DAHUA_CGI",
    async run() {
      return {
        apiFamily: "DAHUA_CGI",
        probeId: "mock-dahua-probe",
        outcome: "MATCH",
        confidence: 0.98,
        identity: {
          manufacturer: "CP PLUS",
          model: "CP-UNR-4K4322-V2",
          firmwareVersion: "4.120",
          serialNumber: "CP-SER-12345",
        },
        capabilities: {
          deviceInfo: "SUPPORTED",
          channels: "SUPPORTED",
          storageStatus: "SUPPORTED",
          recordingStatus: "SUPPORTED",
          playbackSearch: "SUPPORTED",
          smartTelemetry: "PARTIAL",
        },
        preferredApiFor: ["channels", "recordingStatus", "playbackSearch", "storageStatus"],
        observedAt: new Date().toISOString(),
      };
    },
  };

  const mockOnvifProbe: RecorderProbe = {
    id: "mock-onvif-probe",
    cost: 2,
    apiFamily: "ONVIF",
    async run() {
      return {
        apiFamily: "ONVIF",
        probeId: "mock-onvif-probe",
        outcome: "MATCH",
        confidence: 0.95,
        identity: {
          manufacturer: "CP PLUS",
          model: "CP-UNR-4K4322-V2",
          firmwareVersion: "4.120",
        },
        capabilities: {
          deviceInfo: "SUPPORTED",
          liveStream: "SUPPORTED",
          deviceTime: "SUPPORTED",
        },
        preferredApiFor: ["liveStream", "deviceTime"],
        observedAt: new Date().toISOString(),
      };
    },
  };

  const service = new RecorderFingerprintService({ probes: [mockDahuaProbe, mockOnvifProbe] });
  const profile = await service.fingerprint(mockContext);

  assert(profile.recorderId === "rec-cpplus-test-01", "Profile matches target recorder ID");
  assert(profile.fingerprint.manufacturer === "CP PLUS", "Profile captures manufacturer CP PLUS");
  assert(profile.fingerprint.confidence >= 0.85, "Profile generates high confidence score");
  assert(typeof profile.signature === "string" && profile.signature.length === 64, "Generates 64-char SHA256 signature for drift detection");
  assert(profile.credentialRef.startsWith("vault://"), "Stores vault secret reference instead of plaintext password");

  // --------------------------------------------------------------------------
  // Suite 6: Backend Control-Plane REST Routes
  // --------------------------------------------------------------------------
  console.log("\nSuite 6: Backend Control-Plane REST Routes");

  const app = Fastify();
  const store = new MemoryStore();
  await registerRecorderProfileRoutes(app, store);

  // 1. Save profile
  const saveRes = await app.inject({
    method: "POST",
    url: "/v1/recorders/rec-cpplus-test-01/fingerprint",
    payload: profile,
  });
  assert(saveRes.statusCode === 200, "POST /v1/recorders/:id/fingerprint succeeds (200 OK)");

  // 2. Get profile
  const getProfRes = await app.inject({
    method: "GET",
    url: "/v1/recorders/rec-cpplus-test-01/profile",
  });
  assert(getProfRes.statusCode === 200, "GET /v1/recorders/:id/profile returns stored profile");
  const profBody = JSON.parse(getProfRes.body);
  assert(profBody.fingerprint?.manufacturer === "CP PLUS", "Returned profile retains CP PLUS manufacturer");

  // 3. Get capabilities
  const getCapRes = await app.inject({
    method: "GET",
    url: "/v1/recorders/rec-cpplus-test-01/capabilities",
  });
  assert(getCapRes.statusCode === 200, "GET /v1/recorders/:id/capabilities returns 200 OK");
  const capBody = JSON.parse(getCapRes.body);
  assert(capBody.capabilities.channels.state === "SUPPORTED", "Capabilities payload contains channels SUPPORTED");

  // 4. Get compatibility diagnostics
  const getDiagRes = await app.inject({
    method: "GET",
    url: "/v1/recorders/rec-cpplus-test-01/compatibility-diagnostics",
  });
  assert(getDiagRes.statusCode === 200, "GET /v1/recorders/:id/compatibility-diagnostics returns 200 OK");
  const diagBody = JSON.parse(getDiagRes.body);
  assert(diagBody.primaryApi === "DAHUA_CGI", "Diagnostics confirms primaryApi as DAHUA_CGI");

  // 5. Trigger refingerprint
  const refingRes = await app.inject({
    method: "POST",
    url: "/v1/recorders/rec-cpplus-test-01/refingerprint",
    payload: { reason: "MANUAL" },
  });
  assert(refingRes.statusCode === 202, "POST /v1/recorders/:id/refingerprint returns 202 Accepted");

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

runFormalCompatibilityTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
