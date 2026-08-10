/**
 * Security Posture Health Routes
 * 
 * API endpoints for monitoring collector health and diagnostics.
 */

import { Router } from 'express';
import { getCollectorHealthService } from '../security-posture/services/collector-health.service';

const router = Router();

/**
 * GET /api/security-posture/health
 * 
 * Get health status for all collectors
 */
router.get('/health', async (req, res) => {
  try {
    const healthService = getCollectorHealthService();
    const summary = await healthService.getAllCollectorHealth();
    
    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve collector health',
      details: error.message,
    });
  }
});

/**
 * GET /api/security-posture/health/:collectorId
 * 
 * Get health status for a specific collector
 */
router.get('/health/:collectorId', async (req, res) => {
  try {
    const healthService = getCollectorHealthService();
    const health = await healthService.getCollectorHealth(req.params.collectorId);
    
    if (!health) {
      return res.status(404).json({
        success: false,
        error: 'Collector not found',
      });
    }
    
    res.json({
      success: true,
      data: health,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve collector health',
      details: error.message,
    });
  }
});

/**
 * GET /api/security-posture/health/failing
 * 
 * Get list of failing collectors
 */
router.get('/health/status/failing', async (req, res) => {
  try {
    const healthService = getCollectorHealthService();
    const failing = await healthService.getFailingCollectors();
    
    res.json({
      success: true,
      data: failing,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve failing collectors',
      details: error.message,
    });
  }
});

/**
 * GET /api/security-posture/health/degraded
 * 
 * Get list of degraded collectors
 */
router.get('/health/status/degraded', async (req, res) => {
  try {
    const healthService = getCollectorHealthService();
    const degraded = await healthService.getDegradedCollectors();
    
    res.json({
      success: true,
      data: degraded,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve degraded collectors',
      details: error.message,
    });
  }
});

/**
 * GET /api/security-posture/health/metrics
 * 
 * Get health metrics for monitoring/alerting
 */
router.get('/health/metrics', async (req, res) => {
  try {
    const healthService = getCollectorHealthService();
    const metrics = await healthService.getHealthMetrics();
    
    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve health metrics',
      details: error.message,
    });
  }
});

/**
 * POST /api/security-posture/health/:collectorId/reset
 * 
 * Reset health tracking for a collector
 */
router.post('/health/:collectorId/reset', async (req, res) => {
  try {
    const healthService = getCollectorHealthService();
    const success = await healthService.resetCollectorHealth(req.params.collectorId);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Collector not found or does not support health reset',
      });
    }
    
    res.json({
      success: true,
      message: 'Collector health reset successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to reset collector health',
      details: error.message,
    });
  }
});

export default router;
