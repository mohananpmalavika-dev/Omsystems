/**
 * Distributed Runtime State & Leases REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { distributedLeaseService } from '../services/distributed-lease.service.js';
import { cameraOwnershipService } from '../services/camera-ownership.service.js';
import { clusterStateService } from '../services/cluster-state.service.js';
import { alertDeduplicationService } from '../services/alert-deduplication.service.js';
import { NodeType } from '../domain/distributed-state.types.js';

export async function registerDistributedStateRoutes(app: FastifyInstance) {
  // 1. List Cluster Nodes & Health
  app.get('/v1/cluster/nodes', async (_request: FastifyRequest, reply: FastifyReply) => {
    const nodes = clusterStateService.listNodes();
    return reply.send({ success: true, data: nodes });
  });

  // 2. Node Heartbeat & Workload Registration
  app.post('/v1/cluster/nodes/heartbeat', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      nodeId: z.string(),
      nodeType: z.enum(['CONTROL_PLANE', 'MEDIA_GATEWAY', 'RECORDER', 'EDGE_AGENT']),
      address: z.string(),
      heartbeatTtlMs: z.number().optional(),
    }).parse(request.body);

    const node = clusterStateService.registerHeartbeat({
      nodeId: body.nodeId,
      nodeType: body.nodeType as NodeType,
      address: body.address,
      heartbeatTtlMs: body.heartbeatTtlMs,
    });

    return reply.send({ success: true, data: node });
  });

  // 3. List Active Distributed Leases
  app.get('/v1/cluster/leases', async (_request: FastifyRequest, reply: FastifyReply) => {
    const leases = distributedLeaseService.listActiveLeases();
    return reply.send({ success: true, data: leases });
  });

  // 4. Get Camera Ownership
  app.get('/v1/cluster/cameras/:cameraId/owner', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { cameraId: string };
    const owner = cameraOwnershipService.getCameraOwner(params.cameraId);
    if (!owner) return reply.code(404).send({ success: false, error: 'NO_ACTIVE_OWNER' });
    return reply.send({ success: true, data: owner });
  });

  // 5. Acquire Camera Ownership
  app.post('/v1/cluster/cameras/:cameraId/acquire', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { cameraId: string };
    const body = z.object({
      nodeId: z.string(),
      ttlMs: z.number().default(30000),
    }).parse(request.body);

    const ownership = cameraOwnershipService.acquireCamera(params.cameraId, body.nodeId, body.ttlMs);
    if (!ownership) return reply.code(409).send({ success: false, error: 'LEASE_COLLISION_OWNED_BY_ANOTHER_NODE' });
    return reply.status(201).send({ success: true, data: ownership });
  });

  // 6. Check Alert Deduplication
  app.post('/v1/cluster/alerts/dedup-check', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      tenantId: z.string().default('BANK-001'),
      branchId: z.string(),
      cameraId: z.string(),
      eventType: z.string(),
      severity: z.string(),
      windowMs: z.number().optional(),
    }).parse(request.body);

    const result = alertDeduplicationService.checkAndRecordAlert(body);
    return reply.send({ success: true, data: result });
  });
}
