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
  // HEAT MAP ENDPOINTS
  // ============================================================================

  /**
   * Get current heat map
   */
  app.get("/v1/analytics/heatmap", async (request, reply) => {
    const query = z.object({
      format: z.enum(["grid", "image", "points"]).default("grid"),
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
      return { points };
    }

    // TODO: Implement image format (PNG heat map overlay)
    return reply.code(501).send({ error: "image_format_not_implemented" });
  });

  /**
   * Reset heat map
   */
  app.post("/v1/analytics/heatmap/reset", async (request, reply) => {
    const detector = pipeline.getDetector("heatmap");
    if (detector && "reset" in detector) {
      (detector as any).reset();
      return { success: true, message: "Heat map reset" };
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
    return {
      detectors: [
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
          supported: false, // TODO: Implement
        },
        {
          type: "anpr",
          name: "License Plate Recognition",
          features: ["plate-reading", "watchlist-matching", "vehicle-sessions"],
          supported: false, // TODO: Implement
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
      ],
    };
  });

  /**
   * Get detection statistics
   */
  app.get("/v1/analytics/statistics", async (request, reply) => {
    const query = z.object({
      period: z.enum(["hour", "day", "week"]).default("hour"),
    }).parse(request.query);

    // TODO: Implement time-series statistics from database
    return {
      period: query.period,
      statistics: {
        totalDetections: 0,
        byType: {},
        averageConfidence: 0,
        alerts: 0,
      },
      message: "Statistics endpoint coming soon",
    };
  });
}
