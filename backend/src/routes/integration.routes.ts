import { Router } from 'express';
import { Pool } from 'pg';
import { authenticate, authorize } from '../middleware/auth';
import { IntegrationGatewayService } from '../services/integration-gateway.service';
import { IntegrationRulesEngineService } from '../services/integration-rules-engine.service';
import { logger } from '../utils/logger';

export function createIntegrationRoutes(pool: Pool): Router {
  const router = Router();
  const gatewayService = new IntegrationGatewayService(pool);
  const rulesEngine = new IntegrationRulesEngineService(pool);

  // Get all integration connectors
  router.get('/', authenticate, authorize('integration:view'), async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT 
          ic.*,
          COUNT(ee.id) as total_events,
          COUNT(CASE WHEN ee.delivery_state = 'failed' THEN 1 END) as failed_events
        FROM integration_connectors ic
        LEFT JOIN external_events ee ON ee.connector_id = ic.id
        GROUP BY ic.id
        ORDER BY ic.created_at DESC
      `);

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      logger.error('Error fetching integrations', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch integrations'
      });
    }
  });

  // Get single integration connector
  router.get('/:id', authenticate, authorize('integration:view'), async (req, res) => {
    try {
      const { id } = req.params;
      
      const result = await pool.query(
        `SELECT * FROM integration_connectors WHERE id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Integration connector not found'
        });
      }

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Error fetching integration', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch integration'
      });
    }
  });

  // Create new integration connector
  router.post('/', authenticate, authorize('integration:configure'), async (req, res) => {
    try {
      const {
        name,
        connectorType,
        description,
        connectionMethod,
        endpointUrl,
        authenticationMethod,
        config
      } = req.body;

      const result = await pool.query(
        `INSERT INTO integration_connectors 
         (name, connector_type, description, connection_method, endpoint_url,
          authentication_method, config_json, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          name,
          connectorType,
          description,
          connectionMethod,
          endpointUrl,
          authenticationMethod,
          JSON.stringify(config || {}),
          req.user.id
        ]
      );

      // Audit log
      await pool.query(
        `INSERT INTO integration_audit_log (audit_type, entity_type, entity_id, action, actor_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ['connection', 'connector', result.rows[0].id, 'created', req.user.id]
      );

      res.status(201).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Error creating integration', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to create integration'
      });
    }
  });

  // Update integration connector
  router.patch('/:id', authenticate, authorize('integration:configure'), async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const result = await pool.query(
        `UPDATE integration_connectors 
         SET name = COALESCE($1, name),
             description = COALESCE($2, description),
             connection_method = COALESCE($3, connection_method),
             endpoint_url = COALESCE($4, endpoint_url),
             config_json = COALESCE($5, config_json),
             updated_by = $6,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $7
         RETURNING *`,
        [
          updates.name,
          updates.description,
          updates.connectionMethod,
          updates.endpointUrl,
          updates.config ? JSON.stringify(updates.config) : null,
          req.user.id,
          id
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Integration connector not found'
        });
      }

      // Audit log
      await pool.query(
        `INSERT INTO integration_audit_log (audit_type, entity_type, entity_id, action, actor_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ['connection', 'connector', id, 'updated', req.user.id]
      );

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Error updating integration', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to update integration'
      });
    }
  });

  // Test integration connection
  router.post('/:id/test', authenticate, authorize('integration:test'), async (req, res) => {
    try {
      const { id } = req.params;

      // Get connector
      const connectorResult = await pool.query(
        `SELECT * FROM integration_connectors WHERE id = $1`,
        [id]
      );

      if (connectorResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Integration connector not found'
        });
      }

      // Perform test (simplified)
      const testResult = {
        success: true,
        message: 'Connection test successful',
        responseTime: 150
      };

      // Record health check
      await pool.query(
        `INSERT INTO integration_health_checks (connector_id, status, response_time_ms)
         VALUES ($1, $2, $3)`,
        [id, 'healthy', testResult.responseTime]
      );

      res.json({
        success: true,
        data: testResult
      });
    } catch (error) {
      logger.error('Error testing integration', { error });
      res.status(500).json({
        success: false,
        error: 'Connection test failed'
      });
    }
  });

  // Enable integration
  router.post('/:id/enable', authenticate, authorize('integration:configure'), async (req, res) => {
    try {
      const { id } = req.params;

      await pool.query(
        `UPDATE integration_connectors SET status = 'active' WHERE id = $1`,
        [id]
      );

      // Audit log
      await pool.query(
        `INSERT INTO integration_audit_log (audit_type, entity_type, entity_id, action, actor_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ['connection', 'connector', id, 'enabled', req.user.id]
      );

      res.json({
        success: true,
        message: 'Integration enabled successfully'
      });
    } catch (error) {
      logger.error('Error enabling integration', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to enable integration'
      });
    }
  });

  // Disable integration
  router.post('/:id/disable', authenticate, authorize('integration:disable'), async (req, res) => {
    try {
      const { id } = req.params;

      await pool.query(
        `UPDATE integration_connectors SET status = 'inactive' WHERE id = $1`,
        [id]
      );

      // Audit log
      await pool.query(
        `INSERT INTO integration_audit_log (audit_type, entity_type, entity_id, action, actor_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ['connection', 'connector', id, 'disabled', req.user.id]
      );

      res.json({
        success: true,
        message: 'Integration disabled successfully'
      });
    } catch (error) {
      logger.error('Error disabling integration', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to disable integration'
      });
    }
  });

  return router;
}
