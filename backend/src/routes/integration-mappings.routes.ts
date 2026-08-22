import { Router } from 'express';
import { Pool } from 'pg';
import { authenticate, authorize } from '../middleware/auth';
import { logger } from '../utils/logger';

export function createIntegrationMappingsRoutes(pool: Pool): Router {
  const router = Router();

  // Get mappings
  router.get('/mappings', authenticate, authorize('integration-mapping:view'), async (req, res) => {
    try {
      const { connectorId, mappingType } = req.query;

      let query = `
        SELECT im.*, ic.name as connector_name
        FROM integration_mappings im
        JOIN integration_connectors ic ON ic.id = im.connector_id
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIndex = 1;

      if (connectorId) {
        query += ` AND im.connector_id = $${paramIndex++}`;
        params.push(connectorId);
      }

      if (mappingType) {
        query += ` AND im.mapping_type = $${paramIndex++}`;
        params.push(mappingType);
      }

      query += ` ORDER BY im.created_at DESC`;

      const result = await pool.query(query, params);

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      logger.error('Error fetching mappings', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch mappings'
      });
    }
  });

  // Create mapping
  router.post('/mappings', authenticate, authorize('integration-mapping:manage'), async (req, res) => {
    try {
      const {
        connectorId,
        mappingType,
        externalId,
        internalId,
        internalEntityType,
        additionalMapping
      } = req.body;

      const result = await pool.query(
        `INSERT INTO integration_mappings 
         (connector_id, mapping_type, external_id, internal_id, internal_entity_type,
          additional_mapping_json, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          connectorId,
          mappingType,
          externalId,
          internalId,
          internalEntityType,
          JSON.stringify(additionalMapping || {}),
          req.user.id
        ]
      );

      // Audit log
      await pool.query(
        `INSERT INTO integration_audit_log (audit_type, entity_type, entity_id, action, actor_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ['mapping', 'integration_mapping', result.rows[0].id, 'created', req.user.id]
      );

      res.status(201).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Error creating mapping', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to create mapping'
      });
    }
  });

  // Update mapping
  router.patch('/mappings/:id', authenticate, authorize('integration-mapping:manage'), async (req, res) => {
    try {
      const { id } = req.params;
      const { internalId, isActive, additionalMapping } = req.body;

      const result = await pool.query(
        `UPDATE integration_mappings 
         SET internal_id = COALESCE($1, internal_id),
             is_active = COALESCE($2, is_active),
             additional_mapping_json = COALESCE($3, additional_mapping_json),
             updated_by = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5
         RETURNING *`,
        [
          internalId,
          isActive,
          additionalMapping ? JSON.stringify(additionalMapping) : null,
          req.user.id,
          id
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Mapping not found'
        });
      }

      // Audit log
      await pool.query(
        `INSERT INTO integration_audit_log (audit_type, entity_type, entity_id, action, actor_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ['mapping', 'integration_mapping', id, 'updated', req.user.id]
      );

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Error updating mapping', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to update mapping'
      });
    }
  });

  // Delete mapping
  router.delete('/mappings/:id', authenticate, authorize('integration-mapping:manage'), async (req, res) => {
    try {
      const { id } = req.params;

      await pool.query(`DELETE FROM integration_mappings WHERE id = $1`, [id]);

      // Audit log
      await pool.query(
        `INSERT INTO integration_audit_log (audit_type, entity_type, entity_id, action, actor_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ['mapping', 'integration_mapping', id, 'deleted', req.user.id]
      );

      res.json({
        success: true,
        message: 'Mapping deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting mapping', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to delete mapping'
      });
    }
  });

  return router;
}
