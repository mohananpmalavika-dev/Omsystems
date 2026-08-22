import { describe, it, expect } from "vitest";
import { RecorderProtocolRouter } from "../../edge-agent/src/recorders/routing/recorder-protocol-router.js";
import type { RecorderDeviceProfile } from "../../edge-agent/src/recorders/types/recorder-profile.types.js";

describe("RecorderProtocolRouter", () => {
  const router = new RecorderProtocolRouter();

  const mockProfile: RecorderDeviceProfile = {
    profileVersion: 1,
    recorderId: "rec-test-01",
    tenantId: "tenant-1",
    branchId: "branch-1",
    configuredVendor: "CP PLUS",
    fingerprint: {
      manufacturer: "CP PLUS",
      model: "CP-UNR-4K4322-V2",
      firmwareVersion: "4.x",
      detectedApiFamilies: {
        onvif: true,
        dahuaCgi: true,
        hikvisionIsapi: false,
        proprietary: false,
        rtsp: true,
      },
      capabilities: {
        deviceInfo: { state: "SUPPORTED", preferredApi: "DAHUA_CGI", confidence: 0.98, evidence: [{ source: "DAHUA_CGI", probe: "dahua-cgi", state: "SUPPORTED", confidence: 0.98, observedAt: "" }] },
        channels: { state: "SUPPORTED", preferredApi: "DAHUA_CGI", confidence: 0.97, evidence: [{ source: "DAHUA_CGI", probe: "dahua-cgi", state: "SUPPORTED", confidence: 0.97, observedAt: "" }] },
        liveStream: { state: "SUPPORTED", preferredApi: "ONVIF", confidence: 0.95, evidence: [{ source: "ONVIF", probe: "onvif", state: "SUPPORTED", confidence: 0.95, observedAt: "" }] },
        recordingStatus: { state: "SUPPORTED", preferredApi: "DAHUA_CGI", confidence: 0.90, evidence: [{ source: "DAHUA_CGI", probe: "dahua-cgi", state: "SUPPORTED", confidence: 0.90, observedAt: "" }] },
        playbackSearch: { state: "SUPPORTED", preferredApi: "DAHUA_CGI", confidence: 0.94, evidence: [{ source: "DAHUA_CGI", probe: "dahua-cgi", state: "SUPPORTED", confidence: 0.94, observedAt: "" }] },
        storageStatus: { state: "SUPPORTED", preferredApi: "DAHUA_CGI", confidence: 0.96, evidence: [{ source: "DAHUA_CGI", probe: "dahua-cgi", state: "SUPPORTED", confidence: 0.96, observedAt: "" }] },
        smartTelemetry: { state: "PARTIAL", preferredApi: "DAHUA_CGI", confidence: 0.72, evidence: [] },
        deviceTime: { state: "SUPPORTED", preferredApi: "DAHUA_CGI", confidence: 0.94, evidence: [] },
        events: { state: "PARTIAL", preferredApi: "ONVIF", confidence: 0.70, evidence: [] },
        ptz: { state: "SUPPORTED", preferredApi: "ONVIF", confidence: 0.88, evidence: [] },
      },
      confidence: 0.94,
    },
    identityEvidence: [],
    apiEvidence: [],
    preferredApiOrder: ["DAHUA_CGI", "ONVIF", "RTSP"],
    credentialRef: "vault://rec-test-01",
    firstSeenAt: new Date().toISOString(),
    lastFingerprintedAt: new Date().toISOString(),
    nextFingerprintAt: new Date().toISOString(),
    fingerprintReason: "NEW_DEVICE",
    signature: "signature-123",
  };

  it("selects ONVIF primarily for GET_STREAM_URI with Dahua and RTSP fallback", () => {
    const apis = router.select("GET_STREAM_URI", mockProfile);
    expect(apis[0]).toBe("ONVIF");
    expect(apis).toContain("DAHUA_CGI");
    expect(apis).toContain("RTSP");
  });

  it("selects DAHUA_CGI primarily for GET_STORAGE", () => {
    const apis = router.select("GET_STORAGE", mockProfile);
    expect(apis[0]).toBe("DAHUA_CGI");
  });

  it("selects DAHUA_CGI primarily for LIST_CHANNELS", () => {
    const apis = router.select("LIST_CHANNELS", mockProfile);
    expect(apis[0]).toBe("DAHUA_CGI");
  });
});
