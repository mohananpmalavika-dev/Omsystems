/**
 * Dashboard Service
 * Provides aggregated operational metrics for role-based dashboards
 */

import type { Pool } from 'pg';

export interface DashboardSummary {
  systemStatus: 'operational' | 'degraded' | 'critical';
  systemHealthScore: number;
  criticalAlerts: number;
  activeIncidents: number;
  lastUpdated: Date;
}

export interface CameraMetrics {
  totalRegistered: number;
  operational: number;
  online: number;
  offline: number;
  degraded: number;
  underMaintenance: number;
  pendingCommissioning: number;
  decommissioned: number;
  availabilityPercentage: number;
}

export interface RecordingMetrics {
  recordingNormally: number;
  recordingWithGaps: number;
  recordingStopped: number;
  verificationPending: number;
  availabilityPercentage: number;
}

export interface StorageMetrics {
  totalCapacityBytes: bigint;
  usedCapacityBytes: bigint;
  availableCapacityBytes: bigint;
  utilizationPercentage: number;
  forecastFullDays: number;
  criticalNodes: number;
}

export interface AlertMetrics {
  totalActive: number;
  unacknowledged: number;
  critical: number;
  escalated: number;
  slaBreached: number;
}

export interface RecentIncident {
  id: string;
  incidentNumber: string;
  occurredAt: Date;
  branchName: string;
  incidentType: string;
  severity: string;
  status: string;
  assignedTo?: string;
}

export class DashboardService {
  constructor(private pool: Pool) {}

  /**
   * Get dashboard summary for header
   */
  async getDashboardSummary(
    tenantId: string,
    userScope?: { branchIds?: string[]; regionIds?: string[] }
  ): Promise<DashboardSummary> {
    const client = await this.pool.connect();
    
    try {
      // Get system health score
      const healthQuery = `
        SELECT overall_score, health_status
        FROM system_health_scores
        WHERE tenant_id = $1
          AND branch_node_id IS NULL
          AND score_time >= NOW() - INTERVAL '15 minutes'
        ORDER BY score_time DESC
        LIMIT 1
      `;
      const healthResult = await client.query(healthQuery, [tenantId]);
      
      // Get critical alerts count
      const alertsQuery = `
        SELECT COUNT(*) as count
        FROM analytics_alerts
        WHERE tenant_id = $1
          AND status = 'active'
          AND severity = 'critical'
      `;
      const alertsResult = await client.query(alertsQuery, [tenantId]);
      
      // Get active incidents count
      const incidentsQuery = `
        SELECT COUNT(*) as count
        FROM incidents
        WHERE tenant_id = $1
          AND status NOT IN ('closed', 'resolved')
      `;
      const incidentsResult = await client.query(incidentsQuery, [tenantId]);
      
      const healthScore = healthResult.rows[0]?.overall_score || 0;
      const healthStatus = healthResult.rows[0]?.health_status || 'unknown';
      
      let systemStatus: 'operational' | 'degraded' | 'critical' = 'operational';
      if (healthScore < 70 || healthStatus === 'critical') {
        systemStatus = 'critical';
      } else if (healthScore < 85 || healthStatus === 'warning') {
        systemStatus = 'degraded';
      }
      
      return {
        systemStatus,
        systemHealthScore: Number(healthScore),
        criticalAlerts: parseInt(alertsResult.rows[0]?.count || 0),
        activeIncidents: parseInt(incidentsResult.rows[0]?.count || 0),
        lastUpdated: new Date()
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get camera metrics
   */
  async getCameraMetrics(
    tenantId: string,
    userScope?: { branchIds?: string[]; regionIds?: string[] }
  ): Promise<CameraMetrics> {
    const client = await this.pool.connect();
    
    try {
      let scopeCondition = '';
      const params: any[] = [tenantId];
      
      if (userScope?.branchIds && userScope.branchIds.length > 0) {
        params.push(userScope.branchIds);
        scopeCondition = ` AND branch_node_id = ANY($${params.length})`;
      }
      
      const query = `
        SELECT 
          COUNT(*) as total_registered,
          COUNT(*) FILTER (WHERE status != 'decommissioned') as operational,
          COUNT(*) FILTER (WHERE connectivity_status = 'online' AND status = 'active') as online,
          COUNT(*) FILTER (WHERE connectivity_status = 'offline' AND status = 'active') as offline,
          COUNT(*) FILTER (WHERE connectivity_status = 'degraded' AND status = 'active') as degraded,
          COUNT(*) FILTER (WHERE status = 'maintenance') as under_maintenance,
          COUNT(*) FILTER (WHERE status = 'pending_approval') as pending_commissioning,
          COUNT(*) FILTER (WHERE status = 'decommissioned') as decommissioned
        FROM cameras
        WHERE tenant_id = $1 ${scopeCondition}
      `;
      
      const result = await client.query(query, params);
      const row = result.rows[0];
      
      const online = parseInt(row.online || 0);
      const operational = parseInt(row.operational || 0);
      const availabilityPercentage = operational > 0 
        ? (online / operational) * 100 
        : 0;
      
      return {
        totalRegistered: parseInt(row.total_registered || 0),
        operational,
        online,
        offline: parseInt(row.offline || 0),
        degraded: parseInt(row.degraded || 0),
        underMaintenance: parseInt(row.under_maintenance || 0),
        pendingCommissioning: parseInt(row.pending_commissioning || 0),
        decommissioned: parseInt(row.decommissioned || 0),
        availabilityPercentage: Math.round(availabilityPercentage * 100) / 100
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get recording status metrics
   */
  async getRecordingMetrics(
    tenantId: string,
    userScope?: { branchIds?: string[]; regionIds?: string[] }
  ): Promise<RecordingMetrics> {
    const client = await this.pool.connect();
    
    try {
      let scopeCondition = '';
      const params: any[] = [tenantId];
      
      if (userScope?.branchIds && userScope.branchIds.length > 0) {
        params.push(userScope.branchIds);
        scopeCondition = ` AND c.branch_node_id = ANY($${params.length})`;
      }
      
      const query = `
        SELECT 
          COUNT(*) FILTER (WHERE rs.recording_status = 'recording' AND rs.gap_count = 0) as recording_normally,
          COUNT(*) FILTER (WHERE rs.recording_status = 'recording' AND rs.gap_count > 0) as recording_with_gaps,
          COUNT(*) FILTER (WHERE rs.recording_status = 'stopped') as recording_stopped,
          COUNT(*) FILTER (WHERE rs.recording_status = 'recording' AND rs.integrity_verified = false) as verification_pending,
          AVG(rs.availability_percentage) as avg_availability
        FROM cameras c
        LEFT JOIN LATERAL (
          SELECT recording_status, gap_count, integrity_verified, availability_percentage
          FROM recording_status_daily
          WHERE camera_id = c.id
            AND summary_date = CURRENT_DATE
          ORDER BY summary_date DESC
          LIMIT 1
        ) rs ON true
        WHERE c.tenant_id = $1 
          AND c.status = 'active'
          ${scopeCondition}
      `;
      
      const result = await client.query(query, params);
      const row = result.rows[0];
      
      return {
        recordingNormally: parseInt(row.recording_normally || 0),
        recordingWithGaps: parseInt(row.recording_with_gaps || 0),
        recordingStopped: parseInt(row.recording_stopped || 0),
        verificationPending: parseInt(row.verification_pending || 0),
        availabilityPercentage: parseFloat(row.avg_availability || 0)
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get storage metrics
   */
  async getStorageMetrics(
    tenantId: string,
    userScope?: { branchIds?: string[]; regionIds?: string[] }
  ): Promise<StorageMetrics> {
    const client = await this.pool.connect();
    
    try {
      let scopeCondition = '';
      const params: any[] = [tenantId];
      
      if (userScope?.branchIds && userScope.branchIds.length > 0) {
        params.push(userScope.branchIds);
        scopeCondition = ` AND branch_node_id = ANY($${params.length})`;
      }
      
      const query = `
        WITH latest_snapshots AS (
          SELECT DISTINCT ON (storage_node_id)
            storage_node_id,
            total_capacity_bytes,
            used_capacity_bytes,
            available_capacity_bytes,
            utilization_percentage,
            forecast_full_days,
            alert_threshold_exceeded
          FROM storage_capacity_snapshots
          WHERE tenant_id = $1 ${scopeCondition}
            AND snapshot_time >= NOW() - INTERVAL '15 minutes'
          ORDER BY storage_node_id, snapshot_time DESC
        )
        SELECT 
          SUM(total_capacity_bytes) as total_capacity,
          SUM(used_capacity_bytes) as used_capacity,
          SUM(available_capacity_bytes) as available_capacity,
          AVG(utilization_percentage) as avg_utilization,
          MIN(forecast_full_days) as min_forecast_days,
          COUNT(*) FILTER (WHERE alert_threshold_exceeded = true) as critical_nodes
        FROM latest_snapshots
      `;
      
      const result = await client.query(query, params);
      const row = result.rows[0];
      
      return {
        totalCapacityBytes: BigInt(row.total_capacity || 0),
        usedCapacityBytes: BigInt(row.used_capacity || 0),
        availableCapacityBytes: BigInt(row.available_capacity || 0),
        utilizationPercentage: parseFloat(row.avg_utilization || 0),
        forecastFullDays: parseInt(row.min_forecast_days || 999),
        criticalNodes: parseInt(row.critical_nodes || 0)
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get alert metrics
   */
  async getAlertMetrics(
    tenantId: string,
    userScope?: { branchIds?: string[]; regionIds?: string[] }
  ): Promise<AlertMetrics> {
    const client = await this.pool.connect();
    
    try {
      let scopeCondition = '';
      const params: any[] = [tenantId];
      
      if (userScope?.branchIds && userScope.branchIds.length > 0) {
        params.push(userScope.branchIds);
        scopeCondition = ` AND branch_node_id = ANY($${params.length})`;
      }
      
      const query = `
        SELECT 
          COUNT(*) as total_active,
          COUNT(*) FILTER (WHERE acknowledged_at IS NULL) as unacknowledged,
          COUNT(*) FILTER (WHERE severity = 'critical') as critical,
          COUNT(*) FILTER (WHERE escalated_at IS NOT NULL) as escalated,
          COUNT(*) FILTER (WHERE sla_deadline < NOW() AND resolved_at IS NULL) as sla_breached
        FROM analytics_alerts
        WHERE tenant_id = $1 
          AND status = 'active'
          ${scopeCondition}
      `;
      
      const result = await client.query(query, params);
      const row = result.rows[0];
      
      return {
        totalActive: parseInt(row.total_active || 0),
        unacknowledged: parseInt(row.unacknowledged || 0),
        critical: parseInt(row.critical || 0),
        escalated: parseInt(row.escalated || 0),
        slaBreached: parseInt(row.sla_breached || 0)
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get recent high-priority incidents
   */
  async getRecentIncidents(
    tenantId: string,
    limit: number = 10,
    userScope?: { branchIds?: string[]; regionIds?: string[] }
  ): Promise<RecentIncident[]> {
    const client = await this.pool.connect();
    
    try {
      let scopeCondition = '';
      const params: any[] = [tenantId, limit];
      
      if (userScope?.branchIds && userScope.branchIds.length > 0) {
        params.push(userScope.branchIds);
        scopeCondition = ` AND i.branch_node_id = ANY($${params.length})`;
      }
      
      const query = `
        SELECT 
          i.id,
          i.incident_number,
          i.occurred_at,
          on.name as branch_name,
          i.incident_type,
          i.severity,
          i.status,
          u.full_name as assigned_to
        FROM incidents i
        LEFT JOIN organization_nodes on ON i.branch_node_id = on.id
        LEFT JOIN users u ON i.assigned_to = u.id
        WHERE i.tenant_id = $1
          ${scopeCondition}
        ORDER BY 
          CASE i.severity
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
          END,
          i.occurred_at DESC
        LIMIT $2
      `;
      
      const result = await client.query(query, params);
      
      return result.rows.map(row => ({
        id: row.id,
        incidentNumber: row.incident_number,
        occurredAt: row.occurred_at,
        branchName: row.branch_name,
        incidentType: row.incident_type,
        severity: row.severity,
        status: row.status,
        assignedTo: row.assigned_to
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Get system health score with breakdown
   */
  async getSystemHealthScore(
    tenantId: string,
    branchNodeId?: string
  ): Promise<any> {
    const client = await this.pool.connect();
    
    try {
      const params: any[] = [tenantId];
      let branchCondition = 'branch_node_id IS NULL';
      
      if (branchNodeId) {
        params.push(branchNodeId);
        branchCondition = `branch_node_id = $${params.length}`;
      }
      
      const query = `
        SELECT 
          shs.overall_score,
          shs.camera_availability_score,
          shs.recording_availability_score,
          shs.storage_health_score,
          shs.network_health_score,
          shs.power_health_score,
          shs.integration_health_score,
          shs.maintenance_compliance_score,
          shs.security_audit_score,
          shs.health_status,
          shs.score_time,
          json_agg(
            json_build_object(
              'componentName', shc.component_name,
              'score', shc.component_score,
              'weight', shc.weight_percentage,
              'contribution', shc.weighted_contribution,
              'status', shc.status,
              'details', shc.details
            )
          ) as components
        FROM system_health_scores shs
        LEFT JOIN system_health_components shc ON shs.id = shc.health_score_id
        WHERE shs.tenant_id = $1
          AND ${branchCondition}
          AND shs.score_time >= NOW() - INTERVAL '15 minutes'
        GROUP BY shs.id
        ORDER BY shs.score_time DESC
        LIMIT 1
      `;
      
      const result = await client.query(query, params);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const row = result.rows[0];
      return {
        overallScore: parseFloat(row.overall_score),
        healthStatus: row.health_status,
        scoreTime: row.score_time,
        componentScores: {
          cameraAvailability: parseFloat(row.camera_availability_score || 0),
          recordingAvailability: parseFloat(row.recording_availability_score || 0),
          storageHealth: parseFloat(row.storage_health_score || 0),
          networkHealth: parseFloat(row.network_health_score || 0),
          powerHealth: parseFloat(row.power_health_score || 0),
          integrationHealth: parseFloat(row.integration_health_score || 0),
          maintenanceCompliance: parseFloat(row.maintenance_compliance_score || 0),
          securityAudit: parseFloat(row.security_audit_score || 0)
        },
        components: row.components
      };
    } finally {
      client.release();
    }
  }
}

// Export a factory function instead of a singleton
export const createDashboardService = (pool: Pool) => new DashboardService(pool);
