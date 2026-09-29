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
  | "reolink"
  | "foscam"
  | "vivotek"
  | "amcrest"
  | "tp-link"
  | "d-link"
  | "ubiquiti"
  | "hanwha"
  | "bosch"
  | "generic";

export interface VendorStreamCandidate {
  uri: string;
  vendor: VendorStreamFamily;
  channel: number;
  role: "main" | "sub";
}

export function identifyVendorFamily(...hints: Array<string | undefined>): VendorStreamFamily {
  const value = hints.filter(Boolean).join(" ").toLowerCase();
  if (/hikvision|hik vision|prama|ezviz/.test(value)) return "hikvision";
  if (/amcrest/.test(value)) return "amcrest";
  if (/dahua|lechange|imou/.test(value)) return "dahua";
  if (/cp[\s_-]*plus|secureye/.test(value)) return "cp-plus";
  if (/uniview|\bunv\b/.test(value)) return "uniview";
  if (/axis/.test(value)) return "axis";
  if (/reolink/.test(value)) return "reolink";
  if (/foscam/.test(value)) return "foscam";
  if (/vivotek/.test(value)) return "vivotek";
  if (/tp[\s_-]*link|tapo|kasa/.test(value)) return "tp-link";
  if (/d[\s_-]*link/.test(value)) return "d-link";
  if (/ubiquiti|unifi/.test(value)) return "ubiquiti";
  if (/hanwha|samsung|wisenet/.test(value)) return "hanwha";
  if (/bosch/.test(value)) return "bosch";
  if (/\btvt\b|tiandy|matrix|honeywell/.test(value)) return "tvt";
  return "generic";
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
  const nextPaths = channel === 1 ? [] : vendorPaths(input.vendor, channel + 1);
  // A few camera-style fallback paths (for example /live) do not select a
  // recorder input. Reusing them for channel 2+ creates phantom channels.
  const paths = vendorPaths(input.vendor, channel).filter((path) =>
    channel === 1 || !nextPaths.some((next) =>
      next.path === path.path && next.role === path.role));
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
    let probe: RtspProbeResult;
    try {
      probe = await input.probe(candidate.uri);
    } catch (error) {
      probe = { reachable: false, codec: null, width: null, height: null,
        error: error instanceof Error ? error.message : String(error) };
    }
    lastProbe = probe;
    if (probe.reachable) return { candidate, probe };
  }
  return { candidate: undefined, probe: lastProbe };
}

function vendorPaths(vendor: VendorStreamFamily, channel: number): Array<{ path: string; role: "main" | "sub" }> {
  const pad2 = channel.toString().padStart(2, "0");

  const pathsByVendor: Record<VendorStreamFamily, Array<{ path: string; role: "main" | "sub" }>> = {
    hikvision: [
      { path: `/Streaming/Channels/${channel}01`, role: "main" },
      { path: `/Streaming/Channels/${channel}02`, role: "sub" },
      { path: `/Streaming/Channels/${channel}`, role: "main" },
      { path: `/h264/ch${channel}/main/av_stream`, role: "main" },
      { path: `/h264/ch${channel}/sub/av_stream`, role: "sub" },
    ],
    dahua: [
      { path: `/cam/realmonitor?channel=${channel}&subtype=0`, role: "main" },
      { path: `/cam/realmonitor?channel=${channel}&subtype=1`, role: "sub" },
      { path: `/live`, role: "main" },
    ],
    amcrest: [
      { path: `/cam/realmonitor?channel=${channel}&subtype=0`, role: "main" },
      { path: `/cam/realmonitor?channel=${channel}&subtype=1`, role: "sub" },
      { path: `/live`, role: "main" },
    ],
    "cp-plus": [
      { path: `/cam/realmonitor?channel=${channel}&subtype=0`, role: "main" },
      { path: `/cam/realmonitor?channel=${channel}&subtype=1`, role: "sub" },
    ],
    uniview: [
      { path: `/media/video${channel}`, role: "main" },
      { path: `/media/video${channel + 1}`, role: "sub" },
      { path: `/unicast/c${channel}/s0/live`, role: "main" },
      { path: `/unicast/c${channel}/s1/live`, role: "sub" },
    ],
    axis: [
      { path: `/axis-media/media.amp?camera=${channel}`, role: "main" },
      { path: `/axis-media/media.amp?camera=${channel}&videocodec=h264`, role: "sub" },
      { path: `/axis-media/media.amp`, role: "main" },
    ],
    reolink: [
      { path: `/h264Preview_${pad2}_main`, role: "main" },
      { path: `/h264Preview_${pad2}_sub`, role: "sub" },
      { path: `/h265Preview_${pad2}_main`, role: "main" },
      { path: `/Preview_${pad2}_main`, role: "main" },
      { path: `/Preview_${pad2}_sub`, role: "sub" },
    ],
    foscam: [
      { path: `/videoMain`, role: "main" },
      { path: `/videoSub`, role: "sub" },
      { path: `/videoMain${channel}`, role: "main" },
      { path: `/videoSub${channel}`, role: "sub" },
      { path: `/live/main`, role: "main" },
      { path: `/live/sub`, role: "sub" },
    ],
    vivotek: [
      { path: `/live.sdp`, role: "main" },
      { path: `/live${channel}.sdp`, role: "main" },
      { path: `/video.mp4`, role: "main" },
      { path: `/live/ch${channel}`, role: "main" },
    ],
    "tp-link": [
      { path: `/stream1`, role: "main" },
      { path: `/stream2`, role: "sub" },
      { path: `/ch${channel}/main/av_stream`, role: "main" },
    ],
    "d-link": [
      { path: `/play${channel}.sdp`, role: "main" },
      { path: `/live${channel}.sdp`, role: "main" },
      { path: `/video.mp4`, role: "main" },
      { path: `/stream1`, role: "main" },
    ],
    ubiquiti: [
      { path: `/s0`, role: "main" },
      { path: `/s1`, role: "sub" },
      { path: `/s2`, role: "sub" },
      { path: `/live/ch${channel}`, role: "main" },
      { path: `/stream${channel}`, role: "main" },
    ],
    hanwha: [
      { path: `/profile${channel}/media.smp`, role: "main" },
      { path: `/profile${channel + 1}/media.smp`, role: "sub" },
      { path: `/onvif/profile${channel}/media.smp`, role: "main" },
      { path: `/live/ch${channel}`, role: "main" },
    ],
    bosch: [
      { path: `/rtsp_tunnel?line=${channel}`, role: "main" },
      { path: `/rtsp_tunnel?inst=${channel}`, role: "sub" },
    ],
    tvt: [
      { path: `/ch${channel}/main/av_stream`, role: "main" },
      { path: `/ch${channel}/sub/av_stream`, role: "sub" },
      { path: `/h264/ch${channel}/main/av_stream`, role: "main" },
    ],
    generic: [
      { path: `/Streaming/Channels/${channel}01`, role: "main" },
      { path: `/cam/realmonitor?channel=${channel}&subtype=0`, role: "main" },
      { path: `/stream1`, role: "main" },
      { path: `/stream2`, role: "sub" },
      { path: `/ch${channel}/main/av_stream`, role: "main" },
      { path: `/live/ch${channel}`, role: "main" },
      { path: `/live`, role: "main" },
      { path: `/video`, role: "main" },
      { path: `/onvif1`, role: "main" },
    ],
  };

  return pathsByVendor[vendor] || pathsByVendor.generic;
}

function hostForUrl(host: string) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}
