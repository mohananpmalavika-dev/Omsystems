import { inferRecorderChannelCount } from "../recorders/dvr-adapter.js";

export function fallbackCredentialsRequired(
  streamVerified: boolean,
  credentialFailureDetected: boolean,
) {
  return !streamVerified && credentialFailureDetected;
}

export function needsRecorderRtspFallback(model: string, verifiedChannels: number) {
  return verifiedChannels < (inferRecorderChannelCount(model) ?? 2);
}

export function rtspOnvifExclusions(input: {
  targetIpAddress?: string;
  onvifHosts: readonly string[];
  handledOnvifHosts: ReadonlySet<string>;
  recorderFallbackHosts: ReadonlySet<string>;
}) {
  const candidates = input.targetIpAddress
    ? (input.handledOnvifHosts.has(input.targetIpAddress) ? [input.targetIpAddress] : [])
    : input.onvifHosts;

  return [...new Set(candidates)]
    .filter((host) => !input.recorderFallbackHosts.has(host));
}
