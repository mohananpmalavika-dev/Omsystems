import type {
  ApiFamily,
  ApiFamilyEvidence,
  IdentityEvidence,
  ProbeEvidence,
} from "../types/recorder-profile.types.js";
import { ConfidenceScorer } from "./confidence-scorer.js";

export interface ResolvedIdentity {
  manufacturer: string;
  model: string;
  firmwareVersion: string;
  serialNumber?: string | undefined;
  identityEvidence: IdentityEvidence[];
  contradictions: number;
}

export interface ResolvedApiFamilies {
  ONVIF: { confirmed: boolean; confidence: number };
  DAHUA_CGI: { confirmed: boolean; confidence: number };
  HIKVISION_ISAPI: { confirmed: boolean; confidence: number };
  RTSP: { confirmed: boolean; confidence: number };
  PROPRIETARY: { confirmed: boolean; confidence: number };
  apiEvidence: ApiFamilyEvidence[];
}

export class EvidenceAggregator {
  constructor(private readonly scorer: ConfidenceScorer = new ConfidenceScorer()) {}

  resolveIdentity(evidence: ProbeEvidence[], configuredVendor?: string): ResolvedIdentity {
    const identityEvidence: IdentityEvidence[] = [];
    let contradictions = 0;

    for (const e of evidence) {
      if (e.identity && (e.identity.manufacturer || e.identity.model)) {
        identityEvidence.push({
          source: e.apiFamily as any,
          manufacturer: e.identity.manufacturer,
          model: e.identity.model,
          firmwareVersion: e.identity.firmwareVersion,
          serialNumber: e.identity.serialNumber,
          confidence: e.confidence,
          observedAt: e.observedAt,
        });
      }
    }

    if (configuredVendor) {
      identityEvidence.push({
        source: "CONFIG",
        manufacturer: configuredVendor,
        confidence: 0.2,
        observedAt: new Date().toISOString(),
      });
    }

    // Check for manufacturer contradictions (e.g. Dahua CGI match vs ISAPI match)
    const strongMfrs = new Set(
      identityEvidence
        .filter((e) => e.confidence >= 0.8 && e.manufacturer)
        .map((e) => normalizeMfr(e.manufacturer!)),
    );
    if (strongMfrs.size > 1) {
      contradictions += strongMfrs.size - 1;
    }

    // Determine canonical identity
    // Priority: ONVIF match / Vendor API match > HTTP hint > configured hint
    const sorted = [...identityEvidence].sort((a, b) => b.confidence - a.confidence);
    const best = sorted[0];

    // Check if CP PLUS is hinted and Dahua CGI confirmed -> CP PLUS with Dahua compatibility
    const hasCpPlusHint = identityEvidence.some(
      (e) => e.manufacturer && /cp[\s-]*plus/i.test(e.manufacturer),
    ) || Boolean(configuredVendor && /cp[\s-]*plus/i.test(configuredVendor));

    let canonicalMfr = best?.manufacturer ?? configuredVendor ?? "UNKNOWN";
    if (hasCpPlusHint && (canonicalMfr === "Dahua" || canonicalMfr === "UNKNOWN")) {
      canonicalMfr = "CP PLUS";
    }

    const canonicalModel = sorted.find((e) => e.model)?.model ?? "Unknown";
    const canonicalFw = sorted.find((e) => e.firmwareVersion)?.firmwareVersion ?? "";
    const canonicalSerial = sorted.find((e) => e.serialNumber)?.serialNumber ?? undefined;

    return {
      manufacturer: canonicalMfr,
      model: canonicalModel,
      firmwareVersion: canonicalFw,
      serialNumber: canonicalSerial,
      identityEvidence,
      contradictions,
    };
  }

  resolveApiFamilies(evidence: ProbeEvidence[]): ResolvedApiFamilies {
    const apiEvidence: ApiFamilyEvidence[] = [];

    const familyState: Record<ApiFamily, { confirmed: boolean; confidence: number }> = {
      ONVIF: { confirmed: false, confidence: 0 },
      DAHUA_CGI: { confirmed: false, confidence: 0 },
      HIKVISION_ISAPI: { confirmed: false, confidence: 0 },
      RTSP: { confirmed: false, confidence: 0 },
      PROPRIETARY: { confirmed: false, confidence: 0 },
    };

    for (const e of evidence) {
      if (e.apiFamily !== "HTTP") {
        const confirmed = e.outcome === "MATCH";
        const family = e.apiFamily as ApiFamily;

        if (confirmed && e.confidence > familyState[family].confidence) {
          familyState[family] = {
            confirmed: true,
            confidence: e.confidence,
          };
        } else if (e.outcome === "AUTH_REQUIRED" && !familyState[family].confirmed) {
          familyState[family] = {
            confirmed: false,
            confidence: Math.max(familyState[family].confidence, e.confidence),
          };
        }

        apiEvidence.push({
          family,
          probeId: e.probeId,
          confirmed,
          confidence: e.confidence,
          statusCode: e.statusCode,
          realm: (e.metadata?.realm as string) || undefined,
          serverHeader: (e.metadata?.serverHeader as string) || undefined,
          observedAt: e.observedAt,
        });
      }
    }

    return {
      ...familyState,
      apiEvidence,
    };
  }

  determinePreferredOrder(apis: ResolvedApiFamilies, capabilities: any): ApiFamily[] {
    const order: ApiFamily[] = [];

    // Prioritize confirmed native / OEM APIs with high capability score
    if (apis.DAHUA_CGI.confirmed) order.push("DAHUA_CGI");
    if (apis.HIKVISION_ISAPI.confirmed) order.push("HIKVISION_ISAPI");
    if (apis.PROPRIETARY.confirmed) order.push("PROPRIETARY");
    if (apis.ONVIF.confirmed) order.push("ONVIF");
    if (apis.RTSP.confirmed) order.push("RTSP");

    // Fallbacks if nothing confirmed yet
    if (order.length === 0) {
      if (apis.ONVIF.confidence > 0) order.push("ONVIF");
      if (apis.DAHUA_CGI.confidence > 0) order.push("DAHUA_CGI");
      if (apis.RTSP.confidence > 0) order.push("RTSP");
    }

    return order;
  }
}

function normalizeMfr(m: string): string {
  const lower = m.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (lower.includes("cpplus") || lower.includes("cpplus")) return "cpplus";
  if (lower.includes("dahua")) return "dahua";
  if (lower.includes("hikvision")) return "hikvision";
  if (lower.includes("uniview") || lower.includes("unv")) return "uniview";
  return lower;
}
