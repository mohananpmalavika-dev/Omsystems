/**
 * Membership Repository for Recipient Resolution
 * 
 * Provides tenant-scoped role-based user lookups.
 * Supports branch roles and tenant-wide roles.
 */

import { Pool } from 'pg';
import { UserIdentity, UserStatus, ContactStatus } from '../recipient.types.js';
import { IMembershipRepository } from '../recipient-resolver.service.js';

/**
 * MembershipRepository implementation with role queries
 */
export class MembershipRepository implements IMembershipRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Find users by branch role
   * Enforces branch and tenant scoping
   */
  async findUsersByBranchRole(params: {
    tenantId: string;
    branchId: string;
    role: string;
    status?: string;
  }): Promise<UserIdentity[]> {
    const query = `
      SELECT DISTINCT
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
      JOIN branch_memberships bm ON bm.user_id = u.id
      JOIN tenant_memberships tm ON tm.user_id = u.id
      WHERE
        bm.branch_id = $1
        AND bm.role = $2
        AND bm.status = $3
        AND tm.tenant_id = $4
        AND tm.status = 'ACTIVE'
        AND u.status = 'ACTIVE'
      ORDER BY u.display_name
    `;

    const status = params.status || 'ACTIVE';

    try {
      const result = await this.pool.query(query, [
        params.branchId,
        params.role,
        status,
        params.tenantId,
      ]);

      return result.rows.map(row =>
        this.mapRowToUserIdentity(row, params.tenantId)
      );
    } catch (error) {
      throw new Error(
        `Failed to find users with branch role ${params.role} in branch ${params.branchId}: ${error}`
      );
    }
  }

  /**
   * Find users by tenant role
   * Tenant-wide role lookup
   */
  async findUsersByTenantRole(params: {
    tenantId: string;
    role: string;
    status?: string;
  }): Promise<UserIdentity[]> {
    const query = `
      SELECT DISTINCT
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
        tm.tenant_id = $1
        AND tm.role = $2
        AND tm.status = $3
        AND u.status = 'ACTIVE'
      ORDER BY u.display_name
    `;

    const status = params.status || 'ACTIVE';

    try {
      const result = await this.pool.query(query, [
        params.tenantId,
        params.role,
        status,
      ]);

      return result.rows.map(row =>
        this.mapRowToUserIdentity(row, params.tenantId)
      );
    } catch (error) {
      throw new Error(
        `Failed to find users with tenant role ${params.role}: ${error}`
      );
    }
  }

  /**
   * Get all roles for a user in a branch
   */
  async getUserBranchRoles(params: {
    tenantId: string;
    branchId: string;
    userId: string;
  }): Promise<string[]> {
    const query = `
      SELECT bm.role
      FROM branch_memberships bm
      JOIN tenant_memberships tm ON tm.user_id = bm.user_id
      WHERE
        bm.branch_id = $1
        AND bm.user_id = $2
        AND tm.tenant_id = $3
        AND bm.status = 'ACTIVE'
        AND tm.status = 'ACTIVE'
    `;

    try {
      const result = await this.pool.query(query, [
        params.branchId,
        params.userId,
        params.tenantId,
      ]);

      return result.rows.map(row => row.role);
    } catch (error) {
      throw new Error(
        `Failed to get branch roles for user ${params.userId}: ${error}`
      );
    }
  }

  /**
   * Get all tenant roles for a user
   */
  async getUserTenantRoles(params: {
    tenantId: string;
    userId: string;
  }): Promise<string[]> {
    const query = `
      SELECT tm.role
      FROM tenant_memberships tm
      WHERE
        tm.user_id = $1
        AND tm.tenant_id = $2
        AND tm.status = 'ACTIVE'
    `;

    try {
      const result = await this.pool.query(query, [
        params.userId,
        params.tenantId,
      ]);

      return result.rows.map(row => row.role);
    } catch (error) {
      throw new Error(
        `Failed to get tenant roles for user ${params.userId}: ${error}`
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
