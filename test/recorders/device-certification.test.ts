import { describe, it, expect } from "vitest";
import { recorderCertificationRegistry } from "../../src/recorders/recorder-certification.registry.js";
import { CpPlusRecorderAdapter } from "../../src/recorders/adapters/cpplus-recorder.adapter.js";
import { UniviewRecorderAdapter } from "../../src/recorders/adapters/uniview-recorder.adapter.js";
import { HikvisionRecorderAdapter } from "../../src/recorders/adapters/hikvision-recorder.adapter.js";
import { DahuaRecorderAdapter } from "../../src/recorders/adapters/dahua-recorder.adapter.js";

describe("Device, DVR, and NVR Certification Matrix", () => {
  it("evaluates unverified devices as TEST_REQUIRED prior to physical lab execution", async () => {
    const evalResult = await recorderCertificationRegistry.evaluateDevice({
      vendor: "Hikvision",
      model: "DS-7616NI-K2",
      firmwareVersion: "V4.61.025",
    });

    expect(evalResult.certificationStatus).toBe("TEST_REQUIRED");
    expect(evalResult.compatibilityLevel).toBe("KV-C12");
    expect(evalResult.features["KV-C1"]).toBe("SUPPORTED");
  });

  it("produces CERTIFIED status only when real hardware test result is recorded", async () => {
    const certRecord = await recorderCertificationRegistry.recordHardwareTestResult({
      manufacturer: "Hikvision",
      model: "DS-7616NI-K2",
      firmware: "V4.61.025",
      testSuiteVersion: "KV-CERT-1.0",
      testDate: new Date("2026-03-01T10:00:00Z"),
      testOperator: "Lead QA Engineer - Banking Lab",
      testEnvironment: "Mumbai SOC Lab Bench #4",
      capabilities: {
        "KV-C1": "PASS",
        "KV-C2": "PASS",
        "KV-C3": "PASS",
        "KV-C4": "PASS",
        "KV-C5": "PASS",
        "KV-C6": "PASS",
        "KV-C7": "PASS",
        "KV-C8": "PASS",
        "KV-C9": "PASS",
        "KV-C10": "PASS",
        "KV-C11": "PASS",
        "KV-C12": "PASS",
      },
      overall: "CERTIFIED",
      evidenceLogFiles: ["/evidence/logs/hikvision-ds7616-cert-20260301.log"],
    });

    expect(certRecord.certificationStatus).toBe("CERTIFIED");
    expect(certRecord.testedBy).toBe("Lead QA Engineer - Banking Lab");

    const evalResult = await recorderCertificationRegistry.evaluateDevice({
      vendor: "Hikvision",
      model: "DS-7616NI-K2",
      firmwareVersion: "V4.61.025",
    });

    expect(evalResult.certificationStatus).toBe("CERTIFIED");
    expect(evalResult.compatibilityLevel).toBe("KV-C12");
  });

  it("evaluates unknown/uncertified hardware with UNVERIFIED status and UNKNOWN features", async () => {
    const evalResult = await recorderCertificationRegistry.evaluateDevice({
      vendor: "GenericClone",
      model: "CloneDVR-99",
    });

    expect(evalResult.certificationStatus).toBe("UNVERIFIED");
    expect(evalResult.features["KV-C1"]).toBe("UNKNOWN");
    expect(evalResult.features["KV-C5"]).toBe("UNKNOWN");
    expect(evalResult.features["KV-C12"]).toBe("UNKNOWN");
  });

  it("initializes CP Plus adapter and verifies streams and truthful unreachable health", async () => {
    const adapter = new CpPlusRecorderAdapter({
      ipAddress: "10.0.14.50",
      username: "admin",
      password: "BankPassword123!",
      model: "CP-UVR-0801E1",
      isAnalogDvr: true,
      timeoutMs: 50,
    });

    const live = await adapter.getLiveStream(1);
    expect(live.streamUrl).toContain("channel=1");

    // Unreachable hardware must return UNAVAILABLE, never fake HEALTHY
    const health = await adapter.getHealth();
    expect(health.status).toBe("UNAVAILABLE");
    expect(health.storageHealthy).toBe(false);
  });

  it("initializes Uniview and Dahua adapters with truthful capabilities", async () => {
    const unv = new UniviewRecorderAdapter({
      ipAddress: "10.0.14.51",
      username: "admin",
      model: "NVR302-16S",
    });

    const unvCaps = await unv.discoverCapabilities();
    expect(unvCaps["KV-C1"]).toBe("SUPPORTED");
    expect(unvCaps["KV-C11"]).toBe("UNSUPPORTED");

    const dahua = new DahuaRecorderAdapter({
      ipAddress: "10.0.14.52",
      username: "admin",
      model: "NVR5216-4KS2",
    });

    const dahuaCaps = await dahua.discoverCapabilities();
    expect(dahuaCaps["KV-C1"]).toBe("SUPPORTED");
    expect(dahuaCaps["KV-C11"]).toBe("SUPPORTED");
  });
});
