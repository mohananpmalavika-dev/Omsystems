import { Router } from 'express';
import { Pool } from 'pg';
import { authenticate, authorize } from '../middleware/auth';
import { CentralMonitoringStationService } from '../services/central-monitoring-station.service';
import { logger } from '../utils/logger';

export function createCentralMonitoringRoutes(pool: Pool): Router {
  const router = Router();
  const cmsService = new CentralMonitoringStationService(pool);

  // Get operator assignments
  router.get('/assignments', authenticate, async (req, res) => {
    try {
      const { operatorId, status, startDate, endDate } = req.query;

      let query = `
        SELECT 
          ea.*,
          ee.event_type,
          ee.severity,
          ee.branch_id,
          b.name as branch_name,
          mo.operator_code,
          u.name as operator_name
        FROM event_assignments ea
        JOIN external_events ee ON ee.id = ea.external_event_id
        LEFT JOIN branches b ON b.id = ee.branch_id
        JOIN monitoring_operators mo ON mo.id = ea.operator_id
        JOIN users u ON u.id = mo.user_id
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIndex = 1;

      if (operatorId) {
        query += ` AND ea.operator_id = $${paramIndex++}`;
        params.push(operatorId);
      }

      if (status === 'pending') {
        query += ` AND ea.completed_at IS NULL`;
      } else if (status === 'completed') {
        query += ` AND ea.completed_at IS NOT NULL`;
      }

      if (startDate) {
        query += ` AND ea.assigned_at >= $${paramIndex++}`;
        params.push(startDate);
      }

      if (endDate) {
        query += ` AND ea.assigned_at <= $${paramIndex++}`;
        params.push(endDate);
      }

      query += ` ORDER BY ea.assigned_at DESC LIMIT 100`;

      const result = await pool.query(query, params);

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      logger.error('Error fetching assignments', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch assignments'
      });
    }
  });

  // Acknowledge event
  router.post('/assignments/:id/acknowledge', authenticate, async (req, res) => {
    try {
      const { id } = req.params;
      const operatorId = req.body.operatorId || req.user.monitoringOperatorId;

      await cmsService.acknowledgeEvent(id, operatorId);

      res.json({
        success: true,
        message: 'Event acknowledged'
      });
    } catch (error) {
      logger.error('Error acknowledging event', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to acknowledge event'
      });
    }
  });

  // Start handling event
  router.post('/assignments/:id/start', authenticate, async (req, res) => {
    try {
      const { id } = req.params;
      const operatorId = req.body.operatorId || req.user.monitoringOperatorId;

      await cmsService.startHandling(id, operatorId);

      res.json({
        success: true,
        message: 'Event handling started'
      });
    } catch (error) {
      logger.error('Error starting event handling', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to start handling'
      });
    }
  });

  // Complete event
  router.post('/assignments/:id/complete', authenticate, async (req, res) => {
    try {
      const { id } = req.params;
      const { resolutionAction, notes } = req.body;
      const operatorId = req.body.operatorId || req.user.monitoringOperatorId;

      await cmsService.completeEvent(id, operatorId, resolutionAction, notes);

      res.json({
        success: true,
        message: 'Event completed'
      });
    } catch (error) {
      logger.error('Error completing event', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to complete event'
      });
    }
  });

  // Escalate event
  router.post('/assignments/:id/escalate', authenticate, async (req, res) => {
    try {
      const { id } = req.params;
      const { supervisorId, reason } = req.body;
      const operatorId = req.body.operatorId || req.user.monitoringOperatorId;

      await cmsService.escalateEvent(id, operatorId, supervisorId, reason);

      res.json({
        success: true,
        message: 'Event escalated'
      });
    } catch (error) {
      logger.error('Error escalating event', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to escalate event'
      });
    }
  });

  // Get operator statistics
  router.get('/operators/:id/statistics', authenticate, async (req, res) => {
    try {
      const { id } = req.params;

      const statistics = await cmsService.getOperatorStatistics(id);

      res.json({
        success: true,
        data: statistics
      });
    } catch (error) {
      logger.error('Error fetching operator statistics', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch statistics'
      });
    }
  });

  // Get queue statistics
  router.get('/queue/statistics', authenticate, async (req, res) => {
    try {
      const statistics = await cmsService.getQueueStatistics();

      res.json({
        success: true,
        data: statistics
      });
    } catch (error) {
      logger.error('Error fetching queue statistics', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch queue statistics'
      });
    }
  });

  return router;
}
