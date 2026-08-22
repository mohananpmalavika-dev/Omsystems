import type { Pool } from "pg";
import { pool as defaultPool } from "../database/pool.js";
import type { MediaNodeStorageTarget, StorageFailoverEvent, StorageFailoverReason } from "../domain/models.js";
import { storageFailoverRouter, StorageFailoverRouter } from "./storage-failover-router.js";
import type { FailoverTargetEntry } from "./storage-failover-router.js";

export class StorageFailoverService {
  private readonly pool: Pool;
  private readonly router: StorageFailoverRouter;

  constructor(
    pool: Pool = defaultPool as Pool,
    router: StorageFailoverRouter = storageFailoverRouter,
  ) {
    this.pool = pool;
    this.router = router;

    // Listen to router failover events to record audit logs in PostgreSQL
    this.router.on("failover:triggered", async (event: StorageFailoverEvent) => {
      await this.recordFailoverEvent(event);
    });
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
            target.maxCapacityBytes || 0,
            target.spilloverThresholdPercent || 95.0,
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
   * Triggers a manual or synthetic failover test
   */
  async triggerFailover(
    mediaNodeId: string,
    targetId: string,
    reason: StorageFailoverReason = "MANUAL_OVERRIDE",
    errorDetail?: string,
    cameraId?: string,
  ): Promise<{ failoverOccurred: boolean; newTarget?: FailoverTargetEntry }> {
    return this.router.reportTargetFailure(mediaNodeId, targetId, reason, errorDetail, cameraId);
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
   * Lists historical failover events
   */
  async listFailoverEvents(mediaNodeId?: string, limit = 50): Promise<StorageFailoverEvent[]> {
    if (!this.pool) return [];
    try {
      let query = `SELECT * FROM storage_failover_events`;
      const params: any[] = [];
      if (mediaNodeId) {
        query += ` WHERE media_node_id = $1`;
        params.push(mediaNodeId);
      }
      query += ` ORDER BY occurred_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

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
}

export const storageFailoverService = new StorageFailoverService();
