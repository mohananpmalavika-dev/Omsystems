/**
 * Person Observation Repository
 * 
 * Handles persistence and querying of person observations (tracks on individual cameras).
 * Uses PostgreSQL with proper indexing and tenant isolation.
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import type {
  PersonObservation,
  NewPersonObservation,
  AssociationMethod
} from './journey.types.js';

export interface ObservationQueryOptions {
  tenantId: string;
  globalPersonId?: string;
  branchId?: string;
  cameraId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export class ObservationRepository {
  constructor(private pool: Pool) {}

  /**
   * Initialize database tables
   */
  async initialize(): Promise<void> {
    try {
      // Create person_observation table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS person_observation (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          tenant_id UUID NOT NULL,
          branch_id UUID NOT NULL,
          global_person_id TEXT,
          camera_id UUID NOT NULL,
          track_id TEXT NOT NULL,
          entered_at TIMESTAMPTZ NOT NULL,
          exited_at TIMESTAMPTZ NOT NULL,
          representative_embedding_id UUID,
          detection_confidence NUMERIC(4,3) NOT NULL,
          embedding_quality NUMERIC(4,3),
          identity_confidence NUMERIC(4,3),
          entry_zone_id TEXT,
          exit_zone_id TEXT,
          first_frame_id TEXT,
          last_frame_id TEXT,
          thumbnail_uri TEXT,
          association_method TEXT NOT NULL DEFAULT 'UNKNOWN',
          model_version TEXT,
          metadata JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          
          CONSTRAINT chk_confidence_range CHECK (
            detection_confidence >= 0 AND detection_confidence <= 1 AND
            (embedding_quality IS NULL OR (embedding_quality >= 0 AND embedding_quality <= 1)) AND
            (identity_confidence IS NULL OR (identity_confidence >= 0 AND identity_confidence <= 1))
          ),
          CONSTRAINT chk_time_order CHECK (exited_at >= entered_at)
        )
      `);

      // Create indexes for efficient queries
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_person_obs_global_time 
        ON person_observation (tenant_id, global_person_id, entered_at DESC)
        WHERE global_person_id IS NOT NULL
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_person_obs_camera_time 
        ON person_observation (tenant_id, camera_id, entered_at DESC)
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_person_obs_branch_time 
        ON person_observation (tenant_id, branch_id, entered_at DESC)
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_person_obs_track 
        ON person_observation (tenant_id, camera_id, track_id)
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_person_obs_unresolved 
        ON person_observation (tenant_id, created_at DESC)
        WHERE global_person_id IS NULL
      `);

      console.log('✓ Person observation repository initialized');
    } catch (error) {
      console.error('Failed to initialize observation repository:', error);
      throw error;
    }
  }

  /**
   * Create a new observation from a completed track
   */
  async create(observation: NewPersonObservation): Promise<PersonObservation> {
    const id = randomUUID();
    
    const result = await this.pool.query(
      `INSERT INTO person_observation (
        id, tenant_id, branch_id, camera_id, track_id,
        entered_at, exited_at,
        detection_confidence, embedding_quality,
        entry_zone_id, exit_zone_id,
        thumbnail_uri, association_method,
        metadata
      ) VALUES (
        $1, $2::uuid, $3::uuid, $4::uuid, $5,
        $6, $7,
        $8, $9,
        $10, $11,
        $12, $13,
        $14
      ) RETURNING *`,
      [
        id,
        observation.tenantId,
        observation.branchId,
        observation.cameraId,
        observation.trackId,
        observation.enteredAt,
        observation.exitedAt,
        observation.detectionConfidence,
        observation.embeddingQuality,
        observation.entryZoneId,
        observation.exitZoneId,
        observation.thumbnailUri,
        'UNKNOWN', // Will be updated after identity resolution
        observation.metadata ? JSON.stringify(observation.metadata) : null
      ]
    );

    return this.mapRowToObservation(result.rows[0]);
  }

  /**
   * Assign global identity to an observation
   */
  async assignGlobalIdentity(
    observationId: string,
    globalPersonId: string,
    identityConfidence: number,
    associationMethod: AssociationMethod
  ): Promise<void> {
    await this.pool.query(
      `UPDATE person_observation
       SET global_person_id = $2,
           identity_confidence = $3,
           association_method = $4
       WHERE id = $1::uuid`,
      [observationId, globalPersonId, identityConfidence, associationMethod]
    );
  }

  /**
   * Link observation to embedding
   */
  async linkEmbedding(observationId: string, embeddingId: string): Promise<void> {
    await this.pool.query(
      `UPDATE person_observation
       SET representative_embedding_id = $2::uuid
       WHERE id = $1::uuid`,
      [observationId, embeddingId]
    );
  }

  /**
   * Find observation by ID
   */
  async findById(id: string): Promise<PersonObservation | null> {
    const result = await this.pool.query(
      `SELECT * FROM person_observation WHERE id = $1::uuid`,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToObservation(result.rows[0]);
  }

  /**
   * Find observations by global person ID
   */
  async findByGlobalPerson(options: ObservationQueryOptions): Promise<PersonObservation[]> {
    if (!options.globalPersonId) {
      throw new Error('globalPersonId is required');
    }

    const conditions: string[] = ['tenant_id = $1::uuid', 'global_person_id = $2'];
    const params: any[] = [options.tenantId, options.globalPersonId];
    let paramIndex = 3;

    if (options.branchId) {
      conditions.push(`branch_id = $${paramIndex}::uuid`);
      params.push(options.branchId);
      paramIndex++;
    }

    if (options.from) {
      conditions.push(`entered_at >= $${paramIndex}`);
      params.push(options.from);
      paramIndex++;
    }

    if (options.to) {
      conditions.push(`entered_at <= $${paramIndex}`);
      params.push(options.to);
      paramIndex++;
    }

    const limit = options.limit || 100;
    const offset = options.offset || 0;

    const result = await this.pool.query(
      `SELECT * FROM person_observation
       WHERE ${conditions.join(' AND ')}
       ORDER BY entered_at ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    return result.rows.map(row => this.mapRowToObservation(row));
  }

  /**
   * Find previous observation for a global person (for transition correlation)
   */
  async findPrevious(
    globalPersonId: string,
    beforeTime: Date,
    tenantId: string
  ): Promise<PersonObservation | null> {
    const result = await this.pool.query(
      `SELECT * FROM person_observation
       WHERE tenant_id = $1::uuid
         AND global_person_id = $2
         AND exited_at < $3
       ORDER BY exited_at DESC
       LIMIT 1`,
      [tenantId, globalPersonId, beforeTime]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToObservation(result.rows[0]);
  }

  /**
   * Find observations by camera within time range
   */
  async findByCameraAndTime(
    tenantId: string,
    cameraId: string,
    from: Date,
    to: Date,
    limit: number = 100
  ): Promise<PersonObservation[]> {
    const result = await this.pool.query(
      `SELECT * FROM person_observation
       WHERE tenant_id = $1::uuid
         AND camera_id = $2::uuid
         AND entered_at >= $3
         AND entered_at <= $4
       ORDER BY entered_at ASC
       LIMIT $5`,
      [tenantId, cameraId, from, to, limit]
    );

    return result.rows.map(row => this.mapRowToObservation(row));
  }

  /**
   * Find recent observations for candidate matching (constrained search)
   */
  async findRecentCandidates(
    tenantId: string,
    branchId: string,
    reachableCameraIds: string[],
    withinSeconds: number
  ): Promise<PersonObservation[]> {
    if (reachableCameraIds.length === 0) {
      return [];
    }

    const cutoffTime = new Date(Date.now() - withinSeconds * 1000);

    const result = await this.pool.query(
      `SELECT * FROM person_observation
       WHERE tenant_id = $1::uuid
         AND branch_id = $2::uuid
         AND camera_id = ANY($3::uuid[])
         AND exited_at >= $4
         AND global_person_id IS NOT NULL
       ORDER BY exited_at DESC
       LIMIT 50`,
      [tenantId, branchId, reachableCameraIds, cutoffTime]
    );

    return result.rows.map(row => this.mapRowToObservation(row));
  }

  /**
   * Find unresolved observations (no global identity assigned)
   */
  async findUnresolved(
    tenantId: string,
    limit: number = 100
  ): Promise<PersonObservation[]> {
    const result = await this.pool.query(
      `SELECT * FROM person_observation
       WHERE tenant_id = $1::uuid
         AND global_person_id IS NULL
       ORDER BY created_at DESC
       LIMIT $2`,
      [tenantId, limit]
    );

    return result.rows.map(row => this.mapRowToObservation(row));
  }

  /**
   * Update observation metadata
   */
  async updateMetadata(
    observationId: string,
    metadata: Record<string, any>
  ): Promise<void> {
    await this.pool.query(
      `UPDATE person_observation
       SET metadata = $2::jsonb
       WHERE id = $1::uuid`,
      [observationId, JSON.stringify(metadata)]
    );
  }

  /**
   * Get observation count by global person
   */
  async countByGlobalPerson(
    tenantId: string,
    globalPersonId: string
  ): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) as count
       FROM person_observation
       WHERE tenant_id = $1::uuid
         AND global_person_id = $2`,
      [tenantId, globalPersonId]
    );

    return parseInt(result.rows[0]?.count || '0');
  }

  /**
   * Get observations with dwell time analysis
   */
  async findWithDwellTime(
    tenantId: string,
    minDwellSeconds: number,
    from?: Date,
    to?: Date
  ): Promise<Array<PersonObservation & { dwellTimeMs: number }>> {
    const conditions: string[] = [
      'tenant_id = $1::uuid',
      `EXTRACT(EPOCH FROM (exited_at - entered_at)) >= $2`
    ];
    const params: any[] = [tenantId, minDwellSeconds];
    let paramIndex = 3;

    if (from) {
      conditions.push(`entered_at >= $${paramIndex}`);
      params.push(from);
      paramIndex++;
    }

    if (to) {
      conditions.push(`entered_at <= $${paramIndex}`);
      params.push(to);
      paramIndex++;
    }

    const result = await this.pool.query(
      `SELECT *,
        EXTRACT(EPOCH FROM (exited_at - entered_at)) * 1000 as dwell_time_ms
       FROM person_observation
       WHERE ${conditions.join(' AND ')}
       ORDER BY dwell_time_ms DESC
       LIMIT 100`,
      params
    );

    return result.rows.map(row => ({
      ...this.mapRowToObservation(row),
      dwellTimeMs: parseFloat(row.dwell_time_ms)
    }));
  }

  /**
   * Delete old observations (for retention policy)
   */
  async deleteOlderThan(
    tenantId: string,
    olderThanDays: number
  ): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM person_observation
       WHERE tenant_id = $1::uuid
         AND created_at < NOW() - INTERVAL '${olderThanDays} days'`,
      [tenantId]
    );

    return result.rowCount || 0;
  }

  /**
   * Get statistics
   */
  async getStatistics(tenantId: string, branchId?: string): Promise<{
    totalObservations: number;
    resolvedObservations: number;
    unresolvedObservations: number;
    uniquePersons: number;
    averageConfidence: number;
  }> {
    const branchCondition = branchId ? 'AND branch_id = $2::uuid' : '';
    const params = branchId ? [tenantId, branchId] : [tenantId];

    const result = await this.pool.query(
      `SELECT
        COUNT(*) as total,
        COUNT(global_person_id) as resolved,
        COUNT(*) FILTER (WHERE global_person_id IS NULL) as unresolved,
        COUNT(DISTINCT global_person_id) as unique_persons,
        AVG(identity_confidence) as avg_confidence
       FROM person_observation
       WHERE tenant_id = $1::uuid ${branchCondition}`,
      params
    );

    const row = result.rows[0] || {};

    return {
      totalObservations: parseInt(row.total || '0'),
      resolvedObservations: parseInt(row.resolved || '0'),
      unresolvedObservations: parseInt(row.unresolved || '0'),
      uniquePersons: parseInt(row.unique_persons || '0'),
      averageConfidence: parseFloat(row.avg_confidence || '0')
    };
  }

  /**
   * Map database row to PersonObservation
   */
  private mapRowToObservation(row: any): PersonObservation {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      globalPersonId: row.global_person_id,
      cameraId: row.camera_id,
      trackId: row.track_id,
      enteredAt: new Date(row.entered_at),
      exitedAt: new Date(row.exited_at),
      representativeEmbeddingId: row.representative_embedding_id,
      detectionConfidence: parseFloat(row.detection_confidence),
      embeddingQuality: row.embedding_quality ? parseFloat(row.embedding_quality) : undefined,
      identityConfidence: row.identity_confidence ? parseFloat(row.identity_confidence) : undefined,
      entryZoneId: row.entry_zone_id,
      exitZoneId: row.exit_zone_id,
      firstFrameId: row.first_frame_id,
      lastFrameId: row.last_frame_id,
      thumbnailUri: row.thumbnail_uri,
      associationMethod: row.association_method as AssociationMethod,
      modelVersion: row.model_version,
      metadata: row.metadata,
      createdAt: new Date(row.created_at)
    };
  }
}

/**
 * Global singleton
 */
let observationRepositoryInstance: ObservationRepository | null = null;

/**
 * Get or create observation repository
 */
export function getObservationRepository(pool: Pool): ObservationRepository {
  if (!observationRepositoryInstance) {
    observationRepositoryInstance = new ObservationRepository(pool);
  }
  return observationRepositoryInstance;
}
