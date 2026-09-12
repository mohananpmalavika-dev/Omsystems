/**
 * Tailgating & Airlock Access Control Service
 * 
 * Orchestrates sequence correlation between physical access control badge swipes
 * and camera person detections, triggers airlock interlock lockdowns, persists audit
 * records, and dispatches surveillance security alerts.
 */

import type { Pool } from 'pg';
import {
  TailgatingSequenceCorrelator,
  type AirlockPortalConfig,
  type BadgeSwipeEvent,
  type DoorSensorEvent,
  type CameraPersonObservation,
  type TailgatingAnalysisResult,
} from './sequence-correlator.js';
import {
  TailgatingRepository,
  type AirlockPortalRecord,
  type BadgeEventRecord,
  type TailgatingEventRecord,
  type TailgatingConfigRecord,
  type ListTailgatingEventsFilter,
  type TailgatingStats,
} from './tailgating-repository.js';
import type { ControlPlaneStore } from '../../control-plane-store.js';

export interface CorrelatePassageInput {
  tenantId: string;
  portalId: string;
  badgeSwipes?: BadgeSwipeEvent[];
  doorEvents?: DoorSensorEvent[];
  cameraObservations?: CameraPersonObservation[];
  snapshotReference?: string;
  windowStart?: number;
  windowEnd?: number;
}

export class TailgatingService {
  private readonly repository: TailgatingRepository;
  private readonly correlator: TailgatingSequenceCorrelator;

  constructor(
    pool?: Pool,
    private readonly store?: ControlPlaneStore
  ) {
    this.repository = new TailgatingRepository(pool);
    this.correlator = new TailgatingSequenceCorrelator();
  }

  public getRepository(): TailgatingRepository {
    return this.repository;
  }

  /**
   * Run full sequence correlation on an airlock portal
   */
  public async correlatePortalPassage(
    input: CorrelatePassageInput
  ): Promise<{ result: TailgatingAnalysisResult; event: TailgatingEventRecord | null }> {
    const portal = await this.repository.getPortalById(input.portalId, input.tenantId);
    if (!portal) {
      throw new Error(`Airlock portal '${input.portalId}' not found for tenant '${input.tenantId}'`);
    }

    const config = await this.repository.getPortalConfig(input.portalId, input.tenantId);

    const portalConfig: AirlockPortalConfig = {
      portalId: portal.id,
      name: portal.name,
      outerDoorId: portal.outer_door_id || (portal as any).outerDoorId,
      innerDoorId: portal.inner_door_id || (portal as any).innerDoorId,
      chamberZone: portal.chamber_zone || (portal as any).chamberZone || [],
      maxAllowedOccupancy: config?.max_allowed_occupancy ?? portal.max_allowed_occupancy ?? 1,
      correlationWindowSeconds: config?.correlation_window_seconds ?? portal.correlation_window_seconds ?? 10,
      maxTimeGapMs: config?.max_time_gap_ms ?? 3000,
      autoLockInnerDoor: config?.auto_lock_inner_door ?? portal.auto_lock_inner_door ?? true,
      minConfidence: config ? Number(config.min_confidence) : 0.75,
      alertSeverity: config?.alert_severity ?? 'P1',
    };

    // If explicit badge swipes were not passed in payload, fetch recent swipes from database
    let swipes = input.badgeSwipes;
    if (!swipes || swipes.length === 0) {
      const windowMs = portalConfig.correlationWindowSeconds * 1000;
      const recentBadgeRows = await this.repository.listRecentBadgeEvents(
        input.tenantId,
        portalConfig.outerDoorId,
        windowMs
      );
      swipes = recentBadgeRows.map(r => ({
        id: r.id,
        doorId: r.door_id,
        badgeId: r.badge_id,
        personName: r.person_name || undefined,
        userId: r.user_id || undefined,
        eventType: r.event_type,
        authorizedCount: r.authorized_count,
        timestamp: new Date(r.timestamp).getTime(),
        direction: r.direction,
      }));
    }

    const result = this.correlator.analyzeSequence({
      portalConfig,
      badgeSwipes: swipes || [],
      doorEvents: input.doorEvents || [],
      cameraObservations: input.cameraObservations || [],
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
    });

    let savedEvent: TailgatingEventRecord | null = null;

    if (result.detected && result.violationType) {
      const occurredAt = new Date(input.windowEnd || Date.now());
      savedEvent = await this.repository.saveEvent(
        input.tenantId,
        portal.id,
        portal.camera_id || undefined,
        portalConfig.outerDoorId,
        result,
        occurredAt,
        input.snapshotReference
      );

      // Dispatch surveillance alert to control-plane alert manager
      if (this.store && typeof (this.store as any).createAlert === 'function') {
        try {
          await (this.store as any).createAlert({
            tenantId: input.tenantId,
            cameraId: portal.camera_id || undefined,
            alertType: 'TAILGATING',
            severity: result.severity,
            title: `Access Control Tailgating Breach (${result.severity})`,
            description: `${result.explanation} Inner door interlock lockdown: ${result.interlockLockdownEngaged ? 'ACTIVE' : 'INACTIVE'}.`,
            metadata: {
              tailgatingEventId: savedEvent.id,
              portalId: portal.id,
              portalName: portal.name,
              outerDoorId: portalConfig.outerDoorId,
              innerDoorId: portalConfig.innerDoorId,
              violationType: result.violationType,
              detectedPersonCount: result.detectedPersonCount,
              authorizedCount: result.authorizedCount,
              tailgaterCount: result.tailgaterCount,
              badgeId: result.badgeId,
              badgeHolderName: result.badgeHolderName,
              interlockLockdownEngaged: result.interlockLockdownEngaged,
              participantTrackIds: result.participantTrackIds,
            },
            snapshotReference: input.snapshotReference,
            occurredAt,
          });
        } catch (alertErr) {
          console.error('[TailgatingService] Failed to dispatch alert to store:', alertErr);
        }
      }
    }

    return { result, event: savedEvent };
  }

  /**
   * Ingest an access control badge event
   */
  public async recordBadgeSwipe(
    tenantId: string,
    event: {
      portalId?: string;
      doorId: string;
      badgeId: string;
      userId?: string;
      personName?: string;
      eventType: 'granted' | 'denied' | 'forced' | 'held_open' | 'tailgating';
      authorizedCount?: number;
      direction?: 'entry' | 'exit';
      timestamp?: Date | number;
      metadata?: any;
    }
  ): Promise<BadgeEventRecord> {
    const timestamp = event.timestamp
      ? (typeof event.timestamp === 'number' ? new Date(event.timestamp) : event.timestamp)
      : new Date();

    return this.repository.saveBadgeEvent(tenantId, {
      ...event,
      timestamp,
    });
  }

  public async listEvents(filter: ListTailgatingEventsFilter): Promise<{ events: TailgatingEventRecord[]; total: number }> {
    return this.repository.listEvents(filter);
  }

  public async getEventById(eventId: string, tenantId: string): Promise<TailgatingEventRecord | null> {
    return this.repository.getEventById(eventId, tenantId);
  }

  public async reviewEvent(
    eventId: string,
    tenantId: string,
    reviewStatus: 'confirmed' | 'false_positive' | 'escalated',
    reviewedBy: string,
    reviewNotes?: string
  ): Promise<TailgatingEventRecord | null> {
    return this.repository.reviewEvent(eventId, tenantId, reviewStatus, reviewedBy, reviewNotes);
  }

  public async listPortals(tenantId: string): Promise<AirlockPortalRecord[]> {
    return this.repository.listPortals(tenantId);
  }

  public async getPortalById(portalId: string, tenantId: string): Promise<AirlockPortalRecord | null> {
    return this.repository.getPortalById(portalId, tenantId);
  }

  public async upsertPortal(portal: Partial<AirlockPortalRecord> & {
    tenant_id: string;
    name: string;
    outer_door_id: string;
    inner_door_id: string;
  }): Promise<AirlockPortalRecord> {
    return this.repository.upsertPortal(portal);
  }

  public async getPortalConfig(portalId: string, tenantId: string): Promise<TailgatingConfigRecord | null> {
    return this.repository.getPortalConfig(portalId, tenantId);
  }

  public async updatePortalConfig(
    portalId: string,
    tenantId: string,
    config: Partial<TailgatingConfigRecord>
  ): Promise<TailgatingConfigRecord> {
    return this.repository.upsertPortalConfig(portalId, tenantId, config);
  }

  public async getStats(tenantId: string): Promise<TailgatingStats> {
    return this.repository.getStats(tenantId);
  }
}
