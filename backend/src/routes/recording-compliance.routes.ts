/**
 * Recording Compliance API Routes
 * 
 * Evidence-based recording compliance verification endpoints
 */

import { Router, type Request, type Response } from 'express';
import type { Pool } from 'pg';
import { getRecordingComplianceService } from '../services/recording-compliance.service.js';
import { logger } from '../utils/logger.js';

export function createRecordingComplianceRoutes(pool: Pool): Router {
  const router = Router();
  const service = getRecordingComplianceService(pool);
  
  /**
   * GET /api/recording-compliance/v2/:cameraId
   * 
   * Get comprehensive evidence-based compliance check for a camera
   * Returns full RecordingCheckResult with three-state health model
   */
  router.get('/v2/:cameraId', async (req: Request, res: Response) => {
    try {
      const { cameraId } = req.params;
      
      logger.info('Recording compliance V2 check requested', {
        cameraId,
        userId: (req as any).user?.id
      });
      
      const result = await service.checkRecordingComplianceV2(cameraId);
      
      if (!result) {
        return res.status(404).json({
          error: 'Camera not found or no recorder configured'
        });
      }
      
      return res.json(result);
      
    } catch (error) {
      logger.error('Failed to check recording compliance V2', {
        error,
        cameraId: req.params.cameraId
      });
      
      return res.status(500).json({
        error: 'Failed to check recording compliance'
      });
    }
  });
  
  /**
   * GET /api/recording-compliance/camera/:cameraId
   * 
   * Legacy API - returns compliance score (backward compatible)
   */
  router.get('/camera/:cameraId', async (req: Request, res: Response) => {
    try {
      const { cameraId } = req.params;
      const { periodDays = 1 } = req.query;
      
      const score = await service.calculateComplianceScore(
        cameraId,
        Number(periodDays)
      );
      
      if (!score) {
        return res.status(404).json({
          error: 'Camera not found'
        });
      }
      
      return res.json(score);
      
    } catch (error) {
      logger.error('Failed to calculate compliance score', {
        error,
        cameraId: req.params.cameraId
      });
      
      return res.status(500).json({
        error: 'Failed to calculate compliance score'
      });
    }
  });
  
  /**
   * GET /api/recording-compliance/branch/:branchId/report
   * 
   * Generate compliance report for entire branch
   */
  router.get('/branch/:branchId/report', async (req: Request, res: Response) => {
    try {
      const { branchId } = req.params;
      const { periodDays = 1 } = req.query;
      
      const report = await service.generateComplianceReport(
        branchId,
        Number(periodDays)
      );
      
      return res.json(report);
      
    } catch (error) {
      logger.error('Failed to generate compliance report', {
        error,
        branchId: req.params.branchId
      });
      
      return res.status(500).json({
        error: 'Failed to generate compliance report'
      });
    }
  });
  
  /**
   * GET /api/recording-compliance/retention/:tenantId
   * 
   * Check retention policy compliance for tenant/branch
   */
  router.get('/retention/:tenantId', async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;
      const { branchId } = req.query;
      
      const compliance = await service.checkRetentionCompliance(
        tenantId,
        branchId as string | undefined
      );
      
      return res.json(compliance);
      
    } catch (error) {
      logger.error('Failed to check retention compliance', {
        error,
        tenantId: req.params.tenantId
      });
      
      return res.status(500).json({
        error: 'Failed to check retention compliance'
      });
    }
  });
  
  /**
   * GET /api/recording-compliance/latest/:recorderId
   * 
   * Get latest compliance check result from database (no new check)
   */
  router.get('/latest/:recorderId', async (req: Request, res: Response) => {
    try {
      const { recorderId } = req.params;
      const { channelId } = req.query;
      
      const result = await pool.query(
        `SELECT 
          recorder_id,
          channel_id,
          checked_at,
          overall_status,
          reachable_status,
          authentication_status,
          channel_status,
          stream_status,
          recording_status,
          archive_status,
          last_recording_time,
          archive_lag_seconds,
          storage_status,
          storage_usage_percent,
          clock_status,
          clock_drift_seconds,
          adapter_type,
          last_verified_healthy_at,
          errors_json
        FROM recording_compliance_checks
        WHERE recorder_id = $1::uuid
          AND ($2::text IS NULL OR channel_id = $2)
        ORDER BY checked_at DESC
        LIMIT 1`,
        [recorderId, channelId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'No compliance checks found for this recorder'
        });
      }
      
      const row = result.rows[0];
      
      // Build response matching RecordingCheckResult structure
      const response = {
        overallStatus: row.overall_status,
        recorderId: row.recorder_id,
        channelId: row.channel_id,
        checkedAt: row.checked_at,
        reachable: { status: row.reachable_status, checkedAt: row.checked_at },
        authentication: { status: row.authentication_status, checkedAt: row.checked_at },
        channel: { status: row.channel_status, checkedAt: row.checked_at },
        stream: { status: row.stream_status, checkedAt: row.checked_at },
        recording: { status: row.recording_status, checkedAt: row.checked_at },
        archive: {
          status: row.archive_status,
          lastRecordingTime: row.last_recording_time,
          archiveLagSeconds: row.archive_lag_seconds,
          checkedAt: row.checked_at
        },
        storage: {
          status: row.storage_status,
          usagePercent: row.storage_usage_percent ? parseFloat(row.storage_usage_percent) : undefined,
          checkedAt: row.checked_at
        },
        clock: {
          status: row.clock_status,
          driftSeconds: row.clock_drift_seconds,
          checkedAt: row.checked_at
        },
        adapterType: row.adapter_type,
        lastVerifiedHealthyAt: row.last_verified_healthy_at,
        errors: row.errors_json || []
      };
      
      return res.json(response);
      
    } catch (error) {
      logger.error('Failed to get latest compliance check', {
        error,
        recorderId: req.params.recorderId
      });
      
      return res.status(500).json({
        error: 'Failed to get latest compliance check'
      });
    }
  });
  
  /**
   * GET /api/recording-compliance/summary/:recorderId
   * 
   * Get compliance summary statistics
   */
  router.get('/summary/:recorderId', async (req: Request, res: Response) => {
    try {
      const { recorderId } = req.params;
      const { hours = 24 } = req.query;
      
      const result = await pool.query(
        `SELECT * FROM get_recorder_compliance_summary($1::uuid, $2::integer)`,
        [recorderId, Number(hours)]
      );
      
      if (result.rows.length === 0) {
        return res.json({
          recorderId,
          totalChecks: 0,
          healthyChecks: 0,
          unhealthyChecks: 0,
          unknownChecks: 0,
          healthyPercentage: 0
        });
      }
      
      return res.json(result.rows[0]);
      
    } catch (error) {
      logger.error('Failed to get compliance summary', {
        error,
        recorderId: req.params.recorderId
      });
      
      return res.status(500).json({
        error: 'Failed to get compliance summary'
      });
    }
  });
  
  return router;
}
