/**
 * Bulk Configuration API Routes
 * Endpoints for managing multiple branches simultaneously
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { BulkBranchConfigService } from '../services/bulk-branch-config.service';

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

export function createBulkConfigRoutes(pool: Pool): Router {
  const router = Router();
  const bulkConfigService = new BulkBranchConfigService(pool);

  /**
   * POST /v1/bulk-config/execute
   * Execute bulk configuration operation
   */
  router.post('/execute', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userId } = req.context || {};
      
      if (!tenantId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const operation = req.body;

      if (!operation.operationType) {
        return res.status(400).json({
          success: false,
          error: 'Operation type is required'
        });
      }

      const result = await bulkConfigService.executeBulkConfig(
        tenantId,
        userId,
        operation
      );
      
      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Error executing bulk config:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to execute bulk configuration'
      });
    }
  });

  /**
   * POST /v1/bulk-config/templates
   * Create configuration template
   */
  router.post('/templates', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userId } = req.context || {};
      
      if (!tenantId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const template = req.body;

      if (!template.name || !template.category || !template.configuration) {
        return res.status(400).json({
          success: false,
          error: 'Name, category, and configuration are required'
        });
      }

      const result = await bulkConfigService.createConfigTemplate(
        tenantId,
        userId,
        template
      );
      
      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Error creating template:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create template'
      });
    }
  });

  /**
   * GET /v1/bulk-config/templates
   * Get configuration templates
   */
  router.get('/templates', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const { category } = req.query;

      const templates = await bulkConfigService.getConfigTemplates(
        tenantId,
        category as string
      );
      
      res.json({
        success: true,
        data: templates
      });
    } catch (error) {
      console.error('Error fetching templates:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch templates'
      });
    }
  });

  /**
   * GET /v1/bulk-config/history
   * Get bulk operation history
   */
  router.get('/history', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const { operationType, performedBy, startDate, endDate, limit, offset } = req.query;

      const filters: any = {
        operationType: operationType as string,
        performedBy: performedBy as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
      };

      const history = await bulkConfigService.getBulkOperationHistory(
        tenantId,
        filters
      );
      
      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      console.error('Error fetching history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch operation history'
      });
    }
  });

  /**
   * POST /v1/bulk-config/clone
   * Clone branch configuration
   */
  router.post('/clone', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userId } = req.context || {};
      
      if (!tenantId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const { sourceBranchId, targetBranchIds, includeSettings } = req.body;

      if (!sourceBranchId || !targetBranchIds || targetBranchIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Source branch and target branches are required'
        });
      }

      const result = await bulkConfigService.cloneBranchConfig(
        sourceBranchId,
        targetBranchIds,
        userId,
        includeSettings || { cameras: true, storage: true, network: true, general: true }
      );
      
      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Error cloning configuration:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to clone configuration'
      });
    }
  });

  return router;
}

export default createBulkConfigRoutes;
