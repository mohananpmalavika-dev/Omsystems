import type { Pool } from "pg";
import type { StorageTier, ArchiveState } from "./recording-index.types.js";
import type { DbRecordingSegmentLocation } from "../domain/models.js";

export class RecordingLocationService {
  constructor(private readonly pool: Pool) {}

  /**
   * Registers a new physical or cloud location for a recording segment.
   */
  async registerLocation(input: {
    segmentId: string;
    storageNodeId?: string;
    storageTier: StorageTier;
    storageUri: string;
    state?: "ONLINE" | "OFFLINE" | "MIGRATING" | "DELETED";
  }): Promise<DbRecordingSegmentLocation> {
    const result = await this.pool.query(
      `INSERT INTO recording_segment_locations (
         segment_id, storage_node_id, storage_tier, storage_uri, state
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.segmentId,
        input.storageNodeId ?? null,
        input.storageTier,
        input.storageUri,
        input.state ?? "ONLINE",
      ],
    );

    return this.mapLocation(result.rows[0]);
  }

  /**
   * Transitions a segment to a new tier (e.g. HOT -> WARM -> ARCHIVE), archiving the old location.
   */
  async transitionTier(
    segmentId: string,
    newTier: StorageTier,
    newStorageUri: string,
    storageNodeId?: string,
  ): Promise<DbRecordingSegmentLocation> {
    // 1. Mark previous active locations as removed
    await this.pool.query(
      `UPDATE recording_segment_locations
       SET removed_at = now(), state = 'OFFLINE'
       WHERE segment_id = $1 AND removed_at IS NULL`,
      [segmentId],
    );

    // 2. Insert new active location
    const newLoc = await this.registerLocation({
      segmentId,
      storageNodeId,
      storageTier: newTier,
      storageUri: newStorageUri,
      state: "ONLINE",
    });

    // 3. Update master segment record
    await this.pool.query(
      `UPDATE recording_segments
       SET storage_tier = $2,
           storage_uri = $3,
           storage_node_external_id = COALESCE($4, storage_node_external_id),
           archive_state = CASE 
             WHEN $2 = 'ARCHIVE' OR $2 = 'COLD' THEN 'ARCHIVED'
             WHEN $2 = 'WARM' THEN 'NEARLINE'
             ELSE 'ONLINE'
           END
       WHERE id = $1`,
      [segmentId, newTier.toLowerCase(), newStorageUri, storageNodeId ?? null],
    );

    return newLoc;
  }

  /**
   * Retrieves full storage location history for a segment (audit trail).
   */
  async getLocationHistory(segmentId: string): Promise<DbRecordingSegmentLocation[]> {
    const result = await this.pool.query(
      `SELECT * FROM recording_segment_locations
       WHERE segment_id = $1
       ORDER BY created_at ASC`,
      [segmentId],
    );

    return result.rows.map((r) => this.mapLocation(r));
  }

  private mapLocation(row: any): DbRecordingSegmentLocation {
    return {
      id: row.id,
      segmentId: row.segment_id,
      storageNodeId: row.storage_node_id ?? undefined,
      storageTier: (row.storage_tier || "HOT").toUpperCase() as StorageTier,
      storageUri: row.storage_uri,
      state: row.state || "ONLINE",
      createdAt: new Date(row.created_at).toISOString(),
      removedAt: row.removed_at ? new Date(row.removed_at).toISOString() : undefined,
    };
  }
}
