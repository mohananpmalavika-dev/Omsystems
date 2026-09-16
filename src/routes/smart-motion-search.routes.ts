import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { pool } from '../database/pool.js';
import { SmartMotionSearchService } from '../recording-index/smart-motion-search.service.js';

const searchSchema = z.object({
  cameraId: z.string().min(1),
  from: z.string().datetime(),
  to: z.string().datetime(),
  x1: z.coerce.number().min(0).max(1),
  y1: z.coerce.number().min(0).max(1),
  x2: z.coerce.number().min(0).max(1),
  y2: z.coerce.number().min(0).max(1),
  minIntensity: z.coerce.number().optional(),
});

const indexSchema = z.object({
  cameraId: z.string().min(1),
  segmentId: z.string().min(1),
  timestampStart: z.string().datetime(),
  timestampEnd: z.string().datetime(),
  gridWidth: z.number().int().min(4).max(64).default(16),
  gridHeight: z.number().int().min(4).max(64).default(16),
  motionBitmaskBase64: z.string().min(1),
  intensityScore: z.number().optional(),
});

export const smartMotionSearchService = new SmartMotionSearchService(pool || undefined);

export async function registerSmartMotionSearchRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  service: SmartMotionSearchService = smartMotionSearchService
): Promise<void> {
  app.get('/v1/recordings/smart-motion-search', async (request, reply) => {
    const query = searchSchema.parse(request.query);
    const camera = await store.getCamera(query.cameraId);
    if (!camera) {
      return reply.code(404).send({ error: 'camera_not_found', cameraId: query.cameraId });
    }

    const hits = await service.searchRoiMotion({
      tenantId: request.currentUser.tenantId,
      cameraId: query.cameraId,
      from: new Date(query.from),
      to: new Date(query.to),
      roi: {
        x1: Math.min(query.x1, query.x2),
        y1: Math.min(query.y1, query.y2),
        x2: Math.max(query.x1, query.x2),
        y2: Math.max(query.y1, query.y2),
      },
      minIntensity: query.minIntensity,
    });

    return reply.code(200).send({
      success: true,
      cameraId: query.cameraId,
      roi: { x1: query.x1, y1: query.y1, x2: query.x2, y2: query.y2 },
      count: hits.length,
      hits,
    });
  });

  app.post('/v1/recordings/smart-motion-index', async (request, reply) => {
    const body = indexSchema.parse(request.body);
    const camera = await store.getCamera(body.cameraId);
    if (!camera) {
      return reply.code(404).send({ error: 'camera_not_found', cameraId: body.cameraId });
    }

    const bitmask = Buffer.from(body.motionBitmaskBase64, 'base64');
    const id = await service.indexMotionGrid({
      tenantId: request.currentUser.tenantId,
      cameraId: body.cameraId,
      segmentId: body.segmentId,
      timestampStart: new Date(body.timestampStart),
      timestampEnd: new Date(body.timestampEnd),
      gridWidth: body.gridWidth,
      gridHeight: body.gridHeight,
      motionBitmask: bitmask,
      intensityScore: body.intensityScore,
    });

    return reply.code(201).send({ success: true, id });
  });
}
