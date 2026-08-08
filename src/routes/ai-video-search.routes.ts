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
import { AIVideoSearchService } from "../services/ai-video-search.js";
import { VideoSearchIntegrationPipeline } from "../services/video-search-integration.js";

const nlSearchSchema = z.object({
  query: z.string().min(3).max(500),
  branchId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
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
  cameraIds: z.array(z.string().uuid()).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const similaritySearchSchema = z.object({
  referenceObjectId: z.string().optional(),
  referenceEmbedding: z.array(z.number()).optional(),
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

export async function registerAIVideoSearchRoutes(
  app: FastifyInstance,
  pool: Pool
) {
  const aiVideoSearch = new AIVideoSearchService(pool);
  const integrationPipeline = new VideoSearchIntegrationPipeline(pool);

  /**
   * Natural language video search
   * POST /v1/ai-video-search/natural-language
   */
  app.post("/v1/ai-video-search/natural-language", async (request, reply) => {
    const body = nlSearchSchema.parse(request.body);
    const tenantId = request.currentUser.tenantId;

    try {
      const results = await aiVideoSearch.searchByNaturalLanguage(
        tenantId,
        body.query,
        {
          branchId: body.branchId,
          from: body.from,
          to: body.to,
          limit: body.limit,
        }
      );

      // Enrich results with context
      const enrichedResults = await integrationPipeline.enrichSearchResults(
        tenantId,
        results
      );

      return {
        query: body.query,
        results: enrichedResults,
        total: enrichedResults.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "search_failed", details: message });
    }
  });

  /**
   * Attribute-based video search
   * POST /v1/ai-video-search/attributes
   */
  app.post("/v1/ai-video-search/attributes", async (request, reply) => {
    const body = attributeSearchSchema.parse(request.body);
    const tenantId = request.currentUser.tenantId;

    try {
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
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ error: "search_failed", details: message });
    }
  });

  /**
   * Visual similarity search
   * POST /v1/ai-video-search/similarity
   */
  app.post("/v1/ai-video-search/similarity", async (request, reply) => {
    const body = similaritySearchSchema.parse(request.body);
    const tenantId = request.currentUser.tenantId;

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
  app.post("/v1/ai-video-search/track", async (request, reply) => {
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
  app.post("/v1/ai-video-search/indexing/reindex", async (request, reply) => {
    const body = bulkReindexSchema.parse(request.body);
    const tenantId = request.currentUser.tenantId;

    try {
      const result = await integrationPipeline.bulkReindex({
        tenantId,
        ...body,
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
}
