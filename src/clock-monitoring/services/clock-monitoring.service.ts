import type {
  BranchClockHealth,
  CameraRecorderClockComparison,
  ClockEvidence,
  ClockHealthState,
  ClockSyncAuditEntry,
  EvidenceClockManifest,
  FleetClockSummary,
} from "../domain/clock-monitoring.types.js";
import { ClockOffsetEstimator } from "./clock-offset-estimator.js";

export const APPROVED_NTP_SERVERS = new Set(
  (process.env.APPROVED_NTP_SERVERS ?? "")
    .split(",")
    .map((server) => server.trim())
    .filter(Boolean),
);

export class ClockMonitoringService {
  private readonly deviceEvidence = new Map<string, ClockEvidence>();
  private readonly deviceHistory = new Map<string, ClockEvidence[]>();
  private readonly auditLog: ClockSyncAuditEntry[] = [];

  constructor() {}

  /**
   * Determine health state based on strict bank surveillance threshold rules:
   * < 5s -> HEALTHY
   * 5–30s -> WARNING
   * > 30s -> CRITICAL
   */
  classifyOffsetHealth(absoluteOffsetSeconds: number): ClockHealthState {
    if (absoluteOffsetSeconds < 5) return "HEALTHY";
    if (absoluteOffsetSeconds <= 30) return "WARNING";
    return "CRITICAL";
  }

  async recordEvidence(evidence: ClockEvidence): Promise<ClockEvidence> {
    const isWhitelisted = evidence.ntpServer ? APPROVED_NTP_SERVERS.has(evidence.ntpServer) : false;
    const classifiedHealth = this.classifyOffsetHealth(evidence.absoluteOffsetSeconds);

    const history = this.deviceHistory.get(evidence.deviceId) ?? [];
    let driftRateSecondsPerHour: number | undefined = undefined;

    const prev = history.length > 0 ? history[history.length - 1] : undefined;
    if (prev !== undefined) {
      driftRateSecondsPerHour = ClockOffsetEstimator.calculateDriftRate(
        { offsetSeconds: prev.signedOffsetSeconds, observedAt: prev.observedAt },
        { offsetSeconds: evidence.signedOffsetSeconds, observedAt: evidence.observedAt },
      );
    }

    const updated: ClockEvidence = {
      ...evidence,
      ntpWhitelisted: isWhitelisted,
      driftRateSecondsPerHour,
      healthState: classifiedHealth,
    };

    this.deviceEvidence.set(evidence.deviceId, updated);

    history.push(updated);
    if (history.length > 500) history.shift();
    this.deviceHistory.set(evidence.deviceId, history);

    return updated;
  }

  async getBranchClockHealth(branchId: string): Promise<BranchClockHealth | null> {
    const all = Array.from(this.deviceEvidence.values()).filter((e) => e.branchId === branchId);
    if (!all.length) return null;

    const gateway = all.find((e) => e.deviceType === "GATEWAY");
    const recorder = all.find((e) => e.deviceType === "RECORDER");
    const ho = all.find((e) => e.deviceType === "HO_TIME_SERVER");

    const maxOffset = Math.max(...all.map((e) => e.absoluteOffsetSeconds), 0);
    const jitterSamples = all.flatMap((e) => e.jitterMs === undefined ? [] : [e.jitterMs]);
    const avgJitter = jitterSamples.length > 0
      ? jitterSamples.reduce((acc, jitter) => acc + jitter, 0) / jitterSamples.length
      : 0;

    const overallHealth = this.classifyOffsetHealth(maxOffset);

    // Comparisons between cameras and recorder
    const comparisons: CameraRecorderClockComparison[] = [];
    const cameras = all.filter((e) => e.deviceType === "CAMERA");

    for (const cam of cameras) {
      if (recorder) {
        const relativeOffset = Math.abs((cam.deviceTime.getTime() - recorder.deviceTime.getTime()) / 1000);
        comparisons.push({
          cameraId: cam.deviceId,
          cameraName: cam.deviceName,
          recorderId: recorder.deviceId,
          cameraTime: cam.deviceTime,
          recorderTime: recorder.deviceTime,
          relativeOffsetSeconds: Number(relativeOffset.toFixed(2)),
          healthState: this.classifyOffsetHealth(relativeOffset),
        });
      }
    }

    return {
      branchId,
      gatewayTime: gateway?.deviceTime,
      recorderTime: recorder?.deviceTime,
      hoTime: ho?.deviceTime,
      maxOffsetSeconds: maxOffset,
      averageJitterMs: Number(avgJitter.toFixed(1)),
      overallHealth,
      devices: all,
      comparisons,
      evaluatedAt: new Date(),
    };
  }

  async getFleetClockSummary(): Promise<FleetClockSummary> {
    const all = Array.from(this.deviceEvidence.values());
    const branches = new Set(all.map((e) => e.branchId));
    let healthy = 0;
    let warning = 0;
    let critical = 0;

    for (const bId of branches) {
      const bh = await this.getBranchClockHealth(bId);
      if (bh?.overallHealth === "HEALTHY") healthy++;
      else if (bh?.overallHealth === "WARNING") warning++;
      else critical++;
    }

    const avgOffset = all.length > 0
      ? all.reduce((acc, e) => acc + e.absoluteOffsetSeconds, 0) / all.length
      : 0;
    const lastSyncAt = all
      .flatMap((e) => e.lastSyncAt ? [e.lastSyncAt] : [])
      .sort((a, b) => b.getTime() - a.getTime())[0];

    return {
      totalBranches: branches.size,
      healthyBranches: healthy,
      warningBranches: warning,
      criticalBranches: critical,
      averageOffsetSeconds: Number(avgOffset.toFixed(2)),
      lastSyncAt,
    };
  }

  async getDeviceHistory(deviceId: string, limit = 50): Promise<ClockEvidence[]> {
    const hist = this.deviceHistory.get(deviceId) || [];
    return hist.slice(-limit);
  }

  async syncDeviceClock(
    deviceIdOrOptions: string | { deviceId: string; branchId?: string; action?: string; initiatedByUserId?: string; reason?: string; targetNtpServer?: string },
    targetNtpServer = ""
  ): Promise<{ success: boolean; deviceId: string; ntpServer: string }> {
    const deviceId = typeof deviceIdOrOptions === "string" ? deviceIdOrOptions : deviceIdOrOptions.deviceId;
    const ntp = typeof deviceIdOrOptions === "object" && deviceIdOrOptions.targetNtpServer ? deviceIdOrOptions.targetNtpServer : targetNtpServer;
    throw new Error(
      `Clock synchronization transport is not configured for ${deviceId}${ntp ? ` (${ntp})` : ""}`,
    );
  }

  async listAuditEntries(limitOrDeviceId?: number | string): Promise<ClockSyncAuditEntry[]> {
    if (typeof limitOrDeviceId === "string") return this.auditLog.filter((a) => a.deviceId === limitOrDeviceId);
    if (typeof limitOrDeviceId === "number") return this.auditLog.slice(-limitOrDeviceId);
    return [...this.auditLog];
  }

  /**
   * Build observed clock offset manifest to attach to evidentiary video clips.
   */
  async buildEvidenceClockManifest(
    evidenceId: string,
    branchId: string,
    cameraId: string,
  ): Promise<EvidenceClockManifest> {
    const cameraEvidence = this.deviceEvidence.get(cameraId);
    const branchHealth = await this.getBranchClockHealth(branchId);
    if (!cameraEvidence || !branchHealth?.hoTime || !branchHealth.gatewayTime || !branchHealth.recorderTime) {
      throw new Error(`Complete observed clock evidence is unavailable for ${branchId}/${cameraId}`);
    }
    if (!cameraEvidence.ntpServer || cameraEvidence.jitterMs === undefined) {
      throw new Error(`Camera clock source evidence is incomplete for ${cameraId}`);
    }

    const offsetSec = cameraEvidence.absoluteOffsetSeconds;
    const jitter = cameraEvidence.jitterMs;
    const status = this.classifyOffsetHealth(offsetSec);

    const forensicConfidence =
      status === "HEALTHY" ? "HIGH" : status === "WARNING" ? "MEDIUM" : "DEGRADED";

    return {
      evidenceId,
      branchId,
      cameraId,
      captureTimestamp: cameraEvidence.observedAt.toISOString(),
      hoReferenceTime: branchHealth.hoTime.toISOString(),
      gatewayTime: branchHealth.gatewayTime.toISOString(),
      nvrTime: branchHealth.recorderTime.toISOString(),
      cameraTime: cameraEvidence.deviceTime.toISOString(),
      observedOffsetSeconds: Number(offsetSec.toFixed(2)),
      jitterMs: jitter,
      ntpSource: cameraEvidence.ntpServer,
      clockHealthStatus: status as any,
      forensicTimestampConfidence: forensicConfidence,
    };
  }

  private seedDefaultBranchClocks(): void {
    const now = new Date();

    // Branch 034 - Healthy Clock (<5s)
    this.recordEvidence({
      deviceId: "cam-301-17",
      deviceName: "Vault Primary Camera",
      deviceType: "CAMERA",
      branchId: "BR-034",
      deviceTime: new Date(now.getTime() - 1200),
      referenceTime: now,
      roundTripTimeMs: 15,
      signedOffsetSeconds: -1.2,
      absoluteOffsetSeconds: 1.2,
      jitterMs: 8,
      ntpServer: "time.bank.internal",
      ntpSynchronized: true,
      ntpWhitelisted: true,
      healthState: "HEALTHY",
      source: "ONVIF",
      timezoneMismatch: false,
      observedAt: now,
    });

    this.recordEvidence({
      deviceId: "nvr-br-034",
      deviceName: "Branch Main NVR",
      deviceType: "RECORDER",
      branchId: "BR-034",
      deviceTime: new Date(now.getTime() - 800),
      referenceTime: now,
      roundTripTimeMs: 12,
      signedOffsetSeconds: -0.8,
      absoluteOffsetSeconds: 0.8,
      jitterMs: 6,
      ntpServer: "time.bank.internal",
      ntpSynchronized: true,
      ntpWhitelisted: true,
      healthState: "HEALTHY",
      source: "EDGE_SYSTEM",
      timezoneMismatch: false,
      observedAt: now,
    });

    // Branch 118 - Warning Clock (18s drift)
    this.recordEvidence({
      deviceId: "cam-118-04",
      deviceName: "Branch 118 Entrance Cam",
      deviceType: "CAMERA",
      branchId: "BR-118",
      deviceTime: new Date(now.getTime() - 18200),
      referenceTime: now,
      roundTripTimeMs: 35,
      signedOffsetSeconds: -18.2,
      absoluteOffsetSeconds: 18.2,
      jitterMs: 22,
      ntpServer: "pool.ntp.org", // Unwhitelisted
      ntpSynchronized: false,
      ntpWhitelisted: false,
      healthState: "WARNING",
      source: "DAHUA_CGI",
      timezoneMismatch: false,
      observedAt: now,
    });
  }
}

export const clockMonitoringService = new ClockMonitoringService();
