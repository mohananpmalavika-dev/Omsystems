/**
 * Fastify Routes for Camera Obstruction & Dark Frame Detection
 * 
 * Production REST endpoints for real-time heuristic frame analysis,
 * edge telemetry ingestion, baseline calibration, threshold configuration,
 * and security event audits.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { ObstructionService } from '../analytics/obstruction/obstruction-service.js';
import { ObstructionHeuristicAnalyzer } from '../analytics/obstruction/obstruction-heuristic-analyzer.js';

export async function registerCameraObstructionRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  const pool = (store as any).pool || (store as any).db;
  const obstructionService = new ObstructionService(pool);

  const getTenantId = (req: FastifyRequest): string => {
    const user = (req as any).user;
    return user?.tenantId || (req.headers['x-tenant-id'] as string) || '00000000-0000-4000-8000-000000000000';
  };

  const getUserId = (req: FastifyRequest): string => {
    const user = (req as any).user;
    return user?.id || (req.headers['x-user-id'] as string) || '00000000-0000-4000-8000-000000000001';
  };

  // 1. List Historical Obstruction Events
  const listQuerySchema = z.object({
    cameraId: z.string().optional(),
    branchId: z.string().optional(),
    obstructionType: z.enum(['dark_frame', 'lens_covering', 'variance_loss', 'partial_obstruction', 'glare_whiteout']).optional(),
    severity: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
    status: z.enum(['detected', 'acknowledged', 'resolved', 'false_positive']).optional(),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  });

  app.get('/v1/analytics/obstruction/events', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = listQuerySchema.parse(request.query);

      const result = await obstructionService.listEvents({
        tenantId,
        cameraId: query.cameraId,
        branchId: query.branchId,
        obstructionType: query.obstructionType,
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
      request.log.error({ err }, 'Failed to list camera obstruction events');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to list camera obstruction events',
      });
    }
  });

  // 2. Get Single Event by ID
  app.get('/v1/analytics/obstruction/events/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const { id } = request.params;

      const event = await obstructionService.getEventById(tenantId, id);
      if (!event) {
        return reply.status(404).send({
          success: false,
          error: 'Obstruction event not found',
        });
      }

      return reply.send({
        success: true,
        data: event,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to get camera obstruction event');
      return reply.status(500).send({
        success: false,
        error: err.message || 'Failed to retrieve event',
      });
    }
  });

  // 3. Update Event Status (Acknowledge / Resolve / False Positive)
  const statusBodySchema = z.object({
    status: z.enum(['acknowledged', 'resolved', 'false_positive']),
    notes: z.string().max(1000).optional(),
  });

  app.patch('/v1/analytics/obstruction/events/:id/status', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const userId = getUserId(request);
      const { id } = request.params;
      const body = statusBodySchema.parse(request.body);

      const updated = await obstructionService.updateEventStatus(
        tenantId,
        id,
        body.status,
        userId,
        body.notes
      );

      if (!updated) {
        return reply.status(404).send({
          success: false,
          error: 'Obstruction event not found or unauthorized',
        });
      }

      return reply.send({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to update obstruction event status');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to update event status',
      });
    }
  });

  // 4. Ingest Telemetry Event from Edge or Central Detector
  const ingestEventSchema = z.object({
    cameraId: z.string().min(1),
    branchId: z.string().optional(),
    obstructionType: z.enum(['dark_frame', 'lens_covering', 'variance_loss', 'partial_obstruction', 'glare_whiteout']),
    severity: z.enum(['P1', 'P2', 'P3', 'P4']),
    confidence: z.number().min(0).max(1),
    obstructionPercent: z.number().min(0).max(100).default(0),
    metrics: z.record(z.any()).default({}),
    tileAnalysis: z.record(z.any()).default({}),
    snapshotUrl: z.string().url().optional(),
    notes: z.string().optional(),
    detectedAt: z.string().datetime().optional(),
  });

  app.post('/v1/analytics/obstruction/events', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = ingestEventSchema.parse(request.body);

      const event = await obstructionService.ingestTelemetryEvent({
        tenant_id: tenantId,
        camera_id: body.cameraId,
        branch_id: body.branchId || null,
        obstruction_type: body.obstructionType,
        severity: body.severity,
        confidence: body.confidence,
        obstruction_percent: body.obstructionPercent,
        metrics: body.metrics as any,
        tile_analysis: body.tileAnalysis as any,
        status: 'detected',
        snapshot_url: body.snapshotUrl || null,
        baseline_snapshot_url: null,
        notes: body.notes || null,
        detected_at: body.detectedAt ? new Date(body.detectedAt) : new Date(),
      });

      return reply.status(201).send({
        success: true,
        data: event,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to ingest obstruction event');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to ingest obstruction event',
      });
    }
  });

  // 5. Analyze Single Video Frame (Real-Time Heuristic Evaluation)
  const analyzeFrameSchema = z.object({
    cameraId: z.string().min(1),
    branchId: z.string().optional(),
    frameBase64: z.string().optional(),
    width: z.number().int().min(1).default(64),
    height: z.number().int().min(1).default(36),
    channels: z.union([z.literal(1), z.literal(3), z.literal(4)]).default(3),
    bypassDebounce: z.boolean().default(false),
    snapshotUrl: z.string().optional(),
  });

  app.post('/v1/analytics/obstruction/analyze-frame', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = analyzeFrameSchema.parse(request.body);

      let buffer: Buffer;
      if (body.frameBase64) {
        buffer = Buffer.from(body.frameBase64, 'base64');
      } else {
        // Default synthetic frame with slight noise
        const size = body.width * body.height * body.channels;
        buffer = Buffer.alloc(size);
        for (let i = 0; i < size; i++) {
          buffer[i] = 100 + (i % 25);
        }
      }

      const result = await obstructionService.ingestAndAnalyzeFrame({
        tenantId,
        cameraId: body.cameraId,
        branchId: body.branchId,
        buffer,
        dimensions: {
          width: body.width,
          height: body.height,
          channels: body.channels,
        },
        bypassDebounce: body.bypassDebounce,
        snapshotUrl: body.snapshotUrl,
      });

      return reply.send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to analyze frame for obstruction');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Frame analysis failed',
      });
    }
  });

  // 6. Get Fleet Obstruction Statistics
  app.get('/v1/analytics/obstruction/stats', async (request: FastifyRequest<{ Querystring: { cameraId?: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const { cameraId } = request.query;

      const stats = await obstructionService.getStats(tenantId, cameraId);
      return reply.send({
        success: true,
        data: stats,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to get obstruction statistics');
      return reply.status(500).send({
        success: false,
        error: err.message || 'Failed to get statistics',
      });
    }
  });

  // 7. Get Baseline Optical Profile
  app.get('/v1/analytics/obstruction/baselines/:cameraId', async (request: FastifyRequest<{ Params: { cameraId: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const { cameraId } = request.params;

      const baseline = await obstructionService.getBaseline(tenantId, cameraId);
      if (!baseline) {
        return reply.status(404).send({
          success: false,
          error: 'Optical baseline not calibrated for this camera',
        });
      }

      return reply.send({
        success: true,
        data: baseline,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to get obstruction baseline');
      return reply.status(500).send({
        success: false,
        error: err.message || 'Failed to get baseline',
      });
    }
  });

  // 8. Recalibrate Baseline
  const recalibrateSchema = z.object({
    frameBase64: z.string().optional(),
    width: z.number().int().min(1).default(64),
    height: z.number().int().min(1).default(36),
    channels: z.union([z.literal(1), z.literal(3), z.literal(4)]).default(3),
  });

  app.post('/v1/analytics/obstruction/baselines/:cameraId/recalibrate', async (request: FastifyRequest<{ Params: { cameraId: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const { cameraId } = request.params;
      const body = recalibrateSchema.parse(request.body || {});

      let buffer: Buffer | undefined;
      if (body.frameBase64) {
        buffer = Buffer.from(body.frameBase64, 'base64');
      }

      const baseline = await obstructionService.recalibrateBaseline(
        tenantId,
        cameraId,
        buffer,
        buffer ? { width: body.width, height: body.height, channels: body.channels } : undefined
      );

      return reply.send({
        success: true,
        data: baseline,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to recalibrate obstruction baseline');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to recalibrate baseline',
      });
    }
  });

  // 9. Get Camera Configuration
  app.get('/v1/analytics/obstruction/config/:cameraId', async (request: FastifyRequest<{ Params: { cameraId: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const { cameraId } = request.params;

      const config = await obstructionService.getConfig(tenantId, cameraId);
      return reply.send({
        success: true,
        data: config,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to get camera obstruction config');
      return reply.status(500).send({
        success: false,
        error: err.message || 'Failed to get config',
      });
    }
  });

  // 10. Update Camera Configuration
  const updateConfigSchema = z.object({
    sensitivity: z.number().min(0).max(1).optional(),
    darknessThreshold: z.number().min(0).max(255).optional(),
    varianceFloor: z.number().min(0).optional(),
    obstructionPercentThreshold: z.number().min(0).max(100).optional(),
    partialThreshold: z.number().min(0).max(100).optional(),
    debounceFrames: z.number().int().min(1).optional(),
    autoRecalibrateHours: z.number().int().min(1).optional(),
    alertOnDarkFrame: z.boolean().optional(),
    alertOnCovering: z.boolean().optional(),
    alertOnVarianceLoss: z.boolean().optional(),
    alertOnPartial: z.boolean().optional(),
    alertOnGlare: z.boolean().optional(),
    enabled: z.boolean().optional(),
  });

  app.put('/v1/analytics/obstruction/config/:cameraId', async (request: FastifyRequest<{ Params: { cameraId: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const { cameraId } = request.params;
      const body = updateConfigSchema.parse(request.body);

      const updated = await obstructionService.updateConfig(tenantId, cameraId, {
        sensitivity: body.sensitivity,
        darkness_threshold: body.darknessThreshold,
        variance_floor: body.varianceFloor,
        obstruction_percent_threshold: body.obstructionPercentThreshold,
        partial_threshold: body.partialThreshold,
        debounce_frames: body.debounceFrames,
        auto_recalibrate_hours: body.autoRecalibrateHours,
        alert_on_dark_frame: body.alertOnDarkFrame,
        alert_on_covering: body.alertOnCovering,
        alert_on_variance_loss: body.alertOnVarianceLoss,
        alert_on_partial: body.alertOnPartial,
        alert_on_glare: body.alertOnGlare,
        enabled: body.enabled,
      });

      return reply.send({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to update camera obstruction config');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to update config',
      });
    }
  });
}
