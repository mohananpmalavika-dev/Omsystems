/**
 * MIS Unified Report API
 * 
 * Provides live multi-dimensional MIS reporting across:
 * - Hierarchical grouping: Organization → Zone → Region → Area → Branch
 * - Temporal grouping: Date-wise, Time-wise (shift-based)
 * - Category deep-dives: All-in-One, Threat, Health, Operations, Attendance, SLA, Compliance
 * 
 * Real Telemetry Grounding:
 * - Resource Hierarchy: resource_nodes table & store.nodes
 * - Camera Availability: cameras table & store.cameras
 * - Threat & Incidents: incidents table
 * - Operational Footfall: footfall_events & analytics_events
 * - Queue Wait Times: queue_metrics
 * - Staff Attendance: users table
 * - Video Retention: camera_specifications & recording_jobs
 * 
 * Frontend: dashboard/app/reports/mis/page.tsx
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
  timeRange: z.enum(['today', '7d', '30d', '90d', 'custom']).default('7d'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  
  organization: reportFilter,
  zone: reportFilter,
  region: reportFilter,
  area: reportFilter,
  branchId: reportFilter,
  
  groupBy: z.enum([
    'organization',
    'zone',
    'region',
    'area',
    'branch',
    'date',
    'time',
  ]).default('branch'),
  
  shift: z.enum(['all', 'morning', 'evening', 'night']).default('all'),
  
  category: z.enum([
    'all',
    'threat',
    'health',
    'operations',
    'attendance',
    'sla',
    'compliance',
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
// DATE & SHIFT HELPERS
// ============================================================================

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

function metricNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

// ============================================================================
// SAFE DB QUERY HELPER
// ============================================================================

async function safeQuery(pool: Pool | null | undefined, sql: string, params: any[]): Promise<any[]> {
  if (!pool) return [];
  try {
    const result = await pool.query(sql, params);
    return result.rows || [];
  } catch (err) {
    return [];
  }
}

// ============================================================================
// BRANCH & HIERARCHY RESOLUTION
// ============================================================================

interface BranchHierarchy {
  branch_id: string;
  branch_name: string;
  area_name: string;
  region_name: string;
  zone_name: string;
  org_name: string;
}

async function resolveBranchHierarchy(
  pool: Pool | null | undefined,
  tenantId: string,
  store?: any
): Promise<BranchHierarchy[]> {
  const rawNodes: Array<{ id: string; parent_id: string | null; node_type: string; name: string }> = [];

  // 1. Try fetching all resource nodes for this tenant from PostgreSQL
  if (pool) {
    const rows = await safeQuery(
      pool,
      `SELECT id::text, parent_id::text, node_type::text, name 
       FROM resource_nodes 
       WHERE tenant_id::text = $1`,
      [tenantId]
    );
    for (const r of rows) {
      rawNodes.push({
        id: r.id,
        parent_id: r.parent_id,
        node_type: r.node_type,
        name: r.name,
      });
    }
  }

  // 2. Fallback or augment with store.nodes if database returned nothing
  if (rawNodes.length === 0 && store?.nodes) {
    for (const node of store.nodes.values()) {
      if (!node.tenantId || node.tenantId === tenantId) {
        rawNodes.push({
          id: node.id,
          parent_id: node.parentId ?? null,
          node_type: node.type,
          name: node.name,
        });
      }
    }
  }

  if (rawNodes.length === 0) {
    return [];
  }

  const nodesById = new Map<string, { id: string; parent_id: string | null; node_type: string; name: string }>();
  for (const n of rawNodes) {
    nodesById.set(n.id, n);
  }

  // 3. For every node of type 'branch', resolve its ancestor chain
  const branches: BranchHierarchy[] = [];
  for (const node of rawNodes) {
    if (node.node_type !== 'branch') continue;

    let area_name = 'General Area';
    let region_name = 'General Region';
    let zone_name = 'General Zone';
    let org_name = 'Enterprise Operations';

    let current = node;
    let depth = 0;
    while (current.parent_id && depth < 10) {
      const parent = nodesById.get(current.parent_id);
      if (!parent) break;

      const pType = (parent.node_type || '').toLowerCase();
      if (pType === 'area') area_name = parent.name;
      else if (pType === 'region' || pType === 'division') region_name = parent.name;
      else if (pType === 'zone') zone_name = parent.name;
      else if (pType === 'company' || pType === 'organization' || pType === 'headquarters') org_name = parent.name;

      current = parent;
      depth++;
    }

    branches.push({
      branch_id: node.id,
      branch_name: node.name,
      area_name,
      region_name,
      zone_name,
      org_name,
    });
  }

  return branches;
}

// ============================================================================
// MAIN MIS REPORT GENERATOR
// ============================================================================

async function generateMISReport(
  pool: Pool,
  tenantId: string,
  query: MISReportQuery,
  store?: any
): Promise<any> {
  const { startDate, endDate } = getDateRange(query);
  const allBranchesInEstate = await resolveBranchHierarchy(pool, tenantId, store);

  // Apply hierarchical filters
  let filteredBranches = allBranchesInEstate;
  if (query.branchId) {
    filteredBranches = filteredBranches.filter((b) => b.branch_id === query.branchId);
  }
  if (query.area) {
    filteredBranches = filteredBranches.filter((b) => b.area_name === query.area);
  }
  if (query.region) {
    filteredBranches = filteredBranches.filter((b) => b.region_name === query.region);
  }
  if (query.zone) {
    filteredBranches = filteredBranches.filter((b) => b.zone_name === query.zone);
  }
  if (query.organization) {
    filteredBranches = filteredBranches.filter((b) => b.org_name === query.organization);
  }

  const branchIds = filteredBranches.map((b) => b.branch_id);
  const filterOptions = buildFilterOptions(allBranchesInEstate);

  if (branchIds.length === 0) {
    return {
      summary: createEmptySummary(),
      filterOptions,
      matrix: [],
      allBranches: [],
      dateWiseBreakdown: [],
      timeWiseBreakdown: [],
      metadata: {
        generatedAt: new Date().toISOString(),
        timeRange: query.timeRange,
        groupBy: query.groupBy,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    };
  }

  // =========================================================================
  // 1. Camera Metrics by Branch
  // =========================================================================
  const cameraStatsByBranch = new Map<string, { total: number; online: number; uptime: number }>();

  if (pool) {
    const camRows = await safeQuery(
      pool,
      `SELECT 
         c.branch_node_id::text AS branch_id,
         COUNT(DISTINCT c.id) AS total_cameras,
         COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'online') AS online_cameras,
         ROUND(
           COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'online')::numeric / 
           NULLIF(COUNT(DISTINCT c.id), 0) * 100, 
           1
         ) AS uptime_percent
       FROM cameras c
       JOIN resource_nodes rn ON c.branch_node_id = rn.id
       WHERE rn.tenant_id::text = $1
         AND c.branch_node_id::text = ANY($2::text[])
       GROUP BY c.branch_node_id`,
      [tenantId, branchIds]
    );

    for (const r of camRows) {
      cameraStatsByBranch.set(r.branch_id, {
        total: Number(r.total_cameras) || 0,
        online: Number(r.online_cameras) || 0,
        uptime: metricNumber(r.uptime_percent) ?? (Number(r.total_cameras) > 0 ? Math.round((Number(r.online_cameras) / Number(r.total_cameras)) * 100) : 0),
      });
    }
  }

  // Complement or fallback from store.cameras if needed
  if (cameraStatsByBranch.size === 0 && store?.cameras) {
    const branchCamCounts = new Map<string, { total: number; online: number }>();
    for (const c of store.cameras.values()) {
      const bId = c.branchId || c.nodeId;
      if (!bId || !branchIds.includes(bId)) continue;
      if (!branchCamCounts.has(bId)) branchCamCounts.set(bId, { total: 0, online: 0 });
      const item = branchCamCounts.get(bId)!;
      item.total++;
      if (c.status === 'online') item.online++;
    }
    for (const [bId, item] of branchCamCounts.entries()) {
      const uptime = item.total > 0 ? Math.round((item.online / item.total) * 100) : 0;
      cameraStatsByBranch.set(bId, { total: item.total, online: item.online, uptime });
    }
  }

  // =========================================================================
  // 2. Real Incidents & Threats by Branch
  // =========================================================================
  const incidentsByBranch = new Map<string, { totalAlerts: number; p1Threats: number; slaPercent: number | null }>();

  if (pool) {
    const incRows = await safeQuery(
      pool,
      `SELECT 
         i.branch_id::text AS branch_id,
         COUNT(DISTINCT i.id) AS total_alerts,
         COUNT(DISTINCT i.id) FILTER (
           WHERE i.severity = 'P1'
             AND COALESCE(i.status, 'new') NOT IN ('resolved', 'closed', 'false_alarm')
         ) AS p1_threats,
         ROUND(
           100.0 * COUNT(DISTINCT i.id) FILTER (
             WHERE i.severity = 'P1'
               AND (
                 (i.acknowledged_at IS NOT NULL AND i.acknowledged_at <= i.detected_at + interval '5 minutes')
                 OR i.status IN ('resolved', 'closed')
               )
           ) / NULLIF(COUNT(DISTINCT i.id) FILTER (WHERE i.severity = 'P1'), 0),
           1
         ) AS sla_percent
       FROM incidents i
       WHERE i.tenant_id::text = $1
         AND i.branch_id::text = ANY($2::text[])
         AND i.detected_at BETWEEN $3 AND $4
       GROUP BY i.branch_id`,
      [tenantId, branchIds, startDate.toISOString(), endDate.toISOString()]
    );

    for (const r of incRows) {
      incidentsByBranch.set(r.branch_id, {
        totalAlerts: Number(r.total_alerts) || 0,
        p1Threats: Number(r.p1_threats) || 0,
        slaPercent: metricNumber(r.sla_percent),
      });
    }
  }

  // =========================================================================
  // 3. Real Footfall & Queue Wait Times
  // =========================================================================
  const footfallByBranch = new Map<string, number>();
  const waitTimeByBranch = new Map<string, number>();

  if (pool) {
    // 3a. Footfall from footfall_events
    const footfallRows = await safeQuery(
      pool,
      `SELECT 
         fe.branch_id::text AS branch_id,
         SUM(fe.entries) AS footfall
       FROM footfall_events fe
       WHERE fe.tenant_id::text = $1
         AND fe.branch_id::text = ANY($2::text[])
         AND fe.date BETWEEN $3 AND $4
       GROUP BY fe.branch_id`,
      [tenantId, branchIds, startDate.toISOString().slice(0, 10), endDate.toISOString().slice(0, 10)]
    );

    for (const r of footfallRows) {
      if (r.footfall != null) {
        footfallByBranch.set(r.branch_id, Number(r.footfall));
      }
    }

    // 3b. Fallback footfall from analytics_events if footfall_events empty
    if (footfallByBranch.size === 0) {
      const aeRows = await safeQuery(
        pool,
        `SELECT 
           c.branch_node_id::text AS branch_id,
           COUNT(*) AS footfall
         FROM analytics_events e
         JOIN cameras c ON c.id::text = e.camera_id::text
         JOIN resource_nodes rn ON c.branch_node_id = rn.id
         WHERE rn.tenant_id::text = $1
           AND c.branch_node_id::text = ANY($2::text[])
           AND e.occurred_at BETWEEN $3 AND $4
           AND e.detection_type IN ('line-crossing', 'footfall', 'customer-counting', 'person-counting')
         GROUP BY c.branch_node_id`,
        [tenantId, branchIds, startDate.toISOString(), endDate.toISOString()]
      );

      for (const r of aeRows) {
        if (r.footfall != null) {
          footfallByBranch.set(r.branch_id, Number(r.footfall));
        }
      }
    }

    // 3c. Queue wait time from queue_metrics
    const queueRows = await safeQuery(
      pool,
      `SELECT 
         qm.branch_id::text AS branch_id,
         ROUND(AVG(qm.avg_wait_seconds) / 60.0, 1) AS avg_wait_min
       FROM queue_metrics qm
       WHERE qm.tenant_id::text = $1
         AND qm.branch_id::text = ANY($2::text[])
         AND qm.measured_at BETWEEN $3 AND $4
       GROUP BY qm.branch_id`,
      [tenantId, branchIds, startDate.toISOString(), endDate.toISOString()]
    );

    for (const r of queueRows) {
      const wait = metricNumber(r.avg_wait_min);
      if (wait !== null) {
        waitTimeByBranch.set(r.branch_id, wait);
      }
    }
  }

  // =========================================================================
  // 4. Real Staff Attendance & Retention Days
  // =========================================================================
  const attendanceByBranch = new Map<string, number>();
  const retentionByBranch = new Map<string, number>();

  if (pool) {
    // 4a. Real users / active staff
    const userRows = await safeQuery(
      pool,
      `SELECT 
         u.branch_id::text AS branch_id,
         ROUND(
           COUNT(DISTINCT u.id) FILTER (WHERE u.active = true)::numeric / 
           NULLIF(COUNT(DISTINCT u.id), 0) * 100, 
           1
         ) AS attendance_percent
       FROM users u
       WHERE u.tenant_id::text = $1
         AND u.branch_id::text = ANY($2::text[])
       GROUP BY u.branch_id`,
      [tenantId, branchIds]
    );

    for (const r of userRows) {
      const att = metricNumber(r.attendance_percent);
      if (att !== null) attendanceByBranch.set(r.branch_id, att);
    }

    // 4b. Retention days from camera_specifications / recording_jobs
    const retRows = await safeQuery(
      pool,
      `SELECT 
         c.branch_node_id::text AS branch_id,
         ROUND(AVG(cs.storage_days), 0) AS retention_days
       FROM camera_specifications cs
       JOIN cameras c ON cs.camera_id = c.id
       JOIN resource_nodes rn ON c.branch_node_id = rn.id
       WHERE rn.tenant_id::text = $1
         AND c.branch_node_id::text = ANY($2::text[])
       GROUP BY c.branch_node_id`,
      [tenantId, branchIds]
    );

    for (const r of retRows) {
      const ret = metricNumber(r.retention_days);
      if (ret !== null) retentionByBranch.set(r.branch_id, ret);
    }
  }

  // =========================================================================
  // 5. Build Aggregated Dimension Matrix
  // =========================================================================
  const dateWiseBreakdown = await getDateWiseBreakdown(pool, tenantId, branchIds, startDate, endDate);
  const timeWiseBreakdown = await getTimeWiseBreakdown(pool, tenantId, branchIds, startDate, endDate);

  const matrix = query.groupBy === 'date'
    ? dateWiseBreakdown
    : query.groupBy === 'time'
      ? timeWiseBreakdown
      : aggregateByDimension(
          query.groupBy,
          filteredBranches,
          cameraStatsByBranch,
          incidentsByBranch,
          footfallByBranch,
          waitTimeByBranch,
          attendanceByBranch,
          retentionByBranch
        );

  // =========================================================================
  // 6. Branch Summaries for Scorecards & Compliance List
  // =========================================================================
  const branchMatrix = aggregateByDimension(
    'branch',
    filteredBranches,
    cameraStatsByBranch,
    incidentsByBranch,
    footfallByBranch,
    waitTimeByBranch,
    attendanceByBranch,
    retentionByBranch
  );

  const summary = calculateSummary(branchMatrix);

  const allBranches = filteredBranches.map((b) => {
    const cam = cameraStatsByBranch.get(b.branch_id);
    const inc = incidentsByBranch.get(b.branch_id);
    return {
      name: b.branch_name,
      uptime: cam?.uptime ?? 0,
      attendancePercent: attendanceByBranch.get(b.branch_id) ?? null,
      slaPercent: inc?.slaPercent ?? null,
      retentionDays: retentionByBranch.get(b.branch_id) ?? null,
    };
  });

  return {
    summary,
    filterOptions,
    matrix,
    allBranches,
    dateWiseBreakdown,
    timeWiseBreakdown,
    metadata: {
      generatedAt: new Date().toISOString(),
      timeRange: query.timeRange,
      groupBy: query.groupBy,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
  };
}

// ============================================================================
// AGGREGATION LOGIC
// ============================================================================

function aggregateByDimension(
  groupBy: string,
  branches: BranchHierarchy[],
  cameras: Map<string, { total: number; online: number; uptime: number }>,
  incidents: Map<string, { totalAlerts: number; p1Threats: number; slaPercent: number | null }>,
  footfall: Map<string, number>,
  waitTime: Map<string, number>,
  attendance: Map<string, number>,
  retention: Map<string, number>
): any[] {
  const groups = new Map<string, BranchHierarchy[]>();

  for (const b of branches) {
    let key = b.branch_name;
    if (groupBy === 'organization') key = b.org_name || 'Enterprise Operations';
    else if (groupBy === 'zone') key = b.zone_name || 'General Zone';
    else if (groupBy === 'region') key = b.region_name || 'General Region';
    else if (groupBy === 'area') key = b.area_name || 'General Area';

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(b);
  }

  const matrix: any[] = [];

  for (const [dimensionKey, groupBranches] of groups.entries()) {
    let totalCameras = 0;
    let onlineCameras = 0;
    let totalAlerts = 0;
    let p1Threats = 0;

    let totalFootfall = 0;
    let hasFootfallData = false;

    let waitMinSum = 0;
    let waitCount = 0;

    let attSum = 0;
    let attCount = 0;

    let slaSum = 0;
    let slaCount = 0;

    let retSum = 0;
    let retCount = 0;

    for (const b of groupBranches) {
      const c = cameras.get(b.branch_id);
      if (c) {
        totalCameras += c.total;
        onlineCameras += c.online;
      }

      const inc = incidents.get(b.branch_id);
      if (inc) {
        totalAlerts += inc.totalAlerts;
        p1Threats += inc.p1Threats;
        if (inc.slaPercent !== null) {
          slaSum += inc.slaPercent;
          slaCount++;
        }
      }

      const f = footfall.get(b.branch_id);
      if (f !== undefined) {
        totalFootfall += f;
        hasFootfallData = true;
      }

      const w = waitTime.get(b.branch_id);
      if (w !== undefined) {
        waitMinSum += w;
        waitCount++;
      }

      const a = attendance.get(b.branch_id);
      if (a !== undefined) {
        attSum += a;
        attCount++;
      }

      const r = retention.get(b.branch_id);
      if (r !== undefined) {
        retSum += r;
        retCount++;
      }
    }

    const uptimePercent = totalCameras > 0
      ? Math.round((onlineCameras / totalCameras) * 100)
      : 0;

    const avgWaitMin = waitCount > 0 ? Number((waitMinSum / waitCount).toFixed(1)) : null;
    const avgAttendance = attCount > 0 ? Number((attSum / attCount).toFixed(1)) : null;
    const avgSla = slaCount > 0 ? Number((slaSum / slaCount).toFixed(1)) : null;
    const avgRetentionDays = retCount > 0 ? Math.round(retSum / retCount) : null;

    let complianceStatus = 'Optimal';
    if (avgRetentionDays !== null && avgRetentionDays < 90) {
      complianceStatus = 'Warning';
    } else if (uptimePercent < 95) {
      complianceStatus = 'Attention';
    }

    matrix.push({
      dimension: dimensionKey,
      branchCount: groupBy === 'branch' ? 1 : groupBranches.length,
      onlineCameras,
      totalCameras,
      uptimePercent,
      p1Threats,
      totalAlerts,
      footfall: hasFootfallData ? totalFootfall : null,
      avgWaitMin,
      attendancePercent: avgAttendance,
      slaPercent: avgSla,
      retentionDays: avgRetentionDays,
      complianceStatus,
      area: groupBy === 'branch' ? groupBranches[0]?.area_name : undefined,
      region: groupBy === 'branch' ? groupBranches[0]?.region_name : undefined,
      zone: groupBy === 'branch' ? groupBranches[0]?.zone_name : undefined,
      organization: groupBy === 'branch' ? groupBranches[0]?.org_name : undefined,
    });
  }

  return matrix;
}

function calculateSummary(branchMatrix: any[]) {
  if (branchMatrix.length === 0) {
    return createEmptySummary();
  }

  const totalBranches = branchMatrix.length;
  const totalCameras = branchMatrix.reduce((sum, r) => sum + (r.totalCameras || 0), 0);
  const onlineCameras = branchMatrix.reduce((sum, r) => sum + (r.onlineCameras || 0), 0);
  const totalP1Threats = branchMatrix.reduce((sum, r) => sum + (r.p1Threats || 0), 0);
  const totalAlerts = branchMatrix.reduce((sum, r) => sum + (r.totalAlerts || 0), 0);

  const avgUptime = totalCameras > 0
    ? Number(((onlineCameras / totalCameras) * 100).toFixed(1))
    : 0;

  const measuredFootfall = branchMatrix
    .map((r) => metricNumber(r.footfall))
    .filter((v): v is number => v !== null);
  const totalFootfall = measuredFootfall.length > 0
    ? measuredFootfall.reduce((sum, v) => sum + v, 0)
    : null;

  const avgOf = (key: string): number | null => {
    const vals = branchMatrix.map((r) => metricNumber(r[key])).filter((v): v is number => v !== null);
    if (vals.length === 0) return null;
    return Number((vals.reduce((sum, v) => sum + v, 0) / vals.length).toFixed(1));
  };

  return {
    totalBranches,
    totalCameras,
    onlineCameras,
    avgUptime,
    totalP1Threats,
    totalAlerts,
    totalFootfall,
    avgWaitMin: avgOf('avgWaitMin'),
    avgAttendance: avgOf('attendancePercent'),
    avgSla: avgOf('slaPercent'),
    avgRetentionDays: avgOf('retentionDays'),
  };
}

function createEmptySummary() {
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
// REAL TIME-SERIES BREAKDOWNS
// ============================================================================

async function getDateWiseBreakdown(
  pool: Pool | null | undefined,
  tenantId: string,
  branchIds: string[],
  startDate: Date,
  endDate: Date
): Promise<any[]> {
  if (!pool || branchIds.length === 0) return [];

  const rows = await safeQuery(
    pool,
    `SELECT 
       DATE(i.detected_at)::text AS dimension,
       COUNT(*) AS alerts,
       COUNT(*) FILTER (WHERE i.severity = 'P1') AS p1_threats
     FROM incidents i
     WHERE i.tenant_id::text = $1
       AND i.branch_id::text = ANY($2::text[])
       AND i.detected_at BETWEEN $3 AND $4
     GROUP BY DATE(i.detected_at)
     ORDER BY dimension`,
    [tenantId, branchIds, startDate.toISOString(), endDate.toISOString()]
  );

  return rows.map((r) => ({
    dimension: r.dimension,
    alerts: Number(r.alerts) || 0,
    p1Threats: Number(r.p1_threats) || 0,
    footfall: null,
  }));
}

async function getTimeWiseBreakdown(
  pool: Pool | null | undefined,
  tenantId: string,
  branchIds: string[],
  startDate: Date,
  endDate: Date
): Promise<any[]> {
  if (!pool || branchIds.length === 0) return [];

  const rows = await safeQuery(
    pool,
    `SELECT 
       EXTRACT(HOUR FROM i.detected_at)::int AS hour,
       COUNT(*) AS alerts,
       COUNT(*) FILTER (WHERE i.severity = 'P1') AS p1_threats
     FROM incidents i
     WHERE i.tenant_id::text = $1
       AND i.branch_id::text = ANY($2::text[])
       AND i.detected_at BETWEEN $3 AND $4
     GROUP BY EXTRACT(HOUR FROM i.detected_at)
     ORDER BY hour`,
    [tenantId, branchIds, startDate.toISOString(), endDate.toISOString()]
  );

  return rows.map((r) => {
    const hour = r.hour;
    const shift = hour >= 6 && hour < 14 ? 'Morning' : hour >= 14 && hour < 22 ? 'Evening' : 'Night';
    return {
      dimension: `${hour.toString().padStart(2, '0')}:00`,
      shift,
      alerts: Number(r.alerts) || 0,
      p1Threats: Number(r.p1_threats) || 0,
    };
  });
}

// ============================================================================
// FILTER OPTIONS PROVIDER
// ============================================================================

function buildFilterOptions(branches: BranchHierarchy[]) {
  const orgSet = new Set<string>();
  const zoneSet = new Set<string>();
  const regSet = new Set<string>();
  const areaSet = new Set<string>();
  const branchList: Array<{ id: string; name: string }> = [];

  for (const b of branches) {
    if (b.org_name) orgSet.add(b.org_name);
    if (b.zone_name) zoneSet.add(b.zone_name);
    if (b.region_name) regSet.add(b.region_name);
    if (b.area_name) areaSet.add(b.area_name);
    branchList.push({ id: b.branch_id, name: b.branch_name });
  }

  return {
    organizations: Array.from(orgSet),
    zones: Array.from(zoneSet),
    regions: Array.from(regSet),
    areas: Array.from(areaSet),
    branches: branchList,
  };
}

// ============================================================================
// ROUTE REGISTRATION
// ============================================================================

export function createMISUnifiedRoutes(instance: FastifyInstance, pool: Pool, store?: any) {
  instance.get('/mis', async (request, reply) => {
    try {
      const query = misReportQuerySchema.parse(request.query);
      const tenantId = request.currentUser.tenantId;

      const report = await generateMISReport(pool, tenantId, query, store);
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
