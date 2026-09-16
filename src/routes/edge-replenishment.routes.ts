import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { pool } from '../database/pool.js';
import { EdgeReplenishmentService, ReplenishmentStatus } from '../recording-continuity/services/edge-replenishment.service.js';

const triggerSchema = z.object({
  cameraId: z.string().min(1),
  gapStart: z.string().datetime(),
  gapEnd: z.string().datetime(),
  throttleKbps: z.number().int().min(100).max(100000).default(500),
  totalBytesEstimate: z.number().int().positive().optional(),
});

const progressSchema = z.object({
  bytesTransferred: z.number().int().min(0),
  totalBytes: z.number().int().positive(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED']),
  errorMessage: z.string().optional(),
});

export const edgeReplenishmentService = new EdgeReplenishmentService(pool || undefined);

export async function registerEdgeReplenishmentRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  service: EdgeReplenishmentService = edgeReplenishmentService
): Promise<void> {
  app.get('/v1/recording-continuity/replenishment-jobs', async (request, reply) => {
    const query = request.query as { status?: ReplenishmentStatus };
    const jobs = await service.listJobs(request.currentUser.tenantId, query.status);
    return reply.code(200).send({ success: true, count: jobs.length, jobs });
  });

  app.post('/v1/recording-continuity/trigger-replenishment', async (request, reply) => {
    const body = triggerSchema.parse(request.body);
    const camera = await store.getCamera(body.cameraId);
    if (!camera) {
      return reply.code(404).send({ error: 'camera_not_found', cameraId: body.cameraId });
    }

    const job = await service.queueJob({
      tenantId: request.currentUser.tenantId,
      cameraId: body.cameraId,
      gapStart: new Date(body.gapStart),
      gapEnd: new Date(body.gapEnd),
      throttleKbps: body.throttleKbps,
      totalBytesEstimate: body.totalBytesEstimate,
    });

    return reply.code(201).send({ success: true, job });
  });

  app.post('/v1/recording-continuity/replenishment-jobs/:id/progress', async (request, reply) => {
    const params = request.params as { id: string };
    const body = progressSchema.parse(request.body);

    const ok = await service.updateProgress(
      params.id,
      body.bytesTransferred,
      body.totalBytes,
      body.status,
      body.errorMessage
    );

    if (!ok) {
      return reply.code(404).send({ error: 'job_not_found' });
    }

    return reply.code(200).send({ success: true, status: body.status });
  });
}
