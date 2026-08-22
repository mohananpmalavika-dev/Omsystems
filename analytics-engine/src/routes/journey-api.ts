/**
 * Journey API Routes
 * 
 * REST endpoints for cross-camera journey tracking:
 * - Query person journeys
 * - Search by image
 * - Manage topology
 * - Session management
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { JourneyService } from '../journey/journey.service.js';
import { TopologyService } from '../journey/topology.service.js';
import { Logger } from '../core/logger.js';

const router = Router();
const logger = Logger.getInstance();

/**
 * Middleware to validate request and extract tenant context
 */
function validateRequest(req: Request, res: Response, next: Function) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // Extract tenant from auth context (assuming middleware sets req.user)
  if (!(req as any).user?.tenantId) {
    return res.status(401).json({ error: 'Tenant context required' });
  }

  next();
}

/**
 * GET /v1/journey/persons/:globalPersonId
 * Get complete journey for a person
 */
router.get(
  '/persons/:globalPersonId',
  [
    param('globalPersonId').isString().notEmpty(),
    query('branchId').optional().isString(),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
    query('minConfidence').optional().isFloat({ min: 0, max: 1 })
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user.tenantId;
      const { globalPersonId } = req.params;
      const { branchId, from, to, minConfidence } = req.query;

      const journeyService: JourneyService = (req as any).services.journeyService;

      const journey = await journeyService.getPersonJourney(
        tenantId,
        globalPersonId,
        {
          branchId: branchId as string | undefined,
          from: from ? new Date(from as string) : undefined,
          to: to ? new Date(to as string) : undefined,
          minConfidence: minConfidence ? parseFloat(minConfidence as string) : undefined
        }
      );

      res.json(journey);
    } catch (error) {
      logger.error('Failed to get person journey', { error, params: req.params });
      res.status(500).json({ error: 'Failed to retrieve journey' });
    }
  }
);

/**
 * POST /v1/journey/search
 * Search for persons by image
 */
router.post(
  '/search',
  [
    body('branchId').optional().isString(),
    body('from').optional().isISO8601(),
    body('to').optional().isISO8601(),
    body('minSimilarity').optional().isFloat({ min: 0, max: 1 }),
    body('limit').optional().isInt({ min: 1, max: 100 })
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user.tenantId;
      const { branchId, from, to, minSimilarity, limit } = req.body;

      // Extract image from multipart form data or base64
      let imageBuffer: Buffer;
      if (req.file) {
        imageBuffer = req.file.buffer;
      } else if (req.body.imageBase64) {
        imageBuffer = Buffer.from(req.body.imageBase64, 'base64');
      } else {
        return res.status(400).json({ error: 'Image required (multipart or base64)' });
      }

      const journeyService: JourneyService = (req as any).services.journeyService;

      const results = await journeyService.searchByImage({
        tenantId,
        branchId,
        imageBuffer,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        minSimilarity: minSimilarity ?? 0.75,
        limit: limit ?? 50
      });

      res.json({
        matchCount: results.length,
        matches: results
      });
    } catch (error) {
      logger.error('Failed to search by image', { error });
      res.status(500).json({ error: 'Search failed' });
    }
  }
);

/**
 * GET /v1/journey/sessions/active
 * Get active journey sessions
 */
router.get(
  '/sessions/active',
  [
    query('branchId').optional().isString()
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user.tenantId;
      const { branchId } = req.query;

      const journeyService: JourneyService = (req as any).services.journeyService;

      const sessions = await journeyService.getActiveSessions(
        tenantId,
        branchId as string | undefined
      );

      res.json({
        sessionCount: sessions.length,
        sessions
      });
    } catch (error) {
      logger.error('Failed to get active sessions', { error });
      res.status(500).json({ error: 'Failed to retrieve sessions' });
    }
  }
);

/**
 * POST /v1/journey/persons/:sourcePersonId/merge/:targetPersonId
 * Merge two global person identities
 */
router.post(
  '/persons/:sourcePersonId/merge/:targetPersonId',
  [
    param('sourcePersonId').isString().notEmpty(),
    param('targetPersonId').isString().notEmpty(),
    body('reason').optional().isString()
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user.tenantId;
      const { sourcePersonId, targetPersonId } = req.params;
      const { reason } = req.body;

      const journeyService: JourneyService = (req as any).services.journeyService;

      await journeyService.mergeGlobalPersons(
        tenantId,
        sourcePersonId,
        targetPersonId,
        reason
      );

      res.json({
        success: true,
        message: `Merged ${sourcePersonId} into ${targetPersonId}`
      });
    } catch (error) {
      logger.error('Failed to merge persons', { error, params: req.params });
      res.status(500).json({ error: 'Merge operation failed' });
    }
  }
);

/**
 * GET /v1/journey/observations/:observationId
 * Get specific observation details
 */
router.get(
  '/observations/:observationId',
  [
    param('observationId').isString().notEmpty()
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user.tenantId;
      const { observationId } = req.params;

      const journeyService: JourneyService = (req as any).services.journeyService;
      const observation = await journeyService['observationRepo'].findById(
        observationId,
        tenantId
      );

      if (!observation) {
        return res.status(404).json({ error: 'Observation not found' });
      }

      res.json(observation);
    } catch (error) {
      logger.error('Failed to get observation', { error, params: req.params });
      res.status(500).json({ error: 'Failed to retrieve observation' });
    }
  }
);

/**
 * GET /v1/journey/topology/transitions
 * Get camera topology transition rules
 */
router.get(
  '/topology/transitions',
  [
    query('branchId').optional().isString(),
    query('fromCameraId').optional().isString(),
    query('toCameraId').optional().isString()
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user.tenantId;
      const { branchId, fromCameraId, toCameraId } = req.query;

      const topologyService: TopologyService = (req as any).services.topologyService;

      const rules = await topologyService.getTransitionRules(
        tenantId,
        branchId as string | undefined
      );

      // Filter if specific cameras requested
      let filteredRules = rules;
      if (fromCameraId) {
        filteredRules = filteredRules.filter(r => r.fromCameraId === fromCameraId);
      }
      if (toCameraId) {
        filteredRules = filteredRules.filter(r => r.toCameraId === toCameraId);
      }

      res.json({
        ruleCount: filteredRules.length,
        rules: filteredRules
      });
    } catch (error) {
      logger.error('Failed to get topology rules', { error });
      res.status(500).json({ error: 'Failed to retrieve topology rules' });
    }
  }
);

/**
 * POST /v1/journey/topology/transitions
 * Create camera topology transition rule
 */
router.post(
  '/topology/transitions',
  [
    body('branchId').optional().isString(),
    body('fromCameraId').isString().notEmpty(),
    body('toCameraId').isString().notEmpty(),
    body('fromZoneId').optional().isString(),
    body('toZoneId').optional().isString(),
    body('minTravelSeconds').isInt({ min: 0 }),
    body('typicalTravelSeconds').optional().isInt({ min: 0 }),
    body('maxTravelSeconds').isInt({ min: 0 }),
    body('probability').optional().isFloat({ min: 0, max: 1 }),
    body('bidirectional').optional().isBoolean()
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user.tenantId;
      const topologyService: TopologyService = (req as any).services.topologyService;

      const rule = await topologyService.createTransitionRule({
        tenantId,
        ...req.body
      });

      res.status(201).json(rule);
    } catch (error) {
      logger.error('Failed to create topology rule', { error });
      res.status(500).json({ error: 'Failed to create rule' });
    }
  }
);

/**
 * GET /v1/journey/topology/reachable
 * Get cameras reachable from a source camera within time window
 */
router.get(
  '/topology/reachable/:cameraId',
  [
    param('cameraId').isString().notEmpty(),
    query('branchId').optional().isString(),
    query('maxTravelSeconds').isInt({ min: 0, max: 3600 })
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user.tenantId;
      const { cameraId } = req.params;
      const { branchId, maxTravelSeconds } = req.query;

      const topologyService: TopologyService = (req as any).services.topologyService;

      const reachable = await topologyService.getReachableCameras(
        tenantId,
        cameraId,
        parseInt(maxTravelSeconds as string),
        branchId as string | undefined
      );

      res.json({
        sourceCameraId: cameraId,
        maxTravelSeconds: parseInt(maxTravelSeconds as string),
        reachableCount: reachable.length,
        reachableCameras: reachable
      });
    } catch (error) {
      logger.error('Failed to get reachable cameras', { error });
      res.status(500).json({ error: 'Failed to calculate reachability' });
    }
  }
);

/**
 * GET /v1/journey/statistics
 * Get journey system statistics
 */
router.get(
  '/statistics',
  [
    query('branchId').optional().isString(),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601()
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user.tenantId;
      const { branchId, from, to } = req.query;

      const journeyService: JourneyService = (req as any).services.journeyService;

      const stats = await journeyService['observationRepo'].getStatistics(
        tenantId,
        branchId as string | undefined,
        from ? new Date(from as string) : undefined,
        to ? new Date(to as string) : undefined
      );

      res.json(stats);
    } catch (error) {
      logger.error('Failed to get statistics', { error });
      res.status(500).json({ error: 'Failed to retrieve statistics' });
    }
  }
);

/**
 * GET /v1/journey/observations/recent
 * Get recent observations
 */
router.get(
  '/observations/recent',
  [
    query('branchId').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 500 })
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user.tenantId;
      const { branchId, limit } = req.query;

      const journeyService: JourneyService = (req as any).services.journeyService;

      const windowMs = 3600000; // 1 hour
      const observations = await journeyService['observationRepo'].findRecent(
        tenantId,
        branchId as string | undefined,
        windowMs
      );

      const limitNum = limit ? parseInt(limit as string) : 100;
      const limited = observations.slice(0, limitNum);

      res.json({
        observationCount: limited.length,
        totalInWindow: observations.length,
        observations: limited
      });
    } catch (error) {
      logger.error('Failed to get recent observations', { error });
      res.status(500).json({ error: 'Failed to retrieve observations' });
    }
  }
);

/**
 * GET /v1/journey/observations/camera/:cameraId
 * Get observations for specific camera
 */
router.get(
  '/observations/camera/:cameraId',
  [
    param('cameraId').isString().notEmpty(),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
    query('limit').optional().isInt({ min: 1, max: 500 })
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user.tenantId;
      const { cameraId } = req.params;
      const { from, to, limit } = req.query;

      const journeyService: JourneyService = (req as any).services.journeyService;

      const observations = await journeyService['observationRepo'].findByCamera(
        tenantId,
        cameraId,
        from ? new Date(from as string) : undefined,
        to ? new Date(to as string) : undefined
      );

      const limitNum = limit ? parseInt(limit as string) : 100;
      const limited = observations.slice(0, limitNum);

      res.json({
        cameraId,
        observationCount: limited.length,
        observations: limited
      });
    } catch (error) {
      logger.error('Failed to get camera observations', { error });
      res.status(500).json({ error: 'Failed to retrieve observations' });
    }
  }
);

/**
 * GET /v1/journey/transitions/:transitionId
 * Get specific transition details
 */
router.get(
  '/transitions/:transitionId',
  [
    param('transitionId').isString().notEmpty()
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user.tenantId;
      const { transitionId } = req.params;

      // Would implement findTransitionById in repository
      res.status(501).json({ error: 'Not yet implemented' });
    } catch (error) {
      logger.error('Failed to get transition', { error });
      res.status(500).json({ error: 'Failed to retrieve transition' });
    }
  }
);

/**
 * GET /v1/journey/health
 * Journey system health check
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Check service availability
    const journeyService: JourneyService = (req as any).services?.journeyService;
    const topologyService: TopologyService = (req as any).services?.topologyService;

    if (!journeyService || !topologyService) {
      return res.status(503).json({
        status: 'unhealthy',
        error: 'Journey services not initialized'
      });
    }

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      components: {
        journeyService: 'ok',
        topologyService: 'ok',
        observationRepo: 'ok',
        identityResolver: 'ok',
        transitionCorrelator: 'ok'
      }
    });
  } catch (error) {
    logger.error('Journey health check failed', { error });
    res.status(503).json({
      status: 'unhealthy',
      error: 'Health check failed'
    });
  }
});

export default router;
