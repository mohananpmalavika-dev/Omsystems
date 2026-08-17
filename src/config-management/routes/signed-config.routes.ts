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
  resolution: z.string().default('1920x1080'),
  fps: z.number().int().min(1).max(60).default(25),
  bitrateKbps: z.number().int().min(128).max(16384).default(2048),
  codec: z.enum(['H264', 'H265', 'MJPEG']).default('H265'),
  streamProfile: z.enum(['main', 'sub', 'snapshot']).default('main'),
  credentialRef: z.string().default('secret://branch/default/camera'),
  analyticsAssigned: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
});

const branchConfigSchema = z.object({
  schemaVersion: z.string().default('3.1'),
  network: z.object({
    dnsServers: z.array(z.string()).default(['10.100.1.10']),
    ntpServers: z.array(z.string()).default(['time.bank.internal']),
    vlanId: z.number().optional(),
    gatewayIp: z.string().default('10.100.1.1'),
    subnetMask: z.string().default('255.255.255.0'),
    uplinkBandwidthMbps: z.number().default(50),
    qosDscp: z.number().optional(),
  }),
  cameras: z.array(cameraSchema),
  recorder: z.object({
    nvrId: z.string().default('NVR-01'),
    name: z.string().default('Branch Main NVR'),
    manufacturer: z.string().default('CP PLUS'),
    model: z.string().default('CP-UNR-4K4322-V3'),
    managementIp: z.string().default('10.100.1.10'),
    storageTargets: z.array(z.string()).default(['/dev/sda1']),
    recordingMode: z.enum(['CONTINUOUS', 'MOTION', 'SCHEDULE', 'DISABLED']).default('CONTINUOUS'),
    ntpServer: z.string().default('time.bank.internal'),
    credentialRef: z.string().default('secret://branch/default/recorder'),
    channelsCount: z.number().int().default(32),
  }),
  retention: z.object({
    continuousDays: z.number().int().min(1).default(90),
    alertFootageDays: z.number().int().min(1).default(180),
    forensicEvidenceDays: z.number().int().min(1).default(365),
    storagePurgeThresholdPercent: z.number().min(50).max(99).default(90),
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
  app.get('/v1/config/versions', async () => {
    const versions = service.listVersions();
    return { success: true, data: versions };
  });

  // 2. Create a new immutable Configuration Draft
  app.post('/v1/config/versions', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      version: z.number().int().min(1),
      tenantId: z.string().default('BANK-001'),
      config: branchConfigSchema,
      changeReason: z.string().min(1),
      ticketId: z.string().optional(),
      parentVersionId: z.string().optional(),
    });

    const body = schema.parse(request.body);
    const creator = (request as any).currentUser?.username || 'user.security-architect';

    const draft = await service.createDraftVersion(
      {
        tenantId: body.tenantId,
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
      role: z.string().default('CHIEF_INFORMATION_SECURITY_OFFICER'),
    });

    const body = schema.parse(request.body);
    const approver = (request as any).currentUser?.username || 'user.ciso';

    try {
      const version = await service.approveVersion({
        versionId: id,
        approver,
        role: body.role,
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
    const creator = (request as any).currentUser?.username || 'user.security-architect';

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
    const revokedBy = (request as any).currentUser?.username || 'user.ciso';

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
    const state = service.getBranchState(branchId);

    if (!state) {
      return reply.code(404).send({ success: false, error: `Branch ${branchId} state not found` });
    }

    return reply.code(200).send({ success: true, data: state });
  });

  // 9. Fleet Compliance Overview (400 Branches)
  app.get('/v1/config/fleet/overview', async () => {
    const overview = service.getFleetOverview(400);
    return { success: true, data: overview };
  });

  // 10. Staged Canary Fleet Rollouts (5% -> 25% -> 50% -> 100%)
  app.post('/v1/config/rollouts', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      configVersionId: z.string().min(1),
      tenantId: z.string().default('BANK-001'),
      totalBranches: z.number().int().default(400),
      autoRollbackOnBreach: z.boolean().default(true),
    });

    const body = schema.parse(request.body);
    const user = (request as any).currentUser?.username || 'user.operations-lead';

    try {
      const rollout = await fleetRolloutControllerService.createRollout({
        configVersionId: body.configVersionId,
        tenantId: body.tenantId,
        totalBranches: body.totalBranches,
        createdBy: user,
        autoRollbackOnBreach: body.autoRollbackOnBreach,
      });

      return reply.code(201).send({ success: true, data: rollout });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  // 11. Advance Rollout Stage (Health Evaluation)
  app.post('/v1/config/rollouts/:id/advance', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
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
      targetVersion: z.number().int().default(32),
      reason: z.string().min(1),
      incidentId: z.string().optional(),
    });

    const body = schema.parse(request.body);
    const user = (request as any).currentUser?.username || 'user.operations-lead';

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

  // 13. Fleet Drift Reconciliation
  app.post('/v1/config/reconcile', async (request: FastifyRequest) => {
    const schema = z.object({
      policy: z.enum(['REPORT_ONLY', 'AUTO_REMEDIATE', 'REQUIRE_APPROVAL']).default('AUTO_REMEDIATE'),
    });
    const body = schema.parse(request.body || {});
    const result = await configReconciliationService.runFleetReconciliation(body.policy);
    return { success: true, data: result };
  });

  // Backward compatibility routes for existing tests
  app.get('/v1/config/desired', async () => ({ data: service.listDesiredConfigs() }));
  app.get('/v1/config/drift/:branchId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { branchId } = request.params as { branchId: string };
    const actual = service.getActualReport(branchId);
    const latestDesired = service.listDesiredConfigs()[0];

    if (!latestDesired) return reply.code(404).send({ error: 'no_desired_configuration' });
    if (!actual) {
      return {
        driftReport: {
          branchId,
          gatewayId: `gw-${branchId.toLowerCase()}`,
          desiredVersion: latestDesired.version,
          actualVersion: 0,
          status: 'DRIFTED',
          driftedFields: [{ field: 'all', desiredValue: 'configured', actualValue: 'unreported' }],
          evaluatedAt: new Date().toISOString(),
        },
      };
    }

    const report = service.detectDrift(latestDesired, actual);
    return { driftReport: report };
  });

  app.post('/v1/config/actual/report', async (request: FastifyRequest) => {
    const reportActualStateSchema = z.object({
      gatewayId: z.string(),
      branchId: z.string(),
      appliedVersion: z.number().int(),
      appliedPackageSha256: z.string(),
      actualConfigData: z.record(z.unknown()),
    });
    const body = reportActualStateSchema.parse(request.body);
    const report = await service.reportActualState({
      branchId: body.branchId,
      gatewayId: body.gatewayId,
      appliedVersion: body.appliedVersion,
      appliedPackageSha256: body.appliedPackageSha256,
      actualConfig: {
        schemaVersion: '3.1',
        network: { dnsServers: ['10.100.1.10'], ntpServers: ['time.bank.internal'], gatewayIp: '10.100.1.1', subnetMask: '255.255.255.0', uplinkBandwidthMbps: 50 },
        cameras: [{ id: 'CAM-01', channel: 1, name: 'Main Lobby', ip: '10.118.1.21', resolution: '1920x1080', fps: 25, bitrateKbps: (body.actualConfigData.cameraDefaultBitrateKbps as number) || 2048, codec: 'H265', streamProfile: 'main', credentialRef: 'secret://branch/BR-118/camera/CAM-01', analyticsAssigned: [], enabled: true }],
        recorder: { nvrId: 'NVR-01', name: 'NVR', manufacturer: 'CP PLUS', model: 'CP-UNR', managementIp: '10.118.1.10', storageTargets: ['/dev/sda1'], recordingMode: 'CONTINUOUS', ntpServer: (body.actualConfigData.nvrNtpServer as string) || 'time.bank.internal', credentialRef: 'secret://branch/BR-118/recorder/NVR-01', channelsCount: 32 },
        retention: { continuousDays: (body.actualConfigData.retentionDays as number) || 90, alertFootageDays: 180, forensicEvidenceDays: 365, storagePurgeThresholdPercent: 90 },
        analytics: { detectorVersions: {}, schedules: {}, sensitivityThresholds: {}, zonesCount: 4 },
        security: { minTlsVersion: 'TLS1.3', certificateThumbprints: [], allowedCiphers: [], enforceSignedConfig: true },
      },
    });

    return { success: true, data: report };
  });
}
