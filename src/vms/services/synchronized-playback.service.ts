/**
 * Synchronized Multi-Camera Playback & Investigation Service
 * 
 * Production-ready multi-stream synchronized historical playback engine:
 * - Coordinates synchronized timeline seeking across multiple camera angles.
 * - Authoritative Master Clock timeline with millisecond precision.
 * - Timeline Drift Compensation:
 *     T_device,i = T_master + offsetMs,i
 * - Banking Drift Tolerance:
 *     <= 5000ms: SYNCHRONIZED
 *     5001ms - 30000ms: DRIFT_WARNING
 *     > 30000ms: DRIFT_CRITICAL
 * - Sub-second IDR Keyframe Seek Point Resolution.
 * - Frame stepping (forward/backward at specified fps e.g. 25fps = 40ms).
 * - Multi-angle timeline bookmarks with camera state snapshots.
 * - Persistent storage in PostgreSQL with memory fallback.
 */

import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { recordingIndexService } from "../../recording-index/recording-index.service.js";

export type DriftStatus = "SYNCHRONIZED" | "DRIFT_WARNING" | "DRIFT_CRITICAL";

export interface SynchronizedCameraTrack {
  cameraId: string;
  cameraName: string;
  recorderId?: string;
  channel?: number;
  location?: string;
  streamUrl?: string;
  hasCoverage: boolean;
  activeSegmentId?: string;
  activeSegmentStart?: string;
  activeSegmentEnd?: string;
  currentOffsetMs: number;
  measuredDriftMs: number;
  compensationOffsetMs: number;
  driftStatus: DriftStatus;
  currentAlignedTimestamp: string;
  currentDeviceTimestamp: string;
  keyframeOffsetBytes?: number;
  keyframePts?: number;
  keyframeWallClock?: string;
  isInGap: boolean;
}

export interface SynchronizedPlaybackBookmark {
  bookmarkId: string;
  timestamp: string;
  label: string;
  notes?: string;
  createdByUser: string;
  cameraSnapshots?: Array<{
    cameraId: string;
    cameraName: string;
    segmentId?: string;
    deviceTimestamp: string;
    alignedTimestamp: string;
    driftOffsetMs: number;
  }>;
  createdAt: string;
}

export interface SynchronizedPlaybackSession {
  sessionId: string;
  tenantId: string;
  branchId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  currentTime: string;
  masterCameraId: string;
  layout: string; // '1x1', '2x2', '3x3', '2x3', '4x4'
  playbackSpeed: number; // 0.25x, 0.5x, 1x, 2x, 4x, 8x, 16x, 32x, and reverse
  state: "PLAYING" | "PAUSED" | "BUFFERING" | "STOPPED";
  driftCompensationEnabled: boolean;
  tracks: SynchronizedCameraTrack[];
  bookmarks: SynchronizedPlaybackBookmark[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSyncSessionInput {
  tenantId: string;
  branchId: string;
  title: string;
  description?: string;
  cameraIds: string[];
  masterCameraId?: string;
  startTime: string;
  endTime: string;
  layout?: string;
  driftCompensationEnabled?: boolean;
  createdByUser?: string;
}

export class SynchronizedPlaybackService {
  private readonly sessions = new Map<string, SynchronizedPlaybackSession>();

  constructor(private readonly pool?: Pool) {}

  /**
   * Helper to classify clock drift against banking standards:
   * <= 5000ms: SYNCHRONIZED
   * 5001ms - 30000ms: DRIFT_WARNING
   * > 30000ms: DRIFT_CRITICAL
   */
  classifyDriftStatus(offsetMs: number): DriftStatus {
    const abs = Math.abs(offsetMs);
    if (abs <= 5000) return "SYNCHRONIZED";
    if (abs <= 30000) return "DRIFT_WARNING";
    return "DRIFT_CRITICAL";
  }

  /**
   * Create a synchronized multi-camera playback session.
   */
  async createSession(input: CreateSyncSessionInput): Promise<SynchronizedPlaybackSession> {
    const sessionId = `sync-sess-${randomUUID().substring(0, 8)}`;
    const nowIso = new Date().toISOString();
    const startTimeIso = new Date(input.startTime).toISOString();
    const endTimeIso = new Date(input.endTime).toISOString();

    const startMs = new Date(startTimeIso).getTime();
    const endMs = new Date(endTimeIso).getTime();

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      throw new Error(`Invalid timeline bounds: startTime must be earlier than endTime`);
    }

    if (!input.cameraIds || input.cameraIds.length === 0) {
      throw new Error(`At least one cameraId is required to create a synchronized playback session`);
    }

    const uniqueCameraIds = [...new Set(input.cameraIds)].slice(0, 16);
    const masterCameraId = input.masterCameraId && uniqueCameraIds.includes(input.masterCameraId)
      ? input.masterCameraId
      : uniqueCameraIds[0]!;

    const driftCompensationEnabled = input.driftCompensationEnabled !== false;
    const layout = input.layout || (uniqueCameraIds.length <= 1 ? "1x1" : uniqueCameraIds.length <= 4 ? "2x2" : uniqueCameraIds.length <= 6 ? "2x3" : uniqueCameraIds.length <= 9 ? "3x3" : "4x4");

    // 1. Resolve real camera inventory and names from database if available
    const cameraMetaMap = new Map<string, { name: string; channel?: number; location?: string }>();
    if (this.pool) {
      try {
        const camRes = await this.pool.query(
          `SELECT id, name, location, branch_id FROM cameras WHERE id = ANY($1::varchar[]) OR id::text = ANY($1::varchar[])`,
          [uniqueCameraIds]
        );
        for (const row of camRes.rows) {
          cameraMetaMap.set(String(row.id), {
            name: row.name,
            location: row.location,
          });
        }
      } catch {
        // Non-fatal, fallback to default naming
      }
    }

    // 2. Resolve authoritative clock drift from telemetry or segments
    const driftMap = new Map<string, { offsetMs: number; status: DriftStatus }>();
    if (this.pool) {
      try {
        const telemetryRes = await this.pool.query(
          `SELECT DISTINCT ON (node_id) node_id, offset_ms, status 
           FROM clock_drift_telemetry 
           WHERE node_id = ANY($1::varchar[])
           ORDER BY node_id, measured_at DESC`,
          [uniqueCameraIds]
        );
        for (const row of telemetryRes.rows) {
          const offsetMs = Number(row.offset_ms || 0);
          driftMap.set(String(row.node_id), {
            offsetMs,
            status: this.classifyDriftStatus(offsetMs),
          });
        }
      } catch {
        // Non-fatal, fallback
      }
    }

    // 3. Resolve segments and keyframe seeking for each camera
    const tracks: SynchronizedCameraTrack[] = await Promise.all(
      uniqueCameraIds.map(async (cId, idx) => {
        const meta = cameraMetaMap.get(cId);
        const cameraName = meta?.name || `Camera ${cId}`;
        const location = meta?.location;
        const drift = driftMap.get(cId) ?? { offsetMs: 0, status: "SYNCHRONIZED" as DriftStatus };

        // Real segments lookup
        let activeSegmentId: string | undefined;
        let activeSegmentStart: string | undefined = startTimeIso;
        let activeSegmentEnd: string | undefined = endTimeIso;
        let streamUrl: string | undefined;
        let hasCoverage = true;
        let keyframeOffsetBytes = 0;
        let keyframePts = 0;
        let keyframeWallClock: string | undefined;
        let isInGap = false;

        // Apply drift compensation to start timestamp
        const effectiveOffsetMs = driftCompensationEnabled ? drift.offsetMs : 0;
        const initialDeviceTimestampMs = startMs + effectiveOffsetMs;
        const initialDeviceDate = new Date(initialDeviceTimestampMs);

        try {
          const seg = await recordingIndexService.findSegmentAt(cId, initialDeviceDate);
          if (seg) {
            activeSegmentId = seg.segmentId;
            activeSegmentStart = seg.startTime.toISOString();
            activeSegmentEnd = seg.endTime.toISOString();
            streamUrl = seg.storage.uri || `/api/recordings/play?segmentId=${encodeURIComponent(seg.segmentId)}`;
            hasCoverage = true;

            // Nearest keyframe
            const kf = await recordingIndexService.findNearestKeyframe(cId, initialDeviceDate);
            if (kf) {
              keyframeOffsetBytes = kf.byteOffset ?? 0;
              keyframePts = kf.pts ?? 0;
              keyframeWallClock = kf.nearestKeyframeTime.toISOString();
            }
          } else {
            // Check if there are any segments in the full session window
            const search = await recordingIndexService.findRecording({
              tenantId: input.tenantId,
              cameraIds: [cId],
              from: new Date(startMs),
              to: new Date(endMs),
            });
            hasCoverage = (search.cameras[0]?.segments?.length ?? 0) > 0;
            isInGap = !hasCoverage;
          }
        } catch {
          // If indexing is not primed, assume coverage for non-blocking preview
          hasCoverage = true;
          streamUrl = `/api/recordings/play?segmentId=${encodeURIComponent(cId)}`;
        }

        return {
          cameraId: cId,
          cameraName,
          channel: idx + 1,
          location,
          streamUrl,
          hasCoverage,
          activeSegmentId,
          activeSegmentStart,
          activeSegmentEnd,
          currentOffsetMs: 0,
          measuredDriftMs: drift.offsetMs,
          compensationOffsetMs: effectiveOffsetMs,
          driftStatus: drift.status,
          currentAlignedTimestamp: startTimeIso,
          currentDeviceTimestamp: new Date(initialDeviceTimestampMs).toISOString(),
          keyframeOffsetBytes,
          keyframePts,
          keyframeWallClock,
          isInGap,
        };
      })
    );

    const session: SynchronizedPlaybackSession = {
      sessionId,
      tenantId: input.tenantId,
      branchId: input.branchId,
      title: input.title,
      description: input.description,
      startTime: startTimeIso,
      endTime: endTimeIso,
      currentTime: startTimeIso,
      masterCameraId,
      layout,
      playbackSpeed: 1.0,
      state: "PAUSED",
      driftCompensationEnabled,
      tracks,
      bookmarks: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    // Cache locally
    this.sessions.set(sessionId, session);

    // Persist to PostgreSQL if available
    if (this.pool) {
      await this.persistSession(session, input.createdByUser);
    }

    return session;
  }

  /**
   * Seek/Scrub timeline cursor across all cameras synchronously with drift compensation.
   */
  async seek(sessionId: string, targetTimestamp: string): Promise<SynchronizedPlaybackSession> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error(`Playback session ${sessionId} not found`);

    const targetMs = new Date(targetTimestamp).getTime();
    const startMs = new Date(session.startTime).getTime();
    const endMs = new Date(session.endTime).getTime();

    if (!Number.isFinite(targetMs) || targetMs < startMs || targetMs > endMs) {
      throw new Error(`Target timestamp ${targetTimestamp} outside session bounds [${session.startTime}, ${session.endTime}]`);
    }

    const currentOffsetMs = targetMs - startMs;
    const nowIso = new Date().toISOString();

    // Realign all tracks with individual camera clock drift offsets
    const updatedTracks: SynchronizedCameraTrack[] = await Promise.all(
      session.tracks.map(async (track) => {
        const effectiveOffsetMs = session.driftCompensationEnabled ? track.measuredDriftMs : 0;
        const deviceTimeMs = targetMs + effectiveOffsetMs;
        const deviceDate = new Date(deviceTimeMs);

        let activeSegmentId = track.activeSegmentId;
        let activeSegmentStart = track.activeSegmentStart;
        let activeSegmentEnd = track.activeSegmentEnd;
        let streamUrl = track.streamUrl;
        let keyframeOffsetBytes = track.keyframeOffsetBytes;
        let keyframePts = track.keyframePts;
        let keyframeWallClock = track.keyframeWallClock;
        let isInGap = false;

        try {
          const seg = await recordingIndexService.findSegmentAt(track.cameraId, deviceDate);
          if (seg) {
            activeSegmentId = seg.segmentId;
            activeSegmentStart = seg.startTime.toISOString();
            activeSegmentEnd = seg.endTime.toISOString();
            streamUrl = seg.storage.uri || `/api/recordings/play?segmentId=${encodeURIComponent(seg.segmentId)}`;
            isInGap = false;

            const kf = await recordingIndexService.findNearestKeyframe(track.cameraId, deviceDate);
            if (kf) {
              keyframeOffsetBytes = kf.byteOffset ?? 0;
              keyframePts = kf.pts ?? 0;
              keyframeWallClock = kf.nearestKeyframeTime.toISOString();
            }
          } else {
            isInGap = true;
          }
        } catch {
          // Keep current segment if search unavailable
        }

        return {
          ...track,
          currentOffsetMs,
          compensationOffsetMs: effectiveOffsetMs,
          currentAlignedTimestamp: targetTimestamp,
          currentDeviceTimestamp: new Date(deviceTimeMs).toISOString(),
          activeSegmentId,
          activeSegmentStart,
          activeSegmentEnd,
          streamUrl,
          keyframeOffsetBytes,
          keyframePts,
          keyframeWallClock,
          isInGap,
        };
      })
    );

    session.currentTime = targetTimestamp;
    session.tracks = updatedTracks;
    session.updatedAt = nowIso;

    this.sessions.set(sessionId, session);

    if (this.pool) {
      await this.updateSessionStateInDb(session);
    }

    return session;
  }

  /**
   * Step frame forward or backward across all cameras synchronously (sub-second barrier step).
   */
  async stepFrame(
    sessionId: string,
    direction: "FORWARD" | "BACKWARD" = "FORWARD",
    fps = 25
  ): Promise<SynchronizedPlaybackSession> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error(`Playback session ${sessionId} not found`);

    const frameDeltaMs = Math.round(1000 / Math.max(1, fps)); // e.g. 40ms for 25fps
    const currentMs = new Date(session.currentTime).getTime();
    const startMs = new Date(session.startTime).getTime();
    const endMs = new Date(session.endTime).getTime();

    const targetMs = direction === "FORWARD" ? currentMs + frameDeltaMs : currentMs - frameDeltaMs;
    const clampedMs = Math.max(startMs, Math.min(endMs, targetMs));

    // Pause on step
    session.state = "PAUSED";
    return this.seek(sessionId, new Date(clampedMs).toISOString());
  }

  /**
   * Set playback speed and state.
   */
  async setPlaybackState(
    sessionId: string,
    state: "PLAYING" | "PAUSED" | "BUFFERING" | "STOPPED",
    speed = 1.0
  ): Promise<SynchronizedPlaybackSession> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error(`Playback session ${sessionId} not found`);

    session.state = state;
    session.playbackSpeed = speed;
    session.updatedAt = new Date().toISOString();

    this.sessions.set(sessionId, session);

    if (this.pool) {
      await this.updateSessionStateInDb(session);
    }

    return session;
  }

  /**
   * Toggle timeline drift compensation on or off.
   */
  async toggleDriftCompensation(
    sessionId: string,
    enabled: boolean
  ): Promise<SynchronizedPlaybackSession> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error(`Playback session ${sessionId} not found`);

    session.driftCompensationEnabled = enabled;
    return this.seek(sessionId, session.currentTime);
  }

  /**
   * Add a synchronized bookmark on the timeline with multi-camera snapshots and drift metadata.
   */
  async addBookmark(
    sessionId: string,
    timestamp: string,
    label: string,
    createdByUser: string,
    notes?: string
  ): Promise<SynchronizedPlaybackSession> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error(`Playback session ${sessionId} not found`);

    const now = new Date().toISOString();
    const bookmarkId = `bm-${randomUUID().substring(0, 8)}`;

    const cameraSnapshots = session.tracks.map((t) => ({
      cameraId: t.cameraId,
      cameraName: t.cameraName,
      segmentId: t.activeSegmentId,
      deviceTimestamp: t.currentDeviceTimestamp,
      alignedTimestamp: t.currentAlignedTimestamp,
      driftOffsetMs: t.compensationOffsetMs,
    }));

    const bookmark: SynchronizedPlaybackBookmark = {
      bookmarkId,
      timestamp,
      label,
      notes,
      createdByUser,
      cameraSnapshots,
      createdAt: now,
    };

    session.bookmarks.push(bookmark);
    session.updatedAt = now;

    this.sessions.set(sessionId, session);

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO synchronized_playback_bookmarks (
             id, session_id, timestamp, label, notes, created_by, camera_snapshots, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            bookmark.bookmarkId,
            sessionId,
            bookmark.timestamp,
            bookmark.label,
            bookmark.notes || null,
            bookmark.createdByUser,
            JSON.stringify(bookmark.cameraSnapshots),
            bookmark.createdAt,
          ]
        );
      } catch (err) {
        console.error("Failed to persist bookmark to database:", err);
      }
    }

    return session;
  }

  /**
   * Get all bookmarks for a session.
   */
  async getBookmarks(sessionId: string): Promise<SynchronizedPlaybackBookmark[]> {
    const session = await this.getSession(sessionId);
    return session?.bookmarks || [];
  }

  /**
   * Calibrate manual clock drift for a specific camera in the session.
   */
  async calibrateDrift(
    sessionId: string,
    cameraId: string,
    manualOffsetMs: number,
    calibratedBy = "operator"
  ): Promise<SynchronizedPlaybackSession> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error(`Playback session ${sessionId} not found`);

    const track = session.tracks.find((t) => t.cameraId === cameraId);
    if (!track) throw new Error(`Camera ${cameraId} not part of session ${sessionId}`);

    track.measuredDriftMs = manualOffsetMs;
    track.driftStatus = this.classifyDriftStatus(manualOffsetMs);
    track.compensationOffsetMs = session.driftCompensationEnabled ? manualOffsetMs : 0;

    // Log drift compensation audit event
    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO playback_drift_compensation_events (
             session_id, camera_id, master_timestamp, device_timestamp, 
             raw_offset_ms, compensation_ms, drift_status, drift_source, calibrated_by
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            sessionId,
            cameraId,
            track.currentAlignedTimestamp,
            track.currentDeviceTimestamp,
            manualOffsetMs,
            track.compensationOffsetMs,
            track.driftStatus,
            "MANUAL_CALIBRATION",
            calibratedBy,
          ]
        );
      } catch (err) {
        console.error("Failed to log drift compensation audit event:", err);
      }
    }

    return this.seek(sessionId, session.currentTime);
  }

  /**
   * Get session details.
   */
  async getSession(sessionId: string): Promise<SynchronizedPlaybackSession | null> {
    // Check local cache
    const cached = this.sessions.get(sessionId);
    if (cached) return cached;

    if (!this.pool) return null;

    try {
      const sessRes = await this.pool.query(
        `SELECT * FROM synchronized_playback_sessions WHERE id = $1`,
        [sessionId]
      );
      if (!sessRes.rows[0]) return null;
      const sRow = sessRes.rows[0];

      const tracksRes = await this.pool.query(
        `SELECT * FROM synchronized_playback_tracks WHERE session_id = $1 ORDER BY channel_index ASC`,
        [sessionId]
      );

      const bmarksRes = await this.pool.query(
        `SELECT * FROM synchronized_playback_bookmarks WHERE session_id = $1 ORDER BY timestamp ASC`,
        [sessionId]
      );

      const tracks: SynchronizedCameraTrack[] = tracksRes.rows.map((r) => ({
        cameraId: r.camera_id,
        cameraName: r.camera_name,
        channel: r.channel_index,
        streamUrl: r.active_segment_uri || `/api/recordings/play?segmentId=${encodeURIComponent(r.active_segment_id || r.camera_id)}`,
        hasCoverage: Boolean(r.has_coverage),
        activeSegmentId: r.active_segment_id || undefined,
        activeSegmentStart: r.active_segment_start ? new Date(r.active_segment_start).toISOString() : undefined,
        activeSegmentEnd: r.active_segment_end ? new Date(r.active_segment_end).toISOString() : undefined,
        currentOffsetMs: Math.max(0, new Date(r.current_aligned_timestamp).getTime() - new Date(sRow.start_time).getTime()),
        measuredDriftMs: Number(r.measured_drift_ms || 0),
        compensationOffsetMs: Number(r.compensation_offset_ms || 0),
        driftStatus: (r.drift_status || "SYNCHRONIZED") as DriftStatus,
        currentAlignedTimestamp: new Date(r.current_aligned_timestamp).toISOString(),
        currentDeviceTimestamp: new Date(r.current_device_timestamp).toISOString(),
        keyframeOffsetBytes: Number(r.keyframe_offset_bytes || 0),
        keyframePts: Number(r.keyframe_pts || 0),
        keyframeWallClock: r.keyframe_wall_clock ? new Date(r.keyframe_wall_clock).toISOString() : undefined,
        isInGap: Boolean(r.is_in_gap),
      }));

      const bookmarks: SynchronizedPlaybackBookmark[] = bmarksRes.rows.map((b) => ({
        bookmarkId: b.id,
        timestamp: new Date(b.timestamp).toISOString(),
        label: b.label,
        notes: b.notes || undefined,
        createdByUser: b.created_by,
        cameraSnapshots: typeof b.camera_snapshots === "string" ? JSON.parse(b.camera_snapshots) : b.camera_snapshots,
        createdAt: new Date(b.created_at).toISOString(),
      }));

      const session: SynchronizedPlaybackSession = {
        sessionId: sRow.id,
        tenantId: sRow.tenant_id,
        branchId: sRow.branch_id,
        title: sRow.title,
        description: sRow.description || undefined,
        startTime: new Date(sRow.start_time).toISOString(),
        endTime: new Date(sRow.end_time).toISOString(),
        currentTime: new Date(sRow.current_master_time).toISOString(),
        masterCameraId: sRow.master_camera_id,
        layout: sRow.layout || "2x2",
        playbackSpeed: Number(sRow.playback_speed || 1.0),
        state: sRow.state || "PAUSED",
        driftCompensationEnabled: sRow.drift_compensation_enabled !== false,
        tracks,
        bookmarks,
        createdAt: new Date(sRow.created_at).toISOString(),
        updatedAt: new Date(sRow.updated_at).toISOString(),
      };

      this.sessions.set(sessionId, session);
      return session;
    } catch (err) {
      console.error(`Failed to load session ${sessionId} from database:`, err);
      return null;
    }
  }

  /**
   * List active sessions for branch / tenant.
   */
  async listSessions(branchId?: string, tenantId?: string): Promise<SynchronizedPlaybackSession[]> {
    if (this.pool) {
      try {
        let query = `SELECT id FROM synchronized_playback_sessions WHERE 1=1`;
        const params: any[] = [];
        if (tenantId) {
          params.push(tenantId);
          query += ` AND tenant_id = $${params.length}`;
        }
        if (branchId) {
          params.push(branchId);
          query += ` AND branch_id = $${params.length}`;
        }
        query += ` ORDER BY created_at DESC LIMIT 50`;

        const res = await this.pool.query(query, params);
        const sessions: SynchronizedPlaybackSession[] = [];
        for (const row of res.rows) {
          const s = await this.getSession(row.id);
          if (s) sessions.push(s);
        }
        return sessions;
      } catch {
        // Fallback to cache
      }
    }

    const all = Array.from(this.sessions.values());
    return all.filter((s) => {
      if (tenantId && s.tenantId !== tenantId) return false;
      if (branchId && s.branchId !== branchId) return false;
      return true;
    });
  }

  /**
   * Delete session.
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    this.sessions.delete(sessionId);
    if (this.pool) {
      try {
        await this.pool.query(`DELETE FROM synchronized_playback_sessions WHERE id = $1`, [sessionId]);
        return true;
      } catch {
        return false;
      }
    }
    return true;
  }

  private async persistSession(session: SynchronizedPlaybackSession, createdBy?: string): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO synchronized_playback_sessions (
           id, tenant_id, branch_id, title, description, start_time, end_time,
           current_master_time, master_camera_id, layout, playback_speed, state,
           drift_compensation_enabled, created_by, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (id) DO UPDATE SET
           current_master_time = EXCLUDED.current_master_time,
           playback_speed = EXCLUDED.playback_speed,
           state = EXCLUDED.state,
           drift_compensation_enabled = EXCLUDED.drift_compensation_enabled,
           updated_at = EXCLUDED.updated_at`,
        [
          session.sessionId,
          session.tenantId,
          session.branchId,
          session.title,
          session.description || null,
          session.startTime,
          session.endTime,
          session.currentTime,
          session.masterCameraId,
          session.layout,
          session.playbackSpeed,
          session.state,
          session.driftCompensationEnabled,
          createdBy || null,
          session.createdAt,
          session.updatedAt,
        ]
      );

      for (const track of session.tracks) {
        await this.pool.query(
          `INSERT INTO synchronized_playback_tracks (
             session_id, camera_id, camera_name, channel_index, has_coverage,
             measured_drift_ms, compensation_offset_ms, drift_status,
             active_segment_id, active_segment_uri, active_segment_start, active_segment_end,
             current_aligned_timestamp, current_device_timestamp, keyframe_offset_bytes,
             keyframe_pts, keyframe_wall_clock, is_in_gap, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
          [
            session.sessionId,
            track.cameraId,
            track.cameraName,
            track.channel || 0,
            track.hasCoverage,
            track.measuredDriftMs,
            track.compensationOffsetMs,
            track.driftStatus,
            track.activeSegmentId || null,
            track.streamUrl || null,
            track.activeSegmentStart || null,
            track.activeSegmentEnd || null,
            track.currentAlignedTimestamp,
            track.currentDeviceTimestamp,
            track.keyframeOffsetBytes || 0,
            track.keyframePts || 0,
            track.keyframeWallClock || null,
            track.isInGap,
            session.createdAt,
            session.updatedAt,
          ]
        );
      }
    } catch (err) {
      console.error(`Error persisting synchronized playback session ${session.sessionId}:`, err);
    }
  }

  private async updateSessionStateInDb(session: SynchronizedPlaybackSession): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `UPDATE synchronized_playback_sessions
         SET current_master_time = $2, playback_speed = $3, state = $4,
             drift_compensation_enabled = $5, updated_at = $6
         WHERE id = $1`,
        [
          session.sessionId,
          session.currentTime,
          session.playbackSpeed,
          session.state,
          session.driftCompensationEnabled,
          session.updatedAt,
        ]
      );

      for (const track of session.tracks) {
        await this.pool.query(
          `UPDATE synchronized_playback_tracks
           SET current_aligned_timestamp = $3,
               current_device_timestamp = $4,
               compensation_offset_ms = $5,
               active_segment_id = $6,
               active_segment_uri = $7,
               active_segment_start = $8,
               active_segment_end = $9,
               keyframe_offset_bytes = $10,
               keyframe_pts = $11,
               keyframe_wall_clock = $12,
               is_in_gap = $13,
               updated_at = $14
           WHERE session_id = $1 AND camera_id = $2`,
          [
            session.sessionId,
            track.cameraId,
            track.currentAlignedTimestamp,
            track.currentDeviceTimestamp,
            track.compensationOffsetMs,
            track.activeSegmentId || null,
            track.streamUrl || null,
            track.activeSegmentStart || null,
            track.activeSegmentEnd || null,
            track.keyframeOffsetBytes || 0,
            track.keyframePts || 0,
            track.keyframeWallClock || null,
            track.isInGap,
            session.updatedAt,
          ]
        );
      }
    } catch (err) {
      console.error(`Error updating session ${session.sessionId} in database:`, err);
    }
  }
}

export const synchronizedPlaybackService = new SynchronizedPlaybackService();
