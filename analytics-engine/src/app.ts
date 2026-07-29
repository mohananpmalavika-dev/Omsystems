import { randomUUID, timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import { z } from "zod";
import { AnalyticsPipeline } from "./analytics-pipeline.js";
import type { AnalyticsRule } from "./analytics-pipeline.js";
import { NotificationEngine } from "./notification-engine.js";
import { StreamProcessor } from "./stream-processor.js";

const objectSchema = z.object({
  label: z.string().trim().min(1).max(100),
  confidence: z.number().min(0).max(1),
  trackId: z.string().trim().min(1).max(200).optional(),
  boundingBox: z.object({
    x: z.number().min(0).max(1), y: z.number().min(0).max(1),
    width: z.number().positive().max(1), height: z.number().positive().max(1),
  }).optional(),
});
const frameObjectSchema = objectSchema.extend({
  boundingBox: z.object({
    x: z.number().min(0).max(1), y: z.number().min(0).max(1),
    width: z.number().positive().max(1), height: z.number().positive().max(1),
  }),
  attributes: z.record(z.unknown()).optional(),
});
const frameRuleSchema = z.object({
  id: z.string().min(1), cameraId: z.string().min(1), detectionType: z.string().min(1),
  enabled: z.boolean().default(true), minConfidence: z.number().min(0).max(1).default(0.65),
  minDurationSeconds: z.number().min(0).default(0), direction: z.string().optional(),
  objectClasses: z.array(z.string()).optional(),
  zone: z.object({
    id: z.string(), name: z.string(), shape: z.enum(["polygon", "line"]),
    points: z.array(z.object({ x: z.number(), y: z.number() })).min(2),
  }).optional(),
});
const frameSchema = z.object({
  tenantId: z.string().min(1), cameraId: z.string().min(1),
  capturedAt: z.string().datetime().default(() => new Date().toISOString()),
  width: z.number().int().positive(), height: z.number().int().positive(),
  imageBase64: z.string().default(""),
  // Omit detections to execute the local ONNX path. Supplying [] explicitly
  // means an upstream inference worker observed no objects.
  detections: z.array(frameObjectSchema).max(2_000).optional(),
  rules: z.array(frameRuleSchema).max(500).default([]),
  metadata: z.record(z.unknown()).default({}),
});
export const detectionSchema = z.object({
  tenantId: z.string().min(1), cameraId: z.string().min(1),
  sourceEventId: z.string().trim().min(1).max(300).default(() => randomUUID()),
  detectionType: z.string().trim().min(1).max(120),
  occurredAt: z.string().datetime().default(() => new Date().toISOString()),
  endedAt: z.string().datetime().optional(),
  confidence: z.number().min(0).max(1),
  durationSeconds: z.number().min(0).max(86_400).default(0),
  modelVersion: z.string().trim().min(1).max(160),
  objects: z.array(objectSchema).max(500).default([]),
  snapshotReference: z.string().trim().min(1).max(2_000).optional(),
  clipReference: z.string().trim().min(1).max(2_000).optional(),
  metadata: z.record(z.unknown()).default({}),
}).refine((event) => !event.endedAt || Date.parse(event.endedAt) >= Date.parse(event.occurredAt), {
  path: ["endedAt"], message: "endedAt must not be before occurredAt",
});

export interface AnalyticsEngineOptions {
  sourceSharedKey: string;
  controlPlaneSharedKey: string;
  controlPlaneUrl?: string;
  submit: (event: z.infer<typeof detectionSchema>) => Promise<unknown>;
  logger?: boolean;
}

export function buildAnalyticsEngine(options: AnalyticsEngineOptions) {
  const app = Fastify({ logger: options.logger ?? false });
  const state = {
    received: 0, accepted: 0, failed: 0,
    lastAcceptedAt: undefined as string | undefined,
  };

  // Initialize analytics pipeline
  const pipeline = new AnalyticsPipeline();
  const notificationEngine = new NotificationEngine({
    controlPlaneUrl: options.controlPlaneUrl ?? "http://127.0.0.1",
    sharedKey: options.controlPlaneSharedKey,
  });
  const streamProcessor = new StreamProcessor(pipeline, options.submit);

  // Initialize pipeline on startup
  const pipelineReady = pipeline.initialize().catch((error) => {
    app.log.error({ error }, "Failed to initialize analytics pipeline");
  });

  // Register detection API routes
  void import("./routes/detection-api.js").then(module => {
    module.registerDetectionApiRoutes(app, pipeline).catch((error) => {
      app.log.error({ error }, "Failed to register detection API routes");
    });
  });

  // Register advanced analytics API routes
  void import("./routes/advanced-analytics-api.js").then(module => {
    module.registerAdvancedAnalyticsRoutes(app, pipeline).catch((error) => {
      app.log.error({ error }, "Failed to register advanced analytics API routes");
    });
  });

  app.addHook("preHandler", async (request, reply) => {
    if (request.url === "/health" || request.url.startsWith("/v1/detectors") || request.url.startsWith("/v1/analytics")) {
      return; // Allow public access to monitoring endpoints
    }
    const key = request.headers["x-analytics-source-key"];
    if (typeof key !== "string" || !same(key, options.sourceSharedKey)) {
      return reply.code(401).send({ error: "invalid_analytics_source_identity" });
    }
  });

  app.get("/health", async () => ({
    status: "ok", service: "sentinel-analytics-engine",
    ...state,
    pipeline: pipeline.getHealth(),
    notifications: notificationEngine.getStatus(),
    streams: {
      active: streamProcessor.getActiveStreams().length,
      stats: streamProcessor.getStats(),
    },
  }));

  app.post("/internal/detections", async (request, reply) => {
    state.received += 1;
    const event = detectionSchema.parse(request.body);
    try {
      const result = await options.submit(event);
      state.accepted += 1;
      state.lastAcceptedAt = new Date().toISOString();
      return reply.code(202).send(result);
    } catch (error) {
      state.failed += 1;
      request.log.error({ error, cameraId: event.cameraId }, "Detection submission failed");
      return reply.code(502).send({
        error: "control_plane_unavailable",
        message: "Detection was not accepted; the camera stream is unaffected.",
      });
    }
  });

  app.post("/internal/detections/batch", async (request, reply) => {
    const events = z.array(detectionSchema).min(1).max(100).parse(request.body);
    state.received += events.length;
    const results = await Promise.allSettled(events.map(options.submit));
    const accepted = results.filter((result) => result.status === "fulfilled").length;
    state.accepted += accepted;
    state.failed += results.length - accepted;
    if (accepted > 0) state.lastAcceptedAt = new Date().toISOString();
    return reply.code(202).send({
      accepted,
      failed: results.length - accepted,
      results: results.map((result, index) => ({
        sourceEventId: events[index]!.sourceEventId,
        status: result.status === "fulfilled" ? "accepted" : "failed",
      })),
    });
  });

  // An edge/open-model worker can send normalized observations here. Omitting
  // `detections` executes the provisioned local ONNX model against RGB24
  // imageBase64; supplying [] explicitly preserves an upstream empty result.
  app.post("/internal/frames", async (request, reply) => {
    const input = frameSchema.parse(request.body);
    await pipelineReady;
    const imageData = input.imageBase64 ? Buffer.from(input.imageBase64, "base64") : Buffer.alloc(0);
    if (input.detections === undefined && imageData.length !== input.width * input.height * 3) {
      return reply.code(400).send({
        error: "invalid_rgb24_frame",
        message: "Omit detections only when imageBase64 contains exactly width * height * 3 RGB24 bytes.",
      });
    }
    const events = await pipeline.processFrame({
      tenantId: input.tenantId,
      cameraId: input.cameraId,
      timestamp: new Date(input.capturedAt),
      imageData,
      width: input.width,
      height: input.height,
      metadata: input.detections === undefined
        ? input.metadata
        : { ...input.metadata, detections: input.detections },
    }, input.rules as AnalyticsRule[]);
    const submissions = await Promise.allSettled(events.map(options.submit));
    const accepted = submissions.filter((item) => item.status === "fulfilled").length;
    state.received += events.length;
    state.accepted += accepted;
    state.failed += events.length - accepted;
    if (accepted > 0) state.lastAcceptedAt = new Date().toISOString();
    return reply.code(202).send({
      cameraId: input.cameraId,
      inferenceMode: input.detections === undefined ? "local-onnx" : "normalized-observation",
      detectionsReceived: input.detections?.length ?? 0,
      eventsGenerated: events.length,
      accepted,
      failed: events.length - accepted,
    });
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({ error: "invalid_detection", details: error.flatten() });
    }
    app.log.error(error);
    return reply.code(500).send({ error: "analytics_engine_failure" });
  });

  // Graceful shutdown
  app.addHook("onClose", async () => {
    await streamProcessor.stopAllStreams();
    await pipeline.cleanup();
  });

  return app;
}

export function createControlPlaneSubmitter(options: {
  controlPlaneUrl: string;
  sharedKey: string;
}) {
  return async (event: z.infer<typeof detectionSchema>) => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(new URL("/internal/analytics/events", options.controlPlaneUrl), {
          method: "POST", signal: AbortSignal.timeout(10_000),
          headers: {
            "content-type": "application/json",
            "x-analytics-engine-key": options.sharedKey,
          },
          body: JSON.stringify(event),
        });
        if (!response.ok) throw new Error(`control_plane_${response.status}`);
        return await response.json();
      } catch (error) {
        lastError = error;
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
    throw lastError;
  };
}

function same(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
