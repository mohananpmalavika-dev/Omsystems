/**
 * Historical Trends API
 * 
 * Provides 6-month historical trend data for all MIS reports
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Pool } from 'pg';
import type { ControlPlaneStore } from '../../control-plane-store.js';
import { activeResourceNode } from '../../database/active-resource.js';

// ============================================================================
// REQUEST VALIDATION
// ============================================================================

const trendsQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
  reportType: z.enum([
    'executive-kpi',
    'financial',
    'benchmarking',
    'compliance'
  ]),
});

// ============================================================================
// TREND CALCULATORS
// ============================================================================

/**
 * Calculate Executive KPI trends
 */
async function getExecutiveKPITrends(
  pool: Pool,
  tenantId: string,
  months: number,
  branchIds: string[],
): Promise<any[]> {
  const query = `
    WITH monthly_data AS (
      SELECT DATE_TRUNC('month', detected_at AT TIME ZONE 'Asia/Kolkata') AS month,
        COUNT(*) AS total_incidents,
        COUNT(*) FILTER (WHERE severity = 'P1') AS p1_incidents,
        COUNT(*) FILTER (WHERE status IN ('resolved', 'closed')) AS resolved_incidents,
        AVG(EXTRACT(EPOCH FROM (acknowledged_at - detected_at)) / 60)
          FILTER (WHERE acknowledged_at >= detected_at) AS avg_response_time_min
      FROM incidents i
      LEFT JOIN LATERAL (
        SELECT MIN(history.created_at) AS acknowledged_at FROM incident_status_history history
        WHERE history.incident_id = i.id AND history.status = 'acknowledged'
      ) ack ON true
      WHERE tenant_id = $1 AND branch_id = ANY($3::uuid[])
        AND detected_at >= NOW() - INTERVAL '1 month' * $2 AND detected_at <= NOW()
      GROUP BY 1
    ), monthly_cameras AS (
      SELECT DATE_TRUNC('month', summary_date)::timestamp AS month,
        COUNT(DISTINCT camera_id) AS total_cameras,
        SUM(online_minutes + degraded_minutes)::numeric AS available_minutes,
        SUM(online_minutes + degraded_minutes + offline_minutes) AS measured_minutes
      FROM camera_health_daily
      WHERE tenant_id = $1 AND branch_node_id = ANY($3::uuid[])
        AND summary_date >= (NOW() - INTERVAL '1 month' * $2)::date AND summary_date <= CURRENT_DATE
      GROUP BY 1
    )
    SELECT TO_CHAR(COALESCE(md.month, mc.month), 'YYYY-MM') AS month,
      COALESCE(md.total_incidents, 0) AS incidents,
      COALESCE(md.p1_incidents, 0) AS p1_threats,
      COALESCE(md.resolved_incidents, 0) AS resolved,
      ROUND(md.avg_response_time_min, 1) AS avg_response_min,
      NULL::int AS online_cameras,
      mc.total_cameras,
      ROUND(mc.available_minutes / NULLIF(mc.measured_minutes, 0) * 100, 1) AS uptime_percent,
      NULL::numeric AS security_score
    FROM monthly_data md FULL OUTER JOIN monthly_cameras mc ON md.month = mc.month
    ORDER BY COALESCE(md.month, mc.month) DESC LIMIT $2
  `;
  
  const result = await pool.query(query, [tenantId, months, branchIds]);
  return result.rows.reverse(); // Oldest first
}

/**
 * Calculate Financial trends
 */
async function getFinancialTrends(
  pool: Pool,
  tenantId: string,
  months: number,
  branchIds: string[],
): Promise<any[]> {
  const query = `
    WITH monthly_maintenance AS (
      SELECT DATE_TRUNC('month', created_at AT TIME ZONE 'Asia/Kolkata') AS month,
        SUM(cost) AS total_cost, COUNT(*) AS maintenance_count
      FROM work_orders
      WHERE tenant_id = $1 AND branch_node_id = ANY($3::uuid[])
        AND created_at >= NOW() - INTERVAL '1 month' * $2 AND created_at <= NOW()
      GROUP BY 1
    ), monthly_incidents AS (
      SELECT DATE_TRUNC('month', detected_at AT TIME ZONE 'Asia/Kolkata') AS month, COUNT(*) AS incident_count
      FROM incidents
      WHERE tenant_id = $1 AND branch_id = ANY($3::uuid[])
        AND detected_at >= NOW() - INTERVAL '1 month' * $2 AND detected_at <= NOW()
      GROUP BY 1
    )
    SELECT TO_CHAR(COALESCE(mm.month, mi.month), 'YYYY-MM') AS month,
      mm.total_cost AS opex, COALESCE(mm.maintenance_count, 0) AS maintenance_count,
      COALESCE(mi.incident_count, 0) AS incidents,
      NULL::numeric AS capex, mm.total_cost AS total_cost
    FROM monthly_maintenance mm FULL OUTER JOIN monthly_incidents mi ON mm.month = mi.month
    ORDER BY COALESCE(mm.month, mi.month) DESC LIMIT $2
  `;
  
  const result = await pool.query(query, [tenantId, months, branchIds]);
  return result.rows.reverse();
}

/**
 * Calculate Benchmarking trends (top 5 branches)
 */
async function getBenchmarkingTrends(
  pool: Pool,
  tenantId: string,
  months: number,
  branchIds: string[],
): Promise<any[]> {
  const query = `
    WITH monthly_incidents AS (
      SELECT branch_id, DATE_TRUNC('month', detected_at AT TIME ZONE 'Asia/Kolkata') AS month,
        COUNT(*) AS incidents, COUNT(*) FILTER (WHERE severity = 'P1') AS p1_incidents
      FROM incidents
      WHERE tenant_id = $1 AND branch_id = ANY($3::uuid[])
        AND detected_at >= NOW() - INTERVAL '1 month' * $2 AND detected_at <= NOW()
      GROUP BY 1, 2
    ), monthly_cameras AS (
      SELECT branch_node_id AS branch_id, DATE_TRUNC('month', summary_date)::timestamp AS month,
        SUM(online_minutes + degraded_minutes)::numeric AS available_minutes,
        SUM(online_minutes + degraded_minutes + offline_minutes) AS measured_minutes
      FROM camera_health_daily
      WHERE tenant_id = $1 AND branch_node_id = ANY($3::uuid[])
        AND summary_date >= (NOW() - INTERVAL '1 month' * $2)::date AND summary_date <= CURRENT_DATE
      GROUP BY 1, 2
    ), scored_branches AS (
      SELECT COALESCE(i.branch_id, c.branch_id) AS branch_id, COALESCE(i.month, c.month) AS month,
        CASE WHEN c.measured_minutes > 0 THEN GREATEST(0, LEAST(100,
          70 + c.available_minutes / c.measured_minutes * 30 - COALESCE(i.p1_incidents, 0) * 10 - COALESCE(i.incidents, 0) * 2
        )) END AS overall_score
      FROM monthly_incidents i FULL OUTER JOIN monthly_cameras c ON c.branch_id = i.branch_id AND c.month = i.month
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY month ORDER BY overall_score DESC NULLS LAST, branch_id) AS rank
      FROM scored_branches
    )
    SELECT TO_CHAR(r.month, 'YYYY-MM') AS month, n.name AS branch_name, ROUND(r.overall_score, 1) AS score
    FROM ranked r JOIN resource_nodes n ON n.id = r.branch_id AND n.tenant_id = $1
    WHERE r.rank <= 5 AND ${activeResourceNode('n')}
    ORDER BY r.month DESC, r.overall_score DESC NULLS LAST, r.branch_id
  `;
  
  const result = await pool.query(query, [tenantId, months, branchIds]);
  return result.rows.reverse();
}

/**
 * Calculate Compliance trends
 */
async function getComplianceTrends(
  pool: Pool,
  tenantId: string,
  months: number,
  branchIds: string[],
): Promise<any[]> {
  const query = `
    WITH monthly_compliance AS (
      SELECT DATE_TRUNC('month', summary_date)::timestamp AS month,
        COUNT(*) FILTER (WHERE retention_compliant IS TRUE) AS compliant_samples,
        COUNT(*) FILTER (WHERE retention_compliant IS NOT NULL) AS measured_samples,
        COUNT(DISTINCT camera_id) AS total_cameras
      FROM recording_status_daily
      WHERE tenant_id = $1 AND branch_node_id = ANY($3::uuid[])
        AND summary_date >= (NOW() - INTERVAL '1 month' * $2)::date AND summary_date <= CURRENT_DATE
      GROUP BY 1
    )
    SELECT TO_CHAR(month, 'YYYY-MM') AS month,
      NULL::numeric AS avg_retention_days, compliant_samples, measured_samples, total_cameras,
      ROUND(compliant_samples::numeric / NULLIF(measured_samples, 0) * 100, 1) AS compliance_percent,
      NULL::int AS audit_events,
      ROUND(compliant_samples::numeric / NULLIF(measured_samples, 0) * 100, 1) AS compliance_score
    FROM monthly_compliance ORDER BY month DESC LIMIT $2
  `;
  
  const result = await pool.query(query, [tenantId, months, branchIds]);
  return result.rows.reverse();
}

// ============================================================================
// ROUTE REGISTRATION
// ============================================================================

export function createHistoricalTrendsRoutes(instance: FastifyInstance, pool: Pool, store: ControlPlaneStore) {
  /**
   * GET /api/control/v1/reports/trends
   * 
   * Get historical trend data for MIS reports
   */
  instance.get('/trends', async (request, reply) => {
    try {
      const query = trendsQuerySchema.parse(request.query);
      const tenantId = request.currentUser.tenantId;
      const branches = await store.listAccessibleNodes(request.currentUser, 'analytics:view', 'branch');
      if (branches.length === 0) return reply.code(403).send({ error: 'forbidden' });
      const branchIds = branches.map((branch) => branch.id);
      
      let trends: any[];
      
      switch (query.reportType) {
        case 'executive-kpi':
          trends = await getExecutiveKPITrends(pool, tenantId, query.months, branchIds);
          break;
        case 'financial':
          trends = await getFinancialTrends(pool, tenantId, query.months, branchIds);
          break;
        case 'benchmarking':
          trends = await getBenchmarkingTrends(pool, tenantId, query.months, branchIds);
          break;
        case 'compliance':
          trends = await getComplianceTrends(pool, tenantId, query.months, branchIds);
          break;
        default:
          return reply.code(400).send({
            error: 'invalid_report_type',
            message: 'Unsupported report type for trends',
          });
      }
      
      return reply.code(200).send({
        reportType: query.reportType,
        months: query.months,
        trends,
        basis: query.reportType === 'financial' ? 'Recorded work-order costs; capital expenditure is not measured' :
          query.reportType === 'compliance' ? 'Daily recording retention observations; percentages are weighted by measured camera days' :
          'Daily camera health observations and period incidents; missing measurements are null',
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to generate historical trends');
      
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'invalid_query_parameters',
          details: error.errors,
        });
      }
      
      return reply.code(500).send({
        error: 'trends_generation_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}
