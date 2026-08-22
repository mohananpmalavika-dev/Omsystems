import type { RecorderConfig, RecorderProbeResult } from "../../edge-agent/src/monitoring/recorder-probe.js";
import { normalizeRecorderHddStatus } from "../../src/operational-health/disk-health.js";

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
  expectedRaidLevel: string;
  requireWriteVerification: boolean;
  expectedRetentionDays: number;
  archiveRetention: NonNullable<RecorderConfig["archiveRetention"]>;
}

export interface CompatibilityCheck {
  name: "configuration" | "reachability" | "model" | "firmware" | "disk_inventory" | "disk_fields" | "disk_slots" | "smart_telemetry" | "capacity" | "raid_health" | "write_verification" | "recording_evidence" | "channel_inventory" | "channel_connectivity" | "last_recorded_media" | "archive_configuration" | "archive_inventory" | "retention_180_days" | "retention_continuity" | "retention_current";
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
  const expectedRaidLevel = typeof target.expectedRaidLevel === "string" ? target.expectedRaidLevel.trim() : "";
  const writeRequirementConfigured = typeof target.requireWriteVerification === "boolean";
  const expectedRetentionDays = Number.isInteger(target.expectedRetentionDays) ? target.expectedRetentionDays : 0;
  const archiveConfig = target.archiveRetention;
  const disks = normalizeRecorderHddStatus(probe.hddStatus);
  const channelHealth = probe.channelHealth ?? [];
  const model = stringMetric(probe, "model");
  const firmware = stringMetric(probe, "firmwareVersion");
  const modelSource = stringMetric(probe, "modelSource");

  checks.push({
    name: "configuration",
    passed: Boolean(configuredModel) && Boolean(configuredFirmware)
      && expectedDisks > 0 && expectedChannels > 0
      && Boolean(expectedRaidLevel) && writeRequirementConfigured
      && expectedRetentionDays >= 180
      && archiveConfig?.lookbackDays >= expectedRetentionDays
      && !PLACEHOLDER.test(configuredModel)
      && !PLACEHOLDER.test(configuredFirmware),
    details: "model, firmware, disk/channel counts, RAID/write policy, and a native archive lookback of at least 180 days must be configured without placeholders",
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
  checks.push({
    name: "disk_slots",
    passed: disks.length === expectedDisks && disks.every((disk) => disk.detected && disk.slotStatus === "present"),
    details: `${disks.filter((disk) => disk.detected && disk.slotStatus === "present").length}/${expectedDisks} expected slot(s) detected and initialized`,
  });
  checks.push({
    name: "smart_telemetry",
    passed: disks.length > 0 && disks.every((disk) => disk.smartAvailable),
    details: `${disks.filter((disk) => disk.smartAvailable).length}/${disks.length} disk(s) expose drive-level SMART evidence`,
  });
  checks.push({
    name: "capacity",
    passed: disks.length > 0 && disks.every((disk) => disk.capacityBytes > 0 && disk.availableBytes >= 0),
    details: `${disks.filter((disk) => disk.capacityBytes > 0).length}/${disks.length} disk(s) report total and available capacity`,
  });
  checks.push({
    name: "raid_health",
    passed: disks.length > 0 && disks.every((disk) => disk.raidStatus !== "unknown"
      && (normalizeIdentifier(expectedRaidLevel) === "not configured" || normalizeIdentifier(expectedRaidLevel) === "not_configured"
        ? disk.raidStatus === "not_configured"
        : sameIdentifier(disk.raidLevel, expectedRaidLevel))),
    details: `expected ${expectedRaidLevel}; observed ${[...new Set(disks.map((disk) => `${disk.raidLevel || "no level"}/${disk.raidStatus}`))].join(", ") || "unavailable"}`,
  });
  checks.push({
    name: "write_verification",
    passed: !target.requireWriteVerification || (disks.length > 0 && disks.every((disk) => disk.writeVerification === "verified")),
    details: target.requireWriteVerification
      ? `${disks.filter((disk) => disk.writeVerification === "verified").length}/${disks.length} disk(s) have an explicit successful write probe`
      : "disk-specific write verification explicitly waived for this target",
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
  const archiveEvidence = probe.archiveEvidence ?? [];
  const mappedCameraIds = new Set((archiveConfig?.channels ?? []).map((channel) => channel.cameraId));
  const mappedChannels = new Set((archiveConfig?.channels ?? []).map((channel) => channel.channel));
  checks.push({
    name: "archive_configuration",
    passed: expectedRetentionDays >= 180
      && archiveConfig?.lookbackDays >= expectedRetentionDays
      && archiveConfig.channels.length === expectedChannels
      && mappedCameraIds.size === expectedChannels
      && mappedChannels.size === expectedChannels,
    details: `required ${expectedRetentionDays || "unconfigured"} days; lookback ${archiveConfig?.lookbackDays ?? "unconfigured"}; mapped ${archiveConfig?.channels.length ?? 0}/${expectedChannels} channel(s)`,
  });
  checks.push({
    name: "archive_inventory",
    passed: archiveEvidence.length === expectedChannels
      && archiveEvidence.every((item) => mappedCameraIds.has(item.cameraId)),
    details: `expected ${expectedChannels} mapped archive result(s); observed ${archiveEvidence.length}`,
  });
  const complete = archiveEvidence.filter((item) => item.status === "available" && item.coverageComplete);
  const retentionPassing = complete.filter((item) => archiveDays(item) + archiveToleranceDays(item) >= expectedRetentionDays);
  checks.push({
    name: "retention_180_days",
    passed: expectedRetentionDays >= 180 && retentionPassing.length === expectedChannels,
    details: `${retentionPassing.length}/${expectedChannels} channel(s) prove at least ${expectedRetentionDays || 180} continuous days`,
  });
  const continuityPassing = complete.filter((item) => (item.gapCount ?? 0) === 0
    && (item.largestGapSeconds ?? 0) <= item.continuityGapSeconds);
  checks.push({
    name: "retention_continuity",
    passed: continuityPassing.length === expectedChannels,
    details: `${continuityPassing.length}/${expectedChannels} channel(s) have a complete scan with no gap above tolerance`,
  });
  const currentPassing = complete.filter((item) => {
    const newest = Date.parse(item.newestPlayableAt ?? "");
    const scannedAt = Date.parse(item.searchStartedAt);
    return Number.isFinite(newest) && Number.isFinite(scannedAt)
      && scannedAt >= newest && scannedAt - newest <= item.continuityGapSeconds * 1_000;
  });
  checks.push({
    name: "retention_current",
    passed: currentPassing.length === expectedChannels,
    details: `${currentPassing.length}/${expectedChannels} channel(s) have playable media current to the configured gap tolerance`,
  });
  return checks;
}

function archiveDays(item: RecorderProbeResult["archiveEvidence"][number]) {
  const oldest = Date.parse(item.oldestContinuousAt ?? "");
  const newest = Date.parse(item.newestPlayableAt ?? "");
  return Number.isFinite(oldest) && Number.isFinite(newest) && newest >= oldest
    ? (newest - oldest) / 86_400_000 : 0;
}

function archiveToleranceDays(item: RecorderProbeResult["archiveEvidence"][number]) {
  return Math.max(1_000, item.continuityGapSeconds * 1_000) / 86_400_000;
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
