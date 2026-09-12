/**
 * Storage Safety & Retention Quota Lifecycle Service
 * 
 * Enforces:
 * 1. Proactive retention capacity forecasting (Current vs Projected vs Required 90-day RBI quota).
 * 2. Storage failure protection: Recording allocation never routes to FAILED, READ_ONLY, or DRAINING nodes.
 * 3. Proactive capacity exhaustion alerting before legal/regulatory policy is breached.
 */

import type { Pool } from "pg";

export type StorageNodeState = "HEALTHY" | "WARM" | "ARCHIVE" | "FAILED" | "READ_ONLY" | "DRAINING";

export interface StorageNodeInfo {
  nodeId: string;
  mountPoint: string;
  tier: "HOT" | "WARM" | "ARCHIVE";
  state: StorageNodeState;
  totalBytes: number;
  availableBytes: number;
  usedBytes: number;
  writeLatencyMs: number;
  ioErrorsTotal: number;
  smartHealth: "PASS" | "WARN" | "FAIL";
}

export interface RetentionForecast {
  tenantId: string;
  cameraId?: string;
  requiredRetentionDays: number;
  currentRetentionDays: number;
  projectedRetentionDays: number;
  status: "COMPLIANT" | "WARNING" | "CRITICAL";
  capacityExhaustionWarning: boolean;
}

export class StorageSafetyLifecycleService {
  private readonly memoryNodes = new Map<string, StorageNodeInfo>();

  constructor(private readonly pool?: Pool) {}

  registerNode(node: StorageNodeInfo) {
    this.memoryNodes.set(node.nodeId, node);
  }

  async selectOptimalStorageNode(tier: "HOT" | "WARM" = "HOT"): Promise<StorageNodeInfo | null> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM storage_node_telemetry 
           WHERE tier = $1 
             AND state = 'HEALTHY' 
             AND smart_health = 'PASS' 
             AND available_bytes > 10737418240 -- min 10GB free
           ORDER BY (available_bytes::numeric / NULLIF(total_bytes, 0)) DESC
           LIMIT 1`,
          [tier]
        );
        if (res.rows.length > 0) {
          const r = res.rows[0];
          return {
            nodeId: r.node_id,
            mountPoint: r.mount_point,
            tier: r.tier,
            state: r.state,
            totalBytes: Number(r.total_bytes),
            usedBytes: Number(r.used_bytes),
            availableBytes: Number(r.available_bytes),
            writeLatencyMs: Number(r.write_latency_ms),
            ioErrorsTotal: Number(r.io_errors_total),
            smartHealth: r.smart_health,
          };
        }
      } catch {
        // Fall back to memory
      }
    }

    // Filter memory nodes: MUST NOT be FAILED, READ_ONLY, or DRAINING
    const eligible = Array.from(this.memoryNodes.values()).filter(
      (n) => n.tier === tier && n.state === "HEALTHY" && n.smartHealth === "PASS" && n.availableBytes > 10 * 1024 * 1024 * 1024
    );

    if (eligible.length === 0) return null;
    eligible.sort((a, b) => b.availableBytes / b.totalBytes - a.availableBytes / a.totalBytes);
    return eligible[0] ?? null;
  }

  async evaluateRetentionForecast(params: {
    tenantId: string;
    cameraId?: string;
    requiredRetentionDays?: number;
    dailyIngestBytes?: number;
  }): Promise<RetentionForecast> {
    const requiredDays = params.requiredRetentionDays || 90; // Default 90-day banking compliance
    let currentDays = 90;
    let projectedDays = 90;

    if (this.pool) {
      try {
        // Find oldest active recording segment
        const oldestRes = await this.pool.query(
          `SELECT MIN(started_at) as oldest_time 
           FROM recording_segments 
           WHERE tenant_id = $1 AND ($2::varchar IS NULL OR camera_id = $2)`,
          [params.tenantId, params.cameraId || null]
        );

        const oldestTime = oldestRes.rows[0]?.oldest_time;
        if (oldestTime) {
          const elapsedSec = (Date.now() - new Date(oldestTime).getTime()) / 1000;
          currentDays = Number((elapsedSec / 86400).toFixed(1));
        }

        // Sum available storage
        const storageRes = await this.pool.query(
          `SELECT COALESCE(SUM(available_bytes), 0) as total_free,
                  COALESCE(SUM(used_bytes), 0) as total_used
           FROM storage_node_telemetry 
           WHERE state = 'HEALTHY'`
        );
        const freeBytes = Number(storageRes.rows[0]?.total_free || 0);
        const dailyRate = params.dailyIngestBytes || (30 * 1024 * 1024 * 1024); // default 30GB/day

        const remainingFutureDays = dailyRate > 0 ? freeBytes / dailyRate : 0;
        projectedDays = Number((currentDays + remainingFutureDays).toFixed(1));
      } catch {
        // Fall back to nominal
      }
    }

    // Determine status
    let status: "COMPLIANT" | "WARNING" | "CRITICAL" = "COMPLIANT";
    let capacityExhaustionWarning = false;

    if (projectedDays < requiredDays) {
      status = "CRITICAL";
      capacityExhaustionWarning = true;
    } else if (projectedDays < requiredDays * 1.15) {
      status = "WARNING";
      capacityExhaustionWarning = true;
    }

    const forecast: RetentionForecast = {
      tenantId: params.tenantId,
      cameraId: params.cameraId,
      requiredRetentionDays: requiredDays,
      currentRetentionDays: currentDays,
      projectedRetentionDays: projectedDays,
      status,
      capacityExhaustionWarning,
    };

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO retention_quota_policies (
            tenant_id, camera_id, required_retention_days, current_retention_days,
            projected_retention_days, status, capacity_exhaustion_warning, last_evaluated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [
            forecast.tenantId,
            forecast.cameraId || null,
            forecast.requiredRetentionDays,
            forecast.currentRetentionDays,
            forecast.projectedRetentionDays,
            forecast.status,
            forecast.capacityExhaustionWarning,
          ]
        );
      } catch {
        // Suppress
      }
    }

    return forecast;
  }
}

export const storageSafetyLifecycleService = new StorageSafetyLifecycleService();
