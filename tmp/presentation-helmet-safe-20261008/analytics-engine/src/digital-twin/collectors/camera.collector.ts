/**
 * Camera Collector
 * 
 * Discovers cameras from the camera repository and creates digital twin assets.
 */

import { Pool } from 'pg';
import { BaseCollector } from './base-collector.js';
import { 
  DigitalTwinAsset, 
  TwinRelationship, 
  CollectorResult,
  createAsset,
  CameraMetadata
} from '../models.js';
import { createConnection, createRecordingRelationship } from '../models/relationship.js';

export class CameraCollector extends BaseCollector {
  constructor(private readonly pool: Pool) {
    super();
  }

  getName(): string {
    return 'CameraCollector';
  }

  async collect(): Promise<CollectorResult> {
    const assets: DigitalTwinAsset[] = [];
    const relationships: TwinRelationship[] = [];
    const errors: Array<{ message: string; assetId?: string }> = [];

    try {
      // Query all cameras from database
      const result = await this.pool.query(`
        SELECT
          c.id,
          c.name,
          c.branch_node_id,
          c.vendor,
          c.model,
          c.status,
          c.ip_address,
          c.mac_address,
          c.serial_number,
          c.firmware_version,
          c.protocol,
          c.profiles,
          c.capabilities,
          c.recorder_id,
          c.recorder_channel,
          c.edge_agent_id,
          c.first_seen_at,
          c.identity_last_seen_at,
          -- Get specifications if available
          cs.resolution,
          cs.fps,
          cs.ptz_capable,
          cs.storage_days,
          cs.zone,
          cs.location,
          cs.purpose,
          cs.installation_date,
          -- Get compliance info
          cc.compliance_required,
          cc.criticality
        FROM cameras c
        LEFT JOIN camera_specifications cs ON c.id = cs.camera_id
        LEFT JOIN camera_compliance cc ON c.id = cc.camera_id
        ORDER BY c.branch_node_id, c.name
      `);

      for (const row of result.rows) {
        try {
          const cameraId = `camera_${row.id}`;
          
          // Build camera metadata
          const metadata: CameraMetadata = {
            ipAddress: row.ip_address || 'unknown',
            macAddress: row.mac_address,
            manufacturer: row.vendor,
            model: row.model,
            firmware: row.firmware_version,
            resolution: row.resolution,
            fps: row.fps,
            protocol: row.protocol,
            streamUrl: row.ip_address ? `rtsp://${row.ip_address}` : undefined,
            ptzCapable: row.ptz_capable || false,
            zone: row.zone,
            coverage: []
          };

          // Determine criticality
          const criticality = row.criticality || this.determineCriticality(row);
          
          // Determine status
          const status = this.mapCameraStatus(row.status);
          
          // Calculate health score
          const healthScore = this.calculateHealthScore(row);
          
          // Calculate security score
          const securityScore = this.calculateSecurityScore(row);

          // Create camera asset
          const asset = createAsset(
            'camera',
            row.name,
            metadata,
            {
              parentId: `branch_${row.branch_node_id}`,
              status,
              criticality
            }
          );

          // Override with calculated scores
          asset.id = cameraId;
          asset.health.score = healthScore;
          asset.health.lastSeen = row.identity_last_seen_at ? new Date(row.identity_last_seen_at) : undefined;
          asset.security.score = securityScore;
          asset.location = row.location;
          asset.purpose = row.purpose;
          asset.complianceRequired = row.compliance_required || false;
          asset.createdAt = row.installation_date ? new Date(row.installation_date) : new Date(row.first_seen_at);

          assets.push(asset);

          // Create network connection relationship if edge agent exists
          if (row.edge_agent_id) {
            const switchId = `switch_${row.branch_node_id}_primary`; // Infer switch from branch
            relationships.push(
              createConnection(cameraId, switchId, {
                criticality: 'high',
                metadata: {
                  port: 'auto',
                  protocol: row.protocol
                }
              })
            );
          }

          // Create recording relationship if recorder exists
          if (row.recorder_id) {
            const recorderId = `nvr_${row.recorder_id}`;
            relationships.push(
              createRecordingRelationship(cameraId, recorderId, {
                criticality: 'critical',
                metadata: {
                  channel: row.recorder_channel,
                  recordingMode: 'continuous'
                }
              })
            );
          }

        } catch (error) {
          errors.push(this.handleError(error, `Processing camera ${row.id}`));
        }
      }

      console.log(`[${this.getName()}] Collected ${assets.length} cameras, ${relationships.length} relationships`);

    } catch (error) {
      errors.push(this.handleError(error, 'Querying cameras'));
    }

    return this.createResult(assets, relationships, errors);
  }

  /**
   * Map camera status to digital twin status
   */
  private mapCameraStatus(status: string): DigitalTwinAsset['status'] {
    switch (status) {
      case 'online':
        return 'healthy';
      case 'offline':
        return 'offline';
      case 'degraded':
        return 'degraded';
      case 'error':
        return 'critical';
      default:
        return 'unknown';
    }
  }

  /**
   * Calculate health score based on camera state
   */
  private calculateHealthScore(row: any): number {
    let score = 100;

    // Reduce score for offline status
    if (row.status === 'offline') {
      score = 0;
    } else if (row.status === 'degraded') {
      score = 50;
    } else if (row.status === 'error') {
      score = 25;
    }

    // Check last seen time
    if (row.identity_last_seen_at) {
      const lastSeen = new Date(row.identity_last_seen_at);
      const hoursSinceLastSeen = (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceLastSeen > 24) {
        score = Math.max(score - 30, 0);
      } else if (hoursSinceLastSeen > 1) {
        score = Math.max(score - 10, 0);
      }
    }

    // Reduce score if no IP address
    if (!row.ip_address) {
      score = Math.max(score - 20, 0);
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate security score based on camera configuration
   */
  private calculateSecurityScore(row: any): number {
    let score = 100;
    let issues = 0;

    // Check firmware version
    if (!row.firmware_version) {
      score -= 15;
      issues++;
    }

    // Check if using secure protocol
    if (row.protocol === 'rtsp' && !row.ip_address?.includes('rtsps://')) {
      score -= 10; // Insecure protocol
      issues++;
    }

    // Check if MAC address is known (for network security)
    if (!row.mac_address) {
      score -= 5;
    }

    // Default credentials check would go here if we had that data
    // For now, assume moderate security

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Determine criticality if not explicitly set
   */
  private determineCriticality(row: any): 'critical' | 'high' | 'medium' | 'low' {
    const location = (row.location || '').toLowerCase();
    const purpose = (row.purpose || '').toLowerCase();

    // Critical locations
    if (
      location.includes('vault') ||
      location.includes('atm') ||
      location.includes('entrance') ||
      location.includes('exit') ||
      purpose.includes('security') ||
      purpose.includes('compliance')
    ) {
      return 'critical';
    }

    // High priority
    if (
      location.includes('cash') ||
      location.includes('teller') ||
      location.includes('parking') ||
      purpose.includes('monitoring')
    ) {
      return 'high';
    }

    // Default to medium
    return 'medium';
  }
}
