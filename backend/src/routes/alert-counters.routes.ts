/**
 * Alert Counter API Routes
 * Fast, cached alert counter endpoints
 */

import { Router, Request, Response } from 'express';
import { getAlertCounterCache } from '../services/alert-counter-cache.service';

const router = Router();

/**
 * @route GET /api/alerts/counters
 * @desc Get alert counters for tenant (cached)
 * @access Private
 */
router.get('/counters', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const branchId = req.query.branchId as string | undefined;
    const forceRefresh = req.query.refresh === 'true';

    const cache = getAlertCounterCache();
    const counters = await cache.getCounters(tenantId, { branchId, forceRefresh });

    res.json({
      success: true,
      data: counters,
      cached: !forceRefresh,
    });
  } catch (error: any) {
    console.error('[AlertCounters] Error:', error);
    res.status(500).json({ 
      error: 'Failed to get alert counters',
      message: error.message 
    });
  }
});

/**
 * @route GET /api/alerts/counters/by-severity
 * @desc Get alert counters grouped by severity
 * @access Private
 */
router.get('/counters/by-severity', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const cache = getAlertCounterCache();
    const counters = await cache.getCounters(tenantId);

    res.json({
      success: true,
      data: counters.bySeverity,
      total: counters.total,
      lastUpdated: counters.lastUpdated,
    });
  } catch (error: any) {
    console.error('[AlertCounters] Error:', error);
    res.status(500).json({ 
      error: 'Failed to get alert counters by severity',
      message: error.message 
    });
  }
});

/**
 * @route GET /api/alerts/counters/by-status
 * @desc Get alert counters grouped by status
 * @access Private
 */
router.get('/counters/by-status', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const cache = getAlertCounterCache();
    const counters = await cache.getCounters(tenantId);

    res.json({
      success: true,
      data: counters.byStatus,
      total: counters.total,
      lastUpdated: counters.lastUpdated,
    });
  } catch (error: any) {
    console.error('[AlertCounters] Error:', error);
    res.status(500).json({ 
      error: 'Failed to get alert counters by status',
      message: error.message 
    });
  }
});

/**
 * @route GET /api/alerts/counters/active
 * @desc Get active alert count (pending + investigating + acknowledged)
 * @access Private
 */
router.get('/counters/active', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const cache = getAlertCounterCache();
    const counters = await cache.getCounters(tenantId);

    res.json({
      success: true,
      data: {
        active: counters.active,
        critical: counters.critical,
      },
      lastUpdated: counters.lastUpdated,
    });
  } catch (error: any) {
    console.error('[AlertCounters] Error:', error);
    res.status(500).json({ 
      error: 'Failed to get active alert count',
      message: error.message 
    });
  }
});

/**
 * @route POST /api/alerts/counters/invalidate
 * @desc Invalidate alert counter cache
 * @access Private
 */
router.post('/counters/invalidate', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { branchId } = req.body;

    const cache = getAlertCounterCache();
    await cache.invalidate(tenantId, branchId);

    res.json({
      success: true,
      message: 'Cache invalidated',
    });
  } catch (error: any) {
    console.error('[AlertCounters] Error:', error);
    res.status(500).json({ 
      error: 'Failed to invalidate cache',
      message: error.message 
    });
  }
});

/**
 * @route GET /api/alerts/counters/health
 * @desc Get alert counter cache health
 * @access Private
 */
router.get('/counters/health', async (req: Request, res: Response) => {
  try {
    const cache = getAlertCounterCache();
    const health = await cache.healthCheck();
    const stats = await cache.getCacheStats();

    res.json({
      success: true,
      health,
      stats,
    });
  } catch (error: any) {
    console.error('[AlertCounters] Error:', error);
    res.status(500).json({ 
      error: 'Failed to get cache health',
      message: error.message 
    });
  }
});

export default router;
