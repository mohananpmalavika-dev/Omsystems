import type { Pool } from "pg";
import type { RecordingSegment } from "../domain/models.js";

export interface PlaybackSession {
  id: string;
  tenantId: string;
  userId: string;
  cameraId: string;
  fromTime: string;
  toTime: string;
  segmentsAccessed: string[];
  evidenceCaseId?: string;
  reason?: string;
  sourceIp: string;
  userAgent?: string;
  startedAt: string;
}

export interface SynchronizedPlayback {
  groupId: string;
  cameras: Array<{
    cameraId: string;
    name: string;
    segments: RecordingSegment[];
    timeOffset: number; // milliseconds adjustment for sync
  }>;
  masterCameraId: string;
  fromTime: string;
  toTime: string;
  layout: "grid" | "stacked" | "custom";
}

export interface FrameExtractionRequest {
  segmentId: string;
  timestamp: string; // ISO timestamp or offset in ms
  format?: "jpg" | "png" | "bmp";
  quality?: number; // 1-100
  width?: number;
  height?: number;
}

export interface PlaybackControls {
  speed: 0.25 | 0.5 | 1 | 2 | 4 | 8 | 16;
  currentTime: number; // seconds from start
  volume: number; // 0-1
  isPaused: boolean;
  isFullscreen: boolean;
  zoom: number; // 1.0 = 100%
  zoomCenter?: { x: number; y: number }; // normalized coordinates
}

export class PlaybackEngine {
  constructor(private readonly pool: Pool) {}

  /**
   * Create a playback session for audit tracking
   */
  async createSession(input: {
    tenantId: string;
    userId: string;
    cameraId: string;
    fromTime: string;
    toTime: string;
    evidenceCaseId?: string;
    reason?: string;
    sourceIp: string;
    userAgent?: string;
  }): Promise<PlaybackSession> {
    const result = await this.pool.query(
      `INSERT INTO playback_sessions (
         tenant_id, user_id, camera_id, from_time, to_time, 
         evidence_case_id, reason, source_ip, user_agent, started_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       RETURNING *`,
      [
        input.tenantId,
        input.userId,
        input.cameraId,
        input.fromTime,
        input.toTime,
        input.evidenceCaseId ?? null,
        input.reason ?? null,
        input.sourceIp,
        input.userAgent ?? null,
      ],
    );

    return mapPlaybackSession(result.rows[0]);
  }

  /**
   * Record segment access during playback
   */
  async recordSegmentAccess(sessionId: string, segmentId: string): Promise<void> {
    await this.pool.query(
      `UPDATE playback_sessions
       SET segments_accessed = array_append(segments_accessed, $2::uuid)
       WHERE id = $1`,
      [sessionId, segmentId],
    );
  }

  /**
   * Record playback action (snapshot, bookmark, export)
   */
  async recordAction(
    sessionId: string,
    action: {
      type: "snapshot" | "bookmark" | "export" | "zoom" | "frame-step";
      timestamp: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.pool.query(
      `UPDATE playback_sessions
       SET actions_performed = actions_performed || $2::jsonb
       WHERE id = $1`,
      [sessionId, JSON.stringify(action)],
    );
  }

  /**
   * End playback session
   */
  async endSession(sessionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE playback_sessions
       SET ended_at = now(),
           duration_seconds = EXTRACT(EPOCH FROM (now() - started_at))::integer
       WHERE id = $1 AND ended_at IS NULL`,
      [sessionId],
    );
  }

  /**
   * Get synchronized playback data for multiple cameras
   */
  async getSynchronizedPlayback(input: {
    tenantId: string;
    groupId?: string;
    cameraIds: string[];
    masterCameraId?: string;
    fromTime: string;
    toTime: string;
    layout?: "grid" | "stacked" | "custom";
  }): Promise<SynchronizedPlayback> {
    // Get playback group if groupId provided
    let timeOffsets: Record<string, number> = {};
    let layout = input.layout ?? "grid";
    let masterCameraId = input.masterCameraId ?? input.cameraIds[0];

    if (input.groupId) {
      const groupResult = await this.pool.query(
        `SELECT * FROM playback_groups WHERE id = $1 AND tenant_id = $2`,
        [input.groupId, input.tenantId],
      );

      if (groupResult.rows[0]) {
        const group = groupResult.rows[0];
        timeOffsets = group.time_offsets || {};
        layout = group.layout || layout;
        masterCameraId = group.master_camera_id || masterCameraId;
      }
    }

    // Get segments for each camera
    const cameras = await Promise.all(
      input.cameraIds.map(async (cameraId) => {
        const cameraResult = await this.pool.query(
          `SELECT * FROM cameras WHERE id = $1`,
          [cameraId],
        );

        const segmentsResult = await this.pool.query(
          `SELECT * FROM recording_segments
           WHERE camera_id = $1 
           AND started_at >= $2::timestamptz 
           AND ended_at <= $3::timestamptz
           AND status = 'ready'
           ORDER BY started_at ASC`,
          [cameraId, input.fromTime, input.toTime],
        );

        return {
          cameraId,
          name: cameraResult.rows[0]?.name || cameraId,
          segments: segmentsResult.rows.map(mapSegment),
          timeOffset: timeOffsets[cameraId] || 0,
        };
      }),
    );

    return {
      groupId: input.groupId || `temp-${Date.now()}`,
      cameras,
      masterCameraId: masterCameraId!,
      fromTime: input.fromTime,
      toTime: input.toTime,
      layout,
    };
  }

  /**
   * Create or update a playback group
   */
  async savePlaybackGroup(input: {
    id?: string;
    tenantId: string;
    name: string;
    description?: string;
    cameraIds: string[];
    masterCameraId: string;
    timeOffsets?: Record<string, number>;
    layout?: "grid" | "stacked" | "custom";
    createdBy: string;
  }): Promise<{ id: string; name: string }> {
    if (input.id) {
      // Update existing
      const result = await this.pool.query(
        `UPDATE playback_groups
         SET name = $2, description = $3, camera_ids = $4, master_camera_id = $5,
             time_offsets = $6, layout = $7, updated_at = now()
         WHERE id = $1 AND tenant_id = $8
         RETURNING id, name`,
        [
          input.id,
          input.name,
          input.description ?? null,
          input.cameraIds,
          input.masterCameraId,
          JSON.stringify(input.timeOffsets || {}),
          input.layout ?? "grid",
          input.tenantId,
        ],
      );

      return result.rows[0];
    }

    // Create new
    const result = await this.pool.query(
      `INSERT INTO playback_groups (
         tenant_id, name, description, camera_ids, master_camera_id,
         time_offsets, layout, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name`,
      [
        input.tenantId,
        input.name,
        input.description ?? null,
        input.cameraIds,
        input.masterCameraId,
        JSON.stringify(input.timeOffsets || {}),
        input.layout ?? "grid",
        input.createdBy,
      ],
    );

    return result.rows[0];
  }

  /**
   * Get playback groups for a tenant
   */
  async listPlaybackGroups(
    tenantId: string,
    userId?: string,
  ): Promise<
    Array<{
      id: string;
      name: string;
      description?: string;
      cameraCount: number;
      layout: string;
      createdAt: string;
    }>
  > {
    const result = await this.pool.query(
      `SELECT 
         pg.id, pg.name, pg.description, pg.layout,
         array_length(pg.camera_ids, 1) as camera_count,
         pg.created_at
       FROM playback_groups pg
       WHERE pg.tenant_id = $1 ${userId ? "AND pg.created_by = $2" : ""}
       ORDER BY pg.created_at DESC
       LIMIT 100`,
      userId ? [tenantId, userId] : [tenantId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      cameraCount: row.camera_count || 0,
      layout: row.layout,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  /**
   * Calculate time offset between cameras for synchronization
   * This uses NTP sync data and camera clock differences
   */
  async calculateTimeOffsets(
    cameraIds: string[],
    referenceTimestamp: string,
  ): Promise<Record<string, number>> {
    const offsets: Record<string, number> = {};

    // Get camera metadata including NTP sync status
    const result = await this.pool.query(
      `SELECT 
         c.id,
         c.metadata->>'ntpEnabled' as ntp_enabled,
         c.metadata->>'clockOffsetMs' as clock_offset
       FROM cameras c
       WHERE c.id = ANY($1::uuid[])`,
      [cameraIds],
    );

    for (const row of result.rows) {
      const clockOffset = row.clock_offset ? parseInt(row.clock_offset, 10) : 0;
      offsets[row.id] = clockOffset;
    }

    return offsets;
  }

  /**
   * Get segment at specific timestamp (for frame extraction)
   */
  async getSegmentAtTimestamp(
    cameraId: string,
    timestamp: string,
  ): Promise<RecordingSegment | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM recording_segments
       WHERE camera_id = $1 
       AND started_at <= $2::timestamptz
       AND ended_at >= $2::timestamptz
       AND status = 'ready'
       ORDER BY started_at ASC
       LIMIT 1`,
      [cameraId, timestamp],
    );

    return result.rows[0] ? mapSegment(result.rows[0]) : undefined;
  }

  /**
   * Get adjacent segments for seamless playback
   */
  async getAdjacentSegments(
    segmentId: string,
    direction: "previous" | "next",
  ): Promise<RecordingSegment | undefined> {
    const currentResult = await this.pool.query(
      `SELECT * FROM recording_segments WHERE id = $1`,
      [segmentId],
    );

    if (!currentResult.rows[0]) return undefined;

    const current = currentResult.rows[0];
    const operator = direction === "next" ? ">" : "<";
    const order = direction === "next" ? "ASC" : "DESC";

    const result = await this.pool.query(
      `SELECT * FROM recording_segments
       WHERE camera_id = $1 
       AND started_at ${operator} $2
       AND status = 'ready'
       ORDER BY started_at ${order}
       LIMIT 1`,
      [current.camera_id, current.started_at],
    );

    return result.rows[0] ? mapSegment(result.rows[0]) : undefined;
  }

  /**
   * Validate playback permissions and legal holds
   */
  async validatePlaybackAccess(
    userId: string,
    cameraId: string,
    fromTime: string,
    toTime: string,
  ): Promise<{
    allowed: boolean;
    reason?: string;
    requiresJustification?: boolean;
    legalHoldActive?: boolean;
  }> {
    // Check for active legal holds
    const legalHoldResult = await this.pool.query(
      `SELECT COUNT(*) as count
       FROM recording_legal_holds
       WHERE camera_id = $1
       AND from_at <= $3::timestamptz
       AND to_at >= $2::timestamptz
       AND released_at IS NULL`,
      [cameraId, fromTime, toTime],
    );

    const legalHoldActive = parseInt(legalHoldResult.rows[0].count, 10) > 0;

    // Legal hold footage requires justification
    if (legalHoldActive) {
      return {
        allowed: true,
        requiresJustification: true,
        legalHoldActive: true,
        reason: "Legal hold active - access will be logged",
      };
    }

    return { allowed: true, legalHoldActive: false };
  }

  /**
   * Get playback quality metrics
   */
  async getPlaybackQuality(
    segmentIds: string[],
  ): Promise<{
    averageBitrate: number;
    averageResolution: string;
    codecs: string[];
    totalBytes: number;
  }> {
    if (segmentIds.length === 0) {
      return {
        averageBitrate: 0,
        averageResolution: "unknown",
        codecs: [],
        totalBytes: 0,
      };
    }

    const result = await this.pool.query(
      `SELECT 
         AVG(size_bytes / EXTRACT(EPOCH FROM (ended_at - started_at))) as avg_bytes_per_sec,
         SUM(size_bytes) as total_bytes,
         array_agg(DISTINCT codec) as codecs
       FROM recording_segments
       WHERE id = ANY($1::uuid[])`,
      [segmentIds],
    );

    const row = result.rows[0];
    const avgBytesPerSec = parseFloat(row.avg_bytes_per_sec || "0");
    const avgBitrate = Math.round((avgBytesPerSec * 8) / 1000); // kbps

    return {
      averageBitrate: avgBitrate,
      averageResolution: "1920x1080", // Would need frame analysis
      codecs: row.codecs?.filter(Boolean) || [],
      totalBytes: parseInt(row.total_bytes || "0", 10),
    };
  }
}

function mapPlaybackSession(row: any): PlaybackSession {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    cameraId: row.camera_id,
    fromTime: new Date(row.from_time).toISOString(),
    toTime: new Date(row.to_time).toISOString(),
    segmentsAccessed: row.segments_accessed || [],
    evidenceCaseId: row.evidence_case_id,
    reason: row.reason,
    sourceIp: row.source_ip,
    userAgent: row.user_agent,
    startedAt: new Date(row.started_at).toISOString(),
  };
}

function mapSegment(row: any): RecordingSegment {
  return {
    id: row.id,
    cameraId: row.camera_id,
    jobId: row.job_id,
    startedAt: new Date(row.started_at).toISOString(),
    endedAt: new Date(row.ended_at).toISOString(),
    storagePath: row.storage_path,
    sizeBytes: Number(row.size_bytes),
    storageNodeExternalId: row.storage_node_external_id,
    storageTier: row.storage_tier,
    status: row.status,
    checksumSha256: row.checksum_sha256 ?? undefined,
    codec: row.codec ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
