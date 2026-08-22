/**
 * Adaptive Stream Profile API Routes
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { adaptiveProfileResolverService } from "./adaptive-profile-resolver.service.js";
import type { GridDensity } from "./adaptive-stream.types.js";

export async function registerAdaptiveStreamRoutes(app: FastifyInstance) {
  // 1. Resolve Adaptive Profile for Camera Context
  app.post("/api/media/adaptive/resolve", { config: { noAuth: true } }, async (request, reply) => {
    const body = z.object({
      cameraId: z.string().min(1),
      gridDensity: z.union([
        z.literal(1),
        z.literal(4),
        z.literal(9),
        z.literal(16),
        z.literal(36),
        z.literal(64),
        z.literal(144),
      ]).default(16),
      viewportSize: z.object({
        widthPx: z.number().positive().default(480),
        heightPx: z.number().positive().default(270),
      }).default({ widthPx: 480, heightPx: 270 }),
      clientTelemetry: z.object({
        cpuUsagePct: z.number().min(0).max(100).default(35),
        memoryPressure: z.enum(["normal", "moderate", "critical"]).default("normal"),
        hardwareDecoderSlots: z.number().int().default(16),
        activeHardwareDecoders: z.number().int().default(4),
      }).optional(),
      networkConditions: z.object({
        estimatedBandwidthKbps: z.number().default(25000),
        rttMs: z.number().default(25),
        packetLossPct: z.number().default(0),
        effectiveType: z.enum(["4g", "3g", "2g", "slow-2g"]).default("4g"),
      }).optional(),
      operatorFocus: z.object({
        isMaximized: z.boolean().default(false),
        isHovered: z.boolean().default(false),
        isFocused: z.boolean().default(false),
        isInActiveAlarm: z.boolean().default(false),
        priority: z.enum(["P1", "P2", "P3", "NORMAL"]).default("NORMAL"),
      }).optional(),
      visibility: z.object({
        isIntersecting: z.boolean().default(true),
        visibilityRatio: z.number().default(1),
      }).optional(),
    }).parse(request.body);

    const decision = adaptiveProfileResolverService.resolveProfile(body as any);
    return reply.code(200).send({
      success: true,
      data: decision,
    });
  });

  // 2. Summary & Savings for Specific Grid Layout
  app.get("/api/media/adaptive/grid-summary", { config: { noAuth: true } }, async (request, reply) => {
    const query = z.object({
      gridDensity: z.coerce.number().transform((v) => Number(v) as GridDensity).default(16),
      focusedCameraId: z.string().optional(),
      alarmCameras: z.string().optional(), // Comma-separated
    }).parse(request.query);

    const alarmCameraIds = query.alarmCameras ? query.alarmCameras.split(",").map((s) => s.trim()) : [];
    const summary = adaptiveProfileResolverService.summarizeGrid(
      query.gridDensity,
      query.focusedCameraId,
      alarmCameraIds,
    );

    return reply.code(200).send({
      success: true,
      data: summary,
    });
  });

  // 3. Complete Multi-Grid Comparison Matrix (1, 4, 16, 64, 144 cameras)
  app.get("/api/media/adaptive/benchmarks", { config: { noAuth: true } }, async (_request, reply) => {
    const densities: GridDensity[] = [1, 4, 16, 64, 144];
    const benchmarks = densities.map((density) => adaptiveProfileResolverService.summarizeGrid(density));

    return reply.code(200).send({
      success: true,
      data: {
        benchmarks,
        unoptimized144Mbps: 432,
        optimized144Mbps: (benchmarks.find((b) => b.gridDensity === 144)?.totalEstimatedBandwidthKbps ?? 10080) / 1000,
        bandwidthReductionPct: benchmarks.find((b) => b.gridDensity === 144)?.totalBandwidthSavedPct ?? 97.7,
      },
    });
  });
}
