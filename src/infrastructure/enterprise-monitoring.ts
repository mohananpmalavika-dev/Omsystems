import type { Camera, ResourceNode } from "../domain/models.js";
import type {
  HealthStatus,
  OperationalTelemetryEnvelope,
  TelemetryDeviceType,
} from "../operational-health/types.js";

export type InfrastructureDomain =
  | "power"
  | "network"
  | "compute"
  | "storage"
  | "cooling"
  | "security"
  | "surveillance";

export interface InfrastructureDomainHealth {
  score: number | null;
  status: HealthStatus;
  observedDevices: number;
  expectedDeviceTypes: TelemetryDeviceType[];
  reasonCodes: string[];
  lastUpdated: string | null;
}

export interface InfrastructureHealthSnapshot {
  branchId: string;
  branchName: string;
  overallScore: number | null;
  overallStatus: HealthStatus;
  evidenceCoveragePercent: number;
  domains: Record<InfrastructureDomain, InfrastructureDomainHealth>;
  criticalIssues: number;
  warningIssues: number;
  predictedFailures: number;
  lastUpdated: string;
}

export interface InfrastructureIncident {
  id: string;
  branchId: string;
  branchName: string;
  incidentType: string;
  severity: "critical" | "warning";
  title: string;
  rootCauseType: string;
  rootCauseConfidence: number;
  camerasAffected: number;
  infrastructureAffected: number;
  recommendedActions: string[];
  ageMinutes: number;
  createdAt: string;
  evidence: {
    deviceId: string;
    deviceType: TelemetryDeviceType;
    source: OperationalTelemetryEnvelope["source"];
    quality: OperationalTelemetryEnvelope["quality"];
    reasonCodes: string[];
  };
}

export interface PredictedInfrastructureFailure {
  failureType: string;
  componentId: string;
  componentName: string;
  description: string;
  daysUntilFailure: number | null;
  healthIndicator: number | null;
  observedAt: string;
  evidenceSource: OperationalTelemetryEnvelope["source"];
  evidenceQuality: OperationalTelemetryEnvelope["quality"];
}

export interface InfrastructureGraphNode {
  deviceType: TelemetryDeviceType;
  deviceId: string;
  deviceName: string;
  healthScore: number | null;
  status: HealthStatus;
  observedAt: string | null;
  evidenceQuality: OperationalTelemetryEnvelope["quality"] | "inventory";
}

export interface InfrastructureGraphEdge {
  sourceId: string;
  targetId: string;
  relation: "depends_on" | "connected_to" | "powered_by" | "recorded_by";
  provenance: "inventory" | "telemetry";
}

export interface InfrastructureGraph {
  branchId: string;
  nodes: InfrastructureGraphNode[];
  edges: InfrastructureGraphEdge[];
  mappedDeviceCount: number;
  unmappedDeviceCount: number;
  mappingCoveragePercent: number;
}

const DOMAIN_WEIGHTS: Record<InfrastructureDomain, number> = {
  power: 20,
  network: 25,
  compute: 15,
  storage: 15,
  cooling: 10,
  security: 10,
  surveillance: 5,
};

const DOMAIN_TYPES: Record<InfrastructureDomain, TelemetryDeviceType[]> = {
  power: ["ups", "generator"],
  network: ["network", "switch", "firewall", "router", "sdwan"],
  compute: ["edge-agent"],
  storage: ["disk"],
  cooling: ["environment", "sensor"],
  security: ["firewall"],
  surveillance: ["camera", "recorder", "recorder-channel", "archive"],
};

const REFERENCE_METRICS: Array<{
  key: string;
  relation: InfrastructureGraphEdge["relation"];
}> = [
  { key: "upstreamDeviceId", relation: "depends_on" },
  { key: "networkParentId", relation: "connected_to" },
  { key: "switchId", relation: "connected_to" },
  { key: "routerId", relation: "depends_on" },
  { key: "firewallId", relation: "depends_on" },
  { key: "powerSourceId", relation: "powered_by" },
  { key: "upsId", relation: "powered_by" },
  { key: "generatorId", relation: "powered_by" },
];

export function buildInfrastructureHealthSnapshot(input: {
  branch: ResourceNode;
  cameras: Camera[];
  telemetry: OperationalTelemetryEnvelope[];
  now?: number;
}): InfrastructureHealthSnapshot {
  const now = input.now ?? Date.now();
  const latest = latestTelemetry(input.telemetry);
  const domains = Object.fromEntries(
    (Object.keys(DOMAIN_TYPES) as InfrastructureDomain[]).map((domain) => [
      domain,
      domainHealth(domain, latest, now),
    ]),
  ) as Record<InfrastructureDomain, InfrastructureDomainHealth>;
  const knownDomains = (Object.keys(domains) as InfrastructureDomain[])
    .filter((domain) => domains[domain].score !== null);
  const representedWeight = knownDomains.reduce((sum, domain) => sum + DOMAIN_WEIGHTS[domain], 0);
  const overallScore = representedWeight === 0
    ? null
    : round(knownDomains.reduce(
      (sum, domain) => sum + domains[domain].score! * DOMAIN_WEIGHTS[domain],
      0,
    ) / representedWeight);
  const states = knownDomains.map((domain) => domains[domain].status);
  const lastUpdated = newestTimestamp(latest.map((item) => item.observedAt)) ?? new Date(now).toISOString();
  const incidents = buildActiveInfrastructureIncidents({
    branch: input.branch,
    cameras: input.cameras,
    telemetry: latest,
    now,
  });
  return {
    branchId: input.branch.id,
    branchName: input.branch.name,
    overallScore,
    overallStatus: aggregateStatus(states),
    evidenceCoveragePercent: representedWeight,
    domains,
    criticalIssues: incidents.filter((incident) => incident.severity === "critical").length,
    warningIssues: incidents.filter((incident) => incident.severity === "warning").length,
    predictedFailures: predictInfrastructureFailures(latest).length,
    lastUpdated,
  };
}

export function buildActiveInfrastructureIncidents(input: {
  branch: ResourceNode;
  cameras: Camera[];
  telemetry: OperationalTelemetryEnvelope[];
  now?: number;
}): InfrastructureIncident[] {
  const now = input.now ?? Date.now();
  return latestTelemetry(input.telemetry)
    .map((item) => ({ item, status: evidenceStatus(item, now) }))
    .filter((value): value is { item: OperationalTelemetryEnvelope; status: "critical" | "warning" } =>
      value.status === "critical" || value.status === "warning")
    .map(({ item, status }) => {
      const rootCauseType = rootCauseFor(item.deviceType);
      const explicitAffected = numeric(item.metrics.affectedCameraCount);
      const camerasAffected = explicitAffected !== null
        ? Math.max(0, Math.round(explicitAffected))
        : item.deviceType === "camera" ? 1 : 0;
      const confidenceMetric = numeric(item.metrics.rootCauseConfidence);
      const rootCauseConfidence = confidenceMetric === null
        ? (item.quality === "verified" ? 0.75 : item.quality === "estimated" ? 0.55 : 0.25)
        : clamp(confidenceMetric > 1 ? confidenceMetric / 100 : confidenceMetric, 0, 1);
      const created = validTimestamp(item.observedAt) ?? now;
      const name = string(item.metrics.name) || item.deviceId;
      return {
        id: `infrastructure:${input.branch.id}:${item.deviceType}:${item.deviceId}`,
        branchId: input.branch.id,
        branchName: input.branch.name,
        incidentType: `${item.deviceType}_${status}`,
        severity: status,
        title: `${humanize(item.deviceType)} ${status}: ${name}`,
        rootCauseType,
        rootCauseConfidence,
        camerasAffected: Math.min(camerasAffected, input.cameras.length),
        infrastructureAffected: 1,
        recommendedActions: actionsFor(item.deviceType, item.reasonCodes),
        ageMinutes: Math.max(0, (now - created) / 60_000),
        createdAt: new Date(created).toISOString(),
        evidence: {
          deviceId: item.deviceId,
          deviceType: item.deviceType,
          source: item.source,
          quality: item.quality,
          reasonCodes: item.reasonCodes,
        },
      };
    })
    .sort((left, right) => severityRank(left.severity) - severityRank(right.severity)
      || right.createdAt.localeCompare(left.createdAt));
}

export function predictInfrastructureFailures(
  telemetry: OperationalTelemetryEnvelope[],
): PredictedInfrastructureFailure[] {
  const failures: PredictedInfrastructureFailure[] = [];
  for (const item of latestTelemetry(telemetry)) {
    const name = string(item.metrics.name) || item.deviceId;
    const healthScore = numeric(item.metrics.healthScore);
    if (item.deviceType === "disk") {
      const risk = numeric(item.metrics.failureProbability);
      if (risk !== null && risk >= 55) failures.push(prediction(item, {
        failureType: "disk_failure", name,
        description: `SMART and write evidence indicate ${round(risk)}% disk failure risk.`,
        days: firstNumber(item.metrics.predictedFailureDays, item.metrics.estimatedDaysToFailure),
        health: round(100 - risk),
      }));
    }
    if (item.deviceType === "ups") {
      const battery = firstNumber(item.metrics.batteryHealthPercent, item.metrics.batteryPercent);
      const replacement = item.metrics.batteryReplacementIndicator === true;
      if (replacement || (battery !== null && battery < 60)) failures.push(prediction(item, {
        failureType: "ups_battery", name,
        description: replacement ? "UPS battery controller requests replacement." : `UPS battery health is ${round(battery!)}%.`,
        days: firstNumber(item.metrics.predictedReplacementDays, item.metrics.estimatedReplacementDays),
        health: battery,
      }));
    }
    if (item.deviceType === "generator") {
      const dueDays = firstNumber(item.metrics.maintenanceDueDays, item.metrics.daysUntilService);
      if (item.metrics.maintenanceDue === true || (dueDays !== null && dueDays <= 60)) failures.push(prediction(item, {
        failureType: "generator_maintenance", name,
        description: dueDays !== null ? `Generator service is due in ${Math.max(0, Math.round(dueDays))} days.` : "Generator controller reports maintenance due.",
        days: dueDays,
        health: healthScore,
      }));
    }
    if ((item.deviceType === "switch" || item.deviceType === "firewall") && numeric(item.metrics.failureProbability) !== null) {
      const risk = numeric(item.metrics.failureProbability)!;
      if (risk >= 55) failures.push(prediction(item, {
        failureType: `${item.deviceType}_failure`, name,
        description: `Measured trends indicate ${round(risk)}% ${item.deviceType} failure risk.`,
        days: firstNumber(item.metrics.predictedFailureDays, item.metrics.estimatedDaysToFailure),
        health: healthScore ?? round(100 - risk),
      }));
    }
  }
  return failures.sort((left, right) => (left.daysUntilFailure ?? 0) - (right.daysUntilFailure ?? 0));
}

export function buildInfrastructureGraph(input: {
  branchId: string;
  cameras: Camera[];
  telemetry: OperationalTelemetryEnvelope[];
  now?: number;
}): InfrastructureGraph {
  const now = input.now ?? Date.now();
  const latest = latestTelemetry(input.telemetry);
  const nodes = new Map<string, InfrastructureGraphNode>();
  const edges: InfrastructureGraphEdge[] = [];
  for (const camera of input.cameras) {
    nodes.set(camera.id, {
      deviceType: "camera", deviceId: camera.id, deviceName: camera.name,
      // Inventory proves that the camera exists, not that it is currently
      // healthy. A camera telemetry envelope below will replace this state.
      healthScore: null,
      status: "unknown",
      observedAt: null, evidenceQuality: "inventory",
    });
    if (camera.recorderId) edges.push({
      sourceId: camera.id, targetId: camera.recorderId,
      relation: "recorded_by", provenance: "inventory",
    });
  }
  for (const item of latest) {
    nodes.set(item.deviceId, nodeFromTelemetry(item, now, nodes.get(item.deviceId)));
    for (const reference of REFERENCE_METRICS) {
      const targetId = string(item.metrics[reference.key]);
      if (!targetId || targetId === item.deviceId) continue;
      edges.push({ sourceId: item.deviceId, targetId, relation: reference.relation, provenance: "telemetry" });
    }
  }
  for (const edge of edges) {
    if (!nodes.has(edge.targetId)) nodes.set(edge.targetId, {
      deviceType: guessedDeviceType(edge.targetId), deviceId: edge.targetId,
      deviceName: edge.targetId, healthScore: null, status: "unknown",
      observedAt: null, evidenceQuality: "inventory",
    });
  }
  const mapped = new Set(edges.flatMap((edge) => [edge.sourceId, edge.targetId]));
  const total = nodes.size;
  return {
    branchId: input.branchId,
    nodes: [...nodes.values()],
    edges: uniqueEdges(edges),
    mappedDeviceCount: mapped.size,
    unmappedDeviceCount: Math.max(0, total - mapped.size),
    mappingCoveragePercent: total === 0 ? 0 : round(mapped.size / total * 100),
  };
}

export function getCameraInfrastructurePath(graph: InfrastructureGraph, cameraId: string) {
  const nodes = new Map(graph.nodes.map((node) => [node.deviceId, node]));
  const outgoing = new Map<string, InfrastructureGraphEdge[]>();
  for (const edge of graph.edges) outgoing.set(edge.sourceId, [...(outgoing.get(edge.sourceId) ?? []), edge]);
  const result: InfrastructureGraphNode[] = [];
  const queue = [cameraId];
  const visited = new Set<string>();
  while (queue.length > 0 && result.length < 32) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const node = nodes.get(current);
    if (node) result.push(node);
    for (const edge of outgoing.get(current) ?? []) queue.push(edge.targetId);
  }
  return result;
}

export function buildRootCauseStatistics(
  telemetry: OperationalTelemetryEnvelope[],
  days: number,
) {
  const ordered = [...telemetry].sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  const previous = new Map<string, HealthStatus>();
  const buckets = new Map<string, { incidentCount: number; confidenceTotal: number; cameras: Set<string> }>();
  for (const item of ordered) {
    const state = evidenceStatus(item, Date.parse(item.observedAt));
    const key = `${item.deviceType}:${item.deviceId}`;
    const old = previous.get(key) ?? "unknown";
    previous.set(key, state);
    if ((state !== "critical" && state !== "warning") || old === state) continue;
    const cause = rootCauseFor(item.deviceType);
    const bucket = buckets.get(cause) ?? { incidentCount: 0, confidenceTotal: 0, cameras: new Set<string>() };
    bucket.incidentCount += 1;
    bucket.confidenceTotal += item.quality === "verified" ? 0.75 : item.quality === "estimated" ? 0.55 : 0.25;
    const cameraId = item.deviceType === "camera" ? item.deviceId : string(item.metrics.cameraId);
    if (cameraId) bucket.cameras.add(cameraId);
    buckets.set(cause, bucket);
  }
  return [...buckets.entries()].map(([rootCauseType, bucket]) => ({
    rootCauseType,
    incidentCount: bucket.incidentCount,
    avgConfidence: round(bucket.confidenceTotal / bucket.incidentCount, 3),
    affectedCameras: [...bucket.cameras],
    periodDays: days,
  })).sort((left, right) => right.incidentCount - left.incidentCount);
}

function domainHealth(
  domain: InfrastructureDomain,
  telemetry: OperationalTelemetryEnvelope[],
  now: number,
): InfrastructureDomainHealth {
  const items = telemetry.filter((item) => DOMAIN_TYPES[domain].includes(item.deviceType));
  const states = items.map((item) => evidenceStatus(item, now));
  const scores = items.map((item, index) => {
    const supplied = numeric(item.metrics.healthScore);
    return supplied === null ? scoreForStatus(states[index]!) : clamp(supplied, 0, 100);
  }).filter((score): score is number => score !== null);
  return {
    score: scores.length === 0 ? null : round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    status: aggregateStatus(states),
    observedDevices: items.length,
    expectedDeviceTypes: DOMAIN_TYPES[domain],
    reasonCodes: [...new Set(items.flatMap((item) => item.reasonCodes))],
    lastUpdated: newestTimestamp(items.map((item) => item.observedAt)),
  };
}

function evidenceStatus(item: OperationalTelemetryEnvelope, now: number): HealthStatus {
  if (item.quality === "unsupported" || item.quality === "unavailable") return "unknown";
  const observedAt = validTimestamp(item.observedAt);
  if (observedAt === null || now - observedAt > 300_000) return "critical";
  if (now - observedAt > 90_000) return "warning";
  if (item.metrics.online === false || item.metrics.reachable === false || item.metrics.connectivity === false) return "critical";
  const value = [item.metrics.operationalStatus, item.metrics.healthStatus, item.metrics.status]
    .find((candidate) => typeof candidate === "string");
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  const supplied = numeric(item.metrics.healthScore);
  const scoreState: HealthStatus = supplied === null ? "unknown" : supplied >= 90 ? "healthy" : supplied >= 70 ? "warning" : "critical";
  if (/critical|failed|failure_predicted|offline|down|fault|missing/.test(normalized)) return "critical";
  if (/warning|degraded|rebuild|battery|failover|maintenance/.test(normalized)) return scoreState === "critical" ? "critical" : "warning";
  if (/healthy|online|up|ok|available|running|standby/.test(normalized)) return scoreState === "unknown" ? "healthy" : scoreState;
  if (scoreState !== "unknown") return scoreState;
  return "unknown";
}

function latestTelemetry(telemetry: OperationalTelemetryEnvelope[]) {
  const latest = new Map<string, OperationalTelemetryEnvelope>();
  for (const item of telemetry) {
    const key = `${item.deviceType}:${item.deviceId}`;
    const current = latest.get(key);
    if (!current || current.observedAt.localeCompare(item.observedAt) <= 0) latest.set(key, item);
  }
  return [...latest.values()];
}

function nodeFromTelemetry(
  item: OperationalTelemetryEnvelope,
  now: number,
  existing?: InfrastructureGraphNode,
): InfrastructureGraphNode {
  const status = evidenceStatus(item, now);
  return {
    deviceType: item.deviceType,
    deviceId: item.deviceId,
    deviceName: string(item.metrics.name) || existing?.deviceName || item.deviceId,
    healthScore: numeric(item.metrics.healthScore) ?? scoreForStatus(status),
    status,
    observedAt: item.observedAt,
    evidenceQuality: item.quality,
  };
}

function prediction(
  item: OperationalTelemetryEnvelope,
  value: { failureType: string; name: string; description: string; days: number | null; health: number | null },
): PredictedInfrastructureFailure {
  return {
    failureType: value.failureType,
    componentId: item.deviceId,
    componentName: value.name,
    description: value.description,
    daysUntilFailure: value.days === null ? null : Math.max(0, Math.round(value.days)),
    healthIndicator: value.health === null ? null : round(clamp(value.health, 0, 100)),
    observedAt: item.observedAt,
    evidenceSource: item.source,
    evidenceQuality: item.quality,
  };
}

function rootCauseFor(type: TelemetryDeviceType) {
  if (type === "switch") return "switch_device";
  if (type === "firewall") return "firewall";
  if (type === "network" || type === "router" || type === "sdwan") return "network_link";
  if (type === "ups") return "ups_power";
  if (type === "generator") return "generator_power";
  if (type === "disk") return "storage";
  if (type === "environment" || type === "sensor") return "environment";
  if (type === "camera" || type === "recorder" || type === "recorder-channel" || type === "archive") return "surveillance";
  return "unknown";
}

function actionsFor(type: TelemetryDeviceType, reasons: string[]) {
  const reason = reasons.length > 0 ? ` Review evidence: ${reasons.join(", ")}.` : "";
  const actions: Partial<Record<TelemetryDeviceType, string[]>> = {
    switch: ["Check switch reachability and power.", "Inspect affected ports, PoE state, errors and uplink utilization."],
    firewall: ["Verify firewall HA state and WAN interfaces.", "Inspect session, VPN, IPS and resource utilization."],
    network: ["Validate primary and backup WAN paths.", "Check latency, loss, public IP changes and provider status."],
    router: ["Check routing adjacencies, interfaces and failover state."],
    sdwan: ["Verify SD-WAN tunnel SLA and active path selection."],
    ups: ["Check utility input, load, battery health and runtime.", "Schedule battery replacement when requested by verified telemetry."],
    generator: ["Check controller alarms, fuel, starter battery and service schedule."],
    disk: ["Verify recorder write activity, RAID state and SMART evidence.", "Replace a predicted-failure disk using the approved maintenance workflow."],
    environment: ["Check temperature, humidity, airflow and environmental alarms."],
    sensor: ["Validate the sensor and its environmental threshold."],
    recorder: ["Verify recorder power, network and channel recording state."],
    camera: ["Verify the camera, recorder channel or PoE path before dispatching a technician."],
  };
  const selected = actions[type] ?? ["Review the latest verified telemetry and dependency graph."];
  return selected.map((action, index) => index === 0 ? `${action}${reason}` : action);
}

function guessedDeviceType(id: string): TelemetryDeviceType {
  const value = id.toLowerCase();
  if (value.includes("switch")) return "switch";
  if (value.includes("firewall")) return "firewall";
  if (value.includes("router")) return "router";
  if (value.includes("ups")) return "ups";
  if (value.includes("generator")) return "generator";
  if (value.includes("recorder") || value.includes("dvr") || value.includes("nvr")) return "recorder";
  return "network";
}

function uniqueEdges(edges: InfrastructureGraphEdge[]) {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.sourceId}:${edge.targetId}:${edge.relation}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function aggregateStatus(states: HealthStatus[]): HealthStatus {
  const known = states.filter((state) => state !== "unknown");
  if (known.length === 0) return "unknown";
  if (known.includes("critical")) return "critical";
  if (known.includes("warning")) return "warning";
  return "healthy";
}

function scoreForStatus(status: HealthStatus) {
  return status === "healthy" ? 100 : status === "warning" ? 70 : status === "critical" ? 20 : null;
}

function severityRank(severity: InfrastructureIncident["severity"]) { return severity === "critical" ? 0 : 1; }
function humanize(value: string) { return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function string(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function numeric(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function firstNumber(...values: unknown[]) { return values.map(numeric).find((value) => value !== null) ?? null; }
function clamp(value: number, minimum: number, maximum: number) { return Math.min(maximum, Math.max(minimum, value)); }
function round(value: number, digits = 1) { const factor = 10 ** digits; return Math.round(value * factor) / factor; }
function validTimestamp(value: string) { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : null; }
function newestTimestamp(values: string[]) {
  const valid = values.map((value) => ({ value, parsed: validTimestamp(value) })).filter((item) => item.parsed !== null);
  return valid.sort((left, right) => right.parsed! - left.parsed!)[0]?.value ?? null;
}
