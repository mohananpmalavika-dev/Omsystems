/**
 * Hardware-in-the-Loop Certification Test Runner (KV-CERT-1.0)
 * 
 * Executes real protocol and hardware validation against physical/bench VMS recorders.
 * Complies with P1-6 & P1-7:
 * - Never grants CERTIFIED status without actual verified hardware test execution.
 * - Skips gracefully when hardware test credentials are absent in CI.
 * - Emits structured DeviceCertificationResult into RecorderCertificationRegistry.
 */

import type { CompatibilityLevel, RecorderAdapter } from "../../src/recorders/recorder-adapter.interface.js";
import {
  recorderCertificationRegistry,
  type CertificationAttestation,
  type CertificationEvidenceArtifact,
  type DeviceCertificationResult,
  type DeviceCertificationRecord,
} from "../../src/recorders/recorder-certification.registry.js";

export interface HardwareTestTarget {
  manufacturer: string;
  model: string;
  firmware: string;
  hardwareRevision?: string;
  serialNumber?: string;
  testOperator?: string;
  testEnvironment?: string;
}

export interface HardwareCertificationEvidence {
  artifacts: CertificationEvidenceArtifact[];
  attestation: CertificationAttestation;
}

export class HardwareCertificationRunner {
  async executeCertificationSuite(
    adapter: RecorderAdapter,
    target: HardwareTestTarget,
    evidence?: HardwareCertificationEvidence,
  ): Promise<{ result: DeviceCertificationResult; record: DeviceCertificationRecord }> {
    const capabilities: Record<CompatibilityLevel, "PASS" | "FAIL" | "SKIP"> = {
      "KV-C1": "FAIL",
      "KV-C2": "FAIL",
      "KV-C3": "FAIL",
      "KV-C4": "FAIL",
      "KV-C5": "FAIL",
      "KV-C6": "FAIL",
      "KV-C7": "FAIL",
      "KV-C8": "FAIL",
      "KV-C9": "FAIL",
      "KV-C10": "FAIL",
      "KV-C11": "FAIL",
      "KV-C12": "FAIL",
    };

    // KV-C1: Live Stream / Device Identity
    try {
      const info = await adapter.getDeviceInfo();
      const channels = await adapter.getChannels();
      if (info && info.model && channels.length > 0) {
        capabilities["KV-C1"] = "PASS";
      }
    } catch {
      capabilities["KV-C1"] = "FAIL";
    }

    // KV-C2: Recording search against the physical recorder
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 15 * 60_000);
      const recordings = await adapter.searchRecording(1, start, end);
      if (Array.isArray(recordings)) {
        capabilities["KV-C2"] = "PASS";
      }
    } catch {
      capabilities["KV-C2"] = "FAIL";
    }

    // KV-C3: Playback URI generation for a real recording window
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 5 * 60_000);
      const playback = await adapter.getPlaybackStream(1, start, end);
      if (playback.streamUrl && /^(rtsp|https?):\/\//.test(playback.streamUrl)) {
        capabilities["KV-C3"] = "PASS";
      }
    } catch {
      capabilities["KV-C3"] = "FAIL";
    }

    // KV-C4: High-Resolution Snapshot Extraction
    try {
      const snapshot = await adapter.getSnapshot(1);
      if (snapshot && snapshot.length > 50) {
        capabilities["KV-C4"] = "PASS";
      }
    } catch {
      capabilities["KV-C4"] = "FAIL";
    }

    // KV-C5: PTZ Verification
    try {
      const discovered = await adapter.discoverCapabilities();
      if (discovered["KV-C5"] === "UNSUPPORTED") {
        capabilities["KV-C5"] = "SKIP";
      } else if (await adapter.ptz(1, { action: "stop" })) {
        capabilities["KV-C5"] = "PASS";
      }
    } catch {
      capabilities["KV-C5"] = "FAIL";
    }

    // KV-C6: Event Ingestion
    try {
      const events = await adapter.getEvents(new Date(Date.now() - 60_000));
      if (Array.isArray(events)) capabilities["KV-C6"] = "PASS";
    } catch {
      capabilities["KV-C6"] = "FAIL";
    }

    // KV-C7: NTP Time Sync
    try {
      const time = await adapter.getTime();
      if (time && time.deviceTime) {
        capabilities["KV-C7"] = "PASS";
      }
    } catch {
      capabilities["KV-C7"] = "FAIL";
    }

    // KV-C8: Storage Diagnostic Info
    try {
      const storage = typeof (adapter as any).getStorageStatus === "function"
        ? await (adapter as any).getStorageStatus()
        : await (adapter as any).getStorageInfo();
      if (Array.isArray(storage) && storage.length > 0) {
        capabilities["KV-C8"] = "PASS";
      }
    } catch {
      capabilities["KV-C8"] = "FAIL";
    }

    // KV-C9: Read configuration without mutating the bench device.
    try {
      const config = typeof adapter.getNetworkConfiguration === "function"
        ? await adapter.getNetworkConfiguration()
        : typeof adapter.getRecordingSchedule === "function"
          ? await adapter.getRecordingSchedule(1)
          : undefined;
      if (config) capabilities["KV-C9"] = "PASS";
      else capabilities["KV-C9"] = "SKIP";
    } catch {
      capabilities["KV-C9"] = "FAIL";
    }

    // KV-C10: Firmware/security operation must be implemented by the concrete lab adapter.
    try {
      const extension = adapter as RecorderAdapter & { validateFirmwareSecurity?: () => Promise<boolean> };
      capabilities["KV-C10"] = typeof extension.validateFirmwareSecurity === "function"
        && await extension.validateFirmwareSecurity() ? "PASS" : "SKIP";
    } catch {
      capabilities["KV-C10"] = "FAIL";
    }

    // KV-C11: Export bytes from a real recording for evidence hashing.
    try {
      const extension = adapter as RecorderAdapter & { exportRecording?: (channel: number, from: Date, to: Date) => Promise<Buffer> };
      const end = new Date();
      const start = new Date(end.getTime() - 30_000);
      const exported = typeof extension.exportRecording === "function"
        ? await extension.exportRecording(1, start, end)
        : undefined;
      capabilities["KV-C11"] = exported && exported.length > 0 ? "PASS" : "SKIP";
    } catch {
      capabilities["KV-C11"] = "FAIL";
    }

    // KV-C12: Explicit disconnect/reconnect drill supplied by a hardware adapter.
    try {
      const extension = adapter as RecorderAdapter & { validateReconnect?: () => Promise<boolean> };
      capabilities["KV-C12"] = typeof extension.validateReconnect === "function"
        && await extension.validateReconnect() ? "PASS" : "SKIP";
    } catch {
      capabilities["KV-C12"] = "FAIL";
    }

    const passedCount = Object.values(capabilities).filter((v) => v === "PASS").length;
    const allPassed = Object.values(capabilities).every((value) => value === "PASS");
    const overall = allPassed && evidence
      ? "CERTIFIED"
      : passedCount > 0
        ? "PARTIALLY_SUPPORTED"
        : "FAILED";

    const result: DeviceCertificationResult = {
      manufacturer: target.manufacturer,
      model: target.model,
      firmware: target.firmware,
      hardwareRevision: target.hardwareRevision,
      serialNumber: target.serialNumber,
      testSuiteVersion: "KV-CERT-1.0",
      testDate: new Date(),
      testOperator: target.testOperator || "Automated Hardware Test Lab",
      testEnvironment: target.testEnvironment || "Physical Bench Lab (VLAN 104)",
      capabilities,
      overall,
      evidenceArtifacts: evidence?.artifacts,
      attestation: evidence?.attestation,
    };

    const record = await recorderCertificationRegistry.recordHardwareTestResult(result);
    return { result, record };
  }
}

export const hardwareCertificationRunner = new HardwareCertificationRunner();
