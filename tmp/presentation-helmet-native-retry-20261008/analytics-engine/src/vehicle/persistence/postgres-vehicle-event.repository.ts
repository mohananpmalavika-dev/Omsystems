/**
 * PostgreSQL Vehicle Event Repository
 * Production implementation with optimized queries
 */

import type { Pool } from 'pg';
import type {
  VehicleEvent,
  VehicleEventQuery,
  PlateHistoryOptions,
  DateRange,
  VehicleEventStats,
} from './vehicle-event.model.js';
import type { VehicleEventRepository } from './vehicle-event.repository.js';

export class PostgresVehicleEventRepository implements VehicleEventRepository {
  constructor(private readonly pool: Pool) {}
  
  async save(event: VehicleEvent): Promise<void> {
    const query = `
      INSERT INTO vehicle_events (
        id, tenant_id, site_id, camera_id, track_id,
        occurred_at, first_seen_at, last_seen_at, duration_seconds,
        vehicle_type, vehicle_confidence,
        color, color_confidence,
        raw_plate_text, normalized_plate,
        plate_detection_confidence, ocr_confidence, plate_confidence, plate_status,
        country, region,
        direction, speed,
        vehicle_bounding_box, plate_bounding_box,
        snapshot_uri, plate_crop_uri,
        metadata,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11,
        $12, $13,
        $14, $15,
        $16, $17, $18, $19,
        $20, $21,
        $22, $23,
        $24, $25,
        $26, $27,
        $28,
        $29
      )
      ON CONFLICT (id) DO UPDATE SET
        updated_at = NOW(),
        normalized_plate = EXCLUDED.normalized_plate,
        plate_confidence = EXCLUDED.plate_confidence
    `;
    
    const values = [
      event.id,
      event.tenantId,
      event.siteId,
      event.cameraId,
      event.trackId,
      event.occurredAt,
      event.firstSeenAt,
      event.lastSeenAt,
      event.durationSeconds,
      event.vehicleType,
      event.vehicleConfidence,
      event.color,
      event.colorConfidence,
      event.rawPlateText,
      event.normalizedPlate,
      event.plateDetectionConfidence,
      event.ocrConfidence,
      event.plateConfidence,
      event.plateStatus,
      event.country,
      event.region,
      event.direction,
      event.speed,
      event.vehicleBoundingBox ? JSON.stringify(event.vehicleBoundingBox) : null,
      event.plateBoundingBox ? JSON.stringify(event.plateBoundingBox) : null,
      event.snapshotUri,
      event.plateCropUri,
      event.metadata ? JSON.stringify(event.metadata) : null,
      event.createdAt,
    ];
    
    await this.pool.query(query, values);
  }
  
  async saveMany(events: VehicleEvent[]): Promise<void> {
    if (events.length === 0) return;
    
    // Use transaction for bulk insert
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      for (const event of events) {
        await this.save(event);
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  async search(query: VehicleEventQuery): Promise<VehicleEvent[]> {
    const conditions: string[] = ['tenant_id = $1'];
    const values: any[] = [query.tenantId];
    let paramIndex = 2;
    
    // Build WHERE clause
    if (query.siteIds && query.siteIds.length > 0) {
      conditions.push(`site_id = ANY($${paramIndex})`);
      values.push(query.siteIds);
      paramIndex++;
    }
    
    if (query.cameraIds && query.cameraIds.length > 0) {
      conditions.push(`camera_id = ANY($${paramIndex})`);
      values.push(query.cameraIds);
      paramIndex++;
    }
    
    if (query.vehicleTypes && query.vehicleTypes.length > 0) {
      conditions.push(`vehicle_type = ANY($${paramIndex})`);
      values.push(query.vehicleTypes);
      paramIndex++;
    }
    
    if (query.colors && query.colors.length > 0) {
      conditions.push(`color = ANY($${paramIndex})`);
      values.push(query.colors);
      paramIndex++;
    }
    
    if (query.normalizedPlate) {
      if (query.plateSimilarity !== undefined && query.plateSimilarity < 1.0) {
        // Fuzzy search using pg_trgm or levenshtein
        conditions.push(`similarity(normalized_plate, $${paramIndex}) >= $${paramIndex + 1}`);
        values.push(query.normalizedPlate, query.plateSimilarity);
        paramIndex += 2;
      } else {
        // Exact match
        conditions.push(`normalized_plate = $${paramIndex}`);
        values.push(query.normalizedPlate);
        paramIndex++;
      }
    }
    
    if (query.from) {
      conditions.push(`occurred_at >= $${paramIndex}`);
      values.push(query.from);
      paramIndex++;
    }
    
    if (query.to) {
      conditions.push(`occurred_at <= $${paramIndex}`);
      values.push(query.to);
      paramIndex++;
    }
    
    if (query.direction) {
      conditions.push(`direction = $${paramIndex}`);
      values.push(query.direction);
      paramIndex++;
    }
    
    // Build ORDER BY clause
    const orderBy = query.orderBy || 'occurred_at';
    const orderDirection = query.orderDirection || 'desc';
    
    // Build LIMIT and OFFSET
    const limit = Math.min(query.limit || 100, 1000);
    const offset = query.offset || 0;
    
    const sql = `
      SELECT * FROM vehicle_events
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy} ${orderDirection.toUpperCase()}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    values.push(limit, offset);
    
    const result = await this.pool.query(sql, values);
    return result.rows.map(this.mapRowToEvent);
  }
  
  async findByPlate(
    tenantId: string,
    plate: string,
    options?: PlateHistoryOptions
  ): Promise<VehicleEvent[]> {
    const minConfidence = options?.minConfidence || 0;
    const maxResults = Math.min(options?.maxResults || 100, 1000);
    
    const query = `
      SELECT * FROM vehicle_events
      WHERE tenant_id = $1
        AND normalized_plate = $2
        AND plate_confidence >= $3
      ORDER BY occurred_at DESC
      LIMIT $4
    `;
    
    const result = await this.pool.query(query, [
      tenantId,
      plate,
      minConfidence,
      maxResults,
    ]);
    
    return result.rows.map(this.mapRowToEvent);
  }
  
  async findRecentByCamera(
    tenantId: string,
    cameraId: string,
    since: Date,
    limit?: number
  ): Promise<VehicleEvent[]> {
    const query = `
      SELECT * FROM vehicle_events
      WHERE tenant_id = $1
        AND camera_id = $2
        AND occurred_at >= $3
      ORDER BY occurred_at DESC
      LIMIT $4
    `;
    
    const result = await this.pool.query(query, [
      tenantId,
      cameraId,
      since,
      limit || 100,
    ]);
    
    return result.rows.map(this.mapRowToEvent);
  }
  
  async findJourney(
    tenantId: string,
    normalizedPlate: string,
    range: DateRange
  ): Promise<VehicleEvent[]> {
    const query = `
      SELECT * FROM vehicle_events
      WHERE tenant_id = $1
        AND normalized_plate = $2
        AND occurred_at >= $3
        AND occurred_at <= $4
      ORDER BY occurred_at ASC
    `;
    
    const result = await this.pool.query(query, [
      tenantId,
      normalizedPlate,
      range.from,
      range.to,
    ]);
    
    return result.rows.map(this.mapRowToEvent);
  }
  
  async findById(tenantId: string, eventId: string): Promise<VehicleEvent | null> {
    const query = `
      SELECT * FROM vehicle_events
      WHERE tenant_id = $1 AND id = $2
      LIMIT 1
    `;
    
    const result = await this.pool.query(query, [tenantId, eventId]);
    
    return result.rows.length > 0 ? this.mapRowToEvent(result.rows[0]) : null;
  }
  
  async findByTrackId(tenantId: string, trackId: string): Promise<VehicleEvent[]> {
    const query = `
      SELECT * FROM vehicle_events
      WHERE tenant_id = $1 AND track_id = $2
      ORDER BY occurred_at DESC
    `;
    
    const result = await this.pool.query(query, [tenantId, trackId]);
    
    return result.rows.map(this.mapRowToEvent);
  }
  
  async getStats(
    tenantId: string,
    range: DateRange,
    cameraIds?: string[]
  ): Promise<VehicleEventStats> {
    const conditions = ['tenant_id = $1', 'occurred_at >= $2', 'occurred_at <= $3'];
    const values: any[] = [tenantId, range.from, range.to];
    
    if (cameraIds && cameraIds.length > 0) {
      conditions.push('camera_id = ANY($4)');
      values.push(cameraIds);
    }
    
    const query = `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN normalized_plate IS NOT NULL THEN 1 END) as with_plates,
        AVG(vehicle_confidence) as avg_confidence,
        json_object_agg(vehicle_type, type_count) as by_type,
        json_object_agg(COALESCE(color, 'unknown'), color_count) as by_color,
        json_object_agg(camera_id, camera_count) as by_camera
      FROM (
        SELECT
          vehicle_type,
          color,
          camera_id,
          vehicle_confidence,
          normalized_plate,
          COUNT(*) OVER (PARTITION BY vehicle_type) as type_count,
          COUNT(*) OVER (PARTITION BY COALESCE(color, 'unknown')) as color_count,
          COUNT(*) OVER (PARTITION BY camera_id) as camera_count
        FROM vehicle_events
        WHERE ${conditions.join(' AND ')}
      ) subquery
      GROUP BY vehicle_type, color, camera_id
    `;
    
    const result = await this.pool.query(query, values);
    
    if (result.rows.length === 0) {
      return {
        total: 0,
        byType: {},
        byColor: {},
        byCamera: {},
        withPlates: 0,
        avgConfidence: 0,
      };
    }
    
    const row = result.rows[0];
    
    return {
      total: parseInt(row.total),
      byType: row.by_type || {},
      byColor: row.by_color || {},
      byCamera: row.by_camera || {},
      withPlates: parseInt(row.with_plates),
      avgConfidence: parseFloat(row.avg_confidence) || 0,
    };
  }
  
  async deleteOlderThan(date: Date): Promise<number> {
    const query = `
      DELETE FROM vehicle_events
      WHERE created_at < $1
    `;
    
    const result = await this.pool.query(query, [date]);
    return result.rowCount || 0;
  }
  
  async count(query: VehicleEventQuery): Promise<number> {
    const conditions: string[] = ['tenant_id = $1'];
    const values: any[] = [query.tenantId];
    let paramIndex = 2;
    
    // Reuse same WHERE conditions as search
    if (query.cameraIds && query.cameraIds.length > 0) {
      conditions.push(`camera_id = ANY($${paramIndex})`);
      values.push(query.cameraIds);
      paramIndex++;
    }
    
    if (query.normalizedPlate) {
      conditions.push(`normalized_plate = $${paramIndex}`);
      values.push(query.normalizedPlate);
      paramIndex++;
    }
    
    if (query.from) {
      conditions.push(`occurred_at >= $${paramIndex}`);
      values.push(query.from);
      paramIndex++;
    }
    
    if (query.to) {
      conditions.push(`occurred_at <= $${paramIndex}`);
      values.push(query.to);
      paramIndex++;
    }
    
    const sql = `
      SELECT COUNT(*) as count
      FROM vehicle_events
      WHERE ${conditions.join(' AND ')}
    `;
    
    const result = await this.pool.query(sql, values);
    return parseInt(result.rows[0].count);
  }
  
  /**
   * Map database row to VehicleEvent
   */
  private mapRowToEvent(row: any): VehicleEvent {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      siteId: row.site_id,
      cameraId: row.camera_id,
      trackId: row.track_id,
      occurredAt: row.occurred_at,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      durationSeconds: row.duration_seconds,
      vehicleType: row.vehicle_type,
      vehicleConfidence: row.vehicle_confidence,
      color: row.color,
      colorConfidence: row.color_confidence,
      rawPlateText: row.raw_plate_text,
      normalizedPlate: row.normalized_plate,
      plateDetectionConfidence: row.plate_detection_confidence,
      ocrConfidence: row.ocr_confidence,
      plateConfidence: row.plate_confidence,
      plateStatus: row.plate_status,
      country: row.country,
      region: row.region,
      direction: row.direction,
      speed: row.speed,
      vehicleBoundingBox: row.vehicle_bounding_box ? JSON.parse(row.vehicle_bounding_box) : undefined,
      plateBoundingBox: row.plate_bounding_box ? JSON.parse(row.plate_bounding_box) : undefined,
      snapshotUri: row.snapshot_uri,
      plateCropUri: row.plate_crop_uri,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * Database schema migration
 */
export const VEHICLE_EVENTS_SCHEMA = `
-- Vehicle Events Table
CREATE TABLE IF NOT EXISTS vehicle_events (
    id VARCHAR(255) PRIMARY KEY,
    
    tenant_id UUID NOT NULL,
    site_id UUID NOT NULL,
    camera_id UUID NOT NULL,
    
    track_id VARCHAR(128) NOT NULL,
    
    occurred_at TIMESTAMPTZ NOT NULL,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    duration_seconds REAL NOT NULL DEFAULT 0,
    
    vehicle_type VARCHAR(32) NOT NULL,
    vehicle_confidence REAL NOT NULL,
    
    color VARCHAR(32),
    color_confidence REAL,
    
    raw_plate_text VARCHAR(32),
    normalized_plate VARCHAR(32),
    
    plate_detection_confidence REAL,
    ocr_confidence REAL,
    plate_confidence REAL,
    plate_status VARCHAR(32),
    
    country VARCHAR(8),
    region VARCHAR(32),
    
    direction VARCHAR(16),
    speed REAL,
    
    vehicle_bounding_box JSONB,
    plate_bounding_box JSONB,
    
    snapshot_uri TEXT,
    plate_crop_uri TEXT,
    
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_vehicle_events_tenant_time 
ON vehicle_events (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehicle_events_plate_time 
ON vehicle_events (tenant_id, normalized_plate, occurred_at DESC)
WHERE normalized_plate IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vehicle_events_camera_time 
ON vehicle_events (tenant_id, camera_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehicle_events_track 
ON vehicle_events (tenant_id, camera_id, track_id);

CREATE INDEX IF NOT EXISTS idx_vehicle_events_site_time 
ON vehicle_events (tenant_id, site_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehicle_events_type 
ON vehicle_events (tenant_id, vehicle_type, occurred_at DESC);

-- Index for fuzzy plate search (requires pg_trgm extension)
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX IF NOT EXISTS idx_vehicle_events_plate_trgm 
-- ON vehicle_events USING gin (normalized_plate gin_trgm_ops);

-- Partial index for high-confidence plates
CREATE INDEX IF NOT EXISTS idx_vehicle_events_high_conf_plates 
ON vehicle_events (tenant_id, normalized_plate, occurred_at DESC)
WHERE plate_confidence >= 0.8;

-- Comments
COMMENT ON TABLE vehicle_events IS 'Finalized vehicle sightings with ANPR data';
COMMENT ON COLUMN vehicle_events.normalized_plate IS 'Standardized plate number (uppercase, no spaces)';
COMMENT ON COLUMN vehicle_events.metadata IS 'Additional context: observations, alternatives, Re-ID features';
`;
