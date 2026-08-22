import { describe, it, expect } from "vitest";
import { EvidenceAggregator } from "../../edge-agent/src/recorders/fingerprint/evidence-aggregator.js";
import type { ProbeEvidence } from "../../edge-agent/src/recorders/types/recorder-profile.types.js";

describe("EvidenceAggregator", () => {
  const aggregator = new EvidenceAggregator();

  it("resolves canonical CP PLUS identity when Dahua CGI is compatible", () => {
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

    const identity = aggregator.resolveIdentity(evidence, "cp-plus");
    expect(identity.manufacturer).toBe("CP PLUS");
    expect(identity.model).toBe("CP-UNR-4K4322-V2");
    expect(identity.contradictions).toBe(0);

    const apis = aggregator.resolveApiFamilies(evidence);
    expect(apis.DAHUA_CGI.confirmed).toBe(true);
    expect(apis.HIKVISION_ISAPI.confirmed).toBe(false);
  });

  it("detects contradiction when ISAPI and Dahua CGI probes both claim strong matches", () => {
    const evidence: ProbeEvidence[] = [
      {
        apiFamily: "DAHUA_CGI",
        probeId: "dahua-cgi-probe",
        outcome: "MATCH",
        confidence: 0.95,
        identity: {
          manufacturer: "Dahua",
          model: "DH-NVR",
        },
        observedAt: new Date().toISOString(),
      },
      {
        apiFamily: "HIKVISION_ISAPI",
        probeId: "hikvision-isapi-probe",
        outcome: "MATCH",
        confidence: 0.95,
        identity: {
          manufacturer: "Hikvision",
          model: "DS-7616",
        },
        observedAt: new Date().toISOString(),
      },
    ];

    const identity = aggregator.resolveIdentity(evidence);
    expect(identity.contradictions).toBeGreaterThan(0);
  });
});
