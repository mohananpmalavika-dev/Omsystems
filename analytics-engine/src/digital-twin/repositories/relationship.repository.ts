/**
 * Digital Twin Relationship Repository
 * 
 * Manages relationships and dependencies between digital twin assets.
 */

import { Pool } from 'pg';
import { TwinRelationship, RelationshipType, isDependencyRelationship } from '../models/relationship';

export class RelationshipRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Find relationship by ID
   */
  async findById(id: string): Promise<TwinRelationship | null> {
    const result = await this.pool.query(
      `SELECT * FROM twin_relationships WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Find relationships by source asset
   */
  async findBySource(sourceId: string): Promise<TwinRelationship[]> {
    const result = await this.pool.query(
      `SELECT * FROM twin_relationships WHERE source_id = $1`,
      [sourceId]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find relationships by target asset
   */
  async findByTarget(targetId: string): Promise<TwinRelationship[]> {
    const result = await this.pool.query(
      `SELECT * FROM twin_relationships WHERE target_id = $1`,
      [targetId]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find all relationships for an asset (both source and target)
   */
  async findByAsset(assetId: string): Promise<TwinRelationship[]> {
    const result = await this.pool.query(
      `SELECT * FROM twin_relationships 
       WHERE source_id = $1 OR target_id = $1`,
      [assetId]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find dependencies (assets that this asset depends on)
   */
  async findDependencies(assetId: string): Promise<TwinRelationship[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM twin_relationships
      WHERE source_id = $1
        AND relationship_type IN (
          'depends_on',
          'connected_to',
          'records_to',
          'stores_on',
          'routes_through',
          'powered_by',
          'authenticates_via',
          'uplink_to'
        )
      `,
      [assetId]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find dependents (assets that depend on this asset)
   */
  async findDependents(assetId: string): Promise<TwinRelationship[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM twin_relationships
      WHERE target_id = $1
        AND relationship_type IN (
          'depends_on',
          'connected_to',
          'records_to',
          'stores_on',
          'routes_through',
          'powered_by',
          'authenticates_via',
          'uplink_to'
        )
      `,
      [assetId]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find all transitive dependencies using recursive CTE
   */
  async findAllDependencies(assetId: string, maxDepth: number = 10): Promise<Array<{
    relationship: TwinRelationship;
    depth: number;
  }>> {
    const result = await this.pool.query(
      `
      WITH RECURSIVE dependencies AS (
        -- Base case: direct dependencies
        SELECT
          *,
          1 AS depth
        FROM twin_relationships
        WHERE source_id = $1
          AND relationship_type IN (
            'depends_on',
            'connected_to',
            'records_to',
            'stores_on',
            'routes_through',
            'powered_by',
            'authenticates_via',
            'uplink_to'
          )
        
        UNION ALL
        
        -- Recursive case: dependencies of dependencies
        SELECT
          r.*,
          d.depth + 1
        FROM twin_relationships r
        INNER JOIN dependencies d ON r.source_id = d.target_id
        WHERE d.depth < $2
          AND r.relationship_type IN (
            'depends_on',
            'connected_to',
            'records_to',
            'stores_on',
            'routes_through',
            'powered_by',
            'authenticates_via',
            'uplink_to'
          )
      )
      SELECT DISTINCT ON (id) * FROM dependencies
      ORDER BY id, depth
      `,
      [assetId, maxDepth]
    );

    return result.rows.map(row => ({
      relationship: this.mapRow(row),
      depth: row.depth
    }));
  }

  /**
   * Find all transitive dependents using recursive CTE
   */
  async findAllDependents(assetId: string, maxDepth: number = 10): Promise<Array<{
    relationship: TwinRelationship;
    depth: number;
  }>> {
    const result = await this.pool.query(
      `
      WITH RECURSIVE dependents AS (
        -- Base case: direct dependents
        SELECT
          *,
          1 AS depth
        FROM twin_relationships
        WHERE target_id = $1
          AND relationship_type IN (
            'depends_on',
            'connected_to',
            'records_to',
            'stores_on',
            'routes_through',
            'powered_by',
            'authenticates_via',
            'uplink_to'
          )
        
        UNION ALL
        
        -- Recursive case: dependents of dependents
        SELECT
          r.*,
          d.depth + 1
        FROM twin_relationships r
        INNER JOIN dependents d ON r.target_id = d.source_id
        WHERE d.depth < $2
          AND r.relationship_type IN (
            'depends_on',
            'connected_to',
            'records_to',
            'stores_on',
            'routes_through',
            'powered_by',
            'authenticates_via',
            'uplink_to'
          )
      )
      SELECT DISTINCT ON (id) * FROM dependents
      ORDER BY id, depth
      `,
      [assetId, maxDepth]
    );

    return result.rows.map(row => ({
      relationship: this.mapRow(row),
      depth: row.depth
    }));
  }

  /**
   * Find relationship between two specific assets
   */
  async findBetween(
    sourceId: string,
    targetId: string
  ): Promise<TwinRelationship[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM twin_relationships
      WHERE (source_id = $1 AND target_id = $2)
         OR (source_id = $2 AND target_id = $1)
      `,
      [sourceId, targetId]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find relationships by type
   */
  async findByType(type: RelationshipType): Promise<TwinRelationship[]> {
    const result = await this.pool.query(
      `SELECT * FROM twin_relationships WHERE relationship_type = $1`,
      [type]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Create new relationship
   */
  async create(relationship: TwinRelationship): Promise<TwinRelationship> {
    const result = await this.pool.query(
      `
      INSERT INTO twin_relationships (
        id, source_id, target_id, relationship_type, criticality, metadata, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        relationship.id,
        relationship.sourceId,
        relationship.targetId,
        relationship.type,
        relationship.criticality,
        JSON.stringify(relationship.metadata || {}),
        relationship.createdAt
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Create multiple relationships in a transaction
   */
  async createMany(relationships: TwinRelationship[]): Promise<TwinRelationship[]> {
    if (relationships.length === 0) {
      return [];
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const created: TwinRelationship[] = [];
      for (const rel of relationships) {
        const result = await client.query(
          `
          INSERT INTO twin_relationships (
            id, source_id, target_id, relationship_type, criticality, metadata, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
          `,
          [
            rel.id,
            rel.sourceId,
            rel.targetId,
            rel.type,
            rel.criticality,
            JSON.stringify(rel.metadata || {}),
            rel.createdAt
          ]
        );

        created.push(this.mapRow(result.rows[0]));
      }

      await client.query('COMMIT');
      return created;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update relationship
   */
  async update(
    id: string,
    updates: Partial<Pick<TwinRelationship, 'criticality' | 'metadata'>>
  ): Promise<TwinRelationship | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const merged = { ...existing, ...updates, updatedAt: new Date() };

    const result = await this.pool.query(
      `
      UPDATE twin_relationships SET
        criticality = $2,
        metadata = $3,
        updated_at = $4
      WHERE id = $1
      RETURNING *
      `,
      [
        id,
        merged.criticality,
        JSON.stringify(merged.metadata || {}),
        merged.updatedAt
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Delete relationship
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM twin_relationships WHERE id = $1`,
      [id]
    );

    return (result.rowCount || 0) > 0;
  }

  /**
   * Delete all relationships for an asset
   */
  async deleteByAsset(assetId: string): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM twin_relationships WHERE source_id = $1 OR target_id = $1`,
      [assetId]
    );

    return result.rowCount || 0;
  }

  /**
   * Get relationship statistics
   */
  async getStatistics(): Promise<{
    total: number;
    byType: Record<string, number>;
    byCriticality: Record<string, number>;
  }> {
    const result = await this.pool.query(`
      SELECT
        COUNT(*) as total,
        relationship_type,
        criticality
      FROM twin_relationships
      GROUP BY relationship_type, criticality
    `);

    const byType: Record<string, number> = {};
    const byCriticality: Record<string, number> = {};
    let total = 0;

    for (const row of result.rows) {
      const count = parseInt(row.count);
      total += count;

      byType[row.relationship_type] = (byType[row.relationship_type] || 0) + count;
      byCriticality[row.criticality] = (byCriticality[row.criticality] || 0) + count;
    }

    return { total, byType, byCriticality };
  }

  /**
   * Map database row to relationship model
   */
  private mapRow(row: any): TwinRelationship {
    return {
      id: row.id,
      sourceId: row.source_id,
      targetId: row.target_id,
      type: row.relationship_type,
      criticality: row.criticality,
      metadata: row.metadata || {},
      createdAt: new Date(row.created_at),
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined
    };
  }
}
