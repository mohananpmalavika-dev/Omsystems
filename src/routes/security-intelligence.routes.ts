/**
 * Security Intelligence API Routes
 * 
 * REST API for AI-Powered Predictive Security Intelligence ("SecurityGPT").
 * 
 * Endpoints:
 * - Risk Heat Maps: GET /api/security-intelligence/heatmap
 * - Incident Predictions: GET/POST /api/security-intelligence/predictions
 * - Patrol Plans: GET/POST/PUT /api/security-intelligence/patrol-plans
 * - Anomalies: GET /api/security-intelligence/anomalies
 * - Reports: GET/POST /api/security-intelligence/reports
 * - Real-time Updates: WebSocket /api/security-intelligence/ws
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { Pool } from 'pg';
import { SecurityIntelligenceService } from '../services/security-intelligence.service.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { z } from 'zod';

// =====================================================
// VALIDATION SCHEMAS
// =====================================================

const GenerateHeatMapSchema = z.object({
  branchId: z.string().uuid(),
  predictionForTime: z.string().datetime().optional(),
});

const GeneratePredictionsSchema = z.object({
  branchId: z.string().uuid(),
  incidentTypes: z.array(z.string()).optional(),
});

const GeneratePatrolPlanSchema = z.object({
  branchId: z.string().uuid(),
  plannedForDate: z.string().datetime(),
  shiftStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  shiftEndTime: z.string().regex(/^\d{2}:\d{2}$/),
  availableOfficers: z.number().int().min(1).max(20),
  objective: z.enum(['minimize_risk', 'maximize_coverage', 'balanced', 'rapid_response']).optional(),
});

const ApprovePatrolPlanSchema = z.object({
  patrolPlanId: z.string().uuid(),
});

const CompletePatrolSchema = z.object({
  patrolPlanId: z.string().uuid(),
  effectivenessScore: z.number().min(0).max(1),
  incidentsDetected: z.number().int().min(0).optional(),
  anomaliesFound: z.number().int().min(0).optional(),
});

const GenerateReportSchema = z.object({
  branchId: z.string().uuid().optional(),
  reportType: z.enum(['daily', 'shift', 'weekly', 'realtime']),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

const GetAnomaliesSchema = z.object({
  branchId: z.string().uuid().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_POSITIVE']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
});

// =====================================================
// ROUTE FACTORY
// =====================================================

export function createSecurityIntelligenceRoutes(db: Pool): Router {
  const router = Router();
  const service = new SecurityIntelligenceService(db);
  
  // Initialize service
  service.initialize().catch(error => {
    console.error('[SecurityIntelligence] Failed to initialize service:', error);
  });
  
  // =====================================================
  // RISK HEAT MAPS
  // =====================================================
  
  /**
   * GET /api/security-intelligence/heatmap/latest
   * Get the latest risk heat map for a branch
   */
  router.get(
    '/heatmap/latest',
    authenticate,
    authorize('security:view'),
    async (req: Request, res: Response) => {
      try {
        const { branchId } = req.query;
        
        if (!branchId || typeof branchId !== 'string') {
          return res.status(400).json({
            success: false,
            error: 'branchId query parameter is required',
          });
        }
        
        const tenantId = (req as any).user.tenantId;
        
        const heatMap = await service.getLatestRiskHeatMap(tenantId, branchId);
        
        if (!heatMap) {
          return res.status(404).json({
            success: false,
            error: 'No heat map available. Generate one first.',
          });
        }
        
        res.json({
          success: true,
          data: heatMap,
        });
      } catch (error) {
        console.error('[API] Error getting latest heat map:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get heat map',
        });
      }
    }
  );
  
  /**
   * POST /api/security-intelligence/heatmap/generate
   * Generate a new risk heat map
   */
  router.post(
    '/heatmap/generate',
    authenticate,
    authorize('security:manage'),
    validateRequest(GenerateHeatMapSchema),
    async (req: Request, res: Response) => {
      try {
        const { branchId, predictionForTime } = req.body;
        const tenantId = (req as any).user.tenantId;
        
        const targetTime = predictionForTime ? new Date(predictionForTime) : undefined;
        
        const heatMap = await service.generateRiskHeatMap(
          tenantId,
          branchId,
          targetTime
        );
        
        res.status(201).json({
          success: true,
          data: heatMap,
        });
      } catch (error) {
        console.error('[API] Error generating heat map:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate heat map',
        });
      }
    }
  );
  
  // =====================================================
  // INCIDENT PREDICTIONS
  // =====================================================
  
  /**
   * GET /api/security-intelligence/predictions/active
   * Get active incident predictions
   */
  router.get(
    '/predictions/active',
    authenticate,
    authorize('security:view'),
    async (req: Request, res: Response) => {
      try {
        const { branchId } = req.query;
        
        if (!branchId || typeof branchId !== 'string') {
          return res.status(400).json({
            success: false,
            error: 'branchId query parameter is required',
          });
        }
        
        const tenantId = (req as any).user.tenantId;
        
        const predictions = await service.getActivePredictions(tenantId, branchId);
        
        res.json({
          success: true,
          data: predictions,
        });
      } catch (error) {
        console.error('[API] Error getting active predictions:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get predictions',
        });
      }
    }
  );
  
  /**
   * POST /api/security-intelligence/predictions/generate
   * Generate incident predictions
   */
  router.post(
    '/predictions/generate',
    authenticate,
    authorize('security:manage'),
    validateRequest(GeneratePredictionsSchema),
    async (req: Request, res: Response) => {
      try {
        const { branchId, incidentTypes } = req.body;
        const tenantId = (req as any).user.tenantId;
        
        const predictions = await service.generateIncidentPredictions(
          tenantId,
          branchId,
          incidentTypes
        );
        
        res.status(201).json({
          success: true,
          data: predictions,
        });
      } catch (error) {
        console.error('[API] Error generating predictions:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate predictions',
        });
      }
    }
  );
  
  // =====================================================
  // PATROL PLANS
  // =====================================================
  
  /**
   * GET /api/security-intelligence/patrol-plans/active
   * Get active patrol plans
   */
  router.get(
    '/patrol-plans/active',
    authenticate,
    authorize('security:view'),
    async (req: Request, res: Response) => {
      try {
        const { branchId } = req.query;
        
        if (!branchId || typeof branchId !== 'string') {
          return res.status(400).json({
            success: false,
            error: 'branchId query parameter is required',
          });
        }
        
        const tenantId = (req as any).user.tenantId;
        
        const plans = await service.getActivePatrolPlans(tenantId, branchId);
        
        res.json({
          success: true,
          data: plans,
        });
      } catch (error) {
        console.error('[API] Error getting active patrol plans:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get patrol plans',
        });
      }
    }
  );
  
  /**
   * GET /api/security-intelligence/patrol-plans/:id
   * Get a specific patrol plan
   */
  router.get(
    '/patrol-plans/:id',
    authenticate,
    authorize('security:view'),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        
        const plan = await service.getPatrolPlan(id);
        
        if (!plan) {
          return res.status(404).json({
            success: false,
            error: 'Patrol plan not found',
          });
        }
        
        // Check tenant access
        const tenantId = (req as any).user.tenantId;
        if (plan.tenantId !== tenantId) {
          return res.status(403).json({
            success: false,
            error: 'Access denied',
          });
        }
        
        res.json({
          success: true,
          data: plan,
        });
      } catch (error) {
        console.error('[API] Error getting patrol plan:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get patrol plan',
        });
      }
    }
  );
  
  /**
   * POST /api/security-intelligence/patrol-plans/generate
   * Generate a new patrol plan
   */
  router.post(
    '/patrol-plans/generate',
    authenticate,
    authorize('security:manage'),
    validateRequest(GeneratePatrolPlanSchema),
    async (req: Request, res: Response) => {
      try {
        const {
          branchId,
          plannedForDate,
          shiftStartTime,
          shiftEndTime,
          availableOfficers,
          objective,
        } = req.body;
        
        const tenantId = (req as any).user.tenantId;
        
        const plan = await service.generatePatrolPlan(
          tenantId,
          branchId,
          new Date(plannedForDate),
          shiftStartTime,
          shiftEndTime,
          availableOfficers,
          objective || 'balanced'
        );
        
        res.status(201).json({
          success: true,
          data: plan,
        });
      } catch (error) {
        console.error('[API] Error generating patrol plan:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to generate patrol plan',
        });
      }
    }
  );
  
  /**
   * PUT /api/security-intelligence/patrol-plans/:id/approve
   * Approve a patrol plan
   */
  router.put(
    '/patrol-plans/:id/approve',
    authenticate,
    authorize('security:manage'),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const userId = (req as any).user.id;
        
        const success = await service.approvePatrolPlan(id, userId);
        
        if (!success) {
          return res.status(400).json({
            success: false,
            error: 'Failed to approve patrol plan. Check plan status.',
          });
        }
        
        res.json({
          success: true,
          message: 'Patrol plan approved successfully',
        });
      } catch (error) {
        console.error('[API] Error approving patrol plan:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to approve patrol plan',
        });
      }
    }
  );
  
  /**
   * PUT /api/security-intelligence/patrol-plans/:id/start
   * Start patrol execution
   */
  router.put(
    '/patrol-plans/:id/start',
    authenticate,
    authorize('security:manage'),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        
        const success = await service.startPatrol(id);
        
        if (!success) {
          return res.status(400).json({
            success: false,
            error: 'Failed to start patrol. Check plan status.',
          });
        }
        
        res.json({
          success: true,
          message: 'Patrol started successfully',
        });
      } catch (error) {
        console.error('[API] Error starting patrol:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to start patrol',
        });
      }
    }
  );
  
  /**
   * PUT /api/security-intelligence/patrol-plans/:id/complete
   * Complete patrol with metrics
   */
  router.put(
    '/patrol-plans/:id/complete',
    authenticate,
    authorize('security:manage'),
    validateRequest(CompletePatrolSchema),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { effectivenessScore, incidentsDetected, anomaliesFound } = req.body;
        
        const success = await service.completePatrol(
          id,
          effectivenessScore,
          incidentsDetected || 0,
          anomaliesFound || 0
        );
        
        if (!success) {
          return res.status(400).json({
            success: false,
            error: 'Failed to complete patrol. Check plan status.',
          });
        }
        
        res.json({
          success: true,
          message: 'Patrol completed successfully',
        });
      } catch (error) {
        console.error('[API] Error completing patrol:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to complete patrol',
        });
      }
    }
  );
  
  // =====================================================
  // ANOMALIES
  // =====================================================
  
  /**
   * GET /api/security-intelligence/anomalies
   * Get behavioral anomalies with filters
   */
  router.get(
    '/anomalies',
    authenticate,
    authorize('security:view'),
    async (req: Request, res: Response) => {
      try {
        const {
          branchId,
          severity,
          status,
          startDate,
          endDate,
          limit = '100',
        } = req.query;
        
        const tenantId = (req as any).user.tenantId;
        
        let query = `
          SELECT * FROM behavioral_anomaly
          WHERE tenant_id = $1
        `;
        const params: any[] = [tenantId];
        
        if (branchId) {
          query += ` AND branch_id = $${params.length + 1}`;
          params.push(branchId);
        }
        
        if (severity) {
          query += ` AND severity = $${params.length + 1}`;
          params.push(severity);
        }
        
        if (status) {
          query += ` AND status = $${params.length + 1}`;
          params.push(status);
        }
        
        if (startDate) {
          query += ` AND detected_at >= $${params.length + 1}`;
          params.push(new Date(startDate as string));
        }
        
        if (endDate) {
          query += ` AND detected_at <= $${params.length + 1}`;
          params.push(new Date(endDate as string));
        }
        
        query += ` ORDER BY detected_at DESC LIMIT $${params.length + 1}`;
        params.push(parseInt(limit as string));
        
        const result = await db.query(query, params);
        
        res.json({
          success: true,
          data: result.rows,
          count: result.rows.length,
        });
      } catch (error) {
        console.error('[API] Error getting anomalies:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get anomalies',
        });
      }
    }
  );
  
  /**
   * PUT /api/security-intelligence/anomalies/:id/acknowledge
   * Acknowledge an anomaly
   */
  router.put(
    '/anomalies/:id/acknowledge',
    authenticate,
    authorize('security:manage'),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { notes } = req.body;
        
        await db.query(
          `UPDATE behavioral_anomaly
           SET status = 'ACKNOWLEDGED', resolution_notes = $2, updated_at = NOW()
           WHERE id = $1 AND status = 'ACTIVE'`,
          [id, notes || null]
        );
        
        res.json({
          success: true,
          message: 'Anomaly acknowledged',
        });
      } catch (error) {
        console.error('[API] Error acknowledging anomaly:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to acknowledge anomaly',
        });
      }
    }
  );
  
  /**
   * PUT /api/security-intelligence/anomalies/:id/resolve
   * Resolve an anomaly
   */
  router.put(
    '/anomalies/:id/resolve',
    authenticate,
    authorize('security:manage'),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { notes, falsePositive } = req.body;
        
        const newStatus = falsePositive ? 'FALSE_POSITIVE' : 'RESOLVED';
        
        await db.query(
          `UPDATE behavioral_anomaly
           SET status = $2, resolution_notes = $3, resolved_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND status IN ('ACTIVE', 'ACKNOWLEDGED')`,
          [id, newStatus, notes || null]
        );
        
        res.json({
          success: true,
          message: `Anomaly ${falsePositive ? 'marked as false positive' : 'resolved'}`,
        });
      } catch (error) {
        console.error('[API] Error resolving anomaly:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to resolve anomaly',
        });
      }
    }
  );
  
  // =====================================================
  // REPORTS
  // =====================================================
  
  /**
   * POST /api/security-intelligence/reports/generate
   * Generate a security intelligence report
   */
  router.post(
    '/reports/generate',
    authenticate,
    authorize('security:view'),
    validateRequest(GenerateReportSchema),
    async (req: Request, res: Response) => {
      try {
        const { branchId, reportType, startDate, endDate } = req.body;
        const tenantId = (req as any).user.tenantId;
        
        const report = await service.generateReport(
          tenantId,
          branchId || null,
          reportType,
          new Date(startDate),
          new Date(endDate)
        );
        
        res.status(201).json({
          success: true,
          data: report,
        });
      } catch (error) {
        console.error('[API] Error generating report:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate report',
        });
      }
    }
  );
  
  /**
   * GET /api/security-intelligence/reports
   * Get security intelligence reports
   */
  router.get(
    '/reports',
    authenticate,
    authorize('security:view'),
    async (req: Request, res: Response) => {
      try {
        const { branchId, reportType, limit = '50' } = req.query;
        const tenantId = (req as any).user.tenantId;
        
        let query = `
          SELECT * FROM security_intelligence_report
          WHERE tenant_id = $1
        `;
        const params: any[] = [tenantId];
        
        if (branchId) {
          query += ` AND branch_id = $${params.length + 1}`;
          params.push(branchId);
        }
        
        if (reportType) {
          query += ` AND report_type = $${params.length + 1}`;
          params.push(reportType);
        }
        
        query += ` ORDER BY generated_at DESC LIMIT $${params.length + 1}`;
        params.push(parseInt(limit as string));
        
        const result = await db.query(query, params);
        
        res.json({
          success: true,
          data: result.rows,
          count: result.rows.length,
        });
      } catch (error) {
        console.error('[API] Error getting reports:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get reports',
        });
      }
    }
  );
  
  // =====================================================
  // METRICS & STATUS
  // =====================================================
  
  /**
   * GET /api/security-intelligence/metrics
   * Get system metrics and status
   */
  router.get(
    '/metrics',
    authenticate,
    authorize('security:view'),
    async (req: Request, res: Response) => {
      try {
        const metrics = service.getMetrics();
        
        res.json({
          success: true,
          data: metrics,
        });
      } catch (error) {
        console.error('[API] Error getting metrics:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get metrics',
        });
      }
    }
  );
  
  /**
   * GET /api/security-intelligence/dashboard
   * Get dashboard summary data
   */
  router.get(
    '/dashboard',
    authenticate,
    authorize('security:view'),
    async (req: Request, res: Response) => {
      try {
        const { branchId } = req.query;
        
        if (!branchId || typeof branchId !== 'string') {
          return res.status(400).json({
            success: false,
            error: 'branchId query parameter is required',
          });
        }
        
        const tenantId = (req as any).user.tenantId;
        
        // Get latest data
        const [heatMap, predictions, anomalies, plans] = await Promise.all([
          service.getLatestRiskHeatMap(tenantId, branchId),
          service.getActivePredictions(tenantId, branchId),
          db.query(
            `SELECT severity, COUNT(*) as count FROM behavioral_anomaly
             WHERE tenant_id = $1 AND branch_id = $2 AND status = 'ACTIVE'
             GROUP BY severity`,
            [tenantId, branchId]
          ),
          service.getActivePatrolPlans(tenantId, branchId),
        ]);
        
        const anomaliesBySeverity = anomalies.rows.reduce((acc: any, row: any) => {
          acc[row.severity] = parseInt(row.count);
          return acc;
        }, { low: 0, medium: 0, high: 0, critical: 0 });
        
        const highRiskPredictions = predictions.filter(
          p => p.riskLevel === 'high' || p.riskLevel === 'critical'
        );
        
        res.json({
          success: true,
          data: {
            heatMap: heatMap ? {
              id: heatMap.id,
              overallRiskScore: heatMap.overallRiskScore,
              highRiskAreasCount: heatMap.highRiskAreasCount,
              generatedAt: heatMap.generatedAt,
            } : null,
            predictions: {
              total: predictions.length,
              highRisk: highRiskPredictions.length,
              byType: predictions.reduce((acc: any, p) => {
                acc[p.incidentType] = (acc[p.incidentType] || 0) + 1;
                return acc;
              }, {}),
            },
            anomalies: {
              total: Object.values(anomaliesBySeverity).reduce((sum: number, count) => sum + (count as number), 0),
              bySeverity: anomaliesBySeverity,
            },
            patrols: {
              active: plans.filter(p => p.status === 'ACTIVE').length,
              pending: plans.filter(p => p.status === 'APPROVED').length,
              draft: plans.filter(p => p.status === 'DRAFT').length,
            },
          },
        });
      } catch (error) {
        console.error('[API] Error getting dashboard data:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get dashboard data',
        });
      }
    }
  );
  
  return router;
}

export default createSecurityIntelligenceRoutes;
