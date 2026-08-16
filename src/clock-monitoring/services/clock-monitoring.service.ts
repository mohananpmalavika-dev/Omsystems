import type {
  BranchClockHealth,
  CameraRecorderClockComparison,
  ClockEvidence,
  ClockHealthState,
  ClockSyncAuditEntry,
  FleetClockSummary,
} from "../domain/clock-monitoring.types.js";
import { ClockOffsetEstimator } from "./clock-offset-estimator.js";

export const APPROVED_NTP_SERVERS = new Set([
  "time.bank.internal",
  "10.100.1.5",
  "10.100.1.6",
  "ntp.bank.corp",
  "edge-gateway.local",
]);

export class ClockMonitoringService {
  private readonly deviceEvidence = new Map<string, ClockEvidence>();
  private readonly deviceHistory = new Map<string, ClockEvidence[]>();
  private readonly auditLog: ClockSyncAuditEntry[] = [];
  private readonly failureCounts = new Map<string, number>();

  constructor() {
    this.seedDefaultBranchClocks();
  }

  async recordEvidence(evidence: ClockEvidence): Promise<ClockEvidence> {
    const isWhitelisted = evidence.ntpServer ? APPROVED_NTP_SERVERS.has(evidence.ntpServer) : false;

    // Check drift rate against previous observation
    const history = this.deviceHistory.get(evidence.deviceId) ?? [];
    let driftRateSecondsPerHour: number | undefined = undefined;

    const prev = history.length > 0 ? history[history.length - 1] : undefined;
    if (prev !== undefined) {
      const prevOffset = prev.signedOffsetSeconds;
      const prevObservedAt = prev.observedAt;
      driftRateSecondsPerHour = ClockOffsetEstimator.calculateDriftRate(
        { offsetSeconds: prevOffset, observedAt: prevObservedAt },
        { offsetSeconds: evidence.signedOffsetSeconds, observedAt: evidence.observedAt },
      );
    }

    // Anti-flapping hysteresis: require 2 consecutive degraded samples before confirming warning/critical
    let effectiveHealth = evidence.healthState;
    if (evidence.healthState !== "SYNCHRONIZED") {
      const currentFailures = (this.failureCounts.get(evidence.deviceId) ?? 0) + 1;
      this.failureCounts.set(evidence.deviceId, currentFailures);
      if (currentFailures < 2 && prev !== undefined && prev.healthState === "SYNCHRONIZED") {
        // Suppress initial transient spike
        effectiveHealth = "SYNCHRONIZED";
      }
    } else {
      this.failureCounts.set(evidence.deviceId, 0);
    }

    const updated: ClockEvidence = {
      ...evidence,
      ntpWhitelisted: isWhitelisted,
      driftRateSecondsPerHour,
      healthState: effectiveHealth,
    };

    this.deviceEvidence.set(evidence.deviceId, updated);

    // Maintain historical observations (capped at 500 per device)
    history.push(updated);
    if (history.length > 500) history.shift();
    this.deviceHistory.set(evidence.deviceId, history);

    return updated;
  }

  async getBranchClockHealth(branchId: string): Promise<BranchClockHealth | null> {
    const all = Array.from(this.deviceEvidence.values()).filter((e) => e.branchId === branchId);
    if (!all.length) return null;

    const gateway = all.find((e) => e.deviceType === "GATEWAY");
    const recorders = all.filter((e) => e.deviceType === "RECORDER");
    const cameras = all.filter((e) => e.deviceType === "CAMERA");

    // Camera to Recorder cross-comparison
    const comparisons: CameraRecorderClockComparison[] = [];
    const primaryRecorder = recorders[0];
    if (primaryRecorder) {
      for (const cam of cameras) {
        const deltaSec = Math.round(((cam.deviceTime.getTime() - primaryRecorder.deviceTime.getTime()) / 1000) * 100) / 100;
        comparisons.push({
          cameraId: cam.deviceId,
          cameraName: cam.deviceName,
          recorderId: primaryRecorder.deviceId,
          cameraTime: cam.deviceTime,
          recorderTime: primaryRecorder.deviceTime,
          relativeOffsetSeconds: deltaSec,
        });
      }
    }

    const maxDriftSeconds = Math.max(...all.map((e) => e.absoluteOffsetSeconds), 0);
    const criticalDevicesCount = all.filter((e) => e.healthState === "CRITICAL").length;
    const warningDevicesCount = all.filter((e) => e.healthState === "WARNING").length;
    const synchronizedDevicesCount = all.filter((e) => e.healthState === "SYNCHRONIZED").length;
    const unapprovedNtpCount = all.filter((e) => !e.ntpWhitelisted && !!e.ntpServer).length;
    const timezoneMismatchCount = all.filter((e) => e.timezoneMismatch).length;

    let overallState: ClockHealthState = "SYNCHRONIZED";
    if (criticalDevicesCount > 0) overallState = "CRITICAL";
    else if (warningDevicesCount > 0 || timezoneMismatchCount > 0) overallState = "WARNING";

    return {
      branchId,
      branchName: `Branch ${branchId}`,
      overallState,
      gateway,
      recorders,
      cameras,
      cameraRecorderComparisons: comparisons,
      maxDriftSeconds,
      criticalDevicesCount,
      warningDevicesCount,
      synchronizedDevicesCount,
      unapprovedNtpCount,
      timezoneMismatchCount,
      lastEvaluatedAt: new Date(),
    };
  }

  async getFleetClockSummary(): Promise<FleetClockSummary> {
    const all = Array.from(this.deviceEvidence.values());
    const branchIds = Array.from(new Set(all.map((e) => e.branchId)));

    let compliantBranches = 0;
    let warningBranches = 0;
    let criticalBranches = 0;

    for (const bId of branchIds) {
      const bHealth = await this.getBranchClockHealth(bId);
      if (bHealth?.overallState === "SYNCHRONIZED") compliantBranches++;
      else if (bHealth?.overallState === "WARNING") warningBranches++;
      else if (bHealth?.overallState === "CRITICAL") criticalBranches++;
    }

    const synchronizedDevices = all.filter((e) => e.healthState === "SYNCHRONIZED").length;
    const warningDevices = all.filter((e) => e.healthState === "WARNING").length;
    const criticalDevices = all.filter((e) => e.healthState === "CRITICAL").length;
    const unapprovedNtpDevices = all.filter((e) => !e.ntpWhitelisted && !!e.ntpServer).length;
    const timezoneMismatchDevices = all.filter((e) => e.timezoneMismatch).length;

    const worst = [...all]
      .sort((a, b) => b.absoluteOffsetSeconds - a.absoluteOffsetSeconds)
      .slice(0, 5)
      .map((e) => ({
        deviceId: e.deviceId,
        deviceName: e.deviceName,
        branchId: e.branchId,
        offsetSeconds: e.signedOffsetSeconds,
        healthState: e.healthState,
      }));

    return {
      totalBranches: branchIds.length,
      compliantBranches,
      warningBranches,
      criticalBranches,
      totalDevices: all.length,
      synchronizedDevices,
      warningDevices,
      criticalDevices,
      unapprovedNtpDevices,
      timezoneMismatchDevices,
      worstDriftDevices: worst,
    };
  }

  async getDeviceHistory(deviceId: string, limit = 50): Promise<ClockEvidence[]> {
    const hist = this.deviceHistory.get(deviceId) ?? [];
    return hist.slice(-limit);
  }

  async syncDeviceClock(params: {
    deviceId: string;
    branchId: string;
    action: "NTP_TRIGGER" | "MANUAL_SET_TIME" | "AUTO_CORRECT";
    initiatedByUserId: string;
    reason: string;
  }): Promise<{ success: boolean; auditEntry: ClockSyncAuditEntry }> {
    const existing = this.deviceEvidence.get(params.deviceId);
    const prevOffset = existing?.signedOffsetSeconds ?? 0;

    // Simulate clock correction
    const now = new Date();
    if (existing) {
      existing.deviceTime = now;
      existing.referenceTime = now;
      existing.signedOffsetSeconds = 0.05;
      existing.absoluteOffsetSeconds = 0.05;
      existing.healthState = "SYNCHRONIZED";
      existing.lastSyncAt = now;
      existing.ntpSynchronized = true;
      existing.observedAt = now;
      await this.recordEvidence(existing);
    }

    const auditEntry: ClockSyncAuditEntry = {
      id: `audit-sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      deviceId: params.deviceId,
      branchId: params.branchId,
      action: params.action,
      initiatedByUserId: params.initiatedByUserId,
      previousOffsetSeconds: prevOffset,
      newOffsetSeconds: 0.05,
      reason: params.reason,
      timestamp: now,
    };

    this.auditLog.push(auditEntry);
    return { success: true, auditEntry };
  }

  async listAuditEntries(limit = 100): Promise<ClockSyncAuditEntry[]> {
    return this.auditLog.slice(-limit);
  }

  private seedDefaultBranchClocks() {
    const now = new Date();

    // 1. Branch Thrissur 14 (Fully Synchronized)
    this.recordEvidence({
      deviceId: "gw-thrissur-14",
      deviceName: "Edge Gateway Thrissur 14",
      deviceType: "GATEWAY",
      branchId: "branch-thrissur-14",
      deviceTime: now,
      referenceTime: now,
      roundTripTimeMs: 4,
      signedOffsetSeconds: 0.02,
      absoluteOffsetSeconds: 0.02,
      ntpServer: "time.bank.internal",
      ntpSynchronized: true,
      ntpWhitelisted: true,
      lastSyncAt: new Date(now.getTime() - 120_000),
      configuredTimezone: "Asia/Kolkata",
      timezoneOffsetMinutes: 330,
      timezoneMismatch: false,
      healthState: "SYNCHRONIZED",
      source: "EDGE_SYSTEM",
      observedAt: now,
    });

    this.recordEvidence({
      deviceId: "nvr-thrissur-14",
      deviceName: "Main Vault NVR",
      deviceType: "RECORDER",
      branchId: "branch-thrissur-14",
      deviceTime: new Date(now.getTime() + 800),
      referenceTime: now,
      roundTripTimeMs: 12,
      signedOffsetSeconds: 0.8,
      absoluteOffsetSeconds: 0.8,
      ntpServer: "time.bank.internal",
      ntpSynchronized: true,
      ntpWhitelisted: true,
      lastSyncAt: new Date(now.getTime() - 300_000),
      configuredTimezone: "Asia/Kolkata",
      timezoneOffsetMinutes: 330,
      timezoneMismatch: false,
      healthState: "SYNCHRONIZED",
      source: "DAHUA_CGI",
      observedAt: now,
    });

    this.recordEvidence({
      deviceId: "cam-thrissur-01",
      deviceName: "Vault CAM 01",
      deviceType: "CAMERA",
      branchId: "branch-thrissur-14",
      deviceTime: new Date(now.getTime() + 1200),
      referenceTime: now,
      roundTripTimeMs: 16,
      signedOffsetSeconds: 1.2,
      absoluteOffsetSeconds: 1.2,
      ntpServer: "time.bank.internal",
      ntpSynchronized: true,
      ntpWhitelisted: true,
      lastSyncAt: new Date(now.getTime() - 600_000),
      configuredTimezone: "Asia/Kolkata",
      timezoneOffsetMinutes: 330,
      timezoneMismatch: false,
      healthState: "SYNCHRONIZED",
      source: "ONVIF",
      observedAt: now,
    });

    // 2. Branch Kochi 08 (Camera Drift Warning: 14s)
    this.recordEvidence({
      deviceId: "gw-kochi-08",
      deviceName: "Edge Gateway Kochi 08",
      deviceType: "GATEWAY",
      branchId: "branch-kochi-08",
      deviceTime: now,
      referenceTime: now,
      roundTripTimeMs: 5,
      signedOffsetSeconds: 0.05,
      absoluteOffsetSeconds: 0.05,
      ntpServer: "time.bank.internal",
      ntpSynchronized: true,
      ntpWhitelisted: true,
      timezoneMismatch: false,
      healthState: "SYNCHRONIZED",
      source: "EDGE_SYSTEM",
      observedAt: now,
    });

    this.recordEvidence({
      deviceId: "nvr-kochi-08",
      deviceName: "Kochi NVR 01",
      deviceType: "RECORDER",
      branchId: "branch-kochi-08",
      deviceTime: new Date(now.getTime() + 2100),
      referenceTime: now,
      roundTripTimeMs: 14,
      signedOffsetSeconds: 2.1,
      absoluteOffsetSeconds: 2.1,
      ntpServer: "time.bank.internal",
      ntpSynchronized: true,
      ntpWhitelisted: true,
      timezoneMismatch: false,
      healthState: "SYNCHRONIZED",
      source: "DAHUA_CGI",
      observedAt: now,
    });

    this.recordEvidence({
      deviceId: "cam-kochi-04",
      deviceName: "Lobby CAM 04",
      deviceType: "CAMERA",
      branchId: "branch-kochi-08",
      deviceTime: new Date(now.getTime() + 14500),
      referenceTime: now,
      roundTripTimeMs: 22,
      signedOffsetSeconds: 14.5,
      absoluteOffsetSeconds: 14.5,
      ntpServer: "pool.ntp.org", // UNAPPROVED NTP SERVER
      ntpSynchronized: false,
      ntpWhitelisted: false,
      timezoneMismatch: false,
      healthState: "WARNING",
      source: "ONVIF",
      observedAt: now,
    });

    // 3. Branch Kannur 04 (Critical Drift: 48s + Timezone Mismatch UTC vs IST)
    this.recordEvidence({
      deviceId: "nvr-kannur-04",
      deviceName: "Kannur NVR 01",
      deviceType: "RECORDER",
      branchId: "branch-kannur-04",
      deviceTime: new Date(now.getTime() + 48000),
      referenceTime: now,
      roundTripTimeMs: 18,
      signedOffsetSeconds: 48.0,
      absoluteOffsetSeconds: 48.0,
      ntpServer: "10.100.1.5",
      ntpSynchronized: false,
      ntpWhitelisted: true,
      timezoneMismatch: true,
      healthState: "CRITICAL",
      source: "DAHUA_CGI",
      observedAt: now,
    });
  }
}

export const clockMonitoringService = new ClockMonitoringService();
