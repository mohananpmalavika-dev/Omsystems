import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import {
  EdgeGatewayManagerService,
  edgeGatewayManager,
} from "../edge-protocol/services/edge-gateway-manager.service.js";
import {
  MediaSessionManagerService,
  mediaSessionManager,
} from "../edge-protocol/services/media-session-manager.service.js";

const idParamSchema = z.object({ id: z.string().min(1) });

export async function registerEdgeGatewayRoutes(
  app: FastifyInstance,
  store?: ControlPlaneStore,
  customEdgeManager?: EdgeGatewayManagerService,
  customMediaManager?: MediaSessionManagerService,
) {
  const edgeMgr = customEdgeManager ?? edgeGatewayManager;
  const mediaMgr = customMediaManager ?? mediaSessionManager;

  const registerEndpoints = (prefix: string) => {
    // 1. Edge Registration
    app.post(`${prefix}/edge/register`, async (request, reply) => {
      const body = request.body as any;
      if (!body || !body.edgeId || !body.branchId) {
        return reply.code(400).send({
          success: false,
          error: "edgeId and branchId are required",
        });
      }

      const res = await edgeMgr.registerEdgeGateway({
        edgeId: body.edgeId,
        branchId: body.branchId,
        branchName: body.branchName ?? `Branch ${body.branchId}`,
        hostname: body.hostname ?? `${body.edgeId}.internal`,
        edgeVersion: body.edgeVersion ?? "3.8.2",
        runningConfigVersion: body.runningConfigVersion,
      });

      return reply.code(200).send({
        success: true,
        data: res,
      });
    });

    // 2. High-Frequency Lightweight Heartbeat (30s cadence)
    app.post(`${prefix}/edge/heartbeat`, async (request, reply) => {
      const body = request.body as any;
      if (!body || !body.edgeId || !body.branchId) {
        return reply.code(400).send({
          success: false,
          error: "edgeId and branchId are required",
        });
      }

      const res = await edgeMgr.processHeartbeat({
        edgeId: body.edgeId,
        branchId: body.branchId,
        timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),
        edgeVersion: body.edgeVersion ?? "3.8.2",
        status: body.status ?? "HEALTHY",
        recorderCount: body.recorderCount ?? 1,
        cameraCount: body.cameraCount ?? 40,
        cameraHealthy: body.cameraHealthy ?? 40,
        cameraFailed: body.cameraFailed ?? 0,
        activeAlerts: body.activeAlerts ?? 0,
        systemMetrics: body.systemMetrics ?? {
          cpuPercent: 20,
          ramPercent: 45,
          diskPercent: 60,
          queueBacklog: 0,
          hoLatencyMs: 25,
          configVersion: body.configVersion ?? 54,
          uptimeSeconds: 864000,
        },
      });

      return reply.code(200).send({
        success: true,
        data: res,
      });
    });

    // 3. Batched State-Change Event Ingestion
    app.post(`${prefix}/edge/events/batch`, async (request, reply) => {
      const body = request.body as { events: any[] };
      if (!body || !Array.isArray(body.events)) {
        return reply.code(400).send({
          success: false,
          error: "events array is required",
        });
      }

      const events = body.events.map((e) => ({
        eventId: e.eventId ?? `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sequenceNumber: e.sequenceNumber ?? 1,
        edgeId: e.edgeId,
        branchId: e.branchId,
        entityType: e.entityType ?? "CAMERA",
        entityId: e.entityId,
        previousState: e.previousState ?? "UNKNOWN",
        newState: e.newState ?? "HEALTHY",
        reason: e.reason,
        observedAt: e.observedAt ? new Date(e.observedAt) : new Date(),
        payload: e.payload,
      }));

      const res = await edgeMgr.ingestEventBatch(events);
      return reply.code(200).send({
        success: true,
        data: res,
      });
    });

    // 4. List Edge Gateways & Fleet Hardware Telemetry
    app.get(`${prefix}/edge/gateways`, async (request, reply) => {
      const list = await edgeMgr.listEdgeGateways();
      return reply.code(200).send({
        success: true,
        count: list.length,
        data: list,
      });
    });

    app.get(`${prefix}/edge/gateways/:id`, async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const gw = await edgeMgr.getEdgeGateway(id);
      if (!gw) {
        return reply.code(404).send({
          success: false,
          error: "edge_gateway_not_found",
        });
      }
      return reply.code(200).send({
        success: true,
        data: gw,
      });
    });

    // 5. HO -> Edge Command Dispatch
    app.post(`${prefix}/edge/commands`, async (request, reply) => {
      const body = request.body as any;
      if (!body || !body.branchId || !body.edgeId || !body.type) {
        return reply.code(400).send({
          success: false,
          error: "branchId, edgeId, and type are required",
        });
      }

      const cmdId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (body.timeoutSeconds ?? 60) * 1000);

      const command = await edgeMgr.dispatchCommand({
        commandId: cmdId,
        branchId: body.branchId,
        edgeId: body.edgeId,
        type: body.type,
        payload: body.payload ?? {},
        createdAt: now,
        expiresAt,
        requestedBy: (request as any).currentUser?.id ?? "user-admin",
      });

      return reply.code(202).send({
        success: true,
        data: command,
      });
    });

    app.get(`${prefix}/edge/commands/:id`, async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const res = await edgeMgr.getCommandStatus(id);
      if (!res) {
        return reply.code(404).send({
          success: false,
          error: "command_not_found",
        });
      }
      return reply.code(200).send({
        success: true,
        data: res,
      });
    });

    // 6. On-Demand Tokenized Media Session Management
    app.post(`${prefix}/media/sessions`, async (request, reply) => {
      const body = request.body as any;
      if (!body || !body.branchId || !body.cameraId) {
        return reply.code(400).send({
          success: false,
          error: "branchId and cameraId are required",
        });
      }

      const session = await mediaMgr.createMediaSession({
        branchId: body.branchId,
        cameraId: body.cameraId,
        edgeId: body.edgeId,
        streamType: body.streamType,
        requestedByUserId: (request as any).currentUser?.id ?? "user-operator",
        durationMinutes: body.durationMinutes ?? 10,
      });

      return reply.code(201).send({
        success: true,
        data: session,
      });
    });

    app.delete(`${prefix}/media/sessions/:id`, async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const terminated = await mediaMgr.terminateSession(id);
      return reply.code(200).send({
        success: terminated,
      });
    });

    app.get(`${prefix}/media/sessions/active`, async (request, reply) => {
      const list = await mediaMgr.listActiveSessions();
      return reply.code(200).send({
        success: true,
        count: list.length,
        data: list,
      });
    });

    // 7. Video Wall Multi-Tier Stream Allocation Planner
    app.post(`${prefix}/media/videowall/plan`, async (request, reply) => {
      const body = request.body as { tiles: any[] };
      if (!body || !Array.isArray(body.tiles)) {
        return reply.code(400).send({
          success: false,
          error: "tiles array is required",
        });
      }

      const plan = mediaMgr.planVideoWallAllocation(body.tiles);
      return reply.code(200).send({
        success: true,
        data: plan,
      });
    });
  };

  registerEndpoints("/v1");
  registerEndpoints("/api/v1");
  registerEndpoints("/api");
}
