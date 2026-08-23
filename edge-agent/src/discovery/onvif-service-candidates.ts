import type { DiscoveredOnvifEndpoint } from "./onvif-discovery.js";

export function onvifServiceCandidates(endpoint: DiscoveredOnvifEndpoint) {
  const candidates: string[] = [];
  for (const address of endpoint.xaddrs) {
    try {
      const parsed = new URL(address);
      if (["0.0.0.0", "127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
        parsed.hostname = endpoint.remoteAddress;
      }
      candidates.push(parsed.toString());
      const alternate = new URL(parsed);
      if (alternate.protocol === "http:") {
        alternate.protocol = "https:";
        if (!parsed.port || parsed.port === "80") alternate.port = "443";
      } else if (alternate.protocol === "https:") {
        alternate.protocol = "http:";
        if (!parsed.port || parsed.port === "443") alternate.port = "80";
      }
      candidates.push(alternate.toString());
    } catch {
      continue;
    }
  }
  for (const protocol of ["http", "https"]) {
    candidates.push(`${protocol}://${hostForUrl(endpoint.remoteAddress)}/onvif/device_service`);
  }
  return [...new Set(candidates)].slice(0, 8);
}

/**
 * WS-Discovery advertises a device role before ONVIF authentication. Keep the
 * result deliberately conservative: storage/recorder terms identify a
 * recorder, while a transmitter is a camera. Other devices remain unknown
 * until their authenticated device information is available.
 */
export function onvifEndpointRole(endpoint: DiscoveredOnvifEndpoint): "camera" | "recorder" | "unknown" {
  const evidence = [...endpoint.types, ...endpoint.scopes].join(" ");
  if (/\b(?:network[_-]?video[_-]?(?:storage|recorder)|digital[_-]?video[_-]?recorder|\b(?:dvr|nvr|xvr|uvr)\b)\b/i.test(evidence)) {
    return "recorder";
  }
  if (/\bnetwork[_-]?video[_-]?(?:transmitter|encoder)|\bvideo[_-]?encoder\b/i.test(evidence)) {
    return "camera";
  }
  return "unknown";
}

function hostForUrl(host: string) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}
