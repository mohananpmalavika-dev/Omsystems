/**
 * Feature Management Service
 * 
 * Central service for managing feature flags at tenant and global level.
 * Supports:
 * - Enable/disable features
 * - Usage limits and tracking
 * - Feature expiration
 * - Audit logging
 * - Permission checks
 */

import type { Pool } from "pg";
import { z } from "zod";

export interface FeatureConfig {
  requires_openai?: boolean;
  requires_gpt4?: boolean;
  requires_consent?: boolean;
  gdpr_compliant?: boolean;
  experimental?: boolean;
  priority?: string;
  [key: string]: any;
}

export interface GlobalFeature {
  id: string;
  featureKey: string;
  featureName: string;
  featureCategory: string;
  description: string | null;
  enabled: boolean;
  config: FeatureConfig;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantFeature {
  id: string;
  tenantId: string;
  featureKey: string;
  enabled: boolean;
  usageLimit: number | null;
  usageCount: number;
  config: FeatureConfig;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}

export interface FeatureStatus {
  featureKey: string;
  featureName: string;
  featureCategory: string;
  globalEnabled: boolean;
  tenantEnabled: boolean | null;
  effectiveEnabled: boolean;
  usageCount: number;
  usageLimit: number | null;
  expiresAt: Date | null;
  isExpired: boolean;
  config: FeatureConfig;
}

export interface FeatureUsageStats {
  featureKey: string;
  totalUsage: number;
  uniqueTenants: number;
  uniqueUsers: number;
  firstUsed: Date;
  lastUsed: Date;
}

const featureKeySchema = z.string().regex(/^[a-z0-9-]+$/, "Feature key must be lowercase alphanumeric with hyphens");

export class FeatureManagementService {
  constructor(private pool: Pool) {}

  /**
   * Check if a feature is enabled for a tenant
   * This is the primary method used throughout the application
   */
  async isFeatureEnabled(tenantId: string, featureKey: string): Promise<boolean> {
    const result = await this.pool.query<{ is_feature_enabled: boolean }>(
      `SELECT is_feature_enabled($1, $2) as is_feature_enabled`,
      [tenantId, featureKey]
    );

    return result.rows[0]?.is_feature_enabled || false;
  }

  /**
   * Check if feature is enabled AND under usage limit
   */
  async canUseFeature(tenantId: string, featureKey: string): Promise<{
    enabled: boolean;
    reason?: string;
  }> {
    // Check if enabled
    const enabled = await this.isFeatureEnabled(tenantId, featureKey);
    
    if (!enabled) {
      return { 
        enabled: false, 
        reason: "Feature is disabled or not available for your tenant" 
      };
    }

    // Check usage limit
    const result = await this.pool.query<{ check_feature_usage_limit: boolean }>(
      `SELECT check_feature_usage_limit($1, $2) as check_feature_usage_limit`,
      [tenantId, featureKey]
    );

    const underLimit = result.rows[0]?.check_feature_usage_limit !== false;

    if (!underLimit) {
      return {
        enabled: false,
        reason: "Feature usage limit exceeded"
      };
    }

    return { enabled: true };
  }

  /**
   * Log feature usage
   */
  async logUsage(
    tenantId: string,
    featureKey: string,
    userId?: string,
    action: string = "access",
    metadata: Record<string, any> = {}
  ): Promise<void> {
    await this.pool.query(
      `SELECT log_feature_usage($1, $2, $3, $4, $5)`,
      [tenantId, featureKey, userId || null, action, JSON.stringify(metadata)]
    );
  }

  /**
   * Get feature status for a tenant
   */
  async getFeatureStatus(tenantId: string, featureKey: string): Promise<FeatureStatus | null> {
    const result = await this.pool.query<any>(
      `SELECT * FROM v_tenant_feature_status 
       WHERE tenant_id = $1 AND feature_key = $2`,
      [tenantId, featureKey]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      featureKey: row.feature_key,
      featureName: row.feature_name,
      featureCategory: row.feature_category,
      globalEnabled: row.global_enabled,
      tenantEnabled: row.tenant_enabled,
      effectiveEnabled: row.effective_enabled,
      usageCount: parseInt(row.usage_count) || 0,
      usageLimit: row.usage_limit ? parseInt(row.usage_limit) : null,
      expiresAt: row.expires_at,
      isExpired: row.is_expired,
      config: { ...row.global_config, ...row.tenant_config },
    };
  }

  /**
   * Get all features for a tenant
   */
  async getAllFeaturesForTenant(tenantId: string): Promise<FeatureStatus[]> {
    const result = await this.pool.query<any>(
      `SELECT * FROM v_tenant_feature_status 
       WHERE tenant_id = $1 
       ORDER BY feature_category, feature_name`,
      [tenantId]
    );

    return result.rows.map((row) => ({
      featureKey: row.feature_key,
      featureName: row.feature_name,
      featureCategory: row.feature_category,
      globalEnabled: row.global_enabled,
      tenantEnabled: row.tenant_enabled,
      effectiveEnabled: row.effective_enabled,
      usageCount: parseInt(row.usage_count) || 0,
      usageLimit: row.usage_limit ? parseInt(row.usage_limit) : null,
      expiresAt: row.expires_at,
      isExpired: row.is_expired,
      config: { ...row.global_config, ...row.tenant_config },
    }));
  }

  /**
   * Get all global features (admin only)
   */
  async getAllGlobalFeatures(): Promise<GlobalFeature[]> {
    const result = await this.pool.query<any>(
      `SELECT * FROM global_features ORDER BY feature_category, feature_name`
    );

    return result.rows.map((row) => ({
      id: row.id,
      featureKey: row.feature_key,
      featureName: row.feature_name,
      featureCategory: row.feature_category,
      description: row.description,
      enabled: row.enabled,
      config: row.config || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Enable/disable a feature globally (platform admin only)
   */
  async setGlobalFeatureStatus(
    featureKey: string,
    enabled: boolean,
    changedBy?: string
  ): Promise<void> {
    featureKeySchema.parse(featureKey);

    await this.pool.query(
      `UPDATE global_features 
       SET enabled = $2, updated_at = NOW() 
       WHERE feature_key = $1`,
      [featureKey, enabled]
    );
  }

  /**
   * Update global feature configuration
   */
  async updateGlobalFeatureConfig(
    featureKey: string,
    config: FeatureConfig
  ): Promise<void> {
    featureKeySchema.parse(featureKey);

    await this.pool.query(
      `UPDATE global_features 
       SET config = $2, updated_at = NOW() 
       WHERE feature_key = $1`,
      [featureKey, JSON.stringify(config)]
    );
  }

  /**
   * Enable/disable a feature for a specific tenant
   */
  async setTenantFeatureStatus(
    tenantId: string,
    featureKey: string,
    enabled: boolean,
    options?: {
      usageLimit?: number;
      expiresAt?: Date;
      config?: FeatureConfig;
      notes?: string;
    }
  ): Promise<void> {
    featureKeySchema.parse(featureKey);

    // Upsert tenant feature
    await this.pool.query(
      `INSERT INTO tenant_features (tenant_id, feature_key, enabled, usage_limit, expires_at, config, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id, feature_key) 
       DO UPDATE SET 
         enabled = EXCLUDED.enabled,
         usage_limit = COALESCE(EXCLUDED.usage_limit, tenant_features.usage_limit),
         expires_at = EXCLUDED.expires_at,
         config = COALESCE(EXCLUDED.config, tenant_features.config),
         notes = COALESCE(EXCLUDED.notes, tenant_features.notes),
         updated_at = NOW()`,
      [
        tenantId,
        featureKey,
        enabled,
        options?.usageLimit || null,
        options?.expiresAt || null,
        options?.config ? JSON.stringify(options.config) : null,
        options?.notes || null,
      ]
    );
  }

  /**
   * Remove tenant-specific override (revert to global default)
   */
  async removeTenantFeatureOverride(tenantId: string, featureKey: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM tenant_features WHERE tenant_id = $1 AND feature_key = $2`,
      [tenantId, featureKey]
    );
  }

  /**
   * Update tenant feature usage limit
   */
  async updateUsageLimit(
    tenantId: string,
    featureKey: string,
    usageLimit: number | null
  ): Promise<void> {
    await this.pool.query(
      `UPDATE tenant_features 
       SET usage_limit = $3, updated_at = NOW() 
       WHERE tenant_id = $1 AND feature_key = $2`,
      [tenantId, featureKey, usageLimit]
    );
  }

  /**
   * Reset usage counter for a tenant
   */
  async resetUsageCount(tenantId: string, featureKey: string): Promise<void> {
    await this.pool.query(
      `UPDATE tenant_features 
       SET usage_count = 0, updated_at = NOW() 
       WHERE tenant_id = $1 AND feature_key = $2`,
      [tenantId, featureKey]
    );
  }

  /**
   * Get feature usage statistics
   */
  async getFeatureUsageStats(featureKey: string): Promise<FeatureUsageStats | null> {
    const result = await this.pool.query<any>(
      `SELECT * FROM v_feature_usage_summary WHERE feature_key = $1`,
      [featureKey]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      featureKey: row.feature_key,
      totalUsage: parseInt(row.total_usage),
      uniqueTenants: parseInt(row.unique_tenants),
      uniqueUsers: parseInt(row.unique_users),
      firstUsed: row.first_used,
      lastUsed: row.last_used,
    };
  }

  /**
   * Get all usage stats for all features
   */
  async getAllUsageStats(): Promise<FeatureUsageStats[]> {
    const result = await this.pool.query<any>(
      `SELECT * FROM v_feature_usage_summary ORDER BY total_usage DESC`
    );

    return result.rows.map((row) => ({
      featureKey: row.feature_key,
      totalUsage: parseInt(row.total_usage),
      uniqueTenants: parseInt(row.unique_tenants),
      uniqueUsers: parseInt(row.unique_users),
      firstUsed: row.first_used,
      lastUsed: row.last_used,
    }));
  }

  /**
   * Get audit log for a feature
   */
  async getFeatureAuditLog(
    featureKey: string,
    tenantId?: string,
    limit: number = 100
  ): Promise<any[]> {
    let query = `
      SELECT 
        fal.*,
        u.email as changed_by_email,
        t.name as tenant_name
      FROM feature_audit_log fal
      LEFT JOIN users u ON fal.changed_by = u.id
      LEFT JOIN tenants t ON fal.tenant_id = t.id
      WHERE fal.feature_key = $1
    `;

    const params: any[] = [featureKey];

    if (tenantId) {
      query += ` AND fal.tenant_id = $2`;
      params.push(tenantId);
    }

    query += ` ORDER BY fal.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Check if multiple features are enabled (batch operation)
   */
  async areFeaturesEnabled(
    tenantId: string,
    featureKeys: string[]
  ): Promise<Record<string, boolean>> {
    if (featureKeys.length === 0) {
      return {};
    }

    const result = await this.pool.query<{ feature_key: string; enabled: boolean }>(
      `SELECT 
         feature_key,
         is_feature_enabled($1, feature_key) as enabled
       FROM unnest($2::varchar[]) as feature_key`,
      [tenantId, featureKeys]
    );

    return Object.fromEntries(
      result.rows.map((row) => [row.feature_key, row.enabled])
    );
  }

  /**
   * Get features by category
   */
  async getFeaturesByCategory(category: string): Promise<GlobalFeature[]> {
    const result = await this.pool.query<any>(
      `SELECT * FROM global_features 
       WHERE feature_category = $1 
       ORDER BY feature_name`,
      [category]
    );

    return result.rows.map((row) => ({
      id: row.id,
      featureKey: row.feature_key,
      featureName: row.feature_name,
      featureCategory: row.feature_category,
      description: row.description,
      enabled: row.enabled,
      config: row.config || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Get all feature categories
   */
  async getFeatureCategories(): Promise<Array<{ category: string; count: number }>> {
    const result = await this.pool.query<{ category: string; count: string }>(
      `SELECT feature_category as category, COUNT(*) as count 
       FROM global_features 
       GROUP BY feature_category 
       ORDER BY category`
    );

    return result.rows.map((row) => ({
      category: row.category,
      count: parseInt(row.count),
    }));
  }

  /**
   * Create a new global feature (platform admin only)
   */
  async createGlobalFeature(feature: {
    featureKey: string;
    featureName: string;
    featureCategory: string;
    description?: string;
    enabled?: boolean;
    config?: FeatureConfig;
  }): Promise<GlobalFeature> {
    featureKeySchema.parse(feature.featureKey);

    const result = await this.pool.query<any>(
      `INSERT INTO global_features (feature_key, feature_name, feature_category, description, enabled, config)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        feature.featureKey,
        feature.featureName,
        feature.featureCategory,
        feature.description || null,
        feature.enabled !== undefined ? feature.enabled : false,
        feature.config ? JSON.stringify(feature.config) : '{}',
      ]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      featureKey: row.feature_key,
      featureName: row.feature_name,
      featureCategory: row.feature_category,
      description: row.description,
      enabled: row.enabled,
      config: row.config || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Delete a global feature (platform admin only, use with caution)
   */
  async deleteGlobalFeature(featureKey: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM global_features WHERE feature_key = $1`,
      [featureKey]
    );
  }

  /**
   * Check if tenant has any expired features and disable them
   */
  async cleanupExpiredFeatures(tenantId?: string): Promise<number> {
    let query = `
      UPDATE tenant_features
      SET enabled = false, updated_at = NOW()
      WHERE expires_at IS NOT NULL 
        AND expires_at < NOW() 
        AND enabled = true
    `;

    const params: any[] = [];

    if (tenantId) {
      query += ` AND tenant_id = $1`;
      params.push(tenantId);
    }

    const result = await this.pool.query(query, params);
    return result.rowCount || 0;
  }

  /**
   * Get tenants using a specific feature
   */
  async getTenantsUsingFeature(featureKey: string): Promise<Array<{
    tenantId: string;
    tenantName: string;
    enabled: boolean;
    usageCount: number;
  }>> {
    const result = await this.pool.query<any>(
      `SELECT 
         t.id as tenant_id,
         t.name as tenant_name,
         tf.enabled,
         tf.usage_count
       FROM tenants t
       LEFT JOIN tenant_features tf ON t.id = tf.tenant_id AND tf.feature_key = $1
       WHERE is_feature_enabled(t.id, $1) = true
       ORDER BY t.name`,
      [featureKey]
    );

    return result.rows.map((row) => ({
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      enabled: row.enabled !== false,
      usageCount: parseInt(row.usage_count) || 0,
    }));
  }
}
