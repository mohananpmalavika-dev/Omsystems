/**
 * Violence Detection Repository
 * 
 * PostgreSQL data access for violent encounter incidents,
 * per-camera threshold configurations, and operator review audit trails.
 */

import type { Pool } from 'pg';
import type { ViolenceDetectionResult } from './violence-detector.js';

export interface ViolenceEventRecord {
  id: string;
  tenant_id: string;
  camera_id: string;
  confidence: number;
  severity: 'P1' | 'P2' | 'P3';
  optical_flow_energy: number;
  turbulence_score: number;
  max_limb_acceleration: number;
  strike_count: number;
  participant_count: number;
  participant_track_ids: string[];
  interaction_box: any;
  metrics: any;
  snapshot_reference: string | null;
  review_status: 'pending' | 'confirmed' | 'false_positive' | 'escalated';
  reviewed_by: string | null;
  reviewed_at: Date | null;
  review_notes: string | null;
  occurred_at: Date;
  created_at: Date;
  camera_name?: string;
}

export interface ViolenceCameraConfigRecord {
  camera_id: string;
  tenant_id: string;
  enabled: boolean;
  sensitivity: number;
  min_confidence: number;
  min_optical_flow_energy: number;
  min_limb_acceleration: number;
  min_duration_ms: number;
  cooldown_seconds: number;
  alert_severity: 'P1' | 'P2' | 'P3';
  created_at: Date;
  updated_at: Date;
}

export interface ListViolenceEventsFilter {
  tenantId: string;
  cameraId?: string;
  severity?: 'P1' | 'P2' | 'P3';
  reviewStatus?: 'pending' | 'confirmed' | 'false_positive' | 'escalated';
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export class ViolenceRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Save a newly detected violent encounter incident
   */
  async saveEvent(
    tenantId: string,
    cameraId: string,
    result: ViolenceDetectionResult,
    occurredAt: Date,
    snapshotReference?: string
  ): Promise<ViolenceEventRecord> {
    const query = `
      INSERT INTO violence_detection_events (
        tenant_id,
        camera_id,
        confidence,
        severity,
        optical_flow_energy,
        turbulence_score,
        max_limb_acceleration,
        strike_count,
        participant_count,
        participant_track_ids,
        interaction_box,
        metrics,
        snapshot_reference,
        review_status,
        occurred_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', $14)
      RETURNING *;
    `;

    const values = [
      tenantId,
      cameraId,
      result.confidence,
      result.severity,
      result.opticalFlowEnergy,
      result.turbulenceScore,
      result.maxLimbAcceleration,
      result.strikeCount,
      result.participantCount,
      result.participantTrackIds,
      JSON.stringify(result.interactionBox || {}),
      JSON.stringify(result.metrics || {}),
      snapshotReference || null,
      occurredAt,
    ];

    const res = await this.pool.query(query, values);
    return res.rows[0];
  }

  /**
   * List violence events with filtering
   */
  async listEvents(filter: ListViolenceEventsFilter): Promise<{ events: ViolenceEventRecord[]; total: number }> {
    const conditions: string[] = ['e.tenant_id = $1'];
    const values: any[] = [filter.tenantId];
    let idx = 2;

    if (filter.cameraId) {
      conditions.push(`e.camera_id = $${idx++}`);
      values.push(filter.cameraId);
    }
    if (filter.severity) {
      conditions.push(`e.severity = $${idx++}`);
      values.push(filter.severity);
    }
    if (filter.reviewStatus) {
      conditions.push(`e.review_status = $${idx++}`);
      values.push(filter.reviewStatus);
    }
    if (filter.fromDate) {
      conditions.push(`e.occurred_at >= $${idx++}`);
      values.push(filter.fromDate);
    }
    if (filter.toDate) {
      conditions.push(`e.occurred_at <= $${idx++}`);
      values.push(filter.toDate);
    }

    const whereClause = conditions.join(' AND ');
    const limit = Math.min(100, Math.max(1, filter.limit ?? 50));
    const offset = Math.max(0, filter.offset ?? 0);

    const countQuery = `
      SELECT COUNT(*) as total
      FROM violence_detection_events e
      WHERE ${whereClause};
    `;
    const countRes = await this.pool.query(countQuery, values);
    const total = parseInt(countRes.rows[0]?.total ?? '0', 10);

    const listQuery = `
      SELECT e.*, c.name as camera_name
      FROM violence_detection_events e
      LEFT JOIN cameras c ON e.camera_id = c.id
      WHERE ${whereClause}
      ORDER BY e.occurred_at DESC
      LIMIT $${idx++} OFFSET $${idx++};
    `;
    const listValues = [...values, limit, offset];
    const listRes = await this.pool.query(listQuery, listValues);

    return {
      events: listRes.rows,
      total,
    };
  }

  /**
   * Get single event by ID
   */
  async getEventById(eventId: string, tenantId: string): Promise<ViolenceEventRecord | null> {
    const query = `
      SELECT e.*, c.name as camera_name
      FROM violence_detection_events e
      LEFT JOIN cameras c ON e.camera_id = c.id
      WHERE e.id = $1 AND e.tenant_id = $2;
    `;
    const res = await this.pool.query(query, [eventId, tenantId]);
    return res.rows[0] || null;
  }

  /**
   * Operator review mutation
   */
  async reviewEvent(
    eventId: string,
    tenantId: string,
    reviewStatus: 'confirmed' | 'false_positive' | 'escalated',
    reviewedBy: string,
    reviewNotes?: string
  ): Promise<ViolenceEventRecord | null> {
    const query = `
      UPDATE violence_detection_events
      SET review_status = $1,
          reviewed_by = $2,
          reviewed_at = NOW(),
          review_notes = $3
      WHERE id = $4 AND tenant_id = $5
      RETURNING *;
    `;
    const res = await this.pool.query(query, [
      reviewStatus,
      reviewedBy,
      reviewNotes || null,
      eventId,
      tenantId,
    ]);
    return res.rows[0] || null;
  }

  /**
   * Get camera violence detection config
   */
  async getCameraConfig(cameraId: string, tenantId: string): Promise<ViolenceCameraConfigRecord | null> {
    const query = `
      SELECT *
      FROM violence_detection_configs
      WHERE camera_id = $1 AND tenant_id = $2;
    `;
    const res = await this.pool.query(query, [cameraId, tenantId]);
    return res.rows[0] || null;
  }

  /**
   * Upsert camera violence detection config
   */
  async upsertCameraConfig(
    cameraId: string,
    tenantId: string,
    config: Partial<ViolenceCameraConfigRecord>
  ): Promise<ViolenceCameraConfigRecord> {
    const query = `
      INSERT INTO violence_detection_configs (
        camera_id,
        tenant_id,
        enabled,
        sensitivity,
        min_confidence,
        min_optical_flow_energy,
        min_limb_acceleration,
        min_duration_ms,
        cooldown_seconds,
        alert_severity,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (camera_id) DO UPDATE SET
        enabled = COALESCE(EXCLUDED.enabled, violence_detection_configs.enabled),
        sensitivity = COALESCE(EXCLUDED.sensitivity, violence_detection_configs.sensitivity),
        min_confidence = COALESCE(EXCLUDED.min_confidence, violence_detection_configs.min_confidence),
        min_optical_flow_energy = COALESCE(EXCLUDED.min_optical_flow_energy, violence_detection_configs.min_optical_flow_energy),
        min_limb_acceleration = COALESCE(EXCLUDED.min_limb_acceleration, violence_detection_configs.min_limb_acceleration),
        min_duration_ms = COALESCE(EXCLUDED.min_duration_ms, violence_detection_configs.min_duration_ms),
        cooldown_seconds = COALESCE(EXCLUDED.cooldown_seconds, violence_detection_configs.cooldown_seconds),
        alert_severity = COALESCE(EXCLUDED.alert_severity, violence_detection_configs.alert_severity),
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      cameraId,
      tenantId,
      config.enabled ?? true,
      config.sensitivity ?? 0.70,
      config.min_confidence ?? (config as any).minConfidence ?? 0.65,
      config.min_optical_flow_energy ?? (config as any).minOpticalFlowEnergy ?? 25.0,
      config.min_limb_acceleration ?? (config as any).minLimbAcceleration ?? 30.0,
      config.min_duration_ms ?? (config as any).minDurationMs ?? 500,
      config.cooldown_seconds ?? (config as any).cooldownSeconds ?? 15,
      config.alert_severity ?? (config as any).alertSeverity ?? 'P1',
    ];

    const res = await this.pool.query(query, values);
    return res.rows[0];
  }

  /**
   * Aggregate fleet metrics for dashboard
   */
  async getStats(tenantId: string): Promise<{
    totalIncidents: number;
    pendingReviews: number;
    confirmedCount: number;
    falsePositiveCount: number;
    escalatedCount: number;
    avgConfidence: number;
    p1Count: number;
  }> {
    const query = `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE review_status = 'pending') as pending,
        COUNT(*) FILTER (WHERE review_status = 'confirmed') as confirmed,
        COUNT(*) FILTER (WHERE review_status = 'false_positive') as false_positive,
        COUNT(*) FILTER (WHERE review_status = 'escalated') as escalated,
        COALESCE(AVG(confidence), 0) as avg_confidence,
        COUNT(*) FILTER (WHERE severity = 'P1') as p1_count
      FROM violence_detection_events
      WHERE tenant_id = $1;
    `;
    const res = await this.pool.query(query, [tenantId]);
    const row = res.rows[0];

    return {
      totalIncidents: parseInt(row?.total ?? '0', 10),
      pendingReviews: parseInt(row?.pending ?? '0', 10),
      confirmedCount: parseInt(row?.confirmed ?? '0', 10),
      falsePositiveCount: parseInt(row?.false_positive ?? '0', 10),
      escalatedCount: parseInt(row?.escalated ?? '0', 10),
      avgConfidence: Number(parseFloat(row?.avg_confidence ?? '0').toFixed(3)),
      p1Count: parseInt(row?.p1_count ?? '0', 10),
    };
  }
}
