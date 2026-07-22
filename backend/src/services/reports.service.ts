/**
 * Reports Service
 * Handles report generation, scheduling, and delivery
 */

import { pool } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export interface ReportDefinition {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description?: string;
  reportType: string;
  category: string;
  queryConfig: any;
  outputFormat: string[];
  requiresApproval: boolean;
  isActive: boolean;
}

export interface ReportFilter {
  dateRange?: { from: Date; to: Date };
  branchIds?: string[];
  regionIds?: string[];
  cameraIds?: string[];
  status?: string;
  severity?: string;
  [key: string]: any;
}

export interface ReportRun {
  id: string;
  reportDefinitionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  filtersApplied: ReportFilter;
  outputFormat: string;
  rowCount?: number;
  fileSize?: number;
  filePath?: string;
  errorMessage?: string;
  requestedBy: string;
  startedAt?: Date;
  completedAt?: Date;
}

export class ReportsService {
  /**
   * Get camera health report data
   */
  async getCameraHealthReport(
    tenantId: string,
    filters: ReportFilter
  ): Promise<any[]> {
    const client = await pool.connect();
    
    try {
      const params: any[] = [tenantId];
      let conditions = [];
      
      if (filters.branchIds && filters.branchIds.length > 0) {
        params.push(filters.branchIds);
        conditions.push(`c.branch_node_id = ANY($${params.length})`);
      }
      
      if (filters.dateRange) {
        params.push(filters.dateRange.from);
        conditions.push(`chd.summary_date >= $${params.length}`);
        params.push(filters.dateRange.to);
        conditions.push(`chd.summary_date <= $${params.length}`);
      }
      
      const whereClause = conditions.length > 0 
        ? ` AND ${conditions.join(' AND ')}` 
        : '';
      
      const query = `
        SELECT 
          c.id as camera_id,
          c.name as camera_name,
          c.device_id,
          on.name as branch_name,
          c.location_area,
          c.manufacturer,
          c.model,
          c.ip_address,
          c.connectivity_status,
          c.last_heartbeat,
          CASE 
            WHEN c.connectivity_status = 'offline' 
            THEN EXTRACT(EPOCH FROM (NOW() - c.last_heartbeat))/60 
            ELSE 0 
          END as offline_duration_minutes,
          chd.avg_frame_rate,
          chd.avg_bitrate,
          chd.avg_network_latency_ms,
          chd.availability_percentage,
          chd.quality_issues_count,
          chd.tamper_events_count,
          chd.health_status,
          c.firmware_version,
          c.status as maintenance_state
        FROM cameras c
        LEFT JOIN organization_nodes on ON c.branch_node_id = on.id
        LEFT JOIN camera_health_daily chd ON c.id = chd.camera_id 
          AND chd.summary_date = CURRENT_DATE
        WHERE c.tenant_id = $1
          AND c.status != 'decommissioned'
          ${whereClause}
        ORDER BY 
          CASE chd.health_status
            WHEN 'critical' THEN 1
            WHEN 'warning' THEN 2
            WHEN 'healthy' THEN 3
          END,
          on.name,
          c.name
      `;
      
      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Get recording status report data
   */
  async getRecordingStatusReport(
    tenantId: string,
    filters: ReportFilter
  ): Promise<any[]> {
    const client = await pool.connect();
    
    try {
      const params: any[] = [tenantId];
      let conditions = [];
      
      if (filters.branchIds && filters.branchIds.length > 0) {
        params.push(filters.branchIds);
        conditions.push(`c.branch_node_id = ANY($${params.length})`);
      }
      
      if (filters.dateRange) {
        params.push(filters.dateRange.from);
        conditions.push(`rsd.summary_date >= $${params.length}`);
        params.push(filters.dateRange.to);
        conditions.push(`rsd.summary_date <= $${params.length}`);
      }
      
      const whereClause = conditions.length > 0 
        ? ` AND ${conditions.join(' AND ')}` 
        : '';
      
      const query = `
        SELECT 
          c.id as camera_id,
          c.name as camera_name,
          on.name as branch_name,
          c.recording_mode,
          rsd.expected_recording_minutes,
          rsd.available_recording_minutes,
          rsd.availability_percentage,
          rsd.gap_count,
          rsd.total_gap_minutes,
          rsd.largest_gap_minutes,
          rsd.integrity_verified,
          rsd.verification_status,
          rsd.retention_compliant,
          rsd.legal_hold_active,
          rsd.summary_date
        FROM cameras c
        LEFT JOIN organization_nodes on ON c.branch_node_id = on.id
        LEFT JOIN recording_status_daily rsd ON c.id = rsd.camera_id
          AND rsd.summary_date BETWEEN 
            COALESCE($2, CURRENT_DATE - INTERVAL '7 days') 
            AND COALESCE($3, CURRENT_DATE)
        WHERE c.tenant_id = $1
          AND c.status = 'active'
          ${whereClause}
        ORDER BY 
          rsd.availability_percentage ASC NULLS LAST,
          on.name,
          c.name
      `;
      
      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Get storage utilization report data
   */
  async getStorageUtilizationReport(
    tenantId: string,
    filters: ReportFilter
  ): Promise<any[]> {
    const client = await pool.connect();
    
    try {
      const params: any[] = [tenantId];
      let conditions = [];
      
      if (filters.branchIds && filters.branchIds.length > 0) {
        params.push(filters.branchIds);
        conditions.push(`scs.branch_node_id = ANY($${params.length})`);
      }
      
      const whereClause = conditions.length > 0 
        ? ` AND ${conditions.join(' AND ')}` 
        : '';
      
      const query = `
        WITH latest_snapshots AS (
          SELECT DISTINCT ON (storage_node_id)
            storage_node_id,
            branch_node_id,
            total_capacity_bytes,
            used_capacity_bytes,
            available_capacity_bytes,
            utilization_percentage,
            daily_growth_bytes,
            forecast_full_days,
            raid_status,
            disk_health_status,
            replication_status,
            backup_status,
            snapshot_time
          FROM storage_capacity_snapshots
          WHERE tenant_id = $1 ${whereClause}
            AND snapshot_time >= NOW() - INTERVAL '1 hour'
          ORDER BY storage_node_id, snapshot_time DESC
        )
        SELECT 
          ls.storage_node_id,
          on.name as branch_name,
          ls.total_capacity_bytes,
          ls.used_capacity_bytes,
          ls.available_capacity_bytes,
          ls.utilization_percentage,
          ls.daily_growth_bytes,
          ls.forecast_full_days,
          ls.raid_status,
          ls.disk_health_status,
          ls.replication_status,
          ls.backup_status,
          ls.snapshot_time
        FROM latest_snapshots ls
        LEFT JOIN organization_nodes on ON ls.branch_node_id = on.id
        ORDER BY ls.utilization_percentage DESC
      `;
      
      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Get incident register report data
   */
  async getIncidentRegisterReport(
    tenantId: string,
    filters: ReportFilter
  ): Promise<any[]> {
    const client = await pool.connect();
    
    try {
      const params: any[] = [tenantId];
      let conditions = [];
      
      if (filters.branchIds && filters.branchIds.length > 0) {
        params.push(filters.branchIds);
        conditions.push(`i.branch_node_id = ANY($${params.length})`);
      }
      
      if (filters.dateRange) {
        params.push(filters.dateRange.from);
        conditions.push(`i.occurred_at >= $${params.length}`);
        params.push(filters.dateRange.to);
        conditions.push(`i.occurred_at <= $${params.length}`);
      }
      
      if (filters.severity) {
        params.push(filters.severity);
        conditions.push(`i.severity = $${params.length}`);
      }
      
      if (filters.status) {
        params.push(filters.status);
        conditions.push(`i.status = $${params.length}`);
      }
      
      const whereClause = conditions.length > 0 
        ? ` AND ${conditions.join(' AND ')}` 
        : '';
      
      const query = `
        SELECT 
          i.id,
          i.incident_number,
          i.occurred_at,
          on.name as branch_name,
          i.incident_type,
          i.detection_source,
          i.severity,
          i.description,
          i.status,
          u1.full_name as investigator,
          i.police_reference,
          i.insurance_reference,
          i.estimated_loss,
          CASE WHEN ec.id IS NOT NULL THEN true ELSE false END as evidence_preserved,
          CASE WHEN lh.id IS NOT NULL THEN true ELSE false END as legal_hold_active,
          i.resolution,
          i.closed_at
        FROM incidents i
        LEFT JOIN organization_nodes on ON i.branch_node_id = on.id
        LEFT JOIN users u1 ON i.assigned_to = u1.id
        LEFT JOIN evidence_cases ec ON i.id = ec.incident_id
        LEFT JOIN legal_holds lh ON i.id = lh.incident_id AND lh.status = 'active'
        WHERE i.tenant_id = $1 ${whereClause}
        ORDER BY i.occurred_at DESC
      `;
      
      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Get footage retrieval log report data
   */
  async getFootageRetrievalReport(
    tenantId: string,
    filters: ReportFilter
  ): Promise<any[]> {
    const client = await pool.connect();
    
    try {
      const params: any[] = [tenantId];
      let conditions = [];
      
      if (filters.branchIds && filters.branchIds.length > 0) {
        params.push(filters.branchIds);
        conditions.push(`frl.branch_node_id = ANY($${params.length})`);
      }
      
      if (filters.dateRange) {
        params.push(filters.dateRange.from);
        conditions.push(`frl.created_at >= $${params.length}`);
        params.push(filters.dateRange.to);
        conditions.push(`frl.created_at <= $${params.length}`);
      }
      
      const whereClause = conditions.length > 0 
        ? ` AND ${conditions.join(' AND ')}` 
        : '';
      
      const query = `
        SELECT 
          frl.id,
          u.username,
          u.role,
          on.name as branch_name,
          c.name as camera_name,
          frl.recording_start,
          frl.recording_end,
          frl.action_type,
          frl.purpose,
          i.incident_number,
          frl.case_reference,
          frl.approval_required,
          u2.full_name as approved_by,
          frl.approved_at,
          frl.recipient,
          frl.watermark_id,
          frl.ip_address,
          frl.result,
          frl.created_at
        FROM footage_retrieval_log frl
        LEFT JOIN users u ON frl.user_id = u.id
        LEFT JOIN cameras c ON frl.camera_id = c.id
        LEFT JOIN organization_nodes on ON frl.branch_node_id = on.id
        LEFT JOIN incidents i ON frl.incident_id = i.id
        LEFT JOIN users u2 ON frl.approved_by = u2.id
        WHERE frl.tenant_id = $1 ${whereClause}
        ORDER BY frl.created_at DESC
      `;
      
      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Get maintenance log report data
   */
  async getMaintenanceLogReport(
    tenantId: string,
    filters: ReportFilter
  ): Promise<any[]> {
    const client = await pool.connect();
    
    try {
      const params: any[] = [tenantId];
      let conditions = [];
      
      if (filters.branchIds && filters.branchIds.length > 0) {
        params.push(filters.branchIds);
        conditions.push(`wo.branch_node_id = ANY($${params.length})`);
      }
      
      if (filters.dateRange) {
        params.push(filters.dateRange.from);
        conditions.push(`wo.created_at >= $${params.length}`);
        params.push(filters.dateRange.to);
        conditions.push(`wo.created_at <= $${params.length}`);
      }
      
      const whereClause = conditions.length > 0 
        ? ` AND ${conditions.join(' AND ')}` 
        : '';
      
      const query = `
        SELECT 
          wo.id,
          wo.work_order_number,
          on.name as branch_name,
          ma.name as asset_name,
          wo.work_type,
          wo.problem_description,
          wo.priority,
          v.name as vendor_name,
          wo.technician_name,
          wo.created_at,
          wo.scheduled_date,
          wo.visit_date,
          wo.work_completed,
          wo.parts_used,
          wo.downtime_minutes,
          wo.sla_status,
          wo.verification_result,
          wo.status,
          wo.completed_at,
          wo.cost
        FROM maintenance_work_orders wo
        LEFT JOIN organization_nodes on ON wo.branch_node_id = on.id
        LEFT JOIN maintenance_assets ma ON wo.asset_id = ma.id
        LEFT JOIN maintenance_vendors v ON wo.vendor_id = v.id
        WHERE wo.tenant_id = $1 ${whereClause}
        ORDER BY wo.created_at DESC
      `;
      
      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Get downtime report data
   */
  async getDowntimeReport(
    tenantId: string,
    filters: ReportFilter
  ): Promise<any[]> {
    const client = await pool.connect();
    
    try {
      const params: any[] = [tenantId];
      let conditions = [];
      
      if (filters.branchIds && filters.branchIds.length > 0) {
        params.push(filters.branchIds);
        conditions.push(`de.branch_node_id = ANY($${params.length})`);
      }
      
      if (filters.dateRange) {
        params.push(filters.dateRange.from);
        conditions.push(`de.downtime_start >= $${params.length}`);
        params.push(filters.dateRange.to);
        conditions.push(`de.downtime_start <= $${params.length}`);
      }
      
      const whereClause = conditions.length > 0 
        ? ` AND ${conditions.join(' AND ')}` 
        : '';
      
      const query = `
        SELECT 
          de.id,
          de.asset_type,
          COALESCE(c.name, de.asset_id::text) as asset_name,
          on.name as branch_name,
          de.downtime_start,
          de.downtime_end,
          de.duration_minutes,
          de.planned,
          de.root_cause,
          de.impact_description,
          de.cameras_affected,
          i.incident_number,
          wo.work_order_number,
          de.sla_breached,
          de.corrective_action
        FROM downtime_events de
        LEFT JOIN cameras c ON de.asset_id = c.id::text AND de.asset_type = 'camera'
        LEFT JOIN organization_nodes on ON de.branch_node_id = on.id
        LEFT JOIN incidents i ON de.incident_id = i.id
        LEFT JOIN maintenance_work_orders wo ON de.work_order_id = wo.id
        WHERE de.tenant_id = $1 ${whereClause}
        ORDER BY de.downtime_start DESC
      `;
      
      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Get alert summary report data
   */
  async getAlertSummaryReport(
    tenantId: string,
    filters: ReportFilter
  ): Promise<any[]> {
    const client = await pool.connect();
    
    try {
      const params: any[] = [tenantId];
      let conditions = [];
      
      if (filters.branchIds && filters.branchIds.length > 0) {
        params.push(filters.branchIds);
        conditions.push(`aa.branch_node_id = ANY($${params.length})`);
      }
      
      if (filters.dateRange) {
        params.push(filters.dateRange.from);
        conditions.push(`aa.triggered_at >= $${params.length}`);
        params.push(filters.dateRange.to);
        conditions.push(`aa.triggered_at <= $${params.length}`);
      }
      
      const whereClause = conditions.length > 0 
        ? ` AND ${conditions.join(' AND ')}` 
        : '';
      
      const query = `
        SELECT 
          aa.id,
          aa.alert_type,
          aa.source,
          on.name as branch_name,
          c.name as camera_name,
          aa.severity,
          aa.triggered_at,
          aa.acknowledged_at,
          aa.resolved_at,
          u.full_name as assigned_operator,
          aa.escalated_at,
          i.incident_number,
          aa.false_alarm,
          aa.closure_reason,
          EXTRACT(EPOCH FROM (aa.acknowledged_at - aa.triggered_at))/60 as acknowledgment_time_minutes,
          EXTRACT(EPOCH FROM (aa.resolved_at - aa.triggered_at))/60 as resolution_time_minutes
        FROM analytics_alerts aa
        LEFT JOIN cameras c ON aa.camera_id = c.id
        LEFT JOIN organization_nodes on ON aa.branch_node_id = on.id
        LEFT JOIN users u ON aa.assigned_to = u.id
        LEFT JOIN incidents i ON aa.incident_id = i.id
        WHERE aa.tenant_id = $1 ${whereClause}
        ORDER BY aa.triggered_at DESC
      `;
      
      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Create a report run
   */
  async createReportRun(
    tenantId: string,
    reportDefinitionId: string,
    filters: ReportFilter,
    outputFormat: string,
    requestedBy: string
  ): Promise<string> {
    const client = await pool.connect();
    
    try {
      const query = `
        INSERT INTO report_runs (
          tenant_id,
          report_definition_id,
          status,
          filters_applied,
          output_format,
          requested_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `;
      
      const result = await client.query(query, [
        tenantId,
        reportDefinitionId,
        'pending',
        JSON.stringify(filters),
        outputFormat,
        requestedBy
      ]);
      
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  /**
   * Update report run status
   */
  async updateReportRunStatus(
    runId: string,
    status: string,
    updates: Partial<ReportRun>
  ): Promise<void> {
    const client = await pool.connect();
    
    try {
      const fields = ['status = $2'];
      const params: any[] = [runId, status];
      let paramIndex = 3;
      
      if (updates.rowCount !== undefined) {
        fields.push(`row_count = $${paramIndex++}`);
        params.push(updates.rowCount);
      }
      
      if (updates.fileSize !== undefined) {
        fields.push(`file_size = $${paramIndex++}`);
        params.push(updates.fileSize);
      }
      
      if (updates.filePath) {
        fields.push(`file_path = $${paramIndex++}`);
        params.push(updates.filePath);
      }
      
      if (updates.errorMessage) {
        fields.push(`error_message = $${paramIndex++}`);
        params.push(updates.errorMessage);
      }
      
      if (status === 'running') {
        fields.push(`started_at = NOW()`);
      }
      
      if (status === 'completed' || status === 'failed') {
        fields.push(`completed_at = NOW()`);
      }
      
      const query = `
        UPDATE report_runs 
        SET ${fields.join(', ')}
        WHERE id = $1
      `;
      
      await client.query(query, params);
    } finally {
      client.release();
    }
  }
}

export const reportsService = new ReportsService();
