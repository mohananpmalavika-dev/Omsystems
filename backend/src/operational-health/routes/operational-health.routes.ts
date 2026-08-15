/**
 * Operational Health API Routes
 * 
 * Production-ready API endpoints for branch-centric operational health dashboard.
 * These routes serve the HO control room, branch mosaic, and branch detail views.
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { IntegratedOperationalHealthService } from '../services/integrated-operational-health.service';
import { BranchHealthFilter } from '../types/operational-health.types';

export function createOperationalHealthRoutes(pool: Pool): Router {
  const router = Router();
  const healthService = new IntegratedOperationalHealthService(pool);

  /**
   * GET /api/v1/operational-health/dashboard
   * 
   * Get dashboard summary KPIs for HO control room
   * Returns aggregated counts across all branches
   */
  router.get('/dashboard', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      
      if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const summary = await healthService.getDashboardSummary(tenantId);
      
      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      console.error('Dashboard summary error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve dashboard summary',
      });
    }
  });

  /**
   * GET /api/v1/operational-health/branches
   * 
   * Get branch health mosaic (lightweight items for 400+ branches)
   * Supports comprehensive filtering and search
   */
  router.get('/branches', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      
      if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Parse filter parameters
      const filter: BranchHealthFilter = {};

      // Health states filter
      if (req.query.states) {
        filter.states = Array.isArray(req.query.states)
          ? req.query.states as any[]
          : [req.query.states as string];
      }

      // Internet states filter
      if (req.query.internetStates) {
        filter.internetStates = Array.isArray(req.query.internetStates)
          ? req.query.internetStates as any[]
          : [req.query.internetStates as string];
      }

      // Recorder states filter
      if (req.query.recorderStates) {
        filter.recorderStates = Array.isArray(req.query.recorderStates)
          ? req.query.recorderStates as any[]
          : [req.query.recorderStates as string];
      }

      // Storage states filter
      if (req.query.storageStates) {
        filter.storageStates = Array.isArray(req.query.storageStates)
          ? req.query.storageStates as any[]
          : [req.query.storageStates as string];
      }

      // Problem filters
      if (req.query.retentionViolation === 'true') {
        filter.retentionViolation = true;
      }

      if (req.query.recordingProblem === 'true') {
        filter.recordingProblem = true;
      }

      if (req.query.cameraOffline === 'true') {
        filter.cameraOffline = true;
      }

      if (req.query.p1Only === 'true') {
        filter.p1Only = true;
      }

      // Region filter
      if (req.query.regionIds) {
        filter.regionIds = Array.isArray(req.query.regionIds)
          ? req.query.regionIds as string[]
          : [req.query.regionIds as string];
      }

      // Reason codes filter
      if (req.query.reasonCodes) {
        filter.reasonCodes = Array.isArray(req.query.reasonCodes)
          ? req.query.reasonCodes as string[]
          : [req.query.reasonCodes as string];
      }

      // Search filter
      if (req.query.search) {
        filter.search = req.query.search as string;
      }

      const branches = await healthService.getBranchMosaicItems(tenantId, filter);
      
      res.json({
        success: true,
        data: {
          branches,
          total: branches.length,
          filters: filter,
        },
      });
    } catch (error) {
      console.error('Branch mosaic error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve branch health',
      });
    }
  });

  /**
   * GET /api/v1/operational-health/branches/:branchId
   * 
   * Get complete operational health for a single branch
   * Used for branch detail/control-room view
   */
  router.get('/branches/:branchId', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      const { branchId } = req.params;
      
      if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const health = await healthService.getBranchHealth(tenantId, branchId);
      
      if (!health) {
        return res.status(404).json({
          success: false,
          error: 'Branch not found',
        });
      }

      res.json({
        success: true,
        data: health,
      });
    } catch (error) {
      console.error('Branch health detail error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve branch health',
      });
    }
  });

  /**
   * POST /api/v1/operational-health/branches/:branchId/refresh
   * 
   * Force refresh health for a specific branch
   * Recomputes health from current telemetry and updates cache
   */
  router.post('/branches/:branchId/refresh', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      const { branchId } = req.params;
      
      if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const health = await healthService.refreshBranchHealth(tenantId, branchId);
      
      res.json({
        success: true,
        data: health,
        message: 'Branch health refreshed successfully',
      });
    } catch (error) {
      console.error('Branch health refresh error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to refresh branch health',
      });
    }
  });

  /**
   * POST /api/v1/operational-health/refresh-all
   * 
   * Refresh health for all branches (admin operation)
   * This is a background job - returns immediately with job ID
   */
  router.post('/refresh-all', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      const userRole = req.user?.role;
      
      if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Check admin permission
      if (userRole !== 'admin' && userRole !== 'super_admin') {
        return res.status(403).json({
          success: false,
          error: 'Only administrators can refresh all branches',
        });
      }

      // Start refresh in background
      const jobId = `refresh-all-${Date.now()}`;
      
      // Don't await - let it run in background
      healthService.refreshAllBranchesHealth(tenantId)
        .then((result) => {
          console.log(`Refresh all completed: ${JSON.stringify(result)}`);
        })
        .catch((error) => {
          console.error('Refresh all failed:', error);
        });

      res.json({
        success: true,
        message: 'Branch health refresh started',
        jobId,
      });
    } catch (error) {
      console.error('Refresh all error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start health refresh',
      });
    }
  });

  /**
   * GET /api/v1/operational-health/branches/:branchId/history
   * 
   * Get health state transition history for a branch
   * Used for availability reports and trend analysis
   */
  router.get('/branches/:branchId/history', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      const { branchId } = req.params;
      const { startDate, endDate, limit = 100 } = req.query;
      
      if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      let query = `
        SELECT *
        FROM branch_operational_health_history
        WHERE tenant_id = $1 AND branch_id = $2
      `;
      const params: any[] = [tenantId, branchId];
      let paramIndex = 3;

      if (startDate) {
        query += ` AND transition_at >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        query += ` AND transition_at <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }

      query += ` ORDER BY transition_at DESC LIMIT $${paramIndex}`;
      params.push(parseInt(limit as string));

      const result = await pool.query(query, params);
      
      res.json({
        success: true,
        data: {
          history: result.rows,
          total: result.rows.length,
        },
      });
    } catch (error) {
      console.error('Branch history error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve branch history',
      });
    }
  });

  /**
   * GET /api/v1/operational-health/events
   * 
   * Get recent health change events for real-time monitoring
   * Used by WebSocket/SSE for live updates
   */
  router.get('/events', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      const { since, limit = 50 } = req.query;
      
      if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      let query = `
        SELECT *
        FROM branch_health_change_events
        WHERE tenant_id = $1
      `;
      const params: any[] = [tenantId];
      let paramIndex = 2;

      if (since) {
        query += ` AND occurred_at > $${paramIndex}`;
        params.push(since);
        paramIndex++;
      }

      query += ` ORDER BY occurred_at DESC LIMIT $${paramIndex}`;
      params.push(parseInt(limit as string));

      const result = await pool.query(query, params);
      
      res.json({
        success: true,
        data: {
          events: result.rows,
          total: result.rows.length,
        },
      });
    } catch (error) {
      console.error('Events error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve events',
      });
    }
  });

  /**
   * GET /api/v1/operational-health/stats
   * 
   * Get operational health statistics for reporting
   */
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      
      if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Get summary stats
      const summaryQuery = `
        SELECT 
          COUNT(*) as total_branches,
          AVG(health_score) as avg_health_score,
          COUNT(*) FILTER (WHERE overall_state = 'CRITICAL') as critical_branches,
          COUNT(*) FILTER (WHERE retention_state = 'BELOW_POLICY') as retention_violations,
          COUNT(*) FILTER (WHERE telemetry_freshness = 'OFFLINE') as offline_branches,
          SUM(cameras_offline) as total_cameras_offline,
          SUM(cameras_not_recording) as total_recording_failures,
          SUM(alerts_p1_count) as total_p1_alerts
        FROM branch_operational_health_current
        WHERE tenant_id = $1
      `;

      const summaryResult = await pool.query(summaryQuery, [tenantId]);
      const stats = summaryResult.rows[0];

      res.json({
        success: true,
        data: {
          totalBranches: parseInt(stats.total_branches) || 0,
          avgHealthScore: parseFloat(stats.avg_health_score) || 0,
          criticalBranches: parseInt(stats.critical_branches) || 0,
          retentionViolations: parseInt(stats.retention_violations) || 0,
          offlineBranches: parseInt(stats.offline_branches) || 0,
          totalCamerasOffline: parseInt(stats.total_cameras_offline) || 0,
          totalRecordingFailures: parseInt(stats.total_recording_failures) || 0,
          totalP1Alerts: parseInt(stats.total_p1_alerts) || 0,
        },
      });
    } catch (error) {
      console.error('Stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve statistics',
      });
    }
  });

  return router;
}
