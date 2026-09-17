/**
 * Historical Trends API
 * 
 * Provides 6-month historical trend data for all MIS reports
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Pool } from 'pg';

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
  months: number
): Promise<any[]> {
  const query = `
    WITH monthly_data AS (
      SELECT 
        DATE_TRUNC('month', detected_at) AS month,
        COUNT(DISTINCT id) AS total_incidents,
        COUNT(DISTINCT id) FILTER (WHERE severity IN ('critical', 'high')) AS p1_incidents,
        COUNT(DISTINCT id) FILTER (WHERE status = 'resolved') AS resolved_incidents,
        AVG(
          CASE 
            WHEN resolved_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (resolved_at - detected_at)) / 60
            ELSE NULL 
          END
        ) AS avg_response_time_min
      FROM incidents
      WHERE tenant_id = $1
        AND detected_at >= NOW() - INTERVAL '1 month' * $2
        AND deleted_at IS NULL
      GROUP BY DATE_TRUNC('month', detected_at)
    ),
    monthly_cameras AS (
      SELECT 
        DATE_TRUNC('month', COALESCE(last_seen_at, created_at)) AS month,
        COUNT(*) AS total_cameras,
        COUNT(*) FILTER (WHERE status = 'online') AS online_cameras
      FROM cameras
      WHERE tenant_id = $1
      GROUP BY DATE_TRUNC('month', COALESCE(last_seen_at, created_at))
    )
    SELECT 
      TO_CHAR(md.month, 'YYYY-MM') AS month,
      COALESCE(md.total_incidents, 0) AS incidents,
      COALESCE(md.p1_incidents, 0) AS p1_threats,
      COALESCE(md.resolved_incidents, 0) AS resolved,
      ROUND(COALESCE(md.avg_response_time_min, 0), 1) AS avg_response_min,
      COALESCE(mc.online_cameras, 0) AS online_cameras,
      COALESCE(mc.total_cameras, 0) AS total_cameras,
      CASE 
        WHEN mc.total_cameras > 0 
        THEN ROUND((mc.online_cameras::numeric / mc.total_cameras) * 100, 1)
        ELSE 0 
      END AS uptime_percent,
      -- Calculate security posture score (0-100)
      GREATEST(0, LEAST(100, 
        100 
        - (COALESCE(md.p1_incidents, 0) * 5)
        - (COALESCE(md.total_incidents, 0) * 0.5)
        + (CASE WHEN mc.total_cameras > 0 THEN (mc.online_cameras::numeric / mc.total_cameras) * 20 ELSE 0 END)
      )) AS security_score
    FROM monthly_data md
    FULL OUTER JOIN monthly_cameras mc ON md.month = mc.month
    ORDER BY month DESC
    LIMIT $2
  `;
  
  const result = await pool.query(query, [tenantId, months]);
  return result.rows.reverse(); // Oldest first
}

/**
 * Calculate Financial trends
 */
async function getFinancialTrends(
  pool: Pool,
  tenantId: string,
  months: number
): Promise<any[]> {
  const query = `
    WITH monthly_maintenance AS (
      SELECT 
        DATE_TRUNC('month', created_at) AS month,
        SUM(estimated_cost) AS total_cost,
        COUNT(*) AS maintenance_count
      FROM maintenance_records
      WHERE tenant_id = $1
        AND created_at >= NOW() - INTERVAL '1 month' * $2
      GROUP BY DATE_TRUNC('month', created_at)
    ),
    monthly_incidents AS (
      SELECT 
        DATE_TRUNC('month', detected_at) AS month,
        COUNT(*) AS incident_count
      FROM incidents
      WHERE tenant_id = $1
        AND detected_at >= NOW() - INTERVAL '1 month' * $2
        AND deleted_at IS NULL
      GROUP BY DATE_TRUNC('month', detected_at)
    )
    SELECT 
      TO_CHAR(mm.month, 'YYYY-MM') AS month,
      COALESCE(mm.total_cost, 0) AS opex,
      COALESCE(mm.maintenance_count, 0) AS maintenance_count,
      COALESCE(mi.incident_count, 0) AS incidents,
      -- Estimated CapEx (cameras + infrastructure, simplified)
      ROUND(COALESCE(mm.total_cost, 0) * 0.3, 2) AS capex,
      -- Total cost
      ROUND(COALESCE(mm.total_cost, 0) * 1.3, 2) AS total_cost
    FROM monthly_maintenance mm
    FULL OUTER JOIN monthly_incidents mi ON mm.month = mi.month
    WHERE mm.month IS NOT NULL OR mi.month IS NOT NULL
    ORDER BY month DESC
    LIMIT $2
  `;
  
  const result = await pool.query(query, [tenantId, months]);
  return result.rows.reverse();
}

/**
 * Calculate Benchmarking trends (top 5 branches)
 */
async function getBenchmarkingTrends(
  pool: Pool,
  tenantId: string,
  months: number
): Promise<any[]> {
  const query = `
    WITH monthly_branch_scores AS (
      SELECT 
        n.id AS branch_id,
        n.name AS branch_name,
        DATE_TRUNC('month', i.detected_at) AS month,
        COUNT(DISTINCT c.id) AS total_cameras,
        COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'online') AS online_cameras,
        COUNT(DISTINCT i.id) AS incidents,
        COUNT(DISTINCT i.id) FILTER (WHERE i.severity IN ('critical', 'high')) AS p1_incidents
      FROM nodes n
      LEFT JOIN cameras c ON c.branch_id = n.id AND c.tenant_id = $1
      LEFT JOIN incidents i ON i.branch_id = n.id AND i.tenant_id = $1 
        AND i.detected_at >= NOW() - INTERVAL '1 month' * $2
        AND i.deleted_at IS NULL
      WHERE n.tenant_id = $1
        AND n.type = 'branch'
      GROUP BY n.id, n.name, DATE_TRUNC('month', i.detected_at)
    ),
    scored_branches AS (
      SELECT 
        branch_id,
        branch_name,
        month,
        -- Overall score calculation
        GREATEST(0, LEAST(100,
          70 + 
          (CASE WHEN total_cameras > 0 THEN (online_cameras::numeric / total_cameras) * 30 ELSE 0 END) -
          (p1_incidents * 10) -
          (incidents * 2)
        )) AS overall_score
      FROM monthly_branch_scores
    )
    SELECT 
      TO_CHAR(month, 'YYYY-MM') AS month,
      branch_name,
      ROUND(overall_score, 1) AS score
    FROM scored_branches
    WHERE month IS NOT NULL
    ORDER BY month DESC, overall_score DESC
    LIMIT $2 * 5 -- Top 5 branches per month
  `;
  
  const result = await pool.query(query, [tenantId, months]);
  return result.rows.reverse();
}

/**
 * Calculate Compliance trends
 */
async function getComplianceTrends(
  pool: Pool,
  tenantId: string,
  months: number
): Promise<any[]> {
  const query = `
    WITH monthly_compliance AS (
      SELECT 
        DATE_TRUNC('month', created_at) AS month,
        -- Recording retention compliance
        AVG(rj.retention_days) AS avg_retention_days,
        COUNT(DISTINCT rj.camera_id) FILTER (WHERE rj.retention_days >= 90) AS compliant_cameras,
        COUNT(DISTINCT rj.camera_id) AS total_cameras,
        -- Audit activity
        COUNT(DISTINCT al.id) AS audit_events
      FROM cameras c
      LEFT JOIN recording_jobs rj ON rj.camera_id = c.id
      LEFT JOIN audit_log al ON al.tenant_id = c.tenant_id 
        AND DATE_TRUNC('month', al.timestamp) = DATE_TRUNC('month', c.created_at)
      WHERE c.tenant_id = $1
        AND c.created_at >= NOW() - INTERVAL '1 month' * $2
      GROUP BY DATE_TRUNC('month', c.created_at)
    )
    SELECT 
      TO_CHAR(month, 'YYYY-MM') AS month,
      ROUND(avg_retention_days, 0) AS avg_retention_days,
      compliant_cameras,
      total_cameras,
      CASE 
        WHEN total_cameras > 0 
        THEN ROUND((compliant_cameras::numeric / total_cameras) * 100, 1)
        ELSE 0 
      END AS compliance_percent,
      audit_events,
      -- Overall compliance score
      GREATEST(0, LEAST(100,
        (CASE WHEN total_cameras > 0 THEN (compliant_cameras::numeric / total_cameras) * 80 ELSE 0 END) +
        (CASE WHEN avg_retention_days >= 180 THEN 20 ELSE avg_retention_days / 180 * 20 END)
      )) AS compliance_score
    FROM monthly_compliance
    WHERE month IS NOT NULL
    ORDER BY month DESC
    LIMIT $2
  `;
  
  const result = await pool.query(query, [tenantId, months]);
  return result.rows.reverse();
}

// ============================================================================
// ROUTE REGISTRATION
// ============================================================================

export function createHistoricalTrendsRoutes(instance: FastifyInstance, pool: Pool) {
  /**
   * GET /api/control/v1/reports/trends
   * 
   * Get historical trend data for MIS reports
   */
  instance.get('/trends', async (request, reply) => {
    try {
      const query = trendsQuerySchema.parse(request.query);
      const tenantId = request.currentUser.tenantId;
      
      let trends: any[];
      
      switch (query.reportType) {
        case 'executive-kpi':
          trends = await getExecutiveKPITrends(pool, tenantId, query.months);
          break;
        case 'financial':
          trends = await getFinancialTrends(pool, tenantId, query.months);
          break;
        case 'benchmarking':
          trends = await getBenchmarkingTrends(pool, tenantId, query.months);
          break;
        case 'compliance':
          trends = await getComplianceTrends(pool, tenantId, query.months);
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
