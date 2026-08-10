/**
 * Incidents API Routes
 * 
 * Provides access to correlated alert incidents.
 * An incident is a parent container for multiple related alerts.
 */

import { Router, Request, Response } from 'express';
import { getAlertCorrelationService } from '../services/alert-correlation.service.js';
import { getRedisService } from '../services/redis.service.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = Router();

/**
 * GET /api/incidents
 * 
 * List all active incidents
 */
router.get(
  '/',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const redisService = await getRedisService();
      const correlationService = getAlertCorrelationService(redisService.getClient());
      
      const stats = await correlationService.getStats();
      
      res.json({
        success: true,
        data: {
          activeIncidents: stats.activeIncidents,
          totalIncidents: stats.totalIncidents,
          alertsCorrelated: stats.alertsCorrelated,
          // TODO: Return actual incident list
          incidents: [],
        },
      });
    } catch (error) {
      console.error('[IncidentsAPI] Error fetching incidents:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch incidents',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * GET /api/incidents/:id
 * 
 * Get incident details
 */
router.get(
  '/:id',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      const redisService = await getRedisService();
      const correlationService = getAlertCorrelationService(redisService.getClient());
      
      const incident = await correlationService.getIncident(id);
      
      if (!incident) {
        res.status(404).json({
          success: false,
          error: 'Incident not found',
        });
        return;
      }
      
      res.json({
        success: true,
        data: incident,
      });
    } catch (error) {
      console.error('[IncidentsAPI] Error fetching incident:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch incident',
      });
    }
  }
);

/**
 * GET /api/incidents/alert/:alertId
 * 
 * Get incident for a specific alert
 */
router.get(
  '/alert/:alertId',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { alertId } = req.params;
      
      const redisService = await getRedisService();
      const correlationService = getAlertCorrelationService(redisService.getClient());
      
      const incidentId = await correlationService.getIncidentForAlert(alertId);
      
      if (!incidentId) {
        res.json({
          success: true,
          data: {
            hasIncident: false,
            incidentId: null,
          },
        });
        return;
      }
      
      const incident = await correlationService.getIncident(incidentId);
      
      res.json({
        success: true,
        data: {
          hasIncident: true,
          incidentId,
          incident,
        },
      });
    } catch (error) {
      console.error('[IncidentsAPI] Error fetching incident for alert:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch incident for alert',
      });
    }
  }
);

/**
 * GET /api/incidents/rules
 * 
 * Get correlation rules
 */
router.get(
  '/rules',
  authenticate,
  authorize(['admin', 'system']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const redisService = await getRedisService();
      const correlationService = getAlertCorrelationService(redisService.getClient());
      
      const rules = correlationService.getRules();
      const ruleList = Array.from(rules.entries()).map(([id, rule]) => ({
        id,
        name: rule.name,
        description: rule.description,
        enabled: rule.enabled,
        alertTypes: rule.alertTypes,
        timeWindowSeconds: rule.timeWindowSeconds,
        minimumAlerts: rule.minimumAlerts,
      }));
      
      res.json({
        success: true,
        data: {
          count: ruleList.length,
          rules: ruleList,
        },
      });
    } catch (error) {
      console.error('[IncidentsAPI] Error fetching rules:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch correlation rules',
      });
    }
  }
);

/**
 * PATCH /api/incidents/rules/:ruleId
 * 
 * Update correlation rule
 */
router.patch(
  '/rules/:ruleId',
  authenticate,
  authorize(['admin', 'system']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { ruleId } = req.params;
      const { enabled } = req.body;
      
      if (typeof enabled !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'Invalid request body',
          message: 'enabled must be a boolean',
        });
        return;
      }
      
      const redisService = await getRedisService();
      const correlationService = getAlertCorrelationService(redisService.getClient());
      
      correlationService.setRuleEnabled(ruleId, enabled);
      
      res.json({
        success: true,
        message: `Rule ${ruleId} ${enabled ? 'enabled' : 'disabled'}`,
      });
    } catch (error) {
      console.error('[IncidentsAPI] Error updating rule:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update correlation rule',
      });
    }
  }
);

/**
 * GET /api/incidents/stats
 * 
 * Get correlation statistics
 */
router.get(
  '/stats',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const redisService = await getRedisService();
      const correlationService = getAlertCorrelationService(redisService.getClient());
      
      const stats = await correlationService.getStats();
      
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('[IncidentsAPI] Error fetching stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch correlation statistics',
      });
    }
  }
);

export default router;
