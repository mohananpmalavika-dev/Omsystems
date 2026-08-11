/**
 * Role Mapping Service
 * 
 * Maps external identity provider groups to local application roles.
 * 
 * Key principles:
 * - External groups are provider-specific identifiers
 * - Local roles are application-level permissions
 * - Mappings are tenant-scoped
 * - Default to no privileges when no mapping exists
 * - Support priority-based mapping (multiple groups → multiple roles)
 */

import type { Pool } from 'pg';
import type { VerifiedExternalIdentity } from '../domain/verified-external-identity.js';
import { AuthorizationError } from '../domain/auth-errors.js';

/**
 * Role mapping configuration
 */
export interface RoleMapping {
  /**
   * Mapping identifier
   */
  id: string;

  /**
   * Tenant identifier
   */
  tenantId: string;

  /**
   * Identity provider identifier
   */
  providerId: string;

  /**
   * External group identifier (from IdP)
   * 
   * Examples:
   * - Azure AD: group object ID or display name
   * - LDAP: DN or CN
   * - SAML: group attribute value
   */
  externalGroup: string;

  /**
   * Local role identifier
   */
  roleId: string;

  /**
   * Role name (for display)
   */
  roleName: string;

  /**
   * Mapping priority (higher = more important)
   * Used when multiple groups map to conflicting roles
   */
  priority: number;

  /**
   * Whether mapping is enabled
   */
  enabled: boolean;

  /**
   * When mapping was created
   */
  createdAt: Date;

  /**
   * When mapping was updated
   */
  updatedAt: Date;
}

/**
 * Create role mapping input
 */
export interface CreateRoleMappingInput {
  tenantId: string;
  providerId: string;
  externalGroup: string;
  roleId: string;
  priority?: number;
  enabled?: boolean;
}

/**
 * Resolved roles result
 */
export interface ResolvedRoles {
  /**
   * Role identifiers
   */
  roleIds: string[];

  /**
   * Role names
   */
  roleNames: string[];

  /**
   * Mapped groups (which external groups produced these roles)
   */
  mappedGroups: string[];

  /**
   * Unmapped groups (external groups with no role mapping)
   */
  unmappedGroups: string[];

  /**
   * Mapping metadata
   */
  metadata: {
    /**
     * Total external groups
     */
    totalGroups: number;

    /**
     * Groups that mapped to roles
     */
    mappedCount: number;

    /**
     * Groups with no mapping
     */
    unmappedCount: number;

    /**
     * Whether default role was applied
     */
    defaultRoleApplied: boolean;
  };
}

/**
 * Role Mapping Service
 */
export class RoleMappingService {
  constructor(private pool: Pool) {}

  /**
   * Resolve local roles from external identity groups
   * 
   * This is the primary method called during authentication.
   */
  async resolveRoles(
    tenantId: string,
    providerId: string,
    identity: VerifiedExternalIdentity,
    options: {
      defaultRoleId?: string;
      requireMappedRole?: boolean;
    } = {},
  ): Promise<ResolvedRoles> {
    const externalGroups = identity.groups || [];

    if (externalGroups.length === 0) {
      // No groups provided
      return this.handleNoGroups(options);
    }

    // Find all active mappings for these groups
    const result = await this.pool.query<{
      roleId: string;
      roleName: string;
      externalGroup: string;
      priority: number;
    }>(
      `SELECT 
        erm.role_id as "roleId",
        r.name as "roleName",
        erm.external_group as "externalGroup",
        erm.priority
      FROM enterprise_role_mappings erm
      INNER JOIN roles r ON r.id = erm.role_id
      WHERE erm.tenant_id = $1
        AND erm.provider_id = $2
        AND erm.external_group = ANY($3::text[])
        AND erm.enabled = true
        AND r.status = 'ACTIVE'
      ORDER BY erm.priority DESC, r.name`,
      [tenantId, providerId, externalGroups]
    );

    const mappings = result.rows;

    // Extract unique roles (ordered by priority)
    const roleMap = new Map<string, { roleName: string; priority: number }>();
    const mappedGroups = new Set<string>();

    for (const mapping of mappings) {
      mappedGroups.add(mapping.externalGroup);

      if (!roleMap.has(mapping.roleId)) {
        roleMap.set(mapping.roleId, {
          roleName: mapping.roleName,
          priority: mapping.priority,
        });
      }
    }

    const roleIds = Array.from(roleMap.keys());
    const roleNames = Array.from(roleMap.values()).map((r) => r.roleName);
    const mappedGroupsList = Array.from(mappedGroups);
    const unmappedGroups = externalGroups.filter((g) => !mappedGroups.has(g));

    // Handle case where no groups mapped to roles
    if (roleIds.length === 0) {
      if (options.requireMappedRole) {
        throw new AuthorizationError(
          'NO_ROLE_MAPPING',
          'No authorized application role is mapped for this identity',
          {
            providerId,
            externalGroups,
          }
        );
      }

      // Apply default role if configured
      if (options.defaultRoleId) {
        const defaultRole = await this.getRole(options.defaultRoleId);

        return {
          roleIds: [options.defaultRoleId],
          roleNames: [defaultRole.name],
          mappedGroups: [],
          unmappedGroups: externalGroups,
          metadata: {
            totalGroups: externalGroups.length,
            mappedCount: 0,
            unmappedCount: externalGroups.length,
            defaultRoleApplied: true,
          },
        };
      }

      // No default, return empty roles
      return {
        roleIds: [],
        roleNames: [],
        mappedGroups: [],
        unmappedGroups: externalGroups,
        metadata: {
          totalGroups: externalGroups.length,
          mappedCount: 0,
          unmappedCount: externalGroups.length,
          defaultRoleApplied: false,
        },
      };
    }

    return {
      roleIds,
      roleNames,
      mappedGroups: mappedGroupsList,
      unmappedGroups,
      metadata: {
        totalGroups: externalGroups.length,
        mappedCount: mappedGroupsList.length,
        unmappedCount: unmappedGroups.length,
        defaultRoleApplied: false,
      },
    };
  }

  /**
   * Handle case where identity has no groups
   */
  private async handleNoGroups(options: {
    defaultRoleId?: string;
    requireMappedRole?: boolean;
  }): Promise<ResolvedRoles> {
    if (options.requireMappedRole) {
      throw new AuthorizationError(
        'NO_ROLE_MAPPING',
        'Identity has no groups and role mapping is required',
      );
    }

    if (options.defaultRoleId) {
      const defaultRole = await this.getRole(options.defaultRoleId);

      return {
        roleIds: [options.defaultRoleId],
        roleNames: [defaultRole.name],
        mappedGroups: [],
        unmappedGroups: [],
        metadata: {
          totalGroups: 0,
          mappedCount: 0,
          unmappedCount: 0,
          defaultRoleApplied: true,
        },
      };
    }

    return {
      roleIds: [],
      roleNames: [],
      mappedGroups: [],
      unmappedGroups: [],
      metadata: {
        totalGroups: 0,
        mappedCount: 0,
        unmappedCount: 0,
        defaultRoleApplied: false,
      },
    };
  }

  /**
   * Create role mapping
   */
  async createMapping(input: CreateRoleMappingInput): Promise<RoleMapping> {
    // Verify role exists
    const role = await this.getRole(input.roleId);

    const result = await this.pool.query<RoleMapping>(
      `INSERT INTO enterprise_role_mappings (
        tenant_id, provider_id, external_group, role_id,
        priority, enabled, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, now(), now())
      RETURNING
        id, tenant_id as "tenantId", provider_id as "providerId",
        external_group as "externalGroup", role_id as "roleId",
        priority, enabled, created_at as "createdAt", updated_at as "updatedAt"`,
      [
        input.tenantId,
        input.providerId,
        input.externalGroup,
        input.roleId,
        input.priority ?? 0,
        input.enabled ?? true,
      ]
    );

    return {
      ...result.rows[0],
      roleName: role.name,
    };
  }

  /**
   * Update role mapping
   */
  async updateMapping(
    mappingId: string,
    updates: {
      roleId?: string;
      priority?: number;
      enabled?: boolean;
    },
  ): Promise<RoleMapping> {
    const setParts: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.roleId !== undefined) {
      setParts.push(`role_id = $${paramIndex}`);
      values.push(updates.roleId);
      paramIndex++;
    }

    if (updates.priority !== undefined) {
      setParts.push(`priority = $${paramIndex}`);
      values.push(updates.priority);
      paramIndex++;
    }

    if (updates.enabled !== undefined) {
      setParts.push(`enabled = $${paramIndex}`);
      values.push(updates.enabled);
      paramIndex++;
    }

    if (setParts.length === 0) {
      throw new Error('No updates provided');
    }

    setParts.push('updated_at = now()');
    values.push(mappingId);

    const result = await this.pool.query<RoleMapping>(
      `UPDATE enterprise_role_mappings
       SET ${setParts.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING
         id, tenant_id as "tenantId", provider_id as "providerId",
         external_group as "externalGroup", role_id as "roleId",
         priority, enabled, created_at as "createdAt", updated_at as "updatedAt"`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error('Role mapping not found');
    }

    const mapping = result.rows[0];
    const role = await this.getRole(mapping.roleId);

    return {
      ...mapping,
      roleName: role.name,
    };
  }

  /**
   * Delete role mapping
   */
  async deleteMapping(mappingId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM enterprise_role_mappings
       WHERE id = $1`,
      [mappingId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get all role mappings for a provider
   */
  async getMappingsForProvider(
    tenantId: string,
    providerId: string,
  ): Promise<RoleMapping[]> {
    const result = await this.pool.query<RoleMapping>(
      `SELECT 
        erm.id, erm.tenant_id as "tenantId", erm.provider_id as "providerId",
        erm.external_group as "externalGroup", erm.role_id as "roleId",
        r.name as "roleName",
        erm.priority, erm.enabled,
        erm.created_at as "createdAt", erm.updated_at as "updatedAt"
      FROM enterprise_role_mappings erm
      INNER JOIN roles r ON r.id = erm.role_id
      WHERE erm.tenant_id = $1
        AND erm.provider_id = $2
      ORDER BY erm.priority DESC, r.name`,
      [tenantId, providerId]
    );

    return result.rows;
  }

  /**
   * Get role mappings for external group
   */
  async getMappingsForGroup(
    tenantId: string,
    providerId: string,
    externalGroup: string,
  ): Promise<RoleMapping[]> {
    const result = await this.pool.query<RoleMapping>(
      `SELECT 
        erm.id, erm.tenant_id as "tenantId", erm.provider_id as "providerId",
        erm.external_group as "externalGroup", erm.role_id as "roleId",
        r.name as "roleName",
        erm.priority, erm.enabled,
        erm.created_at as "createdAt", erm.updated_at as "updatedAt"
      FROM enterprise_role_mappings erm
      INNER JOIN roles r ON r.id = erm.role_id
      WHERE erm.tenant_id = $1
        AND erm.provider_id = $2
        AND erm.external_group = $3
      ORDER BY erm.priority DESC`,
      [tenantId, providerId, externalGroup]
    );

    return result.rows;
  }

  /**
   * Bulk create role mappings
   */
  async bulkCreateMappings(
    mappings: CreateRoleMappingInput[],
  ): Promise<RoleMapping[]> {
    if (mappings.length === 0) {
      return [];
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const results: RoleMapping[] = [];

      for (const mapping of mappings) {
        const result = await client.query<RoleMapping>(
          `INSERT INTO enterprise_role_mappings (
            tenant_id, provider_id, external_group, role_id,
            priority, enabled, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, now(), now())
          ON CONFLICT (tenant_id, provider_id, external_group, role_id)
          DO UPDATE SET
            priority = EXCLUDED.priority,
            enabled = EXCLUDED.enabled,
            updated_at = now()
          RETURNING
            id, tenant_id as "tenantId", provider_id as "providerId",
            external_group as "externalGroup", role_id as "roleId",
            priority, enabled, created_at as "createdAt", updated_at as "updatedAt"`,
          [
            mapping.tenantId,
            mapping.providerId,
            mapping.externalGroup,
            mapping.roleId,
            mapping.priority ?? 0,
            mapping.enabled ?? true,
          ]
        );

        const role = await this.getRole(mapping.roleId);

        results.push({
          ...result.rows[0],
          roleName: role.name,
        });
      }

      await client.query('COMMIT');

      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete all mappings for a provider
   */
  async deleteAllForProvider(tenantId: string, providerId: string): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM enterprise_role_mappings
       WHERE tenant_id = $1
         AND provider_id = $2`,
      [tenantId, providerId]
    );

    return result.rowCount ?? 0;
  }

  /**
   * Get role by ID
   */
  private async getRole(roleId: string): Promise<{ id: string; name: string }> {
    const result = await this.pool.query(
      `SELECT id, name
       FROM roles
       WHERE id = $1`,
      [roleId]
    );

    if (result.rows.length === 0) {
      throw new AuthorizationError(
        'ROLE_MAPPING_FAILED',
        `Role not found: ${roleId}`,
      );
    }

    return result.rows[0];
  }

  /**
   * Validate role mappings (check for missing roles, etc.)
   */
  async validateMappings(
    tenantId: string,
    providerId: string,
  ): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for mappings with invalid roles
    const invalidRoles = await this.pool.query(
      `SELECT erm.id, erm.role_id as "roleId"
       FROM enterprise_role_mappings erm
       LEFT JOIN roles r ON r.id = erm.role_id
       WHERE erm.tenant_id = $1
         AND erm.provider_id = $2
         AND r.id IS NULL`,
      [tenantId, providerId]
    );

    if (invalidRoles.rows.length > 0) {
      errors.push(
        `${invalidRoles.rows.length} mapping(s) reference non-existent roles`
      );
    }

    // Check for duplicate mappings (same group → multiple roles with same priority)
    const duplicates = await this.pool.query(
      `SELECT external_group, priority, COUNT(*) as count
       FROM enterprise_role_mappings
       WHERE tenant_id = $1
         AND provider_id = $2
         AND enabled = true
       GROUP BY external_group, priority
       HAVING COUNT(*) > 1`,
      [tenantId, providerId]
    );

    if (duplicates.rows.length > 0) {
      warnings.push(
        `${duplicates.rows.length} external group(s) have multiple roles with same priority`
      );
    }

    // Check if any mappings exist at all
    const totalMappings = await this.pool.query(
      `SELECT COUNT(*) as count
       FROM enterprise_role_mappings
       WHERE tenant_id = $1
         AND provider_id = $2
         AND enabled = true`,
      [tenantId, providerId]
    );

    if (parseInt(totalMappings.rows[0].count, 10) === 0) {
      warnings.push('No role mappings configured for this provider');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
