/**
 * Security Event Repository
 * 
 * Handles all database operations for security events.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type {
  SecurityEvent,
  CreateSecurityEventInput,
  SecurityEventQuery,
  SecurityEventStats,
} from '../types/index.js';

export class SecurityEventRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Create a new security event
   */
  async createEvent(input: CreateSecurityEventInput): Promise<SecurityEvent> {
    const id = randomUUID();
    const now = new Date();

    const result = await this.pool.query(
      `INSERT INTO security_events (
        id, tenant_id, enterprise_id, region_id, branch_id,
        event_type, source_type, source_id, source_name,
        occurred_at, ingested_at, severity, confidence, abnormality_score,
        location, entities, evidence, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
      ) RETURNING *`,
      [
        id,
        input.tenantId,
        input.enterpriseId ?? null,
        input.regionId ?? null,
        input.branchId ?? null,
        input.type,
        input.source.type,
        input.source.id,
        input.source.name ?? null,
        input.timestamp,
        now,
        input.severity,
        input.confidence ?? null,
        null, // abnormality_score computed later
        input.location ? JSON.stringify(input.location) : null,
        input.entities ? JSON.stringify(input.entities) : null,
        input.evidence ? JSON.stringify(input.evidence) : null,
        input.metadata ? JSON.stringify(input.metadata) : '{}',
      ]
    );

    return this.mapEvent(result.rows[0]);
  }

  /**
   * Bulk create events (for efficient ingestion)
   */
  async createEventsBulk(inputs: CreateSecurityEventInput[]): Promise<SecurityEvent[]> {
    if (inputs.length === 0) return [];

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const events: SecurityEvent[] = [];
      const now = new Date();

      for (const input of inputs) {
        const id = randomUUID();
        const result = await client.query(
          `INSERT INTO security_events (
            id, tenant_id, enterprise_id, region_id, branch_id,
            event_type, source_type, source_id, source_name,
            occurred_at, ingested_at, severity, confidence,
            location, entities, evidence, metadata
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
          ) RETURNING *`,
          [
            id,
            input.tenantId,
            input.enterpriseId ?? null,
            input.regionId ?? null,
            input.branchId ?? null,
            input.type,
            input.source.type,
            input.source.id,
            input.source.name ?? null,
            input.timestamp,
            now,
            input.severity,
            input.confidence ?? null,
            input.location ? JSON.stringify(input.location) : null,
            input.entities ? JSON.stringify(input.entities) : null,
            input.evidence ? JSON.stringify(input.evidence) : null,
            input.metadata ? JSON.stringify(input.metadata) : '{}',
          ]
        );

        events.push(this.mapEvent(result.rows[0]));
      }

      await client.query('COMMIT');
      return events;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get event by ID
   */
  async getEvent(id: string): Promise<SecurityEvent | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM security_events WHERE id = $1',
      [id]
    );

    return result.rows[0] ? this.mapEvent(result.rows[0]) : undefined;
  }

  /**
   * Search events with filters
   */
  async searchEvents(query: SecurityEventQuery): Promise<SecurityEvent[]> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: any[] = [query.tenantId];
    let paramIndex = 2;

    if (query.enterpriseId) {
      conditions.push(`enterprise_id = $${paramIndex++}`);
      params.push(query.enterpriseId);
    }

    if (query.regionId) {
      conditions.push(`region_id = $${paramIndex++}`);
      params.push(query.regionId);
    }

    if (query.branchId) {
      conditions.push(`branch_id = $${paramIndex++}`);
      params.push(query.branchId);
    }

    if (query.branchIds && query.branchIds.length > 0) {
      conditions.push(`branch_id = ANY($${paramIndex++})`);
      params.push(query.branchIds);
    }

    if (query.cameraIds && query.cameraIds.length > 0) {
      conditions.push(`entities->>'cameraId' = ANY($${paramIndex++})`);
      params.push(query.cameraIds);
    }

    if (query.from) {
      conditions.push(`occurred_at >= $${paramIndex++}`);
      params.push(query.from);
    }

    if (query.to) {
      conditions.push(`occurred_at <= $${paramIndex++}`);
      params.push(query.to);
    }

    if (query.types && query.types.length > 0) {
      conditions.push(`event_type = ANY($${paramIndex++})`);
      params.push(query.types);
    }

    if (query.severities && query.severities.length > 0) {
      conditions.push(`severity = ANY($${paramIndex++})`);
      params.push(query.severities);
    }

    if (query.sourceTypes && query.sourceTypes.length > 0) {
      conditions.push(`source_type = ANY($${paramIndex++})`);
      params.push(query.sourceTypes);
    }

    if (query.abnormalOnly) {
      conditions.push(`abnormality_score >= $${paramIndex++}`);
      params.push(query.minAbnormalityScore ?? 0.5);
    }

    if (query.correlationId) {
      conditions.push(`correlation_id = $${paramIndex++}`);
      params.push(query.correlationId);
    }

    if (query.investigationId) {
      conditions.push(`investigation_id = $${paramIndex++}`);
      params.push(query.investigationId);
    }

    const limit = query.limit ?? 1000;
    const offset = query.offset ?? 0;

    const sql = `
      SELECT * FROM security_events
      WHERE ${conditions.join(' AND ')}
      ORDER BY occurred_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    params.push(limit, offset);

    const result = await this.pool.query(sql, params);
    return result.rows.map(row => this.mapEvent(row));
  }

  /**
   * Get event statistics
   */
  async getEventStats(query: SecurityEventQuery): Promise<SecurityEventStats> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: any[] = [query.tenantId];
    let paramIndex = 2;

    if (query.branchId) {
      conditions.push(`branch_id = $${paramIndex++}`);
      params.push(query.branchId);
    }

    if (query.from) {
      conditions.push(`occurred_at >= $${paramIndex++}`);
      params.push(query.from);
    }

    if (query.to) {
      conditions.push(`occurred_at <= $${paramIndex++}`);
      params.push(query.to);
    }

    const whereClause = conditions.join(' AND ');

    const result = await this.pool.query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE severity = 'critical')::int AS critical,
        COUNT(*) FILTER (WHERE severity = 'high')::int AS high,
        COUNT(*) FILTER (WHERE severity = 'medium')::int AS medium,
        COUNT(*) FILTER (WHERE severity = 'low')::int AS low,
        COUNT(*) FILTER (WHERE severity = 'info')::int AS info,
        COUNT(*) FILTER (WHERE abnormality_score >= 0.5)::int AS abnormal_count,
        json_object_agg(event_type, type_count) FILTER (WHERE event_type IS NOT NULL) AS by_type,
        json_object_agg(source_type, source_count) FILTER (WHERE source_type IS NOT NULL) AS by_source
      FROM (
        SELECT 
          severity,
          abnormality_score,
          event_type,
          source_type,
          COUNT(*)::int AS type_count,
          COUNT(*)::int AS source_count
        FROM security_events
        WHERE ${whereClause}
        GROUP BY severity, abnormality_score, event_type, source_type
      ) subquery`,
      params
    );

    const row = result.rows[0];

    return {
      total: row.total || 0,
      bySeverity: {
        critical: row.critical || 0,
        high: row.high || 0,
        medium: row.medium || 0,
        low: row.low || 0,
        info: row.info || 0,
      },
      byType: row.by_type || {},
      bySource: row.by_source || {},
      abnormalCount: row.abnormal_count || 0,
    };
  }

  /**
   * Update event abnormality score
   */
  async updateAbnormalityScore(
    eventId: string,
    score: number
  ): Promise<void> {
    await this.pool.query(
      'UPDATE security_events SET abnormality_score = $1 WHERE id = $2',
      [score, eventId]
    );
  }

  /**
   * Update event correlation
   */
  async updateCorrelation(
    eventId: string,
    correlationId: string
  ): Promise<void> {
    await this.pool.query(
      'UPDATE security_events SET correlation_id = $1 WHERE id = $2',
      [correlationId, eventId]
    );
  }

  /**
   * Associate event with incident
   */
  async associateWithIncident(
    eventId: string,
    incidentId: string
  ): Promise<void> {
    await this.pool.query(
      'UPDATE security_events SET incident_id = $1 WHERE id = $2',
      [incidentId, eventId]
    );
  }

  /**
   * Associate event with investigation
   */
  async associateWithInvestigation(
    eventId: string,
    investigationId: string
  ): Promise<void> {
    await this.pool.query(
      'UPDATE security_events SET investigation_id = $1 WHERE id = $2',
      [investigationId, eventId]
    );
  }

  /**
   * Get events by IDs
   */
  async getEventsByIds(ids: string[]): Promise<SecurityEvent[]> {
    if (ids.length === 0) return [];

    const result = await this.pool.query(
      'SELECT * FROM security_events WHERE id = ANY($1) ORDER BY occurred_at DESC',
      [ids]
    );

    return result.rows.map(row => this.mapEvent(row));
  }

  /**
   * Get events for correlation (within time window)
   */
  async getEventsForCorrelation(
    tenantId: string,
    branchId: string | undefined,
    from: Date,
    to: Date
  ): Promise<SecurityEvent[]> {
    const conditions = ['tenant_id = $1', 'occurred_at >= $2', 'occurred_at <= $3'];
    const params: any[] = [tenantId, from, to];

    if (branchId) {
      conditions.push('branch_id = $4');
      params.push(branchId);
    }

    const result = await this.pool.query(
      `SELECT * FROM security_events
       WHERE ${conditions.join(' AND ')}
       AND incident_id IS NULL
       ORDER BY occurred_at ASC`,
      params
    );

    return result.rows.map(row => this.mapEvent(row));
  }

  /**
   * Delete old events (for retention management)
   */
  async deleteOldEvents(
    tenantId: string,
    beforeDate: Date
  ): Promise<number> {
    const result = await this.pool.query(
      'DELETE FROM security_events WHERE tenant_id = $1 AND occurred_at < $2',
      [tenantId, beforeDate]
    );

    return result.rowCount || 0;
  }

  /**
   * Map database row to SecurityEvent
   */
  private mapEvent(row: any): SecurityEvent {
    return {
      id: row.id,
      type: row.event_type,
      timestamp: new Date(row.occurred_at),
      tenantId: row.tenant_id,
      enterpriseId: row.enterprise_id ?? undefined,
      regionId: row.region_id ?? undefined,
      branchId: row.branch_id ?? undefined,
      source: {
        type: row.source_type,
        id: row.source_id,
        name: row.source_name ?? undefined,
      },
      severity: row.severity,
      confidence: row.confidence ?? undefined,
      abnormalityScore: row.abnormality_score ?? undefined,
      location: row.location ? (typeof row.location === 'string' ? JSON.parse(row.location) : row.location) : undefined,
      entities: row.entities ? (typeof row.entities === 'string' ? JSON.parse(row.entities) : row.entities) : undefined,
      evidence: row.evidence ? (typeof row.evidence === 'string' ? JSON.parse(row.evidence) : row.evidence) : undefined,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : {},
      correlationId: row.correlation_id ?? undefined,
      incidentId: row.incident_id ?? undefined,
      investigationId: row.investigation_id ?? undefined,
      ingestedAt: row.ingested_at ? new Date(row.ingested_at) : undefined,
      createdAt: row.created_at ? new Date(row.created_at) : undefined,
    };
  }
}
