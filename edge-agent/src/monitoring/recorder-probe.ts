import { authenticatedFetch } from "./http-auth.js";

export interface RecorderConfig {
  id: string; name: string; deviceType: "dvr" | "nvr";
  vendor: "hikvision" | "dahua" | "cp-plus" | "onvif" | "generic";
  model?: string | undefined; host: string; port: number; secure?: boolean | undefined;
  username?: string | undefined; password?: string | undefined;
  systemPath?: string | undefined; storagePath?: string | undefined;
}
export interface RecorderProbeResult {
  metrics: Record<string, string | number | boolean | null>;
  hddStatus: Array<Record<string, unknown>>;
  reasonCodes: string[];
}

export function looksLikeRecorder(identity: { model?: string | undefined; manufacturer?: string | undefined }, scopes: string[] = []) {
  return /(?:^|[\s_-])(dvr|nvr|xvr|uvr)(?:$|[\s_-])|video recorder/i.test(`${identity.manufacturer ?? ""} ${identity.model ?? ""} ${scopes.join(" ")}`);
}

export async function probeRecorder(config: RecorderConfig, timeoutMs: number): Promise<RecorderProbeResult> {
  const started = performance.now();
  const base = `${config.secure ? "https" : "http"}://${config.host}:${config.port}`;
  const credentials = config.username ? { username: config.username, password: config.password ?? "" } : undefined;
  try {
    if (config.vendor === "hikvision") return await probeHikvision(config, base, credentials, timeoutMs, started);
    if (config.vendor === "dahua" || config.vendor === "cp-plus") return await probeDahuaFamily(config, base, credentials, timeoutMs, started);
    if (config.vendor === "onvif") return await probeOnvif(config, base, credentials, timeoutMs, started);
    const response = await authenticatedFetch(base, { method: "GET" }, credentials, timeoutMs);
    return result(config, response.status < 500, response.status === 401 ? "degraded" : "online", started, {}, [], response.status === 401 ? ["recorder_credentials_rejected"] : ["generic_http_reachability_only"]);
  } catch (error) {
    return result(config, false, "offline", started, {}, [], [classifyError(error)]);
  }
}

async function probeHikvision(config: RecorderConfig, base: string, credentials: { username: string; password: string } | undefined, timeout: number, started: number) {
  const system = await authenticatedFetch(`${base}${config.systemPath ?? "/ISAPI/System/deviceInfo"}`, { method: "GET" }, credentials, timeout);
  if (system.status === 401 || system.status === 403) return result(config, true, "degraded", started, {}, [], ["recorder_credentials_rejected"]);
  if (!system.ok) throw new Error(`hikvision_http_${system.status}`);
  const xml = await system.text();
  const storage = await authenticatedFetch(`${base}${config.storagePath ?? "/ISAPI/ContentMgmt/Storage"}`, { method: "GET" }, credentials, timeout).catch(() => null);
  const storageXml = storage?.ok ? await storage.text() : "";
  const channels = await authenticatedFetch(`${base}/ISAPI/System/Video/inputs/channels`, { method: "GET" }, credentials, timeout).catch(() => null);
  const channelXml = channels?.ok ? await channels.text() : "";
  const total = (channelXml.match(/<VideoInputChannel>/gi) ?? []).length || null;
  const connected = (channelXml.match(/<videoInputEnabled>true<\/videoInputEnabled>/gi) ?? []).length || total;
  return result(config, true, "online", started, {
    model: tag(xml, "model") ?? config.model ?? "Unknown", serialNumber: tag(xml, "serialNumber") ?? "",
    firmwareVersion: tag(xml, "firmwareVersion") ?? "", uptimeSeconds: number(tag(xml, "upTime")),
    totalCameras: total, connectedCameras: connected, protocol: "hikvision-isapi", recordingStatus: "unknown",
  }, parseHikvisionDisks(storageXml), storageXml ? ["recording_state_vendor_specific"] : ["storage_telemetry_unavailable", "recording_state_vendor_specific"]);
}

async function probeDahuaFamily(config: RecorderConfig, base: string, credentials: { username: string; password: string } | undefined, timeout: number, started: number) {
  const system = await authenticatedFetch(`${base}${config.systemPath ?? "/cgi-bin/magicBox.cgi?action=getSystemInfo"}`, { method: "GET" }, credentials, timeout);
  if (system.status === 401 || system.status === 403) return result(config, true, "degraded", started, {}, [], ["recorder_credentials_rejected"]);
  if (!system.ok) throw new Error(`${config.vendor}_http_${system.status}`);
  const text = await system.text();
  const storage = await authenticatedFetch(`${base}${config.storagePath ?? "/cgi-bin/storageDevice.cgi?action=getDeviceAllInfo"}`, { method: "GET" }, credentials, timeout).catch(() => null);
  const storageText = storage?.ok ? await storage.text() : "";
  const channelResponse = await authenticatedFetch(`${base}/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle`, { method: "GET" }, credentials, timeout).catch(() => null);
  const channelText = channelResponse?.ok ? await channelResponse.text() : "";
  const channelIds = new Set([...channelText.matchAll(/ChannelTitle\[(\d+)\]/g)].map((match) => match[1]));
  return result(config, true, "online", started, {
    model: key(text, "deviceType") ?? config.model ?? "Unknown", serialNumber: key(text, "serialNumber") ?? "",
    firmwareVersion: key(text, "softwareVersion") ?? key(text, "version") ?? "",
    totalCameras: channelIds.size || null, connectedCameras: null,
    protocol: config.vendor === "cp-plus" ? "cp-plus-oem-api" : "dahua-cgi", recordingStatus: "unknown",
  }, parseCgiDisks(storageText), ["channel_connection_state_unavailable", "recording_state_vendor_specific"]);
}

async function probeOnvif(config: RecorderConfig, base: string, credentials: { username: string; password: string } | undefined, timeout: number, started: number) {
  const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><GetDeviceInformation xmlns="http://www.onvif.org/ver10/device/wsdl"/></s:Body></s:Envelope>`;
  const response = await authenticatedFetch(`${base}${config.systemPath ?? "/onvif/device_service"}`, { method: "POST", headers: { "content-type": "application/soap+xml" }, body }, credentials, timeout);
  if (response.status === 401 || response.status === 403) return result(config, true, "degraded", started, {}, [], ["recorder_credentials_rejected"]);
  if (!response.ok) throw new Error(`onvif_http_${response.status}`);
  const xml = await response.text();
  return result(config, true, "online", started, {
    model: tag(xml, "Model") ?? config.model ?? "Unknown", serialNumber: tag(xml, "SerialNumber") ?? "",
    firmwareVersion: tag(xml, "FirmwareVersion") ?? "", protocol: "onvif", recordingStatus: "unknown",
    totalCameras: null, connectedCameras: null,
  }, [], ["channel_inventory_vendor_specific", "storage_telemetry_unavailable", "recording_state_vendor_specific"]);
}

function result(config: RecorderConfig, reachable: boolean, status: string, started: number, extra: Record<string, string | number | boolean | null>, hddStatus: Array<Record<string, unknown>>, reasonCodes: string[]): RecorderProbeResult {
  return { metrics: { name: config.name, deviceType: config.deviceType, vendor: config.vendor, model: config.model ?? "Unknown", ipAddress: config.host, reachable, status, latencyMs: Math.round((performance.now() - started) * 100) / 100, ...extra }, hddStatus, reasonCodes };
}
function parseHikvisionDisks(xml: string) { return [...xml.matchAll(/<hdd>([\s\S]*?)<\/hdd>/gi)].map((match, index) => ({ diskNo: tag(match[1]!, "id") ?? index + 1, devicePath: tag(match[1]!, "name") ?? `HDD ${index + 1}`, capacity: tag(match[1]!, "capacity"), freeSpace: tag(match[1]!, "freeSpace"), state: tag(match[1]!, "status"), temperature: tag(match[1]!, "temperature") })); }
function parseCgiDisks(text: string) { const grouped = new Map<string, Record<string, unknown>>(); for (const line of text.split(/\r?\n/)) { const match = line.match(/(?:Storage|Disk|HDD)(?:\[|\.)(\d+)\]?\.([^=]+)=(.*)$/i); if (!match) continue; const item = grouped.get(match[1]!) ?? { diskNo: Number(match[1]) + 1 }; item[match[2]!] = match[3]!.trim(); grouped.set(match[1]!, item); } return [...grouped.values()]; }
function tag(xml: string, name: string) { return xml.match(new RegExp(`<(?:[^:>]+:)?${name}>([^<]+)<\\/(?:[^:>]+:)?${name}>`, "i"))?.[1]; }
function key(text: string, name: string) { return text.match(new RegExp(`(?:^|\\n)${name}=([^\\r\\n]+)`, "i"))?.[1]?.trim(); }
function number(value: string | undefined) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function classifyError(error: unknown) { const message = error instanceof Error ? error.message : String(error); return /timeout|abort/i.test(message) ? "recorder_probe_timeout" : "recorder_unreachable"; }
