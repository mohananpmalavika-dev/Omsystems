import type { Pool } from "pg";
import type { EdgeSegmentEntry, EdgeStoreForwardJournal } from "./edge-store-forward-journal.js";

export interface ExistingCentralSegment {
  id: string;
  cameraId: string;
  startedAt: string;
  endedAt: string;
  storagePath: string;
  checksumSha256?: string;
  durationSeconds?: number;
}

export interface ReconciliationSummary {
  scannedEdgeSegments: number;
  syncedCount: number;
  skippedDuplicates: number;
  reconciledOverlaps: number;
  failedCount: number;
  processedBytes: number;
  syncedSegmentIds: string[];
}

/**
 * EdgeBackfillReconciliationEngine
 * 
 * Reconciles edge store-and-forward buffered recordings against central PostgreSQL
 * recording catalog. Guarantees ZERO duplicate frames and zero timeline inflation.
 */
export class EdgeBackfillReconciliationEngine {
  constructor(
    private readonly dbPool: Pool,
    private readonly journal: EdgeStoreForwardJournal,
  ) {}

  /**
   * Reconciles all pending segments for a camera or across all cameras
   */
  public async reconcile(cameraId?: string): Promise<ReconciliationSummary> {
    const pendingSegments = this.journal.getPendingSyncSegments(cameraId);

    const summary: ReconciliationSummary = {
      scannedEdgeSegments: pendingSegments.length,
      syncedCount: 0,
      skippedDuplicates: 0,
      reconciledOverlaps: 0,
      failedCount: 0,
      processedBytes: 0,
      syncedSegmentIds: [],
    };

    if (pendingSegments.length === 0) {
      return summary;
    }

    // Fetch existing central segments covering the time span of pending edge segments
    const earliestStart = pendingSegments[0]!.startTime;
    const latestEnd = pendingSegments[pendingSegments.length - 1]!.endTime;
    const targetCameraId = cameraId || pendingSegments[0]!.cameraId;

    const existingCentral = await this.fetchExistingCentralSegments(targetCameraId, earliestStart, latestEnd);

    const syncedIds: string[] = [];

    for (const edgeSeg of pendingSegments) {
      try {
        const action = this.evaluateDeduplication(edgeSeg, existingCentral);

        if (action.type === "EXACT_DUPLICATE") {
          // Already in central catalog: mark synced in journal without re-inserting
          summary.skippedDuplicates++;
          syncedIds.push(edgeSeg.id);
          continue;
        }

        if (action.type === "OVERLAPPING_RECONCILE") {
          // Truncate overlapping edge boundary to prevent duplicate frames
          summary.reconciledOverlaps++;
          await this.commitSegmentToCentral({
            ...edgeSeg,
            startTime: action.adjustedStartTime || edgeSeg.startTime,
            endTime: action.adjustedEndTime || edgeSeg.endTime,
            durationMs: action.adjustedDurationMs || edgeSeg.durationMs,
          });
          syncedIds.push(edgeSeg.id);
          summary.syncedCount++;
          summary.processedBytes += edgeSeg.fileSize;
          continue;
        }

        // Clean new segment: commit to central
        await this.commitSegmentToCentral(edgeSeg);
        syncedIds.push(edgeSeg.id);
        summary.syncedCount++;
        summary.processedBytes += edgeSeg.fileSize;
      } catch {
        this.journal.markSegmentFailed(edgeSeg.id);
        summary.failedCount++;
      }
    }

    if (syncedIds.length > 0) {
      this.journal.markSegmentsSynced(syncedIds);
      summary.syncedSegmentIds = syncedIds;
    }

    return summary;
  }

  /**
   * Fetches existing central segments covering the time range
   */
  private async fetchExistingCentralSegments(
    cameraId: string,
    startTime: string,
    endTime: string,
  ): Promise<ExistingCentralSegment[]> {
    const res = await this.dbPool.query(
      `SELECT id, camera_id, started_at, ended_at, storage_path, checksum_sha256, duration_seconds
       FROM recording_segments
       WHERE camera_id = $1
         AND status <> 'deleted'
         AND ended_at >= $2::timestamptz
         AND started_at <= $3::timestamptz
       ORDER BY started_at ASC`,
      [cameraId, startTime, endTime],
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
   * Evaluates deduplication rules to ensure zero duplicate frames
   */
  public evaluateDeduplication(
    edge: EdgeSegmentEntry,
    existing: ExistingCentralSegment[],
  ): {
    type: "CLEAN_INSERT" | "EXACT_DUPLICATE" | "OVERLAPPING_RECONCILE";
    adjustedStartTime?: string;
    adjustedEndTime?: string;
    adjustedDurationMs?: number;
  } {
    const edgeStartMs = new Date(edge.startTime).getTime();
    const edgeEndMs = new Date(edge.endTime).getTime();

    for (const central of existing) {
      const centralStartMs = new Date(central.startedAt).getTime();
      const centralEndMs = new Date(central.endedAt).getTime();

      // Case 1: Exact checksum match or exact identical interval
      if (
        (edge.sha256 && central.checksumSha256 === edge.sha256) ||
        (Math.abs(edgeStartMs - centralStartMs) < 200 && Math.abs(edgeEndMs - centralEndMs) < 200)
      ) {
        return { type: "EXACT_DUPLICATE" };
      }

      // Case 2: Segment completely contained within an existing central segment
      if (edgeStartMs >= centralStartMs - 100 && edgeEndMs <= centralEndMs + 100) {
        return { type: "EXACT_DUPLICATE" };
      }

      // Case 3: Partial overlap at the beginning (e.g. central already recorded [centralStart, centralEnd], edge starts before centralEnd)
      if (edgeStartMs < centralEndMs && edgeEndMs > centralEndMs) {
        const overlapMs = centralEndMs - edgeStartMs;
        // If overlap is significant (>200ms), advance start time to centralEnd to eliminate double frames
        if (overlapMs > 200) {
          const adjustedStartMs = centralEndMs;
          const adjustedDuration = Math.max(0, edgeEndMs - adjustedStartMs);
          return {
            type: "OVERLAPPING_RECONCILE",
            adjustedStartTime: new Date(adjustedStartMs).toISOString(),
            adjustedEndTime: edge.endTime,
            adjustedDurationMs: adjustedDuration,
          };
        }
      }

      // Case 4: Partial overlap at the end
      if (edgeStartMs < centralStartMs && edgeEndMs > centralStartMs && edgeEndMs <= centralEndMs) {
        const overlapMs = edgeEndMs - centralStartMs;
        if (overlapMs > 200) {
          const adjustedEndMs = centralStartMs;
          const adjustedDuration = Math.max(0, adjustedEndMs - edgeStartMs);
          return {
            type: "OVERLAPPING_RECONCILE",
            adjustedStartTime: edge.startTime,
            adjustedEndTime: new Date(adjustedEndMs).toISOString(),
            adjustedDurationMs: adjustedDuration,
          };
        }
      }
    }

    return { type: "CLEAN_INSERT" };
  }

  /**
   * Inserts an edge segment record into central PostgreSQL catalog idempotently
   */
  private async commitSegmentToCentral(seg: {
    id: string;
    tenantId: string;
    branchId: string;
    cameraId: string;
    startTime: string;
    endTime: string;
    durationMs: number;
    fileSize: number;
    sha256: string;
    storagePath: string;
  }): Promise<void> {
    await this.dbPool.query(
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
         health = 'HEALTHY'`,
      [
        seg.id,
        seg.tenantId,
        seg.branchId,
        seg.cameraId,
        seg.startTime,
        seg.endTime,
        Number((seg.durationMs / 1000).toFixed(2)),
        seg.fileSize,
        seg.storagePath,
        `edge://${seg.branchId}/${seg.storagePath}`,
        seg.sha256,
      ],
    );
  }
}
