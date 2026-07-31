/**
 * Infrastructure Monitoring API Routes
 * Comprehensive infrastructure health, metrics, alerts, and topology endpoints
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { InfrastructureHealthScoringService } from '../../src/services/infrastructure/infrastructure-health-scoring.service';
import { SwitchMonitoringService } from '../../src/services/infrastructure/switch-monitoring.service';
import { FirewallMonitoringService } from '../../src/services/infrastructure/firewall-monitoring.service';
import { UPSMonitoringService } from '../../src/services/infrastructure/ups-monitoring.service';

interface AuthRequest extends Request {
  context?: {
    tenantId: string;
    userId?: string;
    userScope?: {
      branchIds?: string[];
      regionIds?: string[];
    };
  };
}

export function createInfrastructureMonitoringRoutes(pool: Pool): Router {
  const router = Router();
  const healthScoringService = new InfrastructureHealthScoringService(pool);
  const switchService = new SwitchMonitoringService(pool);
  const firewallService = new FirewallMonitoringService(pool);
  const upsService = new UPSMonitoringService(pool);

  // =====================================================
  // HEALTH SCORING ENDPOINTS
  // =====================================================

  /**
   * GET /v1/infrastructure/health/:branchId
   * Get comprehensive infrastructure health score for a branch
   */
  router.get('/health/:branchId', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      const { branchId } = req.params;
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }
      
      const healthScore = await healthScoringService.calculateBranchHealth(
        tenantId,
        branchId
      );
      
      res.json({
        success: true,
        data: healthScore
      });
    } catch (error) {
      console.error('Error calculating infrastructure health:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to calculate infrastructure health'
      });
    }
  });

  /**
   * GET /v1/infrastructure/health/tenant/summary
   * Get tenant-wide infrastructure health summary
   */
  router.get('/health/tenant/summary', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }
      
      const summary = await healthScoringService.getTenantHealthSummary(tenantId);
      
      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      console.error('Error fetching tenant health summary:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch tenant health summary'
      });
    }
  });

  /**
   * GET /v1/infrastructure/health/trend/:branchId
   * Get infrastructure health trend over time
   */
  router.get('/health/trend/:branchId', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      const { branchId } = req.params;
      const { startDate, endDate, interval = 'hour' } = req.query;
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: 'startDate and endDate query parameters are required'
        });
      }

      const trend = await healthScoringService.getBranchHealthTrend(
        tenantId,
        branchId,
        new Date(startDate as string),
        new Date(endDate as string),
        interval as 'hour' | 'day'
      );
      
      res.json({
        success: true,
        data: trend
      });
    } catch (error) {
      console.error('Error fetching health trend:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch health trend'
      });
    }
  });

  /**
   * POST /v1/infrastructure/health/calculate-all
   * Calculate health scores for all branches
   */
  router.post('/health/calculate-all', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }
      
      // Calculate health for all branches asynchronously
      healthScoringService.calculateTenantHealth(tenantId)
        .catch(err => console.error('Error in batch infrastructure health calculation:', err));
      
      res.json({
        success: true,
        message: 'Infrastructure health calculation started for all branches'
      });
    } catch (error) {
      console.error('Error starting batch calculation:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start health calculation'
      });
    }
  });

  // =====================================================
  // ALERTS ENDPOINTS
  // =====================================================

  /**
   * GET /v1/infrastructure/alerts
   * Get infrastructure alerts with filtering and pagination
   */
  router.get('/alerts', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const {
        branchId,
        severity,
        componentType,
        status = 'active',
        page = 1,
        limit = 50
      } = req.query;
      
      const offset = (Number(page) - 1) * Number(limit);

      let query = `
        SELECT 
          ia.*,
          rn.name as branch_name
        FROM infrastructure_alerts ia
        JOIN resource_nodes rn ON rn.id = ia.branch_id
        WHERE ia.tenant_id = $1
      `;
      
      const params: any[] = [tenantId];
      let paramIndex = 2;

      if (branchId) {
        query += ` AND ia.branch_id = $${paramIndex}`;
        params.push(branchId);
        paramIndex++;
      }

      if (severity) {
        query += ` AND ia.severity = $${paramIndex}`;
        params.push(severity);
        paramIndex++;
      }

      if (componentType) {
        query += ` AND ia.component_type = $${paramIndex}`;
        params.push(componentType);
        paramIndex++;
      }

      if (status) {
        query += ` AND ia.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      query += ` ORDER BY ia.detected_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(Number(limit), offset);

      const result = await pool.query(query, params);

      // Get total count for pagination
      let countQuery = `
        SELECT COUNT(*) as total
        FROM infrastructure_alerts
        WHERE tenant_id = $1
      `;
      const countParams: any[] = [tenantId];
      let countParamIndex = 2;

      if (branchId) {
        countQuery += ` AND branch_id = $${countParamIndex}`;
        countParams.push(branchId);
        countParamIndex++;
      }

      if (severity) {
        countQuery += ` AND severity = $${countParamIndex}`;
        countParams.push(severity);
        countParamIndex++;
      }

      if (componentType) {
        countQuery += ` AND component_type = $${countParamIndex}`;
        countParams.push(componentType);
        countParamIndex++;
      }

      if (status) {
        countQuery += ` AND status = $${countParamIndex}`;
        countParams.push(status);
        countParamIndex++;
      }

      const countResult = await pool.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].total);

      res.json({
        success: true,
        data: result.rows,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      console.error('Error fetching infrastructure alerts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch infrastructure alerts'
      });
    }
  });

  /**
   * GET /v1/infrastructure/alerts/summary
   * Get alert summary counts by severity and type
   */
  router.get('/alerts/summary', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      const { branchId } = req.query;
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      let query = `
        SELECT 
          COUNT(*) FILTER (WHERE severity = 'critical' AND status = 'active') as critical_active,
          COUNT(*) FILTER (WHERE severity = 'warning' AND status = 'active') as warning_active,
          COUNT(*) FILTER (WHERE severity = 'info' AND status = 'active') as info_active,
          COUNT(*) FILTER (WHERE status = 'acknowledged') as acknowledged,
          COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
          json_object_agg(
            component_type,
            COUNT(*) FILTER (WHERE status = 'active')
          ) FILTER (WHERE status = 'active') as by_component_type
        FROM infrastructure_alerts
        WHERE tenant_id = $1
      `;

      const params: any[] = [tenantId];

      if (branchId) {
        query += ` AND branch_id = $2`;
        params.push(branchId);
      }

      const result = await pool.query(query, params);
      
      res.json({
        success: true,
        data: result.rows[0] || {
          critical_active: 0,
          warning_active: 0,
          info_active: 0,
          acknowledged: 0,
          resolved: 0,
          by_component_type: {}
        }
      });
    } catch (error) {
      console.error('Error fetching alert summary:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch alert summary'
      });
    }
  });

  /**
   * PATCH /v1/infrastructure/alerts/:alertId/acknowledge
   * Acknowledge an alert
   */
  router.patch('/alerts/:alertId/acknowledge', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userId } = req.context || {};
      const { alertId } = req.params;
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      await pool.query(
        `UPDATE infrastructure_alerts
         SET status = 'acknowledged',
             acknowledged_at = NOW(),
             acknowledged_by = $1
         WHERE id = $2 AND tenant_id = $3`,
        [userId, alertId, tenantId]
      );
      
      res.json({
        success: true,
        message: 'Alert acknowledged successfully'
      });
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to acknowledge alert'
      });
    }
  });

  /**
   * PATCH /v1/infrastructure/alerts/:alertId/resolve
   * Resolve an alert
   */
  router.patch('/alerts/:alertId/resolve', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userId } = req.context || {};
      const { alertId } = req.params;
      const { resolutionNotes } = req.body;
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      await pool.query(
        `UPDATE infrastructure_alerts
         SET status = 'resolved',
             resolved_at = NOW(),
             resolved_by = $1,
             resolution_notes = $2
         WHERE id = $3 AND tenant_id = $4`,
        [userId, resolutionNotes, alertId, tenantId]
      );
      
      res.json({
        success: true,
        message: 'Alert resolved successfully'
      });
    } catch (error) {
      console.error('Error resolving alert:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to resolve alert'
      });
    }
  });

  // =====================================================
  // DEVICE METRICS ENDPOINTS
  // =====================================================

  /**
   * GET /v1/infrastructure/switches/:branchId
   * Get all switches for a branch with latest metrics
   */
  router.get('/switches/:branchId', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      const { branchId } = req.params;
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const query = `
        SELECT 
          ns.*,
          shm.health_score,
          shm.health_status,
          shm.cpu_usage_percent,
          shm.memory_usage_percent,
          shm.temperature_celsius,
          shm.poe_utilization_percent,
          shm.ports_up,
          shm.ports_down,
          shm.observed_at as last_metrics_at
        FROM network_switches ns
        LEFT JOIN LATERAL (
          SELECT *
          FROM switch_health_metrics
          WHERE switch_id = ns.id
          ORDER BY observed_at DESC
          LIMIT 1
        ) shm ON true
        WHERE ns.tenant_id = $1 AND ns.branch_id = $2
        ORDER BY ns.name
      `;
