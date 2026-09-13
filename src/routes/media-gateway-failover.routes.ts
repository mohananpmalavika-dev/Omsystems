/**
 * Fastify REST API Routes for Automatic Media Gateway Failover (ha.media_failover)
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  mediaGatewayFailoverService,
  MediaGatewayFailoverService,
} from "../ha/services/media-gateway-failover.service.js";

const registerGatewaySchema = z.object({
  gatewayId: z.string().min(1),
  gatewayName: z.string().min(1),
  ipAddress: z.string().min(1),
  port: z.number().int().min(1).max(65535).optional(),
  apiPort: z.number().int().min(1).max(65535).optional(),
  publicUrl: z.string().url().or(z.string().min(1)).optional(),
  region: z.string().optional(),
  maxStreams: z.number().int().min(1).max(10000).optional(),
  maxNetworkMbps: z.number().min(1).max(100000).optional(),
});

const heartbeatSchema = z.object({
  gatewayId: z.string().min(1),
  gatewayName: z.string().optional(),
  ipAddress: z.string().min(1),
  port: z.number().int().min(1).max(65535).optional(),
  apiPort: z.number().int().min(1).max(65535).optional(),
  publicUrl: z.string().optional(),
  region: z.string().optional(),
  cpuPercent: z.number().min(0).max(100),
  memoryPercent: z.number().min(0).max(100),
  networkInMbps: z.number().min(0),
  networkOutMbps: z.number().min(0),
  activeStreams: z.number().int().min(0),
  recordingStreams: z.number().int().min(0).optional(),
  liveViewStreams: z.number().int().min(0).optional(),
  healthyStreams: z.number().int().min(0).optional(),
  degradedStreams: z.number().int().min(0).optional(),
  failedStreams: z.number().int().min(0).optional(),
  packetLoss: z.number().min(0).optional(),
  frameDrops: z.number().min(0).optional(),
  maxStreams: z.number().int().min(1).optional(),
  maxNetworkMbps: z.number().min(1).optional(),
});

const routeStreamSchema = z.object({
  cameraId: z.string().min(1),
  streamProfile: z.enum(["main", "sub", "preview"]).default("main"),
  sourceUri: z.string().min(1),
  preferredGatewayId: z.string().optional(),
  preferredRegion: z.string().optional(),
  bitrateKbps: z.number().int().min(100).max(100000).optional(),
  fps: z.number().int().min(1).max(120).optional(),
});

const redirectStreamSchema = z.object({
  targetGatewayId: z.string().min(1),
  streamProfile: z.enum(["main", "sub", "preview"]).default("main"),
});

const failoverTriggerSchema = z.object({
  reason: z.string().min(1).default("MANUAL_OPERATOR"),
  triggeredBy: z.string().min(1).default("MANUAL_OPERATOR"),
});

const drainGatewaySchema = z.object({
  reason: z.string().min(1).default("SCHEDULED_MAINTENANCE"),
});

const policyUpdateSchema = z.object({
  heartbeatTimeoutMs: z.number().int().min(1000).max(60000).optional(),
  watchdogIntervalMs: z.number().int().min(500).max(30000).optional(),
  maxStreamsPerGateway: z.number().int().min(1).max(5000).optional(),
  maxLoadPercent: z.number().int().min(50).max(100).optional(),
  autoFailoverEnabled: z.boolean().optional(),
  autoFailbackEnabled: z.boolean().optional(),
  flapDampingSeconds: z.number().int().min(5).max(300).optional(),
});

function parseRequest<T>(schema: z.ZodType<T>, value: unknown, reply: FastifyReply): T | undefined {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  reply.code(400).send({
    success: false,
    error: "invalid_request",
    details: parsed.error.flatten(),
  });
  return undefined;
}

export async function registerMediaGatewayFailoverRoutes(
  app: FastifyInstance,
  options: { service?: MediaGatewayFailoverService } = {},
): Promise<void> {
  const service = options.service || mediaGatewayFailoverService;

  // Initialize service state
  await service.initialize();

  const registerEndpoints = (prefix: string) => {
    /**
     * GET <prefix>
     * List all registered media gateway nodes, statuses, and capacity
     */
    app.get(`${prefix}`, async (_request: FastifyRequest, reply: FastifyReply) => {
      const nodes = service.getNodes();
      return reply.code(200).send({
        success: true,
        data: nodes,
      });
    });

    /**
     * POST <prefix>/register
     * Register or update a media gateway node
     */
    app.post(`${prefix}/register`, async (request: FastifyRequest, reply: FastifyReply) => {
      const input = parseRequest(registerGatewaySchema, request.body, reply);
      if (!input) return reply;

      const node = await service.registerGateway(input);
      return reply.code(201).send({
        success: true,
        data: node,
      });
    });

    /**
     * POST <prefix>/heartbeat
     * Ingest real-time heartbeat and telemetry from a media gateway instance
     */
    app.post(`${prefix}/heartbeat`, async (request: FastifyRequest, reply: FastifyReply) => {
      const input = parseRequest(heartbeatSchema, request.body, reply);
      if (!input) return reply;

      try {
        const result = await service.processHeartbeat(input as any);
        return reply.code(200).send({
          success: true,
          data: result.node,
        });
      } catch (err: any) {
        return reply.code(500).send({
          success: false,
          error: "heartbeat_processing_failed",
          message: err?.message || "Unknown error",
        });
      }
    });

    /**
     * GET <prefix>/streams
     * List active stream allocations, assigned gateway, and failover status
     */
    app.get(`${prefix}/streams`, async (_request: FastifyRequest, reply: FastifyReply) => {
      const routes = service.getRoutes();
      return reply.code(200).send({
        success: true,
        data: routes,
      });
    });

    /**
     * POST <prefix>/streams/route
     * Route or provision a camera stream to the optimal media gateway
     */
    app.post(`${prefix}/streams/route`, async (request: FastifyRequest, reply: FastifyReply) => {
      const input = parseRequest(routeStreamSchema, request.body, reply);
      if (!input) return reply;

      const route = await service.routeStream(input);
      return reply.code(201).send({
        success: true,
        data: route,
      });
    });

    /**
     * POST <prefix>/streams/:cameraId/redirect
     * Force manual redirection of an individual camera stream to a target gateway
     */
    app.post(`${prefix}/streams/:cameraId/redirect`, async (request: FastifyRequest, reply: FastifyReply) => {
      const params = parseRequest(z.object({ cameraId: z.string().min(1) }), request.params, reply);
      if (!params) return reply;

      const body = parseRequest(redirectStreamSchema, request.body, reply);
      if (!body) return reply;

      try {
        const updatedRoute = await service.redirectStream(
          params.cameraId,
          body.targetGatewayId,
          body.streamProfile,
        );
        return reply.code(200).send({
          success: true,
          data: updatedRoute,
        });
      } catch (err: any) {
        return reply.code(400).send({
          success: false,
          error: "stream_redirect_failed",
          message: err?.message || "Failed to redirect stream",
        });
      }
    });

    /**
     * POST <prefix>/:gatewayId/failover
     * Operator trigger for immediate node failover (chaos drill or emergency evacuation)
     */
    app.post(`${prefix}/:gatewayId/failover`, async (request: FastifyRequest, reply: FastifyReply) => {
      const params = parseRequest(z.object({ gatewayId: z.string().min(1) }), request.params, reply);
      if (!params) return reply;

      const body = parseRequest(failoverTriggerSchema, request.body || {}, reply);
      if (!body) return reply;

      const result = await service.executeFailover(
        params.gatewayId,
        body.reason,
        body.triggeredBy,
      );

      return reply.code(200).send({
        success: result.success,
        data: result,
      });
    });

    /**
     * POST <prefix>/:gatewayId/drain
     * Gracefully drain a gateway instance before planned maintenance
     */
    app.post(`${prefix}/:gatewayId/drain`, async (request: FastifyRequest, reply: FastifyReply) => {
      const params = parseRequest(z.object({ gatewayId: z.string().min(1) }), request.params, reply);
      if (!params) return reply;

      const body = parseRequest(drainGatewaySchema, request.body || {}, reply);
      if (!body) return reply;

      try {
        const result = await service.drainGateway(params.gatewayId, body.reason);
        return reply.code(200).send({
          success: result.success,
          data: result,
        });
      } catch (err: any) {
        return reply.code(400).send({
          success: false,
          error: "drain_failed",
          message: err?.message || "Failed to drain gateway",
        });
      }
    });

    /**
     * POST <prefix>/rebalance
     * Rebalance stream allocation across healthy cluster nodes
     */
    app.post(`${prefix}/rebalance`, async (_request: FastifyRequest, reply: FastifyReply) => {
      const result = await service.rebalanceStreams();
      return reply.code(200).send({
        success: true,
        data: result,
      });
    });

    /**
     * GET <prefix>/events
     * Retrieve failover history and audit logs
     */
    app.get(`${prefix}/events`, async (request: FastifyRequest, reply: FastifyReply) => {
      const query = parseRequest(z.object({ limit: z.coerce.number().int().min(1).max(500).default(50) }), request.query || {}, reply);
      const limit = query?.limit ?? 50;

      const events = service.getEvents(limit);
      return reply.code(200).send({
        success: true,
        data: events,
      });
    });

    /**
     * GET <prefix>/metrics
     * Real-time failover SLA metrics
     */
    app.get(`${prefix}/metrics`, async (_request: FastifyRequest, reply: FastifyReply) => {
      const metrics = service.getMetrics();
      return reply.code(200).send({
        success: true,
        data: metrics,
      });
    });

    /**
     * GET <prefix>/policy
     * Get failover policies
     */
    app.get(`${prefix}/policy`, async (_request: FastifyRequest, reply: FastifyReply) => {
      const policy = service.getPolicy();
      return reply.code(200).send({
        success: true,
        data: policy,
      });
    });

    /**
     * PUT <prefix>/policy
     * Update failover policies
     */
    app.put(`${prefix}/policy`, async (request: FastifyRequest, reply: FastifyReply) => {
      const input = parseRequest(policyUpdateSchema, request.body, reply);
      if (!input) return reply;

      const updated = await service.updatePolicy(input);
      return reply.code(200).send({
        success: true,
        data: updated,
      });
    });

    /**
     * POST <prefix>/probe
     * Instantaneous cluster probe running watchdog check cycle on demand
     */
    app.post(`${prefix}/probe`, async (_request: FastifyRequest, reply: FastifyReply) => {
      const cycle = await service.runWatchdogCycle();
      const metrics = service.getMetrics();
      const nodes = service.getNodes();

      return reply.code(200).send({
        success: true,
        data: {
          cycle,
          metrics,
          nodes,
        },
      });
    });
  };

  registerEndpoints("/v1/ha/media-gateways");
  registerEndpoints("/api/v1/ha/media-gateways");
  registerEndpoints("/api/ha/media-gateways");
}
