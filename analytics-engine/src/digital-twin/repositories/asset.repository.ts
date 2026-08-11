/**
 * Digital Twin Asset Repository
 * 
 * Manages CRUD operations for digital twin assets with PostgreSQL support.
 */

import { Pool } from 'pg';
import { DigitalTwinAsset, AssetType, AssetStatus } from '../models/asset.js';

export class AssetRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Find asset by ID
   */
  async findById(id: string): Promise<DigitalTwinAsset | null> {
    const result = await this.pool.query(
      `SELECT * FROM twin_assets WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Find multiple assets by IDs
   */
  async findByIds(ids: string[]): Promise<DigitalTwinAsset[]> {
    if (ids.length === 0) {
      return [];
    }

    const result = await this.pool.query(
      `SELECT * FROM twin_assets WHERE id = ANY($1::text[])`,
      [ids]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find all assets of a specific type
   */
  async findByType(type: AssetType): Promise<DigitalTwinAsset[]> {
    const result = await this.pool.query(
      `SELECT * FROM twin_assets WHERE type = $1 ORDER BY name`,
      [type]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find children of a parent asset
   */
  async findChildren(parentId: string): Promise<DigitalTwinAsset[]> {
    const result = await this.pool.query(
      `SELECT * FROM twin_assets WHERE parent_id = $1 ORDER BY type, name`,
      [parentId]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find all descendants of an asset (recursive)
   */
  async findDescendants(parentId: string): Promise<DigitalTwinAsset[]> {
    const result = await this.pool.query(
      `
      WITH RECURSIVE descendants AS (
        -- Base case: direct children
        SELECT * FROM twin_assets WHERE parent_id = $1
        
        UNION ALL
        
        -- Recursive case: children of descendants
        SELECT a.*
        FROM twin_assets a
        INNER JOIN descendants d ON a.parent_id = d.id
      )
      SELECT * FROM descendants
      ORDER BY type, name
      `,
      [parentId]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find assets by status
   */
  async findByStatus(status: AssetStatus): Promise<DigitalTwinAsset[]> {
    const result = await this.pool.query(
      `SELECT * FROM twin_assets WHERE status = $1 ORDER BY type, name`,
      [status]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find assets with health score below threshold
   */
  async findUnhealthy(threshold: number = 70): Promise<DigitalTwinAsset[]> {
    const result = await this.pool.query(
      `SELECT * FROM twin_assets 
       WHERE health_score < $1 
       ORDER BY health_score ASC, type, name`,
      [threshold]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find assets with security score below threshold
   */
  async findInsecure(threshold: number = 70): Promise<DigitalTwinAsset[]> {
    const result = await this.pool.query(
      `SELECT * FROM twin_assets 
       WHERE security_score < $1 
       ORDER BY security_score ASC, type, name`,
      [threshold]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Search assets by name
   */
  async search(query: string, types?: AssetType[]): Promise<DigitalTwinAsset[]> {
    let sql = `SELECT * FROM twin_assets WHERE name ILIKE $1`;
    const params: any[] = [`%${query}%`];

    if (types && types.length > 0) {
      sql += ` AND type = ANY($2::text[])`;
      params.push(types);
    }

    sql += ` ORDER BY name LIMIT 50`;

    const result = await this.pool.query(sql, params);
    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Create new asset
   */
  async create(asset: DigitalTwinAsset): Promise<DigitalTwinAsset> {
    const result = await this.pool.query(
      `
      INSERT INTO twin_assets (
        id, type, name, parent_id, status, metadata,
        health_score, health_last_seen, health_issues,
        security_score, security_vulnerabilities, security_config_issues, security_details,
        location, purpose, criticality, compliance_required,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
      `,
      [
        asset.id,
        asset.type,
        asset.name,
        asset.parentId || null,
        asset.status,
        JSON.stringify(asset.metadata),
        asset.health.score,
        asset.health.lastSeen || null,
        JSON.stringify(asset.health.issues),
        asset.security.score,
        asset.security.vulnerabilities,
        asset.security.configurationIssues,
        JSON.stringify(asset.security.details || {}),
        asset.location || null,
        asset.purpose || null,
        asset.criticality || null,
        asset.complianceRequired || false,
        asset.createdAt,
        asset.updatedAt
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Update existing asset
   */
  async update(id: string, updates: Partial<DigitalTwinAsset>): Promise<DigitalTwinAsset | null> {
    const asset = await this.findById(id);
    if (!asset) {
      return null;
    }

    const merged = { ...asset, ...updates, updatedAt: new Date() };

    const result = await this.pool.query(
      `
      UPDATE twin_assets SET
        name = $2,
        parent_id = $3,
        status = $4,
        metadata = $5,
        health_score = $6,
        health_last_seen = $7,
        health_issues = $8,
        security_score = $9,
        security_vulnerabilities = $10,
        security_config_issues = $11,
        security_details = $12,
        location = $13,
        purpose = $14,
        criticality = $15,
        compliance_required = $16,
        updated_at = $17
      WHERE id = $1
      RETURNING *
      `,
      [
        id,
        merged.name,
        merged.parentId || null,
        merged.status,
        JSON.stringify(merged.metadata),
        merged.health.score,
        merged.health.lastSeen || null,
        JSON.stringify(merged.health.issues),
        merged.security.score,
        merged.security.vulnerabilities,
        merged.security.configurationIssues,
        JSON.stringify(merged.security.details || {}),
        merged.location || null,
        merged.purpose || null,
        merged.criticality || null,
        merged.complianceRequired || false,
        merged.updatedAt
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Update asset status
   */
  async updateStatus(id: string, status: AssetStatus): Promise<void> {
    await this.pool.query(
      `UPDATE twin_assets SET status = $2, updated_at = NOW() WHERE id = $1`,
      [id, status]
    );
  }

  /**
   * Update asset health
   */
  async updateHealth(
    id: string,
    healthScore: number,
    issues: any[]
  ): Promise<void> {
    await this.pool.query(
      `
      UPDATE twin_assets SET
        health_score = $2,
        health_last_seen = NOW(),
        health_issues = $3,
        updated_at = NOW()
      WHERE id = $1
      `,
      [id, healthScore, JSON.stringify(issues)]
    );
  }

  /**
   * Update asset security
   */
  async updateSecurity(
    id: string,
    securityScore: number,
    vulnerabilities: number,
    configIssues: number
  ): Promise<void> {
    await this.pool.query(
      `
      UPDATE twin_assets SET
        security_score = $2,
        security_vulnerabilities = $3,
        security_config_issues = $4,
        updated_at = NOW()
      WHERE id = $1
      `,
      [id, securityScore, vulnerabilities, configIssues]
    );
  }

  /**
   * Delete asset
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM twin_assets WHERE id = $1`,
      [id]
    );

    return (result.rowCount || 0) > 0;
  }

  /**
   * Get summary statistics
   */
  async getStatistics(): Promise<{
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    avgHealthScore: number;
    avgSecurityScore: number;
  }> {
    const result = await this.pool.query(`
      SELECT
        COUNT(*) as total,
        AVG(health_score) as avg_health,
        AVG(security_score) as avg_security,
        json_object_agg(type, type_count) as by_type,
        json_object_agg(status, status_count) as by_status
      FROM (
        SELECT
          type,
          status,
          health_score,
          security_score,
          COUNT(*) OVER (PARTITION BY type) as type_count,
          COUNT(*) OVER (PARTITION BY status) as status_count
        FROM twin_assets
      ) stats
    `);

    const row = result.rows[0];

    return {
      total: parseInt(row.total),
      byType: row.by_type || {},
      byStatus: row.by_status || {},
      avgHealthScore: parseFloat(row.avg_health) || 0,
      avgSecurityScore: parseFloat(row.avg_security) || 0
    };
  }

  /**
   * Map database row to asset model
   */
  private mapRow(row: any): DigitalTwinAsset {
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      parentId: row.parent_id,
      status: row.status,
      metadata: row.metadata || {},
      health: {
        score: row.health_score,
        lastSeen: row.health_last_seen ? new Date(row.health_last_seen) : undefined,
        issues: row.health_issues || [],
        metrics: row.health_metrics || undefined
      },
      security: {
        score: row.security_score,
        vulnerabilities: row.security_vulnerabilities,
        configurationIssues: row.security_config_issues,
        lastAudit: row.security_last_audit ? new Date(row.security_last_audit) : undefined,
        details: row.security_details || undefined
      },
      location: row.location,
      purpose: row.purpose,
      criticality: row.criticality,
      complianceRequired: row.compliance_required,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}
