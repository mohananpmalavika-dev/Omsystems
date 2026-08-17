/**
 * Offline Sync REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { cloudSyncReplayer } from '../services/cloud-sync-replayer.service.js';
import { localEdgeSurvivability } from '../services/local-edge-survivability.service.js';
import { ConnectivityState } from '../domain/offline-sync.types.js';

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

    const ack = cloudSyncReplayer.ingestSyncBatch(body as any);
    return reply.send({ success: true, data: ack });
  });

  // 2. Query Branch Connectivity & Backlog State
  app.get('/v1/edge/sync/status/:branchId', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { branchId: string };
    const state = localEdgeSurvivability.getBranchState(params.branchId);
    return reply.send({ success: true, data: state });
  });

  // 3. Trigger Outbox Sync Replay
  app.post('/v1/edge/sync/trigger/:branchId', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { branchId: string };
    const result = await cloudSyncReplayer.replayPendingBacklogs(params.branchId);
    return reply.send({ success: true, data: result });
  });

  // 4. Simulate WAN Outage / Recovery (Testing & Chaos Engineering)
  app.post('/v1/edge/offline/simulate-outage', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      branchId: z.string(),
      state: z.enum(['ONLINE', 'DEGRADED', 'OFFLINE', 'RECONNECTING', 'SYNCING']),
    }).parse(request.body);

    localEdgeSurvivability.setConnectivityState(body.state as ConnectivityState);
    return reply.send({ success: true, message: `Branch ${body.branchId} connectivity set to ${body.state}` });
  });
}
