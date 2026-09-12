/**
 * Camera Tamper & Defocus Repository
 * 
 * PostgreSQL data access with robust in-memory fallback for camera tamper events,
 * calibrated baseline profiles, per-camera sensitivity configurations, and review audits.
 */

import crypto from 'node:crypto';
import type { Pool } from 'pg';
import type {
  CameraTamperEventRecord,
  CameraTamperBaselineRecord,
  CameraTamperConfigRecord,
  ListTamperEventsFilter,
  TamperStats,
  TamperType,
  TamperSeverity,
  TamperStatus,
} from './tamper-types.js';

export class TamperRepository {
  private readonly memoryEvents = new Map<string, CameraTamperEventRecord>();
  private readonly memoryBaselines = new Map<string, CameraTamperBaselineRecord>();
  private readonly memoryConfigs = new Map<string, CameraTamperConfigRecord>();

  constructor(private readonly pool?: Pool) {}

  /**
   * Create a tamper incident event
   */
  async createEvent(
    data: Omit<CameraTamperEventRecord, 'id' | 'created_at'>
  ): Promise<CameraTamperEventRecord> {
    const id = crypto.randomUUID();
    const now = new Date();

    const record: CameraTamperEventRecord = {
      ...data,
      id,
      created_at: now,
    };

    if (this.pool) {
      try {
        const query = `
          INSERT INTO camera_tamper_events (
            id, tenant_id, camera_id, branch_id, tamper_type,
            severity, confidence, metrics, status, snapshot_url,
            baseline_snapshot_url, notes, resolved_by, resolved_at,
            detected_at, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          RETURNING *;
        `;
        const values = [
          record.id,
          record.tenant_id,
          record.camera_id,
          record.branch_id || null,
          record.tamper_type,
          record.severity,
          record.confidence,
          JSON.stringify(record.metrics),
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
   * List tamper events with filtering and pagination
   */
  async listEvents(
    filter: ListTamperEventsFilter
  ): Promise<{ events: CameraTamperEventRecord[]; total: number }> {
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
        if (filter.tamperType) {
          conditions.push(`tamper_type = $${paramIndex++}`);
          values.push(filter.tamperType);
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
        const countQuery = `SELECT COUNT(*) FROM camera_tamper_events WHERE ${whereClause};`;
        const countRes = await this.pool.query(countQuery, values);
        const total = parseInt(countRes.rows[0].count, 10);

        const limit = filter.limit ?? 50;
        const offset = filter.offset ?? 0;
        values.push(limit, offset);

        const listQuery = `
          SELECT * FROM camera_tamper_events
          WHERE ${whereClause}
          ORDER BY detected_at DESC
          LIMIT $${paramIndex++} OFFSET $${paramIndex++};
        `;
        const listRes = await this.pool.query(listQuery, values);
        const events = listRes.rows.map((row) => this.mapEventRow(row));

        return { events, total };
      } catch (err) {
        console.warn('PostgreSQL query error, falling back to memory store:', err);
      }
    }

    let records = Array.from(this.memoryEvents.values()).filter(
      (e) => e.tenant_id === filter.tenantId
    );

    if (filter.cameraId) records = records.filter((e) => e.camera_id === filter.cameraId);
    if (filter.branchId) records = records.filter((e) => e.branch_id === filter.branchId);
    if (filter.tamperType) records = records.filter((e) => e.tamper_type === filter.tamperType);
    if (filter.severity) records = records.filter((e) => e.severity === filter.severity);
    if (filter.status) records = records.filter((e) => e.status === filter.status);
    if (filter.fromDate) records = records.filter((e) => e.detected_at >= filter.fromDate!);
    if (filter.toDate) records = records.filter((e) => e.detected_at <= filter.toDate!);

    records.sort((a, b) => b.detected_at.getTime() - a.detected_at.getTime());

    const total = records.length;
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    const paginated = records.slice(offset, offset + limit);

    return { events: paginated, total };
  }

  /**
   * Get single tamper event by ID
   */
  async getEventById(tenantId: string, id: string): Promise<CameraTamperEventRecord | null> {
    if (this.pool) {
      try {
        const query = 'SELECT * FROM camera_tamper_events WHERE tenant_id = $1 AND id = $2;';
        const res = await this.pool.query(query, [tenantId, id]);
        if (res.rows.length === 0) return null;
        return this.mapEventRow(res.rows[0]);
      } catch (err) {
        console.warn('PostgreSQL getEventById error:', err);
      }
    }

    const event = this.memoryEvents.get(id);
    if (!event || event.tenant_id !== tenantId) return null;
    return event;
  }

  /**
   * Update event status (e.g. acknowledge, resolve, false-positive)
   */
  async updateEventStatus(
    tenantId: string,
    id: string,
    status: TamperStatus,
    resolvedBy?: string,
    notes?: string
  ): Promise<CameraTamperEventRecord | null> {
    const resolvedAt = ['resolved', 'false_positive'].includes(status) ? new Date() : null;

    if (this.pool) {
      try {
        const query = `
          UPDATE camera_tamper_events
          SET status = $1,
              resolved_by = COALESCE($2, resolved_by),
              resolved_at = COALESCE($3, resolved_at),
              notes = COALESCE($4, notes)
          WHERE tenant_id = $5 AND id = $6
          RETURNING *;
        `;
        const res = await this.pool.query(query, [status, resolvedBy || null, resolvedAt, notes || null, tenantId, id]);
        if (res.rows.length === 0) return null;
        return this.mapEventRow(res.rows[0]);
      } catch (err) {
        console.warn('PostgreSQL updateEventStatus error:', err);
      }
    }

    const event = this.memoryEvents.get(id);
    if (!event || event.tenant_id !== tenantId) return null;

    event.status = status;
    if (resolvedBy) event.resolved_by = resolvedBy;
    if (resolvedAt) event.resolved_at = resolvedAt;
    if (notes) event.notes = notes;

    this.memoryEvents.set(id, event);
    return event;
  }

  /**
   * Get camera baseline
   */
  async getBaseline(tenantId: string, cameraId: string): Promise<CameraTamperBaselineRecord | null> {
    if (this.pool) {
      try {
        const query = 'SELECT * FROM camera_tamper_baselines WHERE tenant_id = $1 AND camera_id = $2;';
        const res = await this.pool.query(query, [tenantId, cameraId]);
        if (res.rows.length === 0) return null;
        return this.mapBaselineRow(res.rows[0]);
      } catch (err) {
        console.warn('PostgreSQL getBaseline error:', err);
      }
    }

    return this.memoryBaselines.get(`${tenantId}:${cameraId}`) || null;
  }

  /**
   * Upsert camera baseline
   */
  async upsertBaseline(
    baseline: Omit<CameraTamperBaselineRecord, 'id' | 'updated_at'>
  ): Promise<CameraTamperBaselineRecord> {
    const id = crypto.randomUUID();
    const now = new Date();

    const record: CameraTamperBaselineRecord = {
      ...baseline,
      id,
      updated_at: now,
    };

    if (this.pool) {
      try {
        const query = `
          INSERT INTO camera_tamper_baselines (
            id, tenant_id, camera_id, baseline_luminance, baseline_variance,
            baseline_edge_density, baseline_entropy, baseline_laplacian_variance,
            reference_frame_hash, reference_histogram, calibrated_at, sample_frames_count, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (camera_id) DO UPDATE SET
            baseline_luminance = EXCLUDED.baseline_luminance,
            baseline_variance = EXCLUDED.baseline_variance,
            baseline_edge_density = EXCLUDED.baseline_edge_density,
            baseline_entropy = EXCLUDED.baseline_entropy,
            baseline_laplacian_variance = EXCLUDED.baseline_laplacian_variance,
            reference_frame_hash = EXCLUDED.reference_frame_hash,
            reference_histogram = EXCLUDED.reference_histogram,
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
          record.reference_frame_hash || null,
          JSON.stringify(record.reference_histogram),
          record.calibrated_at,
          record.sample_frames_count,
          record.updated_at,
        ];
        const res = await this.pool.query(query, values);
        return this.mapBaselineRow(res.rows[0]);
      } catch (err) {
        console.warn('PostgreSQL upsertBaseline error:', err);
      }
    }

    this.memoryBaselines.set(`${baseline.tenant_id}:${baseline.camera_id}`, record);
    return record;
  }

  /**
   * Get camera tamper configuration
   */
  async getConfig(tenantId: string, cameraId: string): Promise<CameraTamperConfigRecord> {
    if (this.pool) {
      try {
        const query = 'SELECT * FROM camera_tamper_configs WHERE tenant_id = $1 AND camera_id = $2;';
        const res = await this.pool.query(query, [tenantId, cameraId]);
        if (res.rows.length > 0) {
          return this.mapConfigRow(res.rows[0]);
        }
      } catch (err) {
        console.warn('PostgreSQL getConfig error:', err);
      }
    }

    const cached = this.memoryConfigs.get(`${tenantId}:${cameraId}`);
    if (cached) return cached;

    // Return production default config
    return {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      camera_id: cameraId,
      sensitivity: 0.8,
      defocus_threshold: 100.0,
      blinding_threshold: 240.0,
      covering_threshold: 15.0,
      movement_threshold: 0.65,
      spray_threshold: 0.70,
      debounce_frames: 5,
      auto_recalibrate_hours: 24,
      alert_on_defocus: true,
      alert_on_blinding: true,
      alert_on_covering: true,
      alert_on_movement: true,
      alert_on_spray: true,
      enabled: true,
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  /**
   * Upsert camera tamper configuration
   */
  async upsertConfig(
    config: Partial<CameraTamperConfigRecord> & { tenant_id: string; camera_id: string }
  ): Promise<CameraTamperConfigRecord> {
    const existing = await this.getConfig(config.tenant_id, config.camera_id);
    const updated: CameraTamperConfigRecord = {
      ...existing,
      ...config,
      updated_at: new Date(),
    };

    if (this.pool) {
      try {
        const query = `
          INSERT INTO camera_tamper_configs (
            id, tenant_id, camera_id, sensitivity, defocus_threshold,
            blinding_threshold, covering_threshold, movement_threshold, spray_threshold,
            debounce_frames, auto_recalibrate_hours, alert_on_defocus, alert_on_blinding,
            alert_on_covering, alert_on_movement, alert_on_spray, enabled, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
          ON CONFLICT (camera_id) DO UPDATE SET
            sensitivity = EXCLUDED.sensitivity,
            defocus_threshold = EXCLUDED.defocus_threshold,
            blinding_threshold = EXCLUDED.blinding_threshold,
            covering_threshold = EXCLUDED.covering_threshold,
            movement_threshold = EXCLUDED.movement_threshold,
            spray_threshold = EXCLUDED.spray_threshold,
            debounce_frames = EXCLUDED.debounce_frames,
            auto_recalibrate_hours = EXCLUDED.auto_recalibrate_hours,
            alert_on_defocus = EXCLUDED.alert_on_defocus,
            alert_on_blinding = EXCLUDED.alert_on_blinding,
            alert_on_covering = EXCLUDED.alert_on_covering,
            alert_on_movement = EXCLUDED.alert_on_movement,
            alert_on_spray = EXCLUDED.alert_on_spray,
            enabled = EXCLUDED.enabled,
            updated_at = EXCLUDED.updated_at
          RETURNING *;
        `;
        const values = [
          updated.id,
          updated.tenant_id,
          updated.camera_id,
          updated.sensitivity,
          updated.defocus_threshold,
          updated.blinding_threshold,
          updated.covering_threshold,
          updated.movement_threshold,
          updated.spray_threshold,
          updated.debounce_frames,
          updated.auto_recalibrate_hours,
          updated.alert_on_defocus,
          updated.alert_on_blinding,
          updated.alert_on_covering,
          updated.alert_on_movement,
          updated.alert_on_spray,
          updated.enabled,
          updated.created_at,
          updated.updated_at,
        ];
        const res = await this.pool.query(query, values);
        return this.mapConfigRow(res.rows[0]);
      } catch (err) {
        console.warn('PostgreSQL upsertConfig error:', err);
      }
    }

    this.memoryConfigs.set(`${config.tenant_id}:${config.camera_id}`, updated);
    return updated;
  }

  /**
   * Aggregate statistics for tamper detection
   */
  async getStats(tenantId: string, cameraId?: string): Promise<TamperStats> {
    const defaultStats: TamperStats = {
      totalEvents: 0,
      activeEvents: 0,
      byType: {
        blinding: 0,
        covering: 0,
        movement: 0,
        defocus: 0,
        spray: 0,
      },
      bySeverity: {
        P1: 0,
        P2: 0,
        P3: 0,
        P4: 0,
      },
      byStatus: {
        detected: 0,
        acknowledged: 0,
        resolved: 0,
        false_positive: 0,
      },
      camerasMonitored: 0,
      camerasWithActiveTamper: 0,
      lastEventAt: null,
    };

    if (this.pool) {
      try {
        const params: any[] = [tenantId];
        let camClause = '';
        if (cameraId) {
          camClause = 'AND camera_id = $2';
          params.push(cameraId);
        }

        const statsQuery = `
          SELECT
            COUNT(*)::int as total_events,
            COUNT(*) FILTER (WHERE status IN ('detected', 'acknowledged'))::int as active_events,
            COUNT(DISTINCT camera_id)::int as cameras_monitored,
            COUNT(DISTINCT camera_id) FILTER (WHERE status IN ('detected', 'acknowledged'))::int as active_tampered_cameras,
            MAX(detected_at) as last_event_at
          FROM camera_tamper_events
          WHERE tenant_id = $1 ${camClause};
        `;
        const res = await this.pool.query(statsQuery, params);
        const row = res.rows[0];

        const typeQuery = `
          SELECT tamper_type, COUNT(*)::int as count
          FROM camera_tamper_events
          WHERE tenant_id = $1 ${camClause}
          GROUP BY tamper_type;
        `;
        const typeRes = await this.pool.query(typeQuery, params);
        typeRes.rows.forEach((r: any) => {
          if (r.tamper_type in defaultStats.byType) {
            defaultStats.byType[r.tamper_type as TamperType] = r.count;
          }
        });

        const sevQuery = `
          SELECT severity, COUNT(*)::int as count
          FROM camera_tamper_events
          WHERE tenant_id = $1 ${camClause}
          GROUP BY severity;
        `;
        const sevRes = await this.pool.query(sevQuery, params);
        sevRes.rows.forEach((r: any) => {
          if (r.severity in defaultStats.bySeverity) {
            defaultStats.bySeverity[r.severity as TamperSeverity] = r.count;
          }
        });

        const statusQuery = `
          SELECT status, COUNT(*)::int as count
          FROM camera_tamper_events
          WHERE tenant_id = $1 ${camClause}
          GROUP BY status;
        `;
        const statusRes = await this.pool.query(statusQuery, params);
        statusRes.rows.forEach((r: any) => {
          if (r.status in defaultStats.byStatus) {
            defaultStats.byStatus[r.status as TamperStatus] = r.count;
          }
        });

        defaultStats.totalEvents = row.total_events || 0;
        defaultStats.activeEvents = row.active_events || 0;
        defaultStats.camerasMonitored = row.cameras_monitored || 0;
        defaultStats.camerasWithActiveTamper = row.active_tampered_cameras || 0;
        defaultStats.lastEventAt = row.last_event_at ? row.last_event_at.toISOString() : null;

        return defaultStats;
      } catch (err) {
        console.warn('PostgreSQL getStats error, using memory fallback:', err);
      }
    }

    let records = Array.from(this.memoryEvents.values()).filter(
      (e) => e.tenant_id === tenantId
    );
    if (cameraId) records = records.filter((e) => e.camera_id === cameraId);

    defaultStats.totalEvents = records.length;
    const activeCams = new Set<string>();
    const allCams = new Set<string>();

    for (const r of records) {
      allCams.add(r.camera_id);
      defaultStats.byType[r.tamper_type]++;
      defaultStats.bySeverity[r.severity]++;
      defaultStats.byStatus[r.status]++;

      if (['detected', 'acknowledged'].includes(r.status)) {
        defaultStats.activeEvents++;
        activeCams.add(r.camera_id);
      }
      if (!defaultStats.lastEventAt || r.detected_at.toISOString() > defaultStats.lastEventAt) {
        defaultStats.lastEventAt = r.detected_at.toISOString();
      }
    }

    defaultStats.camerasMonitored = allCams.size;
    defaultStats.camerasWithActiveTamper = activeCams.size;

    return defaultStats;
  }

  // Row mappers
  private mapEventRow(row: any): CameraTamperEventRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      camera_id: row.camera_id,
      branch_id: row.branch_id,
      tamper_type: row.tamper_type,
      severity: row.severity,
      confidence: parseFloat(row.confidence),
      metrics: typeof row.metrics === 'string' ? JSON.parse(row.metrics) : row.metrics,
      status: row.status,
      snapshot_url: row.snapshot_url,
      baseline_snapshot_url: row.baseline_snapshot_url,
      notes: row.notes,
      resolved_by: row.resolved_by,
      resolved_at: row.resolved_at ? new Date(row.resolved_at) : null,
      detected_at: new Date(row.detected_at),
      created_at: new Date(row.created_at),
    };
  }

  private mapBaselineRow(row: any): CameraTamperBaselineRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      camera_id: row.camera_id,
      baseline_luminance: parseFloat(row.baseline_luminance),
      baseline_variance: parseFloat(row.baseline_variance),
      baseline_edge_density: parseFloat(row.baseline_edge_density),
      baseline_entropy: parseFloat(row.baseline_entropy),
      baseline_laplacian_variance: parseFloat(row.baseline_laplacian_variance),
      reference_frame_hash: row.reference_frame_hash,
      reference_histogram:
        typeof row.reference_histogram === 'string'
          ? JSON.parse(row.reference_histogram)
          : row.reference_histogram || [],
      calibrated_at: new Date(row.calibrated_at),
      sample_frames_count: parseInt(row.sample_frames_count, 10),
      updated_at: new Date(row.updated_at),
    };
  }

  private mapConfigRow(row: any): CameraTamperConfigRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      camera_id: row.camera_id,
      sensitivity: parseFloat(row.sensitivity),
      defocus_threshold: parseFloat(row.defocus_threshold),
      blinding_threshold: parseFloat(row.blinding_threshold),
      covering_threshold: parseFloat(row.covering_threshold),
      movement_threshold: parseFloat(row.movement_threshold),
      spray_threshold: parseFloat(row.spray_threshold),
      debounce_frames: parseInt(row.debounce_frames, 10),
      auto_recalibrate_hours: parseInt(row.auto_recalibrate_hours, 10),
      alert_on_defocus: Boolean(row.alert_on_defocus),
      alert_on_blinding: Boolean(row.alert_on_blinding),
      alert_on_covering: Boolean(row.alert_on_covering),
      alert_on_movement: Boolean(row.alert_on_movement),
      alert_on_spray: Boolean(row.alert_on_spray),
      enabled: Boolean(row.enabled),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }
}
