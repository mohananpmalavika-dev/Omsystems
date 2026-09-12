import type { Pool } from "pg";
import { pool as defaultPool } from "../database/pool.js";
import type { EnterpriseStorageHealthState, StorageFailoverEvent, StorageFailoverReason } from "../domain/models.js";
import { storageFailoverRouter, StorageFailoverRouter } from "./storage-failover-router.js";
import type { FailoverTargetEntry } from "./storage-failover-router.js";
import { enterpriseStoragePool, EnterpriseStoragePool } from "./enterprise-storage-pool.js";
import type { StorageTier } from "./recording-storage.interface.js";
import { LocalDiskStorageProvider } from "./providers/local-disk-storage.provider.js";
import { NasStorageProvider } from "./providers/nas-storage.provider.js";
import { SanStorageProvider } from "./providers/san-storage.provider.js";

export interface FailoverTelemetryMetrics {
  mediaNodeId?: string;
  totalEvents: number;
  unrecoveredEvents: number;
  meanTimeToRecoveryMs: number;
  reasonBreakdown: Record<string, number>;
  targetsSummary: {
    total: number;
    healthy: number;
    full: number;
    offline: number;
    degraded: number;
  };
}

export class StorageFailoverService {
  private readonly pool?: Pool;
  private readonly router: StorageFailoverRouter;
  private readonly storagePool: EnterpriseStoragePool;
  private isInitialized = false;

  constructor(
    pool: Pool = defaultPool as Pool,
    router: StorageFailoverRouter = storageFailoverRouter,
    storagePool: EnterpriseStoragePool = enterpriseStoragePool,
  ) {
    this.pool = pool;
    this.router = router;
    this.storagePool = storagePool;

    // Listen to router failover events to record audit logs in PostgreSQL
    this.router.on("failover:triggered", async (event: StorageFailoverEvent) => {
      await this.recordFailoverEvent(event);
    });

    // Listen to router recovery events to stamp recovered_at in PostgreSQL
    this.router.on("failover:recovered", async (data: { mediaNodeId: string; storageNodeId: string }) => {
      await this.markEventRecovered(data.mediaNodeId, data.storageNodeId);
    });
  }

  /**
   * Initializes service by loading persisted targets from PostgreSQL
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    if (!this.pool) return;
    try {
      const res = await this.pool.query(
        `SELECT * FROM media_node_storage_targets
         ORDER BY priority ASC, created_at ASC`,
      );
      for (const r of res.rows) {
        this.ensureProviderBound({
          storageNodeId: r.storage_node_id,
          targetPath: r.target_path,
          storageType: r.storage_type,
          storageTier: r.storage_tier,
        });

        this.router.registerTarget({
          id: r.id,
          mediaNodeId: r.media_node_id,
          cameraId: r.camera_id ?? undefined,
          storageNodeId: r.storage_node_id,
          targetName: r.target_name,
          targetPath: r.target_path,
          priority: r.priority,
          isActive: r.is_active,
          spilloverThresholdPercent: parseFloat(r.spillover_threshold_percent) || 95.0,
        });
      }
    } catch (err) {
      console.warn("[StorageFailover] Could not load persisted targets from DB:", err);
    }
  }

  /**
   * Automatically instantiates and binds real storage providers into the EnterpriseStoragePool
   */
  ensureProviderBound(target: {
    storageNodeId: string;
    targetPath: string;
    storageType?: string;
    storageTier?: string;
  }): void {
    if (!this.storagePool.getNode(target.storageNodeId)) {
      const tier = (target.storageTier || "hot") as StorageTier;
      const type = target.storageType || "local-disk";

      if (type === "nas") {
        this.storagePool.registerNode(
          new NasStorageProvider({
            nodeId: target.storageNodeId,
            sharePath: target.targetPath,
            storageTier: tier,
          }),
        );
      } else if (type === "san") {
        this.storagePool.registerNode(
          new SanStorageProvider({
            nodeId: target.storageNodeId,
            volumeMountPath: target.targetPath,
            storageTier: tier,
          }),
        );
      } else {
        this.storagePool.registerNode(
          new LocalDiskStorageProvider({
            nodeId: target.storageNodeId,
            basePath: target.targetPath,
            storageTier: tier,
          }),
        );
      }
    }
  }

  /**
   * Configures a permitted recording target with priority
   */
  async configureTarget(target: {
    tenantId?: string;
    mediaNodeId: string;
    cameraId?: string;
    storageNodeId: string;
    targetName: string;
    targetPath: string;
    storageType?: string;
    storageTier?: string;
    priority: number;
    isActive?: boolean;
    maxCapacityBytes?: number;
    spilloverThresholdPercent?: number;
  }): Promise<FailoverTargetEntry> {
    const tenantId = target.tenantId || "00000000-0000-0000-0000-000000000000";

    // Guarantee the storage provider is bound in the storage pool
    this.ensureProviderBound({
      storageNodeId: target.storageNodeId,
      targetPath: target.targetPath,
      storageType: target.storageType,
      storageTier: target.storageTier,
    });

    const entry = this.router.registerTarget({
      mediaNodeId: target.mediaNodeId,
      cameraId: target.cameraId,
      storageNodeId: target.storageNodeId,
      targetName: target.targetName,
      targetPath: target.targetPath,
      priority: target.priority,
      isActive: target.isActive ?? true,
      spilloverThresholdPercent: target.spilloverThresholdPercent,
    });

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO media_node_storage_targets (
             tenant_id, media_node_id, camera_id, storage_node_id,
             target_name, target_path, storage_type, storage_tier,
             priority, is_active, max_capacity_bytes, spillover_threshold_percent
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (tenant_id, media_node_id, camera_id, storage_node_id)
           DO UPDATE SET
             target_name = EXCLUDED.target_name,
             target_path = EXCLUDED.target_path,
             storage_type = EXCLUDED.storage_type,
             storage_tier = EXCLUDED.storage_tier,
             priority = EXCLUDED.priority,
             is_active = EXCLUDED.is_active,
             max_capacity_bytes = EXCLUDED.max_capacity_bytes,
             spillover_threshold_percent = EXCLUDED.spillover_threshold_percent,
             updated_at = NOW()`,
          [
            tenantId,
            target.mediaNodeId,
            target.cameraId || null,
            target.storageNodeId,
            target.targetName,
            target.targetPath,
            target.storageType || "local-disk",
            target.storageTier || "hot",
            target.priority,
            target.isActive ?? true,
            target.maxCapacityBytes ?? 0,
            target.spilloverThresholdPercent ?? 95.0,
          ],
        );
      } catch (err) {
        console.warn("[StorageFailover] Failed to persist target configuration to DB:", err);
      }
    }

    return entry;
  }

  /**
   * Retrieves all configured permitted targets for a media node
   */
  async getTargets(mediaNodeId: string, cameraId?: string): Promise<FailoverTargetEntry[]> {
    return this.router.getPermittedTargets(mediaNodeId, cameraId);
  }

  /**
   * Gets the active storage target
   */
  async getActiveTarget(mediaNodeId: string, cameraId?: string): Promise<FailoverTargetEntry> {
    return this.router.getActiveTarget(mediaNodeId, cameraId);
  }

  /**
   * Updates an existing storage target
   */
  async updateTarget(
    mediaNodeId: string,
    targetId: string,
    updates: {
      priority?: number;
      isActive?: boolean;
      targetName?: string;
      targetPath?: string;
      spilloverThresholdPercent?: number;
    },
    cameraId?: string,
  ): Promise<FailoverTargetEntry | undefined> {
    const updated = this.router.updateTarget(targetId, mediaNodeId, updates, cameraId);

    if (this.pool && updated) {
      try {
        const setClauses: string[] = ["updated_at = NOW()"];
        const params: any[] = [mediaNodeId, updated.storageNodeId];

        if (updates.priority !== undefined) {
          params.push(updates.priority);
          setClauses.push(`priority = $${params.length}`);
        }
        if (updates.isActive !== undefined) {
          params.push(updates.isActive);
          setClauses.push(`is_active = $${params.length}`);
        }
        if (updates.targetName !== undefined) {
          params.push(updates.targetName);
          setClauses.push(`target_name = $${params.length}`);
        }
        if (updates.targetPath !== undefined) {
          params.push(updates.targetPath);
          setClauses.push(`target_path = $${params.length}`);
        }
        if (updates.spilloverThresholdPercent !== undefined) {
          params.push(updates.spilloverThresholdPercent);
          setClauses.push(`spillover_threshold_percent = $${params.length}`);
        }

        await this.pool.query(
          `UPDATE media_node_storage_targets
           SET ${setClauses.join(", ")}
           WHERE media_node_id = $1 AND storage_node_id = $2`,
          params,
        );
      } catch (err) {
        console.warn("[StorageFailover] Failed to update target in DB:", err);
      }
    }

    return updated;
  }

  /**
   * Deletes / unregisters a storage target
   */
  async deleteTarget(mediaNodeId: string, targetId: string, cameraId?: string): Promise<boolean> {
    const targets = this.router.getPermittedTargets(mediaNodeId, cameraId);
    const target = targets.find((t) => t.id === targetId || t.storageNodeId === targetId);
    const resolvedId = target ? target.id : targetId;
    const storageNodeId = target ? target.storageNodeId : targetId;

    const removed = this.router.unregisterTarget(resolvedId, mediaNodeId, cameraId);

    if (this.pool) {
      try {
        await this.pool.query(
          `DELETE FROM media_node_storage_targets
           WHERE media_node_id = $1 AND (id::text = $2 OR storage_node_id = $3)`,
          [mediaNodeId, resolvedId, storageNodeId],
        );
      } catch (err) {
        console.warn("[StorageFailover] Failed to delete target from DB:", err);
      }
    }

    return removed;
  }

  /**
   * Triggers a manual or synthetic failover test
   */
  async triggerFailover(
    mediaNodeId: string,
    targetId: string,
    reason: StorageFailoverReason = "MANUAL_OVERRIDE",
    errorDetail?: string,
    cameraId?: string,
  ): Promise<{ failoverOccurred: boolean; newTarget?: FailoverTargetEntry; event?: StorageFailoverEvent }> {
    return this.router.reportTargetFailure(mediaNodeId, targetId, reason, errorDetail, cameraId);
  }

  /**
   * Reports that a storage target has recovered and is healthy
   */
  async recoverTarget(mediaNodeId: string, targetId: string, cameraId?: string): Promise<{
    recovered: boolean;
    activeTarget?: FailoverTargetEntry;
  }> {
    this.router.reportTargetRecovered(mediaNodeId, targetId, cameraId);
    const activeTarget = await this.router.getActiveTarget(mediaNodeId, cameraId);
    return {
      recovered: true,
      activeTarget,
    };
  }

  /**
   * Proactively evaluates real filesystem capacity and connectivity across all targets.
   * If a target exceeds its spillover threshold, automatic failover is initiated pre-emptively.
   */
  async probeTargetHealth(mediaNodeId: string, cameraId?: string): Promise<{
    activeTarget: FailoverTargetEntry;
    targets: Array<FailoverTargetEntry & {
      capacityBytes?: number;
      usedBytes?: number;
      availableBytes?: number;
      usagePercent?: number;
      nodeHealth?: EnterpriseStorageHealthState;
      actionTaken?: "NONE" | "FAILOVER_TRIGGERED" | "RECOVERED";
    }>;
  }> {
    const targets = this.router.getPermittedTargets(mediaNodeId, cameraId);
    const currentActive = await this.router.getActiveTarget(mediaNodeId, cameraId);
    const results: any[] = [];

    for (const target of targets) {
      let actionTaken: "NONE" | "FAILOVER_TRIGGERED" | "RECOVERED" = "NONE";
      const node = this.storagePool.getNode(target.storageNodeId);

      if (!node) {
        // Node missing in pool -> trigger failover if active
        if (target.id === currentActive.id) {
          await this.triggerFailover(
            mediaNodeId,
            target.id,
            "STORAGE_OFFLINE",
            `Storage node [${target.storageNodeId}] missing in enterprise pool`,
            cameraId,
          );
          actionTaken = "FAILOVER_TRIGGERED";
        }
        results.push({
          ...target,
          actionTaken,
        });
        continue;
      }

      try {
        const health = await node.health();
        const usage = health.usagePercent ?? 0;
        const isExceeded = usage >= target.spilloverThresholdPercent;

        if (health.healthState === "OFFLINE") {
          if (target.healthState !== "OFFLINE") {
            await this.triggerFailover(mediaNodeId, target.id, "STORAGE_OFFLINE", health.errors?.join(", ") || "Storage offline", cameraId);
            actionTaken = "FAILOVER_TRIGGERED";
          }
        } else if (health.healthState === "FULL" || isExceeded) {
          if (target.healthState !== "FULL") {
            await this.triggerFailover(
              mediaNodeId,
              target.id,
              "DISK_FULL",
              `Disk usage ${usage.toFixed(1)}% exceeds threshold ${target.spilloverThresholdPercent}%`,
              cameraId,
            );
            actionTaken = "FAILOVER_TRIGGERED";
          }
        } else if (health.healthState === "HEALTHY" && (target.healthState === "FULL" || target.healthState === "OFFLINE")) {
          // Recovered!
          this.router.reportTargetRecovered(mediaNodeId, target.id, cameraId);
          actionTaken = "RECOVERED";
        }

        results.push({
          ...target,
          capacityBytes: health.capacityBytes,
          usedBytes: health.usedBytes,
          availableBytes: health.availableBytes,
          usagePercent: usage,
          nodeHealth: health.healthState,
          actionTaken,
        });
      } catch (err: any) {
        if (target.id === currentActive.id) {
          await this.triggerFailover(mediaNodeId, target.id, "WRITE_FAILURE", err?.message, cameraId);
          actionTaken = "FAILOVER_TRIGGERED";
        }
        results.push({
          ...target,
          actionTaken,
        });
      }
    }

    const finalActive = await this.router.getActiveTarget(mediaNodeId, cameraId);
    return {
      activeTarget: finalActive,
      targets: results,
    };
  }

  /**
   * Records a failover event in the database for auditing
   */
  async recordFailoverEvent(event: StorageFailoverEvent): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO storage_failover_events (
           id, tenant_id, media_node_id, camera_id, from_storage_node_id,
           from_target_path, to_storage_node_id, to_target_path, reason,
           error_detail, occurred_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          event.id || null,
          event.tenantId,
          event.mediaNodeId,
          event.cameraId || null,
          event.fromStorageNodeId,
          event.fromTargetPath,
          event.toStorageNodeId,
          event.toTargetPath,
          event.reason,
          event.errorDetail || null,
          event.occurredAt || new Date().toISOString(),
        ],
      );
    } catch (err) {
      console.warn("[StorageFailover] Failed to record failover event:", err);
    }
  }

  /**
   * Marks unrecovered failover events as recovered in PostgreSQL
   */
  async markEventRecovered(mediaNodeId: string, storageNodeId: string): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `UPDATE storage_failover_events
         SET recovered_at = NOW()
         WHERE media_node_id = $1
           AND from_storage_node_id = $2
           AND recovered_at IS NULL`,
        [mediaNodeId, storageNodeId],
      );
    } catch (err) {
      console.warn("[StorageFailover] Failed to mark event recovered in DB:", err);
    }
  }

  /**
   * Lists historical failover events
   */
  async listFailoverEvents(mediaNodeId?: string, limit = 50, reason?: string): Promise<StorageFailoverEvent[]> {
    if (!this.pool) return [];
    const safeLimit = Math.min(200, Math.max(1, Math.trunc(limit)));
    try {
      let query = `SELECT * FROM storage_failover_events`;
      const params: any[] = [];
      const conditions: string[] = [];

      if (mediaNodeId) {
        params.push(mediaNodeId);
        conditions.push(`media_node_id = $${params.length}`);
      }
      if (reason) {
        params.push(reason);
        conditions.push(`reason = $${params.length}`);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(" AND ")}`;
      }

      params.push(safeLimit);
      query += ` ORDER BY occurred_at DESC LIMIT $${params.length}`;

      const result = await this.pool.query(query, params);
      return result.rows.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        mediaNodeId: r.media_node_id,
        cameraId: r.camera_id ?? undefined,
        fromStorageNodeId: r.from_storage_node_id,
        fromTargetPath: r.from_target_path,
        toStorageNodeId: r.to_storage_node_id,
        toTargetPath: r.to_target_path,
        reason: r.reason,
        errorDetail: r.error_detail ?? undefined,
        occurredAt: new Date(r.occurred_at).toISOString(),
        recoveredAt: r.recovered_at ? new Date(r.recovered_at).toISOString() : undefined,
        createdAt: new Date(r.created_at).toISOString(),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Returns operational metrics and MTTR for storage target failover
   */
  async getFailoverMetrics(mediaNodeId?: string): Promise<FailoverTelemetryMetrics> {
    const events = await this.listFailoverEvents(mediaNodeId, 200);
    const targets = mediaNodeId ? this.router.getPermittedTargets(mediaNodeId) : [];

    const reasonBreakdown: Record<string, number> = {};
    let totalRecoveryDurationMs = 0;
    let recoveredCount = 0;
    let unrecoveredCount = 0;

    for (const ev of events) {
      reasonBreakdown[ev.reason] = (reasonBreakdown[ev.reason] || 0) + 1;
      if (ev.recoveredAt) {
        const diff = new Date(ev.recoveredAt).getTime() - new Date(ev.occurredAt).getTime();
        if (diff >= 0) {
          totalRecoveryDurationMs += diff;
          recoveredCount++;
        }
      } else {
        unrecoveredCount++;
      }
    }

    const meanTimeToRecoveryMs = recoveredCount > 0 ? Math.round(totalRecoveryDurationMs / recoveredCount) : 0;

    const summary = {
      total: targets.length,
      healthy: targets.filter((t) => t.healthState === "HEALTHY").length,
      full: targets.filter((t) => t.healthState === "FULL").length,
      offline: targets.filter((t) => t.healthState === "OFFLINE").length,
      degraded: targets.filter((t) => t.healthState === "DEGRADED" || t.healthState === "READ_ONLY").length,
    };

    return {
      mediaNodeId,
      totalEvents: events.length,
      unrecoveredEvents: unrecoveredCount,
      meanTimeToRecoveryMs,
      reasonBreakdown,
      targetsSummary: summary,
    };
  }
}

export const storageFailoverService = new StorageFailoverService();

