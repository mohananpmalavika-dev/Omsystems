/**
 * Production LDAP & Active Directory Directory Synchronization Service
 * 
 * Capabilities:
 * - Real LDAPS directory querying with TLS certificate validation & paging
 * - Automatic Organizational Unit (OU) hierarchy parsing and branch/department mapping
 * - Direct and nested/transitive user group mapping with role priority resolution
 * - Full synchronization and incremental/delta synchronization via generalized timestamps
 * - Active Directory account status synchronization (userAccountControl 0x0002)
 * - Automatic deactivation of disabled/deleted accounts with instant session revocation
 * - Dry-run / preview mode computing exact diffs without database mutations
 * - Durable PostgreSQL audit tracking in ldap_sync_history and ldap_ou_hierarchy
 * - Concurrency protection preventing race conditions
 */

import type { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { Client } from 'ldapts';
import { LdapConnectionManager } from './ldap-connection-manager.js';
import { LdapOuMapper } from './ldap-ou-mapper.js';
import { LdapGroupResolver } from './ldap-group-resolver.js';
import type {
  LdapSyncConfig,
  LdapSyncResult,
  LdapDryRunPlan,
  LdapDiscoveredUser,
  LdapDiscoveredOu,
  LdapDiscoveredGroup,
  LdapSyncErrorDetail,
  LdapConnectionTestResult,
} from './ldap-types.js';
import { DEFAULT_LDAP_ATTRIBUTE_MAPPING } from './ldap-types.js';
import type { SessionService } from '../../identity/services/session.service.js';

export class LdapDirectorySyncService {
  private activeSyncLocks: Set<string> = new Set();
  private schedulerInterval?: NodeJS.Timeout;

  constructor(
    private pool: Pool,
    private sessionService?: SessionService
  ) {}

  /**
   * Set or update the SessionService instance for active session revocations.
   */
  setSessionService(sessionService: SessionService): void {
    this.sessionService = sessionService;
  }

  /**
   * Format a JavaScript Date into LDAP Generalized Time (YYYYMMDDHHMMSS.0Z)
   * used by Active Directory (whenChanged) and OpenLDAP (modifyTimestamp).
   */
  static formatGeneralizedTime(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const year = date.getUTCFullYear();
    const month = pad(date.getUTCMonth() + 1);
    const day = pad(date.getUTCDate());
    const hours = pad(date.getUTCHours());
    const minutes = pad(date.getUTCMinutes());
    const seconds = pad(date.getUTCSeconds());
    return `${year}${month}${day}${hours}${minutes}${seconds}.0Z`;
  }

  /**
   * Parse LDAP generalized time string into JavaScript Date.
   */
  static parseGeneralizedTime(timeStr?: string): Date | undefined {
    if (!timeStr) return undefined;
    const match = timeStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (!match) return undefined;
    const [_, y, m, d, h, min, s] = match;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), Number(s)));
  }

  /**
   * Test LDAPS connection and service account bind.
   */
  async testConnection(tenantId: string): Promise<LdapConnectionTestResult> {
    const config = await this.getConfig(tenantId);
    if (!config) {
      return {
        success: false,
        serverUrl: '',
        tlsSecure: false,
        boundAs: '',
        responseTimeMs: 0,
        error: `No LDAP synchronization configuration found for tenant '${tenantId}'`,
      };
    }
    return LdapConnectionManager.testConnection(config);
  }

  /**
   * Retrieve tenant LDAP sync configuration from database.
   */
  async getConfig(tenantId: string): Promise<LdapSyncConfig | null> {
    const res = await this.pool.query(
      `SELECT * FROM ldap_sync_configurations WHERE tenant_id = $1 LIMIT 1`,
      [tenantId]
    );
    if (res.rows.length === 0) {
      return null;
    }
    return this.mapDbRowToConfig(res.rows[0]);
  }

  /**
   * Save or update tenant LDAP sync configuration.
   */
  async saveConfig(config: LdapSyncConfig): Promise<LdapSyncConfig> {
    LdapConnectionManager.validateServerUrl(config.serverUrl);

    const attributeMappingJson = JSON.stringify({
      ...DEFAULT_LDAP_ATTRIBUTE_MAPPING,
      ...(config.attributeMapping || {}),
    });
    const ouMappingRulesJson = JSON.stringify(config.ouMappingRules || []);
    const groupMappingRulesJson = JSON.stringify(config.groupMappingRules || []);
    const metadataJson = JSON.stringify(config.metadata || {});

    const query = `
      INSERT INTO ldap_sync_configurations (
        id, tenant_id, provider_id, name, server_url, bind_dn, bind_secret_ref,
        base_dn, user_search_base, user_search_filter, group_search_base, group_search_filter,
        ou_search_base, ou_search_filter, attribute_mapping, ou_mapping_rules, group_mapping_rules,
        sync_interval_cron, sync_mode, deactivate_missing_users, revoke_sessions_on_deactivate,
        tls_require_trusted_ca, tls_ca_certs, page_size, is_enabled, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14::jsonb, $15::jsonb, $16::jsonb,
        $17, $18, $19, $20,
        $21, $22, $23, $24, NOW(), NOW()
      )
      ON CONFLICT (tenant_id) DO UPDATE SET
        provider_id = EXCLUDED.provider_id,
        name = EXCLUDED.name,
        server_url = EXCLUDED.server_url,
        bind_dn = EXCLUDED.bind_dn,
        bind_secret_ref = EXCLUDED.bind_secret_ref,
        base_dn = EXCLUDED.base_dn,
        user_search_base = EXCLUDED.user_search_base,
        user_search_filter = EXCLUDED.user_search_filter,
        group_search_base = EXCLUDED.group_search_base,
        group_search_filter = EXCLUDED.group_search_filter,
        ou_search_base = EXCLUDED.ou_search_base,
        ou_search_filter = EXCLUDED.ou_search_filter,
        attribute_mapping = EXCLUDED.attribute_mapping,
        ou_mapping_rules = EXCLUDED.ou_mapping_rules,
        group_mapping_rules = EXCLUDED.group_mapping_rules,
        sync_interval_cron = EXCLUDED.sync_interval_cron,
        sync_mode = EXCLUDED.sync_mode,
        deactivate_missing_users = EXCLUDED.deactivate_missing_users,
        revoke_sessions_on_deactivate = EXCLUDED.revoke_sessions_on_deactivate,
        tls_require_trusted_ca = EXCLUDED.tls_require_trusted_ca,
        tls_ca_certs = EXCLUDED.tls_ca_certs,
        page_size = EXCLUDED.page_size,
        is_enabled = EXCLUDED.is_enabled,
        updated_at = NOW()
      RETURNING *;
    `;

    const res = await this.pool.query(query, [
      config.tenantId,
      config.providerId || 'ldap-ad-provider',
      config.name || 'Enterprise Active Directory',
      config.serverUrl,
      config.bindDn,
      config.bindSecretRef || config.bindPassword || 'secret-ref',
      config.baseDn,
      config.userSearchBase || null,
      config.userSearchFilter || '(&(objectCategory=person)(objectClass=user))',
      config.groupSearchBase || null,
      config.groupSearchFilter || '(&(objectCategory=group)(objectClass=group))',
      config.ouSearchBase || null,
      config.ouSearchFilter || '(objectClass=organizationalUnit)',
      attributeMappingJson,
      ouMappingRulesJson,
      groupMappingRulesJson,
      config.syncIntervalCron || '0 */6 * * *',
      config.syncMode || 'INCREMENTAL',
      config.deactivateMissingUsers ?? true,
      config.revokeSessionsOnDeactivate ?? true,
      config.tlsRequireTrustedCa ?? true,
      config.tlsCaCerts || [],
      config.pageSize || 500,
      config.isEnabled ?? true,
    ]);

    return this.mapDbRowToConfig(res.rows[0]);
  }

  /**
   * Delete tenant LDAP sync configuration and associated OU cache.
   */
  async deleteConfig(tenantId: string): Promise<boolean> {
    await this.pool.query(`DELETE FROM ldap_ou_hierarchy WHERE tenant_id = $1`, [tenantId]);
    await this.pool.query(`DELETE FROM ldap_group_mappings WHERE tenant_id = $1`, [tenantId]);
    const res = await this.pool.query(
      `DELETE FROM ldap_sync_configurations WHERE tenant_id = $1`,
      [tenantId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Get sync status: indicates whether a job is actively running, plus last run summary.
   */
  async getSyncStatus(tenantId: string): Promise<{ isRunning: boolean; lastSync?: any }> {
    const isRunning = this.activeSyncLocks.has(tenantId);
    const res = await this.pool.query(
      `SELECT * FROM ldap_sync_history WHERE tenant_id = $1 ORDER BY started_at DESC LIMIT 1`,
      [tenantId]
    );
    return {
      isRunning,
      lastSync: res.rows.length > 0 ? res.rows[0] : undefined,
    };
  }

  /**
   * Get paginated audit history of sync runs.
   */
  async getSyncHistory(tenantId: string, limit: number = 20, offset: number = 0): Promise<{ total: number; history: any[] }> {
    const countRes = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM ldap_sync_history WHERE tenant_id = $1`,
      [tenantId]
    );
    const total = countRes.rows[0]?.count || 0;

    const dataRes = await this.pool.query(
      `SELECT * FROM ldap_sync_history WHERE tenant_id = $1 ORDER BY started_at DESC LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    );

    return { total, history: dataRes.rows };
  }

  /**
   * Execute dry-run preview: scans directory, builds plan, returns diff without committing mutations.
   */
  async preview(tenantId: string): Promise<LdapDryRunPlan> {
    const result = await this.synchronize(tenantId, { dryRun: true });
    return result.dryRunPlan || {
      usersToCreate: [],
      usersToUpdate: [],
      usersToDeactivate: [],
      groupsResolved: [],
      ousDiscovered: [],
    };
  }

  /**
   * Execute Directory Synchronization (Full, Incremental, or Dry-Run).
   */
  async synchronize(
    tenantId: string,
    options: { mode?: 'FULL' | 'INCREMENTAL'; dryRun?: boolean; initiatedBy?: string } = {}
  ): Promise<LdapSyncResult> {
    if (this.activeSyncLocks.has(tenantId)) {
      throw new Error(`A directory synchronization job is already running for tenant '${tenantId}'`);
    }

    this.activeSyncLocks.add(tenantId);
    const startedAt = new Date();
    const jobId = randomUUID();

    let client: Client | null = null;
    const errors: LdapSyncErrorDetail[] = [];

    let usersDiscovered = 0;
    let usersCreated = 0;
    let usersUpdated = 0;
    let usersDeactivated = 0;
    let groupsDiscovered = 0;
    let groupsMapped = 0;
    let ousDiscovered = 0;

    let syncMode: 'FULL' | 'INCREMENTAL' | 'DRY_RUN' = options.dryRun
      ? 'DRY_RUN'
      : (options.mode || 'INCREMENTAL');

    const dryRunPlan: LdapDryRunPlan = {
      usersToCreate: [],
      usersToUpdate: [],
      usersToDeactivate: [],
      groupsResolved: [],
      ousDiscovered: [],
    };

    try {
      const config = await this.getConfig(tenantId);
      if (!config) {
        throw new Error(`Tenant '${tenantId}' does not have an active LDAP sync configuration`);
      }
      if (!config.isEnabled) {
        throw new Error(`LDAP synchronization is disabled for tenant '${tenantId}'`);
      }

      // If incremental requested but no previous sync timestamp exists, promote to FULL
      if (syncMode === 'INCREMENTAL' && !config.lastSyncTimestamp) {
        syncMode = 'FULL';
      }

      // Record job start in history (if not dry run)
      if (!options.dryRun) {
        await this.pool.query(
          `INSERT INTO ldap_sync_history (
            id, tenant_id, provider_id, sync_mode, status, initiated_by, started_at
          ) VALUES ($1, $2, $3, $4, 'RUNNING', $5, $6)`,
          [jobId, tenantId, config.providerId, syncMode, options.initiatedBy || 'manual-trigger', startedAt]
        );
      }

      // Establish authenticated LDAPS connection
      client = await LdapConnectionManager.getAuthenticatedClient(config);

      // ----------------------------------------------------------------------
      // PHASE 1: Discover & Map Organizational Units (OUs)
      // ----------------------------------------------------------------------
      const ouSearchBase = config.ouSearchBase || config.baseDn;
      const discoveredOus: LdapDiscoveredOu[] = [];

      try {
        const rawOus = await LdapConnectionManager.executePagedSearch(
          client,
          ouSearchBase,
          config.ouSearchFilter || '(objectClass=organizationalUnit)',
          ['dn', 'ou', 'description', 'whenCreated', 'whenChanged'],
          config.pageSize || 500
        );

        for (const rawOu of rawOus) {
          const parsedOu = LdapOuMapper.parseOuEntry(rawOu.dn, rawOu.attributes);
          const evaluation = LdapOuMapper.evaluateMapping(rawOu.dn, config.ouMappingRules);

          parsedOu.mappedDepartment = evaluation.department;
          parsedOu.mappedBranchId = evaluation.branchId;
          parsedOu.mappedRole = evaluation.defaultRole;

          discoveredOus.push(parsedOu);
          ousDiscovered++;

          dryRunPlan.ousDiscovered.push({
            canonicalPath: parsedOu.canonicalPath,
            mappedBranchId: parsedOu.mappedBranchId,
            mappedDepartment: parsedOu.mappedDepartment,
          });

          if (!options.dryRun) {
            await this.pool.query(
              `INSERT INTO ldap_ou_hierarchy (
                id, tenant_id, dn, ou_name, parent_dn, canonical_path, depth,
                mapped_department, mapped_branch_id, mapped_role, raw_attributes, updated_at
              ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW()
              )
              ON CONFLICT (tenant_id, dn) DO UPDATE SET
                ou_name = EXCLUDED.ou_name,
                parent_dn = EXCLUDED.parent_dn,
                canonical_path = EXCLUDED.canonical_path,
                depth = EXCLUDED.depth,
                mapped_department = EXCLUDED.mapped_department,
                mapped_branch_id = EXCLUDED.mapped_branch_id,
                mapped_role = EXCLUDED.mapped_role,
                raw_attributes = EXCLUDED.raw_attributes,
                updated_at = NOW()`,
              [
                tenantId,
                parsedOu.dn,
                parsedOu.name,
                parsedOu.parentDn,
                parsedOu.canonicalPath,
                parsedOu.depth,
                parsedOu.mappedDepartment || null,
                parsedOu.mappedBranchId || null,
                parsedOu.mappedRole || null,
                JSON.stringify(parsedOu.rawAttributes),
              ]
            );
          }
        }
      } catch (ouErr: any) {
        errors.push({
          code: 'OU_DISCOVERY_ERROR',
          message: `Failed during OU discovery: ${ouErr.message}`,
          timestamp: new Date().toISOString(),
        });
      }

      // ----------------------------------------------------------------------
      // PHASE 2: Discover Directory Groups
      // ----------------------------------------------------------------------
      const groupSearchBase = config.groupSearchBase || config.baseDn;
      const discoveredGroups: Map<string, LdapDiscoveredGroup> = new Map();

      try {
        const rawGroups = await LdapConnectionManager.executePagedSearch(
          client,
          groupSearchBase,
          config.groupSearchFilter || '(&(objectCategory=group)(objectClass=group))',
          ['dn', 'cn', 'member', 'memberUid', 'description'],
          config.pageSize || 500
        );

        for (const rg of rawGroups) {
          const parsedGroup = LdapGroupResolver.parseGroupEntry(rg.dn, rg.attributes);
          discoveredGroups.set(parsedGroup.dn.toLowerCase(), parsedGroup);
          discoveredGroups.set(parsedGroup.name.toLowerCase(), parsedGroup);
          groupsDiscovered++;
        }

        // Evaluate group mappings for summary
        for (const rule of config.groupMappingRules || []) {
          const grp = discoveredGroups.get(rule.groupDnOrCn.toLowerCase()) ||
                     discoveredGroups.get(LdapGroupResolver.extractCommonName(rule.groupDnOrCn).toLowerCase());
          if (grp) {
            groupsMapped++;
            dryRunPlan.groupsResolved.push({
              groupName: grp.name,
              mappedRole: rule.targetRole,
              memberCount: grp.members.length,
            });
          }
        }
      } catch (grpErr: any) {
        errors.push({
          code: 'GROUP_DISCOVERY_ERROR',
          message: `Failed during group discovery: ${grpErr.message}`,
          timestamp: new Date().toISOString(),
        });
      }

      // ----------------------------------------------------------------------
      // PHASE 3: Discover & Reconcile Directory Users
      // ----------------------------------------------------------------------
      const userSearchBase = config.userSearchBase || config.baseDn;
      let effectiveUserFilter = config.userSearchFilter || '(&(objectCategory=person)(objectClass=user))';

      // Incremental delta filter via timestamp
      if (syncMode === 'INCREMENTAL' && config.lastSyncTimestamp) {
        const generalizedTs = LdapDirectorySyncService.formatGeneralizedTime(config.lastSyncTimestamp);
        effectiveUserFilter = `(&(${effectiveUserFilter.replace(/^\(/, '').replace(/\)$/, '')})(|(whenChanged>=${generalizedTs})(modifyTimestamp>=${generalizedTs})))`;
      }

      const attrMap = config.attributeMapping || DEFAULT_LDAP_ATTRIBUTE_MAPPING;
      const requestedAttributes = [
        'dn',
        attrMap.username || 'sAMAccountName',
        attrMap.email || 'mail',
        attrMap.displayName || 'displayName',
        attrMap.firstName || 'givenName',
        attrMap.lastName || 'sn',
        attrMap.telephone || 'telephoneNumber',
        attrMap.title || 'title',
        attrMap.department || 'department',
        attrMap.memberOf || 'memberOf',
        attrMap.userAccountControl || 'userAccountControl',
        attrMap.whenChanged || 'whenChanged',
        attrMap.modifyTimestamp || 'modifyTimestamp',
        'nsAccountLock',
        'pwdAccountLockedTime',
      ];

      const rawUsers = await LdapConnectionManager.executePagedSearch(
        client,
        userSearchBase,
        effectiveUserFilter,
        requestedAttributes,
        config.pageSize || 500
      );

      // Query existing local users for reconciliation
      const existingUsersRes = await this.pool.query(
        `SELECT id, username, email, display_name, role, active, status, department, branch_id
         FROM users
         WHERE tenant_id = $1`,
        [tenantId]
      );
      const existingUserMap = new Map<string, any>();
      for (const u of existingUsersRes.rows) {
        if (u.username) existingUserMap.set(u.username.toLowerCase(), u);
        if (u.email) existingUserMap.set(u.email.toLowerCase(), u);
      }

      const discoveredUsernames = new Set<string>();

      for (const rawUser of rawUsers) {
        try {
          const attrs = rawUser.attributes;
          const usernameVal = this.getSingleAttr(attrs, attrMap.username) || LdapGroupResolver.extractCommonName(rawUser.dn);
          if (!usernameVal) {
            continue;
          }

          discoveredUsernames.add(usernameVal.toLowerCase());
          usersDiscovered++;

          const emailVal = this.getSingleAttr(attrs, attrMap.email) || `${usernameVal}@${tenantId}.directory.local`;
          const displayNameVal = this.getSingleAttr(attrs, attrMap.displayName) || usernameVal;
          const firstNameVal = this.getSingleAttr(attrs, attrMap.firstName);
          const lastNameVal = this.getSingleAttr(attrs, attrMap.lastName);
          const telephoneVal = this.getSingleAttr(attrs, attrMap.telephone);
          const titleVal = this.getSingleAttr(attrs, attrMap.title);
          const departmentVal = this.getSingleAttr(attrs, attrMap.department);

          // Group resolution
          const rawMemberOf = attrs[attrMap.memberOf || 'memberOf'] || [];
          const userGroups: string[] = Array.isArray(rawMemberOf) ? rawMemberOf.map(String) : [String(rawMemberOf)].filter(Boolean);

          // Evaluate OU hierarchy and mappings
          const canonicalOuPath = LdapOuMapper.buildCanonicalPath(rawUser.dn);
          const ouMapping = LdapOuMapper.evaluateMapping(rawUser.dn, config.ouMappingRules);

          // Evaluate Group Role mapping
          const fallbackRole = ouMapping.defaultRole || 'BANK_OPERATOR';
          const groupResolution = LdapGroupResolver.mapGroupsToRoles(
            userGroups,
            config.groupMappingRules,
            fallbackRole
          );

          const finalRole = groupResolution.primaryRole;
          const finalBranchId = ouMapping.branchId || null;
          const finalDepartment = departmentVal || ouMapping.department || null;

          // Account status: Active Directory userAccountControl
          // Bit 2 (0x0002) = ACCOUNTDISABLE
          // Bit 4 (0x0010) = LOCKOUT
          let isActive = true;
          const uac = attrs[attrMap.userAccountControl || 'userAccountControl'];
          if (uac !== undefined && uac !== null) {
            const uacInt = parseInt(String(uac), 10);
            if (!isNaN(uacInt)) {
              if ((uacInt & 0x0002) !== 0 || (uacInt & 0x0010) !== 0) {
                isActive = false;
              }
            }
          }
          // OpenLDAP lock attributes
          if (String(attrs['nsAccountLock']).toLowerCase() === 'true' || attrs['pwdAccountLockedTime']) {
            isActive = false;
          }

          const existingUser = existingUserMap.get(usernameVal.toLowerCase()) ||
                               existingUserMap.get(emailVal.toLowerCase());

          if (!existingUser) {
            // New User Discovered
            if (options.dryRun) {
              dryRunPlan.usersToCreate.push({
                username: usernameVal,
                email: emailVal,
                displayName: displayNameVal,
                mappedRole: finalRole,
                ouPath: canonicalOuPath,
                branchId: finalBranchId || undefined,
                department: finalDepartment || undefined,
              });
            } else {
              const newUserId = randomUUID();
              await this.pool.query(
                `INSERT INTO users (
                  id, tenant_id, username, email, display_name, role, status, active,
                  department, branch_id, created_at, updated_at
                ) VALUES (
                  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
                )`,
                [
                  newUserId,
                  tenantId,
                  usernameVal,
                  emailVal,
                  displayNameVal,
                  finalRole,
                  isActive ? 'active' : 'inactive',
                  isActive,
                  finalDepartment,
                  finalBranchId,
                ]
              );

              // Create enterprise identity link
              await this.pool.query(
                `INSERT INTO enterprise_identity_links (
                  id, tenant_id, provider_id, provider_type, user_id,
                  external_subject, external_email, external_username,
                  created_at, last_authenticated_at, authentication_count
                ) VALUES (
                  gen_random_uuid(), $1, $2, 'LDAP', $3, $4, $5, $6, NOW(), NOW(), 1
                )
                ON CONFLICT (tenant_id, provider_id, external_subject) DO UPDATE SET
                  external_email = EXCLUDED.external_email,
                  external_username = EXCLUDED.external_username,
                  last_authenticated_at = NOW()`,
                [
                  tenantId,
                  config.providerId,
                  newUserId,
                  rawUser.dn,
                  emailVal,
                  usernameVal,
                ]
              );

              usersCreated++;
            }
          } else {
            // Existing User Update / Reconcile
            const changes: Record<string, { old: any; new: any }> = {};

            if (existingUser.role !== finalRole) {
              changes.role = { old: existingUser.role, new: finalRole };
            }
            if (existingUser.display_name !== displayNameVal) {
              changes.displayName = { old: existingUser.display_name, new: displayNameVal };
            }
            if (existingUser.email !== emailVal) {
              changes.email = { old: existingUser.email, new: emailVal };
            }
            if (Boolean(existingUser.active) !== isActive) {
              changes.active = { old: existingUser.active, new: isActive };
            }
            if (existingUser.department !== finalDepartment) {
              changes.department = { old: existingUser.department, new: finalDepartment };
            }
            if (existingUser.branch_id !== finalBranchId) {
              changes.branchId = { old: existingUser.branch_id, new: finalBranchId };
            }

            if (Object.keys(changes).length > 0) {
              if (options.dryRun) {
                dryRunPlan.usersToUpdate.push({
                  userId: existingUser.id,
                  username: usernameVal,
                  email: emailVal,
                  changes,
                });
              } else {
                await this.pool.query(
                  `UPDATE users SET
                    email = $1,
                    display_name = $2,
                    role = $3,
                    status = $4,
                    active = $5,
                    department = $6,
                    branch_id = $7,
                    updated_at = NOW()
                   WHERE id = $8 AND tenant_id = $9`,
                  [
                    emailVal,
                    displayNameVal,
                    finalRole,
                    isActive ? 'active' : 'inactive',
                    isActive,
                    finalDepartment,
                    finalBranchId,
                    existingUser.id,
                    tenantId,
                  ]
                );

                // If account deactivated, immediately revoke active sessions
                if (!isActive && config.revokeSessionsOnDeactivate && this.sessionService) {
                  await this.sessionService
                    .revokeAllForUser(existingUser.id, 'Account disabled via LDAP directory synchronization')
                    .catch(() => {});
                }

                usersUpdated++;
              }
            }
          }
        } catch (userErr: any) {
          errors.push({
            code: 'USER_RECONCILE_ERROR',
            message: `Failed reconciling user entry ${rawUser.dn}: ${userErr.message}`,
            dn: rawUser.dn,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // ----------------------------------------------------------------------
      // PHASE 4: Handle Missing/Deleted Users (Full Sync Only)
      // ----------------------------------------------------------------------
      if (syncMode === 'FULL' && config.deactivateMissingUsers) {
        for (const [username, existingUser] of existingUserMap.entries()) {
          // Do not deactivate superadmin or users discovered in LDAP
          if (existingUser.role === 'BANK_SUPERADMIN' || discoveredUsernames.has(username)) {
            continue;
          }

          if (existingUser.active) {
            if (options.dryRun) {
              dryRunPlan.usersToDeactivate.push({
                userId: existingUser.id,
                username: existingUser.username,
                email: existingUser.email,
                reason: 'Account no longer present in LDAP directory search base',
              });
            } else {
              await this.pool.query(
                `UPDATE users SET active = false, status = 'inactive', updated_at = NOW()
                 WHERE id = $1 AND tenant_id = $2`,
                [existingUser.id, tenantId]
              );

              if (config.revokeSessionsOnDeactivate && this.sessionService) {
                await this.sessionService
                  .revokeAllForUser(existingUser.id, 'Account removed from LDAP directory')
                  .catch(() => {});
              }

              usersDeactivated++;
            }
          }
        }
      }

      // ----------------------------------------------------------------------
      // PHASE 5: Audit & History Finalization
      // ----------------------------------------------------------------------
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();
      const status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED' = errors.length === 0
        ? 'SUCCESS'
        : (usersCreated > 0 || usersUpdated > 0 ? 'PARTIAL_SUCCESS' : 'FAILED');

      if (!options.dryRun) {
        // Update high-water mark timestamp
        await this.pool.query(
          `UPDATE ldap_sync_configurations SET
            last_sync_timestamp = $1,
            updated_at = NOW()
           WHERE tenant_id = $2`,
          [completedAt, tenantId]
        );

        // Update history row
        await this.pool.query(
          `UPDATE ldap_sync_history SET
            status = $1,
            users_discovered = $2,
            users_created = $3,
            users_updated = $4,
            users_deactivated = $5,
            groups_discovered = $6,
            groups_mapped = $7,
            ous_discovered = $8,
            duration_ms = $9,
            high_water_mark = $10,
            error_summary = $11,
            errors = $12::jsonb,
            sync_details = $13::jsonb,
            completed_at = $14
           WHERE id = $15`,
          [
            status,
            usersDiscovered,
            usersCreated,
            usersUpdated,
            usersDeactivated,
            groupsDiscovered,
            groupsMapped,
            ousDiscovered,
            durationMs,
            completedAt,
            errors.length > 0 ? `${errors.length} error(s) during sync` : null,
            JSON.stringify(errors),
            JSON.stringify({ dryRunPlan }),
            completedAt,
            jobId,
          ]
        );
      }

      await client.unbind().catch(() => {});

      return {
        jobId,
        tenantId,
        providerId: config.providerId,
        syncMode,
        status,
        usersDiscovered,
        usersCreated,
        usersUpdated,
        usersDeactivated,
        groupsDiscovered,
        groupsMapped,
        ousDiscovered,
        durationMs,
        highWaterMark: completedAt,
        errors,
        dryRunPlan: options.dryRun ? dryRunPlan : undefined,
        startedAt,
        completedAt,
      };

    } catch (fatalErr: any) {
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      if (client) {
        await client.unbind().catch(() => {});
      }

      const errorMsg = fatalErr?.message || String(fatalErr);
      errors.push({
        code: 'FATAL_SYNC_ERROR',
        message: errorMsg,
        timestamp: completedAt.toISOString(),
      });

      if (!options.dryRun) {
        await this.pool.query(
          `UPDATE ldap_sync_history SET
            status = 'FAILED',
            duration_ms = $1,
            error_summary = $2,
            errors = $3::jsonb,
            completed_at = $4
           WHERE id = $5`,
          [durationMs, errorMsg, JSON.stringify(errors), completedAt, jobId]
        ).catch(() => {});
      }

      return {
        jobId,
        tenantId,
        providerId: 'ldap-ad-provider',
        syncMode,
        status: 'FAILED',
        usersDiscovered,
        usersCreated,
        usersUpdated,
        usersDeactivated,
        groupsDiscovered,
        groupsMapped,
        ousDiscovered,
        durationMs,
        errorSummary: errorMsg,
        errors,
        startedAt,
        completedAt,
      };
    } finally {
      this.activeSyncLocks.delete(tenantId);
    }
  }

  /**
   * Helper to extract a single string value from an LDAP attribute entry.
   */
  private getSingleAttr(attrs: Record<string, any>, key?: string): string | undefined {
    if (!key) return undefined;
    const val = attrs[key];
    if (val === undefined || val === null) return undefined;
    if (Array.isArray(val)) {
      return val.length > 0 ? String(val[0]).trim() : undefined;
    }
    return String(val).trim();
  }

  /**
   * Map raw database row from ldap_sync_configurations to typed LdapSyncConfig.
   */
  private mapDbRowToConfig(row: any): LdapSyncConfig {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      providerId: row.provider_id,
      name: row.name,
      serverUrl: row.server_url,
      bindDn: row.bind_dn,
      bindSecretRef: row.bind_secret_ref,
      baseDn: row.base_dn,
      userSearchBase: row.user_search_base || undefined,
      userSearchFilter: row.user_search_filter,
      groupSearchBase: row.group_search_base || undefined,
      groupSearchFilter: row.group_search_filter,
      ouSearchBase: row.ou_search_base || undefined,
      ouSearchFilter: row.ou_search_filter,
      attributeMapping: typeof row.attribute_mapping === 'string'
        ? JSON.parse(row.attribute_mapping)
        : (row.attribute_mapping || DEFAULT_LDAP_ATTRIBUTE_MAPPING),
      ouMappingRules: typeof row.ou_mapping_rules === 'string'
        ? JSON.parse(row.ou_mapping_rules)
        : (row.ou_mapping_rules || []),
      groupMappingRules: typeof row.group_mapping_rules === 'string'
        ? JSON.parse(row.group_mapping_rules)
        : (row.group_mapping_rules || []),
      syncIntervalCron: row.sync_interval_cron,
      syncMode: row.sync_mode || 'INCREMENTAL',
      deactivateMissingUsers: row.deactivate_missing_users ?? true,
      revokeSessionsOnDeactivate: row.revoke_sessions_on_deactivate ?? true,
      tlsRequireTrustedCa: row.tls_require_trusted_ca ?? true,
      tlsCaCerts: row.tls_ca_certs || [],
      pageSize: row.page_size || 500,
      isEnabled: row.is_enabled ?? true,
      lastSyncTimestamp: row.last_sync_timestamp ? new Date(row.last_sync_timestamp) : null,
      highestUsn: row.highest_usn ? Number(row.highest_usn) : null,
      metadata: row.metadata,
      createdAt: row.created_at ? new Date(row.created_at) : undefined,
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
    };
  }
}
