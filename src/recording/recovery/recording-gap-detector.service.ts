/**
 * Recording Gap Detector Service
 * 
 * Automatically detects timeline gaps and stream dropouts in central recording catalog.
 * Guarantees persistent gap ledger entries in PostgreSQL for forensic tracking and edge backfill.
 */

import type { Pool } from "pg";
import { randomUUID } from "node:crypto";

export type GapStatus = "OPEN" | "IN_PROGRESS" | "HEALED" | "UNRECOVERABLE";

export interface RecordingGapRecord {
  id: string;
  tenantId: string;
  branchId?: string;
  cameraId: string;
  startTime: string; // ISO-8601
  endTime?: string;   // ISO-8601
  gapDurationSeconds: number;
  reason: string;
  status: GapStatus;
  detail: Record<string, unknown>;
  healedAt?: string;
  healedBy?: string;
  backfillJobId?: string;
  segmentsRecoveredCount: number;
  bytesRecovered: number;
  detectedAt: string;
  resolvedAt?: string;
}

export interface GapScanOptions {
  tenantId: string;
  cameraId: string;
  branchId?: string;
  startTime: string;
  endTime: string;
  toleranceSeconds?: number; // Minimum gap duration to register (default 5s)
}

export interface GapSummaryMetrics {
  totalGaps: number;
  openGaps: number;
  inProgressGaps: number;
  healedGaps: number;
  unrecoverableGaps: number;
  largestGapSeconds: number;
  totalLostSeconds: number;
  healingSuccessRate: number; // percentage 0-100
}

export class RecordingGapDetectorService {
  constructor(private readonly pool: Pool) {}

  /**
   * Scans a camera's recording timeline in PostgreSQL for gaps and persists them.
   */
  public async scanTimelineGaps(options: GapScanOptions): Promise<RecordingGapRecord[]> {
    const toleranceMs = (options.toleranceSeconds ?? 5) * 1000;
    const startMs = new Date(options.startTime).getTime();
    const endMs = new Date(options.endTime).getTime();

    if (endMs <= startMs) {
      throw new Error("Invalid time window: endTime must be greater than startTime");
    }

    // Query all valid recorded segments in the given time window
    const query = `
      SELECT id, camera_id, started_at, ended_at, duration_seconds, status
      FROM recording_segments
      WHERE camera_id = $1
        AND status <> 'deleted'
        AND ended_at >= $2::timestamptz
        AND started_at <= $3::timestamptz
      ORDER BY started_at ASC
    `;

    const res = await this.pool.query(query, [
      options.cameraId,
      options.startTime,
      options.endTime,
    ]);

    const segments = res.rows.map((r: any) => ({
      id: r.id,
      cameraId: r.camera_id,
      startedAt: new Date(r.started_at).getTime(),
      endedAt: new Date(r.ended_at).getTime(),
      durationSeconds: Number(r.duration_seconds || 0),
    }));

    const detectedGaps: Array<{
      start: number;
      end: number;
      durationSec: number;
      reason: string;
    }> = [];

    if (segments.length === 0) {
      // Total outage across the entire requested interval
      detectedGaps.push({
        start: startMs,
        end: endMs,
        durationSec: Math.round((endMs - startMs) / 1000),
        reason: "TOTAL_STREAM_ABSENCE",
      });
    } else {
      // Check leading gap before first segment
      if (segments[0]!.startedAt - startMs > toleranceMs) {
        detectedGaps.push({
          start: startMs,
          end: segments[0]!.startedAt,
          durationSec: Math.round((segments[0]!.startedAt - startMs) / 1000),
          reason: "STREAM_START_GAP",
        });
      }

      // Check gaps between consecutive segments
      for (let i = 0; i < segments.length - 1; i++) {
        const currentEnd = segments[i]!.endedAt;
        const nextStart = segments[i + 1]!.startedAt;
        const delta = nextStart - currentEnd;

        if (delta > toleranceMs) {
          detectedGaps.push({
            start: currentEnd,
            end: nextStart,
            durationSec: Math.round(delta / 1000),
            reason: "NETWORK_DISCONNECTION",
          });
        }
      }

      // Check trailing gap after last segment
      const lastSegment = segments[segments.length - 1]!;
      if (endMs - lastSegment.endedAt > toleranceMs) {
        detectedGaps.push({
          start: lastSegment.endedAt,
          end: endMs,
          durationSec: Math.round((endMs - lastSegment.endedAt) / 1000),
          reason: "STREAM_DROPOUT",
        });
      }
    }

    // Idempotently persist detected gaps into database
    const savedRecords: RecordingGapRecord[] = [];

    for (const gap of detectedGaps) {
      const startTimeStr = new Date(gap.start).toISOString();
      const endTimeStr = new Date(gap.end).toISOString();

      // Check if a gap covering this interval already exists for this camera
      const checkQuery = `
        SELECT id, tenant_id, branch_id, camera_id, start_time, end_time,
               gap_duration_seconds, reason, status, detail, healed_at, healed_by,
               backfill_job_id, segments_recovered_count, bytes_recovered,
               detected_at, resolved_at
        FROM recording_gaps
        WHERE camera_id = $1
          AND ABS(EXTRACT(EPOCH FROM (start_time - $2::timestamptz))) < 2
          AND ABS(EXTRACT(EPOCH FROM (end_time - $3::timestamptz))) < 2
        LIMIT 1
      `;

      const checkRes = await this.pool.query(checkQuery, [
        options.cameraId,
        startTimeStr,
        endTimeStr,
      ]);

      if (checkRes.rows.length > 0) {
        savedRecords.push(this.mapRowToRecord(checkRes.rows[0]));
        continue;
      }

      const insertId = randomUUID();
      const insertQuery = `
        INSERT INTO recording_gaps (
          id, tenant_id, branch_id, camera_id, start_time, end_time,
          gap_duration_seconds, reason, status, detail, detected_at
        ) VALUES (
          $1, $2, $3, $4, $5::timestamptz, $6::timestamptz,
          $7, $8, 'OPEN', $9::jsonb, NOW()
        )
        RETURNING *
      `;

      const insertRes = await this.pool.query(insertQuery, [
        insertId,
        options.tenantId,
        options.branchId || null,
        options.cameraId,
        startTimeStr,
        endTimeStr,
        gap.durationSec,
        gap.reason,
        JSON.stringify({
          toleranceSeconds: options.toleranceSeconds ?? 5,
          scannedAt: new Date().toISOString(),
        }),
      ]);

      savedRecords.push(this.mapRowToRecord(insertRes.rows[0]));
    }

    return savedRecords;
  }

  /**
   * Retrieves a single gap by ID
   */
  public async getGapById(gapId: string): Promise<RecordingGapRecord | null> {
    const res = await this.pool.query(
      `SELECT * FROM recording_gaps WHERE id = $1 LIMIT 1`,
      [gapId]
    );
    return res.rows.length > 0 ? this.mapRowToRecord(res.rows[0]) : null;
  }

  /**
   * Lists recording gaps with flexible multi-filtering
   */
  public async listGaps(filters: {
    tenantId?: string;
    branchId?: string;
    cameraId?: string;
    status?: GapStatus;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: RecordingGapRecord[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters.tenantId) {
      conditions.push(`tenant_id = $${idx++}`);
      params.push(filters.tenantId);
    }
    if (filters.branchId) {
      conditions.push(`branch_id = $${idx++}`);
      params.push(filters.branchId);
    }
    if (filters.cameraId) {
      conditions.push(`camera_id = $${idx++}`);
      params.push(filters.cameraId);
    }
    if (filters.status) {
      conditions.push(`status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters.startDate) {
      conditions.push(`start_time >= $${idx++}::timestamptz`);
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push(`end_time <= $${idx++}::timestamptz`);
      params.push(filters.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countRes = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM recording_gaps ${whereClause}`,
      params
    );
    const total = countRes.rows[0]?.count ?? 0;

    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 500);
    const offset = Math.max(Number(filters.offset) || 0, 0);

    const itemsQuery = `
      SELECT * FROM recording_gaps
      ${whereClause}
      ORDER BY start_time DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    params.push(limit, offset);

    const itemsRes = await this.pool.query(itemsQuery, params);
    const items = itemsRes.rows.map((r: any) => this.mapRowToRecord(r));

    return { items, total };
  }

  /**
   * Updates the recovery status and metrics of a gap
   */
  public async markGapHealed(
    gapId: string,
    update: {
      healedBy?: string;
      backfillJobId?: string;
      segmentsRecoveredCount?: number;
      bytesRecovered?: number;
    }
  ): Promise<RecordingGapRecord | null> {
    const query = `
      UPDATE recording_gaps
      SET status = 'HEALED',
          healed_at = NOW(),
          healed_by = COALESCE($2, healed_by, 'EDGE_BACKFILL'),
          backfill_job_id = COALESCE($3, backfill_job_id),
          segments_recovered_count = segments_recovered_count + COALESCE($4, 0),
          bytes_recovered = bytes_recovered + COALESCE($5, 0),
          resolved_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const res = await this.pool.query(query, [
      gapId,
      update.healedBy || "EDGE_BACKFILL",
      update.backfillJobId || null,
      update.segmentsRecoveredCount || 0,
      update.bytesRecovered || 0,
    ]);

    return res.rows.length > 0 ? this.mapRowToRecord(res.rows[0]) : null;
  }

  /**
   * Calculates high-level gap metrics across a branch, camera, or tenant
   */
  public async getGapMetrics(options: {
    tenantId?: string;
    branchId?: string;
    cameraId?: string;
  }): Promise<GapSummaryMetrics> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (options.tenantId) {
      conditions.push(`tenant_id = $${idx++}`);
      params.push(options.tenantId);
    }
    if (options.branchId) {
      conditions.push(`branch_id = $${idx++}`);
      params.push(options.branchId);
    }
    if (options.cameraId) {
      conditions.push(`camera_id = $${idx++}`);
      params.push(options.cameraId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT 
        COUNT(*)::int AS total_gaps,
        COUNT(CASE WHEN status = 'OPEN' THEN 1 END)::int AS open_gaps,
        COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END)::int AS in_progress_gaps,
        COUNT(CASE WHEN status = 'HEALED' THEN 1 END)::int AS healed_gaps,
        COUNT(CASE WHEN status = 'UNRECOVERABLE' THEN 1 END)::int AS unrecoverable_gaps,
        COALESCE(MAX(gap_duration_seconds), 0)::int AS largest_gap_seconds,
        COALESCE(SUM(gap_duration_seconds), 0)::int AS total_lost_seconds
      FROM recording_gaps
      ${whereClause}
    `;

    const res = await this.pool.query(query, params);
    const row = res.rows[0] || {};

    const total = Number(row.total_gaps || 0);
    const healed = Number(row.healed_gaps || 0);
    const successRate = total > 0 ? Number(((healed / total) * 100).toFixed(1)) : 100;

    return {
      totalGaps: total,
      openGaps: Number(row.open_gaps || 0),
      inProgressGaps: Number(row.in_progress_gaps || 0),
      healedGaps: healed,
      unrecoverableGaps: Number(row.unrecoverable_gaps || 0),
      largestGapSeconds: Number(row.largest_gap_seconds || 0),
      totalLostSeconds: Number(row.total_lost_seconds || 0),
      healingSuccessRate: successRate,
    };
  }

  private mapRowToRecord(r: any): RecordingGapRecord {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id || undefined,
      cameraId: r.camera_id,
      startTime: r.start_time instanceof Date ? r.start_time.toISOString() : new Date(r.start_time).toISOString(),
      endTime: r.end_time ? (r.end_time instanceof Date ? r.end_time.toISOString() : new Date(r.end_time).toISOString()) : undefined,
      gapDurationSeconds: Number(r.gap_duration_seconds || 0),
      reason: r.reason || "UNKNOWN",
      status: (r.status as GapStatus) || "OPEN",
      detail: typeof r.detail === "object" && r.detail !== null ? r.detail : {},
      healedAt: r.healed_at ? new Date(r.healed_at).toISOString() : undefined,
      healedBy: r.healed_by || undefined,
      backfillJobId: r.backfill_job_id || undefined,
      segmentsRecoveredCount: Number(r.segments_recovered_count || 0),
      bytesRecovered: Number(r.bytes_recovered || 0),
      detectedAt: r.detected_at instanceof Date ? r.detected_at.toISOString() : new Date(r.detected_at).toISOString(),
      resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : undefined,
    };
  }
}
