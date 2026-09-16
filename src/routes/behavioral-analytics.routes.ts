/**
 * Behavioral Analytics & Anomaly Detection API Routes
 * 
 * Provides endpoints for:
 * - Learning behavior baselines
 * - Detecting anomalies
 * - Predictive alerting
 * - Crowd behavior analysis
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { 
  BehavioralAnalyticsService,
  behaviorAnalysisQuerySchema,
} from "../services/behavioral-analytics.service.js";
import type { NaturalLanguageSearchInput } from "../services/ai-video-search.service.js";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { actions } from "../domain/models.js";

// Request schemas
const learnBaselineSchema = z.object({
  cameraId: z.string().min(1),
  daysOfHistory: z.number().int().min(1).max(90).default(7),
});

const detectAnomaliesSchema = z.object({
  cameraId: z.string().min(1),
  windowMinutes: z.number().int().min(5).max(1440).default(60),
});

const generatePredictionsSchema = z.object({
  branchId: z.string().min(1),
  lookAheadHours: z.number().int().min(1).max(168).default(24),
});

const updateAnomalySchema = z.object({
  reviewed: z.boolean().optional(),
  falsePositive: z.boolean().optional(),
});

const dismissPredictionSchema = z.object({
  reason: z.string().min(1).max(500),
});

export async function registerBehavioralAnalyticsRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  pool?: Pool
) {
  if (!pool) {
    app.log.warn("Behavioral analytics routes skipped: PostgreSQL pool not available");
    return;
  }
  const service = new BehavioralAnalyticsService(pool);

  // ============================================================================
  // BASELINE LEARNING
  // ============================================================================

  /**
   * Learn baseline behavior for a camera
   * POST /v1/behavioral-analytics/baselines/learn
   */
  app.post("/v1/behavioral-analytics/baselines/learn", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = learnBaselineSchema.parse(request.body);
      
      // Check camera access
      const camera = await store.getCamera(body.cameraId);
      if (!camera) {
        return reply.code(404).send({ error: "camera_not_found" });
      }

      // Check permissions
      const decision = await store.checkAccess(
        request.currentUser,
        "analytics:configure",
        camera.nodeId
      );
      if (!decision?.allowed) {
        return reply.code(403).send({ error: "forbidden" });
      }

      // Learn baseline
      const baseline = await service.learnBaseline(body.cameraId, body.daysOfHistory);

      await store.writeAudit({
        tenantId: request.currentUser.tenantId,
        actorUserId: request.currentUser.id,
        action: "behavioral_analytics.baseline_learned",
        resourceNodeId: camera.nodeId,
        outcome: "success",
        sourceIp: request.ip,
        details: {
          cameraId: body.cameraId,
          daysOfHistory: body.daysOfHistory,
          confidenceScore: baseline.confidenceScore,
          learnedFrom: baseline.learnedFrom,
        },
      });

      return baseline;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.flatten() });
      }
      app.log.error({ error }, "Failed to learn baseline");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  /**
   * Get baseline for a camera
   * GET /v1/behavioral-analytics/baselines/:cameraId
   */
  app.get("/v1/behavioral-analytics/baselines/:cameraId", async (request: FastifyRequest, reply: FastifyReply) => {
    const { cameraId } = request.params as { cameraId: string };

    try {
      // Check camera access
      const camera = await store.getCamera(cameraId);
      if (!camera) {
        return reply.code(404).send({ error: "camera_not_found" });
      }

      const decision = await store.checkAccess(
        request.currentUser,
        "analytics:view",
        camera.nodeId
      );
      if (!decision?.allowed) {
        return reply.code(403).send({ error: "forbidden" });
      }

      // Get baseline from database
      const { rows } = await pool.query(
        `SELECT 
          id,
          camera_id,
          location,
          time_window,
          avg_detections_per_hour,
          avg_occupancy,
          common_object_types,
          peak_hours,
          quiet_hours,
          typical_duration,
          confidence_score,
          learned_from,
          last_updated,
          created_at
        FROM behavior_baselines
        WHERE camera_id = $1
        ORDER BY last_updated DESC
        LIMIT 1`,
        [cameraId]
      );

      if (rows.length === 0) {
        return reply.code(404).send({ 
          error: "baseline_not_found",
          message: "No baseline learned yet. Use POST /baselines/learn to create one.",
        });
      }

      return rows[0];
    } catch (error) {
      app.log.error({ error }, "Failed to get baseline");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  /**
   * List all baselines for accessible cameras
   * GET /v1/behavioral-analytics/baselines
   */
  app.get("/v1/behavioral-analytics/baselines", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = z.object({
        branchId: z.string().optional(),
        minConfidence: z.coerce.number().min(0).max(1).default(0),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }).parse(request.query);

      // Get accessible cameras
      const cameras = await store.listAccessibleCameras(
        request.currentUser,
        "analytics:view",
        { branchId: query.branchId, limit: 1000, offset: 0 }
      );
      const cameraIds = cameras.cameras.map(c => c.id);

      if (cameraIds.length === 0) {
        return { data: [], total: 0 };
      }

      // Get baselines
      const { rows } = await pool.query(
        `SELECT 
          b.*,
          c.name as camera_name
        FROM behavior_baselines b
        JOIN cameras c ON b.camera_id = c.id
        WHERE b.camera_id = ANY($1)
          AND b.confidence_score >= $2
        ORDER BY b.last_updated DESC
        LIMIT $3`,
        [cameraIds, query.minConfidence, query.limit]
      );

      return { data: rows, total: rows.length };
    } catch (error) {
      app.log.error({ error }, "Failed to list baselines");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  // ============================================================================
  // ANOMALY DETECTION
  // ============================================================================

  /**
   * Detect anomalies for a camera
   * POST /v1/behavioral-analytics/detect
   */
  app.post("/v1/behavioral-analytics/detect", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = detectAnomaliesSchema.parse(request.body);

      // Check camera access
      const camera = await store.getCamera(body.cameraId);
      if (!camera) {
        return reply.code(404).send({ error: "camera_not_found" });
      }

      const decision = await store.checkAccess(
        request.currentUser,
        "analytics:configure",
        camera.nodeId
      );
      if (!decision?.allowed) {
        return reply.code(403).send({ error: "forbidden" });
      }

      // Detect anomalies
      const anomalies = await service.detectAnomalies(body.cameraId, body.windowMinutes);

      return { 
        data: anomalies,
        count: anomalies.length,
        cameraId: body.cameraId,
        windowMinutes: body.windowMinutes,
        detectedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.flatten() });
      }
      app.log.error({ error }, "Failed to detect anomalies");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  /**
   * List anomalies
   * GET /v1/behavioral-analytics/anomalies
   */
  app.get("/v1/behavioral-analytics/anomalies", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = z.object({
        cameraId: z.string().optional(),
        branchId: z.string().optional(),
        anomalyType: z.string().optional(),
        severity: z.enum(["low", "medium", "high", "critical"]).optional(),
        reviewed: z.enum(["true", "false"]).optional(),
        falsePositive: z.enum(["true", "false"]).optional(),
        minConfidence: z.coerce.number().min(0).max(1).default(0.5),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      }).parse(request.query);

      // Get accessible cameras
      const cameras = await store.listAccessibleCameras(
        request.currentUser,
        "analytics:view",
        { branchId: query.branchId, limit: 1000, offset: 0 }
      );
      const cameraIds = cameras.cameras.map(c => c.id);

      if (cameraIds.length === 0) {
        return { data: [], total: 0, limit: query.limit, offset: query.offset };
      }

      // Build WHERE clause
      const conditions: string[] = ["camera_id = ANY($1)"];
      const params: any[] = [cameraIds];
      let paramIndex = 2;

      if (query.cameraId) {
        conditions.push(`camera_id = $${paramIndex}`);
        params.push(query.cameraId);
        paramIndex++;
      }

      if (query.anomalyType) {
        conditions.push(`anomaly_type = $${paramIndex}`);
        params.push(query.anomalyType);
        paramIndex++;
      }

      if (query.severity) {
        conditions.push(`severity = $${paramIndex}`);
        params.push(query.severity);
        paramIndex++;
      }

      if (query.reviewed) {
        conditions.push(`reviewed = $${paramIndex}`);
        params.push(query.reviewed === "true");
        paramIndex++;
      }

      if (query.falsePositive) {
        conditions.push(`false_positive = $${paramIndex}`);
        params.push(query.falsePositive === "true");
        paramIndex++;
      }

      conditions.push(`confidence >= $${paramIndex}`);
      params.push(query.minConfidence);
      paramIndex++;

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM behavior_anomalies WHERE ${conditions.join(" AND ")}`;
      const { rows: countRows } = await pool.query(countQuery, params);
      const total = parseInt(countRows[0].total);

      // Get anomalies
      params.push(query.limit, query.offset);
      const dataQuery = `
        SELECT * FROM behavior_anomalies
        WHERE ${conditions.join(" AND ")}
        ORDER BY timestamp DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      const { rows } = await pool.query(dataQuery, params);

      return {
        data: rows,
        total,
        limit: query.limit,
        offset: query.offset,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.flatten() });
      }
      app.log.error({ error }, "Failed to list anomalies");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  /**
   * Get anomaly details
   * GET /v1/behavioral-analytics/anomalies/:id
   */
  app.get("/v1/behavioral-analytics/anomalies/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    try {
      const { rows } = await pool.query(
        "SELECT * FROM behavior_anomalies WHERE id = $1",
        [id]
      );

      if (rows.length === 0) {
        return reply.code(404).send({ error: "anomaly_not_found" });
      }

      const anomaly = rows[0];

      // Check camera access
      const camera = await store.getCamera(anomaly.camera_id);
      if (!camera) {
        return reply.code(404).send({ error: "camera_not_found" });
      }

      const decision = await store.checkAccess(
        request.currentUser,
        "analytics:view",
        camera.nodeId
      );
      if (!decision?.allowed) {
        return reply.code(403).send({ error: "forbidden" });
      }

      return anomaly;
    } catch (error) {
      app.log.error({ error }, "Failed to get anomaly");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  /**
   * Update anomaly (mark reviewed/false positive)
   * PATCH /v1/behavioral-analytics/anomalies/:id
   */
  app.patch("/v1/behavioral-analytics/anomalies/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    try {
      const body = updateAnomalySchema.parse(request.body);

      // Get anomaly
      const { rows: anomalyRows } = await pool.query(
        "SELECT * FROM behavior_anomalies WHERE id = $1",
        [id]
      );

      if (anomalyRows.length === 0) {
        return reply.code(404).send({ error: "anomaly_not_found" });
      }

      const anomaly = anomalyRows[0];

      // Check camera access
      const camera = await store.getCamera(anomaly.camera_id);
      if (!camera) {
        return reply.code(404).send({ error: "camera_not_found" });
      }

      const decision = await store.checkAccess(
        request.currentUser,
        "analytics:configure",
        camera.nodeId
      );
      if (!decision?.allowed) {
        return reply.code(403).send({ error: "forbidden" });
      }

      // Update anomaly
      const updates: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (body.reviewed !== undefined) {
        updates.push(`reviewed = $${paramIndex}`);
        params.push(body.reviewed);
        paramIndex++;

        if (body.reviewed) {
          updates.push(`reviewed_by = $${paramIndex}`);
          params.push(request.currentUser.id);
          paramIndex++;

          updates.push(`reviewed_at = NOW()`);
        }
      }

      if (body.falsePositive !== undefined) {
        updates.push(`false_positive = $${paramIndex}`);
        params.push(body.falsePositive);
        paramIndex++;
      }

      if (updates.length === 0) {
        return reply.code(400).send({ error: "no_updates_provided" });
      }

      params.push(id);

      const { rows } = await pool.query(
        `UPDATE behavior_anomalies 
         SET ${updates.join(", ")}
         WHERE id = $${paramIndex}
         RETURNING *`,
        params
      );

      await store.writeAudit({
        tenantId: request.currentUser.tenantId,
        actorUserId: request.currentUser.id,
        action: "behavioral_analytics.anomaly_updated",
        resourceNodeId: camera.nodeId,
        outcome: "success",
        sourceIp: request.ip,
        details: {
          anomalyId: id,
          updates: body,
        },
      });

      return rows[0];
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.flatten() });
      }
      app.log.error({ error }, "Failed to update anomaly");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  /**
   * Get anomaly statistics
   * GET /v1/behavioral-analytics/anomalies/stats
   */
  app.get("/v1/behavioral-analytics/anomalies/stats", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = z.object({
        cameraId: z.string().optional(),
        branchId: z.string().optional(),
        days: z.coerce.number().int().min(1).max(90).default(7),
      }).parse(request.query);

      // Get accessible cameras
      const cameras = await store.listAccessibleCameras(
        request.currentUser,
        "analytics:view",
        { branchId: query.branchId, limit: 1000, offset: 0 }
      );
      const cameraIds = cameras.cameras.map(c => c.id);

      if (cameraIds.length === 0) {
        return {
          totalAnomalies: 0,
          unreviewedCount: 0,
          falsePositiveCount: 0,
          bySeverity: {},
          byType: {},
        };
      }

      // Get statistics
      const { rows } = await pool.query(
        `SELECT
          COUNT(*)::BIGINT as total_anomalies,
          COUNT(*) FILTER (WHERE reviewed = false)::BIGINT as unreviewed_count,
          COUNT(*) FILTER (WHERE false_positive = true)::BIGINT as false_positive_count,
          jsonb_object_agg(
            COALESCE(severity_group, 'unknown'),
            severity_count
          ) FILTER (WHERE severity_group IS NOT NULL) as by_severity,
          jsonb_object_agg(
            COALESCE(type_group, 'unknown'),
            type_count
          ) FILTER (WHERE type_group IS NOT NULL) as by_type
        FROM (
          SELECT
            severity as severity_group,
            anomaly_type as type_group,
            COUNT(*) as severity_count,
            COUNT(*) as type_count
          FROM behavior_anomalies
          WHERE camera_id = ANY($1)
            AND ($2::TEXT IS NULL OR camera_id = $2)
            AND timestamp >= NOW() - ($3 || ' days')::INTERVAL
          GROUP BY ROLLUP(severity, anomaly_type)
        ) stats`,
        [cameraIds, query.cameraId, query.days]
      );

      return rows[0] || {
        totalAnomalies: 0,
        unreviewedCount: 0,
        falsePositiveCount: 0,
        bySeverity: {},
        byType: {},
      };
    } catch (error) {
      app.log.error({ error }, "Failed to get anomaly statistics");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  // ============================================================================
  // PREDICTIVE ALERTS
  // ============================================================================

  /**
   * Generate predictive alerts
   * POST /v1/behavioral-analytics/predict
   */
  app.post("/v1/behavioral-analytics/predict", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = generatePredictionsSchema.parse(request.body);

      // Check branch access
      const branch = await store.getNode(body.branchId);
      if (!branch || branch.type !== "branch") {
        return reply.code(404).send({ error: "branch_not_found" });
      }

      const decision = await store.checkAccess(
        request.currentUser,
        "analytics:configure",
        body.branchId
      );
      if (!decision?.allowed) {
        return reply.code(403).send({ error: "forbidden" });
      }

      // Generate predictions
      const predictions = await service.generatePredictiveAlerts(body.branchId, body.lookAheadHours);

      return {
        data: predictions,
        count: predictions.length,
        branchId: body.branchId,
        lookAheadHours: body.lookAheadHours,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.flatten() });
      }
      app.log.error({ error }, "Failed to generate predictions");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  /**
   * List predictive alerts
   * GET /v1/behavioral-analytics/predictions
   */
  app.get("/v1/behavioral-analytics/predictions", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = z.object({
        branchId: z.string().optional(),
        status: z.enum(["active", "triggered", "dismissed", "expired"]).optional(),
        minProbability: z.coerce.number().min(0).max(1).default(0.5),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }).parse(request.query);

      // Get accessible branches
      const branches = await store.listAccessibleNodes(
        request.currentUser,
        "analytics:view",
        "branch"
      );
      const branchIds = branches.map(b => b.id);

      if (branchIds.length === 0) {
        return { data: [], total: 0 };
      }

      // Build WHERE clause
      const conditions: string[] = ["branch_id = ANY($1)"];
      const params: any[] = [branchIds];
      let paramIndex = 2;

      if (query.branchId) {
        conditions.push(`branch_id = $${paramIndex}`);
        params.push(query.branchId);
        paramIndex++;
      }

      if (query.status) {
        conditions.push(`status = $${paramIndex}`);
        params.push(query.status);
        paramIndex++;
      }

      conditions.push(`probability >= $${paramIndex}`);
      params.push(query.minProbability);
      paramIndex++;

      params.push(query.limit);

      const { rows } = await pool.query(
        `SELECT * FROM predictive_alerts
         WHERE ${conditions.join(" AND ")}
         ORDER BY probability DESC, created_at DESC
         LIMIT $${paramIndex}`,
        params
      );

      return { data: rows, total: rows.length };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.flatten() });
      }
      app.log.error({ error }, "Failed to list predictions");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  /**
   * Get prediction details
   * GET /v1/behavioral-analytics/predictions/:id
   */
  app.get("/v1/behavioral-analytics/predictions/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    try {
      const { rows } = await pool.query(
        "SELECT * FROM predictive_alerts WHERE id = $1",
        [id]
      );

      if (rows.length === 0) {
        return reply.code(404).send({ error: "prediction_not_found" });
      }

      const prediction = rows[0];

      // Check branch access
      const decision = await store.checkAccess(
        request.currentUser,
        "analytics:view",
        prediction.branch_id
      );
      if (!decision?.allowed) {
        return reply.code(403).send({ error: "forbidden" });
      }

      return prediction;
    } catch (error) {
      app.log.error({ error }, "Failed to get prediction");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  /**
   * Dismiss prediction
   * POST /v1/behavioral-analytics/predictions/:id/dismiss
   */
  app.post("/v1/behavioral-analytics/predictions/:id/dismiss", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    try {
      const body = dismissPredictionSchema.parse(request.body);

      // Get prediction
      const { rows: predictionRows } = await pool.query(
        "SELECT * FROM predictive_alerts WHERE id = $1",
        [id]
      );

      if (predictionRows.length === 0) {
        return reply.code(404).send({ error: "prediction_not_found" });
      }

      const prediction = predictionRows[0];

      // Check branch access
      const decision = await store.checkAccess(
        request.currentUser,
        "analytics:configure",
        prediction.branch_id
      );
      if (!decision?.allowed) {
        return reply.code(403).send({ error: "forbidden" });
      }

      // Dismiss prediction
      const { rows } = await pool.query(
        `UPDATE predictive_alerts
         SET status = 'dismissed',
             dismissed_by = $1,
             dismissed_at = NOW(),
             dismissal_reason = $2
         WHERE id = $3
         RETURNING *`,
        [request.currentUser.id, body.reason, id]
      );

      await store.writeAudit({
        tenantId: request.currentUser.tenantId,
        actorUserId: request.currentUser.id,
        action: "behavioral_analytics.prediction_dismissed",
        resourceNodeId: prediction.branch_id,
        outcome: "success",
        sourceIp: request.ip,
        details: {
          predictionId: id,
          reason: body.reason,
        },
      });

      return rows[0];
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.flatten() });
      }
      app.log.error({ error }, "Failed to dismiss prediction");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  // ============================================================================
  // CROWD BEHAVIOR ANALYSIS
  // ============================================================================

  /**
   * Analyze crowd behavior for a camera
   * GET /v1/behavioral-analytics/crowd/:cameraId
   */
  app.get("/v1/behavioral-analytics/crowd/:cameraId", async (request: FastifyRequest, reply: FastifyReply) => {
    const { cameraId } = request.params as { cameraId: string };

    try {
      // Check camera access
      const camera = await store.getCamera(cameraId);
      if (!camera) {
        return reply.code(404).send({ error: "camera_not_found" });
      }

      const decision = await store.checkAccess(
        request.currentUser,
        "analytics:view",
        camera.nodeId
      );
      if (!decision?.allowed) {
        return reply.code(403).send({ error: "forbidden" });
      }

      // Analyze crowd behavior
      const analysis = await service.analyzeCrowdBehavior(cameraId);

      return {
        cameraId,
        cameraName: camera.name,
        analysis,
        analyzedAt: new Date().toISOString(),
      };
    } catch (error) {
      app.log.error({ error }, "Failed to analyze crowd behavior");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  // ============================================================================
  // HEALTH & STATUS
  // ============================================================================

  /**
   * Get behavioral analytics health status
   * GET /v1/behavioral-analytics/health
   */
  app.get("/v1/behavioral-analytics/health", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get table counts
      const { rows: tableStats } = await pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM behavior_baselines) as baselines_count,
          (SELECT COUNT(*) FROM behavior_anomalies WHERE timestamp >= NOW() - INTERVAL '7 days') as recent_anomalies_count,
          (SELECT COUNT(*) FROM predictive_alerts WHERE status = 'active') as active_predictions_count
      `);

      return {
        status: "healthy",
        tables: {
          baselines: parseInt(tableStats[0].baselines_count),
          recentAnomalies: parseInt(tableStats[0].recent_anomalies_count),
          activePredictions: parseInt(tableStats[0].active_predictions_count),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      app.log.error({ error }, "Failed to get health status");
      return reply.code(500).send({ 
        status: "unhealthy",
        error: "Failed to query database",
      });
    }
  });

  app.log.info("Behavioral Analytics routes registered");
}
