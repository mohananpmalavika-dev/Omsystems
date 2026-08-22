/**
 * PTZ Repository
 * Manages PTZ presets, patrols, and locks in the database
 */

import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { PtzPreset, PtzPatrol, PtzLock } from "../domain/ptz.js";

export class PtzRepository {
  constructor(private readonly pool: Pool) {}

  // ============ PTZ LOCKS ============

  async acquireLock(
    cameraId: string,
    operatorId: string,
    operatorName: string,
    sessionId: string,
    durationSeconds: number = 300,
  ): Promise<PtzLock | { error: string; lockedBy: string }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Check for existing lock
      const existing = await client.query(
        `SELECT * FROM ptz_locks
         WHERE camera_id=$1 AND expires_at > now()
         ORDER BY locked_at DESC LIMIT 1`,
        [cameraId],
      );

      if (existing.rows[0]) {
        await client.query("ROLLBACK");
        return {
          error: "camera_locked",
          lockedBy: existing.rows[0].operator_name,
        };
      }

      // Acquire new lock
      const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
      const result = await client.query(
        `INSERT INTO ptz_locks (
           id, camera_id, operator_id, operator_name, locked_at, expires_at, session_id
         ) VALUES ($1, $2, $3, $4, now(), $5, $6)
         RETURNING *`,
        [randomUUID(), cameraId, operatorId, operatorName, expiresAt, sessionId],
      );

      await client.query("COMMIT");
      return mapLock(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async releaseLock(
    cameraId: string,
    operatorId: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM ptz_locks
       WHERE camera_id=$1 AND operator_id=$2`,
      [cameraId, operatorId],
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getCurrentLock(cameraId: string): Promise<PtzLock | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM ptz_locks
       WHERE camera_id=$1 AND expires_at > now()
       ORDER BY locked_at DESC LIMIT 1`,
      [cameraId],
    );
    return result.rows[0] ? mapLock(result.rows[0]) : undefined;
  }

  async extendLock(
    cameraId: string,
    operatorId: string,
    additionalSeconds: number,
  ): Promise<PtzLock | undefined> {
    const result = await this.pool.query(
      `UPDATE ptz_locks
       SET expires_at = expires_at + interval '1 second' * $3
       WHERE camera_id=$1 AND operator_id=$2 AND expires_at > now()
       RETURNING *`,
      [cameraId, operatorId, additionalSeconds],
    );
    return result.rows[0] ? mapLock(result.rows[0]) : undefined;
  }

  async cleanupExpiredLocks(): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM ptz_locks WHERE expires_at <= now()`,
    );
    return result.rowCount ?? 0;
  }

  // ============ PTZ PRESETS ============

  async listPresets(cameraId: string): Promise<PtzPreset[]> {
    const result = await this.pool.query(
      `SELECT * FROM ptz_presets
       WHERE camera_id=$1
       ORDER BY preset_number ASC`,
      [cameraId],
    );
    return result.rows.map(mapPreset);
  }

  async getPreset(id: string): Promise<PtzPreset | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM ptz_presets WHERE id=$1`,
      [id],
    );
    return result.rows[0] ? mapPreset(result.rows[0]) : undefined;
  }

  async createPreset(input: {
    cameraId: string;
    tenantId: string;
    presetNumber: number;
    name: string;
    description?: string;
    position?: { pan: number; tilt: number; zoom: number };
    createdBy: string;
  }): Promise<PtzPreset> {
    const result = await this.pool.query(
      `INSERT INTO ptz_presets (
         id, camera_id, tenant_id, preset_number, name, description,
         position, created_by
       )
       SELECT $1, $2, $3, $4, $5, $6, $7, $8
       FROM cameras camera
       JOIN resource_nodes node ON node.id=camera.resource_node_id
       WHERE camera.id=$2 AND node.tenant_id=$3
       RETURNING *`,
      [
        randomUUID(),
        input.cameraId,
        input.tenantId,
        input.presetNumber,
        input.name,
        input.description ?? null,
        input.position ? JSON.stringify(input.position) : null,
        input.createdBy,
      ],
    );
    if (!result.rows[0]) throw new Error("camera_not_found");
    return mapPreset(result.rows[0]);
  }

  async updatePreset(
    id: string,
    tenantId: string,
    updates: {
      name?: string;
      description?: string;
      position?: { pan: number; tilt: number; zoom: number };
    },
  ): Promise<PtzPreset | undefined> {
    const result = await this.pool.query(
      `UPDATE ptz_presets
       SET name = COALESCE($3, name),
           description = COALESCE($4, description),
           position = COALESCE($5, position),
           updated_at = now()
       WHERE id=$1 AND tenant_id=$2
       RETURNING *`,
      [
        id,
        tenantId,
        updates.name ?? null,
        updates.description ?? null,
        updates.position ? JSON.stringify(updates.position) : null,
      ],
    );
    return result.rows[0] ? mapPreset(result.rows[0]) : undefined;
  }

  async deletePreset(id: string, tenantId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM ptz_presets WHERE id=$1 AND tenant_id=$2`,
      [id, tenantId],
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  // ============ PTZ PATROLS ============

  async listPatrols(cameraId: string): Promise<PtzPatrol[]> {
    const result = await this.pool.query(
      `SELECT * FROM ptz_patrols
       WHERE camera_id=$1
       ORDER BY patrol_number ASC`,
      [cameraId],
    );
    return result.rows.map(mapPatrol);
  }

  async getPatrol(id: string): Promise<PtzPatrol | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM ptz_patrols WHERE id=$1`,
      [id],
    );
    return result.rows[0] ? mapPatrol(result.rows[0]) : undefined;
  }

  async createPatrol(input: {
    cameraId: string;
    tenantId: string;
    patrolNumber: number;
    name: string;
    presets: Array<{
      presetNumber: number;
      dwellSeconds: number;
      speed: number;
    }>;
    repeat: boolean;
    enabled: boolean;
    createdBy: string;
  }): Promise<PtzPatrol> {
    const result = await this.pool.query(
      `INSERT INTO ptz_patrols (
         id, camera_id, tenant_id, patrol_number, name, presets,
         repeat, enabled, created_by
       )
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9
       FROM cameras camera
       JOIN resource_nodes node ON node.id=camera.resource_node_id
       WHERE camera.id=$2 AND node.tenant_id=$3
       RETURNING *`,
      [
        randomUUID(),
        input.cameraId,
        input.tenantId,
        input.patrolNumber,
        input.name,
        JSON.stringify(input.presets),
        input.repeat,
        input.enabled,
        input.createdBy,
      ],
    );
    if (!result.rows[0]) throw new Error("camera_not_found");
    return mapPatrol(result.rows[0]);
  }

  async updatePatrol(
    id: string,
    tenantId: string,
    updates: {
      name?: string;
      presets?: Array<{
        presetNumber: number;
        dwellSeconds: number;
        speed: number;
      }>;
      repeat?: boolean;
      enabled?: boolean;
    },
  ): Promise<PtzPatrol | undefined> {
    const result = await this.pool.query(
      `UPDATE ptz_patrols
       SET name = COALESCE($3, name),
           presets = COALESCE($4, presets),
           repeat = COALESCE($5, repeat),
           enabled = COALESCE($6, enabled),
           updated_at = now()
       WHERE id=$1 AND tenant_id=$2
       RETURNING *`,
      [
        id,
        tenantId,
        updates.name ?? null,
        updates.presets ? JSON.stringify(updates.presets) : null,
        updates.repeat ?? null,
        updates.enabled ?? null,
      ],
    );
    return result.rows[0] ? mapPatrol(result.rows[0]) : undefined;
  }

  async deletePatrol(id: string, tenantId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM ptz_patrols WHERE id=$1 AND tenant_id=$2`,
      [id, tenantId],
    );
    return result.rowCount !== null && result.rowCount > 0;
  }
}

// ============ MAPPERS ============

function mapLock(row: any): PtzLock {
  return {
    id: row.id,
    cameraId: row.camera_id,
    operatorId: row.operator_id,
    operatorName: row.operator_name,
    lockedAt: new Date(row.locked_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    sessionId: row.session_id,
  };
}

function mapPreset(row: any): PtzPreset {
  return {
    id: row.id,
    cameraId: row.camera_id,
    tenantId: row.tenant_id,
    presetNumber: row.preset_number,
    name: row.name,
    description: row.description ?? undefined,
    position: row.position ? JSON.parse(row.position) : undefined,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapPatrol(row: any): PtzPatrol {
  return {
    id: row.id,
    cameraId: row.camera_id,
    tenantId: row.tenant_id,
    patrolNumber: row.patrol_number,
    name: row.name,
    presets: JSON.parse(row.presets),
    repeat: row.repeat,
    enabled: row.enabled,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
