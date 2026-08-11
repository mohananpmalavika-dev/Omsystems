/**
 * Camera Service Provider
 * 
 * Connects AI Assistant camera service interface to existing backend infrastructure.
 */

import type { Pool } from 'pg';
import type {
  CameraService,
  Camera,
  CameraRuntimeState,
  CameraResolutionResult
} from '../services/camera-service.interface.js';
import { CameraStatus } from '../services/camera-service.interface.js';

/**
 * Maps database camera status to service interface status
 */
function mapCameraStatus(dbStatus: string): CameraStatus {
  const statusMap: Record<string, CameraStatus> = {
    'online': CameraStatus.ONLINE,
    'offline': CameraStatus.OFFLINE,
    'starting': CameraStatus.STARTING,
    'stopping': CameraStatus.STOPPING,
    'error': CameraStatus.ERROR
  };
  
  return statusMap[dbStatus?.toLowerCase()] || CameraStatus.UNKNOWN;
}

/**
 * Camera Service Provider Implementation
 */
export class CameraServiceProvider implements CameraService {
  constructor(private readonly pool: Pool) {}
  
  async resolve(reference: string): Promise<CameraResolutionResult> {
    // Try exact ID match first
    const exactMatch = await this.getById(reference);
    
    if (exactMatch) {
      return {
        found: true,
        ambiguous: false,
        camera: exactMatch
      };
    }
    
    // Try name or partial name match
    const query = `
      SELECT 
        c.id,
        c.name,
        c.site_id,
        c.location,
        c.type,
        c.status,
        c.stream_url
      FROM cameras c
      WHERE 
        LOWER(c.name) LIKE LOWER($1)
        OR LOWER(c.id) = LOWER($2)
      LIMIT 10
    `;
    
    const result = await this.pool.query(query, [`%${reference}%`, reference]);
    
    if (result.rows.length === 0) {
      return {
        found: false,
        ambiguous: false
      };
    }
    
    if (result.rows.length === 1) {
      return {
        found: true,
        ambiguous: false,
        camera: this.mapRowToCamera(result.rows[0])
      };
    }
    
    // Multiple matches - ambiguous
    return {
      found: true,
      ambiguous: true,
      matches: result.rows.map(row => this.mapRowToCamera(row))
    };
  }
  
  async getById(cameraId: string): Promise<Camera | null> {
    const query = `
      SELECT 
        c.id,
        c.name,
        c.site_id,
        c.location,
        c.type,
        c.status,
        c.stream_url
      FROM cameras c
      WHERE c.id = $1
    `;
    
    const result = await this.pool.query(query, [cameraId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToCamera(result.rows[0]);
  }
  
  async findByLocation(location: string): Promise<Camera[]> {
    const query = `
      SELECT 
        c.id,
        c.name,
        c.site_id,
        c.location,
        c.type,
        c.status,
        c.stream_url
      FROM cameras c
      WHERE LOWER(c.location) LIKE LOWER($1)
      ORDER BY c.name
    `;
    
    const result = await this.pool.query(query, [`%${location}%`]);
    
    return result.rows.map(row => this.mapRowToCamera(row));
  }
  
  async findBySite(siteId: string): Promise<Camera[]> {
    const query = `
      SELECT 
        c.id,
        c.name,
        c.site_id,
        c.location,
        c.type,
        c.status,
        c.stream_url
      FROM cameras c
      WHERE c.site_id = $1
      ORDER BY c.name
    `;
    
    const result = await this.pool.query(query, [siteId]);
    
    return result.rows.map(row => this.mapRowToCamera(row));
  }
  
  async getRuntimeState(cameraId: string): Promise<CameraRuntimeState> {
    // Query camera state from operational health or camera status table
    const query = `
      SELECT 
        c.id as camera_id,
        c.status,
        c.stream_url,
        c.recording_active,
        c.analytics_enabled,
        c.last_frame_at,
        c.uptime_seconds
      FROM cameras c
      WHERE c.id = $1
    `;
    
    const result = await this.pool.query(query, [cameraId]);
    
    if (result.rows.length === 0) {
      // Camera doesn't exist
      return {
        cameraId,
        status: CameraStatus.UNKNOWN,
        streamConnected: false,
        recordingActive: false,
        analyticsActive: false
      };
    }
    
    const row = result.rows[0];
    
    return {
      cameraId: row.camera_id,
      status: mapCameraStatus(row.status),
      streamConnected: !!row.stream_url,
      recordingActive: row.recording_active || false,
      analyticsActive: row.analytics_enabled || false,
      lastFrameAt: row.last_frame_at ? new Date(row.last_frame_at) : undefined,
      uptime: row.uptime_seconds
    };
  }
  
  async list(filter?: {
    siteIds?: string[];
    status?: CameraStatus;
    location?: string;
  }): Promise<Camera[]> {
    let query = `
      SELECT 
        c.id,
        c.name,
        c.site_id,
        c.location,
        c.type,
        c.status,
        c.stream_url
      FROM cameras c
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramIndex = 1;
    
    if (filter?.siteIds && filter.siteIds.length > 0) {
      query += ` AND c.site_id = ANY($${paramIndex})`;
      params.push(filter.siteIds);
      paramIndex++;
    }
    
    if (filter?.status) {
      query += ` AND LOWER(c.status) = LOWER($${paramIndex})`;
      params.push(filter.status);
      paramIndex++;
    }
    
    if (filter?.location) {
      query += ` AND LOWER(c.location) LIKE LOWER($${paramIndex})`;
      params.push(`%${filter.location}%`);
      paramIndex++;
    }
    
    query += ` ORDER BY c.name`;
    
    const result = await this.pool.query(query, params);
    
    return result.rows.map(row => this.mapRowToCamera(row));
  }
  
  /**
   * Map database row to Camera interface
   */
  private mapRowToCamera(row: any): Camera {
    return {
      id: row.id,
      name: row.name,
      siteId: row.site_id,
      location: row.location,
      type: row.type,
      status: mapCameraStatus(row.status),
      streamUrl: row.stream_url,
      metadata: {
        // Include any additional fields
      }
    };
  }
}
