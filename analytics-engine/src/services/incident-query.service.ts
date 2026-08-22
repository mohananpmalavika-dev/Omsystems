/**
 * Incident Query Service for Reporting
 * 
 * Provides optimized queries for AI reporting engine to retrieve incident data
 * without exposing full incident service complexity.
 */

import { Pool } from 'pg';

export interface ReportIncident {
  id: string;
  type: string;
  location: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  resolved: boolean;
  branchName?: string;
  cameraName?: string;
}

export interface IncidentTimeDistribution {
  hour: number;
  count: number;
}

export interface IncidentTypeSummary {
  type: string;
  count: number;
}

export interface IncidentLocationSummary {
  location: string;
  count: number;
}

/**
 * Incident Query Service
 * Optimized for reporting and analytics queries
 */
export class IncidentQueryService {
  constructor(private readonly pool: Pool) {}

  /**
   * Get incidents in date range for reporting
   * 
   * @param tenantId - Tenant ID for data isolation
   * @param startDate - Start of date range
   * @param endDate - End of date range
   * @returns List of incidents suitable for reporting
   */
  async getIncidentsInRange(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ReportIncident[]> {
    const query = `
      SELECT 
        i.id,
        i.incident_type AS type,
        COALESCE(b.name, 'Unknown Location') AS location,
        LOWER(i.severity::text) AS severity,
        COALESCE(i.first_detected_at, i.created_at) AS timestamp,
        (i.status = 'RESOLVED' OR i.status = 'CLOSED') AS resolved,
        b.name AS branch_name,
        c.name AS camera_name
      FROM incidents i
      LEFT JOIN branches b ON i.branch_id = b.id AND i.tenant_id = b.tenant_id
      LEFT JOIN cameras c ON i.camera_id = c.id AND i.tenant_id = c.tenant_id
      WHERE 
        i.tenant_id = $1
        AND i.created_at >= $2
        AND i.created_at <= $3
      ORDER BY i.created_at DESC
      LIMIT 10000
    `;

    const result = await this.pool.query(query, [tenantId, startDate, endDate]);

    return result.rows.map(row => ({
      id: row.id,
      type: this.normalizeIncidentType(row.type),
      location: row.location,
      severity: row.severity as 'low' | 'medium' | 'high' | 'critical',
      timestamp: row.timestamp,
      resolved: row.resolved,
      branchName: row.branch_name,
      cameraName: row.camera_name,
    }));
  }

  /**
   * Get incident type distribution
   * 
   * @param tenantId - Tenant ID
   * @param startDate - Start date
   * @param endDate - End date
   * @param limit - Maximum number of types to return
   * @returns Top incident types by count
   */
  async getIncidentTypeDistribution(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    limit: number = 10,
  ): Promise<IncidentTypeSummary[]> {
    const query = `
      SELECT 
        i.incident_type AS type,
        COUNT(*) AS count
      FROM incidents i
      WHERE 
        i.tenant_id = $1
        AND i.created_at >= $2
        AND i.created_at <= $3
      GROUP BY i.incident_type
      ORDER BY count DESC
      LIMIT $4
    `;

    const result = await this.pool.query(query, [tenantId, startDate, endDate, limit]);

    return result.rows.map(row => ({
      type: this.normalizeIncidentType(row.type),
      count: parseInt(row.count, 10),
    }));
  }

  /**
   * Get incident location distribution
   * 
   * @param tenantId - Tenant ID
   * @param startDate - Start date
   * @param endDate - End date
   * @param limit - Maximum number of locations to return
   * @returns Top incident locations by count
   */
  async getIncidentLocationDistribution(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    limit: number = 10,
  ): Promise<IncidentLocationSummary[]> {
    const query = `
      SELECT 
        COALESCE(b.name, 'Unknown Location') AS location,
        COUNT(*) AS count
      FROM incidents i
      LEFT JOIN branches b ON i.branch_id = b.id AND i.tenant_id = b.tenant_id
      WHERE 
        i.tenant_id = $1
        AND i.created_at >= $2
        AND i.created_at <= $3
      GROUP BY b.name
      ORDER BY count DESC
      LIMIT $4
    `;

    const result = await this.pool.query(query, [tenantId, startDate, endDate, limit]);

    return result.rows.map(row => ({
      location: row.location,
      count: parseInt(row.count, 10),
    }));
  }

  /**
   * Get hourly distribution of incidents
   * 
   * @param tenantId - Tenant ID
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Incident count by hour of day (0-23)
   */
  async getHourlyDistribution(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<IncidentTimeDistribution[]> {
    const query = `
      SELECT 
        EXTRACT(HOUR FROM COALESCE(i.first_detected_at, i.created_at))::INTEGER AS hour,
        COUNT(*) AS count
      FROM incidents i
      WHERE 
        i.tenant_id = $1
        AND i.created_at >= $2
        AND i.created_at <= $3
      GROUP BY hour
      ORDER BY hour
    `;

    const result = await this.pool.query(query, [tenantId, startDate, endDate]);

    // Create full 24-hour array with zeros for missing hours
    const hourCounts = new Array(24).fill(0);
    
    result.rows.forEach(row => {
      const hour = parseInt(row.hour, 10);
      const count = parseInt(row.count, 10);
      if (hour >= 0 && hour < 24) {
        hourCounts[hour] = count;
      }
    });

    return hourCounts.map((count, hour) => ({ hour, count }));
  }

  /**
   * Get incident statistics summary
   * 
   * @param tenantId - Tenant ID
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Statistics summary
   */
  async getIncidentStatistics(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    resolved: number;
    open: number;
    avgResolutionTimeMinutes: number | null;
  }> {
    const query = `
      SELECT 
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE severity = 'CRITICAL') AS critical,
        COUNT(*) FILTER (WHERE severity = 'HIGH') AS high,
        COUNT(*) FILTER (WHERE severity = 'MEDIUM') AS medium,
        COUNT(*) FILTER (WHERE severity = 'LOW') AS low,
        COUNT(*) FILTER (WHERE status = 'RESOLVED' OR status = 'CLOSED') AS resolved,
        COUNT(*) FILTER (WHERE status = 'OPEN' OR status = 'ACKNOWLEDGED' OR status = 'INVESTIGATING') AS open,
        AVG(
          CASE 
            WHEN resolved_at IS NOT NULL AND created_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60
            ELSE NULL
          END
        ) AS avg_resolution_time_minutes
      FROM incidents
      WHERE 
        tenant_id = $1
        AND created_at >= $2
        AND created_at <= $3
    `;

    const result = await this.pool.query(query, [tenantId, startDate, endDate]);
    const row = result.rows[0];

    return {
      total: parseInt(row.total, 10) || 0,
      critical: parseInt(row.critical, 10) || 0,
      high: parseInt(row.high, 10) || 0,
      medium: parseInt(row.medium, 10) || 0,
      low: parseInt(row.low, 10) || 0,
      resolved: parseInt(row.resolved, 10) || 0,
      open: parseInt(row.open, 10) || 0,
      avgResolutionTimeMinutes: row.avg_resolution_time_minutes 
        ? Math.round(parseFloat(row.avg_resolution_time_minutes))
        : null,
    };
  }

  /**
   * Normalize incident type for reporting
   * Converts database enums to human-readable format
   */
  private normalizeIncidentType(dbType: string): string {
    const typeMap: Record<string, string> = {
      regional_outage: 'Regional Outage',
      infrastructure_failure: 'Infrastructure Failure',
      cascade_failure: 'Cascade Failure',
      mass_event: 'Mass Event',
      fire_emergency: 'Fire Emergency',
      security_breach: 'Security Breach',
      storage_crisis: 'Storage Crisis',
      intrusion: 'Intrusion',
      camera_offline: 'Camera Offline',
      other: 'Other',
    };

    return typeMap[dbType] || dbType;
  }

  /**
   * Get daily incident counts for trend analysis
   * 
   * @param tenantId - Tenant ID
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Daily incident counts
   */
  async getDailyIncidentCounts(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Array<{ date: Date; count: number }>> {
    const query = `
      SELECT 
        DATE(created_at) AS date,
        COUNT(*) AS count
      FROM incidents
      WHERE 
        tenant_id = $1
        AND created_at >= $2
        AND created_at <= $3
      GROUP BY DATE(created_at)
      ORDER BY date
    `;

    const result = await this.pool.query(query, [tenantId, startDate, endDate]);

    return result.rows.map(row => ({
      date: row.date,
      count: parseInt(row.count, 10),
    }));
  }

  /**
   * Check if service is available (database connection working)
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Singleton factory
 */
let queryServiceInstance: IncidentQueryService | null = null;

export function getIncidentQueryService(pool: Pool): IncidentQueryService {
  if (!queryServiceInstance) {
    queryServiceInstance = new IncidentQueryService(pool);
  }
  return queryServiceInstance;
}
