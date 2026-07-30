import type { ControlPlaneStore } from "../../control-plane-store.js";
import type { OperationalTelemetryEnvelope } from "../../operational-health/types.js";
import type { CommandTimelineEvent } from "./types.js";

export async function buildTimeline(
  store: ControlPlaneStore,
  tenantId: string,
  branchId: string,
  options: { from?: string; to?: string; limit?: number } = {},
): Promise<CommandTimelineEvent[]> {
  const to = options.to ?? new Date().toISOString();
  const from = options.from ?? new Date(Date.parse(to) - 24 * 60 * 60 * 1000).toISOString();
  const limit = options.limit ?? 500;
  const [telemetry, incidents, predictive, workOrders] = await Promise.all([
    store.listOperationalTelemetryHistory(tenantId, branchId, from, to, limit),
    store.listIncidents(tenantId, { branchId, from, to, limit }).catch(() => []),
    store.listPredictiveAlerts(tenantId).catch(() => []),
    store.listWorkOrders(tenantId).catch(() => []),
  ]);
  const events: CommandTimelineEvent[] = telemetry.map(telemetryEvent);
  for (const incident of incidents.filter((item: any) => item.branchId === branchId)) {
    const occurredAt = timestamp(incident.occurredAt, incident.detectedAt, incident.createdAt);
    if (!within(occurredAt, from, to)) continue;
    events.push({
      id: `incident:${incident.id}`,
      occurredAt,
      category: "incident",
      entityId: incident.id,
      entityType: "incident",
      title: incident.title || "Incident reported",
      detail: incident.description || `${incident.incidentType ?? "Operational"} incident`,
      severity: ["critical", "P1"].includes(incident.severity) ? "critical"
        : ["high", "P2"].includes(incident.severity) ? "warning" : "info",
      certainty: "confirmed",
      source: "incident-register",
      evidenceId: `incident:${incident.id}`,
      raw: compact({ incidentId: incident.id, status: incident.status, type: incident.incidentType, severity: incident.severity }),
    });
  }
  for (const alert of predictive.filter((item: any) => item.branchId === branchId || item.details?.branchId === branchId)) {
    const occurredAt = timestamp(alert.detectedAt, alert.createdAt);
    if (!within(occurredAt, from, to)) continue;
    events.push({
      id: `predictive:${alert.id}`,
      occurredAt,
      category: "predictive",
      entityId: alert.assetId ?? null,
      entityType: "asset",
      title: alert.title ?? alert.type ?? alert.alertType ?? "Predictive maintenance alert",
      detail: alert.description ?? `Risk score ${String(alert.score ?? "unavailable")}`,
      severity: Number(alert.score ?? 0) >= 80 ? "critical" : Number(alert.score ?? 0) >= 50 ? "warning" : "info",
      certainty: "confirmed",
      source: "predictive-maintenance",
      evidenceId: `predictive:${alert.id}`,
      raw: compact({ alertId: alert.id, assetId: alert.assetId, score: alert.score, predictedFailureDate: alert.predictedFailureDate }),
    });
  }
  for (const order of workOrders.filter((item) => item.branchNodeId === branchId)) {
    const occurredAt = timestamp(order.updatedAt, order.createdAt);
    if (!within(occurredAt, from, to)) continue;
    events.push({
      id: `work-order:${order.id}`,
      occurredAt,
      category: "maintenance",
      entityId: order.assetId ?? null,
      entityType: "work-order",
      title: `Work order ${order.workOrderNumber} ${order.status.replaceAll("_", " ")}`,
      detail: order.problem,
      severity: order.severity === "critical" ? "critical" : ["high", "medium"].includes(order.severity) ? "warning" : "info",
      certainty: "confirmed",
      source: "maintenance-work-orders",
      evidenceId: `work-order:${order.id}`,
      raw: compact({ workOrderId: order.id, status: order.status, rootCause: order.rootCause, eta: order.eta }),
    });
  }
  return events.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)).slice(-limit);
}

function telemetryEvent(item: OperationalTelemetryEnvelope): CommandTimelineEvent {
  const description = describeTelemetry(item);
  return {
    id: `telemetry:${item.idempotencyKey}`,
    occurredAt: item.observedAt,
    category: "telemetry",
    entityId: item.deviceId,
    entityType: item.deviceType,
    title: description.title,
    detail: description.detail,
    severity: description.severity,
    certainty: "confirmed",
    source: `${item.source}:${item.quality}`,
    evidenceId: `telemetry:${item.idempotencyKey}`,
    raw: {
      deviceType: item.deviceType,
      deviceId: item.deviceId,
      source: item.source,
      quality: item.quality,
      metrics: item.metrics,
      reasonCodes: item.reasonCodes,
    },
  };
}

function describeTelemetry(item: OperationalTelemetryEnvelope) {
  const metrics = item.metrics;
  const parts: string[] = [];
  if (item.deviceType === "ups") {
    if (metrics.utilityPowerAvailable === false) parts.push("utility power unavailable");
    if (metrics.onBattery === true) parts.push("UPS on battery");
    if (typeof metrics.batteryChargePercent === "number") parts.push(`battery ${metrics.batteryChargePercent}%`);
    if (typeof metrics.runtimeMinutes === "number") parts.push(`runtime ${metrics.runtimeMinutes} minutes`);
    return {
      title: metrics.utilityPowerAvailable === false ? "Utility power reported unavailable"
        : metrics.onBattery === true ? "UPS reported battery operation" : "UPS telemetry received",
      detail: parts.join("; ") || evidenceDetail(item),
      severity: metrics.utilityPowerAvailable === false ? "critical" as const : metrics.onBattery === true ? "warning" as const : severity(item),
    };
  }
  if (item.deviceType === "network") {
    const unavailable = metrics.connectivity === false || metrics.reachable === false || string(metrics.status) === "offline";
    if (typeof metrics.role === "string") parts.push(`${metrics.role} link`);
    if (typeof metrics.latencyMs === "number") parts.push(`latency ${metrics.latencyMs}ms`);
    if (typeof metrics.packetLossPercent === "number") parts.push(`loss ${metrics.packetLossPercent}%`);
    if (metrics.failoverActive === true) parts.push("failover active");
    return {
      title: unavailable ? "Network link reported unavailable" : metrics.failoverActive === true ? "Network failover reported active" : "Network telemetry received",
      detail: parts.join("; ") || evidenceDetail(item),
      severity: unavailable ? "critical" as const : metrics.failoverActive === true ? "warning" as const : severity(item),
    };
  }
  if (item.deviceType === "recorder") {
    const unavailable = metrics.reachable === false || string(metrics.status) === "offline";
    if (typeof metrics.recordingStatus === "string") parts.push(`recording ${metrics.recordingStatus}`);
    if (typeof metrics.restartAttempts === "number") parts.push(`${metrics.restartAttempts} restart attempts reported`);
    if (typeof metrics.connectedCameras === "number" && typeof metrics.totalCameras === "number") {
      parts.push(`${metrics.connectedCameras}/${metrics.totalCameras} cameras connected`);
    }
    return {
      title: unavailable ? "Recorder reported unreachable" : "Recorder telemetry received",
      detail: parts.join("; ") || evidenceDetail(item),
      severity: unavailable ? "critical" as const : severity(item),
    };
  }
  if (item.deviceType === "camera") {
    const unavailable = metrics.reachable === false || metrics.online === false || string(metrics.status) === "offline";
    return { title: unavailable ? "Camera reported unavailable" : "Camera telemetry received", detail: evidenceDetail(item), severity: unavailable ? "critical" as const : severity(item) };
  }
  if (item.deviceType === "edge-agent") {
    const unavailable = metrics.reachable === false || metrics.online === false || string(metrics.status) === "offline";
    return { title: unavailable ? "Edge agent reported unavailable" : "Edge-agent heartbeat received", detail: evidenceDetail(item), severity: unavailable ? "critical" as const : severity(item) };
  }
  return { title: `${item.deviceType.replaceAll("-", " ")} telemetry received`, detail: evidenceDetail(item), severity: severity(item) };
}

function evidenceDetail(item: OperationalTelemetryEnvelope) {
  const status = string(item.metrics.status) || string(item.metrics.operationalStatus) || string(item.metrics.healthStatus);
  const reasons = item.reasonCodes.length ? `; reasons ${item.reasonCodes.join(", ")}` : "";
  return `${status ? `status ${status}` : "state sample recorded"}${reasons}`;
}

function severity(item: OperationalTelemetryEnvelope): "info" | "warning" | "critical" {
  const state = `${string(item.metrics.status)} ${string(item.metrics.operationalStatus)} ${item.reasonCodes.join(" ")}`.toLowerCase();
  return /critical|failed|offline|missing|unreachable/.test(state) ? "critical" : /warning|degraded|battery|failover/.test(state) ? "warning" : "info";
}

function string(value: unknown) { return typeof value === "string" ? value.toLowerCase() : ""; }
function timestamp(...values: unknown[]) { return values.find((value) => typeof value === "string" && Number.isFinite(Date.parse(value))) as string ?? new Date(0).toISOString(); }
function within(value: string, from: string, to: string) { return value >= from && value <= to; }
function compact(value: Record<string, unknown>) { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)); }
