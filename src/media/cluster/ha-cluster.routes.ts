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
  app.get("/api/ha/status", async (_request, reply) => {
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
  app.get("/api/ha/leases", async (request, reply) => {
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
  app.get("/api/ha/placements", async (request, reply) => {
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
  app.get("/api/ha/events", async (_request, reply) => {
    const events = haFailoverCoordinator.getRecentEvents(50);
    return reply.code(200).send({
      success: true,
      data: events,
    });
  });

  // 5. Authoritative Segment Commit with Fencing Token Verification
  app.post("/api/ha/segments/commit", async (request, reply) => {
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
      codec: z.string().min(1),
      storagePath: z.string().min(1),
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

}
