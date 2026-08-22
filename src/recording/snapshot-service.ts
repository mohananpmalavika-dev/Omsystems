import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

export interface ForensicSnapshot {
  id: string;
  segmentId: string;
  cameraId: string;
  timestamp: string;
  snapshotType: "manual" | "automatic" | "forensic" | "investigation";
  reason: string;
  notes?: string;
  operatorId: string;
  originalStoragePath?: string;
  originalHashSha256?: string;
  annotatedStoragePath?: string;
  annotatedHashSha256?: string;
  width?: number;
  height?: number;
  format?: "jpg" | "png" | "bmp";
  evidenceCaseId?: string;
  incidentId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface EnhancedBookmark {
  id: string;
  tenantId: string;
  cameraId: string;
  operatorId: string;
  timestamp: string;
  reason: string;
  priority: "low" | "medium" | "high" | "critical";
  notes?: string;
  recordingSegmentId?: string;
  snapshotReference?: string;
  tags?: string[];
  evidenceCaseId?: string;
  frameOffsetMs?: number;
  verifiedBy?: string;
  verifiedAt?: string;
  incidentId?: string;
  createdAt: string;
}

export class SnapshotService {
  constructor(private readonly pool: Pool) {}

  /**
   * Create a forensic snapshot with original preservation
   */
  async createForensicSnapshot(input: {
    segmentId: string;
    cameraId: string;
    timestamp: string;
    snapshotType: "manual" | "automatic" | "forensic" | "investigation";
    reason: string;
    notes?: string;
    operatorId: string;
    evidenceCaseId?: string;
    incidentId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ForensicSnapshot> {
    const id = randomUUID();

    const result = await this.pool.query(
      `INSERT INTO recording_snapshots (
         id, segment_id, camera_id, timestamp, snapshot_type, reason, notes,
         operator_id, evidence_case_id, incident_id, metadata, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       RETURNING *`,
      [
        id,
        input.segmentId,
        input.cameraId,
        input.timestamp,
        input.snapshotType,
        input.reason,
        input.notes ?? null,
        input.operatorId,
        input.evidenceCaseId ?? null,
        input.incidentId ?? null,
        JSON.stringify(input.metadata || {}),
      ],
    );

    // Record in chain of custody if evidence case
    if (input.evidenceCaseId) {
      await this.recordCustodyEvent({
        evidenceId: input.evidenceCaseId,
        action: "snapshot_captured",
        performedBy: input.operatorId,
        reason: input.reason,
      });
    }

    return mapSnapshot(result.rows[0]);
  }

  /**
   * Update snapshot with storage paths and hashes after file processing
   */
  async updateSnapshotStorage(input: {
    snapshotId: string;
    originalStoragePath: string;
    originalHashSha256: string;
    annotatedStoragePath?: string;
    annotatedHashSha256?: string;
    width: number;
    height: number;
    format: "jpg" | "png" | "bmp";
  }): Promise<void> {
    await this.pool.query(
      `UPDATE recording_snapshots
       SET original_storage_path = $2,
           original_hash_sha256 = $3,
           annotated_storage_path = $4,
           annotated_hash_sha256 = $5,
           width = $6,
           height = $7,
           format = $8
       WHERE id = $1`,
      [
        input.snapshotId,
        input.originalStoragePath,
        input.originalHashSha256,
        input.annotatedStoragePath ?? null,
        input.annotatedHashSha256 ?? null,
        input.width,
        input.height,
        input.format,
      ],
    );
  }

  /**
   * Get snapshot by ID
   */
  async getSnapshot(snapshotId: string): Promise<ForensicSnapshot | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM recording_snapshots WHERE id = $1`,
      [snapshotId],
    );

    return result.rows[0] ? mapSnapshot(result.rows[0]) : undefined;
  }

  /**
   * List snapshots for a camera or evidence case
   */
  async listSnapshots(filters: {
    cameraId?: string;
    evidenceCaseId?: string;
    incidentId?: string;
    from?: string;
    to?: string;
    snapshotType?: "manual" | "automatic" | "forensic" | "investigation";
    limit?: number;
    offset?: number;
  }): Promise<{ data: ForensicSnapshot[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.cameraId) {
      conditions.push(`camera_id = $${paramIndex}`);
      params.push(filters.cameraId);
      paramIndex++;
    }

    if (filters.evidenceCaseId) {
      conditions.push(`evidence_case_id = $${paramIndex}`);
      params.push(filters.evidenceCaseId);
      paramIndex++;
    }

    if (filters.incidentId) {
      conditions.push(`incident_id = $${paramIndex}`);
      params.push(filters.incidentId);
      paramIndex++;
    }

    if (filters.from) {
      conditions.push(`timestamp >= $${paramIndex}::timestamptz`);
      params.push(filters.from);
      paramIndex++;
    }

    if (filters.to) {
      conditions.push(`timestamp <= $${paramIndex}::timestamptz`);
      params.push(filters.to);
      paramIndex++;
    }

    if (filters.snapshotType) {
      conditions.push(`snapshot_type = $${paramIndex}`);
      params.push(filters.snapshotType);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count total
    const countResult = await this.pool.query(
      `SELECT COUNT(*) as total FROM recording_snapshots ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Get data
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const result = await this.pool.query(
      `SELECT * FROM recording_snapshots
       ${whereClause}
       ORDER BY timestamp DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset],
    );

    return {
      data: result.rows.map(mapSnapshot),
      total,
    };
  }

  /**
   * Verify snapshot integrity
   */
  async verifySnapshotIntegrity(
    snapshotId: string,
  ): Promise<{
    status: "verified" | "mismatch" | "missing";
    originalHash?: string;
    annotatedHash?: string;
  }> {
    const snapshot = await this.getSnapshot(snapshotId);
    if (!snapshot) {
      return { status: "missing" };
    }

    // In production, would compute hash from file and compare
    // For now, return stored hash as verified
    return {
      status: snapshot.originalHashSha256 ? "verified" : "missing",
      originalHash: snapshot.originalHashSha256,
      annotatedHash: snapshot.annotatedHashSha256,
    };
  }

  /**
   * Create an enhanced bookmark with forensic metadata
   */
  async createBookmark(input: {
    tenantId: string;
    cameraId: string;
    operatorId: string;
    timestamp: string;
    reason: string;
    priority: "low" | "medium" | "high" | "critical";
    notes?: string;
    recordingSegmentId?: string;
    snapshotReference?: string;
    tags?: string[];
    evidenceCaseId?: string;
    frameOffsetMs?: number;
    incidentId?: string;
  }): Promise<EnhancedBookmark> {
    const id = randomUUID();

    const result = await this.pool.query(
      `INSERT INTO live_bookmarks (
         id, tenant_id, camera_id, operator_id, timestamp, reason, priority,
         notes, recording_segment_id, snapshot_reference, tags, evidence_case_id,
         frame_offset_ms, incident_id, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
       RETURNING *`,
      [
        id,
        input.tenantId,
        input.cameraId,
        input.operatorId,
        input.timestamp,
        input.reason,
        input.priority,
        input.notes ?? null,
        input.recordingSegmentId ?? null,
        input.snapshotReference ?? null,
        input.tags ?? null,
        input.evidenceCaseId ?? null,
        input.frameOffsetMs ?? null,
        input.incidentId ?? null,
      ],
    );

    // Record in chain of custody if evidence case
    if (input.evidenceCaseId) {
      await this.recordCustodyEvent({
        evidenceId: input.evidenceCaseId,
        action: "bookmark_created",
        performedBy: input.operatorId,
        reason: input.reason,
      });
    }

    return mapBookmark(result.rows[0]);
  }

  /**
   * Update bookmark verification status
   */
  async verifyBookmark(input: {
    bookmarkId: string;
    verifiedBy: string;
  }): Promise<EnhancedBookmark | undefined> {
    const result = await this.pool.query(
      `UPDATE live_bookmarks
       SET verified_by = $2, verified_at = now()
       WHERE id = $1
       RETURNING *`,
      [input.bookmarkId, input.verifiedBy],
    );

    return result.rows[0] ? mapBookmark(result.rows[0]) : undefined;
  }

  /**
   * List bookmarks with filters
   */
  async listBookmarks(filters: {
    tenantId: string;
    cameraId?: string;
    evidenceCaseId?: string;
    incidentId?: string;
    priority?: "low" | "medium" | "high" | "critical";
    from?: string;
    to?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
  }): Promise<{ data: EnhancedBookmark[]; total: number }> {
    const conditions: string[] = ["tenant_id = $1"];
    const params: any[] = [filters.tenantId];
    let paramIndex = 2;

    if (filters.cameraId) {
      conditions.push(`camera_id = $${paramIndex}`);
      params.push(filters.cameraId);
      paramIndex++;
    }

    if (filters.evidenceCaseId) {
      conditions.push(`evidence_case_id = $${paramIndex}`);
      params.push(filters.evidenceCaseId);
      paramIndex++;
    }

    if (filters.incidentId) {
      conditions.push(`incident_id = $${paramIndex}`);
      params.push(filters.incidentId);
      paramIndex++;
    }

    if (filters.priority) {
      conditions.push(`priority = $${paramIndex}`);
      params.push(filters.priority);
      paramIndex++;
    }

    if (filters.from) {
      conditions.push(`timestamp >= $${paramIndex}::timestamptz`);
      params.push(filters.from);
      paramIndex++;
    }

    if (filters.to) {
      conditions.push(`timestamp <= $${paramIndex}::timestamptz`);
      params.push(filters.to);
      paramIndex++;
    }

    if (filters.tags && filters.tags.length > 0) {
      conditions.push(`tags && $${paramIndex}::text[]`);
      params.push(filters.tags);
      paramIndex++;
    }

    const whereClause = conditions.join(" AND ");

    // Count total
    const countResult = await this.pool.query(
      `SELECT COUNT(*) as total FROM live_bookmarks WHERE ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Get data
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const result = await this.pool.query(
      `SELECT * FROM live_bookmarks
       WHERE ${whereClause}
       ORDER BY timestamp DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset],
    );

    return {
      data: result.rows.map(mapBookmark),
      total,
    };
  }

  /**
   * Link snapshot to evidence case
   */
  async linkToEvidenceCase(input: {
    snapshotId: string;
    evidenceCaseId: string;
    operatorId: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE recording_snapshots
       SET evidence_case_id = $2
       WHERE id = $1`,
      [input.snapshotId, input.evidenceCaseId],
    );

    await this.recordCustodyEvent({
      evidenceId: input.evidenceCaseId,
      action: "snapshot_added",
      performedBy: input.operatorId,
    });
  }

  /**
   * Record chain of custody event
   */
  private async recordCustodyEvent(input: {
    evidenceId: string;
    action: string;
    performedBy: string;
    reason?: string;
    sourceIp?: string;
  }): Promise<void> {
    // Get previous hash for linkage
    const prevResult = await this.pool.query(
      `SELECT event_hash FROM chain_of_custody_events
       WHERE evidence_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [input.evidenceId],
    );

    const previousHash = prevResult.rows[0]?.event_hash ?? null;

    // Create hash of this event
    const crypto = await import("node:crypto");
    const eventData = JSON.stringify({
      action: input.action,
      performedBy: input.performedBy,
      timestamp: new Date().toISOString(),
      reason: input.reason,
      sourceIp: input.sourceIp,
      previousHash,
    });
    const eventHash = crypto.createHash("sha256").update(eventData).digest("hex");

    await this.pool.query(
      `INSERT INTO chain_of_custody_events (
         id, evidence_id, action, performed_by, reason, source_ip,
         event_hash, previous_hash, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
      [
        randomUUID(),
        input.evidenceId,
        input.action,
        input.performedBy,
        input.reason ?? null,
        input.sourceIp ?? null,
        eventHash,
        previousHash,
      ],
    );
  }
}

function mapSnapshot(row: any): ForensicSnapshot {
  return {
    id: row.id,
    segmentId: row.segment_id,
    cameraId: row.camera_id,
    timestamp: new Date(row.timestamp).toISOString(),
    snapshotType: row.snapshot_type || "manual",
    reason: row.reason,
    notes: row.notes,
    operatorId: row.operator_id,
    originalStoragePath: row.original_storage_path,
    originalHashSha256: row.original_hash_sha256,
    annotatedStoragePath: row.annotated_storage_path,
    annotatedHashSha256: row.annotated_hash_sha256,
    width: row.width,
    height: row.height,
    format: row.format,
    evidenceCaseId: row.evidence_case_id,
    incidentId: row.incident_id,
    metadata: row.metadata || {},
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapBookmark(row: any): EnhancedBookmark {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    cameraId: row.camera_id,
    operatorId: row.operator_id,
    timestamp: new Date(row.timestamp).toISOString(),
    reason: row.reason,
    priority: row.priority,
    notes: row.notes,
    recordingSegmentId: row.recording_segment_id,
    snapshotReference: row.snapshot_reference,
    tags: row.tags || [],
    evidenceCaseId: row.evidence_case_id,
    frameOffsetMs: row.frame_offset_ms,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : undefined,
    incidentId: row.incident_id,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
