/**
 * Fastify REST API Routes for Autonomous Voice Talk-Down AI (Active Deterrent)
 *
 * Exposes endpoints for managing restricted-zone active deterrence rules,
 * triggering automated evaluations, testing live camera speaker broadcasts,
 * viewing deterrence audit logs, and generating synthetic audio previews.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { DeterrentRepository } from '../deterrent/repositories/deterrent.repository.js';
import { AutonomousDeterrentService } from '../deterrent/services/autonomous-deterrent.service.js';
import { TalkbackRepository } from '../talkback/repositories/talkback.repository.js';

export async function registerAutonomousDeterrentRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  const pool = (store as any).pool || (store as any).db;
  const deterrentRepo = new DeterrentRepository(pool);
  const talkbackRepo = new TalkbackRepository(pool);
  const deterrentService = new AutonomousDeterrentService(deterrentRepo, store, talkbackRepo);

  // Start background alert subscriber
  deterrentService.startAlertSubscriber();

  const getAuthenticatedUser = (req: FastifyRequest) => {
    const user = req.currentUser;
    if (user?.tenantId && user?.id) return user;

    if (process.env.NODE_ENV === 'test') {
      const tenantId = req.headers['x-tenant-id'];
      const userId = req.headers['x-user-id'];
      if (typeof tenantId === 'string' && tenantId) {
        return { tenantId, id: typeof userId === 'string' && userId ? userId : 'test-deterrent-user' };
      }
    }

    // Default tenant fallback for ease of access in local development / kiosk
    return { tenantId: 'default-tenant', id: 'operator-default' };
  };

  const getTenantId = (req: FastifyRequest): string => getAuthenticatedUser(req).tenantId;

  // 1. List Deterrent Rules
  app.get('/v1/deterrent/rules', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const query = req.query as { branchId?: string; enabledOnly?: string };
      const rules = await deterrentRepo.listRules(tenantId, {
        branchId: query.branchId,
        enabledOnly: query.enabledOnly === 'true',
      });
      return reply.send({ success: true, count: rules.length, data: rules });
    } catch (err: any) {
      req.log.error(err, 'Failed to list deterrent rules');
      return reply.status(500).send({ success: false, error: err?.message || 'internal_error' });
    }
  });

  // 2. Create Deterrent Rule
  const createRuleSchema = z.object({
    branchId: z.string().optional().nullable(),
    cameraId: z.string().optional().nullable(),
    name: z.string().min(2).max(128),
    description: z.string().optional(),
    enabled: z.boolean().optional(),
    zoneTypes: z.array(z.string()).optional(),
    scheduleType: z.enum(['24x7', 'after_hours', 'custom']).optional(),
    scheduleStartTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
    scheduleEndTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
    scheduleDaysOfWeek: z.array(z.number().min(0).max(6)).optional(),
    detectionTypes: z.array(z.string()).optional(),
    primaryLanguage: z.enum(['ml', 'en', 'hi', 'bilingual_ml_en']).optional(),
    customWarningText: z.string().optional(),
    sirenEnabled: z.boolean().optional(),
    strobeEnabled: z.boolean().optional(),
    cooldownSeconds: z.number().min(10).max(3600).optional(),
    escalationEnabled: z.boolean().optional(),
    escalationWindowSeconds: z.number().min(30).max(3600).optional(),
  });

  app.post('/v1/deterrent/rules', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const parsed = createRuleSchema.parse(req.body);
      const rule = await deterrentRepo.createRule({
        ...parsed,
        tenantId,
      });
      return reply.status(201).send({ success: true, data: rule });
    } catch (err: any) {
      req.log.error(err, 'Failed to create deterrent rule');
      return reply.status(err instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: err?.message || 'validation_error',
      });
    }
  });

  // 3. Get Rule Details
  app.get('/v1/deterrent/rules/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const rule = await deterrentRepo.getRule(req.params.id);
      if (!rule) {
        return reply.status(404).send({ success: false, error: 'rule_not_found' });
      }
      return reply.send({ success: true, data: rule });
    } catch (err: any) {
      req.log.error(err, 'Failed to get rule');
      return reply.status(500).send({ success: false, error: err?.message || 'internal_error' });
    }
  });

  // 4. Update Rule
  app.put('/v1/deterrent/rules/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const updates = req.body as any;
      const updated = await deterrentRepo.updateRule(req.params.id, updates);
      if (!updated) {
        return reply.status(404).send({ success: false, error: 'rule_not_found' });
      }
      return reply.send({ success: true, data: updated });
    } catch (err: any) {
      req.log.error(err, 'Failed to update rule');
      return reply.status(500).send({ success: false, error: err?.message || 'internal_error' });
    }
  });

  // 5. Delete Rule
  app.delete('/v1/deterrent/rules/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const deleted = await deterrentRepo.deleteRule(req.params.id);
      return reply.send({ success: deleted });
    } catch (err: any) {
      req.log.error(err, 'Failed to delete rule');
      return reply.status(500).send({ success: false, error: err?.message || 'internal_error' });
    }
  });

  // 6. Evaluate Detection / Trigger Active Deterrent
  const evaluateSchema = z.object({
    cameraId: z.string().min(1),
    branchId: z.string().optional(),
    detectionType: z.string().default('person_detected'),
    zoneType: z.string().optional(),
    alertId: z.string().optional(),
    timestamp: z.string().optional(),
  });

  app.post('/v1/deterrent/evaluate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const parsed = evaluateSchema.parse(req.body);
      const result = await deterrentService.evaluateAlert({
        tenantId,
        cameraId: parsed.cameraId,
        branchId: parsed.branchId,
        detectionType: parsed.detectionType,
        zoneType: parsed.zoneType,
        alertId: parsed.alertId,
        timestamp: parsed.timestamp,
      });

      return reply.send({ success: true, data: result });
    } catch (err: any) {
      req.log.error(err, 'Failed to evaluate deterrent');
      return reply.status(err instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: err?.message || 'evaluation_failed',
      });
    }
  });

  // 7. Manual Test Broadcast to Camera Edge Speaker
  const testBroadcastSchema = z.object({
    cameraId: z.string().min(1),
    language: z.enum(['ml', 'en', 'hi', 'bilingual_ml_en']).optional(),
    customText: z.string().optional(),
    includeStrobe: z.boolean().optional(),
    includeSiren: z.boolean().optional(),
    escalated: z.boolean().optional(),
  });

  app.post('/v1/deterrent/test-broadcast', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const parsed = testBroadcastSchema.parse(req.body);
      const result = await deterrentService.testBroadcast({
        tenantId,
        cameraId: parsed.cameraId,
        language: parsed.language,
        customText: parsed.customText,
        includeStrobe: parsed.includeStrobe,
        includeSiren: parsed.includeSiren,
        escalated: parsed.escalated,
      });

      return reply.send({ success: true, data: result });
    } catch (err: any) {
      req.log.error(err, 'Failed test broadcast');
      return reply.status(err instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: err?.message || 'broadcast_failed',
      });
    }
  });

  // 8. Deterrent Audit Logs
  app.get('/v1/deterrent/logs', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const query = req.query as { branchId?: string; cameraId?: string; limit?: string; offset?: string };
      const limit = query.limit ? parseInt(query.limit, 10) : 50;
      const offset = query.offset ? parseInt(query.offset, 10) : 0;

      const { logs, total } = await deterrentRepo.listLogs({
        tenantId,
        branchId: query.branchId,
        cameraId: query.cameraId,
        limit,
        offset,
      });

      return reply.send({ success: true, total, data: logs });
    } catch (err: any) {
      req.log.error(err, 'Failed to fetch deterrent logs');
      return reply.status(500).send({ success: false, error: err?.message || 'internal_error' });
    }
  });

  // 9. Operational Deterrence Telemetry & Statistics
  app.get('/v1/deterrent/stats', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const stats = await deterrentRepo.getDeterrentStats(tenantId);
      return reply.send({ success: true, data: stats });
    } catch (err: any) {
      req.log.error(err, 'Failed to get deterrent stats');
      return reply.status(500).send({ success: false, error: err?.message || 'internal_error' });
    }
  });

  // 10. In-browser Audio Preview Endpoint (Returns real WAV buffer)
  app.get('/v1/deterrent/audio-preview', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = req.query as { language?: string; escalated?: string };
      const language = query.language || 'ml';
      const escalated = query.escalated === 'true';

      const audioBuffer = deterrentService.getAudioBuffer(language, escalated);
      reply.header('Content-Type', 'audio/wav');
      reply.header('Content-Disposition', `inline; filename="deterrent-${language}.wav"`);
      reply.header('Cache-Control', 'public, max-age=3600');
      return reply.send(audioBuffer);
    } catch (err: any) {
      req.log.error(err, 'Failed to generate audio preview');
      return reply.status(500).send({ success: false, error: err?.message || 'audio_generation_failed' });
    }
  });
}
