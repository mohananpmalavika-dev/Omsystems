/**
 * On-Call Service
 * 
 * Resolves current on-call assignments from schedules.
 * Handles rotations, overrides, and timezone-aware resolution.
 */

import { Pool } from 'pg';
import { OnCallAssignment, OnCallSchedule } from '../recipient.types.js';
import { IOnCallService } from '../recipient-resolver.service.js';
import { logger } from '../../../utils/logger.js';

/**
 * OnCallService implementation
 */
export class OnCallService implements IOnCallService {
  constructor(private readonly pool: Pool) {}

  /**
   * Resolve current on-call assignments for a schedule
   * Time-aware resolution with override support
   */
  async resolveCurrentAssignments(params: {
    tenantId: string;
    scheduleId: string;
    at: Date;
  }): Promise<OnCallAssignment[]> {
    // First check for active overrides
    const overrides = await this.findActiveOverrides(params);
    
    if (overrides.length > 0) {
      logger.debug('Using on-call overrides', {
        scheduleId: params.scheduleId,
        overrideCount: overrides.length,
      });
      return overrides;
    }

    // Fall back to regular rotation
    return this.findRotationAssignments(params);
  }

  /**
   * Find active overrides for a schedule at a specific time
   */
  private async findActiveOverrides(params: {
    tenantId: string;
    scheduleId: string;
    at: Date;
  }): Promise<OnCallAssignment[]> {
    const query = `
      SELECT 
        user_id,
        schedule_id,
        tenant_id,
        effective_from,
        effective_until,
        override_id
      FROM on_call_overrides
      WHERE
        tenant_id = $1
        AND schedule_id = $2
        AND effective_from <= $3
        AND effective_until >= $3
        AND active = TRUE
      ORDER BY effective_from DESC
    `;

    try {
      const result = await this.pool.query(query, [
        params.tenantId,
        params.scheduleId,
        params.at,
      ]);

      return result.rows.map(row => ({
        userId: row.user_id,
        scheduleId: row.schedule_id,
        tenantId: row.tenant_id,
        effectiveFrom: row.effective_from,
        effectiveUntil: row.effective_until,
        overrideId: row.override_id,
      }));
    } catch (error) {
      logger.error('Failed to find on-call overrides', { error, params });
      return [];
    }
  }

  /**
   * Find regular rotation assignments
   */
  private async findRotationAssignments(params: {
    tenantId: string;
    scheduleId: string;
    at: Date;
  }): Promise<OnCallAssignment[]> {
    // This is a simplified implementation
    // A full implementation would handle:
    // - Weekly/daily rotations
    // - Multiple rotation layers (primary, secondary)
    // - Timezone conversion
    // - Rotation start date and handoff times
    
    const query = `
      SELECT 
        rm.user_id,
        r.schedule_id,
        s.tenant_id,
        r.rotation_id
      FROM on_call_rotations r
      JOIN on_call_rotation_members rm ON rm.rotation_id = r.id
      JOIN on_call_schedules s ON s.id = r.schedule_id
      WHERE
        s.tenant_id = $1
        AND r.schedule_id = $2
        AND r.enabled = TRUE
        AND s.enabled = TRUE
      ORDER BY r.priority ASC, rm.position ASC
      LIMIT 1
    `;

    try {
      const result = await this.pool.query(query, [
        params.tenantId,
        params.scheduleId,
      ]);

      if (result.rows.length === 0) {
        return [];
      }

      const row = result.rows[0];
      
      return [{
        userId: row.user_id,
        scheduleId: row.schedule_id,
        tenantId: row.tenant_id,
        effectiveFrom: params.at,
        effectiveUntil: new Date(params.at.getTime() + 24 * 60 * 60 * 1000), // 24 hours
        rotationId: row.rotation_id,
      }];
    } catch (error) {
      logger.error('Failed to find rotation assignments', { error, params });
      return [];
    }
  }

  /**
   * Get schedule by ID
   */
  async findSchedule(params: {
    tenantId: string;
    scheduleId: string;
  }): Promise<OnCallSchedule | null> {
    const query = `
      SELECT 
        id,
        tenant_id,
        name,
        timezone,
        enabled
      FROM on_call_schedules
      WHERE
        id = $1
        AND tenant_id = $2
      LIMIT 1
    `;

    try {
      const result = await this.pool.query(query, [
        params.scheduleId,
        params.tenantId,
      ]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        tenantId: row.tenant_id,
        name: row.name,
        timezone: row.timezone,
        enabled: row.enabled,
      };
    } catch (error) {
      throw new Error(
        `Failed to find schedule ${params.scheduleId}: ${error}`
      );
    }
  }
}
