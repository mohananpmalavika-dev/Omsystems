/**
 * Local AI Analytics REST API Routes
 * 
 * Exposes 100% free, local, open-source computer vision, ANPR, face matching,
 * and incident summary endpoints without external paid cloud services.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { localVisionEngineService } from "../ai/services/local-vision-engine.service.js";
import { localAnprService } from "../ai/services/local-anpr.service.js";
import { localFaceMatcherService } from "../ai/services/local-face-matcher.service.js";
import { localIncidentSummaryService } from "../ai/services/local-incident-summary.service.js";
import type { ControlPlaneStore } from "../control-plane-store.js";
import type { Action } from "../domain/models.js";
import {
  activeAnprRegistryMatches,
  recordAnprRegistryMatches,
  recordFaceRegistryMatches,
} from "../analytics/identity-registry.js";

const detectFrameSchema = z.object({
  cameraId: z.string().min(1),
  branchId: z.string().min(1),
  zone: z.enum(["VAULT", "ENTRANCE", "CASH_COUNTER", "ATM_LOBBY", "PERIMETER", "PARKING", "GENERAL"]).optional(),
  rawImageData: z.string().optional(),
  hardwareEvent: z.object({
    vendor: z.enum(["CP_PLUS", "DAHUA", "HIKVISION", "ONVIF"]),
    eventType: z.string(),
      confidence: z.number().min(0).max(1),
    trackId: z.string().optional(),
  }).optional(),
});

const tamperCheckSchema = z.object({
  cameraId: z.string().min(1),
  branchId: z.string().min(1),
  frameVariance: z.number(),
  ssimScore: z.number().min(0).max(1),
  isStreamReceivingBytes: z.boolean(),
});

const anprRecognizeSchema = z.object({
  cameraId: z.string().min(1),
  branchId: z.string().min(1),
  rawText: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  vehicleType: z.enum(["CAR", "TRUCK", "BUS", "MOTORCYCLE", "VAN", "UNKNOWN"]).optional(),
  boundingBox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }).optional(),
});

const faceMatchSchema = z.object({
  cameraId: z.string().min(1),
  branchId: z.string().min(1),
  embeddingVector: z.array(z.number().finite()).length(512),
  minThreshold: z.number().min(0.5).max(0.99).optional(),
});

const faceEnrollSchema = z.object({
  personId: z.string().min(1),
  name: z.string().min(1),
  watchlistType: z.enum(["WANTED", "BLACK_LIST", "VIP", "STAFF", "SUSPECT"]),
  embeddingVector: z.array(z.number().finite()).length(512),
  notes: z.string().optional(),
});

const incidentSummarizeSchema = z.object({
  branchId: z.string().min(1),
  branchName: z.string().optional(),
  alertType: z.string().optional(),
  rootCause: z.string().optional(),
  impactedCameras: z.array(z.string()).optional(),
});

export async function registerLocalAiAnalyticsRoutes(app: FastifyInstance, store?: ControlPlaneStore) {
  async function authorizeCamera(request: FastifyRequest, reply: FastifyReply, cameraId: string, action: Action) {
    if (!store || !request.currentUser) return reply.code(401).send({ error: "unauthenticated" });
    const camera = await store.getCamera(cameraId);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    const decision = await store.checkAccess(request.currentUser, action, camera.nodeId);
    if (!decision?.allowed) return reply.code(403).send({ error: "forbidden" });
    return camera;
  }

  function ephemeralFaceMatcherEnabled() {
    return process.env.NODE_ENV !== "production" && process.env.ENABLE_EPHEMERAL_FACE_MATCHER === "true";
  }
  /**
   * GET /v1/ai/status
   */
  app.get("/v1/ai/status", async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      success: true,
      data: localVisionEngineService.getStatus(),
    });
  });

  /**
   * POST /v1/ai/vision/detect
   */
  app.post("/v1/ai/vision/detect", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = detectFrameSchema.parse(request.body);
    const detections = await localVisionEngineService.processFrame(body as any);
    return reply.send({
      success: true,
      count: detections.length,
      data: detections,
    });
  });

  /**
   * POST /v1/ai/vision/tamper-check
   */
  app.post("/v1/ai/vision/tamper-check", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = tamperCheckSchema.parse(request.body);
    const result = await localVisionEngineService.evaluateCameraTampering(body as any);
    return reply.send({
      success: true,
      data: result,
    });
  });

  /**
   * POST /v1/ai/anpr/recognize
   */
  app.post("/v1/ai/anpr/recognize", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = anprRecognizeSchema.parse(request.body);
    const camera = await authorizeCamera(request, reply, body.cameraId, "analytics:view");
    if (!camera) return;
    if (camera.branchId !== body.branchId) {
      return reply.code(400).send({ error: "camera_branch_mismatch" });
    }
    const result = await localAnprService.recognizePlate(body as any);
    const matches = await activeAnprRegistryMatches(store!, request.currentUser!.tenantId, [result.normalizedPlate]);
    if (matches.length > 0) {
      const match = matches[0]!;
      result.isWatchlistMatch = true;
      result.matchedWatchlistId = match.watchlistId;
      await recordAnprRegistryMatches(store!, request.currentUser!.tenantId, matches.map((item) => item.plateId), result.recognizedAt.toISOString());
    }
    return reply.send({
      success: true,
      data: result,
    });
  });

  /**
   * POST /v1/ai/face/match
   */
  app.post("/v1/ai/face/match", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = faceMatchSchema.parse(request.body);
    const camera = await authorizeCamera(request, reply, body.cameraId, "face:view");
    if (!camera) return;
    if (camera.branchId !== body.branchId) {
      return reply.code(400).send({ error: "camera_branch_mismatch" });
    }
    const result = await localFaceMatcherService.matchFace({
      ...body,
      store: store ?? undefined,
      tenantId: request.currentUser?.tenantId,
    });
    if (result.matched && result.candidate && store && request.currentUser) {
      await recordFaceRegistryMatches(store, request.currentUser.tenantId, {
        cameraId: body.cameraId,
        personId: result.candidate.personId,
        watchlistId: result.candidate.watchlistId,
        similarityScore: result.confidence,
        faceBbox: { x: 0, y: 0, width: 1, height: 1 },
      }).catch((err) => console.warn("Failed recording face match event:", err));
    }
    return reply.send({
      success: true,
      data: result,
    });
  });

  /**
   * POST /v1/ai/face/enroll
   */
  app.post("/v1/ai/face/enroll", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = faceEnrollSchema.parse(request.body);
    if (!store || !request.currentUser || !(await store.listAccessibleNodes(request.currentUser, "face:enrol", "company")).length) {
      return reply.code(403).send({ error: "forbidden" });
    }
    localFaceMatcherService.enrollFace({
      ...body,
      enrolledAt: new Date(),
    } as any);
    return reply.status(201).send({
      success: true,
      message: `Person ${body.name} successfully enrolled in local ${body.watchlistType} watchlist`,
    });
  });

  /**
   * POST /v1/ai/incidents/:id/summarize
   */
  app.post("/v1/ai/incidents/:id/summarize", async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const body = incidentSummarizeSchema.parse(request.body);
    try {
      await localIncidentSummaryService.generateSummary({ incidentId: params.id, ...body } as any);
      return reply.code(503).send({ success: false, error: "incident_summarization_unavailable" });
    } catch (error) {
      return reply.code(503).send({
        success: false,
        error: error instanceof Error ? error.message : "incident_summarization_unavailable",
      });
    }
  });
}
