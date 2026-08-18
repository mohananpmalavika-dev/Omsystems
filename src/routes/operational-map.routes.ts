import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { operationalMapService, OperationalMapService } from '../operations/services/operational-map.service.js';

export async function registerOperationalMapRoutes(
  app: FastifyInstance,
  service: OperationalMapService = operationalMapService
) {
  // 1. Get Country Root Node (India)
  app.get('/v1/maps/operational/root', async () => {
    const root = await service.getRootNode();
    return { success: true, data: root };
  });

  // 2. Get Child Nodes for Drill-Down (India -> State -> Region -> Branch)
  app.get('/v1/maps/operational/nodes/:nodeId/children', async (request: FastifyRequest) => {
    const { nodeId } = request.params as { nodeId: string };
    const children = await service.getChildrenNodes(nodeId);
    return { success: true, count: children.length, data: children };
  });

  // 3. Get Node Details
  app.get('/v1/maps/operational/nodes/:nodeId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { nodeId } = request.params as { nodeId: string };
    const node = await service.getNodeDetails(nodeId);
    if (!node) return reply.code(404).send({ success: false, error: 'Node not found' });
    return { success: true, data: node };
  });

  // 4. "Why Red?" Root-Cause Explanation
  app.get('/v1/maps/operational/nodes/:nodeId/causes', async (request: FastifyRequest) => {
    const { nodeId } = request.params as { nodeId: string };
    const causes = await service.getNodeCauses(nodeId);
    return { success: true, count: causes.length, data: causes };
  });

  // 5. Branch Comprehensive Operational Summary
  app.get('/v1/maps/operational/branches/:branchId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { branchId } = request.params as { branchId: string };
    const summary = await service.getBranchOperationalView(branchId);
    if (!summary) return reply.code(404).send({ success: false, error: 'Branch not found' });
    return { success: true, data: summary };
  });

  // 6. Branch Floor Plan with Camera FOV Cones
  app.get('/v1/maps/operational/floors/:floorId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { floorId } = request.params as { floorId: string };
    const plan = await service.getFloorPlan(floorId);
    if (!plan) return reply.code(404).send({ success: false, error: 'Floor plan not found' });
    return { success: true, data: plan };
  });

  // 7. List All Floors for Branch
  app.get('/v1/maps/operational/branches/:branchId/floor-plans', async (request: FastifyRequest) => {
    const { branchId } = request.params as { branchId: string };
    const plans = await service.listBranchFloors(branchId);
    return { success: true, count: plans.length, data: plans };
  });

  // 8. Fleetwide Operational Overlay Summary
  app.get('/v1/maps/operational/overlays/summary', async () => {
    const summary = await service.getOverlaySummary();
    return { success: true, data: summary };
  });

  // 9. Update Asset Operational Telemetry
  app.post('/v1/maps/operational/telemetry/update', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      branchId: z.string().min(1),
      cameraId: z.string().optional(),
      status: z.enum(['ONLINE', 'OFFLINE', 'ALERTING', 'DEGRADED']),
      incidentPriority: z.enum(['P1', 'P2', 'P3']).optional(),
      alertMessage: z.string().optional(),
    });

    const body = schema.parse(request.body);
    const result = await service.updateAssetOperationalTelemetry(body as any);
    return reply.code(200).send({ success: true, data: result });
  });

  // Backward compatibility alias for legacy `/v1/map/floor-plan/:branchId`
  app.get('/v1/map/floor-plan/:branchId', async (request: FastifyRequest) => {
    const { branchId } = request.params as { branchId: string };
    const plan = await service.getFloorPlan(branchId);
    return { data: plan };
  });
}
