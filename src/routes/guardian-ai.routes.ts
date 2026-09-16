/**
 * Guardian AI Assistant Routes
 * 
 * JARVIS-like AI assistant for security operations
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { GuardianAIAssistant } from "../services/guardian-ai-assistant.service.js";

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
   * Send message to Guardian AI assistant
   */
  app.post("/api/v1/guardian/chat", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const body = messageSchema.parse(request.body);
      
      // Generate session ID if not provided
      const sessionId = body.sessionId || `guardian-${user.id}-${Date.now()}`;

      // Build context
      const context = {
        userId: user.id,
        tenantId: user.tenantId,
        currentBranchId: body.context?.currentBranchId,
        permissions: (user as any).permissions || [],
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
      app.log.error({ error }, "[GuardianAI] Chat failed");
      return reply.code(500).send({
        success: false,
        error: "chat_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * POST /api/v1/guardian/voice
   * 
   * Process voice command using Whisper + Guardian AI
   */
  app.post("/api/v1/guardian/voice", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

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

      // Process with Guardian AI
      const sessionId = `guardian-voice-${user.id}-${Date.now()}`;
      const context = {
        userId: user.id,
        tenantId: user.tenantId,
        permissions: (user as any).permissions || [],
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
      app.log.error({ error }, "[GuardianAI] Voice command failed");
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
   * Get proactive suggestions from Guardian AI
   */
  app.get("/api/v1/guardian/suggestions", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
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
      app.log.error({ error }, "[GuardianAI] Failed to get suggestions");
      return reply.code(500).send({
        success: false,
        error: "suggestions_failed",
      });
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
      app.log.error({ error }, "[GuardianAI] Failed to clear session");
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
      app.log.error({ error }, "[GuardianAI] Action execution failed");
      return reply.code(500).send({
        success: false,
        error: "execution_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.log.info("[GuardianAI] Routes registered successfully");
}
