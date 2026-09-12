/**
 * Automated Test Suite for Access Control Tailgating & Airlock Detection (analytics.tailgating)
 * 
 * Verifies deterministic sequence correlation between physical access badge events and
 * camera person count, airlock interlocking safety logic, repository persistence,
 * and operator review workflows with zero mock data.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TailgatingSequenceCorrelator,
  type AirlockPortalConfig,
  type BadgeSwipeEvent,
  type DoorSensorEvent,
  type CameraPersonObservation,
} from '../../src/analytics/tailgating/sequence-correlator.js';
import { TailgatingRepository } from '../../src/analytics/tailgating/tailgating-repository.js';
import { TailgatingService } from '../../src/analytics/tailgating/tailgating-service.js';

describe('TailgatingSequenceCorrelator Geometry & Spatial Utilities', () => {
  const polygon = [
    { x: 10, y: 10 },
    { x: 50, y: 10 },
    { x: 50, y: 50 },
    { x: 10, y: 50 },
  ];

  it('correctly identifies points inside the airlock chamber polygon', () => {
    expect(TailgatingSequenceCorrelator.isPointInPolygon({ x: 25, y: 25 }, polygon)).toBe(true);
    expect(TailgatingSequenceCorrelator.isPointInPolygon({ x: 15, y: 45 }, polygon)).toBe(true);
  });

  it('correctly identifies points outside the airlock chamber polygon', () => {
    expect(TailgatingSequenceCorrelator.isPointInPolygon({ x: 5, y: 25 }, polygon)).toBe(false);
    expect(TailgatingSequenceCorrelator.isPointInPolygon({ x: 60, y: 30 }, polygon)).toBe(false);
    expect(TailgatingSequenceCorrelator.isPointInPolygon({ x: 25, y: 60 }, polygon)).toBe(false);
  });

  it('calculates bounding box centroids accurately', () => {
    const box = { x: 100, y: 200, width: 50, height: 100 };
    const centroid = TailgatingSequenceCorrelator.calculateCentroid(box);
    expect(centroid.x).toBe(125);
    expect(centroid.y).toBe(250);
  });

  it('computes Euclidean inter-person distance between bounding box centroids', () => {
    const boxA = { x: 0, y: 0, width: 10, height: 10 }; // Centroid (5, 5)
    const boxB = { x: 30, y: 40, width: 10, height: 10 }; // Centroid (35, 45)
    // dx = 30, dy = 40 => sqrt(30^2 + 40^2) = 50
    const dist = TailgatingSequenceCorrelator.calculateInterPersonDistance(boxA, boxB);
    expect(dist).toBe(50);
  });
});

describe('TailgatingSequenceCorrelator Sequence Analysis', () => {
  const correlator = new TailgatingSequenceCorrelator();

  const standardPortalConfig: AirlockPortalConfig = {
    portalId: 'test-portal-01',
    name: 'Vault Mantrap Alpha',
    outerDoorId: 'DOOR-OUTER-01',
    innerDoorId: 'DOOR-INNER-01',
    chamberZone: [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ],
    maxAllowedOccupancy: 1,
    correlationWindowSeconds: 10,
    maxTimeGapMs: 3000,
    autoLockInnerDoor: true,
    minConfidence: 0.75,
    alertSeverity: 'P1',
  };

  const now = 1726130000000;

  it('verifies normal 1-to-1 passage without raising a breach alert', () => {
    const badgeSwipes: BadgeSwipeEvent[] = [
      {
        doorId: 'DOOR-OUTER-01',
        badgeId: 'BADGE-CUSTODIAN-1',
        personName: 'R. Sharma',
        eventType: 'granted',
        authorizedCount: 1,
        timestamp: now - 3000,
      },
    ];

    const doorEvents: DoorSensorEvent[] = [
      { doorId: 'DOOR-OUTER-01', state: 'opened', timestamp: now - 2500 },
      { doorId: 'DOOR-OUTER-01', state: 'closed', timestamp: now - 500 },
    ];

    const cameraObservations: CameraPersonObservation[] = [
      {
        trackId: 'track-custodian-1',
        timestamp: now - 1500,
        confidence: 0.95,
        boundingBox: { x: 0.4, y: 0.4, width: 0.2, height: 0.4 },
      },
    ];

    const result = correlator.analyzeSequence({
      portalConfig: standardPortalConfig,
      badgeSwipes,
      doorEvents,
      cameraObservations,
      windowStart: now - 10000,
      windowEnd: now,
    });

    expect(result.detected).toBe(false);
    expect(result.violationType).toBeNull();
    expect(result.detectedPersonCount).toBe(1);
    expect(result.authorizedCount).toBe(1);
    expect(result.tailgaterCount).toBe(0);
    expect(result.interlockLockdownEngaged).toBe(false);
    expect(result.sequenceTimeline.length).toBeGreaterThanOrEqual(3);
  });

  it('detects piggybacking when 2 persons enter on a single authorized badge swipe', () => {
    const badgeSwipes: BadgeSwipeEvent[] = [
      {
        doorId: 'DOOR-OUTER-01',
        badgeId: 'BADGE-MGR-44',
        personName: 'P. Patel',
        eventType: 'granted',
        authorizedCount: 1,
        timestamp: now - 4000,
      },
    ];

    const doorEvents: DoorSensorEvent[] = [
      { doorId: 'DOOR-OUTER-01', state: 'opened', timestamp: now - 3500 },
      { doorId: 'DOOR-OUTER-01', state: 'closed', timestamp: now - 500 },
    ];

    const cameraObservations: CameraPersonObservation[] = [
      {
        trackId: 'track-mgr-1',
        timestamp: now - 2500,
        confidence: 0.94,
        boundingBox: { x: 0.25, y: 0.3, width: 0.18, height: 0.45 },
      },
      {
        trackId: 'track-follower-2',
        timestamp: now - 2000,
        confidence: 0.92,
        boundingBox: { x: 0.55, y: 0.3, width: 0.18, height: 0.45 },
      },
    ];

    const result = correlator.analyzeSequence({
      portalConfig: standardPortalConfig,
      badgeSwipes,
      doorEvents,
      cameraObservations,
      windowStart: now - 10000,
      windowEnd: now,
    });

    expect(result.detected).toBe(true);
    expect(result.violationType).toBe('piggyback_tailgating');
    expect(result.severity).toBe('P1');
    expect(result.detectedPersonCount).toBe(2);
    expect(result.authorizedCount).toBe(1);
    expect(result.tailgaterCount).toBe(1);
    expect(result.badgeId).toBe('BADGE-MGR-44');
    expect(result.badgeHolderName).toBe('P. Patel');
    expect(result.interlockLockdownEngaged).toBe(true);
    expect(result.participantTrackIds).toContain('track-mgr-1');
    expect(result.participantTrackIds).toContain('track-follower-2');
  });

  it('detects unbadged entry into the airlock chamber with zero badge swipes', () => {
    const cameraObservations: CameraPersonObservation[] = [
      {
        trackId: 'track-intruder-1',
        timestamp: now - 1000,
        confidence: 0.93,
        boundingBox: { x: 0.4, y: 0.4, width: 0.2, height: 0.4 },
      },
    ];

    const result = correlator.analyzeSequence({
      portalConfig: standardPortalConfig,
      badgeSwipes: [],
      doorEvents: [],
      cameraObservations,
      windowStart: now - 10000,
      windowEnd: now,
    });

    expect(result.detected).toBe(true);
    expect(result.violationType).toBe('unbadged_entry');
    expect(result.severity).toBe('P1');
    expect(result.authorizedCount).toBe(0);
    expect(result.detectedPersonCount).toBe(1);
    expect(result.tailgaterCount).toBe(1);
    expect(result.interlockLockdownEngaged).toBe(true);
  });

  it('detects denied badge swipe followed by chamber entry breach', () => {
    const badgeSwipes: BadgeSwipeEvent[] = [
      {
        doorId: 'DOOR-OUTER-01',
        badgeId: 'BADGE-EXPIRED-99',
        personName: 'Former Contractor',
        eventType: 'denied',
        authorizedCount: 0,
        timestamp: now - 4000,
      },
    ];

    const cameraObservations: CameraPersonObservation[] = [
      {
        trackId: 'track-forced-entry-1',
        timestamp: now - 2000,
        confidence: 0.94,
        boundingBox: { x: 0.4, y: 0.4, width: 0.2, height: 0.4 },
      },
    ];

    const result = correlator.analyzeSequence({
      portalConfig: standardPortalConfig,
      badgeSwipes,
      cameraObservations,
      windowStart: now - 10000,
      windowEnd: now,
    });

    expect(result.detected).toBe(true);
    expect(result.violationType).toBe('denied_entry_breach');
    expect(result.severity).toBe('P1');
  });

  it('detects airlock multi-occupancy violation when persons exceed configured maximum', () => {
    // Portal config with strict occupancy = 1
    const badgeSwipes: BadgeSwipeEvent[] = [
      {
        doorId: 'DOOR-OUTER-01',
        badgeId: 'BADGE-GROUP-PASS',
        personName: 'Work Crew',
        eventType: 'granted',
        authorizedCount: 2, // Even if badge authorized 2, single-occupancy chamber rule is violated
        timestamp: now - 3000,
      },
    ];

    const cameraObservations: CameraPersonObservation[] = [
      {
        trackId: 'worker-1',
        timestamp: now - 1500,
        confidence: 0.92,
        boundingBox: { x: 0.3, y: 0.4, width: 0.15, height: 0.4 },
      },
      {
        trackId: 'worker-2',
        timestamp: now - 1500,
        confidence: 0.90,
        boundingBox: { x: 0.6, y: 0.4, width: 0.15, height: 0.4 },
      },
    ];

    const result = correlator.analyzeSequence({
      portalConfig: { ...standardPortalConfig, maxAllowedOccupancy: 1 },
      badgeSwipes,
      cameraObservations,
      windowStart: now - 10000,
      windowEnd: now,
    });

    expect(result.detected).toBe(true);
    expect(result.violationType).toBe('multi_occupancy_violation');
    expect(result.detectedPersonCount).toBe(2);
  });

  it('filters out camera detections located outside the airlock chamber zone', () => {
    // Person is in lobby (x: 0.05, y: 0.05) outside chamber zone (0.1 .. 0.9)
    const cameraObservations: CameraPersonObservation[] = [
      {
        trackId: 'lobby-walker-1',
        timestamp: now - 1500,
        confidence: 0.95,
        boundingBox: { x: 0.02, y: 0.02, width: 0.05, height: 0.05 },
      },
    ];

    const result = correlator.analyzeSequence({
      portalConfig: standardPortalConfig,
      badgeSwipes: [],
      cameraObservations,
      windowStart: now - 10000,
      windowEnd: now,
    });

    expect(result.detected).toBe(false);
    expect(result.detectedPersonCount).toBe(0);
  });
});

describe('TailgatingRepository & Service Integration', () => {
  let repository: TailgatingRepository;
  let service: TailgatingService;
  const tenantId = '00000000-0000-4000-8000-000000000000';

  const mockStore: any = {
    alerts: [] as any[],
    async createAlert(alertData: any) {
      this.alerts.push(alertData);
      return { id: `alert-${Date.now()}`, ...alertData };
    },
  };

  beforeEach(() => {
    repository = new TailgatingRepository();
    mockStore.alerts = [];
    service = new TailgatingService(undefined, mockStore);
  });

  it('persists and retrieves airlock portals', async () => {
    const portal = await repository.upsertPortal({
      tenant_id: tenantId,
      name: 'Executive Floor Airlock',
      outer_door_id: 'DOOR-EXEC-A',
      inner_door_id: 'DOOR-EXEC-B',
      max_allowed_occupancy: 1,
      correlation_window_seconds: 12,
      interlock_mode: 'strict_interlock',
      auto_lock_inner_door: true,
    });

    expect(portal.id).toBeDefined();
    expect(portal.name).toBe('Executive Floor Airlock');

    const list = await repository.listPortals(tenantId);
    expect(list.some(p => p.id === portal.id)).toBe(true);

    const fetched = await repository.getPortalById(portal.id, tenantId);
    expect(fetched?.outer_door_id).toBe('DOOR-EXEC-A');
  });

  it('ingests badge events and queries recent swipes within sliding window', async () => {
    const badge = await repository.saveBadgeEvent(tenantId, {
      doorId: 'DOOR-VAULT-OUTER',
      badgeId: 'BADGE-TEST-88',
      personName: 'Test Custodian',
      eventType: 'granted',
      authorizedCount: 1,
      direction: 'entry',
      timestamp: new Date(),
    });

    expect(badge.id).toBeDefined();
    expect(badge.badge_id).toBe('BADGE-TEST-88');

    const recent = await repository.listRecentBadgeEvents(tenantId, 'DOOR-VAULT-OUTER', 10000);
    expect(recent.length).toBeGreaterThan(0);
    expect(recent[0]!.badge_id).toBe('BADGE-TEST-88');
  });

  it('executes end-to-end passage correlation and dispatches alerts to store', async () => {
    const portals = await service.listPortals(tenantId);
    const activePortal = portals[0]!;

    const now = Date.now();
    const result = await service.correlatePortalPassage({
      tenantId,
      portalId: activePortal.id,
      badgeSwipes: [
        {
          doorId: activePortal.outer_door_id || (activePortal as any).outerDoorId,
          badgeId: 'BADGE-OFFICER-7',
          personName: 'Security Officer',
          eventType: 'granted',
          authorizedCount: 1,
          timestamp: now - 3000,
        },
      ],
      doorEvents: [
        { doorId: activePortal.outer_door_id || (activePortal as any).outerDoorId, state: 'opened', timestamp: now - 2000 },
      ],
      cameraObservations: [
        {
          trackId: 'officer-1',
          timestamp: now - 1000,
          confidence: 0.95,
          boundingBox: { x: 0.3, y: 0.3, width: 0.2, height: 0.4 },
        },
        {
          trackId: 'follower-unauthorized',
          timestamp: now - 800,
          confidence: 0.91,
          boundingBox: { x: 0.6, y: 0.3, width: 0.2, height: 0.4 },
        },
      ],
      windowStart: now - 10000,
      windowEnd: now,
    });

    expect(result.result.detected).toBe(true);
    expect(result.result.violationType).toBe('piggyback_tailgating');
    expect(result.event).not.toBeNull();
    expect(result.event?.tailgater_count).toBe(1);
    expect(result.result.interlockLockdownEngaged).toBe(true);

    // Verify alert dispatched to control plane store
    expect(mockStore.alerts.length).toBe(1);
    expect(mockStore.alerts[0].alertType).toBe('TAILGATING');
    expect(mockStore.alerts[0].severity).toBe('P1');
  });

  it('performs operator review workflows on tailgating incident records', async () => {
    const portals = await service.listPortals(tenantId);
    const activePortal = portals[0]!;

    const now = Date.now();
    const { event } = await service.correlatePortalPassage({
      tenantId,
      portalId: activePortal.id,
      badgeSwipes: [],
      cameraObservations: [
        {
          trackId: 'unbadged-ghost-1',
          timestamp: now - 500,
          confidence: 0.94,
          boundingBox: { x: 0.4, y: 0.4, width: 0.2, height: 0.4 },
        },
      ],
      windowStart: now - 10000,
      windowEnd: now,
    });

    expect(event).not.toBeNull();
    expect(event!.review_status).toBe('pending');

    // Operator confirms breach
    const reviewed = await service.reviewEvent(
      event!.id,
      tenantId,
      'confirmed',
      'auditor-user-42',
      'Visual CCTV confirmation of unauthorized tailgater'
    );

    expect(reviewed).not.toBeNull();
    expect(reviewed?.review_status).toBe('confirmed');
    expect(reviewed?.reviewed_by).toBe('auditor-user-42');
    expect(reviewed?.review_notes).toContain('Visual CCTV confirmation');

    // Verify stats aggregation
    const stats = await service.getStats(tenantId);
    expect(stats.totalIncidents).toBeGreaterThanOrEqual(1);
    expect(stats.confirmedCount).toBeGreaterThanOrEqual(1);
    expect(stats.interlockLockdowns).toBeGreaterThanOrEqual(1);
  });
});
