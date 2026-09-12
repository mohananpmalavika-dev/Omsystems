/**
 * Fastify Routes for Automatic Number Plate Recognition (ANPR)
 * 
 * Production REST endpoints for real-time plate recognition, optical syntax validation,
 * watchlist alert management, vehicle dwell session tracking, and operator audit reviews.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { AnprService } from '../analytics/anpr/anpr-service.js';

export async function registerAnprRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  const pool = (store as any).pool || (store as any).db;
  const anprService = new AnprService(pool);

  const getTenantId = (req: FastifyRequest): string => {
    const user = (req as any).user;
    return user?.tenantId || (req.headers['x-tenant-id'] as string) || '00000000-0000-4000-8000-000000000000';
  };

  const getUserId = (req: FastifyRequest): string => {
    const user = (req as any).user;
    return user?.id || (req.headers['x-user-id'] as string) || '00000000-0000-4000-8000-000000000001';
  };

  // 1. Interactive Plate Recognition & Evaluation (Sandbox / Probe)
  const recognizeBodySchema = z.object({
    rawPlateText: z.string().min(1).max(30),
    countryPreference: z.string().min(2).max(4).default('IN'),
    plateConfidence: z.number().min(0).max(1).default(0.92),
    plateBbox: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }).optional(),
    vehicle: z.object({
      category: z.enum(['car', 'motorcycle', 'bus', 'truck', 'van', 'auto_rickshaw', 'other']),
      confidence: z.number().min(0).max(1),
      color: z.string().optional(),
      make: z.string().optional(),
      model: z.string().optional(),
    }).optional(),
  });

  app.post('/v1/analytics/anpr/recognize', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = recognizeBodySchema.parse(request.body);

      const evaluation = await anprService.evaluatePlate({
        tenantId,
        rawPlateText: body.rawPlateText,
        countryPreference: body.countryPreference,
        plateConfidence: body.plateConfidence,
        plateBbox: body.plateBbox,
        vehicle: body.vehicle,
      });

      return reply.send({
        success: true,
        data: evaluation,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to evaluate license plate');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to evaluate license plate',
      });
    }
  });

  // 2. Ingest Live Detection Event (Stream / Edge / Camera)
  const detectBodySchema = z.object({
    cameraId: z.string().min(1),
    cameraName: z.string().optional(),
    branchId: z.string().optional().nullable(),
    rawPlateText: z.string().min(1).max(30),
    plateConfidence: z.number().min(0).max(1).default(0.92),
    countryPreference: z.string().min(2).max(4).default('IN'),
    entryDirection: z.enum(['entry', 'exit', 'unknown']).default('unknown'),
    plateBbox: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }).optional(),
    vehicle: z.object({
      category: z.enum(['car', 'motorcycle', 'bus', 'truck', 'van', 'auto_rickshaw', 'other']),
      confidence: z.number().min(0).max(1),
      color: z.string().optional(),
      make: z.string().optional(),
      model: z.string().optional(),
    }).optional(),
    snapshotReference: z.string().optional(),
    plateCropUrl: z.string().optional(),
    occurredAt: z.string().datetime().optional(),
  });

  app.post('/v1/analytics/anpr/events', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = detectBodySchema.parse(request.body);

      const result = await anprService.processDetection({
        tenantId,
        cameraId: body.cameraId,
        cameraName: body.cameraName,
        branchId: body.branchId,
        rawPlateText: body.rawPlateText,
        plateConfidence: body.plateConfidence,
        countryPreference: body.countryPreference,
        entryDirection: body.entryDirection,
        plateBbox: body.plateBbox,
        vehicle: body.vehicle,
        snapshotReference: body.snapshotReference,
        plateCropUrl: body.plateCropUrl,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
      });

      return reply.status(201).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to ingest ANPR detection event');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to ingest ANPR detection event',
      });
    }
  });

  // 3. List Events with Filters & Pagination
  const listEventsQuerySchema = z.object({
    cameraId: z.string().optional(),
    branchId: z.string().optional(),
    plateNumber: z.string().optional(),
    watchlistId: z.string().optional(),
    entryDirection: z.enum(['entry', 'exit', 'unknown']).optional(),
    reviewStatus: z.enum(['pending', 'confirmed', 'false_positive', 'dismissed']).optional(),
    hasWatchlistMatch: z.coerce.boolean().optional(),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  });

  app.get('/v1/analytics/anpr/events', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = listEventsQuerySchema.parse(request.query);

      const result = await anprService.listEvents({
        tenantId,
        cameraId: query.cameraId,
        branchId: query.branchId,
        plateNumber: query.plateNumber,
        watchlistId: query.watchlistId,
        entryDirection: query.entryDirection,
        reviewStatus: query.reviewStatus,
        hasWatchlistMatch: query.hasWatchlistMatch,
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
    } catch (err: any) {
      request.log.error({ err }, 'Failed to list ANPR events');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to list ANPR events',
      });
    }
  });

  // 4. Get Event Details
  app.get('/v1/analytics/anpr/events/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const event = await anprService.getEventById(tenantId, request.params.id);
      if (!event) {
        return reply.status(404).send({ success: false, error: 'Event not found' });
      }
      return reply.send({ success: true, data: event });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to get ANPR event details');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to get ANPR event details',
      });
    }
  });

  // 5. Submit Operator Review
  const reviewSchema = z.object({
    status: z.enum(['confirmed', 'false_positive', 'dismissed']),
    notes: z.string().optional(),
  });

  app.post('/v1/analytics/anpr/events/:id/reviews', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const userId = getUserId(request);
      const body = reviewSchema.parse(request.body);

      const updated = await anprService.submitReview(tenantId, request.params.id, {
        status: body.status,
        reviewedBy: userId,
        notes: body.notes,
      });

      if (!updated) {
        return reply.status(404).send({ success: false, error: 'Event not found' });
      }

      return reply.send({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to review ANPR event');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to review ANPR event',
      });
    }
  });

  // 6. Vehicle Parking / Dwell Sessions
  const listSessionsQuery = z.object({
    plateNumber: z.string().optional(),
    status: z.enum(['inside', 'exited', 'overstay', 'unknown']).optional(),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  });

  app.get('/v1/analytics/anpr/sessions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = listSessionsQuery.parse(request.query);

      const result = await anprService.listSessions({
        tenantId,
        plateNumber: query.plateNumber,
        status: query.status,
        fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
        toDate: query.toDate ? new Date(query.toDate) : undefined,
        limit: query.limit,
        offset: query.offset,
      });

      return reply.send({
        success: true,
        data: result.sessions,
        pagination: {
          total: result.total,
          limit: query.limit,
          offset: query.offset,
        },
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to list vehicle sessions');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to list vehicle sessions',
      });
    }
  });

  app.get('/v1/analytics/anpr/sessions/:plateNumber', async (request: FastifyRequest<{ Params: { plateNumber: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const result = await anprService.listSessions({
        tenantId,
        plateNumber: request.params.plateNumber,
        limit: 20,
      });

      return reply.send({
        success: true,
        data: result.sessions,
      });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // 7. Watchlists CRUD
  app.get('/v1/analytics/anpr/watchlists', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const lists = await anprService.listWatchlists(tenantId);
      return reply.send({ success: true, data: lists });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  const createWatchlistSchema = z.object({
    name: z.string().min(2).max(160),
    description: z.string().optional(),
    listType: z.enum(['alert', 'stolen', 'wanted', 'vip', 'staff', 'blacklist']).default('alert'),
    enabled: z.boolean().default(true),
    alertOnMatch: z.boolean().default(true),
    alertSeverity: z.enum(['P1', 'P2', 'P3', 'P4', 'P5']).default('P2'),
    alertAuthorities: z.boolean().default(false),
  });

  app.post('/v1/analytics/anpr/watchlists', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const userId = getUserId(request);
      const body = createWatchlistSchema.parse(request.body);

      const created = await anprService.createWatchlist({
        tenant_id: tenantId,
        name: body.name,
        description: body.description,
        list_type: body.listType,
        enabled: body.enabled,
        alert_on_match: body.alertOnMatch,
        alert_severity: body.alertSeverity,
        alert_authorities: body.alertAuthorities,
        created_by: userId,
      });

      return reply.status(201).send({ success: true, data: created });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  app.get('/v1/analytics/anpr/watchlists/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const list = await anprService.getWatchlistById(tenantId, request.params.id);
      if (!list) return reply.status(404).send({ success: false, error: 'Watchlist not found' });
      return reply.send({ success: true, data: list });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  app.put('/v1/analytics/anpr/watchlists/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = createWatchlistSchema.partial().parse(request.body);
      const updated = await anprService.updateWatchlist(tenantId, request.params.id, {
        name: body.name,
        description: body.description,
        enabled: body.enabled,
        alert_on_match: body.alertOnMatch,
        alert_severity: body.alertSeverity,
        alert_authorities: body.alertAuthorities,
      });
      if (!updated) return reply.status(404).send({ success: false, error: 'Watchlist not found' });
      return reply.send({ success: true, data: updated });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  app.delete('/v1/analytics/anpr/watchlists/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const ok = await anprService.deleteWatchlist(tenantId, request.params.id);
      if (!ok) return reply.status(404).send({ success: false, error: 'Watchlist not found' });
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // 8. Watchlist Plates Management
  app.get('/v1/analytics/anpr/watchlists/:id/plates', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const plates = await anprService.listPlates(tenantId, request.params.id);
      return reply.send({ success: true, data: plates });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  const addPlateSchema = z.object({
    plateNumber: z.string().min(2).max(20),
    countryCode: z.string().min(2).max(4).default('IN'),
    regionCode: z.string().optional(),
    vehicleMake: z.string().optional(),
    vehicleModel: z.string().optional(),
    vehicleColor: z.string().optional(),
    vehicleType: z.enum(['car', 'motorcycle', 'bus', 'truck', 'van', 'auto_rickshaw', 'other']).optional(),
    ownerName: z.string().optional(),
    reason: z.string().min(1),
    notes: z.string().optional(),
    fuzzyMatch: z.boolean().default(true),
    maxLevenshteinDistance: z.number().int().min(0).max(3).default(1),
    priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
    expiresAt: z.string().datetime().optional(),
  });

  app.post('/v1/analytics/anpr/watchlists/:id/plates', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const userId = getUserId(request);
      const body = addPlateSchema.parse(request.body);

      const plate = await anprService.addPlate({
        tenant_id: tenantId,
        watchlist_id: request.params.id,
        plate_number: body.plateNumber.toUpperCase(),
        normalized_plate: body.plateNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
        country_code: body.countryCode,
        region_code: body.regionCode,
        vehicle_make: body.vehicleMake,
        vehicle_model: body.vehicleModel,
        vehicle_color: body.vehicleColor,
        vehicle_type: body.vehicleType,
        owner_name: body.ownerName,
        reason: body.reason,
        notes: body.notes,
        fuzzy_match: body.fuzzyMatch,
        max_levenshtein_distance: body.maxLevenshteinDistance,
        priority: body.priority,
        added_by: userId,
        expires_at: body.expiresAt ? new Date(body.expiresAt) : undefined,
      });

      return reply.status(201).send({ success: true, data: plate });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  app.delete('/v1/analytics/anpr/watchlists/:id/plates/:plateId', async (request: FastifyRequest<{ Params: { id: string; plateId: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const ok = await anprService.removePlate(tenantId, request.params.id, request.params.plateId);
      if (!ok) return reply.status(404).send({ success: false, error: 'Plate not found' });
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  const bulkImportSchema = z.object({
    plates: z.array(addPlateSchema).min(1).max(500),
  });

  app.post('/v1/analytics/anpr/watchlists/:id/plates/bulk', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const userId = getUserId(request);
      const body = bulkImportSchema.parse(request.body);

      const inserted = [];
      for (const p of body.plates) {
        const item = await anprService.addPlate({
          tenant_id: tenantId,
          watchlist_id: request.params.id,
          plate_number: p.plateNumber.toUpperCase(),
          normalized_plate: p.plateNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
          country_code: p.countryCode,
          region_code: p.regionCode,
          vehicle_make: p.vehicleMake,
          vehicle_model: p.vehicleModel,
          vehicle_color: p.vehicleColor,
          vehicle_type: p.vehicleType,
          owner_name: p.ownerName,
          reason: p.reason,
          notes: p.notes,
          fuzzy_match: p.fuzzyMatch,
          max_levenshtein_distance: p.maxLevenshteinDistance,
          priority: p.priority,
          added_by: userId,
          expires_at: p.expiresAt ? new Date(p.expiresAt) : undefined,
        });
        inserted.push(item);
      }

      return reply.status(201).send({
        success: true,
        importedCount: inserted.length,
        data: inserted,
      });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // 9. Operational Telemetry & KPI Stats
  app.get('/v1/analytics/anpr/stats', async (request: FastifyRequest<{ Querystring: { cameraId?: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const stats = await anprService.getStats(tenantId, request.query.cameraId);
      return reply.send({ success: true, data: stats });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to get ANPR stats');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to get ANPR stats',
      });
    }
  });
}
