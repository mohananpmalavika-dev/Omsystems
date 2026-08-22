/**
 * Device Management Routes
 * 
 * Production-ready endpoints for:
 * - Credential rotation with RBAC and MFA
 * - IP address management with IPAM
 * - Configuration templates with versioning
 * - Job monitoring and status
 * - Configuration drift detection
 * 
 * @see DEVICE_MANAGEMENT_PRODUCTION_GUIDE.md
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ExtendedControlPlaneStore } from '../control-plane-store.js';
import { DeviceCredentialService } from '../services/device-credential-service.js';
import { IpamService } from '../services/ipam-service.js';
import { DeviceTemplateService } from '../services/device-template-service.js';

export async function registerDeviceManagementRoutes(app: FastifyInstance, store: ExtendedControlPlaneStore) {
  const credentialService = new DeviceCredentialService(store);
  const ipamService = new IpamService(store);
  const templateService = new DeviceTemplateService(store);

  // ============================================================
  // DEVICES - List and Get
  // ============================================================

  app.get('/v1/device-management/devices', async (request, reply) => {
    const query = z.object({
      branchId: z.string().min(1).optional(),
      deviceType: z.string().optional(),
      status: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).default(50),
      offset: z.coerce.number().min(0).default(0),
    }).parse(request.query);

    const devices = await store.listDeviceInventory(
      request.currentUser.tenantId,
      query.branchId
    );

    return { data: devices, total: devices.length };
  });

  app.get('/v1/device-management/devices/:id', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);

    const device = await store.getDeviceInventory(params.id);

    if (!device || device.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ error: 'Device not found' });
    }

    return { data: device };
  });

  // ============================================================
  // CREDENTIAL ROTATION
  // ============================================================

  app.post('/v1/device-management/password-rotation', async (request, reply) => {
    const body = z.object({
      deviceId: z.string().min(1),
      reason: z.string().min(5),
      rotationMode: z.enum(['scheduled', 'emergency']).default('scheduled'),
    }).parse(request.body);

    // Verify device exists and user has access
    const device = await store.getDeviceInventory(body.deviceId);
    if (!device || (device.tenantId && device.tenantId !== request.currentUser.tenantId)) {
      return reply.code(404).send({ error: 'Device not found' });
    }

    // Initiate credential rotation (creates job)
    const job = await credentialService.rotateCredential({
      tenantId: request.currentUser.tenantId,
      deviceId: body.deviceId,
      reason: body.reason,
      requestedBy: request.currentUser.id,
      rotationMode: body.rotationMode,
    });

    return reply.code(202).send({
      jobId: job.id,
      status: job.status,
      message: 'Credential rotation job queued',
    });
  });

  app.get('/v1/device-management/password-rotations', async (request) => {
    return { data: await store.listPasswordRotations(request.currentUser.tenantId) };
  });

  // ============================================================
  // IP ADDRESS MANAGEMENT
  // ============================================================

  app.post('/v1/device-management/ip-assignment', async (request, reply) => {
    const body = z.object({
      deviceId: z.string().min(1),
      branchId: z.string().min(1),
      ipAddress: z.string().ip(),
      subnet: z.string(), // CIDR notation
      reservationType: z.enum(['static', 'dhcp-reservation']).default('static'),
    }).parse(request.body);

    const device = await store.getDeviceInventory(body.deviceId);
    if (!device || (device.tenantId && device.tenantId !== request.currentUser.tenantId)) {
      return reply.code(404).send({ error: 'Device not found' });
    }

    try {
      const job = await ipamService.assignIpAddress({
        tenantId: request.currentUser.tenantId,
        branchId: body.branchId,
        deviceId: body.deviceId,
        ipAddress: body.ipAddress,
        subnet: body.subnet,
        reservationType: body.reservationType,
        assignedBy: request.currentUser.id,
      });

      return reply.code(202).send({
        jobId: job.id,
        status: job.status,
        message: 'IP assignment job queued',
      });
    } catch (error: any) {
      return reply.code(400).send({
        error: 'IP assignment failed',
        message: error.message,
      });
    }
  });

  app.get('/v1/device-management/ip-conflicts', async (request, reply) => {
    const query = z.object({
      branchId: z.string().min(1).optional(),
    }).parse(request.query);

    if (query.branchId) {
      const conflicts = await ipamService.detectConflicts(query.branchId);
      return { data: conflicts };
    }

    return { data: await store.getIpConflicts(request.currentUser.tenantId) };
  });

  app.get('/v1/device-management/branch-network/:branchId', async (request, reply) => {
    const params = z.object({ branchId: z.string().min(1) }).parse(request.params);

    const network = await store.getBranchNetwork(params.branchId);

    if (!network) {
      return reply.code(404).send({ error: 'Branch network not found' });
    }

    return { data: network };
  });

  // ============================================================
  // TEMPLATES
  // ============================================================

  app.get('/v1/device-management/templates', async (request, reply) => {
    const query = z.object({
      status: z.enum(['draft', 'published', 'deprecated']).optional(),
      templateType: z.enum([
        'camera-configuration',
        'recording',
        'analytics',
        'privacy',
        'network',
        'security-hardening',
        'location',
      ]).optional(),
    }).parse(request.query);

    const templates = await templateService.listTemplates(
      request.currentUser.tenantId,
      query
    );

    return { data: templates };
  });

  app.post('/v1/device-management/templates', async (request, reply) => {
    const body = z.object({
      name: z.string().min(1),
      templateType: z.enum([
        'camera-configuration',
        'recording',
        'analytics',
        'privacy',
        'network',
        'security-hardening',
        'location',
      ]),
      category: z.string().min(1),
      settings: z.record(z.unknown()),
    }).parse(request.body);

    const template = await templateService.createTemplate({
      tenantId: request.currentUser.tenantId,
      name: body.name,
      templateType: body.templateType,
      category: body.category,
      settings: body.settings,
      createdBy: request.currentUser.id,
    });

    return reply.code(201).send(template);
  });

  app.post('/v1/device-management/templates/:id/publish', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);

    const template = await templateService.publishTemplate(
      params.id,
      request.currentUser.tenantId,
      request.currentUser.id
    );

    return { data: template };
  });

  app.post('/v1/device-management/templates/:id/apply', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({ deviceId: z.string().min(1) }).parse(request.body);

    const device = await store.getDeviceInventory(body.deviceId);
    if (!device || (device.tenantId && device.tenantId !== request.currentUser.tenantId)) {
      return reply.code(404).send({ error: 'Device not found' });
    }

    const job = await templateService.applyTemplate({
      tenantId: request.currentUser.tenantId,
      deviceId: body.deviceId,
      templateId: params.id,
      appliedBy: request.currentUser.id,
    });

    return reply.code(202).send({
      jobId: job.id,
      status: job.status,
      message: 'Template application job queued',
    });
  });

  app.get('/v1/device-management/templates/:id/devices', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);

    const assignments = await templateService.listDevicesWithTemplate(params.id);

    return { data: assignments };
  });

  // ============================================================
  // CONFIGURATION DRIFT
  // ============================================================

  app.get('/v1/device-management/devices/:deviceId/drift', async (request, reply) => {
    const params = z.object({ deviceId: z.string().min(1) }).parse(request.params);
    const query = z.object({
      templateId: z.string().min(1).optional(),
    }).parse(request.query);

    const device = await store.getDeviceInventory(params.deviceId);
    if (!device || (device.tenantId && device.tenantId !== request.currentUser.tenantId)) {
      return reply.code(404).send({ error: 'Device not found' });
    }

    if (query.templateId) {
      const drift = await templateService.detectDrift(params.deviceId, query.templateId);
      return { data: drift };
    }

    const drifts = await templateService.getDeviceDrift(params.deviceId);
    return { data: drifts };
  });

  // ============================================================
  // JOBS - Monitor and Status
  // ============================================================

  app.get('/v1/device-management/jobs', async (request, reply) => {
    const query = z.object({
      deviceId: z.string().min(1).optional(),
      status: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).default(50),
    }).parse(request.query);

    const jobs = await store.listDeviceConfigurationJobs(
      request.currentUser.tenantId,
      query
    );

    return { data: jobs || [] };
  });

  app.get('/v1/device-management/jobs/:id', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);

    const job = await store.getDeviceConfigurationJob(params.id);

    if (!job || (job.tenantId && job.tenantId !== request.currentUser.tenantId)) {
      return reply.code(404).send({ error: 'Job not found' });
    }

    const steps = await store.listDeviceJobSteps(params.id);

    return {
      data: {
        ...job,
        steps: steps || [],
      },
    };
  });

  app.get('/v1/device-management/jobs/:id/steps', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);

    const job = await store.getDeviceConfigurationJob(params.id);

    if (!job || (job.tenantId && job.tenantId !== request.currentUser.tenantId)) {
      return reply.code(404).send({ error: 'Job not found' });
    }

    const steps = await store.listDeviceJobSteps(params.id);

    return { data: steps || [] };
  });
}
