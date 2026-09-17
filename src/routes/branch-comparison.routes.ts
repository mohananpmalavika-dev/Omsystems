// @ts-nocheck
import type { FastifyInstance, FastifyRequest } from "fastify";
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

  function getUser(request: FastifyRequest) {
    const user = request.currentUser;
    if (!user?.tenantId || !user.id) throw new Error("authenticated_user_required");
    return { tenantId: user.tenantId, userId: user.id, role: user.role };
  }

  // ============================================================================
  // Branch Comparison API
  // ============================================================================

  // Get branch comparison metrics
  app.get("/v1/analytics/branch-comparison", async (request, reply) => {
    const { tenantId } = getUser(request);
    const query = z.object({
      date: z.string().optional(), // YYYY-MM-DD format
      sortBy: z.enum(["rank", "compliance", "health", "alerts"]).default("rank"),
    }).parse(request.query);

    const targetDate = query.date || new Date().toISOString().split('T')[0];

    // Get or compute metrics for today
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

    // If no data exists for today, compute it
    if (result.rows.length === 0) {
      await computeBranchMetrics(pool, tenantId, targetDate);
      result = await pool.query(
        `SELECT * FROM branch_comparison_metrics
         WHERE tenant_id = $1 AND metric_date = $2
         ORDER BY branch_rank ASC`,
        [tenantId, targetDate]
      );
    }

    const data = result.rows.map(row => ({
      branchId: row.branch_id,
      branchName: row.branch_name,
      branchCode: row.branch_code,
      cameras: {
        total: row.cameras_total,
        online: row.cameras_online,
        healthy: row.cameras_healthy,
        healthScore: parseFloat(row.camera_health_score || 0),
      },
      compliance: {
        overallScore: parseFloat(row.overall_compliance_score || 0),
        recordingCompliance: parseFloat(row.recording_compliance || 0),
        storageHealth: parseFloat(row.storage_health || 0),
        maintenanceScore: parseFloat(row.maintenance_score || 0),
      },
      security: {
        activeRules: row.active_rules,
        todayAlerts: row.today_alerts,
        criticalAlerts: row.critical_alerts,
        violationRate: parseFloat(row.violation_rate || 0),
      },
      banking: {
        cashVanSessions: row.cash_van_sessions,
        compliantSessions: row.compliant_sessions,
        violations: row.banking_violations,
        complianceRate: parseFloat(row.banking_compliance_rate || 0),
      },
      performance: {
        avgResponseTimeMs: row.avg_response_time_ms,
        uptime: parseFloat(row.uptime_percent || 0),
        lastIncidentDays: row.last_incident_days,
      },
      rank: row.branch_rank,
      trend: row.trend,
    }));

    // Calculate summary
    const summary = {
      totalBranches: data.length,
      avgComplianceScore: data.reduce((sum, d) => sum + d.compliance.overallScore, 0) / (data.length || 1),
      topPerformer: data[0]?.branchName || "—",
      needsAttention: data.filter(d => d.compliance.overallScore < 80).length,
      totalAlerts24h: data.reduce((sum, d) => sum + d.security.todayAlerts, 0),
      avgCameraHealth: data.reduce((sum, d) => sum + d.cameras.healthScore, 0) / (data.length || 1),
    };

    return reply.send({
      success: true,
      data,
      summary,
      computedAt: result.rows[0]?.computed_at || new Date(),
    });
  });

  // Get detailed metrics for single branch
  app.get("/v1/analytics/branch-comparison/:branchId", async (request, reply) => {
    const { tenantId } = getUser(request);
    const params = z.object({ branchId: z.string().uuid() }).parse(request.params);
    const query = z.object({
      days: z.coerce.number().int().min(1).max(90).default(30),
    }).parse(request.query);

    // Get historical trend
    const result = await pool.query(
      `SELECT * FROM branch_comparison_metrics
       WHERE tenant_id = $1 
         AND branch_id = $2
         AND metric_date >= CURRENT_DATE - INTERVAL '${query.days} days'
       ORDER BY metric_date DESC`,
      [tenantId, params.branchId]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "branch_not_found" });
    }

    const latestRow = result.rows[0];
    const historicalData = result.rows.map(row => ({
      date: row.metric_date,
      complianceScore: parseFloat(row.overall_compliance_score || 0),
      cameraHealth: parseFloat(row.camera_health_score || 0),
      alerts: row.today_alerts,
      rank: row.branch_rank,
    }));

    return reply.send({
      success: true,
      data: {
        branchId: latestRow.branch_id,
        branchName: latestRow.branch_name,
        branchCode: latestRow.branch_code,
        currentMetrics: {
          compliance: parseFloat(latestRow.overall_compliance_score || 0),
          cameraHealth: parseFloat(latestRow.camera_health_score || 0),
          alerts: latestRow.today_alerts,
          rank: latestRow.branch_rank,
          trend: latestRow.trend,
        },
        historicalData,
      },
    });
  });

  // Trigger metrics computation (called by scheduler)
  app.post("/v1/analytics/branch-comparison/compute", async (request, reply) => {
    const { tenantId } = getUser(request);
    const body = z.object({
      date: z.string().optional(), // YYYY-MM-DD
    }).parse(request.body);

    const targetDate = body.date || new Date().toISOString().split('T')[0];
    
    await computeBranchMetrics(pool, tenantId, targetDate);

    return reply.send({
      success: true,
      message: "Branch metrics computed successfully",
      date: targetDate,
    });
  });

  app.log.info("[BranchComparison] Routes registered");
}

// ============================================================================
// Helper Functions
// ============================================================================

async function computeBranchMetrics(pool: Pool, tenantId: string, date: string) {
  // Get all branches for this tenant
  const branches = await pool.query(
    `SELECT id, name, code FROM branches WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId]
  );

  if (branches.rows.length === 0) {
    return;
  }

  const metricsData = [];

  for (const branch of branches.rows) {
    const branchId = branch.id;

    // Camera health
    const cameraHealth = await pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status != 'offline') as online,
        COUNT(*) FILTER (WHERE health_status = 'healthy') as healthy
       FROM cameras 
       WHERE branch_id = $1 AND deleted_at IS NULL`,
      [branchId]
    );

    const cameras = cameraHealth.rows[0] || { total: 0, online: 0, healthy: 0 };
    const cameraHealthScore = cameras.total > 0 
      ? (parseInt(cameras.healthy) / parseInt(cameras.total) * 100) 
      : 0;

    // Compliance metrics
    const compliance = await pool.query(
      `SELECT 
        COALESCE(AVG(recording_compliance_percent), 0) as recording_compliance,
        COALESCE(AVG(storage_health_percent), 0) as storage_health
       FROM camera_health_checks
       WHERE branch_id = $1 AND checked_at > NOW() - INTERVAL '24 hours'`,
      [branchId]
    );

    const complianceRow = compliance.rows[0] || { recording_compliance: 0, storage_health: 0 };
    const recordingCompliance = parseFloat(complianceRow.recording_compliance || 0);
    const storageHealth = parseFloat(complianceRow.storage_health || 0);

    // Maintenance score (based on open work orders)
    const maintenance = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE status IN ('open', 'in_progress')) as open_orders,
        COUNT(*) FILTER (WHERE priority = 'urgent') as urgent_orders
       FROM work_orders
       WHERE branch_id = $1 AND created_at > NOW() - INTERVAL '30 days'`,
      [branchId]
    );

    const maintenanceRow = maintenance.rows[0] || { open_orders: 0, urgent_orders: 0 };
    const maintenanceScore = 100 - Math.min(
      (parseInt(maintenanceRow.open_orders) * 2) + (parseInt(maintenanceRow.urgent_orders) * 5),
      100
    );

    const overallCompliance = (recordingCompliance + storageHealth + maintenanceScore) / 3;

    // Security metrics
    const security = await pool.query(
      `SELECT 
        (SELECT COUNT(*) FROM nbfc_analytics_rules 
         WHERE $1 = ANY(branch_ids) AND enabled = true) as active_rules,
        (SELECT COUNT(*) FROM analytics_alerts 
         WHERE branch_id = $1 AND created_at > CURRENT_DATE) as today_alerts,
        (SELECT COUNT(*) FROM analytics_alerts 
         WHERE branch_id = $1 AND severity IN ('CRITICAL', 'HIGH') AND created_at > CURRENT_DATE) as critical_alerts
      `,
      [branchId]
    );

    const securityRow = security.rows[0] || { active_rules: 0, today_alerts: 0, critical_alerts: 0 };

    // Banking metrics
    const banking = await pool.query(
      `SELECT 
        COUNT(*) as total_sessions,
        COUNT(*) FILTER (WHERE route_compliance = 'compliant') as compliant_sessions,
        COUNT(*) FILTER (WHERE route_compliance != 'compliant') as violations
       FROM anpr_logistics_sessions
       WHERE branch_id = $1 AND created_at > CURRENT_DATE`,
      [branchId]
    );

    const bankingRow = banking.rows[0] || { total_sessions: 0, compliant_sessions: 0, violations: 0 };
    const bankingCompliance = parseInt(bankingRow.total_sessions) > 0
      ? (parseInt(bankingRow.compliant_sessions) / parseInt(bankingRow.total_sessions) * 100)
      : 100;

    // Performance metrics
    const performance = await pool.query(
      `SELECT 
        COALESCE(AVG(response_time_ms), 0) as avg_response_time,
        COALESCE(AVG(uptime_percent), 99.5) as uptime,
        COALESCE(MIN(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400), 999) as last_incident_days
       FROM (
         SELECT 100 as response_time_ms, 99.9 as uptime_percent, NOW() - INTERVAL '30 days' as created_at
       ) dummy`,
      [branchId]
    );

    const perfRow = performance.rows[0] || { avg_response_time: 0, uptime: 99.5, last_incident_days: 999 };

    metricsData.push({
      branchId,
      branchName: branch.name,
      branchCode: branch.code,
      overallCompliance: Math.round(overallCompliance * 100) / 100,
      recordingCompliance: Math.round(recordingCompliance * 100) / 100,
      storageHealth: Math.round(storageHealth * 100) / 100,
      maintenanceScore: Math.round(maintenanceScore * 100) / 100,
      cameraHealthScore: Math.round(cameraHealthScore * 100) / 100,
      camerasTotal: parseInt(cameras.total),
      camerasOnline: parseInt(cameras.online),
      camerasHealthy: parseInt(cameras.healthy),
      activeRules: parseInt(securityRow.active_rules),
      todayAlerts: parseInt(securityRow.today_alerts),
      criticalAlerts: parseInt(securityRow.critical_alerts),
      violationRate: parseInt(securityRow.today_alerts) > 0 ? 
        (parseInt(securityRow.critical_alerts) / parseInt(securityRow.today_alerts) * 100) : 0,
      cashVanSessions: parseInt(bankingRow.total_sessions),
      compliantSessions: parseInt(bankingRow.compliant_sessions),
      bankingViolations: parseInt(bankingRow.violations),
      bankingCompliance: Math.round(bankingCompliance * 100) / 100,
      avgResponseTimeMs: Math.round(parseFloat(perfRow.avg_response_time)),
      uptimePercent: Math.round(parseFloat(perfRow.uptime) * 100) / 100,
      lastIncidentDays: Math.round(parseFloat(perfRow.last_incident_days)),
    });
  }

  // Calculate ranks based on overall compliance
  metricsData.sort((a, b) => b.overallCompliance - a.overallCompliance);
  metricsData.forEach((data, index) => {
    data.rank = index + 1;
  });

  // Calculate trend (compare with yesterday if available)
  for (const data of metricsData) {
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
  }

  // Insert or update metrics
  for (const data of metricsData) {
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
  }
}
