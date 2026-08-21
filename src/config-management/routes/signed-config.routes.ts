import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { signedConfigService, SignedConfigService } from '../services/signed-config.service.js';
import { fleetRolloutControllerService } from '../services/fleet-rollout-controller.service.js';
import { configReconciliationService } from '../services/config-reconciliation.service.js';
import { branchConfigurationAgentService } from '../services/branch-configuration-agent.service.js';

const cameraSchema = z.object({
  id: z.string().min(1),
  channel: z.number().int().min(1),
  name: z.string().min(1),
  ip: z.string().ip(),
  resolution: z.string().min(1),
  fps: z.number().int().min(1).max(60),
  bitrateKbps: z.number().int().min(128).max(16384),
  codec: z.enum(['H264', 'H265', 'MJPEG']),
  streamProfile: z.enum(['main', 'sub', 'snapshot']),
  credentialRef: z.string().min(1),
  analyticsAssigned: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
});

const branchConfigSchema = z.object({
  schemaVersion: z.string().min(1),
  network: z.object({
    dnsServers: z.array(z.string()).min(1),
    ntpServers: z.array(z.string()).min(1),
    vlanId: z.number().optional(),
    gatewayIp: z.string().ip(),
    subnetMask: z.string().min(1),
    uplinkBandwidthMbps: z.number().positive(),
    qosDscp: z.number().optional(),
  }),
  cameras: z.array(cameraSchema),
  recorder: z.object({
    nvrId: z.string().min(1),
    name: z.string().min(1),
    manufacturer: z.string().min(1),
    model: z.string().min(1),
    managementIp: z.string().ip(),
    storageTargets: z.array(z.string()).min(1),
    recordingMode: z.enum(['CONTINUOUS', 'MOTION', 'SCHEDULE', 'DISABLED']),
    ntpServer: z.string().min(1),
    credentialRef: z.string().min(1),
    channelsCount: z.number().int().positive(),
  }),
  retention: z.object({
    continuousDays: z.number().int().min(1),
    alertFootageDays: z.number().int().min(1),
    forensicEvidenceDays: z.number().int().min(1),
    storagePurgeThresholdPercent: z.number().min(50).max(99),
  }),
  analytics: z.object({
    detectorVersions: z.record(z.string()).default({}),
    schedules: z.record(z.string()).default({}),
    sensitivityThresholds: z.record(z.number()).default({}),
    zonesCount: z.number().int().default(4),
  }),
  security: z.object({
    minTlsVersion: z.enum(['TLS1.2', 'TLS1.3']).default('TLS1.3'),
    certificateThumbprints: z.array(z.string()).default([]),
    allowedCiphers: z.array(z.string()).default(['TLS_AES_256_GCM_SHA384']),
    enforceSignedConfig: z.boolean().default(true),
  }),
  customSettings: z.record(z.unknown()).optional(),
});

export async function registerSignedConfigRoutes(
  app: FastifyInstance,
  service: SignedConfigService = signedConfigService
) {
  // 1. List all Configuration Versions
  app.get('/v1/config/versions', async (request) => {
    const versions = service.listVersions(request.currentUser.tenantId);
    return { success: true, data: versions };
  });

  // 2. Create a new immutable Configuration Draft
  app.post('/v1/config/versions', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      version: z.number().int().min(1),
      config: branchConfigSchema,
      changeReason: z.string().min(1),
      ticketId: z.string().optional(),
      parentVersionId: z.string().optional(),
    });

    const body = schema.parse(request.body);
    const creator = request.currentUser.username ?? request.currentUser.id;

    const draft = await service.createDraftVersion(
      {
        tenantId: request.currentUser.tenantId,
        version: body.version,
        config: body.config as any,
        changeReason: body.changeReason,
        ticketId: body.ticketId,
        parentVersionId: body.parentVersionId,
      },
      creator
    );

    return reply.code(201).send({ success: true, data: draft });
  });

  // 3. Validate Configuration Version (Static, Semantic, Risk Scoring)
  app.post('/v1/config/versions/:id/validate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (service.getVersion(id)?.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ success: false, error: 'Configuration version not found' });
    }
    try {
      const validation = await service.validateVersion(id);
      return reply.code(200).send({ success: true, data: validation });
    } catch (err: any) {
      return reply.code(404).send({ success: false, error: err.message });
    }
  });

  // 4. Approve Version (Enforcing Separation of Duties)
  app.post('/v1/config/versions/:id/approve', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      decision: z.enum(['APPROVED', 'REJECTED']).default('APPROVED'),
      comments: z.string().min(1),
    });

    const body = schema.parse(request.body);
    const approver = request.currentUser.username ?? request.currentUser.id;
    if (service.getVersion(id)?.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ success: false, error: 'Configuration version not found' });
    }

    try {
      const version = await service.approveVersion({
        versionId: id,
        approver,
        role: request.currentUser.role ?? 'operator',
        decision: body.decision,
        comments: body.comments,
      });

      return reply.code(200).send({ success: true, data: version });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  // 5. Cryptographically Sign Approved Version
  app.post('/v1/config/versions/:id/sign', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (service.getVersion(id)?.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ success: false, error: 'Configuration version not found' });
    }
    try {
      const manifest = await service.signVersion(id);
      return reply.code(200).send({ success: true, data: manifest });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  // 6. Clone Immutable Version (v34 -> v35)
  app.post('/v1/config/versions/:id/clone', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      modifications: z.record(z.unknown()).default({}),
      changeReason: z.string().min(1),
      ticketId: z.string().optional(),
    });

    const body = schema.parse(request.body);
    const creator = request.currentUser.username ?? request.currentUser.id;
    if (service.getVersion(id)?.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ success: false, error: 'Configuration version not found' });
    }

    try {
      const nextDraft = await service.cloneVersion(
        id,
        creator,
        body.modifications as any,
        body.changeReason,
        body.ticketId
      );
      return reply.code(201).send({ success: true, data: nextDraft });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  // 7. Revoke Version
  app.post('/v1/config/versions/:id/revoke', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({ reason: z.string().min(1) });
    const body = schema.parse(request.body);
    const revokedBy = request.currentUser.username ?? request.currentUser.id;
    if (service.getVersion(id)?.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ success: false, error: 'Configuration version not found' });
    }

    try {
      const revoked = await service.revokeVersion(id, body.reason, revokedBy);
      return reply.code(200).send({ success: true, data: revoked });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  // 8. Get Branch State & Deep Drift Report
  app.get('/v1/config/branches/:branchId/state', async (request: FastifyRequest, reply: FastifyReply) => {
    const { branchId } = request.params as { branchId: string };
    const state = service.getBranchState(branchId, request.currentUser.tenantId);

    if (!state) {
      return reply.code(404).send({ success: false, error: `Branch ${branchId} state not found` });
    }

    return reply.code(200).send({ success: true, data: state });
  });

  // 9. Fleet Compliance Overview
  app.get('/v1/config/fleet/overview', async (request) => {
    const overview = service.getFleetOverview(request.currentUser.tenantId);
    return { success: true, data: overview };
  });

  // 10. Staged Canary Fleet Rollouts (5% -> 25% -> 50% -> 100%)
  app.post('/v1/config/rollouts', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      configVersionId: z.string().min(1),
      autoRollbackOnBreach: z.boolean().default(true),
    });

    const body = schema.parse(request.body);
    const user = request.currentUser.username ?? request.currentUser.id;
    const branchIds = service.listFleetStates(request.currentUser.tenantId).map((state) => state.branchId);
    if (branchIds.length === 0) return reply.code(409).send({ success: false, error: 'NO_REPORTED_BRANCHES' });

    try {
      const rollout = await fleetRolloutControllerService.createRollout({
        configVersionId: body.configVersionId,
        tenantId: request.currentUser.tenantId,
        branchIds,
        createdBy: user,
        autoRollbackOnBreach: body.autoRollbackOnBreach,
      });

      return reply.code(201).send({ success: true, data: rollout });
    } catch (err: any) {
      const unavailable = err?.message === 'FLEET_CONFIG_DISPATCHER_NOT_CONFIGURED';
      return reply.code(unavailable ? 503 : 400).send({ success: false, error: err.message });
    }
  });

  // 11. Advance Rollout Stage (Health Evaluation)
  app.post('/v1/config/rollouts/:id/advance', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (fleetRolloutControllerService.getRollout(id)?.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ success: false, error: 'Rollout not found' });
    }
    try {
      const result = await fleetRolloutControllerService.evaluateAndAdvance(id);
      return reply.code(200).send({ success: true, data: result });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  // 12. Rollback Rollout
  app.post('/v1/config/rollouts/:id/rollback', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      targetVersion: z.number().int().min(1),
      reason: z.string().min(1),
      incidentId: z.string().optional(),
    });

    const body = schema.parse(request.body);
    const user = request.currentUser.username ?? request.currentUser.id;
    if (fleetRolloutControllerService.getRollout(id)?.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ success: false, error: 'Rollout not found' });
    }

    try {
      const rollback = await fleetRolloutControllerService.triggerRollback(
        id,
        body.targetVersion,
        body.reason,
        user,
        body.incidentId
      );
      return reply.code(200).send({ success: true, data: rollback });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  app.post('/v1/config/rollouts/:id/branches/:branchId/result', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, branchId } = request.params as { id: string; branchId: string };
    const body = z.object({
      status: z.enum(['VERIFIED', 'FAILED', 'OFFLINE']),
      error: z.string().min(1).optional(),
    }).parse(request.body);
    if (fleetRolloutControllerService.getRollout(id)?.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ success: false, error: 'Rollout not found' });
    }
    try {
      const assignment = fleetRolloutControllerService.recordBranchResult(id, branchId, body);
      return reply.send({ success: true, data: assignment });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  // 13. Fleet Drift Reconciliation
  app.post('/v1/config/reconcile', async (request: FastifyRequest) => {
    const schema = z.object({
      policy: z.enum(['REPORT_ONLY', 'AUTO_REMEDIATE', 'REQUIRE_APPROVAL']).default('REPORT_ONLY'),
    });
    const body = schema.parse(request.body || {});
    const result = await configReconciliationService.runFleetReconciliation(
      body.policy,
      request.currentUser.tenantId,
    );
    return { success: true, data: result };
  });

  // Authoritative actual state reported by an authenticated branch gateway.
  app.post('/v1/config/actual/report', async (request: FastifyRequest) => {
    const reportActualStateSchema = z.object({
      gatewayId: z.string(),
      branchId: z.string(),
      appliedVersion: z.number().int(),
      appliedPackageSha256: z.string(),
      gatewayVersion: z.string().min(1).optional(),
      actualConfig: branchConfigSchema,
    });
    const body = reportActualStateSchema.parse(request.body);
    const report = await service.reportActualState({
      tenantId: request.currentUser.tenantId,
      branchId: body.branchId,
      gatewayId: body.gatewayId,
      appliedVersion: body.appliedVersion,
      appliedPackageSha256: body.appliedPackageSha256,
      gatewayVersion: body.gatewayVersion,
      actualConfig: body.actualConfig,
    });

    return { success: true, data: report };
  });
}
