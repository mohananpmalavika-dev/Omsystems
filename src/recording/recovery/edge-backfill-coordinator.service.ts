/**
 * Edge Backfill Coordinator Service
 * 
 * Central coordinator for edge-to-cloud recording backfill synchronization.
 * Controls backfill jobs, rate-limiting, zero-duplicate frame deduplication,
 * PostgreSQL persistence, audit logging, and gap healing.
 */

import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { EdgeBackfillReconciliationEngine } from "../../edge-sync/edge-backfill-reconciliation.js";
import { EdgeStoreForwardJournal, type EdgeSegmentEntry } from "../../edge-sync/edge-store-forward-journal.js";
import type { RecordingGapDetectorService } from "./recording-gap-detector.service.js";

export type BackfillJobStatus =
  | "PENDING"
  | "SCANNING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type BackfillTriggerSource =
  | "AUTO_WAN_RECOVERY"
  | "MANUAL_OPERATOR"
  | "SCHEDULED_AUDIT";

export interface BackfillJobRecord {
  id: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  gapId?: string;
  status: BackfillJobStatus;
  triggerSource: BackfillTriggerSource;
  windowStart: string;
  windowEnd: string;
  totalSegments: number;
  syncedSegments: number;
  skippedDuplicates: number;
  reconciledOverlaps: number;
  failedSegments: number;
  totalBytes: number;
  transferredBytes: number;
  rateLimitKbps: number;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface IngestSegmentInput {
  jobId?: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  segmentId: string;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  durationMs: number;
  fileSize: number;
  sha256: string;
  storagePath: string;
  dataBase64?: string; // Optional binary payload for embedded transfer
}

export interface IngestSegmentResult {
  segmentId: string;
  action: "SYNCHRONIZED" | "SKIPPED_DUPLICATE" | "OVERLAP_RECONCILED" | "FAILED";
  message: string;
  adjustedStartTime?: string;
  adjustedEndTime?: string;
  adjustedDurationMs?: number;
  storedStorageUri?: string;
}

export class EdgeBackfillCoordinatorService {
  constructor(
    private readonly pool: Pool,
    private readonly gapDetector?: RecordingGapDetectorService
  ) {}

  /**
   * Creates a new backfill job for a gap or camera time window
   */
  public async createBackfillJob(input: {
    tenantId: string;
    branchId: string;
    cameraId: string;
    gapId?: string;
    triggerSource?: BackfillTriggerSource;
    windowStart: string;
    windowEnd: string;
    rateLimitKbps?: number;
  }): Promise<BackfillJobRecord> {
    const id = randomUUID();
    const triggerSource = input.triggerSource || "MANUAL_OPERATOR";
    const rateLimitKbps = input.rateLimitKbps || 0;

    const query = `
      INSERT INTO recording_backfill_jobs (
        id, tenant_id, branch_id, camera_id, gap_id, status, trigger_source,
        window_start, window_end, rate_limit_kbps, created_at, started_at
      ) VALUES (
        $1, $2, $3, $4, $5, 'IN_PROGRESS', $6,
        $7::timestamptz, $8::timestamptz, $9, NOW(), NOW()
      )
      RETURNING *
    `;

    const res = await this.pool.query(query, [
      id,
      input.tenantId,
      input.branchId,
      input.cameraId,
      input.gapId || null,
      triggerSource,
      input.windowStart,
      input.windowEnd,
      rateLimitKbps,
    ]);

    // If gapId provided, update gap status to IN_PROGRESS
    if (input.gapId) {
      await this.pool.query(
        `UPDATE recording_gaps 
         SET status = 'IN_PROGRESS', backfill_job_id = $1
         WHERE id = $2`,
        [id, input.gapId]
      );
    }

    return this.mapJobRow(res.rows[0]);
  }

  /**
   * Ingests a single backfilled edge segment, evaluates deduplication,
   * commits into central recording_segments, audits, and heals gap.
   */
  public async ingestBackfillSegment(input: IngestSegmentInput): Promise<IngestSegmentResult> {
    // 1. Fetch existing central segments overlapping this segment's time span
    const centralSegments = await this.fetchExistingCentralSegments(
      input.cameraId,
      input.startTime,
      input.endTime
    );

    // 2. Evaluate deduplication using mathematical frame boundary checker
    const edgeEntry: EdgeSegmentEntry = {
      id: input.segmentId,
      tenantId: input.tenantId,
      branchId: input.branchId,
      cameraId: input.cameraId,
      startTime: input.startTime,
      endTime: input.endTime,
      durationMs: input.durationMs,
      fileSize: input.fileSize,
      sha256: input.sha256,
      storagePath: input.storagePath,
      syncStatus: "PENDING",
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    const tempJournal = new EdgeStoreForwardJournal();
    const reconciliationEngine = new EdgeBackfillReconciliationEngine(this.pool, tempJournal);
    const dedupeDecision = reconciliationEngine.evaluateDeduplication(edgeEntry, centralSegments);

    if (dedupeDecision.type === "EXACT_DUPLICATE") {
      // Log audit
      await this.logBackfillAudit({
        jobId: input.jobId,
        tenantId: input.tenantId,
        branchId: input.branchId,
        cameraId: input.cameraId,
        segmentId: input.segmentId,
        action: "SKIPPED_DUPLICATE",
        fileSize: input.fileSize,
        checksumSha256: input.sha256,
        startTime: input.startTime,
        endTime: input.endTime,
        details: { reason: "Exact hash or interval match already in central catalog" },
      });

      if (input.jobId) {
        await this.incrementJobProgress(input.jobId, {
          skippedDuplicates: 1,
          transferredBytes: input.fileSize,
        });
      }

      return {
        segmentId: input.segmentId,
        action: "SKIPPED_DUPLICATE",
        message: "Segment is an exact duplicate of existing central footage. Omitted without frame inflation.",
      };
    }

    // Determine finalized timestamps
    let finalStartTime = input.startTime;
    let finalEndTime = input.endTime;
    let finalDurationMs = input.durationMs;
    let actionType: "SYNCHRONIZED" | "OVERLAP_RECONCILED" = "SYNCHRONIZED";

    if (dedupeDecision.type === "OVERLAPPING_RECONCILE") {
      actionType = "OVERLAP_RECONCILED";
      finalStartTime = dedupeDecision.adjustedStartTime || finalStartTime;
      finalEndTime = dedupeDecision.adjustedEndTime || finalEndTime;
      finalDurationMs = dedupeDecision.adjustedDurationMs ?? finalDurationMs;
    }

    const storageUri = `edge://${input.branchId}/${input.storagePath}`;

    // 3. Commit segment to central recording_segments
    await this.pool.query(
      `INSERT INTO recording_segments (
         id, tenant_id, node_id, camera_id, started_at, ended_at,
         duration_seconds, size_bytes, storage_path, storage_uri,
         checksum_sha256, status, health, segment_state
       ) VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7, $8, $9, $10, $11, 'ready', 'HEALTHY', 'FINALIZED')
       ON CONFLICT (id) DO UPDATE SET
         started_at = EXCLUDED.started_at,
         ended_at = EXCLUDED.ended_at,
         duration_seconds = EXCLUDED.duration_seconds,
         status = 'ready',
         health = 'HEALTHY',
         segment_state = 'FINALIZED'`,
      [
        input.segmentId,
        input.tenantId,
        input.branchId,
        input.cameraId,
        finalStartTime,
        finalEndTime,
        Number((finalDurationMs / 1000).toFixed(2)),
        input.fileSize,
        input.storagePath,
        storageUri,
        input.sha256,
      ]
    );

    // 4. Log immutable audit entry
    await this.logBackfillAudit({
      jobId: input.jobId,
      tenantId: input.tenantId,
      branchId: input.branchId,
      cameraId: input.cameraId,
      segmentId: input.segmentId,
      action: actionType,
      fileSize: input.fileSize,
      checksumSha256: input.sha256,
      startTime: finalStartTime,
      endTime: finalEndTime,
      details: {
        originalStartTime: input.startTime,
        originalEndTime: input.endTime,
        adjusted: actionType === "OVERLAP_RECONCILED",
        storageUri,
      },
    });

    // 5. Update job metrics if attached to job
    if (input.jobId) {
      await this.incrementJobProgress(input.jobId, {
        syncedSegments: actionType === "SYNCHRONIZED" ? 1 : 0,
        reconciledOverlaps: actionType === "OVERLAP_RECONCILED" ? 1 : 0,
        transferredBytes: input.fileSize,
      });
    }

    // 6. Heal corresponding gap if this segment falls within an open gap
    await this.healCoveredGaps(input.cameraId, finalStartTime, finalEndTime, input.fileSize, input.jobId);

    return {
      segmentId: input.segmentId,
      action: actionType,
      message: actionType === "OVERLAP_RECONCILED"
        ? "Segment overlap boundary adjusted to prevent duplicate frames."
        : "Segment cleanly synchronized and committed to central vault.",
      adjustedStartTime: finalStartTime,
      adjustedEndTime: finalEndTime,
      adjustedDurationMs: finalDurationMs,
      storedStorageUri: storageUri,
    };
  }

  /**
   * Batch ingest multiple edge segments with rate pacing and summary report
   */
  public async ingestBackfillBatch(input: {
    jobId?: string;
    tenantId: string;
    branchId: string;
    cameraId: string;
    segments: Array<{
      segmentId: string;
      startTime: string;
      endTime: string;
      durationMs: number;
      fileSize: number;
      sha256: string;
      storagePath: string;
    }>;
    rateLimitKbps?: number;
  }): Promise<{
    total: number;
    synced: number;
    skippedDuplicates: number;
    reconciledOverlaps: number;
    failed: number;
    transferredBytes: number;
    results: IngestSegmentResult[];
  }> {
    const summary = {
      total: input.segments.length,
      synced: 0,
      skippedDuplicates: 0,
      reconciledOverlaps: 0,
      failed: 0,
      transferredBytes: 0,
      results: [] as IngestSegmentResult[],
    };

    // If job provided, update total_segments
    if (input.jobId) {
      await this.pool.query(
        `UPDATE recording_backfill_jobs
         SET total_segments = total_segments + $2,
             total_bytes = total_bytes + $3
         WHERE id = $1`,
        [
          input.jobId,
          input.segments.length,
          input.segments.reduce((acc, s) => acc + s.fileSize, 0),
        ]
      );
    }

    for (const seg of input.segments) {
      try {
        const res = await this.ingestBackfillSegment({
          jobId: input.jobId,
          tenantId: input.tenantId,
          branchId: input.branchId,
          cameraId: input.cameraId,
          segmentId: seg.segmentId,
          startTime: seg.startTime,
          endTime: seg.endTime,
          durationMs: seg.durationMs,
          fileSize: seg.fileSize,
          sha256: seg.sha256,
          storagePath: seg.storagePath,
        });

        summary.results.push(res);
        summary.transferredBytes += seg.fileSize;

        if (res.action === "SYNCHRONIZED") summary.synced++;
        else if (res.action === "SKIPPED_DUPLICATE") summary.skippedDuplicates++;
        else if (res.action === "OVERLAP_RECONCILED") summary.reconciledOverlaps++;
      } catch (err: any) {
        summary.failed++;
        summary.results.push({
          segmentId: seg.segmentId,
          action: "FAILED",
          message: err?.message || "Failed to commit segment",
        });

        if (input.jobId) {
          await this.incrementJobProgress(input.jobId, { failedSegments: 1 });
        }
      }

      // Enforce rate limiting pacing if requested
      if (input.rateLimitKbps && input.rateLimitKbps > 0) {
        const sleepMs = Math.round((seg.fileSize * 8) / (input.rateLimitKbps * 1024) * 1000);
        if (sleepMs > 10 && sleepMs < 2000) {
          await new Promise((resolve) => setTimeout(resolve, sleepMs));
        }
      }
    }

    // If job was completed, mark job status
    if (input.jobId) {
      const finalStatus = summary.failed === 0 ? "COMPLETED" : "FAILED";
      await this.pool.query(
        `UPDATE recording_backfill_jobs
         SET status = $2, completed_at = NOW()
         WHERE id = $1`,
        [input.jobId, finalStatus]
      );
    }

    return summary;
  }

  /**
   * Retrieves a backfill job by ID
   */
  public async getJobById(jobId: string): Promise<BackfillJobRecord | null> {
    const res = await this.pool.query(
      `SELECT * FROM recording_backfill_jobs WHERE id = $1 LIMIT 1`,
      [jobId]
    );
    return res.rows.length > 0 ? this.mapJobRow(res.rows[0]) : null;
  }

  /**
   * Lists backfill jobs with filters
   */
  public async listJobs(filters: {
    tenantId?: string;
    branchId?: string;
    cameraId?: string;
    status?: BackfillJobStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ items: BackfillJobRecord[]; total: number }> {
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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRes = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM recording_backfill_jobs ${whereClause}`,
      params
    );
    const total = countRes.rows[0]?.count ?? 0;

    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 500);
    const offset = Math.max(Number(filters.offset) || 0, 0);

    const itemsQuery = `
      SELECT * FROM recording_backfill_jobs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    params.push(limit, offset);

    const itemsRes = await this.pool.query(itemsQuery, params);
    const items = itemsRes.rows.map((r: any) => this.mapJobRow(r));

    return { items, total };
  }

  /**
   * Cancels an active or pending backfill job
   */
  public async cancelJob(jobId: string): Promise<BackfillJobRecord | null> {
    const res = await this.pool.query(
      `UPDATE recording_backfill_jobs
       SET status = 'CANCELLED', completed_at = NOW(), error_message = 'Cancelled by operator'
       WHERE id = $1 AND status IN ('PENDING', 'SCANNING', 'IN_PROGRESS')
       RETURNING *`,
      [jobId]
    );

    return res.rows.length > 0 ? this.mapJobRow(res.rows[0]) : null;
  }

  /**
   * Returns high-level recovery & backfill statistics
   */
  public async getRecoveryStats(branchId?: string): Promise<{
    activeJobsCount: number;
    completedJobsCount: number;
    totalBackfilledBytes: number;
    totalRecoveredSegments: number;
    totalSkippedDuplicates: number;
    totalReconciledOverlaps: number;
  }> {
    const params: any[] = [];
    let where = "";
    if (branchId) {
      where = "WHERE branch_id = $1";
      params.push(branchId);
    }

    const res = await this.pool.query(
      `SELECT
         COUNT(CASE WHEN status IN ('PENDING', 'SCANNING', 'IN_PROGRESS') THEN 1 END)::int AS active_jobs,
         COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END)::int AS completed_jobs,
         COALESCE(SUM(transferred_bytes), 0)::bigint AS total_transferred_bytes,
         COALESCE(SUM(synced_segments + reconciled_overlaps), 0)::int AS total_recovered_segments,
         COALESCE(SUM(skipped_duplicates), 0)::int AS total_skipped_duplicates,
         COALESCE(SUM(reconciled_overlaps), 0)::int AS total_reconciled_overlaps
       FROM recording_backfill_jobs
       ${where}`,
      params
    );

    const row = res.rows[0] || {};
    return {
      activeJobsCount: Number(row.active_jobs || 0),
      completedJobsCount: Number(row.completed_jobs || 0),
      totalBackfilledBytes: Number(row.total_transferred_bytes || 0),
      totalRecoveredSegments: Number(row.total_recovered_segments || 0),
      totalSkippedDuplicates: Number(row.total_skipped_duplicates || 0),
      totalReconciledOverlaps: Number(row.total_reconciled_overlaps || 0),
    };
  }

  /**
   * Queries forensic edge backfill audit entries
   */
  public async listAuditEntries(filters: {
    cameraId?: string;
    jobId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: any[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters.cameraId) {
      conditions.push(`camera_id = $${idx++}`);
      params.push(filters.cameraId);
    }
    if (filters.jobId) {
      conditions.push(`job_id = $${idx++}`);
      params.push(filters.jobId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countRes = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM edge_backfill_audit_log ${where}`,
      params
    );
    const total = countRes.rows[0]?.count ?? 0;

    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 500);
    const offset = Math.max(Number(filters.offset) || 0, 0);

    const itemsQuery = `
      SELECT * FROM edge_backfill_audit_log
      ${where}
      ORDER BY logged_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    params.push(limit, offset);

    const itemsRes = await this.pool.query(itemsQuery, params);
    return { items: itemsRes.rows, total };
  }

  /**
   * Internal helper: fetches existing central segments covering range
   */
  private async fetchExistingCentralSegments(
    cameraId: string,
    startTime: string,
    endTime: string
  ): Promise<Array<{
    id: string;
    cameraId: string;
    startedAt: string;
    endedAt: string;
    storagePath: string;
    checksumSha256?: string;
    durationSeconds?: number;
  }>> {
    const res = await this.pool.query(
      `SELECT id, camera_id, started_at, ended_at, storage_path, checksum_sha256, duration_seconds
       FROM recording_segments
       WHERE camera_id = $1
         AND status <> 'deleted'
         AND ended_at >= $2::timestamptz
         AND started_at <= $3::timestamptz
       ORDER BY started_at ASC`,
      [cameraId, startTime, endTime]
    );

    return res.rows.map((r: any) => ({
      id: r.id,
      cameraId: r.camera_id,
      startedAt: r.started_at instanceof Date ? r.started_at.toISOString() : new Date(r.started_at).toISOString(),
      endedAt: r.ended_at instanceof Date ? r.ended_at.toISOString() : new Date(r.ended_at).toISOString(),
      storagePath: r.storage_path,
      checksumSha256: r.checksum_sha256,
      durationSeconds: Number(r.duration_seconds || 0),
    }));
  }

  /**
   * Internal helper: marks gaps covered by this segment as HEALED
   */
  private async healCoveredGaps(
    cameraId: string,
    segStart: string,
    segEnd: string,
    fileSize: number,
    jobId?: string
  ): Promise<void> {
    const query = `
      UPDATE recording_gaps
      SET status = 'HEALED',
          healed_at = NOW(),
          healed_by = 'EDGE_BACKFILL',
          backfill_job_id = COALESCE($4, backfill_job_id),
          segments_recovered_count = segments_recovered_count + 1,
          bytes_recovered = bytes_recovered + $5,
          resolved_at = NOW()
      WHERE camera_id = $1
        AND status IN ('OPEN', 'IN_PROGRESS')
        AND start_time >= $2::timestamptz - INTERVAL '5 seconds'
        AND end_time <= $3::timestamptz + INTERVAL '5 seconds'
    `;

    await this.pool.query(query, [cameraId, segStart, segEnd, jobId || null, fileSize]);
  }

  private async incrementJobProgress(
    jobId: string,
    delta: {
      syncedSegments?: number;
      skippedDuplicates?: number;
      reconciledOverlaps?: number;
      failedSegments?: number;
      transferredBytes?: number;
    }
  ): Promise<void> {
    const query = `
      UPDATE recording_backfill_jobs
      SET synced_segments = synced_segments + $2,
          skipped_duplicates = skipped_duplicates + $3,
          reconciled_overlaps = reconciled_overlaps + $4,
          failed_segments = failed_segments + $5,
          transferred_bytes = transferred_bytes + $6
      WHERE id = $1
    `;

    await this.pool.query(query, [
      jobId,
      delta.syncedSegments || 0,
      delta.skippedDuplicates || 0,
      delta.reconciledOverlaps || 0,
      delta.failedSegments || 0,
      delta.transferredBytes || 0,
    ]);
  }

  private async logBackfillAudit(audit: {
    jobId?: string;
    tenantId: string;
    branchId: string;
    cameraId: string;
    segmentId: string;
    action: string;
    fileSize: number;
    checksumSha256: string;
    startTime: string;
    endTime: string;
    details: Record<string, unknown>;
  }): Promise<void> {
    const query = `
      INSERT INTO edge_backfill_audit_log (
        id, job_id, tenant_id, branch_id, camera_id, segment_id,
        action, file_size, checksum_sha256, start_time, end_time,
        details, logged_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10::timestamptz, $11::timestamptz,
        $12::jsonb, NOW()
      )
    `;

    await this.pool.query(query, [
      randomUUID(),
      audit.jobId || null,
      audit.tenantId,
      audit.branchId,
      audit.cameraId,
      audit.segmentId,
      audit.action,
      audit.fileSize,
      audit.checksumSha256,
      audit.startTime,
      audit.endTime,
      JSON.stringify(audit.details),
    ]);
  }

  private mapJobRow(r: any): BackfillJobRecord {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      cameraId: r.camera_id,
      gapId: r.gap_id || undefined,
      status: (r.status as BackfillJobStatus) || "PENDING",
      triggerSource: (r.trigger_source as BackfillTriggerSource) || "MANUAL_OPERATOR",
      windowStart: r.window_start instanceof Date ? r.window_start.toISOString() : new Date(r.window_start).toISOString(),
      windowEnd: r.window_end instanceof Date ? r.window_end.toISOString() : new Date(r.window_end).toISOString(),
      totalSegments: Number(r.total_segments || 0),
      syncedSegments: Number(r.synced_segments || 0),
      skippedDuplicates: Number(r.skipped_duplicates || 0),
      reconciledOverlaps: Number(r.reconciled_overlaps || 0),
      failedSegments: Number(r.failed_segments || 0),
      totalBytes: Number(r.total_bytes || 0),
      transferredBytes: Number(r.transferred_bytes || 0),
      rateLimitKbps: Number(r.rate_limit_kbps || 0),
      errorMessage: r.error_message || undefined,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : new Date(r.created_at).toISOString(),
      startedAt: r.started_at ? (r.started_at instanceof Date ? r.started_at.toISOString() : new Date(r.started_at).toISOString()) : undefined,
      completedAt: r.completed_at ? (r.completed_at instanceof Date ? r.completed_at.toISOString() : new Date(r.completed_at).toISOString()) : undefined,
    };
  }
}
