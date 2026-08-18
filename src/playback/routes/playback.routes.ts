/**
 * First-Class Playback REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { playbackCoordinator } from '../services/playback-coordinator.service.js';
import { IncidentPlaybackService } from '../services/incident-playback.service.js';
import { investigationSessionService } from '../services/investigation-session.service.js';
import { PlaybackSpeed, PlaybackDirection } from '../domain/playback.types.js';

const incidentPlaybackService = new IncidentPlaybackService(playbackCoordinator);

export async function registerFirstClassPlaybackRoutes(app: FastifyInstance) {
  // 1. Create Playback Session
  app.post('/v1/playback/sessions', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      cameraIds: z.array(z.string()).min(1),
      startTime: z.string().default(new Date().toISOString()),
      mode: z.enum(['SINGLE', 'SYNCHRONIZED', 'INCIDENT']).optional(),
      speed: z.number().optional(),
    }).parse(request.body);

    const session = playbackCoordinator.createSession({
      cameraIds: body.cameraIds,
      startTime: body.startTime,
      mode: body.mode,
      speed: body.speed as PlaybackSpeed,
    });

    return reply.status(201).send({ success: true, data: session });
  });

  // 2. Get Session State
  app.get('/v1/playback/sessions/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const session = playbackCoordinator.getSession(params.id);
    if (!session) return reply.code(404).send({ success: false, error: 'PLAYBACK_SESSION_NOT_FOUND' });
    return reply.send({ success: true, data: session });
  });

  // 3. Play / Pause
  app.post('/v1/playback/sessions/:id/play', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const session = playbackCoordinator.play(params.id);
    return reply.send({ success: true, data: session });
  });

  app.post('/v1/playback/sessions/:id/pause', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const session = playbackCoordinator.pause(params.id);
    return reply.send({ success: true, data: session });
  });

  // 4. Seek (Go-to-Time)
  app.post('/v1/playback/sessions/:id/seek', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const body = z.object({ targetTimestamp: z.string() }).parse(request.body);
    const session = playbackCoordinator.seek(params.id, body.targetTimestamp);
    return reply.send({ success: true, data: session });
  });

  // 5. Speed & Direction
  app.post('/v1/playback/sessions/:id/speed', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const body = z.object({ speed: z.number() }).parse(request.body);
    const session = playbackCoordinator.setSpeed(params.id, body.speed as PlaybackSpeed);
    return reply.send({ success: true, data: session });
  });

  app.post('/v1/playback/sessions/:id/direction', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const body = z.object({ direction: z.enum(['FORWARD', 'REVERSE']) }).parse(request.body);
    const session = playbackCoordinator.setDirection(params.id, body.direction as PlaybackDirection);
    return reply.send({ success: true, data: session });
  });

  // 6. Frame Stepping
  app.post('/v1/playback/sessions/:id/frame/next', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const session = playbackCoordinator.stepFrameForward(params.id);
    return reply.send({ success: true, data: session });
  });

  app.post('/v1/playback/sessions/:id/frame/previous', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const session = playbackCoordinator.stepFrameBackward(params.id);
    return reply.send({ success: true, data: session });
  });

  // 7. Event Jumping
  app.post('/v1/playback/sessions/:id/events/jump', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const body = z.object({
      direction: z.enum(['NEXT', 'PREVIOUS']),
      types: z.array(z.string()).optional(),
    }).parse(request.body);

    const session = playbackCoordinator.jumpToEvent(params.id, body.direction, body.types);
    return reply.send({ success: true, data: session });
  });

  // 8. Unified Multi-Track Timeline
  app.get('/v1/playback/timeline', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as any;
    const from = query.from || new Date(Date.now() - 86400_000).toISOString();
    const to = query.to || new Date().toISOString();
    const cameraId = query.cameraId || 'CAM-14';

    const timeline = playbackCoordinator.timelineService.getTimeline({
      cameraId,
      from,
      to,
    });

    return reply.send({ success: true, data: timeline });
  });

  // 9. Bookmarks
  app.post('/v1/playback/bookmarks', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      sessionId: z.string(),
      title: z.string(),
      description: z.string().optional(),
    }).parse(request.body);

    const bookmark = playbackCoordinator.addBookmark(body.sessionId, body.title, body.description);
    return reply.status(201).send({ success: true, data: bookmark });
  });

  // 10. Open Incident-Centered Playback
  app.post('/v1/playback/incidents/:incidentId/open', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { incidentId: string };
    const body = z.object({
      alertTimestamp: z.string().default(new Date().toISOString()),
      primaryCameraId: z.string().default('VAULT-01'),
      userId: z.string().default('usr-operator-01'),
    }).parse(request.body);

    const result = incidentPlaybackService.openIncidentSession({
      incidentId: params.incidentId,
      alertTimestamp: body.alertTimestamp,
      primaryCameraId: body.primaryCameraId,
      userId: body.userId,
    });

    return reply.send({ success: true, data: result });
  });

  // 11. Clip Marked Range into Evidence Package
  app.post('/v1/playback/evidence-clip', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      sessionId: z.string(),
      inTimestamp: z.string(),
      outTimestamp: z.string(),
      cameraIds: z.array(z.string()).min(1),
      reason: z.string().default('Investigation Evidence Export'),
      incidentId: z.string().optional(),
      investigatorUserId: z.string().default('investigator-anand'),
    }).parse(request.body);

    const pkg = incidentPlaybackService.createEvidencePackageFromClip(body as any);
    return reply.status(201).send({ success: true, data: pkg });
  });

  /**
   * Synchronized Multi-Camera Investigation Subsystem Endpoints
   */
  // 12. Create Synchronized Investigation Session
  app.post('/v1/playback/investigations', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      tenantId: z.string().default('BANK-001'),
      userId: z.string().default('investigator-anand'),
      cameraIds: z.array(z.string()).min(1),
      startUtc: z.string().default(new Date().toISOString()),
      synchronizationToleranceMs: z.number().int().positive().default(100),
    }).parse(request.body);

    const session = investigationSessionService.createSession({
      tenantId: body.tenantId,
      userId: body.userId,
      cameraIds: body.cameraIds,
      startUtcMs: new Date(body.startUtc).getTime(),
      synchronizationToleranceMs: body.synchronizationToleranceMs,
    });

    const camerasArray = Array.from(session.cameras.values());
    return reply.status(201).send({
      success: true,
      data: {
        ...session,
        cameras: camerasArray,
      },
    });
  });

  // 13. Get Investigation Session State
  app.get('/v1/playback/investigations/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const session = investigationSessionService.getSession(params.id);
    if (!session) return reply.code(404).send({ success: false, error: 'INVESTIGATION_SESSION_NOT_FOUND' });
    const camerasArray = Array.from(session.cameras.values());
    return reply.send({ success: true, data: { ...session, cameras: camerasArray } });
  });

  // 14. Synchronized Seek (Barrier-based)
  app.post('/v1/playback/investigations/:id/seek', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const body = z.object({ utc: z.string() }).parse(request.body);
    const targetUtcMs = new Date(body.utc).getTime();
    const result = investigationSessionService.seek(params.id, targetUtcMs);
    const camerasArray = Array.from(result.session.cameras.values());
    return reply.send({
      success: true,
      data: {
        ...result.session,
        cameras: camerasArray,
        barrierPassed: result.barrierPassed,
      },
    });
  });

  // 15. Investigation Play / Pause
  app.post('/v1/playback/investigations/:id/play', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const body = z.object({ rate: z.number().default(1.0) }).parse(request.body || {});
    const session = investigationSessionService.play(params.id, body.rate);
    const camerasArray = Array.from(session.cameras.values());
    return reply.send({ success: true, data: { ...session, cameras: camerasArray } });
  });

  app.post('/v1/playback/investigations/:id/pause', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const session = investigationSessionService.pause(params.id);
    const camerasArray = Array.from(session.cameras.values());
    return reply.send({ success: true, data: { ...session, cameras: camerasArray } });
  });

  // 16. Deterministic Frame Step
  app.post('/v1/playback/investigations/:id/step', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const body = z.object({
      mode: z.enum(['SHARED_TIME', 'CAMERA_PHYSICAL']).default('SHARED_TIME'),
      targetCameraId: z.string().optional(),
    }).parse(request.body || {});
    const session = investigationSessionService.stepFrame(params.id, body.mode, body.targetCameraId);
    const camerasArray = Array.from(session.cameras.values());
    return reply.send({ success: true, data: { ...session, cameras: camerasArray } });
  });

  // 17. Sync Tick & Dynamic Drift Monitor
  app.post('/v1/playback/investigations/:id/sync-tick', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const body = z.object({ elapsedWallClockMs: z.number().default(1000) }).parse(request.body || {});
    const result = investigationSessionService.syncTick(params.id, body.elapsedWallClockMs);
    return reply.send({ success: true, data: result });
  });

  // 18. Forensic Evidence Clock Metadata
  app.get('/v1/playback/investigations/:id/evidence-metadata', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const meta = investigationSessionService.getForensicEvidenceMetadata(params.id);
    return reply.send({ success: true, data: meta });
  });
}
