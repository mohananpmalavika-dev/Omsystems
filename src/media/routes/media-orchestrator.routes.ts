import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { MediaOrchestrator } from "../services/media-orchestrator.js";
import { MediaMetricsService } from "../services/media-metrics.service.js";

const createSessionSchema = z.object({
  deviceType: z.enum(["workstation", "video_wall", "mobile", "tablet"]).default("workstation"),
  activeLayout: z.string().default("4x4"),
});

const reportTelemetrySchema = z.object({
  sessionId: z.string().uuid(),
  browser: z.string().default("chrome"),
  hardwareDecode: z.boolean().default(true),
  codecsSupported: z.array(z.enum(["H264", "H265", "AV1", "VP9", "MJPEG"])).default(["H264"]),
  maxDecoders: z.number().int().min(1).max(144).default(16),
  activeDecoders: z.number().int().min(0).default(0),
  viewportTiles: z.number().int().min(1).default(16),
  visibleCameraIds: z.array(z.string()).default([]),
  focusedCameraId: z.string().optional(),
});

const scheduleGridSchema = z.object({
  sessionId: z.string().uuid(),
  gridRows: z.number().int().min(1).max(12).default(4),
  gridCols: z.number().int().min(1).max(12).default(4),
  cameras: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      isOnline: z.boolean().optional(),
    }),
  ),
  visibleCameraIds: z.array(z.string()).default([]),
  focusedCameraId: z.string().optional(),
  activeAlarmCameraIds: z.array(z.string()).default([]),
});

const acquireStreamSchema = z.object({
  cameraId: z.string(),
  sessionId: z.string(),
  streamProfile: z.enum(["main", "sub", "preview"]).default("main"),
  preferredRegion: z.string().optional(),
});

const renewStreamSchema = z.object({
  leaseId: z.string(),
  token: z.string(),
  ttlMs: z.number().int().min(5000).max(120000).default(30000),
});

const releaseStreamSchema = z.object({
  leaseId: z.string(),
  token: z.string(),
});

const gatewayHeartbeatSchema = z.object({
  gatewayId: z.string(),
  instanceId: z.string(),
  host: z.string(),
  port: z.number().int().default(8554),
  region: z.string().default("global"),
  activeStreams: z.number().int().default(0),
  maxStreams: z.number().int().default(500),
  activeRelays: z.number().int().default(0),
  maxRelays: z.number().int().default(200),
  cpuPercent: z.number().min(0).max(100).default(10),
  gpuPercent: z.number().min(0).max(100).default(10),
  bandwidthMbps: z.number().default(0),
  maxBandwidthMbps: z.number().default(1000),
  transcodingSessions: z.number().int().default(0),
  healthStatus: z.enum(["HEALTHY", "DEGRADED", "OVERLOADED", "OFFLINE"]).default("HEALTHY"),
});

export async function registerMediaOrchestratorRoutes(
  app: FastifyInstance,
  orchestrator: MediaOrchestrator,
) {
  const metrics = MediaMetricsService.getInstance();

  // 1. Create or register viewer session
  app.post("/v1/media/viewer/session", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createSessionSchema.parse(request.body || {});
    const userId = request.currentUser.id;
    const tenantId = request.currentUser.tenantId;

    const session = await orchestrator.createViewerSession(
      userId,
      tenantId,
      body.deviceType,
      body.activeLayout,
    );

    return { session };
  });

  // 2. Report browser hardware decode telemetry
  app.post("/v1/media/viewer/telemetry", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = reportTelemetrySchema.parse(request.body);
    const userId = (request as any).currentUser?.id;

    await orchestrator.reportTelemetry({
      ...body,
      userId,
      lastReportedAt: Date.now(),
    } as any);

    return { status: "telemetry_recorded" };
  });

  // 3. Run video wall scheduling pass
  app.post("/v1/media/viewer/schedule", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = scheduleGridSchema.parse(request.body);

    const schedule = await orchestrator.scheduleViewerGrid(
      body.sessionId,
      body.cameras as any,
      {
        gridRows: body.gridRows,
        gridCols: body.gridCols,
        visibleCameraIds: body.visibleCameraIds,
        focusedCameraId: body.focusedCameraId,
        activeAlarmCameraIds: body.activeAlarmCameraIds,
      },
    );

    return { schedule };
  });

  // 4. Acquire distributed stream lease
  app.post("/v1/media/streams/acquire", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = acquireStreamSchema.parse(request.body);

    try {
      const lease = await orchestrator.globalCoordinator.acquireStream(
        body.cameraId,
        body.sessionId,
        body.streamProfile,
        body.preferredRegion,
      );

      return {
        lease: {
          leaseId: lease.leaseId,
          cameraId: lease.cameraId,
          streamProfile: lease.streamProfile,
          relayUrl: lease.relayUrl,
          token: lease.token,
          expiresAt: lease.expiresAt,
          gatewayId: lease.gatewayId,
        },
      };
    } catch (err: any) {
      return reply.code(409).send({
        error: "stream_acquisition_failed",
        message: err.message || "Failed to acquire stream lease",
      });
    }
  });

  // 5. Renew distributed stream lease
  app.post("/v1/media/streams/renew", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = renewStreamSchema.parse(request.body);

    const renewed = await orchestrator.leaseRepository.renew(
      body.leaseId,
      body.token,
      body.ttlMs,
    );

    if (!renewed) {
      return reply.code(404).send({
        error: "lease_expired_or_invalid_token",
        message: "Stream lease not found or token mismatch",
      });
    }

    return { status: "renewed", leaseId: body.leaseId, ttlMs: body.ttlMs };
  });

  // 6. Release distributed stream lease
  app.post("/v1/media/streams/release", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = releaseStreamSchema.parse(request.body);

    const released = await orchestrator.leaseRepository.release(
      body.leaseId,
      body.token,
    );

    return { status: released ? "released" : "not_found" };
  });

  // 7. Gateway heartbeat & registration
  app.post("/v1/media/gateways/heartbeat", async (request: FastifyRequest) => {
    const body = gatewayHeartbeatSchema.parse(request.body);

    await orchestrator.gatewayRegistry.registerHeartbeat({
      ...body,
      registeredAt: Date.now(),
      lastHeartbeatAt: Date.now(),
    } as any);

    return { status: "heartbeat_acknowledged" };
  });

  // 8. List available cluster media gateways
  app.get("/v1/media/gateways", async (request: FastifyRequest) => {
    const region = (request.query as any)?.region;
    const gateways = await orchestrator.gatewayRegistry.listAvailableGateways(region);
    return { data: gateways };
  });

  // 9. Get durable camera capabilities
  app.get("/v1/media/cameras/:id/capabilities", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const capabilities = await orchestrator.capabilityRepository.getCapabilities(id);
    if (!capabilities) {
      return reply.code(404).send({ error: "camera_not_found" });
    }
    return { capabilities };
  });

  // 10. Cluster Observability Metrics
  app.get("/v1/media/metrics", async () => {
    return { metrics: metrics.getMetrics() };
  });
}
