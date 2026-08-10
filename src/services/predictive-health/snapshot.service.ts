/**
 * Branch Health Snapshot Service
 * 
 * Collects and aggregates telemetry from multiple sources to create
 * a normalized health snapshot for prediction input.
 */

import { randomUUID } from "node:crypto";
import type { ControlPlaneStore } from "../../control-plane-store.js";
import type { BranchHealthSnapshot, SnapshotOptions } from "./types.js";

export class SnapshotService {
  constructor(private readonly store: ControlPlaneStore) {}

  /**
   * Generate a complete health snapshot for a branch
   */
  async generateSnapshot(
    tenantId: string,
    branchId: string,
    options: SnapshotOptions = {}
  ): Promise<BranchHealthSnapshot> {
    const timestamp = new Date();
    const now = Date.now();
    
    // Collect telemetry in parallel
    const [
      recordingData,
      storageData,
      hddData,
      networkData,
      cameraData,
      dvrData,
      historicalData,
    ] = await Promise.all([
      this.collectRecordingTelemetry(tenantId, branchId),
      this.collectStorageTelemetry(tenantId, branchId),
      this.collectHddTelemetry(tenantId, branchId),
      options.includeNetworkTelemetry !== false
        ? this.collectNetworkTelemetry(tenantId, branchId)
        : this.getDefaultNetworkData(),
      this.collectCameraTelemetry(tenantId, branchId),
      options.includeDvrTelemetry !== false
        ? this.collectDvrTelemetry(tenantId, branchId)
        : this.getDefaultDvrData(),
      options.includeHistorical !== false
        ? this.collectHistoricalData(tenantId, branchId)
        : this.getDefaultHistoricalData(),
    ]);

    // Calculate data quality
    const dataQuality = this.calculateDataQuality({
      recordingData,
      storageData,
      hddData,
      networkData,
      cameraData,
      dvrData,
      historicalData,
    });

    const snapshot: BranchHealthSnapshot = {
      branchId,
      tenantId,
      timestamp,
      recording: recordingData,
      storage: storageData,
      hdd: hddData,
      network: networkData,
      cameras: cameraData,
      dvr: dvrData,
      historical: historicalData,
      dataQuality,
    };

    // Store snapshot for future reference
    await this.storeSnapshot(snapshot);

    return snapshot;
  }

  /**
   * Collect recording telemetry
   */
  private async collectRecordingTelemetry(
    tenantId: string,
    branchId: string
  ): Promise<BranchHealthSnapshot["recording"]> {
    try {
      // Get all cameras for branch
      const cameras = await this.store.listCameras(tenantId, { branchId });
      const totalCameras = cameras.length;

      if (totalCameras === 0) {
        return {
          recordingCoverage: 0,
          camerasRecording: 0,
          camerasExpected: 0,
          recordingGaps: 0,
          retentionDays: 0,
          retentionTarget: 180, // default policy
        };
      }

      // Count cameras currently recording
      const recordingCameras = cameras.filter(
        (cam) => cam.status === "online" && cam.recordingEnabled
      ).length;

      // Get recording gaps from last 24h
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const incidents = await this.store.listIncidents(tenantId, {
        branchId,
        since: oneDayAgo,
        incidentTypes: ["video-loss", "recording-interruption"],
      });
      const recordingGaps = incidents.length;

      // Get storage retention
      const branch = await this.store.getNode(branchId);
      const retentionTarget = branch?.metadata?.retentionTarget || 180;

      // Estimate current retention from storage data
      const storageInfo = await this.getStorageInfo(tenantId, branchId);
      const retentionDays = storageInfo?.estimatedRetentionDays || 0;

      const recordingCoverage =
        totalCameras > 0 ? (recordingCameras / totalCameras) * 100 : 0;

      return {
        recordingCoverage,
        camerasRecording: recordingCameras,
        camerasExpected: totalCameras,
        recordingGaps,
        retentionDays,
        retentionTarget,
      };
    } catch (error) {
      console.error("Failed to collect recording telemetry:", error);
      return {
        recordingCoverage: 0,
        camerasRecording: 0,
        camerasExpected: 0,
        recordingGaps: 0,
        retentionDays: 0,
        retentionTarget: 180,
      };
    }
  }

  /**
   * Collect storage telemetry
   */
  private async collectStorageTelemetry(
    tenantId: string,
    branchId: string
  ): Promise<BranchHealthSnapshot["storage"]> {
    try {
      const storageInfo = await this.getStorageInfo(tenantId, branchId);

      if (!storageInfo) {
        return {
          usedPercent: 0,
          freeBytes: 0,
          totalBytes: 0,
          growthRatePerDay: 0,
          estimatedDaysRemaining: 999,
        };
      }

      const usedBytes = storageInfo.totalBytes - storageInfo.freeBytes;
      const usedPercent = (usedBytes / storageInfo.totalBytes) * 100;

      // Calculate growth rate from historical data
      const growthRatePerDay = await this.calculateStorageGrowthRate(
        tenantId,
        branchId
      );

      // Estimate days remaining
      const estimatedDaysRemaining =
        growthRatePerDay > 0
          ? Math.floor(storageInfo.freeBytes / growthRatePerDay)
          : 999;

      return {
        usedPercent,
        freeBytes: storageInfo.freeBytes,
        totalBytes: storageInfo.totalBytes,
        growthRatePerDay,
        estimatedDaysRemaining: Math.max(0, estimatedDaysRemaining),
      };
    } catch (error) {
      console.error("Failed to collect storage telemetry:", error);
      return {
        usedPercent: 0,
        freeBytes: 0,
        totalBytes: 0,
        growthRatePerDay: 0,
        estimatedDaysRemaining: 999,
      };
    }
  }

  /**
   * Collect HDD telemetry
   */
  private async collectHddTelemetry(
    tenantId: string,
    branchId: string
  ): Promise<BranchHealthSnapshot["hdd"]> {
    try {
      const hddTelemetry = await this.getHddTelemetry(tenantId, branchId);

      if (!hddTelemetry) {
        return {
          healthScore: 100,
          temperatureC: null,
          reallocatedSectors: null,
          pendingSectors: null,
          readErrors: null,
          writeErrors: null,
          powerOnHours: null,
          smartStatus: "UNKNOWN",
        };
      }

      // Calculate health score based on SMART attributes
      const healthScore = this.calculateHddHealthScore(hddTelemetry);

      return {
        healthScore,
        temperatureC: hddTelemetry.temperature || null,
        reallocatedSectors: hddTelemetry.reallocatedSectors || null,
        pendingSectors: hddTelemetry.pendingSectors || null,
        readErrors: hddTelemetry.readErrors || null,
        writeErrors: hddTelemetry.writeErrors || null,
        powerOnHours: hddTelemetry.powerOnHours || null,
        smartStatus: hddTelemetry.smartStatus || "UNKNOWN",
      };
    } catch (error) {
      console.error("Failed to collect HDD telemetry:", error);
      return {
        healthScore: 100,
        temperatureC: null,
        reallocatedSectors: null,
        pendingSectors: null,
        readErrors: null,
        writeErrors: null,
        powerOnHours: null,
        smartStatus: "UNKNOWN",
      };
    }
  }

  /**
   * Calculate HDD health score from SMART data
   */
  private calculateHddHealthScore(hddData: any): number {
    let score = 100;

    // SMART status
    if (hddData.smartStatus === "FAIL") score -= 40;
    else if (hddData.smartStatus === "WARN") score -= 20;

    // Reallocated sectors (critical indicator)
    if (hddData.reallocatedSectors) {
      if (hddData.reallocatedSectors > 100) score -= 30;
      else if (hddData.reallocatedSectors > 50) score -= 20;
      else if (hddData.reallocatedSectors > 10) score -= 10;
    }

    // Pending sectors (imminent failure)
    if (hddData.pendingSectors) {
      if (hddData.pendingSectors > 50) score -= 25;
      else if (hddData.pendingSectors > 10) score -= 15;
      else if (hddData.pendingSectors > 0) score -= 5;
    }

    // Temperature
    if (hddData.temperature) {
      if (hddData.temperature > 60) score -= 15;
      else if (hddData.temperature > 55) score -= 10;
      else if (hddData.temperature > 50) score -= 5;
    }

    // Read/Write errors
    const totalErrors =
      (hddData.readErrors || 0) + (hddData.writeErrors || 0);
    if (totalErrors > 1000) score -= 20;
    else if (totalErrors > 100) score -= 10;
    else if (totalErrors > 10) score -= 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Collect network telemetry
   */
  private async collectNetworkTelemetry(
    tenantId: string,
    branchId: string
  ): Promise<BranchHealthSnapshot["network"]> {
    try {
      const networkTelemetry = await this.getNetworkTelemetry(
        tenantId,
        branchId
      );

      if (!networkTelemetry) {
        return this.getDefaultNetworkData();
      }

      // Get disconnect count from last 24h
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const disconnects = await this.store.listIncidents(tenantId, {
        branchId,
        since: oneDayAgo,
        incidentTypes: ["network-disconnection", "wan-down"],
      });

      // Calculate uptime
      const uptimePercent = networkTelemetry.uptimePercent || 100;

      return {
        latencyMs: networkTelemetry.latency || null,
        packetLossPercent: networkTelemetry.packetLoss || null,
        jitterMs: networkTelemetry.jitter || null,
        disconnectCount: disconnects.length,
        uptimePercent,
        bandwidthUtilization: networkTelemetry.bandwidthUtilization || null,
      };
    } catch (error) {
      console.error("Failed to collect network telemetry:", error);
      return this.getDefaultNetworkData();
    }
  }

  /**
   * Collect camera telemetry and calculate instability
   */
  private async collectCameraTelemetry(
    tenantId: string,
    branchId: string
  ): Promise<BranchHealthSnapshot["cameras"]> {
    try {
      const cameras = await this.store.listCameras(tenantId, { branchId });
      const total = cameras.length;

      if (total === 0) {
        return {
          total: 0,
          offlineCount: 0,
          reconnectCount24h: 0,
          videoLossCount24h: 0,
          instabilityScore: 0,
          criticalOffline: 0,
        };
      }

      const offlineCount = cameras.filter(
        (cam) => cam.status === "offline"
      ).length;

      const criticalOffline = cameras.filter(
        (cam) =>
          cam.status === "offline" &&
          cam.metadata?.critical === true
      ).length;

      // Get camera events from last 24h
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const incidents = await this.store.listIncidents(tenantId, {
        branchId,
        since: oneDayAgo,
        incidentTypes: [
          "camera-offline",
          "camera-reconnect",
          "video-loss",
        ],
      });

      const reconnectCount24h = incidents.filter((i) =>
        i.incidentType.includes("reconnect")
      ).length;
      const videoLossCount24h = incidents.filter((i) =>
        i.incidentType.includes("video-loss")
      ).length;

      // Calculate instability score (0-100)
      const instabilityScore = this.calculateCameraInstabilityScore({
        total,
        offlineCount,
        reconnectCount24h,
        videoLossCount24h,
        criticalOffline,
      });

      return {
        total,
        offlineCount,
        reconnectCount24h,
        videoLossCount24h,
        instabilityScore,
        criticalOffline,
      };
    } catch (error) {
      console.error("Failed to collect camera telemetry:", error);
      return {
        total: 0,
        offlineCount: 0,
        reconnectCount24h: 0,
        videoLossCount24h: 0,
        instabilityScore: 0,
        criticalOffline: 0,
      };
    }
  }

  /**
   * Calculate camera instability score
   */
  private calculateCameraInstabilityScore(data: {
    total: number;
    offlineCount: number;
    reconnectCount24h: number;
    videoLossCount24h: number;
    criticalOffline: number;
  }): number {
    if (data.total === 0) return 0;

    // Weighted scoring
    const offlinePercent = (data.offlineCount / data.total) * 100;
    const criticalOfflinePercent = (data.criticalOffline / data.total) * 100;
    const reconnectRate = data.reconnectCount24h / data.total;
    const videoLossRate = data.videoLossCount24h / data.total;

    // Combine factors
    let score = 0;
    score += offlinePercent * 0.3;
    score += criticalOfflinePercent * 0.4; // Critical cameras weighted higher
    score += Math.min(reconnectRate * 10, 20); // Cap at 20
    score += Math.min(videoLossRate * 10, 10); // Cap at 10

    return Math.min(100, score);
  }

  /**
   * Collect DVR/NVR telemetry
   */
  private async collectDvrTelemetry(
    tenantId: string,
    branchId: string
  ): Promise<BranchHealthSnapshot["dvr"]> {
    try {
      const dvrTelemetry = await this.getDvrTelemetry(tenantId, branchId);

      if (!dvrTelemetry) {
        return this.getDefaultDvrData();
      }

      // Get restart count from last 24h
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const restarts = await this.store.listIncidents(tenantId, {
        branchId,
        since: oneDayAgo,
        incidentTypes: ["dvr-restart", "recorder-restart"],
      });

      return {
        temperatureC: dvrTelemetry.temperature || null,
        cpuPercent: dvrTelemetry.cpuPercent || null,
        memoryPercent: dvrTelemetry.memoryPercent || null,
        uptimeHours: dvrTelemetry.uptimeHours || null,
        restartCount24h: restarts.length,
        recordingEngineState: dvrTelemetry.recordingState || "UNKNOWN",
      };
    } catch (error) {
      console.error("Failed to collect DVR telemetry:", error);
      return this.getDefaultDvrData();
    }
  }

  /**
   * Collect historical failure data
   */
  private async collectHistoricalData(
    tenantId: string,
    branchId: string
  ): Promise<BranchHealthSnapshot["historical"]> {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

      // Get failure incidents across time periods
      const [failures30d, failures90d, failures365d] = await Promise.all([
        this.store.listIncidents(tenantId, {
          branchId,
          since: thirtyDaysAgo,
          severity: ["critical", "high"],
        }),
        this.store.listIncidents(tenantId, {
          branchId,
          since: ninetyDaysAgo,
          severity: ["critical", "high"],
        }),
        this.store.listIncidents(tenantId, {
          branchId,
          since: oneYearAgo,
          severity: ["critical", "high"],
        }),
      ]);

      // Count recoveries (resolved incidents)
      const previousRecoveryCount = failures365d.filter(
        (i) => i.status === "resolved"
      ).length;

      // Calculate MTBF
      let meanTimeBetweenFailures: number | null = null;
      if (failures365d.length > 1) {
        const sortedFailures = failures365d.sort(
          (a, b) =>
            new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
        );
        const intervals: number[] = [];
        for (let i = 1; i < sortedFailures.length; i++) {
          const interval =
            new Date(sortedFailures[i].occurredAt).getTime() -
            new Date(sortedFailures[i - 1].occurredAt).getTime();
          intervals.push(interval / (1000 * 60 * 60)); // Convert to hours
        }
        meanTimeBetweenFailures =
          intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
      }

      // Find last failure
      const lastFailure = failures365d.sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
      )[0];
      const lastFailureDate = lastFailure
        ? new Date(lastFailure.occurredAt)
        : null;

      // Identify repeated component failures
      const componentFailures = new Map<string, number>();
      for (const failure of failures365d) {
        const component = this.extractComponent(failure);
        if (component) {
          componentFailures.set(
            component,
            (componentFailures.get(component) || 0) + 1
          );
        }
      }
      const repeatedComponentFailures = Array.from(
        componentFailures.entries()
      )
        .filter(([_, count]) => count >= 2)
        .map(([component]) => component);

      return {
        failures30d: failures30d.length,
        failures90d: failures90d.length,
        failures365d: failures365d.length,
        previousRecoveryCount,
        meanTimeBetweenFailures,
        lastFailureDate,
        repeatedComponentFailures,
      };
    } catch (error) {
      console.error("Failed to collect historical data:", error);
      return this.getDefaultHistoricalData();
    }
  }

  /**
   * Extract component from incident
   */
  private extractComponent(incident: any): string | null {
    const type = incident.incidentType?.toLowerCase() || "";
    if (type.includes("hdd") || type.includes("disk")) return "HDD";
    if (type.includes("network")) return "Network";
    if (type.includes("camera")) return "Camera";
    if (type.includes("dvr") || type.includes("recorder")) return "DVR";
    if (type.includes("storage")) return "Storage";
    if (type.includes("power")) return "Power";
    return null;
  }

  /**
   * Calculate data quality metrics
   */
  private calculateDataQuality(data: {
    recordingData: BranchHealthSnapshot["recording"];
    storageData: BranchHealthSnapshot["storage"];
    hddData: BranchHealthSnapshot["hdd"];
    networkData: BranchHealthSnapshot["network"];
    cameraData: BranchHealthSnapshot["cameras"];
    dvrData: BranchHealthSnapshot["dvr"];
    historicalData: BranchHealthSnapshot["historical"];
  }): BranchHealthSnapshot["dataQuality"] {
    const sources = [
      { name: "Recording", available: data.recordingData.camerasExpected > 0 },
      { name: "Storage", available: data.storageData.totalBytes > 0 },
      { name: "HDD", available: data.hddData.smartStatus !== "UNKNOWN", critical: true },
      { name: "Network", available: data.networkData.latencyMs !== null, critical: true },
      { name: "Cameras", available: data.cameraData.total > 0 },
      { name: "DVR", available: data.dvrData.recordingEngineState !== "UNKNOWN" },
      { name: "Historical", available: true }, // Always available
    ];

    const availableSources = sources.filter((s) => s.available).length;
    const totalSources = sources.length;
    const missingCritical = sources
      .filter((s) => s.critical && !s.available)
      .map((s) => s.name);

    // Quality score: base coverage + penalty for missing critical data
    let qualityScore = availableSources / totalSources;
    if (missingCritical.length > 0) {
      qualityScore *= 0.7; // 30% penalty for missing critical data
    }

    return {
      availableSources,
      totalSources,
      missingCritical,
      qualityScore: Math.round(qualityScore * 100) / 100,
    };
  }

  /**
   * Store snapshot for historical analysis
   */
  private async storeSnapshot(snapshot: BranchHealthSnapshot): Promise<void> {
    try {
      await this.store.execute(
        `INSERT INTO branch_health_snapshots (
          id, tenant_id, branch_id, timestamp, snapshot_data
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          randomUUID(),
          snapshot.tenantId,
          snapshot.branchId,
          snapshot.timestamp,
          JSON.stringify(snapshot),
        ]
      );
    } catch (error) {
      console.error("Failed to store snapshot:", error);
      // Non-fatal, continue
    }
  }

  /**
   * Helper methods to fetch telemetry from various sources
   * These should be implemented based on your actual telemetry infrastructure
   */

  private async getStorageInfo(
    tenantId: string,
    branchId: string
  ): Promise<{ totalBytes: number; freeBytes: number; estimatedRetentionDays: number } | null> {
    // TODO: Implement actual storage telemetry fetching
    // This should query your DVR/NVR telemetry or storage monitoring system
    return null;
  }

  private async calculateStorageGrowthRate(
    tenantId: string,
    branchId: string
  ): Promise<number> {
    // TODO: Query historical storage data and calculate daily growth rate
    // For now, return 0 (no growth data available)
    return 0;
  }

  private async getHddTelemetry(
    tenantId: string,
    branchId: string
  ): Promise<any | null> {
    // TODO: Implement HDD SMART data fetching
    return null;
  }

  private async getNetworkTelemetry(
    tenantId: string,
    branchId: string
  ): Promise<any | null> {
    // TODO: Implement network telemetry fetching
    return null;
  }

  private async getDvrTelemetry(
    tenantId: string,
    branchId: string
  ): Promise<any | null> {
    // TODO: Implement DVR telemetry fetching
    return null;
  }

  private getDefaultNetworkData(): BranchHealthSnapshot["network"] {
    return {
      latencyMs: null,
      packetLossPercent: null,
      jitterMs: null,
      disconnectCount: 0,
      uptimePercent: 100,
      bandwidthUtilization: null,
    };
  }

  private getDefaultDvrData(): BranchHealthSnapshot["dvr"] {
    return {
      temperatureC: null,
      cpuPercent: null,
      memoryPercent: null,
      uptimeHours: null,
      restartCount24h: 0,
      recordingEngineState: "UNKNOWN",
    };
  }

  private getDefaultHistoricalData(): BranchHealthSnapshot["historical"] {
    return {
      failures30d: 0,
      failures90d: 0,
      failures365d: 0,
      previousRecoveryCount: 0,
      meanTimeBetweenFailures: null,
      lastFailureDate: null,
      repeatedComponentFailures: [],
    };
  }
}
