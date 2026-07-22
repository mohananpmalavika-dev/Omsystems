/**
 * Grid Layout Repository
 * Manages video wall and multi-camera grid layouts
 */

import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

export interface GridLayout {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  gridSize: "1x1" | "2x2" | "3x3" | "4x4" | "5x5" | "6x6";
  cameraPositions: Array<{
    position: number;
    cameraId: string;
    stream: "main" | "sub";
  }>;
  isDefault: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export class GridLayoutRepository {
  constructor(private readonly pool: Pool) {}

  async listLayouts(tenantId: string): Promise<GridLayout[]> {
    const result = await this.pool.query(
      `SELECT * FROM video_wall_layouts
       WHERE tenant_id=$1
       ORDER BY is_default DESC, name ASC`,
      [tenantId]
    );
    return result.rows.map(mapGridLayout);
  }

  async getLayout(id: string, tenantId: string): Promise<GridLayout | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM video_wall_layouts
       WHERE id=$1 AND tenant_id=$2`,
      [id, tenantId]
    );
    return result.rows[0] ? mapGridLayout(result.rows[0]) : undefined;
  }

  async getDefaultLayout(tenantId: string): Promise<GridLayout | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM video_wall_layouts
       WHERE tenant_id=$1 AND is_default=true
       LIMIT 1`,
      [tenantId]
    );
    return result.rows[0] ? mapGridLayout(result.rows[0]) : undefined;
  }

  async createLayout(input: {
    tenantId: string;
    name: string;
    description?: string;
    gridSize: string;
    cameraPositions: Array<{
      position: number;
      cameraId: string;
      stream: "main" | "sub";
    }>;
    isDefault?: boolean;
    createdBy: string;
  }): Promise<GridLayout> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // If setting as default, unset current default
      if (input.isDefault) {
        await client.query(
          `UPDATE video_wall_layouts
           SET is_default=false
           WHERE tenant_id=$1 AND is_default=true`,
          [input.tenantId]
        );
      }

      const result = await client.query(
        `INSERT INTO video_wall_layouts (
           id, tenant_id, name, description, grid_size, camera_positions,
           is_default, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          randomUUID(),
          input.tenantId,
          input.name,
          input.description ?? null,
          input.gridSize,
          JSON.stringify(input.cameraPositions),
          input.isDefault ?? false,
          input.createdBy,
        ]
      );

      await client.query("COMMIT");
      return mapGridLayout(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateLayout(
    id: string,
    tenantId: string,
    updates: {
      name?: string;
      description?: string;
      gridSize?: string;
      cameraPositions?: Array<{
        position: number;
        cameraId: string;
        stream: "main" | "sub";
      }>;
      isDefault?: boolean;
    }
  ): Promise<GridLayout | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // If setting as default, unset current default
      if (updates.isDefault) {
        await client.query(
          `UPDATE video_wall_layouts
           SET is_default=false
           WHERE tenant_id=$1 AND is_default=true AND id!=$2`,
          [tenantId, id]
        );
      }

      const result = await client.query(
        `UPDATE video_wall_layouts
         SET name = COALESCE($3, name),
             description = COALESCE($4, description),
             grid_size = COALESCE($5, grid_size),
             camera_positions = COALESCE($6, camera_positions),
             is_default = COALESCE($7, is_default),
             updated_at = now()
         WHERE id=$1 AND tenant_id=$2
         RETURNING *`,
        [
          id,
          tenantId,
          updates.name ?? null,
          updates.description ?? null,
          updates.gridSize ?? null,
          updates.cameraPositions ? JSON.stringify(updates.cameraPositions) : null,
          updates.isDefault ?? null,
        ]
      );

      await client.query("COMMIT");
      return result.rows[0] ? mapGridLayout(result.rows[0]) : undefined;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteLayout(id: string, tenantId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM video_wall_layouts
       WHERE id=$1 AND tenant_id=$2`,
      [id, tenantId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }
}

function mapGridLayout(row: any): GridLayout {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description ?? undefined,
    gridSize: row.grid_size,
    cameraPositions: JSON.parse(row.camera_positions),
    isDefault: row.is_default,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
