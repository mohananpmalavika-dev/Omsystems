/**
 * Branch Command Center API Routes
 * 
 * RESTful endpoints for the Branch Command Center UI.
 * Provides unified operational snapshots, camera details, events, and diagnostics.
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { BranchOperationalSnapshotService } from '../services/branch-operational-snapshot.service';
import { authenticateToken } from '../middleware/auth.middleware';
import { validateBranchAccess } from '../middleware/branch-access.middleware';

export function createBranchCommandCenterRoutes(pool: Pool): Router {
  const router = Router();
  const snapshotService = new BranchOperationalSnapshotService(pool);

  /**
   * GET /api/v1/branches/:branchId/operational-snapshot
   * Get complete operational health snapshot for a branch
   */
  router.get(
    '/:branchId/operational-snapshot',
    authenticateToken,
    validateBranchAccess,
    async (req: Request, res: Response) => {
      try {
        const { branchId } = req.params;
        const tenantId = (req as any).user.tenantId;
        const forceRefresh = req.query.refresh === 'true';

        const snapshot = await snapshotService.getBranchSnapshot(tenantId, branchId, forceRefresh);

        if (!snapshot) {
          return res.status(404).json({
            success: false,
            error: 'Branch not found or access denied',
          });
        }

        // Determine cache age
        const cacheAge = forceRefresh ? 0 : undefined;

        res.json({
          success: true,
          data: snapshot,
          cached: !forceRefresh,
          cacheAge,
        });
      } catch (error) {
        console.error('Error fetching branch snapshot:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch branch operational snapshot',
        });
      }
    }
  );

  /**
   * GET /api/v1/branches/:branchId/cameras
   * Get detailed camera list with operational status
   */
  router.get(
    '/:branchId/cameras',
    authenticateToken,
    validateBranchAccess,
    async (req: Request, res: Response) => {
      try {
        const { branchId } = req.params;
        const tenantId = (req as any).user.tenantId;
        const filter = req.query.filter as any;
        const sortBy = (req.query.sortBy as any) || 'number';

        const result = await snapshotService.getBranchCameras(tenantId, branchId, filter);

        // Apply sorting
        if (sortBy === 'health') {
          result.cameras.sort((a, b) => a.healthScore - b.healthScore);
        } else if (sortBy === 'name') {
          result.cameras.sort((a, b) => a.name.localeCompare(b.name));
        }

        res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        console.error('Error fetching branch cameras:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch branch cameras',
        });
      }
    }
  );

  /**
   * GET /api/v1/branches/:branchId/events
   * Get recent operational events for a branch
   */
  router.get(
    '/:branchId/events',
    authenticateToken,
    validateBranchAccess,
    async (req: Request, res: Response) => {
      try {
        const { branchId } = req.params;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        const severity = req.query.severity as any;
        const type = req.query.type as any;
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

        const result = await snapshotService.getBranchEvents(branchId, {
          limit,
          offset,
          severity,
          type,
          startDate,
          endDate,
        });

        res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        console.error('Error fetching branch events:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch branch events',
        });
      }
    }
  );

  /**
   * GET /api/v1/branches/:branchId/recorders
   * Get recorder details for a branch
   */
  router.get(
    '/:branchId/recorders',
    authenticateToken,
    validateBranchAccess,
    async (req: Request, res: Response) => {
      try {
        const { branchId } = req.params;
        const tenantId = (req as any).user.tenantId;

        const snapshot = await snapshotService.getBranchSnapshot(tenantId, branchId);

        if (!snapshot) {
          return res.status(404).json({
            success: false,
            error: 'Branch not found',
          });
        }

        res.json({
          success: true,
          data: snapshot.recorders,
        });
      } catch (error) {
        console.error('Error fetching recorders:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch recorder information',
        });
      }
    }
  );

  /**
   * GET /api/v1/branches/:branchId/storage
   * Get storage health details for a branch
   */
  router.get(
    '/:branchId/storage',
    authenticateToken,
    validateBranchAccess,
    async (req: Request, res: Response) => {
      try {
        const { branchId } = req.params;
        const tenantId = (req as any).user.tenantId;

        const snapshot = await snapshotService.getBranchSnapshot(tenantId, branchId);

        if (!snapshot) {
          return res.status(404).json({
            success: false,
            error: 'Branch not found',
          });
        }

        res.json({
          success: true,
          data: snapshot.storage,
        });
      } catch (error) {
        console.error('Error fetching storage:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch storage information',
        });
      }
    }
  );

  /**
   * GET /api/v1/branches/:branchId/retention
   * Get retention status for a branch
   */
  router.get(
    '/:branchId/retention',
    authenticateToken,
    validateBranchAccess,
    async (req: Request, res: Response) => {
      try {
        const { branchId } = req.params;
        const tenantId = (req as any).user.tenantId;

        const snapshot = await snapshotService.getBranchSnapshot(tenantId, branchId);

        if (!snapshot) {
          return res.status(404).json({
            success: false,
            error: 'Branch not found',
          });
        }

        res.json({
          success: true,
          data: snapshot.retention,
        });
      } catch (error) {
        console.error('Error fetching retention:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch retention information',
        });
      }
    }
  );

  /**
   * GET /api/v1/branches/:branchId/network-health
   * Get network connectivity status for a branch
   */
  router.get(
    '/:branchId/network-health',
    authenticateToken,
    validateBranchAccess,
    async (req: Request, res: Response) => {
      try {
        const { branchId } = req.params;
        const tenantId = (req as any).user.tenantId;

        const snapshot = await snapshotService.getBranchSnapshot(tenantId, branchId);

        if (!snapshot) {
          return res.status(404).json({
            success: false,
            error: 'Branch not found',
          });
        }

        res.json({
          success: true,
          data: snapshot.network,
        });
      } catch (error) {
        console.error('Error fetching network health:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch network health information',
        });
      }
    }
  );

  /**
   * GET /api/v1/branches/:branchId/alerts
   * Get active alerts for a branch
   */
  router.get(
    '/:branchId/alerts',
    authenticateToken,
    validateBranchAccess,
    async (req: Request, res: Response) => {
      try {
        const { branchId } = req.params;
        const tenantId = (req as any).user.tenantId;

        const snapshot = await snapshotService.getBranchSnapshot(tenantId, branchId);

        if (!snapshot) {
          return res.status(404).json({
            success: false,
            error: 'Branch not found',
          });
        }

        res.json({
          success: true,
          data: snapshot.alerts,
        });
      } catch (error) {
        console.error('Error fetching alerts:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch alert information',
        });
      }
    }
  );

  /**
   * POST /api/v1/branches/:branchId/refresh
   * Force refresh of branch operational health
   */
  router.post(
    '/:branchId/refresh',
    authenticateToken,
    validateBranchAccess,
    async (req: Request, res: Response) => {
      try {
        const { branchId } = req.params;
        const tenantId = (req as any).user.tenantId;

        // Clear cache to force recomputation
        snapshotService.clearCache(tenantId, branchId);

        const snapshot = await snapshotService.getBranchSnapshot(tenantId, branchId, true);

        if (!snapshot) {
          return res.status(404).json({
            success: false,
            error: 'Branch not found',
          });
        }

        res.json({
          success: true,
          data: snapshot,
          message: 'Branch health refreshed successfully',
        });
      } catch (error) {
        console.error('Error refreshing branch health:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to refresh branch health',
        });
      }
    }
  );

  return router;
}
