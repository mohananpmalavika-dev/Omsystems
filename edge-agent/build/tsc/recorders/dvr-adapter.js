import { attachCredentials } from "../devices/onvif-client.js";
/**
 * Universal ONVIF DVR/NVR adapter. The analog camera itself is never contacted;
 * each logical camera is derived from a recorder media profile and its RTSP URI.
 * Vendor-specific URI shapes are normalized here instead of leaking into the
 * control plane or live-view code.
 */
export async function discoverRecorderChannels(input) {
    const sourceType = recorderChannelSource(input.model);
    const resolved = [];
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
        }
        catch (error) {
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
    const channels = [];
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
export function recorderAdapterVendor(manufacturer) {
    const normalized = manufacturer.toLowerCase();
    if (/hikvision|hik vision/.test(normalized))
        return "hikvision";
    if (/dahua/.test(normalized))
        return "dahua";
    if (/cp[\s-]*plus/.test(normalized))
        return "cp-plus";
    if (/uniview|unv\b/.test(normalized))
        return "uniview";
    if (/\btvt\b/.test(normalized))
        return "tvt";
    if (/prama/.test(normalized))
        return "prama";
    if (/honeywell/.test(normalized))
        return "honeywell";
    if (/matrix/.test(normalized))
        return "matrix";
    if (/secureye/.test(normalized))
        return "secureye";
    if (/tiandy/.test(normalized))
        return "tiandy";
    return "onvif";
}
/**
 * Stable physical identity for a recorder input. IP addresses and discovery
 * IDs are deliberately excluded because both can change during maintenance.
 */
export function recorderChannelIdentity(recorderSerialNumber, sourceChannel) {
    const serial = recorderSerialNumber.trim().toUpperCase();
    if (!serial)
        throw new Error("recorder_serial_number_required");
    if (!Number.isInteger(sourceChannel) || sourceChannel < 1 || sourceChannel > 65_535) {
        throw new Error("invalid_recorder_channel");
    }
    return `${serial}:channel:${sourceChannel}`;
}
export function recorderChannelSource(model) {
    return /(?:^|[\s_-])(dvr|xvr|uvr)(?:$|[\s_-])/i.test(model)
        ? "analog-dvr-channel"
        : "nvr-channel";
}
export function recorderChannelNumber(profile, uri) {
    if (uri) {
        try {
            const parsed = new URL(uri);
            const queryChannel = parsed.searchParams.get("channel") ?? parsed.searchParams.get("ch");
            if (queryChannel && positiveInteger(queryChannel))
                return Number(queryChannel);
            const hikvision = parsed.pathname.match(/\/Streaming\/Channels\/(\d+)/i)?.[1];
            if (hikvision) {
                const track = Number(hikvision);
                return track >= 100 ? Math.floor(track / 100) : track;
            }
            const pathChannel = parsed.pathname.match(/(?:channel|ch)[/_-]?(\d+)/i)?.[1];
            if (pathChannel && positiveInteger(pathChannel))
                return Number(pathChannel);
        }
        catch {
            // The caller reports the malformed URI separately; profile metadata can
            // still identify a channel and preserve inventory visibility.
        }
    }
    for (const value of [profile.name, profile.token]) {
        const explicit = value.match(/(?:camera|channel|ch|input|profile)[\s_.:-]*0*(\d+)/i)?.[1];
        if (explicit && positiveInteger(explicit))
            return Number(explicit);
    }
    return null;
}
function streamRole(profile, uri) {
    const value = `${profile.name} ${profile.token} ${uri ?? ""}`.toLowerCase();
    if (/subtype=1|(?:^|[^a-z])sub(?:stream)?(?:[^a-z]|$)|\/channels\/\d+02(?:\D|$)/.test(value))
        return "sub";
    if (/subtype=0|(?:^|[^a-z])main(?:stream)?(?:[^a-z]|$)|\/channels\/\d+01(?:\D|$)/.test(value))
        return "main";
    return "unknown";
}
function groupProfilesByChannel(profiles) {
    const groups = new Map();
    let nextFallbackChannel = 1;
    for (const item of profiles) {
        let channel = item.channel;
        if (channel === null) {
            while (groups.has(nextFallbackChannel))
                nextFallbackChannel++;
            channel = nextFallbackChannel++;
            item.reasonCodes.push("recorder_channel_number_inferred_from_profile_order");
        }
        const group = groups.get(channel) ?? [];
        group.push(item);
        groups.set(channel, group);
    }
    return groups;
}
function compareProfiles(left, right) {
    const rank = (item) => item.role === "main" ? 2 : item.role === "unknown" ? 1 : 0;
    return rank(right) - rank(left)
        || (right.profile.width * right.profile.height) - (left.profile.width * left.profile.height);
}
function channelName(profiles, sourceChannel) {
    const named = profiles
        .map((item) => item.profile.name.trim())
        .find((name) => name && !/^(profile|main|sub|stream)[\s_.:-]*\d*$/i.test(name));
    return named ?? `Channel ${sourceChannel}`;
}
function positiveInteger(value) {
    return /^\d+$/.test(value) && Number(value) > 0 && Number(value) <= 65_535;
}
function classifyStreamUriFailure(error) {
    const message = error instanceof Error ? error.message : String(error);
    return /401|403|unauthori|forbidden|credential|auth/i.test(message)
        ? "recorder_channel_credentials_rejected"
        : "recorder_channel_stream_uri_unavailable";
}
function unique(values) {
    return [...new Set(values)];
}
