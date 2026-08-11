/**
 * Camera Topology Service
 * 
 * Manages camera transition rules, reachability calculations, and temporal feasibility.
 * Essential for reducing false positive identity matches across cameras.
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import type {
  CameraTransitionRule,
  TopologyScoreParams,
  TemporalFeasibility
} from './journey.types.js';

export interface TopologyConfig {
  defaultMinTravelSeconds: number;
  defaultMaxTravelSeconds: number;
  enableLearning: boolean;  // Learn topology from observations
}

const DEFAULT_CONFIG: TopologyConfig = {
  defaultMinTravelSeconds: 5,
  defaultMaxTravelSeconds: 300, // 5 minutes
  enableLearning: true
};

export class CameraTopologyService {
  constructor(
    private pool: Pool,
    private config: TopologyConfig = DEFAULT_CONFIG
  ) {}

  /**
   * Initialize database tables
   */
  async initialize(): Promise<void> {
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS camera_transition_rule (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          tenant_id UUID NOT NULL,
          branch_id UUID NOT NULL,
          from_camera_id UUID NOT NULL,
          to_camera_id UUID NOT NULL,
          from_zone_id TEXT,
          to_zone_id TEXT,
          min_travel_seconds INTEGER NOT NULL,
          typical_travel_seconds INTEGER,
          max_travel_seconds INTEGER NOT NULL,
          probability NUMERIC(4,3),
          bidirectional BOOLEAN NOT NULL DEFAULT false,
          enabled BOOLEAN NOT NULL DEFAULT true,
          metadata JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          
          CONSTRAINT chk_travel_times CHECK (
            min_travel_seconds >= 0 AND
            max_travel_seconds >= min_travel_seconds AND
            (typical_travel_seconds IS NULL OR 
             (typical_travel_seconds >= min_travel_seconds AND typical_travel_seconds <= max_travel_seconds))
          ),
          CONSTRAINT chk_probability_range CHECK (
            probability IS NULL OR (probability >= 0 AND probability <= 1)
          ),
          CONSTRAINT chk_not_same_camera CHECK (from_camera_id != to_camera_id)
        )
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_camera_transition_from 
        ON camera_transition_rule (tenant_id, from_camera_id)
        WHERE enabled = true
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_camera_transition_to 
        ON camera_transition_rule (tenant_id, to_camera_id)
        WHERE enabled = true
      `);

      await this.pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_camera_transition_unique 
        ON camera_transition_rule (
          tenant_id, from_camera_id, to_camera_id,
          COALESCE(from_zone_id, ''), COALESCE(to_zone_id, '')
        )
      `);

      console.log('✓ Camera topology service initialized');
    } catch (error) {
      console.error('Failed to initialize topology service:', error);
      throw error;
    }
  }

  /**
   * Add or update a transition rule
   */
  async upsertRule(rule: Omit<CameraTransitionRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = randomUUID();

    const result = await this.pool.query(
      `INSERT INTO camera_transition_rule (
        id, tenant_id, branch_id, from_camera_id, to_camera_id,
        from_zone_id, to_zone_id,
        min_travel_seconds, typical_travel_seconds, max_travel_seconds,
        probability, bidirectional, enabled, metadata
      ) VALUES (
        $1, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
        $6, $7,
        $8, $9, $10,
        $11, $12, $13, $14
      )
      ON CONFLICT (tenant_id, from_camera_id, to_camera_id, COALESCE(from_zone_id, ''), COALESCE(to_zone_id, ''))
      DO UPDATE SET
        min_travel_seconds = EXCLUDED.min_travel_seconds,
        typical_travel_seconds = EXCLUDED.typical_travel_seconds,
        max_travel_seconds = EXCLUDED.max_travel_seconds,
        probability = EXCLUDED.probability,
        bidirectional = EXCLUDED.bidirectional,
        enabled = EXCLUDED.enabled,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING id`,
      [
        id,
        rule.tenantId,
        rule.branchId,
        rule.fromCameraId,
        rule.toCameraId,
        rule.fromZoneId,
        rule.toZoneId,
        rule.minTravelSeconds,
        rule.typicalTravelSeconds,
        rule.maxTravelSeconds,
        rule.probability,
        rule.bidirectional,
        rule.enabled,
        rule.metadata ? JSON.stringify(rule.metadata) : null
      ]
    );

    return result.rows[0].id;
  }

  /**
   * Get transition rule between two cameras
   */
  async getRule(
    tenantId: string,
    fromCameraId: string,
    toCameraId: string,
    fromZoneId?: string,
    toZoneId?: string
  ): Promise<CameraTransitionRule | null> {
    const result = await this.pool.query(
      `SELECT * FROM camera_transition_rule
       WHERE tenant_id = $1::uuid
         AND from_camera_id = $2::uuid
         AND to_camera_id = $3::uuid
         AND (from_zone_id = $4 OR (from_zone_id IS NULL AND $4 IS NULL))
         AND (to_zone_id = $5 OR (to_zone_id IS NULL AND $5 IS NULL))
         AND enabled = true`,
      [tenantId, fromCameraId, toCameraId, fromZoneId, toZoneId]
    );

    if (result.rows.length === 0) {
      // Try without zone matching
      const fallback = await this.pool.query(
        `SELECT * FROM camera_transition_rule
         WHERE tenant_id = $1::uuid
           AND from_camera_id = $2::uuid
           AND to_camera_id = $3::uuid
           AND from_zone_id IS NULL
           AND to_zone_id IS NULL
           AND enabled = true`,
        [tenantId, fromCameraId, toCameraId]
      );

      if (fallback.rows.length === 0) {
        return null;
      }

      return this.mapRowToRule(fallback.rows[0]);
    }

    return this.mapRowToRule(result.rows[0]);
  }

  /**
   * Get all reachable cameras from a source camera within time window
   */
  async getReachableCameras(
    tenantId: string,
    fromCameraId: string,
    maxTravelSeconds: number
  ): Promise<string[]> {
    const result = await this.pool.query(
      `SELECT DISTINCT to_camera_id
       FROM camera_transition_rule
       WHERE tenant_id = $1::uuid
         AND from_camera_id = $2::uuid
         AND max_travel_seconds <= $3
         AND enabled = true
       
       UNION
       
       SELECT DISTINCT from_camera_id
       FROM camera_transition_rule
       WHERE tenant_id = $1::uuid
         AND to_camera_id = $2::uuid
         AND max_travel_seconds <= $3
         AND bidirectional = true
         AND enabled = true`,
      [tenantId, fromCameraId, maxTravelSeconds]
    );

    return result.rows.map(row => row.to_camera_id || row.from_camera_id);
  }

  /**
   * Score a transition based on topology rules
   */
  async scoreTransition(params: TopologyScoreParams): Promise<number> {
    const rule = await this.getRule(
      // Assuming tenant/branch are in params metadata or need to be passed
      (params as any).tenantId,
      params.fromCameraId,
      params.toCameraId,
      params.fromExitZone,
      params.toEntryZone
    );

    if (!rule) {
      // No rule defined - use defaults
      const travelSeconds = params.travelTimeMs / 1000;
      
      if (travelSeconds < this.config.defaultMinTravelSeconds) {
        return 0; // Impossible - too fast
      }
      
      if (travelSeconds > this.config.defaultMaxTravelSeconds) {
        return 0.1; // Very unlikely - too slow
      }
      
      // No rule, but within default bounds - neutral score
      return 0.5;
    }

    const travelSeconds = params.travelTimeMs / 1000;

    // Check if within bounds
    if (travelSeconds < rule.minTravelSeconds) {
      return 0; // Impossible
    }

    if (travelSeconds > rule.maxTravelSeconds) {
      // Beyond max - exponential decay
      const excess = travelSeconds - rule.maxTravelSeconds;
      const decayRate = 0.1; // Adjust as needed
      return Math.max(0, 0.3 * Math.exp(-decayRate * excess));
    }

    // Within bounds - score based on distance from typical
    if (rule.typicalTravelSeconds) {
      const deviation = Math.abs(travelSeconds - rule.typicalTravelSeconds);
      const range = rule.maxTravelSeconds - rule.minTravelSeconds;
      const normalizedDeviation = deviation / range;
      
      // Gaussian-like scoring: peak at typical, decay towards edges
      const score = Math.exp(-2 * normalizedDeviation * normalizedDeviation);
      
      // Factor in rule probability if available
      if (rule.probability) {
        return score * rule.probability;
      }
      
      return score;
    }

    // No typical time - linear scoring within range
    const range = rule.maxTravelSeconds - rule.minTravelSeconds;
    const relativePosition = (travelSeconds - rule.minTravelSeconds) / range;
    
    // Peak in middle, decay toward edges
    const score = 1 - Math.abs(0.5 - relativePosition);
    
    if (rule.probability) {
      return score * rule.probability;
    }
    
    return score;
  }

  /**
   * Check temporal feasibility
   */
  async checkTemporalFeasibility(
    tenantId: string,
    fromCameraId: string,
    toCameraId: string,
    travelTimeMs: number,
    fromExitZone?: string,
    toEntryZone?: string
  ): Promise<TemporalFeasibility> {
    const score = await this.scoreTransition({
      fromCameraId,
      toCameraId,
      fromExitZone,
      toEntryZone,
      travelTimeMs,
      tenantId
    } as any);

    if (score === 0) {
      return {
        feasible: false,
        score: 0,
        reason: 'Travel time outside acceptable range'
      };
    }

    if (score < 0.3) {
      return {
        feasible: false,
        score,
        reason: 'Travel time unlikely based on topology'
      };
    }

    return {
      feasible: true,
      score
    };
  }

  /**
   * Learn topology from observed transitions (for auto-tuning)
   */
  async learnFromObservations(
    tenantId: string,
    branchId: string,
    minSamples: number = 10
  ): Promise<number> {
    if (!this.config.enableLearning) {
      return 0;
    }

    // Query transition statistics from person_transition table
    const result = await this.pool.query(
      `SELECT
        from_camera_id,
        to_camera_id,
        COUNT(*) as sample_count,
        MIN(travel_time_ms / 1000) as min_seconds,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY travel_time_ms / 1000) as median_seconds,
        MAX(travel_time_ms / 1000) as max_seconds,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY travel_time_ms / 1000) as p95_seconds
       FROM person_transition
       WHERE tenant_id = $1::uuid
         AND branch_id = $2::uuid
         AND status IN ('CONFIRMED', 'PROBABLE')
         AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY from_camera_id, to_camera_id
       HAVING COUNT(*) >= $3`,
      [tenantId, branchId, minSamples]
    );

    let updated = 0;

    for (const row of result.rows) {
      // Check if rule exists
      const existing = await this.getRule(
        tenantId,
        row.from_camera_id,
        row.to_camera_id
      );

      const minSeconds = Math.max(1, Math.floor(row.min_seconds * 0.8)); // 20% buffer
      const typicalSeconds = Math.round(row.median_seconds);
      const maxSeconds = Math.ceil(row.p95_seconds * 1.2); // 20% buffer

      if (existing) {
        // Update existing rule with learned parameters
        await this.pool.query(
          `UPDATE camera_transition_rule
           SET min_travel_seconds = $3,
               typical_travel_seconds = $4,
               max_travel_seconds = $5,
               probability = $6,
               updated_at = NOW(),
               metadata = jsonb_set(
                 COALESCE(metadata, '{}'::jsonb),
                 '{learned}',
                 'true'::jsonb
               )
           WHERE id = $1::uuid AND tenant_id = $2::uuid`,
          [existing.id, tenantId, minSeconds, typicalSeconds, maxSeconds, 0.8]
        );
      } else {
        // Create new learned rule
        await this.upsertRule({
          tenantId,
          branchId,
          fromCameraId: row.from_camera_id,
          toCameraId: row.to_camera_id,
          minTravelSeconds: minSeconds,
          typicalTravelSeconds: typicalSeconds,
          maxTravelSeconds: maxSeconds,
          probability: 0.7, // Lower confidence for learned rules
          bidirectional: false,
          enabled: true,
          metadata: { learned: true, samples: row.sample_count }
        });
      }

      updated++;
    }

    return updated;
  }

  /**
   * Get all rules for a tenant
   */
  async getAllRules(tenantId: string, branchId?: string): Promise<CameraTransitionRule[]> {
    const query = branchId
      ? `SELECT * FROM camera_transition_rule
         WHERE tenant_id = $1::uuid AND branch_id = $2::uuid
         ORDER BY from_camera_id, to_camera_id`
      : `SELECT * FROM camera_transition_rule
         WHERE tenant_id = $1::uuid
         ORDER BY from_camera_id, to_camera_id`;

    const params = branchId ? [tenantId, branchId] : [tenantId];
    const result = await this.pool.query(query, params);

    return result.rows.map(row => this.mapRowToRule(row));
  }

  /**
   * Delete a rule
   */
  async deleteRule(ruleId: string, tenantId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM camera_transition_rule
       WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [ruleId, tenantId]
    );

    return (result.rowCount || 0) > 0;
  }

  /**
   * Map database row to CameraTransitionRule
   */
  private mapRowToRule(row: any): CameraTransitionRule {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      fromCameraId: row.from_camera_id,
      toCameraId: row.to_camera_id,
      fromZoneId: row.from_zone_id,
      toZoneId: row.to_zone_id,
      minTravelSeconds: parseInt(row.min_travel_seconds),
      typicalTravelSeconds: row.typical_travel_seconds ? parseInt(row.typical_travel_seconds) : undefined,
      maxTravelSeconds: parseInt(row.max_travel_seconds),
      probability: row.probability ? parseFloat(row.probability) : undefined,
      bidirectional: row.bidirectional,
      enabled: row.enabled,
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}

/**
 * Global singleton
 */
let topologyServiceInstance: CameraTopologyService | null = null;

/**
 * Get or create topology service
 */
export function getCameraTopologyService(
  pool: Pool,
  config?: Partial<TopologyConfig>
): CameraTopologyService {
  if (!topologyServiceInstance) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    topologyServiceInstance = new CameraTopologyService(pool, finalConfig);
  }
  return topologyServiceInstance;
}
