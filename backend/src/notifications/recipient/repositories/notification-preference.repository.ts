/**
 * Notification Preference Repository
 * 
 * Manages user notification preferences for channel and event filtering.
 */

import { Pool } from 'pg';
import { NotificationPreferences } from '../endpoint.types.js';
import { INotificationPreferenceRepository } from '../endpoint-resolver.service.js';
import { INotificationPreferenceRepository as IPolicyPreferenceRepository } from '../recipient-policy.service.js';

/**
 * NotificationPreferenceRepository implementation
 */
export class NotificationPreferenceRepository 
  implements INotificationPreferenceRepository, IPolicyPreferenceRepository {
  
  constructor(private readonly pool: Pool) {}

  /**
   * Find user preferences with tenant scope
   */
  async findUserPreferences(params: {
    tenantId: string;
    userId: string;
  }): Promise<NotificationPreferences | null> {
    const query = `
      SELECT 
        id,
        tenant_id,
        user_id,
        channels,
        event_filters,
        quiet_hours,
        created_at,
        updated_at
      FROM notification_preferences
      WHERE 
        tenant_id = $1
        AND user_id = $2
      LIMIT 1
    `;

    try {
      const result = await this.pool.query(query, [
        params.tenantId,
        params.userId,
      ]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToPreferences(result.rows[0]);
    } catch (error) {
      throw new Error(
        `Failed to find preferences for user ${params.userId}: ${error}`
      );
    }
  }

  /**
   * Create or update user preferences
   */
  async upsertPreferences(
    preferences: Omit<NotificationPreferences, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<NotificationPreferences> {
    const query = `
      INSERT INTO notification_preferences (
        id,
        tenant_id,
        user_id,
        channels,
        event_filters,
        quiet_hours,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        $1, $2, $3, $4, $5, NOW(), NOW()
      )
      ON CONFLICT (tenant_id, user_id)
      DO UPDATE SET
        channels = EXCLUDED.channels,
        event_filters = EXCLUDED.event_filters,
        quiet_hours = EXCLUDED.quiet_hours,
        updated_at = NOW()
      RETURNING *
    `;

    try {
      const result = await this.pool.query(query, [
        preferences.tenantId,
        preferences.userId,
        JSON.stringify(preferences.channels),
        JSON.stringify(preferences.eventFilters),
        JSON.stringify(preferences.quietHours),
      ]);

      return this.mapRowToPreferences(result.rows[0]);
    } catch (error) {
      throw new Error(`Failed to upsert preferences: ${error}`);
    }
  }

  /**
   * Get default preferences for a new user
   */
  getDefaultPreferences(params: {
    tenantId: string;
    userId: string;
  }): NotificationPreferences {
    return {
      id: '', // Will be generated on insert
      tenantId: params.tenantId,
      userId: params.userId,
      channels: {
        email: {
          enabled: true,
          minimumSeverity: 'INFO',
        },
        sms: {
          enabled: true,
          minimumSeverity: 'WARNING',
        },
        push: {
          enabled: true,
          minimumSeverity: 'INFO',
        },
        inApp: {
          enabled: true,
          minimumSeverity: 'INFO',
        },
      },
      eventFilters: {},
      quietHours: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Delete user preferences
   */
  async deletePreferences(params: {
    tenantId: string;
    userId: string;
  }): Promise<void> {
    const query = `
      DELETE FROM notification_preferences
      WHERE 
        tenant_id = $1
        AND user_id = $2
    `;

    try {
      await this.pool.query(query, [params.tenantId, params.userId]);
    } catch (error) {
      throw new Error(
        `Failed to delete preferences for user ${params.userId}: ${error}`
      );
    }
  }

  /**
   * Map database row to NotificationPreferences
   */
  private mapRowToPreferences(row: any): NotificationPreferences {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      channels: row.channels,
      eventFilters: row.event_filters,
      quietHours: row.quiet_hours,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
