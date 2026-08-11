/**
 * Hierarchy Collector
 * 
 * Discovers organizational hierarchy (enterprise, regions, branches) from the resource tree.
 */

import { Pool } from 'pg';
import { BaseCollector } from './base-collector.js';
import {
  DigitalTwinAsset,
  TwinRelationship,
  CollectorResult,
  createAsset,
  BranchMetadata
} from '../models.js';

export class HierarchyCollector extends BaseCollector {
  constructor(private readonly pool: Pool) {
    super();
  }

  getName(): string {
    return 'HierarchyCollector';
  }

  async collect(): Promise<CollectorResult> {
    const assets: DigitalTwinAsset[] = [];
    const relationships: TwinRelationship[] = [];
    const errors: Array<{ message: string; assetId?: string }> = [];

    try {
      // Query organizational nodes from resources table
      const result = await this.pool.query(`
        SELECT
          id,
          tenant_id,
          parent_id,
          type,
          name,
          metadata,
          active,
          created_at
        FROM resources
        WHERE type IN ('tenant', 'enterprise', 'region', 'branch')
          AND active = true
        ORDER BY
          CASE type
            WHEN 'tenant' THEN 1
            WHEN 'enterprise' THEN 2
            WHEN 'region' THEN 3
            WHEN 'branch' THEN 4
          END,
          name
      `);

      for (const row of result.rows) {
        try {
          const assetType = this.mapNodeType(row.type);
          const assetId = `${assetType}_${row.id}`;

          // Build metadata based on type
          const metadata = this.buildMetadata(row);

          // Create hierarchy asset
          const asset = createAsset(
            assetType,
            row.name,
            metadata,
            {
              parentId: row.parent_id ? `${this.mapNodeType(row.type)}_${row.parent_id}` : undefined,
              status: 'healthy',
              criticality: assetType === 'enterprise' ? 'critical' : 'high'
            }
          );

          asset.id = assetId;
          asset.health.score = 100; // Hierarchy nodes don't have direct health
          asset.security.score = 100;
          asset.createdAt = new Date(row.created_at);

          // Add location info for branches
          if (row.metadata?.address) {
            asset.location = [
              row.metadata.address,
              row.metadata.city,
              row.metadata.state,
              row.metadata.country
            ].filter(Boolean).join(', ');
          }

          assets.push(asset);

        } catch (error) {
          errors.push(this.handleError(error, `Processing hierarchy node ${row.id}`));
        }
      }

      // Calculate aggregate health for hierarchy nodes
      await this.updateHierarchyHealth(assets);

      console.log(`[${this.getName()}] Collected ${assets.length} hierarchy nodes`);

    } catch (error) {
      errors.push(this.handleError(error, 'Querying hierarchy'));
    }

    return this.createResult(assets, relationships, errors);
  }

  /**
   * Map resource node type to asset type
   */
  private mapNodeType(type: string): DigitalTwinAsset['type'] {
    switch (type.toLowerCase()) {
      case 'tenant':
      case 'enterprise':
        return 'enterprise';
      case 'region':
        return 'region';
      case 'branch':
        return 'branch';
      default:
        return 'branch';
    }
  }

  /**
   * Build type-specific metadata
   */
  private buildMetadata(row: any): Record<string, unknown> {
    const meta = row.metadata || {};

    if (row.type === 'branch') {
      const branchMeta: BranchMetadata = {
        address: meta.address,
        city: meta.city,
        state: meta.state,
        country: meta.country,
        timezone: meta.timezone,
        operatingHours: meta.operating_hours,
        contactPerson: meta.contact_person,
        contactPhone: meta.contact_phone
      };
      return branchMeta;
    }

    return meta;
  }

  /**
   * Update hierarchy health based on child assets
   * This would be called after all other collectors have run
   */
  private async updateHierarchyHealth(assets: DigitalTwinAsset[]): Promise<void> {
    // For now, hierarchy nodes inherit health from their children
    // This will be properly calculated in the DigitalTwinService
    // when aggregating health scores up the tree
    
    for (const asset of assets) {
      if (['enterprise', 'region', 'branch'].includes(asset.type)) {
        // Query child asset health
        try {
          const result = await this.pool.query(`
            SELECT AVG(health_score) as avg_health
            FROM twin_assets
            WHERE parent_id = $1
          `, [asset.id]);

          if (result.rows[0]?.avg_health) {
            asset.health.score = Math.round(parseFloat(result.rows[0].avg_health));
          }
        } catch (error) {
          // Ignore errors, will use default health
        }
      }
    }
  }
}
