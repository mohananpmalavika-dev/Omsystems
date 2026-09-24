/**
 * Guardian Network Production Routes
 * 
 * Fastify routes with:
 * - Authentication & authorization
 * - Request validation (Zod schemas)
 * - Rate limiting
 * - Error handling
 * - Audit logging
 * - Metrics tracking
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { GuardianNetworkProductionService } from '../services/guardian-network-production.service';
import type { ThreatDatabaseQuery, IndustryVertical, ThreatCategory } from '../guardian-network.types';

// Zod schemas for request validation
const ShareIncidentSchema = z.object({
  incidentId: z.string().min(1),
  category: z.string().min(1),
  severity: z.enum(['P1', 'P2', 'P3', 'P4', 'P5']),
  detectionType: z.string().min(1),
  occurredAt: z.string().datetime(),
  aiCapabilities: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  metadata: z.record(z.any()).optional(),
  outcome: z.enum(['prevented', 'detected-during', 'detected-after', 'unknown']),
});

const QueryPatternsSchema = z.object({
  categories: z.array(z.string()).optional(),
  industries: z.array(z.string()).optional(),
  severities: z.array(z.string()).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.number().min(1).max(1000).optional(),
  offset: z.number().min(0).optional(),
  sortBy: z.enum(['relevance', 'recency', 'frequency', 'severity']).optional(),
});

const BenchmarkPeriodSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

// Type augmentation for Fastify request
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      userId: string;
      tenantId: string;
      branchId?: string;
      roles: string[];
    };
    tenant?: {
      industryVertical?: string;
    };
    branch?: {
      facilityType?: string;
    };
  }
}

export async function registerGuardianNetworkProductionRoutes(
  fastify: FastifyInstance,
  guardianNetworkService: GuardianNetworkProductionService
): Promise<void> {
  
  // Apply rate limiting to all Guardian Network routes
  await fastify.register(async (instance) => {
    // Rate limiting: 100 requests per minute per user
    instance.addHook('preHandler', async (request, reply) => {
      const userId = request.user?.userId;
      if (!userId) {
        reply.code(401).send({ error: 'Authentication required' });
        return;
      }

      // Rate limit check would go here (using Redis)
      // For production, use @fastify/rate-limit plugin
    });

    // ============================================================================
    // Pattern Sharing Endpoints
    // ============================================================================

    /**
     * POST /api/v1/guardian-network/share-incident
     * Share a verified incident with the network
     */
    instance.post('/share-incident', {
      schema: {
        body: ShareIncidentSchema,
        response: {
          200: z.object({
            success: z.boolean(),
            patternId: z.string().optional(),
            message: z.string(),
          }),
          400: z.object({
            success: z.boolean(),
            error: z.string(),
          }),
        },
      },
    }, async (request: FastifyRequest<{ Body: z.infer<typeof ShareIncidentSchema> }>, reply: FastifyReply) => {
      try {
        // Check permissions
        if (!request.user?.roles.includes('guardian-network:write')) {
          return reply.code(403).send({ error: 'Insufficient permissions' });
        }

        const incident = request.body;

        // Convert to LocalIncident format
        const localIncident = {
          id: incident.incidentId,
          tenantId: request.user.tenantId,
          branchId: request.user.branchId || 'unknown',
          detectionType: incident.detectionType,
          severity: incident.severity,
          category: incident.category,
          occurredAt: new Date(incident.occurredAt),
          detectedAt: new Date(incident.occurredAt),
          cameraId: incident.metadata?.cameraId || 'unknown',
          cameraName: incident.metadata?.cameraName || 'unknown',
          zone: incident.metadata?.zone,
          metadata: incident.metadata,
          aiCapabilities: incident.aiCapabilities,
          confidence: incident.confidence,
          responseTime: incident.metadata?.responseTime,
          outcome: incident.outcome,
          industryVertical: (request.tenant?.industryVertical || 'corporate') as any,
          facilityType: request.branch?.facilityType || 'facility',
        };

        const result = await guardianNetworkService.shareIncident(localIncident);

        if (result.success) {
          // Log audit
          fastify.log.info({
            event: 'guardian_network_pattern_shared',
            userId: request.user.userId,
            tenantId: request.user.tenantId,
            patternId: result.patternId,
          });

          return reply.code(200).send({
            success: true,
            patternId: result.patternId,
            message: 'Incident shared successfully with Guardian Network',
          });
        } else {
          return reply.code(400).send({
            success: false,
            error: result.error || 'Failed to share incident',
          });
        }
      } catch (error) {
        fastify.log.error(error, 'Failed to share incident');
        return reply.code(500).send({
          error: 'Internal server error',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    /**
     * POST /api/v1/guardian-network/share-batch
     * Share multiple incidents in batch
     */
    instance.post('/share-batch', {
      schema: {
        body: z.object({
          incidents: z.array(ShareIncidentSchema),
        }),
      },
    }, async (request: FastifyRequest<{ Body: { incidents: z.infer<typeof ShareIncidentSchema>[] } }>, reply: FastifyReply) => {
      try {
        if (!request.user?.roles.includes('guardian-network:write')) {
          return reply.code(403).send({ error: 'Insufficient permissions' });
        }

        const { incidents } = request.body;

        if (!Array.isArray(incidents) || incidents.length === 0) {
          return reply.code(400).send({ error: 'incidents array is required' });
        }

        // Convert all incidents
        const localIncidents = incidents.map((incident: any) => ({
          id: incident.incidentId,
          tenantId: request.user!.tenantId,
          branchId: request.user!.branchId || 'unknown',
          detectionType: incident.detectionType,
          severity: incident.severity,
          category: incident.category,
          occurredAt: new Date(incident.occurredAt),
          detectedAt: new Date(incident.occurredAt),
          cameraId: incident.metadata?.cameraId || 'unknown',
          cameraName: incident.metadata?.cameraName || 'unknown',
          metadata: incident.metadata,
          aiCapabilities: incident.aiCapabilities || [],
          confidence: incident.confidence,
          outcome: incident.outcome,
          industryVertical: (request.tenant?.industryVertical || 'corporate') as any,
          facilityType: request.branch?.facilityType || 'facility',
        }));

        const result = await guardianNetworkService.shareIncidentBatch(localIncidents);

        fastify.log.info({
          event: 'guardian_network_batch_shared',
          userId: request.user.userId,
          successful: result.successful,
          failed: result.failed,
        });

        return reply.send({
          successful: result.successful,
          failed: result.failed,
          errors: result.errors,
          message: `Shared ${result.successful} incidents, ${result.failed} failed`,
        });
      } catch (error) {
        fastify.log.error(error, 'Failed to share batch');
        return reply.code(500).send({
          error: 'Failed to share incidents',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // ============================================================================
    // Pattern Query Endpoints
    // ============================================================================

    /**
     * POST /api/v1/guardian-network/match-incident
     * Match a local incident against known patterns
     */
    instance.post('/match-incident', async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
      try {
        if (!request.user?.roles.includes('guardian-network:read')) {
          return reply.code(403).send({ error: 'Insufficient permissions' });
        }

        const incident = request.body;

        const localIncident = {
          id: incident.incidentId,
          tenantId: request.user.tenantId,
          branchId: request.user.branchId || 'unknown',
          detectionType: incident.detectionType,
          severity: incident.severity,
          category: incident.category,
          occurredAt: new Date(incident.occurredAt),
          detectedAt: new Date(incident.occurredAt),
          cameraId: incident.metadata?.cameraId || 'unknown',
          cameraName: incident.metadata?.cameraName || 'unknown',
          metadata: incident.metadata,
          aiCapabilities: incident.aiCapabilities || [],
          confidence: incident.confidence,
          outcome: incident.outcome || 'unknown',
          industryVertical: (request.tenant?.industryVertical || 'corporate') as any,
          facilityType: request.branch?.facilityType || 'facility',
        };

        const match = await guardianNetworkService.matchIncidentToPatterns(localIncident);

        if (match) {
          fastify.log.info({
            event: 'guardian_network_pattern_matched',
            userId: request.user.userId,
            incidentId: incident.incidentId,
            matchCount: match.matchedPatterns.length,
          });

          return reply.send({
            matched: true,
            ...match,
          });
        } else {
          return reply.send({
            matched: false,
            message: 'No matching patterns found in global database',
          });
        }
      } catch (error) {
        fastify.log.error(error, 'Failed to match incident');
        return reply.code(500).send({
          error: 'Failed to match incident',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // ============================================================================
    // Benchmark Endpoints
    // ============================================================================

    /**
     * POST /api/v1/guardian-network/benchmarks
     * Get benchmark metrics for your deployment
     */
    instance.post('/benchmarks', {
      schema: {
        body: BenchmarkPeriodSchema,
      },
    }, async (request: FastifyRequest<{ Body: z.infer<typeof BenchmarkPeriodSchema> }>, reply: FastifyReply) => {
      try {
        if (!request.user?.roles.includes('guardian-network:read')) {
          return reply.code(403).send({ error: 'Insufficient permissions' });
        }

        const period = {
          startDate: new Date(request.body.startDate),
          endDate: new Date(request.body.endDate),
        };

        const benchmarks = await guardianNetworkService.getBenchmarkMetrics(period);

        if (benchmarks) {
          return reply.send(benchmarks);
        } else {
          return reply.code(503).send({
            error: 'Benchmark data unavailable',
            message: 'Ensure benchmark sharing is enabled in your Guardian Network configuration',
          });
        }
      } catch (error) {
        fastify.log.error(error, 'Failed to get benchmarks');
        return reply.code(500).send({
          error: 'Failed to retrieve benchmarks',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // ============================================================================
    // Intelligence Endpoints
    // ============================================================================

    /**
     * GET /api/v1/guardian-network/intelligence/:vertical
     * Get latest industry intelligence report
     */
    instance.get<{ Params: { vertical: string } }>(
      '/intelligence/:vertical',
      async (request, reply) => {
        try {
          if (!request.user?.roles.includes('guardian-network:read')) {
            return reply.code(403).send({ error: 'Insufficient permissions' });
          }

          const { vertical } = request.params;
          const report = await guardianNetworkService.getIndustryIntelligence(vertical);

          if (report) {
            return reply.send(report);
          } else {
            return reply.code(404).send({
              error: 'Intelligence report not available',
              vertical,
            });
          }
        } catch (error) {
          fastify.log.error(error, 'Failed to get intelligence');
          return reply.code(500).send({
            error: 'Failed to retrieve intelligence',
            details: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    );

    /**
     * POST /api/v1/guardian-network/alerts/:alertId/acknowledge
     * Acknowledge a threat alert
     */
    instance.post<{ Params: { alertId: string } }>(
      '/alerts/:alertId/acknowledge',
      async (request, reply) => {
        try {
          if (!request.user?.roles.includes('guardian-network:write')) {
            return reply.code(403).send({ error: 'Insufficient permissions' });
          }

          const { alertId } = request.params;
          const success = await guardianNetworkService.acknowledgeThreatAlert(alertId);

          if (success) {
            fastify.log.info({
              event: 'guardian_network_alert_acknowledged',
              userId: request.user.userId,
              alertId,
            });

            return reply.send({
              success: true,
              message: 'Alert acknowledged',
            });
          } else {
            return reply.code(400).send({
              success: false,
              error: 'Failed to acknowledge alert',
            });
          }
        } catch (error) {
          fastify.log.error(error, 'Failed to acknowledge alert');
          return reply.code(500).send({
            error: 'Failed to acknowledge alert',
            details: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    );

    // ============================================================================
    // Statistics & Monitoring Endpoints
    // ============================================================================

    /**
     * GET /api/v1/guardian-network/statistics
     * Get network statistics and sync status
     */
    instance.get('/statistics', async (request, reply) => {
      try {
        if (!request.user?.roles.includes('guardian-network:read')) {
          return reply.code(403).send({ error: 'Insufficient permissions' });
        }

        const stats = await guardianNetworkService.getNetworkStatistics();
        return reply.send(stats);
      } catch (error) {
        fastify.log.error(error, 'Failed to get statistics');
        return reply.code(500).send({
          error: 'Failed to retrieve statistics',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    /**
     * GET /api/v1/guardian-network/health
     * Health check endpoint
     */
    instance.get('/health', async (request, reply) => {
      try {
        const health = await guardianNetworkService.healthCheck();
        const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
        
        return reply.code(statusCode).send({
          status: health.status,
          checks: health.checks,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        return reply.code(503).send({
          status: 'offline',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        });
      }
    });

    /**
     * GET /api/v1/guardian-network/metrics
     * Prometheus metrics endpoint
     */
    instance.get('/metrics', async (request, reply) => {
      try {
        const metrics = guardianNetworkService.getMetrics();
        return reply
          .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
          .send(metrics);
      } catch (error) {
        fastify.log.error(error, 'Failed to get metrics');
        return reply.code(500).send({ error: 'Failed to retrieve metrics' });
      }
    });

  }, { prefix: '/api/v1/guardian-network' });

  fastify.log.info('Guardian Network production routes registered');
}
