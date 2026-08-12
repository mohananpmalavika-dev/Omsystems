/**
 * Investigation Repository
 * 
 * Handles database operations for security investigations.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type {
  Investigation,
  CreateInvestigationInput,
  InvestigationQuery,
  InvestigationSummary,
  InvestigationStatus,
  TimelineEntry,
  Evidence,
  InvestigationHypothesis,
  RecommendedAction,
} from '../types/index.js';

export class InvestigationRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Create a new investigation
   */
  async createInvestigation(input: CreateInvestigationInput): Promise<Investigation> {
    const id = randomUUID();
    const now = new Date();

    const result = await this.pool.query(
      `INSERT INTO security_investigations (
        id, tenant_id, title, description, status, priority,
        time_range_from, time_range_to, scope, summary, root_cause,
        created_by_type, created_by_user_id, assigned_to, tags,
        incident_count, event_count, evidence_count,
        affected_assets, metadata, started_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 0, 0, 0, $16, $17, $18, $18, $18
      ) RETURNING *`,
      [
        id,
        input.tenantId,
        input.title,
        input.description ?? null,
        'open',
        input.priority ?? 'medium',
        input.timeRange.from,
        input.timeRange.to,
        JSON.stringify(input.scope),
        null,
        null,
        input.createdBy.type,
        input.createdBy.userId ?? null,
        input.assignedTo ?? null,
        input.tags ?? null,
        '[]',
        input.metadata ? JSON.stringify(input.metadata) : '{}',
        now,
      ]
    );

    return this.mapInvestigation(result.rows[0]);
  }

  /**
   * Get investigation by ID
   */
  async getInvestigation(id: string): Promise<Investigation | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM security_investigations WHERE id = $1',
      [id]
    );

    if (!result.rows[0]) return undefined;

    const investigation = this.mapInvestigation(result.rows[0]);

    // Load related data
    investigation.timeline = await this.getTimeline(id);
    investigation.evidence = await this.getEvidence(id);
    investigation.hypotheses = await this.getHypotheses(id);
    investigation.recommendedActions = await this.getRecommendedActions(id);

    return investigation;
  }

  /**
   * Search investigations
   */
  async searchInvestigations(query: InvestigationQuery): Promise<Investigation[]> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: any[] = [query.tenantId];
    let paramIndex = 2;

    if (query.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(query.status);
    }

    if (query.statuses && query.statuses.length > 0) {
      conditions.push(`status = ANY($${paramIndex++})`);
      params.push(query.statuses);
    }

    if (query.priority) {
      conditions.push(`priority = $${paramIndex++}`);
      params.push(query.priority);
    }

    if (query.priorities && query.priorities.length > 0) {
      conditions.push(`priority = ANY($${paramIndex++})`);
      params.push(query.priorities);
    }

    if (query.createdBy) {
      conditions.push(`created_by_user_id = $${paramIndex++}`);
      params.push(query.createdBy);
    }

    if (query.assignedTo) {
      conditions.push(`assigned_to = $${paramIndex++}`);
      params.push(query.assignedTo);
    }

    if (query.from) {
      conditions.push(`started_at >= $${paramIndex++}`);
      params.push(query.from);
    }

    if (query.to) {
      conditions.push(`started_at <= $${paramIndex++}`);
      params.push(query.to);
    }

    if (query.branchId) {
      conditions.push(`scope->>'branchId' = $${paramIndex++}`);
      params.push(query.branchId);
    }

    if (query.tags && query.tags.length > 0) {
      conditions.push(`tags && $${paramIndex++}`);
      params.push(query.tags);
    }

    if (query.search) {
      conditions.push(`(title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      params.push(`%${query.search}%`);
      paramIndex++;
    }

    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const sql = `
      SELECT * FROM security_investigations
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    params.push(limit, offset);

    const result = await this.pool.query(sql, params);
    return result.rows.map(row => this.mapInvestigation(row));
  }

  /**
   * Get investigation summaries
   */
  async getInvestigationSummaries(query: InvestigationQuery): Promise<InvestigationSummary[]> {
    const investigations = await this.searchInvestigations(query);

    return investigations.map(inv => ({
      id: inv.id,
      title: inv.title,
      status: inv.status,
      priority: inv.priority,
      startedAt: inv.startedAt,
      closedAt: inv.closedAt,
      incidentCount: inv.incidentSummaries?.length ?? 0,
      criticalIncidentCount: inv.incidents.filter(i => i.severity === 'critical').length,
      highIncidentCount: inv.incidents.filter(i => i.severity === 'high').length,
      evidenceCount: inv.evidence?.length ?? 0,
      affectedBranches: [], // Can be enriched
      assignedTo: inv.assignedTo,
      summary: inv.summary,
    }));
  }

  /**
   * Update investigation
   */
  async updateInvestigation(
    id: string,
    updates: Partial<{
      title: string;
      description: string;
      status: InvestigationStatus;
      priority: string;
      summary: string;
      rootCause: any;
      assignedTo: string;
      tags: string[];
    }>
  ): Promise<Investigation | undefined> {
    const fields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (updates.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      params.push(updates.title);
    }

    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      params.push(updates.description);
    }

    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      params.push(updates.status);

      if (updates.status === 'resolved' || updates.status === 'dismissed' || updates.status === 'archived') {
        fields.push(`closed_at = NOW()`);
      }
    }

    if (updates.priority !== undefined) {
      fields.push(`priority = $${paramIndex++}`);
      params.push(updates.priority);
    }

    if (updates.summary !== undefined) {
      fields.push(`summary = $${paramIndex++}`);
      params.push(updates.summary);
    }

    if (updates.rootCause !== undefined) {
      fields.push(`root_cause = $${paramIndex++}`);
      params.push(JSON.stringify(updates.rootCause));
    }

    if (updates.assignedTo !== undefined) {
      fields.push(`assigned_to = $${paramIndex++}`);
      params.push(updates.assignedTo);
    }

    if (updates.tags !== undefined) {
      fields.push(`tags = $${paramIndex++}`);
      params.push(updates.tags);
    }

    if (fields.length === 0) {
      return this.getInvestigation(id);
    }

    fields.push('updated_at = NOW()');

    const result = await this.pool.query(
      `UPDATE security_investigations
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      [...params, id]
    );

    return result.rows[0] ? this.mapInvestigation(result.rows[0]) : undefined;
  }

  /**
   * Add timeline entry
   */
  async addTimelineEntry(
    investigationId: string,
    entry: Omit<TimelineEntry, 'id' | 'createdAt'>
  ): Promise<TimelineEntry> {
    const id = randomUUID();

    const result = await this.pool.query(
      `INSERT INTO security_timeline (
        id, investigation_id, timestamp, entry_type, title, description,
        event_id, incident_id, severity, assets, evidence_ids, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        id,
        investigationId,
        entry.timestamp,
        entry.type,
        entry.title,
        entry.description,
        entry.eventId ?? null,
        entry.incidentId ?? null,
        entry.severity ?? null,
        entry.assets ? JSON.stringify(entry.assets) : null,
        entry.evidenceIds ?? null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
      ]
    );

    return this.mapTimelineEntry(result.rows[0]);
  }

  /**
   * Get timeline for investigation
   */
  async getTimeline(investigationId: string): Promise<TimelineEntry[]> {
    const result = await this.pool.query(
      `SELECT * FROM security_timeline
       WHERE investigation_id = $1
       ORDER BY timestamp ASC`,
      [investigationId]
    );

    return result.rows.map(row => this.mapTimelineEntry(row));
  }

  /**
   * Add evidence
   */
  async addEvidence(
    investigationId: string,
    evidence: Omit<Evidence, 'id' | 'createdAt'>
  ): Promise<Evidence> {
    const id = randomUUID();

    const result = await this.pool.query(
      `INSERT INTO security_evidence (
        id, investigation_id, evidence_type, source_id, source_name,
        timestamp, uri, file_path, hash, hash_algorithm,
        size_bytes, mime_type, duration_seconds, description, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        id,
        investigationId,
        evidence.type,
        evidence.sourceId,
        evidence.sourceName ?? null,
        evidence.timestamp,
        evidence.uri ?? null,
        evidence.filePath ?? null,
        evidence.hash ?? null,
        evidence.hashAlgorithm ?? null,
        evidence.sizeBytes ?? null,
        evidence.mimeType ?? null,
        evidence.durationSeconds ?? null,
        evidence.description ?? null,
        evidence.metadata ? JSON.stringify(evidence.metadata) : '{}',
      ]
    );

    // Update evidence count
    await this.pool.query(
      `UPDATE security_investigations
       SET evidence_count = evidence_count + 1, updated_at = NOW()
       WHERE id = $1`,
      [investigationId]
    );

    return this.mapEvidence(result.rows[0]);
  }

  /**
   * Get evidence for investigation
   */
  async getEvidence(investigationId: string): Promise<Evidence[]> {
    const result = await this.pool.query(
      `SELECT * FROM security_evidence
       WHERE investigation_id = $1
       ORDER BY timestamp DESC`,
      [investigationId]
    );

    return result.rows.map(row => this.mapEvidence(row));
  }

  /**
   * Add hypothesis
   */
  async addHypothesis(
    investigationId: string,
    hypothesis: Omit<InvestigationHypothesis, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<InvestigationHypothesis> {
    const id = randomUUID();
    const now = new Date();

    const result = await this.pool.query(
      `INSERT INTO security_hypotheses (
        id, investigation_id, description, confidence, status,
        supporting_evidence_ids, contradicting_evidence_ids,
        created_by_type, created_by_user_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
      RETURNING *`,
      [
        id,
        investigationId,
        hypothesis.description,
        hypothesis.confidence,
        hypothesis.status,
        hypothesis.supportingEvidenceIds,
        hypothesis.contradictingEvidenceIds,
        hypothesis.createdBy.type,
        hypothesis.createdBy.userId ?? null,
        now,
      ]
    );

    return this.mapHypothesis(result.rows[0]);
  }

  /**
   * Get hypotheses for investigation
   */
  async getHypotheses(investigationId: string): Promise<InvestigationHypothesis[]> {
    const result = await this.pool.query(
      `SELECT * FROM security_hypotheses
       WHERE investigation_id = $1
       ORDER BY confidence DESC`,
      [investigationId]
    );

    return result.rows.map(row => this.mapHypothesis(row));
  }

  /**
   * Add recommended action
   */
  async addRecommendedAction(
    investigationId: string,
    action: Omit<RecommendedAction, 'id'>
  ): Promise<RecommendedAction> {
    const id = randomUUID();

    const result = await this.pool.query(
      `INSERT INTO security_recommended_actions (
        id, investigation_id, action_order, title, description,
        required, status, completed_by, completed_at, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        id,
        investigationId,
        action.order,
        action.title,
        action.description ?? null,
        action.required,
        action.status,
        action.completedBy ?? null,
        action.completedAt ?? null,
        action.notes ?? null,
      ]
    );

    return this.mapRecommendedAction(result.rows[0]);
  }

  /**
   * Get recommended actions
   */
  async getRecommendedActions(investigationId: string): Promise<RecommendedAction[]> {
    const result = await this.pool.query(
      `SELECT * FROM security_recommended_actions
       WHERE investigation_id = $1
       ORDER BY action_order ASC`,
      [investigationId]
    );

    return result.rows.map(row => this.mapRecommendedAction(row));
  }

  /**
   * Update action status
   */
  async updateActionStatus(
    actionId: string,
    status: string,
    completedBy?: string,
    notes?: string
  ): Promise<RecommendedAction | undefined> {
    const result = await this.pool.query(
      `UPDATE security_recommended_actions
       SET status = $1,
           completed_by = $2,
           completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END,
           notes = COALESCE($3, notes)
       WHERE id = $4
       RETURNING *`,
      [status, completedBy ?? null, notes ?? null, actionId]
    );

    return result.rows[0] ? this.mapRecommendedAction(result.rows[0]) : undefined;
  }

  /**
   * Associate incidents with investigation
   */
  async associateIncidents(
    investigationId: string,
    incidentIds: string[]
  ): Promise<void> {
    if (incidentIds.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const incidentId of incidentIds) {
        await client.query(
          'UPDATE security_incidents SET investigation_id = $1 WHERE id = $2',
          [investigationId, incidentId]
        );
      }

      await client.query(
        `UPDATE security_investigations
         SET incident_count = (
           SELECT COUNT(*) FROM security_incidents WHERE investigation_id = $1
         ),
         updated_at = NOW()
         WHERE id = $1`,
        [investigationId]
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
   * Map database row to Investigation
   */
  private mapInvestigation(row: any): Investigation {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      title: row.title,
      description: row.description ?? undefined,
      status: row.status,
      priority: row.priority,
      startedAt: new Date(row.started_at),
      closedAt: row.closed_at ? new Date(row.closed_at) : undefined,
      timeRange: {
        from: new Date(row.time_range_from),
        to: new Date(row.time_range_to),
      },
      scope: this.parseJson(row.scope, { type: 'enterprise' } as any),
      incidents: [], // Populated separately if needed
      evidence: [], // Populated separately
      timeline: [], // Populated separately
      affectedAssets: this.parseJson(row.affected_assets, []),
      hypotheses: [], // Populated separately
      recommendedActions: [], // Populated separately
      summary: row.summary ?? undefined,
      rootCause: row.root_cause ? this.parseJson(row.root_cause) : undefined,
      createdBy: {
        type: row.created_by_type,
        userId: row.created_by_user_id ?? undefined,
      },
      assignedTo: row.assigned_to ?? undefined,
      tags: row.tags ?? undefined,
      metadata: this.parseJson(row.metadata, {}),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapTimelineEntry(row: any): TimelineEntry {
    return {
      id: row.id,
      timestamp: new Date(row.timestamp),
      type: row.entry_type,
      title: row.title,
      description: row.description,
      eventId: row.event_id ?? undefined,
      incidentId: row.incident_id ?? undefined,
      severity: row.severity ?? undefined,
      assets: this.parseJson(row.assets),
      evidenceIds: row.evidence_ids ?? undefined,
      metadata: this.parseJson(row.metadata),
    };
  }

  private mapEvidence(row: any): Evidence {
    return {
      id: row.id,
      type: row.evidence_type,
      sourceId: row.source_id,
      sourceName: row.source_name ?? undefined,
      timestamp: new Date(row.timestamp),
      uri: row.uri ?? undefined,
      filePath: row.file_path ?? undefined,
      hash: row.hash ?? undefined,
      hashAlgorithm: row.hash_algorithm ?? undefined,
      sizeBytes: row.size_bytes ?? undefined,
      mimeType: row.mime_type ?? undefined,
      durationSeconds: row.duration_seconds ?? undefined,
      description: row.description ?? undefined,
      metadata: this.parseJson(row.metadata, {}),
      createdAt: new Date(row.created_at),
    };
  }

  private mapHypothesis(row: any): InvestigationHypothesis {
    return {
      id: row.id,
      description: row.description,
      confidence: row.confidence,
      supportingEvidenceIds: row.supporting_evidence_ids || [],
      contradictingEvidenceIds: row.contradicting_evidence_ids || [],
      status: row.status,
      createdBy: {
        type: row.created_by_type,
        userId: row.created_by_user_id ?? undefined,
      },
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapRecommendedAction(row: any): RecommendedAction {
    return {
      id: row.id,
      order: row.action_order,
      title: row.title,
      description: row.description ?? undefined,
      required: row.required,
      status: row.status,
      completedBy: row.completed_by ?? undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      notes: row.notes ?? undefined,
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
