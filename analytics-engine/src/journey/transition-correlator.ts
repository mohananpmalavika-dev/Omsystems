/**
 * Person Transition Correlator
 * 
 * Creates transitions between observations of the same global person.
 * Evaluates topology feasibility, ReID similarity, and temporal constraints.
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import type {
  PersonObservation,
  PersonTransition,
  TransitionStatus
} from './journey.types.js';
import { ObservationRepository } from './observation.repository.js';
import { CameraTopologyService } from './topology.service.js';
import { ReIdVectorRepository } from './reid-vector.repository.js';

export interface TransitionCorrelatorConfig {
  maxGapSeconds: number;  // Maximum gap to consider (default: 600 = 10 minutes)
  
  topologyWeight: number;   // Default: 0.40
  reidWeight: number;       // Default: 0.40
  temporalWeight: number;   // Default: 0.20
  
  confirmedThreshold: number;   // >= 0.92
  probableThreshold: number;    // >= 0.80
  ambiguousThreshold: number;   // >= 0.65
}

const DEFAULT_CONFIG: TransitionCorrelatorConfig = {
  maxGapSeconds: 600,
  
  topologyWeight: 0.40,
  reidWeight: 0.40,
  temporalWeight: 0.20,
  
  confirmedThreshold: 0.92,
  probableThreshold: 0.80,
  ambiguousThreshold: 0.65
};

export class PersonTransitionCorrelator {
  constructor(
    private pool: Pool,
    private observations: ObservationRepository,
    private topology: CameraTopologyService,
    private vectors: ReIdVectorRepository,
    private config: TransitionCorrelatorConfig = DEFAULT_CONFIG
  ) {}

  /**
   * Initialize transition table
   */
  async initialize(): Promise<void> {
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS person_transition (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          tenant_id UUID NOT NULL,
          branch_id UUID NOT NULL,
          global_person_id TEXT NOT NULL,
          from_observation_id UUID NOT NULL,
          to_observation_id UUID NOT NULL,
          from_camera_id UUID NOT NULL,
          to_camera_id UUID NOT NULL,
          departed_at TIMESTAMPTZ NOT NULL,
          arrived_at TIMESTAMPTZ NOT NULL,
          travel_time_ms INTEGER NOT NULL,
          reid_similarity NUMERIC(4,3),
          topology_score NUMERIC(4,3),
          temporal_score NUMERIC(4,3),
          zone_score NUMERIC(4,3),
          transition_confidence NUMERIC(4,3) NOT NULL,
          status TEXT NOT NULL,
          metadata JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          
          CONSTRAINT chk_transition_time_order CHECK (arrived_at >= departed_at),
          CONSTRAINT chk_transition_confidence CHECK (transition_confidence >= 0 AND transition_confidence <= 1),
          CONSTRAINT chk_transition_status CHECK (status IN ('CONFIRMED', 'PROBABLE', 'AMBIGUOUS', 'REJECTED'))
        )
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_transition_person_time 
        ON person_transition (tenant_id, global_person_id, departed_at DESC)
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_transition_camera_pair 
        ON person_transition (tenant_id, from_camera_id, to_camera_id)
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_transition_from_obs 
        ON person_transition (from_observation_id)
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_transition_to_obs 
        ON person_transition (to_observation_id)
      `);

      console.log('✓ Person transition correlator initialized');
    } catch (error) {
      console.error('Failed to initialize transition correlator:', error);
      throw error;
    }
  }

  /**
   * Correlate a new observation with previous observations
   */
  async correlate(current: PersonObservation): Promise<PersonTransition | null> {
    // Must have global person ID
    if (!current.globalPersonId) {
      return null;
    }

    // Find previous observation for same global person
    const previous = await this.observations.findPrevious(
      current.globalPersonId,
      current.enteredAt,
      current.tenantId
    );

    if (!previous) {
      return null; // No previous observation
    }

    // Check if gap is too large
    const gapMs = current.enteredAt.getTime() - previous.exitedAt.getTime();
    if (gapMs > this.config.maxGapSeconds * 1000) {
      return null; // Gap too large - likely different session
    }

    // Calculate scores
    const topologyScore = await this.calculateTopologyScore(previous, current);
    
    // If topology score is 0, this transition is impossible
    if (topologyScore === 0) {
      return null;
    }

    const reidSimilarity = await this.calculateReIdSimilarity(previous, current);
    const temporalScore = this.calculateTemporalScore(gapMs);
    const zoneScore = this.calculateZoneScore(previous, current);

    // Calculate overall confidence
    const transitionConfidence =
      topologyScore * this.config.topologyWeight +
      reidSimilarity * this.config.reidWeight +
      temporalScore * this.config.temporalWeight;

    // Determine status
    const status = this.determineStatus(transitionConfidence);

    // Create transition record
    const transition: PersonTransition = {
      id: randomUUID(),
      tenantId: current.tenantId,
      branchId: current.branchId,
      globalPersonId: current.globalPersonId,
      fromObservationId: previous.id,
      toObservationId: current.id,
      fromCameraId: previous.cameraId,
      toCameraId: current.cameraId,
      departedAt: previous.exitedAt,
      arrivedAt: current.enteredAt,
      travelTimeMs: gapMs,
      reidSimilarity,
      topologyScore,
      temporalScore,
      zoneScore,
      transitionConfidence,
      status,
      createdAt: new Date()
    };

    // Persist transition
    await this.persistTransition(transition);

    return transition;
  }

  /**
   * Calculate topology score
   */
  private async calculateTopologyScore(
    previous: PersonObservation,
    current: PersonObservation
  ): Promise<number> {
    const travelTimeMs = current.enteredAt.getTime() - previous.exitedAt.getTime();

    return await this.topology.scoreTransition({
      fromCameraId: previous.cameraId,
      toCameraId: current.cameraId,
      fromExitZone: previous.exitZoneId,
      toEntryZone: current.entryZoneId,
      travelTimeMs,
      tenantId: current.tenantId
    } as any);
  }

  /**
   * Calculate ReID similarity
   */
  private async calculateReIdSimilarity(
    previous: PersonObservation,
    current: PersonObservation
  ): Promise<number> {
    if (!previous.representativeEmbeddingId || !current.representativeEmbeddingId) {
      return 0.5; // Unknown - neutral score
    }

    try {
      return await this.vectors.compareSimilarity(
        previous.representativeEmbeddingId,
        current.representativeEmbeddingId
      );
    } catch (error) {
      console.error('Failed to compare embeddings:', error);
      return 0.5; // Error - neutral score
    }
  }

  /**
   * Calculate temporal score
   */
  private calculateTemporalScore(travelTimeMs: number): number {
    const travelSeconds = travelTimeMs / 1000;

    // Immediate (< 5 seconds) - perfect
    if (travelSeconds < 5) {
      return 1.0;
    }

    // Very recent (5-30 seconds) - excellent
    if (travelSeconds < 30) {
      return 0.95;
    }

    // Recent (30-120 seconds) - good
    if (travelSeconds < 120) {
      return 0.9 - (travelSeconds - 30) / 900;
    }

    // Moderate (2-5 minutes) - acceptable
    if (travelSeconds < 300) {
      return 0.8 - (travelSeconds - 120) / 450;
    }

    // Older (5-10 minutes) - lower confidence
    const excessSeconds = travelSeconds - 300;
    return Math.max(0.3, 0.6 * Math.exp(-excessSeconds / 300));
  }

  /**
   * Calculate zone matching score
   */
  private calculateZoneScore(
    previous: PersonObservation,
    current: PersonObservation
  ): number {
    // If no zone information, return neutral
    if (!previous.exitZoneId || !current.entryZoneId) {
      return 0.5;
    }

    // Perfect zone match gets high score
    // This would ideally check against topology rules
    // For now, assume zones match if both are present
    return 0.8;
  }

  /**
   * Determine transition status
   */
  private determineStatus(confidence: number): TransitionStatus {
    if (confidence >= this.config.confirmedThreshold) {
      return 'CONFIRMED';
    }
    if (confidence >= this.config.probableThreshold) {
      return 'PROBABLE';
    }
    if (confidence >= this.config.ambiguousThreshold) {
      return 'AMBIGUOUS';
    }
    return 'REJECTED';
  }

  /**
   * Persist transition to database
   */
  private async persistTransition(transition: PersonTransition): Promise<void> {
    await this.pool.query(
      `INSERT INTO person_transition (
        id, tenant_id, branch_id, global_person_id,
        from_observation_id, to_observation_id,
        from_camera_id, to_camera_id,
        departed_at, arrived_at, travel_time_ms,
        reid_similarity, topology_score, temporal_score, zone_score,
        transition_confidence, status
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4,
        $5::uuid, $6::uuid,
        $7::uuid, $8::uuid,
        $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17
      )`,
      [
        transition.id,
        transition.tenantId,
        transition.branchId,
        transition.globalPersonId,
        transition.fromObservationId,
        transition.toObservationId,
        transition.fromCameraId,
        transition.toCameraId,
        transition.departedAt,
        transition.arrivedAt,
        transition.travelTimeMs,
        transition.reidSimilarity,
        transition.topologyScore,
        transition.temporalScore,
        transition.zoneScore,
        transition.transitionConfidence,
        transition.status
      ]
    );
  }

  /**
   * Get transitions for a global person
   */
  async findByGlobalPerson(
    tenantId: string,
    globalPersonId: string,
    from?: Date,
    to?: Date
  ): Promise<PersonTransition[]> {
    const conditions: string[] = [
      'tenant_id = $1::uuid',
      'global_person_id = $2'
    ];
    const params: any[] = [tenantId, globalPersonId];
    let paramIndex = 3;

    if (from) {
      conditions.push(`departed_at >= $${paramIndex}`);
      params.push(from);
      paramIndex++;
    }

    if (to) {
      conditions.push(`departed_at <= $${paramIndex}`);
      params.push(to);
      paramIndex++;
    }

    const result = await this.pool.query(
      `SELECT * FROM person_transition
       WHERE ${conditions.join(' AND ')}
       ORDER BY departed_at ASC`,
      params
    );

    return result.rows.map(row => this.mapRowToTransition(row));
  }

  /**
   * Get transition analytics
   */
  async getAnalytics(
    tenantId: string,
    branchId?: string
  ): Promise<Array<{
    fromCameraId: string;
    toCameraId: string;
    count: number;
    avgTravelTimeMs: number;
    medianTravelTimeMs: number;
    p95TravelTimeMs: number;
    avgConfidence: number;
  }>> {
    const branchCondition = branchId ? 'AND branch_id = $2::uuid' : '';
    const params = branchId ? [tenantId, branchId] : [tenantId];

    const result = await this.pool.query(
      `SELECT
        from_camera_id,
        to_camera_id,
        COUNT(*) as count,
        AVG(travel_time_ms) as avg_travel_time_ms,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY travel_time_ms) as median_travel_time_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY travel_time_ms) as p95_travel_time_ms,
        AVG(transition_confidence) as avg_confidence
       FROM person_transition
       WHERE tenant_id = $1::uuid ${branchCondition}
         AND status IN ('CONFIRMED', 'PROBABLE')
       GROUP BY from_camera_id, to_camera_id
       HAVING COUNT(*) >= 5
       ORDER BY count DESC`,
      params
    );

    return result.rows.map(row => ({
      fromCameraId: row.from_camera_id,
      toCameraId: row.to_camera_id,
      count: parseInt(row.count),
      avgTravelTimeMs: parseFloat(row.avg_travel_time_ms),
      medianTravelTimeMs: parseFloat(row.median_travel_time_ms),
      p95TravelTimeMs: parseFloat(row.p95_travel_time_ms),
      avgConfidence: parseFloat(row.avg_confidence)
    }));
  }

  /**
   * Map database row to PersonTransition
   */
  private mapRowToTransition(row: any): PersonTransition {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      globalPersonId: row.global_person_id,
      fromObservationId: row.from_observation_id,
      toObservationId: row.to_observation_id,
      fromCameraId: row.from_camera_id,
      toCameraId: row.to_camera_id,
      departedAt: new Date(row.departed_at),
      arrivedAt: new Date(row.arrived_at),
      travelTimeMs: parseInt(row.travel_time_ms),
      reidSimilarity: row.reid_similarity ? parseFloat(row.reid_similarity) : undefined,
      topologyScore: row.topology_score ? parseFloat(row.topology_score) : undefined,
      temporalScore: row.temporal_score ? parseFloat(row.temporal_score) : undefined,
      zoneScore: row.zone_score ? parseFloat(row.zone_score) : undefined,
      transitionConfidence: parseFloat(row.transition_confidence),
      status: row.status as TransitionStatus,
      metadata: row.metadata,
      createdAt: new Date(row.created_at)
    };
  }
}

/**
 * Global singleton
 */
let transitionCorrelatorInstance: PersonTransitionCorrelator | null = null;

/**
 * Get or create transition correlator
 */
export function getPersonTransitionCorrelator(
  pool: Pool,
  observations: ObservationRepository,
  topology: CameraTopologyService,
  vectors: ReIdVectorRepository,
  config?: Partial<TransitionCorrelatorConfig>
): PersonTransitionCorrelator {
  if (!transitionCorrelatorInstance) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    transitionCorrelatorInstance = new PersonTransitionCorrelator(
      pool,
      observations,
      topology,
      vectors,
      finalConfig
    );
  }
  return transitionCorrelatorInstance;
}
