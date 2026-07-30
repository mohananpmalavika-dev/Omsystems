import type { RecorderProbeResult } from "../../edge-agent/src/monitoring/recorder-probe.js";

export type RecorderVendor = "hikvision" | "dahua" | "cp-plus" | "onvif";

/**
 * The deployment contract is deliberately exact. A vendor family or a similar
 * SKU is not sufficient evidence that a parser is safe to enable in production.
 */
export interface RecorderCompatibilityTarget {
  id: string;
  name: string;
  vendor: RecorderVendor;
  model: string;
  expectedFirmware: string;
  expectedDisks: number;
  expectedChannels: number;
}

export interface CompatibilityCheck {
  name: "configuration" | "reachability" | "model" | "firmware" | "disk_inventory" | "disk_fields" | "recording_evidence" | "channel_inventory" | "channel_connectivity" | "last_recorded_media";
  passed: boolean;
  details: string;
}

const PLACEHOLDER = /(?:your[_ -]?(?:password|firmware)|replace|example|todo|tbd|unknown|^v?\d+\.x$)/i;

export function verifyRecorderCompatibility(
  target: RecorderCompatibilityTarget,
  probe: RecorderProbeResult,
): CompatibilityCheck[] {
  const checks: CompatibilityCheck[] = [];
  const configuredModel = typeof target.model === "string" ? target.model.trim() : "";
  const configuredFirmware = typeof target.expectedFirmware === "string" ? target.expectedFirmware.trim() : "";
  const expectedDisks = Number.isInteger(target.expectedDisks) ? target.expectedDisks : 0;
  const expectedChannels = Number.isInteger(target.expectedChannels) ? target.expectedChannels : 0;
  const channelHealth = probe.channelHealth ?? [];
  const model = stringMetric(probe, "model");
  const firmware = stringMetric(probe, "firmwareVersion");
  const modelSource = stringMetric(probe, "modelSource");

  checks.push({
    name: "configuration",
    passed: Boolean(configuredModel) && Boolean(configuredFirmware)
      && expectedDisks > 0 && expectedChannels > 0
      && !PLACEHOLDER.test(configuredModel)
      && !PLACEHOLDER.test(configuredFirmware),
    details: "model, exact firmware, expected disk count, and expected channel count must be configured without placeholders",
  });
  checks.push({
    name: "reachability",
    passed: probe.metrics.reachable === true && probe.metrics.status !== "degraded",
    details: probe.metrics.reachable === true
      ? `recorder status: ${String(probe.metrics.status)}`
      : "recorder did not return a successful authenticated system response",
  });
  checks.push({
    name: "model",
    passed: modelSource === "vendor-system" && sameIdentifier(model, configuredModel),
    details: modelSource !== "vendor-system"
      ? "recorder did not report its model from the vendor system endpoint"
      : `expected ${configuredModel}; observed ${model || "unavailable"}`,
  });
  checks.push({
    name: "firmware",
    passed: sameIdentifier(firmware, configuredFirmware),
    details: `expected ${configuredFirmware}; observed ${firmware || "unavailable"}`,
  });
  checks.push({
    name: "disk_inventory",
    passed: probe.hddStatus.length === expectedDisks,
    details: `expected ${expectedDisks} disk(s); observed ${probe.hddStatus.length}`,
  });
  checks.push({
    name: "disk_fields",
    passed: probe.hddStatus.length > 0 && probe.hddStatus.every(hasIdentityAndState),
    details: probe.hddStatus.length === 0
      ? "storage endpoint returned no disks"
      : "each disk must include an identifier and a vendor-reported state",
  });
  const recordingStatus = stringMetric(probe, "recordingStatus");
  const recordingSource = stringMetric(probe, "recordingStatusSource");
  checks.push({
    name: "recording_evidence",
    passed: ["recording", "partial", "stopped"].includes(recordingStatus)
      && recordingSource !== "" && recordingSource !== "unavailable",
    details: `status ${recordingStatus || "unknown"}; evidence source ${recordingSource || "unavailable"}`,
  });
  checks.push({
    name: "channel_inventory",
    passed: probe.metrics.totalCameras === expectedChannels && channelHealth.length === expectedChannels,
    details: `expected ${expectedChannels} channel(s); recorder reported ${String(probe.metrics.totalCameras ?? "unavailable")} and ${channelHealth.length} channel evidence row(s)`,
  });
  const connectedChannels = channelHealth.filter((channel) => channel.connected === true).length;
  checks.push({
    name: "channel_connectivity",
    passed: channelHealth.length === expectedChannels
      && channelHealth.every((channel) => typeof channel.connected === "boolean")
      && probe.metrics.connectedCameras === connectedChannels,
    details: `aggregate connected ${String(probe.metrics.connectedCameras ?? "unavailable")}; channel evidence connected ${connectedChannels}/${channelHealth.length}`,
  });
  const recordingRows = channelHealth.filter((channel) => channel.status === "recording");
  const aggregateLastRecordedAt = stringMetric(probe, "lastRecordedAt");
  checks.push({
    name: "last_recorded_media",
    passed: recordingRows.length > 0
      && validTimestamp(aggregateLastRecordedAt)
      && recordingRows.every((channel) => validTimestamp(channel.lastRecordedAt ?? "")),
    details: recordingRows.length === 0
      ? "no channel returned recent media"
      : `newest aggregate media ${aggregateLastRecordedAt || "unavailable"}; ${recordingRows.length} recording channel timestamp(s) checked`,
  });
  return checks;
}

function stringMetric(probe: RecorderProbeResult, name: string) {
  const value = probe.metrics[name];
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function sameIdentifier(actual: string, expected: string) {
  return normalizeIdentifier(actual) === normalizeIdentifier(expected);
}

function normalizeIdentifier(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function hasIdentityAndState(disk: Record<string, unknown>) {
  const values = new Map(Object.entries(disk).map(([key, value]) => [normalizeKey(key), value]));
  const identity = values.get("diskno") ?? values.get("id") ?? values.get("slot") ?? values.get("name");
  const state = values.get("state") ?? values.get("status") ?? values.get("health") ?? values.get("smartstatus");
  return isPresent(identity) && isPresent(state);
}

function normalizeKey(value: string) { return value.replace(/[^a-z0-9]/gi, "").toLocaleLowerCase(); }
function isPresent(value: unknown) { return typeof value === "string" ? value.trim().length > 0 : typeof value === "number"; }
function validTimestamp(value: string) { return value.length > 0 && Number.isFinite(Date.parse(value)); }
