import { ConfidenceScorer } from "../../edge-agent/src/recorders/fingerprint/confidence-scorer.js";
import { EvidenceAggregator } from "../../edge-agent/src/recorders/fingerprint/evidence-aggregator.js";
import { CapabilityDetector } from "../../edge-agent/src/recorders/capabilities/capability-detector.js";
import { RecorderProtocolRouter } from "../../edge-agent/src/recorders/routing/recorder-protocol-router.js";
import { AdapterFallbackExecutor, RecorderOperationError } from "../../edge-agent/src/recorders/adapters/adapter-fallback-executor.js";
import { RecorderFingerprintService } from "../../edge-agent/src/recorders/fingerprint/recorder-fingerprint.service.js";
import { RecorderProfileRepository } from "../../edge-agent/src/recorders/profiles/recorder-profile.repository.js";
import { MemoryStore } from "../../src/store.js";
import { registerRecorderProfileRoutes } from "../../src/routes/recorder-profile.routes.js";
import Fastify from "fastify";
import type { ProbeContext, ProbeEvidence, RecorderProbe } from "../../edge-agent/src/recorders/types/recorder-profile.types.js";

async function runTests() {
  console.log("================================================================================");
  console.log("  CP PLUS & RECORDER COMPATIBILITY LAYER - VERIFICATION TEST RUNNER");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, description: string) {
    if (condition) {
      console.log(`  [PASS] ${description}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${description}`);
      failed++;
    }
  }

  // 1. Confidence Scorer Tests
  console.log("Suite 1: Confidence Scoring & Classification");
  const scorer = new ConfidenceScorer();
  const highConf = scorer.score({
    identityEvidence: [
      { source: "ONVIF", manufacturer: "CP PLUS", model: "CP-UNR-4K4322-V2", confidence: 0.95 },
      { source: "DAHUA_CGI", manufacturer: "CP PLUS", model: "CP-UNR-4K4322-V2", confidence: 0.98 },
    ],
    apiEvidence: [
      { family: "DAHUA_CGI", probeId: "dahua-cgi", confirmed: true, confidence: 0.97, observedAt: "" },
      { family: "ONVIF", probeId: "onvif", confirmed: true, confidence: 0.95, observedAt: "" },
    ],
    contradictions: 0,
  });
  assert(highConf >= 0.85, "Calculates high confidence >= 0.85 for matching ONVIF + Dahua CGI");
  assert(scorer.getLabel(highConf) === "CONFIRMED", "Labels high confidence score as CONFIRMED");

  const penScore = scorer.score({
    identityEvidence: [
      { source: "ONVIF", manufacturer: "Hikvision", confidence: 0.95 },
      { source: "DAHUA_CGI", manufacturer: "Dahua", confidence: 0.95 },
    ],
    apiEvidence: [{ family: "DAHUA_CGI", probeId: "dahua-cgi", confirmed: true, confidence: 0.90, observedAt: "" }],
    contradictions: 1,
  });
  assert(penScore < 0.70, "Applies contradiction penalty when identities conflict");

  // 2. Evidence Aggregator Tests
  console.log("\nSuite 2: Evidence Aggregation & Identity Reconciliation");
  const aggregator = new EvidenceAggregator();
  const evidence: ProbeEvidence[] = [
    {
      apiFamily: "DAHUA_CGI",
      probeId: "dahua-cgi-probe",
      outcome: "MATCH",
      confidence: 0.96,
      identity: {
        manufacturer: "CP PLUS",
        model: "CP-UNR-4K4322-V2",
        firmwareVersion: "4.x",
        serialNumber: "CP-12345",
      },
      observedAt: new Date().toISOString(),
    },
  ];
  const identity = aggregator.resolveIdentity(evidence, "cp-plus");
  assert(identity.manufacturer === "CP PLUS", "Resolves canonical manufacturer CP PLUS from Dahua CGI match");
  assert(identity.model === "CP-UNR-4K4322-V2", "Resolves model CP-UNR-4K4322-V2");
  assert(identity.contradictions === 0, "Zero contradictions on clean match");

  const apis = aggregator.resolveApiFamilies(evidence);
  assert(apis.DAHUA_CGI.confirmed === true, "Resolves DAHUA_CGI as confirmed");
  assert(apis.HIKVISION_ISAPI.confirmed === false, "Resolves HIKVISION_ISAPI as not confirmed");

  // 3. Capability Detector Tests
  console.log("\nSuite 3: Capability Detection & Negative Assertions");
  const detector = new CapabilityDetector();
  const storageOnlyEvidence: ProbeEvidence[] = [
    {
      apiFamily: "DAHUA_CGI",
      probeId: "dahua-cgi-probe",
      outcome: "MATCH",
      confidence: 0.95,
      capabilities: {
        storageStatus: "SUPPORTED",
        smartTelemetry: "PARTIAL",
      },
      preferredApiFor: ["storageStatus"],
      observedAt: new Date().toISOString(),
    },
  ];
  const caps = detector.detect(storageOnlyEvidence);
  assert(caps.storageStatus.state === "SUPPORTED", "StorageStatus is marked SUPPORTED");
  assert(caps.smartTelemetry.state === "PARTIAL", "SmartTelemetry is strictly PARTIAL when deep attributes missing (never fabricated as SUPPORTED)");

  // 4. Protocol Router Tests
  console.log("\nSuite 4: Capability-Aware Protocol Routing");
  const router = new RecorderProtocolRouter();
  const mockProfile: any = {
    profileVersion: 1,
    recorderId: "rec-test-01",
    fingerprint: {
      manufacturer: "CP PLUS",
      model: "CP-UNR-4K4322-V2",
      firmwareVersion: "4.x",
      detectedApiFamilies: { onvif: true, dahuaCgi: true, hikvisionIsapi: false, proprietary: false, rtsp: true },
      capabilities: {
        liveStream: { state: "SUPPORTED", preferredApi: "ONVIF", confidence: 0.95, evidence: [{ source: "ONVIF", state: "SUPPORTED", confidence: 0.95 }] },
        storageStatus: { state: "SUPPORTED", preferredApi: "DAHUA_CGI", confidence: 0.96, evidence: [{ source: "DAHUA_CGI", state: "SUPPORTED", confidence: 0.96 }] },
        channels: { state: "SUPPORTED", preferredApi: "DAHUA_CGI", confidence: 0.97, evidence: [{ source: "DAHUA_CGI", state: "SUPPORTED", confidence: 0.97 }] },
      },
    },
    preferredApiOrder: ["DAHUA_CGI", "ONVIF", "RTSP"],
  };
  const liveRoutes = router.select("GET_STREAM_URI", mockProfile);
  assert(liveRoutes[0] === "ONVIF", "GET_STREAM_URI selects ONVIF primarily");
  assert(liveRoutes.includes("DAHUA_CGI") && liveRoutes.includes("RTSP"), "GET_STREAM_URI includes Dahua CGI and RTSP fallbacks");

  const storageRoutes = router.select("GET_STORAGE", mockProfile);
  assert(storageRoutes[0] === "DAHUA_CGI", "GET_STORAGE selects DAHUA_CGI primarily");

  // 5. Fallback Executor Tests
  console.log("\nSuite 5: Fallback Executor & Lockout Protection");
  const executor = new AdapterFallbackExecutor();
  executor.register({
    family: "DAHUA_CGI",
    async execute() {
      const err: any = new Error("404_not_found");
      err.statusCode = 404;
      throw err;
    },
  });
  executor.register({
    family: "ONVIF",
    async execute() {
      return { from: "ONVIF" };
    },
  });
  const fallbackResult = await executor.executeWithFallback<any>("GET_DEVICE_INFO", ["DAHUA_CGI", "ONVIF"], {
    recorderId: "rec-1", host: "10.0.0.1", port: 80,
  });
  assert(fallbackResult.from === "ONVIF", "Falls back to ONVIF on 404 endpoint error");

  let stoppedOnAuth = false;
  const authLockoutExecutor = new AdapterFallbackExecutor();
  authLockoutExecutor.register({
    family: "DAHUA_CGI",
    async execute() {
      const err: any = new Error("recorder_credentials_rejected");
      err.statusCode = 401;
      throw err;
    },
  });
  authLockoutExecutor.register({
    family: "ONVIF",
    async execute() {
      throw new Error("Should not be called!");
    },
  });
  try {
    await authLockoutExecutor.executeWithFallback("GET_DEVICE_INFO", ["DAHUA_CGI", "ONVIF"], {
      recorderId: "rec-1", host: "10.0.0.1", port: 80,
    });
  } catch (err: any) {
    if (err instanceof RecorderOperationError) {
      stoppedOnAuth = true;
    }
  }
  assert(stoppedOnAuth, "Stops fallback on 401 Auth Failure to prevent device lockout");

  // 6. Recorder Fingerprint Service End-to-End Test
  console.log("\nSuite 6: Recorder Fingerprint Pipeline End-to-End");
  const mockProbe: RecorderProbe = {
    id: "mock-dahua",
    cost: 2,
    apiFamily: "DAHUA_CGI",
    async run() {
      return {
        apiFamily: "DAHUA_CGI",
        probeId: "mock-dahua",
        outcome: "MATCH",
        confidence: 0.97,
        identity: {
          manufacturer: "CP PLUS",
          model: "CP-UNR-4K4322-V2",
          firmwareVersion: "4.001",
          serialNumber: "CP-9921",
        },
        capabilities: {
          deviceInfo: "SUPPORTED",
          channels: "SUPPORTED",
          storageStatus: "SUPPORTED",
          smartTelemetry: "PARTIAL",
        },
        preferredApiFor: ["deviceInfo", "channels", "storageStatus"],
        observedAt: new Date().toISOString(),
      };
    },
  };
  const profileRepo = new RecorderProfileRepository();
  const fpService = new RecorderFingerprintService({
    probes: [mockProbe],
    profileRepo,
  });
  const generatedProfile = await fpService.fingerprint({
    recorderId: "rec-e2e-01",
    host: "10.0.0.50",
    port: 80,
    httpPorts: [80],
    credentialRef: "vault://rec-e2e-01",
    configuredVendor: "cp-plus",
    requestTimeoutMs: 3000,
    maxRequests: 20,
    abortSignal: AbortSignal.timeout(5000),
  });
  assert(generatedProfile.recorderId === "rec-e2e-01", "Generates profile with matching recorderId");
  assert(generatedProfile.fingerprint.manufacturer === "CP PLUS", "Generates profile with manufacturer CP PLUS");
  assert(generatedProfile.signature.length === 64, "Generates valid 64-char SHA256 signature for drift detection");

  // 7. Backend Control-Plane Routes Test
  console.log("\nSuite 7: Backend Control-Plane Routes & Diagnostics");
  const app = Fastify();
  const store = new MemoryStore();
  await registerRecorderProfileRoutes(app, store);
  await app.ready();

  const saveRes = await app.inject({
    method: "POST",
    url: "/v1/recorders/rec-e2e-01/fingerprint",
    payload: generatedProfile,
  });
  assert(saveRes.statusCode === 200, "POST /v1/recorders/:id/fingerprint succeeds (200 OK)");

  const getRes = await app.inject({
    method: "GET",
    url: "/v1/recorders/rec-e2e-01/profile",
  });
  assert(getRes.statusCode === 200 && getRes.json().recorderId === "rec-e2e-01", "GET /v1/recorders/:id/profile returns stored profile");

  const evidenceRes = await app.inject({
    method: "GET",
    url: "/v1/recorders/rec-e2e-01/profile/evidence",
  });
  assert(evidenceRes.statusCode === 200 && evidenceRes.json().recorderId === "rec-e2e-01", "GET /v1/recorders/:id/profile/evidence returns diagnostics");

  const catalogRes = await app.inject({
    method: "GET",
    url: "/v1/compatibility/models",
  });
  assert(catalogRes.statusCode === 200 && Array.isArray(catalogRes.json().data), "GET /v1/compatibility/models returns compatibility catalog");

  await app.close();

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

void runTests();
