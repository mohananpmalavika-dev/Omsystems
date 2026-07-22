/**
 * Dashboard API Routes
 * Endpoints for role-based dashboards and operational metrics
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { DashboardService } from '../services/dashboard.service';

// Extend Express Request type
interface AuthRequest extends Request {
  context?: {
    tenantId: string;
    userId?: string;
    userScope?: {
      branchIds?: string[];
      regionIds?: string[];
    };
  };
}

export function createDashboardRoutes(pool: Pool): Router {
  const router = Router();
  const dashboardService = new DashboardService(pool);

/**
 * GET /v1/dashboard/summary
 * Get dashboard header summary
 */
router.get('/summary', async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, userScope } = req.context || {};
    
    if (!tenantId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }
    
    const summary = await dashboardService.getDashboardSummary(tenantId, userScope);
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard summary'
    });
  }
});

/**
 * GET /v1/dashboard/camera-health
 * Get camera health metrics
 */
router.get('/camera-health', async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, userScope } = req.context || {};
    
    if (!tenantId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }
    
    const metrics = await dashboardService.getCameraMetrics(tenantId, userScope);
    
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error fetching camera health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch camera health metrics'
    });
  }
});

/**
 * GET /v1/dashboard/recording-status
 * Get recording status metrics
 */
router.get('/recording-status', async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, userScope } = req.context || {};
    
    if (!tenantId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }
    
    const metrics = await dashboardService.getRecordingMetrics(tenantId, userScope);
    
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error fetching recording status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recording status'
    });
  }
});

/**
 * GET /v1/dashboard/storage
 * Get storage capacity metrics
 */
router.get('/storage', async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, userScope } = req.context || {};
    
    if (!tenantId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }
    
    const metrics = await dashboardService.getStorageMetrics(tenantId, userScope);
    
    // Convert BigInt to string for JSON serialization
    const serializedMetrics = {
      ...metrics,
      totalCapacityBytes: metrics.totalCapacityBytes.toString(),
      usedCapacityBytes: metrics.usedCapacityBytes.toString(),
      availableCapacityBytes: metrics.availableCapacityBytes.toString()
    };
    
    res.json({
      success: true,
      data: serializedMetrics
    });
  } catch (error) {
    console.error('Error fetching storage metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch storage metrics'
    });
  }
});

/**
 * GET /v1/dashboard/alerts
 * Get active alerts metrics
 */
router.get('/alerts', async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, userScope } = req.context || {};
    
    if (!tenantId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }
    
    const metrics = await dashboardService.getAlertMetrics(tenantId, userScope);
    
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error fetching alert metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alert metrics'
    });
  }
});

/**
 * GET /v1/dashboard/incidents
 * Get recent incidents
 */
router.get('/incidents', async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, userScope } = req.context || {};
    
    if (!tenantId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }
    
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    
    const incidents = await dashboardService.getRecentIncidents(tenantId, limit, userScope);
    
    res.json({
      success: true,
      data: incidents
    });
  } catch (error) {
    console.error('Error fetching recent incidents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent incidents'
    });
  }
});

/**
 * GET /v1/dashboard/system-health
 * Get system health score with component breakdown
 */
router.get('/system-health', async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, userScope } = req.context || {};
    
    if (!tenantId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }
    
    const branchNodeId = req.query.branchNodeId as string | undefined;
    
    const healthScore = await dashboardService.getSystemHealthScore(
      tenantId,
      branchNodeId
    );
    
    if (!healthScore) {
      return res.status(404).json({
        success: false,
        error: 'No recent health score available'
      });
    }
    
    res.json({
      success: true,
      data: healthScore
    });
  } catch (error) {
    console.error('Error fetching system health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch system health score'
    });
  }
});

  return router;
}

export default createDashboardRoutes;
