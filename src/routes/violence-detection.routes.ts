/**
 * Fastify Routes for Physical Violence & Fight Detection
 * 
 * Production endpoints for real-time video altercation detection,
 * incident history, operator review, and per-camera threshold configuration.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { ViolenceDetectionService } from '../analytics/violence/violence-service.js';

export async function registerViolenceDetectionRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  const pool = (store as any).pool || (store as any).db;

  if (!pool) {
    app.log.warn('[ViolenceDetectionRoutes] No PostgreSQL pool available on store; violence detection routes disabled');
    return;
  }

  const violenceService = new ViolenceDetectionService(pool, store);

  const getTenantId = (req: FastifyRequest): string => {
    const user = (req as any).user;
    return user?.tenantId || (req.headers['x-tenant-id'] as string) || '00000000-0000-4000-8000-000000000000';
  };

  const getUserId = (req: FastifyRequest): string => {
    const user = (req as any).user;
    return user?.id || (req.headers['x-user-id'] as string) || '00000000-0000-4000-8000-000000000001';
  };

  // 1. Query Historical Violence Events
  const listQuerySchema = z.object({
    cameraId: z.string().uuid().optional(),
    severity: z.enum(['P1', 'P2', 'P3']).optional(),
    reviewStatus: z.enum(['pending', 'confirmed', 'false_positive', 'escalated']).optional(),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  });

  app.get('/v1/analytics/violence/events', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = listQuerySchema.parse(request.query);

      const result = await violenceService.listEvents({
        tenantId,
        cameraId: query.cameraId,
        severity: query.severity,
        reviewStatus: query.reviewStatus,
        fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
        toDate: query.toDate ? new Date(query.toDate) : undefined,
        limit: query.limit,
        offset: query.offset,
      });

      return reply.send({
        success: true,
        data: result.events,
        pagination: {
          total: result.total,
          limit: query.limit,
          offset: query.offset,
        },
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to list violence events');
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // 2. Get Single Event Details
  app.get('/v1/analytics/violence/events/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const event = await violenceService.getEventById(request.params.id, tenantId);

      if (!event) {
        return reply.code(404).send({ success: false, error: 'Violence event not found' });
      }

      return reply.send({ success: true, data: event });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // 3. Operator Review Action
  const reviewBodySchema = z.object({
    reviewStatus: z.enum(['confirmed', 'false_positive', 'escalated']),
    reviewNotes: z.string().max(1000).optional(),
  });

  app.post('/v1/analytics/violence/events/:id/review', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const userId = getUserId(request);
      const body = reviewBodySchema.parse(request.body);

      const updated = await violenceService.reviewEvent(
        request.params.id,
        tenantId,
        body.reviewStatus,
        userId,
        body.reviewNotes
      );

      if (!updated) {
        return reply.code(404).send({ success: false, error: 'Violence event not found' });
      }

      return reply.send({ success: true, data: updated });
    } catch (error) {
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Review action failed',
      });
    }
  });

  // 4. Programmatic Frame Analysis Endpoint
  const analyzeBodySchema = z.object({
    cameraId: z.string(),
    timestamp: z.number().int().positive().default(() => Date.now()),
    activeTracks: z.array(
      z.object({
        trackId: z.string(),
        observations: z.array(
          z.object({
            timestamp: z.number(),
            boundingBox: z.object({
              x: z.number(),
              y: z.number(),
              width: z.number(),
              height: z.number(),
            }),
            keypoints: z
              .object({
                leftWrist: z.object({ x: z.number(), y: z.number(), confidence: z.number().optional() }).optional(),
                rightWrist: z.object({ x: z.number(), y: z.number(), confidence: z.number().optional() }).optional(),
                leftElbow: z.object({ x: z.number(), y: z.number(), confidence: z.number().optional() }).optional(),
                rightElbow: z.object({ x: z.number(), y: z.number(), confidence: z.number().optional() }).optional(),
                leftShoulder: z.object({ x: z.number(), y: z.number(), confidence: z.number().optional() }).optional(),
                rightShoulder: z.object({ x: z.number(), y: z.number(), confidence: z.number().optional() }).optional(),
                leftAnkle: z.object({ x: z.number(), y: z.number(), confidence: z.number().optional() }).optional(),
                rightAnkle: z.object({ x: z.number(), y: z.number(), confidence: z.number().optional() }).optional(),
              })
              .optional(),
          })
        ),
      })
    ),
    snapshotReference: z.string().optional(),
  });

  app.post('/v1/analytics/violence/analyze', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = analyzeBodySchema.parse(request.body);

      const { result, event } = await violenceService.processAnalysis(
        {
          cameraId: body.cameraId,
          tenantId,
          timestamp: body.timestamp,
          activeTracks: body.activeTracks,
        },
        { snapshotReference: body.snapshotReference }
      );

      return reply.send({
        success: true,
        data: {
          result,
          savedEventId: event ? event.id : null,
        },
      });
    } catch (error) {
      request.log.error({ error }, 'Violence analysis execution failed');
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Analysis failed',
      });
    }
  });

  // 5. Get Camera Configuration
  app.get('/v1/analytics/violence/config/:cameraId', async (request: FastifyRequest<{ Params: { cameraId: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const config = await violenceService.getCameraConfig(request.params.cameraId, tenantId);

      return reply.send({
        success: true,
        data: config || {
          cameraId: request.params.cameraId,
          tenantId,
          enabled: true,
          sensitivity: 0.7,
          minConfidence: 0.65,
          minOpticalFlowEnergy: 25.0,
          minLimbAcceleration: 30.0,
          minDurationMs: 500,
          cooldownSeconds: 15,
          alertSeverity: 'P1',
          isDefault: true,
        },
      });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get config',
      });
    }
  });

  // 6. Update Camera Configuration
  const updateConfigSchema = z.object({
    enabled: z.boolean().optional(),
    sensitivity: z.number().min(0.1).max(1.0).optional(),
    minConfidence: z.number().min(0.1).max(1.0).optional(),
    minOpticalFlowEnergy: z.number().min(0).optional(),
    minLimbAcceleration: z.number().min(0).optional(),
    minDurationMs: z.number().int().min(100).optional(),
    cooldownSeconds: z.number().int().min(1).optional(),
    alertSeverity: z.enum(['P1', 'P2', 'P3']).optional(),
  });

  app.put('/v1/analytics/violence/config/:cameraId', async (request: FastifyRequest<{ Params: { cameraId: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = updateConfigSchema.parse(request.body);

      const updated = await violenceService.updateCameraConfig(
        request.params.cameraId,
        tenantId,
        body
      );

      return reply.send({ success: true, data: updated });
    } catch (error) {
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update config',
      });
    }
  });

  // 7. Get Fleet Statistics
  app.get('/v1/analytics/violence/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const stats = await violenceService.getStats(tenantId);
      return reply.send({ success: true, data: stats });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve stats',
      });
    }
  });
}
