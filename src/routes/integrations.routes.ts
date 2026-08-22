/**
 * Database-backed integration control plane. No process-local fallback is
 * permitted: operational endpoints return 503 without a persistent store.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Pool } from 'pg';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { IntegrationManager } from '../integrations/integration-manager.js';
import { getConnectorMetadata, registerAllConnectors } from '../integrations/connectors/index.js';
import type { IntegrationCategory, IntegrationEventType, IntegrationType } from '../integrations/types.js';

const retrySchema = z.object({
  maxRetries: z.number().int().min(0).max(10),
  retryDelayMs: z.number().int().min(100).max(300_000),
  backoffMultiplier: z.number().min(1).max(10),
});
const rateLimitSchema = z.object({
  maxRequestsPerMinute: z.number().int().min(1),
  burstSize: z.number().int().min(1),
});
const createSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().min(1).max(100),
  category: z.string().min(1).max(100),
  config: z.record(z.unknown()),
  credentials: z.record(z.unknown()),
  subscribedEvents: z.array(z.string().min(1)).default([]),
  enabled: z.boolean().default(false),
  retryConfig: retrySchema.optional(),
  rateLimitConfig: rateLimitSchema.optional(),
});
const updateSchema = createSchema.omit({ type: true, category: true }).partial();
const eventSchema = z.object({
  eventType: z.string().min(1).max(100),
  payload: z.record(z.unknown()),
  cameraId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  alertId: z.string().uuid().optional(),
  incidentId: z.string().uuid().optional(),
  sourceSystem: z.string().min(1).max(100).default('sentinel-api'),
  sourceIp: z.string().ip().optional(),
});

function authenticate(request: FastifyRequest, reply: FastifyReply) {
  if (!request.currentUser) {
    reply.code(401).send({ error: 'authentication_required' });
    return null;
  }
  return request.currentUser;
}

function requireManager(manager: IntegrationManager | null, reply: FastifyReply) {
  if (!manager) {
    reply.code(503).send({ error: 'persistent_integration_store_unavailable' });
    return null;
  }
  return manager;
}

function sanitize<T extends { credentials?: Record<string, unknown> }>(integration: T) {
  return {
    ...integration,
    credentials: Object.fromEntries(
      Object.entries(integration.credentials ?? {}).map(([key, value]) => [
        key,
        key.toLowerCase().includes('ref') ? value : '***REDACTED***',
      ]),
    ),
  };
}

async function ownedIntegration(manager: IntegrationManager, id: string, tenantId: string) {
  const integration = await manager.getIntegration(id);
  return integration?.tenantId === tenantId ? integration : null;
}

export async function registerIntegrationRoutes(app: FastifyInstance, store: ControlPlaneStore) {
  registerAllConnectors();
  const pool = ((store as any).db ?? (store as any).pool) as Pool | undefined;
  const manager = pool && typeof pool.query === 'function' ? new IntegrationManager(pool) : null;

  if (manager) {
    try {
      await manager.initializeAllIntegrations();
    } catch (error) {
      app.log.error({ error }, 'failed to initialize persisted integrations');
    }
  }

  for (const path of ['/v1/integrations/connectors', '/v1/integrations/catalog']) {
    app.get(path, async (request, reply) => {
      if (!authenticate(request, reply)) return;
      const data = getConnectorMetadata();
      return { data, total: data.length };
    });
  }

  app.get('/v1/integrations', async (request, reply) => {
    const user = authenticate(request, reply);
    const service = requireManager(manager, reply);
    if (!user || !service) return;
    const query = z.object({
      type: z.string().optional(),
      category: z.string().optional(),
      enabled: z.enum(['true', 'false']).optional(),
    }).parse(request.query);
    const data = await service.listIntegrations(user.tenantId, {
      ...(query.type ? { type: query.type as IntegrationType } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.enabled ? { enabled: query.enabled === 'true' } : {}),
    });
    return { data: data.map(sanitize), total: data.length };
  });

  app.get('/v1/integrations/metrics', async (request, reply) => {
    const user = authenticate(request, reply);
    const service = requireManager(manager, reply);
    if (!user || !service) return;
    const data = await service.listIntegrations(user.tenantId);
    return {
      configured: data.length,
      healthy: data.filter((item) => item.enabled && item.status === 'active').length,
      needsAttention: data.filter((item) =>
        item.status === 'error' || item.status === 'failed' || item.status === 'degraded'
      ).length,
      queuedDeliveries: null,
      queueTelemetryAvailable: false,
      timestamp: new Date().toISOString(),
    };
  });

  app.get<{ Params: { id: string } }>('/v1/integrations/:id', async (request, reply) => {
    const user = authenticate(request, reply);
    const service = requireManager(manager, reply);
    if (!user || !service) return;
    const integration = await ownedIntegration(service, request.params.id, user.tenantId);
    if (!integration) return reply.code(404).send({ error: 'integration_not_found' });
    return sanitize(integration);
  });

  app.post('/v1/integrations', async (request, reply) => {
    const user = authenticate(request, reply);
    const service = requireManager(manager, reply);
    if (!user || !service) return;
    const body = createSchema.parse(request.body);
    try {
      const created = await service.createIntegration({
        tenantId: user.tenantId,
        name: body.name,
        type: body.type as IntegrationType,
        category: body.category as IntegrationCategory,
        status: body.enabled ? 'active' : 'inactive',
        enabled: body.enabled,
        config: body.config,
        credentials: body.credentials,
        subscribedEvents: body.subscribedEvents as IntegrationEventType[],
        ...(body.retryConfig ? { retryConfig: body.retryConfig } : {}),
        ...(body.rateLimitConfig ? { rateLimitConfig: body.rateLimitConfig } : {}),
      });
      return reply.code(201).send(sanitize(created));
    } catch (error) {
      return reply.code(400).send({
        error: 'integration_create_failed',
        message: error instanceof Error ? error.message : 'Unknown integration error',
      });
    }
  });

  app.put<{ Params: { id: string } }>('/v1/integrations/:id', async (request, reply) => {
    const user = authenticate(request, reply);
    const service = requireManager(manager, reply);
    if (!user || !service) return;
    const current = await ownedIntegration(service, request.params.id, user.tenantId);
    if (!current) return reply.code(404).send({ error: 'integration_not_found' });
    const body = updateSchema.parse(request.body);
    const updated = await service.updateIntegration(current.id, {
      ...body,
      subscribedEvents: body.subscribedEvents as IntegrationEventType[] | undefined,
      status: body.enabled === undefined ? current.status : body.enabled ? 'active' : 'inactive',
    });
    return sanitize(updated);
  });

  app.delete<{ Params: { id: string } }>('/v1/integrations/:id', async (request, reply) => {
    const user = authenticate(request, reply);
    const service = requireManager(manager, reply);
    if (!user || !service) return;
    const current = await ownedIntegration(service, request.params.id, user.tenantId);
    if (!current) return reply.code(404).send({ error: 'integration_not_found' });
    await service.deleteIntegration(current.id);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>('/v1/integrations/:id/test', async (request, reply) => {
    const user = authenticate(request, reply);
    const service = requireManager(manager, reply);
    if (!user || !service) return;
    const current = await ownedIntegration(service, request.params.id, user.tenantId);
    if (!current) return reply.code(404).send({ error: 'integration_not_found' });
    const result = await service.testIntegration(current.id);
    return reply.code(result.success ? 200 : 502).send(result);
  });

  app.post<{ Params: { id: string; action: string } }>(
    '/v1/integrations/:id/:action',
    async (request, reply) => {
      const user = authenticate(request, reply);
      const service = requireManager(manager, reply);
      if (!user || !service) return;
      const current = await ownedIntegration(service, request.params.id, user.tenantId);
      if (!current) return reply.code(404).send({ error: 'integration_not_found' });
      if (request.params.action !== 'enable' && request.params.action !== 'disable') {
        return reply.code(400).send({ error: 'invalid_action' });
      }
      const enabled = request.params.action === 'enable';
      const updated = await service.updateIntegration(current.id, {
        enabled,
        status: enabled ? 'active' : 'inactive',
      });
      return { success: true, data: sanitize(updated) };
    },
  );

  app.get('/v1/integrations/health', async (request, reply) => {
    const user = authenticate(request, reply);
    const service = requireManager(manager, reply);
    if (!user || !service) return;
    const integrations = await service.listIntegrations(user.tenantId);
    const data = integrations.map((item) => ({
      id: item.id,
      name: item.name,
      connectorType: item.type,
      status: item.status,
      enabled: item.enabled,
      lastSuccessAt: item.lastSuccessAt,
      lastErrorAt: item.lastErrorAt,
      lastError: item.lastError,
    }));
    return { data, total: data.length };
  });

  app.get('/v1/integrations/queues', async (request, reply) => {
    if (!authenticate(request, reply)) return;
    return reply.code(501).send({ error: 'persistent_delivery_queue_observability_not_configured' });
  });
  app.get('/v1/integrations/deliveries', async (request, reply) => {
    if (!authenticate(request, reply)) return;
    return reply.code(501).send({ error: 'integration_delivery_history_api_not_configured' });
  });
  app.get<{ Params: { id: string } }>('/v1/integrations/:id/events', async (request, reply) => {
    if (!authenticate(request, reply)) return;
    return reply.code(501).send({ error: 'integration_delivery_history_api_not_configured' });
  });
  app.post<{ Params: { id: string; deliveryId: string } }>(
    '/v1/integrations/:id/retry/:deliveryId',
    async (request, reply) => {
      if (!authenticate(request, reply)) return;
      return reply.code(501).send({ error: 'persistent_delivery_retry_not_configured' });
    },
  );

  app.post('/v1/integrations/events', async (request, reply) => {
    const user = authenticate(request, reply);
    const service = requireManager(manager, reply);
    if (!user || !service) return;
    const body = eventSchema.parse(request.body);
    await service.publishEvent({
      tenantId: user.tenantId,
      eventType: body.eventType as IntegrationEventType,
      payload: body.payload,
      userId: user.id,
      ...(body.cameraId ? { cameraId: body.cameraId } : {}),
      ...(body.branchId ? { branchId: body.branchId } : {}),
      ...(body.alertId ? { alertId: body.alertId } : {}),
      ...(body.incidentId ? { incidentId: body.incidentId } : {}),
      sourceSystem: body.sourceSystem,
      sourceIp: body.sourceIp ?? request.ip,
    });
    return reply.send({ success: true, status: 'processed' });
  });
}
