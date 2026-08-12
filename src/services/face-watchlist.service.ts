/**
 * Face Watchlist Service
 * Business logic for watchlist management
 */

import type { Pool } from 'pg';
import { FaceEnrollmentService } from '../../analytics-engine/src/face/face-enrollment.service.js';
import type { EnrollPersonInput as EngineEnrollPersonInput, EnrollmentResult as EngineEnrollmentResult } from '../../analytics-engine/src/face/face-enrollment.service.js';
import type { EnrollmentResult } from '../../analytics-engine/src/face/face.types.js';

export interface CreateWatchlistInput {
  tenantId: string;
  name: string;
  description?: string;
  listType: 'security' | 'vip' | 'staff' | 'blacklist' | 'missing-person';
  enabled?: boolean;
  alertOnMatch?: boolean;
  alertSeverity?: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  matchThreshold?: number;
  reviewThreshold?: number;
  minimumMargin?: number;
  minimumQuality?: number;
  temporalConfirmationFrames?: number;
  temporalWindowSeconds?: number;
  createdBy: string;
}

export interface UpdateWatchlistInput {
  name?: string;
  description?: string;
  enabled?: boolean;
  alertOnMatch?: boolean;
  alertSeverity?: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  matchThreshold?: number;
  reviewThreshold?: number;
  minimumMargin?: number;
  minimumQuality?: number;
  temporalConfirmationFrames?: number;
  temporalWindowSeconds?: number;
}

export interface Watchlist {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  listType: string;
  enabled: boolean;
  alertOnMatch: boolean;
  alertSeverity: string;
  matchThreshold: number;
  reviewThreshold: number;
  minimumMargin: number;
  minimumQuality: number;
  temporalConfirmationFrames: number;
  temporalWindowSeconds: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WatchlistPerson {
  id: string;
  tenantId: string;
  watchlistId: string;
  externalId?: string;
  fullName: string;
  dateOfBirth?: Date;
  gender?: string;
  notes?: string;
  metadata: Record<string, unknown>;
  enrolledBy: string;
  enrolledAt: Date;
  lastSeenAt?: Date;
  matchCount: number;
  embeddingCount: number;
}

export class FaceWatchlistService {
  constructor(
    private db: Pool,
    private enrollmentService: FaceEnrollmentService,
  ) {}

  /**
   * Create watchlist
   */
  async createWatchlist(input: CreateWatchlistInput): Promise<Watchlist> {
    const result = await this.db.query(
      `
      INSERT INTO face_watchlists (
        tenant_id, name, description, list_type,
        enabled, alert_on_match, alert_severity,
        match_threshold, review_threshold, minimum_margin, minimum_quality,
        temporal_confirmation_frames, temporal_window_seconds,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `,
      [
        input.tenantId,
        input.name,
        input.description || null,
        input.listType,
        input.enabled ?? true,
        input.alertOnMatch ?? true,
        input.alertSeverity || 'P2',
        input.matchThreshold || 0.70,
        input.reviewThreshold || 0.60,
        input.minimumMargin || 0.05,
        input.minimumQuality || 0.55,
        input.temporalConfirmationFrames || 3,
        input.temporalWindowSeconds || 2,
        input.createdBy,
      ],
    );

    return this.mapWatchlistRow(result.rows[0]);
  }

  /**
   * Get watchlist by ID
   */
  async getWatchlist(tenantId: string, watchlistId: string): Promise<Watchlist | null> {
    const result = await this.db.query(
      `
      SELECT * FROM face_watchlists
      WHERE id = $1 AND tenant_id = $2 AND archived_at IS NULL
    `,
      [watchlistId, tenantId],
    );

    return result.rows.length > 0 ? this.mapWatchlistRow(result.rows[0]) : null;
  }

  /**
   * List watchlists
   */
  async listWatchlists(
    tenantId: string,
    options?: {
      listType?: string;
      enabled?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ watchlists: Watchlist[]; total: number }> {
    let sql = `
      SELECT * FROM face_watchlists
      WHERE tenant_id = $1 AND archived_at IS NULL
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (options?.listType) {
      sql += ` AND list_type = $${paramIndex}`;
      params.push(options.listType);
      paramIndex++;
    }

    if (options?.enabled !== undefined) {
      sql += ` AND enabled = $${paramIndex}`;
      params.push(options.enabled);
      paramIndex++;
    }

    sql += ` ORDER BY created_at DESC`;

    if (options?.limit) {
      sql += ` LIMIT $${paramIndex}`;
      params.push(options.limit);
      paramIndex++;
    }

    if (options?.offset) {
      sql += ` OFFSET $${paramIndex}`;
      params.push(options.offset);
    }

    const result = await this.db.query(sql, params);

    // Get total count
    const countResult = await this.db.query(
      `
      SELECT COUNT(*) as total FROM face_watchlists
      WHERE tenant_id = $1 AND archived_at IS NULL
    `,
      [tenantId],
    );

    return {
      watchlists: result.rows.map(this.mapWatchlistRow),
      total: parseInt(countResult.rows[0].total),
    };
  }

  /**
   * Update watchlist
   */
  async updateWatchlist(
    tenantId: string,
    watchlistId: string,
    input: UpdateWatchlistInput,
  ): Promise<Watchlist> {
    const sets: string[] = [];
    const params: any[] = [watchlistId, tenantId];
    let paramIndex = 3;

    if (input.name !== undefined) {
      sets.push(`name = $${paramIndex}`);
      params.push(input.name);
      paramIndex++;
    }

    if (input.description !== undefined) {
      sets.push(`description = $${paramIndex}`);
      params.push(input.description);
      paramIndex++;
    }

    if (input.enabled !== undefined) {
      sets.push(`enabled = $${paramIndex}`);
      params.push(input.enabled);
      paramIndex++;
    }

    if (input.alertOnMatch !== undefined) {
      sets.push(`alert_on_match = $${paramIndex}`);
      params.push(input.alertOnMatch);
      paramIndex++;
    }

    if (input.alertSeverity !== undefined) {
      sets.push(`alert_severity = $${paramIndex}`);
      params.push(input.alertSeverity);
      paramIndex++;
    }

    if (input.matchThreshold !== undefined) {
      sets.push(`match_threshold = $${paramIndex}`);
      params.push(input.matchThreshold);
      paramIndex++;
    }

    if (input.reviewThreshold !== undefined) {
      sets.push(`review_threshold = $${paramIndex}`);
      params.push(input.reviewThreshold);
      paramIndex++;
    }

    if (input.minimumMargin !== undefined) {
      sets.push(`minimum_margin = $${paramIndex}`);
      params.push(input.minimumMargin);
      paramIndex++;
    }

    if (input.minimumQuality !== undefined) {
      sets.push(`minimum_quality = $${paramIndex}`);
      params.push(input.minimumQuality);
      paramIndex++;
    }

    if (input.temporalConfirmationFrames !== undefined) {
      sets.push(`temporal_confirmation_frames = $${paramIndex}`);
      params.push(input.temporalConfirmationFrames);
      paramIndex++;
    }

    if (input.temporalWindowSeconds !== undefined) {
      sets.push(`temporal_window_seconds = $${paramIndex}`);
      params.push(input.temporalWindowSeconds);
      paramIndex++;
    }

    if (sets.length === 0) {
      throw new Error('No fields to update');
    }

    sets.push('updated_at = NOW()');

    const sql = `
      UPDATE face_watchlists
      SET ${sets.join(', ')}
      WHERE id = $1 AND tenant_id = $2 AND archived_at IS NULL
      RETURNING *
    `;

    const result = await this.db.query(sql, params);

    if (result.rows.length === 0) {
      throw new Error('Watchlist not found');
    }

    return this.mapWatchlistRow(result.rows[0]);
  }

  /**
   * Delete watchlist (soft delete)
   */
  async deleteWatchlist(tenantId: string, watchlistId: string): Promise<void> {
    await this.db.query(
      `
      UPDATE face_watchlists
      SET archived_at = NOW()
      WHERE id = $1 AND tenant_id = $2
    `,
      [watchlistId, tenantId],
    );
  }

  /**
   * Get watchlist statistics
   */
  async getWatchlistStats(tenantId: string, watchlistId: string): Promise<{
    personCount: number;
    embeddingCount: number;
    matchCount: number;
    lastMatchAt?: Date;
  }> {
    const result = await this.db.query(
      `
      SELECT
        COUNT(DISTINCT fp.id) as person_count,
        COUNT(fe.id) as embedding_count,
        COALESCE(SUM(fp.match_count), 0) as match_count,
        MAX(fp.last_seen_at) as last_match_at
      FROM face_watchlist_persons fp
      LEFT JOIN face_embeddings fe ON fe.person_id = fp.id
      WHERE fp.tenant_id = $1
        AND fp.watchlist_id = $2
        AND fp.archived_at IS NULL
    `,
      [tenantId, watchlistId],
    );

    const row = result.rows[0];
    return {
      personCount: parseInt(row.person_count) || 0,
      embeddingCount: parseInt(row.embedding_count) || 0,
      matchCount: parseInt(row.match_count) || 0,
      lastMatchAt: row.last_match_at ? new Date(row.last_match_at) : undefined,
    };
  }

  /**
   * Enroll person in watchlist
   */
  async enrollPerson(input: EngineEnrollPersonInput): Promise<EnrollmentResult> {
    return this.enrollmentService.enrollPerson(input);
  }

  /**
   * Get person details
   */
  async getPerson(tenantId: string, personId: string): Promise<WatchlistPerson | null> {
    const result = await this.db.query(
      `
      SELECT
        fp.*,
        COUNT(fe.id) as embedding_count
      FROM face_watchlist_persons fp
      LEFT JOIN face_embeddings fe ON fe.person_id = fp.id
      WHERE fp.id = $1 AND fp.tenant_id = $2 AND fp.archived_at IS NULL
      GROUP BY fp.id
    `,
      [personId, tenantId],
    );

    return result.rows.length > 0 ? this.mapPersonRow(result.rows[0]) : null;
  }

  /**
   * List persons in watchlist
   */
  async listPersons(
    tenantId: string,
    watchlistId: string,
    options?: { limit?: number; offset?: number; search?: string },
  ): Promise<{ persons: WatchlistPerson[]; total: number }> {
    let sql = `
      SELECT
        fp.*,
        COUNT(fe.id) as embedding_count
      FROM face_watchlist_persons fp
      LEFT JOIN face_embeddings fe ON fe.person_id = fp.id
      WHERE fp.tenant_id = $1
        AND fp.watchlist_id = $2
        AND fp.archived_at IS NULL
    `;
    const params: any[] = [tenantId, watchlistId];
    let paramIndex = 3;

    if (options?.search) {
      sql += ` AND fp.full_name ILIKE $${paramIndex}`;
      params.push(`%${options.search}%`);
      paramIndex++;
    }

    sql += ` GROUP BY fp.id ORDER BY fp.enrolled_at DESC`;

    if (options?.limit) {
      sql += ` LIMIT $${paramIndex}`;
      params.push(options.limit);
      paramIndex++;
    }

    if (options?.offset) {
      sql += ` OFFSET $${paramIndex}`;
      params.push(options.offset);
    }

    const result = await this.db.query(sql, params);

    // Get total count
    const countResult = await this.db.query(
      `
      SELECT COUNT(*) as total FROM face_watchlist_persons
      WHERE tenant_id = $1 AND watchlist_id = $2 AND archived_at IS NULL
    `,
      [tenantId, watchlistId],
    );

    return {
      persons: result.rows.map(this.mapPersonRow),
      total: parseInt(countResult.rows[0].total),
    };
  }

  /**
   * Update person
   */
  async updatePerson(
    tenantId: string,
    personId: string,
    input: {
      fullName?: string;
      externalId?: string;
      notes?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<WatchlistPerson> {
    const sets: string[] = [];
    const params: any[] = [personId, tenantId];
    let paramIndex = 3;

    if (input.fullName !== undefined) {
      sets.push(`full_name = $${paramIndex}`);
      params.push(input.fullName);
      paramIndex++;
    }

    if (input.externalId !== undefined) {
      sets.push(`external_id = $${paramIndex}`);
      params.push(input.externalId);
      paramIndex++;
    }

    if (input.notes !== undefined) {
      sets.push(`notes = $${paramIndex}`);
      params.push(input.notes);
      paramIndex++;
    }

    if (input.metadata !== undefined) {
      sets.push(`metadata = $${paramIndex}`);
      params.push(JSON.stringify(input.metadata));
      paramIndex++;
    }

    if (sets.length === 0) {
      throw new Error('No fields to update');
    }

    const sql = `
      UPDATE face_watchlist_persons
      SET ${sets.join(', ')}
      WHERE id = $1 AND tenant_id = $2 AND archived_at IS NULL
      RETURNING *,
        (SELECT COUNT(*) FROM face_embeddings WHERE person_id = $1) as embedding_count
    `;

    const result = await this.db.query(sql, params);

    if (result.rows.length === 0) {
      throw new Error('Person not found');
    }

    return this.mapPersonRow(result.rows[0]);
  }

  /**
   * Remove person from watchlist
   */
  async removePerson(tenantId: string, personId: string, actorId: string): Promise<void> {
    await this.enrollmentService.removePerson(tenantId, personId, actorId);
  }

  /**
   * Map database row to Watchlist
   */
  private mapWatchlistRow(row: any): Watchlist {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      description: row.description,
      listType: row.list_type,
      enabled: row.enabled,
      alertOnMatch: row.alert_on_match,
      alertSeverity: row.alert_severity,
      matchThreshold: parseFloat(row.match_threshold),
      reviewThreshold: parseFloat(row.review_threshold),
      minimumMargin: parseFloat(row.minimum_margin),
      minimumQuality: parseFloat(row.minimum_quality),
      temporalConfirmationFrames: parseInt(row.temporal_confirmation_frames),
      temporalWindowSeconds: parseInt(row.temporal_window_seconds),
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Map database row to WatchlistPerson
   */
  private mapPersonRow(row: any): WatchlistPerson {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      watchlistId: row.watchlist_id,
      externalId: row.external_id,
      fullName: row.full_name,
      dateOfBirth: row.date_of_birth ? new Date(row.date_of_birth) : undefined,
      gender: row.gender,
      notes: row.notes,
      metadata: row.metadata || {},
      enrolledBy: row.enrolled_by,
      enrolledAt: new Date(row.enrolled_at),
      lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at) : undefined,
      matchCount: parseInt(row.match_count) || 0,
      embeddingCount: parseInt(row.embedding_count) || 0,
    };
  }
}
