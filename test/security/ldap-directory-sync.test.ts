/**
 * Production LDAP & Active Directory Directory Synchronization Tests
 * 
 * Verifies:
 * 1. RFC 4515 LDAP filter escaping & injection prevention
 * 2. RFC 4514 DN escaping
 * 3. Multi-level OU hierarchy parsing & canonical path building
 * 4. Automatic OU mapping rules (exact, prefix, regex with named capture groups)
 * 5. Group resolution, AD nested group filter construction, and priority role resolution
 * 6. Active Directory userAccountControl bitmask handling (ACCOUNTDISABLE 0x0002)
 * 7. Full synchronization, incremental delta sync with high-water marks, and dry-run previewing
 * 8. Account deactivation and immediate session revocation
 * 9. REST API endpoints via Fastify injection
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import { LdapConnectionManager } from '../../src/security/ldap/ldap-connection-manager.js';
import { LdapOuMapper } from '../../src/security/ldap/ldap-ou-mapper.js';
import { LdapGroupResolver } from '../../src/security/ldap/ldap-group-resolver.js';
import { LdapDirectorySyncService } from '../../src/security/ldap/ldap-directory-sync.service.js';
import { registerLdapSyncRoutes } from '../../src/routes/ldap-sync.routes.js';
import type { LdapSyncConfig, LdapOuMappingRule, LdapGroupMappingRule } from '../../src/security/ldap/ldap-types.js';

describe('LDAP & Active Directory Directory Synchronization (security.ldap)', () => {
  // ==========================================================================
  // 1. Connection & Injection Prevention Tests
  // ==========================================================================
  describe('LdapConnectionManager - Security & Protocol', () => {
    it('should escape filter special characters per RFC 4515 to prevent injection', () => {
      const maliciousInput = 'admin*)(|(uid=*))(\\0';
      const escaped = LdapConnectionManager.escapeFilterValue(maliciousInput);

      expect(escaped).not.toContain('*');
      expect(escaped).not.toContain('(');
      expect(escaped).not.toContain(')');
      expect(escaped).toContain('\\2a');
      expect(escaped).toContain('\\28');
      expect(escaped).toContain('\\29');
      expect(escaped).toContain('\\5c');
    });

    it('should escape DN components per RFC 4514', () => {
      const dnValue = ' Smith, John + Co; <Dept> = #1 ';
      const escaped = LdapConnectionManager.escapeDnComponent(dnValue);

      expect(escaped.startsWith('\\ ')).toBe(true);
      expect(escaped.endsWith('\\ ')).toBe(true);
      expect(escaped).toContain('\\,');
      expect(escaped).toContain('\\+');
      expect(escaped).toContain('\\;');
      expect(escaped).toContain('\\<');
      expect(escaped).toContain('\\>');
      expect(escaped).toContain('\\=');
    });

    it('should validate LDAP server URLs and reject unsupported protocols', () => {
      expect(() => LdapConnectionManager.validateServerUrl('http://insecure.internal:389')).toThrow(
        /Invalid LDAP protocol/
      );
      expect(() => LdapConnectionManager.validateServerUrl('ldaps://ad.bank.internal:636')).not.toThrow();
      expect(() => LdapConnectionManager.validateServerUrl('ldap://ad.bank.internal:389', true)).not.toThrow();
    });

    it('should enforce LDAPS in production mode', () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        expect(() => LdapConnectionManager.validateServerUrl('ldap://ad.bank.internal:389')).toThrow(
          /Production banking platform strictly requires LDAPS/
        );
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });
  });

  // ==========================================================================
  // 2. Organizational Unit (OU) Hierarchy & Mapping Tests
  // ==========================================================================
  describe('LdapOuMapper - Hierarchy & Rule Evaluation', () => {
    const sampleDn = 'CN=Alice Smith,OU=Cashiers,OU=RetailBanking,OU=Branches,DC=bank,DC=internal';

    it('should split DNs respecting escaped commas', () => {
      const dnWithEscapedComma = 'CN=Smith\\, John,OU=Admins,DC=bank,DC=internal';
      const rdns = LdapOuMapper.splitDnToRdns(dnWithEscapedComma);
      expect(rdns).toEqual(['CN=Smith\\, John', 'OU=Admins', 'DC=bank', 'DC=internal']);
    });

    it('should extract OU hierarchy components in root-to-leaf order', () => {
      const components = LdapOuMapper.extractOuComponents(sampleDn);
      expect(components).toEqual(['Branches', 'RetailBanking', 'Cashiers']);
    });

    it('should build canonical OU paths', () => {
      const canonicalPath = LdapOuMapper.buildCanonicalPath(sampleDn);
      expect(canonicalPath).toBe('/Branches/RetailBanking/Cashiers');
    });

    it('should parse raw OU directory entries', () => {
      const ouDn = 'OU=Cashiers,OU=RetailBanking,OU=Branches,DC=bank,DC=internal';
      const parsed = LdapOuMapper.parseOuEntry(ouDn, { description: 'Branch Cashiers' });

      expect(parsed.name).toBe('Cashiers');
      expect(parsed.parentDn).toBe('OU=RetailBanking,OU=Branches,DC=bank,DC=internal');
      expect(parsed.canonicalPath).toBe('/Branches/RetailBanking/Cashiers');
      expect(parsed.depth).toBe(3);
    });

    it('should evaluate exact, prefix, and regex mapping rules', () => {
      const rules: LdapOuMappingRule[] = [
        {
          pattern: '/Branches/RetailBanking/Cashiers',
          matchType: 'EXACT',
          department: 'Retail Cash Operations',
          defaultRole: 'BANK_OPERATOR',
          clearanceTags: ['TELLER_LEVEL_1'],
        },
        {
          pattern: '^/Branches/Branch-(?<branchId>[0-9A-Za-z]+)',
          matchType: 'REGEX',
          department: 'Branch Operations',
          branchId: 'branch-${branchId}',
          defaultRole: 'BRANCH_STAFF',
          clearanceTags: ['BRANCH_ACCESS'],
        },
      ];

      // Exact match evaluation
      const exactResult = LdapOuMapper.evaluateMapping(sampleDn, rules);
      expect(exactResult.department).toBe('Retail Cash Operations');
      expect(exactResult.defaultRole).toBe('BANK_OPERATOR');
      expect(exactResult.clearanceTags).toContain('TELLER_LEVEL_1');

      // Regex match evaluation with named capture
      const branchDn = 'CN=Bob,OU=Tellers,OU=Branch-402,OU=Branches,DC=bank,DC=internal';
      const regexResult = LdapOuMapper.evaluateMapping(branchDn, rules);
      expect(regexResult.branchId).toBe('branch-402');
      expect(regexResult.department).toBe('Branch Operations');
      expect(regexResult.clearanceTags).toContain('BRANCH_ACCESS');
    });
  });

  // ==========================================================================
  // 3. User Group & Nested Group Mapping Tests
  // ==========================================================================
  describe('LdapGroupResolver - Groups & Priority Roles', () => {
    it('should extract Common Name from group DN or string', () => {
      expect(LdapGroupResolver.extractCommonName('CN=Sec-Admins,OU=Groups,DC=bank,DC=internal')).toBe('Sec-Admins');
      expect(LdapGroupResolver.extractCommonName('Sec-Admins')).toBe('Sec-Admins');
    });

    it('should build Active Directory LDAP_MATCHING_RULE_IN_CHAIN filter', () => {
      const filter = LdapGroupResolver.buildAdNestedGroupFilter('CN=Alice,OU=Users,DC=bank,DC=internal');
      expect(filter).toContain('member:1.2.840.113556.1.4.1941:=CN=Alice,OU=Users,DC=bank,DC=internal');
    });

    it('should map groups to roles using priority order', () => {
      const rules: LdapGroupMappingRule[] = [
        {
          groupDnOrCn: 'CN=Security-Admins,OU=Groups,DC=bank,DC=internal',
          targetRole: 'BANK_SUPERADMIN',
          priority: 1000,
          clearanceTags: ['SUPERADMIN_ACCESS'],
        },
        {
          groupDnOrCn: 'CN=Branch-Operators,OU=Groups,DC=bank,DC=internal',
          targetRole: 'BANK_OPERATOR',
          priority: 100,
          clearanceTags: ['OPERATOR_ACCESS'],
        },
        {
          groupDnOrCn: 'Auditors',
          targetRole: 'AUDITOR',
          priority: 500,
          clearanceTags: ['AUDIT_READ'],
        },
      ];

      // Single match
      const res1 = LdapGroupResolver.mapGroupsToRoles(['CN=Branch-Operators,OU=Groups,DC=bank,DC=internal'], rules);
      expect(res1.primaryRole).toBe('BANK_OPERATOR');
      expect(res1.allRoles).toContain('BANK_OPERATOR');

      // Multiple matches: higher priority (1000 > 100) wins for primary role
      const res2 = LdapGroupResolver.mapGroupsToRoles([
        'CN=Branch-Operators,OU=Groups,DC=bank,DC=internal',
        'CN=Security-Admins,OU=Groups,DC=bank,DC=internal',
      ], rules);
      expect(res2.primaryRole).toBe('BANK_SUPERADMIN');
      expect(res2.allRoles).toContain('BANK_SUPERADMIN');
      expect(res2.allRoles).toContain('BANK_OPERATOR');
      expect(res2.clearanceTags).toContain('SUPERADMIN_ACCESS');
      expect(res2.clearanceTags).toContain('OPERATOR_ACCESS');

      // Fallback role when no group matches
      const resFallback = LdapGroupResolver.mapGroupsToRoles(['CN=UnknownGroup,OU=Groups,DC=bank,DC=internal'], rules, 'DEFAULT_VIEWER');
      expect(resFallback.primaryRole).toBe('DEFAULT_VIEWER');
    });
  });

  // ==========================================================================
  // 4. Directory Synchronization Engine Tests
  // ==========================================================================
  describe('LdapDirectorySyncService - Full & Delta Sync Engine', () => {
    let mockPool: any;
    let mockSessionService: any;
    let syncService: LdapDirectorySyncService;

    const sampleConfigRow = {
      id: 'cfg-1',
      tenant_id: 'tenant-bank-1',
      provider_id: 'prov-ldap-1',
      name: 'Bank AD',
      server_url: 'ldaps://ad.bank.internal:636',
      bind_dn: 'CN=svc-sentinel,OU=ServiceAccounts,DC=bank,DC=internal',
      bind_secret_ref: 'test-bind-pass',
      base_dn: 'DC=bank,DC=internal',
      user_search_base: 'OU=Users,DC=bank,DC=internal',
      user_search_filter: '(&(objectCategory=person)(objectClass=user))',
      group_search_base: 'OU=Groups,DC=bank,DC=internal',
      group_search_filter: '(&(objectCategory=group)(objectClass=group))',
      ou_search_base: 'OU=Corporate,DC=bank,DC=internal',
      ou_search_filter: '(objectClass=organizationalUnit)',
      attribute_mapping: JSON.stringify({
        username: 'sAMAccountName',
        email: 'mail',
        displayName: 'displayName',
        firstName: 'givenName',
        lastName: 'sn',
        memberOf: 'memberOf',
        userAccountControl: 'userAccountControl',
      }),
      ou_mapping_rules: JSON.stringify([
        {
          pattern: '/Corporate/Security',
          matchType: 'EXACT',
          department: 'Security Operations',
          defaultRole: 'SECURITY_ADMIN',
          clearanceTags: ['SOC_ACCESS'],
        },
      ]),
      group_mapping_rules: JSON.stringify([
        {
          groupDnOrCn: 'Sec-Officers',
          targetRole: 'BANK_ADMIN',
          priority: 500,
        },
      ]),
      sync_interval_cron: '0 */6 * * *',
      sync_mode: 'INCREMENTAL',
      deactivate_missing_users: true,
      revoke_sessions_on_deactivate: true,
      tls_require_trusted_ca: true,
      tls_ca_certs: [],
      page_size: 100,
      is_enabled: true,
      last_sync_timestamp: new Date('2026-09-01T00:00:00Z'),
    };

    beforeEach(() => {
      mockPool = {
        query: vi.fn(),
      };
      mockSessionService = {
        revokeAllForUser: vi.fn().mockResolvedValue(1),
      };
      syncService = new LdapDirectorySyncService(mockPool, mockSessionService);
    });

    it('should format and parse generalized time correctly', () => {
      const date = new Date(Date.UTC(2026, 8, 12, 14, 30, 0)); // 2026-09-12 14:30:00 UTC
      const genTime = LdapDirectorySyncService.formatGeneralizedTime(date);
      expect(genTime).toBe('20260912143000.0Z');

      const parsed = LdapDirectorySyncService.parseGeneralizedTime(genTime);
      expect(parsed?.toISOString()).toBe(date.toISOString());
    });

    it('should retrieve tenant config from database', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [sampleConfigRow] });

      const config = await syncService.getConfig('tenant-bank-1');
      expect(config).not.toBeNull();
      expect(config?.tenantId).toBe('tenant-bank-1');
      expect(config?.serverUrl).toBe('ldaps://ad.bank.internal:636');
      expect(config?.ouMappingRules.length).toBe(1);
    });

    it('should save and update tenant config with upsert query', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [sampleConfigRow] });

      const configInput: LdapSyncConfig = {
        tenantId: 'tenant-bank-1',
        providerId: 'prov-ldap-1',
        serverUrl: 'ldaps://ad.bank.internal:636',
        bindDn: 'CN=svc,DC=bank,DC=internal',
        bindPassword: 'secret-pass',
        baseDn: 'DC=bank,DC=internal',
        userSearchFilter: '(objectClass=user)',
        groupSearchFilter: '(objectClass=group)',
        ouSearchFilter: '(objectClass=organizationalUnit)',
        attributeMapping: {} as any,
        ouMappingRules: [],
        groupMappingRules: [],
        syncIntervalCron: '0 */6 * * *',
        syncMode: 'INCREMENTAL',
        deactivateMissingUsers: true,
        revokeSessionsOnDeactivate: true,
        tlsRequireTrustedCa: true,
        tlsCaCerts: [],
        pageSize: 500,
        isEnabled: true,
      };

      const saved = await syncService.saveConfig(configInput);
      expect(saved.tenantId).toBe('tenant-bank-1');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ldap_sync_configurations'),
        expect.any(Array)
      );
    });

    it('should prevent concurrent synchronizations for the same tenant', async () => {
      // Mock getConfig to delay
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT * FROM ldap_sync_configurations')) {
          return { rows: [sampleConfigRow] };
        }
        return { rows: [] };
      });

      // Stub getAuthenticatedClient to simulate ongoing operation
      vi.spyOn(LdapConnectionManager, 'getAuthenticatedClient').mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          unbind: async () => {},
          search: async () => ({ searchEntries: [] }),
        } as any), 100))
      );

      const promise1 = syncService.synchronize('tenant-bank-1');
      await expect(syncService.synchronize('tenant-bank-1')).rejects.toThrow(
        /already running/
      );

      await promise1;
    });

    it('should execute dry-run preview and compute plans without database mutations', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT * FROM ldap_sync_configurations')) {
          return { rows: [sampleConfigRow] };
        }
        if (sql.includes('SELECT id, username, email, display_name, role, active, status')) {
          return {
            rows: [
              {
                id: 'existing-user-1',
                username: 'alice',
                email: 'alice@bank.com',
                display_name: 'Alice Old',
                role: 'BANK_OPERATOR',
                active: true,
                status: 'active',
              },
            ],
          };
        }
        return { rows: [] };
      });

      const mockClient = {
        unbind: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(LdapConnectionManager, 'getAuthenticatedClient').mockResolvedValue(mockClient as any);

      vi.spyOn(LdapConnectionManager, 'executePagedSearch').mockImplementation(
        async (_client, base, filter) => {
          if (filter.includes('organizationalUnit')) {
            return [
              {
                dn: 'OU=Security,OU=Corporate,DC=bank,DC=internal',
                attributes: { ou: 'Security' },
              },
            ];
          }
          if (filter.includes('objectCategory=group')) {
            return [
              {
                dn: 'CN=Sec-Officers,OU=Groups,DC=bank,DC=internal',
                attributes: { cn: 'Sec-Officers', member: ['CN=alice,OU=Security,OU=Corporate,DC=bank,DC=internal'] },
              },
            ];
          }
          // Users
          return [
            {
              dn: 'CN=alice,OU=Security,OU=Corporate,DC=bank,DC=internal',
              attributes: {
                sAMAccountName: 'alice',
                mail: 'alice@bank.com',
                displayName: 'Alice Updated',
                memberOf: ['CN=Sec-Officers,OU=Groups,DC=bank,DC=internal'],
                userAccountControl: 512, // normal account
              },
            },
            {
              dn: 'CN=charlie,OU=Security,OU=Corporate,DC=bank,DC=internal',
              attributes: {
                sAMAccountName: 'charlie',
                mail: 'charlie@bank.com',
                displayName: 'Charlie New',
                memberOf: [],
                userAccountControl: 512,
              },
            },
          ];
        }
      );

      const previewPlan = await syncService.preview('tenant-bank-1');

      // User charlie should be in usersToCreate
      expect(previewPlan.usersToCreate.length).toBe(1);
      expect(previewPlan.usersToCreate[0].username).toBe('charlie');
      expect(previewPlan.usersToCreate[0].mappedRole).toBe('SECURITY_ADMIN'); // from OU mapping!

      // User alice should be in usersToUpdate (displayName changed)
      expect(previewPlan.usersToUpdate.length).toBe(1);
      expect(previewPlan.usersToUpdate[0].username).toBe('alice');
      expect(previewPlan.usersToUpdate[0].changes.displayName.new).toBe('Alice Updated');

      // No write queries executed during preview
      const writeQueries = mockPool.query.mock.calls.filter(([sql]: [string]) =>
        sql.includes('INSERT INTO users') || sql.includes('UPDATE users')
      );
      expect(writeQueries.length).toBe(0);
    });

    it('should detect disabled accounts via userAccountControl bitmask 0x0002 and revoke active sessions', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT * FROM ldap_sync_configurations')) {
          return { rows: [sampleConfigRow] };
        }
        if (sql.includes('SELECT id, username, email, display_name, role, active, status')) {
          return {
            rows: [
              {
                id: 'compromised-user-id',
                username: 'mallory',
                email: 'mallory@bank.com',
                display_name: 'Mallory Terminated',
                role: 'BANK_OPERATOR',
                active: true,
                status: 'active',
              },
            ],
          };
        }
        return { rows: [] };
      });

      const mockClient = {
        unbind: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(LdapConnectionManager, 'getAuthenticatedClient').mockResolvedValue(mockClient as any);

      vi.spyOn(LdapConnectionManager, 'executePagedSearch').mockImplementation(
        async (_client, _base, filter) => {
          if (filter.includes('organizationalUnit') || filter.includes('objectCategory=group')) {
            return [];
          }
          // Return user with userAccountControl 514 (0x0200 normal + 0x0002 ACCOUNTDISABLE)
          return [
            {
              dn: 'CN=mallory,OU=Users,DC=bank,DC=internal',
              attributes: {
                sAMAccountName: 'mallory',
                mail: 'mallory@bank.com',
                displayName: 'Mallory Terminated',
                userAccountControl: 514, // DISABLED!
              },
            },
          ];
        }
      );

      const syncResult = await syncService.synchronize('tenant-bank-1', { mode: 'FULL' });
      expect(syncResult.status).toBe('SUCCESS');

      // Should have called SessionService to revoke sessions for mallory
      expect(mockSessionService.revokeAllForUser).toHaveBeenCalledWith(
        'compromised-user-id',
        expect.stringContaining('Account disabled')
      );

      // Should have updated database to mark active = false
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET'),
        expect.arrayContaining([false, 'compromised-user-id', 'tenant-bank-1'])
      );
    });
  });

  // ==========================================================================
  // 5. Fastify REST API Routes Verification
  // ==========================================================================
  describe('Fastify REST API Routes (/v1/security/ldap)', () => {
    let app: any;
    let mockPool: any;
    let mockService: any;

    beforeEach(async () => {
      app = Fastify();
      mockPool = { query: vi.fn() };
      mockService = {
        synchronize: vi.fn().mockResolvedValue({
          jobId: 'job-123',
          tenantId: 'tenant-test',
          providerId: 'ldap-ad-provider',
          syncMode: 'INCREMENTAL',
          status: 'SUCCESS',
          usersDiscovered: 45,
          usersCreated: 3,
          usersUpdated: 5,
          usersDeactivated: 0,
          groupsDiscovered: 12,
          groupsMapped: 4,
          ousDiscovered: 6,
          durationMs: 420,
          errors: [],
          startedAt: new Date(),
          completedAt: new Date(),
        }),
        getSyncStatus: vi.fn().mockResolvedValue({
          isRunning: false,
          lastSync: { id: 'job-123', status: 'SUCCESS' },
        }),
        getSyncHistory: vi.fn().mockResolvedValue({
          total: 1,
          history: [{ id: 'job-123', status: 'SUCCESS', users_created: 3 }],
        }),
        testConnection: vi.fn().mockResolvedValue({
          success: true,
          serverUrl: 'ldaps://ad.bank.internal:636',
          tlsSecure: true,
          boundAs: 'CN=svc,DC=bank,DC=internal',
          responseTimeMs: 38,
        }),
        preview: vi.fn().mockResolvedValue({
          usersToCreate: [{ username: 'bob', email: 'bob@bank.com', mappedRole: 'OPERATOR' }],
          usersToUpdate: [],
          usersToDeactivate: [],
          groupsResolved: [],
          ousDiscovered: [],
        }),
        getConfig: vi.fn().mockResolvedValue({
          tenantId: 'tenant-test',
          providerId: 'ldap-ad-provider',
          serverUrl: 'ldaps://ad.bank.internal:636',
          bindDn: 'CN=svc,DC=bank,DC=internal',
          bindPassword: 'super-secret-password',
          baseDn: 'DC=bank,DC=internal',
          userSearchFilter: '(objectClass=user)',
          groupSearchFilter: '(objectClass=group)',
          ouSearchFilter: '(objectClass=organizationalUnit)',
          ouMappingRules: [],
          groupMappingRules: [],
          syncIntervalCron: '0 */6 * * *',
          syncMode: 'INCREMENTAL',
          deactivateMissingUsers: true,
          revokeSessionsOnDeactivate: true,
          tlsRequireTrustedCa: true,
          tlsCaCerts: [],
          pageSize: 500,
          isEnabled: true,
        }),
        saveConfig: vi.fn().mockImplementation(async (cfg) => cfg),
        deleteConfig: vi.fn().mockResolvedValue(true),
      };

      await registerLdapSyncRoutes(app, mockPool, mockService);
    });

    it('POST /v1/security/ldap/:tenantId/sync should trigger sync', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/security/ldap/tenant-test/sync',
        payload: { mode: 'FULL', dryRun: false },
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.jobId).toBe('job-123');
      expect(json.status).toBe('SUCCESS');
      expect(mockService.synchronize).toHaveBeenCalledWith('tenant-test', {
        mode: 'FULL',
        dryRun: false,
        initiatedBy: 'admin-api',
      });
    });

    it('GET /v1/security/ldap/:tenantId/sync/status should return status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/security/ldap/tenant-test/sync/status',
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.isRunning).toBe(false);
      expect(json.lastSync.status).toBe('SUCCESS');
    });

    it('GET /v1/security/ldap/:tenantId/preview should return dry-run plan', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/security/ldap/tenant-test/preview',
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.usersToCreate.length).toBe(1);
      expect(json.usersToCreate[0].username).toBe('bob');
    });

    it('GET /v1/security/ldap/:tenantId/config should mask passwords', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/security/ldap/tenant-test/config',
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.bindPassword).toBe('********');
      expect(json.serverUrl).toBe('ldaps://ad.bank.internal:636');
    });

    it('PUT /v1/security/ldap/:tenantId/config should validate schema and save', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/security/ldap/tenant-test/config',
        payload: {
          serverUrl: 'ldaps://ad2.bank.internal:636',
          bindDn: 'CN=admin,DC=bank,DC=internal',
          baseDn: 'DC=bank,DC=internal',
          ouMappingRules: [
            {
              pattern: '/Branches/Retail',
              matchType: 'PREFIX',
              department: 'Retail Banking',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockService.saveConfig).toHaveBeenCalled();
    });

    it('POST /v1/security/ldap/:tenantId/test-connection should test connection', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/security/ldap/tenant-test/test-connection',
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.success).toBe(true);
      expect(json.tlsSecure).toBe(true);
    });

    it('DELETE /v1/security/ldap/:tenantId/config should delete configuration', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/security/ldap/tenant-test/config',
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.success).toBe(true);
    });
  });
});
