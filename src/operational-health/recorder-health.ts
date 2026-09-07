import type { OperationalTelemetryEnvelope, TelemetryValue } from "./types.js";

export function normalizeRecorderMetrics(metrics: Record<string, TelemetryValue>) {
  const reportedStatus = stringMetric(metrics, "status").toLowerCase();
  const reachable = booleanMetric(metrics, "reachable") ?? (reportedStatus === "online" ? true : reportedStatus === "offline" ? false : null);
  const recording = stringMetric(metrics, "recordingStatus").toLowerCase();
  const connected = numberMetric(metrics, "connectedCameras");
  const total = numberMetric(metrics, "totalCameras");
  const reasons: string[] = [];
  let status: "online" | "offline" | "degraded" | "unknown" = reachable === false ? "offline" : reachable === true ? "online" : "unknown";
  if (reachable === false) reasons.push("recorder_unreachable");
  if (reachable === null) reasons.push("recorder_reachability_unverified");
  if (reachable === true && (recording === "stopped" || recording === "error" || recording === "partial")) { status = "degraded"; reasons.push("recorder_not_recording"); }
  if (reachable === true && (!recording || recording === "unknown")) { status = "degraded"; reasons.push("recorder_recording_unverified"); }
  if (reachable === true && connected !== null && total !== null && (connected < total || connected > total)) { status = "degraded"; reasons.push(connected > total ? "recorder_channel_count_invalid" : "recorder_channels_offline"); }
  return { metrics: { ...metrics, status, reachable, recordingStatus: recording || "unknown" }, reasonCodes: reasons.length ? reasons : ["recorder_healthy"] };
}

export function projectRecorderHealth(envelope: OperationalTelemetryEnvelope, branch: { id: string; name: string }) {
  return {
    id: envelope.deviceId, branchId: branch.id, branchName: branch.name, branchCode: branch.id.slice(0, 8),
    name: stringMetric(envelope.metrics, "name") || envelope.deviceId,
    deviceType: stringMetric(envelope.metrics, "deviceType") === "dvr" ? "dvr" as const : "nvr" as const,
    vendor: stringMetric(envelope.metrics, "vendor") || "generic",
    model: stringMetric(envelope.metrics, "model") || "Unknown model",
    serialNumber: stringMetric(envelope.metrics, "serialNumber") || null,
    firmwareVersion: stringMetric(envelope.metrics, "firmwareVersion") || null,
    ipAddress: stringMetric(envelope.metrics, "ipAddress") || null,
    protocol: stringMetric(envelope.metrics, "protocol") || "onvif",
    status: recorderStatus(envelope.metrics.status),
    reachable: booleanMetric(envelope.metrics, "reachable") ?? recorderStatus(envelope.metrics.status) === "online",
    latencyMs: numberMetric(envelope.metrics, "latencyMs"), uptimeSeconds: numberMetric(envelope.metrics, "uptimeSeconds"),
    recordingStatus: stringMetric(envelope.metrics, "recordingStatus") || "unknown",
    recordingChannels: numberMetric(envelope.metrics, "recordingChannels"),
    recordingStatusSource: stringMetric(envelope.metrics, "recordingStatusSource") || "unavailable",
    lastRecordedAt: nullableStringMetric(envelope.metrics, "lastRecordedAt"),
    connectedCameras: numberMetric(envelope.metrics, "connectedCameras"), totalCameras: numberMetric(envelope.metrics, "totalCameras"),
    lastCheck: envelope.observedAt, quality: envelope.quality, reasonCodes: envelope.reasonCodes,
  };
}

export function projectRecorderChannelHealth(envelope: OperationalTelemetryEnvelope) {
  return {
    id: envelope.deviceId,
    recorderId: stringMetric(envelope.metrics, "recorderId"),
    sourceChannel: numberMetric(envelope.metrics, "sourceChannel"),
    status: channelStatus(envelope.metrics.status),
    connected: booleanMetric(envelope.metrics, "connected"),
    lastRecordedAt: nullableStringMetric(envelope.metrics, "lastRecordedAt"),
    recordingStatusSource: stringMetric(envelope.metrics, "recordingStatusSource") || "unavailable",
    observedAt: envelope.observedAt,
    quality: envelope.quality,
    reasonCodes: envelope.reasonCodes,
  };
}

function recorderStatus(value: TelemetryValue | undefined) { return value === "online" || value === "offline" || value === "degraded" ? value : "unknown" as const; }
function channelStatus(value: TelemetryValue | undefined) { return value === "recording" || value === "stopped" ? value : "unknown" as const; }
function numberMetric(metrics: Record<string, TelemetryValue>, name: string) { const value = metrics[name]; return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null; }
function stringMetric(metrics: Record<string, TelemetryValue>, name: string) { const value = metrics[name]; return typeof value === "string" ? value : ""; }
function nullableStringMetric(metrics: Record<string, TelemetryValue>, name: string) { const value = metrics[name]; return typeof value === "string" ? value : null; }
function booleanMetric(metrics: Record<string, TelemetryValue>, name: string) { const value = metrics[name]; return typeof value === "boolean" ? value : null; }
