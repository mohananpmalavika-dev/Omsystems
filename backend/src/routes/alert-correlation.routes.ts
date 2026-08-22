/**
 * Alert Correlation API Routes
 * Endpoints for correlation management and incident creation
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { Pool } from 'pg';
import { getAlertCorrelationOrchestrator } from '../services/alert-correlation-orchestrator.service.js';

export async function registerAlertCorrelationRoutes(
  app: FastifyInstance,
  pool: Pool
) {
  const orchestrator = getAlertCorrelationOrchestrator(pool);

  /**
   * GET /v1/correlations
   * Get active correlations
   */
  app.get<{
    Querystring: {
      severity?: string;
      regions?: string;
      limit?: string;
    };
  }>('/v1/correlations', async (request, reply) => {
    try {
      const user = (request as any).currentUser;
      if (!user) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const { severity, regions, limit } = request.query;

      const correlations = await orchestrator.getActiveCorrelations(
        user.tenant_id,
        {
          severity,
          regions: regions ? regions.split(',') : undefined,
          limit: limit ? parseInt(limit) : undefined,
        }
      );

      reply.send({
        success: true,
        data: {
          correlations,
          count: correlations.length,
        },
      });
    } catch (error) {
      app.log.error(error, 'Failed to get correlations');
      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve correlations',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /v1/correlations/:id
   * Get specific correlation
   */
  app.get<{
    Params: { id: string };
  }>('/v1/correlations/:id', async (request, reply) => {
    try {
      const user = (request as any).currentUser;
      if (!user) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const correlation = await orchestrator.getCorrelation(request.params.id);

      if (!correlation) {
        return reply.status(404).send({
          success: false,
          error: 'Correlation not found',
        });
      }

      if (correlation.tenantId !== user.tenant_id) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      reply.send({
        success: true,
        data: correlation,
      });
    } catch (error) {
      app.log.error(error, 'Failed to get correlation');
      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve correlation',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /v1/correlations/:id/acknowledge
   * Acknowledge correlation
   */
  app.post<{
    Params: { id: string };
    Body: {
      notes?: string;
    };
  }>('/v1/correlations/:id/acknowledge', async (request, reply) => {
    try {
      const user = (request as any).currentUser;
      if (!user) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const correlation = await orchestrator.getCorrelation(request.params.id);

      if (!correlation) {
        return reply.status(404).send({
          success: false,
          error: 'Correlation not found',
        });
      }

      if (correlation.tenantId !== user.tenant_id) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      await orchestrator.acknowledgeCorrelation(
        request.params.id,
        user.id,
        request.body.notes
      );

      reply.send({
        success: true,
        message: 'Correlation acknowledged',
      });
    } catch (error) {
      app.log.error(error, 'Failed to acknowledge correlation');
      reply.status(500).send({
        success: false,
        error: 'Failed to acknowledge correlation',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /v1/correlations/:id/create-incident
   * Create incident from correlation
   */
  app.post<{
    Params: { id: string };
  }>('/v1/correlations/:id/create-incident', async (request, reply) => {
    try {
      const user = (request as any).currentUser;
      if (!user) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const correlation = await orchestrator.getCorrelation(request.params.id);

      if (!correlation) {
        return reply.status(404).send({
          success: false,
          error: 'Correlation not found',
        });
      }

      if (correlation.tenantId !== user.tenant_id) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      if (correlation.incidentCreated) {
        return reply.status(400).send({
          success: false,
          error: 'Incident already created',
          incidentId: correlation.incidentId,
        });
      }

      const incidentId = await orchestrator.createIncidentFromCorrelation(correlation);

      reply.send({
        success: true,
        data: {
          incidentId,
          message: 'Incident created successfully',
        },
      });
    } catch (error) {
      app.log.error(error, 'Failed to create incident');
      reply.status(500).send({
        success: false,
        error: 'Failed to create incident',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /v1/correlations/stats
   * Get correlation statistics
   */
  app.get('/v1/correlations/stats', async (request, reply) => {
    try {
      const user = (request as any).currentUser;
      if (!user) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const localStats = orchestrator.getLocalStats();
      const activeCorrelations = await orchestrator.getActiveCorrelations(
        user.tenant_id,
        { limit: 1000 }
      );

      const globalStats = {
        total: activeCorrelations.length,
        bySeverity: {
          critical: activeCorrelations.filter(c => c.severity === 'critical').length,
          high: activeCorrelations.filter(c => c.severity === 'high').length,
          medium: activeCorrelations.filter(c => c.severity === 'medium').length,
          low: activeCorrelations.filter(c => c.severity === 'low').length,
        },
        byType: {
          temporal: activeCorrelations.filter(c => c.correlationType === 'temporal').length,
          spatial: activeCorrelations.filter(c => c.correlationType === 'spatial').length,
          entity: activeCorrelations.filter(c => c.correlationType === 'entity').length,
          pattern: activeCorrelations.filter(c => c.correlationType === 'pattern').length,
        },
        withIncidents: activeCorrelations.filter(c => c.incidentCreated).length,
        investigated: activeCorrelations.filter(c => c.investigated).length,
      };

      reply.send({
        success: true,
        data: {
          local: localStats,
          global: globalStats,
        },
      });
    } catch (error) {
      app.log.error(error, 'Failed to get correlation stats');
      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve statistics',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /v1/correlations/health
   * Health check endpoint
   */
  app.get('/v1/correlations/health', async (request, reply) => {
    try {
      const health = await orchestrator.healthCheck();

      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'degraded' ? 200 : 503;

      reply.code(statusCode).send({
        success: health.status !== 'unhealthy',
        data: health,
      });
    } catch (error) {
      app.log.error(error, 'Health check failed');
      reply.status(503).send({
        success: false,
        error: 'Health check failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  app.log.info('Alert correlation routes registered');
}
