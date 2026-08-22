/**
 * Digital Twin Bridge
 * Integration with Digital Twin system for enhanced root cause analysis
 */

import type { Pool } from 'pg';

// Digital Twin types (from analytics-engine)
export interface TwinAsset {
  id: string;
  asset_type: 'camera' | 'nvr' | 'switch' | 'storage' | 'branch' | 'gateway' | 'router';
  name: string;
  status: 'online' | 'offline' | 'degraded' | 'maintenance';
  health_score: number;
  security_score: number;
  parent_id: string | null;
  metadata: Record<string, any>;
}

export interface TwinRelationship {
  source_id: string;
  target_id: string;
  relationship_type: 'connected_to' | 'records_to' | 'stores_on' | 'depends_on' | 'powered_by';
  criticality: 'critical' | 'high' | 'medium' | 'low';
  metadata?: Record<string, any>;
}

export interface TwinDependency {
  asset_id: string;
  depends_on_id: string;
  dependency_path: string[];
  path_length: number;
}

export interface BlastRadiusResult {
  source_asset: TwinAsset;
  total_affected: number;
  affected_assets: TwinAsset[];
  by_type: Record<string, number>;
  critical_services: string[];
  business_impact: {
    coverage_loss: string;
    operational_impact: 'critical' | 'severe' | 'moderate' | 'minor';
    estimated_downtime?: string;
    affected_zones?: string[];
  };
}

export interface TopologyGraph {
  nodes: TwinAsset[];
  edges: TwinRelationship[];
}

/**
 * Bridge to Digital Twin system for dependency analysis
 */
export class DigitalTwinBridge {
  constructor(private readonly pool: Pool) {}

  /**
   * Get asset by ID
   */
  async getAsset(assetId: string): Promise<TwinAsset | null> {
    try {
      const result = await this.pool.query<TwinAsset>(
        `SELECT * FROM twin_assets WHERE id = $1`,
        [assetId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error(`[DigitalTwinBridge] Error fetching asset ${assetId}:`, error);
      return null;
    }
  }

  /**
   * Get all assets that depend on the given asset
   */
  async getDependentAssets(assetId: string): Promise<TwinAsset[]> {
    try {
      const result = await this.pool.query<TwinAsset>(
        `
        WITH RECURSIVE dependencies AS (
          -- Base case: direct dependencies
          SELECT DISTINCT target_id AS asset_id, 1 AS depth
          FROM twin_relationships
          WHERE source_id = $1
            AND relationship_type IN ('depends_on', 'connected_to', 'records_to')
          
          UNION
          
          -- Recursive case: transitive dependencies
          SELECT DISTINCT r.target_id, d.depth + 1
          FROM dependencies d
          JOIN twin_relationships r ON r.source_id = d.asset_id
          WHERE r.relationship_type IN ('depends_on', 'connected_to', 'records_to')
            AND d.depth < 10  -- Limit recursion depth
        )
        SELECT a.*
        FROM dependencies d
        JOIN twin_assets a ON a.id = d.asset_id
        ORDER BY d.depth, a.asset_type, a.name
        `,
        [assetId]
      );

      return result.rows;
    } catch (error) {
      console.error(`[DigitalTwinBridge] Error fetching dependent assets for ${assetId}:`, error);
      return [];
    }
  }

  /**
   * Get all assets that the given asset depends on
   */
  async getDependencies(assetId: string): Promise<TwinDependency[]> {
    try {
      const result = await this.pool.query<TwinDependency>(
        `
        WITH RECURSIVE dependency_paths AS (
          -- Base case: direct dependencies
          SELECT 
            $1 AS asset_id,
            source_id AS depends_on_id,
            ARRAY[$1, source_id] AS dependency_path,
            1 AS path_length
          FROM twin_relationships
          WHERE target_id = $1
            AND relationship_type IN ('depends_on', 'connected_to', 'powered_by')
          
          UNION
          
          -- Recursive case: transitive dependencies
          SELECT 
            dp.asset_id,
            r.source_id AS depends_on_id,
            dp.dependency_path || r.source_id,
            dp.path_length + 1
          FROM dependency_paths dp
          JOIN twin_relationships r ON r.target_id = dp.depends_on_id
          WHERE r.relationship_type IN ('depends_on', 'connected_to', 'powered_by')
            AND dp.path_length < 10
            AND NOT r.source_id = ANY(dp.dependency_path)  -- Prevent cycles
        )
        SELECT DISTINCT ON (depends_on_id)
          asset_id,
          depends_on_id,
          dependency_path,
          path_length
        FROM dependency_paths
        ORDER BY depends_on_id, path_length
        `,
        [assetId]
      );

      return result.rows;
    } catch (error) {
      console.error(`[DigitalTwinBridge] Error fetching dependencies for ${assetId}:`, error);
      return [];
    }
  }

  /**
   * Calculate blast radius for asset failure
   */
  async calculateBlastRadius(assetId: string): Promise<BlastRadiusResult | null> {
    try {
      const sourceAsset = await this.getAsset(assetId);
      if (!sourceAsset) {
        return null;
      }

      const affectedAssets = await this.getDependentAssets(assetId);

      // Count by type
      const byType: Record<string, number> = {};
      affectedAssets.forEach((asset) => {
        byType[asset.asset_type] = (byType[asset.asset_type] || 0) + 1;
      });

      // Identify critical services
      const criticalServices: string[] = [];
      affectedAssets.forEach((asset) => {
        if (asset.health_score > 80 && asset.status === 'online') {
          criticalServices.push(`${asset.asset_type}: ${asset.name}`);
        }
      });

      // Determine operational impact
      const totalAffected = affectedAssets.length;
      const cameraCount = byType.camera ?? 0;
      let operationalImpact: BlastRadiusResult['business_impact']['operational_impact'];
      if (totalAffected > 50 || cameraCount > 20) {
        operationalImpact = 'critical';
      } else if (totalAffected > 20 || cameraCount > 10) {
        operationalImpact = 'severe';
      } else if (totalAffected > 5) {
        operationalImpact = 'moderate';
      } else {
        operationalImpact = 'minor';
      }

      // Identify affected zones
      const affectedZones = new Set<string>();
      affectedAssets.forEach((asset) => {
        if (asset.metadata?.zone) {
          affectedZones.add(asset.metadata.zone);
        }
      });

      return {
        source_asset: sourceAsset,
        total_affected: totalAffected,
        affected_assets: affectedAssets,
        by_type: byType,
        critical_services: criticalServices.slice(0, 10), // Top 10
        business_impact: {
          coverage_loss: `${(byType.camera ?? 0)} cameras affected`,
          operational_impact: operationalImpact,
          estimated_downtime: this.estimateDowntime(sourceAsset.asset_type),
          affected_zones: Array.from(affectedZones),
        },
      };
    } catch (error) {
      console.error(`[DigitalTwinBridge] Error calculating blast radius for ${assetId}:`, error);
      return null;
    }
  }

  /**
   * Find common parent/dependency for multiple assets
   * Useful for identifying root cause when multiple assets fail
   */
  async findCommonDependency(assetIds: string[]): Promise<TwinAsset[]> {
    try {
      if (assetIds.length === 0) {
        return [];
      }

      const result = await this.pool.query<TwinAsset>(
        `
        WITH asset_dependencies AS (
          SELECT DISTINCT
            target_id AS asset_id,
            source_id AS dependency_id
          FROM twin_relationships
          WHERE target_id = ANY($1)
            AND relationship_type IN ('depends_on', 'connected_to', 'powered_by')
        ),
        common_deps AS (
          SELECT 
            dependency_id,
            COUNT(DISTINCT asset_id) AS affected_count
          FROM asset_dependencies
          GROUP BY dependency_id
          HAVING COUNT(DISTINCT asset_id) = $2
        )
        SELECT a.*
        FROM common_deps cd
        JOIN twin_assets a ON a.id = cd.dependency_id
        ORDER BY a.asset_type, a.name
        `,
        [assetIds, assetIds.length]
      );

      return result.rows;
    } catch (error) {
      console.error('[DigitalTwinBridge] Error finding common dependencies:', error);
      return [];
    }
  }

  /**
   * Get topology subgraph around an asset
   */
  async getLocalTopology(assetId: string, depth: number = 2): Promise<TopologyGraph> {
    try {
      // Get assets within depth levels
      const assetsResult = await this.pool.query<TwinAsset>(
        `
        WITH RECURSIVE topology AS (
          -- Base case: the asset itself
          SELECT id, 0 AS depth
          FROM twin_assets
          WHERE id = $1
          
          UNION
          
          -- Recursive case: connected assets
          SELECT DISTINCT
            CASE 
              WHEN r.source_id = t.id THEN r.target_id
              ELSE r.source_id
            END AS id,
            t.depth + 1
          FROM topology t
          JOIN twin_relationships r ON (r.source_id = t.id OR r.target_id = t.id)
          WHERE t.depth < $2
        )
        SELECT DISTINCT a.*
        FROM topology t
        JOIN twin_assets a ON a.id = t.id
        `,
        [assetId, depth]
      );

      const assetIds = assetsResult.rows.map((a) => a.id);

      // Get relationships between these assets
      const relationshipsResult = await this.pool.query<TwinRelationship>(
        `
        SELECT *
        FROM twin_relationships
        WHERE source_id = ANY($1) AND target_id = ANY($1)
        `,
        [assetIds]
      );

      return {
        nodes: assetsResult.rows,
        edges: relationshipsResult.rows,
      };
    } catch (error) {
      console.error(`[DigitalTwinBridge] Error getting local topology for ${assetId}:`, error);
      return { nodes: [], edges: [] };
    }
  }

  /**
   * Check if asset is a single point of failure
   */
  async isSinglePointOfFailure(assetId: string): Promise<boolean> {
    try {
      // An asset is a single point of failure if:
      // 1. It has dependents
      // 2. Those dependents have no alternative path to their requirements

      const dependents = await this.getDependentAssets(assetId);
      if (dependents.length === 0) {
        return false;
      }

      // Check if any dependent has an alternative dependency path
      // (This is a simplified check - a full check would need more complex graph analysis)
      const result = await this.pool.query<{ has_alternative: boolean }>(
        `
        SELECT EXISTS(
          SELECT 1
          FROM twin_relationships r1
          JOIN twin_relationships r2 ON r1.target_id = r2.target_id
          WHERE r1.source_id = $1
            AND r2.source_id != $1
            AND r1.relationship_type = r2.relationship_type
        ) AS has_alternative
        `,
        [assetId]
      );

      return !result.rows[0]?.has_alternative;
    } catch (error) {
      console.error(`[DigitalTwinBridge] Error checking SPOF for ${assetId}:`, error);
      return false;
    }
  }

  /**
   * Get health status of assets
   */
  async getAssetsHealth(assetIds: string[]): Promise<Map<string, number>> {
    try {
      const result = await this.pool.query<{ id: string; health_score: number }>(
        `SELECT id, health_score FROM twin_assets WHERE id = ANY($1)`,
        [assetIds]
      );

      const healthMap = new Map<string, number>();
      result.rows.forEach((row) => {
        healthMap.set(row.id, row.health_score);
      });

      return healthMap;
    } catch (error) {
      console.error('[DigitalTwinBridge] Error fetching assets health:', error);
      return new Map();
    }
  }

  /**
   * Estimate downtime based on asset type
   */
  private estimateDowntime(assetType: string): string {
    const downtimeEstimates: Record<string, string> = {
      camera: '5-15 minutes',
      switch: '30 minutes - 2 hours',
      gateway: '1-4 hours',
      router: '2-6 hours',
      nvr: '30 minutes - 2 hours',
      storage: '1-8 hours',
      branch: '4-24 hours',
    };

    return downtimeEstimates[assetType] || '1-4 hours';
  }
}
