/**
 * Incidents API Routes
 * 
 * Provides access to correlated alert incidents with tenant-scoped
 * persistence, filtering, and cursor pagination.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Pool } from 'pg';
import { getAlertCorrelationService } from '../services/alert-correlation.service.js';
import { getIncidentService } from '../services/incident.service.js';
import { getRedisService } from '../services/redis.service.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { decodeCursor } from '../repositories/incident.repository.js';
import {
  IncidentStatus,
  IncidentSeverity,
  IncidentType,
  IncidentListQuery,
} from '../types/incident.types.js';

// Validation schemas
const incidentListQuerySchema = z.object({
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED', 'CLOSED']).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  type: z.enum([
    'regional_outage',
    'infrastructure_failure',
    'cascade_failure',
    'mass_event',
    'fire_emergency',
    'security_breach',
    'storage_crisis',
    'intrusion',
    'camera_offline',
    'other',
  ]).optional(),
  
  branchId: z.string().uuid().optional(),
  cameraId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional(),
  
  assignedTo: z.string().uuid().optional(),
  unassigned: z.string().transform(val => val === 'true').optional(),
  
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  
  search: z.string().trim().min(1).max(200).optional(),
  
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(2048).optional(),
  
  sort: z.enum(['createdAt', 'updatedAt', 'severity']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const updateIncidentSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED', 'CLOSED']).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
});

const assignIncidentSchema = z.object({
  userId: z.string().uuid(),
});

// Router factory
export function createIncidentsRouter(pool: Pool): Router {
  const router = Router();

  /**
   * GET /api/incidents
   * 
   * List incidents with filtering and pagination
   */
  router.get(
    '/',
    authenticate,
    async (req: Request, res: Response): Promise<void> => {
      try {
        // Validate query parameters
        const queryValidation = incidentListQuerySchema.safeParse(req.query);
        
        if (!queryValidation.success) {
          res.status(400).json({
            success: false,
            error: 'Invalid query parameters',
            details: queryValidation.error.issues,
          });
          return;
        }

        const query = queryValidation.data;

        // Validate date range
        if (query.from && query.to) {
          const fromDate = new Date(query.from);
          const toDate = new Date(query.to);
          
          if (fromDate > toDate) {
            res.status(400).json({
              success: false,
              error: '`from` date cannot be later than `to` date',
            });
            return;
          }
        }

        // Decode cursor if provided
        let cursor = undefined;
        if (query.cursor) {
          cursor = decodeCursor(query.cursor);
          if (!cursor) {
            res.status(400).json({
              success: false,
              error: 'Invalid pagination cursor',
            });
            return;
          }
        }

        // Get tenant from authenticated user
        const tenantId = (req as any).currentUser?.tenantId;
        
        if (!tenantId) {
          res.status(401).json({
            success: false,
            error: 'Tenant context not found',
          });
          return;
        }

        // Get services
        const redisService = await getRedisService();
        const incidentService = getIncidentService(pool, redisService.getClient());

        // Fetch incidents and statistics in parallel
        const [incidentPage, stats] = await Promise.all([
          incidentService.listIncidents({
            tenantId,
            status: query.status,
            severity: query.severity,
            type: query.type,
            branchId: query.branchId,
            cameraId: query.cameraId,
            deviceId: query.deviceId,
            assignedTo: query.assignedTo,
            unassigned: query.unassigned,
            from: query.from ? new Date(query.from) : undefined,
            to: query.to ? new Date(query.to) : undefined,
            search: query.search,
            limit: query.limit,
            cursor,
            sort: query.sort,
            order: query.order,
          }),
          incidentService.getStatistics({ tenantId }),
        ]);

        res.json({
          success: true,
          data: {
            // Statistics (tenant-wide, not filtered)
            activeIncidents: stats.active,
            totalIncidents: stats.total,
            alertsCorrelated: stats.alertsCorrelated,
            
            // Paginated incident list (filtered)
            incidents: incidentPage.incidents,
          },
          pagination: {
            limit: query.limit,
            hasMore: incidentPage.hasMore,
            nextCursor: incidentPage.nextCursor,
          },
        });
      } catch (error) {
        console.error('[IncidentsAPI] Error fetching incidents:', error);
        
        res.status(500).json({
          success: false,
          error: 'Failed to fetch incidents',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  /**
   * GET /api/incidents/stats
   * 
   * Get incident statistics (optionally filtered)
   */
  router.get(
    '/stats',
    authenticate,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const tenantId = (req as any).currentUser?.tenantId;
        
        if (!tenantId) {
          res.status(401).json({
            success: false,
            error: 'Tenant context not found',
          });
          return;
        }

        const redisService = await getRedisService();
        const incidentService = getIncidentService(pool, redisService.getClient());

        // Parse optional filters
        const filters: any = { tenantId };
        
        if (req.query.status) {
          filters.status = req.query.status;
        }
        
        if (req.query.severity) {
          filters.severity = req.query.severity;
        }
        
        if (req.query.branchId) {
          filters.branchId = req.query.branchId;
        }
        
        if (req.query.from) {
          filters.from = new Date(req.query.from as string);
        }
        
        if (req.query.to) {
          filters.to = new Date(req.query.to as string);
        }

        const stats = await incidentService.getStatistics(filters);

        res.json({
          success: true,
          data: stats,
        });
      } catch (error) {
        console.error('[IncidentsAPI] Error fetching stats:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch incident statistics',
        });
      }
    }
  );

  /**
   * GET /api/incidents/:id
   * 
   * Get incident details
   */
  router.get(
    '/:id',
    authenticate,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { id } = req.params;
        
        if (!z.string().uuid().safeParse(id).success) {
          res.status(400).json({
            success: false,
            error: 'Invalid incident ID format',
          });
          return;
        }

        const tenantId = (req as any).currentUser?.tenantId;
        
        if (!tenantId) {
          res.status(401).json({
            success: false,
            error: 'Tenant context not found',
          });
          return;
        }

        const redisService = await getRedisService();
        const incidentService = getIncidentService(pool, redisService.getClient());
        
        const incident = await incidentService.getIncidentById(tenantId, id);
        
        if (!incident) {
          res.status(404).json({
            success: false,
            error: 'Incident not found',
          });
          return;
        }
        
        res.json({
          success: true,
          data: incident,
        });
      } catch (error) {
        console.error('[IncidentsAPI] Error fetching incident:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch incident',
        });
      }
    }
  );

  /**
   * PATCH /api/incidents/:id
   * 
   * Update incident
   */
  router.patch(
    '/:id',
    authenticate,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { id } = req.params;
        
        if (!z.string().uuid().safeParse(id).success) {
          res.status(400).json({
            success: false,
            error: 'Invalid incident ID format',
          });
          return;
        }

        const validation = updateIncidentSchema.safeParse(req.body);
        
        if (!validation.success) {
          res.status(400).json({
            success: false,
            error: 'Invalid request body',
            details: validation.error.issues,
          });
          return;
        }

        const tenantId = (req as any).currentUser?.tenantId;
        const userId = (req as any).currentUser?.id;
        
        if (!tenantId) {
          res.status(401).json({
            success: false,
            error: 'Tenant context not found',
          });
          return;
        }

        const redisService = await getRedisService();
        const incidentService = getIncidentService(pool, redisService.getClient());

        const updated = await incidentService.updateIncident(tenantId, id, validation.data);

        if (!updated) {
          res.status(404).json({
            success: false,
            error: 'Incident not found',
          });
          return;
        }

        res.json({
          success: true,
          data: updated,
        });
      } catch (error) {
        console.error('[IncidentsAPI] Error updating incident:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to update incident',
        });
      }
    }
  );

  /**
   * POST /api/incidents/:id/acknowledge
   * 
   * Acknowledge incident
   */
  router.post(
    '/:id/acknowledge',
    authenticate,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { id } = req.params;
        const tenantId = (req as any).currentUser?.tenantId;
        const userId = (req as any).currentUser?.id;

        if (!tenantId || !userId) {
          res.status(401).json({
            success: false,
            error: 'Authentication context not found',
          });
          return;
        }

        const redisService = await getRedisService();
        const incidentService = getIncidentService(pool, redisService.getClient());

        const updated = await incidentService.acknowledgeIncident(tenantId, id, userId);

        if (!updated) {
          res.status(404).json({
            success: false,
            error: 'Incident not found',
          });
          return;
        }

        res.json({
          success: true,
          data: updated,
          message: 'Incident acknowledged',
        });
      } catch (error) {
        console.error('[IncidentsAPI] Error acknowledging incident:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to acknowledge incident',
        });
      }
    }
  );

  /**
   * POST /api/incidents/:id/assign
   * 
   * Assign incident to user
   */
  router.post(
    '/:id/assign',
    authenticate,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { id } = req.params;
        
        const validation = assignIncidentSchema.safeParse(req.body);
        
        if (!validation.success) {
          res.status(400).json({
            success: false,
            error: 'Invalid request body',
            details: validation.error.issues,
          });
          return;
        }

        const tenantId = (req as any).currentUser?.tenantId;

        if (!tenantId) {
          res.status(401).json({
            success: false,
            error: 'Tenant context not found',
          });
          return;
        }

        const redisService = await getRedisService();
        const incidentService = getIncidentService(pool, redisService.getClient());

        const updated = await incidentService.assignIncident(
          tenantId,
          id,
          validation.data.userId,
        );

        if (!updated) {
          res.status(404).json({
            success: false,
            error: 'Incident not found',
          });
          return;
        }

        res.json({
          success: true,
          data: updated,
          message: 'Incident assigned',
        });
      } catch (error) {
        console.error('[IncidentsAPI] Error assigning incident:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to assign incident',
        });
      }
    }
  );

  /**
   * POST /api/incidents/:id/resolve
   * 
   * Resolve incident
   */
  router.post(
    '/:id/resolve',
    authenticate,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { id } = req.params;
        const tenantId = (req as any).currentUser?.tenantId;
        const userId = (req as any).currentUser?.id;

        if (!tenantId || !userId) {
          res.status(401).json({
            success: false,
            error: 'Authentication context not found',
          });
          return;
        }

        const redisService = await getRedisService();
        const incidentService = getIncidentService(pool, redisService.getClient());

        const updated = await incidentService.resolveIncident(tenantId, id, userId);

        if (!updated) {
          res.status(404).json({
            success: false,
            error: 'Incident not found',
          });
          return;
        }

        res.json({
          success: true,
          data: updated,
          message: 'Incident resolved',
        });
      } catch (error) {
        console.error('[IncidentsAPI] Error resolving incident:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to resolve incident',
        });
      }
    }
  );

  /**
   * GET /api/incidents/alert/:alertId
   * 
   * Get incident for a specific alert
   */
  router.get(
    '/alert/:alertId',
    authenticate,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { alertId } = req.params;
        
        const redisService = await getRedisService();
        const correlationService = getAlertCorrelationService(redisService.getClient());
        
        const incidentId = await correlationService.getIncidentForAlert(alertId);
        
        if (!incidentId) {
          res.json({
            success: true,
            data: {
              hasIncident: false,
              incidentId: null,
            },
          });
          return;
        }
        
        const tenantId = (req as any).currentUser?.tenantId;
        const incidentService = getIncidentService(pool, redisService.getClient());
        const incident = await incidentService.getIncidentById(tenantId, incidentId);
        
        res.json({
          success: true,
          data: {
            hasIncident: true,
            incidentId,
            incident,
          },
        });
      } catch (error) {
        console.error('[IncidentsAPI] Error fetching incident for alert:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch incident for alert',
        });
      }
    }
  );

  /**
   * GET /api/incidents/rules
   * 
   * Get correlation rules
   */
  router.get(
    '/rules',
    authenticate,
    authorize(['admin', 'system']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const redisService = await getRedisService();
        const correlationService = getAlertCorrelationService(redisService.getClient());
        
        const rules = correlationService.getRules();
        const ruleList = Array.from(rules.entries()).map(([id, rule]) => ({
          id,
          name: rule.name,
          description: rule.description,
          enabled: rule.enabled,
          alertTypes: rule.alertTypes,
          timeWindowSeconds: rule.timeWindowSeconds,
          minimumAlerts: rule.minimumAlerts,
        }));
        
        res.json({
          success: true,
          data: {
            count: ruleList.length,
            rules: ruleList,
          },
        });
      } catch (error) {
        console.error('[IncidentsAPI] Error fetching rules:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch correlation rules',
        });
      }
    }
  );

  /**
   * PATCH /api/incidents/rules/:ruleId
   * 
   * Update correlation rule
   */
  router.patch(
    '/rules/:ruleId',
    authenticate,
    authorize(['admin', 'system']),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { ruleId } = req.params;
        const { enabled } = req.body;
        
        if (typeof enabled !== 'boolean') {
          res.status(400).json({
            success: false,
            error: 'Invalid request body',
            message: 'enabled must be a boolean',
          });
          return;
        }
        
        const redisService = await getRedisService();
        const correlationService = getAlertCorrelationService(redisService.getClient());
        
        correlationService.setRuleEnabled(ruleId, enabled);
        
        res.json({
          success: true,
          message: `Rule ${ruleId} ${enabled ? 'enabled' : 'disabled'}`,
        });
      } catch (error) {
        console.error('[IncidentsAPI] Error updating rule:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to update correlation rule',
        });
      }
    }
  );

  return router;
}

// Legacy export for backward compatibility
const router = Router();

// This will be initialized when the app starts
// For now, export empty router - it needs pool injection
export default router;
