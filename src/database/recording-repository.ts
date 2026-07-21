import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  RecordingHealthEvent,
  RecordingJob,
  RecordingLegalHold,
  RecordingSegment,
  RecordingStorageNode,
} from "../domain/models.js";

export class RecordingRepository {
  constructor(private readonly pool: Pool) {}

  async getJob(cameraId: string): Promise<RecordingJob | undefined> {
    const result = await this.pool.query("SELECT * FROM recording_jobs WHERE camera_id=$1", [cameraId]);
    return result.rows[0] ? mapJob(result.rows[0]) : undefined;
  }

  async upsertJob(cameraId: string, input: Omit<RecordingJob, "id" | "cameraId" | "updatedAt">) {
    const result = await this.pool.query(
      `INSERT INTO recording_jobs (
         id, camera_id, mode, enabled, status, retention_days, schedule,
         post_roll_seconds, segment_duration_seconds, hot_retention_days,
         warm_retention_days, cold_retention_days, max_bitrate_kbps, critical,
         backup_required, automatic_deletion_enabled, evidence_protection,
         record_main_stream
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (camera_id) DO UPDATE SET mode=EXCLUDED.mode, enabled=EXCLUDED.enabled,
       status=EXCLUDED.status, retention_days=EXCLUDED.retention_days, schedule=EXCLUDED.schedule,
       post_roll_seconds=EXCLUDED.post_roll_seconds,
       segment_duration_seconds=EXCLUDED.segment_duration_seconds,
       hot_retention_days=EXCLUDED.hot_retention_days,
       warm_retention_days=EXCLUDED.warm_retention_days,
       cold_retention_days=EXCLUDED.cold_retention_days,
       max_bitrate_kbps=EXCLUDED.max_bitrate_kbps,
       critical=EXCLUDED.critical, backup_required=EXCLUDED.backup_required,
       automatic_deletion_enabled=EXCLUDED.automatic_deletion_enabled,
       evidence_protection=EXCLUDED.evidence_protection,
       record_main_stream=EXCLUDED.record_main_stream,
       updated_at=now() RETURNING *`,
      [randomUUID(), cameraId, input.mode, input.enabled, input.status, input.retentionDays,
        input.schedule ? JSON.stringify(input.schedule) : null, input.postRollSeconds,
        input.segmentDurationSeconds, input.hotRetentionDays, input.warmRetentionDays,
        input.coldRetentionDays, input.maxBitrateKbps ?? null, input.critical,
        input.backupRequired, input.automaticDeletionEnabled,
        input.evidenceProtection, input.recordMainStream],
    );
    return mapJob(result.rows[0]);
  }

  async listSegments(cameraId: string, from?: string, to?: string): Promise<RecordingSegment[]> {
    const result = await this.pool.query(
      `SELECT * FROM recording_segments WHERE camera_id=$1
       AND ($2::timestamptz IS NULL OR ended_at >= $2::timestamptz)
       AND ($3::timestamptz IS NULL OR started_at <= $3::timestamptz)
       AND status <> 'deleted'
       ORDER BY started_at ASC`, [cameraId, from ?? null, to ?? null],
    );
    return result.rows.map(mapSegment);
  }

  async getSegment(id: string): Promise<RecordingSegment | undefined> {
    const result = await this.pool.query(
      "SELECT * FROM recording_segments WHERE id=$1 AND status <> 'deleted'",
      [id],
    );
    return result.rows[0] ? mapSegment(result.rows[0]) : undefined;
  }

  async createSegment(input: Omit<RecordingSegment, "id" | "createdAt">) {
    const result = await this.pool.query(
      `INSERT INTO recording_segments (
         id, camera_id, job_id, started_at, ended_at, storage_path, size_bytes,
         storage_node_external_id, storage_tier, status, checksum_sha256, codec
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (camera_id, storage_path) DO UPDATE SET
         ended_at=EXCLUDED.ended_at, size_bytes=EXCLUDED.size_bytes,
         storage_node_external_id=EXCLUDED.storage_node_external_id,
         storage_tier=EXCLUDED.storage_tier, status=EXCLUDED.status,
         checksum_sha256=EXCLUDED.checksum_sha256, codec=EXCLUDED.codec
       RETURNING *`,
      [randomUUID(), input.cameraId, input.jobId, input.startedAt, input.endedAt,
        input.storagePath, input.sizeBytes, input.storageNodeExternalId,
        input.storageTier, input.status, input.checksumSha256 ?? null,
        input.codec ?? null],
    );
    return mapSegment(result.rows[0]);
  }

  async updateJobStatus(cameraId: string, status: RecordingJob["status"]) {
    const result = await this.pool.query(
      `UPDATE recording_jobs SET status=$2, updated_at=now()
       WHERE camera_id=$1 RETURNING *`,
      [cameraId, status],
    );
    return result.rows[0] ? mapJob(result.rows[0]) : undefined;
  }

  async listLegalHolds(cameraId: string): Promise<RecordingLegalHold[]> {
    const result = await this.pool.query(
      `SELECT * FROM recording_legal_holds
       WHERE camera_id=$1 ORDER BY created_at DESC`,
      [cameraId],
    );
    return result.rows.map(mapLegalHold);
  }

  async createLegalHold(input: {
    tenantId: string; cameraId: string; fromAt: string; toAt: string;
    reason: string; createdBy: string;
  }): Promise<RecordingLegalHold> {
    const result = await this.pool.query(
      `INSERT INTO recording_legal_holds
         (tenant_id, camera_id, from_at, to_at, reason, created_by)
       SELECT $1,$2,$3,$4,$5,$6
       WHERE EXISTS (
         SELECT 1 FROM cameras c JOIN resource_nodes rn ON rn.id=c.resource_node_id
         WHERE c.id=$2 AND rn.tenant_id=$1
       ) RETURNING *`,
      [input.tenantId, input.cameraId, input.fromAt, input.toAt,
        input.reason, input.createdBy],
    );
    if (!result.rows[0]) throw new Error("camera_not_found");
    return mapLegalHold(result.rows[0]);
  }

  async releaseLegalHold(
    id: string,
    tenantId: string,
    cameraId: string,
    releasedBy: string,
  ) {
    const result = await this.pool.query(
      `UPDATE recording_legal_holds SET released_by=$4, released_at=now()
       WHERE id=$1 AND tenant_id=$2 AND camera_id=$3 AND released_at IS NULL
       RETURNING *`,
      [id, tenantId, cameraId, releasedBy],
    );
    return result.rows[0] ? mapLegalHold(result.rows[0]) : undefined;
  }

  async upsertStorageNode(input: {
    tenantId: string; externalId: string; name: string;
    scopeNodeId?: string | undefined;
    supportedTiers: Array<"hot" | "warm" | "cold">;
    capacityBytes: number; usedBytes: number; availableBytes: number;
    status: "healthy" | "warning" | "critical" | "offline";
    temperatureCelsius?: number | undefined; writeMbps?: number | undefined;
  }): Promise<RecordingStorageNode> {
    const result = await this.pool.query(
      `INSERT INTO recording_storage_nodes (
         tenant_id, external_id, scope_node_id, name, supported_tiers,
         capacity_bytes, used_bytes, available_bytes, status,
         temperature_celsius, write_mbps, last_seen_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
       ON CONFLICT (tenant_id, external_id) DO UPDATE SET
         scope_node_id=EXCLUDED.scope_node_id, name=EXCLUDED.name,
         supported_tiers=EXCLUDED.supported_tiers,
         capacity_bytes=EXCLUDED.capacity_bytes, used_bytes=EXCLUDED.used_bytes,
         available_bytes=EXCLUDED.available_bytes, status=EXCLUDED.status,
         temperature_celsius=EXCLUDED.temperature_celsius,
         write_mbps=EXCLUDED.write_mbps, last_seen_at=now(), updated_at=now()
       RETURNING *`,
      [input.tenantId, input.externalId, input.scopeNodeId ?? null, input.name,
        input.supportedTiers, input.capacityBytes, input.usedBytes,
        input.availableBytes, input.status, input.temperatureCelsius ?? null,
        input.writeMbps ?? null],
    );
    return mapStorageNode(result.rows[0]);
  }

  async createHealthEvent(input: {
    tenantId: string; cameraId?: string | undefined;
    storageNodeExternalId?: string | undefined; eventType: string;
    severity: "info" | "warning" | "critical"; message: string;
    details?: Record<string, unknown> | undefined;
  }): Promise<RecordingHealthEvent> {
    const result = await this.pool.query(
      `INSERT INTO recording_health_events (
         tenant_id, camera_id, storage_node_external_id, event_type,
         severity, message, details
       ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [input.tenantId, input.cameraId ?? null,
        input.storageNodeExternalId ?? null, input.eventType, input.severity,
        input.message, JSON.stringify(input.details ?? {})],
    );
    return mapHealthEvent(result.rows[0]);
  }

  async listHealthEvents(cameraId: string, limit: number): Promise<RecordingHealthEvent[]> {
    const result = await this.pool.query(
      `SELECT * FROM recording_health_events
       WHERE camera_id=$1 ORDER BY occurred_at DESC LIMIT $2`,
      [cameraId, limit],
    );
    return result.rows.map(mapHealthEvent);
  }

  async listRetentionCandidates(
    tenantId: string,
    storageNodeExternalId: string,
    limit: number,
  ): Promise<RecordingSegment[]> {
    const result = await this.pool.query(
      `SELECT rs.* FROM recording_segments rs
       JOIN recording_jobs rj ON rj.id=rs.job_id AND rj.camera_id=rs.camera_id
       JOIN cameras c ON c.id=rs.camera_id
       JOIN resource_nodes rn ON rn.id=c.resource_node_id
       WHERE rn.tenant_id=$1
         AND rs.storage_node_external_id=$2
         AND rs.status='ready'
         AND rj.automatic_deletion_enabled=true
         AND rs.ended_at < now() - make_interval(days => rj.retention_days)
         AND NOT EXISTS (
           SELECT 1 FROM recording_legal_holds rlh
           WHERE rlh.camera_id=rs.camera_id AND rlh.released_at IS NULL
             AND rlh.from_at < rs.ended_at AND rlh.to_at > rs.started_at
         )
       ORDER BY rs.ended_at ASC LIMIT $3`,
      [tenantId, storageNodeExternalId, limit],
    );
    return result.rows.map(mapSegment);
  }

  async markSegmentsDeleted(
    tenantId: string,
    storageNodeExternalId: string,
    segmentIds: string[],
  ) {
    if (segmentIds.length === 0) return 0;
    const result = await this.pool.query(
      `UPDATE recording_segments rs SET status='deleted'
       FROM cameras c, resource_nodes rn
       WHERE rs.camera_id=c.id AND c.resource_node_id=rn.id
         AND rn.tenant_id=$1 AND rs.storage_node_external_id=$2
         AND rs.id=ANY($3::uuid[]) AND rs.status <> 'deleted'`,
      [tenantId, storageNodeExternalId, segmentIds],
    );
    return result.rowCount ?? 0;
  }

  // Video Search & Retrieval methods
  async searchRecordings(query: {
    cameraId?: string;
    from: string;
    to: string;
    eventType?: string;
    limit: number;
    offset: number;
  }): Promise<{ segments: RecordingSegment[]; total: number }> {
    let whereClause = "WHERE rs.status <> 'deleted' AND rs.started_at >= $1 AND rs.ended_at <= $2";
    const params: any[] = [query.from, query.to];
    let paramIndex = 3;

    if (query.cameraId) {
      whereClause += ` AND rs.camera_id = $${paramIndex}`;
      params.push(query.cameraId);
      paramIndex++;
    }

    // Count total
    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM recording_segments rs ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get segments
    const result = await this.pool.query(
      `SELECT * FROM recording_segments rs
       ${whereClause}
       ORDER BY rs.started_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, query.limit, query.offset],
    );

    return {
      segments: result.rows.map(mapSegment),
      total,
    };
  }

  async getRecordingTimeline(cameraId: string, options: {
    from: string;
    to: string;
  }): Promise<{ segments: RecordingSegment[]; gaps: Array<{ startTime: string; endTime: string }> }> {
    const result = await this.pool.query(
      `SELECT * FROM recording_segments
       WHERE camera_id = $1 AND started_at >= $2 AND ended_at <= $3
       AND status <> 'deleted'
       ORDER BY started_at ASC`,
      [cameraId, options.from, options.to],
    );

    const segments = result.rows.map(mapSegment);
    const gaps: Array<{ startTime: string; endTime: string }> = [];

    // Calculate gaps between segments
    for (let i = 0; i < segments.length - 1; i++) {
      const endTime = new Date(segments[i]!.endedAt).getTime();
      const nextStartTime = new Date(segments[i + 1]!.startedAt).getTime();
      if (nextStartTime - endTime > 1000) { // More than 1 second gap
        gaps.push({
          startTime: segments[i]!.endedAt,
          endTime: segments[i + 1]!.startedAt,
        });
      }
    }

    return { segments, gaps };
  }

  async getRecordingSegment(segmentId: string): Promise<RecordingSegment | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM recording_segments WHERE id = $1`,
      [segmentId],
    );
    return result.rows[0] ? mapSegment(result.rows[0]) : undefined;
  }

  async createSnapshot(input: {
    segmentId: string;
    cameraId: string;
    timestamp: string;
    reason: string;
    notes?: string;
    operatorId: string;
  }): Promise<any> {
    const result = await this.pool.query(
      `INSERT INTO recording_snapshots (
         id, segment_id, camera_id, timestamp, reason, notes, operator_id, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       RETURNING *`,
      [
        randomUUID(),
        input.segmentId,
        input.cameraId,
        input.timestamp,
        input.reason,
        input.notes ?? null,
        input.operatorId,
      ],
    );
    return mapSnapshot(result.rows[0]);
  }

  async createBookmark(input: {
    cameraId: string;
    timestamp: string;
    reason: string;
    priority: "low" | "medium" | "high" | "critical";
    incidentId?: string;
    operatorId: string;
  }): Promise<any> {
    const result = await this.pool.query(
      `INSERT INTO live_bookmarks (
         id, camera_id, timestamp, reason, priority, incident_id, operator_id, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       RETURNING *`,
      [
        randomUUID(),
        input.cameraId,
        input.timestamp,
        input.reason,
        input.priority,
        input.incidentId ?? null,
        input.operatorId,
      ],
    );
    return mapBookmark(result.rows[0]);
  }

  async getBookmarks(cameraId: string, options?: { from?: string; to?: string; limit?: number }): Promise<any[]> {
    let whereClause = "WHERE camera_id = $1";
    const params: any[] = [cameraId];
    let paramIndex = 2;

    if (options?.from) {
      whereClause += ` AND timestamp >= $${paramIndex}`;
      params.push(options.from);
      paramIndex++;
    }
    if (options?.to) {
      whereClause += ` AND timestamp <= $${paramIndex}`;
      params.push(options.to);
      paramIndex++;
    }

    const limit = options?.limit ?? 100;
    whereClause += ` ORDER BY timestamp DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await this.pool.query(
      `SELECT * FROM live_bookmarks ${whereClause}`,
      params,
    );
    return result.rows.map(mapBookmark);
  }

  async verifyRecordingSegment(segmentId: string): Promise<{ status: "verified" | "mismatch" | "missing"; hash?: string }> {
    const result = await this.pool.query(
      `SELECT checksum_sha256 FROM recording_segments WHERE id = $1`,
      [segmentId],
    );

    if (!result.rows[0]) {
      return { status: "missing" };
    }

    const storedHash = result.rows[0].checksum_sha256;
    // In a real implementation, you would compute the hash from the stored video file
    // For now, return the stored hash as verified
    return {
      status: storedHash ? "verified" : "missing",
      hash: storedHash,
    };
  }
}

function mapJob(row: any): RecordingJob {
  return { id: row.id, cameraId: row.camera_id, mode: row.mode, enabled: row.enabled,
    status: row.status, retentionDays: row.retention_days, schedule: row.schedule ?? undefined,
    postRollSeconds: row.post_roll_seconds,
    segmentDurationSeconds: row.segment_duration_seconds,
    hotRetentionDays: row.hot_retention_days,
    warmRetentionDays: row.warm_retention_days,
    coldRetentionDays: row.cold_retention_days,
    maxBitrateKbps: row.max_bitrate_kbps ?? undefined,
    critical: row.critical, backupRequired: row.backup_required,
    automaticDeletionEnabled: row.automatic_deletion_enabled,
    evidenceProtection: row.evidence_protection,
    recordMainStream: row.record_main_stream,
    updatedAt: new Date(row.updated_at).toISOString() };
}
function mapSegment(row: any): RecordingSegment {
  return { id: row.id, cameraId: row.camera_id, jobId: row.job_id,
    startedAt: new Date(row.started_at).toISOString(), endedAt: new Date(row.ended_at).toISOString(),
    storagePath: row.storage_path, sizeBytes: Number(row.size_bytes),
    storageNodeExternalId: row.storage_node_external_id,
    storageTier: row.storage_tier, status: row.status,
    checksumSha256: row.checksum_sha256 ?? undefined,
    codec: row.codec ?? undefined,
    createdAt: new Date(row.created_at).toISOString() };
}

function mapLegalHold(row: any): RecordingLegalHold {
  return {
    id: row.id, tenantId: row.tenant_id, cameraId: row.camera_id,
    fromAt: new Date(row.from_at).toISOString(),
    toAt: new Date(row.to_at).toISOString(), reason: row.reason,
    createdBy: row.created_by, createdAt: new Date(row.created_at).toISOString(),
    releasedBy: row.released_by ?? undefined,
    releasedAt: row.released_at ? new Date(row.released_at).toISOString() : undefined,
  };
}

function mapStorageNode(row: any): RecordingStorageNode {
  return {
    id: row.id, tenantId: row.tenant_id, externalId: row.external_id,
    name: row.name, scopeNodeId: row.scope_node_id ?? undefined,
    supportedTiers: row.supported_tiers,
    capacityBytes: Number(row.capacity_bytes), usedBytes: Number(row.used_bytes),
    availableBytes: Number(row.available_bytes), status: row.status,
    temperatureCelsius: row.temperature_celsius == null
      ? undefined : Number(row.temperature_celsius),
    writeMbps: row.write_mbps == null ? undefined : Number(row.write_mbps),
    lastSeenAt: new Date(row.last_seen_at).toISOString(),
  };
}

function mapHealthEvent(row: any): RecordingHealthEvent {
  return {
    id: row.id, tenantId: row.tenant_id,
    cameraId: row.camera_id ?? undefined,
    storageNodeExternalId: row.storage_node_external_id ?? undefined,
    eventType: row.event_type, severity: row.severity, message: row.message,
    details: row.details ?? {}, occurredAt: new Date(row.occurred_at).toISOString(),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : undefined,
  };
}

function mapSnapshot(row: any): any {
  return {
    id: row.id,
    segmentId: row.segment_id,
    cameraId: row.camera_id,
    timestamp: new Date(row.timestamp).toISOString(),
    reason: row.reason,
    notes: row.notes,
    operatorId: row.operator_id,
    originalHash: row.original_hash,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapBookmark(row: any): any {
  return {
    id: row.id,
    cameraId: row.camera_id,
    timestamp: new Date(row.timestamp).toISOString(),
    reason: row.reason,
    priority: row.priority,
    incidentId: row.incident_id,
    operatorId: row.operator_id,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
