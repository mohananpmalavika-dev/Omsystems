import type { Pool } from "pg";
import { pool as defaultPool } from "../database/pool.js";
import type { EnterpriseStoragePool } from "../storage/enterprise-storage-pool.js";
import { enterpriseStoragePool } from "../storage/enterprise-storage-pool.js";
import type { StorageHealthStatus } from "../storage/recording-storage.interface.js";

export interface DigitalTwinStorageNodeView {
  nodeId: string;
  name: string;
  storageType: string;
  storageTier: string;
  healthState: string;
  statusBadge: "operational" | "warning" | "critical" | "offline";
  capacityGb: number;
  usedGb: number;
  freeGb: number;
  usagePercent: number;
  totalIops: number;
  writeLatencyMs: number;
  readLatencyMs: number;
  failureRatePercent: number;
  temperatureCelsius?: number;
  smartSummary?: {
    overall: "passed" | "failed" | "unknown";
    reallocatedSectors: number;
    wearOutPercent?: number;
  };
  raidSummary?: {
    status: string;
    level?: string;
    rebuildProgress?: number;
    failedDisks: string[];
  };
  digitalTwinBinding?: {
    objectId?: string;
    floorId?: string;
    rackName?: string;
    slotNumber?: number;
  };
  alerts: string[];
}

export interface DigitalTwinStorageTopology {
  totalNodes: number;
  healthyNodes: number;
  degradedNodes: number;
  fullNodes: number;
  offlineNodes: number;
  rebuildingNodes: number;
  totalCapacityTb: number;
  totalUsedTb: number;
  averageUsagePercent: number;
  nodes: DigitalTwinStorageNodeView[];
  activeAlerts: Array<{
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    nodeId: string;
    code: string;
    message: string;
    timestamp: string;
  }>;
}

export class DigitalTwinStorageService {
  private readonly pool: Pool;
  private readonly storagePool: EnterpriseStoragePool;

  constructor(
    pool: Pool = defaultPool as Pool,
    storagePool: EnterpriseStoragePool = enterpriseStoragePool,
  ) {
    this.pool = pool;
    this.storagePool = storagePool;
  }

  /**
   * Generates the real-time Digital Twin Storage Topology and diagnostic heatmap
   */
  async getStorageTopology(tenantId = "00000000-0000-0000-0000-000000000000"): Promise<DigitalTwinStorageTopology> {
    const healthReports = await this.storagePool.getAllHealth();
    const nodeViews: DigitalTwinStorageNodeView[] = [];
    const activeAlerts: DigitalTwinStorageTopology["activeAlerts"] = [];

    let totalCapBytes = 0;
    let totalUsedBytes = 0;
    let healthyCount = 0;
    let degradedCount = 0;
    let fullCount = 0;
    let offlineCount = 0;
    let rebuildingCount = 0;

    for (const report of healthReports) {
      totalCapBytes += report.capacityBytes;
      totalUsedBytes += report.usedBytes;

      const alerts: string[] = [...report.warnings, ...report.errors];

      if (report.healthState === "HEALTHY") healthyCount++;
      else if (report.healthState === "DEGRADED") degradedCount++;
      else if (report.healthState === "FULL") fullCount++;
      else if (report.healthState === "OFFLINE") offlineCount++;
      else if (report.healthState === "REBUILDING") rebuildingCount++;

      // Generate Digital Twin Alerts
      if (report.healthState === "OFFLINE") {
        activeAlerts.push({
          severity: "CRITICAL",
          nodeId: report.nodeId,
          code: "STORAGE_OFFLINE",
          message: `Storage node ${report.nodeId} (${report.storageType}) is unreachable`,
          timestamp: new Date().toISOString(),
        });
      } else if (report.healthState === "FULL") {
        activeAlerts.push({
          severity: "HIGH",
          nodeId: report.nodeId,
          code: "STORAGE_FULL",
          message: `Storage node ${report.nodeId} capacity threshold exceeded (${report.usagePercent}%)`,
          timestamp: new Date().toISOString(),
        });
      } else if (report.healthState === "DEGRADED") {
        activeAlerts.push({
          severity: "HIGH",
          nodeId: report.nodeId,
          code: "STORAGE_DEGRADED",
          message: `Storage node ${report.nodeId} is operating in DEGRADED state (${report.raid?.failedMembers?.length ?? 0} disk failures)`,
          timestamp: new Date().toISOString(),
        });
      } else if (report.healthState === "REBUILDING") {
        activeAlerts.push({
          severity: "MEDIUM",
          nodeId: report.nodeId,
          code: "RAID_REBUILDING",
          message: `RAID array on ${report.nodeId} is rebuilding (${report.raid?.rebuildProgressPercent ?? 0}%)`,
          timestamp: new Date().toISOString(),
        });
      }

      if (report.segmentFailureRate > 0.01) {
        activeAlerts.push({
          severity: "HIGH",
          nodeId: report.nodeId,
          code: "SEGMENT_CORRUPTED",
          message: `High segment write failure rate (${(report.segmentFailureRate * 100).toFixed(2)}%) on ${report.nodeId}`,
          timestamp: new Date().toISOString(),
        });
      }

      nodeViews.push({
        nodeId: report.nodeId,
        name: `Storage Node ${report.nodeId}`,
        storageType: report.storageType,
        storageTier: report.storageTier,
        healthState: report.healthState,
        statusBadge: this.mapStatusBadge(report.healthState),
        capacityGb: Math.round(report.capacityBytes / (1024 * 1024 * 1024)),
        usedGb: Math.round(report.usedBytes / (1024 * 1024 * 1024)),
        freeGb: Math.round(report.availableBytes / (1024 * 1024 * 1024)),
        usagePercent: report.usagePercent,
        totalIops: report.totalIops,
        writeLatencyMs: report.writeLatencyMs,
        readLatencyMs: report.readLatencyMs,
        failureRatePercent: Math.round(report.segmentFailureRate * 10000) / 100,
        temperatureCelsius: report.smart?.temperatureCelsius,
        smartSummary: report.smart ? {
          overall: report.smart.overallStatus,
          reallocatedSectors: report.smart.reallocatedSectors,
          wearOutPercent: report.smart.remainingSsdLifePercent ? 100 - report.smart.remainingSsdLifePercent : undefined,
        } : undefined,
        raidSummary: report.raid ? {
          status: report.raid.status,
          level: report.raid.level,
          rebuildProgress: report.raid.rebuildProgressPercent,
          failedDisks: report.raid.failedMembers,
        } : undefined,
        alerts,
      });
    }

    const totalCapTb = Math.round((totalCapBytes / (1024 * 1024 * 1024 * 1024)) * 100) / 100;
    const totalUsedTb = Math.round((totalUsedBytes / (1024 * 1024 * 1024 * 1024)) * 100) / 100;
    const averageUsagePercent = totalCapBytes > 0
      ? Math.round((totalUsedBytes / totalCapBytes) * 10000) / 100
      : 0;

    return {
      totalNodes: healthReports.length,
      healthyNodes: healthyCount,
      degradedNodes: degradedCount,
      fullNodes: fullCount,
      offlineNodes: offlineCount,
      rebuildingNodes: rebuildingCount,
      totalCapacityTb: totalCapTb,
      totalUsedTb: totalUsedTb,
      averageUsagePercent,
      nodes: nodeViews,
      activeAlerts,
    };
  }

  private mapStatusBadge(state: string): "operational" | "warning" | "critical" | "offline" {
    switch (state) {
      case "HEALTHY":
        return "operational";
      case "DEGRADED":
      case "REBUILDING":
      case "FULL":
        return "warning";
      case "READ_ONLY":
        return "critical";
      case "OFFLINE":
      default:
        return "offline";
    }
  }
}

export const digitalTwinStorageService = new DigitalTwinStorageService();
