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

      const result = await pool.query(query, [tenantId, branchId]);
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching switches:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch switches'
      });
    }
  });

  /**
   * GET /v1/infrastructure/switches/:switchId/ports
   * Get port-level metrics for a switch
   */
  router.get('/switches/:switchId/ports', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      const { switchId } = req.params;
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const query = `
        SELECT 
          port_number,
          port_name,
          admin_status,
          oper_status,
          speed_mbps,
          poe_enabled,
          poe_power_watts,
          poe_device_detected,
          connected_device_type,
          utilization_percent,
          rx_bytes,
          tx_bytes,
          rx_errors,
          tx_errors,
          observed_at
        FROM switch_port_metrics
        WHERE tenant_id = $1 AND switch_id = $2
          AND observed_at = (
            SELECT MAX(observed_at)
            FROM switch_port_metrics
            WHERE switch_id = $2
          )
        ORDER BY port_number
      `;

      const result = await pool.query(query, [tenantId, switchId]);
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching switch ports:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch switch ports'
      });
    }
  });

  /**
   * GET /v1/infrastructure/firewalls/:branchId
   * Get all firewalls for a branch with latest metrics
   */
  router.get('/firewalls/:branchId', async (req: AuthRequest, res: Response) => {
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
          f.*,
          fhm.health_score,
          fhm.health_status,
          fhm.cpu_usage_percent,
          fhm.memory_usage_percent,
          fhm.session_count,
          fhm.session_utilization_percent,
          fhm.threats_blocked_last_hour,
          fhm.ips_status,
          fhm.av_status,
          fhm.vpn_tunnels_up,
          fhm.vpn_tunnels_down,
          fhm.ha_sync_status,
          fhm.observed_at as last_metrics_at
        FROM firewalls f
        LEFT JOIN LATERAL (
          SELECT *
          FROM firewall_health_metrics
          WHERE firewall_id = f.id
          ORDER BY observed_at DESC
          LIMIT 1
        ) fhm ON true
        WHERE f.tenant_id = $1 AND f.branch_id = $2
        ORDER BY f.name
      `;

      const result = await pool.query(query, [tenantId, branchId]);
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching firewalls:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch firewalls'
      });
    }
  });

  /**
   * GET /v1/infrastructure/ups/:branchId
   * Get all UPS devices for a branch with latest metrics
   */
  router.get('/ups/:branchId', async (req: AuthRequest, res: Response) => {
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
          u.*,
          uhm.health_score,
          uhm.health_status,
          uhm.battery_health_percent,
          uhm.battery_age_days,
          uhm.estimated_runtime_minutes,
          uhm.running_on_battery,
          uhm.utility_power_available,
          uhm.load_percent,
          uhm.load_watts,
          uhm.battery_replacement_indicator,
          uhm.predicted_replacement_days,
          uhm.last_self_test_result,
          uhm.observed_at as last_metrics_at
        FROM ups_devices u
        LEFT JOIN LATERAL (
          SELECT *
          FROM ups_health_metrics
          WHERE ups_id = u.id
          ORDER BY observed_at DESC
          LIMIT 1
        ) uhm ON true
        WHERE u.tenant_id = $1 AND u.branch_id = $2
        ORDER BY u.name
      `;

      const result = await pool.query(query, [tenantId, branchId]);
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching UPS devices:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch UPS devices'
      });
    }
  });

  /**
   * GET /v1/infrastructure/ups/:upsId/battery-forecast
   * Get battery replacement prediction and maintenance schedule
   */
  router.get('/ups/:upsId/battery-forecast', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      const { upsId } = req.params;
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const query = `
        SELECT 
          u.name as ups_name,
          u.branch_id,
          rn.name as branch_name,
          uhm.battery_health_percent,
          uhm.battery_age_days,
          uhm.battery_replacement_indicator,
          uhm.predicted_replacement_days,
          uhm.last_self_test_result,
          uhm.last_self_test_date,
          u.battery_installation_date,
          uhm.observed_at
        FROM ups_devices u
        JOIN resource_nodes rn ON rn.id = u.branch_id
        LEFT JOIN LATERAL (
          SELECT *
          FROM ups_health_metrics
          WHERE ups_id = u.id
          ORDER BY observed_at DESC
          LIMIT 1
        ) uhm ON true
        WHERE u.id = $1 AND u.tenant_id = $2
      `;

      const result = await pool.query(query, [upsId, tenantId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'UPS device not found'
        });
      }

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Error fetching UPS battery forecast:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch UPS battery forecast'
      });
    }
  });

  /**
   * GET /v1/infrastructure/predicted-failures/:branchId
   * Get all predicted failures for a branch
   */
  router.get('/predicted-failures/:branchId', async (req: AuthRequest, res: Response) => {
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
          'ups_battery' as failure_type,
          u.id as component_id,
          u.name as component_name,
          'UPS Battery Replacement Required' as description,
          uhm.predicted_replacement_days as days_until_failure,
          uhm.battery_health_percent as health_indicator,
          uhm.observed_at
        FROM ups_devices u
        JOIN ups_health_metrics uhm ON uhm.ups_id = u.id
        WHERE u.tenant_id = $1 
          AND u.branch_id = $2
          AND (uhm.battery_replacement_indicator = true 
               OR uhm.predicted_replacement_days < 90)
          AND uhm.observed_at = (
            SELECT MAX(observed_at)
            FROM ups_health_metrics
            WHERE ups_id = u.id
          )
        
        UNION ALL
        
        SELECT 
          'disk_failure' as failure_type,
          dh.id as component_id,
          dh.device_name as component_name,
          'Disk Failure Predicted' as description,
          NULL as days_until_failure,
          dh.smart_health_percent as health_indicator,
          dh.last_check_at as observed_at
        FROM disk_health dh
        WHERE dh.tenant_id = $1 
          AND dh.branch_id = $2
          AND dh.smart_status = 'failure_predicted'
        
        UNION ALL
        
        SELECT 
          'generator_maintenance' as failure_type,
          g.id as component_id,
          g.name as component_name,
          'Generator Maintenance Due' as description,
          ghm.maintenance_due_days as days_until_failure,
          NULL as health_indicator,
          ghm.observed_at
        FROM generators g
        JOIN generator_health_metrics ghm ON ghm.generator_id = g.id
        WHERE g.tenant_id = $1 
          AND g.branch_id = $2
          AND ghm.maintenance_due = true
          AND ghm.observed_at = (
            SELECT MAX(observed_at)
            FROM generator_health_metrics
            WHERE generator_id = g.id
          )
        
        ORDER BY days_until_failure ASC NULLS LAST, observed_at DESC
      `;

      const result = await pool.query(query, [tenantId, branchId]);
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching predicted failures:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch predicted failures'
      });
    }
  });

  /**
   * GET /v1/infrastructure/availability/:branchId
   * Get infrastructure availability metrics
   */
  router.get('/availability/:branchId', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      const { branchId } = req.params;
      const { periodType = 'day', limit = 30 } = req.query;
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const query = `
        SELECT 
          period_start,
          period_end,
          period_type,
          availability_percent,
          total_uptime_seconds,
          total_downtime_seconds,
          power_outage_count,
          network_outage_count,
          mtbf_hours,
          mttr_hours
        FROM infrastructure_availability_metrics
        WHERE tenant_id = $1 
          AND branch_id = $2
          AND period_type = $3
        ORDER BY period_start DESC
        LIMIT $4
      `;

      const result = await pool.query(query, [tenantId, branchId, periodType, Number(limit)]);
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching availability metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch availability metrics'
      });
    }
  });

  /**
   * GET /v1/infrastructure/topology/:branchId
   * Get network topology for a branch
   */
  router.get('/topology/:branchId', async (req: AuthRequest, res: Response) => {
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
          ntn.*,
          src.name as source_device_name,
          tgt.name as target_device_name
        FROM network_topology_nodes ntn
        LEFT JOIN LATERAL (
          SELECT name FROM (
            SELECT id, name FROM network_switches WHERE tenant_id = $1
            UNION ALL
            SELECT id, name FROM firewalls WHERE tenant_id = $1
            UNION ALL
            SELECT id, name FROM cameras WHERE tenant_id = $1
            UNION ALL
            SELECT id, name FROM ups_devices WHERE tenant_id = $1
            UNION ALL
            SELECT id, name FROM hardware_devices WHERE tenant_id = $1
          ) devices
          WHERE devices.id = ntn.source_device_id
        ) src ON true
        LEFT JOIN LATERAL (
          SELECT name FROM (
            SELECT id, name FROM network_switches WHERE tenant_id = $1
            UNION ALL
            SELECT id, name FROM firewalls WHERE tenant_id = $1
            UNION ALL
            SELECT id, name FROM cameras WHERE tenant_id = $1
            UNION ALL
            SELECT id, name FROM ups_devices WHERE tenant_id = $1
            UNION ALL
            SELECT id, name FROM hardware_devices WHERE tenant_id = $1
          ) devices
          WHERE devices.id = ntn.target_device_id
        ) tgt ON true
        WHERE ntn.tenant_id = $1 AND ntn.branch_id = $2
        ORDER BY ntn.source_device_type, ntn.source_device_id
      `;

      const result = await pool.query(query, [tenantId, branchId]);
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching network topology:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch network topology'
      });
    }
  });

  // =====================================================
  // METRICS HISTORY ENDPOINTS
  // =====================================================

  /**
   * GET /v1/infrastructure/metrics/switch/:switchId/history
   * Get historical metrics for a switch
   */
  router.get('/metrics/switch/:switchId/history', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      const { switchId } = req.params;
      const { startDate, endDate, limit = 100 } = req.query;
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      let query = `
        SELECT 
          observed_at,
          cpu_usage_percent,
          memory_usage_percent,
          temperature_celsius,
          poe_utilization_percent,
          ports_up,
          ports_down,
          health_score
        FROM switch_health_metrics
        WHERE tenant_id = $1 AND switch_id = $2
      `;

      const params: any[] = [tenantId, switchId];
      let paramIndex = 3;

      if (startDate) {
        query += ` AND observed_at >= $${paramIndex}`;
        params.push(new Date(startDate as string));
        paramIndex++;
      }

      if (endDate) {
        query += ` AND observed_at <= $${paramIndex}`;
        params.push(new Date(endDate as string));
        paramIndex++;
      }

      query += ` ORDER BY observed_at DESC LIMIT $${paramIndex}`;
      params.push(Number(limit));

      const result = await pool.query(query, params);
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching switch metrics history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch switch metrics history'
      });
    }
  });

  /**
   * GET /v1/infrastructure/metrics/firewall/:firewallId/history
   * Get historical metrics for a firewall
   */
  router.get('/metrics/firewall/:firewallId/history', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      const { firewallId } = req.params;
      const { startDate, endDate, limit = 100 } = req.query;
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      let query = `
        SELECT 
          observed_at,
          cpu_usage_percent,
          memory_usage_percent,
          session_count,
          session_utilization_percent,
          threats_blocked_last_hour,
          ips_status,
          av_status,
          vpn_tunnels_up,
          vpn_tunnels_down,
          health_score
        FROM firewall_health_metrics
        WHERE tenant_id = $1 AND firewall_id = $2
      `;

      const params: any[] = [tenantId, firewallId];
      let paramIndex = 3;

      if (startDate) {
        query += ` AND observed_at >= $${paramIndex}`;
        params.push(new Date(startDate as string));
        paramIndex++;
      }

      if (endDate) {
        query += ` AND observed_at <= $${paramIndex}`;
        params.push(new Date(endDate as string));
        paramIndex++;
      }

      query += ` ORDER BY observed_at DESC LIMIT $${paramIndex}`;
      params.push(Number(limit));

      const result = await pool.query(query, params);
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching firewall metrics history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch firewall metrics history'
      });
    }
  });

  /**
   * GET /v1/infrastructure/metrics/ups/:upsId/history
   * Get historical metrics for a UPS
   */
  router.get('/metrics/ups/:upsId/history', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      const { upsId } = req.params;
      const { startDate, endDate, limit = 100 } = req.query;
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      let query = `
        SELECT 
          observed_at,
          battery_health_percent,
          battery_age_days,
          estimated_runtime_minutes,
          running_on_battery,
          utility_power_available,
          load_percent,
          load_watts,
          input_voltage,
          output_voltage,
          battery_replacement_indicator,
          predicted_replacement_days,
          health_score
        FROM ups_health_metrics
        WHERE tenant_id = $1 AND ups_id = $2
      `;

      const params: any[] = [tenantId, upsId];
      let paramIndex = 3;

      if (startDate) {
        query += ` AND observed_at >= $${paramIndex}`;
        params.push(new Date(startDate as string));
        paramIndex++;
      }

      if (endDate) {
        query += ` AND observed_at <= $${paramIndex}`;
        params.push(new Date(endDate as string));
        paramIndex++;
      }

      query += ` ORDER BY observed_at DESC LIMIT $${paramIndex}`;
      params.push(Number(limit));

      const result = await pool.query(query, params);
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching UPS metrics history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch UPS metrics history'
      });
    }
  });

  // =====================================================
  // RCA INTEGRATION ENDPOINTS
  // =====================================================

  /**
   * POST /v1/infrastructure/rca/investigate-camera
   * Investigate a camera incident and correlate with infrastructure
   */
  router.post('/rca/investigate-camera', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      const { cameraId, incidentType, detectedAt } = req.body;
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      if (!cameraId || !incidentType) {
        return res.status(400).json({
          success: false,
          error: 'cameraId and incidentType are required'
        });
      }

      // Get camera details
      const camera = await pool.query(
        `SELECT id, name, branch_id FROM cameras WHERE id = $1 AND tenant_id = $2`,
        [cameraId, tenantId]
      );

      if (camera.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Camera not found'
        });
      }

      const { InfrastructureRcaIntegrationService } = await import(
        '../../src/services/infrastructure/infrastructure-rca-integration.service.js'
      );
      const rcaService = new InfrastructureRcaIntegrationService(pool);

      const result = await rcaService.investigateCameraIncident({
        cameraId,
        cameraName: camera.rows[0].name,
        branchId: camera.rows[0].branch_id,
        incidentType,
        detectedAt: detectedAt ? new Date(detectedAt) : new Date()
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error investigating camera incident:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to investigate camera incident'
      });
    }
  });

  /**
   * POST /v1/infrastructure/rca/investigate-branch
   * Investigate all offline cameras in a branch
   */
  router.post('/rca/investigate-branch/:branchId', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      const { branchId } = req.params;
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const { InfrastructureRcaIntegrationService } = await import(
        '../../src/services/infrastructure/infrastructure-rca-integration.service.js'
      );
      const rcaService = new InfrastructureRcaIntegrationService(pool);

      const results = await rcaService.investigateBranchOutage(branchId, tenantId);

      res.json({
        success: true,
        data: {
          branchId,
          totalCameras: results.length,
          investigations: results
        }
      });
    } catch (error) {
      console.error('Error investigating branch outage:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to investigate branch outage'
      });
    }
  });

  /**
   * GET /v1/infrastructure/rca/camera/:cameraId/history
   * Get RCA correlation history for a camera
   */
  router.get('/rca/camera/:cameraId/history', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      const { cameraId } = req.params;
      const { limit = 10 } = req.query;
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const { InfrastructureRcaIntegrationService } = await import(
        '../../src/services/infrastructure/infrastructure-rca-integration.service.js'
      );
      const rcaService = new InfrastructureRcaIntegrationService(pool);

      const history = await rcaService.getCameraRcaHistory(cameraId, Number(limit));

      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      console.error('Error fetching camera RCA history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch camera RCA history'
      });
    }
  });

  /**
   * GET /v1/infrastructure/rca/branch/:branchId/statistics
   * Get RCA statistics for a branch
   */
  router.get('/rca/branch/:branchId/statistics', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      const { branchId } = req.params;
      const { days = 30 } = req.query;
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const { InfrastructureRcaIntegrationService } = await import(
        '../../src/services/infrastructure/infrastructure-rca-integration.service.js'
      );
      const rcaService = new InfrastructureRcaIntegrationService(pool);

      const stats = await rcaService.getBranchRcaStatistics(branchId, Number(days));

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error fetching branch RCA statistics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch branch RCA statistics'
      });
    }
  });

  /**
   * GET /v1/infrastructure/rca/incidents/active
   * Get active unified incidents
   */
  router.get('/rca/incidents/active', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      const { branchId, severity } = req.query;
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      let query = `
        SELECT * FROM vw_active_infrastructure_incidents
        WHERE tenant_id = $1
      `;
      const params: any[] = [tenantId];
      let paramIndex = 2;

      if (branchId) {
        query += ` AND branch_id = $${paramIndex}`;
        params.push(branchId);
        paramIndex++;
      }

      if (severity) {
        query += ` AND severity = $${paramIndex}`;
        params.push(severity);
        paramIndex++;
      }

      query += ` ORDER BY age_minutes ASC`;

      const result = await pool.query(query, params);

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching active incidents:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch active incidents'
      });
    }
  });

  /**
   * GET /v1/infrastructure/rca/camera/:cameraId/infrastructure-path
   * Get the complete infrastructure path for a camera
   */
  router.get('/rca/camera/:cameraId/infrastructure-path', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      const { cameraId } = req.params;
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const result = await pool.query(
        `SELECT * FROM get_camera_infrastructure_path($1)`,
        [cameraId]
      );

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching camera infrastructure path:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch camera infrastructure path'
      });
    }
  });

  return router;
}

export default createInfrastructureMonitoringRoutes;
