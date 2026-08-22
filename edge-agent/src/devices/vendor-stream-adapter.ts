import type { OnvifCredentials } from "./onvif-client.js";
import { attachCredentials } from "./onvif-client.js";
import type { RtspProbeResult } from "../streaming/rtsp-probe.js";

export type VendorStreamFamily =
  | "hikvision"
  | "dahua"
  | "cp-plus"
  | "uniview"
  | "axis"
  | "tvt"
  | "generic";

export interface VendorStreamCandidate {
  uri: string;
  vendor: VendorStreamFamily;
  channel: number;
  role: "main" | "sub";
}

export function identifyVendorFamily(...hints: Array<string | undefined>) {
  const value = hints.filter(Boolean).join(" ").toLowerCase();
  if (/hikvision|hik vision|prama/.test(value)) return "hikvision" as const;
  if (/dahua/.test(value)) return "dahua" as const;
  if (/cp[\s-]*plus|secureye/.test(value)) return "cp-plus" as const;
  if (/uniview|\bunv\b/.test(value)) return "uniview" as const;
  if (/axis/.test(value)) return "axis" as const;
  if (/\btvt\b|tiandy|matrix|honeywell/.test(value)) return "tvt" as const;
  return "generic" as const;
}

export function vendorRtspCandidates(input: {
  host: string;
  vendor: VendorStreamFamily;
  credentials: OnvifCredentials;
  channel?: number;
  ports?: number[];
}) {
  const channel = input.channel ?? 1;
  const ports = input.ports?.length ? input.ports : [554];
  const paths = vendorPaths(input.vendor, channel);
  const candidates: VendorStreamCandidate[] = [];
  for (const port of ports) {
    for (const path of paths) {
      const base = `rtsp://${hostForUrl(input.host)}${port === 554 ? "" : `:${port}`}${path.path}`;
      candidates.push({
        uri: attachCredentials(base, input.credentials),
        vendor: input.vendor,
        channel,
        role: path.role,
      });
    }
  }
  return candidates;
}

export async function probeVendorStream(input: {
  host: string;
  vendor: VendorStreamFamily;
  credentials: OnvifCredentials;
  channel?: number;
  ports?: number[];
  preferredRole?: "main" | "sub";
  probe(uri: string): Promise<RtspProbeResult>;
}) {
  let lastProbe: RtspProbeResult | undefined;
  const candidates = vendorRtspCandidates(input).sort((left, right) =>
    Number(right.role === input.preferredRole) - Number(left.role === input.preferredRole)
  );
  for (const candidate of candidates) {
    const probe = await input.probe(candidate.uri);
    lastProbe = probe;
    if (probe.reachable) return { candidate, probe };
  }
  return { candidate: undefined, probe: lastProbe };
}

function vendorPaths(vendor: VendorStreamFamily, channel: number) {
  const pathsByVendor: Record<VendorStreamFamily, Array<{ path: string; role: "main" | "sub" }>> = {
    hikvision: [
      { path: `/Streaming/Channels/${channel}01`, role: "main" },
      { path: `/Streaming/Channels/${channel}02`, role: "sub" },
    ],
    dahua: [
      { path: `/cam/realmonitor?channel=${channel}&subtype=0`, role: "main" },
      { path: `/cam/realmonitor?channel=${channel}&subtype=1`, role: "sub" },
    ],
    "cp-plus": [
      { path: `/cam/realmonitor?channel=${channel}&subtype=0`, role: "main" },
      { path: `/cam/realmonitor?channel=${channel}&subtype=1`, role: "sub" },
    ],
    uniview: [
      { path: `/media/video${channel}`, role: "main" },
      { path: `/media/video${channel + 1}`, role: "sub" },
    ],
    axis: [
      { path: `/axis-media/media.amp?camera=${channel}`, role: "main" },
      { path: `/axis-media/media.amp?camera=${channel}&videocodec=h264`, role: "sub" },
    ],
    tvt: [
      { path: `/ch${channel}/main/av_stream`, role: "main" },
      { path: `/ch${channel}/sub/av_stream`, role: "sub" },
    ],
    generic: [
      { path: `/Streaming/Channels/${channel}01`, role: "main" },
      { path: `/cam/realmonitor?channel=${channel}&subtype=0`, role: "main" },
      { path: `/ch${channel}/main/av_stream`, role: "main" },
      { path: `/live/ch${channel}`, role: "main" },
    ],
  };
  return pathsByVendor[vendor];
}

function hostForUrl(host: string) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}
