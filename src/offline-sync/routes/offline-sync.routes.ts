/**
 * Offline Sync REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { cloudSyncReplayer } from '../services/cloud-sync-replayer.service.js';
import { localEdgeSurvivability } from '../services/local-edge-survivability.service.js';

export async function registerOfflineSyncRoutes(app: FastifyInstance) {
  // 1. Ingest Sync Batch (Central Receiver)
  app.post('/v1/edge/sync/batch', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      batchId: z.string(),
      branchId: z.string(),
      generatedAt: z.string(),
      itemCount: z.number(),
      checksum: z.string(),
      items: z.array(z.object({
        id: z.string(),
        branchId: z.string(),
        type: z.enum(['P1_INCIDENTS', 'RECORDING_METADATA', 'AUDIT_LOGS', 'OPERATIONAL_EVENTS', 'HEALTH_TELEMETRY']),
        priority: z.number(),
        payload: z.record(z.unknown()),
        timestamp: z.string(),
        checksum: z.string(),
        retryCount: z.number(),
        status: z.enum(['QUEUED', 'SYNCING', 'SYNCED', 'FAILED']),
      })),
    }).parse(request.body);

    const ack = await cloudSyncReplayer.ingestSyncBatch(body as any);
    return reply.send({ success: true, data: ack });
  });

  // 2. Query Branch Connectivity & Backlog State (Migration 073)
  app.get('/v1/edge/sync/status/:branchId', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { branchId: string };
    const state = await cloudSyncReplayer.getBranchConnectivityStatus(params.branchId);
    return reply.send({ success: true, data: state });
  });

  // 3. Query Branch Backlog Metrics (Migration 073)
  app.get('/v1/edge/sync/metrics/:branchId', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { branchId: string };
    const metrics = await cloudSyncReplayer.getBranchBacklogMetrics(params.branchId);
    return reply.send({ success: true, data: metrics });
  });

  // 4. Query Cloud Sync Ingest Journal (Migration 073)
  app.get('/v1/edge/sync/journal/:branchId', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { branchId: string };
    const journal = await cloudSyncReplayer.listIngestJournal(params.branchId);
    return reply.send({ success: true, data: journal });
  });

  // 5. Ingest Bulk Video Backfill Chunk
  app.post('/v1/edge/sync/video-chunk', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      segmentId: z.string(),
      branchId: z.string(),
      cameraId: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      sizeBytes: z.number(),
      sha256: z.string(),
      dataBase64: z.string().optional(),
    }).parse(request.body);

    const result = await cloudSyncReplayer.ingestVideoChunk(body);
    return reply.send({ success: true, data: result });
  });

  // 6. Trigger Outbox Sync Replay
  app.post('/v1/edge/sync/trigger/:branchId', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { branchId: string };
    const result = await cloudSyncReplayer.replayPendingBacklogs(params.branchId);
    return reply.send({ success: true, data: result });
  });
}
