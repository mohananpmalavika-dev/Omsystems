/**
 * Face Watchlist API Routes
 * REST endpoints for face recognition watchlist management
 */

import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { FaceWatchlistService } from '../services/face-watchlist.service.js';
import { authenticateJWT } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { checkPermission } from '../middleware/permissions.js';

// Type declaration for Express.Multer namespace
declare global {
  namespace Express {
    namespace Multer {
      interface File {
        fieldname: string;
        originalname: string;
        encoding: string;
        mimetype: string;
        size: number;
        buffer: Buffer;
      }
    }
  }
}

const router = Router();

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 10,
  },
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'));
    }
  },
});

// Validation schemas
const createWatchlistSchema = z.object({
  name: z.string().min(2).max(160),
  description: z.string().optional(),
  listType: z.enum(['security', 'vip', 'staff', 'blacklist', 'missing-person']),
  enabled: z.boolean().optional(),
  alertOnMatch: z.boolean().optional(),
  alertSeverity: z.enum(['P1', 'P2', 'P3', 'P4', 'P5']).optional(),
  matchThreshold: z.number().min(0.4).max(0.95).optional(),
  reviewThreshold: z.number().min(0.3).max(0.9).optional(),
  minimumMargin: z.number().min(0.01).max(0.3).optional(),
  minimumQuality: z.number().min(0.3).max(0.95).optional(),
  temporalConfirmationFrames: z.number().int().min(1).max(20).optional(),
  temporalWindowSeconds: z.number().int().min(1).max(30).optional(),
});

const updateWatchlistSchema = createWatchlistSchema.partial();

const enrollPersonSchema = z.object({
  fullName: z.string().min(1).max(255),
  externalId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updatePersonSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  externalId: z.string().optional(),
  notes: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Apply authentication to all routes
router.use(authenticateJWT);

/**
 * GET /api/face-watchlists
 * List watchlists
 */
router.get(
  '/',
  checkPermission('face:view'),
  async (req, res, next) => {
    try {
      const service = req.app.locals.faceWatchlistService as FaceWatchlistService;
      const tenantId = req.user!.tenantId;

      const result = await service.listWatchlists(tenantId, {
        listType: req.query.listType as string | undefined,
        enabled: req.query.enabled === 'true' ? true : req.query.enabled === 'false' ? false : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/face-watchlists
 * Create watchlist
 */
router.post(
  '/',
  checkPermission('face:manage-watchlist'),
  validateRequest(createWatchlistSchema),
  async (req, res, next) => {
    try {
      const service = req.app.locals.faceWatchlistService as FaceWatchlistService;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const watchlist = await service.createWatchlist({
        tenantId,
        ...req.body,
        createdBy: userId,
      });

      res.status(201).json(watchlist);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/face-watchlists/:watchlistId
 * Get watchlist details
 */
router.get(
  '/:watchlistId',
  checkPermission('face:view'),
  async (req, res, next) => {
    try {
      const service = req.app.locals.faceWatchlistService as FaceWatchlistService;
      const tenantId = req.user!.tenantId;
      const { watchlistId } = req.params;

      const watchlist = await service.getWatchlist(tenantId, watchlistId);

      if (!watchlist) {
        return res.status(404).json({ error: 'Watchlist not found' });
      }

      res.json(watchlist);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PATCH /api/face-watchlists/:watchlistId
 * Update watchlist
 */
router.patch(
  '/:watchlistId',
  checkPermission('face:manage-watchlist'),
  validateRequest(updateWatchlistSchema),
  async (req, res, next) => {
    try {
      const service = req.app.locals.faceWatchlistService as FaceWatchlistService;
      const tenantId = req.user!.tenantId;
      const { watchlistId } = req.params;

      const watchlist = await service.updateWatchlist(tenantId, watchlistId, req.body);

      res.json(watchlist);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /api/face-watchlists/:watchlistId
 * Delete watchlist
 */
router.delete(
  '/:watchlistId',
  checkPermission('face:manage-watchlist'),
  async (req, res, next) => {
    try {
      const service = req.app.locals.faceWatchlistService as FaceWatchlistService;
      const tenantId = req.user!.tenantId;
      const { watchlistId } = req.params;

      await service.deleteWatchlist(tenantId, watchlistId);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/face-watchlists/:watchlistId/stats
 * Get watchlist statistics
 */
router.get(
  '/:watchlistId/stats',
  checkPermission('face:view'),
  async (req, res, next) => {
    try {
      const service = req.app.locals.faceWatchlistService as FaceWatchlistService;
      const tenantId = req.user!.tenantId;
      const { watchlistId } = req.params;

      const stats = await service.getWatchlistStats(tenantId, watchlistId);

      res.json(stats);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/face-watchlists/:watchlistId/persons
 * List persons in watchlist
 */
router.get(
  '/:watchlistId/persons',
  checkPermission('face:view'),
  async (req, res, next) => {
    try {
      const service = req.app.locals.faceWatchlistService as FaceWatchlistService;
      const tenantId = req.user!.tenantId;
      const { watchlistId } = req.params;

      const result = await service.listPersons(tenantId, watchlistId, {
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
        search: req.query.search as string | undefined,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/face-watchlists/:watchlistId/persons
 * Enroll person in watchlist
 */
router.post(
  '/:watchlistId/persons',
  checkPermission('face:enrol'),
  upload.array('images', 10),
  validateRequest(enrollPersonSchema),
  async (req, res, next) => {
    try {
      const service = req.app.locals.faceWatchlistService as FaceWatchlistService;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const { watchlistId } = req.params;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'At least one image is required' });
      }

      const images = files.map((file) => file.buffer);

      const result = await service.enrollPerson({
        tenantId,
        watchlistId,
        fullName: req.body.fullName,
        externalId: req.body.externalId,
        images,
        metadata: req.body.metadata,
        actorId: userId,
      });

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/face-watchlists/:watchlistId/persons/:personId
 * Get person details
 */
router.get(
  '/:watchlistId/persons/:personId',
  checkPermission('face:view'),
  async (req, res, next) => {
    try {
      const service = req.app.locals.faceWatchlistService as FaceWatchlistService;
      const tenantId = req.user!.tenantId;
      const { personId } = req.params;

      const person = await service.getPerson(tenantId, personId);

      if (!person) {
        return res.status(404).json({ error: 'Person not found' });
      }

      res.json(person);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PATCH /api/face-watchlists/:watchlistId/persons/:personId
 * Update person
 */
router.patch(
  '/:watchlistId/persons/:personId',
  checkPermission('face:enrol'),
  validateRequest(updatePersonSchema),
  async (req, res, next) => {
    try {
      const service = req.app.locals.faceWatchlistService as FaceWatchlistService;
      const tenantId = req.user!.tenantId;
      const { personId } = req.params;

      const person = await service.updatePerson(tenantId, personId, req.body);

      res.json(person);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /api/face-watchlists/:watchlistId/persons/:personId
 * Remove person from watchlist
 */
router.delete(
  '/:watchlistId/persons/:personId',
  checkPermission('face:enrol'),
  async (req, res, next) => {
    try {
      const service = req.app.locals.faceWatchlistService as FaceWatchlistService;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const { personId } = req.params;

      await service.removePerson(tenantId, personId, userId);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/face-watchlists/:watchlistId/persons/:personId/images
 * Add additional images to person
 */
router.post(
  '/:watchlistId/persons/:personId/images',
  checkPermission('face:enrol'),
  upload.array('images', 10),
  async (req, res, next) => {
    try {
      const service = req.app.locals.faceWatchlistService as FaceWatchlistService;
      const enrollmentService = req.app.locals.faceEnrollmentService;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const { personId } = req.params;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'At least one image is required' });
      }

      const images = files.map((file) => file.buffer);

      const result = await enrollmentService.addPersonImages(
        tenantId,
        personId,
        images,
        userId,
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
