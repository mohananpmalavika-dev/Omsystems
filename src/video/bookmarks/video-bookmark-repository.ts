import { randomUUID, createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type {
  BookmarkMetrics,
  BookmarkPriority,
  CreateBookmarkInput,
  ListBookmarksQuery,
  UpdateBookmarkInput,
  VideoBookmarkIncidentAssociation,
  VideoTimelineBookmark,
} from './types.js';

export class VideoBookmarkRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Create a new video timeline bookmark with optional incident association.
   */
  async createBookmark(
    tenantId: string,
    operatorId: string,
    input: CreateBookmarkInput
  ): Promise<VideoTimelineBookmark> {
    const bookmarkId = randomUUID();
    const timestampDate = new Date(input.timestamp);
    const timestampIso = timestampDate.toISOString();
    const tags = input.tags || [];
    const metadata = input.metadata || {};

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const insertResult = await client.query(
        `INSERT INTO live_bookmarks (
          id, tenant_id, camera_id, operator_id, bookmarked_at, timestamp,
          title, notes, reason, priority, tags, incident_id,
          recording_segment_id, snapshot_reference, evidence_case_id,
          frame_offset_ms, metadata, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, $14, $15,
          $16, $17, now(), now()
        )
        RETURNING *`,
        [
          bookmarkId,
          tenantId,
          input.cameraId,
          operatorId,
          timestampIso,
          timestampIso,
          input.title,
          input.notes ?? null,
          input.reason,
          input.priority,
          tags,
          input.incidentId ?? null,
          input.recordingSegmentId ?? null,
          input.snapshotReference ?? null,
          input.evidenceCaseId ?? null,
          input.frameOffsetMs ?? null,
          JSON.stringify(metadata),
        ]
      );

      const row = insertResult.rows[0];

      // If initial incident specified, insert junction record
      if (input.incidentId) {
        await client.query(
          `INSERT INTO video_bookmark_incident_associations (
            bookmark_id, tenant_id, incident_id, incident_table,
            associated_by, association_notes, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, now())
          ON CONFLICT (bookmark_id, incident_id) DO NOTHING`,
          [
            bookmarkId,
            tenantId,
            input.incidentId,
            input.incidentTable || 'incidents',
            operatorId,
            input.associationNotes ?? null,
          ]
        );
      }

      // Record audit log
      await client.query(
        `INSERT INTO video_bookmark_audit_logs (
          bookmark_id, tenant_id, operator_id, action, details, created_at
        ) VALUES ($1, $2, $3, 'created', $4, now())`,
        [
          bookmarkId,
          tenantId,
          operatorId,
          JSON.stringify({
            title: input.title,
            priority: input.priority,
            reason: input.reason,
            timestamp: timestampIso,
            incidentId: input.incidentId,
          }),
        ]
      );

      await client.query('COMMIT');

      const created = await this.getBookmarkById(bookmarkId, tenantId, client);
      if (!created) {
        return this.mapBookmarkRow(row, []);
      }
      return created;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get single bookmark by ID with joined details and incident associations.
   */
  async getBookmarkById(
    id: string,
    tenantId: string,
    existingClient?: any
  ): Promise<VideoTimelineBookmark | null> {
    const querier = existingClient || this.pool;

    const result = await querier.query(
      `SELECT b.*,
              c.name AS camera_name,
              u.name AS operator_name
       FROM live_bookmarks b
       LEFT JOIN cameras c ON c.id = b.camera_id
       LEFT JOIN users u ON u.id = b.operator_id
       WHERE b.id = $1 AND b.tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) return null;

    const associations = await this.getIncidentAssociationsForBookmarks([id], tenantId, querier);
    return this.mapBookmarkRow(result.rows[0], associations.get(id) || []);
  }

  /**
   * List bookmarks with rich multi-criteria filtering and pagination.
   */
  async listBookmarks(
    tenantId: string,
    query: ListBookmarksQuery
  ): Promise<{ bookmarks: VideoTimelineBookmark[]; total: number }> {
    const conditions: string[] = ['b.tenant_id = $1'];
    const params: any[] = [tenantId];
    let paramIdx = 2;

    if (query.cameraId) {
      conditions.push(`b.camera_id = $${paramIdx}`);
      params.push(query.cameraId);
      paramIdx++;
    } else if (query.cameraIds) {
      const cids = Array.isArray(query.cameraIds) ? query.cameraIds : [query.cameraIds];
      if (cids.length > 0) {
        conditions.push(`b.camera_id = ANY($${paramIdx}::uuid[])`);
        params.push(cids);
        paramIdx++;
      }
    }

    if (query.priority) {
      conditions.push(`b.priority = $${paramIdx}`);
      params.push(query.priority);
      paramIdx++;
    }

    if (query.reason) {
      conditions.push(`b.reason = $${paramIdx}`);
      params.push(query.reason);
      paramIdx++;
    }

    if (query.from) {
      conditions.push(`(b.bookmarked_at >= $${paramIdx}::timestamptz OR b.timestamp >= $${paramIdx}::timestamptz)`);
      params.push(query.from);
      paramIdx++;
    }

    if (query.to) {
      conditions.push(`(b.bookmarked_at <= $${paramIdx}::timestamptz OR b.timestamp <= $${paramIdx}::timestamptz)`);
      params.push(query.to);
      paramIdx++;
    }

    if (query.tags) {
      const tagList = Array.isArray(query.tags) ? query.tags : [query.tags];
      if (tagList.length > 0) {
        conditions.push(`b.tags && $${paramIdx}::text[]`);
        params.push(tagList);
        paramIdx++;
      }
    }

    if (query.operatorId) {
      conditions.push(`b.operator_id = $${paramIdx}`);
      params.push(query.operatorId);
      paramIdx++;
    }

    if (query.reviewStatus) {
      conditions.push(`b.review_status = $${paramIdx}`);
      params.push(query.reviewStatus);
      paramIdx++;
    }

    if (query.verifiedOnly === true) {
      conditions.push(`b.verified_at IS NOT NULL`);
    }

    if (query.incidentId) {
      conditions.push(
        `(b.incident_id = $${paramIdx} OR EXISTS (
          SELECT 1 FROM video_bookmark_incident_associations a
          WHERE a.bookmark_id = b.id AND a.incident_id = $${paramIdx}
        ))`
      );
      params.push(query.incidentId);
      paramIdx++;
    } else if (query.hasIncident === true) {
      conditions.push(
        `(b.incident_id IS NOT NULL OR EXISTS (
          SELECT 1 FROM video_bookmark_incident_associations a
          WHERE a.bookmark_id = b.id
        ))`
      );
    } else if (query.hasIncident === false) {
      conditions.push(
        `(b.incident_id IS NULL AND NOT EXISTS (
          SELECT 1 FROM video_bookmark_incident_associations a
          WHERE a.bookmark_id = b.id
        ))`
      );
    }

    if (query.search && query.search.trim().length > 0) {
      const searchWildcard = `%${query.search.trim()}%`;
      conditions.push(
        `(b.title ILIKE $${paramIdx} OR b.notes ILIKE $${paramIdx} OR EXISTS (
          SELECT 1 FROM unnest(b.tags) t WHERE t ILIKE $${paramIdx}
        ))`
      );
      params.push(searchWildcard);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    // Total count
    const countRes = await this.pool.query(
      `SELECT COUNT(*) AS total FROM live_bookmarks b WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    // Sorting column
    let orderCol = 'COALESCE(b.timestamp, b.bookmarked_at)';
    if (query.sortBy === 'priority') {
      orderCol = `CASE b.priority 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        WHEN 'low' THEN 4 
        ELSE 5 END`;
    } else if (query.sortBy === 'created_at') {
      orderCol = 'b.created_at';
    } else if (query.sortBy === 'title') {
      orderCol = 'b.title';
    }

    const orderDir = query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const dataQuery = `
      SELECT b.*,
             c.name AS camera_name,
             u.name AS operator_name
      FROM live_bookmarks b
      LEFT JOIN cameras c ON c.id = b.camera_id
      LEFT JOIN users u ON u.id = b.operator_id
      WHERE ${whereClause}
      ORDER BY ${orderCol} ${orderDir}
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;

    const dataRes = await this.pool.query(dataQuery, [...params, query.limit, query.offset]);
    const bookmarkIds = dataRes.rows.map((r) => r.id);
    const associationsMap = await this.getIncidentAssociationsForBookmarks(bookmarkIds, tenantId);

    const bookmarks = dataRes.rows.map((row) =>
      this.mapBookmarkRow(row, associationsMap.get(row.id) || [])
    );

    return { bookmarks, total };
  }

  /**
   * Update an existing bookmark's title, notes, priority, tags, reason, or review status.
   */
  async updateBookmark(
    id: string,
    tenantId: string,
    operatorId: string,
    input: UpdateBookmarkInput
  ): Promise<VideoTimelineBookmark | null> {
    const existing = await this.getBookmarkById(id, tenantId);
    if (!existing) return null;

    const setClauses: string[] = ['updated_at = now()'];
    const params: any[] = [id, tenantId];
    let idx = 3;

    if (input.title !== undefined) {
      setClauses.push(`title = $${idx++}`);
      params.push(input.title);
    }
    if (input.notes !== undefined) {
      setClauses.push(`notes = $${idx++}`);
      params.push(input.notes);
    }
    if (input.priority !== undefined) {
      setClauses.push(`priority = $${idx++}`);
      params.push(input.priority);
    }
    if (input.reason !== undefined) {
      setClauses.push(`reason = $${idx++}`);
      params.push(input.reason);
    }
    if (input.tags !== undefined) {
      setClauses.push(`tags = $${idx++}`);
      params.push(input.tags);
    }
    if (input.reviewStatus !== undefined) {
      setClauses.push(`review_status = $${idx++}`);
      params.push(input.reviewStatus);
      setClauses.push(`reviewed_by = $${idx++}`);
      params.push(operatorId);
      setClauses.push(`reviewed_at = now()`);
    }
    if (input.metadata !== undefined) {
      setClauses.push(`metadata = $${idx++}`);
      params.push(JSON.stringify(input.metadata));
    }

    const updateQuery = `
      UPDATE live_bookmarks
      SET ${setClauses.join(', ')}
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `;

    await this.pool.query(updateQuery, params);

    // Audit log
    await this.pool.query(
      `INSERT INTO video_bookmark_audit_logs (
        bookmark_id, tenant_id, operator_id, action, details, created_at
      ) VALUES ($1, $2, $3, 'updated', $4, now())`,
      [id, tenantId, operatorId, JSON.stringify(input)]
    );

    return this.getBookmarkById(id, tenantId);
  }

  /**
   * Delete a video timeline bookmark.
   */
  async deleteBookmark(id: string, tenantId: string, operatorId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `DELETE FROM live_bookmarks WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return false;
      }

      await client.query(
        `INSERT INTO video_bookmark_audit_logs (
          bookmark_id, tenant_id, operator_id, action, details, created_at
        ) VALUES ($1, $2, $3, 'deleted', $4, now())`,
        [id, tenantId, operatorId, JSON.stringify({ deletedAt: new Date().toISOString() })]
      );

      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Associate an incident with a bookmark.
   */
  async associateIncident(
    bookmarkId: string,
    tenantId: string,
    incidentId: string,
    incidentTable: 'incidents' | 'live_incidents',
    operatorId: string,
    notes?: string
  ): Promise<VideoBookmarkIncidentAssociation> {
    const id = randomUUID();

    const result = await this.pool.query(
      `INSERT INTO video_bookmark_incident_associations (
        id, bookmark_id, tenant_id, incident_id, incident_table,
        associated_by, association_notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
      ON CONFLICT (bookmark_id, incident_id) 
      DO UPDATE SET association_notes = COALESCE(EXCLUDED.association_notes, video_bookmark_incident_associations.association_notes)
      RETURNING *`,
      [id, bookmarkId, tenantId, incidentId, incidentTable, operatorId, notes ?? null]
    );

    // Update primary incident_id on live_bookmarks if not set
    await this.pool.query(
      `UPDATE live_bookmarks
       SET incident_id = COALESCE(incident_id, $2), updated_at = now()
       WHERE id = $1 AND tenant_id = $3`,
      [bookmarkId, incidentId, tenantId]
    );

    // Audit log
    await this.pool.query(
      `INSERT INTO video_bookmark_audit_logs (
        bookmark_id, tenant_id, operator_id, action, details, created_at
      ) VALUES ($1, $2, $3, 'incident_associated', $4, now())`,
      [
        bookmarkId,
        tenantId,
        operatorId,
        JSON.stringify({ incidentId, incidentTable, notes }),
      ]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      bookmarkId: row.bookmark_id,
      incidentId: row.incident_id,
      incidentTable: row.incident_table,
      associatedBy: row.associated_by,
      associationNotes: row.association_notes ?? undefined,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  /**
   * Disassociate an incident from a bookmark.
   */
  async disassociateIncident(
    bookmarkId: string,
    tenantId: string,
    incidentId: string,
    operatorId: string
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const del = await client.query(
        `DELETE FROM video_bookmark_incident_associations
         WHERE bookmark_id = $1 AND incident_id = $2 AND tenant_id = $3
         RETURNING id`,
        [bookmarkId, incidentId, tenantId]
      );

      // If this was primary incident_id, swap with another or set null
      await client.query(
        `UPDATE live_bookmarks
         SET incident_id = (
           SELECT incident_id FROM video_bookmark_incident_associations
           WHERE bookmark_id = $1 LIMIT 1
         ),
         updated_at = now()
         WHERE id = $1 AND tenant_id = $2 AND incident_id = $3`,
        [bookmarkId, tenantId, incidentId]
      );

      // Audit log
      await client.query(
        `INSERT INTO video_bookmark_audit_logs (
          bookmark_id, tenant_id, operator_id, action, details, created_at
        ) VALUES ($1, $2, $3, 'incident_disassociated', $4, now())`,
        [bookmarkId, tenantId, operatorId, JSON.stringify({ incidentId })]
      );

      await client.query('COMMIT');
      return del.rows.length > 0;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * List all bookmarks tagged or associated with a given incident.
   */
  async getBookmarksForIncident(
    incidentId: string,
    tenantId: string
  ): Promise<VideoTimelineBookmark[]> {
    const result = await this.pool.query(
      `SELECT b.*,
              c.name AS camera_name,
              u.name AS operator_name
       FROM live_bookmarks b
       LEFT JOIN cameras c ON c.id = b.camera_id
       LEFT JOIN users u ON u.id = b.operator_id
       WHERE b.tenant_id = $1
         AND (b.incident_id = $2 OR EXISTS (
           SELECT 1 FROM video_bookmark_incident_associations a
           WHERE a.bookmark_id = b.id AND a.incident_id = $2
         ))
       ORDER BY COALESCE(b.timestamp, b.bookmarked_at) ASC`,
      [tenantId, incidentId]
    );

    const bookmarkIds = result.rows.map((r) => r.id);
    const associationsMap = await this.getIncidentAssociationsForBookmarks(bookmarkIds, tenantId);

    return result.rows.map((row) =>
      this.mapBookmarkRow(row, associationsMap.get(row.id) || [])
    );
  }

  /**
   * Verify bookmark for legal hold or evidence admissibility.
   */
  async verifyBookmark(
    bookmarkId: string,
    tenantId: string,
    verifiedBy: string
  ): Promise<VideoTimelineBookmark | null> {
    const result = await this.pool.query(
      `UPDATE live_bookmarks
       SET verified_by = $3,
           verified_at = now(),
           review_status = 'approved',
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [bookmarkId, tenantId, verifiedBy]
    );

    if (result.rows.length === 0) return null;

    await this.pool.query(
      `INSERT INTO video_bookmark_audit_logs (
        bookmark_id, tenant_id, operator_id, action, details, created_at
      ) VALUES ($1, $2, $3, 'verified', $4, now())`,
      [bookmarkId, tenantId, verifiedBy, JSON.stringify({ verifiedAt: new Date().toISOString() })]
    );

    return this.getBookmarkById(bookmarkId, tenantId);
  }

  /**
   * Increment export count for chain of custody and tracking.
   */
  async incrementExportCount(bookmarkId: string, tenantId: string): Promise<void> {
    await this.pool.query(
      `UPDATE live_bookmarks
       SET export_count = export_count + 1,
           last_accessed_at = now(),
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [bookmarkId, tenantId]
    );
  }

  /**
   * Get telemetry metrics for bookmarks within tenant.
   */
  async getBookmarkMetrics(tenantId: string, cameraId?: string): Promise<BookmarkMetrics> {
    const conditions = ['tenant_id = $1'];
    const params: any[] = [tenantId];

    if (cameraId) {
      conditions.push('camera_id = $2');
      params.push(cameraId);
    }

    const where = conditions.join(' AND ');

    const result = await this.pool.query(
      `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE priority = 'critical') AS critical,
        COUNT(*) FILTER (WHERE priority = 'high') AS high,
        COUNT(*) FILTER (WHERE priority = 'medium') AS medium,
        COUNT(*) FILTER (WHERE priority = 'low') AS low,
        COUNT(*) FILTER (WHERE incident_id IS NOT NULL OR EXISTS (
          SELECT 1 FROM video_bookmark_incident_associations a WHERE a.bookmark_id = live_bookmarks.id
        )) AS incident_linked,
        COUNT(*) FILTER (WHERE verified_at IS NOT NULL) AS verified,
        COUNT(*) FILTER (WHERE created_at >= now() - interval '24 hours') AS recent
       FROM live_bookmarks
       WHERE ${where}`,
      params
    );

    const row = result.rows[0] || {};
    const total = parseInt(row.total || '0', 10);
    const incidentLinked = parseInt(row.incident_linked || '0', 10);

    return {
      total,
      critical: parseInt(row.critical || '0', 10),
      high: parseInt(row.high || '0', 10),
      medium: parseInt(row.medium || '0', 10),
      low: parseInt(row.low || '0', 10),
      incidentLinkedCount: incidentLinked,
      unlinkedCount: Math.max(0, total - incidentLinked),
      verifiedCount: parseInt(row.verified || '0', 10),
      recentCount: parseInt(row.recent || '0', 10),
    };
  }

  /**
   * Export bookmarks with evidentiary cryptographic SHA-256 hash.
   */
  async exportBookmarks(
    tenantId: string,
    query: ListBookmarksQuery
  ): Promise<{ data: VideoTimelineBookmark[]; sha256: string; exportedAt: string }> {
    const { bookmarks } = await this.listBookmarks(tenantId, { ...query, limit: 1000, offset: 0 });
    const exportedAt = new Date().toISOString();

    for (const b of bookmarks) {
      await this.incrementExportCount(b.id, tenantId);
    }

    const payload = JSON.stringify({ bookmarks, exportedAt, tenantId });
    const sha256 = createHash('sha256').update(payload).digest('hex');

    return { data: bookmarks, sha256, exportedAt };
  }

  /**
   * Batch fetch incident associations for a list of bookmark IDs.
   */
  private async getIncidentAssociationsForBookmarks(
    bookmarkIds: string[],
    tenantId: string,
    querier: any = this.pool
  ): Promise<Map<string, VideoBookmarkIncidentAssociation[]>> {
    const map = new Map<string, VideoBookmarkIncidentAssociation[]>();
    if (bookmarkIds.length === 0) return map;

    // Fetch from junction table
    const assocRes = await querier.query(
      `SELECT a.*,
              u.name AS associated_by_name,
              inc.incident_number,
              inc.title AS incident_title,
              inc.severity AS incident_severity,
              inc.status::text AS incident_status
       FROM video_bookmark_incident_associations a
       LEFT JOIN users u ON u.id = a.associated_by
       LEFT JOIN incidents inc ON inc.id = a.incident_id
       WHERE a.bookmark_id = ANY($1::uuid[]) AND a.tenant_id = $2
       ORDER BY a.created_at ASC`,
      [bookmarkIds, tenantId]
    );

    for (const row of assocRes.rows) {
      const list = map.get(row.bookmark_id) || [];
      list.push({
        id: row.id,
        bookmarkId: row.bookmark_id,
        incidentId: row.incident_id,
        incidentTable: row.incident_table,
        incidentNumber: row.incident_number ?? undefined,
        title: row.incident_title ?? undefined,
        severity: row.incident_severity ?? undefined,
        status: row.incident_status ?? undefined,
        associatedBy: row.associated_by ?? undefined,
        associatedByName: row.associated_by_name ?? undefined,
        associationNotes: row.association_notes ?? undefined,
        createdAt: new Date(row.created_at).toISOString(),
      });
      map.set(row.bookmark_id, list);
    }

    return map;
  }

  /**
   * Helper to map raw database row to VideoTimelineBookmark.
   */
  private mapBookmarkRow(
    row: any,
    associations: VideoBookmarkIncidentAssociation[]
  ): VideoTimelineBookmark {
    const rawTs = row.timestamp || row.bookmarked_at || row.created_at;
    const tsIso = new Date(rawTs).toISOString();

    let meta: Record<string, unknown> = {};
    if (row.metadata) {
      meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
    }

    return {
      id: row.id,
      tenantId: row.tenant_id,
      cameraId: row.camera_id,
      cameraName: row.camera_name ?? undefined,
      operatorId: row.operator_id,
      operatorName: row.operator_name ?? undefined,
      timestamp: tsIso,
      bookmarkedAt: new Date(row.bookmarked_at || rawTs).toISOString(),
      title: row.title || row.notes || `Bookmark ${row.id.substring(0, 8)}`,
      notes: row.notes ?? undefined,
      reason: row.reason || 'other',
      priority: (row.priority as BookmarkPriority) || 'medium',
      tags: Array.isArray(row.tags) ? row.tags : [],
      incidentId: row.incident_id ?? undefined,
      incidentAssociations: associations,
      recordingSegmentId: row.recording_segment_id ?? undefined,
      snapshotReference: row.snapshot_reference ?? undefined,
      thumbnailUrl: row.snapshot_reference ? `/v1/recordings/snapshots/${row.snapshot_reference}` : undefined,
      evidenceCaseId: row.evidence_case_id ?? undefined,
      frameOffsetMs: row.frame_offset_ms ?? undefined,
      verifiedBy: row.verified_by ?? undefined,
      verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : undefined,
      reviewStatus: row.review_status ?? 'pending',
      reviewedBy: row.reviewed_by ?? undefined,
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : undefined,
      exportCount: row.export_count || 0,
      metadata: meta,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at || row.created_at).toISOString(),
    };
  }
}
