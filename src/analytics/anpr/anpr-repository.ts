/**
 * Automatic Number Plate Recognition (ANPR) Repository
 * 
 * High-performance PostgreSQL persistence layer with in-memory fallback for ANPR events,
 * watchlists, registered plates, vehicle entry/exit tracking sessions, and human audit reviews.
 */

import crypto from 'node:crypto';
import type { Pool } from 'pg';
import type {
  AnprEventRecord,
  AnprStats,
  AnprVehicleSessionRecord,
  AnprWatchlistPlateRecord,
  AnprWatchlistRecord,
  ListAnprEventsFilter,
  ListVehicleSessionsFilter,
  ReviewStatus,
} from './anpr-types.js';
import type { WatchlistRegistryEntry } from './plate-watchlist-matcher.js';

export class AnprRepository {
  private readonly memoryEvents = new Map<string, AnprEventRecord>();
  private readonly memoryWatchlists = new Map<string, AnprWatchlistRecord>();
  private readonly memoryPlates = new Map<string, AnprWatchlistPlateRecord>();
  private readonly memorySessions = new Map<string, AnprVehicleSessionRecord>();

  constructor(private readonly pool?: Pool) {
    this.seedDefaultWatchlists();
  }

  private seedDefaultWatchlists(): void {
    const defaultTenant = '00000000-0000-4000-8000-000000000000';
    const defaultUser = '00000000-0000-4000-8000-000000000001';
    const now = new Date();

    const stolenListId = 'w-stolen-001';
    const stolenList: AnprWatchlistRecord = {
      id: stolenListId,
      tenant_id: defaultTenant,
      name: 'Police Hotlist & Stolen Vehicles',
      description: 'National and regional database of stolen and wanted vehicles',
      list_type: 'stolen',
      enabled: true,
      alert_on_match: true,
      alert_severity: 'P1',
      alert_authorities: true,
      created_by: defaultUser,
      created_at: now,
      updated_at: now,
    };
    this.memoryWatchlists.set(stolenListId, stolenList);

    const vipListId = 'w-vip-002';
    const vipList: AnprWatchlistRecord = {
      id: vipListId,
      tenant_id: defaultTenant,
      name: 'VIP & Executive Fleet',
      description: 'Senior leadership, state dignitaries, and authorized cash-in-transit vans',
      list_type: 'vip',
      enabled: true,
      alert_on_match: true,
      alert_severity: 'P2',
      alert_authorities: false,
      created_by: defaultUser,
      created_at: now,
      updated_at: now,
    };
    this.memoryWatchlists.set(vipListId, vipList);

    // Seed sample target plates
    const samplePlates: Array<Omit<AnprWatchlistPlateRecord, 'id' | 'added_at' | 'match_count'>> = [
      {
        tenant_id: defaultTenant,
        watchlist_id: stolenListId,
        plate_number: 'DL01CA1234',
        normalized_plate: 'DL01CA1234',
        country_code: 'IN',
        region_code: 'DL',
        vehicle_make: 'Hyundai',
        vehicle_model: 'Creta',
        vehicle_color: 'Silver',
        vehicle_type: 'car',
        owner_name: 'Unknown',
        reason: 'Reported stolen FIR #492/2026',
        fuzzy_match: true,
        max_levenshtein_distance: 1,
        priority: 'critical',
        added_by: defaultUser,
      },
      {
        tenant_id: defaultTenant,
        watchlist_id: vipListId,
        plate_number: 'MH12AB9999',
        normalized_plate: 'MH12AB9999',
        country_code: 'IN',
        region_code: 'MH',
        vehicle_make: 'Toyota',
        vehicle_model: 'Fortuner',
        vehicle_color: 'Black',
        vehicle_type: 'car',
        owner_name: 'Managing Director Fleet',
        reason: 'Executive Priority Parking Access',
        fuzzy_match: true,
        max_levenshtein_distance: 1,
        priority: 'high',
        added_by: defaultUser,
      },
      {
        tenant_id: defaultTenant,
        watchlist_id: stolenListId,
        plate_number: '22BH1234AB',
        normalized_plate: '22BH1234AB',
        country_code: 'IN',
        region_code: 'BH',
        vehicle_make: 'Tata',
        vehicle_model: 'Harrier',
        vehicle_color: 'White',
        vehicle_type: 'car',
        owner_name: 'S. K. Verma',
        reason: 'Suspect in ATM vault heist',
        fuzzy_match: true,
        max_levenshtein_distance: 1,
        priority: 'critical',
        added_by: defaultUser,
      },
    ];

    for (const p of samplePlates) {
      const id = crypto.randomUUID();
      this.memoryPlates.set(id, {
        ...p,
        id,
        added_at: now,
        match_count: 0,
      });
    }
  }

  // ==========================================================================
  // EVENT OPERATIONS
  // ==========================================================================

  public async createEvent(
    data: Omit<AnprEventRecord, 'id' | 'created_at'>
  ): Promise<AnprEventRecord> {
    const id = crypto.randomUUID();
    const now = new Date();

    const record: AnprEventRecord = {
      ...data,
      id,
      created_at: now,
    };

    if (this.pool) {
      try {
        const query = `
          INSERT INTO anpr_events (
            id, tenant_id, camera_id, watchlist_id, plate_id, analytics_event_id,
            plate_number, normalized_plate, plate_confidence, country_code, region_code,
            plate_type, vehicle_type, vehicle_color, vehicle_make, vehicle_model,
            vehicle_bbox, plate_bbox, ocr_details, snapshot_reference, plate_crop_url,
            entry_direction, review_status, reviewed_by, reviewed_at, review_notes,
            processing_time_ms, occurred_at, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29
          ) RETURNING *;
        `;
        const values = [
          record.id,
          record.tenant_id,
          record.camera_id,
          record.watchlist_id || null,
          record.plate_id || null,
          record.analytics_event_id || null,
          record.plate_number,
          record.normalized_plate,
          record.plate_confidence,
          record.country_code,
          record.region_code || null,
          record.plate_type,
          record.vehicle_type || null,
          record.vehicle_color || null,
          record.vehicle_make || null,
          record.vehicle_model || null,
          record.vehicle_bbox ? JSON.stringify(record.vehicle_bbox) : null,
          JSON.stringify(record.plate_bbox),
          record.ocr_details ? JSON.stringify(record.ocr_details) : null,
          record.snapshot_reference || null,
          record.plate_crop_url || null,
          record.entry_direction,
          record.review_status,
          record.reviewed_by || null,
          record.reviewed_at || null,
          record.review_notes || null,
          record.processing_time_ms,
          record.occurred_at,
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

  public async getEventById(tenantId: string, id: string): Promise<AnprEventRecord | null> {
    if (this.pool) {
      try {
        const query = `
          SELECT ae.*, w.name as watchlist_name, rn.name as camera_name
          FROM anpr_events ae
          LEFT JOIN anpr_watchlists w ON w.id = ae.watchlist_id
          LEFT JOIN cameras c ON c.id = ae.camera_id
          LEFT JOIN resource_nodes rn ON rn.id = c.resource_node_id
          WHERE ae.tenant_id = $1 AND ae.id = $2;
        `;
        const res = await this.pool.query(query, [tenantId, id]);
        if (res.rows.length > 0) {
          return this.mapEventRow(res.rows[0]);
        }
      } catch (err) {
        console.warn('PostgreSQL getEventById error, falling back to memory store:', err);
      }
    }

    const event = this.memoryEvents.get(id);
    if (event && event.tenant_id === tenantId) {
      return event;
    }
    return null;
  }

  public async listEvents(filter: ListAnprEventsFilter): Promise<{
    events: AnprEventRecord[];
    total: number;
  }> {
    const {
      tenantId,
      cameraId,
      plateNumber,
      watchlistId,
      entryDirection,
      reviewStatus,
      hasWatchlistMatch,
      fromDate,
      toDate,
      limit = 50,
      offset = 0,
    } = filter;

    if (this.pool) {
      try {
        const conditions = ['ae.tenant_id = $1'];
        const values: any[] = [tenantId];
        let idx = 2;

        if (cameraId) {
          conditions.push(`ae.camera_id = $${idx++}`);
          values.push(cameraId);
        }
        if (plateNumber) {
          conditions.push(`ae.normalized_plate LIKE $${idx++}`);
          values.push(`%${plateNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}%`);
        }
        if (watchlistId) {
          conditions.push(`ae.watchlist_id = $${idx++}`);
          values.push(watchlistId);
        }
        if (hasWatchlistMatch === true) {
          conditions.push('ae.watchlist_id IS NOT NULL');
        }
        if (entryDirection) {
          conditions.push(`ae.entry_direction = $${idx++}`);
          values.push(entryDirection);
        }
        if (reviewStatus) {
          conditions.push(`ae.review_status = $${idx++}`);
          values.push(reviewStatus);
        }
        if (fromDate) {
          conditions.push(`ae.occurred_at >= $${idx++}`);
          values.push(fromDate);
        }
        if (toDate) {
          conditions.push(`ae.occurred_at <= $${idx++}`);
          values.push(toDate);
        }

        const countQuery = `
          SELECT COUNT(*) as total
          FROM anpr_events ae
          WHERE ${conditions.join(' AND ')};
        `;
        const countRes = await this.pool.query(countQuery, values);
        const total = parseInt(countRes.rows[0]?.total || '0', 10);

        const dataQuery = `
          SELECT ae.*, w.name as watchlist_name, rn.name as camera_name
          FROM anpr_events ae
          LEFT JOIN anpr_watchlists w ON w.id = ae.watchlist_id
          LEFT JOIN cameras c ON c.id = ae.camera_id
          LEFT JOIN resource_nodes rn ON rn.id = c.resource_node_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY ae.occurred_at DESC
          LIMIT $${idx++} OFFSET $${idx++};
        `;
        values.push(limit, offset);
        const dataRes = await this.pool.query(dataQuery, values);

        return {
          events: dataRes.rows.map((row) => this.mapEventRow(row)),
          total,
        };
      } catch (err) {
        console.warn('PostgreSQL listEvents error, falling back to memory store:', err);
      }
    }

    let items = Array.from(this.memoryEvents.values())
      .filter((e) => e.tenant_id === tenantId);

    if (cameraId) items = items.filter((e) => e.camera_id === cameraId);
    if (plateNumber) {
      const q = plateNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      items = items.filter((e) => e.normalized_plate.includes(q));
    }
    if (watchlistId) items = items.filter((e) => e.watchlist_id === watchlistId);
    if (hasWatchlistMatch === true) items = items.filter((e) => Boolean(e.watchlist_id));
    if (entryDirection) items = items.filter((e) => e.entry_direction === entryDirection);
    if (reviewStatus) items = items.filter((e) => e.review_status === reviewStatus);
    if (fromDate) items = items.filter((e) => e.occurred_at >= fromDate);
    if (toDate) items = items.filter((e) => e.occurred_at <= toDate);

    items.sort((a, b) => b.occurred_at.getTime() - a.occurred_at.getTime());

    const total = items.length;
    const paginated = items.slice(offset, offset + limit);

    return { events: paginated, total };
  }

  public async reviewEvent(
    tenantId: string,
    eventId: string,
    review: {
      status: ReviewStatus;
      reviewedBy: string;
      notes?: string;
    }
  ): Promise<AnprEventRecord | null> {
    const now = new Date();

    if (this.pool) {
      try {
        const query = `
          UPDATE anpr_events
          SET review_status = $1, reviewed_by = $2, reviewed_at = $3, review_notes = $4
          WHERE tenant_id = $5 AND id = $6
          RETURNING *;
        `;
        const res = await this.pool.query(query, [
          review.status,
          review.reviewedBy,
          now,
          review.notes || null,
          tenantId,
          eventId,
        ]);
        if (res.rows.length > 0) {
          return this.mapEventRow(res.rows[0]);
        }
      } catch (err) {
        console.warn('PostgreSQL reviewEvent error, falling back to memory store:', err);
      }
    }

    const event = this.memoryEvents.get(eventId);
    if (event && event.tenant_id === tenantId) {
      event.review_status = review.status;
      event.reviewed_by = review.reviewedBy;
      event.reviewed_at = now;
      event.review_notes = review.notes || null;
      return event;
    }

    return null;
  }

  // ==========================================================================
  // WATCHLIST OPERATIONS
  // ==========================================================================

  public async createWatchlist(
    data: Omit<AnprWatchlistRecord, 'id' | 'created_at' | 'updated_at'>
  ): Promise<AnprWatchlistRecord> {
    const id = crypto.randomUUID();
    const now = new Date();

    const record: AnprWatchlistRecord = {
      ...data,
      id,
      created_at: now,
      updated_at: now,
    };

    if (this.pool) {
      try {
        const query = `
          INSERT INTO anpr_watchlists (
            id, tenant_id, name, description, list_type, enabled,
            alert_on_match, alert_severity, alert_authorities, created_by, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING *;
        `;
        const values = [
          record.id, record.tenant_id, record.name, record.description || null,
          record.list_type, record.enabled, record.alert_on_match, record.alert_severity,
          record.alert_authorities, record.created_by, record.created_at, record.updated_at,
        ];
        const res = await this.pool.query(query, values);
        return this.mapWatchlistRow(res.rows[0]);
      } catch (err) {
        console.warn('PostgreSQL insert watchlist error, falling back to memory store:', err);
      }
    }

    this.memoryWatchlists.set(id, record);
    return record;
  }

  public async getWatchlistById(tenantId: string, id: string): Promise<AnprWatchlistRecord | null> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM anpr_watchlists WHERE tenant_id = $1 AND id = $2 AND archived_at IS NULL;`,
          [tenantId, id]
        );
        if (res.rows.length > 0) return this.mapWatchlistRow(res.rows[0]);
      } catch (err) {
        console.warn('PostgreSQL getWatchlistById error, falling back to memory store:', err);
      }
    }

    const list = this.memoryWatchlists.get(id);
    if (list && list.tenant_id === tenantId && !list.archived_at) return list;
    return null;
  }

  public async listWatchlists(tenantId: string): Promise<AnprWatchlistRecord[]> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM anpr_watchlists WHERE tenant_id = $1 AND archived_at IS NULL ORDER BY name ASC;`,
          [tenantId]
        );
        return res.rows.map((r) => this.mapWatchlistRow(r));
      } catch (err) {
        console.warn('PostgreSQL listWatchlists error, falling back to memory store:', err);
      }
    }

    return Array.from(this.memoryWatchlists.values())
      .filter((w) => w.tenant_id === tenantId && !w.archived_at)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  public async updateWatchlist(
    tenantId: string,
    id: string,
    patch: Partial<Pick<AnprWatchlistRecord, 'name' | 'description' | 'enabled' | 'alert_on_match' | 'alert_severity' | 'alert_authorities'>>
  ): Promise<AnprWatchlistRecord | null> {
    const now = new Date();

    if (this.pool) {
      try {
        const query = `
          UPDATE anpr_watchlists
          SET name = COALESCE($1, name),
              description = COALESCE($2, description),
              enabled = COALESCE($3, enabled),
              alert_on_match = COALESCE($4, alert_on_match),
              alert_severity = COALESCE($5, alert_severity),
              alert_authorities = COALESCE($6, alert_authorities),
              updated_at = $7
          WHERE tenant_id = $8 AND id = $9 AND archived_at IS NULL
          RETURNING *;
        `;
        const res = await this.pool.query(query, [
          patch.name, patch.description, patch.enabled, patch.alert_on_match,
          patch.alert_severity, patch.alert_authorities, now, tenantId, id,
        ]);
        if (res.rows.length > 0) return this.mapWatchlistRow(res.rows[0]);
      } catch (err) {
        console.warn('PostgreSQL updateWatchlist error, falling back to memory store:', err);
      }
    }

    const list = this.memoryWatchlists.get(id);
    if (list && list.tenant_id === tenantId && !list.archived_at) {
      Object.assign(list, patch, { updated_at: now });
      return list;
    }
    return null;
  }

  public async deleteWatchlist(tenantId: string, id: string): Promise<boolean> {
    const now = new Date();

    if (this.pool) {
      try {
        const res = await this.pool.query(
          `UPDATE anpr_watchlists SET archived_at = $1 WHERE tenant_id = $2 AND id = $3 AND archived_at IS NULL;`,
          [now, tenantId, id]
        );
        return (res.rowCount ?? 0) > 0;
      } catch (err) {
        console.warn('PostgreSQL deleteWatchlist error, falling back to memory store:', err);
      }
    }

    const list = this.memoryWatchlists.get(id);
    if (list && list.tenant_id === tenantId && !list.archived_at) {
      list.archived_at = now;
      return true;
    }
    return false;
  }

  // ==========================================================================
  // WATCHLIST PLATES OPERATIONS
  // ==========================================================================

  public async addPlate(
    data: Omit<AnprWatchlistPlateRecord, 'id' | 'added_at' | 'match_count'>
  ): Promise<AnprWatchlistPlateRecord> {
    const id = crypto.randomUUID();
    const now = new Date();

    const record: AnprWatchlistPlateRecord = {
      ...data,
      id,
      normalized_plate: data.normalized_plate || data.plate_number.replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
      added_at: now,
      match_count: 0,
    };

    if (this.pool) {
      try {
        const query = `
          INSERT INTO anpr_watchlist_plates (
            id, tenant_id, watchlist_id, plate_number, normalized_plate,
            country_code, region_code, vehicle_make, vehicle_model, vehicle_color,
            vehicle_type, owner_name, reason, notes, fuzzy_match,
            max_levenshtein_distance, priority, metadata, added_by, added_at,
            expires_at, active_from, active_to, match_count
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
          ) RETURNING *;
        `;
        const values = [
          record.id, record.tenant_id, record.watchlist_id, record.plate_number, record.normalized_plate,
          record.country_code, record.region_code || null, record.vehicle_make || null,
          record.vehicle_model || null, record.vehicle_color || null, record.vehicle_type || null,
          record.owner_name || null, record.reason, record.notes || null, record.fuzzy_match,
          record.max_levenshtein_distance, record.priority, JSON.stringify(record.metadata || {}),
          record.added_by, record.added_at, record.expires_at || null, record.active_from || null,
          record.active_to || null, record.match_count,
        ];
        const res = await this.pool.query(query, values);
        return this.mapPlateRow(res.rows[0]);
      } catch (err) {
        console.warn('PostgreSQL insert plate error, falling back to memory store:', err);
      }
    }

    this.memoryPlates.set(id, record);
    return record;
  }

  public async removePlate(tenantId: string, watchlistId: string, plateId: string): Promise<boolean> {
    const now = new Date();

    if (this.pool) {
      try {
        const res = await this.pool.query(
          `UPDATE anpr_watchlist_plates SET archived_at = $1 WHERE tenant_id = $2 AND watchlist_id = $3 AND id = $4 AND archived_at IS NULL;`,
          [now, tenantId, watchlistId, plateId]
        );
        return (res.rowCount ?? 0) > 0;
      } catch (err) {
        console.warn('PostgreSQL removePlate error, falling back to memory store:', err);
      }
    }

    const plate = this.memoryPlates.get(plateId);
    if (plate && plate.tenant_id === tenantId && plate.watchlist_id === watchlistId && !plate.archived_at) {
      plate.archived_at = now;
      return true;
    }
    return false;
  }

  public async listPlates(tenantId: string, watchlistId: string): Promise<AnprWatchlistPlateRecord[]> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM anpr_watchlist_plates WHERE tenant_id = $1 AND watchlist_id = $2 AND archived_at IS NULL ORDER BY plate_number ASC;`,
          [tenantId, watchlistId]
        );
        return res.rows.map((r) => this.mapPlateRow(r));
      } catch (err) {
        console.warn('PostgreSQL listPlates error, falling back to memory store:', err);
      }
    }

    return Array.from(this.memoryPlates.values())
      .filter((p) => p.tenant_id === tenantId && p.watchlist_id === watchlistId && !p.archived_at)
      .sort((a, b) => a.plate_number.localeCompare(b.plate_number));
  }

  public async getActiveWatchlistEntries(tenantId: string): Promise<WatchlistRegistryEntry[]> {
    const watchlists = await this.listWatchlists(tenantId);
    const results: WatchlistRegistryEntry[] = [];

    for (const wl of watchlists) {
      if (!wl.enabled) continue;
      const plates = await this.listPlates(tenantId, wl.id);
      for (const plate of plates) {
        results.push({ watchlist: wl, plate });
      }
    }

    return results;
  }

  public async incrementPlateMatchCount(tenantId: string, plateId: string): Promise<void> {
    const now = new Date();

    if (this.pool) {
      try {
        await this.pool.query(
          `UPDATE anpr_watchlist_plates SET match_count = match_count + 1, last_seen_at = $1 WHERE tenant_id = $2 AND id = $3;`,
          [now, tenantId, plateId]
        );
        return;
      } catch (err) {
        console.warn('PostgreSQL incrementPlateMatchCount error:', err);
      }
    }

    const plate = this.memoryPlates.get(plateId);
    if (plate && plate.tenant_id === tenantId) {
      plate.match_count += 1;
      plate.last_matched_at = now;
    }
  }

  // ==========================================================================
  // VEHICLE SESSION DWELL TRACKING
  // ==========================================================================

  public async upsertVehicleSession(
    tenantId: string,
    event: AnprEventRecord,
    cameraName?: string
  ): Promise<AnprVehicleSessionRecord> {
    const normalizedPlate = event.normalized_plate;
    const now = new Date();

    // 1. If this is an EXIT event, find the active 'inside' session for this plate
    if (event.entry_direction === 'exit') {
      const activeSession = await this.findActiveInsideSession(tenantId, normalizedPlate);
      if (activeSession) {
        const exitAt = event.occurred_at || now;
        const durationSec = Math.max(0, Math.round((exitAt.getTime() - activeSession.entry_at.getTime()) / 1000));
        const isOverstay = durationSec > (activeSession.max_dwell_minutes * 60);

        if (this.pool) {
          try {
            const updateQuery = `
              UPDATE anpr_vehicle_sessions
              SET exit_event_id = $1, exit_camera_id = $2, exit_at = $3,
                  status = 'exited', duration_seconds = $4,
                  overstay_alerted = $5, updated_at = $6
              WHERE id = $7
              RETURNING *;
            `;
            const res = await this.pool.query(updateQuery, [
              event.id, event.camera_id, exitAt, durationSec, isOverstay, now, activeSession.id,
            ]);
            return this.mapSessionRow(res.rows[0]);
          } catch (err) {
            console.warn('PostgreSQL upsertVehicleSession exit error:', err);
          }
        }

        activeSession.exit_event_id = event.id;
        activeSession.exit_camera_id = event.camera_id;
        activeSession.exit_camera_name = cameraName || activeSession.exit_camera_name;
        activeSession.exit_at = exitAt;
        activeSession.duration_seconds = durationSec;
        activeSession.status = 'exited';
        activeSession.overstay_alerted = isOverstay;
        activeSession.updated_at = now;
        return activeSession;
      }
    }

    // 2. If this is an ENTRY or new observation, create a new vehicle session
    const sessionId = crypto.randomUUID();
    const newSession: AnprVehicleSessionRecord = {
      id: sessionId,
      tenant_id: tenantId,
      plate_number: event.plate_number,
      normalized_plate: normalizedPlate,
      entry_event_id: event.entry_direction === 'entry' ? event.id : null,
      exit_event_id: event.entry_direction === 'exit' ? event.id : null,
      entry_camera_id: event.entry_direction === 'entry' ? event.camera_id : null,
      exit_camera_id: event.entry_direction === 'exit' ? event.camera_id : null,
      entry_camera_name: event.entry_direction === 'entry' ? (cameraName || null) : null,
      exit_camera_name: event.entry_direction === 'exit' ? (cameraName || null) : null,
      vehicle_type: event.vehicle_type || null,
      vehicle_color: event.vehicle_color || null,
      entry_at: event.occurred_at || now,
      exit_at: event.entry_direction === 'exit' ? (event.occurred_at || now) : null,
      duration_seconds: event.entry_direction === 'exit' ? 0 : null,
      max_dwell_minutes: 720, // 12 hours default dwell threshold
      overstay_alerted: false,
      status: event.entry_direction === 'exit' ? 'exited' : 'inside',
      created_at: now,
      updated_at: now,
    };

    if (this.pool) {
      try {
        const query = `
          INSERT INTO anpr_vehicle_sessions (
            id, tenant_id, plate_number, normalized_plate, entry_event_id,
            exit_event_id, entry_camera_id, exit_camera_id, vehicle_type,
            vehicle_color, entry_at, exit_at, duration_seconds,
            max_dwell_minutes, overstay_alerted, status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          RETURNING *;
        `;
        const values = [
          newSession.id, newSession.tenant_id, newSession.plate_number, newSession.normalized_plate,
          newSession.entry_event_id, newSession.exit_event_id, newSession.entry_camera_id,
          newSession.exit_camera_id, newSession.vehicle_type, newSession.vehicle_color,
          newSession.entry_at, newSession.exit_at, newSession.duration_seconds,
          newSession.max_dwell_minutes, newSession.overstay_alerted, newSession.status,
          newSession.created_at, newSession.updated_at,
        ];
        const res = await this.pool.query(query, values);
        return this.mapSessionRow(res.rows[0]);
      } catch (err) {
        console.warn('PostgreSQL insert vehicle session error:', err);
      }
    }

    this.memorySessions.set(sessionId, newSession);
    return newSession;
  }

  private async findActiveInsideSession(
    tenantId: string,
    normalizedPlate: string
  ): Promise<AnprVehicleSessionRecord | null> {
    if (this.pool) {
      try {
        const query = `
          SELECT * FROM anpr_vehicle_sessions
          WHERE tenant_id = $1 AND normalized_plate = $2 AND status = 'inside'
          ORDER BY entry_at DESC LIMIT 1;
        `;
        const res = await this.pool.query(query, [tenantId, normalizedPlate]);
        if (res.rows.length > 0) return this.mapSessionRow(res.rows[0]);
      } catch (err) {
        console.warn('PostgreSQL findActiveInsideSession error:', err);
      }
    }

    const sessions = Array.from(this.memorySessions.values())
      .filter((s) => s.tenant_id === tenantId && s.normalized_plate === normalizedPlate && s.status === 'inside')
      .sort((a, b) => b.entry_at.getTime() - a.entry_at.getTime());

    return sessions[0] || null;
  }

  public async listSessions(filter: ListVehicleSessionsFilter): Promise<{
    sessions: AnprVehicleSessionRecord[];
    total: number;
  }> {
    const { tenantId, plateNumber, status, fromDate, toDate, limit = 50, offset = 0 } = filter;

    if (this.pool) {
      try {
        const conditions = ['vs.tenant_id = $1'];
        const values: any[] = [tenantId];
        let idx = 2;

        if (plateNumber) {
          conditions.push(`vs.normalized_plate LIKE $${idx++}`);
          values.push(`%${plateNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}%`);
        }
        if (status) {
          conditions.push(`vs.status = $${idx++}`);
          values.push(status);
        }
        if (fromDate) {
          conditions.push(`vs.entry_at >= $${idx++}`);
          values.push(fromDate);
        }
        if (toDate) {
          conditions.push(`vs.entry_at <= $${idx++}`);
          values.push(toDate);
        }

        const countRes = await this.pool.query(
          `SELECT COUNT(*) as total FROM anpr_vehicle_sessions vs WHERE ${conditions.join(' AND ')};`,
          values
        );
        const total = parseInt(countRes.rows[0]?.total || '0', 10);

        const dataQuery = `
          SELECT vs.*, rn_en.name as entry_camera_name, rn_ex.name as exit_camera_name
          FROM anpr_vehicle_sessions vs
          LEFT JOIN cameras c_en ON c_en.id = vs.entry_camera_id
          LEFT JOIN resource_nodes rn_en ON rn_en.id = c_en.resource_node_id
          LEFT JOIN cameras c_ex ON c_ex.id = vs.exit_camera_id
          LEFT JOIN resource_nodes rn_ex ON rn_ex.id = c_ex.resource_node_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY vs.entry_at DESC
          LIMIT $${idx++} OFFSET $${idx++};
        `;
        values.push(limit, offset);
        const dataRes = await this.pool.query(dataQuery, values);

        return {
          sessions: dataRes.rows.map((r) => this.mapSessionRow(r)),
          total,
        };
      } catch (err) {
        console.warn('PostgreSQL listSessions error:', err);
      }
    }

    let items = Array.from(this.memorySessions.values()).filter((s) => s.tenant_id === tenantId);
    if (plateNumber) {
      const q = plateNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      items = items.filter((s) => s.normalized_plate.includes(q));
    }
    if (status) items = items.filter((s) => s.status === status);
    if (fromDate) items = items.filter((s) => s.entry_at >= fromDate);
    if (toDate) items = items.filter((s) => s.entry_at <= toDate);

    items.sort((a, b) => b.entry_at.getTime() - a.entry_at.getTime());

    return {
      sessions: items.slice(offset, offset + limit),
      total: items.length,
    };
  }

  // ==========================================================================
  // OPERATIONAL STATS & TELEMETRY
  // ==========================================================================

  public async getStats(tenantId: string, cameraId?: string): Promise<AnprStats> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    let events: AnprEventRecord[] = [];
    let sessions: AnprVehicleSessionRecord[] = [];

    if (this.pool) {
      try {
        const eventsRes = await this.pool.query(
          `SELECT * FROM anpr_events WHERE tenant_id = $1 AND occurred_at >= $2 ${cameraId ? 'AND camera_id = $3' : ''};`,
          cameraId ? [tenantId, oneDayAgo, cameraId] : [tenantId, oneDayAgo]
        );
        events = eventsRes.rows.map((r) => this.mapEventRow(r));

        const sessionsRes = await this.pool.query(
          `SELECT * FROM anpr_vehicle_sessions WHERE tenant_id = $1;`,
          [tenantId]
        );
        sessions = sessionsRes.rows.map((r) => this.mapSessionRow(r));
      } catch (err) {
        console.warn('PostgreSQL getStats error, using memory fallback:', err);
        events = Array.from(this.memoryEvents.values())
          .filter((e) => e.tenant_id === tenantId && e.occurred_at >= oneDayAgo)
          .filter((e) => (cameraId ? e.camera_id === cameraId : true));
        sessions = Array.from(this.memorySessions.values())
          .filter((s) => s.tenant_id === tenantId);
      }
    } else {
      events = Array.from(this.memoryEvents.values())
        .filter((e) => e.tenant_id === tenantId && e.occurred_at >= oneDayAgo)
        .filter((e) => (cameraId ? e.camera_id === cameraId : true));
      sessions = Array.from(this.memorySessions.values())
        .filter((s) => s.tenant_id === tenantId);
    }

    const totalReads = events.length;
    const uniquePlates = new Set(events.map((e) => e.normalized_plate)).size;
    const watchlistHits = events.filter((e) => Boolean(e.watchlist_id)).length;
    const pendingReviews = events.filter((e) => e.review_status === 'pending' && Boolean(e.watchlist_id)).length;

    const avgConfidence = totalReads > 0
      ? events.reduce((acc, cur) => acc + cur.plate_confidence, 0) / totalReads
      : 0.92;

    const activeParkedVehicles = sessions.filter((s) => s.status === 'inside').length;
    const overstayAlerts = sessions.filter((s) => s.overstay_alerted).length;

    // Vehicle breakdown
    const vehicleTypeBreakdown: Record<string, number> = {};
    for (const ev of events) {
      const type = ev.vehicle_type || 'car';
      vehicleTypeBreakdown[type] = (vehicleTypeBreakdown[type] || 0) + 1;
    }

    // Hourly breakdown
    const hourlyCounts: Record<string, number> = {};
    for (let i = 0; i < 24; i++) {
      const hDate = new Date(now.getTime() - (23 - i) * 60 * 60 * 1000);
      const hLabel = `${hDate.getHours().toString().padStart(2, '0')}:00`;
      hourlyCounts[hLabel] = 0;
    }
    for (const ev of events) {
      const h = `${ev.occurred_at.getHours().toString().padStart(2, '0')}:00`;
      const prevCount = hourlyCounts[h];
      hourlyCounts[h] = (prevCount !== undefined ? prevCount : 0) + 1;
    }
    const readsByHour = Object.entries(hourlyCounts).map(([hour, count]) => ({ hour, count }));

    return {
      totalReads,
      uniquePlates,
      watchlistHits,
      averageConfidence: parseFloat(avgConfidence.toFixed(4)),
      pendingReviews,
      activeParkedVehicles,
      overstayAlerts,
      readsByHour,
      vehicleTypeBreakdown,
      watchlistTypeBreakdown: {
        stolen: events.filter((e) => e.watchlist_name?.toLowerCase().includes('stolen')).length,
        wanted: events.filter((e) => e.watchlist_name?.toLowerCase().includes('wanted')).length,
        vip: events.filter((e) => e.watchlist_name?.toLowerCase().includes('vip')).length,
      },
    };
  }

  // ==========================================================================
  // ROW MAPPERS
  // ==========================================================================

  private mapEventRow(row: any): AnprEventRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      camera_id: row.camera_id,
      camera_name: row.camera_name || undefined,
      branch_id: row.branch_id || undefined,
      watchlist_id: row.watchlist_id || undefined,
      watchlist_name: row.watchlist_name || undefined,
      plate_id: row.plate_id || undefined,
      analytics_event_id: row.analytics_event_id || undefined,
      plate_number: row.plate_number,
      normalized_plate: row.normalized_plate || row.plate_number.replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
      plate_confidence: parseFloat(row.plate_confidence),
      country_code: row.country_code || 'IN',
      region_code: row.region_code || undefined,
      plate_type: row.plate_type || 'standard',
      vehicle_type: row.vehicle_type || undefined,
      vehicle_color: row.vehicle_color || undefined,
      vehicle_make: row.vehicle_make || undefined,
      vehicle_model: row.vehicle_model || undefined,
      vehicle_bbox: typeof row.vehicle_bbox === 'string' ? JSON.parse(row.vehicle_bbox) : row.vehicle_bbox,
      plate_bbox: typeof row.plate_bbox === 'string' ? JSON.parse(row.plate_bbox) : row.plate_bbox,
      ocr_details: typeof row.ocr_details === 'string' ? JSON.parse(row.ocr_details) : row.ocr_details,
      snapshot_reference: row.snapshot_reference || undefined,
      plate_crop_url: row.plate_crop_url || undefined,
      entry_direction: row.entry_direction || 'unknown',
      review_status: row.review_status || 'pending',
      reviewed_by: row.reviewed_by || undefined,
      reviewed_at: row.reviewed_at ? new Date(row.reviewed_at) : undefined,
      review_notes: row.review_notes || undefined,
      processing_time_ms: parseInt(row.processing_time_ms || '0', 10),
      occurred_at: new Date(row.occurred_at),
      created_at: new Date(row.created_at),
    };
  }

  private mapWatchlistRow(row: any): AnprWatchlistRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      name: row.name,
      description: row.description || undefined,
      list_type: row.list_type,
      enabled: Boolean(row.enabled),
      alert_on_match: Boolean(row.alert_on_match),
      alert_severity: row.alert_severity,
      alert_authorities: Boolean(row.alert_authorities),
      created_by: row.created_by,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      archived_at: row.archived_at ? new Date(row.archived_at) : undefined,
    };
  }

  private mapPlateRow(row: any): AnprWatchlistPlateRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      watchlist_id: row.watchlist_id,
      plate_number: row.plate_number,
      normalized_plate: row.normalized_plate || row.plate_number.replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
      country_code: row.country_code || 'IN',
      region_code: row.region_code || undefined,
      vehicle_make: row.vehicle_make || undefined,
      vehicle_model: row.vehicle_model || undefined,
      vehicle_color: row.vehicle_color || undefined,
      vehicle_type: row.vehicle_type || undefined,
      owner_name: row.owner_name || undefined,
      reason: row.reason,
      notes: row.notes || undefined,
      fuzzy_match: Boolean(row.fuzzy_match ?? true),
      max_levenshtein_distance: parseInt(row.max_levenshtein_distance || '1', 10),
      priority: row.priority || 'medium',
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      added_by: row.added_by,
      added_at: new Date(row.added_at),
      expires_at: row.expires_at ? new Date(row.expires_at) : undefined,
      active_from: row.active_from ? new Date(row.active_from) : undefined,
      active_to: row.active_to ? new Date(row.active_to) : undefined,
      last_matched_at: row.last_matched_at ? new Date(row.last_matched_at) : undefined,
      match_count: parseInt(row.match_count || '0', 10),
      archived_at: row.archived_at ? new Date(row.archived_at) : undefined,
    };
  }

  private mapSessionRow(row: any): AnprVehicleSessionRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      plate_number: row.plate_number,
      normalized_plate: row.normalized_plate || row.plate_number.replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
      entry_event_id: row.entry_event_id || undefined,
      exit_event_id: row.exit_event_id || undefined,
      entry_camera_id: row.entry_camera_id || undefined,
      exit_camera_id: row.exit_camera_id || undefined,
      entry_camera_name: row.entry_camera_name || undefined,
      exit_camera_name: row.exit_camera_name || undefined,
      vehicle_type: row.vehicle_type || undefined,
      vehicle_color: row.vehicle_color || undefined,
      entry_at: new Date(row.entry_at),
      exit_at: row.exit_at ? new Date(row.exit_at) : undefined,
      duration_seconds: row.duration_seconds !== null && row.duration_seconds !== undefined ? parseInt(row.duration_seconds, 10) : undefined,
      max_dwell_minutes: parseInt(row.max_dwell_minutes || '720', 10),
      overstay_alerted: Boolean(row.overstay_alerted),
      status: row.status || 'inside',
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }
}
