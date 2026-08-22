/**
 * Face Recognition Event Routes
 * REST endpoints for face recognition events and matches
 */

import { Router } from 'express';
import { z } from 'zod';
import type { Pool } from 'pg';
import { authenticateJWT } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { checkPermission } from '../middleware/permissions.js';

const router = Router();

// Validation schemas
const searchEventsSchema = z.object({
  watchlistId: z.string().uuid().optional(),
  personId: z.string().uuid().optional(),
  cameraId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  minSimilarity: z.number().min(0).max(1).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
});

const reviewMatchSchema = z.object({
  decision: z.enum(['confirmed', 'rejected', 'unsure']),
  notes: z.string().optional(),
});

// Apply authentication to all routes
router.use(authenticateJWT);

/**
 * GET /api/face-recognition/events
 * Search face recognition events
 */
router.get(
  '/events',
  checkPermission('face:view'),
  async (req, res, next) => {
    try {
      const db = req.app.locals.db as Pool;
      const tenantId = req.user!.tenantId;

      const filters: any = { tenantId };
      const params: any[] = [tenantId];
      let paramIndex = 2;
      let whereClauses = ['tenant_id = $1'];

      if (req.query.watchlistId) {
        whereClauses.push(`watchlist_id = $${paramIndex}`);
        params.push(req.query.watchlistId);
        paramIndex++;
      }

      if (req.query.personId) {
        whereClauses.push(`person_id = $${paramIndex}`);
        params.push(req.query.personId);
        paramIndex++;
      }

      if (req.query.cameraId) {
        whereClauses.push(`camera_id = $${paramIndex}`);
        params.push(req.query.cameraId);
        paramIndex++;
      }

      if (req.query.startDate) {
        whereClauses.push(`occurred_at >= $${paramIndex}`);
        params.push(req.query.startDate);
        paramIndex++;
      }

      if (req.query.endDate) {
        whereClauses.push(`occurred_at <= $${paramIndex}`);
        params.push(req.query.endDate);
        paramIndex++;
      }

      if (req.query.minSimilarity) {
        whereClauses.push(`similarity_score >= $${paramIndex}`);
        params.push(req.query.minSimilarity);
        paramIndex++;
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      const sql = `
        SELECT
          fre.*,
          fp.full_name as person_name,
          fw.name as watchlist_name,
          c.name as camera_name
        FROM face_recognition_events fre
        LEFT JOIN face_watchlist_persons fp ON fp.id = fre.person_id
        LEFT JOIN face_watchlists fw ON fw.id = fre.watchlist_id
        LEFT JOIN cameras c ON c.id = fre.camera_id
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY occurred_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limit, offset);

      const result = await db.query(sql, params);

      // Get total count
      const countSql = `
        SELECT COUNT(*) as total
        FROM face_recognition_events
        WHERE ${whereClauses.join(' AND ')}
      `;

      const countResult = await db.query(countSql, params.slice(0, params.length - 2));

      res.json({
        events: result.rows,
        total: parseInt(countResult.rows[0].total),
        limit,
        offset,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/face-recognition/events/:eventId
 * Get event details
 */
router.get(
  '/events/:eventId',
  checkPermission('face:view'),
  async (req, res, next) => {
    try {
      const db = req.app.locals.db as Pool;
      const tenantId = req.user!.tenantId;
      const { eventId } = req.params;

      const result = await db.query(
        `
        SELECT
          fre.*,
          fp.full_name as person_name,
          fp.external_id as person_external_id,
          fw.name as watchlist_name,
          fw.list_type as watchlist_type,
          c.name as camera_name,
          b.name as branch_name
        FROM face_recognition_events fre
        LEFT JOIN face_watchlist_persons fp ON fp.id = fre.person_id
        LEFT JOIN face_watchlists fw ON fw.id = fre.watchlist_id
        LEFT JOIN cameras c ON c.id = fre.camera_id
        LEFT JOIN branches b ON b.id = c.branch_id
        WHERE fre.id = $1 AND fre.tenant_id = $2
      `,
        [eventId, tenantId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Event not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/face-recognition/events/:eventId/review
 * Review a face match
 */
router.post(
  '/events/:eventId/review',
  checkPermission('face:view'),
  validateRequest(reviewMatchSchema),
  async (req, res, next) => {
    try {
      const db = req.app.locals.db as Pool;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const { eventId } = req.params;

      // Verify event exists and belongs to tenant
      const eventResult = await db.query(
        `SELECT id, tenant_id FROM face_recognition_events WHERE id = $1 AND tenant_id = $2`,
        [eventId, tenantId],
      );

      if (eventResult.rows.length === 0) {
        return res.status(404).json({ error: 'Event not found' });
      }

      // Create review
      const reviewResult = await db.query(
        `
        INSERT INTO face_match_reviews (
          tenant_id, recognition_event_id, reviewer_id, decision, notes
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
        [tenantId, eventId, userId, req.body.decision, req.body.notes || null],
      );

      res.status(201).json(reviewResult.rows[0]);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/face-recognition/events/:eventId/reviews
 * Get reviews for an event
 */
router.get(
  '/events/:eventId/reviews',
  checkPermission('face:view'),
  async (req, res, next) => {
    try {
      const db = req.app.locals.db as Pool;
      const tenantId = req.user!.tenantId;
      const { eventId } = req.params;

      const result = await db.query(
        `
        SELECT
          fmr.*,
          u.name as reviewer_name,
          u.email as reviewer_email
        FROM face_match_reviews fmr
        JOIN users u ON u.id = fmr.reviewer_id
        WHERE fmr.recognition_event_id = $1 AND fmr.tenant_id = $2
        ORDER BY fmr.reviewed_at DESC
      `,
        [eventId, tenantId],
      );

      res.json(result.rows);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/face-recognition/tracks
 * Get active face tracks
 */
router.get(
  '/tracks',
  checkPermission('face:view'),
  async (req, res, next) => {
    try {
      const db = req.app.locals.db as Pool;
      const tenantId = req.user!.tenantId;

      const cameraId = req.query.cameraId;
      const status = req.query.status || 'tracking';

      let sql = `
        SELECT
          ft.*,
          fp.full_name as person_name,
          fw.name as watchlist_name,
          c.name as camera_name
        FROM face_tracks ft
        LEFT JOIN face_watchlist_persons fp ON fp.id = ft.person_id
        LEFT JOIN face_watchlists fw ON fw.id = ft.watchlist_id
        LEFT JOIN cameras c ON c.id = ft.camera_id
        WHERE ft.tenant_id = $1
      `;
      const params: any[] = [tenantId];
      let paramIndex = 2;

      if (cameraId) {
        sql += ` AND ft.camera_id = $${paramIndex}`;
        params.push(cameraId);
        paramIndex++;
      }

      if (status) {
        sql += ` AND ft.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      sql += ` ORDER BY ft.last_seen_at DESC LIMIT 100`;

      const result = await db.query(sql, params);

      res.json(result.rows);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/face-recognition/analytics
 * Get face recognition analytics
 */
router.get(
  '/analytics',
  checkPermission('face:view'),
  async (req, res, next) => {
    try {
      const db = req.app.locals.db as Pool;
      const tenantId = req.user!.tenantId;

      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      // Get match counts by watchlist
      const matchesByWatchlist = await db.query(
        `
        SELECT
          fw.id,
          fw.name,
          fw.list_type,
          COUNT(fre.id) as match_count
        FROM face_watchlists fw
        LEFT JOIN face_recognition_events fre
          ON fre.watchlist_id = fw.id
          AND fre.tenant_id = fw.tenant_id
          ${startDate ? 'AND fre.occurred_at >= $2' : ''}
          ${endDate ? `AND fre.occurred_at <= $${startDate ? 3 : 2}` : ''}
        WHERE fw.tenant_id = $1
          AND fw.archived_at IS NULL
        GROUP BY fw.id, fw.name, fw.list_type
        ORDER BY match_count DESC
      `,
        [tenantId, startDate, endDate].filter(Boolean),
      );

      // Get top matched persons
      const topMatches = await db.query(
        `
        SELECT
          fp.id,
          fp.full_name,
          fw.name as watchlist_name,
          COUNT(fre.id) as match_count,
          MAX(fre.occurred_at) as last_seen
        FROM face_recognition_events fre
        JOIN face_watchlist_persons fp ON fp.id = fre.person_id
        JOIN face_watchlists fw ON fw.id = fp.watchlist_id
        WHERE fre.tenant_id = $1
          ${startDate ? 'AND fre.occurred_at >= $2' : ''}
          ${endDate ? `AND fre.occurred_at <= $${startDate ? 3 : 2}` : ''}
        GROUP BY fp.id, fp.full_name, fw.name
        ORDER BY match_count DESC
        LIMIT 10
      `,
        [tenantId, startDate, endDate].filter(Boolean),
      );

      // Get matches by hour
      const matchesByHour = await db.query(
        `
        SELECT
          DATE_TRUNC('hour', occurred_at) as hour,
          COUNT(*) as match_count
        FROM face_recognition_events
        WHERE tenant_id = $1
          ${startDate ? 'AND occurred_at >= $2' : ''}
          ${endDate ? `AND occurred_at <= $${startDate ? 3 : 2}` : ''}
        GROUP BY DATE_TRUNC('hour', occurred_at)
        ORDER BY hour DESC
        LIMIT 168
      `,
        [tenantId, startDate, endDate].filter(Boolean),
      );

      res.json({
        matchesByWatchlist: matchesByWatchlist.rows,
        topMatches: topMatches.rows,
        matchesByHour: matchesByHour.rows,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
