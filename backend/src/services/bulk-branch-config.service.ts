/**
 * Bulk Branch Configuration Service
 * Manage configuration for multiple branches simultaneously
 */

import { Pool } from 'pg';

export interface BulkConfigOperation {
  operationType: 'update' | 'add_cameras' | 'update_cameras' | 'update_storage' | 'update_network' | 'update_settings';
  targetBranches: string[]; // Branch IDs
  configuration: any;
  applyToRegion?: string;
  applyToAll?: boolean;
  excludeBranches?: string[];
  dryRun?: boolean;
}

export interface BulkConfigResult {
  operationId: string;
  totalTargeted: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  results: Array<{
    branchId: string;
    branchName: string;
    status: 'success' | 'failed' | 'skipped';
    error?: string;
    changes?: any;
  }>;
  executedAt: Date;
}

export interface ConfigTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  configuration: any;
  applicableToTypes?: string[];
  createdBy: string;
  createdAt: Date;
}

export class BulkBranchConfigService {
  constructor(private pool: Pool) {}

  /**
   * Execute bulk configuration operation
   */
  async executeBulkConfig(
    tenantId: string,
    userId: string,
    operation: BulkConfigOperation
  ): Promise<BulkConfigResult> {
    const operationId = this.generateOperationId();
    const results: BulkConfigResult['results'] = [];

    // Determine target branches
    const targetBranches = await this.resolveTargetBranches(
      tenantId,
      operation.targetBranches,
      operation.applyToRegion,
      operation.applyToAll,
      operation.excludeBranches
    );

    console.log(`Bulk config operation ${operationId}: targeting ${targetBranches.length} branches`);

    // Execute in transaction if not dry run
    const client = await this.pool.connect();
    
    try {
      if (!operation.dryRun) {
        await client.query('BEGIN');
      }

      for (const branch of targetBranches) {
        try {
          let changes: any = {};

          switch (operation.operationType) {
            case 'update':
              changes = await this.updateBranchSettings(
                client,
                branch.id,
                operation.configuration,
                operation.dryRun
              );
              break;

            case 'add_cameras':
              changes = await this.addCamerasToBranch(
                client,
                tenantId,
                branch.id,
                operation.configuration,
                operation.dryRun
              );
              break;

            case 'update_cameras':
              changes = await this.updateBranchCameras(
                client,
                branch.id,
                operation.configuration,
                operation.dryRun
              );
              break;

            case 'update_storage':
              changes = await this.updateBranchStorage(
                client,
                branch.id,
                operation.configuration,
                operation.dryRun
              );
              break;

            case 'update_network':
              changes = await this.updateBranchNetwork(
                client,
                branch.id,
                operation.configuration,
                operation.dryRun
              );
              break;

            case 'update_settings':
              changes = await this.updateBranchSpecificSettings(
                client,
                branch.id,
                operation.configuration,
                operation.dryRun
              );
              break;
          }

          results.push({
            branchId: branch.id,
            branchName: branch.name,
            status: 'success',
            changes
          });
        } catch (error: any) {
          results.push({
            branchId: branch.id,
            branchName: branch.name,
            status: 'failed',
            error: error.message
          });
        }
      }

      if (!operation.dryRun) {
        await client.query('COMMIT');
        
        // Log bulk operation
        await this.logBulkOperation(tenantId, userId, operationId, operation, results);
      }

    } catch (error) {
      if (!operation.dryRun) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      client.release();
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const failureCount = results.filter(r => r.status === 'failed').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;

    return {
      operationId,
      totalTargeted: targetBranches.length,
      successCount,
      failureCount,
      skippedCount,
      results,
      executedAt: new Date()
    };
  }

  /**
   * Resolve target branches based on criteria
   */
  private async resolveTargetBranches(
    tenantId: string,
    branchIds?: string[],
    region?: string,
    applyToAll?: boolean,
    excludeBranches?: string[]
  ): Promise<Array<{ id: string; name: string; code: string }>> {
    let query = `
      SELECT id, name, code, region
      FROM branches
      WHERE tenant_id = $1
        AND status = 'active'
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (branchIds && branchIds.length > 0 && !applyToAll) {
      query += ` AND id = ANY($${paramIndex})`;
      params.push(branchIds);
      paramIndex++;
    }

    if (region) {
      query += ` AND region = $${paramIndex}`;
      params.push(region);
      paramIndex++;
    }

    if (excludeBranches && excludeBranches.length > 0) {
      query += ` AND id != ALL($${paramIndex})`;
      params.push(excludeBranches);
      paramIndex++;
    }

    query += ' ORDER BY name';

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Update branch settings
   */
  private async updateBranchSettings(
    client: any,
    branchId: string,
    config: any,
    dryRun?: boolean
  ): Promise<any> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (config.name) {
      updates.push(`name = $${paramIndex++}`);
      params.push(config.name);
    }

    if (config.contactEmail) {
      updates.push(`contact_email = $${paramIndex++}`);
      params.push(config.contactEmail);
    }

    if (config.contactPhone) {
      updates.push(`contact_phone = $${paramIndex++}`);
      params.push(config.contactPhone);
    }

    if (config.timezone) {
      updates.push(`timezone = $${paramIndex++}`);
      params.push(config.timezone);
    }

    if (config.operatingHours) {
      updates.push(`operating_hours = $${paramIndex++}`);
      params.push(JSON.stringify(config.operatingHours));
    }

    if (updates.length === 0) {
      return { message: 'No updates to apply' };
    }

    const query = `
      UPDATE branches
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    params.push(branchId);

    if (!dryRun) {
      const result = await client.query(query, params);
      return { updated: result.rows[0] };
    }

    return { dryRun: true, wouldUpdate: updates };
  }

  /**
   * Add cameras to branch
   */
  private async addCamerasToBranch(
    client: any,
    tenantId: string,
    branchId: string,
    config: { cameras: Array<{ name: string; rtspUrl: string; location?: string }> },
    dryRun?: boolean
  ): Promise<any> {
    if (!config.cameras || config.cameras.length === 0) {
      return { message: 'No cameras to add' };
    }

    const addedCameras: any[] = [];

    for (const camera of config.cameras) {
      const query = `
        INSERT INTO cameras (
          tenant_id, branch_id, name, rtsp_url, location,
          status, online_status, recording_status
        ) VALUES ($1, $2, $3, $4, $5, 'pending_approval', 'offline', 'stopped')
        RETURNING id, name
      `;

      if (!dryRun) {
        const result = await client.query(query, [
          tenantId,
          branchId,
          camera.name,
          camera.rtspUrl,
          camera.location || null
        ]);
        addedCameras.push(result.rows[0]);
      } else {
        addedCameras.push({ name: camera.name, dryRun: true });
      }
    }

    return { 
      addedCount: config.cameras.length,
      cameras: addedCameras
    };
  }

  /**
   * Update branch cameras configuration
   */
  private async updateBranchCameras(
    client: any,
    branchId: string,
    config: {
      expectedFps?: number;
      retentionDays?: number;
      recordingSchedule?: string;
      enableAnalytics?: boolean;
    },
    dryRun?: boolean
  ): Promise<any> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (config.expectedFps) {
      updates.push(`expected_fps = $${paramIndex++}`);
      params.push(config.expectedFps);
    }

    if (config.retentionDays) {
      updates.push(`retention_days = $${paramIndex++}`);
      params.push(config.retentionDays);
    }

    if (config.recordingSchedule) {
      updates.push(`recording_schedule = $${paramIndex++}`);
      params.push(config.recordingSchedule);
    }

    if (config.enableAnalytics !== undefined) {
      updates.push(`analytics_enabled = $${paramIndex++}`);
      params.push(config.enableAnalytics);
    }

    if (updates.length === 0) {
      return { message: 'No camera updates to apply' };
    }

    const query = `
      UPDATE cameras
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE branch_id = $${paramIndex}
        AND status = 'active'
    `;
    params.push(branchId);

    if (!dryRun) {
      const result = await client.query(query, params);
      return { updatedCount: result.rowCount };
    }

    return { dryRun: true, wouldUpdate: updates };
  }

  /**
   * Update branch storage configuration
   */
  private async updateBranchStorage(
    client: any,
    branchId: string,
    config: {
      retentionDays?: number;
      compressionEnabled?: boolean;
      compressionLevel?: string;
      alertThresholds?: { warning: number; critical: number };
    },
    dryRun?: boolean
  ): Promise<any> {
    // Storage settings are typically in a separate configuration table
    const query = `
      INSERT INTO branch_storage_config (
        branch_id, retention_days, compression_enabled, 
        compression_level, alert_threshold_warning, alert_threshold_critical,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (branch_id) 
      DO UPDATE SET
        retention_days = COALESCE($2, branch_storage_config.retention_days),
        compression_enabled = COALESCE($3, branch_storage_config.compression_enabled),
        compression_level = COALESCE($4, branch_storage_config.compression_level),
        alert_threshold_warning = COALESCE($5, branch_storage_config.alert_threshold_warning),
        alert_threshold_critical = COALESCE($6, branch_storage_config.alert_threshold_critical),
        updated_at = NOW()
      RETURNING *
    `;

    if (!dryRun) {
      const result = await client.query(query, [
        branchId,
        config.retentionDays || null,
        config.compressionEnabled || null,
        config.compressionLevel || null,
        config.alertThresholds?.warning || null,
        config.alertThresholds?.critical || null
      ]);
      return { updated: result.rows[0] };
    }

    return { dryRun: true, configuration: config };
  }

  /**
   * Update branch network configuration
   */
  private async updateBranchNetwork(
    client: any,
    branchId: string,
    config: {
      bandwidthLimit?: number;
      vpnEnabled?: boolean;
      vpnEndpoint?: string;
      qosEnabled?: boolean;
      qosSettings?: any;
    },
    dryRun?: boolean
  ): Promise<any> {
    const query = `
      INSERT INTO branch_network_config (
        branch_id, bandwidth_limit_mbps, vpn_enabled, 
        vpn_endpoint, qos_enabled, qos_settings,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (branch_id)
      DO UPDATE SET
        bandwidth_limit_mbps = COALESCE($2, branch_network_config.bandwidth_limit_mbps),
        vpn_enabled = COALESCE($3, branch_network_config.vpn_enabled),
        vpn_endpoint = COALESCE($4, branch_network_config.vpn_endpoint),
        qos_enabled = COALESCE($5, branch_network_config.qos_enabled),
        qos_settings = COALESCE($6, branch_network_config.qos_settings),
        updated_at = NOW()
      RETURNING *
    `;

    if (!dryRun) {
      const result = await client.query(query, [
        branchId,
        config.bandwidthLimit || null,
        config.vpnEnabled || null,
        config.vpnEndpoint || null,
        config.qosEnabled || null,
        config.qosSettings ? JSON.stringify(config.qosSettings) : null
      ]);
      return { updated: result.rows[0] };
    }

    return { dryRun: true, configuration: config };
  }

  /**
   * Update branch-specific settings
   */
  private async updateBranchSpecificSettings(
    client: any,
    branchId: string,
    config: any,
    dryRun?: boolean
  ): Promise<any> {
    const query = `
      UPDATE branches
      SET settings = settings || $1::jsonb,
          updated_at = NOW()
      WHERE id = $2
      RETURNING settings
    `;

    if (!dryRun) {
      const result = await client.query(query, [JSON.stringify(config), branchId]);
      return { updatedSettings: result.rows[0].settings };
    }

    return { dryRun: true, wouldMerge: config };
  }

  /**
   * Log bulk operation
   */
  private async logBulkOperation(
    tenantId: string,
    userId: string,
    operationId: string,
    operation: BulkConfigOperation,
    results: any[]
  ): Promise<void> {
    const query = `
      INSERT INTO bulk_config_operations (
        id, tenant_id, performed_by, operation_type,
        target_criteria, configuration, total_targeted,
        success_count, failure_count, results_summary,
        executed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    `;

    const successCount = results.filter(r => r.status === 'success').length;
    const failureCount = results.filter(r => r.status === 'failed').length;

    await this.pool.query(query, [
      operationId,
      tenantId,
      userId,
      operation.operationType,
      JSON.stringify({
        targetBranches: operation.targetBranches,
        region: operation.applyToRegion,
        applyToAll: operation.applyToAll
      }),
      JSON.stringify(operation.configuration),
      results.length,
      successCount,
      failureCount,
      JSON.stringify(results)
    ]);
  }

  /**
   * Generate operation ID
   */
  private generateOperationId(): string {
    return `bulk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create configuration template
   */
  async createConfigTemplate(
    tenantId: string,
    userId: string,
    template: {
      name: string;
      description: string;
      category: string;
      configuration: any;
      applicableToTypes?: string[];
    }
  ): Promise<ConfigTemplate> {
    const query = `
      INSERT INTO branch_config_templates (
        tenant_id, name, description, category, configuration,
        applicable_to_types, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      tenantId,
      template.name,
      template.description,
      template.category,
      JSON.stringify(template.configuration),
      template.applicableToTypes || [],
      userId
    ]);

    return result.rows[0];
  }

  /**
   * Get configuration templates
   */
  async getConfigTemplates(
    tenantId: string,
    category?: string
  ): Promise<ConfigTemplate[]> {
    let query = `
      SELECT 
        t.*,
        u.name as created_by_name
      FROM branch_config_templates t
      LEFT JOIN users u ON u.id = t.created_by
      WHERE t.tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (category) {
      query += ` AND t.category = $2`;
      params.push(category);
    }

    query += ` ORDER BY t.created_at DESC`;

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get bulk operation history
   */
  async getBulkOperationHistory(
    tenantId: string,
    filters?: {
      operationType?: string;
      performedBy?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ operations: any[]; total: number }> {
    const conditions = ['tenant_id = $1'];
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters?.operationType) {
      conditions.push(`operation_type = $${paramIndex++}`);
      params.push(filters.operationType);
    }

    if (filters?.performedBy) {
      conditions.push(`performed_by = $${paramIndex++}`);
      params.push(filters.performedBy);
    }

    if (filters?.startDate) {
      conditions.push(`executed_at >= $${paramIndex++}`);
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      conditions.push(`executed_at <= $${paramIndex++}`);
      params.push(filters.endDate);
    }

    const query = `
      SELECT 
        bco.*,
        u.name as performed_by_name
      FROM bulk_config_operations bco
      LEFT JOIN users u ON u.id = bco.performed_by
      WHERE ${conditions.join(' AND ')}
      ORDER BY bco.executed_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(filters?.limit || 50, filters?.offset || 0);

    const countQuery = `
      SELECT COUNT(*) as total
      FROM bulk_config_operations
      WHERE ${conditions.join(' AND ')}
    `;

    const [operationsResult, countResult] = await Promise.all([
      this.pool.query(query, params),
      this.pool.query(countQuery, params.slice(0, -2))
    ]);

    return {
      operations: operationsResult.rows,
      total: parseInt(countResult.rows[0].total)
    };
  }

  /**
   * Clone branch configuration
   */
  async cloneBranchConfig(
    sourceBranchId: string,
    targetBranchIds: string[],
    userId: string,
    includeSettings: {
      cameras?: boolean;
      storage?: boolean;
      network?: boolean;
      general?: boolean;
    }
  ): Promise<BulkConfigResult> {
    // Get source branch configuration
    const sourceQuery = `
      SELECT 
        b.*,
        bsc.* as storage_config,
        bnc.* as network_config
      FROM branches b
      LEFT JOIN branch_storage_config bsc ON bsc.branch_id = b.id
      LEFT JOIN branch_network_config bnc ON bnc.branch_id = b.id
      WHERE b.id = $1
    `;

    const sourceResult = await this.pool.query(sourceQuery, [sourceBranchId]);
    
    if (sourceResult.rows.length === 0) {
      throw new Error('Source branch not found');
    }

    const source = sourceResult.rows[0];

    // Build configuration object
    const configuration: any = {};

    if (includeSettings.general) {
      configuration.general = {
        contactEmail: source.contact_email,
        contactPhone: source.contact_phone,
        timezone: source.timezone,
        operatingHours: source.operating_hours
      };
    }

    if (includeSettings.storage && source.storage_config) {
      configuration.storage = {
        retentionDays: source.retention_days,
        compressionEnabled: source.compression_enabled,
        compressionLevel: source.compression_level
      };
    }

    if (includeSettings.network && source.network_config) {
      configuration.network = {
        bandwidthLimit: source.bandwidth_limit_mbps,
        vpnEnabled: source.vpn_enabled,
        vpnEndpoint: source.vpn_endpoint,
        qosEnabled: source.qos_enabled
      };
    }

    // Execute bulk operation
    const operation: BulkConfigOperation = {
      operationType: 'update',
      targetBranches: targetBranchIds,
      configuration
    };

    return this.executeBulkConfig(source.tenant_id, userId, operation);
  }
}
