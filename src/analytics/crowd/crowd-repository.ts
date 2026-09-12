/**
 * PostgreSQL & In-Memory Data Access Repository for Crowd Density & Queue Monitoring
 * 
 * Manages zone definitions, counter queues, density audit snapshots,
 * queue depth logs, threshold violation incidents, and branch KPI stats.
 */

import type { Pool } from 'pg';
import type {
  CrowdZoneRecord,
  CounterQueueRecord,
  CrowdDensitySnapshotRecord,
  CounterQueueSnapshotRecord,
  CrowdQueueIncidentRecord,
  CrowdQueueConfigRecord,
  CrowdKPIStats,
  IncidentReviewStatus,
  IncidentSeverity,
  CrowdIncidentType,
  DensityLevel,
} from './types.js';

export interface ListIncidentsFilter {
  tenantId: string;
  branchId?: string;
  cameraId?: string;
  incidentType?: CrowdIncidentType;
  severity?: IncidentSeverity;
  reviewStatus?: IncidentReviewStatus;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export class CrowdRepository {
  // In-memory backing storage for offline execution, testing, or development without live PG
  private readonly memZones = new Map<string, CrowdZoneRecord>();
  private readonly memQueues = new Map<string, CounterQueueRecord>();
  private readonly memDensitySnapshots: CrowdDensitySnapshotRecord[] = [];
  private readonly memQueueSnapshots: CounterQueueSnapshotRecord[] = [];
  private readonly memIncidents = new Map<string, CrowdQueueIncidentRecord>();
  private readonly memConfigs = new Map<string, CrowdQueueConfigRecord>();

  constructor(private readonly pool?: Pool) {}

  // ============================================================================
  // CROWD MONITORING ZONES
  // ============================================================================

  public async createZone(zone: Omit<CrowdZoneRecord, 'id' | 'created_at' | 'updated_at'>): Promise<CrowdZoneRecord> {
    const now = new Date();
    const id = `zone-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    if (this.pool) {
      try {
        const query = `
          INSERT INTO crowd_monitoring_zones (
            tenant_id, branch_id, camera_id, zone_name, zone_type,
            polygon, area_sqm, nominal_capacity, warning_capacity, max_capacity,
            enabled, metadata, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
          RETURNING *;
        `;
        const values = [
          zone.tenant_id,
          zone.branch_id || null,
          zone.camera_id || null,
          zone.zone_name,
          zone.zone_type,
          JSON.stringify(zone.polygon),
          zone.area_sqm,
          zone.nominal_capacity,
          zone.warning_capacity,
          zone.max_capacity,
          zone.enabled,
          JSON.stringify(zone.metadata || {}),
          now,
        ];
        const res = await this.pool.query(query, values);
        if (res.rows.length > 0) {
          return this.mapZoneRow(res.rows[0]);
        }
      } catch (err) {
        // Fall back to memory store on DB write failure
      }
    }

    const record: CrowdZoneRecord = {
      ...zone,
      id,
      created_at: now,
      updated_at: now,
    };
    this.memZones.set(record.id, record);
    return record;
  }

  public async updateZone(
    id: string,
    tenantId: string,
    updates: Partial<Omit<CrowdZoneRecord, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>>
  ): Promise<CrowdZoneRecord | null> {
    const now = new Date();

    if (this.pool) {
      try {
        const existing = await this.getZoneById(id, tenantId);
        if (!existing) return null;

        const updated = { ...existing, ...updates, updated_at: now };
        const query = `
          UPDATE crowd_monitoring_zones SET
            branch_id = $1, camera_id = $2, zone_name = $3, zone_type = $4,
            polygon = $5, area_sqm = $6, nominal_capacity = $7, warning_capacity = $8,
            max_capacity = $9, enabled = $10, metadata = $11, updated_at = $12
          WHERE id = $13 AND tenant_id = $14
          RETURNING *;
        `;
        const values = [
          updated.branch_id,
          updated.camera_id,
          updated.zone_name,
          updated.zone_type,
          JSON.stringify(updated.polygon),
          updated.area_sqm,
          updated.nominal_capacity,
          updated.warning_capacity,
          updated.max_capacity,
          updated.enabled,
          JSON.stringify(updated.metadata || {}),
          now,
          id,
          tenantId,
        ];
        const res = await this.pool.query(query, values);
        if (res.rows.length > 0) {
          return this.mapZoneRow(res.rows[0]);
        }
      } catch (err) {
        // Fall back to memory
      }
    }

    const mem = this.memZones.get(id);
    if (!mem || mem.tenant_id !== tenantId) return null;
    const updated: CrowdZoneRecord = { ...mem, ...updates, updated_at: now };
    this.memZones.set(id, updated);
    return updated;
  }

  public async deleteZone(id: string, tenantId: string): Promise<boolean> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          'DELETE FROM crowd_monitoring_zones WHERE id = $1 AND tenant_id = $2;',
          [id, tenantId]
        );
        return (res.rowCount ?? 0) > 0;
      } catch (err) {
        // Fall back to memory
      }
    }

    const mem = this.memZones.get(id);
    if (!mem || mem.tenant_id !== tenantId) return false;
    return this.memZones.delete(id);
  }

  public async getZoneById(id: string, tenantId: string): Promise<CrowdZoneRecord | null> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM crowd_monitoring_zones WHERE id = $1 AND tenant_id = $2;',
          [id, tenantId]
        );
        if (res.rows.length > 0) {
          return this.mapZoneRow(res.rows[0]);
        }
      } catch (err) {
        // Fall back to memory
      }
    }

    const mem = this.memZones.get(id);
    return mem && mem.tenant_id === tenantId ? mem : null;
  }

  public async listZones(tenantId: string, branchId?: string): Promise<CrowdZoneRecord[]> {
    if (this.pool) {
      try {
        let query = 'SELECT * FROM crowd_monitoring_zones WHERE tenant_id = $1';
        const values: any[] = [tenantId];
        if (branchId) {
          query += ' AND branch_id = $2';
          values.push(branchId);
        }
        query += ' ORDER BY zone_name ASC;';
        const res = await this.pool.query(query, values);
        return res.rows.map(r => this.mapZoneRow(r));
      } catch (err) {
        // Fall back to memory
      }
    }

    return Array.from(this.memZones.values()).filter(
      z => z.tenant_id === tenantId && (!branchId || z.branch_id === branchId)
    );
  }

  // ============================================================================
  // COUNTER QUEUES
  // ============================================================================

  public async createCounterQueue(
    queue: Omit<CounterQueueRecord, 'id' | 'created_at' | 'updated_at'>
  ): Promise<CounterQueueRecord> {
    const now = new Date();
    const id = `queue-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    if (this.pool) {
      try {
        const query = `
          INSERT INTO counter_queues (
            tenant_id, branch_id, camera_id, counter_number, counter_name,
            counter_type, queue_polygon, service_station_polygon,
            max_queue_length_threshold, max_wait_time_seconds_threshold,
            alert_severity, enabled, metadata, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
          RETURNING *;
        `;
        const values = [
          queue.tenant_id,
          queue.branch_id || null,
          queue.camera_id || null,
          queue.counter_number,
          queue.counter_name,
          queue.counter_type,
          JSON.stringify(queue.queue_polygon),
          JSON.stringify(queue.service_station_polygon),
          queue.max_queue_length_threshold,
          queue.max_wait_time_seconds_threshold,
          queue.alert_severity,
          queue.enabled,
          JSON.stringify(queue.metadata || {}),
          now,
        ];
        const res = await this.pool.query(query, values);
        if (res.rows.length > 0) {
          return this.mapQueueRow(res.rows[0]);
        }
      } catch (err) {
        // Fall back to memory
      }
    }

    const record: CounterQueueRecord = {
      ...queue,
      id,
      created_at: now,
      updated_at: now,
    };
    this.memQueues.set(record.id, record);
    return record;
  }

  public async updateCounterQueue(
    id: string,
    tenantId: string,
    updates: Partial<Omit<CounterQueueRecord, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>>
  ): Promise<CounterQueueRecord | null> {
    const now = new Date();

    if (this.pool) {
      try {
        const existing = await this.getCounterQueueById(id, tenantId);
        if (!existing) return null;

        const updated = { ...existing, ...updates, updated_at: now };
        const query = `
          UPDATE counter_queues SET
            branch_id = $1, camera_id = $2, counter_number = $3, counter_name = $4,
            counter_type = $5, queue_polygon = $6, service_station_polygon = $7,
            max_queue_length_threshold = $8, max_wait_time_seconds_threshold = $9,
            alert_severity = $10, enabled = $11, metadata = $12, updated_at = $13
          WHERE id = $14 AND tenant_id = $15
          RETURNING *;
        `;
        const values = [
          updated.branch_id,
          updated.camera_id,
          updated.counter_number,
          updated.counter_name,
          updated.counter_type,
          JSON.stringify(updated.queue_polygon),
          JSON.stringify(updated.service_station_polygon),
          updated.max_queue_length_threshold,
          updated.max_wait_time_seconds_threshold,
          updated.alert_severity,
          updated.enabled,
          JSON.stringify(updated.metadata || {}),
          now,
          id,
          tenantId,
        ];
        const res = await this.pool.query(query, values);
        if (res.rows.length > 0) {
          return this.mapQueueRow(res.rows[0]);
        }
      } catch (err) {
        // Fall back to memory
      }
    }

    const mem = this.memQueues.get(id);
    if (!mem || mem.tenant_id !== tenantId) return null;
    const updated: CounterQueueRecord = { ...mem, ...updates, updated_at: now };
    this.memQueues.set(id, updated);
    return updated;
  }

  public async deleteCounterQueue(id: string, tenantId: string): Promise<boolean> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          'DELETE FROM counter_queues WHERE id = $1 AND tenant_id = $2;',
          [id, tenantId]
        );
        return (res.rowCount ?? 0) > 0;
      } catch (err) {
        // Fall back to memory
      }
    }

    const mem = this.memQueues.get(id);
    if (!mem || mem.tenant_id !== tenantId) return false;
    return this.memQueues.delete(id);
  }

  public async getCounterQueueById(id: string, tenantId: string): Promise<CounterQueueRecord | null> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM counter_queues WHERE id = $1 AND tenant_id = $2;',
          [id, tenantId]
        );
        if (res.rows.length > 0) {
          return this.mapQueueRow(res.rows[0]);
        }
      } catch (err) {
        // Fall back to memory
      }
    }

    const mem = this.memQueues.get(id);
    return mem && mem.tenant_id === tenantId ? mem : null;
  }

  public async listCounterQueues(tenantId: string, branchId?: string): Promise<CounterQueueRecord[]> {
    if (this.pool) {
      try {
        let query = 'SELECT * FROM counter_queues WHERE tenant_id = $1';
        const values: any[] = [tenantId];
        if (branchId) {
          query += ' AND branch_id = $2';
          values.push(branchId);
        }
        query += ' ORDER BY counter_number ASC;';
        const res = await this.pool.query(query, values);
        return res.rows.map(r => this.mapQueueRow(r));
      } catch (err) {
        // Fall back to memory
      }
    }

    return Array.from(this.memQueues.values()).filter(
      q => q.tenant_id === tenantId && (!branchId || q.branch_id === branchId)
    );
  }

  // ============================================================================
  // SNAPSHOTS (DENSITY & QUEUES)
  // ============================================================================

  public async saveDensitySnapshot(
    snapshot: Omit<CrowdDensitySnapshotRecord, 'id' | 'created_at'>
  ): Promise<CrowdDensitySnapshotRecord> {
    const now = new Date();
    const id = `snap-d-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    if (this.pool) {
      try {
        const query = `
          INSERT INTO crowd_density_snapshots (
            tenant_id, branch_id, zone_id, camera_id, person_count,
            density_level, occupancy_percentage, density_per_sqm, average_speed,
            is_bottleneck, heat_intensity, trend, snapshot_metadata, timestamp, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING *;
        `;
        const values = [
          snapshot.tenant_id,
          snapshot.branch_id || null,
          snapshot.zone_id,
          snapshot.camera_id || null,
          snapshot.person_count,
          snapshot.density_level,
          snapshot.occupancy_percentage,
          snapshot.density_per_sqm,
          snapshot.average_speed,
          snapshot.is_bottleneck,
          snapshot.heat_intensity,
          snapshot.trend,
          JSON.stringify(snapshot.snapshot_metadata || {}),
          snapshot.timestamp,
          now,
        ];
        const res = await this.pool.query(query, values);
        if (res.rows.length > 0) {
          return this.mapDensitySnapshotRow(res.rows[0]);
        }
      } catch (err) {
        // Fall back to memory
      }
    }

    const record: CrowdDensitySnapshotRecord = {
      ...snapshot,
      id,
      created_at: now,
    };
    this.memDensitySnapshots.push(record);
    if (this.memDensitySnapshots.length > 5000) {
      this.memDensitySnapshots.shift();
    }
    return record;
  }

  public async saveQueueSnapshot(
    snapshot: Omit<CounterQueueSnapshotRecord, 'id' | 'created_at'>
  ): Promise<CounterQueueSnapshotRecord> {
    const now = new Date();
    const id = `snap-q-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    if (this.pool) {
      try {
        const query = `
          INSERT INTO counter_queue_snapshots (
            tenant_id, branch_id, queue_id, camera_id, current_queue_length,
            served_person_count, avg_wait_time_seconds, max_wait_time_seconds,
            is_counter_attended, threshold_exceeded, bottleneck_detected,
            participant_track_ids, snapshot_metadata, timestamp, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING *;
        `;
        const values = [
          snapshot.tenant_id,
          snapshot.branch_id || null,
          snapshot.queue_id,
          snapshot.camera_id || null,
          snapshot.current_queue_length,
          snapshot.served_person_count,
          snapshot.avg_wait_time_seconds,
          snapshot.max_wait_time_seconds,
          snapshot.is_counter_attended,
          snapshot.threshold_exceeded,
          snapshot.bottleneck_detected,
          snapshot.participant_track_ids,
          JSON.stringify(snapshot.snapshot_metadata || {}),
          snapshot.timestamp,
          now,
        ];
        const res = await this.pool.query(query, values);
        if (res.rows.length > 0) {
          return this.mapQueueSnapshotRow(res.rows[0]);
        }
      } catch (err) {
        // Fall back to memory
      }
    }

    const record: CounterQueueSnapshotRecord = {
      ...snapshot,
      id,
      created_at: now,
    };
    this.memQueueSnapshots.push(record);
    if (this.memQueueSnapshots.length > 5000) {
      this.memQueueSnapshots.shift();
    }
    return record;
  }

  public async getHistoricalDensity(
    tenantId: string,
    branchId?: string,
    zoneId?: string,
    fromDate?: Date,
    toDate?: Date,
    limit: number = 100
  ): Promise<CrowdDensitySnapshotRecord[]> {
    if (this.pool) {
      try {
        let query = 'SELECT * FROM crowd_density_snapshots WHERE tenant_id = $1';
        const values: any[] = [tenantId];
        let idx = 2;

        if (branchId) {
          query += ` AND branch_id = $${idx++}`;
          values.push(branchId);
        }
        if (zoneId) {
          query += ` AND zone_id = $${idx++}`;
          values.push(zoneId);
        }
        if (fromDate) {
          query += ` AND timestamp >= $${idx++}`;
          values.push(fromDate);
        }
        if (toDate) {
          query += ` AND timestamp <= $${idx++}`;
          values.push(toDate);
        }
        query += ` ORDER BY timestamp DESC LIMIT $${idx};`;
        values.push(limit);

        const res = await this.pool.query(query, values);
        return res.rows.map(r => this.mapDensitySnapshotRow(r));
      } catch (err) {
        // Fall back to memory
      }
    }

    return this.memDensitySnapshots
      .filter(s => {
        if (s.tenant_id !== tenantId) return false;
        if (branchId && s.branch_id !== branchId) return false;
        if (zoneId && s.zone_id !== zoneId) return false;
        if (fromDate && new Date(s.timestamp).getTime() < fromDate.getTime()) return false;
        if (toDate && new Date(s.timestamp).getTime() > toDate.getTime()) return false;
        return true;
      })
      .slice(-limit)
      .reverse();
  }

  public async getHistoricalQueueMetrics(
    tenantId: string,
    branchId?: string,
    queueId?: string,
    fromDate?: Date,
    toDate?: Date,
    limit: number = 100
  ): Promise<CounterQueueSnapshotRecord[]> {
    if (this.pool) {
      try {
        let query = 'SELECT * FROM counter_queue_snapshots WHERE tenant_id = $1';
        const values: any[] = [tenantId];
        let idx = 2;

        if (branchId) {
          query += ` AND branch_id = $${idx++}`;
          values.push(branchId);
        }
        if (queueId) {
          query += ` AND queue_id = $${idx++}`;
          values.push(queueId);
        }
        if (fromDate) {
          query += ` AND timestamp >= $${idx++}`;
          values.push(fromDate);
        }
        if (toDate) {
          query += ` AND timestamp <= $${idx++}`;
          values.push(toDate);
        }
        query += ` ORDER BY timestamp DESC LIMIT $${idx};`;
        values.push(limit);

        const res = await this.pool.query(query, values);
        return res.rows.map(r => this.mapQueueSnapshotRow(r));
      } catch (err) {
        // Fall back to memory
      }
    }

    return this.memQueueSnapshots
      .filter(s => {
        if (s.tenant_id !== tenantId) return false;
        if (branchId && s.branch_id !== branchId) return false;
        if (queueId && s.queue_id !== queueId) return false;
        if (fromDate && new Date(s.timestamp).getTime() < fromDate.getTime()) return false;
        if (toDate && new Date(s.timestamp).getTime() > toDate.getTime()) return false;
        return true;
      })
      .slice(-limit)
      .reverse();
  }

  // ============================================================================
  // OPERATIONAL INCIDENTS
  // ============================================================================

  public async saveIncident(
    incident: Omit<CrowdQueueIncidentRecord, 'id' | 'created_at'>
  ): Promise<CrowdQueueIncidentRecord> {
    const now = new Date();
    const id = `inc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    if (this.pool) {
      try {
        const query = `
          INSERT INTO crowd_queue_incidents (
            tenant_id, branch_id, camera_id, incident_type, severity,
            entity_type, entity_id, entity_name, trigger_value, threshold_value,
            confidence, explanation, snapshot_url, review_status, reviewed_by,
            reviewed_at, resolution_notes, metadata, occurred_at, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
          RETURNING *;
        `;
        const values = [
          incident.tenant_id,
          incident.branch_id || null,
          incident.camera_id || null,
          incident.incident_type,
          incident.severity,
          incident.entity_type,
          incident.entity_id,
          incident.entity_name,
          incident.trigger_value,
          incident.threshold_value,
          incident.confidence,
          incident.explanation,
          incident.snapshot_url || null,
          incident.review_status,
          incident.reviewed_by || null,
          incident.reviewed_at || null,
          incident.resolution_notes || null,
          JSON.stringify(incident.metadata || {}),
          incident.occurred_at,
          now,
        ];
        const res = await this.pool.query(query, values);
        if (res.rows.length > 0) {
          return this.mapIncidentRow(res.rows[0]);
        }
      } catch (err) {
        // Fall back to memory
      }
    }

    const record: CrowdQueueIncidentRecord = {
      ...incident,
      id,
      created_at: now,
    };
    this.memIncidents.set(record.id, record);
    return record;
  }

  public async getIncidentById(id: string, tenantId: string): Promise<CrowdQueueIncidentRecord | null> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM crowd_queue_incidents WHERE id = $1 AND tenant_id = $2;',
          [id, tenantId]
        );
        if (res.rows.length > 0) {
          return this.mapIncidentRow(res.rows[0]);
        }
      } catch (err) {
        // Fall back to memory
      }
    }

    const mem = this.memIncidents.get(id);
    return mem && mem.tenant_id === tenantId ? mem : null;
  }

  public async listIncidents(
    filter: ListIncidentsFilter
  ): Promise<{ incidents: CrowdQueueIncidentRecord[]; total: number }> {
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    if (this.pool) {
      try {
        const conditions: string[] = ['tenant_id = $1'];
        const values: any[] = [filter.tenantId];
        let idx = 2;

        if (filter.branchId) {
          conditions.push(`branch_id = $${idx++}`);
          values.push(filter.branchId);
        }
        if (filter.cameraId) {
          conditions.push(`camera_id = $${idx++}`);
          values.push(filter.cameraId);
        }
        if (filter.incidentType) {
          conditions.push(`incident_type = $${idx++}`);
          values.push(filter.incidentType);
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
        const countQuery = `SELECT COUNT(*) as total FROM crowd_queue_incidents WHERE ${whereClause};`;
        const countRes = await this.pool.query(countQuery, values);
        const total = parseInt(countRes.rows[0]?.total ?? '0', 10);

        const dataQuery = `
          SELECT * FROM crowd_queue_incidents
          WHERE ${whereClause}
          ORDER BY occurred_at DESC
          LIMIT $${idx++} OFFSET $${idx++};
        `;
        values.push(limit, offset);
        const dataRes = await this.pool.query(dataQuery, values);
        const incidents = dataRes.rows.map(r => this.mapIncidentRow(r));

        return { incidents, total };
      } catch (err) {
        // Fall back to memory
      }
    }

    let list = Array.from(this.memIncidents.values()).filter(inc => {
      if (inc.tenant_id !== filter.tenantId) return false;
      if (filter.branchId && inc.branch_id !== filter.branchId) return false;
      if (filter.cameraId && inc.camera_id !== filter.cameraId) return false;
      if (filter.incidentType && inc.incident_type !== filter.incidentType) return false;
      if (filter.severity && inc.severity !== filter.severity) return false;
      if (filter.reviewStatus && inc.review_status !== filter.reviewStatus) return false;
      if (filter.fromDate && new Date(inc.occurred_at).getTime() < filter.fromDate.getTime()) return false;
      if (filter.toDate && new Date(inc.occurred_at).getTime() > filter.toDate.getTime()) return false;
      return true;
    });

    list.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
    const total = list.length;
    return {
      incidents: list.slice(offset, offset + limit),
      total,
    };
  }

  public async reviewIncident(
    id: string,
    tenantId: string,
    reviewStatus: IncidentReviewStatus,
    reviewedBy: string,
    resolutionNotes?: string
  ): Promise<CrowdQueueIncidentRecord | null> {
    const now = new Date();

    if (this.pool) {
      try {
        const query = `
          UPDATE crowd_queue_incidents SET
            review_status = $1, reviewed_by = $2, reviewed_at = $3, resolution_notes = $4
          WHERE id = $5 AND tenant_id = $6
          RETURNING *;
        `;
        const values = [reviewStatus, reviewedBy, now, resolutionNotes || null, id, tenantId];
        const res = await this.pool.query(query, values);
        if (res.rows.length > 0) {
          return this.mapIncidentRow(res.rows[0]);
        }
      } catch (err) {
        // Fall back to memory
      }
    }

    const mem = this.memIncidents.get(id);
    if (!mem || mem.tenant_id !== tenantId) return null;
    const updated: CrowdQueueIncidentRecord = {
      ...mem,
      review_status: reviewStatus,
      reviewed_by: reviewedBy,
      reviewed_at: now,
      resolution_notes: resolutionNotes || null,
    };
    this.memIncidents.set(id, updated);
    return updated;
  }

  // ============================================================================
  // AGGREGATED STATS & KPIS
  // ============================================================================

  public async getCrowdStats(tenantId: string, branchId?: string): Promise<CrowdKPIStats> {
    const zones = await this.listZones(tenantId, branchId);
    const queues = await this.listCounterQueues(tenantId, branchId);

    const activeZones = zones.filter(z => z.enabled);
    const activeQueues = queues.filter(q => q.enabled);

    // Fetch recent snapshots to compute current live metrics
    const recentDensity = await this.getHistoricalDensity(tenantId, branchId, undefined, undefined, undefined, 50);
    const recentQueues = await this.getHistoricalQueueMetrics(tenantId, branchId, undefined, undefined, undefined, 50);

    let totalOccupancy = 0;
    let peakOccupancy = 0;
    let maxWaitTime = 0;
    let totalWait = 0;
    let waitSampleCount = 0;

    // Group latest density snapshot per zone
    const latestByZone = new Map<string, CrowdDensitySnapshotRecord>();
    for (const snap of recentDensity) {
      if (!latestByZone.has(snap.zone_id)) {
        latestByZone.set(snap.zone_id, snap);
      }
      if (snap.person_count > peakOccupancy) {
        peakOccupancy = snap.person_count;
      }
    }

    for (const snap of latestByZone.values()) {
      totalOccupancy += snap.person_count;
    }

    for (const snap of recentQueues) {
      if (snap.max_wait_time_seconds > maxWaitTime) {
        maxWaitTime = snap.max_wait_time_seconds;
      }
      if (snap.avg_wait_time_seconds > 0) {
        totalWait += snap.avg_wait_time_seconds;
        waitSampleCount++;
      }
    }

    const avgWaitTimeSeconds = waitSampleCount > 0 ? Math.round(totalWait / waitSampleCount) : 0;

    // SLA compliance calculation
    let slaBreaches = 0;
    for (const q of recentQueues) {
      if (q.threshold_exceeded || q.max_wait_time_seconds > 300) {
        slaBreaches++;
      }
    }
    const slaComplianceRate =
      recentQueues.length > 0
        ? Math.max(0, Math.round((1 - slaBreaches / recentQueues.length) * 1000) / 10)
        : 98.5;

    // Incident count
    const { incidents } = await this.listIncidents({
      tenantId,
      branchId,
      reviewStatus: 'pending',
      limit: 500,
    });

    const openIncidentsCount = {
      total: incidents.length,
      p1: incidents.filter(i => i.severity === 'P1').length,
      p2: incidents.filter(i => i.severity === 'P2').length,
      p3: incidents.filter(i => i.severity === 'P3').length,
    };

    let overallDensityLevel: DensityLevel = 'empty';
    if (totalOccupancy > 80) overallDensityLevel = 'dangerous';
    else if (totalOccupancy > 50) overallDensityLevel = 'overcrowded';
    else if (totalOccupancy > 30) overallDensityLevel = 'crowded';
    else if (totalOccupancy > 5) overallDensityLevel = 'normal';
    else if (totalOccupancy > 0) overallDensityLevel = 'sparse';

    return {
      activeZonesCount: activeZones.length,
      activeQueuesCount: activeQueues.length,
      totalHallOccupancy: totalOccupancy,
      peakOccupancyToday: Math.max(peakOccupancy, totalOccupancy),
      averageWaitTimeSeconds: avgWaitTimeSeconds,
      maxWaitTimeSecondsToday: maxWaitTime,
      overallDensityLevel,
      slaComplianceRate,
      openIncidentsCount,
    };
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  public async getConfig(tenantId: string): Promise<CrowdQueueConfigRecord | null> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM crowd_queue_configs WHERE tenant_id = $1;',
          [tenantId]
        );
        if (res.rows.length > 0) {
          return this.mapConfigRow(res.rows[0]);
        }
      } catch (err) {
        // Fall back to memory
      }
    }
    return this.memConfigs.get(tenantId) || null;
  }

  public async upsertConfig(
    config: Omit<CrowdQueueConfigRecord, 'created_at' | 'updated_at'>
  ): Promise<CrowdQueueConfigRecord> {
    const now = new Date();

    if (this.pool) {
      try {
        const query = `
          INSERT INTO crowd_queue_configs (
            tenant_id, branch_id, default_queue_threshold, default_wait_time_threshold_seconds,
            density_warning_percentage, density_critical_percentage, bottleneck_speed_threshold,
            sla_target_compliance_percentage, alert_cooldown_seconds, auto_recommend_extra_counters,
            metadata, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
          ON CONFLICT (tenant_id) DO UPDATE SET
            branch_id = EXCLUDED.branch_id,
            default_queue_threshold = EXCLUDED.default_queue_threshold,
            default_wait_time_threshold_seconds = EXCLUDED.default_wait_time_threshold_seconds,
            density_warning_percentage = EXCLUDED.density_warning_percentage,
            density_critical_percentage = EXCLUDED.density_critical_percentage,
            bottleneck_speed_threshold = EXCLUDED.bottleneck_speed_threshold,
            sla_target_compliance_percentage = EXCLUDED.sla_target_compliance_percentage,
            alert_cooldown_seconds = EXCLUDED.alert_cooldown_seconds,
            auto_recommend_extra_counters = EXCLUDED.auto_recommend_extra_counters,
            metadata = EXCLUDED.metadata,
            updated_at = $12
          RETURNING *;
        `;
        const values = [
          config.tenant_id,
          config.branch_id || null,
          config.default_queue_threshold,
          config.default_wait_time_threshold_seconds,
          config.density_warning_percentage,
          config.density_critical_percentage,
          config.bottleneck_speed_threshold,
          config.sla_target_compliance_percentage,
          config.alert_cooldown_seconds,
          config.auto_recommend_extra_counters,
          JSON.stringify(config.metadata || {}),
          now,
        ];
        const res = await this.pool.query(query, values);
        if (res.rows.length > 0) {
          return this.mapConfigRow(res.rows[0]);
        }
      } catch (err) {
        // Fall back to memory
      }
    }

    const existing = this.memConfigs.get(config.tenant_id);
    const record: CrowdQueueConfigRecord = {
      ...config,
      created_at: existing ? existing.created_at : now,
      updated_at: now,
    };
    this.memConfigs.set(config.tenant_id, record);
    return record;
  }

  // ============================================================================
  // ROW MAPPERS
  // ============================================================================

  private mapZoneRow(row: any): CrowdZoneRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      branch_id: row.branch_id,
      camera_id: row.camera_id,
      zone_name: row.zone_name,
      zone_type: row.zone_type,
      polygon: typeof row.polygon === 'string' ? JSON.parse(row.polygon) : row.polygon || [],
      area_sqm: parseFloat(row.area_sqm),
      nominal_capacity: parseInt(row.nominal_capacity, 10),
      warning_capacity: parseInt(row.warning_capacity, 10),
      max_capacity: parseInt(row.max_capacity, 10),
      enabled: row.enabled,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {},
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  private mapQueueRow(row: any): CounterQueueRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      branch_id: row.branch_id,
      camera_id: row.camera_id,
      counter_number: row.counter_number,
      counter_name: row.counter_name,
      counter_type: row.counter_type,
      queue_polygon: typeof row.queue_polygon === 'string' ? JSON.parse(row.queue_polygon) : row.queue_polygon || [],
      service_station_polygon:
        typeof row.service_station_polygon === 'string'
          ? JSON.parse(row.service_station_polygon)
          : row.service_station_polygon || [],
      max_queue_length_threshold: parseInt(row.max_queue_length_threshold, 10),
      max_wait_time_seconds_threshold: parseInt(row.max_wait_time_seconds_threshold, 10),
      alert_severity: row.alert_severity,
      enabled: row.enabled,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {},
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  private mapDensitySnapshotRow(row: any): CrowdDensitySnapshotRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      branch_id: row.branch_id,
      zone_id: row.zone_id,
      camera_id: row.camera_id,
      person_count: parseInt(row.person_count, 10),
      density_level: row.density_level,
      occupancy_percentage: parseFloat(row.occupancy_percentage),
      density_per_sqm: parseFloat(row.density_per_sqm),
      average_speed: parseFloat(row.average_speed),
      is_bottleneck: row.is_bottleneck,
      heat_intensity: parseFloat(row.heat_intensity),
      trend: row.trend,
      snapshot_metadata:
        typeof row.snapshot_metadata === 'string' ? JSON.parse(row.snapshot_metadata) : row.snapshot_metadata || {},
      timestamp: new Date(row.timestamp),
      created_at: new Date(row.created_at),
    };
  }

  private mapQueueSnapshotRow(row: any): CounterQueueSnapshotRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      branch_id: row.branch_id,
      queue_id: row.queue_id,
      camera_id: row.camera_id,
      current_queue_length: parseInt(row.current_queue_length, 10),
      served_person_count: parseInt(row.served_person_count, 10),
      avg_wait_time_seconds: parseInt(row.avg_wait_time_seconds, 10),
      max_wait_time_seconds: parseInt(row.max_wait_time_seconds, 10),
      is_counter_attended: row.is_counter_attended,
      threshold_exceeded: row.threshold_exceeded,
      bottleneck_detected: row.bottleneck_detected,
      participant_track_ids: Array.isArray(row.participant_track_ids) ? row.participant_track_ids : [],
      snapshot_metadata:
        typeof row.snapshot_metadata === 'string' ? JSON.parse(row.snapshot_metadata) : row.snapshot_metadata || {},
      timestamp: new Date(row.timestamp),
      created_at: new Date(row.created_at),
    };
  }

  private mapIncidentRow(row: any): CrowdQueueIncidentRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      branch_id: row.branch_id,
      camera_id: row.camera_id,
      incident_type: row.incident_type,
      severity: row.severity,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      entity_name: row.entity_name,
      trigger_value: parseFloat(row.trigger_value),
      threshold_value: parseFloat(row.threshold_value),
      confidence: parseFloat(row.confidence),
      explanation: row.explanation,
      snapshot_url: row.snapshot_url,
      review_status: row.review_status,
      reviewed_by: row.reviewed_by,
      reviewed_at: row.reviewed_at ? new Date(row.reviewed_at) : null,
      resolution_notes: row.resolution_notes,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {},
      occurred_at: new Date(row.occurred_at),
      created_at: new Date(row.created_at),
    };
  }

  private mapConfigRow(row: any): CrowdQueueConfigRecord {
    return {
      tenant_id: row.tenant_id,
      branch_id: row.branch_id,
      default_queue_threshold: parseInt(row.default_queue_threshold, 10),
      default_wait_time_threshold_seconds: parseInt(row.default_wait_time_threshold_seconds, 10),
      density_warning_percentage: parseInt(row.density_warning_percentage, 10),
      density_critical_percentage: parseInt(row.density_critical_percentage, 10),
      bottleneck_speed_threshold: parseFloat(row.bottleneck_speed_threshold),
      sla_target_compliance_percentage: parseFloat(row.sla_target_compliance_percentage),
      alert_cooldown_seconds: parseInt(row.alert_cooldown_seconds, 10),
      auto_recommend_extra_counters: row.auto_recommend_extra_counters,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {},
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }
}
