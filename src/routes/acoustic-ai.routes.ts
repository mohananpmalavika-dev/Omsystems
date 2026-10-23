/**
 * Fastify REST API Routes for Acoustic AI (Audio Anomaly Detection & Blind-Spot Correlator)
 *
 * Exposes endpoints for real-time PCM audio evaluation, forensic incident ledger,
 * camera blind-spot spatial mapping, operator triage, and calibrated simulation.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AcousticAiRepository } from '../acoustic-ai/repositories/acoustic-ai.repository.js';
import { AcousticAiService } from '../acoustic-ai/services/acoustic-ai.service.js';
import type { ControlPlaneStore } from '../control-plane-store.js';

export async function registerAcousticAiRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  const pool = (store as any).pool || (store as any).db;
  const repo = new AcousticAiRepository(pool);
  const service = new AcousticAiService(repo, store);

  const getAuthenticatedUser = (req: FastifyRequest) => {
    const user = req.currentUser;
    if (user?.tenantId && user?.id) return user;

    if (process.env.NODE_ENV === 'test') {
      const tenantId = req.headers['x-tenant-id'];
      const userId = req.headers['x-user-id'];
      if (typeof tenantId === 'string' && tenantId) {
        return { tenantId, id: typeof userId === 'string' && userId ? userId : 'test-acoustic-user' };
      }
    }

    return { tenantId: 'default-tenant', id: 'operator-default' };
  };

  const getTenantId = (req: FastifyRequest): string => getAuthenticatedUser(req).tenantId;

  // 1. List Acoustic Rules
  app.get('/v1/acoustic-ai/rules', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const query = req.query as { branchId?: string; cameraId?: string };
      const rules = await service.listRules(tenantId, query);
      return reply.send({ success: true, count: rules.length, data: rules });
    } catch (err: any) {
      req.log.error(err, 'Failed to list acoustic AI rules');
      return reply.status(500).send({ success: false, error: err?.message || 'internal_error' });
    }
  });

  // 2. Create Acoustic Rule
  const createRuleSchema = z.object({
    branchId: z.string().optional().nullable(),
    cameraId: z.string().optional().nullable(),
    name: z.string().min(2).max(128),
    description: z.string().optional(),
    enabled: z.boolean().optional(),
    enabledSignatures: z.array(z.enum(['glass_break', 'screaming_aggression', 'gunshot_blast', 'shutter_tamper_breach', 'acoustic_spike', 'high_noise'])).optional(),
    minConfidence: z.number().min(0.1).max(1.0).optional(),
    glassSensitivity: z.number().min(0.1).max(1.0).optional(),
    screamSensitivity: z.number().min(0.1).max(1.0).optional(),
    gunshotSensitivity: z.number().min(0.1).max(1.0).optional(),
    shutterSensitivity: z.number().min(0.1).max(1.0).optional(),
    blindSpotAutoPtz: z.boolean().optional(),
    crossCameraAlert: z.boolean().optional(),
    cooldownSeconds: z.number().min(3).max(600).optional(),
  });

  app.post('/v1/acoustic-ai/rules', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const parsed = createRuleSchema.parse(req.body);
      const rule = await service.createRule({
        ...parsed,
        tenantId,
      });
      return reply.status(201).send({ success: true, data: rule });
    } catch (err: any) {
      req.log.error(err, 'Failed to create acoustic AI rule');
      return reply.status(err instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: err?.message || 'validation_error',
      });
    }
  });

  // 3. List Camera Blind Spots
  app.get('/v1/acoustic-ai/blind-spots', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const query = req.query as { cameraId?: string };
      const blindSpots = await service.listBlindSpots(tenantId, query.cameraId);
      return reply.send({ success: true, count: blindSpots.length, data: blindSpots });
    } catch (err: any) {
      req.log.error(err, 'Failed to list camera blind spots');
      return reply.status(500).send({ success: false, error: err?.message || 'internal_error' });
    }
  });

  // 4. Create Camera Blind Spot
  const createBlindSpotSchema = z.object({
    branchId: z.string().optional().nullable(),
    cameraId: z.string().min(1),
    zoneName: z.string().min(2).max(128),
    sectorType: z.enum(['rear_corridor', 'exterior_shutter', 'cash_vault_side', 'atm_vestibule', 'partition_blind_spot', 'stairwell', 'custom']).optional(),
    azimuthAngleDeg: z.number().min(0).max(360),
    estimatedDistanceM: z.number().min(1).max(100).optional(),
    targetPtzCameraId: z.string().optional().nullable(),
    targetPtzPresetId: z.number().int().min(1).max(128).optional(),
    targetPtzPanTilt: z.object({
      pan: z.number(),
      tilt: z.number(),
      zoom: z.number(),
    }).optional(),
    isActive: z.boolean().optional(),
    notes: z.string().optional(),
  });

  app.post('/v1/acoustic-ai/blind-spots', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const parsed = createBlindSpotSchema.parse(req.body);
      const blindSpot = await service.createBlindSpot({
        ...parsed,
        tenantId,
      });
      return reply.status(201).send({ success: true, data: blindSpot });
    } catch (err: any) {
      req.log.error(err, 'Failed to create camera blind spot');
      return reply.status(err instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: err?.message || 'validation_error',
      });
    }
  });

  // 5. Ingest and Analyze Live Audio Chunk
  const analyzeAudioSchema = z.object({
    branchId: z.string().optional(),
    cameraId: z.string().min(1),
    sampleRate: z.number().int().min(8000).max(48000).optional(),
    samples: z.array(z.number()).optional(),
    base64Pcm: z.string().optional(),
    visualTargetInFov: z.boolean().optional(),
    cameraAzimuthAngleDeg: z.number().min(0).max(360).optional(),
  });

  app.post('/v1/acoustic-ai/analyze', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const parsed = analyzeAudioSchema.parse(req.body);
      const result = await service.processAudioChunk({
        ...parsed,
        tenantId,
      });
      return reply.send({ success: true, data: result });
    } catch (err: any) {
      req.log.error(err, 'Failed to analyze acoustic chunk');
      return reply.status(err instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: err?.message || 'validation_error',
      });
    }
  });

  // 6. Simulate Acoustic Event (Calibrated Synthetic Test Generator)
  const simulateEventSchema = z.object({
    branchId: z.string().optional(),
    cameraId: z.string().min(1),
    signature: z.enum(['glass_break', 'screaming_aggression', 'gunshot_blast', 'shutter_tamper_breach']),
    visualTargetInFov: z.boolean().optional(),
    azimuthDeg: z.number().min(0).max(360).optional(),
  });

  app.post('/v1/acoustic-ai/simulate-event', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const parsed = simulateEventSchema.parse(req.body);
      const result = await service.simulateAnomaly(
        tenantId,
        parsed.branchId,
        parsed.cameraId,
        parsed.signature,
        {
          visualTargetInFov: parsed.visualTargetInFov,
          azimuthDeg: parsed.azimuthDeg,
        }
      );
      return reply.send({ success: true, data: result });
    } catch (err: any) {
      req.log.error(err, 'Failed to simulate acoustic anomaly event');
      return reply.status(500).send({ success: false, error: err?.message || 'simulation_error' });
    }
  });

  // 7. List Forensic Acoustic Anomaly Events
  app.get('/v1/acoustic-ai/events', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const query = req.query as {
        branchId?: string;
        cameraId?: string;
        signature?: string;
        blindSpotOnly?: string;
        status?: string;
        limit?: string;
      };

      const events = await service.listEvents(tenantId, {
        branchId: query.branchId,
        cameraId: query.cameraId,
        signature: query.signature,
        blindSpotOnly: query.blindSpotOnly === 'true',
        status: query.status,
        limit: query.limit ? parseInt(query.limit, 10) : 100,
      });

      return reply.send({ success: true, count: events.length, data: events });
    } catch (err: any) {
      req.log.error(err, 'Failed to list acoustic anomaly events');
      return reply.status(500).send({ success: false, error: err?.message || 'internal_error' });
    }
  });

  // 8. Acknowledge Forensic Event
  const acknowledgeSchema = z.object({
    notes: z.string().optional(),
  });

  app.post('/v1/acoustic-ai/events/:id/acknowledge', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = getAuthenticatedUser(req);
      const { id } = req.params as { id: string };
      const parsed = acknowledgeSchema.parse(req.body || {});
      const event = await service.acknowledgeEvent(id, user.id, parsed.notes);

      if (!event) {
        return reply.status(404).send({ success: false, error: 'event_not_found' });
      }

      return reply.send({ success: true, data: event });
    } catch (err: any) {
      req.log.error(err, 'Failed to acknowledge acoustic event');
      return reply.status(500).send({ success: false, error: err?.message || 'acknowledgement_error' });
    }
  });

  // 9. Get Fleet Acoustic Intelligence Stats
  app.get('/v1/acoustic-ai/stats', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const stats = await service.getStats(tenantId);
      return reply.send({ success: true, data: stats });
    } catch (err: any) {
      req.log.error(err, 'Failed to get fleet acoustic stats');
      return reply.status(500).send({ success: false, error: err?.message || 'internal_error' });
    }
  });
}
