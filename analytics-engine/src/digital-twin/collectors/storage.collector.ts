/**
 * Storage Collector
 * 
 * Discovers storage systems from device inventory and recording storage nodes.
 */

import { Pool } from 'pg';
import { BaseCollector } from './base-collector';
import {
  DigitalTwinAsset,
  TwinRelationship,
  CollectorResult,
  createAsset,
  StorageMetadata
} from '../models';

export class StorageCollector extends BaseCollector {
  constructor(private readonly pool: Pool) {
    super();
  }

  getName(): string {
    return 'StorageCollector';
  }

  async collect(): Promise<CollectorResult> {
    const assets: DigitalTwinAsset[] = [];
    const relationships: TwinRelationship[] = [];
    const errors: Array<{ message: string; assetId?: string }> = [];

    try {
      // Query storage from recording_storage_nodes table
      const storageResult = await this.pool.query(`
        SELECT
          id,
          tenant_id,
          external_id,
          name,
          storage_type,
          root_path,
          capacity_bytes,
          used_bytes,
          available_bytes,
          retention_days,
          status,
          health_status,
          last_health_check,
          created_at
        FROM recording_storage_nodes
        WHERE status != 'decommissioned'
        ORDER BY name
      `);

      for (const row of storageResult.rows) {
        try {
          const storageId = `storage_${row.external_id || row.id}`;

          // Build storage metadata
          const metadata: StorageMetadata = {
            capacityBytes: parseInt(row.capacity_bytes) || 0,
            usedBytes: parseInt(row.used_bytes) || 0,
            freeBytes: parseInt(row.available_bytes) || 0,
            retentionDays: row.retention_days || 30,
            location: row.root_path,
            redundancy: row.storage_type?.includes('raid') || false,
            compressionEnabled: row.storage_type?.includes('compressed') || false
          };

          // Determine status
          const status = this.mapStorageStatus(row.status, row.health_status);

          // Calculate health score
          const healthScore = this.calculateHealthScore(row);

          // Calculate security score
          const securityScore = this.calculateSecurityScore(row);

          // Create storage asset
          const asset = createAsset(
            'storage',
            row.name,
            metadata,
            {
              parentId: undefined, // Storage can be tenant-level or branch-level
              status,
              criticality: 'critical' // Storage is always critical
            }
          );

          asset.id = storageId;
          asset.health.score = healthScore;
          asset.security.score = securityScore;
          asset.purpose = `Recording storage with ${row.retention_days || 30} day retention`;
          asset.complianceRequired = true;
          asset.createdAt = new Date(row.created_at);

          assets.push(asset);

        } catch (error) {
          errors.push(this.handleError(error, `Processing storage ${row.id}`));
        }
      }

      // Also query storage devices from device inventory
      const deviceResult = await this.pool.query(`
        SELECT
          id,
          tenant_id,
          branch_node_id,
          name,
          manufacturer,
          model,
          serial_number,
          status,
          health_status,
          specifications,
          location,
          installed_at,
          created_at
        FROM device_inventory
        WHERE category = 'storage'
          AND device_type IN ('san', 'nas', 'disk-array')
        ORDER BY branch_node_id, name
      `);

      for (const row of deviceResult.rows) {
        try {
          const storageId = `storage_${row.id}`;

          const capacityBytes = row.specifications?.capacity_tb 
            ? row.specifications.capacity_tb * 1024 * 1024 * 1024 * 1024
            : 0;

          const usedBytes = row.specifications?.used_tb
            ? row.specifications.used_tb * 1024 * 1024 * 1024 * 1024
            : 0;

          // Build storage metadata
          const metadata: StorageMetadata = {
            capacityBytes,
            usedBytes,
            freeBytes: capacityBytes - usedBytes,
            raid: row.specifications?.raid_level,
            retentionDays: row.specifications?.retention_days || 30,
            redundancy: row.specifications?.redundancy || false,
            compressionEnabled: row.specifications?.compression || false
          };

          // Determine status
          const status = this.mapStorageStatus(row.status, row.health_status);

          // Calculate health score
          const healthScore = this.calculateHealthScore(row);

          // Calculate security score
          const securityScore = this.calculateSecurityScore(row);

          // Create storage asset
          const asset = createAsset(
            'storage',
            row.name,
            metadata,
            {
              parentId: row.branch_node_id ? `branch_${row.branch_node_id}` : undefined,
              status,
              criticality: 'critical'
            }
          );

          asset.id = storageId;
          asset.health.score = healthScore;
          asset.security.score = securityScore;
          asset.location = row.location;
          asset.purpose = `${row.manufacturer || ''} ${row.model || ''} storage array`.trim();
          asset.complianceRequired = true;
          asset.createdAt = row.installed_at ? new Date(row.installed_at) : new Date(row.created_at);

          assets.push(asset);

        } catch (error) {
          errors.push(this.handleError(error, `Processing storage device ${row.id}`));
        }
      }

      console.log(`[${this.getName()}] Collected ${assets.length} storage systems, ${relationships.length} relationships`);

    } catch (error) {
      errors.push(this.handleError(error, 'Querying storage systems'));
    }

    return this.createResult(assets, relationships, errors);
  }

  /**
   * Map storage status
   */
  private mapStorageStatus(status: string, healthStatus?: string): DigitalTwinAsset['status'] {
    if (status === 'decommissioned' || status === 'offline') {
      return 'offline';
    }

    if (status === 'maintenance') {
      return 'maintenance';
    }

    switch (healthStatus) {
      case 'healthy':
        return 'healthy';
      case 'warning':
        return 'warning';
      case 'critical':
        return 'critical';
      case 'degraded':
        return 'degraded';
      case 'offline':
        return 'offline';
      default:
        return status === 'active' ? 'healthy' : 'unknown';
    }
  }

  /**
   * Calculate health score
   */
  private calculateHealthScore(row: any): number {
    let score = 100;

    // Map health status
    switch (row.health_status) {
      case 'healthy':
        score = 100;
        break;
      case 'warning':
        score = 60;
        break;
      case 'degraded':
        score = 40;
        break;
      case 'critical':
        score = 15;
        break;
      case 'offline':
        score = 0;
        break;
      default:
        score = 70;
    }

    // Check capacity utilization
    const capacityBytes = parseInt(row.capacity_bytes || row.specifications?.capacity_tb * 1024 * 1024 * 1024 * 1024) || 0;
    const usedBytes = parseInt(row.used_bytes || row.specifications?.used_tb * 1024 * 1024 * 1024 * 1024) || 0;

    if (capacityBytes > 0) {
      const utilization = usedBytes / capacityBytes;
      
      if (utilization > 0.95) {
        score = Math.max(score - 40, 0); // Critical: near full
      } else if (utilization > 0.85) {
        score = Math.max(score - 25, 0); // Warning: high usage
      } else if (utilization > 0.75) {
        score = Math.max(score - 10, 0); // Moderate usage
      }
    }

    // Check RAID health
    if (row.specifications?.raid_status === 'degraded') {
      score = Math.max(score - 30, 0);
    } else if (row.specifications?.raid_status === 'failed') {
      score = Math.max(score - 60, 0);
    }

    // Check disk health
    if (row.specifications?.failed_disks > 0) {
      score = Math.max(score - (row.specifications.failed_disks * 15), 0);
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate security score
   */
  private calculateSecurityScore(row: any): number {
    let score = 100;

    // Check encryption at rest
    if (row.specifications?.encryption_at_rest === false) {
      score -= 30;
    }

    // Check access controls
    if (row.specifications?.access_control === 'none') {
      score -= 25;
    }

    // Check backup configuration
    if (row.specifications?.backup_enabled === false) {
      score -= 20;
    }

    // Check redundancy
    if (!row.specifications?.redundancy && !row.specifications?.raid_level) {
      score -= 15;
    }

    // Check network isolation
    if (row.specifications?.network_isolated === false) {
      score -= 10;
    }

    return Math.max(0, Math.min(100, score));
  }
}
