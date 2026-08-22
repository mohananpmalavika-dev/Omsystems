/**
 * Branch Health Scoring API Routes
 * Comprehensive health metrics and scoring for branches
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { BranchHealthScoringService } from '../services/branch-health-scoring.service';

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

export function createBranchHealthRoutes(pool: Pool): Router {
  const router = Router();
  const healthScoringService = new BranchHealthScoringService(pool);

  /**
   * GET /v1/branch-health/calculate/:branchId
   * Calculate and return current health score for a branch
   */
  router.get('/calculate/:branchId', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      const { branchId } = req.params;
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }
      
      const healthScore = await healthScoringService.calculateBranchHealth(
        tenantId,
        branchId
      );
      
      res.json({
        success: true,
        data: healthScore
      });
    } catch (error) {
      console.error('Error calculating branch health:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to calculate branch health'
      });
    }
  });

  /**
   * GET /v1/branch-health/:branchId
   * Get latest health score for a branch
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
      
      const healthScore = await healthScoringService.getLatestBranchHealth(
        tenantId,
        branchId
      );
      
      if (!healthScore) {
        return res.status(404).json({
          success: false,
          error: 'No health score found for this branch'
        });
      }
      
      res.json({
        success: true,
        data: healthScore
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
   * POST /v1/branch-health/calculate-all
   * Calculate health scores for all branches
   */
  router.post('/calculate-all', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }
      
      // Start calculation asynchronously
      healthScoringService.calculateAllBranchesHealth(tenantId)
        .catch(err => console.error('Error in batch health calculation:', err));
      
      res.json({
        success: true,
        message: 'Health calculation started for all branches'
      });
    } catch (error) {
      console.error('Error starting batch calculation:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start health calculation'
      });
    }
  });

  return router;
}

export default createBranchHealthRoutes;
