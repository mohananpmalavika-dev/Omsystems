import type { ControlPlaneStore } from "../../control-plane-store.js";
import type { User } from "../../domain/models.js";
import type { OperationalTelemetryEnvelope } from "../../operational-health/types.js";
import type {
  CommandEntityType,
  CommandHealthStatus,
  OperationalDependency,
  OperationalEntityNode,
  OperationalGraph,
} from "./types.js";

export async function buildOperationalGraph(
  store: ControlPlaneStore,
  user: User,
  branchId: string,
  now = new Date(),
): Promise<OperationalGraph> {
  const branch = await store.getNode(branchId);
  if (!branch || branch.type !== "branch" || branch.tenantId !== user.tenantId) {
    throw new Error("branch_not_found");
  }
  const [cameras, edgeAgents, telemetry] = await Promise.all([
    store.listCamerasByBranch(user, branchId, "recording:view"),
    store.listEdgeAgentsByBranch(branchId),
    store.listLatestOperationalTelemetry(user.tenantId, [branchId]),
  ]);
  const latest = new Map(telemetry.map((item) => [`${item.deviceType}:${item.deviceId}`, item]));
  const entities: OperationalEntityNode[] = [];
  const dependencies: OperationalDependency[] = [];
  const branchEntityId = `branch:${branch.id}`;

  const telemetryEntities = telemetry
    .filter((item) => item.deviceType !== "branch" && item.deviceType !== "recorder-channel" && item.deviceType !== "archive")
    .map((item) => telemetryEntity(item));
  for (const entity of telemetryEntities) addEntity(entities, entity);

  const upsTelemetry = telemetry.filter((item) => item.deviceType === "ups");
  if (upsTelemetry.length > 0) {
    const powerId = `power:${branch.id}`;
    const utilityUnavailable = upsTelemetry.some((item) =>
      item.metrics.utilityPowerAvailable === false || item.metrics.onBattery === true
      || ["on_battery", "utility_failed", "mains_failed"].includes(stringMetric(item.metrics.status))
    );
    addEntity(entities, {
      id: powerId,
      entityType: "power",
      name: "Branch power supply",
      status: utilityUnavailable ? "critical" : "healthy",
      observedAt: newest(upsTelemetry.map((item) => item.observedAt)),
      source: "derived-from-ups-telemetry",
      quality: bestQuality(upsTelemetry),
      reasonCodes: unique(upsTelemetry.flatMap((item) => item.reasonCodes)),
      metrics: { utilityPowerAvailable: !utilityUnavailable },
    });
    dependencies.push({ fromEntityId: branchEntityId, toEntityId: powerId, relationship: "depends_on", source: "telemetry" });
    for (const ups of upsTelemetry) {
      dependencies.push({ fromEntityId: `ups:${ups.deviceId}`, toEntityId: powerId, relationship: "powered_by", source: "telemetry" });
    }
  }

  for (const agent of edgeAgents) {
    const item = latest.get(`edge-agent:${agent.id}`);
    addEntity(entities, item ? telemetryEntity(item, agent.name) : {
      id: `edge-agent:${agent.id}`,
      entityType: "edge-agent",
      name: agent.name,
      status: agent.status === "online" ? "online" : agent.status === "offline" ? "offline" : "unknown",
      observedAt: agent.lastSeenAt,
      source: "edge-agent-registry",
      quality: "inventory",
      reasonCodes: [],
      metrics: { version: agent.version },
    });
    dependencies.push({ fromEntityId: branchEntityId, toEntityId: `edge-agent:${agent.id}`, relationship: "contains", source: "inventory" });
  }

  const recorderIds = new Set(telemetry.filter((item) => item.deviceType === "recorder").map((item) => item.deviceId));
  for (const recorderId of recorderIds) {
    dependencies.push({ fromEntityId: branchEntityId, toEntityId: `recorder:${recorderId}`, relationship: "contains", source: "telemetry" });
    for (const network of telemetry.filter((item) => item.deviceType === "network")) {
      dependencies.push({ fromEntityId: `recorder:${recorderId}`, toEntityId: `network:${network.deviceId}`, relationship: "connects_through", source: "telemetry" });
    }
    for (const ups of upsTelemetry) {
      dependencies.push({ fromEntityId: `recorder:${recorderId}`, toEntityId: `ups:${ups.deviceId}`, relationship: "powered_by", source: "telemetry" });
    }
  }

  for (const disk of telemetry.filter((item) => item.deviceType === "disk")) {
    const recorderId = stringMetric(disk.metrics.recorderId);
    dependencies.push({
      fromEntityId: recorderId ? `recorder:${recorderId}` : branchEntityId,
      toEntityId: `disk:${disk.deviceId}`,
      relationship: "contains",
      source: recorderId ? "telemetry" : "inventory",
    });
  }

  const inventoryCameraIds = new Set(cameras.map((camera) => camera.id));
  for (const camera of cameras) {
    const item = latest.get(`camera:${camera.id}`);
    addEntity(entities, item ? telemetryEntity(item, camera.name) : {
      id: `camera:${camera.id}`,
      entityType: "camera",
      name: camera.name,
      status: camera.status === "online" ? "online" : camera.status === "offline" ? "offline" : camera.status,
      observedAt: null,
      source: "camera-inventory",
      quality: "inventory",
      reasonCodes: [],
      metrics: { model: camera.model, channel: camera.channel },
    });
    const recorderId = item ? stringMetric(item.metrics.recorderId) : "";
    dependencies.push({
      fromEntityId: branchEntityId,
      toEntityId: `camera:${camera.id}`,
      relationship: "contains",
      source: "inventory",
    });
    if (recorderId && recorderIds.has(recorderId)) {
      dependencies.push({ fromEntityId: `camera:${camera.id}`, toEntityId: `recorder:${recorderId}`, relationship: "records_to", source: "telemetry" });
    }
  }

  // Edge telemetry can arrive before camera inventory synchronization. Keep
  // those observed cameras in the dependency graph instead of showing their
  // health without the recorder relationship that explains the outage.
  for (const item of telemetry.filter(
    (telemetryItem) =>
      telemetryItem.deviceType === "camera"
      && !inventoryCameraIds.has(telemetryItem.deviceId),
  )) {
    dependencies.push({
      fromEntityId: branchEntityId,
      toEntityId: `camera:${item.deviceId}`,
      relationship: "contains",
      source: "telemetry",
    });
    const recorderId = stringMetric(item.metrics.recorderId);
    if (recorderId && recorderIds.has(recorderId)) {
      dependencies.push({
        fromEntityId: `camera:${item.deviceId}`,
        toEntityId: `recorder:${recorderId}`,
        relationship: "records_to",
        source: "telemetry",
      });
    }
  }

  for (const network of telemetry.filter((item) => item.deviceType === "network")) {
    dependencies.push({ fromEntityId: branchEntityId, toEntityId: `network:${network.deviceId}`, relationship: "depends_on", source: "telemetry" });
  }

  const cameraEntities = entities.filter((item) => item.entityType === "camera");
  const recorderEntities = entities.filter((item) => item.entityType === "recorder");
  const networkEntities = entities.filter((item) => item.entityType === "network");
  const unavailableCameras = cameraEntities.filter((item) => isUnavailable(item.status)).length;
  const branchStatus: CommandHealthStatus = entities.length === 0 || entities.every((item) => item.status === "unknown")
    ? "unknown"
    : entities.some((item) => ["critical", "offline"].includes(item.status))
      ? "critical"
      : entities.some((item) => ["warning", "degraded"].includes(item.status)) ? "degraded" : "healthy";
  entities.unshift({
    id: branchEntityId,
    entityType: "branch",
    name: branch.name,
    status: branchStatus,
    observedAt: newest(telemetry.map((item) => item.observedAt)),
    source: "operational-graph",
    quality: "inventory",
    reasonCodes: [],
    metrics: {},
  });

  return {
    branch: { id: branch.id, name: branch.name, status: branchStatus },
    entities,
    dependencies: dedupeDependencies(dependencies),
    summary: {
      totalEntities: entities.length,
      unhealthyEntities: entities.filter((item) => ["degraded", "warning", "offline", "critical"].includes(item.status)).length,
      totalCameras: cameraEntities.length,
      unavailableCameras,
      recorders: recorderEntities.length,
      offlineRecorders: recorderEntities.filter((item) => isUnavailable(item.status)).length,
      networks: networkEntities.length,
      availableNetworks: networkEntities.filter((item) => ["online", "healthy"].includes(item.status)).length,
    },
    generatedAt: now.toISOString(),
  };
}

function telemetryEntity(item: OperationalTelemetryEnvelope, name?: string): OperationalEntityNode {
  const entityType = normalizeEntityType(item.deviceType);
  return {
    id: `${entityType}:${item.deviceId}`,
    entityType,
    name: name ?? (stringMetric(item.metrics.name) || `${label(entityType)} ${item.deviceId}`),
    status: telemetryStatus(item),
    observedAt: item.observedAt,
    source: item.source,
    quality: item.quality,
    reasonCodes: item.reasonCodes,
    metrics: item.metrics,
  };
}

function telemetryStatus(item: OperationalTelemetryEnvelope): CommandHealthStatus {
  const metrics = item.metrics;
  if (metrics.reachable === false || metrics.connectivity === false || metrics.online === false) return "offline";
  const value = [metrics.operationalStatus, metrics.healthStatus, metrics.recordingStatus, metrics.status, metrics.connectivityStatus]
    .map(stringMetric).find(Boolean)?.toLowerCase().replaceAll("-", "_");
  if (["online", "healthy", "warning", "critical", "offline", "degraded", "maintenance"].includes(value ?? "")) {
    return value as CommandHealthStatus;
  }
  if (["failed", "missing", "unreachable", "stopped", "not_recording"].includes(value ?? "")) return "critical";
  if (["partial", "failover", "at_risk", "on_battery"].includes(value ?? "")) return "warning";
  if (metrics.reachable === true || metrics.connectivity === true || metrics.online === true) return "online";
  return item.quality === "unavailable" ? "unknown" : "unknown";
}

function normalizeEntityType(type: OperationalTelemetryEnvelope["deviceType"]): CommandEntityType {
  if (type === "archive" || type === "recorder-channel") return "recorder";
  return type;
}

function addEntity(entities: OperationalEntityNode[], next: OperationalEntityNode) {
  const index = entities.findIndex((item) => item.id === next.id);
  if (index === -1) entities.push(next);
  else if (Date.parse(entities[index]!.observedAt ?? "") <= Date.parse(next.observedAt ?? "")) entities[index] = next;
}

function dedupeDependencies(items: OperationalDependency[]) {
  return [...new Map(items.map((item) => [`${item.fromEntityId}:${item.toEntityId}:${item.relationship}`, item])).values()];
}

function stringMetric(value: unknown) {
  return typeof value === "string" ? value : "";
}

function newest(values: string[]) {
  return values.filter(Boolean).sort().at(-1) ?? null;
}

function bestQuality(items: OperationalTelemetryEnvelope[]) {
  return items.some((item) => item.quality === "verified") ? "verified" as const
    : items.some((item) => item.quality === "estimated") ? "estimated" as const
      : items.some((item) => item.quality === "unsupported") ? "unsupported" as const : "unavailable" as const;
}

function unique(values: string[]) { return [...new Set(values)]; }
function label(value: string) { return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function isUnavailable(status: CommandHealthStatus) { return ["offline", "critical"].includes(status); }
