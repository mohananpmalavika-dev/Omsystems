/**
 * Client Media Scheduler REST API Routes
 * 
 * Exposes endpoints for client hardware capability profiling, empirical benchmarks,
 * authoritative stream schedule generation, and real-time degradation adaptation.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  clientMediaSchedulerService,
  ClientMediaSchedulerService,
} from "../media/scheduler/client-media-scheduler.service.js";

const codecCapabilitySchema = z.object({
  codec: z.enum(["H264", "H265", "AV1", "VP9", "VP8", "MJPEG"]),
  mimeType: z.string(),
  isHardwareAccelerated: z.boolean(),
  maxSupportedResolution: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  maxFps: z.number().int().positive(),
});

const registerProfileSchema = z.object({
  fingerprint: z.string().min(1),
  gpuModel: z.string().default("Unknown GPU"),
  rendererString: z.string().default("Unknown Renderer"),
  hardwareDecoder: z.enum(["NVDEC", "QUICKSYNC", "VAAPI", "VIDEOTOOLBOX", "D3D11VA", "SOFTWARE", "UNKNOWN"]).default("UNKNOWN"),
  supportedCodecs: z.array(codecCapabilitySchema).default([]),
  preferredCodec: z.enum(["H264", "H265", "AV1", "VP9", "VP8", "MJPEG"]).default("H264"),
  measuredMaxDecodeSessions: z.number().int().min(1).max(256).default(16),
  benchmarkAverageLatencyMs: z.number().min(0).default(10),
  benchmarkDroppedFramePct: z.number().min(0).max(100).default(0),
  benchmarkTimestamp: z.string().optional(),
  cpuCores: z.number().int().min(1).default(4),
  memoryGb: z.number().min(0.5).default(8),
  measuredDownlinkMbps: z.number().min(0.1).default(25),
  measuredRttMs: z.number().min(0).default(30),
  measuredPacketLossPct: z.number().min(0).max(100).default(0),
});

const cameraDescriptorSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  isOnline: z.boolean().optional(),
  hasAudio: z.boolean().optional(),
});

const tileDimensionSchema = z.object({
  cameraId: z.string().min(1),
  widthPx: z.number().int().min(0),
  heightPx: z.number().int().min(0),
  tileIndex: z.number().int().min(0),
  isIntersecting: z.boolean().default(true),
});

const liveTelemetrySchema = z.object({
  sessionId: z.string().uuid(),
  clientTimestamp: z.number().int().optional(),
  cpuUsagePct: z.number().min(0).max(100).default(20),
  eventLoopLagMs: z.number().min(0).default(5),
  heapUsedMb: z.number().min(0).optional(),
  heapLimitMb: z.number().min(0).optional(),
  memoryPressure: z.enum(["normal", "moderate", "critical"]).default("normal"),
  currentDownlinkMbps: z.number().min(0.1).default(25),
  currentRttMs: z.number().min(0).default(30),
  currentPacketLossPct: z.number().min(0).max(100).default(0),
  activeDecodedStreams: z.number().int().min(0).default(0),
  totalRenderedFps: z.number().min(0).default(0),
  droppedFramesPerSec: z.number().min(0).default(0),
  decodeLatencyP95Ms: z.number().min(0).default(10),
});

const calculateScheduleSchema = z.object({
  fingerprint: z.string().optional(),
  profileOverride: registerProfileSchema.partial().optional(),
  sessionId: z.string().uuid().default("00000000-0000-0000-0000-000000000000"),
  gridRows: z.number().int().min(1).max(16).default(4),
  gridCols: z.number().int().min(1).max(16).default(4),
  totalTiles: z.number().int().min(1).max(256).optional(),
  cameras: z.array(cameraDescriptorSchema),
  tiles: z.array(tileDimensionSchema).default([]),
  visibleCameraIds: z.array(z.string()).default([]),
  focusedCameraId: z.string().optional(),
  hoveredCameraId: z.string().optional(),
  activeAlarmCameraIds: z.array(z.string()).default([]),
  p1IncidentCameraIds: z.array(z.string()).default([]),
  liveTelemetry: liveTelemetrySchema.partial().optional(),
});

const adaptFeedbackSchema = z.object({
  sessionId: z.string().uuid(),
  fingerprint: z.string().optional(),
  droppedFramesPerSec: z.number().min(0),
  eventLoopLagMs: z.number().min(0),
  cpuUsagePct: z.number().min(0).max(100),
  packetLossPct: z.number().min(0).max(100),
  currentDownlinkMbps: z.number().min(0.1),
  activeCameraIds: z.array(z.string()),
  focusedCameraId: z.string().optional(),
  activeAlarmCameraIds: z.array(z.string()).default([]),
});

export async function registerClientMediaSchedulerRoutes(app: FastifyInstance): Promise<void> {
  const scheduler = clientMediaSchedulerService;

  // 1. Ingest & Store Measured Client Hardware Benchmark
  app.post("/v1/media/scheduler/profile", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = registerProfileSchema.parse(request.body);
    const profile = {
      ...body,
      benchmarkTimestamp: body.benchmarkTimestamp || new Date().toISOString(),
    };
    scheduler.registerClientProfile(profile as any);

    return {
      status: "profile_registered",
      fingerprint: profile.fingerprint,
      gpuModel: profile.gpuModel,
      hardwareDecoder: profile.hardwareDecoder,
      measuredMaxDecodeSessions: profile.measuredMaxDecodeSessions,
      registeredAt: profile.benchmarkTimestamp,
    };
  });

  // 2. Retrieve Stored Client Profile by Fingerprint
  app.get("/v1/media/scheduler/profile/:fingerprint", async (request: FastifyRequest, reply: FastifyReply) => {
    const { fingerprint } = request.params as { fingerprint: string };
    const profile = scheduler.getClientProfile(fingerprint);
    if (!profile) {
      return reply.code(404).send({ error: "profile_not_found", fingerprint });
    }
    return { profile };
  });

  // 3. List Known Hardware Presets & Empirical Calibrations
  app.get("/v1/media/scheduler/presets", async () => {
    return {
      presets: ClientMediaSchedulerService.HARDWARE_PRESETS,
      description: "Empirically calibrated benchmark references for standard hardware tiers",
    };
  });

  // 4. Authoritative Schedule Calculation (Zero Guessing)
  app.post("/v1/media/scheduler/calculate", async (request: FastifyRequest) => {
    const body = calculateScheduleSchema.parse(request.body);

    const profile = scheduler.resolveEffectiveProfile(body.fingerprint, body.profileOverride as any);

    const result = scheduler.calculateSchedule(
      body.cameras as any,
      {
        sessionId: body.sessionId,
        gridRows: body.gridRows,
        gridCols: body.gridCols,
        totalTiles: body.totalTiles || (body.gridRows * body.gridCols),
        tiles: body.tiles,
        visibleCameraIds: body.visibleCameraIds,
        focusedCameraId: body.focusedCameraId,
        hoveredCameraId: body.hoveredCameraId,
        activeAlarmCameraIds: body.activeAlarmCameraIds,
        p1IncidentCameraIds: body.p1IncidentCameraIds,
      } as any,
      profile,
      body.liveTelemetry,
    );

    return { schedule: result };
  });

  // 5. Real-Time Feedback Adaptation (Immediate stream throttling/recovery directives)
  app.post("/v1/media/scheduler/adapt", async (request: FastifyRequest) => {
    const body = adaptFeedbackSchema.parse(request.body);

    const profile = scheduler.resolveEffectiveProfile(body.fingerprint);

    // Build synthetic camera list from active IDs
    const cameras = body.activeCameraIds.map((id, index) => ({
      id,
      name: `Camera ${index + 1}`,
      isOnline: true,
    }));

    const result = scheduler.calculateSchedule(
      cameras,
      {
        sessionId: body.sessionId,
        gridRows: Math.ceil(Math.sqrt(body.activeCameraIds.length)) || 4,
        gridCols: Math.ceil(Math.sqrt(body.activeCameraIds.length)) || 4,
        totalTiles: body.activeCameraIds.length,
        tiles: body.activeCameraIds.map((id, idx) => ({
          cameraId: id,
          widthPx: 480,
          heightPx: 270,
          tileIndex: idx,
          isIntersecting: true,
        })),
        visibleCameraIds: body.activeCameraIds,
        focusedCameraId: body.focusedCameraId,
        activeAlarmCameraIds: body.activeAlarmCameraIds,
      },
      profile,
      {
        sessionId: body.sessionId,
        cpuUsagePct: body.cpuUsagePct,
        eventLoopLagMs: body.eventLoopLagMs,
        currentDownlinkMbps: body.currentDownlinkMbps,
        currentRttMs: 30,
        currentPacketLossPct: body.packetLossPct,
        droppedFramesPerSec: body.droppedFramesPerSec,
        activeDecodedStreams: body.activeCameraIds.length,
        totalRenderedFps: 0,
        decodeLatencyP95Ms: 10,
        memoryPressure: "normal",
      },
    );

    return {
      adaptation: {
        sessionId: body.sessionId,
        systemHealthStatus: result.systemHealthStatus,
        limitingFactor: result.diagnostics.limitingFactor,
        actionApplied: result.diagnostics.adaptationActionApplied,
        updatedSchedules: result.schedules,
      },
    };
  });
}
