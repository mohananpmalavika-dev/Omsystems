/**
 * Fastify Routes for Camera Tamper & Defocus Detection
 * 
 * Production REST endpoints for real-time statistical frame analysis,
 * edge telemetry ingestion, baseline calibration, threshold configuration,
 * and security event audits.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { TamperService } from '../analytics/tamper/tamper-service.js';
import {
  TamperStatisticalAnalyzer,
} from '../analytics/tamper/tamper-statistical-analyzer.js';

export async function registerCameraTamperRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  const pool = (store as any).pool || (store as any).db;
  const tamperService = new TamperService(pool);

  const getTenantId = (req: FastifyRequest): string => {
    const user = (req as any).user;
    return user?.tenantId || (req.headers['x-tenant-id'] as string) || '00000000-0000-4000-8000-000000000000';
  };

  const getUserId = (req: FastifyRequest): string => {
    const user = (req as any).user;
    return user?.id || (req.headers['x-user-id'] as string) || '00000000-0000-4000-8000-000000000001';
  };

  // 1. List Historical Tamper Events
  const listQuerySchema = z.object({
    cameraId: z.string().optional(),
    branchId: z.string().optional(),
    tamperType: z.enum(['blinding', 'covering', 'movement', 'defocus', 'spray']).optional(),
    severity: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
    status: z.enum(['detected', 'acknowledged', 'resolved', 'false_positive']).optional(),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  });

  app.get('/v1/analytics/tamper/events', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = listQuerySchema.parse(request.query);

      const result = await tamperService.listEvents({
        tenantId,
        cameraId: query.cameraId,
        branchId: query.branchId,
        tamperType: query.tamperType,
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
      request.log.error({ err }, 'Failed to list camera tamper events');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to list camera tamper events',
      });
    }
  });

  // 2. Get Single Event by ID
  app.get('/v1/analytics/tamper/events/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const { id } = request.params;

      const event = await tamperService.getEventById(tenantId, id);
      if (!event) {
        return reply.status(404).send({
          success: false,
          error: 'Tamper event not found',
        });
      }

      return reply.send({
        success: true,
        data: event,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to get camera tamper event');
      return reply.status(500).send({
        success: false,
        error: err.message || 'Failed to retrieve tamper event',
      });
    }
  });

  // 3. Update Event Status (Acknowledge, Resolve, False Positive)
  const updateStatusSchema = z.object({
    status: z.enum(['acknowledged', 'resolved', 'false_positive']),
    notes: z.string().optional(),
  });

  app.patch('/v1/analytics/tamper/events/:id/status', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const userId = getUserId(request);
      const { id } = request.params;
      const body = updateStatusSchema.parse(request.body);

      const updated = await tamperService.updateEventStatus(
        tenantId,
        id,
        body.status,
        userId,
        body.notes
      );

      if (!updated) {
        return reply.status(404).send({
          success: false,
          error: 'Tamper event not found',
        });
      }

      return reply.send({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to update tamper event status');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to update event status',
      });
    }
  });

  // 4. Ingest Event from Edge Agent
  const ingestEventSchema = z.object({
    cameraId: z.string(),
    branchId: z.string().optional(),
    tamperType: z.enum(['blinding', 'covering', 'movement', 'defocus', 'spray']),
    severity: z.enum(['P1', 'P2', 'P3', 'P4']).default('P2'),
    confidence: z.number().min(0).max(1),
    metrics: z.object({
      luminance: z.number(),
      variance: z.number(),
      laplacianVariance: z.number(),
      edgeDensity: z.number(),
      entropy: z.number(),
      structuralSimilarity: z.number().optional().default(1.0),
      sceneChangeScore: z.number().optional().default(0.0),
      highlightFraction: z.number().optional().default(0.0),
      shadowFraction: z.number().optional().default(0.0),
    }),
    snapshotUrl: z.string().optional(),
    detectedAt: z.string().datetime().optional(),
  });

  app.post('/v1/analytics/tamper/events', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = ingestEventSchema.parse(request.body);

      const event = await tamperService.getRepository().createEvent({
        tenant_id: tenantId,
        camera_id: body.cameraId,
        branch_id: body.branchId || null,
        tamper_type: body.tamperType,
        severity: body.severity,
        confidence: body.confidence,
        metrics: {
          luminance: body.metrics.luminance,
          variance: body.metrics.variance,
          laplacianVariance: body.metrics.laplacianVariance,
          edgeDensity: body.metrics.edgeDensity,
          entropy: body.metrics.entropy,
          structuralSimilarity: body.metrics.structuralSimilarity,
          sceneChangeScore: body.metrics.sceneChangeScore,
          highlightFraction: body.metrics.highlightFraction,
          shadowFraction: body.metrics.shadowFraction,
        },
        status: 'detected',
        snapshot_url: body.snapshotUrl || null,
        detected_at: body.detectedAt ? new Date(body.detectedAt) : new Date(),
      });

      return reply.status(201).send({
        success: true,
        data: event,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to ingest tamper event');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to ingest tamper event',
      });
    }
  });

  // 5. Real-Time Frame Statistical Analysis Endpoint
  const analyzeFrameSchema = z.object({
    cameraId: z.string(),
    branchId: z.string().optional(),
    frameBase64: z.string().optional(),
    width: z.number().int().min(8).max(3840).default(64),
    height: z.number().int().min(8).max(2160).default(36),
    channels: z.union([z.literal(1), z.literal(3), z.literal(4)]).default(3),
    bypassDebounce: z.boolean().default(false),
    snapshotUrl: z.string().optional(),
  });

  app.post('/v1/analytics/tamper/analyze-frame', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = analyzeFrameSchema.parse(request.body);

      let frameBuffer: Buffer;
      if (body.frameBase64) {
        frameBuffer = Buffer.from(body.frameBase64, 'base64');
      } else {
        // Generate uniform reference buffer for parameter probing
        frameBuffer = Buffer.alloc(body.width * body.height * body.channels, 128);
      }

      const result = await tamperService.processFrame({
        tenantId,
        cameraId: body.cameraId,
        branchId: body.branchId,
        frameBuffer,
        width: body.width,
        height: body.height,
        channels: body.channels,
        snapshotUrl: body.snapshotUrl,
        bypassDebounce: body.bypassDebounce,
      });

      return reply.send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to analyze camera frame');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to analyze frame',
      });
    }
  });

  // 6. Get Camera Baseline
  app.get('/v1/analytics/tamper/baselines/:cameraId', async (request: FastifyRequest<{ Params: { cameraId: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const { cameraId } = request.params;

      const baseline = await tamperService.getBaseline(tenantId, cameraId);
      if (!baseline) {
        return reply.status(404).send({
          success: false,
          error: 'No baseline calibrated for this camera',
        });
      }

      return reply.send({
        success: true,
        data: baseline,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to get camera baseline');
      return reply.status(500).send({
        success: false,
        error: err.message || 'Failed to get baseline',
      });
    }
  });

  // 7. Recalibrate Camera Baseline
  const recalibrateSchema = z.object({
    frameBase64: z.string().optional(),
    width: z.number().int().min(8).max(3840).default(64),
    height: z.number().int().min(8).max(2160).default(36),
    channels: z.union([z.literal(1), z.literal(3), z.literal(4)]).default(3),
  });

  app.post('/v1/analytics/tamper/baselines/:cameraId/recalibrate', async (request: FastifyRequest<{ Params: { cameraId: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const { cameraId } = request.params;
      const body = recalibrateSchema.parse(request.body || {});

      let frameBuffer: Buffer;
      if (body.frameBase64) {
        frameBuffer = Buffer.from(body.frameBase64, 'base64');
      } else {
        // Calibrate with standard normal reference pattern if raw stream capture not piped
        frameBuffer = Buffer.alloc(body.width * body.height * body.channels);
        for (let i = 0; i < frameBuffer.length; i++) {
          frameBuffer[i] = ((i % 17) * 15) % 256;
        }
      }

      const baseline = await tamperService.recalibrateFromBuffer(
        tenantId,
        cameraId,
        frameBuffer,
        body.width,
        body.height,
        body.channels
      );

      return reply.send({
        success: true,
        data: baseline,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to recalibrate camera baseline');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to recalibrate baseline',
      });
    }
  });

  // 8. Get Camera Configuration
  app.get('/v1/analytics/tamper/config/:cameraId', async (request: FastifyRequest<{ Params: { cameraId: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const { cameraId } = request.params;

      const config = await tamperService.getConfig(tenantId, cameraId);
      return reply.send({
        success: true,
        data: config,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to get camera tamper config');
      return reply.status(500).send({
        success: false,
        error: err.message || 'Failed to get config',
      });
    }
  });

  // 9. Update Camera Configuration
  const updateConfigSchema = z.object({
    sensitivity: z.number().min(0).max(1).optional(),
    defocus_threshold: z.number().min(5).max(1000).optional(),
    blinding_threshold: z.number().min(180).max(255).optional(),
    covering_threshold: z.number().min(0).max(50).optional(),
    movement_threshold: z.number().min(0.1).max(1.0).optional(),
    spray_threshold: z.number().min(0.1).max(1.0).optional(),
    debounce_frames: z.number().int().min(1).max(30).optional(),
    auto_recalibrate_hours: z.number().int().min(1).max(168).optional(),
    alert_on_defocus: z.boolean().optional(),
    alert_on_blinding: z.boolean().optional(),
    alert_on_covering: z.boolean().optional(),
    alert_on_movement: z.boolean().optional(),
    alert_on_spray: z.boolean().optional(),
    enabled: z.boolean().optional(),
  });

  app.put('/v1/analytics/tamper/config/:cameraId', async (request: FastifyRequest<{ Params: { cameraId: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const { cameraId } = request.params;
      const body = updateConfigSchema.parse(request.body);

      const config = await tamperService.updateConfig({
        ...body,
        tenant_id: tenantId,
        camera_id: cameraId,
      });

      return reply.send({
        success: true,
        data: config,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to update camera tamper config');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Failed to update config',
      });
    }
  });

  // 10. Aggregated Tamper Analytics Statistics
  app.get('/v1/analytics/tamper/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const cameraId = (request.query as any)?.cameraId as string | undefined;

      const stats = await tamperService.getStats(tenantId, cameraId);
      return reply.send({
        success: true,
        data: stats,
      });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to retrieve tamper statistics');
      return reply.status(500).send({
        success: false,
        error: err.message || 'Failed to retrieve statistics',
      });
    }
  });
}
