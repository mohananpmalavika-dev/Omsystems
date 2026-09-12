import { describe, it, expect } from "vitest";
import { recorderCertificationRegistry } from "../../src/recorders/recorder-certification.registry.js";
import { CpPlusRecorderAdapter } from "../../src/recorders/adapters/cpplus-recorder.adapter.js";
import { UniviewRecorderAdapter } from "../../src/recorders/adapters/uniview-recorder.adapter.js";
import { HikvisionRecorderAdapter } from "../../src/recorders/adapters/hikvision-recorder.adapter.js";
import { DahuaRecorderAdapter } from "../../src/recorders/adapters/dahua-recorder.adapter.js";

describe("Device, DVR, and NVR Certification Matrix", () => {
  it("evaluates Hikvision NVRs up to KV-C12 compatibility", async () => {
    const evalResult = await recorderCertificationRegistry.evaluateDevice({
      vendor: "Hikvision",
      model: "DS-7616NI-K2",
      firmwareVersion: "V4.61.025",
    });

    expect(evalResult.certificationStatus).toBe("CERTIFIED");
    expect(evalResult.compatibilityLevel).toBe("KV-C12");
    expect(evalResult.features["KV-C1"]).toBe("SUPPORTED");
    expect(evalResult.features["KV-C12"]).toBe("SUPPORTED");
  });

  it("evaluates CP Plus UVR analog DVRs as KV-C8 with explicit UNSUPPORTED features", async () => {
    const evalResult = await recorderCertificationRegistry.evaluateDevice({
      vendor: "CP Plus",
      model: "CP-UVR-0801E1",
    });

    expect(evalResult.certificationStatus).toBe("CERTIFIED");
    expect(evalResult.compatibilityLevel).toBe("KV-C8");
    expect(evalResult.features["KV-C1"]).toBe("SUPPORTED"); // Live
    expect(evalResult.features["KV-C2"]).toBe("SUPPORTED"); // Record
    expect(evalResult.features["KV-C3"]).toBe("SUPPORTED"); // Playback
    expect(evalResult.features["KV-C9"]).toBe("UNSUPPORTED"); // Cloud Configuration unsupported on legacy DVR
    expect(evalResult.features["KV-C12"]).toBe("UNSUPPORTED"); // Failover unsupported
  });

  it("evaluates unknown/uncertified hardware with UNKNOWN status and features", async () => {
    const evalResult = await recorderCertificationRegistry.evaluateDevice({
      vendor: "GenericClone",
      model: "CloneDVR-99",
    });

    expect(evalResult.certificationStatus).toBe("UNKNOWN");
    expect(evalResult.features["KV-C1"]).toBe("UNKNOWN");
    expect(evalResult.features["KV-C5"]).toBe("UNKNOWN");
    expect(evalResult.features["KV-C12"]).toBe("UNKNOWN");
  });

  it("initializes CP Plus adapter and verifies channels and streams", async () => {
    const adapter = new CpPlusRecorderAdapter({
      ipAddress: "10.0.14.50",
      username: "admin",
      password: "BankPassword123!",
      model: "CP-UVR-0801E1",
      isAnalogDvr: true,
    });

    const info = await adapter.getDeviceInfo();
    expect(info.vendor).toBe("CP Plus");
    expect(info.totalChannels).toBe(8);

    const channels = await adapter.getChannels();
    expect(channels.length).toBe(8);
    expect(channels[0].streamUrl).toContain("cam/realmonitor?channel=1");

    const live = await adapter.getLiveStream(1);
    expect(live.streamUrl).toContain("channel=1");

    const storage = await adapter.getStorageStatus();
    expect(storage.length).toBeGreaterThan(0);
    expect(storage[0].status).toBe("NORMAL");
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
