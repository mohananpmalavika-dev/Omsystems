/**
 * User Repository for Recipient Resolution
 * 
 * Provides tenant-scoped user lookups with contact information.
 * Enforces tenant boundaries to prevent cross-tenant data leakage.
 */

import { Pool, PoolClient } from 'pg';
import { UserIdentity, UserStatus, ContactStatus } from '../recipient.types.js';
import { IUserRepository } from '../recipient-resolver.service.js';

/**
 * UserRepository implementation with tenant scoping
 */
export class UserRepository implements IUserRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Find active user within tenant
   * CRITICAL: Must enforce tenant scope to prevent cross-tenant leakage
   */
  async findActiveTenantUser(params: {
    tenantId: string;
    userId: string;
  }): Promise<UserIdentity | null> {
    const query = `
      SELECT 
        u.id,
        u.display_name,
        u.email,
        u.email_verified_at,
        u.email_status,
        u.phone_number,
        u.phone_verified_at,
        u.phone_status,
        u.status,
        u.metadata
      FROM users u
      JOIN tenant_memberships tm ON tm.user_id = u.id
      WHERE 
        u.id = $1
        AND tm.tenant_id = $2
        AND tm.status = 'ACTIVE'
        AND u.status IN ('ACTIVE', 'INACTIVE')
      LIMIT 1
    `;

    try {
      const result = await this.pool.query(query, [
        params.userId,
        params.tenantId,
      ]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToUserIdentity(result.rows[0], params.tenantId);
    } catch (error) {
      throw new Error(
        `Failed to find user ${params.userId} in tenant ${params.tenantId}: ${error}`
      );
    }
  }

  /**
   * Find multiple users by IDs (tenant-scoped batch lookup)
   */
  async findManyByIds(params: {
    tenantId: string;
    userIds: string[];
  }): Promise<UserIdentity[]> {
    if (params.userIds.length === 0) {
      return [];
    }

    const query = `
      SELECT 
        u.id,
        u.display_name,
        u.email,
        u.email_verified_at,
        u.email_status,
        u.phone_number,
        u.phone_verified_at,
        u.phone_status,
        u.status,
        u.metadata
      FROM users u
      JOIN tenant_memberships tm ON tm.user_id = u.id
      WHERE 
        u.id = ANY($1::uuid[])
        AND tm.tenant_id = $2
        AND tm.status = 'ACTIVE'
        AND u.status = 'ACTIVE'
    `;

    try {
      const result = await this.pool.query(query, [
        params.userIds,
        params.tenantId,
      ]);

      return result.rows.map(row => 
        this.mapRowToUserIdentity(row, params.tenantId)
      );
    } catch (error) {
      throw new Error(
        `Failed to find users in tenant ${params.tenantId}: ${error}`
      );
    }
  }

  /**
   * Map database row to UserIdentity
   */
  private mapRowToUserIdentity(row: any, tenantId: string): UserIdentity {
    return {
      id: row.id,
      tenantId,
      displayName: row.display_name,
      email: row.email,
      emailVerifiedAt: row.email_verified_at,
      emailStatus: row.email_status as ContactStatus,
      phoneNumber: row.phone_number,
      phoneVerifiedAt: row.phone_verified_at,
      phoneStatus: row.phone_status as ContactStatus,
      status: row.status as UserStatus,
      metadata: row.metadata || {},
    };
  }
}
