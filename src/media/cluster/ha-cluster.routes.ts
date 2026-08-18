/**
 * High Availability (HA) & Distributed Camera Ownership API Routes
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  cameraLeaseService,
  mediaNodeRegistry,
  mediaPlacementService,
  fencingTokenService,
  haFailoverCoordinator,
} from "./index.js";

export async function registerHaClusterRoutes(app: FastifyInstance) {
  // 1. Cluster Status & SLA Performance
  app.get("/api/ha/status", { config: { noAuth: true } }, async (_request, reply) => {
    const nodes = mediaNodeRegistry.listAllNodes();
    const metrics = haFailoverCoordinator.getMetrics();
    const recentEvents = haFailoverCoordinator.getRecentEvents(10);
    const activeLeases = await cameraLeaseService.listActiveLeases();

    return reply.code(200).send({
      success: true,
      data: {
        metrics,
        nodes,
        activeLeasesCount: activeLeases.length,
        recentEvents,
      },
    });
  });

  // 2. Active Distributed Leases
  app.get("/api/ha/leases", { config: { noAuth: true } }, async (request, reply) => {
    const query = z.object({
      tenantId: z.string().optional(),
    }).parse(request.query);

    const leases = await cameraLeaseService.listActiveLeases(query.tenantId);
    return reply.code(200).send({
      success: true,
      data: leases,
    });
  });

  // 3. Camera Placement Plans across Failure Domains
  app.get("/api/ha/placements", { config: { noAuth: true } }, async (request, reply) => {
    const query = z.object({
      tenantId: z.string().optional(),
    }).parse(request.query);

    const plans = mediaPlacementService.listPlacementPlans(query.tenantId);
    return reply.code(200).send({
      success: true,
      data: plans,
    });
  });

  // 4. HA Audit Events
  app.get("/api/ha/events", { config: { noAuth: true } }, async (_request, reply) => {
    const events = haFailoverCoordinator.getRecentEvents(50);
    return reply.code(200).send({
      success: true,
      data: events,
    });
  });

  // 5. Authoritative Segment Commit with Fencing Token Verification
  app.post("/api/ha/segments/commit", { config: { noAuth: true } }, async (request, reply) => {
    const body = z.object({
      tenantId: z.string().min(1),
      cameraId: z.string().min(1),
      segmentId: z.string().min(1),
      nodeId: z.string().min(1),
      instanceId: z.string().min(1),
      fencingToken: z.number().int().positive(),
      startTime: z.string(),
      endTime: z.string(),
      sizeBytes: z.number().int().nonnegative(),
      codec: z.string().default("H264"),
      storagePath: z.string().optional().default(""),
    }).parse(request.body);

    const result = fencingTokenService.verifyAndCommitSegment(body as any);
    if (!result.accepted) {
      return reply.code(409).send({
        success: false,
        error: result.rejectionReason,
        message: "Stale owner epoch rejected. Split-brain prevented.",
        currentAuthoritativeEpoch: result.currentAuthoritativeEpoch,
      });
    }

    return reply.code(200).send({
      success: true,
      data: result,
    });
  });

  // 6. Chaos Simulation: Kill Media Node
  app.post("/api/ha/chaos/kill-node", { config: { noAuth: true } }, async (request, reply) => {
    const body = z.object({
      nodeId: z.string().min(1),
    }).parse(request.body);

    const simulationResult = await haFailoverCoordinator.simulateNodeFailure(body.nodeId);
    return reply.code(200).send({
      success: true,
      message: `Node ${body.nodeId} terminated. Automated failover initiated.`,
      data: simulationResult,
    });
  });

  // 7. Chaos Simulation: Inject Stale Epoch Write
  app.post("/api/ha/chaos/stale-epoch-test", { config: { noAuth: true } }, async (request, reply) => {
    const body = z.object({
      tenantId: z.string().default("tenant-blr-main"),
      cameraId: z.string().default("CAM-BLR-01"),
      staleFencingToken: z.number().int().default(18400),
    }).parse(request.body);

    const result = fencingTokenService.verifyAndCommitSegment({
      tenantId: body.tenantId,
      cameraId: body.cameraId,
      segmentId: "seg-chaos-test",
      nodeId: "media-node-stale",
      instanceId: "stale-instance-uuid",
      fencingToken: body.staleFencingToken,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      sizeBytes: 204800,
      codec: "H264",
      storagePath: "recordings/stale-test.mkv",
    });

    return reply.code(200).send({
      success: true,
      splitBrainPrevented: !result.accepted,
      result,
    });
  });
}
