import { probeRtsp } from "../../../streaming/rtsp-probe.js";
import { vendorRtspCandidates, type VendorStreamFamily } from "../../../devices/vendor-stream-adapter.js";
import type {
  ProbeContext,
  ProbeEvidence,
  RecorderProbe,
} from "./recorder-probe.interface.js";

export class RtspProbe implements RecorderProbe {
  readonly id = "rtsp-probe";
  readonly cost = 2;
  readonly apiFamily = "RTSP" as const;

  async run(ctx: ProbeContext): Promise<ProbeEvidence> {
    const started = Date.now();
    const rtspPort = ctx.rtspPort ?? 554;
    const vendor: VendorStreamFamily = mapVendorToStreamFamily(ctx.configuredVendor);

    const credentials = {
      username: ctx.username ?? "admin",
      password: ctx.password ?? "",
    };

    const candidates = vendorRtspCandidates({
      host: ctx.host,
      vendor,
      credentials,
      channel: 1,
      ports: [rtspPort],
    });

    let verifiedUri: string | null = null;
    let codec: string | null = null;

    for (const candidate of candidates.slice(0, 4)) {
      if (ctx.abortSignal.aborted) throw new Error("Probe cancelled");
      try {
        const probeResult = await probeRtsp(candidate.uri, "ffprobe", ctx.requestTimeoutMs);
        if (probeResult.reachable) {
          verifiedUri = candidate.uri;
          codec = probeResult.codec ?? "H264";
          break;
        }
      } catch {
        // Continue testing next candidate
      }
    }

    const latencyMs = Date.now() - started;

    if (verifiedUri) {
      return {
        apiFamily: "RTSP",
        probeId: "rtsp-probe",
        outcome: "MATCH",
        confidence: 0.90,
        capabilities: {
          liveStream: "SUPPORTED",
        },
        preferredApiFor: ["liveStream"],
        metadata: {
          verifiedUri,
          codec,
          rtspPort,
        },
        latencyMs,
        observedAt: new Date().toISOString(),
      };
    }

    return {
      apiFamily: "RTSP",
      probeId: "rtsp-probe",
      outcome: "INCONCLUSIVE",
      confidence: 0.2,
      capabilities: {
        liveStream: "UNKNOWN",
      },
      reason: "RTSP stream candidates were not verified or endpoint timed out",
      latencyMs,
      observedAt: new Date().toISOString(),
    };
  }
}

function mapVendorToStreamFamily(vendor?: string): VendorStreamFamily {
  const v = (vendor ?? "").toLowerCase();
  if (v.includes("hikvision")) return "hikvision";
  if (v.includes("dahua")) return "dahua";
  if (v.includes("cp") && v.includes("plus")) return "cp-plus";
  if (v.includes("uniview") || v.includes("unv")) return "uniview";
  return "generic";
}
