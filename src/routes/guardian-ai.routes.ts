/**
 * KryptonAI Assistant Routes
 * 
 * JARVIS-like AI assistant for security operations
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { GuardianAIAssistant, KRYPTON_PRODUCT_FEATURES } from "../services/guardian-ai-assistant.service.js";
import { requireFeatureWithLogging } from "../middleware/feature-flag.middleware.js";

const messageSchema = z.object({
  message: z.string().min(1).max(1000),
  sessionId: z.string().optional(),
  context: z.object({
    currentBranchId: z.string().optional(),
  }).optional(),
});

export async function registerGuardianAIRoutes(app: FastifyInstance, pool: any) {
  const guardianAI = new GuardianAIAssistant(pool);

  /**
   * POST /api/v1/guardian/chat
   * 
   * Send message to KryptonAI assistant
   */
  app.post("/api/v1/guardian/chat", {
    config: { noAuth: true, optionalAuth: true }
  }, async (request, reply) => {
    try {
      let user = request.currentUser;
      if (!user && pool) {
        const headerUserId = (request.headers["x-user-id"] || request.headers["x-development-user-id"]) as string | undefined;
        if (headerUserId) {
          const { rows } = await pool.query(
            "SELECT id, username, role, tenant_id as \"tenantId\", status FROM users WHERE id = $1 AND status = 'active'",
            [headerUserId]
          ).catch(() => ({ rows: [] }));
          if (rows && rows.length > 0) {
            user = rows[0];
            request.currentUser = user;
          }
        }
      }
      const isGuest = !user;

      const body = messageSchema.parse(request.body);
      
      // Generate session ID if not provided
      const sessionId = body.sessionId || `guardian-${user ? user.id : "guest"}-${Date.now()}`;

      // Build context
      const context = {
        userId: user?.id || "guest",
        tenantId: user?.tenantId || "public",
        isGuest,
        currentBranchId: user ? body.context?.currentBranchId : undefined,
        permissions: (user as any)?.permissions || [],
      };

      // Process message
      const response = await guardianAI.processMessage(
        sessionId,
        body.message,
        context
      );

      return {
        success: true,
        sessionId,
        data: response,
      };
    } catch (error) {
      app.log.error({ error }, "[KryptonAI] Chat processing encountered an error, returning fallback response");
      const isGuest = !request.currentUser;
      return {
        success: true,
        sessionId: (request.body as any)?.sessionId || `guardian-${Date.now()}`,
        data: {
          message: isGuest
            ? "I am KryptonAI. In pre-login mode, I can answer general questions about platform capabilities, supported CCTV cameras, and signing in. To view live feeds or branch security data, please log in."
            : "KryptonAI operational assistant is active. How can I assist you with checking alerts, camera status, or branch health?",
          type: "text",
          timestamp: new Date().toISOString(),
        },
      };
    }
  });

  /**
   * POST /api/v1/guardian/voice
   * 
   * Process voice command using Whisper + KryptonAI
   */
  app.post("/api/v1/guardian/voice", {
    config: { noAuth: true, optionalAuth: true }
  }, async (request, reply) => {
    try {
      let user = request.currentUser;
      if (!user && pool) {
        const headerUserId = (request.headers["x-user-id"] || request.headers["x-development-user-id"]) as string | undefined;
        if (headerUserId) {
          const { rows } = await pool.query(
            "SELECT id, username, role, tenant_id as \"tenantId\", status FROM users WHERE id = $1 AND status = 'active'",
            [headerUserId]
          ).catch(() => ({ rows: [] }));
          if (rows && rows.length > 0) {
            user = rows[0];
            request.currentUser = user;
          }
        }
      }
      const isGuest = !user;

      // Get audio buffer
      const audioBuffer = await request.body as Buffer;

      if (!audioBuffer || audioBuffer.length === 0) {
        return reply.code(400).send({
          success: false,
          error: "missing_audio",
        });
      }

      // Transcribe audio using Whisper
      // (Reuse AIVideoSearchService's transcription or create shared service)
      const { AIVideoSearchService } = await import("../services/ai-video-search.service.js");
      const videoSearch = new AIVideoSearchService(pool);
      const transcription = await videoSearch.transcribeVoiceQuery(audioBuffer);

      // Process with KryptonAI
      const sessionId = `krypton-voice-${user ? user.id : "guest"}-${Date.now()}`;
      const context = {
        userId: user?.id || "guest",
        tenantId: user?.tenantId || "public",
        isGuest,
        permissions: (user as any)?.permissions || [],
      };

      const response = await guardianAI.processMessage(
        sessionId,
        transcription,
        context
      );

      return {
        success: true,
        transcription,
        sessionId,
        data: response,
      };
    } catch (error) {
      app.log.error({ error }, "[KryptonAI] Voice command failed");
      return reply.code(500).send({
        success: false,
        error: "voice_command_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * GET /api/v1/guardian/suggestions
   * 
   * Get proactive suggestions from KryptonAI
   */
  app.get("/api/v1/guardian/suggestions", {
    config: { noAuth: true, optionalAuth: true }
  }, async (request, reply) => {
    try {
      let user = request.currentUser;
      if (!user && pool) {
        const headerUserId = (request.headers["x-user-id"] || request.headers["x-development-user-id"]) as string | undefined;
        if (headerUserId) {
          const { rows } = await pool.query(
            "SELECT id, username, role, tenant_id as \"tenantId\", status FROM users WHERE id = $1 AND status = 'active'",
            [headerUserId]
          ).catch(() => ({ rows: [] }));
          if (rows && rows.length > 0) {
            user = rows[0];
            request.currentUser = user;
          }
        }
      }
      if (!user) {
        return {
          success: true,
          suggestions: [
            "What is KryptonVision?",
            "What security features and analytics are available?",
            "Which camera hardware and protocols are supported?",
            "How do I sign in or reset my password?",
          ],
          timestamp: new Date().toISOString(),
        };
      }

      const query = z.object({
        branchId: z.string().optional(),
      }).parse(request.query);

      const context = {
        userId: user.id,
        tenantId: user.tenantId,
        currentBranchId: query.branchId,
      };

      const suggestions = await guardianAI.generateProactiveSuggestions(context);

      return {
        success: true,
        suggestions,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      app.log.warn({ error }, "[KryptonAI] Failed to get suggestions, returning defaults");
      return {
        success: true,
        suggestions: [
          "Check all cameras across active branches",
          "Review open operational security alerts",
          "Show system operational health overview",
        ],
        timestamp: new Date().toISOString(),
      };
    }
  });

  /**
   * DELETE /api/v1/guardian/session/:sessionId
   * 
   * Clear conversation history for a session
   */
  app.delete("/api/v1/guardian/session/:sessionId", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const params = z.object({
        sessionId: z.string(),
      }).parse(request.params);

      guardianAI.clearSession(params.sessionId);

      return {
        success: true,
        message: "Session cleared",
      };
    } catch (error) {
      app.log.error({ error }, "[KryptonAI] Failed to clear session");
      return reply.code(500).send({
        success: false,
        error: "clear_session_failed",
      });
    }
  });

  /**
   * POST /api/v1/guardian/execute
   * 
   * Execute a specific action directly (bypass chat)
   */
  app.post("/api/v1/guardian/execute", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const body = z.object({
        action: z.string(),
        parameters: z.record(z.any()),
      }).parse(request.body);

      // Build a command message for the action
      const commandMessage = `Execute ${body.action} with parameters: ${JSON.stringify(body.parameters)}`;

      const sessionId = `guardian-exec-${user.id}-${Date.now()}`;
      const context = {
        userId: user.id,
        tenantId: user.tenantId,
      };

      const response = await guardianAI.processMessage(
        sessionId,
        commandMessage,
        context
      );

      return {
        success: true,
        data: response,
      };
    } catch (error) {
      app.log.error({ error }, "[KryptonAI] Action execution failed");
      return reply.code(500).send({
        success: false,
        error: "execution_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });


  /**
   * GET /api/v1/guardian/features
   *
   * Returns structured KryptonVision product feature cards.
   * Supports ?lang=ml (Malayalam) or ?lang=en (English, default).
   * No authentication required — public product information.
   */
  app.get("/api/v1/guardian/features", {
    config: { noAuth: true },
  }, async (request, _reply) => {
    const query = z.object({
      lang: z.enum(["ml", "en"]).optional().default("en"),
    }).parse(request.query);

    const isMalayalam = query.lang === "ml";

    const cards = KRYPTON_PRODUCT_FEATURES.map((f) => ({
      icon: f.icon,
      title: isMalayalam ? f.titleMl : f.title,
      titleEn: f.title,
      titleMl: f.titleMl,
      description: isMalayalam ? f.descriptionMl : f.description,
      descriptionEn: f.description,
      descriptionMl: f.descriptionMl,
      tags: f.tags,
    }));

    return {
      success: true,
      lang: query.lang,
      total: cards.length,
      platform: "KryptonVision (Sentinel Grid)",
      tagline: isMalayalam
        ? "Enterprise AI Physical Security & Video Analytics Platform"
        : "Enterprise AI Physical Security & Video Analytics Platform",
      features: cards,
      timestamp: new Date().toISOString(),
    };
  });

  app.log.info("[KryptonAI] Routes registered successfully");
}
