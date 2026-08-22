/**
 * Twin Object Service
 * Manages objects (cameras, sensors, devices) positioned on floor plans
 */

import { pool } from '../config/database';
import {
  DigitalTwinObject,
  CreateObjectRequest,
  UpdateObjectPositionRequest,
  TwinObjectType,
} from '../types/digital-twin';

export class TwinObjectService {
  async createObject(request: CreateObjectRequest, userId: string): Promise<DigitalTwinObject> {
    const result = await pool.query(
      `INSERT INTO digital_twin_objects 
       (floor_id, object_type, name, description, position_x, position_y, position_z, 
        rotation, scale, icon_name, color, size_override, field_of_view, viewing_distance, 
        camera_angle, show_status, show_label, show_field_of_view, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       RETURNING *`,
      [
        request.floorId,
        request.objectType,
        request.name,
        request.description,
        request.positionX,
        request.positionY,
        request.positionZ || 0,
        request.rotation || 0,
        request.scale || 1.0,
        request.iconName,
        request.color,
        request.sizeOverride,
        request.fieldOfView,
        request.viewingDistance,
        request.cameraAngle,
        request.showStatus !== false,
        request.showLabel !== false,
        request.showFieldOfView || false,
        JSON.stringify(request.metadata || {}),
        userId,
      ]
    );

    await this.logAudit(userId, 'create', request.floorId, result.rows[0]);
    
    return this.mapObject(result.rows[0]);
  }

  async getObject(objectId: string): Promise<DigitalTwinObject | null> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_objects WHERE id = $1',
      [objectId]
    );
    
    return result.rows[0] ? this.mapObject(result.rows[0]) : null;
  }

  async listObjects(floorId: string, objectType?: TwinObjectType): Promise<DigitalTwinObject[]> {
    let query = 'SELECT * FROM digital_twin_objects WHERE floor_id = $1';
    const params: any[] = [floorId];
    
    if (objectType) {
      query += ' AND object_type = $2';
      params.push(objectType);
    }
    
    query += ' ORDER BY created_at';
    
    const result = await pool.query(query, params);
    
    return result.rows.map(this.mapObject);
  }

  async updateObject(
    objectId: string,
    updates: Partial<CreateObjectRequest>,
    userId: string
  ): Promise<DigitalTwinObject> {
    const result = await pool.query(
      `UPDATE digital_twin_objects 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           position_x = COALESCE($3, position_x),
           position_y = COALESCE($4, position_y),
           position_z = COALESCE($5, position_z),
           rotation = COALESCE($6, rotation),
           scale = COALESCE($7, scale),
           icon_name = COALESCE($8, icon_name),
           color = COALESCE($9, color),
           field_of_view = COALESCE($10, field_of_view),
           viewing_distance = COALESCE($11, viewing_distance),
           camera_angle = COALESCE($12, camera_angle),
           show_status = COALESCE($13, show_status),
           show_label = COALESCE($14, show_label),
           show_field_of_view = COALESCE($15, show_field_of_view),
           metadata = COALESCE($16, metadata),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $17
       RETURNING *`,
      [
        updates.name,
        updates.description,
        updates.positionX,
        updates.positionY,
        updates.positionZ,
        updates.rotation,
        updates.scale,
        updates.iconName,
        updates.color,
        updates.fieldOfView,
        updates.viewingDistance,
        updates.cameraAngle,
        updates.showStatus,
        updates.showLabel,
        updates.showFieldOfView,
        updates.metadata ? JSON.stringify(updates.metadata) : null,
        objectId,
      ]
    );

    const updated = this.mapObject(result.rows[0]);
    await this.logAudit(userId, 'update', updated.floorId, updated);
    
    return updated;
  }

  async updateObjectPosition(
    objectId: string,
    position: UpdateObjectPositionRequest,
    userId: string
  ): Promise<DigitalTwinObject> {
    const result = await pool.query(
      `UPDATE digital_twin_objects 
       SET position_x = $1,
           position_y = $2,
           rotation = COALESCE($3, rotation),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [position.positionX, position.positionY, position.rotation, objectId]
    );

    const updated = this.mapObject(result.rows[0]);
    await this.logAudit(userId, 'move', updated.floorId, updated);
    
    return updated;
  }

  async deleteObject(objectId: string, userId: string): Promise<void> {
    const object = await this.getObject(objectId);
    
    if (object) {
      await pool.query('DELETE FROM digital_twin_objects WHERE id = $1', [objectId]);
      await this.logAudit(userId, 'delete', object.floorId, object);
    }
  }

  async bulkCreateObjects(
    objects: CreateObjectRequest[],
    userId: string
  ): Promise<DigitalTwinObject[]> {
    const created: DigitalTwinObject[] = [];
    
    for (const obj of objects) {
      const result = await this.createObject(obj, userId);
      created.push(result);
    }
    
    return created;
  }

  async getObjectsByType(floorId: string, objectType: TwinObjectType): Promise<DigitalTwinObject[]> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_objects WHERE floor_id = $1 AND object_type = $2',
      [floorId, objectType]
    );
    
    return result.rows.map(this.mapObject);
  }

  async searchObjects(floorId: string, searchTerm: string): Promise<DigitalTwinObject[]> {
    const result = await pool.query(
      `SELECT * FROM digital_twin_objects 
       WHERE floor_id = $1 AND (name ILIKE $2 OR description ILIKE $2)
       ORDER BY name`,
      [floorId, `%${searchTerm}%`]
    );
    
    return result.rows.map(this.mapObject);
  }

  private async logAudit(
    userId: string,
    action: string,
    floorId: string,
    object: DigitalTwinObject
  ): Promise<void> {
    await pool.query(
      `INSERT INTO digital_twin_audit_log 
       (user_id, action, entity_type, entity_id, new_state, floor_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, action, 'object', object.id, JSON.stringify(object), floorId]
    );
  }

  private mapObject(row: any): DigitalTwinObject {
    return {
      id: row.id,
      floorId: row.floor_id,
      objectType: row.object_type,
      name: row.name,
      description: row.description,
      positionX: parseFloat(row.position_x),
      positionY: parseFloat(row.position_y),
      positionZ: row.position_z ? parseFloat(row.position_z) : 0,
      rotation: parseFloat(row.rotation),
      scale: parseFloat(row.scale),
      iconName: row.icon_name,
      color: row.color,
      sizeOverride: row.size_override ? parseFloat(row.size_override) : undefined,
      fieldOfView: row.field_of_view ? parseFloat(row.field_of_view) : undefined,
      viewingDistance: row.viewing_distance ? parseFloat(row.viewing_distance) : undefined,
      cameraAngle: row.camera_angle ? parseFloat(row.camera_angle) : undefined,
      showStatus: row.show_status,
      showLabel: row.show_label,
      showFieldOfView: row.show_field_of_view,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
    };
  }
}

export default new TwinObjectService();
