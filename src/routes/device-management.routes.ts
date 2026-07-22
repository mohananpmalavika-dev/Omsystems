import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';

export async function registerDeviceManagementRoutes(app: FastifyInstance, store: ControlPlaneStore) {
  app.post('/v1/device-management/password-rotation', async (request, reply) => {
    const body = z.object({
      deviceId: z.string().min(1),
      reason: z.string().min(1),
      rotationMode: z.enum(['scheduled', 'emergency']).default('scheduled'),
      newPassword: z.string().min(8),
    }).parse(request.body);

    const rotation = await store.startPasswordRotation({
      tenantId: request.currentUser.tenantId,
      deviceId: body.deviceId,
      requestedBy: request.currentUser.id,
      reason: body.reason,
      rotationMode: body.rotationMode,
      newPassword: body.newPassword,
    });

    return reply.code(201).send(rotation);
  });

  app.get('/v1/device-management/password-rotations', async (request) => {
    return { data: await store.listPasswordRotations(request.currentUser.tenantId) };
  });

  app.get('/v1/device-management/templates', async (request) => {
    return { data: [] };
  });

  app.post('/v1/device-management/templates', async (request, reply) => {
    const body = z.object({
      name: z.string().min(1),
      templateType: z.enum(['camera-configuration', 'recording', 'analytics', 'privacy', 'network', 'security-hardening', 'location']),
      category: z.string().min(1),
      settings: z.record(z.unknown()),
    }).parse(request.body);

    const template = await store.createDeviceTemplate({
      tenantId: request.currentUser.tenantId,
      name: body.name,
      templateType: body.templateType,
      category: body.category,
      settings: body.settings,
      createdBy: request.currentUser.id,
    });

    return reply.code(201).send(template);
  });

  app.post('/v1/device-management/templates/:id/apply', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({ deviceId: z.string().min(1) }).parse(request.body);

    const assignment = await store.applyDeviceTemplate({
      tenantId: request.currentUser.tenantId,
      deviceId: body.deviceId,
      templateId: params.id,
      appliedBy: request.currentUser.id,
    });

    return reply.code(201).send(assignment);
  });

  app.get('/v1/device-management/templates/:id/drift', async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const query = z.object({ deviceId: z.string().min(1) }).parse(request.query);
    return store.getDeviceTemplateDrift(query.deviceId, params.id);
  });

  app.post('/v1/device-management/ip-change', async (request, reply) => {
    const body = z.object({
      deviceId: z.string().min(1),
      ipAddress: z.string().min(1),
      subnet: z.string().min(1),
      reservationStatus: z.enum(['dhcp', 'static', 'reserved']).default('static'),
    }).parse(request.body);

    const assignment = await store.assignDeviceIpAddress({
      tenantId: request.currentUser.tenantId,
      deviceId: body.deviceId,
      ipAddress: body.ipAddress,
      subnet: body.subnet,
      assignedBy: request.currentUser.id,
      reservationStatus: body.reservationStatus,
    });

    return reply.code(201).send(assignment);
  });

  app.get('/v1/device-management/ip-conflicts', async (request) => {
    return { data: await store.getIpConflicts(request.currentUser.tenantId) };
  });
}
