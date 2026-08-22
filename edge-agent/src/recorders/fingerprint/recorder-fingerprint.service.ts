import type {
  ApiFamily,
  ProbeContext,
  ProbeEvidence,
  RecorderDeviceProfile,
  RecorderFingerprint,
  RecorderProbe,
} from "../types/recorder-profile.types.js";
import { EvidenceAggregator } from "./evidence-aggregator.js";
import { CapabilityDetector } from "../capabilities/capability-detector.js";
import { ConfidenceScorer } from "./confidence-scorer.js";
import { buildFingerprintSignature } from "./fingerprint-signature.js";
import { HttpIdentityProbe } from "./probes/http-identity.probe.js";
import { OnvifProbe } from "./probes/onvif.probe.js";
import { DahuaCgiProbe } from "./probes/dahua-cgi.probe.js";
import { HikvisionIsapiProbe } from "./probes/hikvision-isapi.probe.js";
import { RtspProbe } from "./probes/rtsp.probe.js";
import { ProprietaryProbe } from "./probes/proprietary.probe.js";

export interface ProfileRepositoryInterface {
  upsert(profile: RecorderDeviceProfile): Promise<void>;
  get(recorderId: string): Promise<RecorderDeviceProfile | null>;
}

export class RecorderFingerprintService {
  private readonly probes: RecorderProbe[];
  private readonly evidenceAggregator: EvidenceAggregator;
  private readonly capabilityDetector: CapabilityDetector;
  private readonly scorer: ConfidenceScorer;
  private readonly profileRepo?: ProfileRepositoryInterface | undefined;

  constructor(options?: {
    probes?: RecorderProbe[];
    evidenceAggregator?: EvidenceAggregator;
    capabilityDetector?: CapabilityDetector;
    profileRepo?: ProfileRepositoryInterface | undefined;
  }) {
    this.probes = options?.probes ?? [
      new HttpIdentityProbe(),
      new OnvifProbe(),
      new DahuaCgiProbe(),
      new HikvisionIsapiProbe(),
      new RtspProbe(),
      new ProprietaryProbe(),
    ];
    this.evidenceAggregator = options?.evidenceAggregator ?? new EvidenceAggregator();
    this.capabilityDetector = options?.capabilityDetector ?? new CapabilityDetector();
    this.scorer = new ConfidenceScorer();
    this.profileRepo = options?.profileRepo;
  }

  async fingerprint(ctx: ProbeContext): Promise<RecorderDeviceProfile> {
    const evidence: ProbeEvidence[] = [];
    let remainingBudget = ctx.maxRequests || 20;

    const orderedProbes = this.orderProbesByHint(this.probes, ctx.configuredVendor);

    for (const probe of orderedProbes) {
      if (remainingBudget < probe.cost) break;
      if (ctx.abortSignal.aborted) throw new Error("Fingerprint cancelled");

      try {
        const result = await probe.run(ctx);
        evidence.push(result);
      } catch (err: any) {
        evidence.push({
          apiFamily: probe.apiFamily,
          probeId: probe.id,
          outcome: "ERROR",
          confidence: 0,
          reason: String(err?.message ?? err),
          observedAt: new Date().toISOString(),
        });
      }

      remainingBudget -= probe.cost;
    }

    const identity = this.evidenceAggregator.resolveIdentity(evidence, ctx.configuredVendor);
    const apiFamilies = this.evidenceAggregator.resolveApiFamilies(evidence);
    const capabilities = this.capabilityDetector.detect(evidence);
    const confidence = this.scorer.score({
      identityEvidence: identity.identityEvidence,
      apiEvidence: apiFamilies.apiEvidence,
      contradictions: identity.contradictions,
    });

    const fingerprint: RecorderFingerprint = {
      manufacturer: identity.manufacturer ?? "UNKNOWN",
      model: identity.model ?? "UNKNOWN",
      firmwareVersion: identity.firmwareVersion ?? "UNKNOWN",
      serialNumber: identity.serialNumber ?? undefined,
      detectedApiFamilies: {
        onvif: apiFamilies.ONVIF.confirmed,
        dahuaCgi: apiFamilies.DAHUA_CGI.confirmed,
        hikvisionIsapi: apiFamilies.HIKVISION_ISAPI.confirmed,
        proprietary: apiFamilies.PROPRIETARY.confirmed,
        rtsp: apiFamilies.RTSP.confirmed,
      },
      capabilities,
      confidence,
    };

    const signature = buildFingerprintSignature(fingerprint);
    const preferredApiOrder = this.resolvePreferredApiOrder(fingerprint, ctx.configuredVendor);

    const now = new Date();
    const nextFingerprint = new Date(now.getTime() + 7 * 24 * 3600 * 1000); // 7 days default TTL

    const profile: RecorderDeviceProfile = {
      profileVersion: 1,
      recorderId: ctx.recorderId,
      tenantId: ctx.tenantId ?? "tenant-default",
      branchId: ctx.branchId ?? "branch-default",
      configuredVendor: ctx.configuredVendor ?? undefined,
      fingerprint,
      identityEvidence: identity.identityEvidence,
      apiEvidence: apiFamilies.apiEvidence,
      preferredApiOrder,
      credentialRef: ctx.credentialRef,
      firstSeenAt: now.toISOString(),
      lastFingerprintedAt: now.toISOString(),
      nextFingerprintAt: nextFingerprint.toISOString(),
      fingerprintReason: "NEW_DEVICE",
      signature,
    };

    if (this.profileRepo) {
      await this.profileRepo.upsert(profile);
    }

    return profile;
  }

  private orderProbesByHint(probes: RecorderProbe[], configuredVendor?: string): RecorderProbe[] {
    const hint = (configuredVendor ?? "").toLowerCase();
    const copy = [...probes];

    if (hint.includes("cp") && hint.includes("plus") || hint.includes("dahua")) {
      return copy.sort((a, b) => {
        if (a.apiFamily === "DAHUA_CGI") return -1;
        if (b.apiFamily === "DAHUA_CGI") return 1;
        if (a.apiFamily === "ONVIF") return -1;
        if (b.apiFamily === "ONVIF") return 1;
        return 0;
      });
    }

    if (hint.includes("hikvision")) {
      return copy.sort((a, b) => {
        if (a.apiFamily === "HIKVISION_ISAPI") return -1;
        if (b.apiFamily === "HIKVISION_ISAPI") return 1;
        if (a.apiFamily === "ONVIF") return -1;
        if (b.apiFamily === "ONVIF") return 1;
        return 0;
      });
    }

    return copy;
  }

  private resolvePreferredApiOrder(
    fp: RecorderFingerprint,
    configuredVendor?: string,
  ): ApiFamily[] {
    const families: ApiFamily[] = [];
    const hint = (configuredVendor ?? "").toLowerCase();

    if (hint.includes("cp") && hint.includes("plus") || hint.includes("dahua")) {
      if (fp.detectedApiFamilies.dahuaCgi) families.push("DAHUA_CGI");
      if (fp.detectedApiFamilies.onvif) families.push("ONVIF");
      if (fp.detectedApiFamilies.rtsp) families.push("RTSP");
      if (fp.detectedApiFamilies.hikvisionIsapi) families.push("HIKVISION_ISAPI");
    } else if (hint.includes("hikvision")) {
      if (fp.detectedApiFamilies.hikvisionIsapi) families.push("HIKVISION_ISAPI");
      if (fp.detectedApiFamilies.onvif) families.push("ONVIF");
      if (fp.detectedApiFamilies.rtsp) families.push("RTSP");
      if (fp.detectedApiFamilies.dahuaCgi) families.push("DAHUA_CGI");
    } else {
      if (fp.detectedApiFamilies.onvif) families.push("ONVIF");
      if (fp.detectedApiFamilies.dahuaCgi) families.push("DAHUA_CGI");
      if (fp.detectedApiFamilies.hikvisionIsapi) families.push("HIKVISION_ISAPI");
      if (fp.detectedApiFamilies.rtsp) families.push("RTSP");
    }

    if (fp.detectedApiFamilies.proprietary) families.push("PROPRIETARY");

    return families.length > 0 ? families : ["ONVIF", "RTSP"];
  }
}
