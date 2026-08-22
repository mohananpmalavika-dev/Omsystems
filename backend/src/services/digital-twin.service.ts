/**
 * Digital Twin Service
 * Core service for managing Digital Twin sites, buildings, floors, and operations
 */

import { pool } from '../config/database';
import {
  DigitalTwinSite,
  DigitalTwinBuilding,
  DigitalTwinFloor,
  CreateSiteRequest,
  CreateBuildingRequest,
  CreateFloorRequest,
} from '../types/digital-twin';

export class DigitalTwinService {
  // ==================== Sites ====================
  
  async createSite(request: CreateSiteRequest, userId: string): Promise<DigitalTwinSite> {
    const result = await pool.query(
      `INSERT INTO digital_twin_sites 
       (organization_id, name, description, address, latitude, longitude, timezone, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        request.organizationId,
        request.name,
        request.description,
        request.address,
        request.latitude,
        request.longitude,
        request.timezone || 'UTC',
        JSON.stringify(request.metadata || {}),
        userId,
      ]
    );

    await this.logAudit(userId, 'create', 'site', result.rows[0].id, null, result.rows[0]);
    
    return this.mapSite(result.rows[0]);
  }

  async getSite(siteId: string): Promise<DigitalTwinSite | null> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_sites WHERE id = $1',
      [siteId]
    );
    
    return result.rows[0] ? this.mapSite(result.rows[0]) : null;
  }

  async listSites(organizationId: string): Promise<DigitalTwinSite[]> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_sites WHERE organization_id = $1 ORDER BY name',
      [organizationId]
    );
    
    return result.rows.map(this.mapSite);
  }

  async updateSite(
    siteId: string,
    updates: Partial<CreateSiteRequest>,
    userId: string
  ): Promise<DigitalTwinSite> {
    const existing = await this.getSite(siteId);
    
    const result = await pool.query(
      `UPDATE digital_twin_sites 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           address = COALESCE($3, address),
           latitude = COALESCE($4, latitude),
           longitude = COALESCE($5, longitude),
           timezone = COALESCE($6, timezone),
           metadata = COALESCE($7, metadata),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [
        updates.name,
        updates.description,
        updates.address,
        updates.latitude,
        updates.longitude,
        updates.timezone,
        updates.metadata ? JSON.stringify(updates.metadata) : null,
        siteId,
      ]
    );

    await this.logAudit(userId, 'update', 'site', siteId, existing, result.rows[0]);
    
    return this.mapSite(result.rows[0]);
  }

  async deleteSite(siteId: string, userId: string): Promise<void> {
    const existing = await this.getSite(siteId);
    
    await pool.query('DELETE FROM digital_twin_sites WHERE id = $1', [siteId]);
    
    await this.logAudit(userId, 'delete', 'site', siteId, existing, null);
  }

  // ==================== Buildings ====================
  
  async createBuilding(request: CreateBuildingRequest, userId: string): Promise<DigitalTwinBuilding> {
    const result = await pool.query(
      `INSERT INTO digital_twin_buildings 
       (site_id, branch_id, name, description, building_type, total_floors, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        request.siteId,
        request.branchId,
        request.name,
        request.description,
        request.buildingType,
        request.totalFloors,
        JSON.stringify(request.metadata || {}),
      ]
    );

    await this.logAudit(userId, 'create', 'building', result.rows[0].id, null, result.rows[0]);
    
    return this.mapBuilding(result.rows[0]);
  }

  async getBuilding(buildingId: string): Promise<DigitalTwinBuilding | null> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_buildings WHERE id = $1',
      [buildingId]
    );
    
    return result.rows[0] ? this.mapBuilding(result.rows[0]) : null;
  }

  async listBuildings(siteId: string): Promise<DigitalTwinBuilding[]> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_buildings WHERE site_id = $1 ORDER BY name',
      [siteId]
    );
    
    return result.rows.map(this.mapBuilding);
  }

  async getBuildingByBranch(branchId: string): Promise<DigitalTwinBuilding | null> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_buildings WHERE branch_id = $1 LIMIT 1',
      [branchId]
    );
    
    return result.rows[0] ? this.mapBuilding(result.rows[0]) : null;
  }

  async updateBuilding(
    buildingId: string,
    updates: Partial<CreateBuildingRequest>,
    userId: string
  ): Promise<DigitalTwinBuilding> {
    const existing = await this.getBuilding(buildingId);
    
    const result = await pool.query(
      `UPDATE digital_twin_buildings 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           building_type = COALESCE($3, building_type),
           total_floors = COALESCE($4, total_floors),
           metadata = COALESCE($5, metadata),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [
        updates.name,
        updates.description,
        updates.buildingType,
        updates.totalFloors,
        updates.metadata ? JSON.stringify(updates.metadata) : null,
        buildingId,
      ]
    );

    await this.logAudit(userId, 'update', 'building', buildingId, existing, result.rows[0]);
    
    return this.mapBuilding(result.rows[0]);
  }

  async deleteBuilding(buildingId: string, userId: string): Promise<void> {
    const existing = await this.getBuilding(buildingId);
    
    await pool.query('DELETE FROM digital_twin_buildings WHERE id = $1', [buildingId]);
    
    await this.logAudit(userId, 'delete', 'building', buildingId, existing, null);
  }

  // ==================== Floors ====================
  
  async createFloor(request: CreateFloorRequest, userId: string): Promise<DigitalTwinFloor> {
    const result = await pool.query(
      `INSERT INTO digital_twin_floors 
       (building_id, floor_number, name, description, floor_height_meters, area_square_meters, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        request.buildingId,
        request.floorNumber,
        request.name,
        request.description,
        request.floorHeightMeters,
        request.areaSquareMeters,
        JSON.stringify(request.metadata || {}),
      ]
    );

    await this.logAudit(userId, 'create', 'floor', result.rows[0].id, null, result.rows[0]);
    
    return this.mapFloor(result.rows[0]);
  }

  async getFloor(floorId: string): Promise<DigitalTwinFloor | null> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_floors WHERE id = $1',
      [floorId]
    );
    
    return result.rows[0] ? this.mapFloor(result.rows[0]) : null;
  }

  async listFloors(buildingId: string): Promise<DigitalTwinFloor[]> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_floors WHERE building_id = $1 ORDER BY floor_number',
      [buildingId]
    );
    
    return result.rows.map(this.mapFloor);
  }

  async updateFloor(
    floorId: string,
    updates: Partial<CreateFloorRequest>,
    userId: string
  ): Promise<DigitalTwinFloor> {
    const existing = await this.getFloor(floorId);
    
    const result = await pool.query(
      `UPDATE digital_twin_floors 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           floor_height_meters = COALESCE($3, floor_height_meters),
           area_square_meters = COALESCE($4, area_square_meters),
           metadata = COALESCE($5, metadata),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [
        updates.name,
        updates.description,
        updates.floorHeightMeters,
        updates.areaSquareMeters,
        updates.metadata ? JSON.stringify(updates.metadata) : null,
        floorId,
      ]
    );

    await this.logAudit(userId, 'update', 'floor', floorId, existing, result.rows[0]);
    
    return this.mapFloor(result.rows[0]);
  }

  async deleteFloor(floorId: string, userId: string): Promise<void> {
    const existing = await this.getFloor(floorId);
    
    await pool.query('DELETE FROM digital_twin_floors WHERE id = $1', [floorId]);
    
    await this.logAudit(userId, 'delete', 'floor', floorId, existing, null);
  }

  // ==================== Audit Logging ====================
  
  private async logAudit(
    userId: string | undefined,
    action: string,
    entityType: string,
    entityId: string,
    previousState: any,
    newState: any,
    floorId?: string,
    buildingId?: string
  ): Promise<void> {
    const changeSummary = this.generateChangeSummary(action, entityType, previousState, newState);
    
    await pool.query(
      `INSERT INTO digital_twin_audit_log 
       (user_id, action, entity_type, entity_id, previous_state, new_state, change_summary, floor_id, building_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        userId,
        action,
        entityType,
        entityId,
        previousState ? JSON.stringify(previousState) : null,
        newState ? JSON.stringify(newState) : null,
        changeSummary,
        floorId,
        buildingId,
      ]
    );
  }

  private generateChangeSummary(
    action: string,
    entityType: string,
    previousState: any,
    newState: any
  ): string {
    switch (action) {
      case 'create':
        return `Created ${entityType}: ${newState?.name || newState?.id}`;
      case 'update':
        return `Updated ${entityType}: ${newState?.name || newState?.id}`;
      case 'delete':
        return `Deleted ${entityType}: ${previousState?.name || previousState?.id}`;
      default:
        return `${action} on ${entityType}`;
    }
  }

  // ==================== Mappers ====================
  
  private mapSite(row: any): DigitalTwinSite {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      address: row.address,
      latitude: row.latitude ? parseFloat(row.latitude) : undefined,
      longitude: row.longitude ? parseFloat(row.longitude) : undefined,
      timezone: row.timezone,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
    };
  }

  private mapBuilding(row: any): DigitalTwinBuilding {
    return {
      id: row.id,
      siteId: row.site_id,
      branchId: row.branch_id,
      name: row.name,
      description: row.description,
      buildingType: row.building_type,
      totalFloors: row.total_floors,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapFloor(row: any): DigitalTwinFloor {
    return {
      id: row.id,
      buildingId: row.building_id,
      floorNumber: row.floor_number,
      name: row.name,
      description: row.description,
      floorHeightMeters: row.floor_height_meters ? parseFloat(row.floor_height_meters) : undefined,
      areaSquareMeters: row.area_square_meters ? parseFloat(row.area_square_meters) : undefined,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export default new DigitalTwinService();
