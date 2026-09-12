/**
 * Production LDAP & Active Directory Synchronization REST API Routes
 * 
 * Provides administrative endpoints for directory synchronization,
 * connection validation, OU/group mapping configuration, and audit history.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Pool } from 'pg';
import { LdapDirectorySyncService } from '../security/ldap/ldap-directory-sync.service.js';
import { LdapConnectionManager } from '../security/ldap/ldap-connection-manager.js';
import type { LdapSyncConfig } from '../security/ldap/ldap-types.js';

const syncTriggerSchema = z.object({
  mode: z.enum(['FULL', 'INCREMENTAL']).optional().default('INCREMENTAL'),
  dryRun: z.boolean().optional().default(false),
});

const testConnectionSchema = z.object({
  serverUrl: z.string().url().optional(),
  bindDn: z.string().min(1).optional(),
  bindPassword: z.string().min(1).optional(),
  baseDn: z.string().min(1).optional(),
  tlsRequireTrustedCa: z.boolean().optional(),
  tlsCaCerts: z.array(z.string()).optional(),
}).optional();

const ldapConfigSchema = z.object({
  providerId: z.string().min(1).default('ldap-ad-provider'),
  name: z.string().min(1).default('Enterprise Active Directory'),
  serverUrl: z.string().min(1),
  bindDn: z.string().min(1),
  bindPassword: z.string().optional(),
  bindSecretRef: z.string().optional(),
  baseDn: z.string().min(1),
  userSearchBase: z.string().optional(),
  userSearchFilter: z.string().default('(&(objectCategory=person)(objectClass=user))'),
  groupSearchBase: z.string().optional(),
  groupSearchFilter: z.string().default('(&(objectCategory=group)(objectClass=group))'),
  ouSearchBase: z.string().optional(),
  ouSearchFilter: z.string().default('(objectClass=organizationalUnit)'),
  attributeMapping: z.record(z.string()).optional(),
  ouMappingRules: z.array(
    z.object({
      pattern: z.string().min(1),
      matchType: z.enum(['EXACT', 'PREFIX', 'REGEX']),
      department: z.string().optional(),
      branchId: z.string().optional(),
      defaultRole: z.string().optional(),
      clearanceTags: z.array(z.string()).optional(),
    })
  ).optional().default([]),
  groupMappingRules: z.array(
    z.object({
      groupDnOrCn: z.string().min(1),
      targetRole: z.string().min(1),
      priority: z.number().int().default(100),
      clearanceTags: z.array(z.string()).optional(),
    })
  ).optional().default([]),
  syncIntervalCron: z.string().default('0 */6 * * *'),
  syncMode: z.enum(['FULL', 'INCREMENTAL']).default('INCREMENTAL'),
  deactivateMissingUsers: z.boolean().default(true),
  revokeSessionsOnDeactivate: z.boolean().default(true),
  tlsRequireTrustedCa: z.boolean().default(true),
  tlsCaCerts: z.array(z.string()).default([]),
  pageSize: z.number().int().positive().default(500),
  isEnabled: z.boolean().default(true),
});

export async function registerLdapSyncRoutes(
  app: FastifyInstance,
  pool: Pool,
  syncService?: LdapDirectorySyncService
): Promise<void> {
  const service = syncService || new LdapDirectorySyncService(pool);

  // 1. Trigger LDAP Directory Synchronization
  app.post('/v1/security/ldap/:tenantId/sync', async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const parsedBody = syncTriggerSchema.safeParse(request.body || {});

    if (!parsedBody.success) {
      return reply.code(400).send({
        error: 'INVALID_REQUEST',
        details: parsedBody.error.flatten(),
      });
    }

    try {
      const result = await service.synchronize(tenantId, {
        mode: parsedBody.data.mode,
        dryRun: parsedBody.data.dryRun,
        initiatedBy: (request.headers['x-user-id'] as string) || 'admin-api',
      });

      return reply.code(200).send(result);
    } catch (err: any) {
      return reply.code(err.message?.includes('already running') ? 409 : 500).send({
        error: 'SYNC_EXECUTION_FAILED',
        message: err.message,
      });
    }
  });

  // 2. Get Sync Status & Running Indicator
  app.get('/v1/security/ldap/:tenantId/sync/status', async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    try {
      const status = await service.getSyncStatus(tenantId);
      return reply.send(status);
    } catch (err: any) {
      return reply.code(500).send({ error: 'STATUS_QUERY_FAILED', message: err.message });
    }
  });

  // 3. Get Sync Execution History
  app.get('/v1/security/ldap/:tenantId/sync/history', async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const query = request.query as { limit?: string; offset?: string };
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const offset = Math.max(0, parseInt(query.offset || '0', 10));

    try {
      const history = await service.getSyncHistory(tenantId, limit, offset);
      return reply.send(history);
    } catch (err: any) {
      return reply.code(500).send({ error: 'HISTORY_QUERY_FAILED', message: err.message });
    }
  });

  // 4. Test LDAPS Connection & Service Account Bind
  app.post('/v1/security/ldap/:tenantId/test-connection', async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const parsedBody = testConnectionSchema.safeParse(request.body || {});

    if (!parsedBody.success) {
      return reply.code(400).send({
        error: 'INVALID_REQUEST',
        details: parsedBody.error.flatten(),
      });
    }

    try {
      // If ad-hoc connection parameters provided in body, test directly
      if (parsedBody.data?.serverUrl && parsedBody.data?.bindDn && parsedBody.data?.bindPassword) {
        const adHocConfig: LdapSyncConfig = {
          tenantId,
          providerId: 'adhoc-test',
          serverUrl: parsedBody.data.serverUrl,
          bindDn: parsedBody.data.bindDn,
          bindPassword: parsedBody.data.bindPassword,
          baseDn: parsedBody.data.baseDn || 'dc=example,dc=com',
          userSearchFilter: '(objectClass=person)',
          groupSearchFilter: '(objectClass=group)',
          ouSearchFilter: '(objectClass=organizationalUnit)',
          attributeMapping: {} as any,
          ouMappingRules: [],
          groupMappingRules: [],
          syncIntervalCron: '',
          syncMode: 'INCREMENTAL',
          deactivateMissingUsers: false,
          revokeSessionsOnDeactivate: false,
          tlsRequireTrustedCa: parsedBody.data.tlsRequireTrustedCa ?? true,
          tlsCaCerts: parsedBody.data.tlsCaCerts || [],
          pageSize: 100,
          isEnabled: true,
        };
        const testRes = await LdapConnectionManager.testConnection(adHocConfig, parsedBody.data.bindPassword);
        return reply.code(testRes.success ? 200 : 400).send(testRes);
      }

      // Otherwise test saved tenant configuration
      const testRes = await service.testConnection(tenantId);
      return reply.code(testRes.success ? 200 : 400).send(testRes);
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: err.message,
      });
    }
  });

  // 5. Preview Synchronization Plan (Dry-Run)
  app.get('/v1/security/ldap/:tenantId/preview', async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    try {
      const plan = await service.preview(tenantId);
      return reply.send(plan);
    } catch (err: any) {
      return reply.code(500).send({ error: 'PREVIEW_FAILED', message: err.message });
    }
  });

  // 6. Get LDAP Sync Configuration
  app.get('/v1/security/ldap/:tenantId/config', async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    try {
      const config = await service.getConfig(tenantId);
      if (!config) {
        return reply.code(404).send({ error: 'CONFIG_NOT_FOUND', message: 'LDAP config not found' });
      }

      // Mask sensitive password before returning
      const safeConfig = {
        ...config,
        bindPassword: config.bindPassword ? '********' : undefined,
        bindSecretRef: 'configured',
      };
      return reply.send(safeConfig);
    } catch (err: any) {
      return reply.code(500).send({ error: 'CONFIG_QUERY_FAILED', message: err.message });
    }
  });

  // 7. Save / Update LDAP Sync Configuration
  app.put('/v1/security/ldap/:tenantId/config', async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const parsedBody = ldapConfigSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.code(400).send({
        error: 'INVALID_REQUEST',
        details: parsedBody.error.flatten(),
      });
    }

    try {
      const existingConfig = await service.getConfig(tenantId);
      const fullConfig: LdapSyncConfig = {
        tenantId,
        providerId: parsedBody.data.providerId,
        name: parsedBody.data.name,
        serverUrl: parsedBody.data.serverUrl,
        bindDn: parsedBody.data.bindDn,
        bindPassword: parsedBody.data.bindPassword || existingConfig?.bindPassword || 'secret',
        bindSecretRef: parsedBody.data.bindSecretRef || 'stored-secret',
        baseDn: parsedBody.data.baseDn,
        userSearchBase: parsedBody.data.userSearchBase,
        userSearchFilter: parsedBody.data.userSearchFilter,
        groupSearchBase: parsedBody.data.groupSearchBase,
        groupSearchFilter: parsedBody.data.groupSearchFilter,
        ouSearchBase: parsedBody.data.ouSearchBase,
        ouSearchFilter: parsedBody.data.ouSearchFilter,
        attributeMapping: (parsedBody.data.attributeMapping as any) || {},
        ouMappingRules: parsedBody.data.ouMappingRules,
        groupMappingRules: parsedBody.data.groupMappingRules,
        syncIntervalCron: parsedBody.data.syncIntervalCron,
        syncMode: parsedBody.data.syncMode,
        deactivateMissingUsers: parsedBody.data.deactivateMissingUsers,
        revokeSessionsOnDeactivate: parsedBody.data.revokeSessionsOnDeactivate,
        tlsRequireTrustedCa: parsedBody.data.tlsRequireTrustedCa,
        tlsCaCerts: parsedBody.data.tlsCaCerts,
        pageSize: parsedBody.data.pageSize,
        isEnabled: parsedBody.data.isEnabled,
      };

      const saved = await service.saveConfig(fullConfig);
      return reply.send({
        ...saved,
        bindPassword: '********',
      });
    } catch (err: any) {
      return reply.code(500).send({ error: 'CONFIG_SAVE_FAILED', message: err.message });
    }
  });

  // 8. Delete LDAP Sync Configuration
  app.delete('/v1/security/ldap/:tenantId/config', async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    try {
      const deleted = await service.deleteConfig(tenantId);
      return reply.send({ success: deleted });
    } catch (err: any) {
      return reply.code(500).send({ error: 'CONFIG_DELETE_FAILED', message: err.message });
    }
  });
}
