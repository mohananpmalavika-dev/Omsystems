/**
 * Fastify REST API Routes for Smart Edge Mesh & Zero-Bandwidth Mode (Bandwidth Killer)
 *
 * Exposes endpoints for managing quiescent 1 FPS to 4K burst policies,
 * triggering AI-burst streaming, simulating WAN isolation and anti-jamming
 * local caching, and monitoring 70%+ bandwidth cost savings.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { EdgeMeshRepository } from '../edge-mesh/repositories/edge-mesh.repository.js';
import { ZeroBandwidthControllerService } from '../edge-mesh/services/zero-bandwidth-controller.service.js';
import { AntiJammingMeshService } from '../edge-mesh/services/anti-jamming-mesh.service.js';

export async function registerEdgeMeshRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  const pool = (store as any).pool || (store as any).db;
  const repository = new EdgeMeshRepository(pool);
  const zeroBwService = new ZeroBandwidthControllerService(repository);
  const antiJammingService = new AntiJammingMeshService(repository, store);

  // Subscribe to alert stream for dynamic 4K burst activations
  zeroBwService.startAlertSubscriber();

  const getTenantId = (req: FastifyRequest): string => {
    return (req.currentUser?.tenantId as string) || (req.headers['x-tenant-id'] as string) || 'default-tenant';
  };

  // 1. List Bandwidth Policies
  app.get('/v1/edge-mesh/policies', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const query = req.query as { branchId?: string; enabledOnly?: string };
      const policies = await repository.listPolicies(tenantId, {
        branchId: query.branchId,
        enabledOnly: query.enabledOnly === 'true',
      });
      return reply.send({ success: true, count: policies.length, data: policies });
    } catch (err: any) {
      req.log.error(err, 'Failed to list bandwidth policies');
      return reply.status(500).send({ success: false, error: err?.message || 'internal_error' });
    }
  });

  // 2. Create Bandwidth Policy
  const createPolicySchema = z.object({
    branchId: z.string().optional().nullable(),
    cameraId: z.string().optional().nullable(),
    name: z.string().min(2).max(128),
    enabled: z.boolean().optional(),
    quiescentFps: z.number().min(0.2).max(10).optional(),
    quiescentResolution: z.enum(['180p', '240p', '360p', '480p']).optional(),
    quiescentBitrateKbps: z.number().min(10).max(500).optional(),
    burstFps: z.number().min(15).max(60).optional(),
    burstResolution: z.enum(['1080p', '2K', '4K']).optional(),
    burstBitrateKbps: z.number().min(1000).max(12000).optional(),
    burstDurationSeconds: z.number().min(5).max(300).optional(),
    preBufferSeconds: z.number().min(0).max(60).optional(),
    triggerAlertTypes: z.array(z.string()).optional(),
    monthlyDataQuotaMb: z.number().optional(),
  });

  app.post('/v1/edge-mesh/policies', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const parsed = createPolicySchema.parse(req.body);
      const policy = await repository.createPolicy({
        ...parsed,
        tenantId,
      });
      return reply.status(201).send({ success: true, data: policy });
    } catch (err: any) {
      req.log.error(err, 'Failed to create bandwidth policy');
      return reply.status(err instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: err?.message || 'validation_error',
      });
    }
  });

  // 3. Get Stream State for Camera
  app.get('/v1/edge-mesh/stream-state/:cameraId', async (req: FastifyRequest<{ Params: { cameraId: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const query = req.query as { branchId?: string };
      const state = await zeroBwService.getCameraStreamState(tenantId, req.params.cameraId, query.branchId);
      return reply.send({ success: true, data: state });
    } catch (err: any) {
      req.log.error(err, 'Failed to get stream state');
      return reply.status(500).send({ success: false, error: err?.message || 'internal_error' });
    }
  });

  // 4. Trigger 4K Burst (AI detection simulation or manual trigger)
  const triggerBurstSchema = z.object({
    cameraId: z.string().min(1),
    branchId: z.string().default('branch-kochi-central'),
    alertId: z.string().default(`alert-test-${Date.now()}`),
    alertType: z.string().default('no_helmet_detected'),
  });

  app.post('/v1/edge-mesh/trigger-burst', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const parsed = triggerBurstSchema.parse(req.body);
      const result = await zeroBwService.handleAlertTrigger({
        tenantId,
        branchId: parsed.branchId,
        cameraId: parsed.cameraId,
        alertId: parsed.alertId,
        alertType: parsed.alertType,
      });
      return reply.send({ success: true, data: result });
    } catch (err: any) {
      req.log.error(err, 'Failed to trigger 4K burst');
      return reply.status(err instanceof z.ZodError ? 400 : 500).send({
        success: false,
        error: err?.message || 'trigger_burst_failed',
      });
    }
  });

  // 5. Operator Override (Toggle 4K Live Monitoring from NOC)
  const overrideSchema = z.object({
    cameraId: z.string().min(1),
    enableOverride: z.boolean(),
  });

  app.post('/v1/edge-mesh/operator-override', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const parsed = overrideSchema.parse(req.body);
      const state = await zeroBwService.setOperatorOverride(tenantId, parsed.cameraId, parsed.enableOverride);
      return reply.send({ success: true, data: state });
    } catch (err: any) {
      req.log.error(err, 'Failed to set operator override');
      return reply.status(500).send({ success: false, error: err?.message || 'internal_error' });
    }
  });

  // 6. List Edge Mesh Nodes
  app.get('/v1/edge-mesh/nodes', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const query = req.query as { branchId?: string };
      const nodes = await repository.listMeshNodes(tenantId, query.branchId);
      return reply.send({ success: true, count: nodes.length, data: nodes });
    } catch (err: any) {
      req.log.error(err, 'Failed to list mesh nodes');
      return reply.status(500).send({ success: false, error: err?.message || 'internal_error' });
    }
  });

  // 7. Simulate WAN Cable Cut / Cellular Jamming
  const isolateSchema = z.object({
    branchId: z.string().min(1),
    reason: z.string().optional(),
  });

  app.post('/v1/edge-mesh/simulate-wan-isolation', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const parsed = isolateSchema.parse(req.body);
      const result = await antiJammingService.handleWanIsolation(parsed);
      return reply.send({ success: true, data: result });
    } catch (err: any) {
      req.log.error(err, 'Failed to simulate WAN isolation');
      return reply.status(500).send({ success: false, error: err?.message || 'isolation_failed' });
    }
  });

  // 8. Simulate WAN Restoration & Store-and-Forward Replay
  app.post('/v1/edge-mesh/simulate-wan-restoration', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const parsed = z.object({ branchId: z.string().min(1) }).parse(req.body);
      const result = await antiJammingService.handleWanRestoration(parsed.branchId);
      return reply.send({ success: true, data: result });
    } catch (err: any) {
      req.log.error(err, 'Failed to simulate WAN restoration');
      return reply.status(500).send({ success: false, error: err?.message || 'restoration_failed' });
    }
  });

  // 9. Bandwidth Savings & ROI Telemetry
  app.get('/v1/edge-mesh/bandwidth-stats', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(req);
      const query = req.query as { branchId?: string };
      const stats = await repository.getBandwidthSummary(tenantId, query.branchId);
      return reply.send({ success: true, data: stats });
    } catch (err: any) {
      req.log.error(err, 'Failed to get bandwidth stats');
      return reply.status(500).send({ success: false, error: err?.message || 'internal_error' });
    }
  });
}
