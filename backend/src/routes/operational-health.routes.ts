/**
 * Operational Health API Routes
 * Comprehensive monitoring endpoints for VMS administrator dashboard
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { OperationalHealthService } from '../services/operational-health.service';

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

export function createOperationalHealthRoutes(pool: Pool): Router {
  const router = Router();
  const healthService = new OperationalHealthService(pool);

  /**
   * GET /v1/operations/health/summary
   * Get top-level operational health summary
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
      
      const summary = await healthService.getHealthSummary(tenantId, userScope);
      
      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      console.error('Error fetching health summary:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch health summary'
      });
    }
  });

  /**
   * GET /v1/operations/health/branches
   * Get health status for all branches
   */
  router.get('/branches', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userScope } = req.context || {};
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const { status, region, limit = '100', offset = '0' } = req.query;
      
      const branches = await healthService.getBranchesHealth(
        tenantId,
        {
          status: status as string,
          region: region as string,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string)
        },
        userScope
      );
      
      res.json({
        success: true,
        data: branches
      });
    } catch (error) {
      console.error('Error fetching branches health:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch branches health'
      });
    }
  });

  /**
   * GET /v1/operations/health/branches/:branchId
   * Get detailed health metrics for a specific branch
   */
  router.get('/branches/:branchId', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userScope } = req.context || {};
      const { branchId } = req.params;
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }
      
      const branchHealth = await healthService.getBranchHealthDetail(
        tenantId,
        branchId,
        userScope
      );
      
      if (!branchHealth) {
        return res.status(404).json({
          success: false,
          error: 'Branch not found'
        });
      }
      
      res.json({
        success: true,
        data: branchHealth
      });
    } catch (error) {
      console.error('Error fetching branch health:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch branch health'
      });
    }
  });

  /**
   * GET /v1/operations/health/cameras
   * Get camera health metrics with filtering
   */
  router.get('/cameras', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userScope } = req.context || {};
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const { 
        status, 
        branchId, 
        recordingStatus,
        limit = '100', 
        offset = '0' 
      } = req.query;
      
      const cameras = await healthService.getCamerasHealth(
        tenantId,
        {
          status: status as string,
          branchId: branchId as string,
          recordingStatus: recordingStatus as string,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string)
        },
        userScope
      );
      
      res.json({
        success: true,
        data: cameras
      });
    } catch (error) {
      console.error('Error fetching cameras health:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch cameras health'
      });
    }
  });

  /**
   * GET /v1/operations/health/recording
   * Get recording health metrics
   */
  router.get('/recording', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userScope } = req.context || {};
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const { branchId } = req.query;
      
      const recording = await healthService.getRecordingHealth(
        tenantId,
        branchId as string | undefined,
        userScope
      );
      
      res.json({
        success: true,
        data: recording
      });
    } catch (error) {
      console.error('Error fetching recording health:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch recording health'
      });
    }
  });

  /**
   * GET /v1/operations/health/storage
   * Get storage health metrics
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

      const { branchId } = req.query;
      
      const storage = await healthService.getStorageHealth(
        tenantId,
        branchId as string | undefined,
        userScope
      );
      
      res.json({
        success: true,
        data: storage
      });
    } catch (error) {
      console.error('Error fetching storage health:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch storage health'
      });
    }
  });

  /**
   * GET /v1/operations/health/disks
   * Get disk health with SMART metrics
   */
  router.get('/disks', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userScope } = req.context || {};
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const { branchId, status } = req.query;
      
      const disks = await healthService.getDisksHealth(
        tenantId,
        {
          branchId: branchId as string,
          status: status as string
        },
        userScope
      );
      
      res.json({
        success: true,
        data: disks
      });
    } catch (error) {
      console.error('Error fetching disk health:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch disk health'
      });
    }
  });

  /**
   * GET /v1/operations/health/network
   * Get network health metrics
   */
  router.get('/network', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userScope } = req.context || {};
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const { branchId } = req.query;
      
      const network = await healthService.getNetworkHealth(
        tenantId,
        branchId as string | undefined,
        userScope
      );
      
      res.json({
        success: true,
        data: network
      });
    } catch (error) {
      console.error('Error fetching network health:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch network health'
      });
    }
  });

  /**
   * GET /v1/operations/health/ups
   * Get UPS health metrics
   */
  router.get('/ups', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userScope } = req.context || {};
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const { branchId, status } = req.query;
      
      const ups = await healthService.getUPSHealth(
        tenantId,
        {
          branchId: branchId as string,
          status: status as string
        },
        userScope
      );
      
      res.json({
        success: true,
        data: ups
      });
    } catch (error) {
      console.error('Error fetching UPS health:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch UPS health'
      });
    }
  });

  /**
   * GET /v1/operations/health/edge-agents
   * Get edge agent health metrics
   */
  router.get('/edge-agents', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userScope } = req.context || {};
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const { branchId, status } = req.query;
      
      const agents = await healthService.getEdgeAgentsHealth(
        tenantId,
        {
          branchId: branchId as string,
          status: status as string
        },
        userScope
      );
      
      res.json({
        success: true,
        data: agents
      });
    } catch (error) {
      console.error('Error fetching edge agents health:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch edge agents health'
      });
    }
  });

  /**
   * GET /v1/operations/health/trends
   * Get historical health trends
   */
  router.get('/trends', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userScope } = req.context || {};
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const { 
        branchId, 
        component,
        startDate,
        endDate,
        interval = 'hour'
      } = req.query;
      
      const trends = await healthService.getHealthTrends(
        tenantId,
        {
          branchId: branchId as string,
          component: component as string,
          startDate: startDate as string,
          endDate: endDate as string,
          interval: interval as 'hour' | 'day' | 'week'
        },
        userScope
      );
      
      res.json({
        success: true,
        data: trends
      });
    } catch (error) {
      console.error('Error fetching health trends:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch health trends'
      });
    }
  });

  /**
   * GET /v1/operations/alerts
   * Get operational alerts
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

      const { 
        severity, 
        status, 
        branchId,
        component,
        limit = '100', 
        offset = '0' 
      } = req.query;
      
      const alerts = await healthService.getOperationalAlerts(
        tenantId,
        {
          severity: severity as string,
          status: status as string,
          branchId: branchId as string,
          component: component as string,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string)
        },
        userScope
      );
      
      res.json({
        success: true,
        data: alerts
      });
    } catch (error) {
      console.error('Error fetching operational alerts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch operational alerts'
      });
    }
  });

  /**
   * POST /v1/operations/alerts/:id/acknowledge
   * Acknowledge an operational alert
   */
  router.post('/alerts/:id/acknowledge', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userId } = req.context || {};
      const { id } = req.params;
      
      if (!tenantId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }
      
      await healthService.acknowledgeAlert(id, userId);
      
      res.json({
        success: true,
        message: 'Alert acknowledged'
      });
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to acknowledge alert'
      });
    }
  });

  /**
   * POST /v1/operations/alerts/:id/assign
   * Assign an alert to a technician
   */
  router.post('/alerts/:id/assign', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userId } = req.context || {};
      const { id } = req.params;
      const { assigneeId } = req.body;
      
      if (!tenantId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      if (!assigneeId) {
        return res.status(400).json({
          success: false,
          error: 'Assignee ID is required'
        });
      }
      
      await healthService.assignAlert(id, assigneeId, userId);
      
      res.json({
        success: true,
        message: 'Alert assigned'
      });
    } catch (error) {
      console.error('Error assigning alert:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to assign alert'
      });
    }
  });

  /**
   * POST /v1/operations/alerts/:id/resolve
   * Resolve an operational alert
   */
  router.post('/alerts/:id/resolve', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userId } = req.context || {};
      const { id } = req.params;
      const { resolution, notes } = req.body;
      
      if (!tenantId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      if (!resolution) {
        return res.status(400).json({
          success: false,
          error: 'Resolution is required'
        });
      }
      
      await healthService.resolveAlert(id, userId, resolution, notes);
      
      res.json({
        success: true,
        message: 'Alert resolved'
      });
    } catch (error) {
      console.error('Error resolving alert:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to resolve alert'
      });
    }
  });

  /**
   * POST /v1/operations/alerts/:id/work-order
   * Create work order from alert
   */
  router.post('/alerts/:id/work-order', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userId } = req.context || {};
      const { id } = req.params;
      const { priority, assigneeId, notes } = req.body;
      
      if (!tenantId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }
      
      const workOrderId = await healthService.createWorkOrderFromAlert(
        id,
        userId,
        { priority, assigneeId, notes }
      );
      
      res.json({
        success: true,
        message: 'Work order created',
        data: { workOrderId }
      });
    } catch (error) {
      console.error('Error creating work order:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create work order'
      });
    }
  });

  return router;
}

export default createOperationalHealthRoutes;
