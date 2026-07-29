import { authenticatedFetch } from "./http-auth.js";

export interface RecorderConfig {
  id: string; name: string; deviceType: "dvr" | "nvr";
  vendor: "hikvision" | "dahua" | "cp-plus" | "onvif" | "generic";
  model?: string | undefined; host: string; port: number; secure?: boolean | undefined;
  username?: string | undefined; password?: string | undefined;
  systemPath?: string | undefined; storagePath?: string | undefined;
  archiveRetention?: {
    lookbackDays: number;
    maxResults: number;
    continuityGapSeconds: number;
    channels: Array<{ cameraId: string; channel: number }>;
  } | undefined;
}

export interface ArchiveRetentionEvidence {
  cameraId: string;
  sourceChannel: number;
  /** `available` means the search returned a complete, channel-scoped timeline. */
  status: "available" | "empty" | "unavailable";
  oldestContinuousAt: string | null;
  newestPlayableAt: string | null;
  /** The continuous window starts at the configured lookback boundary. */
  retentionLowerBound: boolean;
  coverageComplete: boolean;
  continuityGapSeconds: number;
  searchStartedAt: string;
  reasonCodes: string[];
}

export interface RecorderProbeResult {
  metrics: Record<string, string | number | boolean | null>;
  hddStatus: Array<Record<string, unknown>>;
  reasonCodes: string[];
  archiveEvidence: ArchiveRetentionEvidence[];
}

type RecordingStatus = "recording" | "stopped" | "partial" | "unknown";

interface RecordingProbe {
  status: RecordingStatus;
  recordingChannels: number | null;
  reasonCodes: string[];
  /** The API used to prove that new media exists, rather than merely reading a schedule. */
  source: "recent-media-search" | "recording-summary" | "unavailable";
}

interface ArchiveSegment {
  startedAt: number;
  endedAt: number;
}

interface ArchiveSearchResult {
  segments: ArchiveSegment[];
  coverageComplete: boolean;
  reasonCodes: string[];
}

const RECORDING_EVIDENCE_WINDOW_MS = 5 * 60_000;

export function looksLikeRecorder(identity: { model?: string | undefined; manufacturer?: string | undefined }, scopes: string[] = []) {
  return /(?:^|[\s_-])(dvr|nvr|xvr|uvr)(?:$|[\s_-])|video recorder/i.test(`${identity.manufacturer ?? ""} ${identity.model ?? ""} ${scopes.join(" ")}`);
}

export async function probeRecorder(config: RecorderConfig, timeoutMs: number, options: { includeArchive?: boolean } = {}): Promise<RecorderProbeResult> {
  const started = performance.now();
  const base = `${config.secure ? "https" : "http"}://${config.host}:${config.port}`;
  const credentials = config.username ? { username: config.username, password: config.password ?? "" } : undefined;
  try {
    if (config.vendor === "hikvision") return await probeHikvision(config, base, credentials, timeoutMs, started, Boolean(options.includeArchive));
    if (config.vendor === "dahua" || config.vendor === "cp-plus") return await probeDahuaFamily(config, base, credentials, timeoutMs, started, Boolean(options.includeArchive));
    if (config.vendor === "onvif") return await probeOnvif(config, base, credentials, timeoutMs, started, Boolean(options.includeArchive));
    const response = await authenticatedFetch(base, { method: "GET" }, credentials, timeoutMs);
    return result(config, response.status < 500, response.status === 401 ? "degraded" : "online", started, {}, [], response.status === 401 ? ["recorder_credentials_rejected"] : ["generic_http_reachability_only"]);
  } catch (error) {
    return result(config, false, "offline", started, {}, [], [classifyError(error)]);
  }
}

async function probeHikvision(config: RecorderConfig, base: string, credentials: { username: string; password: string } | undefined, timeout: number, started: number, includeArchive: boolean) {
  const system = await authenticatedFetch(`${base}${config.systemPath ?? "/ISAPI/System/deviceInfo"}`, { method: "GET" }, credentials, timeout);
  if (system.status === 401 || system.status === 403) return result(config, true, "degraded", started, {}, [], ["recorder_credentials_rejected"]);
  if (!system.ok) throw new Error(`hikvision_http_${system.status}`);
  const xml = await system.text();
  const storage = await authenticatedFetch(`${base}${config.storagePath ?? "/ISAPI/ContentMgmt/Storage"}`, { method: "GET" }, credentials, timeout).catch(() => null);
  const storageXml = storage?.ok ? await storage.text() : "";
  const channels = await authenticatedFetch(`${base}/ISAPI/System/Video/inputs/channels`, { method: "GET" }, credentials, timeout).catch(() => null);
  const channelXml = channels?.ok ? await channels.text() : "";

  // A recording schedule is not proof that the recorder is currently writing media.
  // Query the last five minutes of the archive instead.
  const recordingStatus = await getHikvisionRecordingStatus(base, credentials, timeout, hikvisionTrackIds(channelXml));
  const archiveEvidence = includeArchive
    ? await scanHikvisionArchive(config, base, credentials, timeout)
    : [];

  const total = (channelXml.match(/<VideoInputChannel>/gi) ?? []).length || null;
  const connected = (channelXml.match(/<videoInputEnabled>true<\/videoInputEnabled>/gi) ?? []).length || total;
  const reportedModel = tag(xml, "model");
  return result(config, true, "online", started, {
    model: reportedModel ?? config.model ?? "Unknown",
    // A configured model is useful operational metadata but cannot certify a
    // parser. The compatibility runner requires this to be vendor-system.
    modelSource: reportedModel ? "vendor-system" : "configured",
    serialNumber: tag(xml, "serialNumber") ?? "",
    firmwareVersion: tag(xml, "firmwareVersion") ?? "", uptimeSeconds: number(tag(xml, "upTime")),
    totalCameras: total, connectedCameras: connected, protocol: "hikvision-isapi",
    recordingStatus: recordingStatus.status,
    recordingChannels: recordingStatus.recordingChannels,
    recordingStatusSource: recordingStatus.source,
  }, parseHikvisionDisks(storageXml), recordingStatus.reasonCodes, archiveEvidence);
}

async function getHikvisionRecordingStatus(base: string, credentials: { username: string; password: string } | undefined, timeout: number, trackIds: string[]): Promise<RecordingProbe> {
  try {
    const response = await authenticatedFetch(`${base}/ISAPI/ContentMgmt/search`, {
      method: "POST",
      headers: { "content-type": "application/xml" },
      body: hikvisionArchiveSearchBody(trackIds),
    }, credentials, timeout);
    if (!response.ok) return recordingUnavailable("hikvision_recording_search_unavailable");
    return parseHikvisionArchiveSearch(await response.text());
  } catch {
    return recordingUnavailable("hikvision_recording_search_failed");
  }
}

async function probeDahuaFamily(config: RecorderConfig, base: string, credentials: { username: string; password: string } | undefined, timeout: number, started: number, includeArchive: boolean) {
  const system = await authenticatedFetch(`${base}${config.systemPath ?? "/cgi-bin/magicBox.cgi?action=getSystemInfo"}`, { method: "GET" }, credentials, timeout);
  if (system.status === 401 || system.status === 403) return result(config, true, "degraded", started, {}, [], ["recorder_credentials_rejected"]);
  if (!system.ok) throw new Error(`${config.vendor}_http_${system.status}`);
  const text = await system.text();
  const storage = await authenticatedFetch(`${base}${config.storagePath ?? "/cgi-bin/storageDevice.cgi?action=getDeviceAllInfo"}`, { method: "GET" }, credentials, timeout).catch(() => null);
  const storageText = storage?.ok ? await storage.text() : "";
  const channelResponse = await authenticatedFetch(`${base}/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle`, { method: "GET" }, credentials, timeout).catch(() => null);
  const channelText = channelResponse?.ok ? await channelResponse.text() : "";
  const channelIds = new Set([...channelText.matchAll(/ChannelTitle\[(\d+)\]/g)].map((match) => match[1]));

  // Query the archive for newly created media. Record.Enable is a schedule setting,
  // so treating it as current recording state produced false positives.
  const recordingStatus = await getDahuaRecordingStatus(base, credentials, timeout);
  const archiveEvidence = includeArchive
    ? await scanDahuaArchive(config, base, credentials, timeout)
    : [];

  // Different Dahua-family firmware exposes the SKU under different keys.
  // Prefer an explicit model over a generic device type when both are present.
  const reportedModel = firstKey(text, ["model", "modelName", "productName", "deviceType"]);
  return result(config, true, "online", started, {
    model: reportedModel ?? config.model ?? "Unknown",
    modelSource: reportedModel ? "vendor-system" : "configured",
    serialNumber: key(text, "serialNumber") ?? "",
    firmwareVersion: firstKey(text, ["softwareVersion", "firmwareVersion", "version"]) ?? "",
    totalCameras: channelIds.size || null, connectedCameras: null,
    protocol: config.vendor === "cp-plus" ? "cp-plus-oem-api" : "dahua-cgi",
    recordingStatus: recordingStatus.status,
    recordingChannels: recordingStatus.recordingChannels,
    recordingStatusSource: recordingStatus.source,
  }, parseCgiDisks(storageText), recordingStatus.reasonCodes, archiveEvidence);
}

async function getDahuaRecordingStatus(base: string, credentials: { username: string; password: string } | undefined, timeout: number): Promise<RecordingProbe> {
  let object: string | undefined;
  try {
    const factory = await authenticatedFetch(`${base}/cgi-bin/mediaFileFind.cgi?action=factory.create`, { method: "GET" }, credentials, timeout);
    if (!factory.ok) return recordingUnavailable("dahua_archive_search_unavailable");
    object = key(await factory.text(), "object");
    if (!object) return recordingUnavailable("dahua_archive_search_handle_missing");

    const now = new Date();
    const query = new URLSearchParams({
      action: "findFile", object,
      "condition.StartTime": dahuaTime(new Date(now.getTime() - RECORDING_EVIDENCE_WINDOW_MS)),
      "condition.EndTime": dahuaTime(now),
      "condition.Types[0]": "dav",
    });
    const find = await authenticatedFetch(`${base}/cgi-bin/mediaFileFind.cgi?${query}`, { method: "GET" }, credentials, timeout);
    if (!find.ok) return recordingUnavailable("dahua_archive_search_failed");

    const next = await authenticatedFetch(`${base}/cgi-bin/mediaFileFind.cgi?${new URLSearchParams({ action: "findNextFile", object, count: "128" })}`, { method: "GET" }, credentials, timeout);
    if (!next.ok) return recordingUnavailable("dahua_archive_results_unavailable");
    return parseDahuaArchiveResults(await next.text());
  } catch {
    return recordingUnavailable("dahua_archive_search_failed");
  } finally {
    if (object) {
      await authenticatedFetch(`${base}/cgi-bin/mediaFileFind.cgi?${new URLSearchParams({ action: "close", object })}`, { method: "GET" }, credentials, timeout).catch(() => undefined);
    }
  }
}

/**
 * Reads the recorder's native archive rather than the platform recording index.
 * A result is usable only when every page inside the configured lookback window
 * was read; an incomplete result is deliberately reported as unavailable.
 */
async function scanHikvisionArchive(config: RecorderConfig, base: string, credentials: { username: string; password: string } | undefined, timeout: number) {
  const retention = config.archiveRetention;
  if (!retention) return [];
  const searchStartedAt = new Date();
  const searchFrom = new Date(searchStartedAt.getTime() - retention.lookbackDays * 86_400_000);
  return mapArchiveChannels(retention.channels, async (mapping) => {
    try {
      const result = await searchHikvisionArchive(base, credentials, timeout, 100 + mapping.channel, searchFrom, searchStartedAt, retention.maxResults);
      return archiveEvidenceFromSearch(mapping, result, retention, searchFrom, searchStartedAt);
    } catch {
      return unavailableArchiveEvidence(mapping, retention, searchFrom, searchStartedAt, "hikvision_archive_retention_search_failed");
    }
  });
}

async function searchHikvisionArchive(base: string, credentials: { username: string; password: string } | undefined, timeout: number, trackId: number, from: Date, to: Date, maxResults: number): Promise<ArchiveSearchResult> {
  const pageSize = Math.min(1_000, maxResults);
  const segments: ArchiveSegment[] = [];
  for (let position = 0; segments.length < maxResults; position += pageSize) {
    const response = await authenticatedFetch(`${base}/ISAPI/ContentMgmt/search`, {
      method: "POST",
      headers: { "content-type": "application/xml" },
      body: hikvisionArchiveSearchBody([String(trackId)], from, to, pageSize, position),
    }, credentials, timeout);
    if (!response.ok) throw new Error(`hikvision_archive_${response.status}`);
    const xml = await response.text();
    const page = parseHikvisionArchiveSegments(xml);
    if (page.length === 0) return { segments, coverageComplete: true, reasonCodes: [] };
    segments.push(...page);
    const declared = firstFinite(valuesForTag(xml, "numOfMatches").concat(valuesForTag(xml, "totalMatches")).map(Number));
    if ((declared !== null && segments.length >= declared) || page.length < pageSize) {
      return { segments, coverageComplete: true, reasonCodes: [] };
    }
  }
  return { segments, coverageComplete: false, reasonCodes: ["hikvision_archive_retention_result_limit"] };
}

async function scanDahuaArchive(config: RecorderConfig, base: string, credentials: { username: string; password: string } | undefined, timeout: number) {
  const retention = config.archiveRetention;
  if (!retention) return [];
  const searchStartedAt = new Date();
  const searchFrom = new Date(searchStartedAt.getTime() - retention.lookbackDays * 86_400_000);
  return mapArchiveChannels(retention.channels, async (mapping) => {
    try {
      const result = await searchDahuaArchive(base, credentials, timeout, mapping.channel, searchFrom, searchStartedAt, retention.maxResults);
      return archiveEvidenceFromSearch(mapping, result, retention, searchFrom, searchStartedAt);
    } catch {
      return unavailableArchiveEvidence(mapping, retention, searchFrom, searchStartedAt, "dahua_archive_retention_search_failed");
    }
  });
}

async function searchDahuaArchive(base: string, credentials: { username: string; password: string } | undefined, timeout: number, channel: number, from: Date, to: Date, maxResults: number): Promise<ArchiveSearchResult> {
  let object: string | undefined;
  const segments: ArchiveSegment[] = [];
  try {
    const factory = await authenticatedFetch(`${base}/cgi-bin/mediaFileFind.cgi?action=factory.create`, { method: "GET" }, credentials, timeout);
    if (!factory.ok) throw new Error(`dahua_archive_factory_${factory.status}`);
    object = key(await factory.text(), "object");
    if (!object) throw new Error("dahua_archive_handle_missing");
    const query = new URLSearchParams({
      action: "findFile", object,
      "condition.Channel": String(channel),
      "condition.StartTime": dahuaTime(from),
      "condition.EndTime": dahuaTime(to),
      "condition.Types[0]": "dav",
    });
    const find = await authenticatedFetch(`${base}/cgi-bin/mediaFileFind.cgi?${query}`, { method: "GET" }, credentials, timeout);
    if (!find.ok) throw new Error(`dahua_archive_find_${find.status}`);

    const pageSize = Math.min(1_000, maxResults);
    while (segments.length < maxResults) {
      const next = await authenticatedFetch(`${base}/cgi-bin/mediaFileFind.cgi?${new URLSearchParams({ action: "findNextFile", object, count: String(pageSize) })}`, { method: "GET" }, credentials, timeout);
      if (!next.ok) throw new Error(`dahua_archive_next_${next.status}`);
      const text = await next.text();
      const found = key(text, "found")?.toLowerCase();
      const page = parseDahuaArchiveSegments(text);
      if (found !== "1" && found !== "true") return { segments, coverageComplete: true, reasonCodes: [] };
      if (page.length === 0) return { segments, coverageComplete: false, reasonCodes: ["dahua_archive_retention_unparseable"] };
      segments.push(...page);
    }
    return { segments, coverageComplete: false, reasonCodes: ["dahua_archive_retention_result_limit"] };
  } finally {
    if (object) {
      await authenticatedFetch(`${base}/cgi-bin/mediaFileFind.cgi?${new URLSearchParams({ action: "close", object })}`, { method: "GET" }, credentials, timeout).catch(() => undefined);
    }
  }
}

function archiveEvidenceFromSearch(mapping: { cameraId: string; channel: number }, result: ArchiveSearchResult, retention: NonNullable<RecorderConfig["archiveRetention"]>, searchFrom: Date, searchTo: Date): ArchiveRetentionEvidence {
  if (!result.coverageComplete) {
    return {
      cameraId: mapping.cameraId, sourceChannel: mapping.channel, status: "unavailable",
      oldestContinuousAt: null, newestPlayableAt: null, retentionLowerBound: false,
      coverageComplete: false, continuityGapSeconds: retention.continuityGapSeconds,
      searchStartedAt: searchTo.toISOString(), reasonCodes: result.reasonCodes,
    };
  }
  if (result.segments.length === 0) {
    return {
      cameraId: mapping.cameraId, sourceChannel: mapping.channel, status: "empty",
      oldestContinuousAt: null, newestPlayableAt: null, retentionLowerBound: false,
      coverageComplete: true, continuityGapSeconds: retention.continuityGapSeconds,
      searchStartedAt: searchTo.toISOString(), reasonCodes: ["recorder_archive_empty"],
    };
  }
  const continuous = continuousArchiveWindow(result.segments, retention.continuityGapSeconds);
  return {
    cameraId: mapping.cameraId, sourceChannel: mapping.channel, status: "available",
    oldestContinuousAt: new Date(continuous.oldest).toISOString(), newestPlayableAt: new Date(continuous.newest).toISOString(),
    retentionLowerBound: continuous.oldest <= searchFrom.getTime() + Math.max(1_000, retention.continuityGapSeconds * 1_000),
    coverageComplete: true, continuityGapSeconds: retention.continuityGapSeconds,
    searchStartedAt: searchTo.toISOString(), reasonCodes: [],
  };
}

function unavailableArchiveEvidence(mapping: { cameraId: string; channel: number }, retention: NonNullable<RecorderConfig["archiveRetention"]>, searchFrom: Date, searchTo: Date, reasonCode: string): ArchiveRetentionEvidence {
  return {
    cameraId: mapping.cameraId, sourceChannel: mapping.channel, status: "unavailable",
    oldestContinuousAt: null, newestPlayableAt: null, retentionLowerBound: false,
    coverageComplete: false, continuityGapSeconds: retention.continuityGapSeconds,
    searchStartedAt: searchTo.toISOString(), reasonCodes: [reasonCode],
  };
}

function unsupportedArchiveEvidence(config: RecorderConfig, reasonCode: string) {
  const retention = config.archiveRetention;
  if (!retention) return [];
  const now = new Date();
  const searchFrom = new Date(now.getTime() - retention.lookbackDays * 86_400_000);
  return retention.channels.map((mapping) => unavailableArchiveEvidence(mapping, retention, searchFrom, now, reasonCode));
}

function continuousArchiveWindow(segments: ArchiveSegment[], gapSeconds: number) {
  const ordered = segments
    .filter((segment) => Number.isFinite(segment.startedAt) && Number.isFinite(segment.endedAt) && segment.endedAt >= segment.startedAt)
    .sort((left, right) => right.endedAt - left.endedAt);
  const newest = ordered[0]!.endedAt;
  let oldest = ordered[0]!.startedAt;
  let cursor = oldest;
  for (const segment of ordered.slice(1)) {
    if (cursor - segment.endedAt > gapSeconds * 1_000) break;
    oldest = Math.min(oldest, segment.startedAt);
    cursor = oldest;
  }
  return { oldest, newest };
}

async function mapArchiveChannels<T>(channels: Array<{ cameraId: string; channel: number }>, mapper: (channel: { cameraId: string; channel: number }) => Promise<T>): Promise<T[]> {
  const results: T[] = [];
  const pending = [...channels];
  const workers = Array.from({ length: Math.min(4, channels.length) }, async () => {
    while (pending.length) {
      const channel = pending.shift();
      if (channel) results.push(await mapper(channel));
    }
  });
  await Promise.all(workers);
  return results;
}

function parseHikvisionArchiveSegments(xml: string): ArchiveSegment[] {
  const items = [...xml.matchAll(/<(?:[^:>]+:)?(?:searchMatchItem|matchItem)\b[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?(?:searchMatchItem|matchItem)>/gi)];
  return items.flatMap((item) => {
    const startedAt = Date.parse(valuesForTag(item[1]!, "startTime")[0] ?? "");
    const endedAt = Date.parse(valuesForTag(item[1]!, "endTime")[0] ?? "");
    return Number.isFinite(startedAt) && Number.isFinite(endedAt) ? [{ startedAt, endedAt }] : [];
  });
}

function parseDahuaArchiveSegments(text: string): ArchiveSegment[] {
  const grouped = new Map<string, { startedAt?: string; endedAt?: string }>();
  for (const match of text.matchAll(/(?:items|item)\[(\d+)\]\.(StartTime|EndTime)=([^\r\n]+)/gi)) {
    const item = grouped.get(match[1]!) ?? {};
    if (match[2]!.toLowerCase() === "starttime") item.startedAt = match[3]!.trim();
    else item.endedAt = match[3]!.trim();
    grouped.set(match[1]!, item);
  }
  return [...grouped.values()].flatMap((item) => {
    const startedAt = parseDahuaTimestamp(item.startedAt);
    const endedAt = parseDahuaTimestamp(item.endedAt);
    return startedAt !== null && endedAt !== null ? [{ startedAt, endedAt }] : [];
  });
}

function parseDahuaTimestamp(value: string | undefined) {
  const parsed = value ? Date.parse(value.replace(" ", "T")) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function firstFinite(values: number[]) {
  return values.find((value) => Number.isFinite(value)) ?? null;
}

async function probeOnvif(config: RecorderConfig, base: string, credentials: { username: string; password: string } | undefined, timeout: number, started: number, includeArchive: boolean) {
  const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><GetDeviceInformation xmlns="http://www.onvif.org/ver10/device/wsdl"/></s:Body></s:Envelope>`;
  const response = await authenticatedFetch(`${base}${config.systemPath ?? "/onvif/device_service"}`, { method: "POST", headers: { "content-type": "application/soap+xml" }, body }, credentials, timeout);
  if (response.status === 401 || response.status === 403) return result(config, true, "degraded", started, {}, [], ["recorder_credentials_rejected"]);
  if (!response.ok) throw new Error(`onvif_http_${response.status}`);
  const xml = await response.text();

  // The ONVIF Search service's recent DataUntil is portable evidence that media
  // is arriving. Recording Control's GetRecordings only lists configuration.
  const recordingStatus = await getOnvifRecordingStatus(base, config.systemPath ?? "/onvif/device_service", credentials, timeout);
  const archiveEvidence = includeArchive ? unsupportedArchiveEvidence(config, "onvif_archive_continuity_unsupported") : [];

  const reportedModel = tag(xml, "Model");
  return result(config, true, "online", started, {
    model: reportedModel ?? config.model ?? "Unknown",
    modelSource: reportedModel ? "vendor-system" : "configured",
    serialNumber: tag(xml, "SerialNumber") ?? "",
    firmwareVersion: tag(xml, "FirmwareVersion") ?? "", protocol: "onvif",
    recordingStatus: recordingStatus.status,
    recordingChannels: recordingStatus.recordingChannels,
    recordingStatusSource: recordingStatus.source,
    totalCameras: null, connectedCameras: null,
  }, [], recordingStatus.reasonCodes, archiveEvidence);
}

async function getOnvifRecordingStatus(base: string, deviceServicePath: string, credentials: { username: string; password: string } | undefined, timeout: number): Promise<RecordingProbe> {
  try {
    const searchEndpoint = await getOnvifSearchEndpoint(base, deviceServicePath, credentials, timeout);
    const summary = await onvifRecordingSummary(searchEndpoint ? [searchEndpoint] : onvifSearchFallbackEndpoints(base), credentials, timeout);
    if (!summary) return recordingUnavailable("onvif_recording_search_unavailable");
    if (hasRecentOnvifRecordingData(summary)) return { status: "recording", recordingChannels: null, reasonCodes: [], source: "recording-summary" };
    // No recent data found; return 'stopped' with a clear reason instead of 'unknown'.
    return { status: "stopped", recordingChannels: null, reasonCodes: ["onvif_no_recent_recording_evidence"], source: "recording-summary" };
  } catch {
    return recordingUnavailable("onvif_recording_probe_failed");
  }
}

function recordingUnavailable(reasonCode: string): RecordingProbe {
  return { status: "unknown", recordingChannels: null, reasonCodes: [reasonCode], source: "unavailable" };
}

function hikvisionArchiveSearchBody(trackIds: string[], start = new Date(Date.now() - RECORDING_EVIDENCE_WINDOW_MS), end = new Date(), maxResults = 128, searchResultPosition = 0) {
  const tracks = (trackIds.length ? trackIds : ["101"]).map((id) => `<trackID>${id}</trackID>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><CMSearchDescription version="1.0" xmlns="http://www.isapi.org/ver20/XMLSchema"><searchID>sentinel-recorder-health</searchID><trackList>${tracks}</trackList><timeSpanList><timeSpan><startTime>${start.toISOString()}</startTime><endTime>${end.toISOString()}</endTime></timeSpan></timeSpanList><maxResults>${maxResults}</maxResults><searchResultPosition>${searchResultPosition}</searchResultPosition></CMSearchDescription>`;
}

function parseHikvisionArchiveSearch(xml: string): RecordingProbe {
  const matches = xml.match(/<(?:[^:>]+:)?searchMatchItem\b/gi) ?? [];
  // Zero matches may indicate scheduled downtime, not necessarily a failure.
  // Return 'stopped' with clear reason instead of 'unknown' to avoid ambiguity.
  if (!matches.length) {
    return { status: "stopped", recordingChannels: null, reasonCodes: ["hikvision_no_recent_recording_evidence"], source: "recent-media-search" };
  }
  const channels = new Set(valuesForTag(xml, "trackID").concat(valuesForTag(xml, "channelID")));
  return { status: "recording", recordingChannels: channels.size || null, reasonCodes: [], source: "recent-media-search" };
}

function parseDahuaArchiveResults(text: string): RecordingProbe {
  const found = key(text, "found");
  // Return 'stopped' instead of 'unknown' when no media exists, but search succeeded.
  if (found !== "1" && found?.toLowerCase() !== "true") {
    return { status: "stopped", recordingChannels: null, reasonCodes: ["dahua_no_recent_recording_evidence"], source: "recent-media-search" };
  }
  const channels = new Set([...text.matchAll(/(?:items|item)\[\d+\]\.Channel=(\d+)/gi)].map((match) => match[1]!));
  return { status: "recording", recordingChannels: channels.size || null, reasonCodes: [], source: "recent-media-search" };
}

function dahuaTime(value: Date) { return value.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, ""); }

async function getOnvifSearchEndpoint(base: string, deviceServicePath: string, credentials: { username: string; password: string } | undefined, timeout: number) {
  try {
    const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><GetCapabilities xmlns="http://www.onvif.org/ver10/device/wsdl"><Category>All</Category></GetCapabilities></s:Body></s:Envelope>`;
    const response = await authenticatedFetch(`${base}${deviceServicePath}`, { method: "POST", headers: { "content-type": "application/soap+xml" }, body }, credentials, timeout);
    if (!response.ok) return null;
    const search = (await response.text()).match(/<(?:[^:>]+:)?Search\b[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?Search>/i)?.[1];
    const xAddr = search ? tag(search, "XAddr") : undefined;
    return xAddr && /^https?:\/\//i.test(xAddr) ? xAddr : null;
  } catch {
    return null;
  }
}

function onvifSearchFallbackEndpoints(base: string) {
  return [`${base}/onvif/search_service`, `${base}/onvif/recording_search_service`, `${base}/onvif/Search`];
}

async function onvifRecordingSummary(endpoints: string[], credentials: { username: string; password: string } | undefined, timeout: number) {
  const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><GetRecordingSummary xmlns="http://www.onvif.org/ver10/search/wsdl"/></s:Body></s:Envelope>`;
  for (const endpoint of endpoints) {
    try {
      const response = await authenticatedFetch(endpoint, { method: "POST", headers: { "content-type": "application/soap+xml" }, body }, credentials, timeout);
      if (response.ok) return response.text();
    } catch {
      // Another advertised/fallback Search endpoint may still be usable.
    }
  }
  return null;
}

function hasRecentOnvifRecordingData(xml: string) {
  const numberRecordings = Number(valuesForTag(xml, "NumberRecordings")[0] ?? "");
  if (Number.isFinite(numberRecordings) && numberRecordings === 0) return false;
  const dataUntil = valuesForTag(xml, "DataUntil").map((value) => Date.parse(value)).filter(Number.isFinite);
  // If DataUntil exists but is older than the evidence window, recording is likely stopped.
  // Return true only when recent data exists within the last 5 minutes.
  return dataUntil.some((value) => value >= Date.now() - RECORDING_EVIDENCE_WINDOW_MS);
}

function valuesForTag(xml: string, name: string) {
  return [...xml.matchAll(new RegExp(`<(?:(?:[^:>]+):)?${name}>([^<]+)<\\/(?:(?:[^:>]+):)?${name}>`, "gi"))].map((match) => match[1]!.trim());
}

function hikvisionTrackIds(channelXml: string) {
  const channelIds = valuesForTag(channelXml, "id").map(Number).filter((id) => Number.isInteger(id) && id > 0);
  return channelIds.map((id) => String(100 + id));
}

function result(config: RecorderConfig, reachable: boolean, status: string, started: number, extra: Record<string, string | number | boolean | null>, hddStatus: Array<Record<string, unknown>>, reasonCodes: string[], archiveEvidence: ArchiveRetentionEvidence[] = []): RecorderProbeResult {
  return { metrics: { name: config.name, deviceType: config.deviceType, vendor: config.vendor, model: config.model ?? "Unknown", modelSource: "configured", ipAddress: config.host, reachable, status, latencyMs: Math.round((performance.now() - started) * 100) / 100, ...extra }, hddStatus, reasonCodes, archiveEvidence };
}
function parseHikvisionDisks(xml: string) { return [...xml.matchAll(/<hdd>([\s\S]*?)<\/hdd>/gi)].map((match, index) => ({ diskNo: tag(match[1]!, "id") ?? index + 1, devicePath: tag(match[1]!, "name") ?? `HDD ${index + 1}`, capacity: tag(match[1]!, "capacity"), freeSpace: tag(match[1]!, "freeSpace"), state: tag(match[1]!, "status"), temperature: tag(match[1]!, "temperature") })); }
function parseCgiDisks(text: string) { const grouped = new Map<string, Record<string, unknown>>(); for (const line of text.split(/\r?\n/)) { const match = line.match(/(?:Storage|Disk|HDD)(?:\[|\.)(\d+)\]?\.([^=]+)=(.*)$/i); if (!match) continue; const item = grouped.get(match[1]!) ?? { diskNo: Number(match[1]) + 1 }; item[match[2]!] = match[3]!.trim(); grouped.set(match[1]!, item); } return [...grouped.values()]; }
function tag(xml: string, name: string) { return xml.match(new RegExp(`<(?:[^:>]+:)?${name}>([^<]+)<\\/(?:[^:>]+:)?${name}>`, "i"))?.[1]; }
function key(text: string, name: string) { return text.match(new RegExp(`(?:^|\\n)${name}=([^\\r\\n]+)`, "i"))?.[1]?.trim(); }
function firstKey(text: string, names: string[]) { return names.map((name) => key(text, name)).find((value): value is string => Boolean(value)); }
function number(value: string | undefined) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function classifyError(error: unknown) { const message = error instanceof Error ? error.message : String(error); return /timeout|abort/i.test(message) ? "recorder_probe_timeout" : "recorder_unreachable"; }
