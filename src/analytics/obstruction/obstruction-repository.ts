/**
 * Camera Obstruction & Dark Frame Repository
 * 
 * PostgreSQL data access with robust in-memory fallback for camera obstruction events,
 * optical baseline profiles, per-camera sensitivity configurations, and review audits.
 */

import crypto from 'node:crypto';
import type { Pool } from 'pg';
import type {
  CameraObstructionEventRecord,
  CameraObstructionBaselineRecord,
  CameraObstructionConfigRecord,
  ListObstructionEventsFilter,
  ObstructionStats,
  ObstructionType,
  ObstructionSeverity,
  ObstructionStatus,
} from './obstruction-types.js';

export class ObstructionRepository {
  private readonly memoryEvents = new Map<string, CameraObstructionEventRecord>();
  private readonly memoryBaselines = new Map<string, CameraObstructionBaselineRecord>();
  private readonly memoryConfigs = new Map<string, CameraObstructionConfigRecord>();

  constructor(private readonly pool?: Pool) {}

  /**
   * Create an obstruction incident event
   */
  async createEvent(
    data: Omit<CameraObstructionEventRecord, 'id' | 'created_at'>
  ): Promise<CameraObstructionEventRecord> {
    const id = crypto.randomUUID();
    const now = new Date();

    const record: CameraObstructionEventRecord = {
      ...data,
      id,
      created_at: now,
    };

    if (this.pool) {
      try {
        const query = `
          INSERT INTO camera_obstruction_events (
            id, tenant_id, camera_id, branch_id, obstruction_type,
            severity, confidence, obstruction_percent, metrics, tile_analysis,
            status, snapshot_url, baseline_snapshot_url, notes, resolved_by,
            resolved_at, detected_at, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          RETURNING *;
        `;
        const values = [
          record.id,
          record.tenant_id,
          record.camera_id,
          record.branch_id || null,
          record.obstruction_type,
          record.severity,
          record.confidence,
          record.obstruction_percent,
          JSON.stringify(record.metrics),
          JSON.stringify(record.tile_analysis),
          record.status,
          record.snapshot_url || null,
          record.baseline_snapshot_url || null,
          record.notes || null,
          record.resolved_by || null,
          record.resolved_at || null,
          record.detected_at,
          record.created_at,
        ];
        const res = await this.pool.query(query, values);
        return this.mapEventRow(res.rows[0]);
      } catch (err) {
        console.warn('PostgreSQL insert error, falling back to memory store:', err);
      }
    }

    this.memoryEvents.set(id, record);
    return record;
  }

  /**
   * List obstruction events with filtering and pagination
   */
  async listEvents(
    filter: ListObstructionEventsFilter
  ): Promise<{ events: CameraObstructionEventRecord[]; total: number }> {
    if (this.pool) {
      try {
        const conditions: string[] = ['tenant_id = $1'];
        const values: any[] = [filter.tenantId];
        let paramIndex = 2;

        if (filter.cameraId) {
          conditions.push(`camera_id = $${paramIndex++}`);
          values.push(filter.cameraId);
        }
        if (filter.branchId) {
          conditions.push(`branch_id = $${paramIndex++}`);
          values.push(filter.branchId);
        }
        if (filter.obstructionType) {
          conditions.push(`obstruction_type = $${paramIndex++}`);
          values.push(filter.obstructionType);
        }
        if (filter.severity) {
          conditions.push(`severity = $${paramIndex++}`);
          values.push(filter.severity);
        }
        if (filter.status) {
          conditions.push(`status = $${paramIndex++}`);
          values.push(filter.status);
        }
        if (filter.fromDate) {
          conditions.push(`detected_at >= $${paramIndex++}`);
          values.push(filter.fromDate);
        }
        if (filter.toDate) {
          conditions.push(`detected_at <= $${paramIndex++}`);
          values.push(filter.toDate);
        }

        const whereClause = conditions.join(' AND ');
        const countQuery = `SELECT COUNT(*) as count FROM camera_obstruction_events WHERE ${whereClause}`;
        const countRes = await this.pool.query(countQuery, values);
        const total = parseInt(countRes.rows[0]?.count || '0', 10);

        const limit = filter.limit ?? 50;
        const offset = filter.offset ?? 0;
        const dataQuery = `
          SELECT * FROM camera_obstruction_events
          WHERE ${whereClause}
          ORDER BY detected_at DESC
          LIMIT $${paramIndex++} OFFSET $${paramIndex++}
        `;
        const dataRes = await this.pool.query(dataQuery, [...values, limit, offset]);
        const events = dataRes.rows.map((r: any) => this.mapEventRow(r));

        return { events, total };
      } catch (err) {
        console.warn('PostgreSQL query error, falling back to memory store:', err);
      }
    }

    // Memory Store Query
    let all = Array.from(this.memoryEvents.values()).filter(
      (e) => e.tenant_id === filter.tenantId
    );

    if (filter.cameraId) all = all.filter((e) => e.camera_id === filter.cameraId);
    if (filter.branchId) all = all.filter((e) => e.branch_id === filter.branchId);
    if (filter.obstructionType) all = all.filter((e) => e.obstruction_type === filter.obstructionType);
    if (filter.severity) all = all.filter((e) => e.severity === filter.severity);
    if (filter.status) all = all.filter((e) => e.status === filter.status);
    if (filter.fromDate) all = all.filter((e) => e.detected_at >= filter.fromDate!);
    if (filter.toDate) all = all.filter((e) => e.detected_at <= filter.toDate!);

    all.sort((a, b) => b.detected_at.getTime() - a.detected_at.getTime());
    const total = all.length;
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    const events = all.slice(offset, offset + limit);

    return { events, total };
  }

  /**
   * Get single event by ID
   */
  async getEventById(tenantId: string, id: string): Promise<CameraObstructionEventRecord | null> {
    if (this.pool) {
      try {
        const query = `SELECT * FROM camera_obstruction_events WHERE tenant_id = $1 AND id = $2`;
        const res = await this.pool.query(query, [tenantId, id]);
        if (res.rows.length > 0) {
          return this.mapEventRow(res.rows[0]);
        }
        return null;
      } catch (err) {
        console.warn('PostgreSQL query error, falling back to memory store:', err);
      }
    }

    const item = this.memoryEvents.get(id);
    if (item && item.tenant_id === tenantId) {
      return item;
    }
    return null;
  }

  /**
   * Update event review status
   */
  async updateEventStatus(
    tenantId: string,
    id: string,
    status: ObstructionStatus,
    resolvedBy?: string,
    notes?: string
  ): Promise<CameraObstructionEventRecord | null> {
    const now = new Date();

    if (this.pool) {
      try {
        const query = `
          UPDATE camera_obstruction_events
          SET status = $1,
              resolved_by = COALESCE($2, resolved_by),
              resolved_at = CASE WHEN $1 IN ('resolved', 'false_positive') THEN $3 ELSE resolved_at END,
              notes = COALESCE($4, notes)
          WHERE tenant_id = $5 AND id = $6
          RETURNING *;
        `;
        const res = await this.pool.query(query, [status, resolvedBy || null, now, notes || null, tenantId, id]);
        if (res.rows.length > 0) {
          return this.mapEventRow(res.rows[0]);
        }
        return null;
      } catch (err) {
        console.warn('PostgreSQL update error, falling back to memory store:', err);
      }
    }

    const item = this.memoryEvents.get(id);
    if (item && item.tenant_id === tenantId) {
      item.status = status;
      if (resolvedBy) item.resolved_by = resolvedBy;
      if (status === 'resolved' || status === 'false_positive') {
        item.resolved_at = now;
      }
      if (notes) item.notes = notes;
      return item;
    }
    return null;
  }

  /**
   * Aggregate fleet obstruction statistics
   */
  async getStats(tenantId: string, cameraId?: string): Promise<ObstructionStats> {
    if (this.pool) {
      try {
        const conditions = ['tenant_id = $1'];
        const values: any[] = [tenantId];
        if (cameraId) {
          conditions.push('camera_id = $2');
          values.push(cameraId);
        }
        const where = conditions.join(' AND ');

        const query = `
          SELECT
            COUNT(*)::int AS total_events,
            COUNT(*) FILTER (WHERE status = 'detected')::int AS active_events,
            COUNT(*) FILTER (WHERE obstruction_type = 'dark_frame')::int AS dark_frame_count,
            COUNT(*) FILTER (WHERE obstruction_type = 'lens_covering')::int AS lens_covering_count,
            COUNT(*) FILTER (WHERE obstruction_type = 'variance_loss')::int AS variance_loss_count,
            COUNT(*) FILTER (WHERE obstruction_type = 'partial_obstruction')::int AS partial_obstruction_count,
            COUNT(*) FILTER (WHERE obstruction_type = 'glare_whiteout')::int AS glare_whiteout_count,
            COUNT(*) FILTER (WHERE severity = 'P1')::int AS p1_count,
            COUNT(*) FILTER (WHERE severity = 'P2')::int AS p2_count,
            COUNT(*) FILTER (WHERE severity = 'P3')::int AS p3_count,
            COUNT(*) FILTER (WHERE severity = 'P4')::int AS p4_count,
            COUNT(*) FILTER (WHERE status = 'acknowledged')::int AS acknowledged_count,
            COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved_count,
            COUNT(*) FILTER (WHERE status = 'false_positive')::int AS false_positive_count,
            COUNT(DISTINCT camera_id)::int AS cameras_at_risk,
            MAX(detected_at) AS last_event_at
          FROM camera_obstruction_events
          WHERE ${where};
        `;
        const res = await this.pool.query(query, values);
        const r = res.rows[0];

        const camCountQuery = `SELECT COUNT(*)::int AS count FROM camera_obstruction_configs WHERE tenant_id = $1 AND enabled = true`;
        const camRes = await this.pool.query(camCountQuery, [tenantId]);
        const camerasMonitored = parseInt(camRes.rows[0]?.count || '0', 10);

        return {
          totalEvents: r?.total_events || 0,
          activeEvents: r?.active_events || 0,
          darkFrameCount: r?.dark_frame_count || 0,
          lensCoveringCount: r?.lens_covering_count || 0,
          varianceLossCount: r?.variance_loss_count || 0,
          partialObstructionCount: r?.partial_obstruction_count || 0,
          glareWhiteoutCount: r?.glare_whiteout_count || 0,
          p1Count: r?.p1_count || 0,
          p2Count: r?.p2_count || 0,
          p3Count: r?.p3_count || 0,
          p4Count: r?.p4_count || 0,
          acknowledgedCount: r?.acknowledged_count || 0,
          resolvedCount: r?.resolved_count || 0,
          falsePositiveCount: r?.false_positive_count || 0,
          camerasMonitored: camerasMonitored || 1,
          camerasAtRisk: r?.cameras_at_risk || 0,
          lastEventAt: r?.last_event_at ? new Date(r.last_event_at) : null,
        };
      } catch (err) {
        console.warn('PostgreSQL stats query error, falling back to memory store:', err);
      }
    }

    let all = Array.from(this.memoryEvents.values()).filter((e) => e.tenant_id === tenantId);
    if (cameraId) all = all.filter((e) => e.camera_id === cameraId);

    const atRiskCameras = new Set<string>();
    let active = 0, darkFrames = 0, coverings = 0, varLoss = 0, partial = 0, glare = 0;
    let p1 = 0, p2 = 0, p3 = 0, p4 = 0;
    let ack = 0, resCount = 0, fp = 0;
    let lastDate: Date | null = null;

    for (const e of all) {
      if (e.status === 'detected') {
        active++;
        atRiskCameras.add(e.camera_id);
      }
      if (e.obstruction_type === 'dark_frame') darkFrames++;
      if (e.obstruction_type === 'lens_covering') coverings++;
      if (e.obstruction_type === 'variance_loss') varLoss++;
      if (e.obstruction_type === 'partial_obstruction') partial++;
      if (e.obstruction_type === 'glare_whiteout') glare++;

      if (e.severity === 'P1') p1++;
      if (e.severity === 'P2') p2++;
      if (e.severity === 'P3') p3++;
      if (e.severity === 'P4') p4++;

      if (e.status === 'acknowledged') ack++;
      if (e.status === 'resolved') resCount++;
      if (e.status === 'false_positive') fp++;

      if (!lastDate || e.detected_at > lastDate) {
        lastDate = e.detected_at;
      }
    }

    const configs = Array.from(this.memoryConfigs.values()).filter(
      (c) => c.tenant_id === tenantId && c.enabled
    );

    return {
      totalEvents: all.length,
      activeEvents: active,
      darkFrameCount: darkFrames,
      lensCoveringCount: coverings,
      varianceLossCount: varLoss,
      partialObstructionCount: partial,
      glareWhiteoutCount: glare,
      p1Count: p1,
      p2Count: p2,
      p3Count: p3,
      p4Count: p4,
      acknowledgedCount: ack,
      resolvedCount: resCount,
      falsePositiveCount: fp,
      camerasMonitored: configs.length || 1,
      camerasAtRisk: atRiskCameras.size,
      lastEventAt: lastDate,
    };
  }

  /**
   * Get baseline optical profile for camera
   */
  async getBaseline(
    tenantId: string,
    cameraId: string
  ): Promise<CameraObstructionBaselineRecord | null> {
    if (this.pool) {
      try {
        const query = `SELECT * FROM camera_obstruction_baselines WHERE tenant_id = $1 AND camera_id = $2`;
        const res = await this.pool.query(query, [tenantId, cameraId]);
        if (res.rows.length > 0) {
          return this.mapBaselineRow(res.rows[0]);
        }
        return null;
      } catch (err) {
        console.warn('PostgreSQL baseline query error, falling back to memory store:', err);
      }
    }

    const key = `${tenantId}:${cameraId}`;
    return this.memoryBaselines.get(key) || null;
  }

  /**
   * Upsert baseline optical profile
   */
  async upsertBaseline(
    data: Omit<CameraObstructionBaselineRecord, 'id' | 'updated_at'> & { id?: string }
  ): Promise<CameraObstructionBaselineRecord> {
    const id = data.id || crypto.randomUUID();
    const now = new Date();

    const record: CameraObstructionBaselineRecord = {
      ...data,
      id,
      updated_at: now,
    };

    if (this.pool) {
      try {
        const query = `
          INSERT INTO camera_obstruction_baselines (
            id, tenant_id, camera_id, baseline_luminance, baseline_variance,
            baseline_edge_density, baseline_entropy, baseline_laplacian_variance,
            tile_baselines, reference_histogram, reference_frame_hash,
            calibrated_at, sample_frames_count, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (camera_id) DO UPDATE SET
            baseline_luminance = EXCLUDED.baseline_luminance,
            baseline_variance = EXCLUDED.baseline_variance,
            baseline_edge_density = EXCLUDED.baseline_edge_density,
            baseline_entropy = EXCLUDED.baseline_entropy,
            baseline_laplacian_variance = EXCLUDED.baseline_laplacian_variance,
            tile_baselines = EXCLUDED.tile_baselines,
            reference_histogram = EXCLUDED.reference_histogram,
            reference_frame_hash = EXCLUDED.reference_frame_hash,
            calibrated_at = EXCLUDED.calibrated_at,
            sample_frames_count = EXCLUDED.sample_frames_count,
            updated_at = EXCLUDED.updated_at
          RETURNING *;
        `;
        const values = [
          record.id,
          record.tenant_id,
          record.camera_id,
          record.baseline_luminance,
          record.baseline_variance,
          record.baseline_edge_density,
          record.baseline_entropy,
          record.baseline_laplacian_variance,
          JSON.stringify(record.tile_baselines),
          JSON.stringify(record.reference_histogram),
          record.reference_frame_hash || null,
          record.calibrated_at,
          record.sample_frames_count,
          record.updated_at,
        ];
        const res = await this.pool.query(query, values);
        return this.mapBaselineRow(res.rows[0]);
      } catch (err) {
        console.warn('PostgreSQL upsert baseline error, falling back to memory store:', err);
      }
    }

    const key = `${record.tenant_id}:${record.camera_id}`;
    this.memoryBaselines.set(key, record);
    return record;
  }

  /**
   * Get camera obstruction configuration
   */
  async getConfig(
    tenantId: string,
    cameraId: string
  ): Promise<CameraObstructionConfigRecord | null> {
    if (this.pool) {
      try {
        const query = `SELECT * FROM camera_obstruction_configs WHERE tenant_id = $1 AND camera_id = $2`;
        const res = await this.pool.query(query, [tenantId, cameraId]);
        if (res.rows.length > 0) {
          return this.mapConfigRow(res.rows[0]);
        }
      } catch (err) {
        console.warn('PostgreSQL config query error, falling back to memory store:', err);
      }
    }

    const key = `${tenantId}:${cameraId}`;
    const found = this.memoryConfigs.get(key);
    if (found) return found;

    // Default configuration if not found
    return {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      camera_id: cameraId,
      sensitivity: 0.8,
      darkness_threshold: 8.0,
      variance_floor: 12.0,
      obstruction_percent_threshold: 70.0,
      partial_threshold: 25.0,
      debounce_frames: 3,
      auto_recalibrate_hours: 24,
      alert_on_dark_frame: true,
      alert_on_covering: true,
      alert_on_variance_loss: true,
      alert_on_partial: true,
      alert_on_glare: true,
      enabled: true,
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  /**
   * Upsert camera obstruction configuration
   */
  async upsertConfig(
    data: Partial<CameraObstructionConfigRecord> & { tenant_id: string; camera_id: string }
  ): Promise<CameraObstructionConfigRecord> {
    const existing = await this.getConfig(data.tenant_id, data.camera_id);
    const now = new Date();

    const record: CameraObstructionConfigRecord = {
      id: existing?.id || crypto.randomUUID(),
      tenant_id: data.tenant_id,
      camera_id: data.camera_id,
      sensitivity: data.sensitivity ?? existing?.sensitivity ?? 0.8,
      darkness_threshold: data.darkness_threshold ?? existing?.darkness_threshold ?? 8.0,
      variance_floor: data.variance_floor ?? existing?.variance_floor ?? 12.0,
      obstruction_percent_threshold: data.obstruction_percent_threshold ?? existing?.obstruction_percent_threshold ?? 70.0,
      partial_threshold: data.partial_threshold ?? existing?.partial_threshold ?? 25.0,
      debounce_frames: data.debounce_frames ?? existing?.debounce_frames ?? 3,
      auto_recalibrate_hours: data.auto_recalibrate_hours ?? existing?.auto_recalibrate_hours ?? 24,
      alert_on_dark_frame: data.alert_on_dark_frame ?? existing?.alert_on_dark_frame ?? true,
      alert_on_covering: data.alert_on_covering ?? existing?.alert_on_covering ?? true,
      alert_on_variance_loss: data.alert_on_variance_loss ?? existing?.alert_on_variance_loss ?? true,
      alert_on_partial: data.alert_on_partial ?? existing?.alert_on_partial ?? true,
      alert_on_glare: data.alert_on_glare ?? existing?.alert_on_glare ?? true,
      enabled: data.enabled ?? existing?.enabled ?? true,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    if (this.pool) {
      try {
        const query = `
          INSERT INTO camera_obstruction_configs (
            id, tenant_id, camera_id, sensitivity, darkness_threshold,
            variance_floor, obstruction_percent_threshold, partial_threshold,
            debounce_frames, auto_recalibrate_hours, alert_on_dark_frame,
            alert_on_covering, alert_on_variance_loss, alert_on_partial,
            alert_on_glare, enabled, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          ON CONFLICT (camera_id) DO UPDATE SET
            sensitivity = EXCLUDED.sensitivity,
            darkness_threshold = EXCLUDED.darkness_threshold,
            variance_floor = EXCLUDED.variance_floor,
            obstruction_percent_threshold = EXCLUDED.obstruction_percent_threshold,
            partial_threshold = EXCLUDED.partial_threshold,
            debounce_frames = EXCLUDED.debounce_frames,
            auto_recalibrate_hours = EXCLUDED.auto_recalibrate_hours,
            alert_on_dark_frame = EXCLUDED.alert_on_dark_frame,
            alert_on_covering = EXCLUDED.alert_on_covering,
            alert_on_variance_loss = EXCLUDED.alert_on_variance_loss,
            alert_on_partial = EXCLUDED.alert_on_partial,
            alert_on_glare = EXCLUDED.alert_on_glare,
            enabled = EXCLUDED.enabled,
            updated_at = EXCLUDED.updated_at
          RETURNING *;
        `;
        const values = [
          record.id,
          record.tenant_id,
          record.camera_id,
          record.sensitivity,
          record.darkness_threshold,
          record.variance_floor,
          record.obstruction_percent_threshold,
          record.partial_threshold,
          record.debounce_frames,
          record.auto_recalibrate_hours,
          record.alert_on_dark_frame,
          record.alert_on_covering,
          record.alert_on_variance_loss,
          record.alert_on_partial,
          record.alert_on_glare,
          record.enabled,
          record.created_at,
          record.updated_at,
        ];
        const res = await this.pool.query(query, values);
        return this.mapConfigRow(res.rows[0]);
      } catch (err) {
        console.warn('PostgreSQL upsert config error, falling back to memory store:', err);
      }
    }

    const key = `${record.tenant_id}:${record.camera_id}`;
    this.memoryConfigs.set(key, record);
    return record;
  }

  // Row Mappers
  private mapEventRow(row: any): CameraObstructionEventRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      camera_id: row.camera_id,
      branch_id: row.branch_id,
      obstruction_type: row.obstruction_type as ObstructionType,
      severity: row.severity as ObstructionSeverity,
      confidence: parseFloat(row.confidence),
      obstruction_percent: parseFloat(row.obstruction_percent ?? 0),
      metrics: typeof row.metrics === 'string' ? JSON.parse(row.metrics) : row.metrics,
      tile_analysis: typeof row.tile_analysis === 'string' ? JSON.parse(row.tile_analysis) : row.tile_analysis,
      status: row.status as ObstructionStatus,
      snapshot_url: row.snapshot_url,
      baseline_snapshot_url: row.baseline_snapshot_url,
      notes: row.notes,
      resolved_by: row.resolved_by,
      resolved_at: row.resolved_at ? new Date(row.resolved_at) : null,
      detected_at: new Date(row.detected_at),
      created_at: new Date(row.created_at),
    };
  }

  private mapBaselineRow(row: any): CameraObstructionBaselineRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      camera_id: row.camera_id,
      baseline_luminance: parseFloat(row.baseline_luminance),
      baseline_variance: parseFloat(row.baseline_variance),
      baseline_edge_density: parseFloat(row.baseline_edge_density),
      baseline_entropy: parseFloat(row.baseline_entropy),
      baseline_laplacian_variance: parseFloat(row.baseline_laplacian_variance ?? 0),
      tile_baselines: typeof row.tile_baselines === 'string' ? JSON.parse(row.tile_baselines) : row.tile_baselines,
      reference_histogram: typeof row.reference_histogram === 'string' ? JSON.parse(row.reference_histogram) : row.reference_histogram,
      reference_frame_hash: row.reference_frame_hash,
      calibrated_at: new Date(row.calibrated_at),
      sample_frames_count: parseInt(row.sample_frames_count, 10),
      updated_at: new Date(row.updated_at),
    };
  }

  private mapConfigRow(row: any): CameraObstructionConfigRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      camera_id: row.camera_id,
      sensitivity: parseFloat(row.sensitivity),
      darkness_threshold: parseFloat(row.darkness_threshold),
      variance_floor: parseFloat(row.variance_floor),
      obstruction_percent_threshold: parseFloat(row.obstruction_percent_threshold),
      partial_threshold: parseFloat(row.partial_threshold),
      debounce_frames: parseInt(row.debounce_frames, 10),
      auto_recalibrate_hours: parseInt(row.auto_recalibrate_hours, 10),
      alert_on_dark_frame: Boolean(row.alert_on_dark_frame),
      alert_on_covering: Boolean(row.alert_on_covering),
      alert_on_variance_loss: Boolean(row.alert_on_variance_loss),
      alert_on_partial: Boolean(row.alert_on_partial),
      alert_on_glare: Boolean(row.alert_on_glare),
      enabled: Boolean(row.enabled),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }
}
