/**
 * Line Crossing Engine
 * Detects directional line crossings with deduplication and hysteresis
 */

import { randomUUID } from "node:crypto";
import type {
  PersonTrack,
  CountingGate,
  CrossingEvent,
  Point2D,
  GateTrackState,
} from "../types.js";

export class LineCrossingEngine {
  private gateStates = new Map<string, GateTrackState>();
  private crossingEvents: CrossingEvent[] = [];

  constructor(
    private readonly tenantId: string,
    private readonly cameraId: string,
    private readonly gates: CountingGate[],
  ) {}

  /**
   * Update line crossings for active tracks
   */
  updateCrossings(
    tracks: PersonTrack[],
    timestamp: Date,
  ): CrossingEvent[] {
    const newEvents: CrossingEvent[] = [];

    // Only process confirmed tracks
    const confirmedTracks = tracks.filter((t) => t.status === "confirmed");

    for (const track of confirmedTracks) {
      for (const gate of this.gates) {
        const crossing = this.detectCrossing(track, gate, timestamp);
        if (crossing) {
          newEvents.push(crossing);
          this.crossingEvents.push(crossing);
        }
      }
    }

    // Cleanup old gate states
    this.cleanupOldStates(timestamp);

    return newEvents;
  }

  /**
   * Detect line crossing for a track
   */
  private detectCrossing(
    track: PersonTrack,
    gate: CountingGate,
    timestamp: Date,
  ): CrossingEvent | null {
    // Need at least 2 observations
    if (track.observations.length < 2) {
      return null;
    }

    // Check minimum track age
    const trackAge = timestamp.getTime() - track.startedAt.getTime();
    if (trackAge < gate.minimumTrackAgeMs) {
      return null;
    }

    const prevObs = track.observations[track.observations.length - 2];
    const currObs = track.observations[track.observations.length - 1];

    const prevPoint = prevObs.footPoint;
    const currPoint = currObs.footPoint;

    // Calculate which side of the line each point is on
    const prevSide = Math.sign(
      this.sideOfLine(gate.lineStart, gate.lineEnd, prevPoint),
    );
    const currSide = Math.sign(
      this.sideOfLine(gate.lineStart, gate.lineEnd, currPoint),
    );

    // Check if crossed
    if (prevSide === 0 || currSide === 0 || prevSide === currSide) {
      return null; // No crossing or on the line
    }

    // Verify crossing is near the line segment (not extended line)
    if (!this.isNearLineSegment(prevPoint, currPoint, gate)) {
      return null;
    }

    // Apply hysteresis - check if points are far enough from line
    const prevDistance = Math.abs(
      this.distanceToLine(gate.lineStart, gate.lineEnd, prevPoint),
    );
    const currDistance = Math.abs(
      this.distanceToLine(gate.lineStart, gate.lineEnd, currPoint),
    );

    const minDistance = 5; // pixels, configurable
    if (prevDistance < minDistance || currDistance < minDistance) {
      return null; // Too close to line, might be jitter
    }

    // Determine direction
    const direction = this.determineDirection(prevSide, currSide, gate);

    // Check if direction is allowed
    if (
      gate.allowedDirection !== "both" &&
      gate.allowedDirection !== direction
    ) {
      return null;
    }

    // Check gate-track state for deduplication
    const stateKey = this.getStateKey(gate.id, track.trackId);
    const state = this.gateStates.get(stateKey);

    if (state) {
      // Check cooldown
      if (state.lastCrossedAt) {
        const timeSinceCrossing =
          timestamp.getTime() - state.lastCrossedAt.getTime();
        if (timeSinceCrossing < gate.cooldownMs) {
          return null; // Still in cooldown
        }
      }

      // Check if already counted this direction
      if (state.countedDirections.includes(direction)) {
        // Allow if enough time has passed (re-entry scenario)
        if (state.lastCrossedAt) {
          const timeSinceCrossing =
            timestamp.getTime() - state.lastCrossedAt.getTime();
          if (timeSinceCrossing < gate.cooldownMs * 2) {
            return null;
          }
        }
      }
    }

    // Create crossing event
    const event: CrossingEvent = {
      id: `crossing_${randomUUID()}`,
      tenantId: this.tenantId,
      cameraId: this.cameraId,
      gateId: gate.id,
      localTrackId: track.trackId,
      direction,
      crossedAt: timestamp,
      confidence: this.calculateCrossingConfidence(track, gate),
      beforePoint: prevPoint,
      afterPoint: currPoint,
      metadata: {
        gateName: gate.name,
        trackAge: trackAge,
        dwellTime: track.dwellTimeSeconds,
      },
    };

    // Update gate-track state
    const newState: GateTrackState = {
      gateId: gate.id,
      trackId: track.trackId,
      stableSide: currSide,
      lastCrossedAt: timestamp,
      countedDirections: state
        ? [...state.countedDirections, direction]
        : [direction],
    };
    this.gateStates.set(stateKey, newState);

    return event;
  }

  /**
   * Calculate which side of line a point is on
   * Returns: positive = one side, negative = other side, 0 = on line
   */
  private sideOfLine(a: Point2D, b: Point2D, p: Point2D): number {
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  }

  /**
   * Calculate distance from point to line
   */
  private distanceToLine(a: Point2D, b: Point2D, p: Point2D): number {
    const numerator = Math.abs(
      (b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x,
    );
    const denominator = Math.sqrt((b.y - a.y) ** 2 + (b.x - a.x) ** 2);
    return denominator > 0 ? numerator / denominator : 0;
  }

  /**
   * Check if crossing is near the line segment (not extended line)
   */
  private isNearLineSegment(
    prevPoint: Point2D,
    currPoint: Point2D,
    gate: CountingGate,
  ): boolean {
    // Calculate intersection point of trajectory with line
    const intersection = this.lineIntersection(
      prevPoint,
      currPoint,
      gate.lineStart,
      gate.lineEnd,
    );

    if (!intersection) {
      return false;
    }

    // Check if intersection is within line segment bounds
    const minX = Math.min(gate.lineStart.x, gate.lineEnd.x);
    const maxX = Math.max(gate.lineStart.x, gate.lineEnd.x);
    const minY = Math.min(gate.lineStart.y, gate.lineEnd.y);
    const maxY = Math.max(gate.lineStart.y, gate.lineEnd.y);

    const margin = 10; // pixels
    return (
      intersection.x >= minX - margin &&
      intersection.x <= maxX + margin &&
      intersection.y >= minY - margin &&
      intersection.y <= maxY + margin
    );
  }

  /**
   * Calculate line intersection point
   */
  private lineIntersection(
    p1: Point2D,
    p2: Point2D,
    p3: Point2D,
    p4: Point2D,
  ): Point2D | null {
    const denom =
      (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);

    if (Math.abs(denom) < 1e-10) {
      return null; // Lines are parallel
    }

    const t =
      ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / denom;

    return {
      x: p1.x + t * (p2.x - p1.x),
      y: p1.y + t * (p2.y - p1.y),
    };
  }

  /**
   * Determine crossing direction based on side change
   */
  private determineDirection(
    prevSide: number,
    currSide: number,
    gate: CountingGate,
  ): "entry" | "exit" {
    // Positive to negative means crossing from entry side
    const crossingFromPositive = prevSide > 0 && currSide < 0;

    if (gate.entrySide === "positive") {
      return crossingFromPositive ? "entry" : "exit";
    } else {
      return crossingFromPositive ? "exit" : "entry";
    }
  }

  /**
   * Calculate crossing confidence
   */
  private calculateCrossingConfidence(
    track: PersonTrack,
    gate: CountingGate,
  ): number {
    let confidence = 0.7; // Base confidence

    // Increase confidence for longer tracks
    if (track.observations.length >= 10) {
      confidence += 0.1;
    }

    // Increase confidence for non-stationary tracks
    if (!track.isStationary) {
      confidence += 0.1;
    }

    // Increase confidence based on track age
    const trackAge =
      (track.lastSeenAt.getTime() - track.startedAt.getTime()) / 1000;
    if (trackAge >= 2) {
      confidence += 0.1;
    }

    return Math.min(0.95, confidence);
  }

  /**
   * Get state key for gate-track combination
   */
  private getStateKey(gateId: string, trackId: string): string {
    return `${gateId}_${trackId}`;
  }

  /**
   * Cleanup old gate states
   */
  private cleanupOldStates(timestamp: Date): void {
    const maxAge = 60000; // 1 minute

    for (const [key, state] of this.gateStates.entries()) {
      if (state.lastCrossedAt) {
        const age = timestamp.getTime() - state.lastCrossedAt.getTime();
        if (age > maxAge) {
          this.gateStates.delete(key);
        }
      }
    }
  }

  /**
   * Get crossing statistics
   */
  getStatistics(): {
    totalCrossings: number;
    entries: number;
    exits: number;
    byGate: Map<string, { entries: number; exits: number }>;
  } {
    const stats = {
      totalCrossings: this.crossingEvents.length,
      entries: 0,
      exits: 0,
      byGate: new Map<string, { entries: number; exits: number }>(),
    };

    for (const event of this.crossingEvents) {
      if (event.direction === "entry") {
        stats.entries++;
      } else {
        stats.exits++;
      }

      const gateStats = stats.byGate.get(event.gateId) || {
        entries: 0,
        exits: 0,
      };
      if (event.direction === "entry") {
        gateStats.entries++;
      } else {
        gateStats.exits++;
      }
      stats.byGate.set(event.gateId, gateStats);
    }

    return stats;
  }

  /**
   * Get recent crossings
   */
  getRecentCrossings(limit: number = 100): CrossingEvent[] {
    return this.crossingEvents.slice(-limit);
  }

  /**
   * Clear old events (for memory management)
   */
  clearOldEvents(beforeTimestamp: Date): void {
    this.crossingEvents = this.crossingEvents.filter(
      (event) => event.crossedAt >= beforeTimestamp,
    );
  }
}
