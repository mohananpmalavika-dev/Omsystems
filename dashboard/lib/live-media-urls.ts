import type { LiveSessionResponse } from "./types";

export function rewriteLiveMediaUrls(session: LiveSessionResponse, gatewayUrl: string): LiveSessionResponse {
  let gateway: URL;
  try { gateway = new URL(gatewayUrl); } catch { return session; }
  const prefix = gateway.pathname.replace(/\/v1\/live\/start\/?$/, "").replace(/\/$/, "");
  const isEdgeRelay = /^\/v1\/edge-media\/[^/]+$/.test(prefix);
  // Direct HTTP LAN gateways may expose media on another port. Edge relays
  // instead serve all media under their agent path, on HTTP as well as HTTPS.
  if (gateway.protocol !== "https:" && !isEdgeRelay) return session;

  const rewrite = (value: string) => {
    try {
      const source = new URL(value);
      if (!isEdgeRelay && source.protocol !== "http:") return value;
      if (source.protocol !== "http:" && source.protocol !== "https:") return value;
      const path = prefix && !source.pathname.startsWith(`${prefix}/`)
        ? `${prefix}${source.pathname}` : source.pathname;
      return new URL(`${path}${source.search}`, gateway.origin).toString();
    } catch { return value; }
  };

  return {
    ...session,
    ...(session.hls ? { hls: { ...session.hls, url: rewrite(session.hls.url) } } : {}),
    ...(session.webRtc ? { webRtc: { ...session.webRtc, whepUrl: rewrite(session.webRtc.whepUrl) } } : {}),
  };
}
