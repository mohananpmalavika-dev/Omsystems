/**
 * Integration Management API Routes
 * 
 * Provides REST API for managing integrations, testing connections,
 * and viewing integration health.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { IntegrationManager } from '../integrations/integration-manager.js';
import { getConnectorMetadata } from '../integrations/connectors/index.js';
import type { ControlPlaneStore } from '../control-plane-store.js';

const createIntegrationSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().min(1) as z.ZodType<any>,
  category: z.string().min(1) as z.ZodType<any>,
  config: z.record(z.any()),
  credentials: z.record(z.any()),
  subscribedEvents: z.array(z.string()) as z.ZodType<any>,
  retryConfig: z.object({
    maxRetries: z.number().int().min(0).max(10),
    retryDelayMs: z.number().int().min(100),
    backoffMultiplier: z.number().min(1)
  }).optional(),
  rateLimitConfig: z.object({
    maxRequestsPerMinute: z.number().int().min(1),
    burstSize: z.number().int().min(1)
  }).optional()
});

const updateIntegrationSchema = createIntegrationSchema.partial();

const publishEventSchema = z.object({
  eventType: z.string().min(1) as z.ZodType<any>,
  payload: z.record(z.any()),
  userId: z.string().uuid().optional(),
  cameraId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  alertId: z.string().uuid().optional(),
  incidentId: z.string().uuid().optional(),
  sourceSystem: z.string().default('sentinel-api'),
  sourceIp: z.string().optional()
});

export async function registerIntegrationRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  const integrationManager = new IntegrationManager((store as any).pool);

  // Initialize all active integrations on startup
  await integrationManager.initializeAllIntegrations();

  /**
   * List available connector types (marketplace)
   */
  app.get('/v1/integrations/connectors', async (request) => {
    const metadata = getConnectorMetadata();
    
    return {
      data: metadata,
      total: metadata.length
    };
  });

  /**
   * Get specific connector details
   */
  app.get<{ Params: { type: string } }>(
    '/v1/integrations/connectors/:type',
    async (request, reply) => {
      const metadata = getConnectorMetadata();
      const connector = metadata.find(c => c.type === request.params.type);
      
      if (!connector) {
        return reply.code(404).send({ error: 'connector_not_found' });
      }
      
      return connector;
    }
  );

  /**
   * List integrations for tenant
   */
  app.get('/v1/integrations', async (request) => {
    const { type, category, enabled } = request.query as any;
    
    const integrations = await integrationManager.listIntegrations(
      request.currentUser.tenantId,
      {
        type,
        category,
        enabled: enabled ? enabled === 'true' : undefined
      }
    );
    
    // Remove sensitive credentials from response
    const sanitized = integrations.map(i => ({
      ...i,
      credentials: Object.keys(i.credentials).reduce((acc, key) => ({
        ...acc,
        [key]: '***REDACTED***'
      }), {})
    }));
    
    return {
      data: sanitized,
      total: sanitized.length
    };
  });

  /**
   * Get integration by ID
   */
  app.get<{ Params: { id: string } }>(
    '/v1/integrations/:id',
    async (request, reply) => {
      const integration = await integrationManager.getIntegration(request.params.id);
      
      if (!integration) {
        return reply.code(404).send({ error: 'integration_not_found' });
      }
      
      // Verify tenant ownership
      if (integration.tenantId !== request.currentUser.tenantId) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      
      // Remove sensitive credentials
      return {
        ...integration,
        credentials: Object.keys(integration.credentials).reduce((acc, key) => ({
          ...acc,
          [key]: '***REDACTED***'
        }), {})
      };
    }
  );

  /**
   * Create new integration
   */
  app.post('/v1/integrations', async (request) => {
    const body = createIntegrationSchema.parse(request.body);
    
    const integration = await integrationManager.createIntegration({
      ...body as any,
      tenantId: request.currentUser.tenantId,
      status: 'inactive',
      enabled: false
    });
    
    return {
      ...integration,
      credentials: Object.keys(integration.credentials).reduce((acc, key) => ({
        ...acc,
        [key]: '***REDACTED***'
      }), {})
    };
  });

  /**
   * Update integration
   */
  app.put<{ Params: { id: string } }>(
    '/v1/integrations/:id',
    async (request, reply) => {
      const body = updateIntegrationSchema.parse(request.body);
      
      // Verify ownership
      const existing = await integrationManager.getIntegration(request.params.id);
      if (!existing) {
        return reply.code(404).send({ error: 'integration_not_found' });
      }
      if (existing.tenantId !== request.currentUser.tenantId) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      
      const updated = await integrationManager.updateIntegration(
        request.params.id,
        body as any
      );
      
      return {
        ...updated,
        credentials: Object.keys(updated.credentials).reduce((acc, key) => ({
          ...acc,
          [key]: '***REDACTED***'
        }), {})
      };
    }
  );

  /**
   * Delete integration
   */
  app.delete<{ Params: { id: string } }>(
    '/v1/integrations/:id',
    async (request, reply) => {
      // Verify ownership
      const existing = await integrationManager.getIntegration(request.params.id);
      if (!existing) {
        return reply.code(404).send({ error: 'integration_not_found' });
      }
      if (existing.tenantId !== request.currentUser.tenantId) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      
      await integrationManager.deleteIntegration(request.params.id);
      
      return { success: true };
    }
  );

  /**
   * Test integration connection
   */
  app.post<{ Params: { id: string } }>(
    '/v1/integrations/:id/test',
    async (request, reply) => {
      // Verify ownership
      const existing = await integrationManager.getIntegration(request.params.id);
      if (!existing) {
        return reply.code(404).send({ error: 'integration_not_found' });
      }
      if (existing.tenantId !== request.currentUser.tenantId) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      
      const result = await integrationManager.testIntegration(request.params.id);
      
      return result;
    }
  );

  /**
   * Enable/disable integration
   */
  app.post<{ Params: { id: string; action: string } }>(
    '/v1/integrations/:id/:action',
    async (request, reply) => {
      const { action } = request.params;
      
      if (!['enable', 'disable'].includes(action)) {
        return reply.code(400).send({ error: 'invalid_action' });
      }
      
      // Verify ownership
      const existing = await integrationManager.getIntegration(request.params.id);
      if (!existing) {
        return reply.code(404).send({ error: 'integration_not_found' });
      }
      if (existing.tenantId !== request.currentUser.tenantId) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      
      const updated = await integrationManager.updateIntegration(
        request.params.id,
        {
          enabled: action === 'enable',
          status: action === 'enable' ? 'active' : 'inactive'
        }
      );
      
      return {
        ...updated,
        credentials: Object.keys(updated.credentials).reduce((acc, key) => ({
          ...acc,
          [key]: '***REDACTED***'
        }), {})
      };
    }
  );

  /**
   * Publish event to integrations (for testing or manual triggers)
   */
  app.post('/v1/integrations/events', async (request) => {
    const body = publishEventSchema.parse(request.body);
    
    await integrationManager.publishEvent({
      tenantId: request.currentUser.tenantId,
      ...body as any
    });
    
    return { success: true, message: 'Event published to subscribed integrations' };
  });

  /**
   * Get integration health metrics
   */
  app.get('/v1/integrations/health', async (request) => {
    const query = `
      SELECT * FROM vw_integration_health
      WHERE tenant_id = $1
      ORDER BY health_status DESC, name
    `;
    
    const result = await (store as any).pool.query(query, [request.currentUser.tenantId]);
    
    return {
      data: result.rows,
      total: result.rows.length
    };
  });

  /**
   * Get integration event history
   */
  app.get<{ Params: { id: string } }>(
    '/v1/integrations/:id/events',
    async (request, reply) => {
      const { limit = 100, offset = 0 } = request.query as any;
      
      // Verify ownership
      const existing = await integrationManager.getIntegration(request.params.id);
      if (!existing) {
        return reply.code(404).send({ error: 'integration_not_found' });
      }
      if (existing.tenantId !== request.currentUser.tenantId) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      
      const query = `
        SELECT 
          ie.*,
          ir.success,
          ir.external_id,
          ir.external_url,
          ir.error,
          ir.retry_count
        FROM integration_events ie
        JOIN integration_responses ir ON ir.event_id = ie.id
        WHERE ir.integration_id = $1
        ORDER BY ie.timestamp DESC
        LIMIT $2 OFFSET $3
      `;
      
      const result = await (store as any).pool.query(query, [
        request.params.id,
        limit,
        offset
      ]);
      
      return {
        data: result.rows,
        limit,
        offset,
        total: result.rows.length
      };
    }
  );
}
