/**
 * Tailgating & Airlock Access Control Repository
 * 
 * PostgreSQL data access layer with robust in-memory fallback for airlock portals,
 * access control badge swipe events, tailgating violation incidents, and operator review audits.
 */

import type { Pool } from 'pg';
import type { TailgatingAnalysisResult, TailgatingViolationType } from './sequence-correlator.js';

export interface AirlockPortalRecord {
  id: string;
  tenant_id: string;
  name: string;
  branch_id?: string | null;
  camera_id?: string | null;
  outer_door_id: string;
  inner_door_id: string;
  chamber_zone: any;
  max_allowed_occupancy: number;
  correlation_window_seconds: number;
  interlock_mode: 'strict_interlock' | 'manual_release' | 'warning_only';
  auto_lock_inner_door: boolean;
  enabled: boolean;
  metadata?: any;
  created_at: Date;
  updated_at: Date;
}

export interface BadgeEventRecord {
  id: string;
  tenant_id: string;
  portal_id?: string | null;
  door_id: string;
  badge_id: string;
  user_id?: string | null;
  person_name?: string | null;
  event_type: 'granted' | 'denied' | 'forced' | 'held_open' | 'tailgating';
  authorized_count: number;
  direction: 'entry' | 'exit';
  metadata?: any;
  timestamp: Date;
  created_at: Date;
}

export interface TailgatingEventRecord {
  id: string;
  tenant_id: string;
  portal_id?: string | null;
  camera_id?: string | null;
  door_id: string;
  badge_id?: string | null;
  badge_holder_name?: string | null;
  detected_person_count: number;
  authorized_count: number;
  tailgater_count: number;
  violation_type: TailgatingViolationType;
  severity: 'P1' | 'P2' | 'P3';
  confidence: number;
  time_gap_ms: number;
  participant_track_ids: string[];
  bounding_boxes: any;
  sequence_timeline: any;
  interlock_lockdown_engaged: boolean;
  snapshot_reference?: string | null;
  review_status: 'pending' | 'confirmed' | 'false_positive' | 'escalated';
  reviewed_by?: string | null;
  reviewed_at?: Date | null;
  review_notes?: string | null;
  occurred_at: Date;
  created_at: Date;
  portal_name?: string;
  camera_name?: string;
}

export interface TailgatingConfigRecord {
  portal_id: string;
  tenant_id: string;
  enabled: boolean;
  sensitivity: number;
  min_confidence: number;
  max_time_gap_ms: number;
  correlation_window_seconds: number;
  max_allowed_occupancy: number;
  auto_lock_inner_door: boolean;
  alert_severity: 'P1' | 'P2' | 'P3';
  cooldown_seconds: number;
  created_at: Date;
  updated_at: Date;
}

export interface ListTailgatingEventsFilter {
  tenantId: string;
  portalId?: string;
  cameraId?: string;
  severity?: 'P1' | 'P2' | 'P3';
  reviewStatus?: 'pending' | 'confirmed' | 'false_positive' | 'escalated';
  violationType?: TailgatingViolationType;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export interface TailgatingStats {
  totalIncidents: number;
  pendingReviews: number;
  confirmedCount: number;
  falsePositiveCount: number;
  escalatedCount: number;
  interlockLockdowns: number;
  avgConfidence: number;
  p1Count: number;
  byViolationType: Record<string, number>;
}

export class TailgatingRepository {
  // In-memory persistent fallbacks when PostgreSQL tables are not yet migrated or running in memory
  private inMemoryEvents: TailgatingEventRecord[] = [];
  private inMemoryBadges: BadgeEventRecord[] = [];
  private inMemoryPortals: AirlockPortalRecord[] = [];
  private inMemoryConfigs: Map<string, TailgatingConfigRecord> = new Map();

  constructor(private readonly pool?: Pool) {
    this.seedDefaultPortals();
  }

  private seedDefaultPortals(): void {
    const defaultPortal: AirlockPortalRecord = {
      id: '11111111-1111-4111-8111-111111111111',
      tenant_id: '00000000-0000-4000-8000-000000000000',
      name: 'Vault Main Airlock Portal (Mantrap-A)',
      outerDoorId: 'DOOR-VAULT-OUTER',
      innerDoorId: 'DOOR-VAULT-INNER',
      chamberZone: [
        { x: 0.2, y: 0.2 },
        { x: 0.8, y: 0.2 },
        { x: 0.8, y: 0.8 },
        { x: 0.2, y: 0.8 },
      ],
      max_allowed_occupancy: 1,
      correlation_window_seconds: 10,
      interlock_mode: 'strict_interlock',
      auto_lock_inner_door: true,
      enabled: true,
      metadata: { location: 'Vault Vestibule Level B1' },
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.inMemoryPortals.push(defaultPortal);
  }

  /**
   * Save detected tailgating incident
   */
  async saveEvent(
    tenantId: string,
    portalId: string | undefined,
    cameraId: string | undefined,
    doorId: string,
    result: TailgatingAnalysisResult,
    occurredAt: Date,
    snapshotReference?: string
  ): Promise<TailgatingEventRecord> {
    if (!result.violationType) {
      throw new Error('Cannot save tailgating event without a valid violation type');
    }

    if (this.pool) {
      try {
        const query = `
          INSERT INTO tailgating_detection_events (
            tenant_id,
            portal_id,
            camera_id,
            door_id,
            badge_id,
            badge_holder_name,
            detected_person_count,
            authorized_count,
            tailgater_count,
            violation_type,
            severity,
            confidence,
            time_gap_ms,
            participant_track_ids,
            bounding_boxes,
            sequence_timeline,
            interlock_lockdown_engaged,
            snapshot_reference,
            review_status,
            occurred_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'pending', $19)
          RETURNING *;
        `;
        const values = [
          tenantId,
          portalId || null,
          cameraId || null,
          doorId,
          result.badgeId || null,
          result.badgeHolderName || null,
          result.detectedPersonCount,
          result.authorizedCount,
          result.tailgaterCount,
          result.violationType,
          result.severity,
          result.confidence,
          result.timeGapMs,
          result.participantTrackIds,
          JSON.stringify(result.boundingBoxes || []),
          JSON.stringify(result.sequenceTimeline || []),
          result.interlockLockdownEngaged,
          snapshotReference || null,
          occurredAt,
        ];
        const res = await this.pool.query(query, values);
        if (res.rows[0]) return res.rows[0];
      } catch (err) {
        // Fall back to memory store if table missing or database down
        console.warn('[TailgatingRepository] Falling back to in-memory store for saveEvent:', err);
      }
    }

    const eventRecord: TailgatingEventRecord = {
      id: (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `event-${Date.now()}`),
      tenant_id: tenantId,
      portal_id: portalId || null,
      camera_id: cameraId || null,
      door_id: doorId,
      badge_id: result.badgeId || null,
      badge_holder_name: result.badgeHolderName || null,
      detected_person_count: result.detectedPersonCount,
      authorized_count: result.authorizedCount,
      tailgater_count: result.tailgaterCount,
      violation_type: result.violationType,
      severity: result.severity,
      confidence: result.confidence,
      time_gap_ms: result.timeGapMs,
      participant_track_ids: result.participantTrackIds,
      bounding_boxes: result.boundingBoxes,
      sequence_timeline: result.sequenceTimeline,
      interlock_lockdown_engaged: result.interlockLockdownEngaged,
      snapshot_reference: snapshotReference || null,
      review_status: 'pending',
      reviewed_by: null,
      reviewed_at: null,
      review_notes: null,
      occurred_at: occurredAt,
      created_at: new Date(),
    };

    this.inMemoryEvents.unshift(eventRecord);
    return eventRecord;
  }

  /**
   * List tailgating incidents with comprehensive filters and pagination
   */
  async listEvents(filter: ListTailgatingEventsFilter): Promise<{ events: TailgatingEventRecord[]; total: number }> {
    if (this.pool) {
      try {
        const conditions: string[] = ['e.tenant_id = $1'];
        const values: any[] = [filter.tenantId];
        let idx = 2;

        if (filter.portalId) {
          conditions.push(`e.portal_id = $${idx++}`);
          values.push(filter.portalId);
        }
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
        if (filter.violationType) {
          conditions.push(`e.violation_type = $${idx++}`);
          values.push(filter.violationType);
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

        const countQuery = `SELECT COUNT(*) as total FROM tailgating_detection_events e WHERE ${whereClause};`;
        const countRes = await this.pool.query(countQuery, values);
        const total = parseInt(countRes.rows[0]?.total ?? '0', 10);

        const listQuery = `
          SELECT e.*, p.name as portal_name, c.name as camera_name
          FROM tailgating_detection_events e
          LEFT JOIN airlock_portals p ON e.portal_id = p.id
          LEFT JOIN cameras c ON e.camera_id = c.id
          WHERE ${whereClause}
          ORDER BY e.occurred_at DESC
          LIMIT $${idx++} OFFSET $${idx++};
        `;
        const listRes = await this.pool.query(listQuery, [...values, limit, offset]);

        return {
          events: listRes.rows,
          total,
        };
      } catch (err) {
        console.warn('[TailgatingRepository] Falling back to memory store for listEvents:', err);
      }
    }

    // In-memory filter implementation
    let filtered = this.inMemoryEvents.filter(e => e.tenant_id === filter.tenantId);
    if (filter.portalId) filtered = filtered.filter(e => e.portal_id === filter.portalId);
    if (filter.cameraId) filtered = filtered.filter(e => e.camera_id === filter.cameraId);
    if (filter.severity) filtered = filtered.filter(e => e.severity === filter.severity);
    if (filter.reviewStatus) filtered = filtered.filter(e => e.review_status === filter.reviewStatus);
    if (filter.violationType) filtered = filtered.filter(e => e.violation_type === filter.violationType);
    if (filter.fromDate) filtered = filtered.filter(e => new Date(e.occurred_at) >= filter.fromDate!);
    if (filter.toDate) filtered = filtered.filter(e => new Date(e.occurred_at) <= filter.toDate!);

    const limit = Math.min(100, Math.max(1, filter.limit ?? 50));
    const offset = Math.max(0, filter.offset ?? 0);

    return {
      events: filtered.slice(offset, offset + limit),
      total: filtered.length,
    };
  }

  /**
   * Get single event by ID
   */
  async getEventById(eventId: string, tenantId: string): Promise<TailgatingEventRecord | null> {
    if (this.pool) {
      try {
        const query = `
          SELECT e.*, p.name as portal_name, c.name as camera_name
          FROM tailgating_detection_events e
          LEFT JOIN airlock_portals p ON e.portal_id = p.id
          LEFT JOIN cameras c ON e.camera_id = c.id
          WHERE e.id = $1 AND e.tenant_id = $2;
        `;
        const res = await this.pool.query(query, [eventId, tenantId]);
        if (res.rows[0]) return res.rows[0];
      } catch (err) {
        console.warn('[TailgatingRepository] Falling back to memory store for getEventById:', err);
      }
    }

    return this.inMemoryEvents.find(e => e.id === eventId && e.tenant_id === tenantId) || null;
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
  ): Promise<TailgatingEventRecord | null> {
    if (this.pool) {
      try {
        const query = `
          UPDATE tailgating_detection_events
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
        if (res.rows[0]) return res.rows[0];
      } catch (err) {
        console.warn('[TailgatingRepository] Falling back to memory store for reviewEvent:', err);
      }
    }

    const item = this.inMemoryEvents.find(e => e.id === eventId && e.tenant_id === tenantId);
    if (!item) return null;
    item.review_status = reviewStatus;
    item.reviewed_by = reviewedBy;
    item.reviewed_at = new Date();
    item.review_notes = reviewNotes || null;
    return item;
  }

  /**
   * Save incoming badge swipe event
   */
  async saveBadgeEvent(tenantId: string, event: {
    portalId?: string;
    doorId: string;
    badgeId: string;
    userId?: string;
    personName?: string;
    eventType: 'granted' | 'denied' | 'forced' | 'held_open' | 'tailgating';
    authorizedCount?: number;
    direction?: 'entry' | 'exit';
    timestamp: Date;
    metadata?: any;
  }): Promise<BadgeEventRecord> {
    if (this.pool) {
      try {
        const query = `
          INSERT INTO access_control_badge_events (
            tenant_id,
            portal_id,
            door_id,
            badge_id,
            user_id,
            person_name,
            event_type,
            authorized_count,
            direction,
            timestamp,
            metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *;
        `;
        const values = [
          tenantId,
          event.portalId || null,
          event.doorId,
          event.badgeId,
          event.userId || null,
          event.personName || null,
          event.eventType,
          event.authorizedCount || 1,
          event.direction || 'entry',
          event.timestamp,
          JSON.stringify(event.metadata || {}),
        ];
        const res = await this.pool.query(query, values);
        if (res.rows[0]) return res.rows[0];
      } catch (err) {
        console.warn('[TailgatingRepository] Falling back to memory store for saveBadgeEvent:', err);
      }
    }

    const badgeRecord: BadgeEventRecord = {
      id: (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `badge-${Date.now()}`),
      tenant_id: tenantId,
      portal_id: event.portalId || null,
      door_id: event.doorId,
      badge_id: event.badgeId,
      user_id: event.userId || null,
      person_name: event.personName || null,
      event_type: event.eventType,
      authorized_count: event.authorizedCount || 1,
      direction: event.direction || 'entry',
      timestamp: event.timestamp,
      metadata: event.metadata || {},
      created_at: new Date(),
    };
    this.inMemoryBadges.unshift(badgeRecord);
    return badgeRecord;
  }

  /**
   * List recent badge events for door correlation window
   */
  async listRecentBadgeEvents(tenantId: string, doorId: string, windowMs = 30000): Promise<BadgeEventRecord[]> {
    const threshold = new Date(Date.now() - windowMs);
    if (this.pool) {
      try {
        const query = `
          SELECT *
          FROM access_control_badge_events
          WHERE tenant_id = $1 AND door_id = $2 AND timestamp >= $3
          ORDER BY timestamp DESC;
        `;
        const res = await this.pool.query(query, [tenantId, doorId, threshold]);
        return res.rows;
      } catch (err) {
        console.warn('[TailgatingRepository] Falling back to memory store for listRecentBadgeEvents:', err);
      }
    }

    return this.inMemoryBadges.filter(
      b => b.tenant_id === tenantId && b.door_id === doorId && new Date(b.timestamp) >= threshold
    );
  }

  /**
   * List airlock portals
   */
  async listPortals(tenantId: string): Promise<AirlockPortalRecord[]> {
    if (this.pool) {
      try {
        const query = `
          SELECT *
          FROM airlock_portals
          WHERE tenant_id = $1
          ORDER BY name ASC;
        `;
        const res = await this.pool.query(query, [tenantId]);
        if (res.rows.length > 0) return res.rows;
      } catch (err) {
        console.warn('[TailgatingRepository] Falling back to memory store for listPortals:', err);
      }
    }

    return this.inMemoryPortals.filter(p => p.tenant_id === tenantId);
  }

  /**
   * Get single portal by ID
   */
  async getPortalById(portalId: string, tenantId: string): Promise<AirlockPortalRecord | null> {
    if (this.pool) {
      try {
        const query = `
          SELECT *
          FROM airlock_portals
          WHERE id = $1 AND tenant_id = $2;
        `;
        const res = await this.pool.query(query, [portalId, tenantId]);
        if (res.rows[0]) return res.rows[0];
      } catch (err) {
        console.warn('[TailgatingRepository] Falling back to memory store for getPortalById:', err);
      }
    }

    return this.inMemoryPortals.find(p => p.id === portalId && p.tenant_id === tenantId) || null;
  }

  /**
   * Upsert airlock portal definition
   */
  async upsertPortal(portal: Partial<AirlockPortalRecord> & {
    tenant_id: string;
    name: string;
    outer_door_id: string;
    inner_door_id: string;
  }): Promise<AirlockPortalRecord> {
    const portalId = portal.id || (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `portal-${Date.now()}`);

    if (this.pool) {
      try {
        const query = `
          INSERT INTO airlock_portals (
            id,
            tenant_id,
            name,
            branch_id,
            camera_id,
            outer_door_id,
            inner_door_id,
            chamber_zone,
            max_allowed_occupancy,
            correlation_window_seconds,
            interlock_mode,
            auto_lock_inner_door,
            enabled,
            metadata,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            branch_id = EXCLUDED.branch_id,
            camera_id = EXCLUDED.camera_id,
            outer_door_id = EXCLUDED.outer_door_id,
            inner_door_id = EXCLUDED.inner_door_id,
            chamber_zone = EXCLUDED.chamber_zone,
            max_allowed_occupancy = EXCLUDED.max_allowed_occupancy,
            correlation_window_seconds = EXCLUDED.correlation_window_seconds,
            interlock_mode = EXCLUDED.interlock_mode,
            auto_lock_inner_door = EXCLUDED.auto_lock_inner_door,
            enabled = EXCLUDED.enabled,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
          RETURNING *;
        `;
        const values = [
          portalId,
          portal.tenant_id,
          portal.name,
          portal.branch_id || null,
          portal.camera_id || null,
          portal.outer_door_id,
          portal.inner_door_id,
          JSON.stringify(portal.chamber_zone || []),
          portal.max_allowed_occupancy || 1,
          portal.correlation_window_seconds || 10,
          portal.interlock_mode || 'strict_interlock',
          portal.auto_lock_inner_door ?? true,
          portal.enabled ?? true,
          JSON.stringify(portal.metadata || {}),
        ];
        const res = await this.pool.query(query, values);
        if (res.rows[0]) return res.rows[0];
      } catch (err) {
        console.warn('[TailgatingRepository] Falling back to memory store for upsertPortal:', err);
      }
    }

    const existingIdx = this.inMemoryPortals.findIndex(p => p.id === portalId);
    const newRecord: AirlockPortalRecord = {
      id: portalId,
      tenant_id: portal.tenant_id,
      name: portal.name,
      branch_id: portal.branch_id || null,
      camera_id: portal.camera_id || null,
      outerDoorId: portal.outer_door_id,
      innerDoorId: portal.inner_door_id,
      chamberZone: portal.chamber_zone || [],
      max_allowed_occupancy: portal.max_allowed_occupancy || 1,
      correlation_window_seconds: portal.correlation_window_seconds || 10,
      interlock_mode: portal.interlock_mode || 'strict_interlock',
      auto_lock_inner_door: portal.auto_lock_inner_door ?? true,
      enabled: portal.enabled ?? true,
      metadata: portal.metadata || {},
      created_at: existingIdx >= 0 ? this.inMemoryPortals[existingIdx]!.created_at : new Date(),
      updated_at: new Date(),
    };

    if (existingIdx >= 0) {
      this.inMemoryPortals[existingIdx] = newRecord;
    } else {
      this.inMemoryPortals.push(newRecord);
    }
    return newRecord;
  }

  /**
   * Get portal tailgating configuration
   */
  async getPortalConfig(portalId: string, tenantId: string): Promise<TailgatingConfigRecord | null> {
    if (this.pool) {
      try {
        const query = `SELECT * FROM tailgating_detection_configs WHERE portal_id = $1 AND tenant_id = $2;`;
        const res = await this.pool.query(query, [portalId, tenantId]);
        if (res.rows[0]) return res.rows[0];
      } catch (err) {
        console.warn('[TailgatingRepository] Falling back to memory store for getPortalConfig:', err);
      }
    }

    return this.inMemoryConfigs.get(`${tenantId}:${portalId}`) || null;
  }

  /**
   * Upsert portal tailgating configuration
   */
  async upsertPortalConfig(
    portalId: string,
    tenantId: string,
    config: Partial<TailgatingConfigRecord>
  ): Promise<TailgatingConfigRecord> {
    if (this.pool) {
      try {
        const query = `
          INSERT INTO tailgating_detection_configs (
            portal_id,
            tenant_id,
            enabled,
            sensitivity,
            min_confidence,
            max_time_gap_ms,
            correlation_window_seconds,
            max_allowed_occupancy,
            auto_lock_inner_door,
            alert_severity,
            cooldown_seconds,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
          ON CONFLICT (portal_id) DO UPDATE SET
            enabled = EXCLUDED.enabled,
            sensitivity = EXCLUDED.sensitivity,
            min_confidence = EXCLUDED.min_confidence,
            max_time_gap_ms = EXCLUDED.max_time_gap_ms,
            correlation_window_seconds = EXCLUDED.correlation_window_seconds,
            max_allowed_occupancy = EXCLUDED.max_allowed_occupancy,
            auto_lock_inner_door = EXCLUDED.auto_lock_inner_door,
            alert_severity = EXCLUDED.alert_severity,
            cooldown_seconds = EXCLUDED.cooldown_seconds,
            updated_at = NOW()
          RETURNING *;
        `;
        const values = [
          portalId,
          tenantId,
          config.enabled ?? true,
          config.sensitivity ?? 0.80,
          config.min_confidence ?? 0.75,
          config.max_time_gap_ms ?? 3000,
          config.correlation_window_seconds ?? 10,
          config.max_allowed_occupancy ?? 1,
          config.auto_lock_inner_door ?? true,
          config.alert_severity ?? 'P1',
          config.cooldown_seconds ?? 15,
        ];
        const res = await this.pool.query(query, values);
        if (res.rows[0]) return res.rows[0];
      } catch (err) {
        console.warn('[TailgatingRepository] Falling back to memory store for upsertPortalConfig:', err);
      }
    }

    const record: TailgatingConfigRecord = {
      portal_id: portalId,
      tenant_id: tenantId,
      enabled: config.enabled ?? true,
      sensitivity: config.sensitivity ?? 0.80,
      min_confidence: config.min_confidence ?? 0.75,
      max_time_gap_ms: config.max_time_gap_ms ?? 3000,
      correlation_window_seconds: config.correlation_window_seconds ?? 10,
      max_allowed_occupancy: config.max_allowed_occupancy ?? 1,
      auto_lock_inner_door: config.auto_lock_inner_door ?? true,
      alert_severity: config.alert_severity ?? 'P1',
      cooldown_seconds: config.cooldown_seconds ?? 15,
      created_at: new Date(),
      updated_at: new Date(),
    };

    this.inMemoryConfigs.set(`${tenantId}:${portalId}`, record);
    return record;
  }

  /**
   * Aggregate metrics and KPI statistics
   */
  async getStats(tenantId: string): Promise<TailgatingStats> {
    if (this.pool) {
      try {
        const query = `
          SELECT
            COUNT(*) as total_incidents,
            COUNT(*) FILTER (WHERE review_status = 'pending') as pending_reviews,
            COUNT(*) FILTER (WHERE review_status = 'confirmed') as confirmed_count,
            COUNT(*) FILTER (WHERE review_status = 'false_positive') as false_positive_count,
            COUNT(*) FILTER (WHERE review_status = 'escalated') as escalated_count,
            COUNT(*) FILTER (WHERE interlock_lockdown_engaged = true) as interlock_lockdowns,
            COUNT(*) FILTER (WHERE severity = 'P1') as p1_count,
            COALESCE(AVG(confidence), 0.85) as avg_confidence,
            jsonb_object_agg(COALESCE(violation_type, 'unknown'), count_type) as by_type
          FROM (
            SELECT violation_type, COUNT(*) as count_type
            FROM tailgating_detection_events
            WHERE tenant_id = $1
            GROUP BY violation_type
          ) sub,
          tailgating_detection_events
          WHERE tenant_id = $1;
        `;
        const res = await this.pool.query(query, [tenantId]);
        if (res.rows[0]) {
          const row = res.rows[0];
          return {
            totalIncidents: parseInt(row.total_incidents || '0', 10),
            pendingReviews: parseInt(row.pending_reviews || '0', 10),
            confirmedCount: parseInt(row.confirmed_count || '0', 10),
            falsePositiveCount: parseInt(row.false_positive_count || '0', 10),
            escalatedCount: parseInt(row.escalated_count || '0', 10),
            interlockLockdowns: parseInt(row.interlock_lockdowns || '0', 10),
            p1Count: parseInt(row.p1_count || '0', 10),
            avgConfidence: parseFloat(row.avg_confidence || '0.85'),
            byViolationType: row.by_type || {},
          };
        }
      } catch (err) {
        console.warn('[TailgatingRepository] Falling back to memory store for getStats:', err);
      }
    }

    const tenantEvents = this.inMemoryEvents.filter(e => e.tenant_id === tenantId);
    const byViolationType: Record<string, number> = {};
    for (const e of tenantEvents) {
      byViolationType[e.violation_type] = (byViolationType[e.violation_type] || 0) + 1;
    }

    const avgConfidence = tenantEvents.length > 0
      ? tenantEvents.reduce((sum, e) => sum + e.confidence, 0) / tenantEvents.length
      : 0.90;

    return {
      totalIncidents: tenantEvents.length,
      pendingReviews: tenantEvents.filter(e => e.review_status === 'pending').length,
      confirmedCount: tenantEvents.filter(e => e.review_status === 'confirmed').length,
      falsePositiveCount: tenantEvents.filter(e => e.review_status === 'false_positive').length,
      escalatedCount: tenantEvents.filter(e => e.review_status === 'escalated').length,
      interlockLockdowns: tenantEvents.filter(e => e.interlock_lockdown_engaged).length,
      p1Count: tenantEvents.filter(e => e.severity === 'P1').length,
      avgConfidence,
      byViolationType,
    };
  }
}
