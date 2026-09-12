/**
 * Fastify REST Routes for Abandoned & Unattended Object Detection (analytics.abandoned_object)
 * 
 * Production endpoints for real-time static foreground blob tracking, edge telemetry ingestion,
 * sensitive zone management, multi-frame dwell time auditing, and security dispatch workflows.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { AbandonedObjectService } from '../analytics/abandoned-object/abandoned-object-service.js';

export async function registerAbandonedObjectRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  const pool = (store as any).pool || (store as any).db;
  const service = new AbandonedObjectService(pool);

  const getTenantId = (req: FastifyRequest): string => {
    const user = (req as any).user;
    return user?.tenantId || (req.headers['x-tenant-id'] as string) || '00000000-0000-4000-8000-000000000000';
  };

  const getUserId = (req: FastifyRequest): string => {
    const user = (req as any).user;
    return user?.id || (req.headers['x-user-id'] as string) || '00000000-0000-4000-8000-000000000001';
  };

  // 1. List Events
  const listEventsSchema = z.object({
    cameraId: z.string().optional(),
    branchId: z.string().optional(),
    zoneId: z.string().optional(),
    eventType: z.enum(['unattended_object', 'abandoned_object', 'removed_object', 'suspicious_package']).optional(),
    severity: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
    status: z.enum(['detected', 'investigating', 'cleared', 'false_positive', 'escalated']).optional(),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  });

  app.get('/v1/analytics/abandoned-objects/events', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const query = listEventsSchema.parse(req.query);

      const result = await service.listEvents({
        tenantId,
        cameraId: query.cameraId,
        branchId: query.branchId,
        zoneId: query.zoneId,
        eventType: query.eventType,
        severity: query.severity,
        status: query.status,
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
      req.log.error({ err }, 'Failed to list abandoned object events');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to list abandoned object events',
      });
    }
  });

  // 2. Get Single Event
  app.get('/v1/analytics/abandoned-objects/events/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;

      const event = await service.getEventById(tenantId, id);
      if (!event) {
        return reply.status(404).send({
          success: false,
          error: 'Abandoned object event not found',
        });
      }

      return reply.send({
        success: true,
        data: event,
      });
    } catch (err: any) {
      req.log.error({ err }, 'Failed to get abandoned object event');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to get event',
      });
    }
  });

  // 3. Ingest Edge Telemetry Event
  const ingestEventSchema = z.object({
    cameraId: z.string(),
    zoneId: z.string().optional(),
    branchId: z.string().optional(),
    eventType: z.enum(['unattended_object', 'abandoned_object', 'removed_object', 'suspicious_package']),
    objectType: z.enum(['backpack', 'suitcase', 'box', 'parcel', 'handbag', 'generic_blob', 'duffel_bag']),
    severity: z.enum(['P1', 'P2', 'P3', 'P4']),
    confidence: z.number().min(0).max(1),
    boundingBox: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }),
    dwellTimeSeconds: z.number().int().min(0),
    ownerTrackId: z.string().optional(),
    ownerDistancePixels: z.number().optional(),
    snapshotUrl: z.string().optional(),
    thermalScore: z.number().optional(),
    notes: z.string().optional(),
  });

  app.post('/v1/analytics/abandoned-objects/events', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const body = ingestEventSchema.parse(req.body);

      const event = await (service as any).repo.createEvent({
        tenant_id: tenantId,
        camera_id: body.cameraId,
        zone_id: body.zoneId || null,
        branch_id: body.branchId || null,
        event_type: body.eventType,
        object_type: body.objectType,
        severity: body.severity,
        confidence: body.confidence,
        bounding_box: body.boundingBox,
        dwell_time_seconds: body.dwellTimeSeconds,
        owner_track_id: body.ownerTrackId || null,
        owner_distance_pixels: body.ownerDistancePixels ?? null,
        status: 'detected',
        snapshot_url: body.snapshotUrl || null,
        thermal_score: body.thermalScore ?? null,
        notes: body.notes || null,
        first_seen_at: new Date(Date.now() - body.dwellTimeSeconds * 1000),
        detected_at: new Date(),
      });

      return reply.status(201).send({
        success: true,
        data: event,
      });
    } catch (err: any) {
      req.log.error({ err }, 'Failed to ingest abandoned object event');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to ingest event',
      });
    }
  });

  // 4. Update Event Status
  const updateStatusSchema = z.object({
    status: z.enum(['detected', 'investigating', 'cleared', 'false_positive', 'escalated']),
    notes: z.string().optional(),
  });

  app.patch('/v1/analytics/abandoned-objects/events/:id/status', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const { id } = req.params;
      const { status, notes } = updateStatusSchema.parse(req.body);

      const updated = await service.updateEventStatus(tenantId, id, status, userId, notes);
      if (!updated) {
        return reply.status(404).send({
          success: false,
          error: 'Event not found or unauthorized',
        });
      }

      return reply.send({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      req.log.error({ err }, 'Failed to update abandoned object event status');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to update status',
      });
    }
  });

  // 5. List Sensitive Zones
  const listZonesSchema = z.object({
    branchId: z.string().optional(),
    cameraId: z.string().optional(),
    zoneType: z.enum([
      'sterile_zone',
      'atm_vestibule',
      'cash_counter',
      'vault_perimeter',
      'emergency_exit',
      'customer_lobby',
      'hallway',
      'baggage_area',
    ]).optional(),
    enabledOnly: z.coerce.boolean().optional(),
  });

  app.get('/v1/analytics/abandoned-objects/zones', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const query = listZonesSchema.parse(req.query);

      const zones = await service.listZones({
        tenantId,
        branchId: query.branchId,
        cameraId: query.cameraId,
        zoneType: query.zoneType,
        enabledOnly: query.enabledOnly,
      });

      return reply.send({
        success: true,
        data: zones,
      });
    } catch (err: any) {
      req.log.error({ err }, 'Failed to list zones');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to list zones',
      });
    }
  });

  // 6. Get Single Zone
  app.get('/v1/analytics/abandoned-objects/zones/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;

      const zone = await service.getZoneById(tenantId, id);
      if (!zone) {
        return reply.status(404).send({
          success: false,
          error: 'Zone not found',
        });
      }

      return reply.send({
        success: true,
        data: zone,
      });
    } catch (err: any) {
      req.log.error({ err }, 'Failed to get zone');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to get zone',
      });
    }
  });

  // 7. Create Zone
  const createZoneSchema = z.object({
    branchId: z.string().optional(),
    cameraId: z.string().optional(),
    zoneName: z.string().min(2),
    zoneType: z.enum([
      'sterile_zone',
      'atm_vestibule',
      'cash_counter',
      'vault_perimeter',
      'emergency_exit',
      'customer_lobby',
      'hallway',
      'baggage_area',
    ]),
    polygon: z.array(z.object({ x: z.number(), y: z.number() })).min(3),
    sensitivity: z.enum(['low', 'medium', 'high', 'critical']).default('high'),
    unattendedThresholdSeconds: z.number().int().min(5).default(60),
    abandonedThresholdSeconds: z.number().int().min(10).default(180),
    minBlobAreaPixels: z.number().int().min(10).default(150),
    maxBlobAreaPixels: z.number().int().min(100).default(50000),
    enabled: z.boolean().default(true),
    metadata: z.record(z.unknown()).optional(),
  });

  app.post('/v1/analytics/abandoned-objects/zones', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const body = createZoneSchema.parse(req.body);

      const zone = await service.createZone({
        tenant_id: tenantId,
        branch_id: body.branchId || null,
        camera_id: body.cameraId || null,
        zone_name: body.zoneName,
        zone_type: body.zoneType,
        polygon: body.polygon,
        sensitivity: body.sensitivity,
        unattended_threshold_seconds: body.unattendedThresholdSeconds,
        abandoned_threshold_seconds: body.abandonedThresholdSeconds,
        min_blob_area_pixels: body.minBlobAreaPixels,
        max_blob_area_pixels: body.maxBlobAreaPixels,
        enabled: body.enabled,
        metadata: body.metadata || {},
      });

      return reply.status(201).send({
        success: true,
        data: zone,
      });
    } catch (err: any) {
      req.log.error({ err }, 'Failed to create zone');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to create zone',
      });
    }
  });

  // 8. Update Zone
  const updateZoneSchema = createZoneSchema.partial();

  app.put('/v1/analytics/abandoned-objects/zones/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;
      const body = updateZoneSchema.parse(req.body);

      const updated = await service.updateZone(tenantId, id, {
        zone_name: body.zoneName,
        zone_type: body.zoneType,
        polygon: body.polygon,
        sensitivity: body.sensitivity,
        unattended_threshold_seconds: body.unattendedThresholdSeconds,
        abandoned_threshold_seconds: body.abandonedThresholdSeconds,
        min_blob_area_pixels: body.minBlobAreaPixels,
        max_blob_area_pixels: body.maxBlobAreaPixels,
        enabled: body.enabled,
      });

      if (!updated) {
        return reply.status(404).send({
          success: false,
          error: 'Zone not found',
        });
      }

      return reply.send({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      req.log.error({ err }, 'Failed to update zone');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to update zone',
      });
    }
  });

  // 9. Delete Zone
  app.delete('/v1/analytics/abandoned-objects/zones/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;

      const deleted = await service.deleteZone(tenantId, id);
      if (!deleted) {
        return reply.status(404).send({
          success: false,
          error: 'Zone not found',
        });
      }

      return reply.send({
        success: true,
        message: 'Zone successfully deleted',
      });
    } catch (err: any) {
      req.log.error({ err }, 'Failed to delete zone');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to delete zone',
      });
    }
  });

  // 10. Operational Stats
  app.get('/v1/analytics/abandoned-objects/stats', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const { cameraId } = req.query as { cameraId?: string };

      const stats = await service.getStats(tenantId, cameraId);
      return reply.send({
        success: true,
        data: stats,
      });
    } catch (err: any) {
      req.log.error({ err }, 'Failed to get abandoned object stats');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to get stats',
      });
    }
  });

  // 11. Real-Time Frame Analysis Endpoint
  const analyzeFrameSchema = z.object({
    cameraId: z.string(),
    branchId: z.string().optional(),
    frameBase64: z.string().optional(),
    width: z.number().int().min(16).max(3840).default(64),
    height: z.number().int().min(16).max(2160).default(36),
    channels: z.number().int().min(1).max(4).default(3),
    candidateBlobs: z.array(z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })).optional(),
    persons: z.array(z.object({
      trackId: z.string(),
      boundingBox: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      }),
      confidence: z.number(),
    })).optional(),
    saveToDb: z.boolean().default(true),
  });

  app.post('/v1/analytics/abandoned-objects/analyze-frame', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const body = analyzeFrameSchema.parse(req.body);

      if (body.frameBase64) {
        const buffer = Buffer.from(body.frameBase64, 'base64');
        const res = await service.processFrame({
          tenantId,
          cameraId: body.cameraId,
          branchId: body.branchId,
          frameBuffer: buffer,
          width: body.width,
          height: body.height,
          channels: body.channels,
          persons: body.persons || [],
          saveToDb: body.saveToDb,
        });

        return reply.send({
          success: true,
          data: res,
        });
      }

      // If pre-extracted candidate blobs are provided
      const res = await service.processObservations({
        tenantId,
        cameraId: body.cameraId,
        branchId: body.branchId,
        candidateBlobs: body.candidateBlobs || [],
        persons: body.persons || [],
        saveToDb: body.saveToDb,
      });

      return reply.send({
        success: true,
        data: res,
      });
    } catch (err: any) {
      req.log.error({ err }, 'Failed to analyze frame for abandoned objects');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to analyze frame',
      });
    }
  });

  // 12. Camera Config
  app.get('/v1/analytics/abandoned-objects/config/:cameraId', async (req: FastifyRequest<{ Params: { cameraId: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const { cameraId } = req.params;

      const config = await service.getConfig(tenantId, cameraId);
      return reply.send({
        success: true,
        data: config,
      });
    } catch (err: any) {
      req.log.error({ err }, 'Failed to get config');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to get config',
      });
    }
  });

  const updateConfigSchema = z.object({
    stationaryPixelThreshold: z.number().min(1).default(12.0),
    defaultUnattendedThresholdSec: z.number().int().min(5).default(60),
    defaultAbandonedThresholdSec: z.number().int().min(10).default(180),
    ownerProximityThresholdPx: z.number().min(10).default(120.0),
    debounceFrames: z.number().int().min(1).default(3),
    alertOnSterileZoneEntry: z.boolean().default(true),
    alertOnExitCorridorObstruction: z.boolean().default(true),
    thermalVerificationEnabled: z.boolean().default(false),
  });

  app.put('/v1/analytics/abandoned-objects/config/:cameraId', async (req: FastifyRequest<{ Params: { cameraId: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const { cameraId } = req.params;
      const body = updateConfigSchema.parse(req.body);

      const config = await service.updateConfig({
        tenant_id: tenantId,
        camera_id: cameraId,
        stationary_pixel_threshold: body.stationaryPixelThreshold,
        default_unattended_threshold_sec: body.defaultUnattendedThresholdSec,
        default_abandoned_threshold_sec: body.defaultAbandonedThresholdSec,
        owner_proximity_threshold_px: body.ownerProximityThresholdPx,
        debounce_frames: body.debounceFrames,
        alert_on_sterile_zone_entry: body.alertOnSterileZoneEntry,
        alert_on_exit_corridor_obstruction: body.alertOnExitCorridorObstruction,
        thermal_verification_enabled: body.thermalVerificationEnabled,
      });

      return reply.send({
        success: true,
        data: config,
      });
    } catch (err: any) {
      req.log.error({ err }, 'Failed to update config');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to update config',
      });
    }
  });
}
