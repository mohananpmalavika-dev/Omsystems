/**
 * Incident Query Service
 * 
 * Provides database query methods for incident reporting and analytics.
 * Replaces mock data with real PostgreSQL queries.
 */

import { Pool } from 'pg';

export interface IncidentQueryService {
  getIncidentsInRange(tenantId: string, start: Date, end: Date): Promise<any[]>;
  getIncidentTypeDistribution(tenantId: string, start: Date, end: Date, limit: number): Promise<Array<{ type: string; count: number }>>;
  getIncidentLocationDistribution(tenantId: string, start: Date, end: Date, limit: number): Promise<Array<{ location: string; count: number }>>;
  getHourlyDistribution(tenantId: string, start: Date, end: Date): Promise<Array<{ hour: number; count: number }>>;
  getDailyTrend(tenantId: string, start: Date, end: Date): Promise<Array<{ date: string; count: number }>>;
}

class PostgresIncidentQueryService implements IncidentQueryService {
  constructor(private pool: Pool) {}

  async getIncidentsInRange(tenantId: string, start: Date, end: Date): Promise<any[]> {
    try {
      const query = `
        SELECT 
          id,
          tenant_id,
          detection_type,
          severity,
          camera_id,
          location,
          detected_at,
          acknowledged_at,
          resolved_at,
          resolved,
          metadata
        FROM incidents
        WHERE tenant_id = $1
          AND detected_at >= $2
          AND detected_at < $3
        ORDER BY detected_at DESC
      `;

      const result = await this.pool.query(query, [tenantId, start, end]);
      
      return result.rows.map(row => ({
        id: row.id,
        tenantId: row.tenant_id,
        detectionType: row.detection_type,
        severity: row.severity,
        cameraId: row.camera_id,
        location: row.location,
        detectedAt: row.detected_at,
        acknowledgedAt: row.acknowledged_at,
        resolvedAt: row.resolved_at,
        resolved: row.resolved || false,
        metadata: row.metadata
      }));
    } catch (error) {
      console.error('[IncidentQueryService] Error querying incidents:', error);
      return [];
    }
  }

  async getIncidentTypeDistribution(
    tenantId: string,
    start: Date,
    end: Date,
    limit: number
  ): Promise<Array<{ type: string; count: number }>> {
    try {
      const query = `
        SELECT 
          detection_type as type,
          COUNT(*) as count
        FROM incidents
        WHERE tenant_id = $1
          AND detected_at >= $2
          AND detected_at < $3
        GROUP BY detection_type
        ORDER BY count DESC
        LIMIT $4
      `;

      const result = await this.pool.query(query, [tenantId, start, end, limit]);
      
      return result.rows.map(row => ({
        type: row.type || 'unknown',
        count: parseInt(row.count, 10)
      }));
    } catch (error) {
      console.error('[IncidentQueryService] Error querying incident types:', error);
      return [];
    }
  }

  async getIncidentLocationDistribution(
    tenantId: string,
    start: Date,
    end: Date,
    limit: number
  ): Promise<Array<{ location: string; count: number }>> {
    try {
      const query = `
        SELECT 
          COALESCE(location, camera_id, 'Unknown') as location,
          COUNT(*) as count
        FROM incidents
        WHERE tenant_id = $1
          AND detected_at >= $2
          AND detected_at < $3
        GROUP BY COALESCE(location, camera_id, 'Unknown')
        ORDER BY count DESC
        LIMIT $4
      `;

      const result = await this.pool.query(query, [tenantId, start, end, limit]);
      
      return result.rows.map(row => ({
        location: row.location,
        count: parseInt(row.count, 10)
      }));
    } catch (error) {
      console.error('[IncidentQueryService] Error querying incident locations:', error);
      return [];
    }
  }

  async getHourlyDistribution(
    tenantId: string,
    start: Date,
    end: Date
  ): Promise<Array<{ hour: number; count: number }>> {
    try {
      const query = `
        SELECT 
          EXTRACT(HOUR FROM detected_at) as hour,
          COUNT(*) as count
        FROM incidents
        WHERE tenant_id = $1
          AND detected_at >= $2
          AND detected_at < $3
        GROUP BY EXTRACT(HOUR FROM detected_at)
        ORDER BY hour
      `;

      const result = await this.pool.query(query, [tenantId, start, end]);
      
      // Create full 24-hour array with zeros for missing hours
      const hourMap = new Map(result.rows.map(row => [
        parseInt(row.hour, 10),
        parseInt(row.count, 10)
      ]));
      
      return Array.from({ length: 24 }, (_, hour) => ({
        hour,
        count: hourMap.get(hour) || 0
      }));
    } catch (error) {
      console.error('[IncidentQueryService] Error querying hourly distribution:', error);
      return Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
    }
  }

  async getDailyTrend(
    tenantId: string,
    start: Date,
    end: Date
  ): Promise<Array<{ date: string; count: number }>> {
    try {
      const query = `
        SELECT 
          DATE(detected_at) as date,
          COUNT(*) as count
        FROM incidents
        WHERE tenant_id = $1
          AND detected_at >= $2
          AND detected_at < $3
        GROUP BY DATE(detected_at)
        ORDER BY date
      `;

      const result = await this.pool.query(query, [tenantId, start, end]);
      
      return result.rows.map(row => ({
        date: row.date.toISOString().split('T')[0],
        count: parseInt(row.count, 10)
      }));
    } catch (error) {
      console.error('[IncidentQueryService] Error querying daily trend:', error);
      return [];
    }
  }
}

// Singleton instance
let instance: IncidentQueryService | null = null;

export function getIncidentQueryService(pool: Pool): IncidentQueryService {
  if (!instance) {
    instance = new PostgresIncidentQueryService(pool);
  }
  return instance;
}

export function resetIncidentQueryService(): void {
  instance = null;
}
