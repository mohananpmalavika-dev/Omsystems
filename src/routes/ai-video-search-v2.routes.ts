/**
 * AI Video Search V2 Routes
 * 
 * Natural language video search with GPT-4V integration
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AIVideoSearchService, naturalLanguageSearchSchema, videoSummaryRequestSchema } from "../services/ai-video-search.service.js";
import { requireFeatureWithLogging } from "../middleware/feature-flag.middleware.js";

export async function registerAIVideoSearchV2Routes(app: FastifyInstance, pool: any) {
  const aiVideoSearch = new AIVideoSearchService(pool);

  /**
   * POST /api/v1/video-search/natural-language
   * 
   * Search videos using natural language queries
   * 
   * Example queries:
   * - "Show me all people wearing red shirts near the ATM between 2pm and 4pm"
   * - "Find vehicles entering the parking lot after 10pm"
   * - "Show me anyone running or fighting in the last hour"
   */
  app.post("/api/v1/video-search/natural-language", {
    preHandler: requireFeatureWithLogging("ai-video-search", "search")
  }, async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const body = naturalLanguageSearchSchema.parse(request.body);

      // Override tenant ID with user's tenant
      const input = {
        ...body,
        tenantId: user.tenantId,
      };

      const result = await aiVideoSearch.searchByNaturalLanguage(input);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: "validation_error",
          details: error.errors,
        });
      }

      app.log.error({ error }, "[AIVideoSearch] Natural language search failed");
      return reply.code(500).send({
        success: false,
        error: "search_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * POST /api/v1/video-search/voice-query
   * 
   * Convert voice audio to text search query using Whisper
   * Then execute the search
   * 
   * Content-Type: audio/webm or audio/wav
   */
  app.post("/api/v1/video-search/voice-query", {
    preHandler: requireFeatureWithLogging("ai-video-search", "voice_search")
  }, async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      // Get audio buffer from request body
      const audioBuffer = await request.body as Buffer;

      if (!audioBuffer || audioBuffer.length === 0) {
        return reply.code(400).send({
          success: false,
          error: "missing_audio",
          message: "No audio data provided",
        });
      }

      // Transcribe voice to text
      const transcription = await aiVideoSearch.transcribeVoiceQuery(audioBuffer);

      app.log.info({ transcription }, "[AIVideoSearch] Voice query transcribed");

      // Execute search with transcribed text
      const result = await aiVideoSearch.searchByNaturalLanguage({
        query: transcription,
        tenantId: user.tenantId,
        maxResults: 20,
        confidenceThreshold: 0.7,
        includeVideoSummary: false,
      });

      return {
        success: true,
        transcription,
        data: result,
      };
    } catch (error) {
      app.log.error({ error }, "[AIVideoSearch] Voice query failed");
      return reply.code(500).send({
        success: false,
        error: "voice_query_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * POST /api/v1/video-search/summarize
   * 
   * Generate AI-powered video summary for a time range
   * Automatically highlights key moments and provides statistics
   */
  app.post("/api/v1/video-search/summarize", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const body = videoSummaryRequestSchema.parse(request.body);

      // Verify camera access
      const { rows: cameras } = await pool.query(
        "SELECT id, name FROM cameras WHERE id = $1",
        [body.cameraId]
      );

      if (cameras.length === 0) {
        return reply.code(404).send({
          success: false,
          error: "camera_not_found",
        });
      }

      // TODO: Add proper camera access check via checkCameraAccess

      const input = {
        ...body,
        tenantId: user.tenantId,
      };

      const summary = await aiVideoSearch.generateVideoSummary(input);

      return {
        success: true,
        data: summary,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: "validation_error",
          details: error.errors,
        });
      }

      app.log.error({ error }, "[AIVideoSearch] Video summary generation failed");
      return reply.code(500).send({
        success: false,
        error: "summary_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * GET /api/v1/video-search/query-suggestions
   * 
   * Get suggested search queries based on recent activity
   */
  app.get("/api/v1/video-search/query-suggestions", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      // Get recent detection types
      const { rows: recentDetections } = await pool.query(
        `SELECT DISTINCT detection_type, COUNT(*) as count
        FROM analytics_events
        WHERE tenant_id = $1
          AND timestamp >= NOW() - INTERVAL '24 hours'
        GROUP BY detection_type
        ORDER BY count DESC
        LIMIT 10`,
        [user.tenantId]
      );

      // Generate smart suggestions based on activity
      const suggestions: string[] = [
        "Show me all people in the last hour",
        "Find vehicles in the parking lot",
        "Show me any incidents today",
      ];

      // Add suggestions based on actual detections
      recentDetections.forEach((row: any) => {
        if (row.detection_type === "person" && row.count > 50) {
          suggestions.push("Show me crowded areas today");
        }
        if (row.detection_type === "vehicle" && row.count > 20) {
          suggestions.push("Track vehicle movement patterns");
        }
        if (["weapon", "violence", "intrusion"].includes(row.detection_type)) {
          suggestions.push(`Show me all ${row.detection_type} alerts this week`);
        }
      });

      return {
        success: true,
        suggestions: suggestions.slice(0, 8), // Return top 8 suggestions
      };
    } catch (error) {
      app.log.error({ error }, "[AIVideoSearch] Failed to get query suggestions");
      return reply.code(500).send({
        success: false,
        error: "suggestions_failed",
      });
    }
  });

  /**
   * POST /api/v1/video-search/explain-query
   * 
   * Explain how the system understood a natural language query
   * (without executing the search)
   */
  app.post("/api/v1/video-search/explain-query", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const body = z.object({
        query: z.string().min(1).max(500),
      }).parse(request.body);

      const parsed = await aiVideoSearch.parseNaturalLanguageQuery(body.query);

      return {
        success: true,
        data: {
          originalQuery: body.query,
          understanding: parsed,
          explanation: `I understood you're looking for ${parsed.objectTypes?.join(", ") || "relevant objects"}`,
        },
      };
    } catch (error) {
      app.log.error({ error }, "[AIVideoSearch] Failed to explain query");
      return reply.code(500).send({
        success: false,
        error: "explain_failed",
      });
    }
  });

  app.log.info("[AIVideoSearchV2] Routes registered successfully");
}
