import type { Pool } from "pg";
import type { RecordingSegment } from "../domain/models.js";
import { recordingIndexService } from "../recording-index/recording-index.service.js";

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
    clockOffsetMs?: number;
    measuredDriftMs?: number;
    driftStatus?: "SYNCHRONIZED" | "DRIFT_WARNING" | "DRIFT_CRITICAL";
  }>;
  masterCameraId: string;
  fromTime: string;
  toTime: string;
  layout: "grid" | "stacked" | "custom";
  driftCompensationEnabled?: boolean;
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
    let cameraIds = [...new Set(input.cameraIds)];
    let masterCameraId = input.masterCameraId ?? cameraIds[0];

    if (input.groupId) {
      const groupResult = await this.pool.query(
        `SELECT camera_ids, master_camera_id, time_offsets, layout
         FROM playback_groups
         WHERE id = $1 AND tenant_id = $2`,
        [input.groupId, input.tenantId],
      );

      if (!groupResult.rows[0]) {
        throw new Error("playback_group_not_found");
      }
      const group = groupResult.rows[0];
      const groupCameraIds = Array.isArray(group.camera_ids) ? group.camera_ids : [];
      if (cameraIds.length === 0) cameraIds = groupCameraIds;
      timeOffsets = parseTimeOffsets(group.time_offsets);
      layout = group.layout || layout;
      masterCameraId = input.masterCameraId ?? group.master_camera_id ?? masterCameraId;
    }

    if (cameraIds.length === 0 || cameraIds.length > 16) {
      throw new Error("invalid_playback_camera_selection");
    }
    if (!masterCameraId || !cameraIds.includes(masterCameraId)) {
      masterCameraId = cameraIds[0] ?? "";
    }

    // Query clock_drift_telemetry for cameras to obtain authoritative real-time/historical clock offset
    const telemetryDrifts = new Map<string, { offsetMs: number; status: "SYNCHRONIZED" | "DRIFT_WARNING" | "DRIFT_CRITICAL" }>();
    try {
      const driftRes = await this.pool.query(
        `SELECT DISTINCT ON (node_id) node_id, offset_ms, status 
         FROM clock_drift_telemetry 
         WHERE node_id = ANY($1::varchar[])
         ORDER BY node_id, measured_at DESC`,
        [cameraIds],
      );
      for (const row of driftRes.rows) {
        const offset = Number(row.offset_ms || 0);
        const absOffset = Math.abs(offset);
        const status = absOffset <= 5000 ? "SYNCHRONIZED" : absOffset <= 30000 ? "DRIFT_WARNING" : "DRIFT_CRITICAL";
        telemetryDrifts.set(String(row.node_id), { offsetMs: offset, status });
      }
    } catch {
      // Non-fatal, fallback to group offsets
    }

    // Get authoritative recording search result from RecordingIndex
    const searchResult = await recordingIndexService.findRecording({
      tenantId: input.tenantId,
      cameraIds,
      from: new Date(input.fromTime),
      to: new Date(input.toTime),
      includeKeyframes: true,
      includeGaps: true,
    });

    const cameras = await Promise.all(
      searchResult.cameras.map(async (camRes) => {
        const cameraResult = await this.pool.query(
          `SELECT name FROM cameras WHERE id = $1`,
          [camRes.cameraId],
        );

        const mappedSegments: RecordingSegment[] = camRes.segments.map((s) => ({
          id: s.segmentId,
          cameraId: s.cameraId,
          jobId: "default",
          startedAt: s.startTime.toISOString(),
          endedAt: s.endTime.toISOString(),
          storagePath: s.storage.uri,
          sizeBytes: s.fileSize,
          storageNodeExternalId: s.storage.nodeId || "sentinel-local",
          storageTier: s.storage.tier.toLowerCase() as "hot" | "warm" | "cold",
          status: s.storage.available ? "ready" : "error",
          checksumSha256: s.sha256,
          codec: s.codec,
          createdAt: s.startTime.toISOString(),
        }));

        const telemetry = telemetryDrifts.get(camRes.cameraId);
        const effectiveOffset = timeOffsets[camRes.cameraId] ?? telemetry?.offsetMs ?? 0;
        const driftStatus = telemetry?.status ?? (Math.abs(effectiveOffset) <= 5000 ? "SYNCHRONIZED" : Math.abs(effectiveOffset) <= 30000 ? "DRIFT_WARNING" : "DRIFT_CRITICAL");

        return {
          cameraId: camRes.cameraId,
          name: cameraResult.rows[0]?.name || camRes.cameraId,
          segments: mappedSegments,
          timeOffset: normalizeTimeOffset(effectiveOffset),
          clockOffsetMs: effectiveOffset,
          measuredDriftMs: telemetry?.offsetMs ?? effectiveOffset,
          driftStatus,
        };
      }),
    );

    return {
      groupId: input.groupId || `temp-${Date.now()}`,
      cameras,
      masterCameraId: masterCameraId || "",
      fromTime: input.fromTime,
      toTime: input.toTime,
      layout,
      driftCompensationEnabled: true,
    };
  }

  /**
   * Resolves the nearest earlier keyframe IDR and byte offset for instant, sub-second seeking
   */
  async resolveSeekPoint(cameraId: string, targetTime: string): Promise<{
    segment?: RecordingSegment;
    keyframeOffset?: number;
    keyframePts?: number;
    keyframeWallClock?: string;
    directSeekAvailable: boolean;
  }> {
    const targetDate = new Date(targetTime);
    const keyframeLookup = await recordingIndexService.findNearestKeyframe(cameraId, targetDate);

    if (keyframeLookup) {
      const seg = await recordingIndexService.findSegmentAt(cameraId, targetDate);
      const mappedSegment: RecordingSegment | undefined = seg ? {
        id: seg.segmentId,
        cameraId: seg.cameraId,
        jobId: "default",
        startedAt: seg.startTime.toISOString(),
        endedAt: seg.endTime.toISOString(),
        storagePath: seg.storage.uri,
        sizeBytes: seg.fileSize,
        storageNodeExternalId: seg.storage.nodeId || "sentinel-local",
        storageTier: seg.storage.tier.toLowerCase() as "hot" | "warm" | "cold",
        status: seg.storage.available ? "ready" : "error",
        checksumSha256: seg.sha256,
        codec: seg.codec,
        createdAt: seg.startTime.toISOString(),
      } : undefined;

      return {
        segment: mappedSegment,
        keyframeOffset: keyframeLookup.byteOffset ?? 0,
        keyframePts: keyframeLookup.pts ?? 0,
        keyframeWallClock: keyframeLookup.nearestKeyframeTime.toISOString(),
        directSeekAvailable: true,
      };
    }

    return { directSeekAvailable: false };
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
      cameraIds: string[];
      masterCameraId: string;
      layout: string;
      createdAt: string;
    }>
  > {
    const result = await this.pool.query(
      `SELECT 
         pg.id, pg.name, pg.description, pg.layout, pg.camera_ids, pg.master_camera_id,
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
      cameraIds: Array.isArray(row.camera_ids) ? row.camera_ids : [],
      masterCameraId: row.master_camera_id,
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

  async createPlaybackSession(
    userId: string,
    segmentId: string,
    cameraId: string,
    evidenceCaseId?: string,
  ): Promise<any> {
    const result = await this.pool.query(
      `INSERT INTO playback_sessions (user_id, segment_id, camera_id, evidence_case_id, created_at, status)
       VALUES ($1, $2, $3, $4, now(), 'active')
       RETURNING *`,
      [userId, segmentId, cameraId, evidenceCaseId ?? null],
    );
    return result.rows[0];
  }

  async trackPlaybackProgress(sessionId: string, currentPosition: number): Promise<void> {
    await this.pool.query(
      `UPDATE playback_sessions
       SET current_position = $2, last_activity = now()
       WHERE id = $1`,
      [sessionId, currentPosition],
    );
  }

  async endPlaybackSession(sessionId: string): Promise<any> {
    const result = await this.pool.query(
      `UPDATE playback_sessions
       SET status = 'completed', ended_at = now()
       WHERE id = $1
       RETURNING *`,
      [sessionId],
    );
    return result.rows[0];
  }

  async getActiveSession(sessionId: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT * FROM playback_sessions WHERE id = $1 AND status = 'active'`,
      [sessionId],
    );
    return result.rows[0] || null;
  }

  async createSyncGroup(
    name: string,
    sessionIds: string[],
    masterSessionId?: string,
  ): Promise<any> {
    const master = masterSessionId || sessionIds[0];
    const groupRes = await this.pool.query(
      `INSERT INTO sync_groups (name, master_session_id, created_at)
       VALUES ($1, $2, now())
       RETURNING *`,
      [name, master],
    );
    const group = groupRes.rows[0];

    if (sessionIds.length > 0) {
      await this.pool.query(
        `INSERT INTO sync_group_sessions (group_id, session_id, is_master)
         SELECT $1, unnest($2::text[]), unnest($3::boolean[])`,
        [group.id, sessionIds, sessionIds.map((s) => s === master)],
      );
    }
    return group;
  }

  async syncGroupProgress(groupId: string, masterPosition: number): Promise<void> {
    const sessionsRes = await this.pool.query(
      `SELECT session_id, is_master FROM sync_group_sessions WHERE group_id = $1`,
      [groupId],
    );
    const nonMasterSessionIds = (sessionsRes.rows || [])
      .filter((s: any) => !s.is_master)
      .map((s: any) => s.session_id);

    if (nonMasterSessionIds.length > 0) {
      await this.pool.query(
        `UPDATE playback_sessions
         SET current_position = $1
         WHERE id = ANY($2::uuid[])`,
        [masterPosition, nonMasterSessionIds],
      );
    }
  }

  async getPlaybackHistory(userId: string, limit = 20): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT s.*, c.name as camera_name
       FROM playback_sessions s
       LEFT JOIN cameras c ON s.camera_id = c.id
       WHERE s.user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit],
    );
    return result.rows;
  }

  async getSessionStatistics(userId: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT COUNT(*)::int as total_sessions,
              COALESCE(SUM(duration_seconds), 0)::int as total_playback_time,
              COALESCE(AVG(duration_seconds), 0)::int as avg_session_duration,
              (SELECT camera_id FROM playback_sessions WHERE user_id = $1 GROUP BY camera_id ORDER BY COUNT(*) DESC LIMIT 1) as most_viewed_camera
       FROM playback_sessions
       WHERE user_id = $1`,
      [userId],
    );
    return result.rows[0];
  }

  async cleanupInactiveSessions(inactiveDurationSeconds: number): Promise<number> {
    const result = await this.pool.query(
      `UPDATE playback_sessions
       SET status = 'expired'
       WHERE status = 'active' AND last_activity < NOW() - INTERVAL '1 second' * $1
       RETURNING id`,
      [inactiveDurationSeconds],
    );
    const firstRow = result.rows[0];
    if (firstRow && "count" in firstRow) {
      return Number(firstRow.count);
    }
    return result.rows.length;
  }

  async getActiveSessionsByCamera(cameraId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM playback_sessions WHERE camera_id = $1 AND status = 'active'`,
      [cameraId],
    );
    return result.rows;
  }

  async updatePlaybackSpeed(sessionId: string, speed: number): Promise<any> {
    const validSpeeds = [0.25, 0.5, 1, 2, 4, 8, 16];
    if (!validSpeeds.includes(speed)) {
      throw new Error(`Invalid playback speed ${speed}`);
    }
    const result = await this.pool.query(
      `UPDATE playback_sessions SET playback_speed = $2 WHERE id = $1 RETURNING *`,
      [sessionId, speed],
    );
    return result.rows[0];
  }

  async addBookmark(
    sessionId: string,
    timestampSeconds: number,
    description: string,
  ): Promise<any> {
    const result = await this.pool.query(
      `INSERT INTO playback_bookmarks (session_id, timestamp_seconds, description, created_at)
       VALUES ($1, $2, $3, now())
       RETURNING *`,
      [sessionId, timestampSeconds, description],
    );
    return result.rows[0];
  }

  async getSessionBookmarks(sessionId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM playback_bookmarks WHERE session_id = $1 ORDER BY timestamp_seconds ASC`,
      [sessionId],
    );
    return result.rows;
  }
}

function parseTimeOffsets(value: unknown): Record<string, number> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, number>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, number>
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeTimeOffset(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 300_000
    ? value
    : 0;
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
