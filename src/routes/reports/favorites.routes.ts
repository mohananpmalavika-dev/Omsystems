/**
 * Report Favorites API Routes
 * 
 * Enables users to save, manage, and quickly access their favorite reports.
 * Integrates with migration 006 (report_favorites schema).
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { auditFavoriteAction } from '../../middleware/audit-logger.middleware.js';

export function createFavoritesRoutes(pool: Pool): Router {
  const router = Router();

  // ============================================================================
  // FAVORITES MANAGEMENT
  // ============================================================================

  /**
   * GET /api/control/v1/reports/favorites
   * 
   * Get user's saved favorite reports
   */
  router.get('/favorites', authenticateToken, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      const result = await pool.query(
        'SELECT * FROM get_user_favorites($1)',
        [userId]
      );

      res.json({
        success: true,
        favorites: result.rows,
        total: result.rows.length
      });
    } catch (error) {
      console.error('[Favorites] Error fetching favorites:', error);
      res.status(500).json({
        error: 'Failed to fetch favorites',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/control/v1/reports/favorites
   * 
   * Add a report to favorites
   * 
   * Body: {
   *   name: string;
   *   description?: string;
   *   reportType: string;
   *   filters: object;
   * }
   */
  router.post(
    '/favorites',
    authenticateToken,
    auditFavoriteAction('favorites', 'add'),
    async (req: Request, res: Response) => {
      try {
        const userId = req.user?.id;
        if (!userId) {
          return res.status(401).json({ error: 'User ID required' });
        }

        const { name, description, reportType, filters } = req.body;

        // Validation
        if (!name || !reportType) {
          return res.status(400).json({
            error: 'Missing required fields',
            required: ['name', 'reportType']
          });
        }

        if (name.length > 100) {
          return res.status(400).json({ error: 'Name too long (max 100 characters)' });
        }

        // Add to favorites
        const result = await pool.query(
          'SELECT add_to_favorites($1, $2, $3, $4, $5) as id',
          [userId, name, description || null, reportType, JSON.stringify(filters || {})]
        );

        const favoriteId = result.rows[0]?.id;

        res.status(201).json({
          success: true,
          id: favoriteId,
          message: 'Report added to favorites'
        });
      } catch (error: any) {
        console.error('[Favorites] Error adding favorite:', error);
        
        // Handle duplicate name
        if (error.code === '23505') {
          return res.status(409).json({
            error: 'A favorite with this name already exists',
            message: 'Please choose a different name'
          });
        }
        
        // Handle favorites limit
        if (error.message && error.message.includes('Maximum favorites limit')) {
          return res.status(400).json({
            error: 'Favorites limit reached',
            message: error.message
          });
        }

        res.status(500).json({
          error: 'Failed to add favorite',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * PUT /api/control/v1/reports/favorites/:id
   * 
   * Update a favorite report
   */
  router.put('/favorites/:id', authenticateToken, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const favoriteId = req.params.id;

      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      const { name, description, filters, isPinned, sortOrder } = req.body;

      // Build update query dynamically
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        values.push(name);
      }
      if (description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        values.push(description);
      }
      if (filters !== undefined) {
        updates.push(`filters = $${paramIndex++}`);
        values.push(JSON.stringify(filters));
      }
      if (isPinned !== undefined) {
        updates.push(`is_pinned = $${paramIndex++}`);
        values.push(isPinned);
      }
      if (sortOrder !== undefined) {
        updates.push(`sort_order = $${paramIndex++}`);
        values.push(sortOrder);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      // Add WHERE clause params
      values.push(favoriteId, userId);

      const query = `
        UPDATE report_favorites
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
        RETURNING id
      `;

      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Favorite not found or access denied' });
      }

      res.json({
        success: true,
        message: 'Favorite updated successfully'
      });
    } catch (error) {
      console.error('[Favorites] Error updating favorite:', error);
      res.status(500).json({
        error: 'Failed to update favorite',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * DELETE /api/control/v1/reports/favorites/:id
   * 
   * Remove a favorite report
   */
  router.delete(
    '/favorites/:id',
    authenticateToken,
    auditFavoriteAction('favorites', 'remove'),
    async (req: Request, res: Response) => {
      try {
        const userId = req.user?.id;
        const favoriteId = req.params.id;

        if (!userId) {
          return res.status(401).json({ error: 'User ID required' });
        }

        const result = await pool.query(
          'DELETE FROM report_favorites WHERE id = $1 AND user_id = $2 RETURNING id',
          [favoriteId, userId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Favorite not found or access denied' });
        }

        res.json({
          success: true,
          message: 'Favorite removed successfully'
        });
      } catch (error) {
        console.error('[Favorites] Error deleting favorite:', error);
        res.status(500).json({
          error: 'Failed to delete favorite',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * POST /api/control/v1/reports/favorites/:id/use
   * 
   * Mark favorite as used (increment usage counter)
   */
  router.post('/favorites/:id/use', authenticateToken, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const favoriteId = req.params.id;

      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      // Verify ownership before updating
      const verify = await pool.query(
        'SELECT id FROM report_favorites WHERE id = $1 AND user_id = $2',
        [favoriteId, userId]
      );

      if (verify.rows.length === 0) {
        return res.status(404).json({ error: 'Favorite not found or access denied' });
      }

      // Update usage
      await pool.query('SELECT update_favorite_usage($1)', [favoriteId]);

      res.json({
        success: true,
        message: 'Usage updated'
      });
    } catch (error) {
      console.error('[Favorites] Error updating usage:', error);
      res.status(500).json({ error: 'Failed to update usage' });
    }
  });

  // ============================================================================
  // TEMPLATES
  // ============================================================================

  /**
   * GET /api/control/v1/reports/templates
   * 
   * Get available report templates for user's role
   */
  router.get('/templates', authenticateToken, async (req: Request, res: Response) => {
    try {
      const userRole = req.user?.role_name || 'viewer';

      const result = await pool.query(
        'SELECT * FROM get_user_templates($1)',
        [userRole]
      );

      // Group by category
      const byCategory: Record<string, any[]> = {};
      result.rows.forEach(template => {
        const category = template.report_category || 'other';
        if (!byCategory[category]) {
          byCategory[category] = [];
        }
        byCategory[category].push(template);
      });

      res.json({
        success: true,
        templates: result.rows,
        byCategory,
        total: result.rows.length
      });
    } catch (error) {
      console.error('[Favorites] Error fetching templates:', error);
      res.status(500).json({
        error: 'Failed to fetch templates',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/control/v1/reports/templates/featured
   * 
   * Get featured templates
   */
  router.get('/templates/featured', authenticateToken, async (req: Request, res: Response) => {
    try {
      const userRole = req.user?.role_name || 'viewer';

      const result = await pool.query(
        `SELECT * FROM report_templates
         WHERE active = true
           AND featured = true
           AND (allowed_roles IS NULL OR $1 = ANY(allowed_roles))
         ORDER BY usage_count DESC, display_name`,
        [userRole]
      );

      res.json({
        success: true,
        templates: result.rows,
        total: result.rows.length
      });
    } catch (error) {
      console.error('[Favorites] Error fetching featured templates:', error);
      res.status(500).json({ error: 'Failed to fetch featured templates' });
    }
  });

  /**
   * GET /api/control/v1/reports/templates/:id
   * 
   * Get a specific template
   */
  router.get('/templates/:id', authenticateToken, async (req: Request, res: Response) => {
    try {
      const templateId = req.params.id;
      const userRole = req.user?.role_name || 'viewer';

      const result = await pool.query(
        `SELECT * FROM report_templates
         WHERE id = $1
           AND active = true
           AND (allowed_roles IS NULL OR $2 = ANY(allowed_roles))`,
        [templateId, userRole]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Template not found or access denied' });
      }

      res.json({
        success: true,
        template: result.rows[0]
      });
    } catch (error) {
      console.error('[Favorites] Error fetching template:', error);
      res.status(500).json({ error: 'Failed to fetch template' });
    }
  });

  /**
   * POST /api/control/v1/reports/templates/:id/use
   * 
   * Mark template as used (increment usage counter)
   */
  router.post('/templates/:id/use', authenticateToken, async (req: Request, res: Response) => {
    try {
      const templateId = req.params.id;

      await pool.query('SELECT update_template_usage($1)', [templateId]);

      res.json({
        success: true,
        message: 'Template usage updated'
      });
    } catch (error) {
      console.error('[Favorites] Error updating template usage:', error);
      res.status(500).json({ error: 'Failed to update usage' });
    }
  });

  /**
   * POST /api/control/v1/reports/templates/:id/favorite
   * 
   * Create a favorite from a template
   */
  router.post('/templates/:id/favorite', authenticateToken, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const templateId = req.params.id;
      const { name } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      // Get template
      const templateResult = await pool.query(
        'SELECT * FROM report_templates WHERE id = $1 AND active = true',
        [templateId]
      );

      if (templateResult.rows.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const template = templateResult.rows[0];

      // Create favorite from template
      const favoriteName = name || template.display_name;
      const result = await pool.query(
        'SELECT add_to_favorites($1, $2, $3, $4, $5) as id',
        [
          userId,
          favoriteName,
          template.description,
          template.report_type,
          JSON.stringify(template.filters)
        ]
      );

      // Update template usage
      await pool.query('SELECT update_template_usage($1)', [templateId]);

      res.status(201).json({
        success: true,
        id: result.rows[0]?.id,
        message: 'Favorite created from template'
      });
    } catch (error: any) {
      console.error('[Favorites] Error creating favorite from template:', error);
      
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'A favorite with this name already exists'
        });
      }

      res.status(500).json({
        error: 'Failed to create favorite from template',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * GET /api/control/v1/reports/favorites/stats
   * 
   * Get user's favorite statistics
   */
  router.get('/favorites/stats', authenticateToken, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
      }

      const result = await pool.query(
        'SELECT * FROM v_user_favorite_stats WHERE user_id = $1',
        [userId]
      );

      const stats = result.rows[0] || {
        total_favorites: 0,
        total_uses: 0,
        last_activity: null,
        pinned_count: 0
      };

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('[Favorites] Error fetching stats:', error);
      res.status(500).json({ error: 'Failed to fetch statistics' });
    }
  });

  /**
   * GET /api/control/v1/reports/favorites/popular
   * 
   * Get most popular favorites (admin only)
   */
  router.get('/favorites/popular', authenticateToken, async (req: Request, res: Response) => {
    try {
      // Note: Should add RBAC check for admin role
      const result = await pool.query('SELECT * FROM v_popular_favorites LIMIT 20', []);

      res.json({
        success: true,
        popular: result.rows
      });
    } catch (error) {
      console.error('[Favorites] Error fetching popular favorites:', error);
      res.status(500).json({ error: 'Failed to fetch popular favorites' });
    }
  });

  return router;
}
