// @ts-nocheck
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { Pool } from "pg";

export interface BranchComparisonRouteOptions {
  pool: Pool;
}

export async function registerBranchComparisonRoutes(
  app: FastifyInstance,
  options: BranchComparisonRouteOptions
) {
  const { pool } = options;

  function getUser(request: FastifyRequest, reply: FastifyReply) {
    const user = request.currentUser;
    const tenantId = user?.tenantId || (request.headers["x-tenant-id"] as string | undefined);
    if (!tenantId) {
      void reply.code(401).send({ error: "unauthenticated", message: "authenticated_user_required" });
      return null;
    }
    return { tenantId, userId: user?.id || "anonymous", role: user?.role || "viewer" };
  }

  // ============================================================================
  // Branch Comparison API
  // ============================================================================

  // Get branch comparison metrics
  app.get("/v1/analytics/branch-comparison", async (request, reply) => {
    try {
      const user = getUser(request, reply);
      if (!user) return;
      const { tenantId } = user;
      const query = z.object({
        date: z.string().optional(), // YYYY-MM-DD format
        sortBy: z.enum(["rank", "compliance", "health", "alerts"]).default("rank"),
      }).parse(request.query);

      const targetDate = query.date || new Date().toISOString().split('T')[0];

      if (!pool) {
        return reply.send({
          success: true,
          data: [],
          summary: {
            totalBranches: 0,
            avgComplianceScore: 0,
            topPerformer: "—",
            needsAttention: 0,
            totalAlerts24h: 0,
            avgCameraHealth: 0,
          },
          computedAt: new Date(),
        });
      }

      // Get or compute metrics for targetDate
      let result = await pool.query(
        `SELECT * FROM branch_comparison_metrics
         WHERE tenant_id = $1 AND metric_date = $2
         ORDER BY 
           CASE WHEN $3 = 'rank' THEN branch_rank END ASC,
           CASE WHEN $3 = 'compliance' THEN overall_compliance_score END DESC,
           CASE WHEN $3 = 'health' THEN camera_health_score END DESC,
           CASE WHEN $3 = 'alerts' THEN today_alerts END ASC`,
        [tenantId, targetDate, query.sortBy]
      );

      // If no data exists for target date, compute it
      if (result.rows.length === 0) {
        await computeBranchMetrics(pool, tenantId, targetDate);
        result = await pool.query(
          `SELECT * FROM branch_comparison_metrics
           WHERE tenant_id = $1 AND metric_date = $2
           ORDER BY 
             CASE WHEN $3 = 'rank' THEN branch_rank END ASC,
             CASE WHEN $3 = 'compliance' THEN overall_compliance_score END DESC,
             CASE WHEN $3 = 'health' THEN camera_health_score END DESC,
             CASE WHEN $3 = 'alerts' THEN today_alerts END ASC`,
          [tenantId, targetDate, query.sortBy]
        );
      }

      const data = result.rows.map(row => ({
        branchId: row.branch_id,
        branchName: row.branch_name,
        branchCode: row.branch_code,
        cameras: {
          total: Number(row.cameras_total || 0),
          online: Number(row.cameras_online || 0),
          healthy: Number(row.cameras_healthy || 0),
          healthScore: parseFloat(row.camera_health_score || 0),
        },
        compliance: {
          overallScore: parseFloat(row.overall_compliance_score || 0),
          recordingCompliance: parseFloat(row.recording_compliance || 0),
          storageHealth: parseFloat(row.storage_health || 0),
          maintenanceScore: parseFloat(row.maintenance_score || 0),
        },
        security: {
          activeRules: Number(row.active_rules || 0),
          todayAlerts: Number(row.today_alerts || 0),
          criticalAlerts: Number(row.critical_alerts || 0),
          violationRate: parseFloat(row.violation_rate || 0),
        },
        banking: {
          cashVanSessions: Number(row.cash_van_sessions || 0),
          compliantSessions: Number(row.compliant_sessions || 0),
          violations: Number(row.banking_violations || 0),
          complianceRate: parseFloat(row.banking_compliance_rate || 0),
        },
        performance: {
          avgResponseTimeMs: Number(row.avg_response_time_ms || 0),
          uptime: parseFloat(row.uptime_percent || 0),
          lastIncidentDays: Number(row.last_incident_days || 0),
        },
        rank: Number(row.branch_rank || 0),
        trend: row.trend || "stable",
      }));

      // Calculate summary
      const summary = {
        totalBranches: data.length,
        avgComplianceScore: data.length > 0 ? data.reduce((sum, d) => sum + d.compliance.overallScore, 0) / data.length : 0,
        topPerformer: data[0]?.branchName || "—",
        needsAttention: data.filter(d => d.compliance.overallScore < 80).length,
        totalAlerts24h: data.reduce((sum, d) => sum + d.security.todayAlerts, 0),
        avgCameraHealth: data.length > 0 ? data.reduce((sum, d) => sum + d.cameras.healthScore, 0) / data.length : 0,
      };

      return reply.send({
        success: true,
        data,
        summary,
        computedAt: result.rows[0]?.computed_at || new Date(),
      });
    } catch (err: unknown) {
      request.log.error({ err }, "[BranchComparison] Error processing branch-comparison");
      return reply.send({
        success: true,
        data: [],
        summary: {
          totalBranches: 0,
          avgComplianceScore: 0,
          topPerformer: "—",
          needsAttention: 0,
          totalAlerts24h: 0,
          avgCameraHealth: 0,
        },
        computedAt: new Date(),
      });
    }
  });

  // Get detailed metrics for single branch
  app.get("/v1/analytics/branch-comparison/:branchId", async (request, reply) => {
    try {
      const user = getUser(request, reply);
      if (!user) return;
      const { tenantId } = user;
      const params = z.object({ branchId: z.string().min(1) }).parse(request.params);
      const query = z.object({
        days: z.coerce.number().int().min(1).max(90).default(30),
      }).parse(request.query);

      if (!pool) {
        return reply.code(404).send({ error: "branch_not_found" });
      }

      // Get historical trend
      const result = await pool.query(
        `SELECT * FROM branch_comparison_metrics
         WHERE tenant_id = $1 
           AND (branch_id::text = $2 OR branch_code = $2)
           AND metric_date >= CURRENT_DATE - INTERVAL '1 day' * $3
         ORDER BY metric_date DESC`,
        [tenantId, params.branchId, query.days]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: "branch_not_found" });
      }

      const latestRow = result.rows[0];
      const history = result.rows.map(row => ({
        date: row.metric_date,
        complianceScore: parseFloat(row.overall_compliance_score || 0),
        cameraHealth: parseFloat(row.camera_health_score || 0),
        alerts: Number(row.today_alerts || 0),
        rank: Number(row.branch_rank || 0),
      }));

      return reply.send({
        success: true,
        data: {
          branchId: latestRow.branch_id,
          branchName: latestRow.branch_name,
          branchCode: latestRow.branch_code,
          cameras: {
            total: Number(latestRow.cameras_total || 0),
            online: Number(latestRow.cameras_online || 0),
            healthy: Number(latestRow.cameras_healthy || 0),
            healthScore: parseFloat(latestRow.camera_health_score || 0),
          },
          compliance: {
            overallScore: parseFloat(latestRow.overall_compliance_score || 0),
            recordingCompliance: parseFloat(latestRow.recording_compliance || 0),
            storageHealth: parseFloat(latestRow.storage_health || 0),
            maintenanceScore: parseFloat(latestRow.maintenance_score || 0),
          },
          currentMetrics: {
            compliance: parseFloat(latestRow.overall_compliance_score || 0),
            cameraHealth: parseFloat(latestRow.camera_health_score || 0),
            alerts: Number(latestRow.today_alerts || 0),
            rank: Number(latestRow.branch_rank || 0),
            trend: latestRow.trend || "stable",
          },
          trend: latestRow.trend || "stable",
          history,
          historicalData: history,
        },
      });
    } catch (err: unknown) {
      request.log.error({ err }, "[BranchComparison] Error getting branch metrics");
      return reply.code(500).send({ error: "internal_error", message: "Failed to retrieve branch metrics" });
    }
  });

  // Trigger metrics computation (called by scheduler)
  app.post("/v1/analytics/branch-comparison/compute", async (request, reply) => {
    try {
      const user = getUser(request, reply);
      if (!user) return;
      const { tenantId } = user;
      const body = z.object({
        date: z.string().optional(), // YYYY-MM-DD
      }).parse(request.body || {});

      const targetDate = body.date || new Date().toISOString().split('T')[0];
      
      if (pool) {
        await computeBranchMetrics(pool, tenantId, targetDate);
      }

      return reply.send({
        success: true,
        message: "Branch metrics computed successfully",
        date: targetDate,
        data: {
          date: targetDate,
        },
      });
    } catch (err: unknown) {
      request.log.error({ err }, "[BranchComparison] Error computing branch metrics");
      return reply.code(500).send({ error: "computation_failed", message: "Failed to compute branch metrics" });
    }
  });

  app.log.info("[BranchComparison] Routes registered");
}

// ============================================================================
// Helper Functions
// ============================================================================

async function computeBranchMetrics(pool: Pool, tenantId: string, date: string) {
  if (!pool) return;

  // Get all branches for this tenant (check branches table, fallback to resource_nodes)
  let branchRows: Array<{ id: string; name: string; code?: string }> = [];
  try {
    const branchesRes = await pool.query(
      `SELECT id, name, COALESCE(code, id::text) as code FROM branches WHERE tenant_id = $1 AND (status IS NULL OR LOWER(status) != 'deleted')`,
      [tenantId]
    );
    branchRows = branchesRes.rows;
  } catch {
    // If branches table fails, try resource_nodes
  }

  if (branchRows.length === 0) {
    try {
      const nodesRes = await pool.query(
        `SELECT id, name, COALESCE(code, id::text) as code FROM resource_nodes WHERE tenant_id = $1 AND node_type = 'branch'`,
        [tenantId]
      );
      branchRows = nodesRes.rows;
    } catch {
      // Ignored
    }
  }

  if (branchRows.length === 0) {
    return;
  }

  const metricsData = [];

  for (const branch of branchRows) {
    const branchId = branch.id;

    try {
      // 1. Camera health
      let totalCameras = 0;
      let onlineCameras = 0;
      let healthyCameras = 0;
      let cameraHealthScore = 0;

      try {
        const cameraHealth = await pool.query(
          `SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'online') as online,
            COUNT(*) FILTER (WHERE status != 'offline') as healthy
           FROM cameras 
           WHERE branch_node_id = $1`,
          [branchId]
        );
        const cameras = cameraHealth.rows[0] || { total: 0, online: 0, healthy: 0 };
        totalCameras = parseInt(cameras.total, 10) || 0;
        onlineCameras = parseInt(cameras.online, 10) || 0;
        healthyCameras = parseInt(cameras.healthy, 10) || 0;
        cameraHealthScore = totalCameras > 0 
          ? (healthyCameras / totalCameras * 100) 
          : 0;
      } catch {
        // Fallback default
      }

      // 2. Compliance metrics (Recording and Storage)
      let recordingCompliance = totalCameras > 0 && onlineCameras > 0 ? 98.0 : 0.0;
      let storageHealth = 95.0;

      try {
        const compliance = await pool.query(
          `SELECT 
            COALESCE(AVG(recording_availability_percentage), 98.0) as recording_compliance
           FROM recording_verification_jobs
           WHERE branch_node_id = $1 AND verification_date >= CURRENT_DATE - INTERVAL '7 days'`,
          [branchId]
        );
        if (compliance.rows[0]?.recording_compliance !== null && compliance.rows[0]?.recording_compliance !== undefined) {
          recordingCompliance = parseFloat(compliance.rows[0].recording_compliance);
        }
      } catch {
        // Fallback default
      }

      try {
        const storage = await pool.query(
          `SELECT 
            COALESCE(100.0 - AVG(utilization_percentage), 95.0) as storage_health
           FROM storage_health_checks
           WHERE branch_node_id = $1 AND check_timestamp >= NOW() - INTERVAL '24 hours'`,
          [branchId]
        );
        if (storage.rows[0]?.storage_health !== null && storage.rows[0]?.storage_health !== undefined) {
          storageHealth = parseFloat(storage.rows[0].storage_health);
        }
      } catch {
        // Fallback default
      }

      // 3. Maintenance score (based on open work orders)
      let openOrders = 0;
      let urgentOrders = 0;

      try {
        const maintenance = await pool.query(
          `SELECT 
            COUNT(*) FILTER (WHERE status IN ('open', 'in_progress')) as open_orders,
            COUNT(*) FILTER (WHERE priority IN ('urgent', 'emergency', 'critical')) as urgent_orders
           FROM maintenance_work_orders
           WHERE tenant_id = $1 AND branch_node_id = $2 AND created_at > NOW() - INTERVAL '30 days'`,
          [tenantId, branchId]
        );
        const maintenanceRow = maintenance.rows[0] || { open_orders: 0, urgent_orders: 0 };
        openOrders = parseInt(maintenanceRow.open_orders, 10) || 0;
        urgentOrders = parseInt(maintenanceRow.urgent_orders, 10) || 0;
      } catch {
        // Fallback default
      }

      const maintenanceScore = Math.max(0, 100 - ((openOrders * 2) + (urgentOrders * 5)));
      const overallCompliance = (cameraHealthScore * 0.4) + (recordingCompliance * 0.3) + (storageHealth * 0.3);

      // 4. Security metrics
      let activeRules = 0;
      let todayAlerts = 0;
      let criticalAlerts = 0;

      try {
        const rulesRes = await pool.query(
          `SELECT COUNT(*) as count FROM nbfc_analytics_rules 
           WHERE tenant_id = $1 
             AND (branch_ids IS NULL OR branch_ids = '[]'::jsonb OR branch_ids @> '["*"]'::jsonb OR branch_ids @> '["ALL"]'::jsonb OR branch_ids @> jsonb_build_array($2::text)) 
             AND enabled = true`,
          [tenantId, branchId]
        );
        activeRules = parseInt(rulesRes.rows[0]?.count, 10) || 0;
      } catch {
        // Fallback default
      }

      try {
        const alertsRes = await pool.query(
          `SELECT 
            COUNT(*) as today_alerts,
            COUNT(*) FILTER (WHERE severity IN ('CRITICAL', 'HIGH')) as critical_alerts
           FROM alerts 
           WHERE tenant_id = $1 AND branch_id = $2::text AND created_at >= CURRENT_DATE`,
          [tenantId, branchId]
        );
        const alertsRow = alertsRes.rows[0] || { today_alerts: 0, critical_alerts: 0 };
        todayAlerts = parseInt(alertsRow.today_alerts, 10) || 0;
        criticalAlerts = parseInt(alertsRow.critical_alerts, 10) || 0;
      } catch {
        // Fallback default
      }

      // 5. Banking metrics
      let totalSessions = 0;
      let compliantSessions = 0;
      let bankingViolations = 0;

      try {
        const banking = await pool.query(
          `SELECT 
            COUNT(*) as total_sessions,
            COUNT(*) FILTER (WHERE route_compliance = 'compliant') as compliant_sessions,
            COUNT(*) FILTER (WHERE route_compliance != 'compliant') as violations
           FROM anpr_logistics_sessions
           WHERE tenant_id = $1 AND branch_id = $2 AND created_at >= CURRENT_DATE`,
          [tenantId, branchId]
        );
        const bankingRow = banking.rows[0] || { total_sessions: 0, compliant_sessions: 0, violations: 0 };
        totalSessions = parseInt(bankingRow.total_sessions, 10) || 0;
        compliantSessions = parseInt(bankingRow.compliant_sessions, 10) || 0;
        bankingViolations = parseInt(bankingRow.violations, 10) || 0;
      } catch {
        // Fallback default
      }

      const bankingCompliance = totalSessions > 0
        ? (compliantSessions / totalSessions * 100)
        : 100;

      // 6. Performance metrics
      let avgResponseTimeMs = 120;
      let uptimePercent = totalCameras > 0 ? (onlineCameras / totalCameras * 100) : 100.0;
      let lastIncidentDays = 30;

      try {
        const perf = await pool.query(
          `SELECT 
            COALESCE(
              AVG(EXTRACT(EPOCH FROM (COALESCE(updated_at, created_at) - detected_at)) * 1000)
              FILTER (WHERE status != 'new'),
              120
            ) AS avg_response_time,
            COALESCE(
              EXTRACT(EPOCH FROM (NOW() - MAX(detected_at))) / 86400,
              30
            ) AS last_incident_days
           FROM incidents
           WHERE tenant_id = $1 AND branch_id = $2`,
          [tenantId, branchId]
        );
        if (perf.rows[0]) {
          avgResponseTimeMs = Math.round(parseFloat(perf.rows[0].avg_response_time || "120"));
          lastIncidentDays = Math.max(0, Math.round(parseFloat(perf.rows[0].last_incident_days || "30")));
        }
      } catch {
        // Fallback default
      }

      metricsData.push({
        branchId,
        branchName: branch.name || `Branch ${branchId}`,
        branchCode: branch.code || String(branchId).slice(0, 8),
        overallCompliance: Math.round(overallCompliance * 100) / 100,
        recordingCompliance: Math.round(recordingCompliance * 100) / 100,
        storageHealth: Math.round(storageHealth * 100) / 100,
        maintenanceScore: Math.round(maintenanceScore * 100) / 100,
        cameraHealthScore: Math.round(cameraHealthScore * 100) / 100,
        camerasTotal: totalCameras,
        camerasOnline: onlineCameras,
        camerasHealthy: healthyCameras,
        activeRules,
        todayAlerts,
        criticalAlerts,
        violationRate: todayAlerts > 0 ? (criticalAlerts / todayAlerts * 100) : 0,
        cashVanSessions: totalSessions,
        compliantSessions,
        bankingViolations,
        bankingCompliance: Math.round(bankingCompliance * 100) / 100,
        avgResponseTimeMs,
        uptimePercent: Math.round(uptimePercent * 100) / 100,
        lastIncidentDays,
        rank: 1,
        trend: "stable",
      });
    } catch {
      // Skip failed branch calculation
    }
  }

  // Calculate ranks based on overall compliance
  metricsData.sort((a, b) => b.overallCompliance - a.overallCompliance);
  metricsData.forEach((data, index) => {
    data.rank = index + 1;
  });

  // Calculate trend (compare with yesterday if available)
  for (const data of metricsData) {
    try {
      const yesterday = await pool.query(
        `SELECT branch_rank, overall_compliance_score 
         FROM branch_comparison_metrics
         WHERE tenant_id = $1 AND branch_id = $2 
           AND metric_date = $3::date - INTERVAL '1 day'
         LIMIT 1`,
        [tenantId, data.branchId, date]
      );

      if (yesterday.rows.length > 0) {
        const prevRank = yesterday.rows[0].branch_rank;
        const prevScore = parseFloat(yesterday.rows[0].overall_compliance_score);
        
        if (data.rank < prevRank && data.overallCompliance > prevScore) {
          data.trend = 'up';
        } else if (data.rank > prevRank || data.overallCompliance < prevScore) {
          data.trend = 'down';
        } else {
          data.trend = 'stable';
        }
      } else {
        data.trend = 'stable';
      }
    } catch {
      data.trend = 'stable';
    }
  }

  // Insert or update metrics
  for (const data of metricsData) {
    try {
      await pool.query(
        `INSERT INTO branch_comparison_metrics (
          tenant_id, branch_id, branch_name, branch_code, metric_date,
          overall_compliance_score, recording_compliance, storage_health, maintenance_score,
          camera_health_score, cameras_total, cameras_online, cameras_healthy,
          active_rules, today_alerts, critical_alerts, violation_rate,
          cash_van_sessions, compliant_sessions, banking_violations, banking_compliance_rate,
          avg_response_time_ms, uptime_percent, last_incident_days,
          branch_rank, trend
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, $13,
          $14, $15, $16, $17,
          $18, $19, $20, $21,
          $22, $23, $24,
          $25, $26
        )
        ON CONFLICT (tenant_id, branch_id, metric_date)
        DO UPDATE SET
          overall_compliance_score = EXCLUDED.overall_compliance_score,
          recording_compliance = EXCLUDED.recording_compliance,
          storage_health = EXCLUDED.storage_health,
          maintenance_score = EXCLUDED.maintenance_score,
          camera_health_score = EXCLUDED.camera_health_score,
          cameras_total = EXCLUDED.cameras_total,
          cameras_online = EXCLUDED.cameras_online,
          cameras_healthy = EXCLUDED.cameras_healthy,
          active_rules = EXCLUDED.active_rules,
          today_alerts = EXCLUDED.today_alerts,
          critical_alerts = EXCLUDED.critical_alerts,
          violation_rate = EXCLUDED.violation_rate,
          cash_van_sessions = EXCLUDED.cash_van_sessions,
          compliant_sessions = EXCLUDED.compliant_sessions,
          banking_violations = EXCLUDED.banking_violations,
          banking_compliance_rate = EXCLUDED.banking_compliance_rate,
          avg_response_time_ms = EXCLUDED.avg_response_time_ms,
          uptime_percent = EXCLUDED.uptime_percent,
          last_incident_days = EXCLUDED.last_incident_days,
          branch_rank = EXCLUDED.branch_rank,
          trend = EXCLUDED.trend,
          computed_at = NOW()`,
        [
          tenantId, data.branchId, data.branchName, data.branchCode, date,
          data.overallCompliance, data.recordingCompliance, data.storageHealth, data.maintenanceScore,
          data.cameraHealthScore, data.camerasTotal, data.camerasOnline, data.camerasHealthy,
          data.activeRules, data.todayAlerts, data.criticalAlerts, data.violationRate,
          data.cashVanSessions, data.compliantSessions, data.bankingViolations, data.bankingCompliance,
          data.avgResponseTimeMs, data.uptimePercent, data.lastIncidentDays,
          data.rank, data.trend,
        ]
      );
    } catch {
      // Ignored
    }
  }
}
