/**
 * Abandoned & Unattended Object Detection Repository
 * 
 * PostgreSQL data access layer with resilient in-memory fallback for monitored zones,
 * stationary object events, sensitivity configurations, and operational statistics.
 */

import crypto from 'node:crypto';
import type { Pool } from 'pg';
import type {
  AbandonedObjectEventRecord,
  AbandonedObjectZoneRecord,
  AbandonedObjectConfigRecord,
  ListAbandonedEventsFilter,
  ListAbandonedZonesFilter,
  AbandonedStats,
  AbandonedStatus,
} from './types.js';

export class AbandonedObjectRepository {
  private readonly memoryEvents = new Map<string, AbandonedObjectEventRecord>();
  private readonly memoryZones = new Map<string, AbandonedObjectZoneRecord>();
  private readonly memoryConfigs = new Map<string, AbandonedObjectConfigRecord>();

  constructor(private readonly pool?: Pool) {
    this.seedDefaultZones();
  }

  private seedDefaultZones(): void {
    const defaultTenantId = '00000000-0000-4000-8000-000000000000';
    const zone1: AbandonedObjectZoneRecord = {
      id: 'zone-atm-01',
      tenant_id: defaultTenantId,
      branch_id: 'branch-south-01',
      camera_id: 'cam-branch-01-main',
      zone_name: 'ATM Vestibule Sterile Area',
      zone_type: 'atm_vestibule',
      polygon: [
        { x: 50, y: 50 },
        { x: 450, y: 50 },
        { x: 450, y: 350 },
        { x: 50, y: 350 },
      ],
      sensitivity: 'high',
      unattended_threshold_seconds: 45,
      abandoned_threshold_seconds: 120,
      min_blob_area_pixels: 150,
      max_blob_area_pixels: 50000,
      enabled: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const zone2: AbandonedObjectZoneRecord = {
      id: 'zone-cash-counter-01',
      tenant_id: defaultTenantId,
      branch_id: 'branch-south-01',
      camera_id: 'cam-branch-01-main',
      zone_name: 'Cash Counter Security Perimeter',
      zone_type: 'cash_counter',
      polygon: [
        { x: 500, y: 100 },
        { x: 900, y: 100 },
        { x: 900, y: 400 },
        { x: 500, y: 400 },
      ],
      sensitivity: 'critical',
      unattended_threshold_seconds: 30,
      abandoned_threshold_seconds: 90,
      min_blob_area_pixels: 120,
      max_blob_area_pixels: 40000,
      enabled: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    this.memoryZones.set(zone1.id, zone1);
    this.memoryZones.set(zone2.id, zone2);
  }

  // ==========================================================================
  // EVENT OPERATIONS
  // ==========================================================================

  async createEvent(
    data: Omit<AbandonedObjectEventRecord, 'id' | 'created_at'>
  ): Promise<AbandonedObjectEventRecord> {
    const id = crypto.randomUUID();
    const now = new Date();

    const record: AbandonedObjectEventRecord = {
      ...data,
      id,
      created_at: now,
    };

    if (this.pool) {
      try {
        const query = `
          INSERT INTO abandoned_object_events (
            id, tenant_id, camera_id, zone_id, branch_id,
            event_type, object_type, severity, confidence,
            bounding_box, dwell_time_seconds, owner_track_id,
            owner_distance_pixels, status, snapshot_url,
            thermal_score, notes, resolved_by, resolved_at,
            first_seen_at, detected_at, created_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12,
            $13, $14, $15,
            $16, $17, $18, $19,
            $20, $21, $22
          ) RETURNING *;
        `;
        const values = [
          record.id,
          record.tenant_id,
          record.camera_id,
          record.zone_id || null,
          record.branch_id || null,
          record.event_type,
          record.object_type,
          record.severity,
          record.confidence,
          JSON.stringify(record.bounding_box),
          record.dwell_time_seconds,
          record.owner_track_id || null,
          record.owner_distance_pixels ?? null,
          record.status,
          record.snapshot_url || null,
          record.thermal_score ?? null,
          record.notes || null,
          record.resolved_by || null,
          record.resolved_at || null,
          record.first_seen_at,
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

  async getEventById(tenantId: string, id: string): Promise<AbandonedObjectEventRecord | null> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM abandoned_object_events WHERE tenant_id = $1 AND id = $2;',
          [tenantId, id]
        );
        if (res.rows.length > 0) {
          return this.mapEventRow(res.rows[0]);
        }
        return null;
      } catch (err) {
        console.warn('PostgreSQL query error, falling back to memory store:', err);
      }
    }

    const event = this.memoryEvents.get(id);
    if (event && event.tenant_id === tenantId) {
      return event;
    }
    return null;
  }

  async listEvents(
    filter: ListAbandonedEventsFilter
  ): Promise<{ events: AbandonedObjectEventRecord[]; total: number }> {
    if (this.pool) {
      try {
        const conditions: string[] = ['tenant_id = $1'];
        const values: any[] = [filter.tenantId];
        let pIdx = 2;

        if (filter.cameraId) {
          conditions.push(`camera_id = $${pIdx++}`);
          values.push(filter.cameraId);
        }
        if (filter.branchId) {
          conditions.push(`branch_id = $${pIdx++}`);
          values.push(filter.branchId);
        }
        if (filter.zoneId) {
          conditions.push(`zone_id = $${pIdx++}`);
          values.push(filter.zoneId);
        }
        if (filter.eventType) {
          conditions.push(`event_type = $${pIdx++}`);
          values.push(filter.eventType);
        }
        if (filter.severity) {
          conditions.push(`severity = $${pIdx++}`);
          values.push(filter.severity);
        }
        if (filter.status) {
          conditions.push(`status = $${pIdx++}`);
          values.push(filter.status);
        }
        if (filter.fromDate) {
          conditions.push(`detected_at >= $${pIdx++}`);
          values.push(filter.fromDate);
        }
        if (filter.toDate) {
          conditions.push(`detected_at <= $${pIdx++}`);
          values.push(filter.toDate);
        }

        const where = conditions.join(' AND ');
        const countRes = await this.pool.query(
          `SELECT COUNT(*)::int AS total FROM abandoned_object_events WHERE ${where}`,
          values
        );
        const total = countRes.rows[0]?.total ?? 0;

        const limit = filter.limit ?? 50;
        const offset = filter.offset ?? 0;
        values.push(limit, offset);

        const dataRes = await this.pool.query(
          `SELECT * FROM abandoned_object_events WHERE ${where} ORDER BY detected_at DESC LIMIT $${pIdx++} OFFSET $${pIdx++}`,
          values
        );

        return {
          events: dataRes.rows.map((r: any) => this.mapEventRow(r)),
          total,
        };
      } catch (err) {
        console.warn('PostgreSQL query error, falling back to memory store:', err);
      }
    }

    let list = Array.from(this.memoryEvents.values()).filter((e) => e.tenant_id === filter.tenantId);

    if (filter.cameraId) list = list.filter((e) => e.camera_id === filter.cameraId);
    if (filter.branchId) list = list.filter((e) => e.branch_id === filter.branchId);
    if (filter.zoneId) list = list.filter((e) => e.zone_id === filter.zoneId);
    if (filter.eventType) list = list.filter((e) => e.event_type === filter.eventType);
    if (filter.severity) list = list.filter((e) => e.severity === filter.severity);
    if (filter.status) list = list.filter((e) => e.status === filter.status);
    if (filter.fromDate) list = list.filter((e) => e.detected_at >= filter.fromDate!);
    if (filter.toDate) list = list.filter((e) => e.detected_at <= filter.toDate!);

    list.sort((a, b) => b.detected_at.getTime() - a.detected_at.getTime());

    const total = list.length;
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    const paged = list.slice(offset, offset + limit);

    return { events: paged, total };
  }

  async updateEventStatus(
    tenantId: string,
    id: string,
    status: AbandonedStatus,
    resolvedBy?: string,
    notes?: string
  ): Promise<AbandonedObjectEventRecord | null> {
    const now = new Date();

    if (this.pool) {
      try {
        const res = await this.pool.query(
          `UPDATE abandoned_object_events
           SET status = $1, resolved_by = $2, notes = COALESCE($3, notes), resolved_at = $4
           WHERE tenant_id = $5 AND id = $6
           RETURNING *;`,
          [status, resolvedBy || null, notes || null, now, tenantId, id]
        );
        if (res.rows.length > 0) {
          return this.mapEventRow(res.rows[0]);
        }
        return null;
      } catch (err) {
        console.warn('PostgreSQL update error, falling back to memory store:', err);
      }
    }

    const event = this.memoryEvents.get(id);
    if (!event || event.tenant_id !== tenantId) return null;

    event.status = status;
    if (resolvedBy) event.resolved_by = resolvedBy;
    if (notes) event.notes = notes;
    event.resolved_at = now;

    return event;
  }

  // ==========================================================================
  // ZONE OPERATIONS
  // ==========================================================================

  async createZone(
    data: Omit<AbandonedObjectZoneRecord, 'id' | 'created_at' | 'updated_at'>
  ): Promise<AbandonedObjectZoneRecord> {
    const id = crypto.randomUUID();
    const now = new Date();

    const record: AbandonedObjectZoneRecord = {
      ...data,
      id,
      created_at: now,
      updated_at: now,
    };

    if (this.pool) {
      try {
        const query = `
          INSERT INTO abandoned_object_zones (
            id, tenant_id, branch_id, camera_id, zone_name,
            zone_type, polygon, sensitivity, unattended_threshold_seconds,
            abandoned_threshold_seconds, min_blob_area_pixels, max_blob_area_pixels,
            enabled, metadata, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12,
            $13, $14, $15, $16
          ) RETURNING *;
        `;
        const values = [
          record.id,
          record.tenant_id,
          record.branch_id || null,
          record.camera_id || null,
          record.zone_name,
          record.zone_type,
          JSON.stringify(record.polygon),
          record.sensitivity,
          record.unattended_threshold_seconds,
          record.abandoned_threshold_seconds,
          record.min_blob_area_pixels,
          record.max_blob_area_pixels,
          record.enabled,
          JSON.stringify(record.metadata || {}),
          record.created_at,
          record.updated_at,
        ];
        const res = await this.pool.query(query, values);
        return this.mapZoneRow(res.rows[0]);
      } catch (err) {
        console.warn('PostgreSQL zone insert error, falling back to memory store:', err);
      }
    }

    this.memoryZones.set(id, record);
    return record;
  }

  async getZoneById(tenantId: string, id: string): Promise<AbandonedObjectZoneRecord | null> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM abandoned_object_zones WHERE tenant_id = $1 AND id = $2;',
          [tenantId, id]
        );
        if (res.rows.length > 0) {
          return this.mapZoneRow(res.rows[0]);
        }
        return null;
      } catch (err) {
        console.warn('PostgreSQL query error, falling back to memory store:', err);
      }
    }

    const zone = this.memoryZones.get(id);
    if (zone && zone.tenant_id === tenantId) return zone;
    return null;
  }

  async listZones(filter: ListAbandonedZonesFilter): Promise<AbandonedObjectZoneRecord[]> {
    if (this.pool) {
      try {
        const conditions: string[] = ['tenant_id = $1'];
        const values: any[] = [filter.tenantId];
        let pIdx = 2;

        if (filter.branchId) {
          conditions.push(`branch_id = $${pIdx++}`);
          values.push(filter.branchId);
        }
        if (filter.cameraId) {
          conditions.push(`camera_id = $${pIdx++}`);
          values.push(filter.cameraId);
        }
        if (filter.zoneType) {
          conditions.push(`zone_type = $${pIdx++}`);
          values.push(filter.zoneType);
        }
        if (filter.enabledOnly) {
          conditions.push('enabled = true');
        }

        const res = await this.pool.query(
          `SELECT * FROM abandoned_object_zones WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC;`,
          values
        );
        return res.rows.map((r: any) => this.mapZoneRow(r));
      } catch (err) {
        console.warn('PostgreSQL list zones error, falling back to memory store:', err);
      }
    }

    let list = Array.from(this.memoryZones.values()).filter((z) => z.tenant_id === filter.tenantId);
    if (filter.branchId) list = list.filter((z) => z.branch_id === filter.branchId);
    if (filter.cameraId) list = list.filter((z) => z.camera_id === filter.cameraId);
    if (filter.zoneType) list = list.filter((z) => z.zone_type === filter.zoneType);
    if (filter.enabledOnly) list = list.filter((z) => z.enabled);

    return list;
  }

  async updateZone(
    tenantId: string,
    id: string,
    data: Partial<Omit<AbandonedObjectZoneRecord, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>>
  ): Promise<AbandonedObjectZoneRecord | null> {
    const now = new Date();

    if (this.pool) {
      try {
        const fields: string[] = ['updated_at = $1'];
        const values: any[] = [now];
        let pIdx = 2;

        if (data.zone_name !== undefined) {
          fields.push(`zone_name = $${pIdx++}`);
          values.push(data.zone_name);
        }
        if (data.zone_type !== undefined) {
          fields.push(`zone_type = $${pIdx++}`);
          values.push(data.zone_type);
        }
        if (data.polygon !== undefined) {
          fields.push(`polygon = $${pIdx++}`);
          values.push(JSON.stringify(data.polygon));
        }
        if (data.sensitivity !== undefined) {
          fields.push(`sensitivity = $${pIdx++}`);
          values.push(data.sensitivity);
        }
        if (data.unattended_threshold_seconds !== undefined) {
          fields.push(`unattended_threshold_seconds = $${pIdx++}`);
          values.push(data.unattended_threshold_seconds);
        }
        if (data.abandoned_threshold_seconds !== undefined) {
          fields.push(`abandoned_threshold_seconds = $${pIdx++}`);
          values.push(data.abandoned_threshold_seconds);
        }
        if (data.min_blob_area_pixels !== undefined) {
          fields.push(`min_blob_area_pixels = $${pIdx++}`);
          values.push(data.min_blob_area_pixels);
        }
        if (data.max_blob_area_pixels !== undefined) {
          fields.push(`max_blob_area_pixels = $${pIdx++}`);
          values.push(data.max_blob_area_pixels);
        }
        if (data.enabled !== undefined) {
          fields.push(`enabled = $${pIdx++}`);
          values.push(data.enabled);
        }

        values.push(tenantId, id);
        const res = await this.pool.query(
          `UPDATE abandoned_object_zones
           SET ${fields.join(', ')}
           WHERE tenant_id = $${pIdx++} AND id = $${pIdx++}
           RETURNING *;`,
          values
        );
        if (res.rows.length > 0) {
          return this.mapZoneRow(res.rows[0]);
        }
        return null;
      } catch (err) {
        console.warn('PostgreSQL update zone error, falling back to memory store:', err);
      }
    }

    const zone = this.memoryZones.get(id);
    if (!zone || zone.tenant_id !== tenantId) return null;

    Object.assign(zone, data, { updated_at: now });
    return zone;
  }

  async deleteZone(tenantId: string, id: string): Promise<boolean> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          'DELETE FROM abandoned_object_zones WHERE tenant_id = $1 AND id = $2;',
          [tenantId, id]
        );
        return (res.rowCount ?? 0) > 0;
      } catch (err) {
        console.warn('PostgreSQL delete zone error, falling back to memory store:', err);
      }
    }

    const zone = this.memoryZones.get(id);
    if (zone && zone.tenant_id === tenantId) {
      this.memoryZones.delete(id);
      return true;
    }
    return false;
  }

  // ==========================================================================
  // CONFIG OPERATIONS
  // ==========================================================================

  async upsertConfig(
    data: Omit<AbandonedObjectConfigRecord, 'id' | 'updated_at'>
  ): Promise<AbandonedObjectConfigRecord> {
    const id = crypto.randomUUID();
    const now = new Date();

    const record: AbandonedObjectConfigRecord = {
      ...data,
      id,
      updated_at: now,
    };

    if (this.pool) {
      try {
        const query = `
          INSERT INTO abandoned_object_configs (
            id, tenant_id, camera_id, stationary_pixel_threshold,
            default_unattended_threshold_sec, default_abandoned_threshold_sec,
            owner_proximity_threshold_px, debounce_frames,
            alert_on_sterile_zone_entry, alert_on_exit_corridor_obstruction,
            thermal_verification_enabled, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
          ) ON CONFLICT (camera_id) DO UPDATE SET
            stationary_pixel_threshold = EXCLUDED.stationary_pixel_threshold,
            default_unattended_threshold_sec = EXCLUDED.default_unattended_threshold_sec,
            default_abandoned_threshold_sec = EXCLUDED.default_abandoned_threshold_sec,
            owner_proximity_threshold_px = EXCLUDED.owner_proximity_threshold_px,
            debounce_frames = EXCLUDED.debounce_frames,
            alert_on_sterile_zone_entry = EXCLUDED.alert_on_sterile_zone_entry,
            alert_on_exit_corridor_obstruction = EXCLUDED.alert_on_exit_corridor_obstruction,
            thermal_verification_enabled = EXCLUDED.thermal_verification_enabled,
            updated_at = EXCLUDED.updated_at
          RETURNING *;
        `;
        const values = [
          record.id,
          record.tenant_id,
          record.camera_id,
          record.stationary_pixel_threshold,
          record.default_unattended_threshold_sec,
          record.default_abandoned_threshold_sec,
          record.owner_proximity_threshold_px,
          record.debounce_frames,
          record.alert_on_sterile_zone_entry,
          record.alert_on_exit_corridor_obstruction,
          record.thermal_verification_enabled,
          record.updated_at,
        ];
        const res = await this.pool.query(query, values);
        return this.mapConfigRow(res.rows[0]);
      } catch (err) {
        console.warn('PostgreSQL config upsert error, falling back to memory store:', err);
      }
    }

    this.memoryConfigs.set(data.camera_id, record);
    return record;
  }

  async getConfig(tenantId: string, cameraId: string): Promise<AbandonedObjectConfigRecord> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM abandoned_object_configs WHERE tenant_id = $1 AND camera_id = $2;',
          [tenantId, cameraId]
        );
        if (res.rows.length > 0) {
          return this.mapConfigRow(res.rows[0]);
        }
      } catch (err) {
        console.warn('PostgreSQL config query error, falling back to memory store:', err);
      }
    }

    const cfg = this.memoryConfigs.get(cameraId);
    if (cfg && cfg.tenant_id === tenantId) return cfg;

    // Default configuration
    return {
      id: `cfg-${cameraId}`,
      tenant_id: tenantId,
      camera_id: cameraId,
      stationary_pixel_threshold: 12.0,
      default_unattended_threshold_sec: 60,
      default_abandoned_threshold_sec: 180,
      owner_proximity_threshold_px: 120.0,
      debounce_frames: 3,
      alert_on_sterile_zone_entry: true,
      alert_on_exit_corridor_obstruction: true,
      thermal_verification_enabled: false,
      updated_at: new Date(),
    };
  }

  // ==========================================================================
  // OPERATIONAL STATISTICS
  // ==========================================================================

  async getStats(tenantId: string, cameraId?: string): Promise<AbandonedStats> {
    if (this.pool) {
      try {
        const query = `
          SELECT
            COUNT(*) FILTER (WHERE status IN ('detected', 'investigating'))::int AS total_active,
            COUNT(*) FILTER (WHERE severity = 'P1' AND status IN ('detected', 'investigating'))::int AS p1_count,
            COUNT(*) FILTER (WHERE severity = 'P2' AND status IN ('detected', 'investigating'))::int AS p2_count,
            COALESCE(AVG(dwell_time_seconds) FILTER (WHERE status IN ('detected', 'investigating')), 0)::int AS avg_dwell,
            COUNT(*) FILTER (WHERE status = 'cleared')::int AS cleared_count,
            COUNT(*) FILTER (WHERE status = 'escalated')::int AS escalated_count,
            MAX(detected_at) AS last_event_at
          FROM abandoned_object_events
          WHERE tenant_id = $1 ${cameraId ? 'AND camera_id = $2' : ''};
        `;
        const values = cameraId ? [tenantId, cameraId] : [tenantId];
        const res = await this.pool.query(query, values);
        const row = res.rows[0];

        const zoneCountRes = await this.pool.query(
          `SELECT COUNT(*)::int AS cnt FROM abandoned_object_zones WHERE tenant_id = $1 ${cameraId ? 'AND camera_id = $2' : ''} AND enabled = true;`,
          values
        );

        return {
          totalActive: row?.total_active ?? 0,
          criticalP1Count: row?.p1_count ?? 0,
          highP2Count: row?.p2_count ?? 0,
          avgDwellTimeSeconds: row?.avg_dwell ?? 0,
          totalCleared: row?.cleared_count ?? 0,
          totalEscalated: row?.escalated_count ?? 0,
          zonesMonitored: zoneCountRes.rows[0]?.cnt ?? 0,
          lastEventAt: row?.last_event_at ? new Date(row.last_event_at).toISOString() : null,
        };
      } catch (err) {
        console.warn('PostgreSQL stats error, falling back to memory store:', err);
      }
    }

    let events = Array.from(this.memoryEvents.values()).filter((e) => e.tenant_id === tenantId);
    if (cameraId) events = events.filter((e) => e.camera_id === cameraId);

    const active = events.filter((e) => e.status === 'detected' || e.status === 'investigating');
    const p1Count = active.filter((e) => e.severity === 'P1').length;
    const p2Count = active.filter((e) => e.severity === 'P2').length;
    const avgDwell = active.length > 0 ? Math.round(active.reduce((acc, e) => acc + e.dwell_time_seconds, 0) / active.length) : 0;
    const cleared = events.filter((e) => e.status === 'cleared').length;
    const escalated = events.filter((e) => e.status === 'escalated').length;

    let zones = Array.from(this.memoryZones.values()).filter((z) => z.tenant_id === tenantId && z.enabled);
    if (cameraId) zones = zones.filter((z) => z.camera_id === cameraId);

    const lastEvent = events.sort((a, b) => b.detected_at.getTime() - a.detected_at.getTime())[0];

    return {
      totalActive: active.length,
      criticalP1Count: p1Count,
      highP2Count: p2Count,
      avgDwellTimeSeconds: avgDwell,
      totalCleared: cleared,
      totalEscalated: escalated,
      zonesMonitored: zones.length,
      lastEventAt: lastEvent ? lastEvent.detected_at.toISOString() : null,
    };
  }

  // ==========================================================================
  // ROW MAPPERS
  // ==========================================================================

  private mapEventRow(row: any): AbandonedObjectEventRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      camera_id: row.camera_id,
      zone_id: row.zone_id,
      branch_id: row.branch_id,
      event_type: row.event_type,
      object_type: row.object_type,
      severity: row.severity,
      confidence: Number(row.confidence),
      bounding_box: typeof row.bounding_box === 'string' ? JSON.parse(row.bounding_box) : row.bounding_box,
      dwell_time_seconds: Number(row.dwell_time_seconds),
      owner_track_id: row.owner_track_id,
      owner_distance_pixels: row.owner_distance_pixels ? Number(row.owner_distance_pixels) : null,
      status: row.status,
      snapshot_url: row.snapshot_url,
      thermal_score: row.thermal_score ? Number(row.thermal_score) : null,
      notes: row.notes,
      resolved_by: row.resolved_by,
      resolved_at: row.resolved_at ? new Date(row.resolved_at) : null,
      first_seen_at: new Date(row.first_seen_at),
      detected_at: new Date(row.detected_at),
      created_at: new Date(row.created_at),
    };
  }

  private mapZoneRow(row: any): AbandonedObjectZoneRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      branch_id: row.branch_id,
      camera_id: row.camera_id,
      zone_name: row.zone_name,
      zone_type: row.zone_type,
      polygon: typeof row.polygon === 'string' ? JSON.parse(row.polygon) : row.polygon,
      sensitivity: row.sensitivity,
      unattended_threshold_seconds: Number(row.unattended_threshold_seconds),
      abandoned_threshold_seconds: Number(row.abandoned_threshold_seconds),
      min_blob_area_pixels: Number(row.min_blob_area_pixels),
      max_blob_area_pixels: Number(row.max_blob_area_pixels),
      enabled: Boolean(row.enabled),
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  private mapConfigRow(row: any): AbandonedObjectConfigRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      camera_id: row.camera_id,
      stationary_pixel_threshold: Number(row.stationary_pixel_threshold),
      default_unattended_threshold_sec: Number(row.default_unattended_threshold_sec),
      default_abandoned_threshold_sec: Number(row.default_abandoned_threshold_sec),
      owner_proximity_threshold_px: Number(row.owner_proximity_threshold_px),
      debounce_frames: Number(row.debounce_frames),
      alert_on_sterile_zone_entry: Boolean(row.alert_on_sterile_zone_entry),
      alert_on_exit_corridor_obstruction: Boolean(row.alert_on_exit_corridor_obstruction),
      thermal_verification_enabled: Boolean(row.thermal_verification_enabled),
      updated_at: new Date(row.updated_at),
    };
  }
}
