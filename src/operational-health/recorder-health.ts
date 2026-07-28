import type { OperationalTelemetryEnvelope, TelemetryValue } from "./types.js";

export function normalizeRecorderMetrics(metrics: Record<string, TelemetryValue>) {
  const reachable = booleanMetric(metrics, "reachable") ?? metrics.status !== "offline";
  const recording = stringMetric(metrics, "recordingStatus");
  const connected = numberMetric(metrics, "connectedCameras");
  const total = numberMetric(metrics, "totalCameras");
  const reasons: string[] = [];
  let status = reachable ? "online" : "offline";
  if (!reachable) reasons.push("recorder_unreachable");
  if (reachable && (recording === "stopped" || recording === "error")) { status = "degraded"; reasons.push("recorder_not_recording"); }
  if (reachable && connected !== null && total !== null && connected < total) { status = "degraded"; reasons.push("recorder_channels_offline"); }
  return { metrics: { ...metrics, status, reachable }, reasonCodes: reasons.length ? reasons : ["recorder_healthy"] };
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
    reachable: booleanMetric(envelope.metrics, "reachable") ?? false,
    latencyMs: numberMetric(envelope.metrics, "latencyMs"), uptimeSeconds: numberMetric(envelope.metrics, "uptimeSeconds"),
    recordingStatus: stringMetric(envelope.metrics, "recordingStatus") || "unknown",
    connectedCameras: numberMetric(envelope.metrics, "connectedCameras"), totalCameras: numberMetric(envelope.metrics, "totalCameras"),
    lastCheck: envelope.observedAt, quality: envelope.quality, reasonCodes: envelope.reasonCodes,
  };
}

function recorderStatus(value: TelemetryValue | undefined) { return value === "online" || value === "offline" || value === "degraded" ? value : "unknown" as const; }
function numberMetric(metrics: Record<string, TelemetryValue>, name: string) { const value = metrics[name]; return typeof value === "number" && Number.isFinite(value) ? value : null; }
function stringMetric(metrics: Record<string, TelemetryValue>, name: string) { const value = metrics[name]; return typeof value === "string" ? value : ""; }
function booleanMetric(metrics: Record<string, TelemetryValue>, name: string) { const value = metrics[name]; return typeof value === "boolean" ? value : null; }
