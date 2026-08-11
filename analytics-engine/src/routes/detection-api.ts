/**
 * Detection API Routes
 * Comprehensive endpoints for all AI detection capabilities
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AnalyticsPipeline } from "../analytics-pipeline.js";

export async function registerDetectionApiRoutes(
  app: FastifyInstance,
  pipeline: AnalyticsPipeline
) {
  // ============================================================================
  // REAL-TIME TRACKING ENDPOINTS
  // ============================================================================

  /**
   * Get active person tracks
   */
  app.get("/v1/detections/persons/tracks", async (request, reply) => {
    const tracks = pipeline.getPersonTracks();
    return {
      count: tracks.length,
      tracks: tracks.map(track => ({
        trackId: track.trackId,
        firstSeen: track.firstSeen.toISOString(),
        lastSeen: track.lastSeen.toISOString(),
        dwellTimeSeconds: (Date.now() - track.firstSeen.getTime()) / 1000,
        isStationary: track.isStationary,
        positionHistory: track.positions.slice(-10), // Last 10 positions
      })),
    };
  });

  /**
   * Get active vehicle tracks
   */
  app.get("/v1/detections/vehicles/tracks", async (request, reply) => {
    const tracks = pipeline.getVehicleTracks();
    return {
      count: tracks.length,
      tracks: tracks.map(track => ({
        trackId: track.trackId,
        vehicleType: track.vehicleType,
        firstSeen: track.firstSeen.toISOString(),
        lastSeen: track.lastSeen.toISOString(),
        speed: track.speed,
        direction: track.direction,
        positionHistory: track.positions.slice(-10),
      })),
    };
  });

  // ============================================================================
  // HEAT MAP ENDPOINTS (LEGACY - Use /v1/analytics/heatmaps/:cameraId instead)
  // ============================================================================

  /**
   * Get current heat map (deprecated)
   * @deprecated Use /v1/analytics/heatmaps/:cameraId for full functionality
   */
  app.get("/v1/analytics/heatmap", async (request, reply) => {
    const query = z.object({
      format: z.enum(["grid", "image", "points"]).default("grid"),
      cameraId: z.string().optional(),
    }).parse(request.query);

    const heatMap = pipeline.getHeatMap();

    if (query.format === "grid") {
      return {
        grid: heatMap.map(row => row.map(cell => ({
          x: cell.x,
          y: cell.y,
          intensity: Math.round(cell.intensity * 255),
          count: cell.count,
        }))),
        dimensions: {
          width: heatMap[0]?.length || 0,
          height: heatMap.length,
        },
        deprecation: {
          message: "This endpoint is deprecated. Use /v1/analytics/heatmaps/:cameraId for full heatmap functionality including image rendering, time ranges, and overlays.",
          newEndpoint: query.cameraId 
            ? `/v1/analytics/heatmaps/${query.cameraId}`
            : "/v1/analytics/heatmaps/:cameraId",
        },
      };
    }

    if (query.format === "points") {
      const points: any[] = [];
      for (const row of heatMap) {
        for (const cell of row) {
          if (cell.intensity > 0.1) {
            points.push({
              x: cell.x,
              y: cell.y,
              intensity: cell.intensity,
              count: cell.count,
            });
          }
        }
      }
      return { 
        points,
        deprecation: {
          message: "This endpoint is deprecated. Use /v1/analytics/heatmaps/:cameraId for full heatmap functionality.",
          newEndpoint: query.cameraId 
            ? `/v1/analytics/heatmaps/${query.cameraId}`
            : "/v1/analytics/heatmaps/:cameraId",
        },
      };
    }

    if (query.format === "image") {
      // Redirect to new heatmap API
      if (!query.cameraId) {
        return reply.code(400).send({
          error: "camera_id_required",
          message: "cameraId query parameter is required for image format",
          hint: "Use /v1/analytics/heatmaps/:cameraId?format=png for image rendering",
        });
      }

      return reply.code(301).send({
        error: "endpoint_moved",
        message: "Image format heatmaps have moved to a new endpoint",
        newEndpoint: `/v1/analytics/heatmaps/${query.cameraId}?format=png`,
        hint: "The new endpoint supports PNG/JPEG rendering, transparent overlays, multiple color maps, and time range queries",
      });
    }

    return { error: "invalid_format" };
  });

  /**
   * Reset heat map (deprecated)
   * @deprecated Heatmaps now use time-bucketed persistent storage
   */
  app.post("/v1/analytics/heatmap/reset", async (request, reply) => {
    const detector = pipeline.getDetector("heatmap");
    if (detector && "reset" in detector) {
      (detector as any).reset();
      return { 
        success: true, 
        message: "Legacy heat map reset (in-memory only)",
        deprecation: {
          message: "This endpoint resets legacy in-memory heatmaps only. New heatmap system uses persistent time-bucketed storage.",
          cleanup: "Use DELETE /v1/analytics/heatmaps/:cameraId?before=<timestamp> to delete old heatmap data",
        },
      };
    }
    return reply.code(404).send({ error: "detector_not_found" });
  });

  // ============================================================================
  // CROWD DENSITY ENDPOINTS
  // ============================================================================

  /**
   * Get current crowd metrics
   */
  app.get("/v1/analytics/crowd/metrics", async (request, reply) => {
    const metrics = pipeline.getCrowdMetrics();
    return {
      zones: metrics,
      summary: {
        totalPersons: metrics.reduce((sum, m) => sum + m.personCount, 0),
        overcrowdedZones: metrics.filter(m => 
          m.densityLevel === "overcrowded" || m.densityLevel === "dangerous"
        ).length,
        bottlenecks: metrics.filter(m => m.isBottleneck).length,
      },
    };
  });

  /**
   * Configure crowd zones
   */
  app.post("/v1/analytics/crowd/zones", async (request, reply) => {
    const body = z.array(z.object({
      zoneId: z.string(),
      name: z.string(),
      polygon: z.array(z.object({ x: z.number(), y: z.number() })),
      maxCapacity: z.number().int().positive(),
      warningThreshold: z.number().min(0).max(100).default(70),
      criticalThreshold: z.number().min(0).max(100).default(90),
    })).parse(request.body);

    pipeline.setCrowdZones(body);
    
    return {
      success: true,
      zonesConfigured: body.length,
      zones: body.map(z => ({ id: z.zoneId, name: z.name })),
    };
  });

  // ============================================================================
  // QUEUE MANAGEMENT ENDPOINTS
  // ============================================================================

  /**
   * Configure queue zones
   */
  app.post("/v1/analytics/queues/zones", async (request, reply) => {
    const body = z.array(z.object({
      zoneId: z.string(),
      name: z.string(),
      polygon: z.array(z.object({ x: z.number(), y: z.number() })),
      servicePoint: z.object({ x: z.number(), y: z.number() }),
      maxLength: z.number().int().positive(),
      targetWaitTimeSeconds: z.number().int().positive().default(300),
    })).parse(request.body);

    pipeline.setQueueZones(body);
    
    return {
      success: true,
      queuesConfigured: body.length,
      queues: body.map(q => ({ id: q.zoneId, name: q.name })),
    };
  });

  // ============================================================================
  // TAILGATING DETECTION ENDPOINTS
  // ============================================================================

  /**
   * Configure entry zones for tailgating detection
   */
  app.post("/v1/analytics/tailgating/zones", async (request, reply) => {
    const body = z.array(z.object({
      zoneId: z.string(),
      name: z.string(),
      polygon: z.array(z.object({ x: z.number(), y: z.number() })),
      maxTimeGapMs: z.number().int().positive().default(2000),
      minDistance: z.number().min(0).max(1).default(0.05),
    })).parse(request.body);

    pipeline.setEntryZones(body);
    
    return {
      success: true,
      zonesConfigured: body.length,
      zones: body.map(z => ({ id: z.zoneId, name: z.name })),
    };
  });

  // ============================================================================
  // DETECTOR HEALTH & STATUS ENDPOINTS
  // ============================================================================

  /**
   * Get health status of all detectors
   */
  app.get("/v1/detectors/health", async (request, reply) => {
    const health = pipeline.getHealth();
    return health;
  });

  /**
   * Get specific detector status
   */
  app.get("/v1/detectors/:type/health", async (request, reply) => {
    const { type } = z.object({ type: z.string() }).parse(request.params);
    
    const detector = pipeline.getDetector(type);
    if (!detector) {
      return reply.code(404).send({ error: "detector_not_found", type });
    }

    return {
      type,
      ...detector.getHealth(),
    };
  });

  // ============================================================================
  // CAMERA-SPECIFIC ENDPOINTS
  // ============================================================================

  /**
   * Get camera health status
   */
  app.get("/v1/cameras/:cameraId/health", async (request, reply) => {
    const { cameraId } = z.object({ cameraId: z.string() }).parse(request.params);
    
    const health = pipeline.getCameraHealth(cameraId);
    return health || { cameraId, status: "unknown" };
  });

  // ============================================================================
  // CONFIGURATION ENDPOINTS
  // ============================================================================

  /**
   * Get detector capabilities
   */
  app.get("/v1/detectors/capabilities", async (request, reply) => {
    const capabilities = [
        {
          type: "person",
          name: "Person Detection",
          features: ["tracking", "counting", "dwell-time"],
          supported: true,
        },
        {
          type: "vehicle",
          name: "Vehicle Detection",
          features: ["tracking", "type-classification", "speed-estimation", "direction"],
          supported: true,
        },
        {
          type: "helmet",
          name: "Helmet Detection",
          features: ["compliance-checking", "violation-detection"],
          supported: true,
        },
        {
          type: "face",
          name: "Face Recognition",
          features: ["watchlist-matching", "age-gender-estimation"],
          supported: true,
        },
        {
          type: "anpr",
          name: "License Plate Recognition",
          features: ["plate-reading", "watchlist-matching", "vehicle-sessions"],
          supported: true,
        },
        {
          type: "fall",
          name: "Fall Detection",
          features: ["pose-analysis", "impact-detection", "recovery-monitoring"],
          supported: true,
        },
        {
          type: "smoke",
          name: "Smoke Detection",
          features: ["early-warning", "density-estimation", "spread-analysis"],
          supported: true,
        },
        {
          type: "fire",
          name: "Fire Detection",
          features: ["early-warning", "severity-assessment", "spread-tracking"],
          supported: true,
        },
        {
          type: "crowd-density",
          name: "Crowd Density Analysis",
          features: ["counting", "occupancy-percentage", "bottleneck-detection"],
          supported: true,
        },
        {
          type: "tailgating",
          name: "Tailgating Detection",
          features: ["unauthorized-entry", "time-gap-analysis"],
          supported: true,
        },
        {
          type: "queue",
          name: "Queue Analysis",
          features: ["length-monitoring", "wait-time-estimation", "service-rate"],
          supported: true,
        },
        {
          type: "loitering",
          name: "Loitering Detection",
          features: ["dwell-time-tracking", "zone-based"],
          supported: true,
        },
        {
          type: "intrusion",
          name: "Intrusion Detection",
          features: ["zone-violation", "restricted-area-monitoring"],
          supported: true,
        },
        {
          type: "line-crossing",
          name: "Line Crossing",
          features: ["directional-counting", "entry-exit-tracking"],
          supported: true,
        },
        {
          type: "heatmap",
          name: "Heat Map Analysis",
          features: ["traffic-flow", "hotspot-detection", "pattern-analysis"],
          supported: true,
        },
      ];
    const healthType: Record<string, string> = {
      loitering: "zone",
      intrusion: "zone",
      "line-crossing": "zone",
      heatmap: "heatmap",
      "crowd-density": "crowd",
    };
    return {
      detectors: capabilities.map((capability) => {
        const health = pipeline.getDetector(healthType[capability.type] ?? capability.type)?.getHealth();
        return {
          ...capability,
          status: health?.status ?? "unhealthy",
          details: health?.details ?? "Detector is not registered in the active pipeline.",
          // `supported` means the event contract exists. `available` is the
          // operational state, including whether a required model is loaded.
          available: health?.status === "healthy",
        };
      }),
    };
  });

  /**
   * Get detection statistics (requires control plane database)
   */
  app.get("/v1/analytics/statistics", async (request, reply) => {
    // Import schema
    const { statisticsQuerySchema } = await import("../schemas/analytics-statistics.schema.js");
    
    const query = statisticsQuerySchema.parse(request.query);

    // In production, tenantId should come from authenticated user context
    // For now, accept from query parameter (NOT SECURE - replace with auth)
    const tenantId = query.tenantId ?? request.headers["x-tenant-id"] as string;

    if (!tenantId) {
      return reply.code(400).send({
        error: "tenant_id_required",
        message: "Tenant ID must be provided via query parameter or x-tenant-id header",
        hint: "In production this should come from authenticated user context",
      });
    }

    try {
      // Dynamic import to avoid circular dependencies with database initialization
      const { getStatisticsService } = await import("../statistics-integration.js");
      const service = await getStatisticsService();

      if (!service) {
        return reply.code(503).send({
          error: "statistics_unavailable",
          message: "Statistics service is not available. Control plane database connection required.",
          hint: "This endpoint requires DATABASE_URL to be configured with control plane connection",
        });
      }

      const { AnalyticsStatisticsService } = await import("../services/analytics-statistics.service.js");

      const result = await service.getStatistics({
        tenantId,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        bucket: query.bucket,
        detectorTypes: AnalyticsStatisticsService.parseDetectorTypes(query.detectorType),
        severities: AnalyticsStatisticsService.parseSeverities(query.severity),
        cameraId: query.cameraId,
        branchId: query.branchId,
        includeTimeline: query.includeTimeline,
        includeCameraBreakdown: query.includeCameraBreakdown,
        includeBranchBreakdown: query.includeBranchBreakdown,
      });

      return reply.code(200).send(result);
    } catch (error: any) {
      request.log.error({ err: error }, "Analytics statistics query failed");

      if (error.name === "ValidationError") {
        return reply.code(400).send({
          error: "validation_error",
          message: error.message,
        });
      }

      return reply.code(503).send({
        error: "analytics_statistics_unavailable",
        message: "Unable to retrieve analytics statistics",
        details: error.message,
      });
    }
  });
}
