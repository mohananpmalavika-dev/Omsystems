import type { OnvifCredentials, OnvifProfile } from "../devices/onvif-client.js";
import { attachCredentials } from "../devices/onvif-client.js";
import type { RtspProbeResult } from "../streaming/rtsp-probe.js";

export type RecorderAdapterVendor = "hikvision" | "dahua" | "cp-plus" | "onvif";
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
    const primary = [...profiles]
      .filter((item) => item.uri)
      .sort(compareProfiles)[0];
    const probe = primary?.uri ? await input.probeStream(primary.uri) : null;
    const reasonCodes = unique([
      ...profiles.flatMap((item) => item.reasonCodes),
      ...(primary?.uri ? [] : ["recorder_channel_stream_uri_unavailable"]),
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
      })),
      streamVerified: Boolean(probe?.reachable),
      probe,
      reasonCodes,
    });
  }
  return channels;
}

export function recorderAdapterVendor(manufacturer: string): RecorderAdapterVendor {
  const normalized = manufacturer.toLowerCase();
  if (/hikvision|hik vision/.test(normalized)) return "hikvision";
  if (/dahua/.test(normalized)) return "dahua";
  if (/cp[\s-]*plus/.test(normalized)) return "cp-plus";
  return "onvif";
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
  const rank = (item: ResolvedProfile) => item.role === "main" ? 2 : item.role === "unknown" ? 1 : 0;
  return rank(right) - rank(left)
    || (right.profile.width * right.profile.height) - (left.profile.width * left.profile.height);
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
