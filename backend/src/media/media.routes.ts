/**
 * Media API Routes
 * REST endpoints for media session management (Fastify)
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { logger } from "../utils/logger.js";
import { getMediaOrchestrator } from "./media-orchestrator.js";
import type {
  CreateMediaSessionRequest,
  ClientMediaCapabilities,
  BranchMediaCapacity,
  MonitoringProfile,
  SequencePolicy,
} from "./types.js";

export async function mediaRoutes(app: FastifyInstance) {
  // Add authentication hook for all media routes
  app.addHook("preHandler", async (request, reply) => {
    if (!(request as any).currentUser) {
      return reply.code(401).send({
        error: "unauthorized",
        message: "Authentication required for media orchestration endpoints",
      });
    }
  });

  /**
   * POST /api/media/sessions
   * Create a new media session
   */
  app.post("/sessions", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = z.object({
        cameraId: z.string(),
        purpose: z.enum(["MONITORING", "INVESTIGATION", "INCIDENT", "PLAYBACK"]).optional(),
        preferredQuality: z.enum(["AUTO", "SUBSTREAM", "MAINSTREAM"]).optional(),
        priority: z.number().optional(),
        branchId: z.string(),
        clientCapabilities: z.any().optional(),
      }).parse(request.body);

      const orchestrator = getMediaOrchestrator();

      // Get user from Fastify request
      const userId = (request as any).currentUser?.id || "anonymous";
      const tenantId = (request as any).currentUser?.tenantId || "default";

      const sessionRequest: CreateMediaSessionRequest = {
        tenantId,
        userId,
        cameraId: body.cameraId,
        purpose: body.purpose || "MONITORING",
        preferredQuality: body.preferredQuality || "AUTO",
        priority: body.priority || 0,
      };

      const result = await orchestrator.requestMediaSession(
        sessionRequest,
        body.branchId,
        body.clientCapabilities
      );

      if (!result.session) {
        return reply.code(400).send({
          error: result.reason,
        });
      }

      return {
        session: result.session,
        degraded: result.degraded,
        message: result.reason,
      };
    } catch (error) {
      logger.error("Failed to create media session", { error });
      return reply.code(500).send({
        error: "Internal server error",
      });
    }
  });

  /**
   * POST /api/media/sessions/:sessionId/heartbeat
   * Send heartbeat for active session
   */
  app.post("/sessions/:sessionId/heartbeat", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = z.object({ sessionId: z.string() }).parse(request.params);
      const orchestrator = getMediaOrchestrator();

      const success = orchestrator.processHeartbeat(params.sessionId);

      if (!success) {
        return reply.code(404).send({
          error: "Session not found",
        });
      }

      return { success: true };
    } catch (error) {
      logger.error("Failed to process heartbeat", { error });
      return reply.code(500).send({
        error: "Internal server error",
      });
    }
  });

  /**
   * DELETE /api/media/sessions/:sessionId
   * Close media session
   */
  app.delete("/sessions/:sessionId", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = z.object({ sessionId: z.string() }).parse(request.params);
      const orchestrator = getMediaOrchestrator();

      const success = await orchestrator.closeMediaSession(params.sessionId);

      if (!success) {
        return reply.code(404).send({
          error: "Session not found",
        });
      }

      return { success: true };
    } catch (error) {
      logger.error("Failed to close session", { error });
      return reply.code(500).send({
        error: "Internal server error",
      });
    }
  });

  /**
   * POST /api/media/client/register
   * Register client capabilities
   */
  app.post("/client/register", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const capabilities = z.object({
        logicalProcessors: z.number(),
        hardwareConcurrency: z.number(),
        webCodecsAvailable: z.boolean(),
        webRtcAvailable: z.boolean(),
        h265Supported: z.boolean(),
        estimatedDecodeClass: z.enum(["LOW", "STANDARD", "HIGH", "VIDEO_WALL"]),
        screenResolution: z.object({
          width: z.number(),
          height: z.number(),
        }),
      }).parse(request.body);

      const userId = (request as any).currentUser?.id || "anonymous";

      const orchestrator = getMediaOrchestrator();
      const manager = orchestrator.registerClient(userId, capabilities);

      const budget = manager.getBudget();

      return {
        maxActiveDecoders: budget.maxActiveDecoders,
        maxPixelRate: budget.maxPixelRate,
        gpuAccelerationAvailable: budget.gpuAccelerationAvailable,
        preferredCodec: budget.preferredCodec,
      };
    } catch (error) {
      logger.error("Failed to register client", { error });
      return reply.code(500).send({
        error: "Internal server error",
      });
    }
  });

  /**
   * PUT /api/media/branches/:branchId/capacity
   * Update branch media capacity
   */
  app.put("/branches/:branchId/capacity", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = z.object({ branchId: z.string() }).parse(request.params);
      
      const capacity = z.object({
        configuredUploadMbps: z.number(),
        usableVideoBudgetMbps: z.number(),
        activeVideoMbps: z.number(),
        activeSessions: z.number(),
        lastUpdated: z.union([z.string(), z.date()]).optional(),
      }).parse(request.body);

      const branchCapacity: BranchMediaCapacity = {
        ...capacity,
        branchId: params.branchId,
        lastUpdated: capacity.lastUpdated ? new Date(capacity.lastUpdated) : new Date(),
      };

      const orchestrator = getMediaOrchestrator();
      orchestrator.updateBranchCapacity(branchCapacity);

      return { success: true };
    } catch (error) {
      logger.error("Failed to update branch capacity", { error });
      return reply.code(500).send({
        error: "Internal server error",
      });
    }
  });

  /**
   * PUT /api/media/users/:userId/monitoring-profile
   * Set user monitoring profile
   */
  app.put("/users/:userId/monitoring-profile", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = z.object({ userId: z.string() }).parse(request.params);
      
      const profile = z.object({
        role: z.string(),
        maxGridPositions: z.number(),
        preferredDecoderBudget: z.number(),
        maxMainStreams: z.number(),
        maxBranchBandwidthMbps: z.number(),
        sequenceIntervalSeconds: z.number(),
      }).parse(request.body);

      const monitoringProfile: MonitoringProfile = {
        ...profile,
        userId: params.userId,
      };

      const orchestrator = getMediaOrchestrator();
      orchestrator.setMonitoringProfile(monitoringProfile);

      return { success: true };
    } catch (error) {
      logger.error("Failed to set monitoring profile", { error });
      return reply.code(500).send({
        error: "Internal server error",
      });
    }
  });

  /**
   * PUT /api/media/users/:userId/sequence-policy
   * Update sequence policy
   */
  app.put("/users/:userId/sequence-policy", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = z.object({ userId: z.string() }).parse(request.params);
      
      const policy = z.object({
        enabled: z.boolean(),
        intervalSeconds: z.number(),
        pinnedCameraIds: z.array(z.string()),
        rotatingCameraIds: z.array(z.string()),
        activeSlots: z.number(),
        order: z.enum(["BRANCH", "PRIORITY", "ALERT_SEVERITY", "ROUND_ROBIN"]),
      }).parse(request.body);

      const orchestrator = getMediaOrchestrator();
      orchestrator.updateSequencePolicy(params.userId, policy);

      return { success: true };
    } catch (error) {
      logger.error("Failed to update sequence policy", { error });
      return reply.code(500).send({
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/media/metrics/platform
   * Get platform capacity metrics
   */
  app.get("/metrics/platform", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orchestrator = getMediaOrchestrator();
      const metrics = orchestrator.getPlatformMetrics();

      return metrics;
    } catch (error) {
      logger.error("Failed to get platform metrics", { error });
      return reply.code(500).send({
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/media/metrics/workstation
   * Get workstation capacity metrics for current user
   */
  app.get("/metrics/workstation", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).currentUser?.id || "anonymous";
      const orchestrator = getMediaOrchestrator();
      const metrics = orchestrator.getWorkstationMetrics(userId);

      if (!metrics) {
        return reply.code(404).send({
          error: "Client not registered",
        });
      }

      return metrics;
    } catch (error) {
      logger.error("Failed to get workstation metrics", { error });
      return reply.code(500).send({
        error: "Internal server error",
      });
    }
  });
}
