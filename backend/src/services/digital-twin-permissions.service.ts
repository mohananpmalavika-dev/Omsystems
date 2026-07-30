/**
 * Digital Twin Permissions Service
 * Role-based access control for Digital Twin features
 */

import { pool } from '../config/database';
import { DigitalTwinPermissions } from '../types/digital-twin';

export class DigitalTwinPermissionsService {
  // Check if user has permission
  async hasPermission(
    userId: string,
    permission: keyof Omit<DigitalTwinPermissions, 'id' | 'roleId' | 'userId' | 'siteId' | 'buildingId' | 'metadata' | 'createdAt'>,
    siteId?: string,
    buildingId?: string
  ): Promise<boolean> {
    // Get user's role
    const userResult = await pool.query(
      'SELECT role_id FROM users WHERE id = $1',
      [userId]
    );

    if (!userResult.rows[0]) {
      return false;
    }

    const roleId = userResult.rows[0].role_id;

    // Check role permissions
    let query = `
      SELECT ${permission} 
      FROM digital_twin_permissions 
      WHERE (role_id = $1 OR user_id = $2)
    `;
    const params: any[] = [roleId, userId];
    let paramCount = 2;

    if (siteId) {
      paramCount++;
      query += ` AND (site_id = $${paramCount} OR site_id IS NULL)`;
      params.push(siteId);
    }

    if (buildingId) {
      paramCount++;
      query += ` AND (building_id = $${paramCount} OR building_id IS NULL)`;
      params.push(buildingId);
    }

    query += ' ORDER BY user_id DESC NULLS LAST LIMIT 1';

    const result = await pool.query(query, params);

    if (result.rows[0]) {
      return result.rows[0][permission] === true;
    }

    // Default permissions for admin role
    if (await this.isAdmin(userId)) {
      return true;
    }

    return false;
  }

  // Grant permission to role
  async grantRolePermission(
    roleId: string,
    permissions: Partial<DigitalTwinPermissions>,
    siteId?: string,
    buildingId?: string
  ): Promise<DigitalTwinPermissions> {
    const result = await pool.query(
      `INSERT INTO digital_twin_permissions 
       (role_id, can_view_floors, can_edit_floors, can_place_devices, 
        can_edit_zones, can_view_3d, can_export_plans, can_playback_timeline,
        site_id, building_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (role_id, COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid), 
                    COALESCE(building_id, '00000000-0000-0000-0000-000000000000'::uuid))
       DO UPDATE SET
         can_view_floors = EXCLUDED.can_view_floors,
         can_edit_floors = EXCLUDED.can_edit_floors,
         can_place_devices = EXCLUDED.can_place_devices,
         can_edit_zones = EXCLUDED.can_edit_zones,
         can_view_3d = EXCLUDED.can_view_3d,
         can_export_plans = EXCLUDED.can_export_plans,
         can_playback_timeline = EXCLUDED.can_playback_timeline
       RETURNING *`,
      [
        roleId,
        permissions.canViewFloors || false,
        permissions.canEditFloors || false,
        permissions.canPlaceDevices || false,
        permissions.canEditZones || false,
        permissions.canView3d || false,
        permissions.canExportPlans || false,
        permissions.canPlaybackTimeline || false,
        siteId,
        buildingId,
        JSON.stringify(permissions.metadata || {}),
      ]
    );

    return this.mapPermission(result.rows[0]);
  }

  // Grant permission to specific user
  async grantUserPermission(
    userId: string,
    permissions: Partial<DigitalTwinPermissions>,
    siteId?: string,
    buildingId?: string
  ): Promise<DigitalTwinPermissions> {
    const result = await pool.query(
      `INSERT INTO digital_twin_permissions 
       (user_id, can_view_floors, can_edit_floors, can_place_devices, 
        can_edit_zones, can_view_3d, can_export_plans, can_playback_timeline,
        site_id, building_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        userId,
        permissions.canViewFloors || false,
        permissions.canEditFloors || false,
        permissions.canPlaceDevices || false,
        permissions.canEditZones || false,
        permissions.canView3d || false,
        permissions.canExportPlans || false,
        permissions.canPlaybackTimeline || false,
        siteId,
        buildingId,
        JSON.stringify(permissions.metadata || {}),
      ]
    );

    return this.mapPermission(result.rows[0]);
  }

  // Get user's permissions
  async getUserPermissions(
    userId: string,
    siteId?: string,
    buildingId?: string
  ): Promise<DigitalTwinPermissions | null> {
    let query = `
      SELECT dtp.* 
      FROM digital_twin_permissions dtp
      LEFT JOIN users u ON dtp.role_id = u.role_id
      WHERE (dtp.user_id = $1 OR u.id = $1)
    `;
    const params: any[] = [userId];
    let paramCount = 1;

    if (siteId) {
      paramCount++;
      query += ` AND (dtp.site_id = $${paramCount} OR dtp.site_id IS NULL)`;
      params.push(siteId);
    }

    if (buildingId) {
      paramCount++;
      query += ` AND (dtp.building_id = $${paramCount} OR dtp.building_id IS NULL)`;
      params.push(buildingId);
    }

    query += ' ORDER BY dtp.user_id DESC NULLS LAST LIMIT 1';

    const result = await pool.query(query, params);

    return result.rows[0] ? this.mapPermission(result.rows[0]) : null;
  }

  // Revoke permission
  async revokePermission(permissionId: string): Promise<void> {
    await pool.query(
      'DELETE FROM digital_twin_permissions WHERE id = $1',
      [permissionId]
    );
  }

  // Get audit log
  async getAuditLog(
    filters: {
      userId?: string;
      entityType?: string;
      floorId?: string;
      buildingId?: string;
      startTime?: Date;
      endTime?: Date;
    },
    limit: number = 100
  ): Promise<any[]> {
    let query = 'SELECT * FROM digital_twin_audit_log WHERE 1=1';
    const params: any[] = [];
    let paramCount = 0;

    if (filters.userId) {
      paramCount++;
      query += ` AND user_id = $${paramCount}`;
      params.push(filters.userId);
    }

    if (filters.entityType) {
      paramCount++;
      query += ` AND entity_type = $${paramCount}`;
      params.push(filters.entityType);
    }

    if (filters.floorId) {
      paramCount++;
      query += ` AND floor_id = $${paramCount}`;
      params.push(filters.floorId);
    }

    if (filters.buildingId) {
      paramCount++;
      query += ` AND building_id = $${paramCount}`;
      params.push(filters.buildingId);
    }

    if (filters.startTime) {
      paramCount++;
      query += ` AND timestamp >= $${paramCount}`;
      params.push(filters.startTime);
    }

    if (filters.endTime) {
      paramCount++;
      query += ` AND timestamp <= $${paramCount}`;
      params.push(filters.endTime);
    }

    paramCount++;
    query += ` ORDER BY timestamp DESC LIMIT $${paramCount}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return result.rows;
  }

  // Log audit entry
  async logAudit(
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    previousState?: any,
    newState?: any,
    floorId?: string,
    buildingId?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const changeSummary = this.generateChangeSummary(action, entityType, previousState, newState);

    await pool.query(
      `INSERT INTO digital_twin_audit_log 
       (user_id, action, entity_type, entity_id, previous_state, new_state, 
        change_summary, floor_id, building_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
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
        ipAddress,
        userAgent,
      ]
    );
  }

  private async isAdmin(userId: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT r.name FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [userId]
    );

    return result.rows[0]?.name?.toLowerCase() === 'admin';
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
      case 'move':
        return `Moved ${entityType} from (${previousState?.positionX}, ${previousState?.positionY}) to (${newState?.positionX}, ${newState?.positionY})`;
      default:
        return `${action} on ${entityType}`;
    }
  }

  private mapPermission(row: any): DigitalTwinPermissions {
    return {
      id: row.id,
      roleId: row.role_id,
      userId: row.user_id,
      canViewFloors: row.can_view_floors,
      canEditFloors: row.can_edit_floors,
      canPlaceDevices: row.can_place_devices,
      canEditZones: row.can_edit_zones,
      canView3d: row.can_view_3d,
      canExportPlans: row.can_export_plans,
      canPlaybackTimeline: row.can_playback_timeline,
      siteId: row.site_id,
      buildingId: row.building_id,
      metadata: row.metadata,
      createdAt: row.created_at,
    };
  }
}

export default new DigitalTwinPermissionsService();
