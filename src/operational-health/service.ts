import type { Camera, RecordingSegment, ResourceNode } from "../domain/models.js";
import type {
  HealthStatus,
  OperationalHealthPolicy,
  OperationalTelemetryEnvelope,
} from "./types.js";

export interface RetentionVerification {
  cameraId: string;
  configuredDays: number;
  actualDays: number | null;
  oldestContinuousAt: string | null;
  newestPlayableAt: string | null;
  status: "compliant" | "at_risk" | "breach" | "unknown";
  marginDays: number | null;
  shortfallDays: number | null;
  warningDays: number;
  dailyChangeDays: number | null;
  forecastDaysIn7Days: number | null;
  daysUntilCompliant: number | null;
  trend: "improving" | "stable" | "declining" | "unknown";
  coverageTrend: Array<{ date: string; coveredHours: number; coveragePercent: number }>;
  reasonCodes: string[];
}

export function telemetryStatus(
  envelope: OperationalTelemetryEnvelope | undefined,
  policy: OperationalHealthPolicy,
  now = Date.now(),
): HealthStatus {
  if (!envelope) return "unknown";
  const ageSeconds = Math.max(0, (now - Date.parse(envelope.observedAt)) / 1000);
  if (!Number.isFinite(ageSeconds) || ageSeconds > policy.offlineAfterSeconds) return "critical";
  if (ageSeconds > policy.staleAfterSeconds) return "unknown";
  if (envelope.quality === "unsupported" || envelope.quality === "unavailable") return "unknown";
  const reported = envelope.metrics.status;
  if (reported === "offline" || reported === "failed" || reported === "critical") return "critical";
  if (reported === "warning" || reported === "degraded" || reported === "rebuilding") return "warning";
  return reported === "online" || reported === "healthy" || reported === "recording"
    ? "healthy"
    : "unknown";
}

export function verifyContinuousRetention(
  cameraId: string,
  segments: RecordingSegment[],
  policy: Pick<OperationalHealthPolicy, "retentionDays" | "maxRecordingGapSeconds"> & Partial<Pick<OperationalHealthPolicy, "retentionWarningDays">>,
  now = Date.now(),
): RetentionVerification {
  const warningDays = policy.retentionWarningDays ?? 7;
  const playable = segments
    .filter((segment) => segment.cameraId === cameraId && segment.status === "ready")
    .filter((segment) => Number.isFinite(Date.parse(segment.startedAt)) && Number.isFinite(Date.parse(segment.endedAt)))
    .sort((left, right) => Date.parse(right.endedAt) - Date.parse(left.endedAt));
  if (playable.length === 0) {
    return {
      cameraId,
      configuredDays: policy.retentionDays,
      actualDays: null,
      oldestContinuousAt: null,
      newestPlayableAt: null,
      status: "unknown",
      marginDays: null, shortfallDays: null, warningDays,
      dailyChangeDays: null, forecastDaysIn7Days: null, daysUntilCompliant: null,
      trend: "unknown", coverageTrend: [],
      reasonCodes: ["recording_evidence_unavailable"],
    };
  }

  const newestEnd = Date.parse(playable[0]!.endedAt);
  const coverageTrend = calculateCoverageTrend(playable, now);
  if (now - newestEnd > policy.maxRecordingGapSeconds * 1000) {
    return {
      cameraId,
      configuredDays: policy.retentionDays,
      actualDays: 0,
      oldestContinuousAt: playable[0]!.startedAt,
      newestPlayableAt: playable[0]!.endedAt,
      status: "breach",
      marginDays: -policy.retentionDays, shortfallDays: policy.retentionDays,
      warningDays, dailyChangeDays: -1,
      forecastDaysIn7Days: 0, daysUntilCompliant: null,
      trend: "declining", coverageTrend,
      reasonCodes: ["recording_not_current"],
    };
  }

  let oldest = Date.parse(playable[0]!.startedAt);
  let cursor = oldest;
  for (const segment of playable.slice(1)) {
    const segmentEnd = Date.parse(segment.endedAt);
    if (cursor - segmentEnd > policy.maxRecordingGapSeconds * 1000) break;
    oldest = Math.min(oldest, Date.parse(segment.startedAt));
    cursor = oldest;
  }
  const actualDays = Math.max(0, (newestEnd - oldest) / 86_400_000);
  const roundedActual = Math.round(actualDays * 100) / 100;
  const marginDays = Math.round((actualDays - policy.retentionDays) * 100) / 100;
  const shortfallDays = Math.round(Math.max(0, policy.retentionDays - actualDays) * 100) / 100;
  const atRisk = actualDays >= policy.retentionDays && marginDays <= warningDays;
  const compliant = actualDays >= policy.retentionDays && !atRisk;
  const dailyChangeDays = actualDays < policy.retentionDays ? 1 : 0;
  return {
    cameraId,
    configuredDays: policy.retentionDays,
    actualDays: roundedActual,
    oldestContinuousAt: new Date(oldest).toISOString(),
    newestPlayableAt: new Date(newestEnd).toISOString(),
    status: compliant ? "compliant" : atRisk ? "at_risk" : "breach",
    marginDays, shortfallDays, warningDays,
    dailyChangeDays,
    forecastDaysIn7Days: Math.round((actualDays + dailyChangeDays * 7) * 100) / 100,
    daysUntilCompliant: shortfallDays > 0 ? Math.ceil(shortfallDays / Math.max(dailyChangeDays, 1)) : 0,
    trend: dailyChangeDays > 0 ? "improving" : "stable",
    coverageTrend,
    reasonCodes: compliant ? [] : atRisk ? ["retention_approaching_threshold"] : ["retention_below_policy"],
  };
}

function calculateCoverageTrend(segments: RecordingSegment[], now: number) {
  return Array.from({ length: 14 }, (_, index) => {
    const start = new Date(now - (13 - index) * 86_400_000);
    start.setUTCHours(0, 0, 0, 0);
    const from = start.getTime();
    const to = from + 86_400_000;
    const coveredMs = segments.reduce((sum, segment) => {
      const overlap = Math.max(0, Math.min(to, Date.parse(segment.endedAt)) - Math.max(from, Date.parse(segment.startedAt)));
      return sum + overlap;
    }, 0);
    const coveredHours = Math.round(Math.min(24, coveredMs / 3_600_000) * 10) / 10;
    return { date: start.toISOString().slice(0, 10), coveredHours, coveragePercent: Math.round((coveredHours / 24) * 1000) / 10 };
  });
}

export function projectBranchHealth(input: {
  branch: ResourceNode;
  cameras: Camera[];
  telemetry: OperationalTelemetryEnvelope[];
  retentions: RetentionVerification[];
  policy: OperationalHealthPolicy;
  now?: number;
  region?: string;
}) {
  const now = input.now ?? Date.now();
  const latestByDevice = new Map(input.telemetry.map((item) => [`${item.deviceType}:${item.deviceId}`, item]));
  const cameraStates = input.cameras.map((camera) => {
    const telemetry = latestByDevice.get(`camera:${camera.id}`);
    const status = telemetryStatus(telemetry, input.policy, now);
    const retention = input.retentions.find((item) => item.cameraId === camera.id);
    return { camera, telemetry, status, retention };
  });
  const recorderStates = input.telemetry
    .filter((item) => item.deviceType === "recorder")
    .map((item) => telemetryStatus(item, input.policy, now));
  const recorderHealth = aggregateStatuses(recorderStates);
  const componentStatuses: Record<string, HealthStatus> = {
    camera: aggregateStatuses(cameraStates.map((item) => item.status)),
    recording: aggregateStatuses([
      aggregateDeviceType("recorder", input.telemetry, input.policy, now),
      aggregateRetention(input.retentions),
    ]),
    storage: aggregateDeviceType("disk", input.telemetry, input.policy, now),
    network: aggregateNetworkLinks(input.telemetry, input.policy, now),
    ups: aggregateDeviceType("ups", input.telemetry, input.policy, now),
    edgeAgent: aggregateDeviceType("edge-agent", input.telemetry, input.policy, now),
  };
  const healthStatus = aggregateStatuses(Object.values(componentStatuses));
  const scored = Object.values(componentStatuses).filter((status) => status !== "unknown");
  const score = scored.length === 0 ? null : Math.round(scored.reduce((sum, status) => sum + statusScore(status), 0) / scored.length);
  const observed = input.telemetry.map((item) => item.observedAt).sort().at(-1) ?? null;
  const edgeTelemetry = input.telemetry
    .filter((item) => item.deviceType === "edge-agent")
    .sort((left, right) => right.observedAt.localeCompare(left.observedAt))[0];
  const components = Object.fromEntries(Object.entries(componentStatuses).map(([name, status]) => [name, {
    status,
    score: status === "unknown" ? null : statusScore(status),
    lastUpdated: observed,
  }]));
  return {
    id: input.branch.id,
    name: input.branch.name,
    code: input.branch.id.slice(0, 8),
    region: input.region ?? "Unassigned",
    healthStatus,
    healthScore: score,
    lastHealthCheck: observed,
    totalCameras: input.cameras.length,
    onlineCameras: cameraStates.filter((item) => item.status === "healthy").length,
    recordingCameras: cameraStates.filter((item) => item.retention?.status === "compliant" || item.retention?.status === "at_risk").length,
    totalRecorders: recorderStates.length,
    onlineRecorders: recorderStates.filter((status) => status === "healthy").length,
    recorderStatus: recorderHealth === "healthy" ? "online"
      : recorderHealth === "critical" ? "offline"
        : recorderHealth,
    retentionBreaches: input.retentions.filter((item) => item.status === "breach").length,
    criticalAlerts: Object.values(componentStatuses).filter((status) => status === "critical").length
      + input.retentions.filter((item) => item.status === "breach").length,
    edgeAgentStatus: componentStatuses.edgeAgent === "healthy" ? "online"
      : componentStatuses.edgeAgent === "critical" ? "offline"
        : componentStatuses.edgeAgent,
    internetStatus: projectBranchInternetStatus(input.telemetry, input.policy, now),
    edgeAgentHeartbeat: edgeTelemetry?.observedAt ?? null,
    unknownComponents: Object.entries(componentStatuses).filter(([, status]) => status === "unknown").map(([name]) => name),
    components,
    cameras: cameraStates.map(({ camera, telemetry, status, retention }) => ({
      id: camera.id,
      name: camera.name,
      branchId: camera.branchId,
      vendor: camera.vendor,
      model: camera.model,
      channel: camera.channel,
      ipAddress: camera.ipAddress ?? null,
      physicalType: camera.physicalType ?? null,
      capabilities: camera.capabilities,
      onlineStatus: status === "healthy" ? "online" : status === "critical" ? "offline" : status,
      recordingStatus: retention?.status ?? "unknown",
      lastHeartbeat: telemetry?.observedAt ?? null,
      healthScore: status === "unknown" ? null : statusScore(status),
      currentFps: numericMetric(telemetry, "fps"),
      expectedFps: camera.specifications?.frameRate ?? null,
      currentBitrate: numericMetric(telemetry, "bitrateKbps"),
      latencyMs: numericMetric(telemetry, "responseTimeMs"),
      packetLoss: numericMetric(telemetry, "packetLossPercent"),
      streamAvailable: telemetry?.metrics.streamActive === true,
      onvifAvailable: camera.protocol === "onvif-s" || camera.protocol === "onvif-t",
      videoLoss: telemetry?.metrics.videoLoss === true,
      tamperingDetected: telemetry?.metrics.tamperingDetected === true,
      imageFrozen: telemetry?.metrics.imageFrozen === true,
      blackScreen: telemetry?.metrics.blackScreen === true,
      quality: telemetry?.quality ?? "unavailable",
      metrics: telemetry?.metrics ?? {},
      reasonCodes: [...(telemetry?.reasonCodes ?? ["telemetry_unavailable"]), ...(retention?.reasonCodes ?? [])],
      retention,
    })),
  };
}

function aggregateDeviceType(
  type: OperationalTelemetryEnvelope["deviceType"],
  telemetry: OperationalTelemetryEnvelope[],
  policy: OperationalHealthPolicy,
  now: number,
) {
  return aggregateStatuses(telemetry.filter((item) => item.deviceType === type).map((item) => telemetryStatus(item, policy, now)));
}

function aggregateNetworkLinks(telemetry: OperationalTelemetryEnvelope[], policy: OperationalHealthPolicy, now: number): HealthStatus {
  const links = telemetry.filter((item) => item.deviceType === "network");
  if (links.length === 0) return "unknown";
  const states = links.map((link) => ({
    role: link.metrics.role === "backup" ? "backup" : "primary",
    active: link.metrics.active !== false,
    status: telemetryStatus(link, policy, now),
  }));
  const available = states.filter((link) => link.status === "healthy");
  if (available.length === 0) {
    if (states.some((link) => link.status === "warning")) return "warning";
    return states.some((link) => link.status === "unknown") ? "unknown" : "critical";
  }
  const primary = states.find((link) => link.role === "primary");
  const backup = states.find((link) => link.role === "backup");
  if (primary && primary.status !== "healthy" && backup?.status === "healthy") return "warning";
  if (backup && backup.status === "critical") return "warning";
  return states.some((link) => link.status === "warning") ? "warning" : "healthy";
}

function projectBranchInternetStatus(telemetry: OperationalTelemetryEnvelope[], policy: OperationalHealthPolicy, now: number) {
  const links = telemetry.filter((item) => item.deviceType === "network");
  if (links.length === 0) return "unknown" as const;
  const primary = links.find((item) => item.metrics.role !== "backup");
  const backup = links.find((item) => item.metrics.role === "backup");
  const primaryStatus = telemetryStatus(primary, policy, now);
  const backupStatus = telemetryStatus(backup, policy, now);
  if (primary && primaryStatus === "critical" && backupStatus === "healthy") return "failover" as const;
  const aggregate = aggregateNetworkLinks(telemetry, policy, now);
  return aggregate === "healthy" ? "online" as const : aggregate === "warning" ? "degraded" as const
    : aggregate === "critical" ? "offline" as const : "unknown" as const;
}

function aggregateRetention(items: RetentionVerification[]): HealthStatus {
  if (items.length === 0 || items.some((item) => item.status === "unknown")) return "unknown";
  if (items.some((item) => item.status === "breach")) return "critical";
  return items.some((item) => item.status === "at_risk") ? "warning" : "healthy";
}

function aggregateStatuses(statuses: HealthStatus[]): HealthStatus {
  if (statuses.length === 0 || statuses.some((status) => status === "unknown")) return "unknown";
  if (statuses.some((status) => status === "critical")) return "critical";
  if (statuses.some((status) => status === "warning")) return "warning";
  return "healthy";
}

function statusScore(status: HealthStatus) {
  return status === "healthy" ? 100 : status === "warning" ? 60 : status === "critical" ? 0 : 0;
}

function numericMetric(envelope: OperationalTelemetryEnvelope | undefined, name: string) {
  const value = envelope?.metrics[name];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
