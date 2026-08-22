import { describe, it, expect } from "vitest";
import { ConfidenceScorer } from "../../edge-agent/src/recorders/fingerprint/confidence-scorer.js";

describe("ConfidenceScorer", () => {
  const scorer = new ConfidenceScorer();

  it("calculates high confidence for matching ONVIF + Dahua CGI evidence", () => {
    const score = scorer.score({
      identityEvidence: [
        { source: "ONVIF", manufacturer: "CP PLUS", model: "CP-UNR-4K4322-V2", confidence: 0.95 },
        { source: "DAHUA_CGI", manufacturer: "CP PLUS", model: "CP-UNR-4K4322-V2", confidence: 0.98 },
      ],
      apiEvidence: [
        { family: "DAHUA_CGI", probeId: "dahua-cgi-probe", confirmed: true, confidence: 0.97, observedAt: new Date().toISOString() },
        { family: "ONVIF", probeId: "onvif-probe", confirmed: true, confidence: 0.95, observedAt: new Date().toISOString() },
        { family: "RTSP", probeId: "rtsp-probe", confirmed: true, confidence: 0.90, observedAt: new Date().toISOString() },
      ],
      contradictions: 0,
    });

    expect(score).toBeGreaterThanOrEqual(0.85);
    expect(scorer.getLabel(score)).toBe("CONFIRMED");
  });

  it("applies contradiction penalty when identities conflict", () => {
    const score = scorer.score({
      identityEvidence: [
        { source: "ONVIF", manufacturer: "Hikvision", model: "DS-7616", confidence: 0.95 },
        { source: "DAHUA_CGI", manufacturer: "Dahua", model: "DH-NVR", confidence: 0.95 },
      ],
      apiEvidence: [
        { family: "DAHUA_CGI", probeId: "dahua-cgi-probe", confirmed: true, confidence: 0.90, observedAt: new Date().toISOString() },
      ],
      contradictions: 1,
    });

    expect(score).toBeLessThan(0.70);
  });

  it("classifies low scores as UNKNOWN or TENTATIVE", () => {
    const score = scorer.score({
      identityEvidence: [{ source: "HTTP", confidence: 0.2 }],
      apiEvidence: [],
      contradictions: 0,
    });

    expect(score).toBeLessThan(0.30);
    expect(scorer.getLabel(score)).toBe("UNKNOWN");
  });
});
