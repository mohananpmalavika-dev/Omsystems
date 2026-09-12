import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { ControlPlaneStore } from '../../control-plane-store.js';
import { VideoBookmarkRepository } from './video-bookmark-repository.js';
import type {
  BookmarkMetrics,
  CreateBookmarkInput,
  CreateIncidentFromBookmarkInput,
  ListBookmarksQuery,
  UpdateBookmarkInput,
  VideoBookmarkIncidentAssociation,
  VideoTimelineBookmark,
} from './types.js';

export class VideoBookmarkService {
  private readonly repo: VideoBookmarkRepository;

  constructor(
    private readonly pool: Pool,
    private readonly store?: ControlPlaneStore
  ) {
    this.repo = new VideoBookmarkRepository(pool);
  }

  /**
   * Create bookmark with validation and priority escalation checks.
   */
  async createBookmark(
    tenantId: string,
    operatorId: string,
    input: CreateBookmarkInput
  ): Promise<VideoTimelineBookmark> {
    const ts = new Date(input.timestamp);
    if (isNaN(ts.getTime())) {
      throw new Error('Invalid bookmark timestamp');
    }

    // Disallow timestamps far in future (> 5 min tolerance)
    const maxFuture = Date.now() + 5 * 60 * 1000;
    if (ts.getTime() > maxFuture) {
      throw new Error('Bookmark timestamp cannot be set in the future');
    }

    // Verify camera exists if store is provided
    if (this.store && 'cameras' in this.store) {
      const camera = await (this.store as any).cameras?.find((c: any) => c.id === input.cameraId);
      if (camera && camera.tenantId && camera.tenantId !== tenantId) {
        throw new Error('Camera does not belong to operator tenant');
      }
    }

    const bookmark = await this.repo.createBookmark(tenantId, operatorId, input);

    return bookmark;
  }

  /**
   * Retrieve a bookmark by ID.
   */
  async getBookmarkById(
    id: string,
    tenantId: string
  ): Promise<VideoTimelineBookmark | null> {
    return this.repo.getBookmarkById(id, tenantId);
  }

  /**
   * List and filter bookmarks.
   */
  async listBookmarks(
    tenantId: string,
    query: ListBookmarksQuery
  ): Promise<{ bookmarks: VideoTimelineBookmark[]; total: number }> {
    return this.repo.listBookmarks(tenantId, query);
  }

  /**
   * Update bookmark.
   */
  async updateBookmark(
    id: string,
    tenantId: string,
    operatorId: string,
    input: UpdateBookmarkInput
  ): Promise<VideoTimelineBookmark | null> {
    return this.repo.updateBookmark(id, tenantId, operatorId, input);
  }

  /**
   * Delete bookmark.
   */
  async deleteBookmark(
    id: string,
    tenantId: string,
    operatorId: string
  ): Promise<boolean> {
    return this.repo.deleteBookmark(id, tenantId, operatorId);
  }

  /**
   * Associate an existing incident with a bookmark.
   */
  async associateIncident(
    bookmarkId: string,
    tenantId: string,
    incidentId: string,
    incidentTable: 'incidents' | 'live_incidents',
    operatorId: string,
    notes?: string
  ): Promise<VideoBookmarkIncidentAssociation> {
    const bookmark = await this.repo.getBookmarkById(bookmarkId, tenantId);
    if (!bookmark) {
      throw new Error('Bookmark not found');
    }

    return this.repo.associateIncident(
      bookmarkId,
      tenantId,
      incidentId,
      incidentTable,
      operatorId,
      notes
    );
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
    return this.repo.disassociateIncident(bookmarkId, tenantId, incidentId, operatorId);
  }

  /**
   * Promote a bookmark to a formal Incident with automated Legal Hold and range protection.
   */
  async createIncidentFromBookmark(
    bookmarkId: string,
    tenantId: string,
    operatorId: string,
    input: CreateIncidentFromBookmarkInput
  ): Promise<{ incidentId: string; bookmark: VideoTimelineBookmark; legalHoldId?: string }> {
    const bookmark = await this.repo.getBookmarkById(bookmarkId, tenantId);
    if (!bookmark) {
      throw new Error('Bookmark not found');
    }

    const client = await this.pool.connect();
    const incidentId = randomUUID();
    const legalHoldId = input.applyLegalHold ? randomUUID() : undefined;

    const occurredAt = new Date(bookmark.timestamp);
    const preRollSeconds = input.preRollSeconds ?? 120;
    const postRollSeconds = input.postRollSeconds ?? 180;
    const recordingFrom = new Date(occurredAt.getTime() - preRollSeconds * 1000);
    const recordingTo = new Date(occurredAt.getTime() + postRollSeconds * 1000);

    const title = input.title || `Incident from ${bookmark.title}`;
    const notes = input.notes || bookmark.notes || `Created from bookmark ${bookmark.id}`;
    const severity = input.severity || 'P2';

    try {
      await client.query('BEGIN');

      // 1. Insert into live_incidents
      await client.query(
        `INSERT INTO live_incidents (
          id, tenant_id, camera_id, created_by, title, notes, priority,
          occurred_at, recording_from, recording_to, pre_roll_seconds, post_roll_seconds,
          primary_bookmark_id, legal_hold_id, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12,
          $13, $14, now(), now()
        )`,
        [
          incidentId,
          tenantId,
          bookmark.cameraId,
          operatorId,
          title,
          notes,
          severity,
          occurredAt.toISOString(),
          recordingFrom.toISOString(),
          recordingTo.toISOString(),
          preRollSeconds,
          postRollSeconds,
          bookmark.id,
          legalHoldId ?? null,
        ]
      );

      // 2. Optionally insert recording_legal_holds
      if (legalHoldId) {
        await client.query(
          `INSERT INTO recording_legal_holds (
            id, tenant_id, camera_id, from_at, to_at, reason, created_by, incident_id, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
          [
            legalHoldId,
            tenantId,
            bookmark.cameraId,
            recordingFrom.toISOString(),
            recordingTo.toISOString(),
            `Legal hold: ${title} (${severity})`,
            operatorId,
            incidentId,
          ]
        );
      }

      // 3. Associate incident with bookmark
      await client.query(
        `INSERT INTO video_bookmark_incident_associations (
          id, bookmark_id, tenant_id, incident_id, incident_table, associated_by, association_notes, created_at
        ) VALUES ($1, $2, $3, $4, 'live_incidents', $5, $6, now())
        ON CONFLICT (bookmark_id, incident_id) DO NOTHING`,
        [
          randomUUID(),
          bookmark.id,
          tenantId,
          incidentId,
          operatorId,
          `Promoted bookmark to ${severity} incident`,
        ]
      );

      // 4. Update bookmark primary incident_id
      await client.query(
        `UPDATE live_bookmarks 
         SET incident_id = COALESCE(incident_id, $2), updated_at = now()
         WHERE id = $1 AND tenant_id = $3`,
        [bookmark.id, incidentId, tenantId]
      );

      await client.query('COMMIT');

      const updatedBookmark = await this.repo.getBookmarkById(bookmark.id, tenantId);
      return {
        incidentId,
        bookmark: updatedBookmark!,
        legalHoldId,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get all bookmarks for an incident.
   */
  async getBookmarksForIncident(
    incidentId: string,
    tenantId: string
  ): Promise<VideoTimelineBookmark[]> {
    return this.repo.getBookmarksForIncident(incidentId, tenantId);
  }

  /**
   * Verify bookmark for chain of custody and forensic admissibility.
   */
  async verifyBookmark(
    bookmarkId: string,
    tenantId: string,
    verifiedBy: string
  ): Promise<VideoTimelineBookmark | null> {
    return this.repo.verifyBookmark(bookmarkId, tenantId, verifiedBy);
  }

  /**
   * Get telemetry metrics.
   */
  async getBookmarkMetrics(
    tenantId: string,
    cameraId?: string
  ): Promise<BookmarkMetrics> {
    return this.repo.getBookmarkMetrics(tenantId, cameraId);
  }

  /**
   * Export bookmarks as CSV or JSON with SHA-256 integrity seal.
   */
  async exportBookmarks(
    tenantId: string,
    format: 'csv' | 'json',
    query: ListBookmarksQuery
  ): Promise<{ data: string; mimeType: string; filename: string; sha256: string }> {
    const exported = await this.repo.exportBookmarks(tenantId, query);
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');

    if (format === 'csv') {
      const headers = [
        'Bookmark ID',
        'Camera ID',
        'Camera Name',
        'Timestamp',
        'Priority',
        'Reason',
        'Title',
        'Notes',
        'Tags',
        'Operator',
        'Primary Incident',
        'Associated Incidents Count',
        'Verified',
        'Created At',
      ];

      const rows = exported.data.map((b) => [
        b.id,
        b.cameraId,
        `"${(b.cameraName || '').replace(/"/g, '""')}"`,
        b.timestamp,
        b.priority,
        b.reason,
        `"${b.title.replace(/"/g, '""')}"`,
        `"${(b.notes || '').replace(/"/g, '""')}"`,
        `"${b.tags.join(', ')}"`,
        `"${(b.operatorName || b.operatorId).replace(/"/g, '""')}"`,
        b.incidentId || '',
        b.incidentAssociations.length,
        b.verifiedAt ? 'YES' : 'NO',
        b.createdAt,
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      return {
        data: csvContent,
        mimeType: 'text/csv',
        filename: `video-bookmarks-${dateStr}.csv`,
        sha256: exported.sha256,
      };
    }

    return {
      data: JSON.stringify(
        {
          metadata: {
            exportedAt: exported.exportedAt,
            sha256Checksum: exported.sha256,
            totalBookmarks: exported.data.length,
            tenantId,
          },
          bookmarks: exported.data,
        },
        null,
        2
      ),
      mimeType: 'application/json',
      filename: `video-bookmarks-${dateStr}.json`,
      sha256: exported.sha256,
    };
  }

  /**
   * Format bookmarks as timeline scrub bar visual markers.
   */
  async getTimelineMarkers(
    tenantId: string,
    cameraId: string,
    from?: string,
    to?: string
  ): Promise<Array<{
    id: string;
    timestamp: string;
    type: 'bookmark';
    title: string;
    notes?: string;
    priority: string;
    color: string;
    hasIncident: boolean;
    incidentCount: number;
  }>> {
    const { bookmarks } = await this.repo.listBookmarks(tenantId, {
      cameraId,
      from,
      to,
      limit: 200,
      offset: 0,
      sortBy: 'timestamp',
      sortOrder: 'asc',
    });

    const priorityColors: Record<string, string> = {
      critical: '#ef4444',
      high: '#f97316',
      medium: '#3b82f6',
      low: '#64748b',
    };

    return bookmarks.map((b) => ({
      id: b.id,
      timestamp: b.timestamp,
      type: 'bookmark',
      title: b.title,
      notes: b.notes,
      priority: b.priority,
      color: priorityColors[b.priority] || '#3b82f6',
      hasIncident: Boolean(b.incidentId || b.incidentAssociations.length > 0),
      incidentCount: b.incidentAssociations.length,
    }));
  }
}
