import type { Pool } from "pg";
import type { KeyframeEntry, KeyframeLookupResult } from "./recording-index.types.js";

export class RecordingKeyframeService {
  constructor(private readonly pool: Pool) {}

  /**
   * Resolves the nearest earlier keyframe (<= requested timestamp) for instant seeking
   */
  async findNearestKeyframe(
    cameraId: string,
    targetTime: Date,
    maxLookbackMs = 60_000,
  ): Promise<KeyframeLookupResult | null> {
    const targetIso = targetTime.toISOString();
    const minIso = new Date(targetTime.getTime() - maxLookbackMs).toISOString();

    // Query keyframe directly from recording_keyframes joining segment
    const query = `
      SELECT 
        k.segment_id,
        k.timestamp,
        k.pts,
        k.dts,
        k.byte_offset,
        s.camera_id,
        s.storage_uri,
        s.storage_path
      FROM recording_keyframes k
      JOIN recording_segments s ON s.id = k.segment_id
      WHERE s.camera_id = $1
        AND k.timestamp <= $2::timestamptz
        AND k.timestamp >= $3::timestamptz
        AND s.status <> 'deleted'
      ORDER BY k.timestamp DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [cameraId, targetIso, minIso]);

    if (result.rows[0]) {
      const row = result.rows[0];
      const kfDate = new Date(row.timestamp);
      return {
        segmentId: row.segment_id,
        cameraId: row.camera_id,
        targetTime,
        nearestKeyframeTime: kfDate,
        pts: row.pts !== null ? Number(row.pts) : undefined,
        dts: row.dts !== null ? Number(row.dts) : undefined,
        byteOffset: row.byte_offset !== null ? Number(row.byte_offset) : undefined,
        storageUri: row.storage_uri || row.storage_path,
        timeDifferenceMs: Math.max(0, targetTime.getTime() - kfDate.getTime()),
      };
    }

    // Fallback: Check if segment JSON keyframe_index contains keyframe entries
    const fallbackQuery = `
      SELECT 
        id as segment_id,
        camera_id,
        storage_uri,
        storage_path,
        started_at,
        ended_at,
        keyframe_index
      FROM recording_segments
      WHERE camera_id = $1
        AND started_at <= $2::timestamptz
        AND ended_at >= $3::timestamptz
        AND status <> 'deleted'
      ORDER BY started_at DESC
      LIMIT 1
    `;

    const fallbackResult = await this.pool.query(fallbackQuery, [cameraId, targetIso, minIso]);
    if (!fallbackResult.rows[0]) return null;

    const row = fallbackResult.rows[0];
    const startedAt = new Date(row.started_at);
    type RawKeyframe = { pts: number; wallClock: string; offset: number };
    const keyframes = row.keyframe_index as RawKeyframe[] | undefined;

    if (!keyframes || keyframes.length === 0) {
      return {
        segmentId: row.segment_id,
        cameraId: row.camera_id,
        targetTime,
        nearestKeyframeTime: startedAt,
        storageUri: row.storage_uri || row.storage_path,
        timeDifferenceMs: Math.max(0, targetTime.getTime() - startedAt.getTime()),
      };
    }

    // Find nearest keyframe <= targetTime
    let bestKeyframe: RawKeyframe | undefined = keyframes[0];
    for (const kf of keyframes) {
      const kfTime = new Date(kf.wallClock).getTime();
      if (kfTime <= targetTime.getTime()) {
        bestKeyframe = kf;
      } else {
        break;
      }
    }

    if (!bestKeyframe) {
      return {
        segmentId: row.segment_id,
        cameraId: row.camera_id,
        targetTime,
        nearestKeyframeTime: startedAt,
        pts: 0,
        byteOffset: 0,
        storageUri: row.storage_uri || row.storage_path,
        timeDifferenceMs: Math.max(0, targetTime.getTime() - startedAt.getTime()),
      };
    }

    const kfDate = new Date(bestKeyframe.wallClock);
    return {
      segmentId: row.segment_id,
      cameraId: row.camera_id,
      targetTime,
      nearestKeyframeTime: kfDate,
      pts: bestKeyframe.pts,
      byteOffset: bestKeyframe.offset,
      storageUri: row.storage_uri || row.storage_path,
      timeDifferenceMs: Math.max(0, targetTime.getTime() - kfDate.getTime()),
    };
  }

  /**
   * Batch inserts keyframes for a finalized segment into recording_keyframes.
   */
  async batchInsertKeyframes(segmentId: string, keyframes: KeyframeEntry[]): Promise<number> {
    if (keyframes.length === 0) return 0;

    const values: any[] = [];
    const chunks: string[] = [];

    keyframes.forEach((kf, index) => {
      const offset = index * 5;
      chunks.push(`($${offset + 1}, $${offset + 2}::timestamptz, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
      values.push(
        segmentId,
        kf.timestamp.toISOString(),
        kf.pts ?? null,
        kf.dts ?? null,
        kf.byteOffset ?? null,
      );
    });

    const query = `
      INSERT INTO recording_keyframes (segment_id, timestamp, pts, dts, byte_offset)
      VALUES ${chunks.join(", ")}
      ON CONFLICT (segment_id, timestamp) DO UPDATE
      SET pts = EXCLUDED.pts,
          dts = EXCLUDED.dts,
          byte_offset = EXCLUDED.byte_offset
    `;

    await this.pool.query(query, values);
    return keyframes.length;
  }

  /**
   * Retrieves all keyframes for a specific segment.
   */
  async listKeyframesForSegment(segmentId: string): Promise<KeyframeEntry[]> {
    const result = await this.pool.query(
      `SELECT timestamp, pts, dts, byte_offset 
       FROM recording_keyframes 
       WHERE segment_id = $1 
       ORDER BY timestamp ASC`,
      [segmentId],
    );

    return result.rows.map((row) => ({
      timestamp: new Date(row.timestamp),
      pts: row.pts !== null ? Number(row.pts) : undefined,
      dts: row.dts !== null ? Number(row.dts) : undefined,
      byteOffset: row.byte_offset !== null ? Number(row.byte_offset) : undefined,
    }));
  }
}
