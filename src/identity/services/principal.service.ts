/**
 * Principal Service
 * 
 * Resolves authenticated principals with effective permissions.
 * 
 * A principal represents a fully resolved identity with:
 * - User account details
 * - Tenant membership
 * - Assigned roles
 * - Effective permissions
 * - Account status
 * - Authentication context
 * 
 * This service is called AFTER authentication to build the principal
 * that will be used for authorization decisions.
 */

import type { Pool } from 'pg';
import type {
  AuthenticatedPrincipal,
  AuthenticationSource,
  AccountStatus,
  MembershipStatus,
  PrincipalUser,
  AuthenticationContext,
  ResolvePrincipalOptions,
} from '../domain/authenticated-principal.js';
import {
  AccountStatusError,
  MembershipError,
  EnterpriseAuthError,
} from '../domain/auth-errors.js';

/**
 * Database user record
 */
interface UserRecord {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  givenName?: string;
  familyName?: string;
  avatar?: string;
  locale?: string;
  timezone?: string;
  status: AccountStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Database membership record
 */
interface MembershipRecord {
  id: string;
  tenantId: string;
  userId: string;
  status: MembershipStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Database role record
 */
interface RoleRecord {
  id: string;
  name: string;
  description?: string;
}

/**
 * Database permission record
 */
interface PermissionRecord {
  id: string;
  name: string;
  resource: string;
  action: string;
}

/**
 * Principal Service
 */
export class PrincipalService {
  constructor(private pool: Pool) {}

  /**
   * Resolve authenticated principal
   * 
   * This is the primary method for building a principal after authentication.
   */
  async resolve(
    userId: string,
    tenantId: string,
    authContext: AuthenticationContext,
    options: ResolvePrincipalOptions = {},
  ): Promise<AuthenticatedPrincipal> {
    // Get user details
    const user = await this.getUser(userId, tenantId);

    if (!user) {
      throw new EnterpriseAuthError(
        'IDENTITY_NOT_FOUND',
        'User not found',
        { userId, tenantId }
      );
    }

    // Validate user status
    if (options.requireActive && user.status !== 'ACTIVE') {
      throw new AccountStatusError(
        'ACCOUNT_NOT_ACTIVE',
        `User account is ${user.status.toLowerCase()}`,
        userId,
        { status: user.status }
      );
    }

    // Get tenant membership
    const membership = await this.getMembership(userId, tenantId);

    if (!membership) {
      throw new MembershipError(
        'MEMBERSHIP_NOT_FOUND',
        'User is not a member of this tenant',
        { userId, tenantId }
      );
    }

    // Validate membership status
    if (options.requireActiveMembership && membership.status !== 'ACTIVE') {
      throw new MembershipError(
        'MEMBERSHIP_DISABLED',
        `Tenant membership is ${membership.status.toLowerCase()}`,
        { userId, tenantId, status: membership.status }
      );
    }

    // Get roles
    const roles = await this.getRoles(membership.id);

    // Get permissions (if requested)
    let permissions: string[] = [];
    if (options.includePermissions !== false) {
      permissions = await this.getPermissions(roles.map((r) => r.id));
    }

    // Build principal
    const principal: AuthenticatedPrincipal = {
      userId: user.id,
      tenantId,
      membershipId: membership.id,
      userStatus: user.status,
      membershipStatus: membership.status,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        givenName: user.givenName,
        familyName: user.familyName,
        avatar: user.avatar,
        locale: user.locale,
        timezone: user.timezone,
      },
      roles: roles.map((r) => r.id),
      permissions,
      authentication: authContext,
    };

    // Add metadata if requested
    if (options.includeMetadata) {
      principal.metadata = {
        createdAt: user.createdAt,
        lastActivity: new Date(),
      };
    }

    return principal;
  }

  /**
   * Resolve principal from existing session
   * 
   * Used when validating an existing session token.
   */
  async resolveFromSession(
    userId: string,
    tenantId: string,
    membershipId: string,
    authContext: AuthenticationContext,
  ): Promise<AuthenticatedPrincipal> {
    // Get user details
    const user = await this.getUser(userId, tenantId);

    if (!user) {
      throw new EnterpriseAuthError(
        'IDENTITY_NOT_FOUND',
        'User not found',
        { userId, tenantId }
      );
    }

    // Check user status
    if (user.status !== 'ACTIVE') {
      throw new AccountStatusError(
        'ACCOUNT_NOT_ACTIVE',
        `User account is ${user.status.toLowerCase()}`,
        userId,
        { status: user.status }
      );
    }

    // Get membership
    const membership = await this.getMembershipById(membershipId);

    if (!membership || membership.tenantId !== tenantId || membership.userId !== userId) {
      throw new MembershipError(
        'MEMBERSHIP_NOT_FOUND',
        'Invalid membership',
        { userId, tenantId, membershipId }
      );
    }

    // Check membership status
    if (membership.status !== 'ACTIVE') {
      throw new MembershipError(
        'MEMBERSHIP_DISABLED',
        `Tenant membership is ${membership.status.toLowerCase()}`,
        { userId, tenantId, status: membership.status }
      );
    }

    // Get roles and permissions
    const roles = await this.getRoles(membership.id);
    const permissions = await this.getPermissions(roles.map((r) => r.id));

    return {
      userId: user.id,
      tenantId,
      membershipId: membership.id,
      userStatus: user.status,
      membershipStatus: membership.status,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        givenName: user.givenName,
        familyName: user.familyName,
        avatar: user.avatar,
        locale: user.locale,
        timezone: user.timezone,
      },
      roles: roles.map((r) => r.id),
      permissions,
      authentication: authContext,
    };
  }

  /**
   * Assign roles to a membership
   */
  async assignRoles(
    membershipId: string,
    roleIds: string[],
  ): Promise<void> {
    if (roleIds.length === 0) {
      return;
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Remove existing role assignments
      await client.query(
        `DELETE FROM membership_roles
         WHERE membership_id = $1`,
        [membershipId]
      );

      // Verify all roles exist
      const roleCheck = await client.query(
        `SELECT id
         FROM roles
         WHERE id = ANY($1::uuid[])
           AND status = 'ACTIVE'`,
        [roleIds]
      );

      if (roleCheck.rows.length !== roleIds.length) {
        throw new EnterpriseAuthError(
          'ROLE_MAPPING_FAILED',
          'One or more roles do not exist or are inactive',
        );
      }

      // Assign new roles
      for (const roleId of roleIds) {
        await client.query(
          `INSERT INTO membership_roles (membership_id, role_id)
           VALUES ($1, $2)
           ON CONFLICT (membership_id, role_id) DO NOTHING`,
          [membershipId, roleId]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if principal has specific permission
   */
  async hasPermission(
    principal: AuthenticatedPrincipal,
    permission: string,
  ): Promise<boolean> {
    return principal.permissions.includes(permission);
  }

  /**
   * Check if principal has any of the specified permissions
   */
  async hasAnyPermission(
    principal: AuthenticatedPrincipal,
    permissions: string[],
  ): Promise<boolean> {
    return permissions.some((p) => principal.permissions.includes(p));
  }

  /**
   * Check if principal has all of the specified permissions
   */
  async hasAllPermissions(
    principal: AuthenticatedPrincipal,
    permissions: string[],
  ): Promise<boolean> {
    return permissions.every((p) => principal.permissions.includes(p));
  }

  /**
   * Check if principal has specific role
   */
  hasRole(principal: AuthenticatedPrincipal, roleId: string): boolean {
    return principal.roles.includes(roleId);
  }

  /**
   * Check if principal has any of the specified roles
   */
  hasAnyRole(principal: AuthenticatedPrincipal, roleIds: string[]): boolean {
    return roleIds.some((r) => principal.roles.includes(r));
  }

  /**
   * Get user details
   */
  private async getUser(userId: string, tenantId: string): Promise<UserRecord | null> {
    const result = await this.pool.query<UserRecord>(
      `SELECT 
        id, tenant_id as "tenantId", email, display_name as "displayName",
        given_name as "givenName", family_name as "familyName",
        avatar, locale, timezone, status,
        created_at as "createdAt", updated_at as "updatedAt"
      FROM users
      WHERE id = $1
        AND tenant_id = $2`,
      [userId, tenantId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get tenant membership
   */
  private async getMembership(
    userId: string,
    tenantId: string,
  ): Promise<MembershipRecord | null> {
    const result = await this.pool.query<MembershipRecord>(
      `SELECT 
        id, tenant_id as "tenantId", user_id as "userId", status,
        created_at as "createdAt", updated_at as "updatedAt"
      FROM tenant_memberships
      WHERE user_id = $1
        AND tenant_id = $2`,
      [userId, tenantId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get membership by ID
   */
  private async getMembershipById(membershipId: string): Promise<MembershipRecord | null> {
    const result = await this.pool.query<MembershipRecord>(
      `SELECT 
        id, tenant_id as "tenantId", user_id as "userId", status,
        created_at as "createdAt", updated_at as "updatedAt"
      FROM tenant_memberships
      WHERE id = $1`,
      [membershipId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get roles for membership
   */
  private async getRoles(membershipId: string): Promise<RoleRecord[]> {
    const result = await this.pool.query<RoleRecord>(
      `SELECT 
        r.id, r.name, r.description
      FROM roles r
      INNER JOIN membership_roles mr ON mr.role_id = r.id
      WHERE mr.membership_id = $1
        AND r.status = 'ACTIVE'
      ORDER BY r.name`,
      [membershipId]
    );

    return result.rows;
  }

  /**
   * Get effective permissions for roles
   */
  private async getPermissions(roleIds: string[]): Promise<string[]> {
    if (roleIds.length === 0) {
      return [];
    }

    const result = await this.pool.query<PermissionRecord>(
      `SELECT DISTINCT 
        p.id, p.name, p.resource, p.action
      FROM permissions p
      INNER JOIN role_permissions rp ON rp.permission_id = p.id
      WHERE rp.role_id = ANY($1::uuid[])
        AND p.status = 'ACTIVE'
      ORDER BY p.name`,
      [roleIds]
    );

    return result.rows.map((p) => p.name);
  }

  /**
   * Refresh principal (reload from database)
   * 
   * Used when roles or permissions may have changed.
   */
  async refresh(principal: AuthenticatedPrincipal): Promise<AuthenticatedPrincipal> {
    return this.resolveFromSession(
      principal.userId,
      principal.tenantId,
      principal.membershipId,
      principal.authentication,
    );
  }

  /**
   * Get all permissions available in the system
   */
  async getAllPermissions(): Promise<PermissionRecord[]> {
    const result = await this.pool.query<PermissionRecord>(
      `SELECT id, name, resource, action, description
       FROM permissions
       WHERE status = 'ACTIVE'
       ORDER BY resource, action`
    );

    return result.rows;
  }

  /**
   * Get all roles available in a tenant
   */
  async getAllRoles(tenantId: string): Promise<RoleRecord[]> {
    const result = await this.pool.query<RoleRecord>(
      `SELECT id, name, description
       FROM roles
       WHERE tenant_id = $1
         AND status = 'ACTIVE'
       ORDER BY name`,
      [tenantId]
    );

    return result.rows;
  }
}
