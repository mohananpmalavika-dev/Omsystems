import { describe, it, expect } from "vitest";
import { CapabilityDetector } from "../../edge-agent/src/recorders/capabilities/capability-detector.js";
import type { ProbeEvidence } from "../../edge-agent/src/recorders/types/recorder-profile.types.js";

describe("CapabilityDetector", () => {
  const detector = new CapabilityDetector();

  it("never marks smartTelemetry as SUPPORTED when only generic disk presence exists", () => {
    const evidence: ProbeEvidence[] = [
      {
        apiFamily: "DAHUA_CGI",
        probeId: "dahua-cgi-probe",
        outcome: "MATCH",
        confidence: 0.95,
        capabilities: {
          deviceInfo: "SUPPORTED",
          channels: "SUPPORTED",
          storageStatus: "SUPPORTED",
          smartTelemetry: "PARTIAL", // Only disk count without full SMART telemetry
        },
        preferredApiFor: ["storageStatus"],
        observedAt: new Date().toISOString(),
      },
    ];

    const caps = detector.detect(evidence);

    expect(caps.storageStatus.state).toBe("SUPPORTED");
    expect(caps.smartTelemetry.state).toBe("PARTIAL");
    expect(caps.smartTelemetry.state).not.toBe("SUPPORTED");
  });

  it("marks capabilities as UNKNOWN when no evidence is supplied", () => {
    const caps = detector.detect([]);
    expect(caps.deviceInfo.state).toBe("UNKNOWN");
    expect(caps.channels.state).toBe("UNKNOWN");
    expect(caps.recordingStatus.state).toBe("UNKNOWN");
    expect(caps.liveStream.state).toBe("UNKNOWN");
  });

  it("sets preferredApi correctly from matching probe evidence", () => {
    const evidence: ProbeEvidence[] = [
      {
        apiFamily: "ONVIF",
        probeId: "onvif-probe",
        outcome: "MATCH",
        confidence: 0.95,
        capabilities: {
          liveStream: "SUPPORTED",
          ptz: "SUPPORTED",
        },
        preferredApiFor: ["liveStream", "ptz"],
        observedAt: new Date().toISOString(),
      },
      {
        apiFamily: "DAHUA_CGI",
        probeId: "dahua-cgi-probe",
        outcome: "MATCH",
        confidence: 0.96,
        capabilities: {
          storageStatus: "SUPPORTED",
          channels: "SUPPORTED",
        },
        preferredApiFor: ["storageStatus", "channels"],
        observedAt: new Date().toISOString(),
      },
    ];

    const caps = detector.detect(evidence);

    expect(caps.liveStream.preferredApi).toBe("ONVIF");
    expect(caps.channels.preferredApi).toBe("DAHUA_CGI");
    expect(caps.storageStatus.preferredApi).toBe("DAHUA_CGI");
  });
});
