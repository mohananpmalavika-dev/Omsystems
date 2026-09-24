/**
 * Guardian Network API Routes
 * 
 * REST API for cross-location intelligence features:
 * - Pattern sharing controls
 * - Threat intelligence queries
 * - Benchmark metrics
 * - Real-time alerts
 * - Network statistics
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { GuardianNetworkService } from '../services/guardian-network.service';
import type {
  ThreatDatabaseQuery,
  IndustryVertical,
  ThreatCategory,
  GuardianNetworkConfig,
} from '../guardian-network.types';
import { validateRequest, requirePermissions } from '../../middleware/auth.middleware';
import { z } from 'zod';

const router = Router();

// Schema validations
const ShareIncidentSchema = z.object({
  incidentId: z.string(),
  category: z.string(),
  severity: z.enum(['P1', 'P2', 'P3', 'P4', 'P5']),
  detectionType: z.string(),
  occurredAt: z.string().datetime(),
  aiCapabilities: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  metadata: z.record(z.any()).optional(),
  outcome: z.enum(['prevented', 'detected-during', 'detected-after', 'unknown']),
});

const QueryPatternsSchema = z.object({
  categories: z.array(z.string()).optional(),
  industries: z.array(z.string()).optional(),
  severities: z.array(z.string()).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.number().min(1).max(1000).optional(),
  offset: z.number().min(0).optional(),
  sortBy: z.enum(['relevance', 'recency', 'frequency', 'severity']).optional(),
});

const BenchmarkPeriodSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

// Middleware to inject GuardianNetworkService
let guardianNetworkService: GuardianNetworkService | null = null;

export function initializeGuardianNetworkRoutes(config: GuardianNetworkConfig): Router {
  if (config.enabled) {
    guardianNetworkService = new GuardianNetworkService(config);
    console.log('[GuardianNetwork] Routes initialized');
  }
  return router;
}

// ============================================================================
// Pattern Sharing Endpoints
// ============================================================================

/**
 * POST /api/v1/guardian-network/share-incident
 * Share a verified incident with the network
 */
router.post(
  '/share-incident',
  requirePermissions('guardian-network:write'),
  validateRequest(ShareIncidentSchema),
  async (req: Request, res: Response) => {
    if (!guardianNetworkService) {
      return res.status(503).json({ error: 'Guardian Network is not enabled' });
    }
    
    try {
      const incident = req.body;
      
      // Convert to LocalIncident format
      const localIncident = {
        id: incident.incidentId,
        tenantId: req.user!.tenantId,
        branchId: req.user!.branchId || 'unknown',
        detectionType: incident.detectionType,
        severity: incident.severity,
        category: incident.category,
        occurredAt: new Date(incident.occurredAt),
        detectedAt: new Date(incident.occurredAt),
        cameraId: incident.metadata?.cameraId || 'unknown',
        cameraName: incident.metadata?.cameraName || 'unknown',
        zone: incident.metadata?.zone,
        metadata: incident.metadata,
        aiCapabilities: incident.aiCapabilities,
        confidence: incident.confidence,
        responseTime: incident.metadata?.responseTime,
        outcome: incident.outcome,
        industryVertical: req.tenant?.industryVertical || 'corporate',
        facilityType: req.branch?.facilityType || 'facility',
      };
      
      const result = await guardianNetworkService.shareIncident(localIncident);
      
      if (result.success) {
        res.json({
          success: true,
          patternId: result.patternId,
          message: 'Incident shared successfully with Guardian Network',
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('[GuardianNetwork] Share incident error:', error);
      res.status(500).json({
        error: 'Failed to share incident',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/v1/guardian-network/share-batch
 * Share multiple incidents in batch
 */
router.post(
  '/share-batch',
  requirePermissions('guardian-network:write'),
  async (req: Request, res: Response) => {
    if (!guardianNetworkService) {
      return res.status(503).json({ error: 'Guardian Network is not enabled' });
    }
    
    try {
      const { incidents } = req.body;
      
      if (!Array.isArray(incidents) || incidents.length === 0) {
        return res.status(400).json({ error: 'incidents array is required' });
      }
      
      // Convert all incidents
      const localIncidents = incidents.map((incident: any) => ({
        id: incident.incidentId,
        tenantId: req.user!.tenantId,
        branchId: req.user!.branchId || 'unknown',
        detectionType: incident.detectionType,
        severity: incident.severity,
        category: incident.category,
        occurredAt: new Date(incident.occurredAt),
        detectedAt: new Date(incident.occurredAt),
        cameraId: incident.metadata?.cameraId || 'unknown',
        cameraName: incident.metadata?.cameraName || 'unknown',
        metadata: incident.metadata,
        aiCapabilities: incident.aiCapabilities || [],
        confidence: incident.confidence,
        outcome: incident.outcome,
        industryVertical: req.tenant?.industryVertical || 'corporate',
        facilityType: req.branch?.facilityType || 'facility',
      }));
      
      const result = await guardianNetworkService.shareIncidentBatch(localIncidents);
      
      res.json({
        successful: result.successful,
        failed: result.failed,
        errors: result.errors,
        message: `Shared ${result.successful} incidents, ${result.failed} failed`,
      });
    } catch (error) {
      console.error('[GuardianNetwork] Batch share error:', error);
      res.status(500).json({
        error: 'Failed to share incidents',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// ============================================================================
// Pattern Query Endpoints
// ============================================================================

/**
 * POST /api/v1/guardian-network/query-patterns
 * Query the global threat database
 */
router.post(
  '/query-patterns',
  requirePermissions('guardian-network:read'),
  validateRequest(QueryPatternsSchema),
  async (req: Request, res: Response) => {
    if (!guardianNetworkService) {
      return res.status(503).json({ error: 'Guardian Network is not enabled' });
    }
    
    try {
      const query: ThreatDatabaseQuery = {
        categories: req.body.categories as ThreatCategory[],
        industries: req.body.industries as IndustryVertical[],
        severities: req.body.severities,
        from: req.body.from ? new Date(req.body.from) : undefined,
        to: req.body.to ? new Date(req.body.to) : undefined,
        limit: req.body.limit,
        offset: req.body.offset,
        sortBy: req.body.sortBy,
      };
      
      const patterns = await guardianNetworkService.queryThreatDatabase(query);
      
      res.json({
        patterns,
        count: patterns.length,
        query,
      });
    } catch (error) {
      console.error('[GuardianNetwork] Query patterns error:', error);
      res.status(500).json({
        error: 'Failed to query patterns',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/v1/guardian-network/match-incident
 * Match a local incident against known patterns
 */
router.post(
  '/match-incident',
  requirePermissions('guardian-network:read'),
  async (req: Request, res: Response) => {
    if (!guardianNetworkService) {
      return res.status(503).json({ error: 'Guardian Network is not enabled' });
    }
    
    try {
      const incident = req.body;
      
      const localIncident = {
        id: incident.incidentId,
        tenantId: req.user!.tenantId,
        branchId: req.user!.branchId || 'unknown',
        detectionType: incident.detectionType,
        severity: incident.severity,
        category: incident.category,
        occurredAt: new Date(incident.occurredAt),
        detectedAt: new Date(incident.occurredAt),
        cameraId: incident.metadata?.cameraId || 'unknown',
        cameraName: incident.metadata?.cameraName || 'unknown',
        metadata: incident.metadata,
        aiCapabilities: incident.aiCapabilities || [],
        confidence: incident.confidence,
        outcome: incident.outcome || 'unknown',
        industryVertical: req.tenant?.industryVertical || 'corporate',
        facilityType: req.branch?.facilityType || 'facility',
      };
      
      const match = await guardianNetworkService.matchIncidentToPatterns(localIncident);
      
      if (match) {
        res.json({
          matched: true,
          ...match,
        });
      } else {
        res.json({
          matched: false,
          message: 'No matching patterns found in global database',
        });
      }
    } catch (error) {
      console.error('[GuardianNetwork] Match incident error:', error);
      res.status(500).json({
        error: 'Failed to match incident',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// ============================================================================
// Benchmark Endpoints
// ============================================================================

/**
 * POST /api/v1/guardian-network/benchmarks
 * Get benchmark metrics for your deployment
 */
router.post(
  '/benchmarks',
  requirePermissions('guardian-network:read'),
  validateRequest(BenchmarkPeriodSchema),
  async (req: Request, res: Response) => {
    if (!guardianNetworkService) {
      return res.status(503).json({ error: 'Guardian Network is not enabled' });
    }
    
    try {
      const period = {
        startDate: new Date(req.body.startDate),
        endDate: new Date(req.body.endDate),
      };
      
      const benchmarks = await guardianNetworkService.getBenchmarkMetrics(period);
      
      if (benchmarks) {
        res.json(benchmarks);
      } else {
        res.status(503).json({
          error: 'Benchmark data unavailable',
          message: 'Ensure benchmark sharing is enabled in your Guardian Network configuration',
        });
      }
    } catch (error) {
      console.error('[GuardianNetwork] Benchmarks error:', error);
      res.status(500).json({
        error: 'Failed to retrieve benchmarks',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// ============================================================================
// Industry Intelligence Endpoints
// ============================================================================

/**
 * GET /api/v1/guardian-network/intelligence/:vertical
 * Get latest industry intelligence report
 */
router.get(
  '/intelligence/:vertical',
  requirePermissions('guardian-network:read'),
  async (req: Request, res: Response) => {
    if (!guardianNetworkService) {
      return res.status(503).json({ error: 'Guardian Network is not enabled' });
    }
    
    try {
      const vertical = req.params.vertical as IndustryVertical;
      const report = await guardianNetworkService.getIndustryIntelligence(vertical);
      
      if (report) {
        res.json(report);
      } else {
        res.status(404).json({
          error: 'Intelligence report not available',
          vertical,
        });
      }
    } catch (error) {
      console.error('[GuardianNetwork] Intelligence error:', error);
      res.status(500).json({
        error: 'Failed to retrieve intelligence',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/v1/guardian-network/alerts/:alertId/acknowledge
 * Acknowledge a threat alert
 */
router.post(
  '/alerts/:alertId/acknowledge',
  requirePermissions('guardian-network:write'),
  async (req: Request, res: Response) => {
    if (!guardianNetworkService) {
      return res.status(503).json({ error: 'Guardian Network is not enabled' });
    }
    
    try {
      const { alertId } = req.params;
      const success = await guardianNetworkService.acknowledgeThreatAlert(alertId);
      
      if (success) {
        res.json({
          success: true,
          message: 'Alert acknowledged',
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Failed to acknowledge alert',
        });
      }
    } catch (error) {
      console.error('[GuardianNetwork] Acknowledge alert error:', error);
      res.status(500).json({
        error: 'Failed to acknowledge alert',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// ============================================================================
// Statistics & Monitoring Endpoints
// ============================================================================

/**
 * GET /api/v1/guardian-network/statistics
 * Get network statistics and sync status
 */
router.get(
  '/statistics',
  requirePermissions('guardian-network:read'),
  async (req: Request, res: Response) => {
    if (!guardianNetworkService) {
      return res.status(503).json({ error: 'Guardian Network is not enabled' });
    }
    
    try {
      const stats = await guardianNetworkService.getNetworkStatistics();
      res.json(stats);
    } catch (error) {
      console.error('[GuardianNetwork] Statistics error:', error);
      res.status(500).json({
        error: 'Failed to retrieve statistics',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/v1/guardian-network/health
 * Health check endpoint
 */
router.get('/health', async (req: Request, res: Response) => {
  res.json({
    status: guardianNetworkService ? 'enabled' : 'disabled',
    timestamp: new Date().toISOString(),
  });
});

export default router;
