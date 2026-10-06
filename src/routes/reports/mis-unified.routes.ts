import { resolveReportHierarchy, reportDayBounds, reportLocalDate, validReportDay } from "../../../packages/contracts/src/report-hierarchy.js";
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
import sharp from 'sharp';
import type { ControlPlaneStore } from '../../control-plane-store.js';
import type { NbfcRuleRepository } from '../../analytics/nbfc-rule-repository.js';
import { branchOpeningLocalDate } from '../../analytics/branch-opening-dual-control.service.js';
import { activeCamera, activeResourceNode } from '../../database/active-resource.js';

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
      !validReportDay(query.startDate) || !validReportDay(query.endDate)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'custom reports require valid startDate and endDate' });
    return;
  }
  if (Date.parse(query.startDate) > Date.parse(query.endDate)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'endDate must not precede startDate' });
  }
});

type MISReportQuery = z.infer<typeof misReportQuerySchema>;

const openingFailuresQuerySchema = z.object({
  timeRange: z.enum(['today', '7d', '30d', '90d', 'custom']).default('today'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  organization: reportFilter,
  zone: reportFilter,
  region: reportFilter,
  area: reportFilter,
  branchId: reportFilter,
}).superRefine((query, context) => {
  if (query.timeRange !== 'custom') return;
  const valid = (date: string | undefined) => date &&
    !Number.isNaN(Date.parse(`${date}T00:00:00.000Z`)) &&
    new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) === date;
  if (!valid(query.startDate) || !valid(query.endDate) || query.startDate! > query.endDate!) {
    context.addIssue({ code: 'custom', message: 'Select a valid start and end date in order' });
  }
});

const openingReportQuerySchema = openingFailuresQuerySchema.and(z.object({
  cameraId: reportFilter,
  locationType: reportFilter,
}));

function openingReportDateRange(query: z.infer<typeof openingFailuresQuerySchema>) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const endDay = query.timeRange === 'custom' ? query.endDate! : today;
  const days = query.timeRange === '7d' ? 7 : query.timeRange === '30d' ? 30 : query.timeRange === '90d' ? 90 : 1;
  const startDay = query.timeRange === 'custom' ? query.startDate! :
    new Date(Date.parse(`${today}T00:00:00.000Z`) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  return {
    startDate: new Date(`${startDay}T00:00:00+05:30`),
    endDate: new Date(Date.parse(`${endDay}T00:00:00+05:30`) + 86_400_000 - 1),
    startDay, endDay,
  };
}

// ============================================================================
// DATE & SHIFT HELPERS
// ============================================================================

function getDateRange(query: MISReportQuery): { startDate: Date; endDate: Date } {
  const today = reportLocalDate(new Date());
  const days = query.timeRange === '7d' ? 7 : query.timeRange === '30d' ? 30 : query.timeRange === '90d' ? 90 : 1;
  const startDay = query.timeRange === 'custom' ? query.startDate! :
    new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const bounds = reportDayBounds(startDay, query.timeRange === 'custom' ? query.endDate! : today);
  return { startDate: new Date(bounds.from), endDate: new Date(bounds.to) };
}

function shiftCondition(shift: string, column: string): string {
  const hour = `EXTRACT(HOUR FROM ${column} AT TIME ZONE 'Asia/Kolkata')`;
  return shift === 'morning' ? `${hour} >= 6 AND ${hour} < 14` : shift === 'evening' ? `${hour} >= 14 AND ${hour} < 22` : shift === 'night' ? `(${hour} < 6 OR ${hour} >= 22)` : 'TRUE';
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
       FROM resource_nodes node
       WHERE node.tenant_id::text = $1 AND ${activeResourceNode('node')}`,
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

  const hierarchyNodes = new Map(rawNodes.map(n => [n.id, {id:n.id, parentId:n.parent_id, type:n.node_type, name:n.name}]));

  // 3. For every node of type 'branch', resolve its ancestor chain
  const branches: BranchHierarchy[] = [];
  for (const node of rawNodes) {
    if (node.node_type !== 'branch') continue;

    const resolved = resolveReportHierarchy(node.id, hierarchyNodes);
    const { area: area_name, region: region_name, zone: zone_name, organization: org_name } = resolved;

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
  store: any,
  allowedBranchIds: ReadonlySet<string>,
): Promise<any> {
  const { startDate, endDate } = getDateRange(query);
  const allBranchesInEstate = (await resolveBranchHierarchy(pool, tenantId, store))
    .filter((branch) => allowedBranchIds.has(branch.branch_id));

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
  const filterOptions = {
    organizations: buildFilterOptions(allBranchesInEstate).organizations,
    zones: buildFilterOptions(allBranchesInEstate.filter(b => !query.organization || b.org_name === query.organization)).zones,
    regions: buildFilterOptions(allBranchesInEstate.filter(b => (!query.organization || b.org_name === query.organization) && (!query.zone || b.zone_name === query.zone))).regions,
    areas: buildFilterOptions(allBranchesInEstate.filter(b => (!query.organization || b.org_name === query.organization) && (!query.zone || b.zone_name === query.zone) && (!query.region || b.region_name === query.region))).areas,
    branches: buildFilterOptions(filteredBranches.filter(b => !query.branchId || b.branch_id === query.branchId)).branches,
  };

  if (branchIds.length === 0) {
    return {
      summary: createEmptySummary(),
      filterOptions,
      matrix: [],
      allBranches: [],
      dateWiseBreakdown: [],
      timeWiseBreakdown: [],
      metadata: {
        timezone: 'Asia/Kolkata',
      healthBasis: 'Current camera and retention snapshot; incident and activity metrics use the selected period',
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
         AND ${activeResourceNode('rn')}
         AND ${activeCamera('c')}
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
         AND ${shiftCondition(query.shift, 'i.detected_at')}
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
      [tenantId, branchIds, reportLocalDate(startDate), reportLocalDate(endDate)]
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
           AND ${activeResourceNode('rn')}
           AND ${activeCamera('c')}
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
         AND u.active = true AND u.status = 'active'
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
         AND ${activeResourceNode('rn')}
         AND ${activeCamera('c')}
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
  const dateWiseBreakdown = await getDateWiseBreakdown(pool, tenantId, branchIds, startDate, endDate, query.shift);
  const timeWiseBreakdown = await getTimeWiseBreakdown(pool, tenantId, branchIds, startDate, endDate, query.shift);

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
    branchMatrix,
    dateWiseBreakdown,
    timeWiseBreakdown,
    metadata: {
      timezone: 'Asia/Kolkata',
      healthBasis: 'Current camera and retention snapshot; incident and activity metrics use the selected period',
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
    let key = b.branch_id;
    if (groupBy === 'organization') key = b.org_name ? `organization:${b.org_name}` : `branch:${b.branch_id}`;
    else if (groupBy === 'zone') key = b.zone_name ? `zone:${b.zone_name}` : `branch:${b.branch_id}`;
    else if (groupBy === 'region') key = b.region_name ? `region:${b.region_name}` : `branch:${b.branch_id}`;
    else if (groupBy === 'area') key = b.area_name ? `area:${b.area_name}` : `branch:${b.branch_id}`;

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

    let complianceStatus = totalCameras > 0 ? 'Available' : 'Not measured';
    if (totalCameras > 0 && uptimePercent < 95) {
      complianceStatus = 'Attention';
    }

    matrix.push({
      dimension: groupBy === 'organization' ? groupBranches[0]!.org_name || groupBranches[0]!.branch_name
        : groupBy === 'zone' ? groupBranches[0]!.zone_name || groupBranches[0]!.branch_name
        : groupBy === 'region' ? groupBranches[0]!.region_name || groupBranches[0]!.branch_name
        : groupBy === 'area' ? groupBranches[0]!.area_name || groupBranches[0]!.branch_name
        : groupBranches[0]!.branch_name,
      branchId: groupBy === 'branch' ? groupBranches[0]!.branch_id : undefined,
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
  endDate: Date,
  shift = 'all'
): Promise<any[]> {
  if (!pool || branchIds.length === 0) return [];

  const rows = await safeQuery(
    pool,
    `SELECT 
       DATE(i.detected_at AT TIME ZONE 'Asia/Kolkata')::text AS dimension,
       COUNT(*) AS alerts,
       COUNT(*) FILTER (WHERE i.severity = 'P1') AS p1_threats
     FROM incidents i
     WHERE i.tenant_id::text = $1
       AND i.branch_id::text = ANY($2::text[])
       AND i.detected_at BETWEEN $3 AND $4
       AND ${shiftCondition(shift, 'i.detected_at')}
     GROUP BY DATE(i.detected_at AT TIME ZONE 'Asia/Kolkata')
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
  endDate: Date,
  shift = 'all'
): Promise<any[]> {
  if (!pool || branchIds.length === 0) return [];

  const rows = await safeQuery(
    pool,
    `SELECT 
       EXTRACT(HOUR FROM i.detected_at AT TIME ZONE 'Asia/Kolkata')::int AS hour,
       COUNT(*) AS alerts,
       COUNT(*) FILTER (WHERE i.severity = 'P1') AS p1_threats
     FROM incidents i
     WHERE i.tenant_id::text = $1
       AND i.branch_id::text = ANY($2::text[])
       AND i.detected_at BETWEEN $3 AND $4
       AND ${shiftCondition(shift, 'i.detected_at')}
     GROUP BY EXTRACT(HOUR FROM i.detected_at AT TIME ZONE 'Asia/Kolkata')
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

export function createMISUnifiedRoutes(instance: FastifyInstance, pool: Pool, store: ControlPlaneStore, openingRepository?: NbfcRuleRepository) {
  instance.get('/mis/hierarchy', async (request) => {
    const query = z.object({organization:reportFilter,zone:reportFilter,region:reportFilter,area:reportFilter}).parse(request.query);
    const allowed = new Set((await store.listAccessibleNodes(request.currentUser, 'live:view', 'branch')).map(node=>node.id));
    const branches = (await resolveBranchHierarchy(pool, request.currentUser.tenantId, store)).filter(branch=>allowed.has(branch.branch_id));
    const byOrg = branches.filter(b=>!query.organization || b.org_name===query.organization);
    const byZone = byOrg.filter(b=>!query.zone || b.zone_name===query.zone);
    const byRegion = byZone.filter(b=>!query.region || b.region_name===query.region);
    const byArea = byRegion.filter(b=>!query.area || b.area_name===query.area);
    return {organizations:buildFilterOptions(branches).organizations,zones:buildFilterOptions(byOrg).zones,regions:buildFilterOptions(byZone).regions,areas:buildFilterOptions(byRegion).areas,branches:buildFilterOptions(byArea).branches};
  });
  instance.get('/mis/branch-openings/:ruleId/:branchId/:localDate/photo', async (request, reply) => {
    const parsed = z.object({ ruleId: z.string().uuid(), branchId: z.string(),
      localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_photo_id' });
    const { ruleId, branchId, localDate } = parsed.data;
    const branches = await store.listAccessibleNodes(request.currentUser, 'analytics:view', 'branch');
    if (!branches.some((branch) => branch.id === branchId)) return reply.code(404).send({ error: 'photo_not_found' });
    const state = await openingRepository?.getBranchOpeningCheckForTenant(
      request.currentUser.tenantId, ruleId, branchId, localDate);
    if (!state || state.currentMetrics?.branchId !== branchId || state.currentMetrics?.localDate !== localDate) {
      return reply.code(404).send({ error: 'photo_not_found' });
    }
    const eventId = state.currentMetrics?.sourceEventId;
    const event = typeof eventId === 'string' ? await store.getAnalyticsEvent(eventId, request.currentUser.tenantId) : null;
    const camera = event && await store.getCamera(event.cameraId);
    if (!event || !camera || camera.branchId !== branchId || event.cameraId !== state.currentMetrics?.cameraId) {
      return reply.code(404).send({ error: 'photo_not_found' });
    }
    const encoded = event.metadata?.snapshotBase64;
    if (typeof encoded !== 'string' || !encoded || encoded.length > 20_000_000) {
      return reply.code(404).send({ error: 'photo_unavailable' });
    }
    let photo = Buffer.from(encoded, 'base64');
    if (photo.length < 4 || photo[0] !== 0xff || photo[1] !== 0xd8 || photo[2] !== 0xff) {
      return reply.code(404).send({ error: 'photo_unavailable' });
    }
    const box = state.currentMetrics?.personBoundingBox as Record<string, unknown> | undefined;
    if (state.currentMetrics?.personCount === 1 && box &&
        ['x', 'y', 'width', 'height'].every((key) => typeof box[key] === 'number') &&
        Number(box.x) >= 0 && Number(box.y) >= 0 && Number(box.width) > 0 && Number(box.height) > 0 &&
        Number(box.x) + Number(box.width) <= 1 && Number(box.y) + Number(box.height) <= 1) {
      try {
        const image = sharp(photo);
        const dimensions = await image.metadata();
        if (dimensions.width && dimensions.height) {
          const left = Math.max(0, Math.floor((Number(box.x) - 0.03) * dimensions.width));
          const top = Math.max(0, Math.floor((Number(box.y) - 0.03) * dimensions.height));
          const right = Math.min(dimensions.width, Math.ceil((Number(box.x) + Number(box.width) + 0.03) * dimensions.width));
          const bottom = Math.min(dimensions.height, Math.ceil((Number(box.y) + Number(box.height) + 0.03) * dimensions.height));
          photo = await image.extract({ left, top, width: right - left, height: bottom - top }).jpeg({ quality: 85 }).toBuffer();
        }
      } catch { /* Show the full frame if cropping fails. */ }
    }
    return reply.header('content-type', 'image/jpeg').header('cache-control', 'private, no-store')
      .header('x-content-type-options', 'nosniff').send(photo);
  });

  instance.get('/mis/branch-openings', async (request, reply) => {
    try {
      const query = openingReportQuerySchema.parse(request.query);
      const tenantId = request.currentUser.tenantId;
      const accessibleBranches = await store.listAccessibleNodes(request.currentUser, 'analytics:view', 'branch');
      const allowedBranchIds = new Set(accessibleBranches.map((branch) => branch.id));
      if (query.branchId && !allowedBranchIds.has(query.branchId)) return reply.code(403).send({ error: 'branch_forbidden' });
      const hierarchy = (await resolveBranchHierarchy(pool, tenantId, store))
        .filter((branch) => allowedBranchIds.has(branch.branch_id));
      const selected = hierarchy.filter((branch) =>
        (!query.branchId || branch.branch_id === query.branchId) &&
        (!query.zone || branch.zone_name === query.zone) &&
        (!query.region || branch.region_name === query.region) &&
        (!query.area || branch.area_name === query.area) &&
        (!query.organization || branch.org_name === query.organization));
      const cameraById = new Map((await store.listCameras(tenantId)).map((camera) => [camera.id, camera]));
      if (query.cameraId && !allowedBranchIds.has(cameraById.get(query.cameraId)?.branchId || '')) {
        return reply.code(403).send({ error: 'camera_forbidden' });
      }
      const hierarchyBranchIds = new Set(selected.map((branch) => branch.branch_id));
      const hierarchyCameras = [...cameraById.values()].filter((camera) => hierarchyBranchIds.has(camera.branchId));
      const locationMatches = (camera: typeof hierarchyCameras[number]) => !query.locationType ||
        (camera.locationType || 'unassigned') === query.locationType;
      const cameraChoices = hierarchyCameras.filter(locationMatches);
      const matchingCameras = cameraChoices.filter((camera) => !query.cameraId || camera.id === query.cameraId);
      const matchingCameraIds = new Set(matchingCameras.map((camera) => camera.id));
      const matchingBranchIds = new Set(matchingCameras.map((camera) => camera.branchId));
      const cameraFiltered = Boolean(query.cameraId || query.locationType);
      const selectedBranches = cameraFiltered ? selected.filter((branch) => matchingBranchIds.has(branch.branch_id)) : selected;
      const selectedById = new Map(selectedBranches.map((branch) => [branch.branch_id, branch]));
      const filterOptions = {
        organizations: buildFilterOptions(hierarchy).organizations,
        zones: buildFilterOptions(hierarchy.filter((branch) => !query.organization || branch.org_name === query.organization)).zones,
        regions: buildFilterOptions(hierarchy.filter((branch) => (!query.organization || branch.org_name === query.organization)
          && (!query.zone || branch.zone_name === query.zone))).regions,
        areas: buildFilterOptions(hierarchy.filter((branch) => (!query.organization || branch.org_name === query.organization)
          && (!query.zone || branch.zone_name === query.zone) && (!query.region || branch.region_name === query.region))).areas,
        branches: buildFilterOptions(hierarchy.filter((branch) => (!query.organization || branch.org_name === query.organization)
          && (!query.zone || branch.zone_name === query.zone) && (!query.region || branch.region_name === query.region)
          && (!query.area || branch.area_name === query.area))).branches,
        cameras: cameraChoices.map((camera) => ({ id: camera.id, name: camera.name, branchId: camera.branchId,
          branchName: selected.find((branch) => branch.branch_id === camera.branchId)?.branch_name || '',
          locationType: camera.locationType || 'unassigned' })),
        locations: [...new Set(hierarchyCameras.map((camera) => camera.locationType || 'unassigned'))].sort(),
      };
      const { startDate, endDate, startDay, endDay } = openingReportDateRange(query);
      if (!openingRepository || selectedById.size === 0) {
        return reply.send({ rows: [], total: 0, startDate: startDay, endDate: endDay, truncated: false, filterOptions });
      }
      const limit = 10_000;
      const states = await openingRepository.listBranchOpeningChecks(tenantId, [...selectedById.keys()], startDay, endDay, limit + 1);
      const selectedCameraIds = [...cameraById.values()].filter((camera) => selectedById.has(camera.branchId)).map((camera) => camera.id);
      const needsHistoricalPhoto = states.some((state) => state.currentMetrics?.outcome === 'FAILED' &&
        typeof state.currentMetrics?.sourceEventId !== 'string');
      const historicalFailures = needsHistoricalPhoto && selectedCameraIds.length ? await store.listAnalyticsEvents(tenantId, {
        cameraIds: selectedCameraIds, from: startDate.toISOString(), to: endDate.toISOString(),
        detectionTypes: ['dual-control-verification'], limit: limit + 1,
      }) : [];
      const historicalPhotoByBranchDay = new Map(historicalFailures.flatMap((event) => {
        if (event.metadata?.violation !== 'BRANCH_OPENING_MINIMUM_STAFF' ||
            typeof event.metadata?.snapshotBase64 !== 'string' || !event.metadata.snapshotBase64) return [];
        const branchId = cameraById.get(event.cameraId)?.branchId;
        if (!branchId) return [];
        const day = branchOpeningLocalDate(new Date(event.occurredAt), 'Asia/Kolkata');
        return [[`${branchId}:${day}`, `/api/control/v1/reports/mis/branch-opening-failures/${encodeURIComponent(event.id)}/photo`] as const];
      }));
      const recorded = states.slice(0, limit).flatMap((state) => {
        const metrics = state.currentMetrics || {};
        const branchId = String(metrics.branchId || '');
        const branch = selectedById.get(branchId);
        const count = Number(metrics.personCount);
        if (!branch || !Number.isInteger(count) || count < 1 || !state.firstConditionMetAt) return [];
        const photoUrl = typeof metrics.sourceEventId === 'string'
          ? `/api/control/v1/reports/mis/branch-openings/${encodeURIComponent(state.ruleId)}/${encodeURIComponent(branchId)}/${encodeURIComponent(String(metrics.localDate))}/photo`
          : historicalPhotoByBranchDay.get(`${branchId}:${String(metrics.localDate)}`) || null;
        return [{
          ruleId: state.ruleId, branchId, localDate: String(metrics.localDate),
          occurredAt: state.firstConditionMetAt,
          zoneName: branch.zone_name || null,
          branchName: branch.branch_name,
          cameraName: cameraById.get(String(metrics.cameraId))?.name || 'Unknown camera',
          cameraId: String(metrics.cameraId || ''),
          locationType: cameraById.get(String(metrics.cameraId))?.locationType || 'unassigned',
          personCount: count, outcome: count >= 2 ? 'SUCCESS' : 'FAILED', photoUrl,
        }];
      });
      const recordedByBranchDay = new Map(recorded.map((row) => [`${row.branchId}:${row.localDate}`, row]));
      const rows: Array<{
        ruleId: string; branchId: string; localDate: string; occurredAt: string | null;
        zoneName: string | null; branchName: string; cameraName: string | null;
        personCount: number | null; outcome: string; photoUrl: string | null;
        cameraId: string | null; locationType: string | null;
      }> = [];
      let truncated = states.length > limit;
      const startTime = Date.parse(`${startDay}T00:00:00.000Z`);
      for (let timestamp = Date.parse(`${endDay}T00:00:00.000Z`);
        timestamp >= startTime && rows.length < limit; timestamp -= 86_400_000) {
        const day = new Date(timestamp).toISOString().slice(0, 10);
        for (const branch of selectedBranches) {
          if (rows.length >= limit) { truncated = true; break; }
          const observation = recordedByBranchDay.get(`${branch.branch_id}:${day}`);
          // An opening observed by another camera is not an unrecorded opening.
          if (observation && cameraFiltered && !matchingCameraIds.has(observation.cameraId)) continue;
          rows.push(observation || {
            ruleId: 'unrecorded', branchId: branch.branch_id, localDate: day,
            occurredAt: null, zoneName: branch.zone_name || null,
            branchName: branch.branch_name, cameraName: null, personCount: null,
            outcome: 'NOT_RECORDED', photoUrl: null,
            cameraId: null, locationType: null,
          });
        }
      }
      return reply.send({ rows, total: rows.length, startDate: startDay, endDate: endDay, truncated, filterOptions });
    } catch (error) {
      request.log.error({ error }, 'Failed to generate branch openings report');
      if (error instanceof z.ZodError) return reply.code(400).send({ error: 'invalid_query_parameters', details: error.errors });
      return reply.code(500).send({ error: 'report_generation_failed' });
    }
  });

  instance.get('/mis/branch-opening-failures/:eventId/photo', async (request, reply) => {
    const parsed = z.object({ eventId: z.string().uuid() }).safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_event_id' });
    const event = await store.getAnalyticsEvent(parsed.data.eventId, request.currentUser.tenantId);
    if (!event || event.detectionType !== 'dual-control-verification' ||
        event.metadata?.violation !== 'BRANCH_OPENING_MINIMUM_STAFF') {
      return reply.code(404).send({ error: 'photo_not_found' });
    }
    const camera = await store.getCamera(event.cameraId);
    const branches = await store.listAccessibleNodes(request.currentUser, 'analytics:view', 'branch');
    if (!camera || !branches.some((branch) => branch.id === camera.branchId)) {
      return reply.code(404).send({ error: 'photo_not_found' });
    }
    const encoded = event.metadata?.snapshotBase64;
    if (typeof encoded !== 'string' || !encoded || encoded.length > 20_000_000) {
      return reply.code(404).send({ error: 'photo_unavailable' });
    }
    let photo = Buffer.from(encoded, 'base64');
    if (photo.length < 4 || photo[0] !== 0xff || photo[1] !== 0xd8 || photo[2] !== 0xff) {
      return reply.code(404).send({ error: 'photo_unavailable' });
    }
    const box = event.metadata?.personBoundingBox;
    if (box && typeof box === 'object' && !Array.isArray(box)) {
      const bounds = box as Record<string, unknown>;
      const { x, y, width, height } = bounds;
      if ([x, y, width, height].every((value) => typeof value === 'number' && Number.isFinite(value)) &&
          Number(x) >= 0 && Number(y) >= 0 && Number(width) > 0 && Number(height) > 0 &&
          Number(x) + Number(width) <= 1 && Number(y) + Number(height) <= 1) {
        try {
          const image = sharp(photo);
          const dimensions = await image.metadata();
          if (dimensions.width && dimensions.height) {
            const padding = 0.03;
            const left = Math.max(0, Math.floor((Number(x) - padding) * dimensions.width));
            const top = Math.max(0, Math.floor((Number(y) - padding) * dimensions.height));
            const right = Math.min(dimensions.width, Math.ceil((Number(x) + Number(width) + padding) * dimensions.width));
            const bottom = Math.min(dimensions.height, Math.ceil((Number(y) + Number(height) + padding) * dimensions.height));
            photo = await image.extract({ left, top, width: right - left, height: bottom - top })
              .jpeg({ quality: 85 }).toBuffer();
          }
        } catch {
          // Keep the original camera frame if its bounding box cannot be cropped.
        }
      }
    }
    return reply.header('content-type', 'image/jpeg')
      .header('cache-control', 'private, no-store')
      .header('x-content-type-options', 'nosniff')
      .send(photo);
  });

  instance.get('/mis/branch-opening-failures', async (request, reply) => {
    try {
      const query = openingFailuresQuerySchema.parse(request.query);
      const tenantId = request.currentUser.tenantId;
      const accessibleBranches = await store.listAccessibleNodes(request.currentUser, 'analytics:view', 'branch');
      const allowedBranchIds = new Set(accessibleBranches.map((branch) => branch.id));
      if (query.branchId && !allowedBranchIds.has(query.branchId)) {
        return reply.code(403).send({ error: 'branch_forbidden' });
      }
      const hierarchy = (await resolveBranchHierarchy(pool, tenantId, store))
        .filter((branch) => allowedBranchIds.has(branch.branch_id));
      const selected = hierarchy.filter((branch) =>
        (!query.branchId || branch.branch_id === query.branchId) &&
        (!query.zone || branch.zone_name === query.zone) &&
        (!query.region || branch.region_name === query.region) &&
        (!query.area || branch.area_name === query.area) &&
        (!query.organization || branch.org_name === query.organization));
      const selectedById = new Map(selected.map((branch) => [branch.branch_id, branch]));
      const { startDate, endDate, startDay, endDay } = openingReportDateRange(query);
      if (selectedById.size === 0) return reply.send({ rows: [], total: 0, startDate: startDay, endDate: endDay, truncated: false });

      const cameras = (await store.listCameras(tenantId))
        .filter((camera) => selectedById.has(camera.branchId));
      if (cameras.length === 0) return reply.send({ rows: [], total: 0, startDate: startDay, endDate: endDay, truncated: false });
      const cameraById = new Map(cameras.map((camera) => [camera.id, camera]));
      const limit = 10_000;
      const events = await store.listAnalyticsEvents(tenantId, {
        cameraIds: cameras.map((camera) => camera.id),
        from: startDate.toISOString(), to: endDate.toISOString(),
        detectionTypes: ['dual-control-verification'], limit: limit + 1,
      });
      const failures = events.filter((event) =>
        event.metadata?.violation === 'BRANCH_OPENING_MINIMUM_STAFF');
      const alerts = failures.length ? await store.listAnalyticsAlerts(tenantId, {
        cameraIds: cameras.map((camera) => camera.id),
        from: startDate.toISOString(), to: endDate.toISOString(), limit: limit + 1,
      }) : [];
      const alertByEvent = new Map(alerts.map((alert) => [alert.eventId, alert]));
      const rows = failures.slice(0, limit).flatMap((event) => {
        const camera = cameraById.get(event.cameraId);
        const branch = camera && selectedById.get(camera.branchId);
        if (!branch) return [];
        const count = Number(event.metadata?.staffCount);
        if (!Number.isInteger(count) || count < 1 || count >= 2) return [];
        const alert = alertByEvent.get(event.id);
        return [{
          eventId: event.id,
          alertId: alert?.id ?? null,
          occurredAt: event.occurredAt,
          zoneName: branch.zone_name || null,
          branchId: branch.branch_id,
          branchName: branch.branch_name,
          cameraName: camera.name,
          personCount: count,
          photoUrl: typeof event.metadata?.snapshotBase64 === 'string' && event.metadata.snapshotBase64
            ? `/api/control/v1/reports/mis/branch-opening-failures/${encodeURIComponent(event.id)}/photo`
            : alert ? `/v1/alerts/${encodeURIComponent(alert.id)}/evidence/snapshot` : null,
        }];
      });
      return reply.send({ rows, total: rows.length, startDate: startDay, endDate: endDay,
        truncated: events.length > limit });
    } catch (error) {
      request.log.error({ error }, 'Failed to generate branch opening failures MIS report');
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'invalid_query_parameters', details: error.errors });
      }
      return reply.code(500).send({ error: 'report_generation_failed' });
    }
  });

  instance.get('/mis', async (request, reply) => {
    try {
      const query = misReportQuerySchema.parse(request.query);
      const tenantId = request.currentUser.tenantId;
      const branches = await store.listAccessibleNodes(request.currentUser, 'analytics:view', 'branch');
      if (branches.length === 0) return reply.code(403).send({ error: 'forbidden' });
      const allowedBranchIds = new Set(branches.map((branch) => branch.id));
      if (query.branchId && !allowedBranchIds.has(query.branchId)) {
        return reply.code(403).send({ error: 'branch_forbidden' });
      }

      const report = await generateMISReport(pool, tenantId, query, store, allowedBranchIds);
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
