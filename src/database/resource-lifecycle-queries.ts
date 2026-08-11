/**
 * Resource Node Lifecycle Query Patterns
 * 
 * This file documents and implements query patterns that correctly
 * handle branch lifecycle status (ACTIVE, DISABLED, ARCHIVED).
 * 
 * Key Principles:
 * - Operational queries should exclude ARCHIVED nodes by default
 * - Historical/reporting queries should include all lifecycle states
 * - Parent lifecycle state affects child effective operational status
 */

import type { Pool } from 'pg';

/**
 * Query patterns for lifecycle-aware operations
 */
export class LifecycleAwareResourceQueries {
  constructor(private readonly pool: Pool) {}

  /**
   * Get active branches only (for operational dashboards)
   * 
   * Use this for:
   * - Branch selection dropdowns
   * - Operational monitoring views
   * - Active camera counts
   */
  async listActiveBranches(tenantId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT 
        id::text,
        parent_id::text,
        tenant_id::text,
        node_type,
        name,
        path::text,
        lifecycle_status,
        created_at
       FROM resource_nodes
       WHERE tenant_id = $1
         AND node_type = 'branch'
         AND (lifecycle_status = 'ACTIVE' OR lifecycle_status IS NULL)
       ORDER BY name`,
      [tenantId]
    );
    return result.rows;
  }

  /**
   * Get operational branches (ACTIVE or DISABLED, but not ARCHIVED)
   * 
   * Use this for:
   * - Branch management pages
   * - Configuration views
   * - Places where disabled branches should still be visible
   */
  async listOperationalBranches(tenantId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT 
        id::text,
        parent_id::text,
        tenant_id::text,
        node_type,
        name,
        path::text,
        lifecycle_status,
        disabled_at,
        disabled_by::text,
        disable_reason,
        created_at
       FROM resource_nodes
       WHERE tenant_id = $1
         AND node_type = 'branch'
         AND (lifecycle_status IN ('ACTIVE', 'DISABLED') OR lifecycle_status IS NULL)
       ORDER BY 
         CASE 
           WHEN lifecycle_status = 'ACTIVE' OR lifecycle_status IS NULL THEN 0
           ELSE 1
         END,
         name`,
      [tenantId]
    );
    return result.rows;
  }

  /**
   * Get all branches including archived (for historical reports)
   * 
   * Use this for:
   * - Historical reports
   * - Audit trails
   * - Compliance evidence
   * - Incident history resolution
   */
  async listAllBranches(tenantId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT 
        id::text,
        parent_id::text,
        tenant_id::text,
        node_type,
        name,
        path::text,
        lifecycle_status,
        disabled_at,
        disabled_by::text,
        disable_reason,
        archived_at,
        archived_by::text,
        archive_reason,
        created_at
       FROM resource_nodes
       WHERE tenant_id = $1
         AND node_type = 'branch'
       ORDER BY 
         CASE 
           WHEN lifecycle_status = 'ACTIVE' OR lifecycle_status IS NULL THEN 0
           WHEN lifecycle_status = 'DISABLED' THEN 1
           ELSE 2
         END,
         name`,
      [tenantId]
    );
    return result.rows;
  }

  /**
   * Get cameras with effective operational status
   * 
   * A camera's effective status considers both its own status
   * and its parent branch's lifecycle state.
   * 
   * Use this for:
   * - Camera monitoring dashboards
   * - Health calculations
   * - Alert generation
   */
  async listOperationalCameras(tenantId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT 
        c.id::text,
        c.resource_node_id::text,
        c.branch_node_id::text,
        c.vendor,
        c.model,
        c.status,
        cn.name as camera_name,
        bn.name as branch_name,
        bn.lifecycle_status as branch_lifecycle_status,
        -- Effective operational status
        CASE 
          WHEN bn.lifecycle_status = 'DISABLED' THEN 'DISABLED_BY_PARENT'
          WHEN bn.lifecycle_status = 'ARCHIVED' THEN 'ARCHIVED_BY_PARENT'
          WHEN bn.lifecycle_status = 'ACTIVE' OR bn.lifecycle_status IS NULL THEN 'OPERATIONAL'
          ELSE 'OPERATIONAL'
        END as effective_status
       FROM cameras c
       JOIN resource_nodes cn ON cn.id = c.resource_node_id
       JOIN resource_nodes bn ON bn.id = c.branch_node_id
       WHERE cn.tenant_id = $1
         -- Only include cameras whose branch is operational
         AND (bn.lifecycle_status IN ('ACTIVE', 'DISABLED') OR bn.lifecycle_status IS NULL)
       ORDER BY bn.name, cn.name`,
      [tenantId]
    );
    return result.rows;
  }

  /**
   * Get cameras for active monitoring only
   * 
   * Excludes cameras whose parent branch is disabled or archived
   */
  async listActiveMonitoredCameras(tenantId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT 
        c.id::text,
        c.resource_node_id::text,
        c.branch_node_id::text,
        c.vendor,
        c.model,
        c.status,
        cn.name as camera_name,
        bn.name as branch_name
       FROM cameras c
       JOIN resource_nodes cn ON cn.id = c.resource_node_id
       JOIN resource_nodes bn ON bn.id = c.branch_node_id
       WHERE cn.tenant_id = $1
         -- Only include cameras whose branch is active
         AND (bn.lifecycle_status = 'ACTIVE' OR bn.lifecycle_status IS NULL)
       ORDER BY bn.name, cn.name`,
      [tenantId]
    );
    return result.rows;
  }

  /**
   * Calculate branch health metrics excluding disabled/archived branches
   * 
   * Use this for:
   * - Global health scores
   * - SLA calculations
   * - Executive dashboards
   */
  async calculateActiveBranchHealth(tenantId: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT 
        COUNT(DISTINCT bn.id) as total_active_branches,
        COUNT(DISTINCT CASE 
          WHEN c.status = 'online' THEN c.id 
        END) as online_cameras,
        COUNT(DISTINCT c.id) as total_cameras
       FROM resource_nodes bn
       LEFT JOIN cameras cam ON cam.branch_node_id = bn.id
       LEFT JOIN cameras c ON c.branch_node_id = bn.id
       WHERE bn.tenant_id = $1
         AND bn.node_type = 'branch'
         -- Only count active branches in health metrics
         AND (bn.lifecycle_status = 'ACTIVE' OR bn.lifecycle_status IS NULL)`,
      [tenantId]
    );
    return result.rows[0];
  }

  /**
   * Get branch with full lifecycle metadata
   * 
   * Use this for:
   * - Branch detail pages
   * - Lifecycle management UI
   * - Audit displays
   */
  async getBranchWithLifecycle(branchId: string, tenantId: string): Promise<any | null> {
    const result = await this.pool.query(
      `SELECT 
        id::text,
        parent_id::text,
        tenant_id::text,
        node_type,
        name,
        path::text,
        lifecycle_status,
        lifecycle_version,
        disabled_at,
        disabled_by::text,
        disable_reason,
        reactivated_at,
        reactivated_by::text,
        reactivate_reason,
        archived_at,
        archived_by::text,
        archive_reason,
        created_at,
        updated_at
       FROM resource_nodes
       WHERE id = $1
         AND tenant_id = $2`,
      [branchId, tenantId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get lifecycle transition history for a branch
   * 
   * Use this for:
   * - Audit trails
   * - Compliance reporting
   * - Understanding lifecycle changes
   */
  async getBranchLifecycleHistory(branchId: string, tenantId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT 
        id::text,
        node_id::text,
        from_status,
        to_status,
        actor_id::text,
        reason,
        metadata,
        created_at
       FROM resource_node_lifecycle_events
       WHERE node_id = $1
         AND tenant_id = $2
       ORDER BY created_at DESC`,
      [branchId, tenantId]
    );
    return result.rows;
  }

  /**
   * Check if a branch can be monitored (is ACTIVE)
   */
  async isBranchActiveForMonitoring(branchId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 
        CASE 
          WHEN lifecycle_status = 'ACTIVE' OR lifecycle_status IS NULL THEN true
          ELSE false
        END as is_active
       FROM resource_nodes
       WHERE id = $1`,
      [branchId]
    );
    return result.rows[0]?.is_active ?? false;
  }
}

/**
 * SQL Query Examples for Common Patterns
 * 
 * These are example queries to use as reference when writing
 * lifecycle-aware queries in other parts of the codebase.
 */
export const LIFECYCLE_QUERY_EXAMPLES = {
  /**
   * Example: Filter alerts by active branches only
   */
  activeAlertsQuery: `
    SELECT a.*
    FROM analytics_alerts a
    JOIN cameras c ON c.id = a.camera_id
    JOIN resource_nodes bn ON bn.id = c.branch_node_id
    WHERE a.tenant_id = $1
      AND a.status != 'resolved'
      -- Only show alerts for active branches
      AND (bn.lifecycle_status = 'ACTIVE' OR bn.lifecycle_status IS NULL)
    ORDER BY a.created_at DESC
  `,

  /**
   * Example: Historical incident report (includes all lifecycle states)
   */
  historicalIncidentsQuery: `
    SELECT 
      i.*,
      bn.name as branch_name,
      bn.lifecycle_status as branch_lifecycle_status
    FROM incidents i
    JOIN cameras c ON c.id = i.camera_id
    JOIN resource_nodes bn ON bn.id = c.branch_node_id
    WHERE i.tenant_id = $1
      AND i.occurred_at BETWEEN $2 AND $3
      -- Include all branches for historical reports
    ORDER BY i.occurred_at DESC
  `,

  /**
   * Example: Recording compliance (only active branches)
   */
  recordingComplianceQuery: `
    SELECT 
      bn.id::text as branch_id,
      bn.name as branch_name,
      COUNT(DISTINCT c.id) as total_cameras,
      COUNT(DISTINCT CASE 
        WHEN rj.status = 'recording' THEN rj.camera_id 
      END) as recording_cameras
    FROM resource_nodes bn
    LEFT JOIN cameras cam ON cam.branch_node_id = bn.id
    LEFT JOIN cameras c ON c.branch_node_id = bn.id
    LEFT JOIN recording_jobs rj ON rj.camera_id = c.id AND rj.enabled = true
    WHERE bn.tenant_id = $1
      AND bn.node_type = 'branch'
      -- Compliance only matters for active branches
      AND (bn.lifecycle_status = 'ACTIVE' OR bn.lifecycle_status IS NULL)
    GROUP BY bn.id, bn.name
  `,

  /**
   * Example: Branch list with status badge
   */
  branchListWithStatusQuery: `
    SELECT 
      id::text,
      name,
      lifecycle_status,
      COALESCE(lifecycle_status, 'ACTIVE') as display_status,
      disabled_at,
      archived_at,
      (SELECT COUNT(*) 
       FROM cameras c 
       WHERE c.branch_node_id = resource_nodes.id) as camera_count
    FROM resource_nodes
    WHERE tenant_id = $1
      AND node_type = 'branch'
      -- Operational view: show ACTIVE and DISABLED
      AND (lifecycle_status IN ('ACTIVE', 'DISABLED') OR lifecycle_status IS NULL)
    ORDER BY 
      CASE 
        WHEN lifecycle_status = 'ACTIVE' OR lifecycle_status IS NULL THEN 0
        ELSE 1
      END,
      name
  `,
};

/**
 * Migration helper: Add lifecycle filtering to existing queries
 * 
 * When updating existing queries to be lifecycle-aware, add one of these
 * WHERE clause additions based on the query's purpose:
 */
export const LIFECYCLE_FILTER_SNIPPETS = {
  // For operational queries (monitoring, alerts, health checks)
  activeOnly: `AND (resource_nodes.lifecycle_status = 'ACTIVE' OR resource_nodes.lifecycle_status IS NULL)`,
  
  // For management queries (branch admin, configuration)
  operational: `AND (resource_nodes.lifecycle_status IN ('ACTIVE', 'DISABLED') OR resource_nodes.lifecycle_status IS NULL)`,
  
  // For historical/reporting queries (audit, compliance, incidents)
  includeAll: `-- No lifecycle filter - include all states for historical data`,
  
  // For queries with branch JOIN alias
  activeOnlyJoined: `AND (bn.lifecycle_status = 'ACTIVE' OR bn.lifecycle_status IS NULL)`,
  operationalJoined: `AND (bn.lifecycle_status IN ('ACTIVE', 'DISABLED') OR bn.lifecycle_status IS NULL)`,
};
