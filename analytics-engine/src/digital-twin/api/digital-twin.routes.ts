/**
 * Digital Twin API Routes
 * 
 * REST API endpoints for Digital Twin operations.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Pool } from 'pg';
import { DigitalTwinService, SecurityPostureService } from '../services.js';

// Request schemas
const assetIdParam = z.object({
  assetId: z.string().min(1)
});

const topologyQueryParams = z.object({
  rootId: z.string().optional(),
  depth: z.number().int().positive().max(10).optional()
});

const blastRadiusQueryParams = z.object({
  assetId: z.string().min(1)
});

const failureSimulationBody = z.object({
  assetId: z.string().min(1),
  failureType: z.enum(['offline', 'degraded', 'critical']),
  duration: z.string().optional(),
  cascadeFailures: z.boolean().optional(),
  cascadeThreshold: z.number().min(0).max(1).optional()
});

const historyQueryParams = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  limit: z.number().int().positive().max(1000).optional().default(100)
});

const securityTrendQueryParams = z.object({
  days: z.number().int().positive().max(365).optional().default(30)
});

/**
 * Register Digital Twin API routes
 */
export async function registerDigitalTwinRoutes(
  app: FastifyInstance,
  pool?: Pool
): Promise<void> {
  if (!pool) {
    app.log.info('Digital Twin routes skipped: database pool not provided');
    return;
  }
  const twinService = new DigitalTwinService(pool);
  const securityService = new SecurityPostureService(pool);

  // Get enterprise root
  app.get('/api/digital-twin', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const enterprise = await twinService.getEnterprise();
      
      if (!enterprise) {
        return reply.code(404).send({
          error: 'not_found',
          message: 'Enterprise root not found'
        });
      }

      return reply.send(enterprise);
    } catch (error) {
      request.log.error({ err: error }, 'Error getting enterprise');
      return reply.code(500).send({
        error: 'internal_error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get specific asset
  app.get<{ Params: z.infer<typeof assetIdParam> }>(
    '/api/digital-twin/assets/:assetId',
    async (request, reply) => {
      try {
        const { assetId } = assetIdParam.parse(request.params);
        const asset = await twinService.getAsset(assetId);

        if (!asset) {
          return reply.code(404).send({
            error: 'not_found',
            message: `Asset ${assetId} not found`
          });
        }

        return reply.send(asset);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: 'validation_error',
            details: error.errors
          });
        }

        request.log.error({ err: error }, 'Error getting asset');
        return reply.code(500).send({
          error: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Get asset children
  app.get<{ Params: z.infer<typeof assetIdParam> }>(
    '/api/digital-twin/assets/:assetId/children',
    async (request, reply) => {
      try {
        const { assetId } = assetIdParam.parse(request.params);
        const children = await twinService.getChildren(assetId);

        return reply.send({
          assetId,
          children,
          count: children.length
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: 'validation_error',
            details: error.errors
          });
        }

        request.log.error({ err: error }, 'Error getting children');
        return reply.code(500).send({
          error: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Get asset dependencies
  app.get<{ Params: z.infer<typeof assetIdParam> }>(
    '/api/digital-twin/assets/:assetId/dependencies',
    async (request, reply) => {
      try {
        const { assetId } = assetIdParam.parse(request.params);
        const dependencies = await twinService.getAssetDependencies(assetId);

        if (!dependencies) {
          return reply.code(404).send({
            error: 'not_found',
            message: `Asset ${assetId} not found`
          });
        }

        return reply.send(dependencies);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: 'validation_error',
            details: error.errors
          });
        }

        request.log.error({ err: error }, 'Error getting dependencies');
        return reply.code(500).send({
          error: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Get asset relationships
  app.get<{ Params: z.infer<typeof assetIdParam> }>(
    '/api/digital-twin/assets/:assetId/relationships',
    async (request, reply) => {
      try {
        const { assetId } = assetIdParam.parse(request.params);
        const relationships = await twinService.getRelationships(assetId);

        return reply.send({
          assetId,
          relationships,
          count: relationships.length
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: 'validation_error',
            details: error.errors
          });
        }

        request.log.error({ err: error }, 'Error getting relationships');
        return reply.code(500).send({
          error: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Get topology graph
  app.get<{ Querystring: z.infer<typeof topologyQueryParams> }>(
    '/api/digital-twin/topology',
    async (request, reply) => {
      try {
        const params = topologyQueryParams.parse(request.query);
        const topology = await twinService.getTopology(params.rootId);

        return reply.send(topology);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: 'validation_error',
            details: error.errors
          });
        }

        request.log.error({ err: error }, 'Error getting topology');
        return reply.code(500).send({
          error: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Calculate blast radius
  app.get<{ Params: z.infer<typeof assetIdParam> }>(
    '/api/digital-twin/assets/:assetId/blast-radius',
    async (request, reply) => {
      try {
        const { assetId } = assetIdParam.parse(request.params);
        const blastRadius = await twinService.calculateBlastRadius(assetId);

        return reply.send(blastRadius);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: 'validation_error',
            details: error.errors
          });
        }

        request.log.error({ err: error }, 'Error calculating blast radius');
        return reply.code(500).send({
          error: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Simulate failure
  app.post<{ Body: z.infer<typeof failureSimulationBody> }>(
    '/api/digital-twin/simulate',
    async (request, reply) => {
      try {
        const simulation = failureSimulationBody.parse(request.body);
        // Ensure assetId is present (it's required by the schema)
        const result = await twinService.simulateFailure({
          assetId: simulation.assetId,
          failureType: simulation.failureType,
          duration: simulation.duration,
          cascadeFailures: simulation.cascadeFailures,
          cascadeThreshold: simulation.cascadeThreshold
        });

        return reply.send(result);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: 'validation_error',
            details: error.errors
          });
        }

        request.log.error({ err: error }, 'Error simulating failure');
        return reply.code(500).send({
          error: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Get asset history
  app.get<{
    Params: z.infer<typeof assetIdParam>;
    Querystring: z.infer<typeof historyQueryParams>;
  }>(
    '/api/digital-twin/assets/:assetId/history',
    async (request, reply) => {
      try {
        const { assetId } = assetIdParam.parse(request.params);
        const params = historyQueryParams.parse(request.query);

        const history = await twinService.getAssetHistory(
          assetId,
          new Date(params.from),
          new Date(params.to)
        );

        return reply.send({
          assetId,
          from: params.from,
          to: params.to,
          snapshots: history,
          count: history.length
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: 'validation_error',
            details: error.errors
          });
        }

        request.log.error({ err: error }, 'Error getting asset history');
        return reply.code(500).send({
          error: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Get recent events
  app.get('/api/digital-twin/events', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const events = await twinService.getRecentEvents(100);

      return reply.send({
        events,
        count: events.length
      });
    } catch (error) {
      request.log.error({ err: error }, 'Error getting events');
      return reply.code(500).send({
        error: 'internal_error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Refresh digital twin
  app.post('/api/digital-twin/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await twinService.refresh();

      return reply.send({
        success: true,
        result
      });
    } catch (error) {
      request.log.error({ err: error }, 'Error refreshing digital twin');
      return reply.code(500).send({
        error: 'internal_error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get security posture
  app.get<{ Params: z.infer<typeof assetIdParam> }>(
    '/api/digital-twin/security-posture/:assetId',
    async (request, reply) => {
      try {
        const { assetId } = assetIdParam.parse(request.params);
        const posture = await securityService.getSecurityPosture(assetId);

        return reply.send(posture);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: 'validation_error',
            details: error.errors
          });
        }

        request.log.error({ err: error }, 'Error getting security posture');
        return reply.code(500).send({
          error: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Get security trend
  app.get<{
    Params: z.infer<typeof assetIdParam>;
    Querystring: z.infer<typeof securityTrendQueryParams>;
  }>(
    '/api/digital-twin/security-posture/:assetId/trend',
    async (request, reply) => {
      try {
        const { assetId } = assetIdParam.parse(request.params);
        const params = securityTrendQueryParams.parse(request.query);

        const trend = await securityService.getSecurityTrend(assetId, params.days);

        return reply.send(trend);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: 'validation_error',
            details: error.errors
          });
        }

        request.log.error({ err: error }, 'Error getting security trend');
        return reply.code(500).send({
          error: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Health check for digital twin subsystem
  app.get('/api/digital-twin/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const enterprise = await twinService.getEnterprise();
      
      return reply.send({
        status: 'healthy',
        hasEnterprise: !!enterprise,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      request.log.error({ err: error }, 'Digital twin health check failed');
      return reply.code(503).send({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  console.log('[DigitalTwin] API routes registered');
}
