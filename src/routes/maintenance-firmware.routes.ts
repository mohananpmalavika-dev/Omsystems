/**
 * Firmware Management API Routes
 * Firmware updates, version tracking, approval workflows, and rollbacks
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { initFirmwareManager } from '../maintenance/firmware-manager.js';

export async function registerFirmwareManagementRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  const firmwareManager = initFirmwareManager(store, app.log);

  // ========================================================================
  // Firmware Version Management
  // ========================================================================

  /**
   * List firmware catalog entries
   */
  app.get('/v1/maintenance/firmware/versions', async (request, reply) => {
    const tenantId = request.currentUser.tenantId;
    const versions = await firmwareManager.listFirmwareCatalog(tenantId);
    return reply.code(200).send({ data: versions });
  });

  /**
   * Register new firmware version
   */
  app.post('/v1/maintenance/firmware/versions', async (request, reply) => {
    const body = z.object({
      assetCategory: z.enum(['camera', 'recorder', 'storage', 'network', 'other']),
      vendor: z.string().min(1),
      model: z.string().min(1),
      version: z.string().min(1),
      releaseDate: z.string().datetime(),
      fileUrl: z.string().url(),
      fileHash: z.string(),
      fileSize: z.number().positive(),
      releaseNotes: z.string(),
      criticality: z.enum(['critical', 'important', 'recommended', 'optional']),
      compatibility: z.array(z.string()),
    }).parse(request.body);

    const tenantId = request.currentUser.tenantId;

    const {
      assetCategory,
      vendor,
      model,
      version: versionName,
      releaseDate,
      fileUrl,
      fileHash,
      fileSize,
      releaseNotes,
      criticality,
      compatibility,
    } = body;

    const version = await firmwareManager.registerFirmwareVersion({
      assetCategory,
      vendor,
      model,
      version: versionName,
      tenantId,
      releaseDate: new Date(releaseDate),
      fileUrl,
      fileHash,
      fileSize,
      releaseNotes,
      criticality,
      compatibility,
      createdBy: request.currentUser.id,
    });

    await store.writeAudit({
      tenantId,
      actorUserId: request.currentUser.id,
      action: 'maintenance.firmware_version_registered',
      resourceNodeId: null,
      outcome: 'success',
      details: {
        versionId: version.id,
        vendor: version.vendor,
        model: version.model,
        version: version.version,
      },
    });

    return reply.code(201).send(version);
  });

  /**
   * Get firmware inventory for a specific asset
   */
  app.get('/v1/maintenance/firmware/assets/:assetId', async (request, reply) => {
    const params = z.object({ assetId: z.string().min(1) }).parse(request.params);
    const tenantId = request.currentUser.tenantId;
    const inventory = await firmwareManager.getAssetFirmwareInventory(tenantId, params.assetId);
    return reply.code(200).send(inventory);
  });

  /**
   * Request firmware approval
   */
  app.post('/v1/maintenance/firmware/versions/:id/request-approval', async (request, reply) => {
    const params = z.object({
      id: z.string().uuid(),
    }).parse(request.params);

    const body = z.object({
      justification: z.string().min(10),
    }).parse(request.body);

    const tenantId = request.currentUser.tenantId;

    const approvalRequest = await firmwareManager.requestApproval({
      tenantId,
      firmwareVersionId: params.id,
      requestedBy: request.currentUser.id,
      justification: body.justification,
    });

    return reply.code(201).send(approvalRequest);
  });

  /**
   * Approve firmware version
   */
  app.post('/v1/maintenance/firmware/approvals/:id/approve', async (request, reply) => {
    const params = z.object({
      id: z.string().uuid(),
    }).parse(request.params);

    const body = z.object({
      reviewNotes: z.string().optional(),
    }).parse(request.body);

    await firmwareManager.approveFirmware({
      requestId: params.id,
      reviewedBy: request.currentUser.id,
      reviewNotes: body.reviewNotes,
    });

    return reply.code(200).send({ success: true });
  });

  /**
   * Reject firmware version
   */
  app.post('/v1/maintenance/firmware/approvals/:id/reject', async (request, reply) => {
    const params = z.object({
      id: z.string().uuid(),
    }).parse(request.params);

    const body = z.object({
      reviewNotes: z.string().min(10),
    }).parse(request.body);

    await firmwareManager.rejectFirmware({
      requestId: params.id,
      reviewedBy: request.currentUser.id,
      reviewNotes: body.reviewNotes,
    });

    return reply.code(200).send({ success: true });
  });

  // ========================================================================
  // Firmware Update Management
  // ========================================================================

  /**
   * Schedule firmware update
   */
  app.post('/v1/maintenance/firmware/updates', async (request, reply) => {
    const body = z.object({
      firmwareVersionId: z.string().uuid(),
      targetAssets: z.array(z.string().uuid()).min(1),
      scheduledAt: z.string().datetime().optional(),
    }).parse(request.body);

    const tenantId = request.currentUser.tenantId;

    const update = await firmwareManager.scheduleFirmwareUpdate({
      tenantId,
      firmwareVersionId: body.firmwareVersionId,
      targetAssets: body.targetAssets,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
      createdBy: request.currentUser.id,
    });

    await store.writeAudit({
      tenantId,
      actorUserId: request.currentUser.id,
      action: 'maintenance.firmware_update_scheduled',
      resourceNodeId: null,
      outcome: 'success',
      details: {
        updateId: update.id,
        assetCount: body.targetAssets.length,
      },
    });

    return reply.code(201).send(update);
  });

  /**
   * Get firmware update progress
   */
  app.get('/v1/maintenance/firmware/updates/:id', async (request, reply) => {
    const params = z.object({
      id: z.string().uuid(),
    }).parse(request.params);

    const update = await firmwareManager.getFirmwareUpdateProgress(params.id);
    return update;
  });

  /**
   * Execute firmware update immediately
   */
  app.post('/v1/maintenance/firmware/updates/:id/execute', async (request, reply) => {
    const params = z.object({
      id: z.string().uuid(),
    }).parse(request.params);

    await firmwareManager.executeFirmwareUpdate(params.id);

    return reply.code(200).send({ success: true, message: 'Firmware update started' });
  });

  /**
   * Rollback firmware update
   */
  app.post('/v1/maintenance/firmware/updates/:id/rollback', async (request, reply) => {
    const params = z.object({
      id: z.string().uuid(),
    }).parse(request.params);

    const body = z.object({
      reason: z.string().min(10),
    }).parse(request.body);

    await firmwareManager.rollbackFirmwareUpdate({
      updateId: params.id,
      reason: body.reason,
      rollbackBy: request.currentUser.id,
    });

    return reply.code(200).send({ success: true, message: 'Rollback initiated' });
  });

  /**
   * Create an upgrade plan with safety checks
   */
  app.post('/v1/maintenance/firmware/upgrade-plans', async (request, reply) => {
    const body = z.object({
      firmwareVersionId: z.string().uuid(),
      targetAssets: z.array(z.string().min(1)).min(1),
      strategy: z.enum(['single-device', 'test-group', 'canary-rollout', 'branch-by-branch', 'region-by-region', 'scheduled-fleet-rollout', 'emergency-security-rollout']),
      safetyContext: z.object({
        modelConfirmed: z.boolean().optional(),
        exactVersionConfirmed: z.boolean().optional(),
        powerConfirmed: z.boolean().optional(),
        upsConfirmed: z.boolean().optional(),
        networkStable: z.boolean().optional(),
        backupCompleted: z.boolean().optional(),
        redundancyVerified: z.boolean().optional(),
        activeIncidentsPresent: z.boolean().optional(),
        alertsSuspended: z.boolean().optional(),
        maintenanceWindowApproved: z.boolean().optional(),
        rollbackPlanned: z.boolean().optional(),
        packageVerified: z.boolean().optional(),
        compatibilityVerified: z.boolean().optional(),
      }).optional(),
    }).parse(request.body);

    const plan = await firmwareManager.createUpgradePlan({
      tenantId: request.currentUser.tenantId,
      firmwareVersionId: body.firmwareVersionId,
      targetAssets: body.targetAssets,
      strategy: body.strategy,
      requestedBy: request.currentUser.id,
      safetyContext: body.safetyContext,
    });

    return reply.code(201).send(plan);
  });

  /**
   * Approve a planned firmware upgrade
   */
  app.post('/v1/maintenance/firmware/upgrade-plans/:id/approve', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ approvedBy: z.string().min(1).optional() }).parse(request.body);

    const approved = await firmwareManager.approveUpgradePlan(params.id, body.approvedBy ?? request.currentUser.id);
    return reply.code(200).send({ success: approved });
  });

  /**
   * Start an approved firmware upgrade plan
   */
  app.post('/v1/maintenance/firmware/upgrade-plans/:id/execute', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const started = await firmwareManager.executeUpgradePlan(params.id);
    return reply.code(200).send({ success: started });
  });

  /**
   * Check if rollback is available
   */
  app.get('/v1/maintenance/firmware/updates/:id/can-rollback', async (request, reply) => {
    const params = z.object({
      id: z.string().uuid(),
    }).parse(request.params);

    const canRollback = await firmwareManager.canRollback(params.id);

    return { canRollback };
  });

  // ========================================================================
  // Compatibility & Bulk Operations
  // ========================================================================

  /**
   * Check firmware compatibility with asset
   */
  app.post('/v1/maintenance/firmware/check-compatibility', async (request, reply) => {
    const body = z.object({
      firmwareVersionId: z.string().uuid(),
      assetId: z.string().uuid(),
    }).parse(request.body);

    const result = await firmwareManager.checkCompatibility({
      firmwareVersionId: body.firmwareVersionId,
      assetId: body.assetId,
    });

    return result;
  });

  /**
   * Get compatible assets for firmware version
   */
  app.get('/v1/maintenance/firmware/versions/:id/compatible-assets', async (request, reply) => {
    const params = z.object({
      id: z.string().uuid(),
    }).parse(request.params);

    const tenantId = request.currentUser.tenantId;

    const assetIds = await firmwareManager.getCompatibleAssets({
      tenantId,
      firmwareVersionId: params.id,
    });

    return { assetIds, count: assetIds.length };
  });

  /**
   * Schedule bulk update by branch
   */
  app.post('/v1/maintenance/firmware/bulk-update/by-branch', async (request, reply) => {
    const body = z.object({
      firmwareVersionId: z.string().uuid(),
      branchNodeIds: z.array(z.string().uuid()).min(1),
      scheduledAt: z.string().datetime().optional(),
    }).parse(request.body);

    const tenantId = request.currentUser.tenantId;

    const updates = await firmwareManager.scheduleBulkUpdateByBranch({
      tenantId,
      firmwareVersionId: body.firmwareVersionId,
      branchNodeIds: body.branchNodeIds,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
      createdBy: request.currentUser.id,
    });

    return { updates, count: updates.length };
  });

  /**
   * Schedule bulk update by category
   */
  app.post('/v1/maintenance/firmware/bulk-update/by-category', async (request, reply) => {
    const body = z.object({
      firmwareVersionId: z.string().uuid(),
      assetCategory: z.enum(['camera', 'recorder', 'storage', 'network', 'other']),
      scheduledAt: z.string().datetime().optional(),
    }).parse(request.body);

    const tenantId = request.currentUser.tenantId;

    const update = await firmwareManager.scheduleBulkUpdateByCategory({
      tenantId,
      firmwareVersionId: body.firmwareVersionId,
      assetCategory: body.assetCategory,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
      createdBy: request.currentUser.id,
    });

    return update;
  });

  // ========================================================================
  // Reporting & Statistics
  // ========================================================================

  /**
   * Get firmware update statistics
   */
  app.get('/v1/maintenance/firmware/statistics', async (request, reply) => {
    const tenantId = request.currentUser.tenantId;

    const stats = await firmwareManager.getFirmwareUpdateStats(tenantId);

    return stats;
  });

  /**
   * Get firmware version distribution
   */
  app.get('/v1/maintenance/firmware/version-distribution', async (request, reply) => {
    const query = z.object({
      assetCategory: z.enum(['camera', 'recorder', 'storage', 'network', 'other']).optional(),
    }).parse(request.query);

    const tenantId = request.currentUser.tenantId;

    const distribution = await firmwareManager.getFirmwareVersionDistribution({
      tenantId,
      assetCategory: query.assetCategory,
    });

    return { distribution, total: distribution.length };
  });
}
