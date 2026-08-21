import type { ControlPlaneStore } from "../control-plane-store.js";
import type { OperationalTelemetryEnvelope } from "../operational-health/types.js";
import { defaultOperationalHealthPolicy } from "../operational-health/types.js";
import { telemetryStatus } from "../operational-health/service.js";

export type HealthState = "HEALTHY" | "WARNING" | "CRITICAL" | "UNKNOWN";
export type ConnectivityState = "ONLINE" | "DEGRADED" | "FAILOVER" | "OFFLINE" | "UNKNOWN";
export type CameraOperationalState = "LIVE" | "ONLINE" | "NO_RECORD" | "STREAM_LOSS" | "OFFLINE" | "UNKNOWN";
export type RecorderState = "ONLINE" | "DEGRADED" | "OFFLINE" | "UNKNOWN";
export type StorageState = "HEALTHY" | "WARNING" | "CRITICAL" | "UNKNOWN";
export type RetentionState = "COMPLIANT" | "WARNING" | "VIOLATION" | "UNKNOWN";
export type TelemetryFreshness = "CURRENT" | "RECENT" | "STALE" | "OUTDATED";

export interface BranchHealthReason {
  code: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  component: "CAMERA" | "RECORDER" | "STORAGE" | "NETWORK" | "RETENTION" | "UPS" | "ALERT";
  message: string;
  affectedCameras?: string[];
  affectedRecorders?: string[];
  affectedDisks?: string[];
  impactLevel?: "LOW" | "MEDIUM" | "HIGH";
  impactDescription?: string;
}

export interface CameraOperationalStatus {
  id: string;
  name: string;
  channelNumber: string;
  state: CameraOperationalState;
  healthScore: number;
  onlineStatus: "online" | "offline" | "unknown";
  streamAvailable: boolean;
  recordingStatus: "recording" | "stopped" | "error" | "unknown";
  lastRecordingAt?: string;
  recordingGapSeconds?: number;
  retentionDays?: number;
  retentionState?: RetentionState;
  currentFps?: number;
  expectedFps?: number;
  latencyMs?: number;
  videoLoss: boolean;
  tamperingDetected: boolean;
  imageFrozen: boolean;
  blackScreen: boolean;
  ptzSupported: boolean;
  audioSupported: boolean;
  lastHeartbeat?: string;
  observedAt: string;
}

export interface BranchOperationalSnapshot {
  branchId: string;
  branchCode: string;
  branchName: string;
  regionId?: string;
  regionName?: string;
  overallState: HealthState;
  healthScore: number;
  reasonCodes: string[];
  reasons: BranchHealthReason[];
  primaryReason?: BranchHealthReason;
  cameras: {
    total: number; online: number; offline: number; recording: number; notRecording: number;
    streamLoss: number; videoLoss: number; healthyCount: number; warningCount: number;
    criticalCount: number; state: HealthState;
  };
  recorders: {
    total: number; online: number; offline: number; degraded: number; state: HealthState;
    recorders: Array<{
      id: string; name: string; type: "DVR" | "NVR" | "Hybrid" | "Server" | "Unknown";
      state: RecorderState; online: boolean; lastHeartbeat?: string; uptimeSeconds?: number;
      totalChannels: number; activeChannels: number; recordingChannels: number; observedAt: string;
    }>;
  };
  storage: {
    state: StorageState;
    disks: { total: number; healthy: number; warning: number; failed: number; unknown: number };
    capacity?: { totalGB: number; usedGB: number; availableGB: number; usagePercent: number };
    criticalDisks: Array<{
      id: string; devicePath: string; serialNumber?: string; model?: string;
      smartStatus: "healthy" | "warning" | "failure_predicted" | "failed" | "unknown";
      temperature?: number; reallocatedSectors?: number; pendingSectors?: number;
      uncorrectableSectors?: number; failureProbability?: number; capacityGB?: number;
      usedGB?: number; lastCheck: string;
    }>;
    raidStatus?: "healthy" | "degraded" | "failed";
    observedAt?: string;
  };
  retention: {
    requiredDays: number; minimumVerifiedDays?: number; medianVerifiedDays?: number;
    compliantChannels: number; warningChannels: number; violatingChannels: number;
    unknownChannels: number; state: RetentionState; confidence: number;
    affectedCameras?: Array<{
      cameraId: string; cameraName: string; actualDays: number; gapDays: number;
      severity: "WARNING" | "CRITICAL";
    }>;
    observedAt?: string;
  };
  network: {
    state: ConnectivityState;
    primaryWan: { state: ConnectivityState; latencyMs?: number; packetLossPct?: number; bandwidthMbps?: number };
    secondaryWan?: { state: ConnectivityState; latencyMs?: number; packetLossPct?: number };
    gateway?: { reachable: boolean; ipAddress?: string; lastSeenAt?: string };
    vpn?: { connected: boolean; lastEstablishedAt?: string };
    edgeAgent?: { connected: boolean; version?: string; lastHeartbeat?: string };
    latencyMs?: number; packetLossPct?: number; observedAt: string;
  };
  alerts: {
    p1Count: number; p2Count: number; p3Count: number; unacknowledgedCount: number; activeCount: number;
    recentCritical?: Array<{ id: string; title: string; componentType: string; deviceId?: string; detectedAt: string }>;
  };
  telemetryFreshness: TelemetryFreshness;
  lastTelemetryAt?: string;
  observedAt: string;
  computedAt: string;
  cameraList?: CameraOperationalStatus[];
  recentEvents?: Array<{
    id: string; type: string; severity: "INFO" | "WARNING" | "HIGH" | "CRITICAL";
    title: string; description: string; timestamp: string;
  }>;
}

const metricNumber = (item: OperationalTelemetryEnvelope | undefined, key: string): number | undefined => {
  const value = item?.metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const metricString = (item: OperationalTelemetryEnvelope | undefined, key: string): string | undefined => {
  const value = item?.metrics[key];
  return typeof value === "string" && value.trim() ? value : undefined;
};

const mapHealth = (status: ReturnType<typeof telemetryStatus>): HealthState =>
  status === "healthy" ? "HEALTHY" : status === "warning" ? "WARNING" : status === "critical" ? "CRITICAL" : "UNKNOWN";

const aggregateHealth = (states: HealthState[]): HealthState => {
  const known = states.filter((state) => state !== "UNKNOWN");
  if (known.length === 0) return "UNKNOWN";
  if (known.includes("CRITICAL")) return "CRITICAL";
  if (known.includes("WARNING")) return "WARNING";
  return "HEALTHY";
};

const scoreForHealth = (state: HealthState): number | undefined =>
  state === "HEALTHY" ? 100 : state === "WARNING" ? 60 : state === "CRITICAL" ? 0 : undefined;

const recorderState = (state: HealthState): RecorderState =>
  state === "HEALTHY" ? "ONLINE" : state === "WARNING" ? "DEGRADED" : state === "CRITICAL" ? "OFFLINE" : "UNKNOWN";

const connectivityState = (state: HealthState): ConnectivityState =>
  state === "HEALTHY" ? "ONLINE" : state === "WARNING" ? "DEGRADED" : state === "CRITICAL" ? "OFFLINE" : "UNKNOWN";

const latestTelemetry = (items: OperationalTelemetryEnvelope[]): OperationalTelemetryEnvelope[] => {
  const latest = new Map<string, OperationalTelemetryEnvelope>();
  for (const item of items) {
    const key = `${item.deviceType}:${item.deviceId}`;
    const previous = latest.get(key);
    if (!previous || item.observedAt > previous.observedAt) latest.set(key, item);
  }
  return [...latest.values()];
};

export class BranchOperationalSnapshotService {
  private readonly cache = new Map<string, { snapshot: BranchOperationalSnapshot; cachedAt: number }>();

  constructor(private readonly store: ControlPlaneStore) {}

  async getBranchSnapshot(tenantId: string, branchId: string, forceRefresh = false): Promise<BranchOperationalSnapshot | null> {
    const cacheKey = `${tenantId}:${branchId}`;
    if (forceRefresh) this.cache.delete(cacheKey);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < 30_000) return cached.snapshot;
    const snapshot = await this.getSnapshot(tenantId, branchId);
    if (snapshot) this.cache.set(cacheKey, { snapshot, cachedAt: Date.now() });
    return snapshot;
  }

  clearCache(tenantId: string, branchId: string): void {
    this.cache.delete(`${tenantId}:${branchId}`);
  }

  async getBranchCameras(
    tenantId: string,
    branchId: string,
    filter: "all" | "online" | "offline" | "recording" | "not-recording" | "problem" = "all",
  ): Promise<{ cameras: CameraOperationalStatus[]; summary: BranchOperationalSnapshot["cameras"] }> {
    const snapshot = await this.getBranchSnapshot(tenantId, branchId);
    let cameras = snapshot?.cameraList ?? [];
    if (filter === "online") cameras = cameras.filter((camera) => camera.onlineStatus === "online");
    if (filter === "offline") cameras = cameras.filter((camera) => camera.onlineStatus === "offline");
    if (filter === "recording") cameras = cameras.filter((camera) => camera.recordingStatus === "recording");
    if (filter === "not-recording") cameras = cameras.filter((camera) => camera.recordingStatus !== "recording");
    if (filter === "problem") cameras = cameras.filter((camera) => !["LIVE", "ONLINE"].includes(camera.state));
    return {
      cameras,
      summary: snapshot?.cameras ?? {
        total: 0, online: 0, offline: 0, recording: 0, notRecording: 0, streamLoss: 0,
        videoLoss: 0, healthyCount: 0, warningCount: 0, criticalCount: 0, state: "UNKNOWN",
      },
    };
  }

  async getBranchEvents(branchId: string, options: { limit?: number; offset?: number; severity?: "INFO" | "WARNING" | "HIGH" | "CRITICAL"; type?: string } = {}) {
    const branch = await this.store.getNode(branchId);
    if (!branch) return { events: [], total: 0 };
    const snapshot = await this.getBranchSnapshot(branch.tenantId, branchId);
    let events = snapshot?.recentEvents ?? [];
    if (options.severity) events = events.filter((event) => event.severity === options.severity);
    if (options.type) events = events.filter((event) => event.type === options.type);
    const total = events.length;
    const offset = options.offset ?? 0;
    return { events: events.slice(offset, offset + (options.limit ?? 50)), total };
  }

  async getSnapshot(tenantId: string, branchId: string): Promise<BranchOperationalSnapshot | null> {
    const branch = await this.store.getNode(branchId);
    if (!branch || branch.type !== "branch" || branch.tenantId !== tenantId) return null;

    const [cameras, edgeAgents, rawTelemetry, branchPolicy, tenantPolicy] = await Promise.all([
      this.store.listCamerasByBranch({ id: "system", tenantId, role: "admin" } as never, branchId, "live:view"),
      this.store.listEdgeAgentsByBranch(branchId),
      this.store.listLatestOperationalTelemetry(tenantId, [branchId]),
      this.store.getOperationalHealthPolicy(tenantId, branchId),
      this.store.getOperationalHealthPolicy(tenantId),
    ]);
    const policy = branchPolicy ?? tenantPolicy ?? defaultOperationalHealthPolicy;
    const telemetry = latestTelemetry(rawTelemetry);
    const byDevice = new Map(telemetry.map((item) => [`${item.deviceType}:${item.deviceId}`, item]));
    const computedAt = new Date().toISOString();
    const reasons: BranchHealthReason[] = [];

    const cameraList: CameraOperationalStatus[] = cameras.map((camera) => {
      const observed = byDevice.get(`camera:${camera.id}`);
      const health = mapHealth(telemetryStatus(observed, policy));
      const onlineStatus = health === "CRITICAL" ? "offline" : health === "UNKNOWN" ? "unknown" : "online";
      const streamAvailable = observed?.metrics.streamActive === true;
      const rawRecording = metricString(observed, "recordingStatus")?.toLowerCase();
      const recordingStatus: CameraOperationalStatus["recordingStatus"] = rawRecording === "recording"
        ? "recording" : rawRecording === "stopped" || rawRecording === "not_recording"
          ? "stopped" : rawRecording === "error" || rawRecording === "failed" ? "error" : "unknown";
      const retentionDays = metricNumber(observed, "retentionDays");
      const retentionState: RetentionState = retentionDays === undefined ? "UNKNOWN"
        : retentionDays >= policy.retentionDays ? "COMPLIANT"
          : retentionDays >= Math.max(0, policy.retentionDays - policy.retentionWarningDays) ? "WARNING" : "VIOLATION";
      const state: CameraOperationalState = health === "UNKNOWN" ? "UNKNOWN" : health === "CRITICAL" ? "OFFLINE"
        : observed?.metrics.streamActive === false ? "STREAM_LOSS"
          : recordingStatus === "stopped" || recordingStatus === "error" ? "NO_RECORD"
            : streamAvailable && recordingStatus === "recording" ? "LIVE" : "ONLINE";
      if (health === "CRITICAL") reasons.push({
        code: "CAMERA_UNAVAILABLE", severity: "CRITICAL", component: "CAMERA",
        message: `${camera.name} has critical or expired telemetry`, affectedCameras: [camera.id], impactLevel: "HIGH",
      });
      if (retentionState === "VIOLATION") reasons.push({
        code: "RETENTION_VIOLATION", severity: "CRITICAL", component: "RETENTION",
        message: `${camera.name} is below the configured retention policy`, affectedCameras: [camera.id], impactLevel: "HIGH",
      });
      return {
        id: camera.id,
        name: camera.name,
        channelNumber: `CH-${String(camera.channel).padStart(2, "0")}`,
        state,
        healthScore: scoreForHealth(health) ?? 0,
        onlineStatus,
        streamAvailable,
        recordingStatus,
        lastRecordingAt: metricString(observed, "lastRecordingAt"),
        recordingGapSeconds: metricNumber(observed, "recordingGapSeconds"),
        retentionDays,
        retentionState,
        currentFps: metricNumber(observed, "fps"),
        expectedFps: camera.specifications?.frameRate,
        latencyMs: metricNumber(observed, "responseTimeMs") ?? metricNumber(observed, "latencyMs"),
        videoLoss: observed?.metrics.videoLoss === true,
        tamperingDetected: observed?.metrics.tamperingDetected === true,
        imageFrozen: observed?.metrics.imageFrozen === true,
        blackScreen: observed?.metrics.blackScreen === true,
        ptzSupported: camera.capabilities.ptz,
        audioSupported: camera.capabilities.audio,
        lastHeartbeat: observed?.observedAt ?? camera.lastSeenAt,
        observedAt: observed?.observedAt ?? camera.lastSeenAt ?? "",
      };
    });

    const cameraHealth = aggregateHealth(cameraList.map((camera) => camera.onlineStatus === "online" ? "HEALTHY" : camera.onlineStatus === "offline" ? "CRITICAL" : "UNKNOWN"));
    const cameraSummary: BranchOperationalSnapshot["cameras"] = {
      total: cameraList.length,
      online: cameraList.filter((camera) => camera.onlineStatus === "online").length,
      offline: cameraList.filter((camera) => camera.onlineStatus === "offline").length,
      recording: cameraList.filter((camera) => camera.recordingStatus === "recording").length,
      notRecording: cameraList.filter((camera) => ["stopped", "error"].includes(camera.recordingStatus)).length,
      streamLoss: cameraList.filter((camera) => camera.state === "STREAM_LOSS").length,
      videoLoss: cameraList.filter((camera) => camera.videoLoss).length,
      healthyCount: cameraList.filter((camera) => camera.onlineStatus === "online" && ["LIVE", "ONLINE"].includes(camera.state)).length,
      warningCount: cameraList.filter((camera) => ["NO_RECORD", "STREAM_LOSS"].includes(camera.state)).length,
      criticalCount: cameraList.filter((camera) => camera.state === "OFFLINE").length,
      state: cameraHealth,
    };

    const recorderItems = telemetry.filter((item) => item.deviceType === "recorder");
    const recorders = recorderItems.map((item) => {
      const health = mapHealth(telemetryStatus(item, policy));
      const state = recorderState(health);
      const reportedType = metricString(item, "type");
      const type = (["DVR", "NVR", "Hybrid", "Server"] as const).find((candidate) => candidate.toLowerCase() === reportedType?.toLowerCase()) ?? "Unknown";
      return {
        id: item.deviceId,
        name: metricString(item, "name") ?? item.deviceId,
        type,
        state,
        online: state === "ONLINE" || state === "DEGRADED",
        lastHeartbeat: item.observedAt,
        uptimeSeconds: metricNumber(item, "uptimeSeconds"),
        totalChannels: metricNumber(item, "totalChannels") ?? 0,
        activeChannels: metricNumber(item, "activeChannels") ?? 0,
        recordingChannels: metricNumber(item, "recordingChannels") ?? 0,
        observedAt: item.observedAt,
      };
    });
    const recorderHealth = aggregateHealth(recorderItems.map((item) => mapHealth(telemetryStatus(item, policy))));
    for (const recorder of recorders.filter((item) => item.state === "OFFLINE")) reasons.push({
      code: "RECORDER_UNAVAILABLE", severity: "CRITICAL", component: "RECORDER",
      message: `Recorder ${recorder.name} has critical or expired telemetry`, affectedRecorders: [recorder.id], impactLevel: "HIGH",
    });

    const diskItems = telemetry.filter((item) => item.deviceType === "disk");
    const diskStatuses = diskItems.map((item) => {
      const smart = metricString(item, "smartStatus")?.toLowerCase();
      const normalized: "healthy" | "warning" | "failure_predicted" | "failed" | "unknown" =
        smart === "healthy" || smart === "warning" || smart === "failure_predicted" || smart === "failed" ? smart : "unknown";
      return { item, normalized };
    });
    const storageState: StorageState = diskStatuses.length === 0 ? "UNKNOWN"
      : diskStatuses.some(({ normalized }) => normalized === "failed" || normalized === "failure_predicted") ? "CRITICAL"
        : diskStatuses.some(({ normalized }) => normalized === "warning") ? "WARNING"
          : diskStatuses.every(({ normalized }) => normalized === "healthy") ? "HEALTHY" : "UNKNOWN";
    const criticalDisks = diskStatuses.filter(({ normalized }) => normalized !== "healthy" && normalized !== "unknown").map(({ item, normalized }) => ({
      id: item.deviceId,
      devicePath: metricString(item, "devicePath") ?? "",
      serialNumber: metricString(item, "serialNumber"),
      model: metricString(item, "model"),
      smartStatus: normalized,
      temperature: metricNumber(item, "temperature"),
      reallocatedSectors: metricNumber(item, "reallocatedSectors"),
      pendingSectors: metricNumber(item, "pendingSectors"),
      uncorrectableSectors: metricNumber(item, "uncorrectableSectors"),
      failureProbability: metricNumber(item, "failureProbability"),
      capacityGB: metricNumber(item, "capacityGB"),
      usedGB: metricNumber(item, "usedGB"),
      lastCheck: item.observedAt,
    }));
    for (const disk of criticalDisks) reasons.push({
      code: disk.smartStatus === "warning" ? "DISK_WARNING" : "DISK_FAILURE",
      severity: disk.smartStatus === "warning" ? "WARNING" : "CRITICAL",
      component: "STORAGE", message: `Disk ${disk.id} reported ${disk.smartStatus}`,
      affectedDisks: [disk.id], impactLevel: disk.smartStatus === "warning" ? "MEDIUM" : "HIGH",
    });
    const capacities = diskItems.map((item) => ({ total: metricNumber(item, "capacityGB"), used: metricNumber(item, "usedGB") }));
    const knownCapacities = capacities.filter((item): item is { total: number; used: number } => item.total !== undefined && item.used !== undefined);
    const totalGB = knownCapacities.reduce((sum, item) => sum + item.total, 0);
    const usedGB = knownCapacities.reduce((sum, item) => sum + item.used, 0);

    const networkItems = telemetry.filter((item) => item.deviceType === "network");
    const primary = networkItems.find((item) => item.metrics.role !== "backup") ?? networkItems[0];
    const secondary = networkItems.find((item) => item.metrics.role === "backup");
    const primaryState = connectivityState(mapHealth(telemetryStatus(primary, policy)));
    const secondaryState = secondary ? connectivityState(mapHealth(telemetryStatus(secondary, policy))) : undefined;
    const networkState: ConnectivityState = primaryState === "OFFLINE" && secondaryState === "ONLINE" ? "FAILOVER" : primaryState;
    if (networkState === "OFFLINE") reasons.push({
      code: "NETWORK_UNAVAILABLE", severity: "CRITICAL", component: "NETWORK",
      message: "Observed branch network telemetry is offline", impactLevel: "HIGH",
    });
    const onlineEdge = edgeAgents.find((agent) => agent.status === "online");

    const retentionObserved = cameraList.filter((camera) => camera.retentionDays !== undefined);
    const retentionState: RetentionState = retentionObserved.length === 0 ? "UNKNOWN"
      : retentionObserved.some((camera) => camera.retentionState === "VIOLATION") ? "VIOLATION"
        : retentionObserved.some((camera) => camera.retentionState === "WARNING") ? "WARNING" : "COMPLIANT";
    const retentionDays = retentionObserved.map((camera) => camera.retentionDays as number).sort((a, b) => a - b);

    const componentStates: HealthState[] = [cameraHealth, recorderHealth, storageState,
      networkState === "ONLINE" ? "HEALTHY" : networkState === "DEGRADED" || networkState === "FAILOVER" ? "WARNING" : networkState === "OFFLINE" ? "CRITICAL" : "UNKNOWN",
      retentionState === "COMPLIANT" ? "HEALTHY" : retentionState === "WARNING" ? "WARNING" : retentionState === "VIOLATION" ? "CRITICAL" : "UNKNOWN"];
    const overallState = aggregateHealth(componentStates);
    const componentScores = componentStates.flatMap((state) => {
      const score = scoreForHealth(state);
      return score === undefined ? [] : [score];
    });
    const latestObservedAt = telemetry.map((item) => item.observedAt).sort().at(-1);
    const latestAgeSeconds = latestObservedAt ? Math.max(0, (Date.now() - Date.parse(latestObservedAt)) / 1000) : Number.POSITIVE_INFINITY;
    const telemetryFreshness: TelemetryFreshness = latestAgeSeconds <= policy.staleAfterSeconds ? "CURRENT"
      : latestAgeSeconds <= policy.offlineAfterSeconds ? "RECENT" : latestAgeSeconds <= 86_400 ? "STALE" : "OUTDATED";
    const recentEvents = telemetry.flatMap((item) => item.reasonCodes.map((reasonCode) => {
      const health = mapHealth(telemetryStatus(item, policy));
      return {
        id: `${item.idempotencyKey}:${reasonCode}`,
        type: "TELEMETRY_REASON",
        severity: health === "CRITICAL" ? "CRITICAL" as const : health === "WARNING" ? "WARNING" as const : "INFO" as const,
        title: reasonCode,
        description: `${item.deviceType} ${item.deviceId} reported ${reasonCode}`,
        timestamp: item.observedAt,
      };
    })).sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 20);

    return {
      branchId,
      branchCode: String((branch as { code?: string }).code ?? branch.id),
      branchName: branch.name,
      regionId: (branch as { regionId?: string }).regionId,
      regionName: (branch as { regionName?: string }).regionName,
      overallState,
      healthScore: componentScores.length > 0 ? Math.round(componentScores.reduce((sum, score) => sum + score, 0) / componentScores.length) : 0,
      reasonCodes: reasons.map((reason) => reason.code),
      reasons,
      primaryReason: reasons[0],
      cameras: cameraSummary,
      recorders: {
        total: recorders.length,
        online: recorders.filter((item) => item.state === "ONLINE").length,
        offline: recorders.filter((item) => item.state === "OFFLINE").length,
        degraded: recorders.filter((item) => item.state === "DEGRADED").length,
        state: recorderHealth,
        recorders,
      },
      storage: {
        state: storageState,
        disks: {
          total: diskStatuses.length,
          healthy: diskStatuses.filter(({ normalized }) => normalized === "healthy").length,
          warning: diskStatuses.filter(({ normalized }) => normalized === "warning").length,
          failed: diskStatuses.filter(({ normalized }) => normalized === "failed" || normalized === "failure_predicted").length,
          unknown: diskStatuses.filter(({ normalized }) => normalized === "unknown").length,
        },
        capacity: knownCapacities.length > 0 && totalGB > 0 ? {
          totalGB, usedGB, availableGB: Math.max(0, totalGB - usedGB), usagePercent: Math.round((usedGB / totalGB) * 1000) / 10,
        } : undefined,
        criticalDisks,
        observedAt: diskItems.map((item) => item.observedAt).sort().at(-1),
      },
      retention: {
        requiredDays: policy.retentionDays,
        minimumVerifiedDays: retentionDays[0],
        medianVerifiedDays: retentionDays.length > 0 ? retentionDays[Math.floor(retentionDays.length / 2)] : undefined,
        compliantChannels: cameraList.filter((camera) => camera.retentionState === "COMPLIANT").length,
        warningChannels: cameraList.filter((camera) => camera.retentionState === "WARNING").length,
        violatingChannels: cameraList.filter((camera) => camera.retentionState === "VIOLATION").length,
        unknownChannels: cameraList.filter((camera) => camera.retentionState === "UNKNOWN").length,
        state: retentionState,
        confidence: retentionObserved.length === 0 ? 0 : retentionObserved.length / Math.max(1, cameraList.length),
        affectedCameras: cameraList.filter((camera) => camera.retentionState === "WARNING" || camera.retentionState === "VIOLATION").map((camera) => ({
          cameraId: camera.id, cameraName: camera.name, actualDays: camera.retentionDays as number,
          gapDays: Math.max(0, policy.retentionDays - (camera.retentionDays as number)),
          severity: camera.retentionState === "VIOLATION" ? "CRITICAL" as const : "WARNING" as const,
        })),
        observedAt: retentionObserved.map((camera) => camera.observedAt).filter(Boolean).sort().at(-1),
      },
      network: {
        state: networkState,
        primaryWan: {
          state: primaryState,
          latencyMs: metricNumber(primary, "latencyMs"),
          packetLossPct: metricNumber(primary, "packetLossPercent"),
          bandwidthMbps: metricNumber(primary, "bandwidthMbps"),
        },
        secondaryWan: secondary && secondaryState ? {
          state: secondaryState,
          latencyMs: metricNumber(secondary, "latencyMs"),
          packetLossPct: metricNumber(secondary, "packetLossPercent"),
        } : undefined,
        gateway: onlineEdge ? {
          reachable: true,
          ipAddress: metricString(primary, "gatewayIp"),
          lastSeenAt: onlineEdge.lastSeenAt ?? undefined,
        } : edgeAgents.length > 0 ? { reachable: false, lastSeenAt: edgeAgents.map((agent) => agent.lastSeenAt).filter((value): value is string => Boolean(value)).sort().at(-1) } : undefined,
        vpn: primary?.metrics.vpnConnected === true ? {
          connected: true,
          lastEstablishedAt: metricString(primary, "vpnEstablishedAt"),
        } : primary?.metrics.vpnConnected === false ? { connected: false } : undefined,
        edgeAgent: onlineEdge ? { connected: true, version: onlineEdge.version, lastHeartbeat: onlineEdge.lastSeenAt ?? undefined }
          : edgeAgents.length > 0 ? { connected: false, version: edgeAgents[0]?.version, lastHeartbeat: edgeAgents[0]?.lastSeenAt ?? undefined } : undefined,
        latencyMs: metricNumber(primary, "latencyMs"),
        packetLossPct: metricNumber(primary, "packetLossPercent"),
        observedAt: primary?.observedAt ?? "",
      },
      alerts: { p1Count: 0, p2Count: 0, p3Count: 0, unacknowledgedCount: 0, activeCount: 0, recentCritical: [] },
      telemetryFreshness,
      lastTelemetryAt: latestObservedAt,
      observedAt: latestObservedAt ?? "",
      computedAt,
      cameraList,
      recentEvents,
    };
  }
}
