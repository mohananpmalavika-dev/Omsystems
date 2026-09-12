/**
 * Fall Detection PostgreSQL Repository
 * 
 * Manages transactional ledger queries for fall incidents,
 * per-camera kinematic threshold parameters, and operator review states.
 */

import type { Pool } from 'pg';
import type {
  FallEventRecord,
  FallCameraConfigRecord,
  FallDetectionResult,
  ListFallEventsFilter,
  FallStats,
} from './types.js';

export class FallRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Persist a detected fall event
   */
  public async saveEvent(
    tenantId: string,
    cameraId: string,
    result: FallDetectionResult,
    occurredAt: Date,
    snapshotReference?: string
  ): Promise<FallEventRecord> {
    const query = `
      INSERT INTO fall_detection_events (
        tenant_id,
        camera_id,
        track_id,
        person_category,
        fall_type,
        confidence,
        severity,
        impact_speed,
        aspect_ratio_peak,
        torso_angle_degrees,
        motionless_duration_seconds,
        recovery_detected,
        recovery_time_seconds,
        bounding_box,
        pose_keypoints,
        dynamics_telemetry,
        snapshot_reference,
        review_status,
        occurred_at,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'pending', $18, NOW())
      RETURNING *;
    `;

    const values = [
      tenantId,
      cameraId,
      result.trackId,
      result.personCategory,
      result.fallType,
      result.confidence,
      result.severity,
      result.impactSpeed,
      result.peakAspectRatio,
      result.torsoAngleDegrees,
      result.motionlessDurationSeconds,
      result.recoveryDetected,
      result.recoveryTimeSeconds,
      JSON.stringify(result.boundingBox),
      JSON.stringify(result.poseKeypoints || {}),
      JSON.stringify(result.dynamicsTelemetry),
      snapshotReference || null,
      occurredAt,
    ];

    const { rows } = await this.pool.query(query, values);
    return this.mapEventRow(rows[0]);
  }

  /**
   * List historical fall events with filtering and pagination
   */
  public async listEvents(filter: ListFallEventsFilter): Promise<{ events: FallEventRecord[]; total: number }> {
    const conditions: string[] = ['tenant_id = $1'];
    const values: any[] = [filter.tenantId];
    let idx = 2;

    if (filter.cameraId) {
      conditions.push(`camera_id = $${idx++}`);
      values.push(filter.cameraId);
    }
    if (filter.personCategory) {
      conditions.push(`person_category = $${idx++}`);
      values.push(filter.personCategory);
    }
    if (filter.severity) {
      conditions.push(`severity = $${idx++}`);
      values.push(filter.severity);
    }
    if (filter.reviewStatus) {
      conditions.push(`review_status = $${idx++}`);
      values.push(filter.reviewStatus);
    }
    if (filter.fromDate) {
      conditions.push(`occurred_at >= $${idx++}`);
      values.push(filter.fromDate);
    }
    if (filter.toDate) {
      conditions.push(`occurred_at <= $${idx++}`);
      values.push(filter.toDate);
    }

    const whereClause = conditions.join(' AND ');

    // Total count query
    const countRes = await this.pool.query(
      `SELECT COUNT(*) as total FROM fall_detection_events WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    // Records query
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    const dataRes = await this.pool.query(
      `SELECT * FROM fall_detection_events 
       WHERE ${whereClause}
       ORDER BY occurred_at DESC 
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset]
    );

    const events = dataRes.rows.map((r: any) => this.mapEventRow(r));
    return { events, total };
  }

  /**
   * Get single event by ID
   */
  public async getEventById(eventId: string, tenantId: string): Promise<FallEventRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM fall_detection_events WHERE id = $1 AND tenant_id = $2`,
      [eventId, tenantId]
    );
    if (rows.length === 0) return null;
    return this.mapEventRow(rows[0]);
  }

  /**
   * Operator review
   */
  public async reviewEvent(
    eventId: string,
    tenantId: string,
    reviewStatus: 'confirmed' | 'false_positive' | 'escalated',
    reviewedBy: string,
    reviewNotes?: string
  ): Promise<FallEventRecord | null> {
    const { rows } = await this.pool.query(
      `UPDATE fall_detection_events
       SET review_status = $1, reviewed_by = $2, reviewed_at = NOW(), review_notes = $3
       WHERE id = $4 AND tenant_id = $5
       RETURNING *;`,
      [reviewStatus, reviewedBy, reviewNotes || null, eventId, tenantId]
    );
    if (rows.length === 0) return null;
    return this.mapEventRow(rows[0]);
  }

  /**
   * Get per-camera config
   */
  public async getCameraConfig(cameraId: string, tenantId: string): Promise<FallCameraConfigRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM fall_detection_configs WHERE camera_id = $1 AND tenant_id = $2`,
      [cameraId, tenantId]
    );
    if (rows.length === 0) return null;
    return this.mapConfigRow(rows[0]);
  }

  /**
   * Upsert camera config
   */
  public async upsertCameraConfig(
    cameraId: string,
    tenantId: string,
    config: Partial<FallCameraConfigRecord>
  ): Promise<FallCameraConfigRecord> {
    const query = `
      INSERT INTO fall_detection_configs (
        camera_id,
        tenant_id,
        enabled,
        profile,
        sensitivity,
        min_confidence,
        aspect_ratio_threshold,
        velocity_threshold,
        torso_angle_threshold,
        motionless_delay_seconds,
        recovery_timeout_seconds,
        alert_severity,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
      ON CONFLICT (camera_id) DO UPDATE SET
        enabled = COALESCE($3, fall_detection_configs.enabled),
        profile = COALESCE($4, fall_detection_configs.profile),
        sensitivity = COALESCE($5, fall_detection_configs.sensitivity),
        min_confidence = COALESCE($6, fall_detection_configs.min_confidence),
        aspect_ratio_threshold = COALESCE($7, fall_detection_configs.aspect_ratio_threshold),
        velocity_threshold = COALESCE($8, fall_detection_configs.velocity_threshold),
        torso_angle_threshold = COALESCE($9, fall_detection_configs.torso_angle_threshold),
        motionless_delay_seconds = COALESCE($10, fall_detection_configs.motionless_delay_seconds),
        recovery_timeout_seconds = COALESCE($11, fall_detection_configs.recovery_timeout_seconds),
        alert_severity = COALESCE($12, fall_detection_configs.alert_severity),
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      cameraId,
      tenantId,
      config.enabled ?? true,
      config.profile ?? 'worker',
      config.sensitivity ?? 0.75,
      config.min_confidence ?? 0.65,
      config.aspect_ratio_threshold ?? 1.20,
      config.velocity_threshold ?? 0.150,
      config.torso_angle_threshold ?? 35.0,
      config.motionless_delay_seconds ?? 3.0,
      config.recovery_timeout_seconds ?? 15.0,
      config.alert_severity ?? 'P1',
    ];

    const { rows } = await this.pool.query(query, values);
    return this.mapConfigRow(rows[0]);
  }

  /**
   * Get operational stats
   */
  public async getStats(tenantId: string): Promise<FallStats> {
    const query = `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE person_category = 'worker') as worker_count,
        COUNT(*) FILTER (WHERE person_category = 'elderly') as elderly_count,
        COUNT(*) FILTER (WHERE recovery_detected = false AND severity = 'P1') as unrecovered_emergency_count,
        COUNT(*) FILTER (WHERE recovery_detected = true) as recovered_count,
        COUNT(*) FILTER (WHERE review_status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE review_status = 'false_positive') as fp_count,
        COALESCE(AVG(confidence), 0.0) as avg_confidence,
        COUNT(*) FILTER (WHERE severity = 'P1') as p1_count
      FROM fall_detection_events
      WHERE tenant_id = $1;
    `;

    const { rows } = await this.pool.query(query, [tenantId]);
    const r = rows[0] || {};

    return {
      totalFalls: parseInt(r.total || '0', 10),
      workerFalls: parseInt(r.worker_count || '0', 10),
      elderlyFalls: parseInt(r.elderly_count || '0', 10),
      unrecoveredEmergencyCount: parseInt(r.unrecovered_emergency_count || '0', 10),
      recoveredCount: parseInt(r.recovered_count || '0', 10),
      pendingReviewCount: parseInt(r.pending_count || '0', 10),
      falsePositiveCount: parseInt(r.fp_count || '0', 10),
      avgConfidence: Number(parseFloat(r.avg_confidence || '0').toFixed(3)),
      p1Count: parseInt(r.p1_count || '0', 10),
    };
  }

  private mapEventRow(row: any): FallEventRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      camera_id: row.camera_id,
      track_id: row.track_id,
      person_category: row.person_category,
      fall_type: row.fall_type,
      confidence: parseFloat(row.confidence),
      severity: row.severity,
      impact_speed: parseFloat(row.impact_speed || '0'),
      aspect_ratio_peak: parseFloat(row.aspect_ratio_peak || '0'),
      torso_angle_degrees: row.torso_angle_degrees !== null ? parseFloat(row.torso_angle_degrees) : null,
      motionless_duration_seconds: parseFloat(row.motionless_duration_seconds || '0'),
      recovery_detected: Boolean(row.recovery_detected),
      recovery_time_seconds: row.recovery_time_seconds !== null ? parseFloat(row.recovery_time_seconds) : null,
      bounding_box: typeof row.bounding_box === 'string' ? JSON.parse(row.bounding_box) : row.bounding_box,
      pose_keypoints: typeof row.pose_keypoints === 'string' ? JSON.parse(row.pose_keypoints) : row.pose_keypoints,
      dynamics_telemetry: typeof row.dynamics_telemetry === 'string' ? JSON.parse(row.dynamics_telemetry) : row.dynamics_telemetry,
      snapshot_reference: row.snapshot_reference,
      review_status: row.review_status,
      reviewed_by: row.reviewed_by,
      reviewed_at: row.reviewed_at ? new Date(row.reviewed_at) : null,
      review_notes: row.review_notes,
      occurred_at: new Date(row.occurred_at),
      created_at: new Date(row.created_at),
    };
  }

  private mapConfigRow(row: any): FallCameraConfigRecord {
    return {
      camera_id: row.camera_id,
      tenant_id: row.tenant_id,
      enabled: Boolean(row.enabled),
      profile: row.profile,
      sensitivity: parseFloat(row.sensitivity),
      min_confidence: parseFloat(row.min_confidence),
      aspect_ratio_threshold: parseFloat(row.aspect_ratio_threshold),
      velocity_threshold: parseFloat(row.velocity_threshold),
      torso_angle_threshold: parseFloat(row.torso_angle_threshold),
      motionless_delay_seconds: parseFloat(row.motionless_delay_seconds),
      recovery_timeout_seconds: parseFloat(row.recovery_timeout_seconds),
      alert_severity: row.alert_severity,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }
}
