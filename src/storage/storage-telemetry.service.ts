import type { Pool } from "pg";
import { pool as defaultPool } from "../database/pool.js";
import type { EnterpriseStoragePool } from "./enterprise-storage-pool.js";
import { enterpriseStoragePool } from "./enterprise-storage-pool.js";
import type { StorageHealthStatus } from "./recording-storage.interface.js";

export class StorageTelemetryService {
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
   * Collects live telemetry from all storage nodes in the pool and persists to database
   */
  async collectAndPersistTelemetry(tenantId = "00000000-0000-0000-0000-000000000000"): Promise<StorageHealthStatus[]> {
    const healthReports = await this.storagePool.getAllHealth();

    if (!this.pool) {
      return healthReports;
    }

    for (const report of healthReports) {
      try {
        // 1. Update or upsert recording_storage_nodes table
        await this.pool.query(
          `INSERT INTO recording_storage_nodes (
             tenant_id, external_id, name, supported_tiers, capacity_bytes,
             used_bytes, available_bytes, status, health_state, tier_primary,
             storage_type, mount_path, write_mbps, read_mbps, latency_ms,
             read_iops, write_iops, total_iops, p95_write_latency_ms, p95_read_latency_ms,
             inode_used_percent, filesystem_type, is_read_only, total_writes_attempted,
             failed_writes_count, corrupted_segments_count, segment_failure_rate,
             smart, raid, last_seen_at
           ) VALUES (
             $1, $2, $3, $4, $5,
             $6, $7, $8, $9, $10,
             $11, $12, $13, $14, $15,
             $16, $17, $18, $19, $20,
             $21, $22, $23, $24,
             $25, $26, $27,
             $28, $29, NOW()
           )
           ON CONFLICT (tenant_id, external_id) DO UPDATE SET
             capacity_bytes = EXCLUDED.capacity_bytes,
             used_bytes = EXCLUDED.used_bytes,
             available_bytes = EXCLUDED.available_bytes,
             status = EXCLUDED.status,
             health_state = EXCLUDED.health_state,
             tier_primary = EXCLUDED.tier_primary,
             storage_type = EXCLUDED.storage_type,
             mount_path = EXCLUDED.mount_path,
             latency_ms = EXCLUDED.latency_ms,
             read_iops = EXCLUDED.read_iops,
             write_iops = EXCLUDED.write_iops,
             total_iops = EXCLUDED.total_iops,
             p95_write_latency_ms = EXCLUDED.p95_write_latency_ms,
             p95_read_latency_ms = EXCLUDED.p95_read_latency_ms,
             inode_used_percent = EXCLUDED.inode_used_percent,
             filesystem_type = EXCLUDED.filesystem_type,
             is_read_only = EXCLUDED.is_read_only,
             total_writes_attempted = EXCLUDED.total_writes_attempted,
             failed_writes_count = EXCLUDED.failed_writes_count,
             corrupted_segments_count = EXCLUDED.corrupted_segments_count,
             segment_failure_rate = EXCLUDED.segment_failure_rate,
             smart = EXCLUDED.smart,
             raid = EXCLUDED.raid,
             last_seen_at = NOW()`,
          [
            tenantId,
            report.nodeId,
            `Storage Node ${report.nodeId}`,
            [report.storageTier],
            report.capacityBytes,
            report.usedBytes,
            report.availableBytes,
            this.mapLegacyStatus(report.healthState),
            report.healthState,
            report.storageTier,
            report.storageType,
            report.filesystem?.mountPath || report.nodeId,
            0, // write_mbps
            0, // read_mbps
            report.writeLatencyMs,
            report.readIops,
            report.writeIops,
            report.totalIops,
            report.p95WriteLatencyMs,
            report.p95ReadLatencyMs,
            report.filesystem?.inodeUsagePercent ?? 0,
            report.filesystem?.filesystemType ?? "ext4",
            report.filesystem?.isReadOnly ?? false,
            report.totalWritesAttempted,
            report.failedWritesCount,
            report.corruptedSegmentsCount,
            report.segmentFailureRate,
            report.smart ? JSON.stringify(report.smart) : null,
            report.raid ? JSON.stringify(report.raid) : null,
          ],
        );

        // 2. Fetch storage node UUID for time-series history
        const nodeRes = await this.pool.query(
          `SELECT id FROM recording_storage_nodes WHERE tenant_id = $1 AND external_id = $2`,
          [tenantId, report.nodeId],
        );
        const nodeUuid = nodeRes.rows[0]?.id;

        if (nodeUuid) {
          // 3. Insert historical telemetry metric snapshot
          await this.pool.query(
            `INSERT INTO storage_telemetry_history (
               tenant_id, storage_node_id, health_state, capacity_bytes,
               used_bytes, available_bytes, usage_percent, read_iops, write_iops,
               write_latency_ms, read_latency_ms, p95_write_latency_ms, p95_read_latency_ms,
               segment_failure_rate, temperature_celsius, smart_summary, raid_summary
             ) VALUES (
               $1, $2, $3, $4,
               $5, $6, $7, $8, $9,
               $10, $11, $12, $13,
               $14, $15, $16, $17
             )`,
            [
              tenantId,
              nodeUuid,
              report.healthState,
              report.capacityBytes,
              report.usedBytes,
              report.availableBytes,
              report.usagePercent,
              report.readIops,
              report.writeIops,
              report.writeLatencyMs,
              report.readLatencyMs,
              report.p95WriteLatencyMs,
              report.p95ReadLatencyMs,
              report.segmentFailureRate,
              report.smart?.temperatureCelsius ?? null,
              report.smart ? JSON.stringify(report.smart) : null,
              report.raid ? JSON.stringify(report.raid) : null,
            ],
          );
        }
      } catch (err) {
        // Log telemetry recording error without failing the health probe
        console.warn(`[StorageTelemetry] Failed to persist telemetry for node [${report.nodeId}]:`, err);
      }
    }

    return healthReports;
  }

  private mapLegacyStatus(healthState: string): "healthy" | "warning" | "critical" | "offline" {
    switch (healthState) {
      case "HEALTHY":
        return "healthy";
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

export const storageTelemetryService = new StorageTelemetryService();
