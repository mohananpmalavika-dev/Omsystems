/**
 * AI Video Search Routes
 * 
 * Advanced video search capabilities including:
 * - Natural language search
 * - Visual similarity search
 * - Cross-camera tracking
 * - Embedding management
 * - Search analytics
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Pool } from "pg";
import { AIVideoSearchService, VideoSearchError, ValidationError as SearchValidationError } from "../services/ai-video-search.js";
import { VideoSearchIntegrationPipeline, PipelineError } from "../services/video-search-integration.js";
import { initializeMetrics, getMetrics } from "../services/video-search-metrics.js";

/**
 * Error response formatter
 */
function formatErrorResponse(error: unknown) {
  if (error instanceof SearchValidationError || error instanceof PipelineError) {
    return {
      error: error.code,
      message: error.message,
      details: error.details,
      statusCode: error instanceof SearchValidationError ? error.statusCode : 400,
    };
  }
  
  if (error instanceof VideoSearchError) {
    return {
      error: error.code,
      message: error.message,
      details: error.details,
      statusCode: error.statusCode,
    };
  }

  if (error instanceof z.ZodError) {
    return {
      error: "VALIDATION_ERROR",
      message: "Invalid request parameters",
      details: error.errors,
      statusCode: 400,
    };
  }

  // Generic error
  const message = error instanceof Error ? error.message : String(error);
  return {
    error: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
    details: { originalError: message },
    statusCode: 500,
  };
}

const nlSearchSchema = z.object({
  query: z.string().trim().min(3).max(500),
  branchId: z.string().uuid().optional(),
  cameraIds: z.array(z.string().uuid()).min(1).max(100).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const attributeSearchSchema = z.object({
  objectType: z.enum(["person", "vehicle", "object", "animal"]),
  attributes: z.object({
    upperClothingColor: z.string().optional(),
    lowerClothingColor: z.string().optional(),
    vehicleColor: z.string().optional(),
    vehicleType: z.enum(["car", "truck", "motorcycle", "bicycle", "bus", "van"]).optional(),
    hasBag: z.boolean().optional(),
    hasBackpack: z.boolean().optional(),
    hasHat: z.boolean().optional(),
    hasGlasses: z.boolean().optional(),
    licensePlate: z.string().optional(),
  }),
  branchId: z.string().uuid().optional(),
  cameraIds: z.array(z.string().uuid()).max(100).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const similaritySearchSchema = z.object({
  referenceObjectId: z.string().optional(),
  referenceEmbedding: z.array(z.number().finite()).min(1).max(4096).optional(),
  objectType: z.enum(["person", "vehicle", "object", "animal"]).optional(),
  threshold: z.number().min(0).max(1).default(0.7),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
}).refine(
  (data) => data.referenceObjectId || data.referenceEmbedding,
  { message: "Either referenceObjectId or referenceEmbedding must be provided" }
);

const crossCameraTrackingSchema = z.object({
  objectId: z.string(),
  startTimestamp: z.string().datetime(),
  timeWindowMinutes: z.number().int().min(1).max(180).default(30),
});

const bulkReindexSchema = z.object({
  cameraId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  from: z.string().datetime(),
  to: z.string().datetime(),
  priority: z.number().int().min(1).max(1000).default(50),
});

const maxSearchWindowMs = 31 * 24 * 60 * 60 * 1000;

function hasValidSearchWindow(from?: string, to?: string): boolean {
  if (!from || !to) return true;
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start && end - start <= maxSearchWindowMs;
}

class QueryComplexityAnalyzer {
  static calculateComplexity(query: {
    naturalLanguageQuery?: string;
    timeRangeDays?: number;
    cameraCount?: number;
    hasEmbeddings?: boolean;
    requiresCrossCameraTracking?: boolean;
    attributeCount?: number;
  }): number {
    let complexity = 1;

    if (query.naturalLanguageQuery && query.naturalLanguageQuery.length > 50) {
      complexity += 1;
    }

    if (query.timeRangeDays) {
      if (query.timeRangeDays > 30) complexity += 2;
      else if (query.timeRangeDays > 7) complexity += 1;
    }

    if (query.cameraCount) {
      if (query.cameraCount > 50) complexity += 3;
      else if (query.cameraCount > 10) complexity += 2;
      else if (query.cameraCount > 1) complexity += 1;
    }

    if (query.hasEmbeddings) {
      complexity += 2;
    }

    if (query.requiresCrossCameraTracking) {
      complexity += 3;
    }

    if (query.attributeCount && query.attributeCount > 3) {
      complexity += 1;
    }

    return complexity;
  }

  static isComplexQuery(complexity: number, threshold: number = 5): boolean {
    return complexity > threshold;
  }
}

export async function registerAIVideoSearchRoutes(
  app: FastifyInstance,
  pool: Pool
) {
  const aiVideoSearch = new AIVideoSearchService(pool);
  const integrationPipeline = new VideoSearchIntegrationPipeline(pool);
  integrationPipeline.start();
  app.addHook("onClose", async () => integrationPipeline.stop());

  // Initialize metrics
  const metrics = initializeMetrics(pool);

  // Set up metrics event listeners
  metrics.on("critical_error", (error) => {
    app.log.error({ error }, "Critical video search error");
    // Could integrate with alerting system here (PagerDuty, Slack, etc.)
  });

  metrics.on("aggregated_metrics", (data) => {
    app.log.info({ metrics: data }, "Video search metrics aggregated");
  });

  /**
   * Natural language video search
   * POST /v1/ai-video-search/natural-language
   */
  app.post(
    "/v1/ai-video-search/natural-language",
    async (request, reply) => {
    const operationId = `search_${Date.now()}_${Math.random()}`;
    metrics.startTimer(operationId);
    
    try {
      const body = nlSearchSchema.parse(request.body);
      const tenantId = request.currentUser.tenantId;

      if (!hasValidSearchWindow(body.from, body.to)) {
        metrics.recordError({
          errorType: "VALIDATION_ERROR",
          errorMessage: "Invalid time range",
          endpoint: "/v1/ai-video-search/natural-language",
          tenantId,
          severity: "low",
        });
        return reply.code(400).send({ 
          error: "INVALID_TIME_RANGE",
          message: "Search time range is invalid or exceeds maximum allowed duration" 
        });
      }

      // Calculate query complexity
      const timeRangeDays = body.from && body.to
        ? (new Date(body.to).getTime() - new Date(body.from).getTime()) / (1000 * 60 * 60 * 24)
        : undefined;
      
      const complexity = QueryComplexityAnalyzer.calculateComplexity({
        naturalLanguageQuery: body.query,
        timeRangeDays,
        cameraCount: body.cameraIds?.length || 1,
      });

      // Queue search if complex
      const searchOperation = async () => {
        const results = await aiVideoSearch.searchByNaturalLanguage(
          tenantId,
          body.query,
          {
            branchId: body.branchId,
            cameraIds: body.cameraIds,
            from: body.from,
            to: body.to,
            minConfidence: body.minConfidence,
            limit: body.limit,
          }
        );

        // Enrich results with context
        return await integrationPipeline.enrichSearchResults(tenantId, results);
      };

      const enrichedResults = await searchOperation();

      const responseTimeMs = metrics.endTimer(operationId, "video_search_response_time");
      
      // Record successful search
      metrics.recordSearch({
        success: true,
        responseTimeMs,
        queryType: "natural_language",
        tenantId,
        resultCount: enrichedResults.length,
        query: body.query,
        complexity,
      });

      // Update query analytics in database
      await pool.query(
        "SELECT update_query_analytics($1, $2, $3, $4)",
        [tenantId, body.query, "natural_language", responseTimeMs]
      ).catch(err => {
        app.log.warn({ err }, "Failed to update query analytics");
      });

      return {
        query: body.query,
        results: enrichedResults,
        total: enrichedResults.length,
        metadata: {
          complexity,
          responseTimeMs,
        },
      };
    } catch (error) {
      const responseTimeMs = metrics.endTimer(operationId, "video_search_response_time");
      
      metrics.recordSearch({
        success: false,
        responseTimeMs,
        queryType: "natural_language",
        tenantId: request.currentUser?.tenantId || "unknown",
        resultCount: 0,
      });

      metrics.recordError({
        errorType: error instanceof VideoSearchError ? error.code : "UNKNOWN_ERROR",
        errorMessage: error instanceof Error ? error.message : String(error),
        endpoint: "/v1/ai-video-search/natural-language",
        tenantId: request.currentUser?.tenantId,
        severity: error instanceof SearchValidationError ? "low" : "high",
      });

      const errorResponse = formatErrorResponse(error);
      app.log.error({ error, route: "natural-language-search" }, "Video search failed");
      return reply.code(errorResponse.statusCode).send(errorResponse);
    }
  });

  /**
   * Attribute-based video search
   * POST /v1/ai-video-search/attributes
   */
  app.post(
    "/v1/ai-video-search/attributes",
    async (request, reply) => {
    try {
      const body = attributeSearchSchema.parse(request.body);
      const tenantId = request.currentUser.tenantId;

      if (!hasValidSearchWindow(body.from, body.to)) {
        return reply.code(400).send({ 
          error: "INVALID_TIME_RANGE",
          message: "Search time range is invalid or exceeds maximum allowed duration" 
        });
      }

      const results = await aiVideoSearch.searchByAttributes(
        tenantId,
        body.objectType,
        body.attributes,
        {
          branchId: body.branchId,
          cameraIds: body.cameraIds,
          from: body.from,
          to: body.to,
          minConfidence: body.minConfidence,
          limit: body.limit,
        }
      );

      return {
        results,
        total: results.length,
      };
    } catch (error) {
      const errorResponse = formatErrorResponse(error);
      app.log.error({ error, route: "attribute-search" }, "Attribute search failed");
      return reply.code(errorResponse.statusCode).send(errorResponse);
    }
  });

  /**
   * Visual similarity search
   * POST /v1/ai-video-search/similarity
   */
  app.post(
    "/v1/ai-video-search/similarity",
    async (request, reply) => {
    const body = similaritySearchSchema.parse(request.body);
    const tenantId = request.currentUser.tenantId;

    if (!hasValidSearchWindow(body.from, body.to)) {
      return reply.code(400).send({ error: "invalid_time_range" });
    }

    try {
      let results;

      if (body.referenceObjectId) {
        // Search by example object
        results = await aiVideoSearch.findSimilarObjects(
          tenantId,
          body.referenceObjectId,
          {
            threshold: body.threshold,
            limit: body.limit,
            excludeOriginal: true,
          }
        );
      } else if (body.referenceEmbedding) {
        // Search by embedding
        results = await aiVideoSearch.searchBySimilarity(
          tenantId,
          body.referenceEmbedding,
          {
            objectType: body.objectType,
            threshold: body.threshold,
            limit: body.limit,
            from: body.from,
            to: body.to,
          }
        );
      } else {
        return reply.code(400).send({ error: "invalid_request" });
      }

      return {
        results,
        total: results.length,
        threshold: body.threshold,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "search_failed", details: message });
    }
  });

  /**
   * Track object across cameras
   * POST /v1/ai-video-search/track
   */
  app.post(
    "/v1/ai-video-search/track",
    async (request, reply) => {
    const body = crossCameraTrackingSchema.parse(request.body);
    const tenantId = request.currentUser.tenantId;

    try {
      const track = await aiVideoSearch.trackAcrossCameras(
        tenantId,
        body.objectId,
        body.startTimestamp,
        body.timeWindowMinutes
      );

      if (!track) {
        return reply.code(404).send({ error: "no_cross_camera_track_found" });
      }

      return track;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "tracking_failed", details: message });
    }
  });

  /**
   * Get cross-camera tracks for time range
   * GET /v1/ai-video-search/tracks
   */
  app.get("/v1/ai-video-search/tracks", async (request, reply) => {
    const query = z.object({
      objectType: z.enum(["person", "vehicle", "object", "animal"]).optional(),
      branchId: z.string().uuid().optional(),
      from: z.string().datetime(),
      to: z.string().datetime(),
      minCameras: z.coerce.number().int().min(2).default(2),
    }).parse(request.query);

    const tenantId = request.currentUser.tenantId;

    try {
      const tracks = await aiVideoSearch.getCrossCameraTracks(tenantId, {
        objectType: query.objectType,
        branchId: query.branchId,
        from: query.from,
        to: query.to,
        minCameras: query.minCameras,
      });

      return {
        tracks,
        total: tracks.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "fetch_failed", details: message });
    }
  });

  /**
   * Get object journey visualization
   * GET /v1/ai-video-search/journey/:trackingId
   */
  app.get("/v1/ai-video-search/journey/:trackingId", async (request, reply) => {
    const { trackingId } = z.object({
      trackingId: z.string(),
    }).parse(request.params);

    const tenantId = request.currentUser.tenantId;

    try {
      const journey = await aiVideoSearch.getObjectJourney(tenantId, trackingId);
      return journey;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      
      if (message.includes("not_found")) {
        return reply.code(404).send({ error: "tracking_id_not_found" });
      }
      
      return reply.code(500).send({ error: "fetch_failed", details: message });
    }
  });

  /**
   * Get embedding statistics
   * GET /v1/ai-video-search/embeddings/statistics
   */
  app.get("/v1/ai-video-search/embeddings/statistics", async (request, reply) => {
    const tenantId = request.currentUser.tenantId;

    try {
      const stats = await aiVideoSearch.getEmbeddingStatistics(tenantId);
      return stats;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "fetch_failed", details: message });
    }
  });

  /**
   * Get indexing statistics
   * GET /v1/ai-video-search/indexing/statistics
   */
  app.get("/v1/ai-video-search/indexing/statistics", async (request, reply) => {
    const tenantId = request.currentUser.tenantId;

    try {
      const stats = await integrationPipeline.getIndexingStatistics(tenantId);
      return stats;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "fetch_failed", details: message });
    }
  });

  /**
   * Trigger bulk re-indexing
   * POST /v1/ai-video-search/indexing/reindex
   */
  app.post(
    "/v1/ai-video-search/indexing/reindex",
    async (request, reply) => {
    const body = bulkReindexSchema.parse(request.body);
    const tenantId = request.currentUser.tenantId;

    if (!hasValidSearchWindow(body.from, body.to)) {
      return reply.code(400).send({ error: "invalid_time_range" });
    }

    try {
      const result = await integrationPipeline.bulkReindex({
        tenantId,
        ...body,
        from: body.from!,
        to: body.to!,
      });

      return {
        success: true,
        jobsCreated: result.jobsCreated,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "reindex_failed", details: message });
    }
  });

  /**
   * Retry failed indexing jobs
   * POST /v1/ai-video-search/indexing/retry
   */
  app.post("/v1/ai-video-search/indexing/retry", async (request, reply) => {
    const tenantId = request.currentUser.tenantId;

    try {
      const retriedCount = await integrationPipeline.retryFailedJobs(tenantId);
      
      return {
        success: true,
        retriedJobs: retriedCount,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "retry_failed", details: message });
    }
  });

  /**
   * Find person by clothing
   * POST /v1/ai-video-search/find-person
   */
  app.post("/v1/ai-video-search/find-person", async (request, reply) => {
    const body = z.object({
      upperColor: z.string().optional(),
      lowerColor: z.string().optional(),
      hasBackpack: z.boolean().optional(),
      hasBag: z.boolean().optional(),
      branchId: z.string().uuid().optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    }).parse(request.body);

    const tenantId = request.currentUser.tenantId;

    try {
      const results = await aiVideoSearch.findPersonByClothing(
        tenantId,
        body,
        {
          branchId: body.branchId,
          from: body.from,
          to: body.to,
        }
      );

      return {
        results,
        total: results.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "search_failed", details: message });
    }
  });

  /**
   * Find vehicle
   * POST /v1/ai-video-search/find-vehicle
   */
  app.post("/v1/ai-video-search/find-vehicle", async (request, reply) => {
    const body = z.object({
      type: z.enum(["car", "truck", "motorcycle", "bicycle", "bus", "van"]).optional(),
      color: z.string().optional(),
      licensePlate: z.string().optional(),
      branchId: z.string().uuid().optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    }).parse(request.body);

    const tenantId = request.currentUser.tenantId;

    try {
      const results = await aiVideoSearch.findVehicle(
        tenantId,
        body,
        {
          branchId: body.branchId,
          from: body.from,
          to: body.to,
        }
      );

      return {
        results,
        total: results.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "search_failed", details: message });
    }
  });

  app.log.info("AI video search routes registered");

  /**
   * Health check endpoint
   * GET /v1/ai-video-search/health
   */
  app.get("/v1/ai-video-search/health", async (request, reply) => {
    try {
      const health = await metrics.getHealthStatus();
      const statusCode = health.status === "healthy" ? 200 
                       : health.status === "degraded" ? 200 
                       : 503;
      return reply.code(statusCode).send(health);
    } catch (error) {
      return reply.code(503).send({
        status: "unhealthy",
        checks: { error: { status: "unhealthy", message: "Health check failed" } },
      });
    }
  });

  /**
   * Performance metrics endpoint
   * GET /v1/ai-video-search/metrics/performance
   */
  app.get("/v1/ai-video-search/metrics/performance", async (request, reply) => {
    try {
      const searchMetrics = metrics.getSearchPerformanceMetrics();
      const indexingMetrics = await metrics.getIndexingPerformanceMetrics(
        request.currentUser?.tenantId
      );
      
      return {
        search: searchMetrics,
        indexing: indexingMetrics,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "metrics_failed", details: message });
    }
  });

  /**
   * Error metrics endpoint
   * GET /v1/ai-video-search/metrics/errors
   */
  app.get("/v1/ai-video-search/metrics/errors", async (request, reply) => {
    try {
      const errorMetrics = metrics.getErrorMetrics();
      return errorMetrics;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "metrics_failed", details: message });
    }
  });

  /**
   * Query analytics endpoint
   * GET /v1/ai-video-search/metrics/queries
   */
  app.get("/v1/ai-video-search/metrics/queries", async (request, reply) => {
    try {
      const tenantId = request.currentUser.tenantId;
      
      const result = await pool.query(
        `SELECT 
           query_text, query_type, execution_count,
           avg_response_time_ms, last_executed_at
         FROM video_search_query_analytics
         WHERE tenant_id = $1
         ORDER BY execution_count DESC
         LIMIT 50`,
        [tenantId]
      );

      return {
        topQueries: result.rows,
        total: result.rows.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "analytics_failed", details: message });
    }
  });

  /**
   * SLA metrics endpoint
   * GET /v1/ai-video-search/metrics/sla
   */
  app.get("/v1/ai-video-search/metrics/sla", async (request, reply) => {
    try {
      const tenantId = request.currentUser.tenantId;
      const query = z.object({
        days: z.coerce.number().int().min(1).max(90).default(30),
      }).parse(request.query);

      const result = await pool.query(
        `SELECT * FROM video_search_sla_summary
         WHERE tenant_id = $1
         AND metric_date >= CURRENT_DATE - INTERVAL '1 day' * $2
         ORDER BY metric_date DESC`,
        [tenantId, query.days]
      );

      return {
        sla: result.rows,
        period: query.days,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "sla_failed", details: message });
    }
  });
}

