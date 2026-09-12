/**
 * Fastify Routes for Access Control Tailgating & Airlock Detection
 * 
 * Production endpoints for sequence correlation between badge swipe events and camera person counts,
 * real-time airlock mantrap interlock controls, incident review, and portal configuration.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { TailgatingService } from '../analytics/tailgating/tailgating-service.js';

export async function registerTailgatingDetectionRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  const pool = (store as any).pool || (store as any).db;
  const tailgatingService = new TailgatingService(pool, store);

  const getTenantId = (req: FastifyRequest): string => {
    const user = (req as any).user;
    return user?.tenantId || (req.headers['x-tenant-id'] as string) || '00000000-0000-4000-8000-000000000000';
  };

  const getUserId = (req: FastifyRequest): string => {
    const user = (req as any).user;
    return user?.id || (req.headers['x-user-id'] as string) || '00000000-0000-4000-8000-000000000001';
  };

  // 1. List Historical Tailgating Events
  const listQuerySchema = z.object({
    portalId: z.string().optional(),
    cameraId: z.string().optional(),
    severity: z.enum(['P1', 'P2', 'P3']).optional(),
    reviewStatus: z.enum(['pending', 'confirmed', 'false_positive', 'escalated']).optional(),
    violationType: z.enum([
      'piggyback_tailgating',
      'unbadged_entry',
      'denied_entry_breach',
      'multi_occupancy_violation',
      'door_held_breach',
    ]).optional(),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  });

  app.get('/v1/analytics/tailgating/events', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = listQuerySchema.parse(request.query);

      const result = await tailgatingService.listEvents({
        tenantId,
        portalId: query.portalId,
        cameraId: query.cameraId,
        severity: query.severity,
        reviewStatus: query.reviewStatus,
        violationType: query.violationType,
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
      request.log.error({ error }, 'Failed to list tailgating events');
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // 2. Get Single Event Details
  app.get('/v1/analytics/tailgating/events/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const event = await tailgatingService.getEventById(request.params.id, tenantId);

      if (!event) {
        return reply.code(404).send({ success: false, error: 'Tailgating incident not found' });
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

  app.post('/v1/analytics/tailgating/events/:id/review', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const userId = getUserId(request);
      const body = reviewBodySchema.parse(request.body);

      const updated = await tailgatingService.reviewEvent(
        request.params.id,
        tenantId,
        body.reviewStatus,
        userId,
        body.reviewNotes
      );

      if (!updated) {
        return reply.code(404).send({ success: false, error: 'Tailgating incident not found' });
      }

      return reply.send({ success: true, data: updated });
    } catch (error) {
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Review action failed',
      });
    }
  });

  // 4. Live Sequence Correlation Endpoint
  const correlateBodySchema = z.object({
    portalId: z.string(),
    badgeSwipes: z
      .array(
        z.object({
          doorId: z.string(),
          badgeId: z.string(),
          personName: z.string().optional(),
          userId: z.string().optional(),
          eventType: z.enum(['granted', 'denied', 'forced', 'held_open', 'tailgating']),
          authorizedCount: z.number().int().min(1).default(1),
          timestamp: z.number(),
          direction: z.enum(['entry', 'exit']).optional(),
        })
      )
      .optional(),
    doorEvents: z
      .array(
        z.object({
          doorId: z.string(),
          state: z.enum(['opened', 'closed', 'held_open', 'forced']),
          timestamp: z.number(),
        })
      )
      .optional(),
    cameraObservations: z
      .array(
        z.object({
          trackId: z.string(),
          timestamp: z.number(),
          confidence: z.number().default(0.9),
          boundingBox: z.object({
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number(),
          }),
        })
      )
      .optional(),
    snapshotReference: z.string().optional(),
    windowStart: z.number().optional(),
    windowEnd: z.number().optional(),
  });

  app.post('/v1/analytics/tailgating/correlate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = correlateBodySchema.parse(request.body);

      const { result, event } = await tailgatingService.correlatePortalPassage({
        tenantId,
        portalId: body.portalId,
        badgeSwipes: body.badgeSwipes,
        doorEvents: body.doorEvents,
        cameraObservations: body.cameraObservations,
        snapshotReference: body.snapshotReference,
        windowStart: body.windowStart,
        windowEnd: body.windowEnd,
      });

      return reply.send({
        success: true,
        data: {
          result,
          savedEventId: event ? event.id : null,
          interlockLockdownEngaged: result.interlockLockdownEngaged,
        },
      });
    } catch (error) {
      request.log.error({ error }, 'Airlock sequence correlation execution failed');
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Correlation analysis failed',
      });
    }
  });

  // 5. Ingest Badge Swipe Event
  const badgeSwipeBodySchema = z.object({
    portalId: z.string().optional(),
    doorId: z.string(),
    badgeId: z.string(),
    userId: z.string().optional(),
    personName: z.string().optional(),
    eventType: z.enum(['granted', 'denied', 'forced', 'held_open', 'tailgating']).default('granted'),
    authorizedCount: z.number().int().min(1).default(1),
    direction: z.enum(['entry', 'exit']).default('entry'),
    timestamp: z.union([z.number(), z.string()]).optional(),
    metadata: z.record(z.unknown()).optional(),
  });

  app.post('/v1/analytics/tailgating/badge-swipe', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = badgeSwipeBodySchema.parse(request.body);

      const record = await tailgatingService.recordBadgeSwipe(tenantId, {
        portalId: body.portalId,
        doorId: body.doorId,
        badgeId: body.badgeId,
        userId: body.userId,
        personName: body.personName,
        eventType: body.eventType,
        authorizedCount: body.authorizedCount,
        direction: body.direction,
        timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),
        metadata: body.metadata,
      });

      return reply.code(201).send({
        success: true,
        data: record,
      });
    } catch (error) {
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to ingest badge swipe',
      });
    }
  });

  // 6. List and Create Airlock Portals
  app.get('/v1/analytics/tailgating/portals', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const portals = await tailgatingService.listPortals(tenantId);
      return reply.send({ success: true, data: portals });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list portals',
      });
    }
  });

  const portalBodySchema = z.object({
    id: z.string().optional(),
    name: z.string().min(2),
    branchId: z.string().optional(),
    cameraId: z.string().optional(),
    outerDoorId: z.string().min(1),
    innerDoorId: z.string().min(1),
    chamberZone: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
    maxAllowedOccupancy: z.number().int().min(1).default(1),
    correlationWindowSeconds: z.number().int().min(2).default(10),
    interlockMode: z.enum(['strict_interlock', 'manual_release', 'warning_only']).default('strict_interlock'),
    autoLockInnerDoor: z.boolean().default(true),
    enabled: z.boolean().default(true),
    metadata: z.record(z.unknown()).optional(),
  });

  app.post('/v1/analytics/tailgating/portals', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = portalBodySchema.parse(request.body);

      const portal = await tailgatingService.upsertPortal({
        id: body.id,
        tenant_id: tenantId,
        name: body.name,
        branch_id: body.branchId,
        camera_id: body.cameraId,
        outer_door_id: body.outerDoorId,
        inner_door_id: body.innerDoorId,
        chamber_zone: body.chamberZone || [],
        max_allowed_occupancy: body.maxAllowedOccupancy,
        correlation_window_seconds: body.correlationWindowSeconds,
        interlock_mode: body.interlockMode,
        auto_lock_inner_door: body.autoLockInnerDoor,
        enabled: body.enabled,
        metadata: body.metadata || {},
      });

      return reply.send({ success: true, data: portal });
    } catch (error) {
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upsert portal',
      });
    }
  });

  // 7. Get and Update Portal Tailgating Config
  app.get('/v1/analytics/tailgating/config/:portalId', async (request: FastifyRequest<{ Params: { portalId: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const config = await tailgatingService.getPortalConfig(request.params.portalId, tenantId);

      if (!config) {
        return reply.send({
          success: true,
          data: {
            portal_id: request.params.portalId,
            tenant_id: tenantId,
            enabled: true,
            sensitivity: 0.80,
            min_confidence: 0.75,
            max_time_gap_ms: 3000,
            correlation_window_seconds: 10,
            max_allowed_occupancy: 1,
            auto_lock_inner_door: true,
            alert_severity: 'P1',
            cooldown_seconds: 15,
            isDefault: true,
          },
        });
      }

      return reply.send({ success: true, data: config });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get portal config',
      });
    }
  });

  const updateConfigSchema = z.object({
    enabled: z.boolean().optional(),
    sensitivity: z.number().min(0.1).max(1.0).optional(),
    min_confidence: z.number().min(0.1).max(1.0).optional(),
    max_time_gap_ms: z.number().int().min(500).optional(),
    correlation_window_seconds: z.number().int().min(2).optional(),
    max_allowed_occupancy: z.number().int().min(1).optional(),
    auto_lock_inner_door: z.boolean().optional(),
    alert_severity: z.enum(['P1', 'P2', 'P3']).optional(),
    cooldown_seconds: z.number().int().min(1).optional(),
  });

  app.put('/v1/analytics/tailgating/config/:portalId', async (request: FastifyRequest<{ Params: { portalId: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = updateConfigSchema.parse(request.body);

      const updated = await tailgatingService.updatePortalConfig(request.params.portalId, tenantId, body as any);
      return reply.send({ success: true, data: updated });
    } catch (error) {
      return reply.code(error instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update portal config',
      });
    }
  });

  // 8. Overall KPI & Aggregated Stats
  app.get('/v1/analytics/tailgating/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const stats = await tailgatingService.getStats(tenantId);
      return reply.send({ success: true, data: stats });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get stats',
      });
    }
  });
}
