/**
 * Zone Service
 * Manages polygonal zones on floor plans for analytics and access control
 */

import { pool } from '../config/database';
import {
  DigitalTwinZone,
  CreateZoneRequest,
  NormalizedPosition,
} from '../types/digital-twin';

export class ZoneService {
  async createZone(request: CreateZoneRequest, userId: string): Promise<DigitalTwinZone> {
    const result = await pool.query(
      `INSERT INTO digital_twin_zones 
       (floor_id, name, description, zone_type, vertices, fill_color, fill_opacity, 
        stroke_color, stroke_width, is_restricted, alert_on_entry, alert_on_dwell, 
        max_dwell_seconds, analytics_enabled, analytics_config, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING *`,
      [
        request.floorId,
        request.name,
        request.description,
        request.zoneType,
        JSON.stringify(request.vertices),
        request.fillColor || '#FF0000',
        request.fillOpacity || 0.2,
        request.strokeColor || '#FF0000',
        request.strokeWidth || 2,
        request.isRestricted || false,
        request.alertOnEntry || false,
        request.alertOnDwell || false,
        request.maxDwellSeconds,
        request.analyticsEnabled || false,
        JSON.stringify(request.analyticsConfig || {}),
        JSON.stringify(request.metadata || {}),
        userId,
      ]
    );

    return this.mapZone(result.rows[0]);
  }

  async getZone(zoneId: string): Promise<DigitalTwinZone | null> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_zones WHERE id = $1',
      [zoneId]
    );
    
    return result.rows[0] ? this.mapZone(result.rows[0]) : null;
  }

  async listZones(floorId: string, zoneType?: string): Promise<DigitalTwinZone[]> {
    let query = 'SELECT * FROM digital_twin_zones WHERE floor_id = $1';
    const params: any[] = [floorId];
    
    if (zoneType) {
      query += ' AND zone_type = $2';
      params.push(zoneType);
    }
    
    query += ' ORDER BY name';
    
    const result = await pool.query(query, params);
    
    return result.rows.map(this.mapZone);
  }

  async updateZone(
    zoneId: string,
    updates: Partial<CreateZoneRequest>,
    userId: string
  ): Promise<DigitalTwinZone> {
    const result = await pool.query(
      `UPDATE digital_twin_zones 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           zone_type = COALESCE($3, zone_type),
           vertices = COALESCE($4, vertices),
           fill_color = COALESCE($5, fill_color),
           fill_opacity = COALESCE($6, fill_opacity),
           stroke_color = COALESCE($7, stroke_color),
           stroke_width = COALESCE($8, stroke_width),
           is_restricted = COALESCE($9, is_restricted),
           alert_on_entry = COALESCE($10, alert_on_entry),
           alert_on_dwell = COALESCE($11, alert_on_dwell),
           max_dwell_seconds = COALESCE($12, max_dwell_seconds),
           analytics_enabled = COALESCE($13, analytics_enabled),
           analytics_config = COALESCE($14, analytics_config),
           metadata = COALESCE($15, metadata),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $16
       RETURNING *`,
      [
        updates.name,
        updates.description,
        updates.zoneType,
        updates.vertices ? JSON.stringify(updates.vertices) : null,
        updates.fillColor,
        updates.fillOpacity,
        updates.strokeColor,
        updates.strokeWidth,
        updates.isRestricted,
        updates.alertOnEntry,
        updates.alertOnDwell,
        updates.maxDwellSeconds,
        updates.analyticsEnabled,
        updates.analyticsConfig ? JSON.stringify(updates.analyticsConfig) : null,
        updates.metadata ? JSON.stringify(updates.metadata) : null,
        zoneId,
      ]
    );

    return this.mapZone(result.rows[0]);
  }

  async deleteZone(zoneId: string, userId: string): Promise<void> {
    await pool.query('DELETE FROM digital_twin_zones WHERE id = $1', [zoneId]);
  }

  // Check if a point is inside a zone (ray casting algorithm)
  isPointInZone(point: NormalizedPosition, zone: DigitalTwinZone): boolean {
    const vertices = zone.vertices;
    let inside = false;
    
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x;
      const yi = vertices[i].y;
      const xj = vertices[j].x;
      const yj = vertices[j].y;
      
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      
      if (intersect) inside = !inside;
    }
    
    return inside;
  }

  // Calculate zone area (in normalized coordinate space)
  calculateZoneArea(zone: DigitalTwinZone): number {
    const vertices = zone.vertices;
    let area = 0;
    
    for (let i = 0; i < vertices.length; i++) {
      const j = (i + 1) % vertices.length;
      area += vertices[i].x * vertices[j].y;
      area -= vertices[j].x * vertices[i].y;
    }
    
    return Math.abs(area / 2);
  }

  // Find zones containing a specific point
  async findZonesContainingPoint(
    floorId: string,
    point: NormalizedPosition
  ): Promise<DigitalTwinZone[]> {
    const zones = await this.listZones(floorId);
    
    return zones.filter(zone => this.isPointInZone(point, zone));
  }

  // Get restricted zones
  async getRestrictedZones(floorId: string): Promise<DigitalTwinZone[]> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_zones WHERE floor_id = $1 AND is_restricted = true',
      [floorId]
    );
    
    return result.rows.map(this.mapZone);
  }

  private mapZone(row: any): DigitalTwinZone {
    return {
      id: row.id,
      floorId: row.floor_id,
      name: row.name,
      description: row.description,
      zoneType: row.zone_type,
      vertices: row.vertices,
      fillColor: row.fill_color,
      fillOpacity: parseFloat(row.fill_opacity),
      strokeColor: row.stroke_color,
      strokeWidth: parseFloat(row.stroke_width),
      isRestricted: row.is_restricted,
      alertOnEntry: row.alert_on_entry,
      alertOnDwell: row.alert_on_dwell,
      maxDwellSeconds: row.max_dwell_seconds,
      analyticsEnabled: row.analytics_enabled,
      analyticsConfig: row.analytics_config,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
    };
  }
}

export default new ZoneService();
