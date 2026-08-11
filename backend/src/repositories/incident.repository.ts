/**
 * Incident Repository
 * 
 * Provides tenant-scoped database access for incidents with
 * cursor pagination, filtering, and proper isolation.
 */

import { Pool } from 'pg';
import {
  Incident,
  IncidentListItem,
  IncidentDetails,
  IncidentListFilters,
  IncidentStatisticsFilters,
  IncidentStatistics,
  IncidentListResult,
  IncidentCursor,
  CreateIncidentInput,
  UpdateIncidentInput,
  IncidentStatus,
  IncidentSeverity,
  ACTIVE_INCIDENT_STATUSES,
} from '../types/incident.types.js';

/**
 * Encode cursor for pagination
 */
export function encodeCursor(cursor: IncidentCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/**
 * Decode cursor from pagination
 */
export function decodeCursor(value: string): IncidentCursor | null {
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);
    
    if (!parsed.createdAt || !parsed.id) {
      return null;
    }
    
    return {
      createdAt: parsed.createdAt,
      id: parsed.id,
    };
  } catch {
    return null;
  }
}

export class IncidentRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * List incidents with tenant scoping, filtering, and cursor pagination
   */
  async list(filters: IncidentListFilters): Promise<IncidentListResult> {
    const {
      tenantId,
      status,
      severity,
      type,
      branchId,
      cameraId,
      deviceId,
      assignedTo,
      unassigned,
      from,
      to,
      search,
      limit,
      cursor,
      sort = 'createdAt',
      order = 'desc',
    } = filters;

    // Build WHERE conditions
    const conditions: string[] = ['i.tenant_id = $1'];
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (status) {
      conditions.push(`i.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (severity) {
      conditions.push(`i.severity = $${paramIndex}`);
      params.push(severity);
      paramIndex++;
    }

    if (type) {
      conditions.push(`i.incident_type = $${paramIndex}`);
      params.push(type);
      paramIndex++;
    }

    if (branchId) {
      conditions.push(`i.branch_id = $${paramIndex}`);
      params.push(branchId);
      paramIndex++;
    }

    if (cameraId) {
      conditions.push(`i.camera_id = $${paramIndex}`);
      params.push(cameraId);
      paramIndex++;
    }

    if (deviceId) {
      conditions.push(`i.device_id = $${paramIndex}`);
      params.push(deviceId);
      paramIndex++;
    }

    if (assignedTo) {
      conditions.push(`i.assigned_to = $${paramIndex}`);
      params.push(assignedTo);
      paramIndex++;
    }

    if (unassigned) {
      conditions.push('i.assigned_to IS NULL');
    }

    if (from) {
      conditions.push(`i.created_at >= $${paramIndex}`);
      params.push(from);
      paramIndex++;
    }

    if (to) {
      conditions.push(`i.created_at <= $${paramIndex}`);
      params.push(to);
      paramIndex++;
    }

    if (search) {
      conditions.push(`(
        to_tsvector('english', COALESCE(i.title, '') || ' ' || COALESCE(i.description, ''))
        @@ plainto_tsquery('english', $${paramIndex})
        OR i.title ILIKE $${paramIndex + 1}
        OR i.description ILIKE $${paramIndex + 1}
      )`);
      params.push(search, `%${search}%`);
      paramIndex += 2;
    }

    // Cursor pagination
    if (cursor) {
      if (order === 'desc') {
        conditions.push(`(
          i.${sort} < $${paramIndex}
          OR (i.${sort} = $${paramIndex} AND i.id < $${paramIndex + 1})
        )`);
      } else {
        conditions.push(`(
          i.${sort} > $${paramIndex}
          OR (i.${sort} = $${paramIndex} AND i.id > $${paramIndex + 1})
        )`);
      }
      params.push(cursor.createdAt, cursor.id);
      paramIndex += 2;
    }

    // Build ORDER BY
    const orderDirection = order === 'desc' ? 'DESC' : 'ASC';
    const orderClause = `i.${sort} ${orderDirection}, i.id ${orderDirection}`;

    // Query with joins for related data
    const query = `
      SELECT
        i.id,
        i.title,
        i.incident_type,
        i.status,
        i.severity,
        i.alert_count,
        i.first_detected_at,
        i.last_detected_at,
        i.created_at,
        i.updated_at,
        
        -- Branch info
        b.id AS branch_id,
        b.name AS branch_name,
        
        -- Camera info
        c.id AS camera_id,
        c.name AS camera_name,
        
        -- Assigned user info
        u.id AS assigned_user_id,
        u.display_name AS assigned_user_name
        
      FROM incidents i
      
      LEFT JOIN branches b
        ON b.id = i.branch_id
        AND b.tenant_id = i.tenant_id
      
      LEFT JOIN cameras c
        ON c.id = i.camera_id
        AND c.tenant_id = i.tenant_id
      
      LEFT JOIN users u
        ON u.id = i.assigned_to
      
      WHERE ${conditions.join(' AND ')}
      
      ORDER BY ${orderClause}
      
      LIMIT $${paramIndex}
    `;

    params.push(limit + 1); // Fetch one extra to detect hasMore

    const result = await this.pool.query(query, params);

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;

    const incidents: IncidentListItem[] = rows.map(row => ({
      id: row.id,
      title: row.title,
      incidentType: row.incident_type,
      status: row.status,
      severity: row.severity,
      branch: row.branch_id ? {
        id: row.branch_id,
        name: row.branch_name,
      } : null,
      camera: row.camera_id ? {
        id: row.camera_id,
        name: row.camera_name,
      } : null,
      alertCount: row.alert_count,
      assignedTo: row.assigned_user_id ? {
        id: row.assigned_user_id,
        displayName: row.assigned_user_name,
      } : null,
      firstDetectedAt: row.first_detected_at?.toISOString() ?? null,
      lastDetectedAt: row.last_detected_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));

    const lastIncident = incidents[incidents.length - 1];
    const nextCursor = hasMore && lastIncident
      ? encodeCursor({
          createdAt: lastIncident.createdAt,
          id: lastIncident.id,
        })
      : null;

    return {
      incidents,
      hasMore,
      nextCursor,
    };
  }

  /**
   * Get incident by ID with tenant scoping
   */
  async getById(tenantId: string, incidentId: string): Promise<IncidentDetails | null> {
    const query = `
      SELECT
        i.*,
        
        -- Branch info
        b.id AS branch_id,
        b.name AS branch_name,
        b.address AS branch_address,
        
        -- Camera info
        c.id AS camera_id,
        c.name AS camera_name,
        c.location AS camera_location,
        
        -- Assigned user
        u.id AS assigned_user_id,
        u.display_name AS assigned_user_name,
        u.email AS assigned_user_email,
        
        -- Acknowledged by user
        ack.id AS acknowledged_user_id,
        ack.display_name AS acknowledged_user_name,
        
        -- Resolved by user
        res.id AS resolved_user_id,
        res.display_name AS resolved_user_name
        
      FROM incidents i
      
      LEFT JOIN branches b
        ON b.id = i.branch_id
        AND b.tenant_id = i.tenant_id
      
      LEFT JOIN cameras c
        ON c.id = i.camera_id
        AND c.tenant_id = i.tenant_id
      
      LEFT JOIN users u
        ON u.id = i.assigned_to
      
      LEFT JOIN users ack
        ON ack.id = i.acknowledged_by
      
      LEFT JOIN users res
        ON res.id = i.resolved_by
      
      WHERE i.id = $1
        AND i.tenant_id = $2
    `;

    const result = await this.pool.query(query, [incidentId, tenantId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    // Fetch associated alerts
    const alertsQuery = `
      SELECT
        alert_id,
        alert_type,
        alert_severity,
        camera_id,
        detected_at
      FROM incident_alerts
      WHERE incident_id = $1
      ORDER BY detected_at DESC
    `;

    const alertsResult = await this.pool.query(alertsQuery, [incidentId]);

    return {
      id: row.id,
      tenantId: row.tenant_id,
      title: row.title,
      description: row.description,
      incidentType: row.incident_type,
      severity: row.severity,
      status: row.status,
      branchId: row.branch_id,
      cameraId: row.camera_id,
      deviceId: row.device_id,
      assignedTo: row.assigned_to,
      alertCount: row.alert_count,
      firstDetectedAt: row.first_detected_at,
      lastDetectedAt: row.last_detected_at,
      acknowledgedAt: row.acknowledged_at,
      acknowledgedBy: row.acknowledged_by,
      resolvedAt: row.resolved_at,
      resolvedBy: row.resolved_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: row.metadata,
      branch: row.branch_id ? {
        id: row.branch_id,
        name: row.branch_name,
        address: row.branch_address,
      } : null,
      camera: row.camera_id ? {
        id: row.camera_id,
        name: row.camera_name,
        location: row.camera_location,
      } : null,
      assignedUser: row.assigned_user_id ? {
        id: row.assigned_user_id,
        displayName: row.assigned_user_name,
        email: row.assigned_user_email,
      } : null,
      acknowledgedByUser: row.acknowledged_user_id ? {
        id: row.acknowledged_user_id,
        displayName: row.acknowledged_user_name,
      } : null,
      resolvedByUser: row.resolved_user_id ? {
        id: row.resolved_user_id,
        displayName: row.resolved_user_name,
      } : null,
      alerts: alertsResult.rows.map(alert => ({
        id: alert.alert_id,
        type: alert.alert_type,
        severity: alert.alert_severity,
        cameraId: alert.camera_id,
        timestamp: alert.detected_at,
      })),
    };
  }

  /**
   * Create new incident
   */
  async create(input: CreateIncidentInput): Promise<Incident> {
    const query = `
      INSERT INTO incidents (
        tenant_id,
        title,
        description,
        incident_type,
        severity,
        status,
        branch_id,
        camera_id,
        device_id,
        alert_count,
        first_detected_at,
        last_detected_at,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      input.tenantId,
      input.title,
      input.description,
      input.incidentType,
      input.severity,
      'OPEN', // Default status
      input.branchId ?? null,
      input.cameraId ?? null,
      input.deviceId ?? null,
      input.alertCount,
      input.firstDetectedAt ?? null,
      input.lastDetectedAt ?? null,
      JSON.stringify(input.metadata ?? {}),
    ]);

    return this.mapRowToIncident(result.rows[0]);
  }

  /**
   * Update incident
   */
  async update(
    tenantId: string,
    incidentId: string,
    input: UpdateIncidentInput,
  ): Promise<Incident | null> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (input.title !== undefined) {
      updates.push(`title = $${paramIndex}`);
      params.push(input.title);
      paramIndex++;
    }

    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(input.description);
      paramIndex++;
    }

    if (input.severity !== undefined) {
      updates.push(`severity = $${paramIndex}`);
      params.push(input.severity);
      paramIndex++;
    }

    if (input.status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      params.push(input.status);
      paramIndex++;
    }

    if (input.assignedTo !== undefined) {
      updates.push(`assigned_to = $${paramIndex}`);
      params.push(input.assignedTo);
      paramIndex++;
    }

    if (input.acknowledgedAt !== undefined) {
      updates.push(`acknowledged_at = $${paramIndex}`);
      params.push(input.acknowledgedAt);
      paramIndex++;
    }

    if (input.acknowledgedBy !== undefined) {
      updates.push(`acknowledged_by = $${paramIndex}`);
      params.push(input.acknowledgedBy);
      paramIndex++;
    }

    if (input.resolvedAt !== undefined) {
      updates.push(`resolved_at = $${paramIndex}`);
      params.push(input.resolvedAt);
      paramIndex++;
    }

    if (input.resolvedBy !== undefined) {
      updates.push(`resolved_by = $${paramIndex}`);
      params.push(input.resolvedBy);
      paramIndex++;
    }

    if (input.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex}`);
      params.push(JSON.stringify(input.metadata));
      paramIndex++;
    }

    if (updates.length === 0) {
      return null;
    }

    const query = `
      UPDATE incidents
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
        AND tenant_id = $${paramIndex + 1}
      RETURNING *
    `;

    params.push(incidentId, tenantId);

    const result = await this.pool.query(query, params);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToIncident(result.rows[0]);
  }

  /**
   * Add alerts to incident
   */
  async addAlerts(
    incidentId: string,
    alerts: Array<{
      alertId: string;
      alertType: string;
      alertSeverity: string;
      cameraId: string | null;
      detectedAt: Date;
      metadata?: Record<string, any>;
    }>,
  ): Promise<void> {
    if (alerts.length === 0) return;

    const values = alerts.map((_, idx) => {
      const base = idx * 6;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
    }).join(', ');

    const params = alerts.flatMap(alert => [
      incidentId,
      alert.alertId,
      alert.alertType,
      alert.alertSeverity,
      alert.cameraId,
      alert.detectedAt,
    ]);

    const query = `
      INSERT INTO incident_alerts (
        incident_id,
        alert_id,
        alert_type,
        alert_severity,
        camera_id,
        detected_at
      )
      VALUES ${values}
      ON CONFLICT (incident_id, alert_id) DO NOTHING
    `;

    await this.pool.query(query, params);

    // Update alert count
    await this.pool.query(
      `UPDATE incidents 
       SET alert_count = (SELECT COUNT(*) FROM incident_alerts WHERE incident_id = $1)
       WHERE id = $1`,
      [incidentId],
    );
  }

  /**
   * Get statistics for tenant
   */
  async getStatistics(filters: IncidentStatisticsFilters): Promise<IncidentStatistics> {
    const { tenantId, status, severity, branchId, from, to } = filters;

    const conditions: string[] = ['tenant_id = $1'];
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (severity) {
      conditions.push(`severity = $${paramIndex}`);
      params.push(severity);
      paramIndex++;
    }

    if (branchId) {
      conditions.push(`branch_id = $${paramIndex}`);
      params.push(branchId);
      paramIndex++;
    }

    if (from) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(from);
      paramIndex++;
    }

    if (to) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(to);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const query = `
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status IN ('OPEN', 'ACKNOWLEDGED', 'INVESTIGATING')) AS active,
        COUNT(*) FILTER (WHERE severity = 'CRITICAL') AS critical,
        COUNT(*) FILTER (WHERE assigned_to IS NULL) AS unassigned,
        COALESCE(SUM(alert_count), 0) AS alerts_correlated,
        
        -- By status
        COUNT(*) FILTER (WHERE status = 'OPEN') AS status_open,
        COUNT(*) FILTER (WHERE status = 'ACKNOWLEDGED') AS status_acknowledged,
        COUNT(*) FILTER (WHERE status = 'INVESTIGATING') AS status_investigating,
        COUNT(*) FILTER (WHERE status = 'RESOLVED') AS status_resolved,
        COUNT(*) FILTER (WHERE status = 'CLOSED') AS status_closed,
        
        -- By severity
        COUNT(*) FILTER (WHERE severity = 'LOW') AS severity_low,
        COUNT(*) FILTER (WHERE severity = 'MEDIUM') AS severity_medium,
        COUNT(*) FILTER (WHERE severity = 'HIGH') AS severity_high,
        COUNT(*) FILTER (WHERE severity = 'CRITICAL') AS severity_critical
        
      FROM incidents
      WHERE ${whereClause}
    `;

    const result = await this.pool.query(query, params);
    const row = result.rows[0];

    return {
      total: parseInt(row.total, 10),
      active: parseInt(row.active, 10),
      critical: parseInt(row.critical, 10),
      unassigned: parseInt(row.unassigned, 10),
      alertsCorrelated: parseInt(row.alerts_correlated, 10),
      byStatus: {
        OPEN: parseInt(row.status_open, 10),
        ACKNOWLEDGED: parseInt(row.status_acknowledged, 10),
        INVESTIGATING: parseInt(row.status_investigating, 10),
        RESOLVED: parseInt(row.status_resolved, 10),
        CLOSED: parseInt(row.status_closed, 10),
      },
      bySeverity: {
        LOW: parseInt(row.severity_low, 10),
        MEDIUM: parseInt(row.severity_medium, 10),
        HIGH: parseInt(row.severity_high, 10),
        CRITICAL: parseInt(row.severity_critical, 10),
      },
    };
  }

  /**
   * Delete incident (should be rare, prefer status changes)
   */
  async delete(tenantId: string, incidentId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM incidents WHERE id = $1 AND tenant_id = $2',
      [incidentId, tenantId],
    );

    return result.rowCount > 0;
  }

  /**
   * Map database row to Incident entity
   */
  private mapRowToIncident(row: any): Incident {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      title: row.title,
      description: row.description,
      incidentType: row.incident_type,
      severity: row.severity,
      status: row.status,
      branchId: row.branch_id,
      cameraId: row.camera_id,
      deviceId: row.device_id,
      assignedTo: row.assigned_to,
      alertCount: row.alert_count,
      firstDetectedAt: row.first_detected_at,
      lastDetectedAt: row.last_detected_at,
      acknowledgedAt: row.acknowledged_at,
      acknowledgedBy: row.acknowledged_by,
      resolvedAt: row.resolved_at,
      resolvedBy: row.resolved_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: row.metadata,
    };
  }
}
