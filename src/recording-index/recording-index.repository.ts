import type { Pool } from "pg";
import type {
  RegisterRecordingSegmentInput,
  RecordingSearchRequest,
  RecordingSegmentResult,
  ArchiveState,
  StorageTier,
} from "./recording-index.types.js";
import type { RecordingSegment } from "../domain/models.js";
import { storageResolver } from "../storage/storage-resolver.service.js";

export class RecordingIndexRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Queries recording segments using interval overlap:
   * (segment.started_at < query.to AND segment.ended_at > query.from)
   */
  async findOverlappingSegments(
    request: RecordingSearchRequest,
  ): Promise<RecordingSegmentResult[]> {
    const fromIso = request.from.toISOString();
    const toIso = request.to.toISOString();

    let query = `
      SELECT 
        id,
        camera_id,
        job_id,
        started_at,
        ended_at,
        storage_path,
        storage_uri,
        size_bytes,
        storage_node_external_id,
        storage_tier,
        status,
        checksum_sha256,
        codec,
        width,
        height,
        fps,
        duration_ms,
        archive_state,
        health,
        segment_state,
        starts_with_keyframe,
        keyframe_index,
        created_at,
        indexed_at
      FROM recording_segments
      WHERE camera_id = ANY($1)
        AND started_at < $3::timestamptz
        AND ended_at > $2::timestamptz
        AND status <> 'deleted'
    `;

    const params: any[] = [request.cameraIds, fromIso, toIso];

    if (request.storageStates && request.storageStates.length > 0) {
      query += ` AND archive_state = ANY($4)`;
      params.push(request.storageStates);
    }

    if (request.minDurationMs && request.minDurationMs > 0) {
      query += ` AND COALESCE(duration_ms, EXTRACT(EPOCH FROM (ended_at - started_at)) * 1000) >= $${params.length + 1}`;
      params.push(request.minDurationMs);
    }

    query += ` ORDER BY started_at ASC`;

    const result = await this.pool.query(query, params);
    return result.rows.map((row) => this.mapSegmentResult(row));
  }

  /**
   * Finds a single segment containing the specified timestamp
   */
  async findSegmentAt(cameraId: string, timestamp: Date): Promise<RecordingSegmentResult | null> {
    const timeIso = timestamp.toISOString();
    const query = `
      SELECT *
      FROM recording_segments
      WHERE camera_id = $1
        AND started_at <= $2::timestamptz
        AND ended_at >= $2::timestamptz
        AND status <> 'deleted'
      ORDER BY started_at DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [cameraId, timeIso]);
    if (!result.rows[0]) return null;
    return this.mapSegmentResult(result.rows[0]);
  }

  /**
   * Retrieves earliest and latest recording timestamps and overall segment metrics for a camera
   */
  async getRecordingRange(cameraId: string): Promise<{
    firstRecordedTime?: Date;
    lastRecordedTime?: Date;
    totalSegments: number;
    totalSizeBytes: number;
    archiveStates: Record<ArchiveState, number>;
  }> {
    const summaryQuery = `
      SELECT 
        MIN(started_at) as first_recorded,
        MAX(ended_at) as last_recorded,
        COUNT(*)::int as total_segments,
        COALESCE(SUM(size_bytes), 0)::bigint as total_size
      FROM recording_segments
      WHERE camera_id = $1 AND status <> 'deleted'
    `;

    const stateQuery = `
      SELECT COALESCE(archive_state, 'ONLINE') as state, COUNT(*)::int as count
      FROM recording_segments
      WHERE camera_id = $1 AND status <> 'deleted'
      GROUP BY archive_state
    `;

    const [summaryRes, stateRes] = await Promise.all([
      this.pool.query(summaryQuery, [cameraId]),
      this.pool.query(stateQuery, [cameraId]),
    ]);

    const row = summaryRes.rows[0];
    const archiveStates: Record<ArchiveState, number> = {
      ONLINE: 0,
      NEARLINE: 0,
      ARCHIVED: 0,
      RESTORING: 0,
      OFFLINE: 0,
      DELETED: 0,
      LEGAL_HOLD: 0,
    };

    stateRes.rows.forEach((r) => {
      const stateKey = (r.state || "ONLINE").toUpperCase() as ArchiveState;
      if (archiveStates[stateKey] !== undefined) {
        archiveStates[stateKey] = Number(r.count);
      }
    });

    return {
      firstRecordedTime: row?.first_recorded ? new Date(row.first_recorded) : undefined,
      lastRecordedTime: row?.last_recorded ? new Date(row.last_recorded) : undefined,
      totalSegments: Number(row?.total_segments || 0),
      totalSizeBytes: Number(row?.total_size || 0),
      archiveStates,
    };
  }

  /**
   * Idempotently upserts a finalized recording segment record
   */
  async upsertSegment(input: RegisterRecordingSegmentInput): Promise<RecordingSegmentResult> {
    const id = input.id || undefined;
    const durationMs = input.durationMs ?? Math.max(0, input.endTime.getTime() - input.startTime.getTime());
    const storageTier = input.storageTier ?? "HOT";
    const archiveState = input.archiveState ?? "ONLINE";

    const query = `
      INSERT INTO recording_segments (
        ${id ? "id," : ""}
        camera_id,
        job_id,
        started_at,
        ended_at,
        storage_path,
        storage_uri,
        size_bytes,
        storage_node_external_id,
        storage_tier,
        status,
        checksum_sha256,
        codec,
        width,
        height,
        fps,
        duration_ms,
        archive_state,
        first_pts,
        last_pts,
        first_dts,
        last_dts,
        time_base,
        device_start_time,
        device_end_time,
        clock_offset_ms,
        clock_uncertainty_ms,
        bitrate,
        starts_with_keyframe,
        health,
        segment_state,
        manifest_json,
        created_at,
        indexed_at
      ) VALUES (
        ${id ? "$1," : ""}
        $${id ? "2" : "1"},
        $${id ? "3" : "2"},
        $${id ? "4" : "3"}::timestamptz,
        $${id ? "5" : "4"}::timestamptz,
        $${id ? "6" : "5"},
        $${id ? "7" : "6"},
        $${id ? "8" : "7"},
        $${id ? "9" : "8"},
        $${id ? "10" : "9"},
        $${id ? "11" : "10"},
        $${id ? "12" : "11"},
        $${id ? "13" : "12"},
        $${id ? "14" : "13"},
        $${id ? "15" : "14"},
        $${id ? "16" : "15"},
        $${id ? "17" : "16"},
        $${id ? "18" : "17"},
        $${id ? "19" : "18"},
        $${id ? "20" : "19"},
        $${id ? "21" : "20"},
        $${id ? "22" : "21"},
        $${id ? "23" : "22"},
        $${id ? "24" : "23"}::timestamptz,
        $${id ? "25" : "24"}::timestamptz,
        $${id ? "26" : "25"},
        $${id ? "27" : "26"},
        $${id ? "28" : "27"},
        $${id ? "29" : "28"},
        $${id ? "30" : "29"},
        $${id ? "31" : "30"},
        $${id ? "32" : "31"}::jsonb,
        now(),
        now()
      )
      ON CONFLICT (camera_id, storage_path) DO UPDATE
      SET ended_at = EXCLUDED.ended_at,
          size_bytes = EXCLUDED.size_bytes,
          checksum_sha256 = COALESCE(EXCLUDED.checksum_sha256, recording_segments.checksum_sha256),
          codec = COALESCE(EXCLUDED.codec, recording_segments.codec),
          width = COALESCE(EXCLUDED.width, recording_segments.width),
          height = COALESCE(EXCLUDED.height, recording_segments.height),
          fps = COALESCE(EXCLUDED.fps, recording_segments.fps),
          duration_ms = EXCLUDED.duration_ms,
          archive_state = EXCLUDED.archive_state,
          health = EXCLUDED.health,
          segment_state = EXCLUDED.segment_state,
          manifest_json = COALESCE(EXCLUDED.manifest_json, recording_segments.manifest_json),
          indexed_at = now()
      RETURNING *
    `;

    const values: any[] = [];
    if (id) values.push(id);
    values.push(
      input.cameraId,
      input.streamId || input.id || "default",
      input.startTime.toISOString(),
      input.endTime.toISOString(),
      input.storageUri,
      input.storageUri,
      input.fileSize,
      input.storageNodeId,
      storageTier.toLowerCase(),
      "ready",
      input.sha256 ?? null,
      input.codec ?? "h264",
      input.width ?? null,
      input.height ?? null,
      input.fps ?? null,
      durationMs,
      archiveState,
      input.firstPts ?? null,
      input.lastPts ?? null,
      input.firstDts ?? null,
      input.lastDts ?? null,
      input.timeBase ?? null,
      input.deviceStartTime ? input.deviceStartTime.toISOString() : null,
      input.deviceEndTime ? input.deviceEndTime.toISOString() : null,
      input.clockOffsetMs ?? 0,
      input.clockUncertaintyMs ?? 0,
      input.bitrate ?? null,
      input.startsWithKeyframe ?? true,
      input.health ?? "HEALTHY",
      input.segmentState ?? "AVAILABLE",
      JSON.stringify(input.manifestJson || {}),
    );

    const result = await this.pool.query(query, values);
    return this.mapSegmentResult(result.rows[0]);
  }

  private mapSegmentResult(row: any): RecordingSegmentResult {
    const uri = row.storage_uri || row.storage_path;
    const tier = String(row.storage_tier || "HOT").toUpperCase() as StorageTier;
    const archiveState = String(row.archive_state || "ONLINE").toUpperCase() as ArchiveState;

    const resolved = storageResolver.resolve(uri, {
      storageTier: tier,
      archiveState,
    });

    const keyframes = Array.isArray(row.keyframe_index)
      ? (row.keyframe_index as Array<{ pts: number; wallClock: string; offset: number }>).map((k) => ({
          timestamp: new Date(k.wallClock),
          pts: k.pts,
          byteOffset: k.offset,
        }))
      : undefined;

    return {
      segmentId: row.id,
      cameraId: row.camera_id,
      startTime: new Date(row.started_at),
      endTime: new Date(row.ended_at),
      durationMs: row.duration_ms !== null ? Number(row.duration_ms) : Math.max(0, new Date(row.ended_at).getTime() - new Date(row.started_at).getTime()),
      fileSize: Number(row.size_bytes || 0),
      sha256: row.checksum_sha256 ?? undefined,
      codec: row.codec ?? undefined,
      width: row.width !== null ? Number(row.width) : undefined,
      height: row.height !== null ? Number(row.height) : undefined,
      fps: row.fps !== null ? Number(row.fps) : undefined,
      storage: {
        nodeId: row.storage_node_external_id || resolved.storageNodeId,
        tier,
        uri,
        available: row.status === "ready" && archiveState === "ONLINE",
        localPath: resolved.localPath,
        streamUrl: resolved.streamUrl,
      },
      archive: {
        state: archiveState,
        restoreRequired: resolved.requiresRestore,
      },
      health: row.health || "HEALTHY",
      keyframes,
    };
  }
}
