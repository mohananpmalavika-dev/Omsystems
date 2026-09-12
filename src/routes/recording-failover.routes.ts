import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  recordingFailoverCoordinator,
  RecordingFailoverCoordinator,
} from "../recording/failover/recording-failover-coordinator.service.js";
import {
  recordingNodeRegistry,
  RecordingNodeRegistry,
} from "../recording/failover/recording-node-registry.js";
import type {
  RecordingNodeRole,
  RecordingNodeState,
  RecordingFailoverReason,
} from "../recording/failover/recording-failover.types.js";

const registerNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(8085),
  role: z.enum(["ACTIVE", "STANDBY", "DRAINING", "MAINTENANCE"]).default("ACTIVE"),
  maxStreamCapacity: z.number().int().min(1).max(1024).default(128),
  metadata: z.record(z.unknown()).optional(),
});

const heartbeatSchema = z.object({
  name: z.string().optional(),
  host: z.string().optional(),
  port: z.number().int().optional(),
  role: z.enum(["ACTIVE", "STANDBY", "DRAINING", "MAINTENANCE"]).optional(),
  cpuPercent: z.number().min(0).max(100).optional(),
  memoryPercent: z.number().min(0).max(100).optional(),
  diskWriteMbps: z.number().min(0).optional(),
  networkInMbps: z.number().min(0).optional(),
  activeStreamCount: z.number().int().min(0).optional(),
  maxStreamCapacity: z.number().int().min(1).optional(),
  epoch: z.number().int().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const assignCameraSchema = z.object({
  cameraId: z.string().uuid(),
  tenantId: z.string().uuid().default("00000000-0000-0000-0000-000000000000"),
  primaryNodeId: z.string().min(1),
  currentNodeId: z.string().min(1).optional(),
  streamUri: z.string().min(1),
  streamProfile: z.string().default("main"),
  metadata: z.record(z.unknown()).optional(),
});

const triggerFailoverSchema = z.object({
  failedNodeId: z.string().min(1),
  reason: z.enum([
    "HEARTBEAT_EXPIRED",
    "NODE_CRASH",
    "MANUAL_FAILOVER",
    "NETWORK_PARTITION",
    "HIGH_ERROR_RATE",
    "STORAGE_UNAVAILABLE",
  ]).default("MANUAL_FAILOVER"),
});

const failbackSchema = z.object({
  primaryNodeId: z.string().min(1),
  standbyNodeId: z.string().min(1),
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

export async function registerRecordingFailoverRoutes(
  app: FastifyInstance,
  options: {
    coordinator?: RecordingFailoverCoordinator;
    registry?: RecordingNodeRegistry;
  } = {},
): Promise<void> {
  const coordinator = options.coordinator || recordingFailoverCoordinator;
  const registry = options.registry || recordingNodeRegistry;

  await coordinator.initialize();

  // Route registration helper for dual prefix (/api/v1/recording/failover and /v1/recording/failover)
  const registerRoute = (
    method: "get" | "post" | "patch" | "delete",
    pathSuffix: string,
    handler: (req: FastifyRequest, rep: FastifyReply) => Promise<unknown>,
  ) => {
    app[method](`/api/v1/recording/failover${pathSuffix}`, handler);
    app[method](`/v1/recording/failover${pathSuffix}`, handler);
  };

  /**
   * GET /nodes: List recording nodes with heartbeat statuses
   */
  registerRoute("get", "/nodes", async (request, reply) => {
    const query = request.query as { role?: RecordingNodeRole; state?: RecordingNodeState };
    const nodes = registry.listNodes(query);
    return reply.code(200).send({
      success: true,
      data: nodes,
    });
  });

  /**
   * POST /nodes: Register or update active/standby recording node
   */
  registerRoute("post", "/nodes", async (request, reply) => {
    const input = parseRequest(registerNodeSchema, request.body, reply);
    if (!input) return reply;

    const node = await registry.registerNode(input);
    return reply.code(201).send({
      success: true,
      data: node,
    });
  });

  /**
   * POST /nodes/:nodeId/heartbeat: Ingest periodic heartbeat telemetry
   */
  registerRoute("post", "/nodes/:nodeId/heartbeat", async (request, reply) => {
    const params = request.params as { nodeId: string };
    const input = parseRequest(heartbeatSchema, request.body, reply);
    if (!input) return reply;

    const node = await registry.recordHeartbeat({
      nodeId: params.nodeId,
      ...input,
    });

    return reply.code(200).send({
      success: true,
      data: node,
    });
  });

  /**
   * GET /assignments: List stream assignments
   */
  registerRoute("get", "/assignments", async (request, reply) => {
    const query = request.query as { nodeId?: string; cameraId?: string };
    if (query.cameraId) {
      const assignment = registry.getAssignment(query.cameraId);
      return reply.code(200).send({
        success: true,
        data: assignment ? [assignment] : [],
      });
    }

    if (query.nodeId) {
      const assignments = registry.getAssignmentsForNode(query.nodeId);
      return reply.code(200).send({
        success: true,
        data: assignments,
      });
    }

    const assignments = registry.listAssignments();
    return reply.code(200).send({
      success: true,
      data: assignments,
    });
  });

  /**
   * POST /assignments: Assign camera stream ingest to recording node
   */
  registerRoute("post", "/assignments", async (request, reply) => {
    const input = parseRequest(assignCameraSchema, request.body, reply);
    if (!input) return reply;

    const assignment = await registry.assignCamera(input);
    return reply.code(201).send({
      success: true,
      data: assignment,
    });
  });

  /**
   * POST /trigger: Trigger manual or simulated failover
   */
  registerRoute("post", "/trigger", async (request, reply) => {
    const input = parseRequest(triggerFailoverSchema, request.body, reply);
    if (!input) return reply;

    try {
      const result = await coordinator.executeFailover(
        input.failedNodeId,
        input.reason as RecordingFailoverReason,
      );
      return reply.code(200).send({
        success: true,
        data: result,
      });
    } catch (err) {
      return reply.code(500).send({
        success: false,
        error: "failover_execution_failed",
        message: (err as Error).message,
      });
    }
  });

  /**
   * POST /failback: Graceful failback to recovered primary node
   */
  registerRoute("post", "/failback", async (request, reply) => {
    const input = parseRequest(failbackSchema, request.body, reply);
    if (!input) return reply;

    try {
      const result = await coordinator.executeFailback(
        input.primaryNodeId,
        input.standbyNodeId,
      );
      return reply.code(200).send({
        success: true,
        data: result,
      });
    } catch (err) {
      return reply.code(400).send({
        success: false,
        error: "failback_execution_failed",
        message: (err as Error).message,
      });
    }
  });

  /**
   * POST /check-liveness: Immediately evaluate heartbeat ages and trigger takeovers
   */
  registerRoute("post", "/check-liveness", async (_request, reply) => {
    const result = await coordinator.checkNodeLiveness();
    return reply.code(200).send({
      success: true,
      data: result,
    });
  });

  /**
   * GET /events: Retrieve historical failover audit events
   */
  registerRoute("get", "/events", async (request, reply) => {
    const query = request.query as { failedNodeId?: string; limit?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const events = coordinator.listFailoverEvents(query.failedNodeId, limit);
    return reply.code(200).send({
      success: true,
      data: events,
    });
  });

  /**
   * GET /metrics: Retrieve high-level cluster HA telemetry metrics
   */
  registerRoute("get", "/metrics", async (_request, reply) => {
    const metrics = coordinator.getFailoverMetrics();
    return reply.code(200).send({
      success: true,
      data: metrics,
    });
  });
}
