import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export interface VideoWallDisplay {
  id: string;
  tenantId: string;
  displayCode: string;
  name: string;
  resolution: string;
  location?: string;
  activeLayout: string;
  assignedCameras: string[];
  isOnline: boolean;
  lastHeartbeat: Date;
  updatedAt: Date;
}

export interface RegisterDisplayInput {
  tenantId: string;
  displayCode: string;
  name: string;
  resolution?: string;
  location?: string;
  activeLayout?: string;
}

export interface DispatchMatrixCommand {
  tenantId: string;
  displayCode: string;
  layout: string;
  assignedCameras: string[];
  dispatchedBy?: string;
  reason?: string;
}

export class VideoWallDispatcherService {
  private inMemoryDisplays = new Map<string, VideoWallDisplay>();

  constructor(
    private readonly pool?: Pool,
    private readonly redisClient?: any
  ) {}

  /**
   * Registers or updates a physical SOC Video Wall display node
   */
  async registerDisplay(input: RegisterDisplayInput): Promise<VideoWallDisplay> {
    const id = randomUUID();
    const resolution = input.resolution || '3840x2160';
    const activeLayout = input.activeLayout || 'grid-4';
    const now = new Date();

    if (this.pool) {
      const res = await this.pool.query(
        `INSERT INTO video_wall_displays 
         (id, tenant_id, display_code, name, resolution, location, active_layout, assigned_cameras, is_online, last_heartbeat, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $9, $9)
         ON CONFLICT (display_code) 
         DO UPDATE SET 
           name = EXCLUDED.name,
           resolution = EXCLUDED.resolution,
           location = EXCLUDED.location,
           is_online = true,
           last_heartbeat = EXCLUDED.last_heartbeat,
           updated_at = EXCLUDED.updated_at
         RETURNING *`,
        [
          id,
          input.tenantId,
          input.displayCode,
          input.name,
          resolution,
          input.location || null,
          activeLayout,
          JSON.stringify([]),
          now,
        ]
      );
      const row = res.rows[0];
      return {
        id: row.id,
        tenantId: row.tenant_id,
        displayCode: row.display_code,
        name: row.name,
        resolution: row.resolution,
        location: row.location,
        activeLayout: row.active_layout,
        assignedCameras: Array.isArray(row.assigned_cameras) ? row.assigned_cameras : JSON.parse(row.assigned_cameras || '[]'),
        isOnline: row.is_online,
        lastHeartbeat: new Date(row.last_heartbeat),
        updatedAt: new Date(row.updated_at),
      };
    }

    const display: VideoWallDisplay = {
      id,
      tenantId: input.tenantId,
      displayCode: input.displayCode,
      name: input.name,
      resolution,
      location: input.location,
      activeLayout,
      assignedCameras: [],
      isOnline: true,
      lastHeartbeat: now,
      updatedAt: now,
    };
    this.inMemoryDisplays.set(input.displayCode, display);
    return display;
  }

  /**
   * Heartbeat ping from physical screen to keep online status active
   */
  async recordHeartbeat(displayCode: string): Promise<boolean> {
    const now = new Date();
    if (this.pool) {
      const res = await this.pool.query(
        `UPDATE video_wall_displays 
         SET is_online = true, last_heartbeat = $1, updated_at = $1 
         WHERE display_code = $2 RETURNING id`,
        [now, displayCode]
      );
      return (res.rowCount ?? 0) > 0;
    }

    const d = this.inMemoryDisplays.get(displayCode);
    if (d) {
      d.isOnline = true;
      d.lastHeartbeat = now;
      d.updatedAt = now;
      return true;
    }
    return false;
  }

  /**
   * Lists all video wall displays for a tenant
   */
  async listDisplays(tenantId: string): Promise<VideoWallDisplay[]> {
    if (this.pool) {
      const res = await this.pool.query(
        `SELECT * FROM video_wall_displays 
         WHERE tenant_id = $1 
         ORDER BY display_code ASC`,
        [tenantId]
      );
      return res.rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        displayCode: row.display_code,
        name: row.name,
        resolution: row.resolution,
        location: row.location,
        activeLayout: row.active_layout,
        assignedCameras: Array.isArray(row.assigned_cameras) ? row.assigned_cameras : JSON.parse(row.assigned_cameras || '[]'),
        isOnline: row.is_online,
        lastHeartbeat: new Date(row.last_heartbeat),
        updatedAt: new Date(row.updated_at),
      }));
    }

    return Array.from(this.inMemoryDisplays.values()).filter((d) => d.tenantId === tenantId);
  }

  /**
   * Retrieves a single display by code
   */
  async getDisplay(displayCode: string): Promise<VideoWallDisplay | null> {
    if (this.pool) {
      const res = await this.pool.query(
        `SELECT * FROM video_wall_displays WHERE display_code = $1`,
        [displayCode]
      );
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        id: row.id,
        tenantId: row.tenant_id,
        displayCode: row.display_code,
        name: row.name,
        resolution: row.resolution,
        location: row.location,
        activeLayout: row.active_layout,
        assignedCameras: Array.isArray(row.assigned_cameras) ? row.assigned_cameras : JSON.parse(row.assigned_cameras || '[]'),
        isOnline: row.is_online,
        lastHeartbeat: new Date(row.last_heartbeat),
        updatedAt: new Date(row.updated_at),
      };
    }

    return this.inMemoryDisplays.get(displayCode) || null;
  }

  /**
   * Dispatches a layout and camera matrix to a target physical display
   */
  async dispatchMatrix(cmd: DispatchMatrixCommand): Promise<VideoWallDisplay> {
    const now = new Date();
    let updated: VideoWallDisplay;

    if (this.pool) {
      const res = await this.pool.query(
        `UPDATE video_wall_displays 
         SET active_layout = $1, assigned_cameras = $2, updated_at = $3 
         WHERE display_code = $4 AND tenant_id = $5 
         RETURNING *`,
        [cmd.layout, JSON.stringify(cmd.assignedCameras), now, cmd.displayCode, cmd.tenantId]
      );
      if (res.rows.length === 0) {
        throw new Error(`Display node '${cmd.displayCode}' not found for tenant '${cmd.tenantId}'`);
      }
      const row = res.rows[0];
      updated = {
        id: row.id,
        tenantId: row.tenant_id,
        displayCode: row.display_code,
        name: row.name,
        resolution: row.resolution,
        location: row.location,
        activeLayout: row.active_layout,
        assignedCameras: Array.isArray(row.assigned_cameras) ? row.assigned_cameras : JSON.parse(row.assigned_cameras || '[]'),
        isOnline: row.is_online,
        lastHeartbeat: new Date(row.last_heartbeat),
        updatedAt: new Date(row.updated_at),
      };
    } else {
      const d = this.inMemoryDisplays.get(cmd.displayCode);
      if (!d || d.tenantId !== cmd.tenantId) {
        throw new Error(`Display node '${cmd.displayCode}' not found`);
      }
      d.activeLayout = cmd.layout;
      d.assignedCameras = cmd.assignedCameras;
      d.updatedAt = now;
      updated = d;
    }

    // Broadcast via Redis PubSub if configured
    if (this.redisClient && typeof this.redisClient.publish === 'function') {
      await this.redisClient.publish(
        `wall:dispatch:${cmd.tenantId}`,
        JSON.stringify({
          type: 'MATRIX_DISPATCH',
          displayCode: cmd.displayCode,
          layout: cmd.layout,
          assignedCameras: cmd.assignedCameras,
          dispatchedBy: cmd.dispatchedBy,
          timestamp: now.toISOString(),
        })
      );
    }

    return updated;
  }
}
