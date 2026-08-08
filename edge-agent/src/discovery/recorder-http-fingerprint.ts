import { identifyVendorFamily, type VendorStreamFamily } from "../devices/vendor-stream-adapter.js";

export interface HttpRecorderFingerprint {
  vendor: VendorStreamFamily;
  manufacturer: string;
  model: string;
  sourceType: "analog-dvr-channel" | "nvr-channel";
}

/**
 * Fingerprint recorder web applications that do not answer ONVIF
 * WS-Discovery. This is intentionally limited to hosts that have already
 * exposed an RTSP service during the local-network scan.
 */
export async function fingerprintHttpRecorder(
  host: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<HttpRecorderFingerprint | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(500, Math.min(timeoutMs, 5_000)));
  try {
    const response = await fetchImpl(`http://${hostForUrl(host)}/`, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    const body = (await response.text()).slice(0, 256_000);
    const title = decodeHtml(body.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1] ?? "").trim();
    const server = response.headers.get("server") ?? "";
    const evidence = `${title} ${server} ${body.slice(0, 64_000)}`;
    if (!looksLikeRecorder(evidence)) return undefined;

    const vendor = identifyVendorFamily(evidence);
    const manufacturer = manufacturerFor(vendor, evidence);
    const model = title || `${manufacturer} recorder`;
    return {
      vendor,
      manufacturer,
      model,
      sourceType: /\b(?:dvr|xvr|uvr|digital video recorder)\b/i.test(evidence)
        ? "analog-dvr-channel"
        : "nvr-channel",
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function looksLikeRecorder(value: string) {
  return /\b(?:dvr|xvr|nvr|uvr|digital video recorder|network video recorder|network video storage)\b/i.test(value);
}

function manufacturerFor(vendor: VendorStreamFamily, evidence: string) {
  if (vendor === "cp-plus") return "CP PLUS";
  if (vendor === "dahua") return "Dahua";
  if (vendor === "hikvision") return "Hikvision";
  if (vendor === "uniview") return "Uniview";
  if (vendor === "tvt") return "TVT";
  const named = evidence.match(/\b(CP\s*PLUS|Dahua|Hikvision|Uniview|TVT|Secureye|Prama|Tiandy|Matrix|Honeywell)\b/i)?.[1];
  return named?.replace(/cp\s*plus/i, "CP PLUS") ?? "Network DVR/NVR";
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function hostForUrl(host: string) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}
