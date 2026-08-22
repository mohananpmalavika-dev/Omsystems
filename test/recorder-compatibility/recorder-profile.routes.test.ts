import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { registerRecorderProfileRoutes } from "../../src/routes/recorder-profile.routes.js";
import { MemoryStore } from "../../src/store.js";
import type { RecorderDeviceProfile } from "../../src/types/recorder-profile.types.js";

describe("Recorder Profile Routes", () => {
  let app: FastifyInstance;
  let store: MemoryStore;

  beforeAll(async () => {
    app = Fastify();
    store = new MemoryStore();
    await registerRecorderProfileRoutes(app, store);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /v1/recorders/:id/fingerprint saves profile to store", async () => {
    const sampleProfile: RecorderDeviceProfile = {
      profileVersion: 1,
      recorderId: "rec-test-01",
      tenantId: "tenant-bank-01",
      branchId: "branch-blr-001",
      configuredVendor: "CP PLUS",
      fingerprint: {
        manufacturer: "CP PLUS",
        model: "CP-UNR-4K4322-V2",
        firmwareVersion: "4.x",
        serialNumber: "CP-SER-12345",
        detectedApiFamilies: {
          onvif: true,
          dahuaCgi: true,
          hikvisionIsapi: false,
          proprietary: false,
          rtsp: true,
        },
        capabilities: {
          deviceInfo: { state: "SUPPORTED", preferredApi: "DAHUA_CGI", confidence: 0.98, evidence: [] },
          channels: { state: "SUPPORTED", preferredApi: "DAHUA_CGI", confidence: 0.97, evidence: [] },
          liveStream: { state: "SUPPORTED", preferredApi: "ONVIF", confidence: 0.95, evidence: [] },
          recordingStatus: { state: "SUPPORTED", preferredApi: "DAHUA_CGI", confidence: 0.90, evidence: [] },
          playbackSearch: { state: "SUPPORTED", preferredApi: "DAHUA_CGI", confidence: 0.94, evidence: [] },
          storageStatus: { state: "SUPPORTED", preferredApi: "DAHUA_CGI", confidence: 0.96, evidence: [] },
          smartTelemetry: { state: "PARTIAL", preferredApi: "DAHUA_CGI", confidence: 0.72, evidence: [] },
          deviceTime: { state: "SUPPORTED", preferredApi: "DAHUA_CGI", confidence: 0.94, evidence: [] },
          events: { state: "PARTIAL", preferredApi: "ONVIF", confidence: 0.70, evidence: [] },
          ptz: { state: "SUPPORTED", preferredApi: "ONVIF", confidence: 0.88, evidence: [] },
        },
        confidence: 0.94,
      },
      identityEvidence: [
        { source: "ONVIF", manufacturer: "CP PLUS", model: "CP-UNR-4K4322-V2", confidence: 0.95 },
      ],
      apiEvidence: [
        { family: "DAHUA_CGI", probeId: "dahua-cgi", confirmed: true, confidence: 0.97, observedAt: new Date().toISOString() },
      ],
      preferredApiOrder: ["DAHUA_CGI", "ONVIF", "RTSP"],
      credentialRef: "vault://rec-test-01",
      firstSeenAt: new Date().toISOString(),
      lastFingerprintedAt: new Date().toISOString(),
      nextFingerprintAt: new Date().toISOString(),
      fingerprintReason: "NEW_DEVICE",
      signature: "sig-12345",
    };

    const res = await app.inject({
      method: "POST",
      url: "/v1/recorders/rec-test-01/fingerprint",
      payload: sampleProfile,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it("GET /v1/recorders/:id/profile retrieves stored profile", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/recorders/rec-test-01/profile",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.recorderId).toBe("rec-test-01");
    expect(body.fingerprint.manufacturer).toBe("CP PLUS");
    expect(body.fingerprint.model).toBe("CP-UNR-4K4322-V2");
  });

  it("GET /v1/recorders/:id/profile/evidence returns evidence diagnostics with secrets redacted", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/recorders/rec-test-01/profile/evidence",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.recorderId).toBe("rec-test-01");
    expect(body.identityEvidence).toBeDefined();
    expect(body.apiEvidence).toBeDefined();
    expect(body.capabilities).toBeDefined();
  });

  it("POST /v1/recorders/:id/refingerprint queues manual re-fingerprint", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/recorders/rec-test-01/refingerprint",
      payload: { reason: "MANUAL", probeFamilies: ["ONVIF", "DAHUA_CGI"] },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.taskId).toBeDefined();
  });

  it("GET /v1/compatibility/models returns compatibility catalog", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/compatibility/models",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].manufacturer).toBeDefined();
  });
});
