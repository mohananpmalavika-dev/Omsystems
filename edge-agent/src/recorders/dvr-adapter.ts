import type { OnvifCredentials, OnvifProfile } from "../devices/onvif-client.js";
import { attachCredentials } from "../devices/onvif-client.js";
import type { RtspProbeResult } from "../streaming/rtsp-probe.js";
import {
  identifyVendorFamily,
  probeVendorStream,
} from "../devices/vendor-stream-adapter.js";

export type RecorderAdapterVendor =
  | "hikvision"
  | "dahua"
  | "cp-plus"
  | "uniview"
  | "tvt"
  | "prama"
  | "honeywell"
  | "matrix"
  | "secureye"
  | "tiandy"
  | "onvif";
export type RecorderChannelSource = "analog-dvr-channel" | "nvr-channel";

export interface RecorderChannelCandidate {
  sourceChannel: number;
  name: string;
  sourceType: RecorderChannelSource;
  primaryStreamUri: string | null;
  profiles: Array<{
    name: string;
    codec: OnvifProfile["codec"];
    width: number;
    height: number;
    role: "main" | "sub" | "unknown";
    preferredFor: Array<"recording" | "live" | "analytics">;
  }>;
  streamVerified: boolean;
  probe: RtspProbeResult | null;
  reasonCodes: string[];
}

export interface RecorderChannelDiscoveryInput {
  manufacturer: string;
  model: string;
  profiles: OnvifProfile[];
  credentials: OnvifCredentials;
  getStreamUri(profileToken: string): Promise<string>;
  probeStream(uri: string): Promise<RtspProbeResult>;
}

interface ResolvedProfile {
  profile: OnvifProfile;
  channel: number | null;
  role: "main" | "sub" | "unknown";
  uri: string | null;
  reasonCodes: string[];
}

/**
 * Universal ONVIF DVR/NVR adapter. The analog camera itself is never contacted;
 * each logical camera is derived from a recorder media profile and its RTSP URI.
 * Vendor-specific URI shapes are normalized here instead of leaking into the
 * control plane or live-view code.
 */
export async function discoverRecorderChannels(
  input: RecorderChannelDiscoveryInput,
): Promise<RecorderChannelCandidate[]> {
  const sourceType = recorderChannelSource(input.model);
  const resolved: ResolvedProfile[] = [];

  // Embedded DVR SOAP servers are frequently single-threaded. Keep GetStreamUri
  // calls sequential so a 16/32-channel recorder is not overloaded during setup.
  for (const profile of input.profiles.slice(0, 256)) {
    try {
      const rawUri = await input.getStreamUri(profile.token);
      const uri = attachCredentials(rawUri, input.credentials);
      resolved.push({
        profile,
        channel: recorderChannelNumber(profile, uri),
        role: streamRole(profile, uri),
        uri,
        reasonCodes: [],
      });
    } catch (error) {
      resolved.push({
        profile,
        channel: recorderChannelNumber(profile),
        role: streamRole(profile),
        uri: null,
        reasonCodes: [classifyStreamUriFailure(error)],
      });
    }
  }

  const groups = groupProfilesByChannel(resolved);
  const channels: RecorderChannelCandidate[] = [];
  for (const [sourceChannel, profiles] of [...groups.entries()].sort((left, right) => left[0] - right[0])) {
    // DVR/NVR main streams remain on the recorder. Prefer the recorder's
    // lower-bandwidth substream for remote live view and analytics.
    const primary = [...profiles]
      .filter((item) => item.uri)
      .sort(compareProfiles)[0];
    const probe = primary?.uri ? await input.probeStream(primary.uri) : null;
    const reasonCodes = unique([
      ...profiles.flatMap((item) => item.reasonCodes),
      ...(primary?.uri ? [] : ["recorder_channel_stream_uri_unavailable"]),
      ...(primary?.role === "sub" ? ["recorder_channel_substream_selected"] : []),
      ...(probe?.reachable ? ["recorder_channel_rtsp_verified"] : probe ? ["recorder_channel_rtsp_unreachable"] : []),
    ]);
    channels.push({
      sourceChannel,
      name: channelName(profiles, sourceChannel),
      sourceType,
      primaryStreamUri: primary?.uri ?? null,
      profiles: profiles.map(({ profile, role }) => ({
        name: role === "unknown" ? profile.name : role,
        codec: profile.codec,
        width: profile.width,
        height: profile.height,
        role,
        preferredFor: role === primary?.role
          ? role === "main"
            ? ["recording", "live", "analytics"]
            : ["live", "analytics"]
          : role === "main"
            ? ["recording"]
            : [],
      })),
      streamVerified: Boolean(probe?.reachable),
      probe,
      reasonCodes,
    });
  }
  return channels;
}

export async function discoverVendorRecorderChannels(input: {
  manufacturer: string;
  model: string;
  host: string;
  credentials: OnvifCredentials;
  existingChannels?: number[];
  probeStream(uri: string): Promise<RtspProbeResult>;
}) {
  const existing = new Set(input.existingChannels ?? []);
  const channelCount = inferRecorderChannelCount(input.model)
    ?? Math.max(1, ...existing);
  const pending = Array.from({ length: channelCount }, (_, index) => index + 1)
    .filter((channel) => !existing.has(channel));
  const vendor = identifyVendorFamily(input.manufacturer, input.model);
  const channels: RecorderChannelCandidate[] = [];
  for (let offset = 0; offset < pending.length; offset += 4) {
    const batch = pending.slice(offset, offset + 4);
    const results = await Promise.all(batch.map(async (sourceChannel) => {
      const fallback = await probeVendorStream({
        host: input.host,
        vendor,
        credentials: input.credentials,
        channel: sourceChannel,
        preferredRole: "sub",
        probe: input.probeStream,
      });
      return {
        sourceChannel,
        name: `Channel ${sourceChannel}`,
        sourceType: recorderChannelSource(input.model),
        primaryStreamUri: fallback.candidate?.uri ?? null,
        profiles: [{
          name: fallback.candidate?.role ?? "main",
          codec: codecFromProbe(fallback.probe?.codec),
          width: Math.max(1, fallback.probe?.width ?? 1),
          height: Math.max(1, fallback.probe?.height ?? 1),
          role: fallback.candidate?.role ?? "main",
          preferredFor: fallback.candidate?.role === "sub"
            ? ["live", "analytics"]
            : ["recording", "live", "analytics"],
        }],
        streamVerified: Boolean(fallback.probe?.reachable),
        probe: fallback.probe ?? null,
        reasonCodes: fallback.probe?.reachable
          ? ["vendor_adapter_fallback", "recorder_channel_rtsp_verified"]
          : ["vendor_adapter_fallback", "recorder_channel_rtsp_unreachable"],
      } satisfies RecorderChannelCandidate;
    }));
    channels.push(...results);
  }
  return channels;
}

export function inferRecorderChannelCount(model: string) {
  const value = model.match(/(?:^|[^\d])(4|8|16|24|32|64)[\s_-]*(?:ch(?:annel)?s?|input)/i)?.[1]
    ?? model.match(/(?:dvr|xvr|nvr|uvr)[\s_-]*(4|8|16|24|32|64)(?:[^\d]|$)/i)?.[1]
    ?? model.match(/(?:dvr|xvr|nvr|uvr)[a-z\d_-]*?(04|08|16|24|32|64)(?:[^\d]|$)/i)?.[1]
    ?? model.match(/\bds[-_]?\d{2}(04|08|16|24|32|64)[a-z]/i)?.[1];
  return value ? Number(value) : null;
}

export function recorderAdapterVendor(manufacturer: string): RecorderAdapterVendor {
  const normalized = manufacturer.toLowerCase();
  if (/hikvision|hik vision/.test(normalized)) return "hikvision";
  if (/dahua/.test(normalized)) return "dahua";
  if (/cp[\s_-]*plus/.test(normalized)) return "cp-plus";
  if (/uniview|unv\b/.test(normalized)) return "uniview";
  if (/\btvt\b/.test(normalized)) return "tvt";
  if (/prama/.test(normalized)) return "prama";
  if (/honeywell/.test(normalized)) return "honeywell";
  if (/matrix/.test(normalized)) return "matrix";
  if (/secureye/.test(normalized)) return "secureye";
  if (/tiandy/.test(normalized)) return "tiandy";
  return "onvif";
}

/**
 * Stable physical identity for a recorder input. IP addresses and discovery
 * IDs are deliberately excluded because both can change during maintenance.
 */
export function recorderChannelIdentity(recorderSerialNumber: string, sourceChannel: number) {
  const serial = recorderSerialNumber.trim().toUpperCase();
  if (!serial) throw new Error("recorder_serial_number_required");
  if (!Number.isInteger(sourceChannel) || sourceChannel < 1 || sourceChannel > 65_535) {
    throw new Error("invalid_recorder_channel");
  }
  return `${serial}:channel:${sourceChannel}`;
}

export function recorderChannelSource(model: string): RecorderChannelSource {
  return /(?:^|[\s_-])(dvr|xvr|uvr)(?:$|[\s_-])/i.test(model)
    ? "analog-dvr-channel"
    : "nvr-channel";
}

export function recorderChannelNumber(profile: Pick<OnvifProfile, "token" | "name">, uri?: string): number | null {
  if (uri) {
    try {
      const parsed = new URL(uri);
      const queryChannel = parsed.searchParams.get("channel") ?? parsed.searchParams.get("ch");
      if (queryChannel && positiveInteger(queryChannel)) return Number(queryChannel);
      const hikvision = parsed.pathname.match(/\/Streaming\/Channels\/(\d+)/i)?.[1];
      if (hikvision) {
        const track = Number(hikvision);
        return track >= 100 ? Math.floor(track / 100) : track;
      }
      const pathChannel = parsed.pathname.match(/(?:channel|ch)[/_-]?(\d+)/i)?.[1];
      if (pathChannel && positiveInteger(pathChannel)) return Number(pathChannel);
    } catch {
      // The caller reports the malformed URI separately; profile metadata can
      // still identify a channel and preserve inventory visibility.
    }
  }
  for (const value of [profile.name, profile.token]) {
    const explicit = value.match(/(?:camera|channel|ch|input|profile)[\s_.:-]*0*(\d+)/i)?.[1];
    if (explicit && positiveInteger(explicit)) return Number(explicit);
  }
  return null;
}

function streamRole(profile: Pick<OnvifProfile, "token" | "name">, uri?: string) {
  const value = `${profile.name} ${profile.token} ${uri ?? ""}`.toLowerCase();
  if (/subtype=1|(?:^|[^a-z])sub(?:stream)?(?:[^a-z]|$)|\/channels\/\d+02(?:\D|$)/.test(value)) return "sub" as const;
  if (/subtype=0|(?:^|[^a-z])main(?:stream)?(?:[^a-z]|$)|\/channels\/\d+01(?:\D|$)/.test(value)) return "main" as const;
  return "unknown" as const;
}

function groupProfilesByChannel(profiles: ResolvedProfile[]) {
  const groups = new Map<number, ResolvedProfile[]>();
  let nextFallbackChannel = 1;
  for (const item of profiles) {
    let channel = item.channel;
    if (channel === null) {
      while (groups.has(nextFallbackChannel)) nextFallbackChannel++;
      channel = nextFallbackChannel++;
      item.reasonCodes.push("recorder_channel_number_inferred_from_profile_order");
    }
    const group = groups.get(channel) ?? [];
    group.push(item);
    groups.set(channel, group);
  }
  return groups;
}

function compareProfiles(left: ResolvedProfile, right: ResolvedProfile) {
  const rank = (item: ResolvedProfile) => item.role === "sub" ? 2 : item.role === "unknown" ? 1 : 0;
  return rank(right) - rank(left)
    || (left.profile.width * left.profile.height) - (right.profile.width * right.profile.height);
}

function channelName(profiles: ResolvedProfile[], sourceChannel: number) {
  const named = profiles
    .map((item) => item.profile.name.trim())
    .find((name) => name && !/^(profile|main|sub|stream)[\s_.:-]*\d*$/i.test(name));
  return named ?? `Channel ${sourceChannel}`;
}

function positiveInteger(value: string) {
  return /^\d+$/.test(value) && Number(value) > 0 && Number(value) <= 65_535;
}

function classifyStreamUriFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /401|403|unauthori|forbidden|credential|auth/i.test(message)
    ? "recorder_channel_credentials_rejected"
    : "recorder_channel_stream_uri_unavailable";
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function codecFromProbe(value: string | null | undefined): OnvifProfile["codec"] {
  const codec = value?.toUpperCase();
  if (codec === "H264" || codec === "H265" || codec === "MJPEG") return codec;
  return "unknown";
}
