/**
 * Fastify REST API Routes for Multi-Camera Person Re-Identification (Re-ID)
 * 
 * Endpoints for cross-camera sighting ingestion, forensic visual probe search,
 * global identity tracking, path/journey reconstruction, topology configuration, and telemetry.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { ReidService } from '../analytics/reid/reid-service.js';

export async function registerReIdRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  const pool = (store as any).pool || (store as any).db;
  const reidService = new ReidService(pool, store);

  const getTenantId = (req: FastifyRequest): string => {
    const user = (req as any).user;
    return user?.tenantId || (req.headers['x-tenant-id'] as string) || '00000000-0000-4000-8000-000000000000';
  };

  const getUserId = (req: FastifyRequest): string => {
    const user = (req as any).user;
    return user?.id || (req.headers['x-user-id'] as string) || '00000000-0000-4000-8000-000000000001';
  };

  // 1. Ingest Camera Tracklet Sighting & Embedding
  const ingestBodySchema = z.object({
    branchId: z.string().uuid().optional().nullable(),
    cameraId: z.string().min(1),
    localTrackId: z.string().min(1),
    enteredAt: z.string().datetime(),
    exitedAt: z.string().datetime(),
    embedding: z.array(z.number()).length(512).optional(),
    rawCropBase64: z.string().optional(),
    confidence: z.number().min(0).max(1).default(0.85),
    boundingBox: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
    }),
    snapshotUrl: z.string().optional().nullable(),
    metrics: z.record(z.any()).optional(),
    similarityThreshold: z.number().min(0.1).max(1.0).optional(),
  });

  app.post('/v1/analytics/reid/sightings', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = ingestBodySchema.parse(request.body);

      let rawCropRgb: { buffer: Uint8Array; width: number; height: number; channels: 3 } | undefined;
      if (body.rawCropBase64) {
        const buf = Buffer.from(body.rawCropBase64, 'base64');
        rawCropRgb = {
          buffer: new Uint8Array(buf),
          width: Math.round(body.boundingBox.width),
          height: Math.round(body.boundingBox.height),
          channels: 3,
        };
      }

      const result = await reidService.ingestSighting({
        tenantId,
        branchId: body.branchId,
        cameraId: body.cameraId,
        localTrackId: body.localTrackId,
        enteredAt: body.enteredAt,
        exitedAt: body.exitedAt,
        embedding: body.embedding,
        rawCropRgb,
        confidence: body.confidence,
        boundingBox: body.boundingBox,
        snapshotUrl: body.snapshotUrl,
        metrics: body.metrics,
        similarityThreshold: body.similarityThreshold,
      });

      return reply.status(201).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      request.log.error(err, 'Failed to ingest ReID sighting');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Invalid sighting payload',
      });
    }
  });

  // 2. Forensic Visual Probe Search Across All Cameras
  const probeBodySchema = z.object({
    probeEmbedding: z.array(z.number()).length(512).optional(),
    probeCropBase64: z.string().optional(),
    cropWidth: z.number().positive().optional(),
    cropHeight: z.number().positive().optional(),
    similarityThreshold: z.number().min(0.1).max(1.0).default(0.70),
    branchId: z.string().uuid().optional().nullable(),
    fromTime: z.string().datetime().optional(),
    toTime: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  });

  app.post('/v1/analytics/reid/probe', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const userId = getUserId(request);
      const body = probeBodySchema.parse(request.body);

      let probeCropRgb: { buffer: Uint8Array; width: number; height: number; channels: 3 } | undefined;
      if (body.probeCropBase64 && body.cropWidth && body.cropHeight) {
        const buf = Buffer.from(body.probeCropBase64, 'base64');
        probeCropRgb = {
          buffer: new Uint8Array(buf),
          width: body.cropWidth,
          height: body.cropHeight,
          channels: 3,
        };
      }

      if (!body.probeEmbedding && !probeCropRgb) {
        return reply.status(400).send({
          success: false,
          error: 'Must provide either probeEmbedding array or probeCropBase64 with dimensions',
        });
      }

      const result = await reidService.probeSearch({
        tenantId,
        probeEmbedding: body.probeEmbedding,
        probeCropRgb,
        similarityThreshold: body.similarityThreshold,
        branchId: body.branchId,
        fromTime: body.fromTime,
        toTime: body.toTime,
        limit: body.limit,
        createdBy: userId,
      });

      return reply.send({
        success: true,
        data: result.matches,
        total: result.totalMatches,
        probeId: result.probeId,
      });
    } catch (err: any) {
      request.log.error(err, 'Failed to perform ReID probe search');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Invalid probe search request',
      });
    }
  });

  // 3. List Global Person Identities
  const listIdentitiesSchema = z.object({
    branchId: z.string().uuid().optional(),
    status: z.enum(['active', 'archived']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  });

  app.get('/v1/analytics/reid/identities', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = listIdentitiesSchema.parse(request.query);

      const result = await reidService.getIdentities({
        tenantId,
        branchId: query.branchId,
        status: query.status,
        limit: query.limit,
        offset: query.offset,
      });

      return reply.send({
        success: true,
        data: result.identities,
        pagination: {
          total: result.total,
          limit: query.limit,
          offset: query.offset,
        },
      });
    } catch (err: any) {
      request.log.error(err, 'Failed to list ReID identities');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Invalid identity query parameters',
      });
    }
  });

  // 4. Get Global Identity Details
  app.get('/v1/analytics/reid/identities/:globalId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const { globalId } = request.params as { globalId: string };

      const identity = await reidService.getIdentity(globalId, tenantId);
      if (!identity) {
        return reply.status(404).send({
          success: false,
          error: `Global person identity '${globalId}' not found`,
        });
      }

      return reply.send({
        success: true,
        data: identity,
      });
    } catch (err: any) {
      request.log.error(err, 'Failed to get ReID identity');
      return reply.status(500).send({
        success: false,
        error: err.message || 'Internal server error',
      });
    }
  });

  // 5. Reconstruct Complete Multi-Camera Journey Timeline
  app.get('/v1/analytics/reid/journey/:globalId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const { globalId } = request.params as { globalId: string };

      const journey = await reidService.getPersonJourney(globalId, tenantId);
      if (!journey) {
        return reply.status(404).send({
          success: false,
          error: `Journey history for person '${globalId}' not found`,
        });
      }

      return reply.send({
        success: true,
        data: journey,
      });
    } catch (err: any) {
      request.log.error(err, 'Failed to reconstruct person journey');
      return reply.status(500).send({
        success: false,
        error: err.message || 'Internal server error',
      });
    }
  });

  // 6. Camera Topology Rules
  app.get('/v1/analytics/reid/topology', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = z.object({ branchId: z.string().uuid().optional() }).parse(request.query);

      const topology = await reidService.getTopology(tenantId, query.branchId);
      return reply.send({
        success: true,
        data: topology,
      });
    } catch (err: any) {
      request.log.error(err, 'Failed to get ReID topology');
      return reply.status(500).send({
        success: false,
        error: err.message || 'Internal server error',
      });
    }
  });

  const topologyBodySchema = z.object({
    branchId: z.string().uuid(),
    fromCameraId: z.string().min(1),
    toCameraId: z.string().min(1),
    minTransitSeconds: z.number().int().min(0).default(2),
    maxTransitSeconds: z.number().int().min(1).default(300),
    distanceMeters: z.number().positive().optional().nullable(),
    transitionProbability: z.number().min(0).max(1).default(1.0),
    enabled: z.boolean().default(true),
  });

  app.post('/v1/analytics/reid/topology', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const body = topologyBodySchema.parse(request.body);

      const rule = await reidService.setTopologyRule(tenantId, body);
      return reply.status(201).send({
        success: true,
        data: rule,
      });
    } catch (err: any) {
      request.log.error(err, 'Failed to update ReID topology rule');
      return reply.status(400).send({
        success: false,
        error: err.message || 'Invalid topology payload',
      });
    }
  });

  // 7. Re-ID Telemetry Statistics
  app.get('/v1/analytics/reid/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const stats = await reidService.getStats(tenantId);
      return reply.send({
        success: true,
        data: stats,
      });
    } catch (err: any) {
      request.log.error(err, 'Failed to get ReID statistics');
      return reply.status(500).send({
        success: false,
        error: err.message || 'Internal server error',
      });
    }
  });
}
