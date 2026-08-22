import { Router } from 'express';
import { Pool } from 'pg';
import { authenticate, authorize } from '../middleware/auth';
import { IntegrationRulesEngineService } from '../services/integration-rules-engine.service';
import { logger } from '../utils/logger';

export function createIntegrationRulesRoutes(pool: Pool): Router {
  const router = Router();
  const rulesEngine = new IntegrationRulesEngineService(pool);

  // Get rules
  router.get('/rules', authenticate, authorize('integration-rule:view'), async (req, res) => {
    try {
      const { connectorId, ruleType, isActive } = req.query;

      let query = `
        SELECT ir.*, ic.name as connector_name,
               u.name as created_by_name
        FROM integration_rules ir
        LEFT JOIN integration_connectors ic ON ic.id = ir.connector_id
        LEFT JOIN users u ON u.id = ir.created_by
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIndex = 1;

      if (connectorId) {
        query += ` AND ir.connector_id = $${paramIndex++}`;
        params.push(connectorId);
      }

      if (ruleType) {
        query += ` AND ir.rule_type = $${paramIndex++}`;
        params.push(ruleType);
      }

      if (isActive !== undefined) {
        query += ` AND ir.is_active = $${paramIndex++}`;
        params.push(isActive === 'true');
      }

      query += ` ORDER BY ir.priority ASC, ir.created_at DESC`;

      const result = await pool.query(query, params);

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      logger.error('Error fetching rules', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch rules'
      });
    }
  });

  // Get single rule
  router.get('/rules/:id', authenticate, authorize('integration-rule:view'), async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pool.query(
        `SELECT ir.*, ic.name as connector_name
         FROM integration_rules ir
         LEFT JOIN integration_connectors ic ON ic.id = ir.connector_id
         WHERE ir.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Rule not found'
        });
      }

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Error fetching rule', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch rule'
      });
    }
  });

  // Create rule
  router.post('/rules', authenticate, authorize('integration-rule:manage'), async (req, res) => {
    try {
      const {
        name,
        connectorId,
        ruleType,
        priority,
        condition,
        actions,
        isActive,
        requiresApproval
      } = req.body;

      const ruleId = await rulesEngine.createRule(
        {
          name,
          connectorId,
          ruleType,
          priority,
          conditionJson: condition,
          actionJson: actions,
          isActive,
          requiresApproval
        },
        req.user.id
      );

      // Audit log
      await pool.query(
        `INSERT INTO integration_audit_log (audit_type, entity_type, entity_id, action, actor_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ['rule', 'integration_rule', ruleId, 'created', req.user.id]
      );

      res.status(201).json({
        success: true,
        data: { id: ruleId }
      });
    } catch (error) {
      logger.error('Error creating rule', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to create rule'
      });
    }
  });

  // Update rule
  router.patch('/rules/:id', authenticate, authorize('integration-rule:manage'), async (req, res) => {
    try {
      const { id } = req.params;
      const { name, priority, condition, actions, isActive } = req.body;

      await rulesEngine.updateRule(
        id,
        {
          name,
          priority,
          conditionJson: condition,
          actionJson: actions,
          isActive
        },
        req.user.id
      );

      // Audit log
      await pool.query(
        `INSERT INTO integration_audit_log (audit_type, entity_type, entity_id, action, actor_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ['rule', 'integration_rule', id, 'updated', req.user.id]
      );

      res.json({
        success: true,
        message: 'Rule updated successfully'
      });
    } catch (error) {
      logger.error('Error updating rule', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to update rule'
      });
    }
  });

  // Approve rule
  router.post('/rules/:id/approve', authenticate, authorize('integration-rule:approve'), async (req, res) => {
    try {
      const { id } = req.params;

      await pool.query(
        `UPDATE integration_rules 
         SET approved_by = $1, approved_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [req.user.id, id]
      );

      // Audit log
      await pool.query(
        `INSERT INTO integration_audit_log (audit_type, entity_type, entity_id, action, actor_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ['rule', 'integration_rule', id, 'approved', req.user.id]
      );

      res.json({
        success: true,
        message: 'Rule approved successfully'
      });
    } catch (error) {
      logger.error('Error approving rule', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to approve rule'
      });
    }
  });

  // Delete rule
  router.delete('/rules/:id', authenticate, authorize('integration-rule:manage'), async (req, res) => {
    try {
      const { id } = req.params;

      await pool.query(`DELETE FROM integration_rules WHERE id = $1`, [id]);

      // Clear cache
      rulesEngine.clearCache();

      // Audit log
      await pool.query(
        `INSERT INTO integration_audit_log (audit_type, entity_type, entity_id, action, actor_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ['rule', 'integration_rule', id, 'deleted', req.user.id]
      );

      res.json({
        success: true,
        message: 'Rule deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting rule', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to delete rule'
      });
    }
  });

  return router;
}
