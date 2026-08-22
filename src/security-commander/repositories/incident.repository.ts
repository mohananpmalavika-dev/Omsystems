/**
 * Security Incident Repository
 * 
 * Handles database operations for correlated security incidents.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type {
  Incident,
  CreateIncidentInput,
  IncidentQuery,
  IncidentStats,
  IncidentSummary,
  IncidentStatus,
} from '../types/index.js';

export class IncidentRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Create a new incident
   */
  async createIncident(input: CreateIncidentInput): Promise<Incident> {
    const id = randomUUID();
    const now = new Date();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Create the incident
      const result = await client.query(
        `INSERT INTO security_incidents (
          id, tenant_id, branch_id, zone_id, incident_type, title, description,
          severity, confidence, status, started_at, event_count, evidence_count,
          fingerprint, affected_assets, explanation, root_cause, metadata,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $19
        ) RETURNING *`,
        [
          id,
          input.tenantId,
          input.branchId ?? null,
          input.zoneId ?? null,
          input.type,
          input.title,
          input.description ?? null,
          input.severity,
          input.confidence,
          'open',
          input.startedAt,
          input.eventIds.length,
          input.evidenceIds.length,
          input.fingerprint ?? null,
          JSON.stringify(input.affectedAssets),
          input.explanation,
          input.rootCause ? JSON.stringify(input.rootCause) : null,
          input.metadata ? JSON.stringify(input.metadata) : '{}',
          now,
        ]
      );

      // Link events to incident
      for (const eventId of input.eventIds) {
        await client.query(
          `INSERT INTO security_incident_events (id, incident_id, event_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (incident_id, event_id) DO NOTHING`,
          [randomUUID(), id, eventId]
        );

        // Update event to reference incident
        await client.query(
          'UPDATE security_events SET incident_id = $1 WHERE id = $2',
          [id, eventId]
        );
      }

      await client.query('COMMIT');

      return this.mapIncident(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get incident by ID
   */
  async getIncident(id: string): Promise<Incident | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM security_incidents WHERE id = $1',
      [id]
    );

    return result.rows[0] ? this.mapIncident(result.rows[0]) : undefined;
  }

  /**
   * Search incidents
   */
  async searchIncidents(query: IncidentQuery): Promise<Incident[]> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: any[] = [query.tenantId];
    let paramIndex = 2;

    if (query.branchId) {
      conditions.push(`branch_id = $${paramIndex++}`);
      params.push(query.branchId);
    }

    if (query.branchIds && query.branchIds.length > 0) {
      conditions.push(`branch_id = ANY($${paramIndex++})`);
      params.push(query.branchIds);
    }

    if (query.types && query.types.length > 0) {
      conditions.push(`incident_type = ANY($${paramIndex++})`);
      params.push(query.types);
    }

    if (query.severities && query.severities.length > 0) {
      conditions.push(`severity = ANY($${paramIndex++})`);
      params.push(query.severities);
    }

    if (query.statuses && query.statuses.length > 0) {
      conditions.push(`status = ANY($${paramIndex++})`);
      params.push(query.statuses);
    }

    if (query.from) {
      conditions.push(`started_at >= $${paramIndex++}`);
      params.push(query.from);
    }

    if (query.to) {
      conditions.push(`started_at <= $${paramIndex++}`);
      params.push(query.to);
    }

    if (query.minConfidence !== undefined) {
      conditions.push(`confidence >= $${paramIndex++}`);
      params.push(query.minConfidence);
    }

    if (query.investigationId) {
      conditions.push(`investigation_id = $${paramIndex++}`);
      params.push(query.investigationId);
    }

    if (query.assignedTo) {
      conditions.push(`assigned_to = $${paramIndex++}`);
      params.push(query.assignedTo);
    }

    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;

    const sql = `
      SELECT * FROM security_incidents
      WHERE ${conditions.join(' AND ')}
      ORDER BY started_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    params.push(limit, offset);

    const result = await this.pool.query(sql, params);
    return result.rows.map(row => this.mapIncident(row));
  }

  /**
   * Get incident summaries (lightweight version)
   */
  async getIncidentSummaries(query: IncidentQuery): Promise<IncidentSummary[]> {
    const incidents = await this.searchIncidents(query);

    return incidents.map(incident => ({
      id: incident.id,
      type: incident.type,
      title: incident.title,
      severity: incident.severity,
      confidence: incident.confidence,
      status: incident.status,
      startedAt: incident.startedAt,
      branchId: incident.branchId,
      branchName: undefined, // Can be enriched later
      location: undefined,
      eventCount: incident.eventCount,
      evidenceCount: incident.affectedAssets.length,
      explanation: incident.explanation,
    }));
  }

  /**
   * Get incident statistics
   */
  async getIncidentStats(query: IncidentQuery): Promise<IncidentStats> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: any[] = [query.tenantId];
    let paramIndex = 2;

    if (query.branchId) {
      conditions.push(`branch_id = $${paramIndex++}`);
      params.push(query.branchId);
    }

    if (query.from) {
      conditions.push(`started_at >= $${paramIndex++}`);
      params.push(query.from);
    }

    if (query.to) {
      conditions.push(`started_at <= $${paramIndex++}`);
      params.push(query.to);
    }

    const whereClause = conditions.join(' AND ');

    const result = await this.pool.query(
      `SELECT * FROM get_security_incident_stats($1, $2, $3)`,
      [query.tenantId, query.from ?? null, query.to ?? null]
    );

    const row = result.rows[0];

    return {
      total: Number(row.total || 0),
      open: Number(row.open || 0),
      investigating: Number(row.investigating || 0),
      resolved: Number(row.resolved || 0),
      dismissed: Number(row.dismissed || 0),
      bySeverity: {
        critical: Number(row.critical || 0),
        high: Number(row.high || 0),
        medium: Number(row.medium || 0),
        low: Number(row.low || 0),
        info: 0,
      },
      byType: {}, // Can be computed separately if needed
    };
  }

  /**
   * Update incident status
   */
  async updateStatus(
    id: string,
    status: IncidentStatus
  ): Promise<Incident | undefined> {
    const now = new Date();
    const endedAt = status === 'resolved' || status === 'dismissed' ? now : null;

    const result = await this.pool.query(
      `UPDATE security_incidents
       SET status = $1, ended_at = $2, updated_at = $3
       WHERE id = $4
       RETURNING *`,
      [status, endedAt, now, id]
    );

    return result.rows[0] ? this.mapIncident(result.rows[0]) : undefined;
  }

  /**
   * Assign incident to user
   */
  async assignIncident(
    id: string,
    userId: string
  ): Promise<Incident | undefined> {
    const result = await this.pool.query(
      `UPDATE security_incidents
       SET assigned_to = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [userId, id]
    );

    return result.rows[0] ? this.mapIncident(result.rows[0]) : undefined;
  }

  /**
   * Associate incident with investigation
   */
  async associateWithInvestigation(
    id: string,
    investigationId: string
  ): Promise<void> {
    await this.pool.query(
      `UPDATE security_incidents
       SET investigation_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [investigationId, id]
    );
  }

  /**
   * Get incidents by fingerprint (for deduplication)
   */
  async getIncidentByFingerprint(
    tenantId: string,
    fingerprint: string,
    withinMinutes: number = 60
  ): Promise<Incident | undefined> {
    const since = new Date(Date.now() - withinMinutes * 60 * 1000);

    const result = await this.pool.query(
      `SELECT * FROM security_incidents
       WHERE tenant_id = $1
         AND fingerprint = $2
         AND started_at >= $3
         AND status NOT IN ('resolved', 'dismissed')
       ORDER BY started_at DESC
       LIMIT 1`,
      [tenantId, fingerprint, since]
    );

    return result.rows[0] ? this.mapIncident(result.rows[0]) : undefined;
  }

  /**
   * Add events to existing incident
   */
  async addEventsToIncident(
    incidentId: string,
    eventIds: string[]
  ): Promise<void> {
    if (eventIds.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const eventId of eventIds) {
        await client.query(
          `INSERT INTO security_incident_events (id, incident_id, event_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (incident_id, event_id) DO NOTHING`,
          [randomUUID(), incidentId, eventId]
        );

        await client.query(
          'UPDATE security_events SET incident_id = $1 WHERE id = $2',
          [incidentId, eventId]
        );
      }

      // Update event count
      await client.query(
        `UPDATE security_incidents
         SET event_count = (
           SELECT COUNT(*) FROM security_incident_events WHERE incident_id = $1
         ),
         updated_at = NOW()
         WHERE id = $1`,
        [incidentId]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get event IDs for incident
   */
  async getIncidentEventIds(incidentId: string): Promise<string[]> {
    const result = await this.pool.query(
      'SELECT event_id FROM security_incident_events WHERE incident_id = $1',
      [incidentId]
    );

    return result.rows.map(row => row.event_id);
  }

  /**
   * Map database row to Incident
   */
  private mapIncident(row: any): Incident {
    const durationSeconds = row.ended_at
      ? Math.floor((new Date(row.ended_at).getTime() - new Date(row.started_at).getTime()) / 1000)
      : undefined;

    return {
      id: row.id,
      tenantId: row.tenant_id,
      type: row.incident_type,
      title: row.title,
      description: row.description ?? undefined,
      severity: row.severity,
      confidence: row.confidence,
      status: row.status,
      startedAt: new Date(row.started_at),
      endedAt: row.ended_at ? new Date(row.ended_at) : undefined,
      durationSeconds: row.duration_seconds ?? durationSeconds,
      branchId: row.branch_id ?? undefined,
      zoneId: row.zone_id ?? undefined,
      eventIds: [], // Populated separately if needed
      eventCount: row.event_count || 0,
      affectedAssets: this.parseJson(row.affected_assets, []),
      evidenceIds: [], // Populated separately if needed
      explanation: row.explanation,
      rootCause: row.root_cause ? this.parseJson(row.root_cause) : undefined,
      fingerprint: row.fingerprint ?? undefined,
      investigationId: row.investigation_id ?? undefined,
      assignedTo: row.assigned_to ?? undefined,
      metadata: this.parseJson(row.metadata, {}),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private parseJson<T>(value: any, fallback?: T): T {
    if (!value) return fallback as T;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return fallback as T;
      }
    }
    return value;
  }
}
