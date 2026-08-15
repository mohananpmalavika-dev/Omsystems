import { describe, it, expect } from "vitest";
import { RecorderFingerprintService } from "../../edge-agent/src/recorders/fingerprint/recorder-fingerprint.service.js";
import { RecorderProfileRepository } from "../../edge-agent/src/recorders/profiles/recorder-profile.repository.js";
import type { ProbeContext, ProbeEvidence, RecorderProbe } from "../../edge-agent/src/recorders/types/recorder-profile.types.js";

describe("RecorderFingerprintService", () => {
  it("orchestrates probes, produces profile, calculates signature, and saves to repository", async () => {
    const mockOnvifProbe: RecorderProbe = {
      id: "mock-onvif-probe",
      cost: 3,
      apiFamily: "ONVIF",
      async run(_ctx: ProbeContext): Promise<ProbeEvidence> {
        return {
          apiFamily: "ONVIF",
          probeId: "mock-onvif-probe",
          outcome: "MATCH",
          confidence: 0.95,
          identity: {
            manufacturer: "CP PLUS",
            model: "CP-UNR-4K4322-V2",
            firmwareVersion: "4.001",
            serialNumber: "CP-SER-9912",
          },
          capabilities: {
            deviceInfo: "SUPPORTED",
            channels: "SUPPORTED",
            liveStream: "SUPPORTED",
          },
          preferredApiFor: ["liveStream"],
          observedAt: new Date().toISOString(),
        };
      },
    };

    const mockDahuaProbe: RecorderProbe = {
      id: "mock-dahua-probe",
      cost: 3,
      apiFamily: "DAHUA_CGI",
      async run(_ctx: ProbeContext): Promise<ProbeEvidence> {
        return {
          apiFamily: "DAHUA_CGI",
          probeId: "mock-dahua-probe",
          outcome: "MATCH",
          confidence: 0.97,
          identity: {
            manufacturer: "CP PLUS",
            model: "CP-UNR-4K4322-V2",
            firmwareVersion: "4.001",
          },
          capabilities: {
            storageStatus: "SUPPORTED",
            smartTelemetry: "PARTIAL",
            recordingStatus: "SUPPORTED",
            playbackSearch: "SUPPORTED",
          },
          preferredApiFor: ["storageStatus", "recordingStatus"],
          observedAt: new Date().toISOString(),
        };
      },
    };

    const repo = new RecorderProfileRepository();
    const service = new RecorderFingerprintService({
      probes: [mockOnvifProbe, mockDahuaProbe],
      profileRepo: repo,
    });

    const ctx: ProbeContext = {
      recorderId: "rec-test-cpplus",
      tenantId: "tenant-bank",
      branchId: "branch-blr-01",
      host: "10.0.1.50",
      port: 80,
      httpPorts: [80],
      rtspPort: 554,
      credentialRef: "vault://rec-test-cpplus",
      configuredVendor: "cp-plus",
      requestTimeoutMs: 3000,
      maxRequests: 20,
      abortSignal: AbortSignal.timeout(10000),
    };

    const profile = await service.fingerprint(ctx);

    expect(profile.recorderId).toBe("rec-test-cpplus");
    expect(profile.fingerprint.manufacturer).toBe("CP PLUS");
    expect(profile.fingerprint.model).toBe("CP-UNR-4K4322-V2");
    expect(profile.fingerprint.confidence).toBeGreaterThanOrEqual(0.85);
    expect(profile.fingerprint.detectedApiFamilies.onvif).toBe(true);
    expect(profile.fingerprint.detectedApiFamilies.dahuaCgi).toBe(true);
    expect(profile.signature).toBeDefined();

    // Verify stored in repo
    const cached = await repo.get("rec-test-cpplus");
    expect(cached).not.toBeNull();
    expect(cached?.recorderId).toBe("rec-test-cpplus");
  });
});
