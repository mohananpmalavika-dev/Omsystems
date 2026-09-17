/**
 * MIS Unified Report API
 * 
 * The most comprehensive MIS report providing multi-dimensional analysis:
 * - Hierarchical grouping: Organization → Zone → Region → Area → Branch
 * - Temporal grouping: Date-wise, Time-wise (shift-based)
 * - Category breakdowns: All-in-One, Threat, Health, Operations, Attendance, SLA, Compliance
 * 
 * Frontend: dashboard/app/reports/mis/page.tsx
 * Status: ⚠️ CRITICAL - This API makes the 1000+ line frontend functional
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Pool } from 'pg';

// ============================================================================
// REQUEST VALIDATION SCHEMAS
// ============================================================================

const reportFilter = z.preprocess(
  (value) => value === 'all' || value === '' ? undefined : value,
  z.string().trim().min(1).max(160).optional(),
);

const misReportQuerySchema = z.object({
  // Time filtering
  timeRange: z.enum(['today', '7d', '30d', '90d', 'custom']).default('30d'),
  startDate: z.string().optional(), // ISO date string
  endDate: z.string().optional(),   // ISO date string
  
  // Hierarchical filtering
  organization: reportFilter,
  zone: reportFilter,
  region: reportFilter,
  area: reportFilter,
  branchId: reportFilter,
  
  // Grouping dimension
  groupBy: z.enum([
    'organization',
    'zone',
    'region',
    'area',
    'branch',
    'date',
    'time'
  ]).default('branch'),
  
  // Time-of-day filtering
  shift: z.enum(['all', 'morning', 'evening', 'night']).default('all'),
  
  // Report category filter (for focused views)
  category: z.enum([
    'all',
    'threat',
    'health',
    'operations',
    'attendance',
    'sla',
    'compliance'
  ]).default('all'),
}).superRefine((query, context) => {
  if (query.timeRange !== 'custom') return;
  if (!query.startDate || !query.endDate ||
      !Number.isFinite(Date.parse(query.startDate)) || !Number.isFinite(Date.parse(query.endDate))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'custom reports require valid startDate and endDate' });
    return;
  }
  if (Date.parse(query.startDate) > Date.parse(query.endDate)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'endDate must not precede startDate' });
  }
});

type MISReportQuery = z.infer<typeof misReportQuerySchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get date range based on timeRange parameter
 */
function getDateRange(query: MISReportQuery): { startDate: Date; endDate: Date } {
  const now = new Date();
  const endDate = new Date(now);
  let startDate: Date;
  
  if (query.timeRange === 'custom' && query.startDate && query.endDate) {
    startDate = new Date(query.startDate);
    endDate.setTime(new Date(query.endDate).getTime());
  } else if (query.timeRange === 'today') {
    startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
  } else if (query.timeRange === '7d') {
    startDate = new Date(now);
    startDate.setDate(now.getDate() - 7);
  } else if (query.timeRange === '30d') {
    startDate = new Date(now);
    startDate.setDate(now.getDate() - 30);
  } else { // 90d
    startDate = new Date(now);
    startDate.setDate(now.getDate() - 90);
  }
  
  return { startDate, endDate };
}

/**
 * Get shift time bounds (in hours)
 */
function getShiftHours(shift: string): { start: number; end: number } | null {
  if (shift === 'all') return null;
  if (shift === 'morning') return { start: 6, end: 14 };  // 6am - 2pm
  if (shift === 'evening') return { start: 14, end: 22 }; // 2pm - 10pm
  if (shift === 'night') return { start: 22, end: 6 };    // 10pm - 6am (wraps)
  return null;
}

/**
 * Build WHERE clause for hierarchical filtering
 */
function buildHierarchicalFilter(query: MISReportQuery): { whereClause: string; params: any[] } {
  const conditions: string[] = ['n.tenant_id = $1'];
  const params: any[] = [];
  let paramIndex = 2;
  
  if (query.branchId) {
    conditions.push(`n.id = $${paramIndex}`);
    params.push(query.branchId);
    paramIndex++;
  } else if (query.area) {
    conditions.push(`area.name = $${paramIndex}`);
    params.push(query.area);
    paramIndex++;
  } else if (query.region) {
    conditions.push(`region.name = $${paramIndex}`);
    params.push(query.region);
    paramIndex++;
  } else if (query.zone) {
    conditions.push(`zone.name = $${paramIndex}`);
    params.push(query.zone);
    paramIndex++;
  } else if (query.organization) {
    conditions.push(`org.name = $${paramIndex}`);
    params.push(query.organization);
    paramIndex++;
  }
  
  return { whereClause: conditions.join(' AND '), params };
}

function metricNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

// ============================================================================
// MAIN REPORT GENERATOR
// ============================================================================

/**
 * Generate MIS Unified Report
 * 
 * This is the most comprehensive report in the system, supporting:
 * - 7 grouping dimensions
 * - 12 metrics per dimension
 * - Hierarchical AND temporal analysis
 * - Dynamic filter cascading
 */
async function generateMISReport(
  pool: Pool,
  tenantId: string,
  query: MISReportQuery
): Promise<any> {
  const { startDate, endDate } = getDateRange(query);
  const shiftHours = getShiftHours(query.shift);
  
  // =========================================================================
  // STEP 1: Get All Branches (with hierarchical context)
  // =========================================================================
  
  const branchQuery = `
    WITH RECURSIVE hierarchy AS (
      -- Start with all branches
      SELECT 
        n.id AS branch_id,
        n.name AS branch_name,
        n.parent_node_id,
        n.type AS node_type,
        1 AS level
      FROM nodes n
      WHERE n.tenant_id = $1 AND n.type = 'branch'
      
      UNION ALL
      
      -- Recursively get parent hierarchy
      SELECT 
        h.branch_id,
        h.branch_name,
        parent.parent_node_id,
        parent.type AS node_type,
        h.level + 1
      FROM hierarchy h
      JOIN nodes parent ON parent.id = h.parent_node_id
      WHERE parent.tenant_id = $1
    )
    SELECT 
      branch_id,
      branch_name,
      MAX(CASE WHEN node_type = 'area' THEN parent.name END) AS area_name,
      MAX(CASE WHEN node_type = 'region' THEN parent.name END) AS region_name,
      MAX(CASE WHEN node_type = 'zone' THEN parent.name END) AS zone_name,
      MAX(CASE WHEN node_type = 'organization' THEN parent.name END) AS org_name
    FROM hierarchy h
    LEFT JOIN nodes parent ON parent.id = h.parent_node_id
    GROUP BY branch_id, branch_name
  `;
  
  const branchesResult = await pool.query(branchQuery, [tenantId]);
  const branches = branchesResult.rows;
  
  // Apply hierarchical filtering
  let filteredBranches = branches;
  if (query.branchId) {
    filteredBranches = branches.filter((b: any) => b.branch_id === query.branchId);
  } else if (query.area) {
    filteredBranches = branches.filter((b: any) => b.area_name === query.area);
  } else if (query.region) {
    filteredBranches = branches.filter((b: any) => b.region_name === query.region);
  } else if (query.zone) {
    filteredBranches = branches.filter((b: any) => b.zone_name === query.zone);
  } else if (query.organization) {
    filteredBranches = branches.filter((b: any) => b.org_name === query.organization);
  }
  
  const branchIds = filteredBranches.map((b: any) => b.branch_id);
  
  if (branchIds.length === 0) {
    return {
      summary: createEmptySummary(),
      filterOptions: await getFilterOptions(pool, tenantId, branches),
      matrix: [],
      allBranches: [],
      dateWiseBreakdown: [],
      timeWiseBreakdown: [],
    };
  }
  
  // =========================================================================
  // STEP 2: Calculate Metrics for All Branches
  // =========================================================================
  
  const metricsQuery = `
    WITH branch_metrics AS (
      SELECT 
        c.branch_id,
        
        -- Camera metrics
        COUNT(DISTINCT c.id) AS total_cameras,
        COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'online') AS online_cameras,
        ROUND(
          COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'online')::numeric / 
          NULLIF(COUNT(DISTINCT c.id), 0) * 100, 
          2
        ) AS uptime_percent,
        
        -- Incident metrics
        COUNT(DISTINCT i.id) FILTER (
          WHERE i.detected_at BETWEEN $1 AND $2
        ) AS total_alerts,
        COUNT(DISTINCT i.id) FILTER (
          WHERE i.detected_at BETWEEN $1 AND $2 
            AND i.severity = 'P1'
            AND COALESCE(i.status, 'new') NOT IN ('resolved', 'closed', 'false_alarm')
        ) AS p1_threats,

        -- P1 acknowledgement SLA: real incidents acknowledged within five minutes.
        -- NULL means there were no P1 incidents in the period, not an assumed pass.
        ROUND(
          100.0 * COUNT(DISTINCT i.id) FILTER (
            WHERE i.detected_at BETWEEN $1 AND $2
              AND i.severity = 'P1'
              AND i.acknowledged_at IS NOT NULL
              AND i.acknowledged_at <= i.detected_at + interval '5 minutes'
          ) / NULLIF(COUNT(DISTINCT i.id) FILTER (
            WHERE i.detected_at BETWEEN $1 AND $2 AND i.severity = 'P1'
          ), 0),
          2
        ) AS sla_percent,
        
        -- Maintenance metrics
        COUNT(DISTINCT m.id) FILTER (
          WHERE m.created_at BETWEEN $1 AND $2
        ) AS maintenance_count,
        
        -- Recording metrics
        ROUND(AVG(
          CASE 
            WHEN rj.enabled = true AND rj.status = 'recording' THEN 100
            ELSE 0 
          END
        ), 2) AS recording_coverage_percent,
        
        -- Compliance metrics (recording retention)
        ROUND(AVG(rj.retention_days), 0) AS avg_retention_days
        
      FROM cameras c
      LEFT JOIN incidents i ON i.camera_id = c.id AND i.deleted_at IS NULL
      LEFT JOIN maintenance_records m ON m.branch_id = c.branch_id
      LEFT JOIN recording_jobs rj ON rj.camera_id = c.id
      WHERE c.tenant_id = $3
        AND c.branch_id = ANY($4::text[])
      GROUP BY c.branch_id
    ),
    footfall_metrics AS (
      SELECT
        c.branch_id,
        COUNT(*) AS measurement_count,
        SUM(
          CASE
            WHEN jsonb_typeof(e.metadata->'totalCrossings') = 'number'
              THEN GREATEST(0, (e.metadata->>'totalCrossings')::numeric)
            WHEN jsonb_typeof(e.metadata->'crossings') = 'number'
              THEN GREATEST(0, (e.metadata->>'crossings')::numeric)
            WHEN jsonb_typeof(e.metadata->'entries') = 'number'
              THEN GREATEST(0, (e.metadata->>'entries')::numeric)
                 + CASE WHEN jsonb_typeof(e.metadata->'exits') = 'number'
                   THEN GREATEST(0, (e.metadata->>'exits')::numeric) ELSE 0 END
            WHEN e.detection_type = 'footfall' THEN 1
            ELSE 0
          END
        ) AS footfall
      FROM analytics_events e
      JOIN cameras c ON c.id = e.camera_id AND c.tenant_id = $3
      WHERE e.tenant_id = $3
        AND c.branch_id = ANY($4::text[])
        AND e.occurred_at BETWEEN $1 AND $2
        AND e.detection_type IN ('line-crossing', 'footfall', 'customer-counting', 'person-counting')
      GROUP BY c.branch_id
    )
    SELECT branch_metrics.*, footfall_metrics.measurement_count, footfall_metrics.footfall
    FROM branch_metrics
    LEFT JOIN footfall_metrics ON footfall_metrics.branch_id = branch_metrics.branch_id
  `;
  
  const metricsResult = await pool.query(metricsQuery, [
    startDate.toISOString(),
    endDate.toISOString(),
    tenantId,
    branchIds
  ]);
  
  const metricsByBranch = new Map(
    metricsResult.rows.map((row: any) => [row.branch_id, row])
  );
  
  // =========================================================================
  // STEP 3: Calculate Attendance & SLA (if available)
  // =========================================================================
  
  const attendanceQuery = `
    SELECT 
      branch_id,
      COUNT(DISTINCT user_id) FILTER (
        WHERE last_login_at BETWEEN $1 AND $2
      ) AS active_users,
      COUNT(DISTINCT user_id) AS total_users,
      ROUND(
        COUNT(DISTINCT user_id) FILTER (WHERE last_login_at BETWEEN $1 AND $2)::numeric /
        NULLIF(COUNT(DISTINCT user_id), 0) * 100,
        2
      ) AS attendance_percent
    FROM users
    WHERE tenant_id = $3
      AND branch_id = ANY($4::text[])
    GROUP BY branch_id
  `;
  
  const attendanceResult = await pool.query(attendanceQuery, [
    startDate.toISOString(),
    endDate.toISOString(),
    tenantId,
    branchIds
  ]);
  
  const attendanceByBranch = new Map(
    attendanceResult.rows.map((row: any) => [row.branch_id, row])
  );
  
  // =========================================================================
  // STEP 4: Aggregate by Requested Dimension
  // =========================================================================
  
  // =========================================================================
  // STEP 5: Generate Date-wise and Time-wise Breakdowns
  // =========================================================================
  
  const dateWiseBreakdown = await getDateWiseBreakdown(
    pool,
    tenantId,
    branchIds,
    startDate,
    endDate
  );
  
  const timeWiseBreakdown = await getTimeWiseBreakdown(
    pool,
    tenantId,
    branchIds,
    startDate,
    endDate
  );

  const matrix = query.groupBy === 'date'
    ? dateWiseBreakdown
    : query.groupBy === 'time'
      ? timeWiseBreakdown
      : await aggregateByDimension(query.groupBy, filteredBranches, metricsByBranch, attendanceByBranch);

  // =========================================================================
  // STEP 6: Generate Summary from branch-level measurements, never time buckets.
  // =========================================================================
  const summary = calculateSummary(await aggregateByDimension(
    'branch', filteredBranches, metricsByBranch, attendanceByBranch,
  ));
  
  // =========================================================================
  // STEP 7: Get All Branches (for compliance grid)
  // =========================================================================
  
  const allBranches = filteredBranches.map((branch: any) => {
    const metrics = metricsByBranch.get(branch.branch_id) || {};
    const attendance = attendanceByBranch.get(branch.branch_id) || {};
    
    return {
      name: branch.branch_name,
      uptime: metricNumber(metrics.uptime_percent) ?? 0,
      attendancePercent: metricNumber(attendance.attendance_percent),
      slaPercent: metricNumber(metrics.sla_percent),
      retentionDays: metricNumber(metrics.avg_retention_days),
    };
  });
  
  return {
    summary,
    filterOptions: await getFilterOptions(pool, tenantId, branches),
    matrix,
    allBranches,
    dateWiseBreakdown,
    timeWiseBreakdown,
  };
}

// ============================================================================
// AGGREGATION FUNCTIONS
// ============================================================================

async function aggregateByDimension(
  groupBy: string,
  branches: any[],
  metricsByBranch: Map<string, any>,
  attendanceByBranch: Map<string, any>
): Promise<any[]> {
  const groups = new Map<string, any[]>();
  
  // Group branches by dimension
  branches.forEach((branch: any) => {
    let dimensionKey: string;
    
    if (groupBy === 'organization') {
      dimensionKey = branch.org_name || 'Unknown Organization';
    } else if (groupBy === 'zone') {
      dimensionKey = branch.zone_name || 'Unknown Zone';
    } else if (groupBy === 'region') {
      dimensionKey = branch.region_name || 'Unknown Region';
    } else if (groupBy === 'area') {
      dimensionKey = branch.area_name || 'Unknown Area';
    } else { // branch
      dimensionKey = branch.branch_name;
    }
    
    if (!groups.has(dimensionKey)) {
      groups.set(dimensionKey, []);
    }
    groups.get(dimensionKey)!.push(branch);
  });
  
  // Calculate aggregated metrics per group
  const matrix: any[] = [];
  
  groups.forEach((groupBranches, dimensionKey) => {
    let totalCameras = 0;
    let onlineCameras = 0;
    let totalAlerts = 0;
    let p1Threats = 0;
    let maintenanceCount = 0;
    let totalRetentionDays = 0;
    let retentionMeasurements = 0;
    let totalAttendance = 0;
    let attendanceMeasurements = 0;
    let totalSla = 0;
    let slaMeasurements = 0;
    let totalFootfall = 0;
    let footfallMeasurements = 0;
    const branchCount = groupBranches.length;
    
    groupBranches.forEach((branch: any) => {
      const metrics = metricsByBranch.get(branch.branch_id) || {};
      const attendance = attendanceByBranch.get(branch.branch_id) || {};
      
      totalCameras += metricNumber(metrics.total_cameras) ?? 0;
      onlineCameras += metricNumber(metrics.online_cameras) ?? 0;
      totalAlerts += metricNumber(metrics.total_alerts) ?? 0;
      p1Threats += metricNumber(metrics.p1_threats) ?? 0;
      maintenanceCount += metricNumber(metrics.maintenance_count) ?? 0;
      const retentionDays = metricNumber(metrics.avg_retention_days);
      const attendancePercent = metricNumber(attendance.attendance_percent);
      const slaPercent = metricNumber(metrics.sla_percent);
      const footfall = metricNumber(metrics.footfall);
      if (retentionDays !== null) { totalRetentionDays += retentionDays; retentionMeasurements += 1; }
      if (attendancePercent !== null) { totalAttendance += attendancePercent; attendanceMeasurements += 1; }
      if (slaPercent !== null) { totalSla += slaPercent; slaMeasurements += 1; }
      if (footfall !== null) { totalFootfall += footfall; footfallMeasurements += 1; }
    });
    
    const uptimePercent = totalCameras > 0 
      ? Math.round((onlineCameras / totalCameras) * 100) 
      : 0;
    
    const avgRetentionDays = retentionMeasurements > 0
      ? Math.round(totalRetentionDays / retentionMeasurements)
      : null;
    
    const avgAttendance = attendanceMeasurements > 0
      ? Math.round(totalAttendance / attendanceMeasurements)
      : null;
    const avgSla = slaMeasurements > 0 ? Math.round(totalSla / slaMeasurements) : null;
    
    // Compliance status logic
    let complianceStatus = 'Compliant';
    if (avgRetentionDays === null) complianceStatus = 'Not Measured';
    else if (avgRetentionDays < 90) complianceStatus = 'Non-Compliant';
    else if (avgRetentionDays < 120) complianceStatus = 'Warning';
    
    matrix.push({
      dimension: dimensionKey,
      branchCount: groupBy === 'branch' ? undefined : branchCount,
      onlineCameras,
      totalCameras,
      uptimePercent,
      p1Threats,
      totalAlerts,
      footfall: footfallMeasurements > 0 ? totalFootfall : null,
      avgWaitMin: null,
      attendancePercent: avgAttendance,
      slaPercent: avgSla,
      retentionDays: avgRetentionDays,
      complianceStatus,
      
      // Branch-specific fields
      area: groupBy === 'branch' ? groupBranches[0]?.area_name : undefined,
      region: groupBy === 'branch' ? groupBranches[0]?.region_name : undefined,
    });
  });
  
  return matrix;
}

function calculateSummary(matrix: any[]): any {
  const average = (key: string): number | null => {
    const values = matrix.map((row) => metricNumber(row[key])).filter((value): value is number => value !== null);
    return values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  };
  const measuredTotal = (key: string): number | null => {
    const values = matrix.map((row) => metricNumber(row[key])).filter((value): value is number => value !== null);
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
  };
  return {
    totalBranches: matrix.reduce((sum, row) => sum + (row.branchCount || 1), 0),
    onlineCameras: matrix.reduce((sum, row) => sum + row.onlineCameras, 0),
    totalCameras: matrix.reduce((sum, row) => sum + row.totalCameras, 0),
    avgUptime: average('uptimePercent') ?? 0,
    totalP1Threats: matrix.reduce((sum, row) => sum + row.p1Threats, 0),
    totalAlerts: matrix.reduce((sum, row) => sum + row.totalAlerts, 0),
    totalFootfall: measuredTotal('footfall'),
    avgWaitMin: null,
    avgAttendance: average('attendancePercent'),
    avgSla: average('slaPercent'),
    avgRetentionDays: average('retentionDays'),
  };
}

function createEmptySummary(): any {
  return {
    totalBranches: 0,
    onlineCameras: 0,
    totalCameras: 0,
    avgUptime: 0,
    totalP1Threats: 0,
    totalAlerts: 0,
    totalFootfall: null,
    avgWaitMin: null,
    avgAttendance: null,
    avgSla: null,
    avgRetentionDays: null,
  };
}

// ============================================================================
// TIME-SERIES BREAKDOWNS
// ============================================================================

async function getDateWiseBreakdown(
  pool: Pool,
  tenantId: string,
  branchIds: string[],
  startDate: Date,
  endDate: Date
): Promise<any[]> {
  const query = `
    WITH incidents_by_day AS (
      SELECT
        DATE(detected_at) AS dimension,
        COUNT(*) AS alerts,
        COUNT(*) FILTER (WHERE severity = 'P1') AS p1_threats
      FROM incidents
      WHERE tenant_id = $1
        AND branch_id = ANY($2::text[])
        AND detected_at BETWEEN $3 AND $4
        AND deleted_at IS NULL
      GROUP BY DATE(detected_at)
    ), footfall_by_day AS (
      SELECT
        DATE(e.occurred_at) AS dimension,
        SUM(
          CASE
            WHEN jsonb_typeof(e.metadata->'totalCrossings') = 'number'
              THEN GREATEST(0, (e.metadata->>'totalCrossings')::numeric)
            WHEN jsonb_typeof(e.metadata->'crossings') = 'number'
              THEN GREATEST(0, (e.metadata->>'crossings')::numeric)
            WHEN jsonb_typeof(e.metadata->'entries') = 'number'
              THEN GREATEST(0, (e.metadata->>'entries')::numeric)
                 + CASE WHEN jsonb_typeof(e.metadata->'exits') = 'number'
                   THEN GREATEST(0, (e.metadata->>'exits')::numeric) ELSE 0 END
            WHEN e.detection_type = 'footfall' THEN 1
            ELSE 0
          END
        ) AS footfall
      FROM analytics_events e
      JOIN cameras c ON c.id = e.camera_id AND c.tenant_id = $1
      WHERE e.tenant_id = $1
        AND c.branch_id = ANY($2::text[])
        AND e.occurred_at BETWEEN $3 AND $4
        AND e.detection_type IN ('line-crossing', 'footfall', 'customer-counting', 'person-counting')
      GROUP BY DATE(e.occurred_at)
    )
    SELECT
      COALESCE(i.dimension, f.dimension) AS dimension,
      COALESCE(i.alerts, 0) AS alerts,
      COALESCE(i.p1_threats, 0) AS p1_threats,
      f.footfall
    FROM incidents_by_day i
    FULL OUTER JOIN footfall_by_day f ON f.dimension = i.dimension
    ORDER BY dimension
  `;
  
  const result = await pool.query(query, [
    tenantId,
    branchIds,
    startDate.toISOString(),
    endDate.toISOString()
  ]);
  
  return result.rows.map((row: any) => ({
    dimension: row.dimension.toISOString().slice(0, 10),
    alerts: row.alerts,
    footfall: metricNumber(row.footfall),
  }));
}

async function getTimeWiseBreakdown(
  pool: Pool,
  tenantId: string,
  branchIds: string[],
  startDate: Date,
  endDate: Date
): Promise<any[]> {
  const query = `
    SELECT 
      EXTRACT(HOUR FROM detected_at) AS hour,
      COUNT(*) AS alerts,
      COUNT(*) FILTER (WHERE severity IN ('critical', 'high')) AS p1_threats
    FROM incidents
    WHERE tenant_id = $1
      AND branch_id = ANY($2::text[])
      AND detected_at BETWEEN $3 AND $4
      AND deleted_at IS NULL
    GROUP BY EXTRACT(HOUR FROM detected_at)
    ORDER BY EXTRACT(HOUR FROM detected_at)
  `;
  
  const result = await pool.query(query, [
    tenantId,
    branchIds,
    startDate.toISOString(),
    endDate.toISOString()
  ]);
  
  return result.rows.map((row: any) => {
    const hour = parseInt(row.hour);
    let shift = 'Morning';
    let timeSlot = `${hour}:00`;
    
    if (hour >= 6 && hour < 14) {
      shift = 'Morning';
    } else if (hour >= 14 && hour < 22) {
      shift = 'Evening';
    } else {
      shift = 'Night';
    }
    
    return {
      dimension: timeSlot,
      alerts: row.alerts,
      p1Threats: row.p1_threats,
      shift,
    };
  });
}

// ============================================================================
// FILTER OPTIONS PROVIDER
// ============================================================================

async function getFilterOptions(
  pool: Pool,
  tenantId: string,
  allBranches: any[]
): Promise<any> {
  // Extract unique values for cascading filters
  const organizations = [...new Set(allBranches.map((b: any) => b.org_name).filter(Boolean))];
  const zones = [...new Set(allBranches.map((b: any) => b.zone_name).filter(Boolean))];
  const regions = [...new Set(allBranches.map((b: any) => b.region_name).filter(Boolean))];
  const areas = [...new Set(allBranches.map((b: any) => b.area_name).filter(Boolean))];
  const branches = allBranches.map((b: any) => ({
    id: b.branch_id,
    name: b.branch_name,
  }));
  
  return {
    organizations,
    zones,
    regions,
    areas,
    branches,
  };
}

// ============================================================================
// ROUTE REGISTRATION
// ============================================================================

export function createMISUnifiedRoutes(instance: FastifyInstance, pool: Pool) {
  /**
   * GET /v1/reports/mis
   * 
   * Generate MIS Unified Report with multi-dimensional analysis
   */
  instance.get('/mis', async (request, reply) => {
    try {
      const query = misReportQuerySchema.parse(request.query);
      const tenantId = request.currentUser.tenantId;
      
      const report = await generateMISReport(pool, tenantId, query);
      
      return reply.code(200).send(report);
    } catch (error) {
      request.log.error({ error }, 'Failed to generate MIS unified report');
      
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'invalid_query_parameters',
          details: error.errors,
        });
      }
      
      return reply.code(500).send({
        error: 'report_generation_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}
