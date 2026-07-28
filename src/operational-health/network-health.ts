import type { OperationalHealthPolicy, OperationalTelemetryEnvelope, TelemetryValue } from "./types.js";

export type InternetLinkStatus = "online" | "degraded" | "offline" | "unknown";

export function normalizeNetworkMetrics(
  metrics: Record<string, TelemetryValue>,
  policy: OperationalHealthPolicy,
) {
  const connectivity = booleanMetric(metrics, "connectivity") ?? metrics.status !== "offline";
  const latency = numberMetric(metrics, "latencyMs") ?? numberMetric(metrics, "controlPlaneLatencyMs");
  const jitter = numberMetric(metrics, "jitterMs");
  const packetLoss = numberMetric(metrics, "packetLossPercent");
  const utilization = numberMetric(metrics, "bandwidthUtilizationPercent");
  const reasons: string[] = [];
  let status: InternetLinkStatus = connectivity ? "online" : "offline";
  if (!connectivity) reasons.push("internet_connectivity_lost");
  if (latency !== null && latency >= policy.latencyCriticalMs) { status = "degraded"; reasons.push("internet_latency_critical"); }
  else if (latency !== null && latency >= policy.latencyWarningMs) { status = "degraded"; reasons.push("internet_latency_high"); }
  if (jitter !== null && jitter >= policy.jitterCriticalMs) { status = "degraded"; reasons.push("internet_jitter_critical"); }
  else if (jitter !== null && jitter >= policy.jitterWarningMs) { status = "degraded"; reasons.push("internet_jitter_high"); }
  if (packetLoss !== null && packetLoss >= policy.packetLossCriticalPercent) { status = "degraded"; reasons.push("internet_packet_loss_critical"); }
  else if (packetLoss !== null && packetLoss >= policy.packetLossWarningPercent) { status = "degraded"; reasons.push("internet_packet_loss_high"); }
  if (utilization !== null && utilization >= policy.bandwidthUtilizationCriticalPercent) { status = "degraded"; reasons.push("internet_bandwidth_saturated"); }
  else if (utilization !== null && utilization >= policy.bandwidthUtilizationWarningPercent) { status = "degraded"; reasons.push("internet_bandwidth_high"); }
  if (!connectivity) status = "offline";
  return {
    metrics: { ...metrics, status, connectivity },
    reasonCodes: reasons.length ? reasons : ["internet_link_healthy"],
  };
}

export function projectInternetLink(envelope: OperationalTelemetryEnvelope, branch: { id: string; name: string }) {
  const metric = (name: string) => numberMetric(envelope.metrics, name);
  return {
    id: envelope.deviceId,
    branchId: branch.id, branchName: branch.name, branchCode: branch.id.slice(0, 8),
    linkId: stringMetric(envelope.metrics, "linkId") || envelope.deviceId,
    role: stringMetric(envelope.metrics, "role") === "backup" ? "backup" as const : "primary" as const,
    ispName: stringMetric(envelope.metrics, "ispName") || "Unconfigured ISP",
    interfaceName: stringMetric(envelope.metrics, "interfaceName") || null,
    status: linkStatus(envelope.metrics.status),
    active: booleanMetric(envelope.metrics, "active") ?? true,
    connectivity: booleanMetric(envelope.metrics, "connectivity") ?? false,
    latencyMs: metric("latencyMs") ?? metric("controlPlaneLatencyMs"),
    jitterMs: metric("jitterMs"), packetLossPercent: metric("packetLossPercent"),
    rxMbps: metric("rxMbps"), txMbps: metric("txMbps"),
    bandwidthUtilizationPercent: metric("bandwidthUtilizationPercent"),
    contractedDownMbps: metric("contractedDownMbps"), contractedUpMbps: metric("contractedUpMbps"),
    probeTarget: stringMetric(envelope.metrics, "probeTarget") || null,
    publicIp: stringMetric(envelope.metrics, "publicIp") || null,
    lastCheck: envelope.observedAt, reasonCodes: envelope.reasonCodes,
  };
}

export function summarizeBranchInternet(links: ReturnType<typeof projectInternetLink>[]) {
  const primary = links.find((link) => link.role === "primary");
  const backup = links.find((link) => link.role === "backup");
  const active = links.find((link) => link.active && link.connectivity) ?? links.find((link) => link.connectivity);
  const allOffline = links.length > 0 && links.every((link) => !link.connectivity || link.status === "offline");
  const status = links.length === 0 ? "unknown" as const : allOffline ? "offline" as const
    : active?.status === "degraded" ? "degraded" as const
      : primary && !primary.connectivity && backup?.connectivity ? "failover" as const
        : backup && !backup.connectivity ? "degraded" as const : "online" as const;
  return { status, primary, backup, activeLinkId: active?.linkId ?? null, failoverActive: status === "failover", links };
}

function numberMetric(metrics: Record<string, TelemetryValue>, name: string) {
  const value = metrics[name]; return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function stringMetric(metrics: Record<string, TelemetryValue>, name: string) {
  const value = metrics[name]; return typeof value === "string" ? value : "";
}
function booleanMetric(metrics: Record<string, TelemetryValue>, name: string) {
  const value = metrics[name]; return typeof value === "boolean" ? value : null;
}
function linkStatus(value: TelemetryValue | undefined): InternetLinkStatus {
  return value === "online" || value === "degraded" || value === "offline" ? value : "unknown";
}
