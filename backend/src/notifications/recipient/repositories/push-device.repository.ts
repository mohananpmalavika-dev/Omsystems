/**
 * Push Device Repository
 * 
 * Manages push notification device tokens with lifecycle tracking.
 * Handles device registration, invalidation, and active device queries.
 */

import { Pool } from 'pg';
import { PushDevice } from '../endpoint.types.js';
import { IPushDeviceRepository } from '../endpoint-resolver.service.js';

/**
 * PushDeviceRepository implementation
 */
export class PushDeviceRepository implements IPushDeviceRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Find active push devices for a user
   * Filters out invalidated and stale devices
   */
  async findActiveDevices(params: {
    tenantId: string;
    userId: string;
  }): Promise<PushDevice[]> {
    const query = `
      SELECT 
        id,
        tenant_id,
        user_id,
        provider,
        platform,
        token,
        device_id,
        enabled,
        registered_at,
        last_seen_at,
        invalidated_at,
        metadata
      FROM push_devices
      WHERE
        tenant_id = $1
        AND user_id = $2
        AND enabled = TRUE
        AND invalidated_at IS NULL
      ORDER BY last_seen_at DESC NULLS LAST
    `;

    try {
      const result = await this.pool.query(query, [
        params.tenantId,
        params.userId,
      ]);

      return result.rows.map(this.mapRowToPushDevice);
    } catch (error) {
      throw new Error(
        `Failed to find push devices for user ${params.userId}: ${error}`
      );
    }
  }

  /**
   * Register a new push device
   */
  async registerDevice(device: Omit<PushDevice, 'id'>): Promise<PushDevice> {
    const query = `
      INSERT INTO push_devices (
        id,
        tenant_id,
        user_id,
        provider,
        platform,
        token,
        device_id,
        enabled,
        registered_at,
        last_seen_at,
        metadata
      ) VALUES (
        gen_random_uuid(),
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      )
      ON CONFLICT (provider, token)
      DO UPDATE SET
        last_seen_at = EXCLUDED.last_seen_at,
        enabled = TRUE,
        invalidated_at = NULL
      RETURNING *
    `;

    try {
      const result = await this.pool.query(query, [
        device.tenantId,
        device.userId,
        device.provider,
        device.platform,
        device.token,
        device.deviceId,
        device.enabled,
        device.registeredAt,
        device.lastSeenAt || device.registeredAt,
        JSON.stringify(device.metadata),
      ]);

      return this.mapRowToPushDevice(result.rows[0]);
    } catch (error) {
      throw new Error(`Failed to register push device: ${error}`);
    }
  }

  /**
   * Update last seen timestamp
   */
  async updateLastSeen(deviceId: string): Promise<void> {
    const query = `
      UPDATE push_devices
      SET last_seen_at = NOW()
      WHERE id = $1
    `;

    try {
      await this.pool.query(query, [deviceId]);
    } catch (error) {
      throw new Error(`Failed to update last seen for device ${deviceId}: ${error}`);
    }
  }

  /**
   * Invalidate a push device (e.g., after provider error)
   */
  async invalidateDevice(
    token: string,
    reason: string
  ): Promise<void> {
    const query = `
      UPDATE push_devices
      SET 
        invalidated_at = NOW(),
        enabled = FALSE,
        metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{invalidation_reason}',
          $2::jsonb
        )
      WHERE token = $1
    `;

    try {
      await this.pool.query(query, [token, JSON.stringify(reason)]);
    } catch (error) {
      throw new Error(`Failed to invalidate device with token: ${error}`);
    }
  }

  /**
   * Disable a device (user action)
   */
  async disableDevice(deviceId: string): Promise<void> {
    const query = `
      UPDATE push_devices
      SET enabled = FALSE
      WHERE id = $1
    `;

    try {
      await this.pool.query(query, [deviceId]);
    } catch (error) {
      throw new Error(`Failed to disable device ${deviceId}: ${error}`);
    }
  }

  /**
   * Delete a device
   */
  async deleteDevice(deviceId: string): Promise<void> {
    const query = `
      DELETE FROM push_devices
      WHERE id = $1
    `;

    try {
      await this.pool.query(query, [deviceId]);
    } catch (error) {
      throw new Error(`Failed to delete device ${deviceId}: ${error}`);
    }
  }

  /**
   * Clean up stale devices (no activity for N days)
   */
  async cleanupStaleDevices(staleDays: number = 180): Promise<number> {
    const query = `
      UPDATE push_devices
      SET 
        enabled = FALSE,
        invalidated_at = NOW(),
        metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{invalidation_reason}',
          '"STALE"'::jsonb
        )
      WHERE
        enabled = TRUE
        AND invalidated_at IS NULL
        AND last_seen_at < NOW() - INTERVAL '1 day' * $1
      RETURNING id
    `;

    try {
      const result = await this.pool.query(query, [staleDays]);
      return result.rowCount || 0;
    } catch (error) {
      throw new Error(`Failed to cleanup stale devices: ${error}`);
    }
  }

  /**
   * Get device by token
   */
  async findByToken(token: string): Promise<PushDevice | null> {
    const query = `
      SELECT 
        id,
        tenant_id,
        user_id,
        provider,
        platform,
        token,
        device_id,
        enabled,
        registered_at,
        last_seen_at,
        invalidated_at,
        metadata
      FROM push_devices
      WHERE token = $1
      LIMIT 1
    `;

    try {
      const result = await this.pool.query(query, [token]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToPushDevice(result.rows[0]);
    } catch (error) {
      throw new Error(`Failed to find device by token: ${error}`);
    }
  }

  /**
   * Get all devices for a user (including disabled)
   */
  async findAllUserDevices(params: {
    tenantId: string;
    userId: string;
  }): Promise<PushDevice[]> {
    const query = `
      SELECT 
        id,
        tenant_id,
        user_id,
        provider,
        platform,
        token,
        device_id,
        enabled,
        registered_at,
        last_seen_at,
        invalidated_at,
        metadata
      FROM push_devices
      WHERE
        tenant_id = $1
        AND user_id = $2
      ORDER BY registered_at DESC
    `;

    try {
      const result = await this.pool.query(query, [
        params.tenantId,
        params.userId,
      ]);

      return result.rows.map(this.mapRowToPushDevice);
    } catch (error) {
      throw new Error(
        `Failed to find all devices for user ${params.userId}: ${error}`
      );
    }
  }

  /**
   * Map database row to PushDevice
   */
  private mapRowToPushDevice(row: any): PushDevice {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      provider: row.provider,
      platform: row.platform,
      token: row.token,
      deviceId: row.device_id,
      enabled: row.enabled,
      registeredAt: row.registered_at,
      lastSeenAt: row.last_seen_at,
      invalidatedAt: row.invalidated_at,
      metadata: row.metadata || {},
    };
  }
}
