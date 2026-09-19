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

  const getAuthenticatedUser = (req: FastifyRequest) => {
    const user = req.currentUser;
    if (user?.tenantId && user?.id) return user;

    // The isolated route tests register Fastify without the control-plane auth
    // hook. Header identities are kept exclusively for that test adapter.
    if (process.env.NODE_ENV === 'test') {
      const tenantId = req.headers['x-tenant-id'];
      const userId = req.headers['x-user-id'];
      if (typeof tenantId === 'string' && tenantId) {
        return { tenantId, id: typeof userId === 'string' && userId ? userId : 'test-route-user' };
      }
    }

    throw Object.assign(new Error('Authentication is required for Person Re-ID.'), {
      statusCode: 401,
      code: 'unauthenticated',
    });
  };

  const getTenantId = (req: FastifyRequest): string => getAuthenticatedUser(req).tenantId;
  const getUserId = (req: FastifyRequest): string => getAuthenticatedUser(req).id;

  const sendRouteError = (request: FastifyRequest, reply: FastifyReply, err: any, fallbackStatus: number, fallbackMessage: string) => {
    request.log.error(err, fallbackMessage);
    return reply.status(err?.statusCode || fallbackStatus).send({
      success: false,
      error: err?.message || fallbackMessage,
      ...(err?.code ? { code: err.code } : {}),
    });
  };

  // 1. Ingest Camera Tracklet Sighting & Embedding
  const ingestBodySchema = z.object({
    branchId: z.string().uuid().optional().nullable(),
    cameraId: z.string().min(1),
    localTrackId: z.string().min(1),
    enteredAt: z.string().datetime(),
    exitedAt: z.string().datetime(),
    embedding: z.array(z.number()).length(512).optional(),
    rawCropBase64: z.string().max(8_000_000).optional(),
    confidence: z.number().min(0).max(1).default(0.85),
    boundingBox: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number().positive().max(4096),
      height: z.number().positive().max(4096),
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
        const expectedBytes = Math.round(body.boundingBox.width) * Math.round(body.boundingBox.height) * 3;
        if (buf.length !== expectedBytes) {
          return reply.status(400).send({ success: false, error: 'rawCropBase64 byte length does not match boundingBox dimensions' });
        }
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
      return sendRouteError(request, reply, err, 400, 'Invalid sighting payload');
    }
  });

  // 2. Forensic Visual Probe Search Across All Cameras
  const probeBodySchema = z.object({
    probeEmbedding: z.array(z.number()).length(512).optional(),
    probeCropBase64: z.string().max(2_000_000).optional(),
    cropWidth: z.number().positive().max(640).optional(),
    cropHeight: z.number().positive().max(640).optional(),
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
        const expectedBytes = Math.round(body.cropWidth) * Math.round(body.cropHeight) * 3;
        if (buf.length !== expectedBytes) {
          return reply.status(400).send({ success: false, error: 'probeCropBase64 byte length does not match crop dimensions' });
        }
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
      return sendRouteError(request, reply, err, 400, 'Invalid probe search request');
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
      return sendRouteError(request, reply, err, 400, 'Invalid identity query parameters');
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
      return sendRouteError(request, reply, err, 500, 'Failed to get ReID identity');
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
      return sendRouteError(request, reply, err, 500, 'Failed to reconstruct person journey');
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
      return sendRouteError(request, reply, err, 500, 'Failed to get ReID topology');
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
      return sendRouteError(request, reply, err, 400, 'Invalid topology payload');
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
      return sendRouteError(request, reply, err, 500, 'Failed to get ReID statistics');
    }
  });
}
