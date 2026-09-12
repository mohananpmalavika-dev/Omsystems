/**
 * Fastify Routes for Two-Way Audio Talkback
 *
 * Authoritative production endpoints for real-time bidirectional push-to-talk,
 * mutual exclusion lease acquisition, heartbeats, supervisor termination,
 * historical session search, and hardware capability verification.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { TalkbackRepository } from '../talkback/repositories/talkback.repository.js';
import { TalkbackService, TalkbackServiceError } from '../talkback/services/talkback.service.js';

const idParams = z.object({ id: z.string().min(1) });
const sessionParams = z.object({ id: z.string().min(1), sessionId: z.string().min(1) });

export async function registerTalkbackRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  const pool = (store as any).pool || (store as any).db;
  const repository = new TalkbackRepository(pool);
  const talkbackService = new TalkbackService(repository, store);

  const getClientIp = (req: FastifyRequest): string => {
    return req.ip || (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || '127.0.0.1';
  };

  const getUserAgent = (req: FastifyRequest): string => {
    return (req.headers['user-agent'] as string) || 'unknown';
  };

  /**
   * 1. GET /v1/cameras/:id/talk-sessions/active
   * Get current active talkback state and lease on a camera
   */
  app.get('/v1/cameras/:id/talk-sessions/active', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = idParams.parse(request.params);
      const activeState = await talkbackService.getActiveSession(id);
      return reply.send(activeState);
    } catch (err: any) {
      request.log.error({ err }, 'Failed to query active talk session');
      return reply.status(err.statusCode || 500).send({
        error: err.code || 'talk_session_query_failed',
        message: err.message,
      });
    }
  });

  /**
   * 2. POST /v1/cameras/:id/talk-sessions/:sessionId/heartbeat
   * Renew active push-to-talk lease
   */
  app.post('/v1/cameras/:id/talk-sessions/:sessionId/heartbeat', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id, sessionId } = sessionParams.parse(request.params);
      const body = z.object({ ttlMs: z.number().int().min(5000).max(120000).optional() }).parse(request.body || {});
      const renewed = await talkbackService.heartbeatSession(id, sessionId, body.ttlMs);
      if (!renewed) {
        return reply.status(404).send({ error: 'lease_not_found_or_expired' });
      }
      return reply.send({ status: 'renewed', leaseActive: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'heartbeat_failed' });
    }
  });

  /**
   * 3. DELETE /v1/cameras/:id/talk-sessions/:sessionId
   * Cleanly end an operator's push-to-talk session
   */
  app.delete('/v1/cameras/:id/talk-sessions/:sessionId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id, sessionId } = sessionParams.parse(request.params);
      const user = (request as any).currentUser || (request as any).user;
      if (!user) return reply.status(401).send({ error: 'unauthorized' });

      const completed = await talkbackService.endTalkSession(id, sessionId, user);
      return reply.send({ status: 'ended', session: completed });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'talk_stop_failed' });
    }
  });

  /**
   * 4. POST /v1/cameras/:id/talk-sessions/:sessionId/terminate
   * Emergency / Supervisor kill switch to terminate any active talk session
   */
  app.post('/v1/cameras/:id/talk-sessions/:sessionId/terminate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { sessionId } = sessionParams.parse(request.params);
      const user = (request as any).currentUser || (request as any).user;
      if (!user) return reply.status(401).send({ error: 'unauthorized' });

      const body = z.object({ reason: z.string().max(200).optional() }).parse(request.body || {});
      const terminated = await talkbackService.terminateSession({
        sessionId,
        terminatedByUserId: user.id,
        reason: body.reason,
      });

      if (!terminated) {
        return reply.status(404).send({ error: 'talk_session_not_found' });
      }
      return reply.send({ status: 'terminated', session: terminated });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'terminate_failed' });
    }
  });

  /**
   * 5. GET /v1/talk-sessions/history
   * Query historical talkback sessions with pagination and filters
   */
  const historyQuerySchema = z.object({
    cameraId: z.string().optional(),
    userId: z.string().optional(),
    status: z.enum(['initiating', 'active', 'completed', 'terminated', 'failed']).optional(),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  });

  app.get('/v1/talk-sessions/history', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).currentUser || (request as any).user;
      const tenantId = user?.tenantId || (request.headers['x-tenant-id'] as string) || 'default-tenant';
      const query = historyQuerySchema.parse(request.query);

      const result = await talkbackService.listHistory({
        tenantId,
        cameraId: query.cameraId,
        userId: query.userId,
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
      request.log.error({ err }, 'Failed to query talkback session history');
      return reply.status(400).send({ error: err.message || 'history_query_failed' });
    }
  });

  /**
   * 6. GET /v1/talk-sessions/stats
   * Aggregated operational telemetry for talkback subsystem
   */
  app.get('/v1/talk-sessions/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).currentUser || (request as any).user;
      const tenantId = user?.tenantId || (request.headers['x-tenant-id'] as string);
      const stats = await talkbackService.getTelemetryStats(tenantId);
      return reply.send(stats);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'stats_query_failed' });
    }
  });

  /**
   * 7. GET /v1/cameras/:id/talkback/capability
   * Retrieve or probe camera talkback capability
   */
  app.get('/v1/cameras/:id/talkback/capability', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = idParams.parse(request.params);
      const capability = await talkbackService.getDeviceCapability(id);
      return reply.send(capability);
    } catch (err: any) {
      if (err instanceof TalkbackServiceError) {
        return reply.status(err.statusCode).send({ error: err.code, message: err.message });
      }
      return reply.status(500).send({ error: 'capability_query_failed', message: err.message });
    }
  });

  /**
   * 8. POST /v1/cameras/:id/talkback/test
   * Diagnostics probe for camera backchannel
   */
  app.post('/v1/cameras/:id/talkback/test', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = idParams.parse(request.params);
      const camera = await store.getCamera(id);
      if (!camera) return reply.status(404).send({ error: 'camera_not_found' });

      const capability = await talkbackService.getDeviceCapability(id);
      return reply.send({
        status: capability.supported ? 'healthy' : 'unsupported',
        transport: capability.transport,
        codecs: capability.codecs,
        sampleRates: capability.sample_rates,
        verifiedAt: capability.verified_at,
        diagnostics: {
          audioHardware: Boolean(camera.capabilities?.audio),
          twoWayAdvertised: Boolean(camera.capabilities?.talkback?.supported),
          channel: camera.channel || 1,
          vendor: camera.vendor,
          protocol: camera.protocol,
        },
      });
    } catch (err: any) {
      return reply.status(500).send({ error: 'test_failed', message: err.message });
    }
  });

  // Attach talkbackService to store for cross-module accessibility
  (store as any).talkbackService = talkbackService;
  (store as any).talkbackRepository = repository;
}
