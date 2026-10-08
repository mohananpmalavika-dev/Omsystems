/**
 * Recorder Collector
 * 
 * Discovers NVRs and DVRs from device inventory.
 */

import { Pool } from 'pg';
import { BaseCollector } from './base-collector.js';
import {
  DigitalTwinAsset,
  TwinRelationship,
  CollectorResult,
  createAsset,
  RecorderMetadata
} from '../models.js';
import { createConnection, createStorageRelationship } from '../models/relationship.js';

export class RecorderCollector extends BaseCollector {
  constructor(private readonly pool: Pool) {
    super();
  }

  getName(): string {
    return 'RecorderCollector';
  }

  async collect(): Promise<CollectorResult> {
    const assets: DigitalTwinAsset[] = [];
    const relationships: TwinRelationship[] = [];
    const errors: Array<{ message: string; assetId?: string }> = [];

    try {
      // Query recorders from device inventory
      const result = await this.pool.query(`
        SELECT
          di.id,
          di.tenant_id,
          di.branch_node_id,
          di.device_type,
          di.name,
          di.manufacturer,
          di.model,
          di.serial_number,
          di.ip_address,
          di.firmware_version,
          di.status,
          di.health_status,
          di.specifications,
          di.location,
          di.installed_at,
          di.last_maintenance_at,
          di.created_at,
          -- Count cameras using this recorder
          COUNT(c.id) as camera_count
        FROM device_inventory di
        LEFT JOIN cameras c ON c.recorder_id = di.id::text
        WHERE di.category = 'recording'
          AND di.device_type IN ('nvr', 'dvr', 'hybrid-recorder')
        GROUP BY di.id
        ORDER BY di.branch_node_id, di.name
      `);

      for (const row of result.rows) {
        try {
          const recorderId = `${row.device_type}_${row.id}`;
          const assetType = row.device_type === 'dvr' ? 'dvr' : 'nvr';

          // Build recorder metadata
          const metadata: RecorderMetadata = {
            ipAddress: row.ip_address || 'unknown',
            manufacturer: row.manufacturer,
            model: row.model,
            firmware: row.firmware_version,
            channels: row.specifications?.total_channels || 0,
            usedChannels: parseInt(row.camera_count) || 0,
            recordingCapacity: row.specifications?.storage_capacity_gb,
            recordingFormat: row.specifications?.recording_format || 'H.264'
          };

          // Determine status
          const status = this.mapRecorderStatus(row.status, row.health_status);

          // Calculate health score
          const healthScore = this.calculateHealthScore(row);

          // Calculate security score
          const securityScore = this.calculateSecurityScore(row);

          // Create recorder asset
          const asset = createAsset(
            assetType,
            row.name,
            metadata,
            {
              parentId: `branch_${row.branch_node_id}`,
              status,
              criticality: 'critical' // Recorders are always critical
            }
          );

          asset.id = recorderId;
          asset.health.score = healthScore;
          asset.security.score = securityScore;
          asset.location = row.location;
          asset.purpose = `Recording server for ${row.camera_count || 0} cameras`;
          asset.complianceRequired = true; // Recording systems require compliance
          asset.createdAt = row.installed_at ? new Date(row.installed_at) : new Date(row.created_at);

          assets.push(asset);

          // Create network connection relationship
          if (row.ip_address) {
            const switchId = `switch_${row.branch_node_id}_primary`;
            relationships.push(
              createConnection(recorderId, switchId, {
                criticality: 'critical',
                metadata: {
                  bandwidth: '1Gbps',
                  port: 'auto'
                }
              })
            );
          }

          // Create storage relationship
          // Assume storage ID based on branch (can be refined with actual storage inventory)
          const storageId = `storage_${row.branch_node_id}_primary`;
          relationships.push(
            createStorageRelationship(recorderId, storageId, {
              criticality: 'critical',
              metadata: {
                retentionDays: row.specifications?.retention_days || 30
              }
            })
          );

        } catch (error) {
          errors.push(this.handleError(error, `Processing recorder ${row.id}`));
        }
      }

      console.log(`[${this.getName()}] Collected ${assets.length} recorders, ${relationships.length} relationships`);

    } catch (error) {
      errors.push(this.handleError(error, 'Querying recorders'));
    }

    return this.createResult(assets, relationships, errors);
  }

  /**
   * Map recorder status
   */
  private mapRecorderStatus(status: string, healthStatus: string): DigitalTwinAsset['status'] {
    if (status === 'decommissioned' || status === 'retired') {
      return 'offline';
    }

    switch (healthStatus) {
      case 'healthy':
        return 'healthy';
      case 'warning':
        return 'warning';
      case 'critical':
        return 'critical';
      case 'offline':
        return 'offline';
      default:
        return 'unknown';
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
        score = 65;
        break;
      case 'critical':
        score = 25;
        break;
      case 'offline':
        score = 0;
        break;
      default:
        score = 50;
    }

    // Check channel utilization
    const totalChannels = row.specifications?.total_channels || 1;
    const usedChannels = parseInt(row.camera_count) || 0;
    const utilization = usedChannels / totalChannels;

    if (utilization > 0.95) {
      score = Math.max(score - 20, 0); // Near capacity
    } else if (utilization > 0.85) {
      score = Math.max(score - 10, 0);
    }

    // Check storage health
    if (row.specifications?.disk_health === 'failing') {
      score = Math.max(score - 40, 0);
    } else if (row.specifications?.disk_health === 'degraded') {
      score = Math.max(score - 20, 0);
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate security score
   */
  private calculateSecurityScore(row: any): number {
    let score = 100;

    // Check firmware version
    if (!row.firmware_version) {
      score -= 25;
    }

    // Check if using HTTPS
    if (row.specifications?.https_enabled === false) {
      score -= 20;
    }

    // Check if default admin password changed
    if (row.specifications?.default_password === true) {
      score -= 40; // Critical security issue
    }

    // Check encryption at rest
    if (row.specifications?.encryption_at_rest === false) {
      score -= 15;
    }

    return Math.max(0, Math.min(100, score));
  }
}
