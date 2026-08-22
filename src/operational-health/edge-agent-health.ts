import type { OperationalHealthPolicy, TelemetryValue } from "./types.js";

/** Normalizes measured edge-resource use into the same health status model as
 * recorder, network, and storage telemetry. Missing metrics remain explicit. */
export function normalizeEdgeAgentMetrics(metrics: Record<string, TelemetryValue>, policy: OperationalHealthPolicy) {
  const values = [
    numberMetric(metrics, "cpuUsedPercent"),
    numberMetric(metrics, "memoryUsedPercent"),
    numberMetric(metrics, "diskUsedPercent"),
  ].filter((value): value is number => value !== null);
  const reasons: string[] = [];
  const reportedOffline = metrics.status === "offline" || metrics.status === "failed";
  let status = reportedOffline ? "offline" : "online";
  if (reportedOffline) reasons.push("edge_agent_unreachable");
  if (values.some((value) => value >= policy.edgeAgentCriticalPercent)) {
    status = "degraded";
    reasons.push("edge_agent_resource_critical");
  } else if (values.some((value) => value >= policy.edgeAgentWarningPercent)) {
    status = "degraded";
    reasons.push("edge_agent_resource_high");
  }
  if (numberMetric(metrics, "cpuUsedPercent") === null) reasons.push("cpu_utilization_unavailable");
  if (numberMetric(metrics, "memoryUsedPercent") === null) reasons.push("memory_utilization_unavailable");
  if (numberMetric(metrics, "diskUsedPercent") === null) reasons.push("disk_utilization_unavailable");
  return { metrics: { ...metrics, status }, reasonCodes: reasons.length ? reasons : ["edge_agent_healthy"] };
}

function numberMetric(metrics: Record<string, TelemetryValue>, name: string) {
  const value = metrics[name];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
