/**
 * Retention Verification API Routes
 * REST endpoints for recording retention verification and compliance monitoring
 */

import { Router } from "express";
import type { Pool } from "pg";
import { getRetentionVerificationService } from "../services/retention-verification.service.js";
import { logger } from "../utils/logger.js";

export function createRetentionVerificationRoutes(pool: Pool): Router {
  const router = Router();
  const retentionService = getRetentionVerificationService(pool);

  /**
   * GET /api/v1/retention/:cameraId/status
   * Get current retention status for a specific camera
   */
  router.get("/:cameraId/status", async (req, res) => {
    try {
      const { cameraId } = req.params;

      const status = await retentionService.getCameraRetentionStatus(cameraId);

      if (!status) {
        return res.status(404).json({
          success: false,
          error: "Camera retention status not found",
        });
      }

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error("Failed to get camera retention status", { error });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/v1/retention/:cameraId/history
   * Get retention history for a camera
   */
  router.get("/:cameraId/history", async (req, res) => {
    try {
      const { cameraId } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;

      const history = await retentionService.getCameraRetentionHistory(
        cameraId,
        limit
      );

      res.json({
        success: true,
        data: {
          cameraId,
          history,
          count: history.length,
        },
      });
    } catch (error) {
      logger.error("Failed to get retention history", { error });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * POST /api/v1/retention/:cameraId/verify
   * Trigger manual verification for a camera
   */
  router.post("/:cameraId/verify", async (req, res) => {
    try {
      const { cameraId } = req.params;

      const status = await retentionService.triggerManualVerification(cameraId);

      if (!status) {
        return res.status(404).json({
          success: false,
          error: "Camera not found or verification failed",
        });
      }

      res.json({
        success: true,
        data: status,
        message: "Retention verification completed",
      });
    } catch (error) {
      logger.error("Manual verification failed", { error });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/v1/retention/branch/:branchId/compliance
   * Get compliance report for a branch
   */
  router.get("/branch/:branchId/compliance", async (req, res) => {
    try {
      const { branchId } = req.params;

      const report = await retentionService.getBranchComplianceReport(branchId);

      if (!report) {
        return res.status(404).json({
          success: false,
          error: "Branch not found or no retention data available",
        });
      }

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      logger.error("Failed to get branch compliance report", { error });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/v1/retention/violations
   * Get all cameras with retention policy violations
   */
  router.get("/violations", async (req, res) => {
    try {
      const violations = await retentionService.getPolicyViolations();

      res.json({
        success: true,
        data: {
          violations,
          count: violations.length,
          summary: {
            critical: violations.filter((v) => v.complianceStatus === "violation")
              .length,
            warning: violations.filter((v) => v.complianceStatus === "warning")
              .length,
          },
        },
      });
    } catch (error) {
      logger.error("Failed to get policy violations", { error });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/v1/retention/predictions
   * Get retention predictions for cameras at risk
   */
  router.get("/predictions", async (req, res) => {
    try {
      const predictions = await retentionService.getRetentionPredictions();

      res.json({
        success: true,
        data: {
          predictions,
          count: predictions.length,
          summary: {
            criticalRisk: predictions.filter(
              (p) => p.daysUntilStorageFull < 30
            ).length,
            mediumRisk: predictions.filter(
              (p) => p.daysUntilStorageFull >= 30 && p.daysUntilStorageFull < 90
            ).length,
          },
        },
      });
    } catch (error) {
      logger.error("Failed to get retention predictions", { error });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/v1/retention/summary
   * Get retention compliance summary across all branches
   */
  router.get("/summary", async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT 
          branch_id::text,
          branch_name,
          tenant_id::text,
          total_cameras,
          compliant_cameras,
          warning_cameras,
          violation_cameras,
          unknown_cameras,
          avg_actual_retention_days,
          avg_required_retention_days,
          min_retention_days,
          max_retention_days,
          compliance_percentage,
          total_recordings_gb,
          last_verification_time,
          refreshed_at
        FROM retention_compliance_summary
        ORDER BY compliance_percentage ASC, branch_name
      `);

      res.json({
        success: true,
        data: {
          branches: result.rows,
          count: result.rows.length,
          totals: {
            totalCameras: result.rows.reduce(
              (sum, row) => sum + parseInt(row.total_cameras || 0),
              0
            ),
            compliantCameras: result.rows.reduce(
              (sum, row) => sum + parseInt(row.compliant_cameras || 0),
              0
            ),
            violationCameras: result.rows.reduce(
              (sum, row) => sum + parseInt(row.violation_cameras || 0),
              0
            ),
          },
        },
      });
    } catch (error) {
      logger.error("Failed to get retention summary", { error });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * POST /api/v1/retention/summary/refresh
   * Refresh the materialized view for latest data
   */
  router.post("/summary/refresh", async (req, res) => {
    try {
      await pool.query("SELECT refresh_retention_compliance_summary()");

      res.json({
        success: true,
        message: "Retention compliance summary refreshed",
      });
    } catch (error) {
      logger.error("Failed to refresh retention summary", { error });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/v1/retention/:cameraId/trend
   * Get retention trend data for a camera
   */
  router.get("/:cameraId/trend", async (req, res) => {
    try {
      const { cameraId } = req.params;
      const days = parseInt(req.query.days as string) || 30;

      const result = await pool.query(
        "SELECT * FROM get_camera_retention_trend($1::uuid, $2)",
        [cameraId, days]
      );

      res.json({
        success: true,
        data: {
          cameraId,
          days,
          trend: result.rows,
          count: result.rows.length,
        },
      });
    } catch (error) {
      logger.error("Failed to get retention trend", { error });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/v1/retention/:cameraId/uptime
   * Get retention compliance uptime percentage
   */
  router.get("/:cameraId/uptime", async (req, res) => {
    try {
      const { cameraId } = req.params;
      const days = parseInt(req.query.days as string) || 30;

      const result = await pool.query(
        "SELECT calculate_retention_uptime($1::uuid, $2) as uptime",
        [cameraId, days]
      );

      const uptime = parseFloat(result.rows[0]?.uptime || 0);

      res.json({
        success: true,
        data: {
          cameraId,
          days,
          uptimePercentage: uptime,
          status: uptime >= 95 ? "excellent" : uptime >= 80 ? "good" : "poor",
        },
      });
    } catch (error) {
      logger.error("Failed to calculate retention uptime", { error });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/v1/retention/alerts
   * Get retention compliance alerts
   */
  router.get("/alerts", async (req, res) => {
    try {
      const status = (req.query.status as string) || "open";
      const severity = req.query.severity as string;
      const limit = parseInt(req.query.limit as string) || 50;

      let query = `
        SELECT 
          id,
          camera_id::text,
          tenant_id::text,
          branch_id::text,
          alert_type,
          severity,
          title,
          message,
          metadata,
          status,
          acknowledged_at,
          acknowledged_by,
          resolved_at,
          resolved_by,
          created_at,
          updated_at
        FROM retention_compliance_alerts
        WHERE status = $1
      `;

      const params: any[] = [status];

      if (severity) {
        query += ` AND severity = $${params.length + 1}`;
        params.push(severity);
      }

      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await pool.query(query, params);

      res.json({
        success: true,
        data: {
          alerts: result.rows,
          count: result.rows.length,
        },
      });
    } catch (error) {
      logger.error("Failed to get retention alerts", { error });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * PATCH /api/v1/retention/alerts/:alertId/acknowledge
   * Acknowledge a retention alert
   */
  router.patch("/alerts/:alertId/acknowledge", async (req, res) => {
    try {
      const { alertId } = req.params;
      const { acknowledgedBy } = req.body;

      const result = await pool.query(
        `UPDATE retention_compliance_alerts 
         SET status = 'acknowledged', 
             acknowledged_at = NOW(),
             acknowledged_by = $1
         WHERE id = $2
         RETURNING *`,
        [acknowledgedBy || "system", alertId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Alert not found",
        });
      }

      res.json({
        success: true,
        data: result.rows[0],
        message: "Alert acknowledged",
      });
    } catch (error) {
      logger.error("Failed to acknowledge alert", { error });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  /**
   * PATCH /api/v1/retention/alerts/:alertId/resolve
   * Resolve a retention alert
   */
  router.patch("/alerts/:alertId/resolve", async (req, res) => {
    try {
      const { alertId } = req.params;
      const { resolvedBy } = req.body;

      const result = await pool.query(
        `UPDATE retention_compliance_alerts 
         SET status = 'resolved', 
             resolved_at = NOW(),
             resolved_by = $1
         WHERE id = $2
         RETURNING *`,
        [resolvedBy || "system", alertId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Alert not found",
        });
      }

      res.json({
        success: true,
        data: result.rows[0],
        message: "Alert resolved",
      });
    } catch (error) {
      logger.error("Failed to resolve alert", { error });
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  });

  return router;
}

/**
 * API Endpoints Summary
 * 
 * Camera-Specific:
 * - GET    /api/v1/retention/:cameraId/status      - Current retention status
 * - GET    /api/v1/retention/:cameraId/history     - Historical retention data
 * - POST   /api/v1/retention/:cameraId/verify      - Manual verification trigger
 * - GET    /api/v1/retention/:cameraId/trend       - Retention trend analysis
 * - GET    /api/v1/retention/:cameraId/uptime      - Compliance uptime percentage
 * 
 * Branch-Level:
 * - GET    /api/v1/retention/branch/:branchId/compliance - Branch compliance report
 * 
 * System-Wide:
 * - GET    /api/v1/retention/violations            - All policy violations
 * - GET    /api/v1/retention/predictions           - Storage/retention predictions
 * - GET    /api/v1/retention/summary               - Multi-branch summary
 * - POST   /api/v1/retention/summary/refresh       - Refresh summary view
 * 
 * Alerts:
 * - GET    /api/v1/retention/alerts                - List alerts (filterable)
 * - PATCH  /api/v1/retention/alerts/:id/acknowledge - Acknowledge alert
 * - PATCH  /api/v1/retention/alerts/:id/resolve    - Resolve alert
 */
