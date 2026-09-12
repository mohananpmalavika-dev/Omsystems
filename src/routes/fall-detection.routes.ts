/**
 * Fastify Routes for Worker/Elderly Fall Detection
 * 
 * Production endpoints for real-time video stream fall detection,
 * historical incident auditing, operator reviews, and per-camera kinematic threshold configs.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { FallDetectionService } from '../analytics/fall/fall-service.js';

export async function registerFallDetectionRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  const pool = (store as any).pool || (store as any).db;

  if (!pool) {
    app.log.warn('[FallDetectionRoutes] No PostgreSQL pool available on store; fall detection routes disabled');
    return;
  }

  const fallService = new FallDetectionService(pool, store);

  const getTenantId = (req: FastifyRequest): string => {
    const user = (req as any).user;
    return user?.tenantId || (req.headers['x-tenant-id'] as string) || '00000000-0000-4000-8000-000000000000';
  };

  const getUserId = (req: FastifyRequest): string => {
    const user = (req as any).user;
    return user?.id || (req.headers['x-user-id'] as string) || '00000000-0000-4000-8000-000000000001';
  };

  // 1. Query Historical Fall Events
  const listQuerySchema = z.object({
    cameraId: z.string().uuid().optional(),
    personCategory: z.enum(['worker', 'elderly', 'general']).optional(),
    severity: z.enum(['P1', 'P2', 'P3']).optional(),
    reviewStatus: z.enum(['pending', 'confirmed', 'false_positive', 'escalated']).optional(),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  });

  app.get('/v1/analytics/fall/events', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = listQuerySchema.parse(request.query);

      const result = await fallService.listEvents({
        tenantId,
        cameraId: query.cameraId,
        personCategory: query.personCategory,
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
      request.log.error({ error }, 'Failed to list fall events');
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // 2. Get Single Event Details
  app.get('/v1/analytics/fall/events/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const event = await fallService.getEventById(request.params.id, tenantId);

      if (!event) {
        return reply.code(404).send({ success: false, error: 'Fall event not found' });
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

  app.post('/v1/analytics/fall/events/:id/review', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const userId = getUserId(request);
      const body = reviewBodySchema.parse(request.body);

      const updated = await fallService.reviewEvent(
        request.params.id,
        tenantId,
        body.reviewStatus,
        userId,
        body.reviewNotes
      );

      if (!updated) {
        return reply.code(404).send({ success: false, error: 'Fall event not found' });
      }

      return reply.send({ success: true, data: updated });
    } catch (error) {
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // 4. Get Camera Threshold Config
  app.get('/v1/analytics/fall/config/:cameraId', async (request: FastifyRequest<{ Params: { cameraId: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const config = await fallService.getCameraConfig(request.params.cameraId, tenantId);

      if (!config) {
        // Return default configuration
        return reply.send({
          success: true,
          data: {
            camera_id: request.params.cameraId,
            tenant_id: tenantId,
            enabled: true,
            profile: 'worker',
            sensitivity: 0.75,
            min_confidence: 0.65,
            aspect_ratio_threshold: 1.20,
            velocity_threshold: 0.150,
            torso_angle_threshold: 35.0,
            motionless_delay_seconds: 3.0,
            recovery_timeout_seconds: 15.0,
            alert_severity: 'P1',
          },
        });
      }

      return reply.send({ success: true, data: config });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // 5. Update Camera Threshold Config
  const updateConfigSchema = z.object({
    enabled: z.boolean().optional(),
    profile: z.enum(['worker', 'elderly', 'general']).optional(),
    sensitivity: z.number().min(0.1).max(1.0).optional(),
    min_confidence: z.number().min(0.1).max(1.0).optional(),
    aspect_ratio_threshold: z.number().min(0.5).max(3.0).optional(),
    velocity_threshold: z.number().min(0.01).max(2.0).optional(),
    torso_angle_threshold: z.number().min(5.0).max(80.0).optional(),
    motionless_delay_seconds: z.number().min(1.0).max(60.0).optional(),
    recovery_timeout_seconds: z.number().min(3.0).max(300.0).optional(),
    alert_severity: z.enum(['P1', 'P2', 'P3']).optional(),
  });

  app.put('/v1/analytics/fall/config/:cameraId', async (request: FastifyRequest<{ Params: { cameraId: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = updateConfigSchema.parse(request.body);

      const updated = await fallService.updateCameraConfig(request.params.cameraId, tenantId, body);
      return reply.send({ success: true, data: updated });
    } catch (error) {
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // 6. Analytics Statistics
  app.get('/v1/analytics/fall/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const stats = await fallService.getStats(tenantId);
      return reply.send({ success: true, data: stats });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // 7. Live Stream Fall Analysis Ingestion Endpoint
  const detectPayloadSchema = z.object({
    cameraId: z.string(),
    timestamp: z.number().default(() => Date.now()),
    frameWidth: z.number().optional(),
    frameHeight: z.number().optional(),
    snapshotReference: z.string().optional(),
    activeTracks: z.array(
      z.object({
        trackId: z.string(),
        category: z.enum(['worker', 'elderly', 'general']).optional(),
        observations: z.array(
          z.object({
            timestamp: z.number(),
            boundingBox: z.object({
              x: z.number(),
              y: z.number(),
              width: z.number(),
              height: z.number(),
            }),
            keypoints: z.record(
              z.object({
                x: z.number(),
                y: z.number(),
                confidence: z.number(),
                z: z.number().optional(),
              })
            ).optional(),
          })
        ),
      })
    ),
  });

  app.post('/v1/analytics/fall/detect', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = detectPayloadSchema.parse(request.body);

      const result = await fallService.processAnalysis(
        {
          cameraId: body.cameraId,
          tenantId,
          timestamp: body.timestamp,
          frameWidth: body.frameWidth,
          frameHeight: body.frameHeight,
          activeTracks: body.activeTracks as any,
        },
        { snapshotReference: body.snapshotReference }
      );

      return reply.send({
        success: true,
        data: {
          results: result.results,
          savedEvents: result.events,
        },
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to process fall detection ingestion');
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });
}
