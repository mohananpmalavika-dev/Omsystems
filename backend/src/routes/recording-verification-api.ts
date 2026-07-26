/**
 * Recording Verification API Endpoints
 * Real-time recording status, gap detection, playback verification
 */

import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { logger } from "../utils/logger.js";
import type { RecordingVerificationService } from "../services/recording-verification.service.js";

const router = Router();

// Validation schemas
const VerificationTriggerSchema = z.object({
  cameraIds: z.array(z.string().uuid()).optional(),
});

const RecordingUptimeSchema = z.object({
  cameraId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
});

export function createRecordingVerificationRouter(
  pool: Pool,
  verificationService: RecordingVerificationService
) {
  /**
   * GET /api/v1/recording/:cameraId/status
   * Get current recording status for a camera
   */
  router.get("/:cameraId/status", async (req, res) => {
    try {
      const { cameraId } = req.params;

      const status = verificationService.getCameraRecordingStatus(cameraId);

      if (!status) {
        return res.status(404).json({
          success: false,
          error: "Camera recording status not found. Service may still be initializing.",
        });
      }

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error("Failed to get recording status", { error, cameraId: req.params.cameraId });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/v1/recording/:cameraId/gaps
   * Get recording gaps for a camera
   */
  router.get("/:cameraId/gaps", async (req, res) => {
    try {
      const { cameraId } = req.params;
      const hours = parseInt(req.query.hours as string) || 24;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);

      const result = await pool.query(
        `SELECT 
          id::text,
          camera_id::text as "cameraId",
          gap_start as "gapStart",
          gap_end as "gapEnd",
          duration_seconds as "durationSeconds",
          expected_segments as "expectedSegments",
          actual_segments as "actualSegments",
          reason,
          detected_at as "detectedAt",
          resolved_at as "resolvedAt",
          resolution_notes as "resolutionNotes"
        FROM recording_gaps
        WHERE camera_id = $1::uuid
          AND gap_start >= NOW() - INTERVAL '1 hour' * $2
        ORDER BY gap_start DESC
        LIMIT $3`,
        [cameraId, hours, limit]
      );

      // Calculate summary statistics
      const summary = {
        totalGaps: result.rows.length,
        totalGapDuration: result.rows.reduce((sum, row) => sum + row.durationSeconds, 0),
        unresolvedGaps: result.rows.filter((row) => !row.resolvedAt).length,
        avgGapDuration: result.rows.length > 0
          ? result.rows.reduce((sum, row) => sum + row.durationSeconds, 0) / result.rows.length
          : 0,
      };

      res.json({
        success: true,
        data: {
          gaps: result.rows,
          summary,
        },
      });
    } catch (error) {
      logger.error("Failed to get recording gaps", { error, cameraId: req.params.cameraId });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/v1/recording/:cameraId/uptime
   * Calculate recording uptime for a time period
   */
  router.get("/:cameraId/uptime", async (req, res) => {
    try {
      const { cameraId } = req.params;
      const startTime = req.query.startTime as string;
      const endTime = req.query.endTime as string || new Date().toISOString();

      if (!startTime) {
        return res.status(400).json({
          success: false,
          error: "startTime query parameter is required",
        });
      }

      const result = await pool.query(
        `SELECT * FROM calculate_recording_uptime($1::uuid, $2::timestamp, $3::timestamp)`,
        [cameraId, startTime, endTime]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Unable to calculate uptime",
        });
      }

      const uptime = result.rows[0];

      res.json({
        success: true,
        data: {
          cameraId,
          startTime,
          endTime,
          totalDurationSeconds: parseInt(uptime.total_duration_seconds),
          recordingDurationSeconds: parseInt(uptime.recording_duration_seconds),
          gapDurationSeconds: parseInt(uptime.gap_duration_seconds),
          uptimePercentage: parseFloat(uptime.uptime_percentage),
        },
      });
    } catch (error) {
      logger.error("Failed to calculate uptime", { error, cameraId: req.params.cameraId });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/v1/recording/:cameraId/verification-history
   * Get verification history for a camera
   */
  router.get("/:cameraId/verification-history", async (req, res) => {
    try {
      const { cameraId } = req.params;
      const hours = parseInt(req.query.hours as string) || 24;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);

      const result = await pool.query(
        `SELECT 
          id::text,
          camera_id::text as "cameraId",
          timestamp,
          status,
          is_recording as "isRecording",
          expected_recording as "expectedRecording",
          last_segment_time as "lastSegmentTime",
          recording_gap_seconds as "recordingGapSeconds",
          segment_count_24h as "segmentCount24h",
          expected_segment_count_24h as "expectedSegmentCount24h",
          segment_completeness as "segmentCompleteness",
          playback_verified as "playbackVerified",
          consecutive_failures as "consecutiveFailures",
          health_score as "healthScore",
          issues
        FROM recording_verification_log
        WHERE camera_id = $1::uuid
          AND timestamp >= NOW() - INTERVAL '1 hour' * $2
        ORDER BY timestamp DESC
        LIMIT $3`,
        [cameraId, hours, limit]
      );

      // Calculate statistics
      const rows = result.rows;
      const stats = {
        totalChecks: rows.length,
        avgHealthScore: rows.length > 0
          ? rows.reduce((sum, row) => sum + row.healthScore, 0) / rows.length
          : 0,
        checksWithIssues: rows.filter((row) => row.issues && row.issues.length > 0).length,
        avgSegmentCompleteness: rows.length > 0
          ? rows.reduce((sum, row) => sum + parseFloat(row.segmentCompleteness || 0), 0) / rows.length
          : 0,
      };

      res.json({
        success: true,
        data: {
          history: rows,
          statistics: stats,
        },
      });
    } catch (error) {
      logger.error("Failed to get verification history", { error, cameraId: req.params.cameraId });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * POST /api/v1/recording/:cameraId/verify
   * Trigger manual verification for a camera
   */
  router.post("/:cameraId/verify", async (req, res) => {
    try {
      const { cameraId } = req.params;

      logger.info(`Manual recording verification triggered for camera ${cameraId}`, {
        userId: req.user?.id,
      });

      const status = await verificationService.triggerManualVerification(cameraId);

      if (!status) {
        return res.status(404).json({
          success: false,
          error: "Camera not found or verification failed",
        });
      }

      res.json({
        success: true,
        data: status,
        message: "Verification completed",
      });
    } catch (error) {
      logger.error("Manual verification failed", { error, cameraId: req.params.cameraId });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/v1/recording/stats
   * Get overall recording statistics
   */
  router.get("/stats", async (req, res) => {
    try {
      const stats = verificationService.getRecordingStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error("Failed to get recording stats", { error });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/v1/recording/all-statuses
   * Get recording status for all cameras
   */
  router.get("/all-statuses", async (req, res) => {
    try {
      const branchId = req.query.branchId as string;
      const status = req.query.status as string;

      let statuses = verificationService.getAllRecordingStatuses();

      // Filter by branch if specified
      if (branchId) {
        statuses = statuses.filter((s) => s.branchId === branchId);
      }

      // Filter by status if specified
      if (status) {
        statuses = statuses.filter((s) => s.status === status);
      }

      res.json({
        success: true,
        data: statuses,
      });
    } catch (error) {
      logger.error("Failed to get all recording statuses", { error });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/v1/recording/branch/:branchId/summary
   * Get recording summary for a branch
   */
  router.get("/branch/:branchId/summary", async (req, res) => {
    try {
      const { branchId } = req.params;

      const result = await pool.query(
        `SELECT 
          branch_id::text as "branchId",
          tenant_id::text as "tenantId",
          total_cameras as "totalCameras",
          recording_cameras as "recordingCameras",
          cameras_with_gaps as "camerasWithGaps",
          cameras_with_playback_issues as "camerasWithPlaybackIssues",
          cameras_with_errors as "camerasWithErrors",
          unhealthy_cameras as "unhealthyCameras",
          ROUND(avg_health_score::numeric, 2) as "avgHealthScore",
          ROUND(avg_segment_completeness::numeric, 2) as "avgSegmentCompleteness",
          total_gap_seconds as "totalGapSeconds",
          last_verified_at as "lastVerifiedAt"
        FROM recording_health_summary
        WHERE branch_id = $1::uuid`,
        [branchId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Branch not found or no recording data available",
        });
      }

      res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      logger.error("Failed to get branch recording summary", { error, branchId: req.params.branchId });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/v1/recording/playback-verification-history
   * Get playback verification history
   */
  router.get("/playback-verification-history", async (req, res) => {
    try {
      const cameraId = req.query.cameraId as string;
      const hours = parseInt(req.query.hours as string) || 24;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);

      const conditions = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (cameraId) {
        conditions.push(`camera_id = $${paramIndex++}::uuid`);
        params.push(cameraId);
      }

      conditions.push(`verified_at >= NOW() - INTERVAL '1 hour' * $${paramIndex++}`);
      params.push(hours);

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const result = await pool.query(
        `SELECT 
          id::text,
          camera_id::text as "cameraId",
          segment_id::text as "segmentId",
          verified_at as "verifiedAt",
          success,
          error_message as "errorMessage",
          file_path as "filePath",
          file_size_bytes as "fileSizeBytes",
          verification_duration_ms as "verificationDurationMs"
        FROM playback_verification_log
        ${whereClause}
        ORDER BY verified_at DESC
        LIMIT $${paramIndex}`,
        [...params, limit]
      );

      // Calculate success rate
      const successRate = result.rows.length > 0
        ? (result.rows.filter((row) => row.success).length / result.rows.length) * 100
        : 0;

      res.json({
        success: true,
        data: {
          history: result.rows,
          summary: {
            totalVerifications: result.rows.length,
            successfulVerifications: result.rows.filter((row) => row.success).length,
            failedVerifications: result.rows.filter((row) => !row.success).length,
            successRate: parseFloat(successRate.toFixed(2)),
          },
        },
      });
    } catch (error) {
      logger.error("Failed to get playback verification history", { error });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * POST /api/v1/recording/gaps/:gapId/resolve
   * Mark a recording gap as resolved
   */
  router.post("/gaps/:gapId/resolve", async (req, res) => {
    try {
      const { gapId } = req.params;
      const { resolutionNotes } = req.body;

      const result = await pool.query(
        `UPDATE recording_gaps
         SET 
           resolved_at = NOW(),
           resolution_notes = $2
         WHERE id = $1::uuid
         RETURNING 
           id::text,
           camera_id::text as "cameraId",
           gap_start as "gapStart",
           gap_end as "gapEnd",
           duration_seconds as "durationSeconds",
           resolved_at as "resolvedAt",
           resolution_notes as "resolutionNotes"`,
        [gapId, resolutionNotes || "Manually resolved"]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Gap not found",
        });
      }

      logger.info(`Recording gap resolved`, {
        gapId,
        userId: req.user?.id,
      });

      res.json({
        success: true,
        data: result.rows[0],
        message: "Gap marked as resolved",
      });
    } catch (error) {
      logger.error("Failed to resolve gap", { error, gapId: req.params.gapId });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * POST /api/v1/recording/refresh-summary
   * Refresh the recording health summary materialized view
   */
  router.post("/refresh-summary", async (req, res) => {
    try {
      await pool.query("SELECT refresh_recording_health_summary()");

      logger.info("Recording health summary refreshed", {
        userId: req.user?.id,
      });

      res.json({
        success: true,
        message: "Recording health summary refreshed",
      });
    } catch (error) {
      logger.error("Failed to refresh recording summary", { error });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  return router;
}

export default createRecordingVerificationRouter;
