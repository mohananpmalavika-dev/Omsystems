/**
 * Branch Comparison and Ranking API Routes
 * Comparative analytics and benchmarking endpoints
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { BranchComparisonService } from '../services/branch-comparison.service';

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

export function createBranchComparisonRoutes(pool: Pool): Router {
  const router = Router();
  const comparisonService = new BranchComparisonService(pool);

  /**
   * GET /v1/branch-comparison/rankings
   * Get branch rankings across the organization
   */
  router.get('/rankings', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const { region, metric, limit, offset } = req.query;

      const rankings = await comparisonService.getBranchRankings(tenantId, {
        region: region as string,
        metric: metric as any,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
      });
      
      res.json({
        success: true,
        data: rankings
      });
    } catch (error) {
      console.error('Error fetching branch rankings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch branch rankings'
      });
    }
  });

  /**
   * GET /v1/branch-comparison/:branchId
   * Get detailed comparison for a specific branch
   */
  router.get('/:branchId', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      const { branchId } = req.params;
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }
      
      const comparison = await comparisonService.getDetailedComparison(
        tenantId,
        branchId
      );
      
      if (!comparison) {
        return res.status(404).json({
          success: false,
          error: 'Branch not found'
        });
      }
      
      res.json({
        success: true,
        data: comparison
      });
    } catch (error) {
      console.error('Error fetching branch comparison:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch branch comparison'
      });
    }
  });

  /**
   * GET /v1/branch-comparison/:branchId/peers
   * Get peer group comparison
   */
  router.get('/:branchId/peers', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      const { branchId } = req.params;
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }
      
      const peerComparison = await comparisonService.getPeerGroupComparison(
        tenantId,
        branchId
      );
      
      if (!peerComparison) {
        return res.status(404).json({
          success: false,
          error: 'Branch not found'
        });
      }
      
      res.json({
        success: true,
        data: peerComparison
      });
    } catch (error) {
      console.error('Error fetching peer comparison:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch peer comparison'
      });
    }
  });

  return router;
}

export default createBranchComparisonRoutes;
