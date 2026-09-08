import type { OperationalHealthPolicy, OperationalTelemetryEnvelope, TelemetryValue } from "./types.js";

export type InternetLinkStatus = "online" | "degraded" | "offline" | "unknown";

export function normalizeNetworkMetrics(
  metrics: Record<string, TelemetryValue>,
  policy: OperationalHealthPolicy,
) {
  // A missing reachability result is not evidence that a WAN circuit is up.
  // Edge agents must report an explicit boolean (or a concrete status) before
  // this link can participate in routing and failover decisions.
  const reportedStatus = linkStatus(metrics.status);
  const connectivity = booleanMetric(metrics, "connectivity")
    ?? (reportedStatus === "online" || reportedStatus === "degraded" ? true
      : reportedStatus === "offline" ? false : null);
  const latency = numberMetric(metrics, "latencyMs") ?? numberMetric(metrics, "controlPlaneLatencyMs");
  const jitter = numberMetric(metrics, "jitterMs");
  const packetLoss = numberMetric(metrics, "packetLossPercent");
  const utilization = numberMetric(metrics, "bandwidthUtilizationPercent");
  const routeVerified = booleanMetric(metrics, "routeVerified");
  const reasons: string[] = [];
  let status: InternetLinkStatus = connectivity === true ? "online" : connectivity === false ? "offline" : "unknown";
  if (routeVerified === false) {
    return {
      metrics: { ...metrics, status: "unknown", connectivity },
      reasonCodes: ["internet_route_unverified"],
    };
  }
  if (connectivity === null) reasons.push("internet_connectivity_unreported");
  if (connectivity === false) reasons.push("internet_connectivity_lost");
  if (latency !== null && latency >= policy.latencyCriticalMs) { status = "degraded"; reasons.push("internet_latency_critical"); }
  else if (latency !== null && latency >= policy.latencyWarningMs) { status = "degraded"; reasons.push("internet_latency_high"); }
  if (jitter !== null && jitter >= policy.jitterCriticalMs) { status = "degraded"; reasons.push("internet_jitter_critical"); }
  else if (jitter !== null && jitter >= policy.jitterWarningMs) { status = "degraded"; reasons.push("internet_jitter_high"); }
  if (packetLoss !== null && packetLoss >= policy.packetLossCriticalPercent) { status = "degraded"; reasons.push("internet_packet_loss_critical"); }
  else if (packetLoss !== null && packetLoss >= policy.packetLossWarningPercent) { status = "degraded"; reasons.push("internet_packet_loss_high"); }
  if (utilization !== null && utilization >= policy.bandwidthUtilizationCriticalPercent) { status = "degraded"; reasons.push("internet_bandwidth_saturated"); }
  else if (utilization !== null && utilization >= policy.bandwidthUtilizationWarningPercent) { status = "degraded"; reasons.push("internet_bandwidth_high"); }
  if (booleanMetric(metrics, "gatewayReachable") === false) { status = "degraded"; reasons.push("isp_gateway_unreachable"); }
  if (booleanMetric(metrics, "publicIpChanged") === true) reasons.push("public_ip_changed");
  if (stringMetric(metrics, "lastMileStatus") === "upstream_suspected") reasons.push("last_mile_outage_suspected");
  if (connectivity === false) status = "offline";
  return {
    metrics: { ...metrics, status, connectivity },
    reasonCodes: reasons.length ? reasons : ["internet_link_healthy"],
  };
}

export function projectInternetLink(
  envelope: OperationalTelemetryEnvelope,
  branch: { id: string; name: string },
  policy: Pick<OperationalHealthPolicy, "staleAfterSeconds" | "offlineAfterSeconds">,
  now = Date.now(),
) {
  const metric = (name: string) => numberMetric(envelope.metrics, name);
  const observedAt = Date.parse(envelope.observedAt);
  const ageMs = now - observedAt;
  const stale = !Number.isFinite(observedAt) || ageMs < -60_000 || ageMs > policy.staleAfterSeconds * 1_000;
  const unavailable = envelope.quality === "unsupported" || envelope.quality === "unavailable";
  const reportedStatus = linkStatus(envelope.metrics.status);
  const status = stale || unavailable ? "unknown" as const : reportedStatus;
  return {
    id: envelope.deviceId,
    branchId: branch.id, branchName: branch.name, branchCode: branch.id.slice(0, 8),
    linkId: stringMetric(envelope.metrics, "linkId") || envelope.deviceId,
    role: stringMetric(envelope.metrics, "role") === "backup" ? "backup" as const : "primary" as const,
    ispName: stringMetric(envelope.metrics, "ispName") || "Unconfigured ISP",
    interfaceName: stringMetric(envelope.metrics, "interfaceName") || null,
    status,
    active: booleanMetric(envelope.metrics, "active") ?? true,
    connectivity: !stale && !unavailable && (booleanMetric(envelope.metrics, "connectivity") ?? false),
    latencyMs: metric("latencyMs") ?? metric("controlPlaneLatencyMs"),
    jitterMs: metric("jitterMs"), packetLossPercent: metric("packetLossPercent"),
    instantPacketLossPercent: metric("instantPacketLossPercent"),
    availabilityPercent: metric("availabilityPercent"), probeWindowSeconds: metric("probeWindowSeconds"),
    probeWindowAttempts: metric("probeWindowAttempts"), consecutiveFailedPolls: metric("consecutiveFailedPolls"),
    lastSuccessfulAt: stringMetric(envelope.metrics, "lastSuccessfulAt") || null,
    outageStartedAt: stringMetric(envelope.metrics, "outageStartedAt") || null,
    rxMbps: metric("rxMbps"), txMbps: metric("txMbps"),
    bandwidthUtilizationPercent: metric("bandwidthUtilizationPercent"),
    routeVerified: booleanMetric(envelope.metrics, "routeVerified") !== false,
    probeBinding: stringMetric(envelope.metrics, "probeBinding") || "unknown",
    contractedDownMbps: metric("contractedDownMbps"), contractedUpMbps: metric("contractedUpMbps"),
    probeTarget: stringMetric(envelope.metrics, "probeTarget") || null,
    publicIp: stringMetric(envelope.metrics, "publicIp") || null,
    previousPublicIp: stringMetric(envelope.metrics, "previousPublicIp") || null,
    publicIpChanged: booleanMetric(envelope.metrics, "publicIpChanged") ?? false,
    publicIpChangedAt: stringMetric(envelope.metrics, "publicIpChangedAt") || null,
    gatewayAddress: stringMetric(envelope.metrics, "gatewayAddress") || null,
    gatewayReachable: booleanMetric(envelope.metrics, "gatewayReachable"),
    lastMileStatus: lastMileStatus(envelope.metrics.lastMileStatus),
    lastCheck: envelope.observedAt,
    reasonCodes: [...new Set([...envelope.reasonCodes, ...(stale ? ["internet_telemetry_stale"] : []), ...(unavailable ? ["internet_telemetry_unavailable"] : [])])],
  };
}

export function summarizeBranchInternet(links: ReturnType<typeof projectInternetLink>[]) {
  const primary = links.find((link) => link.role === "primary");
  const backup = links.find((link) => link.role === "backup");
  const verified = links.filter((link) => link.routeVerified);
  const active = verified.find((link) => link.active && link.connectivity && link.status !== "unknown")
    ?? verified.find((link) => link.connectivity && link.status !== "unknown");
  const allOffline = verified.length > 0 && verified.every((link) => link.status === "offline");
  let status: InternetLinkStatus | "failover" = "unknown";
  if (verified.length > 0) {
    if (allOffline) status = "offline";
    else if (primary?.status === "offline" && backup?.connectivity) status = backup.status === "online" ? "failover" : "degraded";
    else if (!active) status = "unknown";
    else if (active.status === "degraded" || primary?.status === "degraded" || backup?.status === "offline" || backup?.status === "unknown") status = "degraded";
    else status = "online";
  }
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
function lastMileStatus(value: TelemetryValue | undefined) {
  return value === "healthy" || value === "gateway_unreachable" || value === "upstream_suspected"
    ? value : "unknown" as const;
}
