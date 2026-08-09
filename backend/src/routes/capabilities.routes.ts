/**
 * Capabilities API Routes
 * 
 * Exposes truthful capability status to the UI.
 * Prevents misrepresentation of framework/placeholder features as production-ready.
 */

import { Router, Request, Response } from 'express';
import { getCapabilityRegistry, CapabilityStatus } from '../services/capability-registry.service.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = Router();

/**
 * GET /api/capabilities
 * 
 * Get all capabilities with their current status
 */
router.get(
  '/',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const registry = getCapabilityRegistry();
      const report = registry.generateReport();
      
      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      console.error('[CapabilitiesAPI] Error fetching capabilities:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch capabilities',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * GET /api/capabilities/summary
 * 
 * Get capability summary counts
 */
router.get(
  '/summary',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const registry = getCapabilityRegistry();
      const report = registry.generateReport();
      
      res.json({
        success: true,
        data: {
          total: report.summary.total,
          production: report.summary.production,
          integrated: report.summary.integrated,
          framework: report.summary.framework,
          unavailable: report.summary.unavailable,
          generatedAt: report.generatedAt,
          statusBreakdown: {
            production: {
              count: report.summary.production,
              percentage: Math.round((report.summary.production / report.summary.total) * 100),
              description: 'Full pipeline: MODEL → INFERENCE → RESULT → EVENT → ALERT',
            },
            integrated: {
              count: report.summary.integrated,
              percentage: Math.round((report.summary.integrated / report.summary.total) * 100),
              description: 'Pipeline ready, model deployment pending',
            },
            framework: {
              count: report.summary.framework,
              percentage: Math.round((report.summary.framework / report.summary.total) * 100),
              description: 'Interface exists, actual inference doesn't',
            },
            unavailable: {
              count: report.summary.unavailable,
              percentage: Math.round((report.summary.unavailable / report.summary.total) * 100),
              description: 'Feature not available',
            },
          },
        },
      });
    } catch (error) {
      console.error('[CapabilitiesAPI] Error fetching summary:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch capability summary',
      });
    }
  }
);

/**
 * GET /api/capabilities/production
 * 
 * Get only production-ready capabilities
 */
router.get(
  '/production',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const registry = getCapabilityRegistry();
      const capabilities = registry.getAllCapabilities({
        status: CapabilityStatus.PRODUCTION,
      });
      
      res.json({
        success: true,
        data: {
          count: capabilities.length,
          capabilities,
        },
      });
    } catch (error) {
      console.error('[CapabilitiesAPI] Error fetching production capabilities:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch production capabilities',
      });
    }
  }
);

/**
 * GET /api/capabilities/category/:category
 * 
 * Get capabilities by category
 */
router.get(
  '/category/:category',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { category } = req.params;
      
      if (!['detection', 'analytics', 'prediction', 'investigation', 'reporting'].includes(category)) {
        res.status(400).json({
          success: false,
          error: 'Invalid category',
          validCategories: ['detection', 'analytics', 'prediction', 'investigation', 'reporting'],
        });
        return;
      }
      
      const registry = getCapabilityRegistry();
      const capabilities = registry.getAllCapabilities({
        category: category as any,
      });
      
      res.json({
        success: true,
        data: {
          category,
          count: capabilities.length,
          capabilities,
        },
      });
    } catch (error) {
      console.error('[CapabilitiesAPI] Error fetching capabilities by category:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch capabilities by category',
      });
    }
  }
);

/**
 * GET /api/capabilities/:id
 * 
 * Get specific capability details
 */
router.get(
  '/:id',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const registry = getCapabilityRegistry();
      const capability = registry.getCapability(id);
      
      if (!capability) {
        res.status(404).json({
          success: false,
          error: 'Capability not found',
        });
        return;
      }
      
      res.json({
        success: true,
        data: capability,
      });
    } catch (error) {
      console.error('[CapabilitiesAPI] Error fetching capability:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch capability',
      });
    }
  }
);

/**
 * POST /api/capabilities/refresh
 * 
 * Force refresh of capability status
 * (Admin only)
 */
router.post(
  '/refresh',
  authenticate,
  authorize(['admin', 'system']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const registry = getCapabilityRegistry();
      await registry.refresh();
      
      const report = registry.generateReport();
      
      res.json({
        success: true,
        message: 'Capability registry refreshed',
        data: report.summary,
      });
    } catch (error) {
      console.error('[CapabilitiesAPI] Error refreshing capabilities:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to refresh capabilities',
      });
    }
  }
);

export default router;
