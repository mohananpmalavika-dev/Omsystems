/**
 * Network Collector
 * 
 * Discovers network infrastructure (switches, gateways, VLANs) from device inventory.
 */

import { Pool } from 'pg';
import { BaseCollector } from './base-collector.js';
import {
  DigitalTwinAsset,
  TwinRelationship,
  CollectorResult,
  createAsset,
  NetworkDeviceMetadata
} from '../models.js';
import { createUplinkRelationship, createDependency } from '../models/relationship.js';

export class NetworkCollector extends BaseCollector {
  constructor(private readonly pool: Pool) {
    super();
  }

  getName(): string {
    return 'NetworkCollector';
  }

  async collect(): Promise<CollectorResult> {
    const assets: DigitalTwinAsset[] = [];
    const relationships: TwinRelationship[] = [];
    const errors: Array<{ message: string; assetId?: string }> = [];

    try {
      // Query network devices from device inventory
      const result = await this.pool.query(`
        SELECT
          id,
          tenant_id,
          branch_node_id,
          category,
          device_type,
          name,
          manufacturer,
          model,
          serial_number,
          mac_address,
          ip_address,
          firmware_version,
          status,
          health_status,
          specifications,
          location,
          installed_at,
          last_maintenance_at,
          created_at
        FROM device_inventory
        WHERE category IN ('network', 'connectivity')
          AND device_type IN ('switch', 'router', 'gateway', 'firewall', 'access-point')
        ORDER BY branch_node_id, device_type, name
      `);

      for (const row of result.rows) {
        try {
          const deviceId = this.getDeviceId(row);
          const assetType = this.mapDeviceType(row.device_type);

          // Build network device metadata
          const metadata: NetworkDeviceMetadata = {
            ipAddress: row.ip_address || 'unknown',
            macAddress: row.mac_address,
            manufacturer: row.manufacturer,
            model: row.model,
            firmware: row.firmware_version,
            ports: row.specifications?.ports,
            poeEnabled: row.specifications?.poe_enabled || false,
            bandwidth: row.specifications?.bandwidth
          };

          // Determine status
          const status = this.mapNetworkStatus(row.status, row.health_status);

          // Calculate health score
          const healthScore = this.calculateHealthScore(row);

          // Calculate security score
          const securityScore = this.calculateSecurityScore(row);

          // Create network device asset
          const asset = createAsset(
            assetType,
            row.name,
            metadata,
            {
              parentId: `branch_${row.branch_node_id}`,
              status,
              criticality: this.determineCriticality(row.device_type)
            }
          );

          asset.id = deviceId;
          asset.health.score = healthScore;
          asset.security.score = securityScore;
          asset.location = row.location;
          asset.purpose = `${row.device_type} for ${row.location || 'network'}`;
          asset.createdAt = row.installed_at ? new Date(row.installed_at) : new Date(row.created_at);

          assets.push(asset);

          // Create uplink relationships for hierarchical network topology
          if (row.device_type === 'switch' && row.specifications?.uplink_to) {
            const uplinkId = `gateway_${row.branch_node_id}_primary`;
            relationships.push(
              createUplinkRelationship(deviceId, uplinkId, 'critical')
            );
          }

          // Gateways connect to enterprise/regional network
          if (row.device_type === 'gateway' || row.device_type === 'router') {
            const regionId = `region_${row.tenant_id}`;
            relationships.push(
              createDependency(deviceId, regionId, 'high')
            );
          }

        } catch (error) {
          errors.push(this.handleError(error, `Processing network device ${row.id}`));
        }
      }

      // Create synthetic branch network aggregates
      const branchNetworks = await this.createBranchNetworkAssets();
      assets.push(...branchNetworks.assets);
      relationships.push(...branchNetworks.relationships);

      console.log(`[${this.getName()}] Collected ${assets.length} network devices, ${relationships.length} relationships`);

    } catch (error) {
      errors.push(this.handleError(error, 'Querying network devices'));
    }

    return this.createResult(assets, relationships, errors);
  }

  /**
   * Create branch-level network aggregate assets
   */
  private async createBranchNetworkAssets(): Promise<{
    assets: DigitalTwinAsset[];
    relationships: TwinRelationship[];
  }> {
    const assets: DigitalTwinAsset[] = [];
    const relationships: TwinRelationship[] = [];

    try {
      // Get distinct branches
      const result = await this.pool.query(`
        SELECT DISTINCT branch_node_id
        FROM device_inventory
        WHERE category = 'network'
      `);

      for (const row of result.rows) {
        const branchId = `branch_${row.branch_node_id}`;
        const networkId = `network_${row.branch_node_id}`;

        const asset = createAsset(
          'network',
          `Branch Network`,
          {
            type: 'lan',
            managed: true
          },
          {
            parentId: branchId,
            status: 'healthy',
            criticality: 'critical'
          }
        );

        asset.id = networkId;
        asset.purpose = 'Local area network for branch surveillance infrastructure';
        
        assets.push(asset);
      }
    } catch (error) {
      console.error('[NetworkCollector] Error creating branch networks:', error);
    }

    return { assets, relationships };
  }

  /**
   * Generate device ID
   */
  private getDeviceId(row: any): string {
    const type = this.mapDeviceType(row.device_type);
    return `${type}_${row.id}`;
  }

  /**
   * Map device type to asset type
   */
  private mapDeviceType(deviceType: string): DigitalTwinAsset['type'] {
    switch (deviceType.toLowerCase()) {
      case 'switch':
        return 'switch';
      case 'router':
      case 'gateway':
        return 'gateway';
      default:
        return 'network';
    }
  }

  /**
   * Map network device status
   */
  private mapNetworkStatus(status: string, healthStatus: string): DigitalTwinAsset['status'] {
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
        score = 70;
        break;
      case 'critical':
        score = 30;
        break;
      case 'offline':
        score = 0;
        break;
      default:
        score = 50;
    }

    // Check maintenance schedule
    if (row.last_maintenance_at) {
      const daysSinceMaintenance = (Date.now() - new Date(row.last_maintenance_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceMaintenance > 365) {
        score = Math.max(score - 20, 0);
      }
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
      score -= 20;
    }

    // Check if device has known IP
    if (!row.ip_address) {
      score -= 15;
    }

    // Check if MAC address is known
    if (!row.mac_address) {
      score -= 10;
    }

    // Firewall devices should be more secure
    if (row.device_type === 'firewall' && row.specifications?.rules_enabled === false) {
      score -= 30;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Determine criticality based on device type
   */
  private determineCriticality(deviceType: string): 'critical' | 'high' | 'medium' | 'low' {
    switch (deviceType.toLowerCase()) {
      case 'gateway':
      case 'router':
      case 'firewall':
        return 'critical';
      case 'switch':
        return 'high';
      case 'access-point':
        return 'medium';
      default:
        return 'medium';
    }
  }
}
