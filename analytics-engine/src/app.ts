import { randomUUID, timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import { z } from "zod";
import { AnalyticsPipeline } from "./analytics-pipeline.js";
import { NotificationEngine } from "./notification-engine.js";
import { StreamProcessor } from "./stream-processor.js";

const detectionTypes = [
  "motion", "person", "vehicle", "object", "line-crossing", "intrusion",
  "loitering", "crowd-density", "camera-tampering", "video-loss", "fire-smoke",
] as const;
const objectSchema = z.object({
  label: z.string().trim().min(1).max(100),
  confidence: z.number().min(0).max(1),
  trackId: z.string().trim().min(1).max(200).optional(),
  boundingBox: z.object({
    x: z.number().min(0).max(1), y: z.number().min(0).max(1),
    width: z.number().positive().max(1), height: z.number().positive().max(1),
  }).optional(),
});
export const detectionSchema = z.object({
  tenantId: z.string().min(1), cameraId: z.string().min(1),
  sourceEventId: z.string().trim().min(1).max(300).default(() => randomUUID()),
  detectionType: z.enum(detectionTypes),
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
  controlPlaneUrl: string;
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
    controlPlaneUrl: options.controlPlaneUrl,
    sharedKey: options.controlPlaneSharedKey,
  });
  const streamProcessor = new StreamProcessor(pipeline, options.submit);

  // Initialize pipeline on startup
  void pipeline.initialize().catch((error) => {
    app.log.error({ error }, "Failed to initialize analytics pipeline");
  });

  app.addHook("preHandler", async (request, reply) => {
    if (request.url === "/health") return;
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
