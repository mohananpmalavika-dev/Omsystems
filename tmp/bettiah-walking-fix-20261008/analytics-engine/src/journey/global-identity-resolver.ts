/**
 * Global Identity Resolver
 * 
 * Core identity matching logic that combines:
 * - ReID embedding similarity
 * - Camera topology feasibility
 * - Temporal constraints
 * - Observation quality
 * 
 * Does NOT match on embedding similarity alone - uses multi-factor scoring.
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import type {
  PersonObservation,
  IdentityResolution,
  CandidateObservation,
  AssociationMethod
} from './journey.types.js';
import { ObservationRepository } from './observation.repository.js';
import { CameraTopologyService } from './topology.service.js';
import { ReIdVectorRepository } from './reid-vector.repository.js';
import { EmbeddingService } from './embedding.service.js';

export interface IdentityResolverConfig {
  reidWeight: number;          // Default: 0.55
  temporalWeight: number;      // Default: 0.20
  topologyWeight: number;      // Default: 0.20
  qualityWeight: number;       // Default: 0.05
  
  confirmedThreshold: number;  // >= 0.92
  probableThreshold: number;   // >= 0.80
  ambiguousThreshold: number;  // >= 0.65
  
  maxCandidates: number;       // Default: 20
  searchWindowSeconds: number; // Default: 120 (2 minutes)
}

const DEFAULT_CONFIG: IdentityResolverConfig = {
  reidWeight: 0.55,
  temporalWeight: 0.20,
  topologyWeight: 0.20,
  qualityWeight: 0.05,
  
  confirmedThreshold: 0.92,
  probableThreshold: 0.80,
  ambiguousThreshold: 0.65,
  
  maxCandidates: 20,
  searchWindowSeconds: 120
};

export class GlobalIdentityResolver {
  constructor(
    private pool: Pool,
    private observations: ObservationRepository,
    private topology: CameraTopologyService,
    private vectors: ReIdVectorRepository,
    private config: IdentityResolverConfig = DEFAULT_CONFIG
  ) {}

  /**
   * Initialize global person table
   */
  async initialize(): Promise<void> {
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS global_person (
          id TEXT PRIMARY KEY,
          tenant_id UUID NOT NULL,
          branch_id UUID,
          known_identity_id TEXT,
          first_seen_at TIMESTAMPTZ NOT NULL,
          last_seen_at TIMESTAMPTZ NOT NULL,
          confidence NUMERIC(4,3) NOT NULL,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          merged_into_id TEXT,
          metadata JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          
          CONSTRAINT chk_confidence_range CHECK (confidence >= 0 AND confidence <= 1),
          CONSTRAINT chk_status CHECK (status IN ('ACTIVE', 'MERGED', 'SPLIT', 'ARCHIVED'))
        )
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_global_person_tenant 
        ON global_person (tenant_id, last_seen_at DESC)
        WHERE status = 'ACTIVE'
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_global_person_known_identity 
        ON global_person (tenant_id, known_identity_id)
        WHERE known_identity_id IS NOT NULL
      `);

      console.log('✓ Global identity resolver initialized');
    } catch (error) {
      console.error('Failed to initialize global identity resolver:', error);
      throw error;
    }
  }

  /**
   * Resolve global identity for a new observation
   */
  async resolve(observation: PersonObservation): Promise<IdentityResolution> {
    // 1. Get embedding for this observation
    const embeddingRecord = await this.vectors.getByObservation(observation.id);
    if (!embeddingRecord) {
      // No embedding available - create new identity
      return await this.createNewIdentity(observation, 0.5, 'UNKNOWN');
    }

    // 2. Get reachable cameras from topology
    const reachableCameras = await this.topology.getReachableCameras(
      observation.tenantId,
      observation.cameraId,
      this.config.searchWindowSeconds
    );

    // Always include same camera (for track continuations)
    if (!reachableCameras.includes(observation.cameraId)) {
      reachableCameras.push(observation.cameraId);
    }

    // 3. Find recent candidate observations
    const recentObservations = reachableCameras.length > 0
      ? await this.observations.findRecentCandidates(
          observation.tenantId,
          observation.branchId,
          reachableCameras,
          this.config.searchWindowSeconds
        )
      : [];

    if (recentObservations.length === 0) {
      // No candidates - create new identity
      return await this.createNewIdentity(observation, 0.9, 'REID');
    }

    // 4. Score each candidate
    const candidates = await this.scoreCandidates(
      observation,
      embeddingRecord.embedding,
      embeddingRecord.modelVersion,
      recentObservations
    );

    if (candidates.length === 0) {
      // No viable candidates - create new identity
      return await this.createNewIdentity(observation, 0.85, 'REID');
    }

    // 5. Sort by total score
    candidates.sort((a, b) => b.totalScore - a.totalScore);

    const best = candidates[0];

    // 6. Decide based on threshold
    if (best.totalScore >= this.config.confirmedThreshold) {
      return {
        globalPersonId: best.globalPersonId,
        isNewIdentity: false,
        confidence: best.totalScore,
        matchedObservationId: best.observationId,
        method: this.determineAssociationMethod(best)
      };
    }

    if (best.totalScore >= this.config.probableThreshold) {
      return {
        globalPersonId: best.globalPersonId,
        isNewIdentity: false,
        confidence: best.totalScore,
        matchedObservationId: best.observationId,
        method: this.determineAssociationMethod(best)
      };
    }

    // Score too low - create new identity
    return await this.createNewIdentity(observation, 0.8, 'REID');
  }

  /**
   * Score all candidate observations
   */
  private async scoreCandidates(
    current: PersonObservation,
    currentEmbedding: Float32Array,
    modelVersion: string,
    candidates: PersonObservation[]
  ): Promise<CandidateObservation[]> {
    const scored: CandidateObservation[] = [];

    for (const candidate of candidates) {
      // Skip if no global person ID
      if (!candidate.globalPersonId) {
        continue;
      }

      // Get candidate embedding
      const candidateEmbedding = await this.vectors.getByObservation(candidate.id);
      if (!candidateEmbedding) {
        continue;
      }

      // Check model compatibility
      if (candidateEmbedding.modelVersion !== modelVersion) {
        continue; // Skip incompatible models
      }

      // Calculate ReID similarity
      const reidScore = EmbeddingService.cosineSimilarity(
        currentEmbedding,
        candidateEmbedding.embedding
      );

      if (reidScore < 0.5) {
        continue; // Too dissimilar
      }

      // Calculate temporal score
      const travelTimeMs = current.enteredAt.getTime() - candidate.exitedAt.getTime();
      
      if (travelTimeMs < 0) {
        continue; // Candidate is from the future!
      }

      const temporalScore = this.calculateTemporalScore(travelTimeMs);

      // Calculate topology score
      const topologyScore = await this.topology.scoreTransition({
        fromCameraId: candidate.cameraId,
        toCameraId: current.cameraId,
        fromExitZone: candidate.exitZoneId,
        toEntryZone: current.entryZoneId,
        travelTimeMs,
        tenantId: current.tenantId
      } as any);

      // Quality score (average of both observations)
      const qualityScore = (
        (candidate.embeddingQuality || 0.5) +
        (current.embeddingQuality || 0.5)
      ) / 2;

      // Calculate total weighted score
      const totalScore =
        reidScore * this.config.reidWeight +
        temporalScore * this.config.temporalWeight +
        topologyScore * this.config.topologyWeight +
        qualityScore * this.config.qualityWeight;

      scored.push({
        observationId: candidate.id,
        globalPersonId: candidate.globalPersonId,
        cameraId: candidate.cameraId,
        exitedAt: candidate.exitedAt,
        embeddingId: candidateEmbedding.id,
        reidScore,
        temporalScore,
        topologyScore,
        qualityScore,
        totalScore
      });
    }

    return scored;
  }

  /**
   * Calculate temporal feasibility score
   */
  private calculateTemporalScore(travelTimeMs: number): number {
    const travelSeconds = travelTimeMs / 1000;

    // Immediate continuation (< 5 seconds) - very high score
    if (travelSeconds < 5) {
      return 1.0;
    }

    // Recent (5-30 seconds) - high score
    if (travelSeconds < 30) {
      return 0.95;
    }

    // Moderate (30-120 seconds) - good score with slight decay
    if (travelSeconds < 120) {
      return 0.9 - (travelSeconds - 30) / 900; // Linear decay from 0.9 to 0.8
    }

    // Older (120-300 seconds) - lower score
    if (travelSeconds < 300) {
      return 0.8 - (travelSeconds - 120) / 450; // Linear decay from 0.8 to 0.4
    }

    // Very old (> 5 minutes) - exponential decay
    const excessSeconds = travelSeconds - 300;
    return Math.max(0.1, 0.4 * Math.exp(-excessSeconds / 300));
  }

  /**
   * Determine association method based on scores
   */
  private determineAssociationMethod(candidate: CandidateObservation): AssociationMethod {
    // Same camera continuation
    if (candidate.cameraId === candidate.cameraId) {
      return 'LOCAL_TRACK';
    }

    // Strong topology contribution
    if (candidate.topologyScore > 0.8 && candidate.reidScore > 0.7) {
      return 'TOPOLOGY_REID';
    }

    // Primarily ReID-based
    return 'REID';
  }

  /**
   * Create new global identity
   */
  private async createNewIdentity(
    observation: PersonObservation,
    confidence: number,
    method: AssociationMethod
  ): Promise<IdentityResolution> {
    const globalPersonId = `gp_${Date.now()}_${randomUUID().substring(0, 8)}`;

    await this.pool.query(
      `INSERT INTO global_person (
        id, tenant_id, branch_id,
        first_seen_at, last_seen_at, confidence, status
      ) VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, 'ACTIVE')`,
      [
        globalPersonId,
        observation.tenantId,
        observation.branchId,
        observation.enteredAt,
        observation.exitedAt,
        confidence
      ]
    );

    return {
      globalPersonId,
      isNewIdentity: true,
      confidence,
      method
    };
  }

  /**
   * Update global person last seen
   */
  async updateLastSeen(globalPersonId: string, lastSeenAt: Date): Promise<void> {
    await this.pool.query(
      `UPDATE global_person
       SET last_seen_at = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [globalPersonId, lastSeenAt]
    );
  }

  /**
   * Merge two global persons
   */
  async mergeGlobalPersons(
    sourcePersonId: string,
    targetPersonId: string,
    tenantId: string
  ): Promise<void> {
    // Start transaction
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Update all observations
      await client.query(
        `UPDATE person_observation
         SET global_person_id = $2
         WHERE global_person_id = $1 AND tenant_id = $3::uuid`,
        [sourcePersonId, targetPersonId, tenantId]
      );

      // Update all transitions
      await client.query(
        `UPDATE person_transition
         SET global_person_id = $2
         WHERE global_person_id = $1 AND tenant_id = $3::uuid`,
        [sourcePersonId, targetPersonId, tenantId]
      );

      // Mark source as merged
      await client.query(
        `UPDATE global_person
         SET status = 'MERGED',
             merged_into_id = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [sourcePersonId, targetPersonId]
      );

      // Update target's last seen time
      await client.query(
        `UPDATE global_person
         SET last_seen_at = GREATEST(
           last_seen_at,
           (SELECT last_seen_at FROM global_person WHERE id = $1)
         ),
         updated_at = NOW()
         WHERE id = $2`,
        [sourcePersonId, targetPersonId]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get global person by ID
   */
  async getGlobalPerson(globalPersonId: string): Promise<any | null> {
    const result = await this.pool.query(
      `SELECT * FROM global_person WHERE id = $1`,
      [globalPersonId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }
}

/**
 * Global singleton
 */
let globalIdentityResolverInstance: GlobalIdentityResolver | null = null;

/**
 * Get or create global identity resolver
 */
export function getGlobalIdentityResolver(
  pool: Pool,
  observations: ObservationRepository,
  topology: CameraTopologyService,
  vectors: ReIdVectorRepository,
  config?: Partial<IdentityResolverConfig>
): GlobalIdentityResolver {
  if (!globalIdentityResolverInstance) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    globalIdentityResolverInstance = new GlobalIdentityResolver(
      pool,
      observations,
      topology,
      vectors,
      finalConfig
    );
  }
  return globalIdentityResolverInstance;
}
