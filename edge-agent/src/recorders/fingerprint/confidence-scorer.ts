import type { ApiFamilyEvidence, IdentityEvidence } from "../types/recorder-profile.types.js";

export interface ConfidenceInput {
  identityEvidence: IdentityEvidence[];
  apiEvidence: ApiFamilyEvidence[];
  contradictions: number;
}

export class ConfidenceScorer {
  score(input: ConfidenceInput): number {
    const identityScore = this.combineIdentityEvidence(input.identityEvidence);
    const apiScore = this.combineApiEvidence(input.apiEvidence);
    const penalty = Math.min(0.45, input.contradictions * 0.25);

    // Agreement bonus if multiple independent sources confirmed identity
    const verifiedSources = new Set(
      input.identityEvidence.filter((e) => e.confidence >= 0.7 && e.source !== "CONFIG").map((e) => e.source)
    );
    const agreementBonus = verifiedSources.size >= 2 ? 0.05 : 0;

    const weightedScore = (identityScore * 0.55) + (apiScore * 0.45) + agreementBonus - penalty;
    return this.clamp01(Number(weightedScore.toFixed(3)));
  }

  getLabel(confidence: number): "CONFIRMED" | "USABLE" | "TENTATIVE" | "UNKNOWN" {
    if (confidence >= 0.85) return "CONFIRMED";
    if (confidence >= 0.60) return "USABLE";
    if (confidence >= 0.30) return "TENTATIVE";
    return "UNKNOWN";
  }

  private combineIdentityEvidence(evidence: IdentityEvidence[]): number {
    if (!evidence.length) return 0.1;
    let score = 0;
    for (const e of evidence) {
      if (e.source === "ONVIF" && e.confidence >= 0.8) score += 0.50;
      else if ((e.source === "DAHUA_CGI" || e.source === "ISAPI") && e.confidence >= 0.8) score += 0.50;
      else if (e.source === "HTTP" && e.confidence >= 0.4) score += 0.15;
      else if (e.source === "CONFIG") score += 0.05;
    }
    return Math.min(1.0, score);
  }

  private combineApiEvidence(evidence: ApiFamilyEvidence[]): number {
    const confirmed = evidence.filter((e) => e.confirmed);
    if (!confirmed.length) return 0.1;

    let score = 0;
    for (const e of confirmed) {
      if (e.family === "ONVIF") score += 0.45;
      if (e.family === "DAHUA_CGI") score += 0.45;
      if (e.family === "HIKVISION_ISAPI") score += 0.45;
      if (e.family === "RTSP") score += 0.20;
    }
    return Math.min(1.0, score);
  }

  private clamp01(val: number): number {
    return Math.max(0, Math.min(1, val));
  }
}
