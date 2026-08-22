import { Router } from 'express';
import { Pool } from 'pg';
import { authenticate, authorize } from '../middleware/auth';
import { IntegrationGatewayService } from '../services/integration-gateway.service';
import { logger } from '../utils/logger';

export function createIntegrationEventsRoutes(pool: Pool): Router {
  const router = Router();
  const gatewayService = new IntegrationGatewayService(pool);

  // Webhook endpoint for external events (no auth for external systems)
  router.post('/events', async (req, res) => {
    try {
      const signature = req.headers['x-signature'] as string;
      const connectorId = req.headers['x-connector-id'] as string;

      if (!connectorId) {
        return res.status(400).json({
          success: false,
          error: 'Missing connector ID'
        });
      }

      // Receive and queue event
      const event = await gatewayService.receiveEvent({
        ...req.body,
        connectorId,
        signature
      });

      res.status(202).json({
        success: true,
        message: 'Event received and queued',
        eventId: event.id
      });
    } catch (error) {
      logger.error('Error receiving external event', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to process event'
      });
    }
  });

  // Get external events
  router.get('/events', authenticate, authorize('external-event:view'), async (req, res) => {
    try {
      const {
        connectorId,
        sourceSystem,
        eventType,
        severity,
        branchId,
        deliveryState,
        startDate,
        endDate,
        page = 1,
        limit = 50
      } = req.query;

      let query = `
        SELECT 
          ee.*,
          ic.name as connector_name,
          b.name as branch_name
        FROM external_events ee
        LEFT JOIN integration_connectors ic ON ic.id = ee.connector_id
        LEFT JOIN branches b ON b.id = ee.branch_id
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIndex = 1;

      if (connectorId) {
        query += ` AND ee.connector_id = $${paramIndex++}`;
        params.push(connectorId);
      }

      if (sourceSystem) {
        query += ` AND ee.source_system = $${paramIndex++}`;
        params.push(sourceSystem);
      }

      if (eventType) {
        query += ` AND ee.event_type = $${paramIndex++}`;
        params.push(eventType);
      }

      if (severity) {
        query += ` AND ee.severity = $${paramIndex++}`;
        params.push(severity);
      }

      if (branchId) {
        query += ` AND ee.branch_id = $${paramIndex++}`;
        params.push(branchId);
      }

      if (deliveryState) {
        query += ` AND ee.delivery_state = $${paramIndex++}`;
        params.push(deliveryState);
      }

      if (startDate) {
        query += ` AND ee.occurred_at >= $${paramIndex++}`;
        params.push(startDate);
      }

      if (endDate) {
        query += ` AND ee.occurred_at <= $${paramIndex++}`;
        params.push(endDate);
      }

      query += ` ORDER BY ee.occurred_at DESC`;
      query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(Number(limit), (Number(page) - 1) * Number(limit));

      const result = await pool.query(query, params);

      // Get total count
      const countQuery = query.split('ORDER BY')[0].replace(/SELECT .* FROM/, 'SELECT COUNT(*) FROM');
      const countResult = await pool.query(countQuery, params.slice(0, -2));
      const total = parseInt(countResult.rows[0].count);

      res.json({
        success: true,
        data: result.rows,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      logger.error('Error fetching external events', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch events'
      });
    }
  });

  // Get single external event
  router.get('/events/:id', authenticate, authorize('external-event:view'), async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pool.query(`
        SELECT 
          ee.*,
          ic.name as connector_name,
          b.name as branch_name,
          eep.raw_payload
        FROM external_events ee
        LEFT JOIN integration_connectors ic ON ic.id = ee.connector_id
        LEFT JOIN branches b ON b.id = ee.branch_id
        LEFT JOIN external_event_payloads eep ON eep.external_event_id = ee.id
        WHERE ee.id = $1
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Event not found'
        });
      }

      // Get related events (correlation)
      const relatedEvents = await pool.query(`
        SELECT ee2.* 
        FROM external_events ee1
        JOIN external_events ee2 ON ee2.correlation_id = ee1.correlation_id
        WHERE ee1.id = $1 AND ee2.id != $1
      `, [id]);

      // Get failures
      const failures = await pool.query(
        `SELECT * FROM external_event_failures WHERE external_event_id = $1 ORDER BY created_at DESC`,
        [id]
      );

      res.json({
        success: true,
        data: {
          ...result.rows[0],
          relatedEvents: relatedEvents.rows,
          failures: failures.rows
        }
      });
    } catch (error) {
      logger.error('Error fetching external event', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch event'
      });
    }
  });

  // Replay failed event
  router.post('/events/:id/replay', authenticate, authorize('integration:replay'), async (req, res) => {
    try {
      const { id } = req.params;

      const success = await gatewayService.retryEvent(id, 0);

      if (success) {
        // Audit log
        await pool.query(
          `INSERT INTO integration_audit_log (audit_type, entity_type, entity_id, action, actor_id)
           VALUES ($1, $2, $3, $4, $5)`,
          ['event', 'external_event', id, 'replayed', req.user.id]
        );

        res.json({
          success: true,
          message: 'Event replay initiated'
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Failed to initiate replay'
        });
      }
    } catch (error) {
      logger.error('Error replaying event', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to replay event'
      });
    }
  });

  // Get integration health
  router.get('/health', authenticate, authorize('integration:view'), async (req, res) => {
    try {
      const health = await gatewayService.getIntegrationHealth();

      res.json({
        success: true,
        data: health
      });
    } catch (error) {
      logger.error('Error fetching integration health', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch health status'
      });
    }
  });

  // Get failed events
  router.get('/failures', authenticate, authorize('integration:view'), async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT 
          ee.*,
          eef.failure_type,
          eef.error_message,
          eef.retry_count,
          eef.created_at as failed_at
        FROM external_events ee
        JOIN external_event_failures eef ON eef.external_event_id = ee.id
        WHERE eef.resolved_at IS NULL
        ORDER BY eef.created_at DESC
        LIMIT 100
      `);

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      logger.error('Error fetching failures', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch failures'
      });
    }
  });

  return router;
}
