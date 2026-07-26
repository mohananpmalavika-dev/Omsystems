/**
 * Camera Status API Endpoints
 * Real-time camera monitoring, health history, quality metrics
 */

import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { logger } from "../utils/logger.js";
import type { CameraMonitorService } from "../services/camera-monitor.service.js";

const router = Router();

// Validation schemas
const HeartbeatSchema = z.object({
  status: z.enum(["online", "offline", "warning", "degraded"]),
  responseTimeMs: z.number().optional(),
  currentFps: z.number().optional(),
  currentBitrate: z.number().optional(),
  currentResolution: z.object({
    width: z.number(),
    height: z.number(),
  }).optional(),
  packetLoss: z.number().optional(),
  latencyMs: z.number().optional(),
  streamActive: z.boolean().optional(),
  videoLoss: z.boolean().optional(),
  imageFrozen: z.boolean().optional(),
  blackScreen: z.boolean().optional(),
  errorMessage: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const RecoverySchema = z.object({
  steps: z.array(z.enum([
    "rtsp_reconnect",
    "onvif_ping", 
    "stream_restart",
    "soft_reboot",
    "hard_reboot",
    "profile_reset",
    "factory_reset",
    "manual_intervention"
  ])).optional(),
  autoEscalate: z.boolean().optional().default(false),
});

export function createCameraStatusRouter(pool: Pool, cameraMonitor: CameraMonitorService) {
  
  /**
   * POST /api/v1/cameras/:cameraId/heartbeat
   * Update camera status and quality metrics (called by edge agent)
   */
  router.post("/:cameraId/heartbeat", async (req, res) => {
    try {
      const { cameraId } = req.params;
      const data = HeartbeatSchema.parse(req.body);

      // Save heartbeat data
      await pool.query(
        `INSERT INTO camera_health_history (
          camera_id, timestamp, status, response_time_ms,
          current_fps, current_bitrate, current_resolution,
          packet_loss, latency_ms, stream_active, video_loss,
          image_frozen, black_screen, error_message, metadata
        ) VALUES ($1::uuid, NOW(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          cameraId,
          data.status,
          data.responseTimeMs,
          data.currentFps,
          data.currentBitrate,
          data.currentResolution ? JSON.stringify(data.currentResolution) : null,
          data.packetLoss,
          data.latencyMs,
          data.streamActive ?? true,
          data.videoLoss ?? false,
          data.imageFrozen ?? false,
          data.blackScreen ?? false,
          data.errorMessage,
          data.metadata ? JSON.stringify(data.metadata) : null,
        ]
      );

      // Update camera status
      await pool.query(
        `UPDATE cameras 
         SET status = $2::camera_status, 
             last_seen_at = CASE WHEN $2 IN ('online', 'warning', 'degraded') THEN NOW() ELSE last_seen_at END
         WHERE id = $1::uuid`,
        [cameraId, data.status]
      );

      logger.debug(`Heartbeat received for camera ${cameraId}`, { status: data.status });

      res.json({
        success: true,
        message: "Heartbeat recorded",
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error("Heartbeat update failed", { error, cameraId: req.params.cameraId });
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * GET /api/v1/cameras/:cameraId/status
   * Get current camera status
   */
  router.get("/:cameraId/status", async (req, res) => {
    try {
      const { cameraId } = req.params;

      const result = await pool.query(
        `SELECT 
          c.id::text,
          c.status,
          c.last_seen_at as "lastSeen",
          rn.name as "cameraName",
          c.vendor,
          c.model,
          latest.current_fps as "currentFps",
          latest.current_bitrate as "currentBitrate",
          latest.current_resolution as "currentResolution",
          latest.packet_loss as "packetLoss",
          latest.latency_ms as "latencyMs",
          latest.stream_active as "streamActive",
          latest.video_loss as "videoLoss",
          latest.image_frozen as "imageFrozen",
          latest.black_screen as "blackScreen",
          latest.tampering_detected as "tamperingDetected",
          latest.error_message as "errorMessage",
          latest.timestamp as "lastCheck"
        FROM cameras c
        JOIN resource_nodes rn ON rn.id = c.resource_node_id
        LEFT JOIN LATERAL (
          SELECT *
          FROM camera_health_history
          WHERE camera_id = c.id
          ORDER BY timestamp DESC
          LIMIT 1
        ) latest ON true
        WHERE c.id = $1::uuid`,
        [cameraId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Camera not found",
        });
      }

      res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      logger.error("Failed to get camera status", { error, cameraId: req.params.cameraId });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/v1/cameras/:cameraId/health-history
   * Get camera health history
   */
  router.get("/:cameraId/health-history", async (req, res) => {
    try {
      const { cameraId } = req.params;
      const hours = parseInt(req.query.hours as string) || 24;
      const limit = Math.min(parseInt(req.query.limit as string) || 1000, 10000);

      // Get health history
      const historyResult = await pool.query(
        `SELECT 
          timestamp,
          status,
          response_time_ms as "responseTimeMs",
          current_fps as "currentFps",
          current_bitrate as "currentBitrate",
          packet_loss as "packetLoss",
          latency_ms as "latencyMs",
          stream_active as "streamActive",
          video_loss as "videoLoss",
          image_frozen as "imageFrozen",
          black_screen as "blackScreen",
          error_message as "errorMessage"
        FROM camera_health_history
        WHERE camera_id = $1::uuid
          AND timestamp >= NOW() - INTERVAL '1 hour' * $2
        ORDER BY timestamp DESC
        LIMIT $3`,
        [cameraId, hours, limit]
      );

      // Calculate uptime statistics
      const statsResult = await pool.query(
        `SELECT 
          COUNT(*) as total_checks,
          COUNT(*) FILTER (WHERE status = 'online') as online_checks,
          AVG(response_time_ms) as avg_response_time,
          AVG(current_fps) as avg_fps,
          AVG(packet_loss) as avg_packet_loss
        FROM camera_health_history
        WHERE camera_id = $1::uuid
          AND timestamp >= NOW() - INTERVAL '1 hour' * $2`,
        [cameraId, hours]
      );

      const stats = statsResult.rows[0];
      const uptimePercentage = stats.total_checks > 0
        ? (stats.online_checks / stats.total_checks) * 100
        : 0;

      // Get status changes (outages)
      const outagesResult = await pool.query(
        `WITH status_changes AS (
          SELECT 
            timestamp,
            status,
            LAG(status) OVER (ORDER BY timestamp) as prev_status
          FROM camera_health_history
          WHERE camera_id = $1::uuid
            AND timestamp >= NOW() - INTERVAL '1 hour' * $2
          ORDER BY timestamp
        )
        SELECT 
          timestamp as "startTime",
          status,
          prev_status as "previousStatus"
        FROM status_changes
        WHERE status != prev_status OR prev_status IS NULL
        ORDER BY timestamp DESC
        LIMIT 50`,
        [cameraId, hours]
      );

      res.json({
        success: true,
        data: {
          cameraId,
          history: historyResult.rows,
          statistics: {
            hours,
            totalChecks: parseInt(stats.total_checks),
            onlineChecks: parseInt(stats.online_checks),
            uptimePercentage: parseFloat(uptimePercentage.toFixed(2)),
            avgResponseTimeMs: stats.avg_response_time ? parseFloat(stats.avg_response_time.toFixed(2)) : null,
            avgFps: stats.avg_fps ? parseFloat(stats.avg_fps.toFixed(2)) : null,
            avgPacketLoss: stats.avg_packet_loss ? parseFloat(stats.avg_packet_loss.toFixed(2)) : null,
          },
          statusChanges: outagesResult.rows,
        },
      });
    } catch (error) {
      logger.error("Failed to get health history", { error, cameraId: req.params.cameraId });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/v1/cameras/:cameraId/quality-metrics
   * Get current quality metrics
   */
  router.get("/:cameraId/quality-metrics", async (req, res) => {
    try {
      const { cameraId } = req.params;

      const result = await pool.query(
        `SELECT 
          c.id::text,
          rn.name as "cameraName",
          c.profiles->>0 as expected_profile,
          latest.current_fps as "currentFps",
          latest.current_bitrate as "currentBitrate",
          latest.current_resolution as "currentResolution",
          latest.packet_loss as "packetLoss",
          latest.latency_ms as "latencyMs",
          latest.stream_active as "streamActive",
          latest.timestamp as "lastMeasured",
          -- Quality score calculation
          CASE 
            WHEN latest.current_fps >= (c.profiles->0->>'frameRate')::float * 0.9 THEN 100
            WHEN latest.current_fps >= (c.profiles->0->>'frameRate')::float * 0.8 THEN 80
            WHEN latest.current_fps >= (c.profiles->0->>'frameRate')::float * 0.7 THEN 60
            ELSE 40
          END as "fpsQuality",
          CASE 
            WHEN latest.packet_loss <= 1 THEN 100
            WHEN latest.packet_loss <= 3 THEN 80
            WHEN latest.packet_loss <= 5 THEN 60
            ELSE 40
          END as "packetLossQuality",
          CASE 
            WHEN latest.latency_ms <= 100 THEN 100
            WHEN latest.latency_ms <= 200 THEN 80
            WHEN latest.latency_ms <= 500 THEN 60
            ELSE 40
          END as "latencyQuality"
        FROM cameras c
        JOIN resource_nodes rn ON rn.id = c.resource_node_id
        LEFT JOIN LATERAL (
          SELECT *
          FROM camera_health_history
          WHERE camera_id = c.id
            AND current_fps IS NOT NULL
          ORDER BY timestamp DESC
          LIMIT 1
        ) latest ON true
        WHERE c.id = $1::uuid`,
        [cameraId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Camera not found",
        });
      }

      const data = result.rows[0];
      
      // Calculate overall quality score
      const overallQuality = data.streamActive
        ? Math.round((data.fpsQuality + data.packetLossQuality + data.latencyQuality) / 3)
        : 0;

      res.json({
        success: true,
        data: {
          ...data,
          overallQuality,
        },
      });
    } catch (error) {
      logger.error("Failed to get quality metrics", { error, cameraId: req.params.cameraId });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * POST /api/v1/cameras/:cameraId/health-check
   * Trigger manual health check
   */
  router.post("/:cameraId/health-check", async (req, res) => {
    try {
      const { cameraId } = req.params;

      // Verify camera exists
      const cameraResult = await pool.query(
        "SELECT id FROM cameras WHERE id = $1::uuid",
        [cameraId]
      );

      if (cameraResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Camera not found",
        });
      }

      // Trigger health check via monitor service
      const healthData = await cameraMonitor.triggerHealthCheck(cameraId);

      if (!healthData) {
        return res.status(500).json({
          success: false,
          error: "Health check failed",
        });
      }

      res.json({
        success: true,
        data: healthData,
        message: "Health check completed",
      });
    } catch (error) {
      logger.error("Manual health check failed", { error, cameraId: req.params.cameraId });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * POST /api/v1/cameras/:cameraId/recover
   * Trigger recovery workflow
   */
  router.post("/:cameraId/recover", async (req, res) => {
    try {
      const { cameraId } = req.params;
      const data = RecoverySchema.parse(req.body);

      // Verify camera exists
      const cameraResult = await pool.query(
        `SELECT c.id, rn.name 
         FROM cameras c
         JOIN resource_nodes rn ON rn.id = c.resource_node_id
         WHERE c.id = $1::uuid`,
        [cameraId]
      );

      if (cameraResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Camera not found",
        });
      }

      const camera = cameraResult.rows[0];

      // Log recovery attempt
      logger.info(`Recovery workflow triggered for camera ${camera.name}`, {
        cameraId,
        steps: data.steps,
        autoEscalate: data.autoEscalate,
        userId: req.user?.id,
      });

      // Trigger recovery via monitor service
      const result = await cameraMonitor.triggerRecovery(cameraId, data.steps);

      // Log recovery workflow to database
      await pool.query(
        `INSERT INTO camera_recovery_log (
          camera_id, steps, initiated_by, status, timestamp
        ) VALUES ($1::uuid, $2, $3, $4, NOW())`,
        [
          cameraId,
          JSON.stringify(data.steps),
          req.user?.id || 'system',
          result.success ? 'initiated' : 'failed',
        ]
      );

      res.json({
        success: result.success,
        message: result.message,
        data: {
          cameraId,
          cameraName: camera.name,
          steps: data.steps,
          autoEscalate: data.autoEscalate,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      logger.error("Recovery workflow failed", { error, cameraId: req.params.cameraId });
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * GET /api/v1/branches/:branchId/cameras/summary
   * Get camera summary for a branch
   */
  router.get("/branches/:branchId/summary", async (req, res) => {
    try {
      const { branchId } = req.params;

      const result = await pool.query(
        `SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'online') as online,
          COUNT(*) FILTER (WHERE status = 'offline') as offline,
          COUNT(*) FILTER (WHERE status = 'warning') as warning,
          COUNT(*) FILTER (WHERE status = 'degraded') as degraded,
          COUNT(*) FILTER (WHERE status = 'unknown') as unknown,
          AVG(
            CASE 
              WHEN latest.current_fps IS NOT NULL 
              THEN latest.current_fps 
              ELSE NULL 
            END
          ) as avg_fps,
          COUNT(*) FILTER (WHERE latest.video_loss = true) as video_loss_count,
          COUNT(*) FILTER (WHERE latest.image_frozen = true) as frozen_count
        FROM cameras c
        LEFT JOIN LATERAL (
          SELECT *
          FROM camera_health_history
          WHERE camera_id = c.id
          ORDER BY timestamp DESC
          LIMIT 1
        ) latest ON true
        WHERE c.branch_node_id = $1::uuid`,
        [branchId]
      );

      const stats = result.rows[0];

      res.json({
        success: true,
        data: {
          branchId,
          total: parseInt(stats.total),
          online: parseInt(stats.online),
          offline: parseInt(stats.offline),
          warning: parseInt(stats.warning),
          degraded: parseInt(stats.degraded),
          unknown: parseInt(stats.unknown),
          avgFps: stats.avg_fps ? parseFloat(stats.avg_fps.toFixed(2)) : null,
          videoLossCount: parseInt(stats.video_loss_count),
          frozenCount: parseInt(stats.frozen_count),
          uptimePercentage: stats.total > 0 
            ? parseFloat(((stats.online / stats.total) * 100).toFixed(2))
            : 0,
        },
      });
    } catch (error) {
      logger.error("Failed to get branch camera summary", { error, branchId: req.params.branchId });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/v1/branches/:branchId/cameras
   * Get all cameras for a branch with their current status
   */
  router.get("/branches/:branchId/cameras", async (req, res) => {
    try {
      const { branchId } = req.params;
      const status = req.query.status as string;

      let query = `
        SELECT 
          c.id::text,
          rn.name,
          c.vendor,
          c.model,
          c.status,
          c.last_seen_at as "lastSeen",
          latest.current_fps as "currentFps",
          latest.current_bitrate as "currentBitrate",
          latest.packet_loss as "packetLoss",
          latest.latency_ms as "latencyMs",
          latest.stream_active as "streamActive",
          latest.video_loss as "videoLoss",
          latest.image_frozen as "imageFrozen",
          latest.black_screen as "blackScreen",
          latest.timestamp as "lastCheck"
        FROM cameras c
        JOIN resource_nodes rn ON rn.id = c.resource_node_id
        LEFT JOIN LATERAL (
          SELECT *
          FROM camera_health_history
          WHERE camera_id = c.id
          ORDER BY timestamp DESC
          LIMIT 1
        ) latest ON true
        WHERE c.branch_node_id = $1::uuid
      `;

      const params: any[] = [branchId];

      if (status) {
        query += ` AND c.status = $2`;
        params.push(status);
      }

      query += ` ORDER BY rn.name`;

      const result = await pool.query(query, params);

      res.json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      logger.error("Failed to get branch cameras", { error, branchId: req.params.branchId });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/v1/cameras/monitoring/stats
   * Get overall monitoring statistics
   */
  router.get("/monitoring/stats", async (req, res) => {
    try {
      const stats = await cameraMonitor.getStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error("Failed to get monitoring stats", { error });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/v1/cameras/:cameraId/stream-health
   * Get detailed stream health analysis
   */
  router.get("/:cameraId/stream-health", async (req, res) => {
    try {
      const { cameraId } = req.params;

      // Get camera info
      const cameraResult = await pool.query(
        `SELECT c.id::text, rn.name, c.rtsp_url as "rtspUrl"
         FROM cameras c
         JOIN resource_nodes rn ON rn.id = c.resource_node_id
         WHERE c.id = $1::uuid`,
        [cameraId]
      );

      if (cameraResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Camera not found",
        });
      }

      const camera = cameraResult.rows[0];

      // Trigger stream analysis
      const healthData = await cameraMonitor.getCameraHealth(cameraId);

      res.json({
        success: true,
        data: {
          cameraId,
          cameraName: camera.name,
          streamHealth: healthData?.metadata?.streamHealth || null,
          imageFrozen: healthData?.imageFrozen || false,
          blackScreen: healthData?.blackScreen || false,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      logger.error("Failed to get stream health", { error, cameraId: req.params.cameraId });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * POST /api/v1/cameras/:cameraId/analyze-frame
   * Trigger manual frame analysis
   */
  router.post("/:cameraId/analyze-frame", async (req, res) => {
    try {
      const { cameraId } = req.params;

      // Get camera info
      const cameraResult = await pool.query(
        `SELECT c.id::text, rn.name, c.rtsp_url as "rtspUrl"
         FROM cameras c
         JOIN resource_nodes rn ON rn.id = c.resource_node_id
         WHERE c.id = $1::uuid`,
        [cameraId]
      );

      if (cameraResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Camera not found",
        });
      }

      // Trigger immediate health check with stream analysis
      const healthData = await cameraMonitor.triggerHealthCheck(cameraId);

      if (!healthData) {
        return res.status(500).json({
          success: false,
          error: "Frame analysis failed",
        });
      }

      res.json({
        success: true,
        data: {
          cameraId,
          streamHealth: healthData.metadata?.streamHealth || null,
          imageFrozen: healthData.imageFrozen,
          blackScreen: healthData.blackScreen,
          videoLoss: healthData.videoLoss,
          timestamp: healthData.timestamp,
        },
        message: "Frame analysis completed",
      });
    } catch (error) {
      logger.error("Manual frame analysis failed", { error, cameraId: req.params.cameraId });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/v1/cameras/:cameraId/recovery-status
   * Get current recovery workflow status
   */
  router.get("/:cameraId/recovery-status", async (req, res) => {
    try {
      const { cameraId } = req.params;

      // Get latest recovery log from database
      const result = await pool.query(
        `SELECT 
          workflow_id as "workflowId",
          initiated_at as "initiatedAt",
          completed_at as "completedAt",
          initiated_by as "initiatedBy",
          status,
          completed_steps as "completedSteps",
          failed_steps as "failedSteps",
          total_attempts as "totalAttempts",
          recovery_duration_seconds as "durationSeconds"
        FROM camera_recovery_log
        WHERE camera_id = $1::uuid
        ORDER BY initiated_at DESC
        LIMIT 1`,
        [cameraId]
      );

      if (result.rows.length === 0) {
        return res.json({
          success: true,
          data: null,
          message: "No recovery history found",
        });
      }

      res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      logger.error("Failed to get recovery status", { error, cameraId: req.params.cameraId });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/v1/cameras/:cameraId/recovery-history
   * Get recovery workflow history
   */
  router.get("/:cameraId/recovery-history", async (req, res) => {
    try {
      const { cameraId } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

      const result = await pool.query(
        `SELECT 
          workflow_id as "workflowId",
          initiated_at as "initiatedAt",
          completed_at as "completedAt",
          initiated_by as "initiatedBy",
          status,
          completed_steps as "completedSteps",
          failed_steps as "failedSteps",
          total_attempts as "totalAttempts",
          recovery_duration_seconds as "durationSeconds"
        FROM camera_recovery_log
        WHERE camera_id = $1::uuid
        ORDER BY initiated_at DESC
        LIMIT $2`,
        [cameraId, limit]
      );

      res.json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      logger.error("Failed to get recovery history", { error, cameraId: req.params.cameraId });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  return router;
}

export default createCameraStatusRouter;
