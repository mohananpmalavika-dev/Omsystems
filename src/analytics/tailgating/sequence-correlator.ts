/**
 * Sequence Correlation Engine for Access Control Tailgating Detection
 * 
 * Production-ready deterministic sequence correlator between electronic badge swipe events,
 * door contact transitions, and overhead/interior camera person counts in airlock doors and mantraps.
 */

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CameraPersonObservation {
  trackId: string;
  timestamp: number;
  boundingBox: BoundingBox;
  confidence: number;
  inChamber?: boolean;
}

export interface BadgeSwipeEvent {
  id?: string;
  doorId: string;
  badgeId: string;
  personName?: string;
  userId?: string;
  eventType: 'granted' | 'denied' | 'forced' | 'held_open' | 'tailgating';
  authorizedCount: number;
  timestamp: number;
  direction?: 'entry' | 'exit';
  metadata?: Record<string, unknown>;
}

export interface DoorSensorEvent {
  doorId: string;
  state: 'opened' | 'closed' | 'held_open' | 'forced';
  timestamp: number;
}

export interface AirlockPortalConfig {
  portalId: string;
  name: string;
  outerDoorId: string;
  innerDoorId: string;
  chamberZone?: Point[];
  maxAllowedOccupancy: number;
  correlationWindowSeconds: number;
  maxTimeGapMs: number;
  autoLockInnerDoor: boolean;
  minConfidence: number;
  alertSeverity: 'P1' | 'P2' | 'P3';
}

export interface SequenceTimelineStep {
  timestamp: number;
  relativeOffsetMs: number;
  type: 'badge_swipe' | 'door_state' | 'camera_person_count' | 'violation_detected' | 'interlock_lockdown';
  label: string;
  details: Record<string, any>;
}

export type TailgatingViolationType =
  | 'piggyback_tailgating'
  | 'unbadged_entry'
  | 'denied_entry_breach'
  | 'multi_occupancy_violation'
  | 'door_held_breach';

export interface TailgatingAnalysisResult {
  detected: boolean;
  violationType: TailgatingViolationType | null;
  severity: 'P1' | 'P2' | 'P3';
  confidence: number;
  detectedPersonCount: number;
  authorizedCount: number;
  tailgaterCount: number;
  badgeId?: string;
  badgeHolderName?: string;
  timeGapMs: number;
  participantTrackIds: string[];
  boundingBoxes: BoundingBox[];
  interlockLockdownEngaged: boolean;
  sequenceTimeline: SequenceTimelineStep[];
  explanation: string;
}

/**
 * Deterministic Sequence Correlator for Airlock Doors / Mantraps
 */
export class TailgatingSequenceCorrelator {
  /**
   * Test whether a point (x,y in 0..1 or pixel space) is inside a polygon boundary
   */
  public static isPointInPolygon(point: Point, polygon: Point[]): boolean {
    if (!polygon || polygon.length < 3) return true; // If no boundary defined, assume whole frame

    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i]!.x;
      const yi = polygon[i]!.y;
      const xj = polygon[j]!.x;
      const yj = polygon[j]!.y;

      const intersect =
        yi > point.y !== yj > point.y &&
        point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Calculate centroid of a bounding box
   */
  public static calculateCentroid(box: BoundingBox): Point {
    return {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    };
  }

  /**
   * Calculate Euclidean distance between two bounding box centroids
   */
  public static calculateInterPersonDistance(boxA: BoundingBox, boxB: BoundingBox): number {
    const cA = TailgatingSequenceCorrelator.calculateCentroid(boxA);
    const cB = TailgatingSequenceCorrelator.calculateCentroid(boxB);
    const dx = cA.x - cB.x;
    const dy = cA.y - cB.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Perform sequence correlation analysis for an airlock portal
   */
  public analyzeSequence(input: {
    portalConfig: AirlockPortalConfig;
    badgeSwipes: BadgeSwipeEvent[];
    doorEvents?: DoorSensorEvent[];
    cameraObservations: CameraPersonObservation[];
    windowStart?: number;
    windowEnd?: number;
  }): TailgatingAnalysisResult {
    const { portalConfig, badgeSwipes, doorEvents = [], cameraObservations } = input;

    // 1. Establish temporal window
    const now = Date.now();
    const windowEnd = input.windowEnd ?? now;
    const windowStart = input.windowStart ?? (windowEnd - portalConfig.correlationWindowSeconds * 1000);

    // Filter events strictly within correlation window
    const relevantSwipes = badgeSwipes
      .filter(s => s.timestamp >= windowStart && s.timestamp <= windowEnd)
      .sort((a, b) => a.timestamp - b.timestamp);

    const relevantDoorEvents = doorEvents
      .filter(d => d.timestamp >= windowStart && d.timestamp <= windowEnd)
      .sort((a, b) => a.timestamp - b.timestamp);

    const relevantObservations = cameraObservations
      .filter(c => c.timestamp >= windowStart && c.timestamp <= windowEnd)
      .sort((a, b) => a.timestamp - b.timestamp);

    // 2. Filter camera observations by airlock chamber polygon
    const chamberObs = relevantObservations.filter(obs => {
      if (!portalConfig.chamberZone || portalConfig.chamberZone.length < 3) {
        return true;
      }
      const centroid = TailgatingSequenceCorrelator.calculateCentroid(obs.boundingBox);
      return TailgatingSequenceCorrelator.isPointInPolygon(centroid, portalConfig.chamberZone);
    });

    // Determine unique tracks and peak simultaneous person count
    const uniqueTracks = Array.from(new Set(chamberObs.map(o => o.trackId)));
    
    // Group observations into temporal snapshots (within 500ms bins) to compute max simultaneous occupancy
    const timeBins = new Map<number, Set<string>>();
    for (const obs of chamberObs) {
      const bin = Math.floor(obs.timestamp / 500) * 500;
      if (!timeBins.has(bin)) timeBins.set(bin, new Set());
      timeBins.get(bin)!.add(obs.trackId);
    }

    let peakSimultaneousCount = 0;
    for (const tracksInBin of timeBins.values()) {
      if (tracksInBin.size > peakSimultaneousCount) {
        peakSimultaneousCount = tracksInBin.size;
      }
    }

    // Default to unique tracks observed in the chamber if continuous clustering was too short
    const detectedPersonCount = Math.max(peakSimultaneousCount, uniqueTracks.length);

    // 3. Evaluate authorized access credential events
    const grantedSwipes = relevantSwipes.filter(
      s => s.doorId === portalConfig.outerDoorId && s.eventType === 'granted'
    );
    const deniedSwipes = relevantSwipes.filter(
      s => s.doorId === portalConfig.outerDoorId && s.eventType === 'denied'
    );
    const heldOpenDoor = relevantDoorEvents.find(
      d => d.doorId === portalConfig.outerDoorId && (d.state === 'held_open' || d.state === 'forced')
    );

    const totalAuthorizedCount = grantedSwipes.reduce((sum, s) => sum + Math.max(1, s.authorizedCount || 1), 0);
    const primarySwipe = grantedSwipes[0];

    // 4. Construct chronological timeline
    const baselineTime = Math.min(
      ...[
        ...relevantSwipes.map(s => s.timestamp),
        ...relevantDoorEvents.map(d => d.timestamp),
        ...relevantObservations.map(o => o.timestamp),
        now,
      ]
    );

    const timeline: SequenceTimelineStep[] = [];

    // Add badge events to timeline
    for (const swipe of relevantSwipes) {
      timeline.push({
        timestamp: swipe.timestamp,
        relativeOffsetMs: swipe.timestamp - baselineTime,
        type: 'badge_swipe',
        label: `Badge ${swipe.badgeId} (${swipe.eventType.toUpperCase()}) at Door ${swipe.doorId}`,
        details: {
          badgeId: swipe.badgeId,
          doorId: swipe.doorId,
          eventType: swipe.eventType,
          personName: swipe.personName,
          authorizedCount: swipe.authorizedCount,
        },
      });
    }

    // Add door events to timeline
    for (const door of relevantDoorEvents) {
      timeline.push({
        timestamp: door.timestamp,
        relativeOffsetMs: door.timestamp - baselineTime,
        type: 'door_state',
        label: `Door ${door.doorId} state changed to ${door.state.toUpperCase()}`,
        details: { doorId: door.doorId, state: door.state },
      });
    }

    // Add camera detection summary
    if (chamberObs.length > 0) {
      const firstObs = chamberObs[0]!;
      timeline.push({
        timestamp: firstObs.timestamp,
        relativeOffsetMs: firstObs.timestamp - baselineTime,
        type: 'camera_person_count',
        label: `Camera detected ${detectedPersonCount} person(s) inside airlock chamber (Tracks: ${uniqueTracks.join(', ')})`,
        details: {
          detectedPersonCount,
          trackIds: uniqueTracks,
          chamberConfined: true,
        },
      });
    }

    // 5. Sequence Correlation Analysis & Violation Classification
    let detected = false;
    let violationType: TailgatingViolationType | null = null;
    let explanation = 'Authorized passage sequence verified; person count matches badge authorizations.';
    let timeGapMs = 0;
    let confidence = 0.90;

    // Calculate time gap between first valid swipe and subsequent follower
    if (chamberObs.length > 0 && primarySwipe) {
      const earliestFollowerObs = chamberObs.find(o => o.trackId !== uniqueTracks[0]);
      if (earliestFollowerObs) {
        timeGapMs = Math.max(0, earliestFollowerObs.timestamp - primarySwipe.timestamp);
      } else {
        timeGapMs = Math.max(0, chamberObs[0]!.timestamp - primarySwipe.timestamp);
      }
    }

    // Check Violation Rules
    if (detectedPersonCount > 0 && totalAuthorizedCount === 0 && deniedSwipes.length > 0) {
      // Rule A: Denied access attempt followed by person entering the airlock chamber
      detected = true;
      violationType = 'denied_entry_breach';
      confidence = 0.96;
      explanation = `Denied badge swipe by ${deniedSwipes[0]!.badgeId} was followed by unauthorized chamber entry of ${detectedPersonCount} person(s).`;
    } else if (detectedPersonCount > 0 && totalAuthorizedCount === 0) {
      // Rule B: Unbadged entry / Forced entry into airlock chamber with zero badge authorizations
      detected = true;
      violationType = 'unbadged_entry';
      confidence = 0.94;
      explanation = `Unbadged entry detected: ${detectedPersonCount} person(s) entered airlock chamber with zero authorized badge swipe events.`;
    } else if (totalAuthorizedCount > 0 && detectedPersonCount > totalAuthorizedCount) {
      // Rule C: Piggybacking / Tailgating — more people entered than authorized badges swiped
      detected = true;
      violationType = 'piggyback_tailgating';
      const excess = detectedPersonCount - totalAuthorizedCount;
      confidence = Math.min(0.98, 0.85 + excess * 0.05);
      explanation = `Piggybacking detected: ${detectedPersonCount} person(s) entered airlock chamber on ${totalAuthorizedCount} authorized badge swipe(s) (${primarySwipe?.badgeId || 'unknown'}).`;
    } else if (detectedPersonCount > portalConfig.maxAllowedOccupancy) {
      // Rule D: Strict airlock chamber multi-occupancy rule exceeded
      detected = true;
      violationType = 'multi_occupancy_violation';
      confidence = 0.92;
      explanation = `Airlock multi-occupancy violation: ${detectedPersonCount} persons detected simultaneously exceeding portal limit of ${portalConfig.maxAllowedOccupancy}.`;
    } else if (heldOpenDoor && detectedPersonCount > 1) {
      // Rule E: Door held open or forced open with multiple persons entering
      detected = true;
      violationType = 'door_held_breach';
      confidence = 0.95;
      explanation = `Door held/propped open breach: outer door ${heldOpenDoor.doorId} remained open while ${detectedPersonCount} persons entered chamber.`;
    }

    // Filter by confidence threshold
    if (detected && confidence < portalConfig.minConfidence) {
      detected = false;
      violationType = null;
    }

    const tailgaterCount = detected ? Math.max(1, detectedPersonCount - totalAuthorizedCount) : 0;
    const interlockLockdownEngaged = detected && portalConfig.autoLockInnerDoor;

    if (detected) {
      timeline.push({
        timestamp: now,
        relativeOffsetMs: now - baselineTime,
        type: 'violation_detected',
        label: `ALERT: ${violationType?.toUpperCase()} confirmed (${explanation})`,
        details: {
          violationType,
          detectedPersonCount,
          authorizedCount: totalAuthorizedCount,
          tailgaterCount,
        },
      });

      if (interlockLockdownEngaged) {
        timeline.push({
          timestamp: now,
          relativeOffsetMs: now - baselineTime,
          type: 'interlock_lockdown',
          label: `INNER DOOR INTERLOCK LOCKDOWN ENGAGED: Inhibit release on Door ${portalConfig.innerDoorId}`,
          details: {
            innerDoorId: portalConfig.innerDoorId,
            locked: true,
          },
        });
      }
    }

    // Sort timeline chronologically
    timeline.sort((a, b) => a.timestamp - b.timestamp);

    // Collect latest bounding boxes for visual overlay
    const latestBoxes = uniqueTracks.map(trackId => {
      const obsForTrack = chamberObs.filter(o => o.trackId === trackId);
      return obsForTrack[obsForTrack.length - 1]!.boundingBox;
    });

    return {
      detected,
      violationType,
      severity: portalConfig.alertSeverity,
      confidence,
      detectedPersonCount,
      authorizedCount: totalAuthorizedCount,
      tailgaterCount,
      badgeId: primarySwipe?.badgeId,
      badgeHolderName: primarySwipe?.personName,
      timeGapMs,
      participantTrackIds: uniqueTracks,
      boundingBoxes: latestBoxes,
      interlockLockdownEngaged,
      sequenceTimeline: timeline,
      explanation,
    };
  }
}
